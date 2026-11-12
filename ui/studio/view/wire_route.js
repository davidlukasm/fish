import {BODY_FRAME} from '../model/layout.js';
import {isRegion} from '../model/organs.js';
import {organLocation, regionGeometry} from './places.js';
import {skinAt, SNOUT_TIP} from './frame.js';

const GRID = Object.freeze({step : 4, margin : 4, half : 126});
const SHAPES = Object.freeze({
  eye : [ 20, 16 ],
  nose : [ 17, 13 ],
  proximity : [ 12, 10 ],
  balance : [ 12, 10 ],
  gland : [ 20, 16 ],
  blood : [ 10, 14 ],
  bladder : [ 34, 15 ],
  eggs : [ 27, 15 ],
  sperm : [ 26, 11 ],
  gut : [ 37, 20 ]
});
const cached = new WeakMap();
function field(doc, sites) {
  const old = cached.get(doc);
  if (old?.sites === sites)
    return old;
  const step = GRID.step, left = SNOUT_TIP.x, top = BODY_FRAME.middle - GRID.half + step / 2,
        columns = Math.ceil((BODY_FRAME.tail - left) / step) + 1,
        rows = Math.ceil(2 * GRID.half / step);
  const point = i => ({x : left + i % columns * step, y : top + Math.floor(i / columns) * step});
  const index = p => Math.max(0, Math.min(rows - 1, Math.round((p.y - top) / step))) * columns +
                     Math.max(0, Math.min(columns - 1, Math.round((p.x - left) / step)));
  const shapes = doc.organs.flatMap(o => {
    const R = SHAPES[o.type], region = isRegion(o) && regionGeometry(doc, sites, o);
    if (!R && !region)
      return [];
    const p = region || organLocation(o, sites, doc);
    return [ {
      id : o.id,
      x : p.x,
      y : p.y,
      rx : (region ? region.width / 2 + 1 : R[0] + GRID.margin),
      ry : (region ? region.height / 2 + 1 : R[1] + GRID.margin)
    } ];
  });
  const cells = Array.from({length : columns * rows}, (_, i) => {
    const p = point(i);
    if (p.y < skinAt(p.x, -1) + GRID.margin || p.y > skinAt(p.x, 1) - GRID.margin)
      return null;
    return shapes.filter(s => ((p.x - s.x) / s.rx) ** 2 + ((p.y - s.y) / s.ry) ** 2 < 1)
        .map(s => s.id);
  });
  const result = {sites, point, index, cells, columns, rows, paths : new Map()};
  cached.set(doc, result);
  return result;
}
function heapPush(heap, item) {
  let i = heap.length;
  heap.push(item);
  while (i) {
    const p = (i - 1) >> 1;
    if (heap[p].score <= item.score)
      break;
    heap[i] = heap[p];
    i = p;
  }
  heap[i] = item;
}
function heapPop(heap) {
  const first = heap[0], last = heap.pop();
  if (heap.length) {
    let i = 0;
    while (i * 2 + 1 < heap.length) {
      let child = i * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].score < heap[child].score)
        child++;
      if (heap[child].score >= last.score)
        break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
  }
  return first;
}
export function nerveRoute(doc, sites, from, to, kind) {
  const F = field(doc, sites), a = from.point, b = to.point;
  const key = [ from.key, to.key, kind, a.x, a.y, b.x, b.y ].join(':');
  if (F.paths.has(key))
    return F.paths.get(key);
  const clear = i =>
      F.cells[i] && F.cells[i].every(id => id === from.organ?.id || id === to.organ?.id);
  const nearest = p => {
    let best = -1, distance = Infinity;
    for (let i = 0; i < F.cells.length; i++) {
      if (!clear(i))
        continue;
      const q = F.point(i), d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < distance) {
        best = i;
        distance = d;
      }
    }
    return best;
  };
  const start = nearest(a), end = nearest(b), safe = p => !!clear(F.index(p));
  const direction = Math.sign(b.x - a.x) || Math.sign(b.y - a.y) || 1;
  const lane = BODY_FRAME.middle + direction * (2 + kind * GRID.step);
  const weight = p => 1 + Math.min(3, Math.abs(p.y - lane) / 18) * 2;
  const visible = (a, b, budget = Infinity) => {
    const count = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / (GRID.step / 2));
    let total = 0;
    for (let k = 1; k < count; k++) {
      const p = {x : a.x + (b.x - a.x) * k / count, y : a.y + (b.y - a.y) * k / count};
      if (!safe(p))
        return false;
      total += weight(p);
    }
    return Math.hypot(a.x - b.x, a.y - b.y) * (total / Math.max(1, count - 1)) <= budget;
  };
  const cost = new Float64Array(F.cells.length).fill(Infinity),
        parent = new Int32Array(F.cells.length).fill(-1), queue = [];
  if (start >= 0 && end >= 0) {
    cost[start] = 0;
    heapPush(queue, {i : start, cost : 0, score : 0});
  }
  while (queue.length) {
    const current = heapPop(queue), i = current.i;
    if (current.cost !== cost[i])
      continue;
    if (i === end)
      break;
    const x = i % F.columns, y = Math.floor(i / F.columns);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= F.columns || y + dy < 0 || y + dy >= F.rows)
          continue;
        const next = i + dy * F.columns + dx;
        if (!clear(next) || (dx && dy && (!clear(i + dx) || !clear(i + dy * F.columns))))
          continue;
        const p = F.point(next), distance = GRID.step * Math.hypot(dx, dy),
              candidate = cost[i] + distance * weight(p);
        if (candidate >= cost[next])
          continue;
        cost[next] = candidate;
        parent[next] = i;
        const q = F.point(end);
        heapPush(
            queue,
            {i : next, cost : candidate, score : candidate + Math.hypot(p.x - q.x, p.y - q.y)});
      }
  }
  const walk = [], budgets = [];
  if (end >= 0 && Number.isFinite(cost[end]))
    for (let i = end; i >= 0; i = parent[i]) {
      walk.unshift(F.point(i));
      budgets.unshift(cost[i]);
    }
  const points = [ a ];
  if (walk.length) {
    walk[0] = a;
    walk[walk.length - 1] = b;
    for (let i = 0; i < walk.length - 1;) {
      let next = i + 1;
      while (next + 1 < walk.length &&
             visible(walk[i], walk[next + 1], (budgets[next + 1] - budgets[i]) * 1.12))
        next++;
      points.push(walk[next]);
      i = next;
    }
  } else
    points.push(b);
  if (points.length === 1)
    points.push(b);
  const result = {points, safe};
  F.paths.set(key, result);
  return result;
}
