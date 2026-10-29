import {updateBrainState} from './brain.js';
import {brainClamp, brainState} from './brain.js';
import {brainOrganRGB} from './brain_model.js';
import {brainMotorActivity} from './brain_signals.js';
import {fishBodyRadius, fishFinPoint} from './fish_fins.js';
import {fishAlong} from './fish_forms.js';
import {fishBezier, fishHeadCurve, fishRegion} from './fish_geometry.js';
import {
  fishBarbel,
  fishBladderShape,
  fishCheekPoint,
  fishDefenseSpines,
  fishEggMuscleFiber,
  fishEye,
  fishFinDual,
  fishGameteShape,
  fishInjuryPoint,
  fishInjuryShape,
  fishJawFiber,
  fishLateralPoint,
  fishNosePoint,
  fishNoseShape,
  fishPainShape,
  fishPigmentPoint,
  fishReservePoint,
  fishReserveShape,
  fishSatietyShape,
  fishGutPoint,
  fishGlandShape,
  fishSkinPoint,
  fishSuctionShape,
  fishSurfacePoint,
  fishSwimBladderShape,
  fishTonguePoint
} from './fish_organs.js';
import {displayNow, sceneState} from './state.js';
export const brain_geometryState = {};

export function fishCNSShape(a) {
  if (a.cnsShapeCache)
    return a.cnsShapeCache;
  const f = fishRegion(a, 0), volume = Math.sqrt(a.head / (a.head + 4)), back = a.headBack + .025,
        front = Math.min(a.headFront - .04, fishSuctionShape(a).back - .025),
        extent = Math.max(.025, front - back), rx = .48 * extent, cx = back + rx;
  let ry = Math.max(.008, a.shoulder * (.65 + .28 * volume));
  for (let k = 1; k < 30; k++) {
    const p = fishBezier(fishHeadCurve(a, 0), k / 30), u = (p[0] - cx) / rx;
    if (Math.abs(u) < .95)
      ry = Math.min(ry, Math.abs(p[1]) * .88 / Math.sqrt(1 - u * u));
  }
  return a.cnsShapeCache = {
    cx,
    rx,
    ry,
    neck : back - .025,
    tail : fishAlong(a, -.83),
    cord : Math.min(.30 * Math.min(a.chestWidth, a.hindWidth),
                    .06 * Math.sqrt(a.cord / Math.max(.1, back - fishAlong(a, -.83)))),
    fold : .6 + 2.2 * f.sy
  };
}

export function brainCNSPoint(n, t, a) {
  const q = fishCNSShape(a);
  if (t < .4) {
    const x = q.cx + q.rx * (.75 - 1.5 * t / .4),
          width = .82 * q.ry * Math.sqrt(Math.max(0, 1 - ((x - q.cx) / q.rx) ** 2));
    return [ x, width * n[0] ];
  }
  return [ q.neck - (q.neck - q.tail) * (t - .4) / .6, .82 * q.cord * n[0] ];
}

export function brainNervePositions(b, a) {
  const q = fishCNSShape(a), shape = [ q.cx, q.rx, q.ry, q.neck, q.tail, q.cord ].join(':');
  if (brainState.brainNerveCache?.layout === b.layout_id &&
      brainState.brainNerveCache.shape === shape)
    return brainState.brainNerveCache.positions;
  const internal = b.neurons.filter(n => n[4] && n[12] > 0),
        columns = Math.max(4, Math.min(16, Math.ceil(Math.sqrt(internal.length)))),
        lanes = new Map(), positions = new Map();
  for (const n of internal) {
    const head = n[1] >= .2,
          lane = Math.min(columns - 1, Math.floor(brainClamp((n[0] + 1) / 2) * columns)),
          key = (head ? 'h' : 'c') + lane;
    if (!lanes.has(key))
      lanes.set(key, []);
    lanes.get(key).push(n);
  }
  for (const [key, lane] of lanes) {
    lane.sort((a, b) => b[1] - a[1] || a[8] - b[8] || a[5] - b[5]);
    const column = Number(key.slice(1)), lateral = -1 + 2 * (column + .5) / columns;
    lane.forEach((n, i) => {
      const x = n[0] === 0
                    ? 0
                    : (n[0] < 0 ? -1 : 1) * Math.max(.06, Math.abs(.18 * lateral + .82 * n[0]));
      positions.set(n[5],
                    brainCNSPoint([ x ],
                                  key[0] === 'h' ? .4 * (.85 * brainClamp((1 - n[1]) / .8) +
                                                         .15 * (i + .5) / lane.length)
                                                 : .4 + .6 * (.85 * brainClamp((.2 - n[1]) / 1.2) +
                                                              .15 * (i + .5) / lane.length),
                                  a));
    });
  }
  updateBrainState({brainNerveCache : {layout : b.layout_id, shape, positions}});
  return positions;
}

export function brainBarbel(n) {
  return n[13]?.[1] > 0 && n[13]?.[3] > 0 && n[13].indexOf(Math.max(...n[13])) === 1;
}

export function brainProject(p, d = brainState.brainDrawing) {
  const c = Math.cos(d.angle), s = Math.sin(d.angle);
  return [ d.cx + d.r * (p[0] * c - p[1] * s), d.cy + d.r * (p[0] * s + p[1] * c) ];
}

export function brainLocal(p, d = brainState.brainDrawing) {
  const x = (p[0] - d.cx) / d.r, y = (p[1] - d.cy) / d.r, c = Math.cos(d.angle),
        s = Math.sin(d.angle);
  return [ x * c + y * s, -x * s + y * c ];
}

export function brainFinLocation(n, k, a) {
  const index = k === 0    ? 0
                : n[0] < 0 ? 1
                           : 2,
        dual = fishFinDual(a, index), lobe = dual > .025 && n[1] < 0 ? 1 : 0,
        depth = dual > .025 ? (lobe ? n[1] + 1 : n[1]) : (n[1] + 1) / 2;
  return {
    index,
    lobe,
    depth : brainClamp(depth),
    across : .15 + .7 * brainClamp(((k === 0 ? n[0] : n[8]) + 1) / 2)
  };
}

export function brainFiber(n, k, d) {
  const a = d.a, depth = brainClamp((n[1] + 1) / 2);
  if (k < 2) {
    const q = brainFinLocation(n, k, a), t = .30 + .45 * q.depth;
    return [
      fishFinPoint(a, q.index, t - .17, q.across, q.lobe),
      fishFinPoint(a, q.index, t + .17, q.across, q.lobe)
    ];
  }
  return fishJawFiber(a, n[0] < 0 ? 0 : 1, depth);
}

export function brainPartPosition(n, key, d, r, forcedSide = null) {
  const a = d.a, side = forcedSide ?? (n[0] < 0 ? 0 : 1), sign = side ? 1 : -1,
        depth = brainClamp((n[1] + 1) / 2), k = Number(key.slice(1));
  if (key === 'internal')
    return d.nerve.get(n[5]) || brainCNSPoint(n, depth, a);
  if (key[0] === 's') {
    if (k === 0) {
      const eye = fishEye(a, side), rho = .48 + .42 * brainClamp((n[8] + 1) / 2),
            theta = Math.PI + (r?.[2] || 0);
      return [ eye.x + Math.cos(theta) * rho * eye.rx, eye.y + Math.sin(theta) * rho * eye.ry ];
    }
    if (k === 1)
      return brainBarbel(n) ? fishBarbel(a, side, .12 + .76 * depth)
                            : fishNosePoint(a, side, Math.PI * (n[1] + 1), 180 * (n[8] + 1));
    if (k === 2)
      return fishLateralPoint(a, side, .15 + .70 * depth);
    if (k === 3)
      return fishSkinPoint(a, side, depth, n[8], key);
    if (k === 6)
      return fishInjuryPoint(a, side, depth, n[8]);
    if (k === 4)
      return fishReservePoint(a, .1 + .8 * depth, .48 * n[0]);
    if (k === 5)
      return fishTonguePoint(a, .1 + .8 * depth, .6 * n[0]);
    if (k === 8) {
      const weights = r?.[17] || [ 1, 0, 0 ], channel = weights.indexOf(Math.max(...weights));
      if (channel === 0)
        return fishGutPoint(a, .08 + .84 * depth, .55 * n[0]);
      const q = fishGameteShape(a, channel === 1 ? 3 : 4);
      return [ q.x + q.rx * .65 * n[1], q.y + q.ry * .5 * n[0] ];
    }
    if (k === 10) {
      const q = fishCNSShape(a);
      return [ q.cx + .45 * q.rx * n[1], (side ? 1 : -1) * .35 * q.ry + .2 * q.ry * n[8] ];
    }
    if (k === 9) {
      const q = fishPainShape(a, side);
      return [ q.x + q.rx * .65 * n[1], q.y + q.ry * .5 * n[8] ];
    }

    const q = fishBladderShape(a);
    return [ q.x + q.rx * .65 * n[1], q.y + q.ry * .5 * n[0] ];
  }
  if (k < 3) {
    const f = brainFiber(n, k, d);
    return [ (f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2 ];
  }
  if (k === 3 || k === 4) {
    const q = fishGameteShape(a, k);
    if (k === 3) {
      const f = fishEggMuscleFiber(a, .32 + .60 * depth, side);
      return [ (f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2 ];
    }
    return [ q.x + q.rx * .65 * n[0], q.y + q.ry * .6 * n[1] ];
  }
  if (k === 5)
    return fishCheekPoint(a, side, .10 + .8 * depth, .2 + .6 * brainClamp((n[8] + 1) / 2));
  if (k === 8) {
    const q = fishSwimBladderShape(a), fill = .55 + .45 * (d.b.bladder_fill || 0);
    return [ q.x + fill * q.rx * .65 * n[1], q.y + fill * q.ry * .5 * n[0] ];
  }
  if (k === 9) {
    const q = fishGlandShape(a);
    return [ q.x + q.rx * .85 * n[0], q.y + q.ry * .65 * n[1] ];
  }
  if (k === 6) {
    const pieces = fishDefenseSpines(a, side),
          piece = pieces[Math.min(pieces.length - 1, Math.floor((1 - depth) * pieces.length))];
    if (piece)
      return [
        (piece[0][0] + piece[1][0] + piece[2][0]) / 3, (piece[0][1] + piece[1][1] + piece[2][1]) / 3
      ];
  }
  return d.pigments.get(n[5]) || fishPigmentPoint(a, side, depth, n[8]);
}

export function brainOrganKey(key, n, receptor) {
  if (key === 's8') {
    const weights = receptor?.[17] || [ 1, 0, 0 ];
    return 's8:' + weights.indexOf(Math.max(...weights));
  }
  if (key === 's1' && brainBarbel(n))
    return 'barbel:' + (n[0] < 0 ? 0 : 1);
  const k = Number(key.slice(1)),
        paired = key[0] === 's' ? [ 0, 1, 2, 3, 6, 9 ].includes(k) : [ 1, 6 ].includes(k);
  return key + ':' + (paired ? (n[0] < 0 ? 0 : 1) : 0);
}

export function brainPigmentPositions(b, a) {
  const shape = [ a.bodyStretch, a.restShoulder ?? a.shoulder, ...a.flank ]
                    .map(v => Math.round(v * 20))
                    .join(':') +
                ':' + Math.ceil(a.filled * 8) + ':' + Math.ceil(a.spermFilled * 8),
        layout = b.layout_id + ':' + b.neurons.length + ':' + shape;
  if (brain_geometryState.brainPigmentCache?.layout !== layout) {
    const neutral = {
      ...a,
      filled : Math.ceil(a.filled * 8) / 8,
      spermFilled : Math.ceil(a.spermFilled * 8) / 8,
      reserve : 1,
      deflection : 0,
      flex : 0
    },
          neurons = b.neurons.filter(n => n[4] && n[14]?.[7] > 0).sort((a, b) => a[5] - b[5]),
          seeds = neurons.slice(0, 1),
          distance = (n, m) => (n[0] - m[0]) ** 2 + (n[1] - m[1]) ** 2 + (n[8] - m[8]) ** 2;
    while (seeds.length < Math.min(20, neurons.length)) {
      let best = null, score = -1;
      for (const n of neurons) {
        if (seeds.includes(n))
          continue;
        const gap = Math.min(...seeds.map(m => distance(n, m)));
        if (gap > score) {
          best = n;
          score = gap;
        }
      }
      seeds.push(best);
    }
    const groups = seeds.map(
        n => ({key : n[5], side : n[0] < 0 ? 0 : 1, ids : [], center : [ 0, 0, 0 ], weight : 0}));
    for (const n of neurons) {
      let best = seeds.indexOf(n), gap = Infinity;
      if (best < 0) {
        best = 0;
        for (let i = 0; i < seeds.length; i++) {
          const d = distance(n, seeds[i]);
          if (d < gap) {
            best = i;
            gap = d;
          }
        }
      }
      const group = groups[best], weight = Math.max(1e-9, n[14][7] * (n[11] ?? 1));
      group.ids.push(n[5]);
      group.weight += weight;
      for (let k = 0; k < 3; k++)
        group.center[k] += weight * n[[ 0, 1, 8 ][k]];
    }
    const memberships = new Map();
    for (const group of groups)
      for (const id of group.ids)
        memberships.set(id, group);
    const nerve = brainNervePositions(b, neutral);
    for (const e of b.edges || []) {
      for (const [id, other] of [[ e[0], e[1] ], [ e[1], e[0] ]]) {
        const group = memberships.get(id), root = nerve.get(other), weight = Math.abs(e[2]);
        if (group && root && weight > 0) {
          group.route ??= {x : 0, y : 0, weight : 0};
          group.route.x += root[0] * weight;
          group.route.y += root[1] * weight;
          group.route.weight += weight;
        }
      }
    }
    const placed = [], egg = fishGameteShape(neutral, 3), sperm = fishGameteShape(neutral, 4),
          reserve = fishReserveShape(neutral), bladder = fishBladderShape(neutral),
          cns = fishCNSShape(neutral), ellipses = [
            egg, sperm, {
              x : reserve.x + reserve.bend * .5,
              y : reserve.y,
              rx : reserve.ry + reserve.bend * .5,
              ry : reserve.rx
            },
            bladder, fishSwimBladderShape(neutral), fishSatietyShape(neutral),
            {x : cns.neck - .03, y : .06, rx : .045, ry : .035},
            {x : cns.cx, y : 0, rx : cns.rx, ry : cns.ry}
          ];
    for (let side = 0; side < 2; side++)
      ellipses.push(fishEye(neutral, side), fishNoseShape(neutral, side),
                    fishInjuryShape(neutral, side));
    const hash = (id, k) => {
      let x = Math.imul((id + 1) ^ Math.imul(k + 1, 0x9e3779b9), 0x85ebca6b);
      x ^= x >>> 13;
      return (x >>> 0) / 4294967296;
    };
    for (const group of groups) {
      group.center = group.center.map(v => v / group.weight);
      let best = null, score = -Infinity;
      for (let k = 0; k < 80; k++) {
        const t = .025 + .94 * hash(group.key, k * 2),
              layer = .28 + .64 * hash(group.key, k * 2 + 1), side = k % 2,
              p = fishSurfacePoint(neutral, side, t, layer);
        let clearance = .12;
        for (const q of ellipses) {
          const norm =
              Math.hypot((p[0] - q.x) / Math.max(.02, q.rx), (p[1] - q.y) / Math.max(.02, q.ry));
          clearance = Math.min(clearance, (norm - 1) * Math.min(q.rx, q.ry) - .045);
        }
        if (p[0] < cns.neck && p[0] > cns.tail)
          clearance = Math.min(clearance, Math.abs(p[1]) - cns.cord - .018);
        for (const q of placed)
          clearance = Math.min(clearance, Math.hypot(p[0] - q[0], p[1] - q[1]) - .035);
        const route = group.route,
              wire = route
                         ? Math.hypot(p[0] - route.x / route.weight, p[1] - route.y / route.weight)
                         : 0,
              quality = clearance - .008 * wire - .012 * Math.abs(t - (group.center[1] + 1) / 2) -
                        .006 * Math.abs(layer - (.40 + .40 * (group.center[2] + 1) / 2));
        if (quality > score) {
          score = quality;
          best = {t, layer, p, side};
        }
      }
      group.t = best.t;
      group.layer = best.layer;
      group.side = best.side;
      placed.push(best.p);
    }
    brain_geometryState.brainPigmentCache = {layout, groups};
  }
  const cells = new Map(b.neurons.map(n => [n[5], n])), positions = new Map();
  positions.groups = brain_geometryState.brainPigmentCache.groups.map(group => {
    const p = fishSurfacePoint(a, group.side, group.t, group.layer);
    for (const id of group.ids) {
      const n = cells.get(id),
            layer = brainClamp(group.layer + .06 * (n[8] - group.center[2]), .1, .95);
      let t = brainClamp(group.t + .025 * (n[1] - group.center[1]), .02, .98),
          point = fishSurfacePoint(a, group.side, t, layer);
      positions.set(id, point);
    }
    return {...group, p};
  });
  return positions;
}

export function brainPigmentState(group, d, now = displayNow()) {
  let weight = 0, value = 0, colorWeight = 0, color = [ 0, 0, 0 ];
  for (const id of group.ids) {
    const n = d.nodes.get(id);
    if (!n)
      continue;
    const w = (n[11] ?? 1) * n[14][7], active = brainMotorActivity(n, 7, d),
          key = d.p[4] + ':' + d.b.layout_id + ':' + id,
          stored = brain_geometryState.brainPigmentLevels.get(key),
          step = d.step ?? sceneState.frame?.step ?? 0,
          old = stored && stored.step <= step ? stored : null,
          decay = old ? Math.exp(-Math.max(0, step - old.step) / 60) : 0,
          level = old ? old.value * decay + active * (1 - decay) : active;
    if (!old || old.step !== step)
      brain_geometryState.brainPigmentLevels.set(key, {step, value : level});
    const hue = brainOrganRGB(n), ink = w * (.12 + .88 * level);
    weight += w;
    value += w * level;
    colorWeight += ink;
    for (let c = 0; c < 3; c++)
      color[c] += ink * hue[c];
  }
  if (brain_geometryState.brainPigmentLevels.size > 4096)
    brain_geometryState.brainPigmentLevels =
        new Map([...brain_geometryState.brainPigmentLevels ].filter(
            ([ key ]) => key.startsWith(d.p[4] + ':' + d.b.layout_id + ':')));
  return {
    value : value / Math.max(1e-9, weight),
    positive : 0,
    negative : 0,
    flash : 0,
    color : color.map(c => .10 + .9 * c / Math.max(1e-9, colorWeight))
  };
}

export function brainPigmentRadius(r, value = 0, count = 20) {
  const room = Math.min(2.2, Math.sqrt(20 / Math.max(1, count)));
  return Math.max(2.2, Math.min(25, r * .04 * (.30 + .70 * Math.sqrt(brainClamp(value))) * room));
}

export function brainPigmentStar(g, x, y, r) {
  const points = Array.from({length : 12}, (_, i) => {
    const t = i * Math.PI / 6, len = r * (i % 2 ? .72 : 1);
    return [ x + Math.cos(t) * len, y + Math.sin(t) * len ];
  }), mid = (a, b) => [(a[0] + b[0]) * .5, (a[1] + b[1]) * .5];
  g.moveTo(...mid(points[11], points[0]));
  for (let i = 0; i < 12; i++)
    g.quadraticCurveTo(...points[i], ...mid(points[i], points[(i + 1) % 12]));
  g.closePath();
}

// Geometry lives in a bounded local coordinate system. Camera motion only projects it.
export function brainCellDetail(p, c) {
  const radius = fishBodyRadius(p) * c.scale, start = brainState.brainView === 'organs' ? 170 : 125;
  return Math.max(0, Math.min(1, (radius - start) / 130));
}

const initializers = {
  "brainPigmentCache" : () => { brain_geometryState.brainPigmentCache = null; },
  "brainPigmentLevels" : () => { brain_geometryState.brainPigmentLevels = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
