// The nervous system as a metro map drawn from the concrete brain: organ stations, transfer hubs
// clustered from the processing cells by what they connect, and as many lines as the strongest
// signal paths need. Below: the hormone weather and a liveblog of thoughts from the live signals.
import {brainMotorColors, brainSenseColors} from './brain_model.js';
import {el} from './dom.js';
import {hormoneColors, hormoneName} from './hormones.js';
import {command} from './session.js';
export const nerve_mapState = {};

const NS = 'http://www.w3.org/2000/svg';
const BODY = 'M150 10C214 12 266 88 281 186C292 268 252 398 178 518L214 594Q150 566 86 594' +
             'L122 518C48 398 8 268 19 186C34 88 86 12 150 10Z';
// Organ stations: [anchor x, anchor y, name, organ key, family, accusative for thoughts]
const ORGANS = {
  suck : [ 118, 30, 'Saugen', 'm2', 'eat', 'meinen Saugapparat' ],
  bite : [ 182, 30, 'Kiefer', 'm5', 'eat', 'meinen Kiefer' ],
  noseL : [ 82, 62, 'Nase links', 's1', 'nose', 'meine linke Nasengrube' ],
  noseR : [ 218, 62, 'Nase rechts', 's1', 'nose', 'meine rechte Nasengrube' ],
  touch : [ 150, 72, 'Haut', 's3', 'touch', 'meine Haut' ],
  eyeL : [ 54, 112, 'Auge links', 's0', 'eye', 'mein linkes Auge' ],
  eyeR : [ 246, 112, 'Auge rechts', 's0', 'eye', 'mein rechtes Auge' ],
  latL : [ 30, 220, 'Seitenlinie links', 's2', 'lat', 'meine linke Seitenlinie' ],
  latR : [ 270, 220, 'Seitenlinie rechts', 's2', 'lat', 'meine rechte Seitenlinie' ],
  turnL : [ 40, 318, 'Drehflosse links', 'm1', 'move', 'meine linke Drehflosse' ],
  turnR : [ 260, 318, 'Drehflosse rechts', 'm1', 'move', 'meine rechte Drehflosse' ],
  gut : [ 62, 384, 'Bauchgefühl', 's4', 'body', 'mein Bauchgefühl' ],
  hsense : [ 238, 384, 'Hormonsinn', 's10', 'body', 'meinen Hormonsinn' ],
  spines : [ 84, 440, 'Stacheln', 'm6', 'guard', 'meine Stacheln' ],
  pigment : [ 216, 440, 'Pigment', 'm7', 'guard', 'meine Pigmente' ],
  bladder : [ 122, 476, 'Schwimmblase', 'm8', 'depth', 'meine Schwimmblase' ],
  gland : [ 178, 476, 'Hirndrüse', 'm9', 'gland', 'meine Hirndrüse' ],
  egg : [ 116, 522, 'Ei', 'm3', 'repro', 'mein Ei-Organ' ],
  sperm : [ 184, 522, 'Sperma', 'm4', 'repro', 'mein Sperma-Organ' ],
  tail : [ 150, 566, 'Schwanzflosse', 'm0', 'move', 'meine Schwanzflosse' ]
};
const MOTOR_ORGANS =
    [ 'tail', 'turn', 'suck', 'egg', 'sperm', 'bite', 'spines', 'pigment', 'bladder', 'gland' ];
const HUB_NAMES = {
  eye : 'Sehzentrum',
  nose : 'Riechzentrum',
  lat : 'Strömungszentrum',
  touch : 'Tastzentrum',
  body : 'Körperzentrum',
  move : 'Steuerzentrale',
  eat : 'Fresszentrum',
  repro : 'Fortpflanzungszentrum',
  guard : 'Schutzzentrum',
  depth : 'Tiefenzentrum',
  gland : 'Hormonzentrum'
};
// Short map labels for the hubs; thoughts use the full name.
const HUB_LABELS = {
  Sehzentrum : 'Sehen',
  Riechzentrum : 'Riechen',
  Strömungszentrum : 'Strömung',
  Tastzentrum : 'Tasten',
  Körperzentrum : 'Körper',
  Steuerzentrale : 'Steuerung',
  Fresszentrum : 'Fressen',
  Fortpflanzungszentrum : 'Fortpflanzung',
  Schutzzentrum : 'Schutz',
  Tiefenzentrum : 'Tiefe',
  Hormonzentrum : 'Hormone',
  Schaltzentrale : 'Schaltstelle'
};
// Neutral line colours, distinguishable on the dark map; lines are numbered by strength.
const LINE_COLORS = [
  '#e8a33d', '#5fb3d9', '#d46a8c', '#7cc47f', '#a58be0', '#e0c85a', '#4fc0b0', '#e07f5f', '#8fa7e8',
  '#c9a3c9', '#9cc95f', '#d99a6c'
];
const HORMONE_SPOTS = [ [ 92, 150 ], [ 208, 150 ], [ 104, 420 ], [ 196, 420 ] ];
const EFFECTS = [
  [ '⚡', 'Erregung' ], [ '✎', 'Lernen' ], [ '⚔', 'Konkurrenz' ], [ '∿', 'Nachklang' ],
  [ '♪', 'Rhythmus' ], [ '◉', 'Netzhaut' ]
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};
const percent = x => Math.round(100 * clamp(x)) + ' %';
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

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
                      name : 'Linie ' + (i + 1),
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
      const [x, y, name, organ, family, acc] = ORGANS[id];
      meta.set(id, {
        id,
        x,
        y,
        name,
        organ,
        family,
        acc,
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
  const used = new Map();
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
          base = HUB_NAMES[family] || 'Schaltzentrale',
          lateral =
              members.get(h.id).reduce((sum, id) => sum + (nodes.get(id)?.[0] || 0), 0) / h.size,
          side = lateral < -.25  ? ' links'
                 : lateral > .25 ? ' rechts'
                                 : '',
          count = (used.get(base + side) || 0) + 1;
    used.set(base + side, count);
    h.name = base + side + (count > 1 ? ' ' + count : '');
    h.label = HUB_LABELS[base] + (count > 1 ? ' ' + count : '');
    h.family = family || 'hub';
    h.acc = (base.endsWith('zentrale') ? 'meine ' : 'mein ') + h.name;
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
    label.textContent = m.label || m.name.replace(/ (links|rechts)$/, '');
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
    text.textContent = plan.meta.get(r.path[0]).name + ' → ' +
                       plan.meta.get(r.path[r.path.length - 1]).name + ' · ' + r.path.length +
                       ' Stationen';
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

function hoverStation(id) {
  nerve_mapState.hover = id ? {stations : new Set([ id ]), segs : null} : null;
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), info = el('nerve-map-info');
  if (!info)
    return;
  if (!s) {
    info.textContent = 'Station antippen: Reiz durch ihre Zellen schicken.';
    return;
  }
  const name = x => plan.meta.get(x).name,
        into = [...plan.pairs.values() ].filter(p => p.to === id).sort((p, q) => q.sum - p.sum),
        out = [...plan.pairs.values() ].filter(p => p.from === id).sort((p, q) => q.sum - p.sum),
        lines = plan.routes.filter(r => r.path.includes(id)).map(r => r.name);
  info.textContent =
      plan.meta.get(id).name + ' · ' + s.ids.length + ' Zellen · ' + percent(s.activity) +
      ' aktiv' + (lines.length ? ' · ' + lines.join(', ') : '') +
      (into.length ? ' · ← ' + into.slice(0, 3).map(p => name(p.from)).join(', ') : '') +
      (out.length ? ' · → ' + out.slice(0, 3).map(p => name(p.to)).join(', ') : '');
}

function hoverSegment(seg) {
  const plan = nerve_mapState.plan, p = seg.pair;
  nerve_mapState.hover = {stations : new Set([ seg.from, seg.to ]), segs : new Set([ seg ])};
  el('nerve-map-info').textContent =
      (seg.route ? seg.route.name + ' · ' : '') + plan.meta.get(p.from).name + ' → ' +
      plan.meta.get(p.to).name + ' · ' + p.edges.length + ' Synapsen · ' +
      Math.round(100 * p.plus / (p.sum || 1)) + ' % erregend · Fluss ' + (p.flow >= 0 ? '+' : '−') +
      percent(Math.abs(p.flow)) + (p.learned > .001 ? ' · gelernt ' + percent(p.learned) : '');
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
    s.title.textContent = plan.meta.get(s.id).name + ' · ' + s.ids.length + ' Zellen · ' +
                          percent(s.activity) + ' aktiv';
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
  const mind = nerve_mapState.mind;
  for (let k = 0; k < 4; k++) {
    const v = clamp(h.levels?.[k]), trend = v - (mind.hormoneSlow[k] ?? v), chip = box.children[k],
          sky = v < .15   ? '○'
                : v < .4  ? '◔'
                : v < .65 ? '◑'
                : v < .85 ? '◕'
                          : '●';
    chip.children[0].textContent = sky + ' ' + hormoneName(h, k);
    chip.children[1].textContent = percent(v) + (trend > .01 ? ' ↑' : trend < -.01 ? ' ↓' : ' →');
    chip.title = hormoneName(h, k) +
                 (h.names?.[k]?.description ? ' · ' + h.names[k].description : '') +
                 ' · Ausschüttung ' + (h.secretion?.[k] || 0).toPrecision(2) + ' · Abbau ' +
                 (h.binding?.[k] || 0).toPrecision(2);
  }
  const shifted = effects.map((v, k) => [k, v]).filter(([, v ]) => Math.abs(v) > .03);
  box.children[4].textContent =
      shifted.length
          ? shifted
                .map(([ k, v ]) => EFFECTS[k][0] + ' ' + EFFECTS[k][1] + ' ' + (v > 0 ? '+' : '−') +
                                   Math.round(100 * Math.abs(v)) + ' %')
                .join('  ')
          : 'Hormone wirken gerade kaum auf die Nervenzellen.';
}

// ---------------------------------------------------------------------- thoughts
// The fish thinks in cultivated Viennese: Viennese content and attitude, standard grammar.
const SCENT_SAY = [
  [ 'Futter', 'Jause', 'Fressbares', 'Futterbrocken' ], [ 'Algen', 'Algenrasen', 'Grünzeug' ],
  [ 'Pflanzen', 'Grünzeug', 'Blattwerk' ], [ 'Bodentiere', 'Würmer', 'Gewurl im Boden' ],
  [ 'Plankton', 'Schwebfutter', 'Gewurl' ], [ 'Aas', 'Totes', 'Verwesung' ],
  [ 'Eier', 'Laich', 'Kaviar' ], [ 'Sperma', 'Milch', 'Paarungsduft' ]
];
const SIDE = {
  links : [ 'links', 'auf der linken Seite', 'backbord' ],
  rechts : [ 'rechts', 'auf der rechten Seite', 'steuerbord' ],
  vorn : [ 'vorn', 'direkt vor mir', 'rundherum', 'irgendwo da' ]
};
const MOODS = {
  verschreckt : [ '😱', [ 'Jessas!', 'Um Gottes willen!', 'Hilfe!', 'Na servus!' ] ],
  grantig : [ '😠', [ 'Geh, bitte.', 'Also wirklich.', 'Ich bitte Sie.', 'Na geh.' ] ],
  gierig : [ '🤤', [ 'Mahlzeit!', 'Her damit!', 'So ein Gusto!' ] ],
  raunzig : [ '😒', [ 'Ach.', 'Na bravo.', 'Immer dasselbe.', 'Mah.' ] ],
  verschossen : [ '😍', [ 'Hach.', 'Jö.', 'Oh là là.', 'Na, hallo.' ] ],
  neugierig : [ '🤔', [ 'Nanu?', 'Schau, schau.', 'Ui.', 'Moment einmal.' ] ],
  wissbegierig : [ '🧐', [ 'Aha!', 'Interessant.', 'Sieh einer an.' ] ],
  gemütlich : [ '😌', [ 'Ah.', 'Schön.', 'Leiwand.', 'Herrlich.' ] ],
  verschlafen : [ '😴', [ 'Hm …', 'Blubb.', 'Gähn.', 'Tja.' ] ],
  aufgedreht : [ '⚡', [ 'Ui!', 'Wahnsinn!', 'Juhu!', 'Auf geht’s!' ] ]
};
// The Viennese way of life as an afterthought; the mood picks the tone.
const TAILS = {
  any : [
    'Aber was soll man machen.', 'Es wird schon schiefgehen.', 'Hauptsache, es geht sich aus.',
    'Das ist eh klar.', 'Morgen ist auch noch ein Tag.', 'Man gönnt sich ja sonst nichts.',
    'Schauen wir einmal.', 'Passt schon.', 'Nur nicht hudeln.', 'Mir bleibt auch nichts erspart.',
    'Ein Wahnsinn, eigentlich.', 'Wo kämen wir denn da hin.', 'Nachher eine Melange.',
    'So ist das Leben im Becken.', 'Wie beim Heurigen.', 'Irgendwer sudert immer.'
  ],
  grantig : [ 'Typisch.', 'Ich sag ja nichts.', 'Wer soll sich da noch auskennen.' ],
  raunzig : [ 'Früher war mehr Plankton.', 'Es zieht übrigens.', 'Immer ich.' ],
  gemütlich : [ 'So lässt es sich leben.', 'Ein Traum.', 'Gemütlichkeit ist keine Faulheit.' ],
  verschossen : [ 'Man ist ja nicht aus Holz.', 'Hach, das Leben.' ],
  verschreckt : [ 'Um Gottes willen.', 'Das war knapp.' ]
};
const FEEL = [
  [
    [ 'ich werde ganz zappelig', 'alles kribbelt', 'hellwach!', 'Strom auf allen Leitungen' ],
    [
      'alles wird ruhig', 'ich werde ein bisserl träge', 'gedämpfte Stimmung', 'Ruhe in den Bahnen'
    ]
  ],
  [
    [ 'jetzt merke ich mir alles', 'Lernlaune!', 'alles ist auf einmal wichtig' ],
    [ 'heute lerne ich nichts mehr', 'Kopf zu', 'es bleibt eh alles, wie es ist' ]
  ],
  [
    [ 'ein Gedanke verdrängt den anderen', 'nur mehr eines zählt', 'Tunnelblick' ],
    [ 'alles gleichzeitig', 'ein Pallawatsch im Kopf', 'alles irgendwie wichtig' ]
  ],
  [
    [ 'das hallt lange nach', 'ich vergesse nicht so schnell', 'das bleibt hängen' ],
    [ 'alles rauscht vorbei', 'kurzes Gedächtnis heute', 'schon wieder vergessen' ]
  ],
  [
    [ 'der Takt wird schneller', 'alles im Dreivierteltakt', 'Puls auf hundert' ],
    [ 'der Takt wird langsam', 'alles zieht sich', 'gemächlich' ]
  ],
  [
    [ 'die Farben sind kräftiger', 'ich sehe schärfer', 'die Welt leuchtet' ],
    [ 'alles schaut blass aus', 'die Augen werden müde', 'grau in grau wie im November' ]
  ]
];

function sideOf(l, r, from = false) {
  const d = (r - l) / (Math.abs(l) + Math.abs(r) + 1e-6), side = d > .2    ? 'rechts'
                                                                 : d < -.2 ? 'links'
                                                                           : 'vorn';
  return from ? 'von ' + (side === 'vorn' ? pick([ 'vorn', 'überall' ]) : side) : pick(SIDE[side]);
}
function intensity(x, words) { return pick(words[x < .33 ? 0 : x < .66 ? 1 : 2]); }

function freshMind(b) {
  return {
    fish : b.id,
    slow : {},
    peak : {},
    last : {},
    used : {},
    recent : [],
    topics : [],
    quietSince : performance.now(),
    hormoneSlow : [],
    changed : b.learning?.changed || 0,
    prev : {}
  };
}

// Slow baselines turn levels into news: a thought arises from what changed.
function track(m, key, value, rate = .08) {
  const old = m.slow[key] ?? value;
  m.slow[key] = old + (value - old) * rate;
  m.peak[key] = Math.max(Math.abs(value), (m.peak[key] || 1e-6) * .997);
  return {value, rise : value - old, norm : Math.abs(value) / (m.peak[key] || 1)};
}

// A wording is used at most once every few minutes, so nothing turns into a refrain.
function fresh(m, key, variants, now) {
  const open = variants.map((text, i) => [text, key + ':' + i])
                   .filter(([ text, id ]) => text && now - (m.used[id] ?? -1e9) > 240000 &&
                                             !m.recent.includes(text));
  return open.length ? pick(open) : null;
}

function moodOf(f) {
  if (f.pain > .2 || f.health < .3)
    return 'verschreckt';
  if (f.aggression > .3)
    return 'grantig';
  if (f.hunger > .7)
    return f.excite > .05 || f.thrust > .6 ? 'gierig' : 'raunzig';
  if (f.ready > .85)
    return 'verschossen';
  if (f.learning > .5)
    return 'wissbegierig';
  if (f.novelty > .45)
    return 'neugierig';
  if (f.excite > .1)
    return 'aufgedreht';
  if (f.fullness > .5)
    return 'gemütlich';
  return f.thrust < .2 ? 'verschlafen' : 'gemütlich';
}

function think(b, plan, now) {
  const m = nerve_mapState.mind, st = id => plan.stations.get(id)?.activity || 0,
        has = id => plan.stations.has(id), name = id => plan.meta.get(id)?.name || '', c = [];
  const cool = (topic, span) => clamp((now - (m.last[topic] || -1e9)) / (span * 1000));
  const add = (topic, salience, variants, stations, icon, span = 8) => {
    const s = salience * cool(topic, span) * (m.topics.includes(topic) ? .45 : 1),
          chosen = s > 0 && fresh(m, topic, variants, now);
    if (chosen)
      c.push({topic, s, text : chosen[0], key : chosen[1], stations, icon});
  };
  const effects = hormoneEffects(b), levels = b.hormones?.levels || [];
  const f = {
    hunger : 0,
    fullness : clamp(b.satiety),
    condition : b.peak_tissue > b.tissue_floor
                    ? clamp((b.tissue - b.tissue_floor) / (b.peak_tissue - b.tissue_floor))
                    : 1,
    pain : clamp(b.pain),
    health : b.health ?? 1,
    aggression : clamp(b.aggression),
    defense : clamp(Math.max(b.defense || 0, b.active_defense || 0)),
    ready : Math.max(b.egg_readiness || 0, b.sperm_readiness || 0) * clamp(b.gonad_filling),
    excite : effects[0],
    learning : clamp(((b.learning?.changed || 0) - m.changed) / 5),
    thrust : track(m, 'thrust', Math.abs(b.thrust || 0)).norm,
    novelty : 0
  };
  f.hunger = clamp(.6 * (1 - f.fullness) + .4 * (1 - f.condition));
  // Senses: rises above the slow baseline are news.
  const eye = [ track(m, 'eyeL', st('eyeL')), track(m, 'eyeR', st('eyeR')) ],
        lat = [ track(m, 'latL', st('latL')), track(m, 'latR', st('latR')) ],
        skin = track(m, 'touch', st('touch')),
        contact = track(m, 'contact', Math.abs(b.contact || 0), .2);
  const seen = Math.max(...eye.map(e => Math.abs(e.rise))) * 6;
  f.novelty = clamp(seen + Math.max(...lat.map(e => e.rise)) * 6);
  if (has('eyeL') || has('eyeR')) {
    const side = sideOf(Math.abs(eye[0].rise), Math.abs(eye[1].rise)),
          brighter = eye[0].rise + eye[1].rise > 0;
    add('sight', clamp(seen),
        [
          `Da rührt sich etwas ${side}.`,
          `${cap(side)} wird es ${brighter ? 'heller' : 'finsterer'}.`,
          `Was ${brighter ? 'glitzert' : 'huscht'} denn da ${side}?`,
          `Die Augen melden etwas Neues ${side}.`,
          `Ein ${brighter ? 'Glitzern' : 'Schatten'} ${side} – verdächtig.`,
          `${cap(side)} bewegt sich etwas. Ich tue so, als hätte ich nichts gesehen.`,
          'Ich sehe etwas, was du nicht siehst.', 'Schauen kostet ja nichts.'
        ],
        [ eye[0].rise > eye[1].rise ? 'eyeL' : 'eyeR' ], '👁', 6);
  }
  if (has('latL') || has('latR')) {
    const wave = clamp(Math.max(lat[0].rise, lat[1].rise) * 7),
          from = sideOf(lat[0].value, lat[1].value, true),
          side = sideOf(lat[0].value, lat[1].value);
    add('lateral', wave,
        [
          `Eine Druckwelle ${from} – schwimmt da jemand vorbei?`, `Das Wasser zittert ${side}.`,
          `Strömung ${from}. Es zieht!`, 'Die Seitenlinie kribbelt.',
          `Ein Wirbel ${side}. Wer macht da so einen Bahöl?`, `Wellen ${from}. Groß oder klein?`
        ],
        [ lat[0].value > lat[1].value ? 'latL' : 'latR' ], '〰', 8);
  }
  if (contact.rise > .05 || skin.rise > .08)
    add('touch', clamp(Math.max(contact.rise * 3, skin.rise * 6)),
        [
          'Hoppala, Berührung!', 'Ich stoße irgendwo an.', 'Da ist etwas Hartes.',
          'Wer rempelt mich da an?', 'Körperkontakt ohne Vorstellung? Unerhört.',
          'Ein bisserl Abstand, wenn ich bitten darf.'
        ],
        [ 'touch' ], '✋', 8);
  // Smell: strongest channel relative to its own recent peak, side from both nostrils.
  const nose = b.nose_samples || [];
  let scent = -1, scentNews = 0, scentLevel = 0;
  for (let k = 0; k < 8; k++) {
    const l = nose[0]?.[3 + k] || 0, r = nose[1]?.[3 + k] || 0,
          t = track(m, 'scent' + k, Math.max(l, r), .05),
          news = clamp(t.rise / ((m.peak['scent' + k] || 1e-6)) * 4) * .8 + t.norm * .15;
    if (news > scentNews)
      [scent, scentNews, scentLevel] = [ k, news, t.norm ];
  }
  if (scent >= 0 && (has('noseL') || has('noseR'))) {
    const l = nose[0]?.[3 + scent] || 0, r = nose[1]?.[3 + scent] || 0, x = pick(SCENT_SAY[scent]),
          side = sideOf(l, r), edible = scent <= 4;
    const follow =
        edible ? (f.hunger > .5 ? pick([
          'Nichts wie hin!', 'Das will ich!', 'Kurs setzen.', 'Der Magen knurrt schon.',
          'So ein Gusto!'
        ])
                                : pick([
                                    'Später vielleicht.', 'Ich bin eh satt.',
                                    'Für die Jause später.', 'Man muss nicht alles haben.'
                                  ]))
        : scent === 5
            ? (f.hunger > .6 ? pick([ 'Besser als nichts.', 'Ob das noch gut ist?' ]) : pick([
                'Pfui Teufel.', 'Nein, danke.', 'Da hat es jemanden erwischt. Eine schöne Leich.'
              ]))
        : scent === 6
            ? pick([
                'Ob da Nachwuchs liegt?', 'Kaviar oder Verwandtschaft?', 'Hoffentlich nicht meine.'
              ])
            : (b.egg_readiness > .8 ? pick([
                'Ein Mannsbild in der Nähe!', 'Zeit für ein Gspusi?', 'Man ist ja nicht aus Holz.'
              ])
                                    : pick([
                                        'Da balzt jemand.', 'Ein Herr war hier.',
                                        'Interessant, wer da herumschwimmt.'
                                      ]));
    add('smell', scentNews,
        [
          `Ich rieche ${
              intensity(scentLevel,
                        [
                          [ 'ganz leicht', 'einen Hauch', 'von weit weg' ], [ 'deutlich', 'klar' ],
                          [ 'sehr stark', 'gewaltig', 'unverkennbar' ]
                        ])} ${x} – ${side}.`,
          `${cap(x)}? Die Nase sagt: ${side}.`, `In der Strömung: ${x}, ${side}.`,
          `Das Riechzentrum meldet ${x}. ${follow}`, `Hm, ${x} … ${follow}`,
          `${cap(x)} ${side}. ${follow}`, `Es duftet nach ${x}. ${follow}`
        ],
        [ l > r ? 'noseL' : 'noseR' ], '👃', 14);
  }
  // Drives.
  if (f.hunger > .55)
    add('hunger', (f.hunger - .5) * 1.2,
        [
          'Der Bauch ist leer.', 'Der Magen knurrt.', 'Wann gibt es endlich etwas?',
          `Der Darm ist nur zu ${percent(f.fullness)} voll. Ein Skandal.`, `Ich könnte ${pick([
            'einen ganzen Wurm', 'ein ganzes Algenfeld', 'eine Wolke Plankton', 'einfach alles'
          ])} verdrücken.`,
          `Ich hätte einen Gusto auf ${
              pick([ 'ein Würmerl', 'Algen', 'Plankton', 'irgendetwas' ])}.`,
          'Eine Jause wäre jetzt recht.', 'Ein Königreich für einen Wurm.',
          `Die Energie wird knapp – ${
              pick([ 'Futter suchen!', 'sparsam schwimmen.', 'ich muss etwas essen.' ])}`
        ],
        [ 'gut' ], '🍽', 30);
  const eating = Math.max(b.eat_signal || 0, b.bite_signal || 0, b.mouth_opening || 0);
  if (eating > .05 && eating > (m.prev.eating || 0))
    add('eat', .9,
        [
          'Schnapp!', 'Mahlzeit!', 'Maul auf!', 'Kauen, kauen, kauen.', 'Zubeißen!', 'Gschmackig!',
          b.pump_flow > 0 ? `Ich sauge ${pick([ 'kräftig', 'alles ein', 'am Boden' ])}.` : 'Happs!',
          scent >= 0 && scent <= 4 ? `Schmeckt nach ${SCENT_SAY[scent][0]}. Gar nicht schlecht.`
                                   : 'Was war denn das?'
        ],
        [ b.bite_signal > b.eat_signal ? 'bite' : 'suck' ], '😋', 5);
  if (f.fullness > .7 && f.fullness > (m.prev.fullness || 0) + .02)
    add('full', .6,
        [
          'Voll bis obenhin.', 'Satt bis zu den Kiemen.', 'Verdauen … bitte nicht stören.',
          `${percent(f.fullness)} Darmfüllung – das geht sich aus.`,
          'Das war gut. Jetzt ein Verdauungsschläfchen.', 'Wie nach einem Sonntagsschnitzel.'
        ],
        [ 'gut' ], '😌', 40);
  if (f.pain > .03 && f.pain > (m.prev.pain || 0) + .01)
    add('pain', 1.5 + f.pain,
        [
          'Au!', 'Au weh, das hat wehgetan!', 'Mich hat es erwischt.', 'Nichts wie weg!',
          'Die Schmerzsensoren schreien.', 'Autsch – das merke ich mir.', 'Jessas, das war knapp.'
        ],
        [ 'gut' ], '❗', 3);
  if (f.health < .5)
    add('health', (.6 - f.health),
        [
          'Ich bin ganz marod.', `Nur mehr ${percent(f.health)} Gesundheit …`,
          'Ich muss mich schonen.', 'Mir ist nicht gut.', 'Ich glaube, ich brüte etwas aus.',
          'Zentralfriedhof? Noch lange nicht.'
        ],
        [ 'gut' ], '❤', 60);
  const fast = track(m, 'speed', Math.abs(b.thrust || 0), .05);
  if (fast.rise > .02 && fast.norm > .6)
    add('move', clamp(fast.rise * 8),
        [ 'Volle Kraft voraus!', 'Schneller!', 'Flossen, los!', 'Tempo!', 'Sprint!' ], [ 'tail' ],
        '➤', 15);
  else if (fast.norm < .15 && (m.prev.speed || 0) > .3)
    add('drift', .4,
        [
          'Ich lasse mich treiben.', 'Gemütlich dahin.', 'Kurze Pause.', 'Ein bisserl schweben …',
          'Nur nicht hudeln.'
        ],
        [ 'tail' ], '〰', 20);
  const turn = track(m, 'turn', Math.abs(b.turn || 0), .1);
  if (turn.rise > .05 && turn.norm > .6)
    add('turn', clamp(turn.rise * 5),
        [
          'Kurswechsel!', 'Ich drehe ab.', 'Eine elegante Kurve.', 'Umdrehen, schnell!',
          'Eine Drehung wie beim Walzer.'
        ],
        [ st('turnL') > st('turnR') ? 'turnL' : 'turnR' ], '↻', 12);
  if (f.ready > .8)
    add('ready', (f.ready - .7) * 1.2, b.egg_readiness >= b.sperm_readiness ? [
      'Die Eier sind reif.', 'Es wird Zeit für Nachwuchs.', 'Wo ist ein guter Laichplatz?',
      'Ich spüre den Laichdrang.', 'Man ist ja nicht aus Holz.'
    ] : [ 'Ich bin bereit.', 'Wo sind die Gelege?', 'Bereit für die Balz.', 'Heute Abend gehe ich aus.' ],
        [ b.egg_readiness >= b.sperm_readiness ? 'egg' : 'sperm' ], '🥚', 60);
  if (b.egg_laying && !m.prev.egg_laying)
    add('laying', 2,
        [
          'Laichen! Jetzt!', 'Eier abgelegt – alles Gute, Kinder.', 'Geschafft: ein Gelege.',
          'Die Taufe machen wir später.'
        ],
        [ 'egg' ], '🥚', 5);
  if (b.sperm_laying && !m.prev.sperm_laying)
    add('laying', 2,
        [
          'Milch abgegeben.', 'Befruchtet – hoffentlich.', 'Für die Zukunft!', 'Diskretion, bitte.'
        ],
        [ 'sperm' ], '💧', 5);
  if (f.aggression > .3 && f.aggression > (m.prev.aggression || 0))
    add('fight', f.aggression + .3,
        [
          'Komm mir nicht zu nahe!', 'Das ist MEIN Revier.', 'Angriff!', 'Dir zeige ich es!',
          'Schleich dich!', 'Gleich gibt es eine Watschen.'
        ],
        [ 'bite' ], '⚔', 8);
  if (f.defense > .3 && f.defense > (m.prev.defense || 0))
    add('defense', f.defense + .2,
        [
          'Stacheln raus!', 'Verteidigen!', 'Ich mache mich groß.', 'Keinen Schritt weiter!',
          'Bis hierher und nicht weiter.'
        ],
        [ 'spines' ], '🛡', 8);
  if (b.bladder_capacity > 0) {
    const air = track(m, 'bladder', clamp(b.bladder_fill / b.bladder_capacity), .1);
    if (Math.abs(air.rise) > .03)
      add('bladder', clamp(Math.abs(air.rise) * 8),
          air.rise > 0 ? [ 'Ein bisserl Luft in die Blase – hinauf.', 'Auftrieb!', 'Ich steige.' ]
                       : [ 'Luft auslassen, abtauchen.', 'Hinunter geht es.', 'Ich sinke.' ],
          [ 'bladder' ], '○', 20);
  }
  for (const [id, words, icon] of [
           [
             'pigment',
             [
               'Ich zeige Farbe.', 'Farbwechsel!', 'Schau mich an!',
               'Für den Opernball zurechtgemacht.'
             ],
             '🎨'
           ],
           [ 'gland', [ 'Die Hirndrüse schüttet aus.', 'Botenstoffe unterwegs.' ], '⚗' ]]) {
    const t = track(m, id, st(id), .1);
    if (has(id) && t.rise > .08)
      add(id, clamp(t.rise * 4), words, [ id ], icon, 25);
  }
  // Hormones: the largest effect shift colours the feeling.
  const shift = effects.map((v, k) => [k, v - (m.effectSlow?.[k] ?? v)])
                    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
  m.effectSlow = effects.map((v, k) => (m.effectSlow?.[k] ?? v) * .9 + v * .1);
  for (let k = 0; k < Math.min(4, levels.length); k++) {
    const v = clamp(levels[k]), old = m.hormoneSlow[k] ?? v, trend = v - old;
    m.hormoneSlow[k] = old + (v - old) * .05;
    if (Math.abs(trend) > .04) {
      const feel = shift && Math.abs(shift[1]) > .01
                       ? FEEL[shift[0]][shift[1] > 0 ? 0 : 1]
                       : [ 'irgendetwas tut sich', 'ich spüre es überall', 'eigenartig' ],
            verbs = trend > 0 ? [ 'steigt', 'flutet an', 'legt zu' ]
                              : [ 'sinkt', 'ebbt ab', 'lässt nach' ];
      add('hormone' + k, clamp(Math.abs(trend) * 6),
          feel.flatMap(x => verbs.map(v => `${hormoneName(b.hormones, k)} ${v} – ${x}.`)),
          [ 'hsense' ], '☁', 15);
    }
  }
  if (levels.length >= 2) {
    const order = levels.map((v, k) => [k, v]).sort((p, q) => q[1] - p[1]),
          hi = hormoneName(b.hormones, order[0][0]),
          lo = hormoneName(b.hormones, order[order.length - 1][0]);
    if (order[0][1] - order[order.length - 1][1] > .25)
      add('weather', .3,
          [
            `Hormonwetter: ${hi} hoch, ${lo} tief – ${moodOf(f)}.`,
            `Innen ${pick([ 'bewölkt', 'heiter', 'föhnig', 'schwül' ])}: viel ${hi}.`,
            `Wetterlage im Kopf: ${hi} gibt den Ton an.`, `Ein Föhntag im Kopf – zu viel ${hi}.`
          ],
          [ 'hsense' ], '☁', 60);
  }
  // Learning: new connections and surprises.
  const changed = b.learning?.changed || 0;
  if (changed > m.changed) {
    const best = [...plan.pairs.values() ].reduce((p, q) => q.learned > (p?.learned || 0) ? q : p,
                                                  null),
          from = best && name(best.from), to = best && name(best.to), n = changed - m.changed;
    add('learn', .8 + clamp(n / 10), best ? [
      'Aha! Das merke ich mir.', `Neue Verbindung: ${from} ↔ ${to}.`,
      `Die Verbindung ${from} – ${to} wird stärker.`,
      `Jetzt verstehe ich es: ${from} gehört zu ${to}.`,
      `${n} Synapsen umgebaut. Eine ewige Baustelle.`
    ] : [ 'Aha! Das merke ich mir.', `${n} Synapsen umgebaut. Eine ewige Baustelle.` ],
        best ? [ best.from, best.to ] : [], '✦', 10);
    m.changed = changed;
  }
  const surprise = b.learning?.surprise;
  if (surprise?.length) {
    let top = 0, where = '';
    for (const n of b.neurons) {
      const v = Math.abs(surprise[n[5]]?.[0] || 0);
      if (v > top)
        [top, where] = [ v, plan.station.get(n[5]) || '' ];
    }
    const t = track(m, 'surprise', top, .05);
    if (where && t.rise > 0 && t.norm > .8)
      add('surprise', clamp(t.rise / (m.peak.surprise || 1) * 3),
          [
            `Überraschung im ${name(where)}!`, 'Das hätte ich mir nicht erwartet.',
            'Hoppala, anders als gedacht.', `${name(where)} wundert sich.`, 'Na servus!'
          ],
          [ where ], '❕', 12);
  }
  // The busiest pathway: rarely worth a thought, and then about the signal itself.
  const busiest = [...plan.pairs.values() ].reduce(
      (p, q) => Math.abs(q.flow) * Math.sqrt(q.sum) > (p ? Math.abs(p.flow) * Math.sqrt(p.sum) : 0)
                    ? q
                    : p,
      null);
  if (busiest && Math.abs(busiest.flow) > .1) {
    const from = name(busiest.from), to = name(busiest.to), key = busiest.key + (busiest.flow < 0);
    if (key !== m.prev.route)
      add('route', .2 + .5 * clamp(Math.abs(busiest.flow)), busiest.flow > 0 ? [
        `${from} redet auf ${to} ein.`, `${from} funkt an ${to}.`,
        `Zwischen ${from} und ${to} ist viel los.`
      ] : [ `${from} bremst ${to}.`, `Halt, ${to}! – sagt ${from}.`, `${from} hält ${to} zurück.` ],
          [ busiest.from, busiest.to ], busiest.flow > 0 ? '⇢' : '⛔', 45);
    m.prev.route = key;
  }
  // The visitor's own stimuli: noticed now and then, never as a fixed reply.
  const poked = nerve_mapState.poked;
  if (poked && poked.at > (m.prev.pokedAt || 0)) {
    m.prev.pokedAt = poked.at;
    const acc = poked.id[0] === 'h' ? plan.meta.get(poked.id).acc : ORGANS[poked.id]?.[5];
    if (acc && chance(.4))
      add('poke', 1.2,
          [
            `Wer kitzelt da ${acc}?`, `Ein Stromstoß durch ${acc}!`, `Hoppala – wer reizt ${acc}?`,
            `Also bitte, ${acc} ist kein Klingelknopf.`, `Was ist denn mit ${acc} los?`
          ],
          [ poked.id ], '👆', 30);
  }
  const probe = b.probe;
  if (probe?.remaining > 0 && !(m.prev.probe > 0)) {
    const hue = probe.color ? Math.atan2(Math.sqrt(3) * (probe.color[1] - probe.color[2]),
                                         2 * probe.color[0] - probe.color[1] - probe.color[2]) *
                                  180 / Math.PI
                            : 0,
          colour =
              [
                'rot', 'orange', 'gelb', 'grün', 'grün', 'türkis', 'blau', 'blau', 'violett',
                'pink', 'rot', 'rot'
              ][Math.floor(((hue + 360) % 360) / 30)],
          smell = probe.scents ? probe.scents.indexOf(Math.max(...probe.scents)) : 0;
    add('probe', 1.4,
        probe.kind === 0 ? [
          'Ein Licht! Woher kommt das?', `Was leuchtet da so ${colour}?`,
          `${cap(colour)}es Licht – kann man das essen?`, 'Ein Licht wie am Christkindlmarkt.'
        ]
        : probe.kind === 1 ? [ 'Ein Duft aus dem Nichts …', `Riecht nach ${SCENT_SAY[smell][0]} – aber woher?` ]
                           : [ 'Ein komisches Gefühl im Körper …', 'Da stimmt etwas nicht mit mir.' ],
        [], '💡', 20);
  }
  m.prev = {
    ...m.prev,
    eating,
    fullness : f.fullness,
    pain : f.pain,
    speed : fast.norm,
    egg_laying : b.egg_laying,
    sperm_laying : b.sperm_laying,
    aggression : f.aggression,
    defense : f.defense,
    probe : probe?.remaining || 0
  };
  const mood = moodOf(f);
  nerve_mapState.mood = mood;
  c.sort((p, q) => q.s - p.s);
  let best = c.find(t => t.s > .3);
  if (!best && now - m.quietSince > 12000) {
    const busy = [...plan.stations.values() ].sort((p, q) => q.activity - p.activity)[0],
          idle = fresh(
              m, 'idle',
              [
                'Ich schwimme, also bin ich.',
                `${b.neuron_count} Zellen, ${
                    (b.edge_count ||
                     0).toLocaleString('de-AT')} Verbindungen – und trotzdem kein Plan.`,
                'Was wohl hinter dem nächsten Stein liegt?', 'Ruhige Zeiten.', 'Blubb.',
                'Ob die anderen auch so viel nachdenken?', 'Ein guter Tag zum Schwimmen.',
                `Am liebsten würde ich ${pick([
                  'Algen zupfen', 'im Kies wühlen', 'einfach treiben', 'jemandem nachjagen'
                ])}.`,
                busy ? `${name(busy.id)} hackelt heute fleißig.` : '',
                `Ich denke an ${
                    pick([ 'Futter', 'Eier', 'gar nichts', 'den großen Fisch von vorhin' ])}.`,
                'Ein Schanigarten im Becken wäre schön.', 'Jetzt eine Melange und die Zeitung.',
                'Im Kaffeehaus wäre es auch nicht anders.', 'Raunzen ist auch eine Kunst.',
                'Wer nichts tut, macht nichts falsch.', 'Es ist, wie es ist.',
                'Schauen wir, was der Tag noch bringt.',
                mood === 'gemütlich'     ? 'Alles im Fluss.'
                : mood === 'raunzig'     ? 'Nichts los hier. Fad ist es.'
                : mood === 'verschossen' ? 'Ich träume vom Laichen.'
                                         : ''
              ],
              now);
    if (idle)
      best = {
        topic : 'idle',
        text : idle[0],
        key : idle[1],
        stations : busy ? [ busy.id ] : [],
        icon : '💭'
      };
  }
  if (!best || now - (m.postedAt || 0) < 3500 && best.s < 1.4)
    return;
  m.postedAt = now;
  let text = best.text;
  const opener = chance(.22) && fresh(m, 'open:' + mood, MOODS[mood][1], now),
        tail = chance(.2) && fresh(m, 'tail', [...TAILS.any, ...(TAILS[mood] || []) ], now);
  if (opener) {
    text = opener[0] + ' ' + text;
    m.used[opener[1]] = now;
  }
  const second = c.find(t => t !== best && t.topic !== best.topic && t.s > .45 * best.s);
  if (second && chance(.3)) {
    text += ' ' + pick([ 'Außerdem:', 'Und:', 'Nebenbei:', 'Und dann noch:' ]) + ' ' + second.text;
    m.last[second.topic] = now;
    m.used[second.key] = now;
  } else if (tail) {
    text += ' ' + tail[0];
    m.used[tail[1]] = now;
  }
  m.used[best.key] = now;
  m.last[best.topic] = now;
  m.quietSince = now;
  m.recent = [ best.text, ...m.recent ].slice(0, 60);
  m.topics = [ best.topic, ...m.topics ].slice(0, 3);
  postThought(plan, text, best.icon,
              [...new Set([...best.stations, ...(second?.stations || []) ]) ]);
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
  item.title = 'Antippen: beteiligte Stationen im Plan zeigen';
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
  const now = performance.now();
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
    think(b, plan, now);
    renderWeather(b, hormoneEffects(b));
    const mood = MOODS[nerve_mapState.mood];
    el('nerve-mood').textContent = mood ? mood[0] + ' ' + nerve_mapState.mood : '';
  }
  el('nerve-learned').onclick ??= () => {
    const box = el('nerve-plan'), on = !box.classList.contains('nm-learned');
    box.classList.toggle('nm-learned', on);
    el('nerve-learned').setAttribute('aria-pressed', String(on));
  };
}
