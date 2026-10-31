import {FISH, ANATOMY} from './schema.js';
import {sceneState} from './state.js';
import {fishAnatomy, fishForm, fishPoseAnatomy} from './fish_forms.js';
import {
  eggRadius,
  fishBezier,
  fishBodyCurves,
  fishFlank,
  fishQuadraticCubic,
  fishRegion,
  fishTraceCurves
} from './fish_geometry.js';
import {fishFinDual, fishFinShape, fishGlyphPoints} from './fish_organs.js';
export const fish_finsState = {};

export function fishFinShapes(a, index) {
  return index && fishFinDual(a, index) > .025
             ? [ fishFinShape(a, index), fishFinShape(a, index, 1) ]
             : [ fishFinShape(a, index) ];
}

export function fishFinPoint(a, index, t, across, lobe = 0) {
  const f = fishFinShape(a, index, lobe),
        u = f.rimRange[0] + (f.rimRange[1] - f.rimRange[0]) * across,
        k = Math.min(7, Math.floor(u)), rim = fishBezier(f.curves[k], u - k),
        p = [ f.root[0] + t * (rim[0] - f.root[0]), f.root[1] + t * (rim[1] - f.root[1]) ];
  fishFinContain(f, p);
  return p;
}

// Mirror the familiar side-profile fin silhouette on both flanks of the 2D animal.
export function fishRearFinShape(a, side) {
  const cache = a.profileFins ??= [];
  if (cache[side])
    return cache[side];
  const phase = a.chestPhase,
        plans =
            [
              [ .08, .94, .36, .32, .72 ], [ .025, .96, .34, 1.10, .14 ],
              [ .32, .97, .60, .10, .90 ], [ .12, .96, .25, .62, .48 ],
              [ .32, .93, .61, .25, 1.10 ], [ .12, .91, .36, .48, .95 ]
            ],
        n = plans.length, q = ((phase % n) + n) % n, i = Math.floor(q),
        u = (q - i) ** 2 * (3 - 2 * (q - i)),
        p = plans[i].map((v, k) => v + (plans[(i + 1) % n][k] - v) * u), sign = side ? 1 : -1,
        start = fishFlank(a, side, p[0]), end = fishFlank(a, side, p[1]),
        peak = fishFlank(a, side, p[2]),
        height = Math.min(
            1.3 * (.20 + .36 * Math.pow(Math.max(0, .6 * a.fin(0)[0] + .4 * a.fin(0)[1]), .37)) *
                p[3],
            .325 * Math.max(a.chestWidth, a.hindWidth)),
        tip = [ peak[0] - .08 * a.hindLength, peak[1] + sign * height ];
  return cache[side] = [
    fishQuadraticCubic(
        start, [ start[0] - .08 * a.chestLength, tip[1] * p[4] + start[1] * (1 - p[4]) ], tip),
    fishQuadraticCubic(tip, [ end[0] - .10 * a.hindLength, tip[1] * .60 + end[1] * .40 ], end),
    fishQuadraticCubic(end, [ (end[0] + start[0]) / 2, (end[1] + start[1]) / 2 ], start)
  ];
}

// Triangulate a sampled membrane once; concave forks and scallops retain their cut-outs.
export function fishFinTriangles(shape, steps = 3) {
  const key = 'triangles' + steps;
  if (shape[key])
    return shape[key];
  const points = shape.curves.flatMap(
            q => Array.from({length : steps}, (_, k) => fishBezier(q, k / steps))),
        cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        area = points.reduce((s, p, i) => s + p[0] * points[(i + 1) % points.length][1] -
                                          p[1] * points[(i + 1) % points.length][0],
                             0),
        sign = area < 0 ? -1 : 1, ring = points.map((_, i) => i), triangles = [];
  while (ring.length > 2) {
    let ear = false;
    for (let k = 0; k < ring.length; k++) {
      const i = ring[(k + ring.length - 1) % ring.length], j = ring[k],
            l = ring[(k + 1) % ring.length], a = points[i], b = points[j], c = points[l],
            turn = sign * cross(a, b, c);
      if (Math.abs(turn) < 1e-11) {
        ring.splice(k, 1);
        ear = true;
        break;
      }
      if (turn < 0)
        continue;
      let occupied = false;
      for (const n of ring)
        if (n !== i && n !== j && n !== l) {
          const q = points[n];
          if (sign * cross(a, b, q) >= -1e-11 && sign * cross(b, c, q) >= -1e-11 &&
              sign * cross(c, a, q) >= -1e-11) {
            occupied = true;
            break;
          }
        }
      if (occupied)
        continue;
      triangles.push(i, j, l);
      ring.splice(k, 1);
      ear = true;
      break;
    }
    if (!ear)
      break;
  }
  const complete = ring.length <= 2;
  const count = (points.length - 2) * 3;
  while (triangles.length < count)
    triangles.push(0, 0, 0);
  return shape[key] = {points, indices : triangles.slice(0, count), complete};
}

function fishFinContain(shape, p) {
  if (!shape.outline)
    shape.outline =
        shape.curves.flatMap(q => Array.from({length : 25}, (_, k) => fishBezier(q, k / 24)));
  const poly = shape.outline, crossings = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] > p[1]) !== (b[1] > p[1]))
      crossings.push(a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  crossings.sort((a, b) => a - b);
  let best = p[0], distance = Infinity;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const lo = crossings[i], hi = crossings[i + 1], margin = Math.min(.003, (hi - lo) * .15),
          x = Math.max(lo + margin, Math.min(hi - margin, p[0]));
    if (Math.abs(x - p[0]) < distance) {
      best = x;
      distance = Math.abs(x - p[0]);
    }
  }
  p[0] = best;
  return p;
}

export function fishFinPath(g, r, a, index, append = false) {
  if (!append)
    g.beginPath();
  for (const f of fishFinShapes(a, index))
    fishTraceCurves(g, r, f.curves, true);
}

export function fishBodyPath(g, r, a, append = false) {
  fishTraceCurves(g, r, fishBodyCurves(a), append);
}

export let fishTemplateScales;

export function fishBodyRadius(p) { return p[FISH.radius] ?? 4; }

function fishTemplate(p) {
  const asset = p[FISH.forms] || p, layout = [
    p[FISH.organs], p[FISH.fins], p[FISH.contour], p[FISH.regions], p[FISH.body_geometry],
    p.shapePlans, sceneState.frame?.parameters?.vision_eye_offset ?? 2.4
  ];
  let entries = fishTemplateScales.get(asset);
  if (!entries) {
    entries = [];
    fishTemplateScales.set(asset, entries);
  }
  let entry = entries.find(e => layout.every((v, i) => v === e.layout[i]));
  if (!entry) {
    const q = p.slice();
    q.shapePlans = p.shapePlans;
    q[FISH.egg_yolk] = q[FISH.sperm_store] = 0;
    q[FISH.energy] = q[FISH.reserve_capacity] = 400;
    q[FISH.mouth_pose] = q[FISH.defense] = q[FISH.bite_pose] = q[FISH.suction_pose] = 0;
    q[FISH.fin_pose] = [ 0, 0, 0 ];
    // The template is one physical body-radius; world-space mouth measurements must match it.
    q[FISH.radius] = 1;
    q[FISH.mouth_aperture] = .28 + .44 * (q[FISH.organs]?.[ANATOMY.jaw_length] ?? .5);
    q[FISH.mouth_offset] = 0;
    const body = fishAnatomy(q, null, 1, 1, [ 0, 0 ]), origin = [ body.center, 0 ],
          extent = body.extent;
    body.eyeScale = extent;
    const maximum = fishPoseAnatomy(body, q);
    maximum.finPose = () => 1;
    maximum.defenseActivity = 1;
    maximum.origin = origin;
    entry = {
      layout,
      scale : 1 / extent,
      origin,
      reach : Math.max(1.4, 1.05 * fishHatchEnvelope(maximum) / extent)
    };
    entries.push(entry);
    if (entries.length > 8)
      entries.shift();
  }
  return entry;
}

export function fishShapeScale(p) { return fishTemplate(p).scale; }

export function fishShapeOrigin(p) { return fishTemplate(p).origin; }

function fishHatchEnvelope(a) {
  return Math.max(.1,
                  ...fishGlyphPoints(a).map(([ x, y ]) => Math.hypot(x - (a.origin?.[0] || 0),
                                                                     y - (a.origin?.[1] || 0))));
}

export function fishRenderRadius(p) {
  return p[FISH.hatched] ? fishBodyRadius(p) * fishShapeScale(p) : (p[FISH.radius] ?? 4);
}
export function fishBoundingRadius(p) {
  return p[FISH.hatched]
             ? fishBodyRadius(p) * fishTemplate(p).reach + 4 * eggRadius(p[FISH.egg_yolk] || 0) +
                   2 * eggRadius(p[FISH.sperm_store] || 0)
             : p[FISH.radius] ?? 4;
}

export function fishDisplayRadius(p, scale) { return fishRenderRadius(p) * scale; }

function fishHue(h) {
  const f = n => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [ f(5), f(3), f(1) ];
}

export function fishPattern(a) {
  if (a.pattern)
    return a.pattern;
  const pigment = fishForm(a, 'm7'), f = pigment.weight > 0 ? pigment : fishRegion(a, 0),
        fract = x => x - Math.floor(x),
        phase = fract(.79 * f.y + 1.63 * f.z + 1.17 * f.sy + .43 * f.sz),
        hue = fract(1.71 * f.z + .73 * f.y + .29 * f.x),
        accent = fishHue(fract(hue + .11 + .31 * f.sz)).map(v => .20 + .62 * v),
        base = fishHue(hue).map(v => .13 + .66 * v);
  return a.pattern = {
    kind : Math.min(5, Math.floor(phase * 6)),
    phase : fract(2.17 * f.x + .87 * f.z),
    count : 3 + Math.floor(4 * fract(f.y + 1.7 * f.sy)),
    amount : .48 + .24 * pigment.weight / (pigment.weight + 2),
    base,
    accent
  };
}

export function fishTint(p, a, injury = 1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1))) {
  const pattern = fishPattern(a), raw = p.slice(16, 19), level = .40 + .60 * Math.max(...raw);
  return raw.map((v, k) => (.55 * v + .45 * pattern.base[k] * level) * (1 - .42 * injury) +
                           [ .31, .23, .20 ][k] * .30 * injury);
}

const initializers = {
  "fishTemplateScales" : () => {
    // One world-space unit for bodies, organs, injury contours and picking.
    // The immutable trunk supplies proportions; simulation tissue supplies size. Fins stay
    // appendages.
    fishTemplateScales = new WeakMap();
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
