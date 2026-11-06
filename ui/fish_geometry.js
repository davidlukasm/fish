import {INTERNAL_TISSUE, MOTOR_TISSUE, SENSE_TISSUE} from './tissue.js';
import {
  BODY_PLAN,
  BODY_UNIT,
  BODY_SHAPE as S,
  CONTOUR,
  FIN,
  FIN_SHAPE,
  FISH,
  PLAN_ORDER,
  PLAN_POINT
} from './schema.js';
import {fishAlong, fishForm, formRecord, GAMETE_GROWTH, organGrowth} from './fish_forms.js';
export const fish_geometryState = {};
const EGG_ENERGY_PER_RADIUS2 = BODY_UNIT.reserve_energy_per_mass / BODY_UNIT.radius ** 2;
export function eggRadius(energy) {
  return Math.sqrt(Math.max(0, energy) / EGG_ENERGY_PER_RADIUS2);
}

export function fishEmbryo(p) {
  const q = p.slice();
  q[FISH.hatched] = 1;
  q[FISH.radius] = p[FISH.hatch_shape]?.[0] || p[FISH.radius];
  q[FISH.fin_pose] = [ 0, 0, 0 ];
  return q;
}

function fishMixPlan(name, phase) {
  const plans = FISH_PLANS[name], n = plans.length, q = ((phase % n) + n) % n, i = Math.floor(q),
        f = q - i, u = f * f * (3 - 2 * f);
  return plans[i].map((v, k) => v + (plans[(i + 1) % n][k] - v) * u);
}

export function fishPlanPhase(a, name, f) {
  return a.shapePlans?.[name] ??
         FISH_PLANS[name].length *
             (BODY_PLAN.phase_weights[0] * f.z + BODY_PLAN.phase_weights[1] * f.y +
              BODY_PLAN.phase_weights[2] * f.sy + BODY_PLAN.phase_weights[3] * f.sz +
              BODY_PLAN.phase_volume * Math.log2(1 + f.weight) +
              BODY_PLAN.phase_order * PLAN_ORDER[name]);
}

const PLAN_COLUMNS = Object.freeze({
  tail : [
    'length', 'width', 'lead_along', 'lead_out', 'lobe_along', 'lobe_out', 'tip_along', 'tip_out',
    'fork', 'lead_round', 'lobe_round', 'tip_round', 'fork_round', 'root_round'
  ],
  side : [ 'length', 'swing', 'leading', 'sweep', 'lobed', 'dual', 'attachment', 'base', 'fringe' ],
  mouth : [ 'lip', 'hook' ],
  spine : [ 'length', 'lean', 'base', 'curve', 'count', 'start', 'spread' ],
  nose : [ 'place', 'across', 'length', 'height' ],
  barbel : [ 'length', 'tip_along', 'tip_across', 'root', 'bend' ],
  rear : [ 'start', 'end', 'peak', 'height', 'lift' ]
});
export function fishPlan(a, name, f) {
  const cache = a.planCache ??= new Map(),
        key = name + ':' + [ f.x, f.y, f.z, f.sy, f.sz, f.weight ].join(':');
  if (cache.has(key))
    return cache.get(key);
  const plan = fishPlanAt(name, fishPlanPhase(a, name, f));
  cache.set(key, plan);
  return plan;
}
export function fishPlanAt(name, phase) {
  const q = fishMixPlan(name, phase);
  return Object.fromEntries(PLAN_COLUMNS[name].map((column, k) => [column, q[k]]));
}

export function fishRegion(a, index, fallback = INTERNAL_TISSUE, side = -1) {
  const p = a.regions?.[index];
  return p?.length ? formRecord(p) : fishForm(a, fallback, side);
}

const CIRCLE_HANDLE = 4 * (Math.SQRT2 - 1) / 3;
const EGG_ROOM = 2.16;
export const TAIL_END = .96;
const EGG_ORGAN_RADIUS = .045;
const SHAPE = Object.freeze({
  min_face : .001,
  gape_width : .50,
  egg_peak : .5,
  stretch : 1.05,
  gut_width : .24,
  gut_width_per_length : .35,
  sperm_width : .05,
  egg_hind_mass : .4,
  min_mass : .2,
  hind_fill : .7,
  fin_width : .035
});
export function fishShapeAnatomy(a) {
  Object.assign(a, a.bodyGeometry);
  const chest = a.chestPlan, torso = a.torsoPlan;
  a.eyeVolumes = [ 0, 1 ].map(side => fishForm(a, SENSE_TISSUE.light, side).weight);
  a.headFront = a.headBack + a.headLength;
  if (Number.isFinite(a.mouthOffset))
    a.faceLength = Math.max(SHAPE.min_face, (a.origin?.[0] || 0) + a.mouthOffset - a.headFront);
  a.faceWidth = Math.max(a.faceWidth, SHAPE.gape_width * (a.aperture || 0));
  a.snout = a.headFront + a.faceLength;
  a.shoulder = a.restShoulder;
  a.hindLength = a.baseHindLength;
  const yolkMass = (a.yolk || 0) / BODY_UNIT.reserve_energy_per_mass,
        hind = (a.trunk + SHAPE.sperm_width * a.spermFilled) * torso[1] +
               (S.reserve_width * Math.sqrt(a.reserve) +
                SHAPE.gut_width * Math.sqrt(a.gutFilling || 0) /
                    (1 + SHAPE.gut_width_per_length * (a.gutLength || 0)));
  a.eggSwell =
      yolkMass / (SHAPE.egg_hind_mass * Math.max(SHAPE.min_mass, (a.mass || 1) - yolkMass));
  a.hindWidth = hind * (1 + a.eggSwell);
  const eggArea = 2 * SHAPE.hind_fill * a.hindLength * hind * a.eggSwell;
  a.eggLength = Math.min(Math.sqrt(eggArea / Math.PI), a.hindLength / EGG_ROOM);
  a.eggWidth = a.eggLength > 0 ? eggArea / (Math.PI * a.eggLength) : 0;
  a.eggRoom = Math.min(1, EGG_ROOM * a.eggLength / a.hindLength);
  a.eggOrganRadius = EGG_ORGAN_RADIUS * organGrowth(fishForm(a, MOTOR_TISSUE.eggs), GAMETE_GROWTH);
  a.chestBack = a.headBack - a.chestLength;
  a.tailRoot = a.chestBack - a.hindLength;
  a.hindPeak = (S.peak_min + S.peak_span * torso[PLAN_POINT.peak]) * (1 - a.eggRoom) +
               SHAPE.egg_peak * a.eggRoom;
  a.bodyStretch = (a.chestLength + a.hindLength) / SHAPE.stretch;
  a.chestWidth =
      Math.max(a.trunk * chest[PLAN_POINT.width],
               a.shoulder * (S.shoulder_base + S.shoulder_plan * chest[PLAN_POINT.peak])) +
      (S.reserve_width * Math.sqrt(a.reserve) +
       SHAPE.gut_width * Math.sqrt(a.gutFilling || 0) /
           (1 + SHAPE.gut_width_per_length * (a.gutLength || 0)));
  a.joinWidth = S.join_chest * a.chestWidth + (1 - S.join_chest) * a.hindWidth;
  a.flank = [
    Math.max(a.chestWidth, a.hindWidth) + SHAPE.fin_width * a.left,
    Math.max(a.chestWidth, a.hindWidth) + SHAPE.fin_width * a.right
  ];
  a.face = a.snout - a.headBack;
  return a;
}

export function fishQuadraticCubic(a, b, c) {
  return [
    a, [ a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3 ],
    [ c[0] + 2 * (b[0] - c[0]) / 3, c[1] + 2 * (b[1] - c[1]) / 3 ], c
  ];
}

export function fishTraceCurves(g, r, curves, append = false) {
  if (!append)
    g.beginPath();
  g.moveTo(curves[0][0][0] * r, curves[0][0][1] * r);
  for (const q of curves)
    g.bezierCurveTo(q[1][0] * r, q[1][1] * r, q[2][0] * r, q[2][1] * r, q[3][0] * r, q[3][1] * r);
  g.closePath();
}

export function fishCurveReverse(q) { return [...q ].reverse(); }

export function fishHeadCurves(a, side) {
  const signature = [ a.shoulder, a.snout, a.headFront, a.faceWidth ].join(':');
  if (a.headCurvesSignature !== signature) {
    a.headCurvesSignature = signature;
    a.headCurvesCache = [];
  }
  const cache = a.headCurvesCache;
  if (cache[side])
    return cache[side];
  const sign = side ? 1 : -1, h = a.headPlan, f = a.facePlan,
        neck = [ a.headBack, sign * a.neckWidth ], cheek = [ a.headFront, sign * a.faceWidth ];
  return cache[side] = [
    [
      [ a.snout, sign * a.faceWidth * f[PLAN_POINT.snout_width] ],
      [
        a.snout - f[PLAN_POINT.face_handle] * a.faceLength,
        sign * a.faceWidth * f[PLAN_POINT.face_handle_width]
      ],
      [ a.headFront + S.face_handle * a.faceLength, sign * a.faceWidth ], cheek
    ],
    [
      cheek,
      [
        a.headFront - a.headLength * h[PLAN_POINT.head_handle],
        sign * a.shoulder * h[PLAN_POINT.head_front_lift]
      ],
      [
        a.headBack + a.headLength * S.skull_handle, sign * a.shoulder * h[PLAN_POINT.head_back_lift]
      ],
      neck
    ]
  ];
}

export function fishBodyCurves(a) {
  const signature =
      [ a.flex, a.bodyStretch, a.shoulder, a.snout, a.headFront, a.faceWidth, ...a.flank ].join(
          ':');
  if (a.bodyCurvesCache?.signature === signature)
    return a.bodyCurvesCache.curves;
  const upper = [...fishHeadCurves(a, 0), ...fishFlankCurves(a, 0) ],
        lower = [...fishHeadCurves(a, 1), ...fishFlankCurves(a, 1) ], top = upper.at(-1)[3],
        bottom = lower.at(-1)[3],
        bridge = fishQuadraticCubic(top, [ fishAlong(a, -TAIL_END), a.flex ], bottom),
        curves = [...upper, bridge, ...lower.reverse().map(fishCurveReverse) ];
  a.bodyCurvesCache = {signature, curves};
  return curves;
}

export function fishBezier(points, t) {
  const u = 1 - t;
  return [
    u * u * u * points[0][0] + 3 * u * u * t * points[1][0] + 3 * u * t * t * points[2][0] +
        t * t * t * points[3][0],
    u * u * u * points[0][1] + 3 * u * u * t * points[1][1] + 3 * u * t * t * points[2][1] +
        t * t * t * points[3][1]
  ];
}

function fishTissue(a, side, t) {
  const last = CONTOUR.bins - 1, x = Math.max(0, Math.min(1, t)) * last, i = Math.floor(x),
        f = x - i, p = a.contour || [];
  return (p[side * CONTOUR.bins + i] || 0) * (1 - f) +
         (p[side * CONTOUR.bins + Math.min(last, i + 1)] || 0) * f;
}

function fishContourDetail(a, side) {
  return [ fishTissue(a, side, S.detail_chest), fishTissue(a, side, S.detail_hind) ].map(
      v => Math.round(CONTOUR.levels * v) / CONTOUR.levels);
}

function fishFlankCurves(a, side) {
  const cache = a.flankCurveCache ??= [], old = cache[side],
        signature = [ a.flex, a.flank[side], a.shoulder, a.bodyStretch ].join(':');
  if (old?.signature === signature)
    return old.curves;
  const sign = side ? 1 : -1, detail = fishContourDetail(a, side), curves = [];
  const section = (front, back, fw, bw, width, plan,
                   center = S.peak_min + S.peak_span * plan[PLAN_POINT.peak], roundness = 0) => {
    const peak = front - (front - back) * center, mid = [ peak, sign * width ],
          reach = (front - back) * S.reach;
    curves.push(
        [
          [ front, sign * fw ], [ front - reach * S.handle, sign * fw ],
          [
            peak + Math.min(reach * plan[PLAN_POINT.front_reach], (front - peak) * S.limit),
            sign * width
          ],
          mid
        ],
        [
          mid,
          [
            peak - Math.min(reach * plan[PLAN_POINT.back_reach], (peak - back) * S.limit),
            sign * width
          ],
          [ back + reach * S.handle, sign * bw ], [ back, sign * bw ]
        ]);
    if (roundness) {
      const first = curves.at(-2), last = curves.at(-1),
            mix = (p, q) => p.map((v, k) => v + (q[k] - v) * roundness);
      first[1] = mix(first[1], [ front, sign * (fw + CIRCLE_HANDLE * (width - fw)) ]);
      first[2] = mix(first[2], [ peak + CIRCLE_HANDLE * (front - peak), sign * width ]);
      last[1] = mix(last[1], [ peak - CIRCLE_HANDLE * (peak - back), sign * width ]);
      last[2] = mix(last[2], [ back, sign * (bw + CIRCLE_HANDLE * (width - bw)) ]);
    }
  };
  section(a.headBack, a.chestBack, a.neckWidth, a.joinWidth,
          a.chestWidth * (S.detail_base + S.detail_gain * detail[0]), a.chestPlan);
  section(a.chestBack, a.tailRoot, a.joinWidth,
          S.tail_base + S.tail_fin * a.size(a.fin(FIN.tail)[FIN_SHAPE.strength]),
          a.hindWidth * (S.detail_base + S.detail_gain * detail[1]), a.torsoPlan, a.hindPeak,
          a.eggRoom);
  if (a.flex)
    for (const p of new Set(curves.flat())) {
      const u = Math.max(0, Math.min(1, (a.headBack - p[0]) / (a.headBack - a.tailRoot)));
      p[1] += a.flex * u * u;
    }
  cache[side] = {signature, curves};
  return curves;
}

export function fishFlank(a, side, t) {
  const q = fishFlankCurves(a, side), v = Math.max(0, Math.min(1, t)) * q.length,
        k = Math.min(q.length - 1, Math.floor(v));
  return fishBezier(q[k], v - k);
}

export function fishHeadCurve(a, side) { return fishHeadCurves(a, side)[1]; }

export const FISH_PLANS = Object.freeze({
  tail : [
    [ .92, 1.12, .70, .94, 1.00, .75, 1.13, .38, 1.15, .80, .85, .85, 1, .15 ],
    [ .84, 1.10, 1, 1, 1, .66, 1, .33, 1, .18, .9, .9, 1, .12 ],
    [ 1, 1.45, 1, 1, .98, .67, .94, .34, .90, .10, .65, .65, 1, .12 ],
    [ 1.12, 1.25, 1.10, 1, .78, .62, .46, .28, .28, .04, .80, .80, 1, .08 ],
    [ .90, 1.55, 1.08, 1, .58, .73, .25, .36, .18, .02, .95, .95, 1, .08 ],
    [ 1.15, .90, .75, .76, 1.02, .57, 1.18, .28, 1.22, .65, .80, .80, 1, .15 ],
    [ 1.45, 1.32, 1.16, 1, .66, .64, 1.24, .34, .90, .30, .42, .32, .40, .10 ],
    [ 1.26, 1.20, 1.30, 1, .62, .65, .86, .32, 1.15, .32, .42, .38, .42, .10 ]
  ],
  side : [
    [ .95, 1.00, .85, .48, .85, 0, .20, .22, 0 ], [ 1.22, .88, .42, .85, .42, 0, .43, .24, 0 ],
    [ .88, 1.12, 1.20, .28, 1.10, 0, .68, .24, 0 ], [ 1.70, .72, .55, 1.10, .78, 0, .32, .25, 0 ],
    [ 1.05, 1.75, 1.05, .45, .28, 0, .52, .25, 1 ], [ 1.48, 1.10, .95, .72, 1.30, 0, .76, .30, 0 ],
    [ .88, 1.00, .85, .48, .85, 1, .28, .22, 0 ], [ 1.20, .88, .42, .85, .42, 1, .62, .24, 0 ]
  ],
  mouth : [ [ .5, 0 ], [ .8, .10 ], [ .15, -.12 ], [ 1, 0 ], [ .4, .22 ], [ 1, -.05 ] ],
  spine : [
    [ 1.35, .15, .55, .08, .72, .15, .9 ], [ .85, .05, 1.8, 0, 1.65, .1, .6 ],
    [ 1.85, .24, 1.1, .12, .85, .6, .9 ], [ 1.20, .80, .65, .38, 1.15, .25, .85 ],
    [ .60, .25, 1.5, .18, 1.8, .05, .5 ], [ 1.65, .50, .45, -.12, .60, .5, 1 ]
  ],
  nose : [
    [ .48, .91, 1, .75 ], [ .78, .80, .65, 1.35 ], [ .20, .95, 1.5, .45 ], [ .60, .75, 1.3, .65 ],
    [ .32, .98, .65, 1.1 ], [ .87, .92, .95, .85 ]
  ],
  barbel : [
    [ 1, .35, .85, .48, .55 ], [ 1.65, .65, .60, .70, .50 ], [ .75, -.65, 1.20, .72, 1.1 ],
    [ 1.30, 1.05, .45, .25, .25 ], [ 1.65, -.80, .85, .82, .80 ], [ .60, .20, 1.30, .32, 1.20 ]
  ],
  rear : [
    [ .08, .94, .36, .32, .72 ], [ .025, .96, .34, 1.10, .14 ], [ .32, .97, .60, .10, .90 ],
    [ .12, .96, .25, .62, .48 ], [ .32, .93, .61, .25, 1.10 ], [ .12, .91, .36, .48, .95 ]
  ]
});
