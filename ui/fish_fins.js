import {FINS} from './fin_stroke.js';
import {MOTOR_TISSUE} from './tissue.js';
import {ANATOMY, BODY_UNIT, EYE_PLACE, FIN, FISH, REGION_LAYOUT, TOLERANCE} from './schema.js';
import {sceneState} from './state.js';
import {fishAnatomy, fishForm, fishPoseAnatomy, mouthShare} from './fish_forms.js';
import {
  eggRadius,
  fishBezier,
  fishBodyCurves,
  fishFlank,
  fishPlanAt,
  fishQuadraticCubic,
  fishRegion,
  fishTraceCurves
} from './fish_geometry.js';
import {finVolume, fishFinDual, fishFinShape, fishGlyphPoints} from './fish_organs.js';
export const fish_finsState = {};

// A side fin shows its second lobe from FIN_LOBE_MIN of a second pair on.
export const FIN_LOBE_MIN = .025;
export function fishFinShapes(a, index) {
  return index && fishFinDual(a, index) > FIN_LOBE_MIN
             ? [ fishFinShape(a, index), fishFinShape(a, index, 1) ]
             : [ fishFinShape(a, index) ];
}

export function fishFinPoint(a, index, t, across, lobe = 0) {
  const f = fishFinShape(a, index, lobe),
        u = f.rimRange[0] + (f.rimRange[1] - f.rimRange[0]) * across,
        k = Math.min(f.curves.length - 1, Math.floor(u)), rim = fishBezier(f.curves[k], u - k),
        p = [ f.root[0] + t * (rim[0] - f.root[0]), f.root[1] + t * (rim[1] - f.root[1]) ];
  fishFinContain(f, p);
  return p;
}

// Rear fins grow like the tail fin, at most MAX_HEIGHT of the body width; their tip leans back.
const REAR_FIN = Object.freeze({
  scale : 1.3,
  height : .20,
  height_per_size : .36,
  max_height : .325,
  tip_back : .08,
  front_back : .08,
  trail_back : .10,
  trail_lift : .60
});
// Mirror the familiar side-profile fin silhouette on both flanks of the 2D animal.
export function fishRearFinShape(a, side) {
  const cache = a.profileFins ??= [];
  if (cache[side])
    return cache[side];
  const p = fishPlanAt('rear', a.chestPhase), sign = side ? 1 : -1,
        start = fishFlank(a, side, p.start), end = fishFlank(a, side, p.end),
        peak = fishFlank(a, side, p.peak),
        height = Math.min(
            REAR_FIN.scale * (REAR_FIN.height + REAR_FIN.height_per_size * finVolume(a, FIN.tail)) *
                p.height,
            REAR_FIN.max_height * Math.max(a.chestWidth, a.hindWidth)),
        tip = [ peak[0] - REAR_FIN.tip_back * a.hindLength, peak[1] + sign * height ];
  return cache[side] = [
    fishQuadraticCubic(
        start,
        [
          start[0] - REAR_FIN.front_back * a.chestLength, tip[1] * p.lift + start[1] * (1 - p.lift)
        ],
        tip),
    fishQuadraticCubic(tip,
                       [
                         end[0] - REAR_FIN.trail_back * a.hindLength,
                         tip[1] * REAR_FIN.trail_lift + end[1] * (1 - REAR_FIN.trail_lift)
                       ],
                       end),
    fishQuadraticCubic(end, [ (end[0] + start[0]) / 2, (end[1] + start[1]) / 2 ], start)
  ];
}

// Triangulate a sampled membrane once; concave forks and scallops retain their cut-outs.
// Fin membranes sample each curve in FIN_MESH_STEPS points.
const FIN_MESH_STEPS = 3;
export function fishFinTriangles(shape, steps = FIN_MESH_STEPS) {
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
      if (Math.abs(turn) < TOLERANCE.negligible) {
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
          if (sign * cross(a, b, q) >= -TOLERANCE.negligible &&
              sign * cross(b, c, q) >= -TOLERANCE.negligible &&
              sign * cross(c, a, q) >= -TOLERANCE.negligible) {
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

// Fin points stay MARGIN (at most MARGIN_SHARE of the span) inside an outline of STEPS points
// per curve.
const FIN_CONTAIN = Object.freeze({steps : 24, margin : .003, margin_share : .15});
function fishFinContain(shape, p) {
  if (!shape.outline)
    shape.outline =
        shape.curves.flatMap(q => Array.from({length : FIN_CONTAIN.steps + 1},
                                             (_, k) => fishBezier(q, k / FIN_CONTAIN.steps)));
  const poly = shape.outline, crossings = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] > p[1]) !== (b[1] > p[1]))
      crossings.push(a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  crossings.sort((a, b) => a - b);
  let best = p[0], distance = Infinity;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const lo = crossings[i], hi = crossings[i + 1],
          margin = Math.min(FIN_CONTAIN.margin, (hi - lo) * FIN_CONTAIN.margin_share),
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

export function fishBodyRadius(p) { return p[FISH.radius] ?? BODY_UNIT.radius; }

// A template reaches at least MIN_REACH body radii, REACH_MARGIN past its hatch envelope; each
// asset keeps LAYOUTS layouts.
const TEMPLATE = Object.freeze({min_reach : 1.4, reach_margin : 1.05, layouts : 8});
function fishTemplate(p) {
  const asset = p[FISH.forms] || p, layout = [
    p[FISH.organs], p[FISH.fins], p[FISH.contour], p[FISH.regions], p[FISH.body_geometry],
    p.shapePlans, sceneState.frame?.parameters?.vision_eye_offset ?? EYE_PLACE.default_offset
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
    q[FISH.energy] = q[FISH.reserve_capacity] = BODY_UNIT.adult_reserve;
    q[FISH.mouth_pose] = q[FISH.defense] = q[FISH.bite_pose] = q[FISH.suction_pose] = 0;
    q[FISH.fin_pose] = Array(FINS).fill(0);
    // The template is one physical body-radius; world-space mouth measurements must match it.
    q[FISH.radius] = 1;
    q[FISH.mouth_aperture] =
        mouthShare(q[FISH.organs]?.[ANATOMY.jaw_length] ?? BODY_UNIT.trait_middle);
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
      reach :
          Math.max(TEMPLATE.min_reach, TEMPLATE.reach_margin * fishHatchEnvelope(maximum) / extent)
    };
    entries.push(entry);
    if (entries.length > TEMPLATE.layouts)
      entries.shift();
  }
  return entry;
}

export function fishShapeScale(p) { return fishTemplate(p).scale; }

export function fishShapeOrigin(p) { return fishTemplate(p).origin; }

// The hatch envelope is at least MIN body radii.
const HATCH_ENVELOPE = Object.freeze({min : .1});
function fishHatchEnvelope(a) {
  return Math.max(HATCH_ENVELOPE.min,
                  ...fishGlyphPoints(a).map(([ x, y ]) => Math.hypot(x - (a.origin?.[0] || 0),
                                                                     y - (a.origin?.[1] || 0))));
}

export function fishRenderRadius(p) {
  return p[FISH.hatched] ? fishBodyRadius(p) * fishShapeScale(p)
                         : (p[FISH.radius] ?? BODY_UNIT.radius);
}
// Bounds include room for EGGS egg radii of yolk and SPERM of sperm.
const BOUNDS = Object.freeze({eggs : 4, sperm : 2});
export function fishBoundingRadius(p) {
  return p[FISH.hatched] ? fishBodyRadius(p) * fishTemplate(p).reach +
                               BOUNDS.eggs * eggRadius(p[FISH.egg_yolk] || 0) +
                               BOUNDS.sperm * eggRadius(p[FISH.sperm_store] || 0)
                         : p[FISH.radius] ?? BODY_UNIT.radius;
}

export function fishDisplayRadius(p, scale) { return fishRenderRadius(p) * scale; }

// A pure hue (0 to 1) as RGB, from the six colour-wheel sectors.
function fishHue(h) {
  const f = n => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [ f(5), f(3), f(1) ];
}

// Pigment patterns: stripes, a wavy line, spots, bars, a saddle or bands.
export const PATTERN_KIND =
    Object.freeze({stripes : 0, line : 1, spots : 2, bars : 3, saddle : 4, bands : 5});
const PATTERNS = Object.keys(PATTERN_KIND).length;
// The pattern follows the pigment cells' form: hashed kind, hue, stripe count and amount.
const PATTERN_HASH = Object.freeze({
  phase_y : .79,
  phase_z : 1.63,
  phase_sy : 1.17,
  phase_sz : .43,
  hue_z : 1.71,
  hue_y : .73,
  hue_x : .29,
  accent_shift : .11,
  accent_per_spread : .31,
  accent_min : .20,
  accent_span : .62,
  base_min : .13,
  base_span : .66,
  pattern_x : 2.17,
  pattern_z : .87,
  count : 3,
  count_span : 4,
  count_per_spread : 1.7,
  amount : .48,
  amount_span : .24,
  amount_half : 2
});
export function fishPattern(a) {
  if (a.pattern)
    return a.pattern;
  const pigment = fishForm(a, MOTOR_TISSUE.pigment),
        f = pigment.weight > 0 ? pigment : fishRegion(a, REGION_LAYOUT.head),
        fract = x => x - Math.floor(x),
        phase = fract(PATTERN_HASH.phase_y * f.y + PATTERN_HASH.phase_z * f.z +
                      PATTERN_HASH.phase_sy * f.sy + PATTERN_HASH.phase_sz * f.sz),
        hue = fract(PATTERN_HASH.hue_z * f.z + PATTERN_HASH.hue_y * f.y + PATTERN_HASH.hue_x * f.x),
        accent =
            fishHue(fract(hue + PATTERN_HASH.accent_shift + PATTERN_HASH.accent_per_spread * f.sz))
                .map(v => PATTERN_HASH.accent_min + PATTERN_HASH.accent_span * v),
        base = fishHue(hue).map(v => PATTERN_HASH.base_min + PATTERN_HASH.base_span * v);
  return a.pattern = {
    kind : Math.min(PATTERNS - 1, Math.floor(phase * PATTERNS)),
    phase : fract(PATTERN_HASH.pattern_x * f.x + PATTERN_HASH.pattern_z * f.z),
    count : PATTERN_HASH.count + Math.floor(PATTERN_HASH.count_span *
                                            fract(f.y + PATTERN_HASH.count_per_spread * f.sy)),
    amount : PATTERN_HASH.amount + PATTERN_HASH.amount_span * pigment.weight /
                                       (pigment.weight + PATTERN_HASH.amount_half),
    base,
    accent
  };
}

// Injured skin pales towards this colour.
const INJURY_TINT = Object.freeze([ .31, .23, .20 ]);
// Skin mixes OWN of the fish's colour with PATTERN of its pattern; injury fades and pales it.
const TINT = Object.freeze(
    {level : .40, level_span : .60, own : .55, pattern : .45, injury_fade : .42, injury : .30});
export function fishTint(p, a, injury = 1 - Math.max(0, Math.min(1, p[FISH.health] ?? 1))) {
  const pattern = fishPattern(a), raw = p.slice(FISH.red, FISH.blue + 1),
        level = TINT.level + TINT.level_span * Math.max(...raw);
  return raw.map((v, k) => (TINT.own * v + TINT.pattern * pattern.base[k] * level) *
                               (1 - TINT.injury_fade * injury) +
                           INJURY_TINT[k] * TINT.injury * injury);
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
