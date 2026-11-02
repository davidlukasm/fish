import {
  BODY_UNIT,
  FISH,
  FOOD,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  ORGAN_KIND,
  ORGAN_PROFILE as O,
  PLANT,
  PLANT_ORGAN,
  PLANT_ROOT,
  PLANT_TYPE,
  SEABED,
  TOLERANCE
} from './schema.js';
// Cover boxes reach COVER_MARGIN beyond small animals.
const COVER_MARGIN = 2;
import {cameraState} from './camera.js';
import {sceneState, blendParticle, blendSmallAnimal} from './state.js';
export const plant_geometryState = {};
export const BED_LAYERS = 6;
// Animals and plants without a measured place lie at MIDDLE_DEPTH of the bed.
export const MIDDLE_DEPTH = .5;
export function bedLayer(depth) {
  return Math.min(BED_LAYERS - 1, Math.max(0, Math.floor(depth * BED_LAYERS)));
}
// Organic matter darkens the sediment by these shares per channel at full density.
const ORGANIC_SHADE = Object.freeze([ .16, .19, .12 ]);
// Bed edges are matched by their ends in 1 / POSITION_BINS units and their normal in
// 1 / NORMAL_BINS steps.
const BED_KEY = Object.freeze({position_bins : 16, normal_bins : 4});
export function bedColor(f, p, along = .5) {
  const color = SEABED.sediment_color;
  const density =
            p => {
              const volume =
                        Math.max(1, p[PLANT.length] * Math.max(1, ((p[PLANT.sediment_left] || 0) +
                                                                   (p[PLANT.sediment_right] || 0)) /
                                                                      2)),
                    amount = Math.max(0, p[PLANT.detritus] || 0);
              return amount / (amount + volume);
            },
        key = (p, side) => [Math.round(p[side ? PLANT.bx : PLANT.ax] * BED_KEY.position_bins),
                            Math.round(p[side ? PLANT.by : PLANT.ay] * BED_KEY.position_bins),
                            Math.round(p[PLANT.nx] * BED_KEY.normal_bins),
                            Math.round(p[PLANT.ny] * BED_KEY.normal_bins)]
                               .join(':');
  if (plant_geometryState.bedPlants !== f.plants) {
    const edges = new Map();
    for (const q of f.plants || []) {
      if (q[PLANT.root]?.[PLANT_ROOT.drift_age] ||
          !(q[PLANT.sediment_left] > 0 || q[PLANT.sediment_right] > 0))
        continue;
      for (const side of [0, 1]) {
        const k = key(q, side), sample = edges.get(k) || [ 0, 0 ];
        sample[0] += density(q);
        ++sample[1];
        edges.set(k, sample);
      }
    }
    plant_geometryState.bedPlants = f.plants;
    plant_geometryState.bedEdges = edges;
  }
  const at = side => {
    const edge = plant_geometryState.bedEdges?.get(key(p, side));
    return edge ? edge[0] / edge[1] : density(p);
  }, organic = at(0) * (1 - along) + at(1) * along;
  return color.map((v, k) => v * (1 - ORGANIC_SHADE[k] * organic));
}
// The same sediment pigment is used by the bed, root mounds and animal burrows.
// Surface candidates are indexed once per snapshot, not searched for every animation frame.
// Soil is looked up in CELL pixel cells, each holding the beds within MARGIN.
const SOIL_GRID = Object.freeze({margin : 8, cell : 64});
export function bedColorAt(f, x, y) {
  if (!plant_geometryState.soilGrid || plant_geometryState.soilPlants !== f.plants) {
    const grid = new Map();
    for (const p of f.plants || []) {
      const depth = Math.max(p[PLANT.sediment_left] || 0, p[PLANT.sediment_right] || 0);
      if (depth <= 0 || p[PLANT.root]?.[PLANT_ROOT.drift_age])
        continue;
      const xs =
                [
                  p[PLANT.ax], p[PLANT.bx], p[PLANT.ax] + p[PLANT.nx] * depth,
                  p[PLANT.bx] + p[PLANT.nx] * depth
                ],
            ys = [
              p[PLANT.ay], p[PLANT.by], p[PLANT.ay] + p[PLANT.ny] * depth,
              p[PLANT.by] + p[PLANT.ny] * depth
            ];
      for (let j = Math.floor((Math.min(...ys) - SOIL_GRID.margin) / SOIL_GRID.cell);
           j <= Math.floor((Math.max(...ys) + SOIL_GRID.margin) / SOIL_GRID.cell); j++)
        for (let i = Math.floor((Math.min(...xs) - SOIL_GRID.margin) / SOIL_GRID.cell);
             i <= Math.floor((Math.max(...xs) + SOIL_GRID.margin) / SOIL_GRID.cell); i++) {
          const key = i + ':' + j, list = grid.get(key) || [];
          list.push(p);
          grid.set(key, list);
        }
    }
    plant_geometryState.soilPlants = f.plants;
    plant_geometryState.soilGrid = grid;
  }
  let nearest = null, best = Infinity, along = .5;
  for (const p of plant_geometryState.soilGrid.get(Math.floor(x / SOIL_GRID.cell) + ':' +
                                                   Math.floor(y / SOIL_GRID.cell)) ||
       []) {
    const dx = p[PLANT.bx] - p[PLANT.ax], dy = p[PLANT.by] - p[PLANT.ay],
          t = Math.max(0, Math.min(1, ((x - p[PLANT.ax]) * dx + (y - p[PLANT.ay]) * dy) /
                                          Math.max(TOLERANCE.negligible, dx * dx + dy * dy))),
          px = p[PLANT.ax] + t * dx, py = p[PLANT.ay] + t * dy,
          depth = (p[PLANT.sediment_left] || 0) * (1 - t) + (p[PLANT.sediment_right] || 0) * t,
          h = Math.max(0, Math.min(depth, (x - px) * p[PLANT.nx] + (y - py) * p[PLANT.ny])),
          distance = (x - px - h * p[PLANT.nx]) ** 2 + (y - py - h * p[PLANT.ny]) ** 2;
    if (distance < best) {
      best = distance;
      nearest = p;
      along = t;
    }
  }
  return nearest ? bedColor(f, nearest, along) : SEABED.sediment_color;
}
// Things deep in the bed are shown up to GROWTH larger.
const BED_GROWTH = Object.freeze({growth : .5});
export function bedScale(depth) { return 1 + BED_GROWTH.growth * Math.max(0, Math.min(1, depth)); }
// A plant's foot is found over STEPS points per part.
const PLANT_FOOT = Object.freeze({steps : 24});
export function plantFoot(p) {
  const cache = plant_geometryState.plantFeet ??= new WeakMap(), parts = plantRenderParts(p),
        saved = cache.get(p);
  if (saved?.parts === parts)
    return saved.bounds;
  let x = (p[PLANT.ax] + p[PLANT.bx]) / 2, y = Math.max(p[PLANT.ay], p[PLANT.by]), left = x,
      right = x, top = y;
  if (parts.length) {
    y = -Infinity;
    for (const o of parts) {
      for (let k = 0; k <= PLANT_FOOT.steps; ++k) {
        const v = plantRibbon(o.q, o.width, o.kind, k / PLANT_FOOT.steps);
        for (const sign of [-1, 1]) {
          const px = v.p[0] + sign * v.nx * v.width, py = v.p[1] + sign * v.ny * v.width;
          left = Math.min(left, px);
          right = Math.max(right, px);
          top = Math.min(top, py);
          if (py > y) {
            x = px;
            y = py;
          }
        }
      }
    }
  }
  const result = {x, y, left, right, top};
  cache.set(p, {parts, bounds : result});
  return result;
}
// Where a small animal touches the bed and how far its cover reaches, in body radii.
const ANIMAL_FOOT = Object.freeze({
  worm_foot : .31,
  body_reach : .15,
  open : .98,
  crab_foot : .51,
  reach : 1.5,
  crab_ground : .96,
  ground : .82
});
export function animalFoot(p) {
  const r = p[INVERTEBRATE.radius] * bedScale(p[INVERTEBRATE.bed_depth] ?? MIDDLE_DEPTH),
        a = p[INVERTEBRATE.angle] || 0;
  if (p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.worm) {
    const x = p[INVERTEBRATE.x] - Math.sin(a) * (p[INVERTEBRATE.length] || 0),
          y = Math.max(p[INVERTEBRATE.y],
                       p[INVERTEBRATE.y] + Math.cos(a) * (p[INVERTEBRATE.length] || 0)) +
              r * ANIMAL_FOOT.worm_foot;
    return {
      x,
      y,
      left : Math.min(x, p[INVERTEBRATE.x]) -
                 Math.max(r, p[INVERTEBRATE.body_length] * ANIMAL_FOOT.body_reach || 0),
      right : Math.max(x, p[INVERTEBRATE.x]) +
                  Math.max(r, p[INVERTEBRATE.body_length] * ANIMAL_FOOT.body_reach || 0),
      top : p[INVERTEBRATE.y] - r
    };
  }
  if (p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.crab &&
      p[INVERTEBRATE.closed] < ANIMAL_FOOT.open) {
    const foot =
        p[INVERTEBRATE.y] + r * (ANIMAL_FOOT.crab_foot * Math.cos(a) + Math.abs(Math.sin(a)));
    return {
      x : p[INVERTEBRATE.x],
      y : foot,
      left : p[INVERTEBRATE.x] - r * ANIMAL_FOOT.reach,
      right : p[INVERTEBRATE.x] + r * ANIMAL_FOOT.reach,
      top : p[INVERTEBRATE.y] - r * ANIMAL_FOOT.reach
    };
  }
  return {
    x : p[INVERTEBRATE.x],
    y : p[INVERTEBRATE.y] +
            r * (Math.abs(Math.sin(a)) + (p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.crab &&
                                                  p[INVERTEBRATE.closed] < ANIMAL_FOOT.open
                                              ? ANIMAL_FOOT.crab_ground
                                              : ANIMAL_FOOT.ground) *
                                             Math.abs(Math.cos(a))),
    left : p[INVERTEBRATE.x] - r * ANIMAL_FOOT.reach,
    right : p[INVERTEBRATE.x] + r * ANIMAL_FOOT.reach,
    top : p[INVERTEBRATE.y] - r * ANIMAL_FOOT.reach
  };
}
// Bed items within MARGIN pixels of the view are drawn in depth order; food from FOOD_MIN_SCALE
// zoom on; fish over the bed reach FISH_REACH radii.
const RENDER_ORDER = Object.freeze({
  margin : 48,
  food_min_scale : 1.5,
  food_min_radius : .7,
  food_scale : 2.4,
  fish_reach : 2,
  tie : .1
});
export function bedRenderOrder(f, c, shifts, blend, fishItems = []) {
  const items =
      [
        ...(f.plants || [])
            .filter(p => p[PLANT.stump])
            .map(p => ({kind : 'plant', p, foot : plantFoot(p)})),
        ...(f.invertebrates || []).map(p => ({
                                         kind : 'animal',
                                         p,
                                         foot : animalFoot(sceneState.previousInvertebrates
                                                               ? blendSmallAnimal(p, blend)
                                                               : p)
                                       }))
      ].filter(q =>
                   q.foot.y * c.scale + c.oy > -RENDER_ORDER.margin &&
                   q.foot.top * c.scale + c.oy < cameraState.viewportHeight + RENDER_ORDER.margin &&
                   shifts.some(shift =>
                                   (q.foot.right + shift) * c.scale + c.ox > -RENDER_ORDER.margin &&
                                   (q.foot.left + shift) * c.scale + c.ox <
                                       cameraState.viewportWidth + RENDER_ORDER.margin));
  items.sort((a, b) =>
                 a.foot.y - b.foot.y || a.p[a.kind === 'plant' ? PLANT.id : INVERTEBRATE.id] -
                                            b.p[b.kind === 'plant' ? PLANT.id : INVERTEBRATE.id]);
  for (const raw of c.scale >= RENDER_ORDER.food_min_scale ? f.food || [] : []) {
    if (!(raw[FOOD.bottom_steps] > 0))
      continue;
    const p = blendParticle(raw, sceneState.previousFood, FOOD.id, blend),
          r = Math.max(RENDER_ORDER.food_min_radius, p[FOOD.radius] * RENDER_ORDER.food_scale);
    if (p[FOOD.y] * c.scale + c.oy < -r * c.scale ||
        p[FOOD.y] * c.scale + c.oy > cameraState.viewportHeight + r * c.scale)
      continue;
    if (!shifts.some(s => (p[FOOD.x] + s + r) * c.scale + c.ox >= 0 &&
                          (p[FOOD.x] + s - r) * c.scale + c.ox <= cameraState.viewportWidth))
      continue;
    items.push({
      kind : 'food',
      p,
      foot : {y : p[FOOD.y] + r, left : p[FOOD.x] - r, right : p[FOOD.x] + r, top : p[FOOD.y] - r}
    });
  }
  const ground = items.filter(q => q.kind !== 'food'), overlapping = [];
  for (const item of fishItems) {
    const p = item.p, r = item.r * RENDER_ORDER.fish_reach,
          fraction = (item.depthLayer ?? 0) / Math.max(1, BED_LAYERS - 1);
    overlapping.length = 0;
    for (const q of ground)
      if (q.foot.left <= p[FISH.x] + r && q.foot.right >= p[FISH.x] - r &&
          q.foot.top <= p[FISH.y] + r && q.foot.y >= p[FISH.y] - r)
        overlapping.push(q);
    let y = p[FISH.y] + item.r;
    if (overlapping.length) {
      const at = fraction * (overlapping.length - 1), before = Math.floor(at),
            after = Math.ceil(at);
      y = overlapping[before].foot.y * (1 - (at - before)) +
          overlapping[after].foot.y * (at - before) + (fraction - .5) * RENDER_ORDER.tie;
    }
    items.push({kind : 'fish', item, p, foot : {y}});
  }
  return items.sort((a, b) => a.foot.y - b.foot.y);
}
// A plant root lies in the bed once the bed is MIN_DEPTH deep.
const PLANT_DEPTH = Object.freeze({min_depth : .01});
export function plantDepth(p) {
  if (p[PLANT.root]?.[PLANT_ROOT.visual_depth] >= 0)
    return p[PLANT.root][PLANT_ROOT.visual_depth];
  const root = p[PLANT.organs]?.find(o => o[PLANT_ORGAN.parent] < 0)?.[PLANT_ORGAN.curve];
  if (!root)
    return MIDDLE_DEPTH;
  const dx = p[PLANT.bx] - p[PLANT.ax], dy = p[PLANT.by] - p[PLANT.ay],
        t = Math.max(0, Math.min(1, ((root[0] - p[PLANT.ax]) * dx + (root[1] - p[PLANT.ay]) * dy) /
                                        Math.max(TOLERANCE.negligible, dx * dx + dy * dy))),
        depth = (p[PLANT.sediment_left] || 0) * (1 - t) + (p[PLANT.sediment_right] || 0) * t;
  return depth > PLANT_DEPTH.min_depth
             ? Math.max(0, Math.min(1, 1 - ((root[0] - p[PLANT.ax]) * p[PLANT.nx] +
                                            (root[1] - p[PLANT.ay]) * p[PLANT.ny]) /
                                               depth))
             : MIDDLE_DEPTH;
}
// Fish in plant cover keep their drawing layer for at least HOLD steps; cover is indexed in CELL
// pixel cells; layers reshuffle every RESHUFFLE steps by the golden ratio.
const COVER_GRID = Object.freeze({
  cell : 64,
  hold : 160,
  golden : .61803398875,
  reshuffle : 240,
  golden_step : .381966,
  cache : 4096
});
export function fishVegetationLayer(p, f) {
  if (plant_geometryState.coverFrame !== f) {
    const grid = new Map(), add = (x0, y0, x1, y1) => {
      for (let y = Math.floor(y0 / COVER_GRID.cell); y <= Math.floor(y1 / COVER_GRID.cell); ++y)
        for (let x = Math.floor(x0 / COVER_GRID.cell); x <= Math.floor(x1 / COVER_GRID.cell); ++x) {
          const key = x + ':' + y, list = grid.get(key) || [];
          list.push([ x0, y0, x1, y1 ]);
          grid.set(key, list);
        }
    };
    for (const plant of f.plants || [])
      for (const o of plantRenderParts(plant)) {
        const box = plantCurveBox(o.q, o.width);
        add(box.left, box.top, box.right, box.bottom);
      }
    const I = INVERTEBRATE;
    for (const o of f.invertebrates || []) {
      if (o[I.kind] === INVERTEBRATE_KIND.grazing)
        continue;
      const span = o[I.kind] === INVERTEBRATE_KIND.worm ? o[I.length] || 0 : o[I.radius] || 0;
      add(o[I.x] - span - COVER_MARGIN, o[I.y] - span - COVER_MARGIN, o[I.x] + span + COVER_MARGIN,
          o[I.y] + span + COVER_MARGIN);
    }
    plant_geometryState.coverFrame = f;
    plant_geometryState.coverGrid = grid;
    if (plant_geometryState.depthEpoch !== f.render_epoch) {
      plant_geometryState.fishDepths = new Map();
      plant_geometryState.depthEpoch = f.render_epoch;
    }
  }
  const states = plant_geometryState.fishDepths ??= new Map(),
        radius = p[FISH.radius] || BODY_UNIT.radius,
        old = states.get(p[FISH.id]) || {layer : p[FISH.id] % BED_LAYERS, changed : f.step};
  let covered = false;
  for (let y = Math.floor((p[FISH.y] - radius) / COVER_GRID.cell);
       y <= Math.floor((p[FISH.y] + radius) / COVER_GRID.cell); ++y)
    for (let x = Math.floor((p[FISH.x] - radius) / COVER_GRID.cell);
         x <= Math.floor((p[FISH.x] + radius) / COVER_GRID.cell); ++x)
      for (const b of plant_geometryState.coverGrid.get(x + ':' + y) || [])
        covered ||= p[FISH.x] + radius > b[0] && p[FISH.x] - radius < b[2] &&
                    p[FISH.y] + radius > b[1] && p[FISH.y] - radius < b[3];
  if (!covered && f.step - old.changed >= COVER_GRID.hold) {
    old.layer = Math.floor(((p[FISH.id] * COVER_GRID.golden +
                             Math.floor(f.step / COVER_GRID.reshuffle) * COVER_GRID.golden_step) %
                            1) *
                           BED_LAYERS);
    old.changed = f.step;
  }
  states.set(p[FISH.id], old);
  if (states.size > COVER_GRID.cache)
    for (const [id] of states)
      if (!f.fish.some(q => q[FISH.id] === id))
        states.delete(id);
  return old.layer;
}
export let plantPartsCache;

// Plant parts stay LIFT pixels above the floor, found in BISECTIONS halvings.
const RENDER_PARTS = Object.freeze({lift : .5, bisections : 4});
export function plantRenderParts(p) {
  const saved = plantPartsCache.get(p);
  if (saved && saved.obstacles === sceneState.frame?.obstacles)
    return saved.parts;
  const O = PLANT_ORGAN, parts = p[PLANT.organs]
                                     .filter(o => o[O.energy] > TOLERANCE.negligible)
                                     .map(o => ({
                                            stem : o[O.id],
                                            kind : o[O.kind],
                                            parent : o[O.parent],
                                            q : o[O.curve],
                                            width : o[O.width],
                                            hardness : o[O.hardness],
                                            energy : o[O.energy],
                                            vitality : o[O.vitality],
                                            attach : o[O.attach],
                                            color : o[O.color],
                                            biteHardness : o[O.bite_hardness],
                                            notches : o[O.notches] || [],
                                            cut : o[O.cut] || 0
                                          }));
  if (parts.length) {
    const roots = parts.filter(o => o.parent < 0), anchors = roots.length ? roots : parts,
          x = anchors.reduce((s, o) => s + o.q[0], 0) / anchors.length,
          y = anchors.reduce((s, o) => s + o.q[1], 0) / anchors.length,
          scale = bedScale(plantDepth(p));
    const f = sceneState.frame;
    if (f && plant_geometryState.scaleObstacles !== f.obstacles) {
      plant_geometryState.scaleObstacles = f.obstacles;
      plant_geometryState.scaleGeometry = plantWakeGeometry(f);
    }
    for (const part of parts) {
      const original = part.q, originalWidth = part.width;
      part.q = part.q.map(
          (v, k) => k % 2 ? Math.max(part.width * scale + RENDER_PARTS.lift, y + (v - y) * scale)
                          : x + (v - x) * scale);
      part.width *= scale;
      if (f && scale > 1 &&
          !plantCurveClear(f, part.q, part.width, part.kind, plant_geometryState.scaleGeometry)) {
        let lo = 0, hi = 1;
        for (let k = 0; k < RENDER_PARTS.bisections; k++) {
          const t = (lo + hi) / 2, curve = original.map((v, j) => v + (part.q[j] - v) * t),
                w = originalWidth + (part.width - originalWidth) * t;
          if (plantCurveClear(f, curve, w, part.kind, plant_geometryState.scaleGeometry))
            lo = t;
          else
            hi = t;
        }
        part.q = original.map((v, j) => v + (part.q[j] - v) * lo);
        part.width = originalWidth + (part.width - originalWidth) * lo;
      }
    }
  }
  plantPartsCache.set(p, {parts, obstacles : sceneState.frame?.obstacles});
  return parts;
}

// Width profile along an organ, the same as the engine's (organ_profile) and the grass shader's.
function plantProfile(kind, t) {
  if (kind === ORGAN_KIND.blade)
    return Math.max(0, 1 - t ** O.blade_power) ** O.blade_shape;
  if (kind === ORGAN_KIND.stem)
    return (1 - O.stem_taper * t) *
           (1 + O.stem_knot * Math.exp(-(((t - O.knot_at) / O.knot_width) ** 2)));
  if (t < O.leaf_base)
    return O.leaf_stalk;
  const v = (t - O.leaf_base) / (1 - O.leaf_base), s = Math.max(0, Math.sin(Math.PI * v));
  return kind === ORGAN_KIND.leaf
             ? s ** O.leaf_power * (1 + O.leaf_ripple * Math.sin(O.leaf_ripples * Math.PI * v))
             : s ** O.round_power * (1 - O.round_taper * v);
}
// Leaf ribbons narrow where the curve bends tighter than CURL_ROOM of its length.
export const RIBBON = Object.freeze({min_length : .001, curl_room : .72, min_curvature : .00001});
export function plantRibbon(q, width, kind, t) {
  const u = 1 - t, p = plantCurvePoint(q, t),
        dx = 3 * u * u * (q[2] - q[0]) + 6 * u * t * (q[4] - q[2]) + 3 * t * t * (q[6] - q[4]),
        dy = 3 * u * u * (q[3] - q[1]) + 6 * u * t * (q[5] - q[3]) + 3 * t * t * (q[7] - q[5]),
        ddx = 6 * u * (q[4] - 2 * q[2] + q[0]) + 6 * t * (q[6] - 2 * q[4] + q[2]),
        ddy = 6 * u * (q[5] - 2 * q[3] + q[1]) + 6 * t * (q[7] - 2 * q[5] + q[3]),
        length = Math.max(RIBBON.min_length, Math.hypot(dx, dy)),
        curvature = Math.abs(dx * ddy - dy * ddx),
        w = Math.min(width * plantProfile(kind, t),
                     kind >= ORGAN_KIND.leaf ? RIBBON.curl_room * length ** 3 /
                                                   Math.max(RIBBON.min_curvature, curvature)
                                             : Infinity);
  return {p, nx : -dy / length, ny : dx / length, width : w};
}
// Bounding box of a cubic curve's control points, widened by margin.
export function plantCurveBox(q, margin = 0) {
  return {
    left : Math.min(q[0], q[2], q[4], q[6]) - margin,
    right : Math.max(q[0], q[2], q[4], q[6]) + margin,
    top : Math.min(q[1], q[3], q[5], q[7]) - margin,
    bottom : Math.max(q[1], q[3], q[5], q[7]) + margin
  };
}
function plantCurveLength(q) { return Math.hypot(q[6] - q[0], q[7] - q[1]); }
// Length of a curve's control polygon, an upper bound of its arc length.
// The plant type a plant trait encodes, as the engine reads it (grass_type).
export const plantType = trait =>
    Math.max(0, Math.min(Object.keys(PLANT_TYPE).length - 1,
                         Math.floor(trait * Object.keys(PLANT_TYPE).length)));
export function plantCurveSpan(q) {
  return Math.hypot(q[2] - q[0], q[3] - q[1]) + Math.hypot(q[4] - q[2], q[5] - q[3]) +
         Math.hypot(q[6] - q[4], q[7] - q[5]);
}
function plantCurvePoint(q, t) {
  const u = 1 - t;
  return [
    u * u * u * q[0] + 3 * u * u * t * q[2] + 3 * u * t * t * q[4] + t * t * t * q[6],
    u * u * u * q[1] + 3 * u * u * t * q[3] + 3 * u * t * t * q[5] + t * t * t * q[7]
  ];
}

export function plantWakeGeometry(f) {
  const objects = [];
  for (let i = 0; i < (f.obstacles || []).length; ++i) {
    const [x, y, r] = f.obstacles[i], shape = f.shapes?.[i],
                 xs = shape?.length ? shape.map(p => p[0]) : [ x - r, x + r ],
                 ys = shape?.length ? shape.map(p => p[1]) : [ y - r, y + r ],
                 left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys),
                 bottom = Math.max(...ys);
    for (const shift of [-f.width, 0, f.width])
      objects.push({
        x : x + shift,
        y,
        r,
        shape : shape?.map(p => [p[0] + shift, p[1]]),
        left : left + shift,
        right : right + shift,
        top,
        bottom
      });
  }
  return objects;
}

// Curves are checked in MIN_STEPS to MAX_STEPS steps, about one per pixel.
const CURVE_CLEAR = Object.freeze({min_steps : 8, max_steps : 64});
export function plantCurveClear(f, q, width, kind, geometry = plantWakeGeometry(f)) {
  const {left : minX,
         right : maxX,
         top : minY,
         bottom : maxY} = plantCurveBox(q, width),
                  near = geometry.filter(o => o.right >= minX && o.left <= maxX &&
                                              o.bottom >= minY && o.top <= maxY);
  if (!near.length && minY >= 0 && maxY <= f.height)
    return true;
  const steps = Math.max(CURVE_CLEAR.min_steps,
                         Math.min(CURVE_CLEAR.max_steps, Math.ceil(plantCurveLength(q))));
  for (let k = 1; k <= steps; ++k) {
    const t = k / steps, [ x, y ] = plantCurvePoint(q, t), margin = width * plantProfile(kind, t);
    if (y - margin < 0 || y + margin > f.height)
      return false;
    for (const o of near) {
      if (!o.shape?.length) {
        if (Math.hypot(x - o.x, y - o.y) < o.r + margin)
          return false;
        continue;
      }
      let inside = false;
      for (let i = 0, j = o.shape.length - 1; i < o.shape.length; j = i++) {
        const a = o.shape[j], b = o.shape[i], dx = b[0] - a[0], dy = b[1] - a[1],
              u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) /
                                              Math.max(TOLERANCE.rounding, dx * dx + dy * dy)));
        if (Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy) < margin)
          return false;
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
      if (inside)
        return false;
    }
  }
  return true;
}

// Plant parts count as visible within VIEW_MARGIN pixels, MARGIN beyond their width.
const PART_VISIBLE = Object.freeze({margin : 24, view_margin : 160});
export function plantPartVisible(q, width, c, shifts) {
  if (!c)
    return true;
  const margin = Math.max(0, width || 0) + PART_VISIBLE.margin, ox = c.ox, oy = c.oy, s = c.scale;
  const {left, right, top, bottom} = plantCurveBox(q, margin);
  return bottom * s + oy >= -PART_VISIBLE.view_margin &&
         top * s + oy <= cameraState.viewportHeight + PART_VISIBLE.view_margin &&
         shifts.some(shift => (right + shift) * s + ox >= -PART_VISIBLE.view_margin &&
                              (left + shift) * s + ox <=
                                  cameraState.viewportWidth + PART_VISIBLE.view_margin);
}

// How plants give way to a passing fish (visual only). A push on any leaf or blade also bends
// everything it hangs on, down to the root, the more the farther out it is attached; so the whole
// plant leans away. Push: tip offset per unit of contact and fish size; reach: the largest tip
// offset as a share of the part's height. Wakes are drawn from this zoom on.
const GRASS_WAKE = Object.freeze({
  blade_push : 6.5,
  leaf_push : 3,
  blade_reach : .75,
  leaf_reach : .45,
  scale : .7,
  profile : Object.freeze([ 0, .16, .62, 1 ]),
  max_step : 40,
  no_wrap : 1e9,
  max_gap : 240,
  cell : 64,
  min_speed : .02,
  max_jump : 128,
  pad : 4,
  samples : 10,
  min_motion : .001,
  frequency : .20,
  decay : .55,
  bisections : 6
});
export function prepareGrassWakes(f, c = null, shifts = [ 0 ]) {
  const world = [ f.render_epoch, f.view_context, f.width, f.height ].join(':');
  if (plant_geometryState.grassWakeWorld !== world) {
    plant_geometryState.grassWakeWorld = world;
    plant_geometryState.grassWakeRevision = -1;
    plant_geometryState.grassWakeStep = null;
    plant_geometryState.grassWakeStates.clear();
  }
  if (c && c.scale < GRASS_WAKE.scale) {
    plant_geometryState.grassWakeCurves = new Map();
    plant_geometryState.grassWakeRevision = -1;
    return;
  }
  if (plant_geometryState.grassWakeRevision === sceneState.frameRevision)
    return;
  plant_geometryState.grassWakeRevision = sceneState.frameRevision;
  const step = f.step ?? 0,
        elapsed = plant_geometryState.grassWakeStep === null
                      ? 0
                      : step - plant_geometryState.grassWakeStep,
        dt = Math.min(GRASS_WAKE.max_step, Math.max(0, elapsed)),
        width = f.width || GRASS_WAKE.no_wrap;
  if (elapsed < 0 || elapsed > GRASS_WAKE.max_gap) {
    plant_geometryState.grassWakeStates.clear();
  }
  plant_geometryState.grassWakeStep = step;
  plant_geometryState.grassWakeCurves = new Map();
  const wrap = x => x - width * Math.round(x / width), grid = new Map(), cell = GRASS_WAKE.cell,
        priorFish = new Map((sceneState.previous?.fish || []).map(p => [p[FISH.id], p])),
        geometry = plantWakeGeometry(f);
  if (dt > 0)
    for (const p of f.fish || []) {
      if (!p[FISH.hatched] || p[FISH.health] <= 0)
        continue;
      const old = priorFish.get(p[FISH.id]);
      if (!old)
        continue;
      const dx = wrap(p[FISH.x] - old[FISH.x]), dy = p[FISH.y] - old[FISH.y],
            speed = Math.hypot(dx, dy) / Math.max(1, elapsed),
            radius = p[FISH.radius] ?? BODY_UNIT.radius;
      if (speed < GRASS_WAKE.min_speed || Math.hypot(dx, dy) > GRASS_WAKE.max_jump)
        continue;
      const fish = {
        ax : p[FISH.x] - dx,
        ay : p[FISH.y] - dy,
        bx : p[FISH.x],
        by : p[FISH.y],
        vx : dx / elapsed,
        vy : dy / elapsed,
        radius
      };
      for (const shift of [-width, 0, width]) {
        const shifted = {...fish, ax : fish.ax + shift, bx : fish.bx + shift};
        for (let x =
                 Math.floor((Math.min(fish.ax, fish.bx) + shift - radius - GRASS_WAKE.pad) / cell);
             x <= Math.floor((Math.max(fish.ax, fish.bx) + shift + radius + GRASS_WAKE.pad) / cell);
             ++x)
          for (let y = Math.floor((Math.min(fish.ay, fish.by) - radius - GRASS_WAKE.pad) / cell);
               y <= Math.floor((Math.max(fish.ay, fish.by) + radius + GRASS_WAKE.pad) / cell);
               ++y) {
            const key = x + ':' + y;
            if (!grid.has(key))
              grid.set(key, []);
            grid.get(key).push(shifted);
          }
      }
    }
  const oldPlants = new Map((sceneState.previous?.plants || []).map(p => [p[0], p])),
        states = new Map();
  const bend = (q, x, y) =>
      q.map((v, k) => v + (k < 2 ? 0 : (k % 2 ? y : x) * GRASS_WAKE.profile[k >> 1]));
  // Push of the passing fish on one part, from where they touch its resting curve.
  const contactForce = part => {
    const q = part.q, samples = [];
    let tx = 0, ty = 0;
    const {left : minX, right : maxX, top : minY, bottom : maxY} = plantCurveBox(q),
                                                           candidates = new Set(),
                                                           left = Math.floor(minX / cell),
                                                           right = Math.floor(maxX / cell),
                                                           top = Math.floor(minY / cell),
                                                           bottom = Math.floor(maxY / cell);
    for (let x = left; x <= right; ++x)
      for (let y = top; y <= bottom; ++y)
        for (const fish of grid.get(x + ':' + y) || []) {
          const r = fish.radius + GRASS_WAKE.pad;
          if (Math.max(fish.ax, fish.bx) + r >= minX && Math.min(fish.ax, fish.bx) - r <= maxX &&
              Math.max(fish.ay, fish.by) + r >= minY && Math.min(fish.ay, fish.by) - r <= maxY)
            candidates.add(fish);
        }
    if (candidates.size)
      for (let i = 1; i <= GRASS_WAKE.samples; ++i)
        samples.push(plantCurvePoint(q, i / GRASS_WAKE.samples));
    for (const fish of candidates) {
      const dx = fish.bx - fish.ax, dy = fish.by - fish.ay, span = dx * dx + dy * dy;
      let distance2 = Infinity;
      for (const [x, y] of samples) {
        const t = Math.max(0, Math.min(1, ((x - fish.ax) * dx + (y - fish.ay) * dy) /
                                              Math.max(TOLERANCE.negligible, span))),
              rx = x - fish.ax - t * dx, ry = y - fish.ay - t * dy;
        distance2 = Math.min(distance2, rx * rx + ry * ry);
      }
      const contact = Math.max(0, 1 - Math.sqrt(distance2) / (fish.radius + GRASS_WAKE.pad));
      const force = contact * contact * fish.radius *
                    (part.kind >= ORGAN_KIND.leaf ? GRASS_WAKE.leaf_push : GRASS_WAKE.blade_push);
      tx += force * fish.vx;
      ty += force * fish.vy;
    }
    return [ tx, ty ];
  };
  for (const p of f.plants || []) {
    if (!p[PLANT.stump] ||
        !plantRenderParts(p).some(o => plantPartVisible(o.q, o.width, c, shifts)))
      continue;
    const old = oldPlants.get(p[0]), parts = plantRenderParts(p),
          lookup = new Map(parts.map(o => [o.stem, o])),
          prior = new Map((old ? plantRenderParts(old) : []).map(o => [o.stem, o]));
    // Contact forces on the resting shape, handed on to the part each one hangs on (children
    // before their parents), so a push on a leaf reaches the root.
    const forces = new Map(parts.map(part => [part.stem, contactForce(part)]));
    for (let k = parts.length - 1; k >= 0; --k) {
      const part = parts[k], own = forces.get(part.stem), up = forces.get(part.parent);
      if (up && (own[0] || own[1])) {
        const lever = Math.max(0, Math.min(1, part.attach ?? 1));
        up[0] += own[0] * lever;
        up[1] += own[1] * lever;
      }
    }
    for (const part of parts) {
      const {stem} = part;
      let q = part.q, inherited = false;
      const parent = grassWakeCurve(p, part.parent);
      if (parent) {
        const raw = lookup.get(part.parent)?.q;
        if (raw) {
          const a = plantCurvePoint(raw, part.attach),
                b = plantCurvePoint(parent.next, part.attach), dx = b[0] - a[0], dy = b[1] - a[1];
          inherited = Math.abs(dx) + Math.abs(dy) > GRASS_WAKE.min_motion;
          q = q.map((v, k) => v + (k % 2 ? dy : dx));
        }
      }

      const key = p[0] + ':' + stem,
            state = plant_geometryState.grassWakeStates.get(key) || {x : 0, y : 0, vx : 0, vy : 0};
      let before = prior.get(stem)?.q || part.q;
      if (parent) {
        const raw = prior.get(part.parent)?.q;
        if (raw) {
          const a = plantCurvePoint(raw, part.attach),
                b = plantCurvePoint(parent.before, part.attach);
          before = before.map((v, k) => v + b[k % 2] - a[k % 2]);
        }
      }
      const was = bend(before, state.x, state.y);
      const height = plantCurveLength(q);
      let [tx, ty] = forces.get(stem);
      const limit = height *
                    (part.kind >= ORGAN_KIND.leaf ? GRASS_WAKE.leaf_reach : GRASS_WAKE.blade_reach),
            target = Math.hypot(tx, ty);
      if (target > limit) {
        tx *= limit / target;
        ty *= limit / target;
      }
      // Exact damped spring over the snapshot interval; pause and frame rate do not drive it.
      if (dt > 0) {
        const frequency =
                  GRASS_WAKE.frequency / Math.sqrt((p[PLANT.fiber] ?? 1) * (part.hardness || 1)),
              decay = frequency * GRASS_WAKE.decay,
              omega = Math.sqrt(frequency * frequency - decay * decay), e = Math.exp(-decay * dt),
              co = Math.cos(omega * dt), si = Math.sin(omega * dt);
        for (const [axis, velocity, target] of [[ 'x', 'vx', tx ], [ 'y', 'vy', ty ]]) {
          const x = state[axis] - target, v = state[velocity], b = (v + decay * x) / omega;
          state[axis] = target + e * (x * co + b * si);
          state[velocity] = e * (v * co - (decay * b + omega * x) * si);
        }
        const amplitude = Math.hypot(state.x, state.y);
        if (amplitude > limit && amplitude > 0) {
          state.x *= limit / amplitude;
          state.y *= limit / amplitude;
        }
      }
      let next = bend(q, state.x, state.y);
      if ((Math.abs(state.x) + Math.abs(state.y) > GRASS_WAKE.min_motion || inherited) &&
          !plantCurveClear(f, next, part.width, part.kind, geometry)) {
        let lo = 0, hi = 1;
        for (let k = 0; k < GRASS_WAKE.bisections; ++k) {
          const t = (lo + hi) * .5, candidate = next.map((v, j) => part.q[j] + (v - part.q[j]) * t);
          if (plantCurveClear(f, candidate, part.width, part.kind, geometry))
            lo = t;
          else
            hi = t;
        }
        next = next.map((v, j) => part.q[j] + (v - part.q[j]) * lo);
        state.x *= lo;
        state.y *= lo;
        state.vx *= lo;
        state.vy *= lo;
      }
      states.set(key, state);
      plant_geometryState.grassWakeCurves.set(key, {before : was, next});
    }
  }
  plant_geometryState.grassWakeStates = states;
}

export function grassWakeCurve(p, stem) {
  return plant_geometryState.grassWakeCurves.get(p[PLANT.id] + ':' + stem);
}

export function algaeDisplay(p, f) {
  const start = p[PLANT.algae_start], end = p[PLANT.algae_end];
  // Without tank parameters yet, the algae are not known.
  if (!f.parameters)
    return {fill : 0, thickness : 0, start, end};
  const fill =
      Math.max(0, Math.min(1, p[PLANT.algae] / Math.max(1, f.parameters.algae_capacity *
                                                               (p[PLANT.length] * (end - start) +
                                                                (p[PLANT.mussel_arc] || 0)) /
                                                               SEABED.algae_capacity_unit)));
  // Thin algae stay visible: the shown thickness grows with the root of the filling.
  return {fill, thickness : f.parameters.algae_thickness * Math.sqrt(fill), start, end};
}

const initializers = {
  "plantPartsCache" : () => { plantPartsCache = new WeakMap(); },
  "grassWakeRevision" : () => {
    // Local, visual wakes. A spatial grid avoids scanning every fish for every stem.
    plant_geometryState.grassWakeRevision = -1;
  },
  "grassWakeStep" : () => { plant_geometryState.grassWakeStep = null; },
  "grassWakeStates" : () => { plant_geometryState.grassWakeStates = new Map(); },
  "grassWakeCurves" : () => { plant_geometryState.grassWakeCurves = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
