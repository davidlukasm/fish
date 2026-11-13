import {BODY_FRAME} from '../model/layout.js';
import {isRegion} from '../model/organs.js';
import {BRAIN, neuralOrgan} from '../model/anatomy.js';
import {organLocation, regionGeometry} from './places.js';
import {regionRim} from './region_layout.js';
import {skinAt, SNOUT_TIP} from './frame.js';

const GRID =
    Object.freeze({step : 4, margin : 4, half : 126, clearance : 8, proximity : 10, edge : 1});
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
// A bundle ends a little inside the organ's routing outline, which reaches past the drawn organ.
const DOCK = .8;
export function organDock(anchor, towards) {
  const shape = SHAPES[anchor.organ?.type], p = anchor.point;
  if (!shape)
    return p;
  const dx = towards.x - p.x, dy = towards.y - p.y,
        radius = Math.hypot(dx / shape[0], dy / shape[1]) / DOCK;
  return radius > 1 ? {x : p.x + dx / radius, y : p.y + dy / radius} : p;
}
// How far a point lies outside a region's drawn outline (negative inside), so nerves keep off the
// region itself and may still pass between two close regions.
function outlineDistance(rim, p) {
  let inside = false, nearest = Infinity;
  for (let i = 0, j = rim.length - 1; i < rim.length; j = i++) {
    const a = rim[j], b = rim[i], ex = b.x - a.x, ey = b.y - a.y;
    if ((b.y > p.y) !== (a.y > p.y) && p.x < a.x + ex * (p.y - a.y) / ey)
      inside = !inside;
    const t =
        Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
    nearest = Math.min(nearest, Math.hypot(p.x - a.x - t * ex, p.y - a.y - t * ey));
  }
  return inside ? -nearest : nearest;
}
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
    const p = region || organLocation(o, sites, doc), rim = region ? regionRim(region) : null;
    const reach = axis => Math.max(...rim.map(q => Math.abs(q[axis] - p[axis])));
    return [ {
      id : o.id,
      rim,
      x : p.x,
      y : p.y,
      rx : (rim ? reach('x') : R[0]) + GRID.margin,
      ry : (rim ? reach('y') : R[1]) + GRID.margin
    } ];
  });
  const regions = shapes.filter(s => s.rim);
  const nearby = [];
  const cells = Array.from({length : columns * rows}, (_, i) => {
    const p = point(i);
    // Only regions whose box comes near the point are measured against their outline.
    const close = regions
                      .filter(s => Math.abs(p.x - s.x) < s.rx + GRID.clearance &&
                                   Math.abs(p.y - s.y) < s.ry + GRID.clearance)
                      .map(s => ({id : s.id, distance : outlineDistance(s.rim, p)}));
    nearby[i] = close.filter(s => s.distance < GRID.clearance);
    if (p.y < skinAt(p.x, -1) + GRID.margin || p.y > skinAt(p.x, 1) - GRID.margin)
      return null;
    return [
      ...shapes.filter(s => !s.rim && ((p.x - s.x) / s.rx) ** 2 + ((p.y - s.y) / s.ry) ** 2 < 1),
      ...close.filter(s => s.distance < GRID.edge)
    ].map(s => s.id);
  });
  const result = {sites, point, index, cells, nearby, columns, rows, paths : new Map()};
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
// The grid walk is relaxed like a smooth string: each point moves towards the middle of its
// neighbours while it stays clear of other regions, so a turn spreads into a gentle S-curve instead
// of a corner. A point already close to a region may not come closer.
const RELAX = Object.freeze({rounds : 120, pull : .5, room : 4, tolerance : .5});
function relaxed(walk, safe, room) {
  const p = walk.map(q => ({x : q.x, y : q.y}));
  for (let round = 0; round < RELAX.rounds; round++)
    for (let i = 1; i < p.length - 1; i++) {
      const next = {
        x : p[i].x + ((p[i - 1].x + p[i + 1].x) / 2 - p[i].x) * RELAX.pull,
        y : p[i].y + ((p[i - 1].y + p[i + 1].y) / 2 - p[i].y) * RELAX.pull
      };
      if (safe(next) && room(next) >= Math.min(room(p[i]), RELAX.room))
        p[i] = next;
    }
  return p;
}
// Only the points that shape the relaxed walk are kept (Douglas–Peucker): the curve through them
// stays within a fraction of a unit of it.
function simplified(points) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const mark = (lo, hi) => {
    const a = points[lo], b = points[hi], dx = b.x - a.x, dy = b.y - a.y,
          length = Math.hypot(dx, dy) || 1;
    let far = -1, most = RELAX.tolerance;
    for (let i = lo + 1; i < hi; i++) {
      const off = Math.abs((points[i].x - a.x) * dy - (points[i].y - a.y) * dx) / length;
      if (off > most) {
        most = off;
        far = i;
      }
    }
    if (far < 0)
      return;
    keep[far] = 1;
    mark(lo, far);
    mark(far, hi);
  };
  mark(0, points.length - 1);
  return points.filter((_, i) => keep[i]);
}
// Where a nerve between these two ends may run: inside the body, off every other organ and region.
export function passable(doc, sites, from, to) {
  const F = field(doc, sites);
  return p => !!F.cells[F.index(p)]?.every(id => id === from.organ?.id || id === to.organ?.id);
}
const EXIT = Object.freeze({slope : 1.2});
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
  const safe = p => !!clear(F.index(p));
  const direction = Math.sign(b.x - a.x) || Math.sign(b.y - a.y) || 1;
  const lane = BODY_FRAME.middle + direction * (2 + kind * GRID.step);
  const weight = p => {
    const proximity = F.nearby[F.index(p)].reduce(
        (most, s) => s.id === from.organ?.id || s.id === to.organ?.id
                         ? most
                         : Math.max(most, 1 - Math.max(0, s.distance) / GRID.clearance),
        0);
    return 1 + Math.min(3, Math.abs(p.y - lane) / 18) * 2 + GRID.proximity * proximity ** 2;
  };
  const between = (a, b) => {
    const start = nearest(a), end = nearest(b);
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
    const walk = [];
    if (end >= 0 && Number.isFinite(cost[end]))
      for (let i = end; i >= 0; i = parent[i])
        walk.unshift(F.point(i));
    return walk.length > 1 ? [ a, ...walk.slice(1, -1), b ] : [ a, b ];
  };
  const neural = endpoint => !endpoint.organ || neuralOrgan(endpoint.organ.type);
  const peripheral = neural(from) && !neural(to) ? to : neural(to) && !neural(from) ? from : null;
  // A nerve to an organ behind the brain leaves the cord obliquely, before the organ's level, as
  // far ahead as the organ lies off the cord, but never ahead of the other end.
  const centre = peripheral === from ? to : from;
  const leave = peripheral && Math.sign(centre.point.x - peripheral.point.x) *
                                  Math.min(Math.abs(centre.point.x - peripheral.point.x),
                                           EXIT.slope * Math.abs(peripheral.point.y - lane));
  const junction = peripheral && peripheral.point.x > BRAIN.cerebrum.to
                       ? nearest({x : peripheral.point.x + leave, y : lane})
                       : -1;
  const walk = junction >= 0
                   ? [...between(a, F.point(junction)), ...between(F.point(junction), b).slice(1) ]
                   : between(a, b);
  const room = p =>
      F.nearby[F.index(p)]?.reduce((least, s) => s.id === from.organ?.id || s.id === to.organ?.id
                                                     ? least
                                                     : Math.min(least, s.distance),
                                   Infinity) ??
      Infinity;
  const result = {points : simplified(relaxed(walk, safe, room)), safe};
  F.paths.set(key, result);
  return result;
}
