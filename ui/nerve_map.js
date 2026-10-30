// The nervous system as a metro map drawn from the concrete brain: organ stations, transfer hubs
// clustered from the processing cells by what they connect, and as many lines as the strongest
// signal paths need. Below: the hormone weather and a liveblog of thoughts from the live signals.
// Wording comes from ui/text/de/nerve_map.json (interface) and ui/text/de-AT/thoughts.json.
import {brainMotorColors, brainSenseColors} from './brain_model.js';
import {el} from './dom.js';
import {hormoneColors, hormoneName} from './hormones.js';
import {command} from './session.js';
import {format, loadStrings} from './strings.js';
import {moodOf, think} from './thoughts.js';
export const nerve_mapState = {};

const NS = 'http://www.w3.org/2000/svg';
const BODY = 'M150 10C214 12 266 88 281 186C292 268 252 398 178 518L214 594Q150 566 86 594' +
             'L122 518C48 398 8 268 19 186C34 88 86 12 150 10Z';
// Organ stations: [anchor x, anchor y, organ key, family]
const ORGANS = {
  suck : [ 118, 30, 'm2', 'eat' ],
  bite : [ 182, 30, 'm5', 'eat' ],
  noseL : [ 82, 62, 's1', 'nose' ],
  noseR : [ 218, 62, 's1', 'nose' ],
  touch : [ 150, 72, 's3', 'touch' ],
  eyeL : [ 54, 112, 's0', 'eye' ],
  eyeR : [ 246, 112, 's0', 'eye' ],
  latL : [ 30, 220, 's2', 'lat' ],
  latR : [ 270, 220, 's2', 'lat' ],
  turnL : [ 40, 318, 'm1', 'move' ],
  turnR : [ 260, 318, 'm1', 'move' ],
  gut : [ 62, 384, 's4', 'body' ],
  hsense : [ 238, 384, 's10', 'body' ],
  spines : [ 84, 440, 'm6', 'guard' ],
  pigment : [ 216, 440, 'm7', 'show' ],
  bladder : [ 122, 476, 'm8', 'depth' ],
  gland : [ 178, 476, 'm9', 'gland' ],
  egg : [ 116, 522, 'm3', 'repro' ],
  sperm : [ 184, 522, 'm4', 'repro' ],
  tail : [ 150, 566, 'm0', 'move' ]
};
const MOTOR_ORGANS =
    [ 'tail', 'turn', 'suck', 'egg', 'sperm', 'bite', 'spines', 'pigment', 'bladder', 'gland' ];
// Neutral line colours, distinguishable on the dark map; lines are numbered by strength.
const LINE_COLORS = [
  '#e8a33d', '#5fb3d9', '#d46a8c', '#7cc47f', '#a58be0', '#e0c85a', '#4fc0b0', '#e07f5f', '#8fa7e8',
  '#c9a3c9', '#9cc95f', '#d99a6c'
];
const HORMONE_SPOTS = [ [ 92, 150 ], [ 208, 150 ], [ 104, 420 ], [ 196, 420 ] ];

const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};
const percent = x => Math.round(100 * clamp(x)) + ' %';

// ---------------------------------------------------------------------- stations
// Sense and motor cells belong to their organ (and side); processing cells form the hubs.
function organOf(n) {
  if (!n[4])
    return '';
  let best = n[12] || 0, kind = 'i', k = -1;
  (n[13] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 's', j ];
  });
  (n[14] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 'm', j ];
  });
  const left = n[0] < 0;
  if (kind === 's')
    return k === 0    ? (left ? 'eyeL' : 'eyeR')
           : k === 1  ? (left ? 'noseL' : 'noseR')
           : k === 2  ? (left ? 'latL' : 'latR')
           : k === 3  ? 'touch'
           : k === 10 ? 'hsense'
                      : 'gut';
  if (kind === 'm')
    return k === 1 ? (left ? 'turnL' : 'turnR') : MOTOR_ORGANS[k] || '';
  return '';
}

function unit(v) {
  let s = 0;
  for (const x of v)
    s += x * x;
  s = Math.sqrt(s);
  if (s)
    for (let i = 0; i < v.length; i++)
      v[i] /= s;
  return v;
}

function kmeans(points, k) {
  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++)
      s += (a[i] - b[i]) ** 2;
    return s;
  };
  // Deterministic farthest-point start: the same brain always gives the same plan.
  const centres = [ Float64Array.from(points[0]) ];
  while (centres.length < k) {
    let far = 0, best = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centres.map(c => dist(p, c)));
      if (d > best)
        [best, far] = [ d, i ];
    });
    centres.push(Float64Array.from(points[far]));
  }
  let assign = new Array(points.length).fill(0), cost = 0;
  for (let round = 0; round < 14; round++) {
    cost = 0;
    assign = points.map(p => {
      let bestK = 0, bestD = Infinity;
      centres.forEach((c, j) => {
        const d = dist(p, c);
        if (d < bestD)
          [bestD, bestK] = [ d, j ];
      });
      cost += bestD;
      return bestK;
    });
    centres.forEach((c, j) => {
      const mine = points.filter((_, i) => assign[i] === j);
      if (!mine.length)
        return;
      c.fill(0);
      for (const p of mine)
        for (let i = 0; i < c.length; i++)
          c[i] += p[i] / mine.length;
    });
  }
  return {assign, cost};
}

// Processing cells are grouped by whom they listen to and whom they drive; the number of hubs
// follows the brain: more hubs only while they explain clearly more of the wiring.
function clusterHubs(b, organs) {
  const present = [...new Set(organs.values()) ], index = new Map(present.map((o, i) => [o, i])),
        dims = 2 * present.length + 2, internal = b.neurons.filter(n => n[4] && !organs.has(n[5]));
  if (!internal.length)
    return new Map();
  const vec = new Map(internal.map(n => [n[5], new Float64Array(dims)])),
        near = new Map(internal.map(n => [n[5], []]));
  for (const e of b.edges) {
    const a = organs.get(e[0]), c = organs.get(e[1]), w = Math.abs(e[2]);
    if (a && vec.has(e[1]))
      vec.get(e[1])[index.get(a)] += w;
    else if (c && vec.has(e[0]))
      vec.get(e[0])[present.length + index.get(c)] += w;
    else if (vec.has(e[0]) && vec.has(e[1])) {
      near.get(e[0]).push(e[1]);
      near.get(e[1]).push(e[0]);
    }
  }
  for (const v of vec.values())
    unit(v);
  const ids = internal.map(n => n[5]), points = internal.map(n => {
    const own = vec.get(n[5]), out = Float64Array.from(own), list = near.get(n[5]);
    for (const j of list) {
      const u = vec.get(j);
      for (let i = 0; i < dims; i++)
        out[i] += .5 * u[i] / list.length;
    }
    unit(out);
    out[dims - 2] = .35 * n[0];
    out[dims - 1] = .35 * n[1];
    return out;
  });
  const most = Math.min(10, Math.max(1, Math.round(Math.sqrt(ids.length / 3))));
  let chosen = kmeans(points, 1);
  for (let k = 2; k <= most; k++) {
    const next = kmeans(points, k);
    if (next.cost > chosen.cost * .8)
      break;
    chosen = next;
  }
  const sizes = new Map();
  for (const a of chosen.assign)
    sizes.set(a, (sizes.get(a) || 0) + 1);
  const order = [...sizes.keys() ].sort((p, q) => sizes.get(q) - sizes.get(p));
  return new Map(ids.map((id, i) => [id, 'h' + order.indexOf(chosen.assign[i])]));
}

function stationColor(meta) {
  if (meta.kind === 'h')
    return '#d8e2e6';
  const k = Number(meta.organ.slice(1));
  return meta.organ[0] === 's' ? brainSenseColors[k] : brainMotorColors[k];
}

// Hubs sit between whatever they connect; the same wiring always gives the same picture.
function placeHubs(meta, pairs) {
  const hubs = [...meta.values() ].filter(m => m.kind === 'h');
  hubs.forEach((h, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (const p of pairs.values()) {
      const other = p.from === h.id ? p.to : p.to === h.id ? p.from : '';
      if (other && meta.get(other).kind !== 'h') {
        sx += p.sum * meta.get(other).x;
        sy += p.sum * meta.get(other).y;
        sw += p.sum;
      }
    }
    [h.x, h.y] = sw ? [ sx / sw, sy / sw ] : [ 150 + 40 * ((i % 3) - 1), 200 + 50 * i ];
  });
  for (let round = 0; round < 60; round++) {
    for (const h of hubs) {
      let sx = 0, sy = 0, sw = 0;
      for (const p of pairs.values()) {
        const other = p.from === h.id ? p.to : p.to === h.id ? p.from : '';
        if (other) {
          sx += p.sum * meta.get(other).x;
          sy += p.sum * meta.get(other).y;
          sw += p.sum;
        }
      }
      if (sw) {
        h.x = .5 * h.x + .5 * sx / sw;
        h.y = .5 * h.y + .5 * sy / sw;
      }
    }
    hubs.forEach((a, i) => hubs.slice(i + 1).forEach((c, j) => {
      let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 1)
        [dx, dy, d] = [ Math.cos(i + j), Math.sin(i + j), 1 ];
      if (d < 78) {
        const push = (78 - d) / 2;
        a.x -= dx / d * push;
        a.y -= dy / d * push;
        c.x += dx / d * push;
        c.y += dy / d * push;
      }
    }));
    for (const h of hubs) {
      h.x = Math.max(56, Math.min(244, h.x));
      h.y = Math.max(140, Math.min(470, h.y));
    }
  }
  const taken = [...meta.values() ].filter(m => m.kind !== 'h');
  const steps = [
    [ 0, 0 ], [ 24, 0 ], [ -24, 0 ], [ 0, 24 ], [ 0, -24 ], [ 24, 24 ], [ -24, 24 ], [ 24, -24 ],
    [ -24, -24 ], [ 48, 0 ], [ -48, 0 ], [ 0, 48 ], [ 0, -48 ]
  ];
  for (const h of hubs.sort((p, q) => q.size - p.size)) {
    const x = Math.round(h.x / 10) * 10, y = Math.round(h.y / 10) * 10,
          free = steps.find(([ dx, dy ]) =>
                                taken.every(t => Math.hypot(t.x - x - dx, t.y - y - dy) >= 34)) ||
                 [ 0, 0 ];
    h.x = x + free[0];
    h.y = y + free[1];
    taken.push(h);
  }
}

// Lines follow the signal: from a sense organ through the hubs that pass it on to the organ it
// drives. Each line starts at the strongest unused connection and grows forward along outgoing
// and backward along incoming connections while it is inside the hubs; organs are terminals.
// A brain gets as many lines, and lines as long, as its strong pathways allow.
function extractRoutes(pairs, meta) {
  const residual = new Map([...pairs ].map(([ k, p ]) => [k, p.sum])), out = new Map(),
        into = new Map();
  for (const p of pairs.values()) {
    if (!out.has(p.from))
      out.set(p.from, []);
    if (!into.has(p.to))
      into.set(p.to, []);
    out.get(p.from).push(p.to);
    into.get(p.to).push(p.from);
  }
  const max = Math.max(0, ...residual.values()), routes = [];
  const strongest = (at, seen, forward) => {
    let to = '', w = 0;
    for (const c of (forward ? out : into).get(at) || []) {
      const v = residual.get(forward ? at + '>' + c : c + '>' + at);
      if (!seen.has(c) && v > w)
        [w, to] = [ v, c ];
    }
    return [ to, w ];
  };
  while (routes.length < 16) {
    let start = '', best = 0;
    for (const [key, w] of residual) {
      const score = w * (meta.get(key.split('>')[0]).kind === 's' ? 1.2 : 1);
      if (score > best)
        [best, start] = [ score, key ];
    }
    if (!start || best < .15 * max)
      break;
    const path = start.split('>'), seen = new Set(path);
    let weight = residual.get(start);
    residual.set(start, 0);
    for (const forward of [true, false])
      while (path.length < 12) {
        const at = forward ? path[path.length - 1] : path[0];
        if (meta.get(at).kind !== 'h')
          break;
        const [to, w] = strongest(at, seen, forward);
        if (!to || w < .06 * max)
          break;
        residual.set(forward ? at + '>' + to : to + '>' + at, 0);
        weight += w;
        seen.add(to);
        if (forward)
          path.push(to);
        else
          path.unshift(to);
      }
    routes.push({path, weight});
  }
  routes.sort((p, q) => q.weight - p.weight);
  return routes.map((r, i) => ({
                      ...r,
                      badge : String(i + 1),
                      name : format(nerve_mapState.text.ui.line, {n : i + 1}),
                      color : LINE_COLORS[i] || `hsl(${(i * 53 + 200) % 360} 45% 66%)`,
                      major : r.weight >= .35 * routes[0].weight
                    }));
}

// Octilinear like a metro map. Three shapes per section: diagonal in the middle, at the end or
// at the start; the drawing picks the one that crosses and covers the least.
function octilinearShapes(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx),
        sy = Math.sign(dy), shapes = [];
  if (ay >= ax) {
    const s = sy * (ay - ax);
    shapes.push([ [ a.x, a.y ], [ a.x, a.y + s / 2 ], [ b.x, b.y - s / 2 ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x, a.y + s ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ b.x, a.y + sy * ax ], [ b.x, b.y ] ]);
  } else {
    const s = sx * (ax - ay);
    shapes.push([ [ a.x, a.y ], [ a.x + s / 2, a.y ], [ b.x - s / 2, b.y ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x + s, a.y ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x + sx * ay, b.y ], [ b.x, b.y ] ]);
  }
  return shapes.map(pts => pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0],
                                                                 p[1] - pts[i - 1][1]) > .5));
}

// Parallel track beside the centre line; the side stays the same on screen whichever way a line
// is travelled, so lines sharing a corridor never swap places.
function offsetPolyline(pts, o) {
  if (!o || pts.length < 2)
    return pts;
  const last = pts[pts.length - 1],
        flip = last[1] - pts[0][1] < 0 || (last[1] === pts[0][1] && last[0] < pts[0][0]),
        s = flip ? -o : o, normals = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1],
          l = Math.hypot(dx, dy) || 1;
    normals.push([ -dy / l * s, dx / l * s ]);
  }
  const out = [ [ pts[0][0] + normals[0][0], pts[0][1] + normals[0][1] ] ];
  for (let i = 1; i < pts.length - 1; i++) {
    const n = normals[i - 1], m = [ n[0] + normals[i][0], n[1] + normals[i][1] ],
          dot = (m[0] * n[0] + m[1] * n[1]) / (s * s);
    out.push([ pts[i][0] + m[0] / dot, pts[i][1] + m[1] / dot ]);
  }
  const n = normals[normals.length - 1];
  out.push([ last[0] + n[0], last[1] + n[1] ]);
  return out;
}

const pathData = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');

function octilinear(a, b) { return pathData(octilinearShapes(a, b)[0]); }

// Samples of drawn lines on a coarse grid: who runs where and in which direction.
function samples(pts, step = 3) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [ x1, y1 ] = pts[i], l = Math.hypot(x1 - x0, y1 - y0),
               dir = Math.round(((Math.atan2(y1 - y0, x1 - x0) + Math.PI) % Math.PI) /
                                (Math.PI / 4)) %
                     4;
    for (let t = 0; t <= l; t += step)
      out.push([ x0 + (x1 - x0) * t / l, y0 + (y1 - y0) * t / l, dir ]);
  }
  return out;
}
const cell = (x, y) => Math.round(x / 4) + ',' + Math.round(y / 4);

function node(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {}))
    e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

function buildPlan(b, svg) {
  const organs = new Map();
  for (const n of b.neurons) {
    const o = organOf(n);
    if (o)
      organs.set(n[5], o);
  }
  const nodes = new Map(b.neurons.map(n => [n[5], n])), hubs = clusterHubs(b, organs),
        station = new Map([...organs, ...hubs ]), members = new Map(), meta = new Map();
  for (const [id, s] of station) {
    if (!members.has(s))
      members.set(s, []);
    members.get(s).push(id);
  }
  for (const [id, ids] of members)
    if (ORGANS[id]) {
      const [x, y, organ, family] = ORGANS[id], [ name, label ] = nerve_mapState.text.ui.organs[id];
      meta.set(id, {
        id,
        x,
        y,
        name,
        label,
        organ,
        family,
        size : ids.length,
        kind : organ[0] === 's' ? 's' : 'm'
      });
    } else
      meta.set(id, {id, x : 150, y : 300, kind : 'h', organ : 'internal', size : ids.length});
  const pairs = new Map();
  b.edges.forEach((e, i) => {
    const a = station.get(e[0]), c = station.get(e[1]);
    if (!a || !c || a === c)
      return;
    const key = a + '>' + c;
    let p = pairs.get(key);
    if (!p)
      pairs.set(key,
                p = {key, from : a, to : c, edges : [], sum : 0, plus : 0, flow : 0, learned : 0});
    p.edges.push(i);
    p.sum += Math.abs(e[2]);
    if (e[2] >= 0)
      p.plus += e[2];
  });
  // Hubs are named after what feeds or drives them most.
  const used = new Map(), ui = nerve_mapState.text.ui;
  for (const h of [...meta.values()].filter(m => m.kind === 'h').sort((p, q) => q.size - p.size)) {
    const into = {}, out = {};
    let inTotal = 0, outTotal = 0;
    for (const p of pairs.values()) {
      if (p.to === h.id && meta.get(p.from).kind === 's') {
        into[meta.get(p.from).family] = (into[meta.get(p.from).family] || 0) + p.sum;
        inTotal += p.sum;
      }
      if (p.from === h.id && meta.get(p.to).kind === 'm') {
        out[meta.get(p.to).family] = (out[meta.get(p.to).family] || 0) + p.sum;
        outTotal += p.sum;
      }
    }
    const top = o => Object.entries(o).sort((p, q) => q[1] - p[1])[0];
    const family = inTotal >= outTotal ? top(into)?.[0] : top(out)?.[0],
          [ base, short ] = ui.hubs[family] || ui.hubs.hub,
          lateral =
              members.get(h.id).reduce((sum, id) => sum + (nodes.get(id)?.[0] || 0), 0) / h.size,
          side = lateral < -.25  ? 'left'
                 : lateral > .25 ? 'right'
                                 : '',
          sided = side ? format(ui.sides[side], {name : base}) : base,
          count = (used.get(sided) || 0) + 1;
    used.set(sided, count);
    h.name = count > 1 ? format(ui.sides.numbered, {name : sided, n : count}) : sided;
    h.label = count > 1 ? format(ui.sides.numbered, {name : short, n : count}) : short;
    h.family = family || 'hub';
    h.inFamily = top(into)?.[0] || '';
  }
  placeHubs(meta, pairs);
  const routes = extractRoutes(pairs, meta), max = Math.max(...[...pairs.values()].map(p => p.sum));
  svg.replaceChildren();
  const defs = node('defs', {}, svg);
  node('path', {d : BODY}, node('clipPath', {id : 'nm-clip'}, defs));
  hormoneColors.forEach((color, k) => {
    const g = node('radialGradient', {id : 'nm-h' + k}, defs);
    node('stop', {offset : '0', 'stop-color' : color, 'stop-opacity' : '.75'}, g);
    node('stop', {offset : '1', 'stop-color' : color, 'stop-opacity' : '0'}, g);
  });
  node('path', {d : BODY, class : 'nm-body'}, svg);
  const weather = node('g', {'clip-path' : 'url(#nm-clip)'}, svg),
        clouds = HORMONE_SPOTS.map(
            ([ x, y ], k) => node(
                'circle', {cx : x, cy : y, r : 60, fill : `url(#nm-h${k})`, opacity : 0}, weather));
  const linkLayer = node('g', {}, svg), lineLayer = node('g', {}, svg),
        stationLayer = node('g', {}, svg), segs = [];
  // Each section takes the shape and side track that cover and cross the fewest other lines;
  // lines sharing a corridor run side by side, crossings get a gap from the dark casing.
  const grid = new Map(), onRoute = new Set(), reach = new Map();
  const cost = (pts, r) => {
    let c = 0;
    for (const [x, y, dir] of samples(pts))
      for (const hit of grid.get(cell(x, y)) || [])
        if (hit.route !== r)
          c += hit.dir === dir ? 4 : .35;
    return c;
  };
  for (const r of routes) {
    r.segs = [];
    for (let i = 1; i < r.path.length; i++) {
      const from = r.path[i - 1], to = r.path[i], ahead = pairs.get(from + '>' + to),
            back = pairs.get(to + '>' + from),
            pair = !back || ahead?.sum >= back.sum ? ahead : back, width = r.major ? 4 : 2.6;
      let best = null;
      octilinearShapes(meta.get(from), meta.get(to)).forEach((shape, k) => {
        for (const o of [0, 4.8, -4.8, 9.6, -9.6]) {
          const pts = offsetPolyline(shape, o), c = cost(pts, r) + Math.abs(o) * .25 + k * .3;
          if (!best || c < best.c)
            best = {c, pts, o};
        }
      });
      for (const [x, y, dir] of samples(best.pts))
        for (const [dx, dy] of [[ 0, 0 ], [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ]]) {
          const key = cell(x + dx * 4, y + dy * 4);
          if (!grid.has(key))
            grid.set(key, []);
          grid.get(key).push({route : r, dir});
        }
      for (const id of [from, to])
        reach.set(id, Math.max(reach.get(id) || 0, Math.abs(best.o)));
      const d = pathData(best.pts), g = node('g', {class : 'nm-route'}, lineLayer),
            seg = {route : r, pair, from, to, group : g, dir : pair.from === from ? 1 : -1};
      onRoute.add(ahead?.key).add(back?.key);
      seg.learnPath = node('path', {d, class : 'nm-learn', 'stroke-width' : width}, g);
      node('path', {d, class : 'nm-casing', 'stroke-width' : width + 3.4}, g);
      node('path', {d, class : 'nm-line', stroke : r.color, 'stroke-width' : width}, g);
      seg.train = node('path', {d, class : 'nm-train', 'stroke-width' : width * .7}, g);
      seg.offset = 0;
      g.addEventListener('pointerenter', () => hoverSegment(seg));
      g.addEventListener('pointerleave', () => hoverStation(''));
      segs.push(seg);
      r.segs.push(seg);
    }
  }
  // Remaining notable connections: thin footpaths without trains.
  const links = [...pairs.values() ]
                    .filter(p => !onRoute.has(p.key) && p.sum > .08 * max)
                    .sort((p, q) => q.sum - p.sum)
                    .slice(0, 40)
                    .map(p => {
                      const g = node('g', {class : 'nm-route'}, linkLayer),
                            link = {pair : p, from : p.from, to : p.to, group : g};
                      node('path', {
                        d : octilinear(meta.get(p.from), meta.get(p.to)),
                        class : 'nm-link' + (p.plus < p.sum / 2 ? ' nm-inhibitory' : '')
                      },
                           g);
                      g.addEventListener('pointerenter', () => hoverSegment(link));
                      g.addEventListener('pointerleave', () => hoverStation(''));
                      return link;
                    });
  const stations = new Map();
  for (const [id, ids] of members) {
    const m = meta.get(id), lines = routes.filter(r => r.path.includes(id)),
          transfer = lines.length > 1,
          r = (m.kind === 'h' ? 7
               : transfer     ? 6
                              : 5) +
              Math.min(5, reach.get(id) || 0),
          linked = lines.length || [...pairs.values() ].some(p => (p.from === id || p.to === id) &&
                                                                  p.sum > .08 * max),
          g = node('g', {
            class : 'nm-station' + (linked ? '' : ' nm-unlinked'),
            transform : `translate(${m.x} ${m.y})`,
            tabindex : 0
          },
                   stationLayer);
    g.style.setProperty('--station', lines[0]?.color || stationColor(m));
    const halo = node('circle', {r : r + 6, class : 'nm-halo', opacity : 0}, g),
          pulse = node('circle', {r, class : 'nm-pulse'}, g);
    node('circle', {
      r,
      class : 'nm-ring' + (transfer ? ' nm-transfer' : ''),
      stroke : transfer ? '#16262c' : lines[0]?.color || stationColor(m)
    },
         g);
    if (m.kind !== 'h')
      node('circle', {r : 2.2, fill : stationColor(m)}, g);
    const label = node('text', {class : m.kind === 'h' ? 'nm-hub' : ''}, g);
    label.textContent = m.label;
    const title = node('title', {}, g);
    stations.set(id, {id, g, halo, pulse, title, ids, activity : 0, label, r, x : m.x, y : m.y});
    g.addEventListener('pointerenter', () => hoverStation(id));
    g.addEventListener('pointerleave', () => hoverStation(''));
    g.addEventListener('click', () => pokeStation(id));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ')
        pokeStation(id);
    });
  }
  placeLabels([...stations.values() ], grid);
  const plan = {
    fish : b.id,
    layout : b.layout_id,
    count : b.edges.length,
    station,
    meta,
    pairs,
    routes,
    segs,
    links,
    stations,
    clouds,
    max
  };
  renderLegend(plan);
  return plan;
}

// Labels go where they cover no other label or station and as few lines as possible.
function placeLabels(stations, grid) {
  const boxes = [], hits = (a, c) => a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3];
  for (const s of stations.sort((p, q) => q.r - p.r)) {
    const w = s.label.textContent.length * (s.label.classList.contains('nm-hub') ? 5 : 4.6) + 2,
          h = 9, r = s.r;
    let best = null;
    [[ 0, r + 9, 'middle' ], [ r + 3, 3, 'start' ], [ -r - 3, 3, 'end' ], [ 0, -r - 3, 'middle' ],
     [ r + 2, r + 8, 'start' ], [ -r - 2, r + 8, 'end' ], [ r + 2, -r - 1, 'start' ],
     [ -r - 2, -r - 1, 'end' ]]
        .forEach(([ dx, dy, anchor ], k) => {
          const left = s.x + dx -
                       (anchor === 'middle' ? w / 2
                        : anchor === 'end'  ? w
                                            : 0),
                box = [ left, s.y + dy - h + 1, left + w, s.y + dy + 2 ];
          let c = k * .5;
          for (const other of boxes)
            if (hits(box, other))
              c += 100;
          for (const t of stations)
            if (t !== s && hits(box, [ t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r ]))
              c += 60;
          if (box[0] < 2 || box[2] > 298 || box[1] < 2 || box[3] > 598)
            c += 40;
          for (let x = box[0]; x <= box[2]; x += 4)
            for (let y = box[1]; y <= box[3]; y += 4)
              c += (grid.get(cell(x, y)) || []).length ? .8 : 0;
          if (!best || c < best.c)
            best = {c, dx, dy, anchor, box};
        });
    boxes.push(best.box);
    s.label.setAttribute('x', best.dx);
    s.label.setAttribute('y', best.dy);
    s.label.style.textAnchor = best.anchor;
  }
}

function renderLegend(plan) {
  const box = el('nerve-lines');
  if (!box)
    return;
  box.replaceChildren();
  for (const r of plan.routes) {
    const item = document.createElement('button'), badge = document.createElement('b'),
          text = document.createElement('span');
    item.type = 'button';
    item.className = 'nerve-line';
    badge.textContent = r.badge;
    badge.style.background = r.color;
    text.textContent = format(nerve_mapState.text.ui.legend, {
      from : plan.meta.get(r.path[0]).name,
      to : plan.meta.get(r.path[r.path.length - 1]).name,
      count : r.path.length
    });
    item.append(badge, text);
    item.title = r.path.map(id => plan.meta.get(id).name).join(' → ');
    item.onclick = () => {
      nerve_mapState.focus = {
        stations : new Set(r.path),
        segs : new Set(r.segs),
        until : performance.now() + 6000
      };
    };
    box.append(item);
  }
}

function stationText(plan, s) {
  return format(
      nerve_mapState.text.ui.station,
      {name : plan.meta.get(s.id).name, cells : s.ids.length, active : percent(s.activity)});
}

function hoverStation(id) {
  nerve_mapState.hover = id ? {stations : new Set([ id ]), segs : null} : null;
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), info = el('nerve-map-info');
  if (!info)
    return;
  if (!s) {
    info.textContent = nerve_mapState.text?.ui.hint || '';
    return;
  }
  const name = x => plan.meta.get(x).name,
        into = [...plan.pairs.values() ].filter(p => p.to === id).sort((p, q) => q.sum - p.sum),
        out = [...plan.pairs.values() ].filter(p => p.from === id).sort((p, q) => q.sum - p.sum),
        lines = plan.routes.filter(r => r.path.includes(id)).map(r => r.name);
  const ui = nerve_mapState.text.ui;
  info.textContent =
      stationText(plan, s) +
      (lines.length ? format(ui.stationLines, {lines : lines.join(', ')}) : '') +
      (into.length
           ? format(ui.stationIn, {names : into.slice(0, 3).map(p => name(p.from)).join(', ')})
           : '') +
      (out.length ? format(ui.stationOut, {names : out.slice(0, 3).map(p => name(p.to)).join(', ')})
                  : '');
}

function hoverSegment(seg) {
  const plan = nerve_mapState.plan, p = seg.pair;
  nerve_mapState.hover = {stations : new Set([ seg.from, seg.to ]), segs : new Set([ seg ])};
  const ui = nerve_mapState.text.ui;
  el('nerve-map-info').textContent =
      format(ui.pair, {
        line : seg.route ? format(ui.pairLine, {name : seg.route.name}) : '',
        from : plan.meta.get(p.from).name,
        to : plan.meta.get(p.to).name,
        synapses : p.edges.length,
        excitatory : percent(p.plus / (p.sum || 1)),
        flow : (p.flow >= 0 ? '+' : '−') + percent(Math.abs(p.flow))
      }) +
      (p.learned > .001 ? format(ui.pairLearned, {learned : percent(p.learned)}) : '');
}

async function pokeStation(id) {
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), nodes = nerve_mapState.nodes;
  if (!s || !nodes)
    return;
  const ids = s.ids.filter(i => nodes.get(i)?.[4] && nodes.get(i)?.[7] && !nodes.get(i)?.[10]);
  if (!ids.length)
    return;
  s.pulse.classList.remove('nm-poke');
  void s.pulse.getBBox?.();
  s.pulse.classList.add('nm-poke');
  if (await command('stimulate', {neurons : ids, amount : 1}))
    nerve_mapState.poked = {id, at : performance.now()};
}

function highlight(plan, now) {
  const h =
      nerve_mapState.hover ||
      (nerve_mapState.focus && now < nerve_mapState.focus.until ? nerve_mapState.focus : null);
  if (plan.highlighted === h)
    return;
  plan.highlighted = h;
  for (const s of plan.stations.values())
    s.g.classList.toggle('nm-dim', !!h && !h.stations.has(s.id));
  for (const seg of [...plan.segs, ...plan.links]) {
    const a = h?.stations.has(seg.from), c = h?.stations.has(seg.to),
          shown = !h || (h.segs                          ? h.segs.has(seg)
                         : h.pair && h.stations.size > 1 ? a && c
                                                         : a || c);
    seg.group.classList.toggle('nm-dim', !shown);
  }
}

function updateLive(b, plan) {
  const state = b.neuron_state, act = new Map();
  for (const n of b.neurons)
    act.set(n[5], state?.[n[5]]?.[0] ?? n[3] ?? 0);
  for (const s of plan.stations.values()) {
    let sum = 0;
    for (const i of s.ids)
      sum += Math.abs(act.get(i) || 0);
    s.activity = s.ids.length ? sum / s.ids.length : 0;
    s.halo.setAttribute('opacity', (.6 * clamp(s.activity * 1.4)).toFixed(2));
    s.title.textContent = stationText(plan, s);
  }
  const learned = b.learning?.weights?.length ? new Map(b.learning.weights) : null;
  for (const p of plan.pairs.values()) {
    let flow = 0, change = 0;
    for (const i of p.edges) {
      const e = b.edges[i];
      flow += (act.get(e[0]) || 0) * e[2];
      if (learned?.has(e[3]))
        change += Math.abs(learned.get(e[3]) - e[2]);
    }
    p.flow = flow / (p.sum || 1);
    p.learned = change / (p.sum || 1);
  }
  for (const seg of plan.segs) {
    const strength = clamp(Math.abs(seg.pair.flow) * 2.5);
    seg.train.setAttribute('opacity', (strength > .06 ? .2 + .8 * strength : 0).toFixed(2));
    seg.train.classList.toggle('nm-brake', seg.pair.flow < 0);
    seg.learnPath.setAttribute('stroke-width', (6 + 9 * clamp(seg.pair.learned * 4)).toFixed(1));
    seg.learnPath.setAttribute(
        'opacity', seg.pair.learned > .002 ? .25 + .6 * clamp(seg.pair.learned * 4) : 0);
  }
  const levels = b.hormones?.levels || [];
  plan.clouds.forEach((c, k) => {
    const v = clamp(levels[k]);
    c.setAttribute('r', (45 + 95 * v).toFixed(0));
    c.setAttribute('opacity', (.08 + .7 * v).toFixed(2));
  });
}

function moveTrains(plan, now) {
  const dt = Math.min(.1, (now - (plan.movedAt || now)) / 1000);
  plan.movedAt = now;
  for (const seg of plan.segs) {
    const flow = seg.pair.flow;
    seg.offset -= seg.dir * Math.sign(flow || 1) * (8 + 70 * clamp(Math.abs(flow) * 2.5)) * dt;
    seg.train.setAttribute('stroke-dashoffset', (seg.offset % 1000).toFixed(1));
  }
}

// ---------------------------------------------------------------------- hormone weather
function hormoneEffects(b) {
  const sum = [ 0, 0, 0, 0, 0, 0 ];
  let count = 0;
  for (const n of b.neurons)
    if (n[4] && n[12] > 0 && n[27]?.length) {
      n[27].forEach((v, k) => sum[k] += v);
      count++;
    }
  return count ? sum.map(v => v / count) : sum;
}

function renderWeather(b, effects) {
  const box = el('nerve-weather'), h = b.hormones;
  if (!box)
    return;
  box.hidden = !h;
  if (!h)
    return;
  if (box.children.length !== 5) {
    box.replaceChildren();
    for (let k = 0; k < 4; k++) {
      const chip = document.createElement('span');
      chip.className = 'nerve-front';
      chip.style.setProperty('--hormone', hormoneColors[k]);
      chip.append(document.createElement('b'), document.createElement('small'));
      box.append(chip);
    }
    const effect = document.createElement('small');
    effect.className = 'nerve-effects';
    box.append(effect);
  }
  const mind = nerve_mapState.mind, ui = nerve_mapState.text.ui;
  for (let k = 0; k < 4; k++) {
    const v = clamp(h.levels?.[k]), trend = v - (mind.hormoneSlow[k] ?? v), chip = box.children[k],
          sky = v < .15   ? '○'
                : v < .4  ? '◔'
                : v < .65 ? '◑'
                : v < .85 ? '◕'
                          : '●';
    chip.children[0].textContent = sky + ' ' + hormoneName(h, k);
    chip.children[1].textContent = percent(v) + (trend > .01 ? ' ↑' : trend < -.01 ? ' ↓' : ' →');
    chip.title = format(ui.hormone, {
      name : hormoneName(h, k),
      description : h.names?.[k]?.description
                        ? format(ui.hormoneDescription, {text : h.names[k].description})
                        : '',
      secretion : (h.secretion?.[k] || 0).toPrecision(2),
      binding : (h.binding?.[k] || 0).toPrecision(2)
    });
  }
  const shifted = effects.map((v, k) => [k, v]).filter(([, v ]) => Math.abs(v) > .03);
  box.children[4].textContent = shifted.length ? shifted
                                                     .map(([ k, v ]) => format(ui.effect, {
                                                            icon : ui.effects[k][0],
                                                            name : ui.effects[k][1],
                                                            sign : v > 0 ? '+' : '−',
                                                            value : Math.round(100 * Math.abs(v))
                                                          }))
                                                     .join('  ')
                                               : ui.noEffect;
}

// ---------------------------------------------------------------------- observation
// Observers turn the live brain into neutral facts; the thought rules decide what they mean.
// Every numeric fact also gets <name>_rise (above its slow baseline), <name>_norm (relative to
// its recent peak), <name>_prev and <name>_prevNorm (the previous observation).
function sideKey(l, r) {
  const d = (r - l) / (Math.abs(l) + Math.abs(r) + 1e-6);
  return d > .2 ? 'right' : d < -.2 ? 'left' : 'front';
}

function senseFamily(meta) { return meta.kind === 's' ? meta.family : meta.inFamily || ''; }

function freshMind(b) {
  return {
    fish : b.id,
    slow : {},
    peak : {},
    last : {},
    used : {},
    recent : [],
    topics : [],
    prev : {},
    postedAt : performance.now(),
    changed : b.learning?.changed || 0
  };
}

function trackAll(m, raw, rates) {
  const facts = {...raw};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'number')
      continue;
    const old = m.slow[name] ?? value, rate = rates[name] ?? rates.default;
    m.slow[name] = old + (value - old) * rate;
    m.peak[name] = Math.max(Math.abs(value), (m.peak[name] || 1e-6) * .997);
    const norm = Math.abs(value) / (m.peak[name] || 1);
    facts[name + '_rise'] = value - old;
    facts[name + '_norm'] = norm;
    facts[name + '_prev'] = m.prev[name] ?? value;
    facts[name + '_prevNorm'] = m.prev[name + '_norm'] ?? norm;
    m.prev[name] = value;
    m.prev[name + '_norm'] = norm;
  }
  return facts;
}

// The strongest of several tracked channels relative to its own recent peak.
function strongest(m, prefix, values, rate) {
  let best = {index : -1, news : 0, level : 0};
  values.forEach((v, k) => {
    const key = prefix + k, old = m.slow[key] ?? v;
    m.slow[key] = old + (v - old) * rate;
    m.peak[key] = Math.max(Math.abs(v), (m.peak[key] || 1e-6) * .997);
    const news = clamp((v - old) / m.peak[key] * 4) * .8 + Math.abs(v) / m.peak[key] * .15;
    if (news > best.news)
      best = {index : k, news, level : Math.abs(v) / m.peak[key], value : v - old};
  });
  return best;
}

function observe(b, plan, m, now, T) {
  const st = id => plan.stations.get(id)?.activity || 0, has = id => plan.stations.has(id) ? 1 : 0,
        effects = hormoneEffects(b), levels = b.hormones?.levels || [],
        condition = b.peak_tissue > b.tissue_floor
                        ? clamp((b.tissue - b.tissue_floor) / (b.peak_tissue - b.tissue_floor))
                        : 1,
        poked = nerve_mapState.poked && nerve_mapState.poked.at > (m.pokedAt || 0)
                    ? nerve_mapState.poked
                    : null;
  if (poked)
    m.pokedAt = poked.at;
  const facts = trackAll(m, {
    hunger : clamp(.6 * (1 - clamp(b.satiety)) + .4 * (1 - condition)),
    fullness : clamp(b.satiety),
    pain : clamp(b.pain),
    health : b.health ?? 1,
    aggression : clamp(b.aggression),
    defense : clamp(Math.max(b.defense || 0, b.active_defense || 0)),
    ready : Math.max(b.egg_readiness || 0, b.sperm_readiness || 0) * clamp(b.gonad_filling),
    eggReady : b.egg_readiness || 0,
    spermReady : b.sperm_readiness || 0,
    excite : effects[0],
    thrust : Math.abs(b.thrust || 0),
    turn : Math.abs(b.turn || 0),
    eating : Math.max(b.eat_signal || 0, b.bite_signal || 0, b.mouth_opening || 0),
    pumping : b.pump_flow > 0 ? 1 : 0,
    contact : Math.abs(b.contact || 0),
    bladder : b.bladder_capacity > 0 ? clamp(b.bladder_fill / b.bladder_capacity) : 0,
    hasBladder : b.bladder_capacity > 0 ? 1 : 0,
    eggLaying : b.egg_laying ? 1 : 0,
    spermLaying : b.sperm_laying ? 1 : 0,
    eyeL : st('eyeL'),
    eyeR : st('eyeR'),
    latL : st('latL'),
    latR : st('latR'),
    touch : st('touch'),
    pigment : st('pigment'),
    hasEyes : has('eyeL') || has('eyeR'),
    hasNose : has('noseL') || has('noseR'),
    hasLateral : has('latL') || has('latR'),
    hasPigment : has('pigment'),
    probe : b.probe?.remaining > 0 ? 1 : 0,
    probeKind : b.probe?.kind ?? -1,
    poked : poked ? 1 : 0,
    pokedOrgan : poked && ORGANS[poked.id] ? 1 : 0,
    pokeStation : poked?.id || '',
    learned : Math.max(0, (b.learning?.changed || 0) - m.changed),
    quiet : (now - m.postedAt) / 1000,
    dice : Math.random()
  },
                         T.tracking);
  m.changed = b.learning?.changed || 0;
  // Where the eyes and the lateral line notice change.
  const eyeL = facts.eyeL_rise, eyeR = facts.eyeR_rise, latL = facts.latL_rise,
        latR = facts.latR_rise;
  Object.assign(facts, {
    eyeNews : Math.max(Math.abs(eyeL), Math.abs(eyeR)) * 6,
    eyeSide : sideKey(Math.abs(eyeL), Math.abs(eyeR)),
    eyeTone : eyeL + eyeR > 0 ? 'bright' : 'dark',
    eyeStation : eyeL > eyeR ? 'eyeL' : 'eyeR',
    latNews : Math.max(latL, latR) * 7,
    latSide : sideKey(facts.latL, facts.latR),
    latStation : facts.latL > facts.latR ? 'latL' : 'latR',
    turnStation : st('turnL') > st('turnR') ? 'turnL' : 'turnR',
    mouthStation : (b.bite_signal || 0) > (b.eat_signal || 0) ? 'bite' : 'suck',
    gonadStation : facts.eggReady >= facts.spermReady ? 'egg' : 'sperm'
  });
  // The scent that stands out most, from both nostrils.
  const nose = b.nose_samples || [],
        scent = strongest(
            m, 'scent',
            [...Array(8).keys() ].map(k => Math.max(nose[0]?.[3 + k] || 0, nose[1]?.[3 + k] || 0)),
            .05),
        left = nose[0]?.[3 + scent.index] || 0, right = nose[1]?.[3 + scent.index] || 0;
  Object.assign(facts, {
    scentIndex : scent.index,
    scentNews : scent.news,
    scentBand : scent.level < .33   ? 0
                : scent.level < .66 ? 1
                                    : 2,
    scentSide : sideKey(left, right),
    noseStation : left > right ? 'noseL' : 'noseR'
  });
  // Intentions: how strongly each sense, directly or through its hubs, drives each organ family.
  const drive = new Map();
  for (const p of plan.pairs.values()) {
    const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
    if (to.kind === 'm' && sense)
      drive.set(sense + '>' + to.family,
                (drive.get(sense + '>' + to.family) || 0) + p.flow * p.sum);
  }
  const keys = [...drive.keys() ], urge = strongest(m, 'intent:', keys.map(k => drive.get(k)), .06);
  if (urge.index >= 0) {
    const key = keys[urge.index], organ = key.split('>')[1];
    Object.assign(facts, {
      intentKey : key,
      intentOrgan : organ,
      intentSign : urge.value >= 0 ? 'drive' : 'hold',
      intentNews : urge.news,
      intentStation :
          [...plan.meta.values() ].find(x => x.kind === 'm' && x.family === organ)?.id || ''
    });
  }
  // Feelings: the hormone effect that shifts most while the hormone levels stir.
  const shift = effects.map((v, k) => [k, v - (m.effectSlow?.[k] ?? v)])
                    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
  m.effectSlow = effects.map((v, k) => (m.effectSlow?.[k] ?? v) * .9 + v * .1);
  let stir = 0;
  m.hormoneSlow ??= [];
  levels.slice(0, 4).forEach((value, k) => {
    const v = clamp(value), old = m.hormoneSlow[k] ?? v;
    m.hormoneSlow[k] = old + (v - old) * .05;
    stir = Math.max(stir, Math.abs(v - old));
  });
  Object.assign(facts, {
    stir,
    feelIndex : shift?.[0] ?? 0,
    feelShift : shift?.[1] ?? 0,
    feelSign : (shift?.[1] ?? 0) > 0 ? 'up' : 'down'
  });
  // Learning: which sense has come to mean most for which organ.
  let most = 0;
  facts.lessonKey = '';
  for (const p of plan.pairs.values()) {
    const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
    if (to.kind === 'm' && sense && p.learned > most)
      [most, facts.lessonKey] = [ p.learned, sense + '>' + to.family ];
  }
  // Surprise: the cell most surprised by its last learning step, and where it sits.
  let top = 0, where = '';
  for (const n of b.neurons) {
    const v = Math.abs(b.learning?.surprise?.[n[5]]?.[0] || 0);
    if (v > top)
      [top, where] = [ v, plan.station.get(n[5]) || '' ];
  }
  const old = m.slow.surprise ?? top;
  m.slow.surprise = old + (top - old) * .05;
  m.peak.surprise = Math.max(top, (m.peak.surprise || 1e-6) * .997);
  Object.assign(facts, {
    surpriseNews :
        where && top > old && top / m.peak.surprise > .8 ? (top - old) / m.peak.surprise * 3 : 0,
    surpriseStation : where,
    surpriseSense : where ? senseFamily(plan.meta.get(where)) : ''
  });
  // A probe the visitor placed: its colour and scent.
  const c = b.probe?.color,
        hue = c ? Math.atan2(Math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2]) * 180 / Math.PI
                : 0;
  facts.probeColour = Math.floor(((hue + 360) % 360) / 30);
  facts.probeScent = b.probe?.scents ? b.probe.scents.indexOf(Math.max(...b.probe.scents)) : 0;
  facts.mood = moodOf(T, facts).name;
  return facts;
}

function postThought(plan, text, icon, stations) {
  const list = el('nerve-thoughts');
  if (!list)
    return;
  const item = document.createElement('li'), time = document.createElement('time'),
        body = document.createElement('span'), tags = document.createElement('span'),
        known = stations.filter(id => plan.meta.has(id)),
        color = id =>
            plan.routes.find(r => r.path.includes(id))?.color || stationColor(plan.meta.get(id));
  time.textContent = new Date().toLocaleTimeString(
      'de-AT', {hour : '2-digit', minute : '2-digit', second : '2-digit'});
  body.textContent = icon + ' ' + text;
  tags.className = 'nerve-tags';
  for (const id of known) {
    const dot = document.createElement('i');
    dot.style.background = color(id);
    dot.title = plan.meta.get(id).name;
    tags.append(dot);
  }
  if (known.length)
    item.style.setProperty('--thought', color(known[0]));
  item.append(time, body, tags);
  item.title = nerve_mapState.text.ui.thoughtHint;
  item.onclick = () => {
    nerve_mapState.focus =
        {stations : new Set(known), segs : null, pair : true, until : performance.now() + 5000};
  };
  list.prepend(item);
  while (list.children.length > 40)
    list.lastChild.remove();
}

export function renderNerveMap(f) {
  const svg = el('nerve-map'), b = f?.brain;
  if (!svg || !b?.neurons?.length || !b.edges?.length || !globalThis.document?.createElementNS)
    return;
  if (!nerve_mapState.text) {
    nerve_mapState.text = 'loading';
    Promise.all([ loadStrings('de/nerve_map'), loadStrings('de-AT/thoughts') ])
        .then(([ ui, voice ]) => nerve_mapState.text = {ui, voice})
        .catch(e => {
          nerve_mapState.text = null;
          console.error(e);
        });
  }
  if (!nerve_mapState.text?.ui)
    return;
  const now = performance.now(), T = nerve_mapState.text.voice;
  let plan = nerve_mapState.plan;
  if (!plan || plan.fish !== b.id || plan.layout !== b.layout_id || plan.count !== b.edges.length) {
    plan = nerve_mapState.plan = buildPlan(b, svg);
    if (nerve_mapState.mind?.fish !== b.id) {
      nerve_mapState.mind = freshMind(b);
      el('nerve-thoughts').replaceChildren();
    }
    hoverStation('');
  }
  if (now - (plan.liveAt || 0) > 100) {
    plan.liveAt = now;
    nerve_mapState.nodes = new Map(b.neurons.map(n => [n[5], n]));
    updateLive(b, plan);
  }
  moveTrains(plan, now);
  highlight(plan, now);
  if (now - (plan.thoughtAt || 0) > 700 && f.step !== plan.thoughtStep) {
    plan.thoughtAt = now;
    plan.thoughtStep = f.step;
    const facts = observe(b, plan, nerve_mapState.mind, now, T),
          thought = think(T, facts, nerve_mapState.mind, now), mood = moodOf(T, facts);
    if (thought)
      postThought(plan, thought.text, thought.icon, thought.stations);
    renderWeather(b, hormoneEffects(b));
    el('nerve-mood').textContent = mood.icon + ' ' + mood.name;
  }
  el('nerve-learned').onclick ??= () => {
    const box = el('nerve-plan'), on = !box.classList.contains('nm-learned');
    box.classList.toggle('nm-learned', on);
    el('nerve-learned').setAttribute('aria-pressed', String(on));
  };
}
