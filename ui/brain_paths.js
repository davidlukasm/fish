import {brainClamp} from './brain.js';
import {brainFinLocation, brainLocal, brainProject} from './brain_geometry.js';
import {fishFinPoint} from './fish_fins.js';
import {fishAlong} from './fish_forms.js';
import {
  fishBarbelCurve,
  fishCheekPoint,
  fishDefenseSpines,
  fishEggDuctPoint,
  fishEye,
  fishNoseShape,
  fishTonguePoint
} from './fish_organs.js';
export const brain_pathsState = {};

export function brainLine(a, b) {
  return [
    ...a, a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3, a[0] + 2 * (b[0] - a[0]) / 3,
    a[1] + 2 * (b[1] - a[1]) / 3, ...b
  ];
}

export function brainReverseCurve(q) {
  const out = q.slice(-2);
  for (let i = q.length - 8; i >= 0; i -= 6)
    out.push(q[i + 4], q[i + 5], q[i + 2], q[i + 3], q[i], q[i + 1]);
  return out;
}

export function brainDrawCurve(g, q) {
  g.moveTo(q[0], q[1]);
  for (let i = 2; i + 5 < q.length; i += 6)
    g.bezierCurveTo(q[i], q[i + 1], q[i + 2], q[i + 3], q[i + 4], q[i + 5]);
}

export function brainOrganBranch(d, part) {
  if (part.branch)
    return part.branch;
  const n = d.nodes.get(part.neuron), a = d.a, side = part.side ?? (n[0] < 0 ? 0 : 1),
        sign = side ? 1 : -1, depth = brainClamp((n[1] + 1) / 2),
        detail = Math.min(1, d.cellDetail / .45), center = d.tissues.get(part.tissue).center,
        start = brainLocal(center.map((v, i) => v + (part.screen[i] - v) * detail), d);
  let root = start, curve = start.slice();
  if (part.key === 'm0' || part.key === 'm1') {
    const q = brainFinLocation(n, part.key === 'm0' ? 0 : 1, a), t = .18 + .62 * q.depth;
    root = fishFinPoint(a, q.index, 0, q.across, q.lobe);
    curve = [
      ...start, ...fishFinPoint(a, q.index, t * .67, q.across, q.lobe),
      ...fishFinPoint(a, q.index, t * .27, q.across, q.lobe), ...root
    ];
  } else if (part.tissue.startsWith('barbel:')) {
    const t = .12 + .76 * depth, [ p, control, end ] = fishBarbelCurve(a, side),
          c1 = start.map((v, i) =>
                             v - 2 * t / 3 *
                                     ((1 - t) * (control[i] - p[i]) + t * (end[i] - control[i]))),
          c2 = p.map((v, i) => v + 2 * t / 3 * (control[i] - v));
    root = p;
    curve = [...start, ...c1, ...c2, ...root ];
  } else if (part.key === 's1') {
    const q = fishNoseShape(a, side);
    root = [ q.x - q.rx * .8, q.y ];
    curve = brainLine(start, root);
  } else if (part.key === 'm3') {
    root = fishEggDuctPoint(a, .94);
    curve = brainLine(start, root);
  } else if (part.key === 's5') {
    root = fishTonguePoint(a, 0);
    curve = brainLine(start, root);
  } else if (part.key === 's0') {
    const eye = fishEye(a, side);
    root = [ eye.x - .07, eye.y * .65 ];
    curve = brainLine(start, root);
  } else if (part.key === 'm5') {
    root = fishCheekPoint(a, side, .1, 0);
    curve = brainLine(start, root);
  } else if (part.key === 'm6') {
    const pieces = fishDefenseSpines(a, side),
          p = pieces[Math.min(pieces.length - 1, Math.floor((1 - depth) * pieces.length))];
    if (p) {
      root = [ (p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2 ];
      curve = brainLine(start, root);
    }
  }
  const entry = [ brainClamp(root[0] + .06, fishAlong(a, -.66), .40), sign * .022 ],
        direction = entry[0] >= root[0] ? 1 : -1;
  curve.push(root[0] + .2 * (entry[0] - root[0]), (root[1] + entry[1]) * .5,
             entry[0] - .05 * direction, entry[1], ...entry);
  part.branch = [];
  for (let i = 0; i < curve.length; i += 2)
    part.branch.push(...brainProject([ curve[i], curve[i + 1] ], d));
  return part.branch;
}

export function brainConnection(d, a, b, self = false) {
  const from = brainOrganBranch(d, a), to = brainOrganBranch(d, b), p = from.slice(-2),
        q = to.slice(-2), middle = brainLine(p, q);
  if (self) {
    const left = brainProject([ brainClamp(brainLocal(p, d)[0] - .035, -.68, .45), -.018 ], d),
          right = brainProject([ brainClamp(brainLocal(p, d)[0] + .035, -.68, .45), .018 ], d);
    middle.splice(2, 4, ...left, ...right);
  }
  const curve = [...from, ...middle.slice(2), ...brainReverseCurve(to).slice(2) ];
  curve.lengths = [];
  curve.total = 0;
  for (let i = 0; i + 7 < curve.length; i += 6) {
    const chord = Math.hypot(curve[i + 6] - curve[i], curve[i + 7] - curve[i + 1]),
          poly = Math.hypot(curve[i + 2] - curve[i], curve[i + 3] - curve[i + 1]) +
                 Math.hypot(curve[i + 4] - curve[i + 2], curve[i + 5] - curve[i + 3]) +
                 Math.hypot(curve[i + 6] - curve[i + 4], curve[i + 7] - curve[i + 5]);
    curve.total += Math.max(.001, (chord + poly) / 2);
    curve.lengths.push(curve.total);
  }
  return curve;
}

export function brainCurvePoint(q, t) {
  const count = (q.length - 2) / 6;
  let segment = 0;
  if (q.total) {
    const distance = brainClamp(t) * q.total;
    while (segment < count - 1 && distance > q.lengths[segment])
      segment++;
    const before = segment ? q.lengths[segment - 1] : 0;
    t = (distance - before) / (q.lengths[segment] - before);
  } else {
    t = brainClamp(t) * count;
    segment = Math.min(count - 1, Math.floor(t));
    t -= segment;
  }
  const i = segment * 6, u = 1 - t;
  return [
    u * u * u * q[i] + 3 * u * u * t * q[i + 2] + 3 * u * t * t * q[i + 4] + t * t * t * q[i + 6],
    u * u * u * q[i + 1] + 3 * u * u * t * q[i + 3] + 3 * u * t * t * q[i + 5] +
        t * t * t * q[i + 7]
  ];
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
