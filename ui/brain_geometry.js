import {UINT32_RANGE} from './units.js';
import {
  BARBEL,
  INTERNAL_TISSUE,
  isSenseTissue,
  SENSE_TISSUE,
  sidedTissue,
  tissueKind
} from './tissue.js';
import {brainClamp, brainState} from './brain.js';
import {
  AXIS,
  brainOrganRGB,
  CELL_AXES,
  cellSide,
  PAIRED_MOTORS,
  PAIRED_SENSES
} from './brain_model.js';
import {brainMotorActivity} from './brain_signals.js';
import {FIN_LOBE_MIN, fishBodyRadius, fishFinPoint} from './fish_fins.js';
import {fishAlong} from './fish_forms.js';
import {fishBezier, fishHeadCurve, fishRegion} from './fish_geometry.js';
import {
  fishBladderShape,
  fishCheekPoint,
  fishDefenseSpines,
  fishEggMuscleFiber,
  fishEye,
  fishFinDual,
  fishGameteShape,
  fishInjuryShape,
  fishJawFiber,
  fishNoseShape,
  fishPigmentPoint,
  fishProximityPits,
  fishReserveShape,
  fishSatietyShape,
  fishGlandShape,
  fishSuctionShape,
  fishSurfacePoint,
  fishSwimBladderShape
} from './fish_organs.js';
import {displayNow, sceneState} from './state.js';
import {
  FIN,
  FISH,
  MOTOR_KIND,
  NEURON,
  NEURON_SITE,
  PRESSURE_SOURCE,
  RECEPTOR,
  REGION_LAYOUT,
  SENSE_KIND,
  SYNAPSE,
  TOLERANCE
} from './schema.js';
export const brain_geometryState = {};

const CNS = Object.freeze({
  head_half : 4,
  back : .025,
  front_gap : .04,
  mouth_gap : .025,
  min_extent : .025,
  length : .48,
  min_height : .008,
  height : .65,
  height_per_volume : .28,
  samples : 30,
  edge : .95,
  inset : .88,
  neck : .025,
  cord_end : .83,
  max_cord : .30,
  cord : .06,
  min_cord_length : .1,
  fold : .6,
  fold_per_spread : 2.2
});
export function fishCNSShape(a) {
  if (a.cnsShapeCache)
    return a.cnsShapeCache;
  const f = fishRegion(a, REGION_LAYOUT.head),
        volume = Math.sqrt(a.head / (a.head + CNS.head_half)), back = a.headBack + CNS.back,
        front = Math.min(a.headFront - CNS.front_gap, fishSuctionShape(a).back - CNS.mouth_gap),
        extent = Math.max(CNS.min_extent, front - back), rx = CNS.length * extent, cx = back + rx;
  let ry = Math.max(CNS.min_height, a.shoulder * (CNS.height + CNS.height_per_volume * volume));
  for (let k = 1; k < CNS.samples; k++) {
    const p = fishBezier(fishHeadCurve(a, 0), k / CNS.samples), u = (p[0] - cx) / rx;
    if (Math.abs(u) < CNS.edge)
      ry = Math.min(ry, Math.abs(p[1]) * CNS.inset / Math.sqrt(1 - u * u));
  }
  return a.cnsShapeCache = {
    cx,
    rx,
    ry,
    neck : back - CNS.neck,
    tail : fishAlong(a, -CNS.cord_end),
    cord : Math.min(CNS.max_cord * Math.min(a.chestWidth, a.hindWidth),
                    CNS.cord * Math.sqrt(a.cord / Math.max(CNS.min_cord_length,
                                                           back - fishAlong(a, -CNS.cord_end)))),
    fold : CNS.fold + CNS.fold_per_spread * f.sy
  };
}

const CNS_POINT =
    Object.freeze({brain_share : .4, front : .75, span : 1.5, width : .82, cord_share : .6});
export function brainCNSPoint(n, t, a) {
  const q = fishCNSShape(a);
  if (t < CNS_POINT.brain_share) {
    const x = q.cx + q.rx * (CNS_POINT.front - CNS_POINT.span * t / CNS_POINT.brain_share),
          width = CNS_POINT.width * q.ry * Math.sqrt(Math.max(0, 1 - ((x - q.cx) / q.rx) ** 2));
    return [ x, width * n[NEURON.x] ];
  }
  return [
    q.neck - (q.neck - q.tail) * (t - CNS_POINT.brain_share) / CNS_POINT.cord_share,
    CNS_POINT.width * q.cord * n[NEURON.x]
  ];
}

export function brainNervePositions(b, a) {
  const g = a.bodyGeometry, positions = new Map();
  for (const n of b.neurons)
    if (n[NEURON.internal] > 0)
      positions.set(n[NEURON.index], [ g.center + g.extent * n[NEURON.y], g.extent * n[NEURON.x] ]);
  return positions;
}

function brainBarbel(n) {
  return n[NEURON.senses]?.[SENSE_KIND.odor] > 0 && n[NEURON.senses]?.[SENSE_KIND.touch] > 0 &&
         n[NEURON.senses].indexOf(Math.max(...n[NEURON.senses])) === SENSE_KIND.odor;
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

const FIN_LOCATION = Object.freeze({across : .15, across_span : .7});
export function brainFinLocation(n, k, a) {
  const index = k === MOTOR_KIND.forward ? FIN.tail : FIN.left + cellSide(n),
        dual = fishFinDual(a, index), lobe = dual > FIN_LOBE_MIN && n[NEURON.y] < 0 ? 1 : 0,
        depth =
            dual > FIN_LOBE_MIN ? (lobe ? n[NEURON.y] + 1 : n[NEURON.y]) : (n[NEURON.y] + 1) / 2;
  return {
    index,
    lobe,
    depth : brainClamp(depth),
    across : FIN_LOCATION.across +
                 FIN_LOCATION.across_span *
                     brainClamp(((k === MOTOR_KIND.forward ? n[NEURON.x] : n[NEURON.z]) + 1) / 2)
  };
}

const FIN_FIBER = Object.freeze({start : .30, span : .45, half : .17});
export function brainFiber(n, k, d) {
  const a = d.a, depth = brainClamp((n[NEURON.y] + 1) / 2);
  if (k <= MOTOR_KIND.turn) {
    const q = brainFinLocation(n, k, a), t = FIN_FIBER.start + FIN_FIBER.span * q.depth;
    return [
      fishFinPoint(a, q.index, t - FIN_FIBER.half, q.across, q.lobe),
      fishFinPoint(a, q.index, t + FIN_FIBER.half, q.across, q.lobe)
    ];
  }
  return fishJawFiber(a, cellSide(n), depth);
}

const PART = Object.freeze({
  eye_ring : .5,
  eye_ring_span : .35,
  pit_spread : .5,
  duct_start : .32,
  duct_span : .60,
  sperm_x : .65,
  sperm_y : .6,
  cheek_start : .10,
  cheek_span : .8,
  cheek_across : .2,
  cheek_across_span : .6,
  bladder_fill : .55,
  bladder_fill_per_gas : .45,
  bladder_x : .65,
  bladder_y : .5,
  gland_x : .85,
  gland_y : .65
});
export function brainPartPosition(n, key, d, r, forcedSide = null) {
  const a = d.a, side = forcedSide ?? (cellSide(n)), depth = brainClamp((n[NEURON.y] + 1) / 2),
        k = tissueKind(key);
  if (key === INTERNAL_TISSUE)
    return d.nerve.get(n[NEURON.index]) || brainCNSPoint(n, depth, a);
  const M = MOTOR_KIND;
  if (isSenseTissue(key)) {
    const pits = k === SENSE_KIND.proximity ? fishProximityPits(a, side) : [];
    if (pits.length) {
      const pit = pits[n[NEURON.index] % pits.length], site = n[NEURON.site] || [],
            angle = 2 * Math.PI * (site[NEURON_SITE.v] || 0),
            rho = PART.pit_spread * pit.r * (site[NEURON_SITE.w] || 0);
      return [ pit.x + Math.cos(angle) * rho, pit.y + Math.sin(angle) * rho ];
    }
    if (k === SENSE_KIND.light) {
      const eye = fishEye(a, side), theta = Math.PI + (r?.[RECEPTOR.angle] || 0),
            rho = PART.eye_ring + PART.eye_ring_span * (n[NEURON.site]?.[NEURON_SITE.v] || 0);
      return [ eye.x + Math.cos(theta) * rho * eye.rx, eye.y + Math.sin(theta) * rho * eye.ry ];
    }
    const g = a.bodyGeometry;
    return [ g.center + g.extent * n[NEURON.y], g.extent * n[NEURON.x] ];
  }
  if (k <= M.suction) {
    const f = brainFiber(n, k, d);
    return [ (f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2 ];
  }
  if (k === M.eggs || k === M.sperm) {
    const q = fishGameteShape(a, k);
    if (k === M.eggs) {
      const f = fishEggMuscleFiber(a, PART.duct_start + PART.duct_span * depth, side);
      return [ (f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2 ];
    }
    return [ q.x + q.rx * PART.sperm_x * n[NEURON.x], q.y + q.ry * PART.sperm_y * n[NEURON.y] ];
  }
  if (k === M.aggression)
    return fishCheekPoint(a, side, PART.cheek_start + PART.cheek_span * depth,
                          PART.cheek_across +
                              PART.cheek_across_span * brainClamp((n[NEURON.z] + 1) / 2));
  if (k === M.bladder) {
    const q = fishSwimBladderShape(a),
          fill = PART.bladder_fill + PART.bladder_fill_per_gas * (d.b.bladder_fill || 0);
    return [
      q.x + fill * q.rx * PART.bladder_x * n[NEURON.y],
      q.y + fill * q.ry * PART.bladder_y * n[NEURON.x]
    ];
  }
  if (k === M.gland) {
    const q = fishGlandShape(a);
    return [ q.x + q.rx * PART.gland_x * n[NEURON.x], q.y + q.ry * PART.gland_y * n[NEURON.y] ];
  }
  if (k === M.defense) {
    const pieces = fishDefenseSpines(a, side),
          piece = pieces[Math.min(pieces.length - 1, Math.floor((1 - depth) * pieces.length))];
    if (piece)
      return [
        (piece[0][0] + piece[1][0] + piece[2][0]) / 3, (piece[0][1] + piece[1][1] + piece[2][1]) / 3
      ];
  }
  return d.pigments.get(n[NEURON.index]) || fishPigmentPoint(a, side, depth, n[NEURON.z]);
}

export function brainOrganKey(key, n, receptor) {
  if (key === SENSE_TISSUE.gonad_pressure)
    return sidedTissue(SENSE_TISSUE.gonad_pressure,
                       receptor?.[RECEPTOR.pressure_kind] === PRESSURE_SOURCE.sperm
                           ? PRESSURE_SOURCE.sperm
                           : PRESSURE_SOURCE.eggs);
  if (key === SENSE_TISSUE.odor && brainBarbel(n))
    return sidedTissue(BARBEL, cellSide(n));
  const k = tissueKind(key),
        paired = isSenseTissue(key) ? PAIRED_SENSES.includes(k) : PAIRED_MOTORS.includes(k);
  return sidedTissue(key, paired ? cellSide(n) : 0);
}

const PIGMENT_PLACE = Object.freeze({
  shape_bins : 20,
  fill_bins : 8,
  groups : 20,
  gill_x : .03,
  gill_y : .06,
  gill_rx : .045,
  gill_ry : .035,
  candidates : 80,
  start : .025,
  span : .94,
  layer : .28,
  layer_span : .64,
  clearance : .12,
  min_radius : .02,
  margin : .045,
  cord_margin : .018,
  spacing : .035,
  wire : .008,
  place : .012,
  depth : .006,
  depth_layer : .40,
  depth_layer_span : .40,
  spread_depth : .06,
  min_layer : .1,
  max_layer : .95,
  spread_along : .025,
  first : .02,
  last : .98
});
const PIGMENT_HASH = Object.freeze({a : 0x9e3779b9, b : 0x85ebca6b, shift : 13});
export function brainPigmentPositions(b, a) {
  const shape = [ a.bodyStretch, a.restShoulder ?? a.shoulder, ...a.flank ]
                    .map(v => Math.round(v * PIGMENT_PLACE.shape_bins))
                    .join(':') +
                ':' + Math.ceil(a.filled * PIGMENT_PLACE.fill_bins) + ':' +
                Math.ceil(a.spermFilled * PIGMENT_PLACE.fill_bins),
        layout = b.layout_id + ':' + b.neurons.length + ':' + shape;
  if (brain_geometryState.brainPigmentCache?.layout !== layout) {
    const neutral = {
      ...a,
      filled : Math.ceil(a.filled * PIGMENT_PLACE.fill_bins) / PIGMENT_PLACE.fill_bins,
      spermFilled : Math.ceil(a.spermFilled * PIGMENT_PLACE.fill_bins) / PIGMENT_PLACE.fill_bins,
      reserve : 1,
      deflection : 0,
      flex : 0
    },
          neurons =
              b.neurons
                  .filter(n => n[NEURON.functional] && n[NEURON.motors]?.[MOTOR_KIND.pigment] > 0)
                  .sort((a, b) => a[NEURON.index] - b[NEURON.index]),
          seeds = neurons.slice(0, 1),
          distance = (n, m) => (n[NEURON.x] - m[0]) ** 2 + (n[NEURON.y] - m[1]) ** 2 +
                               (n[NEURON.z] - m[NEURON.z]) ** 2;
    while (seeds.length < Math.min(PIGMENT_PLACE.groups, neurons.length)) {
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
    const groups = seeds.map(n => ({
                               key : n[NEURON.index],
                               side : cellSide(n),
                               ids : [],
                               center : CELL_AXES.map(() => 0),
                               weight : 0
                             }));
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
      const group = groups[best],
            weight = Math.max(TOLERANCE.negligible,
                              n[NEURON.motors][MOTOR_KIND.pigment] * (n[NEURON.strength] ?? 1));
      group.ids.push(n[NEURON.index]);
      group.weight += weight;
      for (let k = 0; k < CELL_AXES.length; k++)
        group.center[k] += weight * n[CELL_AXES[k]];
    }
    const memberships = new Map();
    for (const group of groups)
      for (const id of group.ids)
        memberships.set(id, group);
    const nerve = brainNervePositions(b, neutral);
    for (const e of b.edges || []) {
      for (const [id, other] of [[ e[SYNAPSE.source], e[SYNAPSE.target] ],
                                 [ e[SYNAPSE.target], e[SYNAPSE.source] ]]) {
        const group = memberships.get(id), root = nerve.get(other),
              weight = Math.abs(e[SYNAPSE.strength]);
        if (group && root && weight > 0) {
          group.route ??= {x : 0, y : 0, weight : 0};
          group.route.x += root[0] * weight;
          group.route.y += root[1] * weight;
          group.route.weight += weight;
        }
      }
    }
    const placed = [], egg = fishGameteShape(neutral, MOTOR_KIND.eggs),
          sperm = fishGameteShape(neutral, MOTOR_KIND.sperm), reserve = fishReserveShape(neutral),
          bladder = fishBladderShape(neutral), cns = fishCNSShape(neutral), ellipses = [
            egg, sperm, {
              x : reserve.x + reserve.bend * .5,
              y : reserve.y,
              rx : reserve.ry + reserve.bend * .5,
              ry : reserve.rx
            },
            bladder, fishSwimBladderShape(neutral), fishSatietyShape(neutral), {
              x : cns.neck - PIGMENT_PLACE.gill_x,
              y : PIGMENT_PLACE.gill_y,
              rx : PIGMENT_PLACE.gill_rx,
              ry : PIGMENT_PLACE.gill_ry
            },
            {x : cns.cx, y : 0, rx : cns.rx, ry : cns.ry}
          ];
    for (let side = 0; side < 2; side++)
      ellipses.push(fishEye(neutral, side), fishNoseShape(neutral, side),
                    fishInjuryShape(neutral, side));
    const hash = (id, k) => {
      let x = Math.imul((id + 1) ^ Math.imul(k + 1, PIGMENT_HASH.a), PIGMENT_HASH.b);
      x ^= x >>> PIGMENT_HASH.shift;
      return (x >>> 0) / UINT32_RANGE;
    };
    for (const group of groups) {
      group.center = group.center.map(v => v / group.weight);
      let best = null, score = -Infinity;
      for (let k = 0; k < PIGMENT_PLACE.candidates; k++) {
        const t = PIGMENT_PLACE.start + PIGMENT_PLACE.span * hash(group.key, k * 2),
              layer = PIGMENT_PLACE.layer + PIGMENT_PLACE.layer_span * hash(group.key, k * 2 + 1),
              side = k % 2, p = fishSurfacePoint(neutral, side, t, layer);
        let clearance = PIGMENT_PLACE.clearance;
        for (const q of ellipses) {
          const norm = Math.hypot((p[0] - q.x) / Math.max(PIGMENT_PLACE.min_radius, q.rx),
                                  (p[1] - q.y) / Math.max(PIGMENT_PLACE.min_radius, q.ry));
          clearance = Math.min(clearance, (norm - 1) * Math.min(q.rx, q.ry) - PIGMENT_PLACE.margin);
        }
        if (p[0] < cns.neck && p[0] > cns.tail)
          clearance = Math.min(clearance, Math.abs(p[1]) - cns.cord - PIGMENT_PLACE.cord_margin);
        for (const q of placed)
          clearance =
              Math.min(clearance, Math.hypot(p[0] - q[0], p[1] - q[1]) - PIGMENT_PLACE.spacing);
        const route = group.route,
              wire = route
                         ? Math.hypot(p[0] - route.x / route.weight, p[1] - route.y / route.weight)
                         : 0,
              quality =
                  clearance - PIGMENT_PLACE.wire * wire -
                  PIGMENT_PLACE.place * Math.abs(t - (group.center[AXIS.along] + 1) / 2) -
                  PIGMENT_PLACE.depth * Math.abs(layer - (PIGMENT_PLACE.depth_layer +
                                                          PIGMENT_PLACE.depth_layer_span *
                                                              (group.center[AXIS.depth] + 1) / 2));
        const rank = Number.isFinite(quality) ? quality : -Infinity;
        if (!best || rank > score) {
          score = rank;
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
  const cells = new Map(b.neurons.map(n => [n[NEURON.index], n])), positions = new Map();
  positions.groups = brain_geometryState.brainPigmentCache.groups.map(group => {
    const p = fishSurfacePoint(a, group.side, group.t, group.layer);
    for (const id of group.ids) {
      const n = cells.get(id),
            layer = brainClamp(group.layer + PIGMENT_PLACE.spread_depth *
                                                 (n[NEURON.z] - group.center[AXIS.depth]),
                               PIGMENT_PLACE.min_layer, PIGMENT_PLACE.max_layer);
      let t = brainClamp(group.t +
                             PIGMENT_PLACE.spread_along * (n[NEURON.y] - group.center[AXIS.along]),
                         PIGMENT_PLACE.first, PIGMENT_PLACE.last),
          point = fishSurfacePoint(a, group.side, t, layer);
      positions.set(id, point);
    }
    return {...group, p};
  });
  return positions;
}

const PIGMENT_STATE = Object.freeze(
    {decay : 60, ink : .12, ink_per_level : .88, cache : 4096, color : .10, color_span : .9});
export function brainPigmentState(group, d, now = displayNow()) {
  let weight = 0, value = 0, colorWeight = 0, color = [ 0, 0, 0 ];
  for (const id of group.ids) {
    const n = d.nodes.get(id);
    if (!n)
      continue;
    const w = (n[NEURON.strength] ?? 1) * n[NEURON.motors][MOTOR_KIND.pigment],
          active = brainMotorActivity(n, MOTOR_KIND.pigment, d),
          key = d.p[FISH.id] + ':' + d.b.layout_id + ':' + id,
          stored = brain_geometryState.brainPigmentLevels.get(key),
          step = d.step ?? sceneState.frame?.step ?? 0,
          old = stored && stored.step <= step ? stored : null,
          decay = old ? Math.exp(-Math.max(0, step - old.step) / PIGMENT_STATE.decay) : 0,
          level = old ? old.value * decay + active * (1 - decay) : active;
    if (!old || old.step !== step)
      brain_geometryState.brainPigmentLevels.set(key, {step, value : level});
    const hue = brainOrganRGB(n),
          ink = w * (PIGMENT_STATE.ink + PIGMENT_STATE.ink_per_level * level);
    weight += w;
    value += w * level;
    colorWeight += ink;
    for (let c = 0; c < hue.length; c++)
      color[c] += ink * hue[c];
  }
  if (brain_geometryState.brainPigmentLevels.size > PIGMENT_STATE.cache)
    brain_geometryState.brainPigmentLevels =
        new Map([...brain_geometryState.brainPigmentLevels ].filter(
            ([ key ]) => key.startsWith(d.p[FISH.id] + ':' + d.b.layout_id + ':')));
  return {
    value : value / Math.max(TOLERANCE.negligible, weight),
    positive : 0,
    negative : 0,
    flash : 0,
    color : color.map(c => PIGMENT_STATE.color + PIGMENT_STATE.color_span * c /
                                                     Math.max(TOLERANCE.negligible, colorWeight))
  };
}

const PIGMENT_RADIUS = Object.freeze(
    {max_room : 2.2, min_radius : 2.2, max_radius : 25, radius : .04, base : .30, span : .70});
export function brainPigmentRadius(r, value = 0, count = PIGMENT_PLACE.groups) {
  const room =
      Math.min(PIGMENT_RADIUS.max_room, Math.sqrt(PIGMENT_PLACE.groups / Math.max(1, count)));
  return Math.max(
      PIGMENT_RADIUS.min_radius,
      Math.min(PIGMENT_RADIUS.max_radius,
               r * PIGMENT_RADIUS.radius *
                   (PIGMENT_RADIUS.base + PIGMENT_RADIUS.span * Math.sqrt(brainClamp(value))) *
                   room));
}

const PIGMENT_STAR = Object.freeze({points : 12, inner : .72});
export function brainPigmentStar(g, x, y, r) {
  const points = Array.from({length : PIGMENT_STAR.points}, (_, i) => {
    const t = i * 2 * Math.PI / PIGMENT_STAR.points, len = r * (i % 2 ? PIGMENT_STAR.inner : 1);
    return [ x + Math.cos(t) * len, y + Math.sin(t) * len ];
  }), mid = (a, b) => [(a[0] + b[0]) * .5, (a[1] + b[1]) * .5];
  g.moveTo(...mid(points[points.length - 1], points[0]));
  for (let i = 0; i < points.length; i++)
    g.quadraticCurveTo(...points[i], ...mid(points[i], points[(i + 1) % points.length]));
  g.closePath();
}

const CELL_DETAIL_RADIUS = Object.freeze({organ_start : 170, start : 125, span : 130});
export function brainCellDetail(p, c) {
  const radius = fishBodyRadius(p) * c.scale, start = brainState.brainView === 'organs'
                                                          ? CELL_DETAIL_RADIUS.organ_start
                                                          : CELL_DETAIL_RADIUS.start;
  return Math.max(0, Math.min(1, (radius - start) / CELL_DETAIL_RADIUS.span));
}

const initializers = {
  "brainPigmentCache" : () => { brain_geometryState.brainPigmentCache = null; },
  "brainPigmentLevels" : () => { brain_geometryState.brainPigmentLevels = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
