import {FISH} from './schema.js';
import {fishAlong, fishForm} from './fish_forms.js';
import {sceneState} from './state.js';
export const fish_geometryState = {};
export function eggRadius(energy) {
  return Math.sqrt(Math.max(0, energy) /
                   (sceneState.frame?.egg_energy_per_radius2 || (300 / (4 * 4))));
}

export function fishEmbryo(p) {
  const q = p.slice();
  q[FISH.hatched] = 1;
  q[FISH.radius] = p[FISH.hatch_shape]?.[0] || p[FISH.radius];
  q[FISH.fin_pose] = [ 0, 0, 0 ];
  return q;
}

export let fishPlans;

export let fishPlanOrder;

export function fishMixPlan(name, phase) {
  const plans = fishPlans[name], n = plans.length, q = ((phase % n) + n) % n, i = Math.floor(q),
        f = q - i, u = f * f * (3 - 2 * f);
  return plans[i].map((v, k) => v + (plans[(i + 1) % n][k] - v) * u);
}

export function fishPlanPhase(a, name, f) {
  return a.shapePlans?.[name] ??
         fishPlans[name].length *
             (1.13 * f.z + .71 * f.y + .61 * f.sy + .39 * f.sz + .085 * Math.log2(1 + f.weight) +
              .137 * (4 + fishPlanOrder.indexOf(name)));
}

export function fishPlan(a, name, f) {
  const cache = a.planCache ??= new Map(),
        key = name + ':' + [ f.x, f.y, f.z, f.sy, f.sz, f.weight ].join(':');
  if (cache.has(key))
    return cache.get(key);
  const q = fishMixPlan(name, fishPlanPhase(a, name, f));
  cache.set(key, q);
  return q;
}

export function fishRegion(a, index, fallback = 'internal', side = -1) {
  const p = a.regions?.[index];
  return p?.length ? {x : p[0], y : p[1], z : p[2], sy : p[3], sz : p[4], weight : p[5]}
                   : fishForm(a, fallback, side);
}

export function fishShapeAnatomy(a) {
  Object.assign(a, a.bodyGeometry);
  const chest = a.chestPlan, torso = a.torsoPlan;
  a.eyeVolumes = [ 0, 1 ].map(side => fishForm(a, 's0', side).weight);
  a.headFront = a.headBack + a.headLength;
  // A wide physical gape needs a long enough jaw and cheek, including at rest.
  // The face ends at the same point used for feeding and the animated lips.
  if (Number.isFinite(a.mouthOffset))
    a.faceLength = Math.max(.001, (a.origin?.[0] || 0) + a.mouthOffset - a.headFront);
  a.faceWidth = Math.max(a.faceWidth, .50 * (a.aperture || 0));
  a.snout = a.headFront + a.faceLength;
  a.shoulder = a.restShoulder;
  a.eggRadius = a.yolk > 0 ? eggRadius(a.yolk) / a.radius : 0;
  a.eggOrganRadius = Math.max(a.eggRadius, .045 * Math.pow(1 + fishForm(a, 'm3').weight / 8, .26));
  a.hindLength = Math.max(a.baseHindLength, 2.16 * a.eggRadius);
  a.chestBack = a.headBack - a.chestLength;
  a.tailRoot = a.chestBack - a.hindLength;
  a.hindPeak = (.12 + .76 * torso[2]) * (1 - Math.min(1, 2.16 * a.eggRadius / a.hindLength)) +
               .5 * Math.min(1, 2.16 * a.eggRadius / a.hindLength);
  a.bodyStretch = (a.chestLength + a.hindLength) / 1.05;
  a.chestWidth = Math.max(a.trunk * chest[1], a.shoulder * (.95 + .15 * chest[2])) +
                 (.28 * Math.sqrt(a.reserve) +
                  .24 * Math.sqrt(a.gutFilling || 0) / (1 + .35 * (a.gutLength || 0)));
  a.hindWidth = Math.max((a.trunk + .05 * a.spermFilled) * torso[1] +
                             (.28 * Math.sqrt(a.reserve) +
                              .24 * Math.sqrt(a.gutFilling || 0) / (1 + .35 * (a.gutLength || 0))),
                         a.eggRadius * 1.08);
  a.joinWidth = .58 * a.chestWidth + .42 * a.hindWidth;
  a.flank = [
    Math.max(a.chestWidth, a.hindWidth) + .035 * a.left,
    Math.max(a.chestWidth, a.hindWidth) + .035 * a.right
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
      [ a.snout, sign * a.faceWidth * f[4] ],
      [ a.snout - f[3] * a.faceLength, sign * a.faceWidth * f[2] ],
      [ a.headFront + .25 * a.faceLength, sign * a.faceWidth ], cheek
    ],
    [
      cheek, [ a.headFront - a.headLength * h[2], sign * a.shoulder * h[3] ],
      [ a.headBack + a.headLength * .25, sign * a.shoulder * h[4] ], neck
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
        bridge = fishQuadraticCubic(top, [ fishAlong(a, -.96), a.flex ], bottom),
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

export function fishTissue(a, side, t) {
  const x = Math.max(0, Math.min(1, t)) * 7, i = Math.floor(x), f = x - i, p = a.contour || [];
  return (p[side * 8 + i] || 0) * (1 - f) + (p[side * 8 + Math.min(7, i + 1)] || 0) * f;
}

export function fishContourDetail(a, side) {
  return [ fishTissue(a, side, .60), fishTissue(a, side, .23) ].map(v => Math.round(255 * v) / 255);
}

export function fishFlankCurves(a, side) {
  const cache = a.flankCurveCache ??= [], old = cache[side],
        signature = [ a.flex, a.flank[side], a.shoulder, a.bodyStretch ].join(':');
  if (old?.signature === signature)
    return old.curves;
  const sign = side ? 1 : -1, detail = fishContourDetail(a, side), curves = [];
  const section =
      (front, back, fw, bw, width, plan, center = .12 + .76 * plan[2], roundness = 0) => {
        const peak = front - (front - back) * center, mid = [ peak, sign * width ],
              reach = (front - back) * .20;
        curves.push(
            [
              [ front, sign * fw ], [ front - reach * .65, sign * fw ],
              [ peak + Math.min(reach * plan[3], (front - peak) * .8), sign * width ], mid
            ],
            [
              mid, [ peak - Math.min(reach * plan[4], (peak - back) * .8), sign * width ],
              [ back + reach * .65, sign * bw ], [ back, sign * bw ]
            ]);
        if (roundness) {
          const first = curves.at(-2), last = curves.at(-1),
                mix = (p, q) => p.map((v, k) => v + (q[k] - v) * roundness);
          first[1] = mix(first[1], [ front, sign * (fw + .5523 * (width - fw)) ]);
          first[2] = mix(first[2], [ peak + .5523 * (front - peak), sign * width ]);
          last[1] = mix(last[1], [ peak - .5523 * (peak - back), sign * width ]);
          last[2] = mix(last[2], [ back, sign * (bw + .5523 * (width - bw)) ]);
        }
      };
  section(a.headBack, a.chestBack, a.neckWidth, a.joinWidth, a.chestWidth * (.97 + .06 * detail[0]),
          a.chestPlan);
  section(a.chestBack, a.tailRoot, a.joinWidth, .028 + .04 * a.size(a.fin(0)[1]),
          a.hindWidth * (.97 + .06 * detail[1]), a.torsoPlan, a.hindPeak,
          Math.min(1, 2.16 * a.eggRadius / a.hindLength));
  if (a.flex)
    for (const p of new Set(curves.flat()))
      p[1] += a.flex * (a.headBack - p[0]) / (a.headBack - a.tailRoot);
  cache[side] = {signature, curves};
  return curves;
}

export function fishFlank(a, side, t) {
  const q = fishFlankCurves(a, side), v = Math.max(0, Math.min(.999999, t)) * 4, k = Math.floor(v);
  return fishBezier(q[k], v - k);
}

export function fishHeadCurve(a, side) { return fishHeadCurves(a, side)[1]; }

const initializers = {
  "fishPlans" : () => {
    // Side-profile silhouettes turn in the 2D tank. Neural tissue and live state deform every plan.
    // Adjacent plans interpolate continuously; no animal ID enters shape or markings.
    fishPlans = {
      // length, depth, frontal control, frontal depth, occipital depth
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
      // span, depth, leading shape, sweep, trailing shape, second pair, attachment, base span
      side : [
        [ .95, 1.00, .85, .48, .85, 0, .20, .22, 0 ], [ 1.22, .88, .42, .85, .42, 0, .43, .24, 0 ],
        [ .88, 1.12, 1.20, .28, 1.10, 0, .68, .24, 0 ],
        [ 1.70, .72, .55, 1.10, .78, 0, .32, .25, 0 ],
        [ 1.05, 1.75, 1.05, .45, .28, 0, .52, .25, 1 ],
        [ 1.48, 1.10, .95, .72, 1.30, 0, .76, .30, 0 ],
        [ .88, 1.00, .85, .48, .85, 1, .28, .22, 0 ], [ 1.20, .88, .42, .85, .42, 1, .62, .24, 0 ]
      ],
      mouth : [
        [ .9, 1, .9, .5, 0 ], [ 1.5, .7, .9, .8, .10 ], [ .7, .8, 1.5, .15, -.12 ],
        [ .7, 2.0, .55, 1, 0 ], [ 1.2, .8, .8, .4, .22 ], [ 1.15, 1.2, 1.25, 1, -.05 ]
      ],
      spine : [
        [ 1.35, .15, .55, .08, .72, .15, .9 ], [ .85, .05, 1.8, 0, 1.65, .1, .6 ],
        [ 1.85, .24, 1.1, .12, .85, .6, .9 ], [ 1.20, .80, .65, .38, 1.15, .25, .85 ],
        [ .60, .25, 1.5, .18, 1.8, .05, .5 ], [ 1.65, .50, .45, -.12, .60, .5, 1 ]
      ],
      eye : [
        [ .28, .94, 1, 1, .64 ], [ .12, .98, 1.35, .78, .58 ], [ .68, .90, .78, 1.15, .66 ],
        [ .43, .67, 1.05, .95, .55 ], [ .24, 1.02, 1.4, 1.3, .70 ], [ .82, .85, .92, .84, .62 ]
      ],
      nose : [
        [ .48, .91, 1, .75 ], [ .78, .80, .65, 1.35 ], [ .20, .95, 1.5, .45 ],
        [ .60, .75, 1.3, .65 ], [ .32, .98, .65, 1.1 ], [ .87, .92, .95, .85 ]
      ],
      barbel : [
        [ 1, .35, .85, .48, .55 ], [ 1.65, .65, .60, .70, .50 ], [ .75, -.65, 1.20, .72, 1.1 ],
        [ 1.30, 1.05, .45, .25, .25 ], [ 1.65, -.80, .85, .82, .80 ], [ .60, .20, 1.30, .32, 1.20 ]
      ]
    };
  },
  "fishPlanOrder" : () => { fishPlanOrder = Object.keys(fishPlans); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
