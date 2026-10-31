import {FISH, FOOD, PLANT} from './schema.js';
import {cameraState} from './camera.js';
import {sceneState, blendParticle, blendSmallAnimal} from './state.js';
export const plant_geometryState = {};
export const BED_LAYERS = 6;
export function bedLayer(depth) {
  return Math.min(BED_LAYERS - 1, Math.max(0, Math.floor(depth * BED_LAYERS)));
}
export function bedColor(f, p, along = .5) {
  const color = f.parameters?.vision_sand_color === 0 ? [ .43, .35, .23 ] : [ .55, .48, .30 ];
  const density =
            p => {
              const volume =
                        Math.max(1, p[PLANT.length] * Math.max(1, ((p[PLANT.sediment_left] || 0) +
                                                                   (p[PLANT.sediment_right] || 0)) /
                                                                      2)),
                    amount = Math.max(0, p[PLANT.detritus] || 0);
              return amount / (amount + volume);
            },
        key = (p, side) => [Math.round(p[1 + side * 2] * 16), Math.round(p[2 + side * 2] * 16),
                            Math.round(p[PLANT.nx] * 4), Math.round(p[PLANT.ny] * 4)]
                               .join(':');
  if (plant_geometryState.bedPlants !== f.plants) {
    const edges = new Map();
    for (const q of f.plants || []) {
      if (q[PLANT.root]?.[2] || !(q[PLANT.sediment_left] > 0 || q[PLANT.sediment_right] > 0))
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
  return color.map((v, k) => v * (1 - [ .16, .19, .12 ][k] * organic));
}
// The same sediment pigment is used by the bed, root mounds and animal burrows.
// Surface candidates are indexed once per snapshot, not searched for every animation frame.
export function bedColorAt(f, x, y) {
  if (!plant_geometryState.soilGrid || plant_geometryState.soilPlants !== f.plants) {
    const grid = new Map();
    for (const p of f.plants || []) {
      const depth = Math.max(p[PLANT.sediment_left] || 0, p[PLANT.sediment_right] || 0);
      if (depth <= 0 || p[PLANT.root]?.[2])
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
      for (let j = Math.floor((Math.min(...ys) - 8) / 64);
           j <= Math.floor((Math.max(...ys) + 8) / 64); j++)
        for (let i = Math.floor((Math.min(...xs) - 8) / 64);
             i <= Math.floor((Math.max(...xs) + 8) / 64); i++) {
          const key = i + ':' + j, list = grid.get(key) || [];
          list.push(p);
          grid.set(key, list);
        }
    }
    plant_geometryState.soilPlants = f.plants;
    plant_geometryState.soilGrid = grid;
  }
  let nearest = null, best = Infinity, along = .5;
  for (const p of plant_geometryState.soilGrid.get(Math.floor(x / 64) + ':' + Math.floor(y / 64)) ||
       []) {
    const dx = p[PLANT.bx] - p[PLANT.ax], dy = p[PLANT.by] - p[PLANT.ay],
          t = Math.max(0, Math.min(1, ((x - p[PLANT.ax]) * dx + (y - p[PLANT.ay]) * dy) /
                                          Math.max(1e-9, dx * dx + dy * dy))),
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
  return nearest ? bedColor(f, nearest, along)
                 : (f.parameters?.vision_sand_color === 0 ? [ .43, .35, .23 ] : [ .55, .48, .30 ]);
}
export function bedScale(depth) { return 1 + .5 * Math.max(0, Math.min(1, depth)); }
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
      for (let k = 0; k <= 24; ++k) {
        const v = plantRibbon(o.q, o.width, o.kind, k / 24);
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
export function animalFoot(p) {
  const r = p[6] * bedScale(p[19] ?? .5), a = p[11] || 0;
  if (p[7] === 7) {
    const x = p[0] - Math.sin(a) * (p[13] || 0),
          y = Math.max(p[1], p[1] + Math.cos(a) * (p[13] || 0)) + r * .31;
    return {
      x,
      y,
      left : Math.min(x, p[0]) - Math.max(r, p[20] * .15 || 0),
      right : Math.max(x, p[0]) + Math.max(r, p[20] * .15 || 0),
      top : p[1] - r
    };
  }
  if (p[7] === 8 && p[17] < .98) {
    const foot = p[1] + r * (.51 * Math.cos(a) + Math.abs(Math.sin(a)));
    return {
      x : p[0],
      y : foot,
      left : p[0] - r * 1.5,
      right : p[0] + r * 1.5,
      top : p[1] - r * 1.5
    };
  }
  return {
    x : p[0],
    y : p[1] + r * (Math.abs(Math.sin(a)) +
                    (p[7] === 8 && p[17] < .98 ? .96 : .82) * Math.abs(Math.cos(a))),
    left : p[0] - r * 1.5,
    right : p[0] + r * 1.5,
    top : p[1] - r * 1.5
  };
}
export function bedRenderOrder(f, c, shifts, blend, fishItems = []) {
  const items =
      [
        ...(f.plants || []).filter(p => p[9]).map(p => ({kind : 'plant', p, foot : plantFoot(p)})),
        ...(f.invertebrates || []).map(p => ({
                                         kind : 'animal',
                                         p,
                                         foot : animalFoot(sceneState.previousInvertebrates
                                                               ? blendSmallAnimal(p, blend)
                                                               : p)
                                       }))
      ].filter(q => q.foot.y * c.scale + c.oy > -48 &&
                    q.foot.top * c.scale + c.oy < cameraState.viewportHeight + 48 &&
                    shifts.some(shift => (q.foot.right + shift) * c.scale + c.ox > -48 &&
                                         (q.foot.left + shift) * c.scale + c.ox <
                                             cameraState.viewportWidth + 48));
  items.sort((a, b) => a.foot.y - b.foot.y || a.p[a.kind === 'plant' ? PLANT.id : FOOD.id] -
                                                  b.p[b.kind === 'plant' ? PLANT.id : FOOD.id]);
  for (const raw of c.scale >= 1.5 ? f.food || [] : []) {
    if (!(raw[FOOD.bottom_steps] > 0))
      continue;
    const p = blendParticle(raw, sceneState.previousFood, FOOD.id, blend),
          r = Math.max(.7, p[FOOD.radius] * 2.4);
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
    const p = item.p, r = item.r * 2,
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
          overlapping[after].foot.y * (at - before) + (fraction - .5) * .1;
    }
    items.push({kind : 'fish', item, p, foot : {y}});
  }
  return items.sort((a, b) => a.foot.y - b.foot.y);
}
export function plantDepth(p) {
  if (p[PLANT.root]?.[4] >= 0)
    return p[PLANT.root][4];
  const root = p[PLANT.organs]?.find(o => o[2] < 0)?.[3];
  if (!root)
    return .5;
  const dx = p[3] - p[1], dy = p[4] - p[2],
        t = Math.max(0, Math.min(1, ((root[0] - p[1]) * dx + (root[1] - p[2]) * dy) /
                                        Math.max(1e-9, dx * dx + dy * dy))),
        depth = (p[15] || 0) * (1 - t) + (p[16] || 0) * t;
  return depth > .01
             ? Math.max(
                   0, Math.min(1, 1 - ((root[0] - p[1]) * p[5] + (root[1] - p[2]) * p[6]) / depth))
             : .5;
}
export function fishVegetationLayer(p, f) {
  if (plant_geometryState.coverFrame !== f) {
    const grid = new Map(), add = (x0, y0, x1, y1) => {
      for (let y = Math.floor(y0 / 64); y <= Math.floor(y1 / 64); ++y)
        for (let x = Math.floor(x0 / 64); x <= Math.floor(x1 / 64); ++x) {
          const key = x + ':' + y, list = grid.get(key) || [];
          list.push([ x0, y0, x1, y1 ]);
          grid.set(key, list);
        }
    };
    for (const plant of f.plants || [])
      for (const o of plantRenderParts(plant)) {
        const q = o.q, w = o.width;
        add(Math.min(q[0], q[2], q[4], q[6]) - w, Math.min(q[1], q[3], q[5], q[7]) - w,
            Math.max(q[0], q[2], q[4], q[6]) + w, Math.max(q[1], q[3], q[5], q[7]) + w);
      }
    for (const o of f.invertebrates || []) {
      if (o[7] === 6)
        continue;
      const span = o[7] === 7 ? o[13] || 0 : o[6] || 0;
      add(o[0] - span - 2, o[1] - span - 2, o[0] + span + 2, o[1] + span + 2);
    }
    plant_geometryState.coverFrame = f;
    plant_geometryState.coverGrid = grid;
    if (plant_geometryState.depthEpoch !== f.render_epoch) {
      plant_geometryState.fishDepths = new Map();
      plant_geometryState.depthEpoch = f.render_epoch;
    }
  }
  const states = plant_geometryState.fishDepths ??= new Map(), radius = p[51] || 4,
        old = states.get(p[4]) || {layer : p[4] % BED_LAYERS, changed : f.step};
  let covered = false;
  for (let y = Math.floor((p[1] - radius) / 64); y <= Math.floor((p[1] + radius) / 64); ++y)
    for (let x = Math.floor((p[0] - radius) / 64); x <= Math.floor((p[0] + radius) / 64); ++x)
      for (const b of plant_geometryState.coverGrid.get(x + ':' + y) || [])
        covered ||= p[0] + radius > b[0] && p[0] - radius < b[2] && p[1] + radius > b[1] &&
                    p[1] - radius < b[3];
  if (!covered && f.step - old.changed >= 160) {
    old.layer =
        Math.floor(((p[4] * .61803398875 + Math.floor(f.step / 240) * .381966) % 1) * BED_LAYERS);
    old.changed = f.step;
  }
  states.set(p[4], old);
  if (states.size > 4096)
    for (const [id] of states)
      if (!f.fish.some(q => q[4] === id))
        states.delete(id);
  return old.layer;
}
function grassPlantColor(p) { return p[PLANT.color]; }

export function grassStemColor(p, stem) {
  const base = grassPlantColor(p),
        phase = Math.sin((p[PLANT.root]?.[3] ?? p[0]) * 1.71 + stem * 2.39),
        shade = .90 + .16 * Math.sin(stem * 2.1 + (p[PLANT.root]?.[3] ?? p[0]) * .73);
  return base.map((v, k) => Math.max(0, v * shade + phase * [ .035, .012, -.025 ][k]));
}

export let plantPartsCache;

export function plantRenderParts(p) {
  const saved = plantPartsCache.get(p);
  if (saved && saved.obstacles === sceneState.frame?.obstacles)
    return saved.parts;
  const parts = p[PLANT.organs].filter(o => o[6] > 1e-9).map(o => ({
                                                               stem : o[0],
                                                               kind : o[1],
                                                               parent : o[2],
                                                               q : o[3],
                                                               width : o[4],
                                                               hardness : o[5],
                                                               energy : o[6],
                                                               vitality : o[7],
                                                               attach : o[8],
                                                               color : o[9],
                                                               biteHardness : o[10],
                                                               notches : o[11] || [],
                                                               cut : o[12] || 0
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
      part.q = part.q.map((v, k) => k % 2 ? Math.max(part.width * scale + .5, y + (v - y) * scale)
                                          : x + (v - x) * scale);
      part.width *= scale;
      if (f && scale > 1 &&
          !plantCurveClear(f, part.q, part.width, part.kind, plant_geometryState.scaleGeometry)) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 4; k++) {
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

function plantProfile(kind, t) {
  if (kind < 2)
    return kind === 0 ? Math.max(0, 1 - t ** 5) ** .45
                      : (1 - .75 * t) * (1 + .5 * Math.exp(-(((t - .93) / .06) ** 2)));
  if (t < .12)
    return .08;
  const v = (t - .12) / .88;
  return Math.max(0, Math.sin(Math.PI * v)) ** (kind === 2 ? .9 : .65) *
         (kind === 2 ? 1 + .06 * Math.sin(10 * Math.PI * v) : 1 - .27 * v);
}
export function plantRibbon(q, width, kind, t) {
  const u = 1 - t, p = plantCurvePoint(q, t),
        dx = 3 * u * u * (q[2] - q[0]) + 6 * u * t * (q[4] - q[2]) + 3 * t * t * (q[6] - q[4]),
        dy = 3 * u * u * (q[3] - q[1]) + 6 * u * t * (q[5] - q[3]) + 3 * t * t * (q[7] - q[5]),
        ddx = 6 * u * (q[4] - 2 * q[2] + q[0]) + 6 * t * (q[6] - 2 * q[4] + q[2]),
        ddy = 6 * u * (q[5] - 2 * q[3] + q[1]) + 6 * t * (q[7] - 2 * q[5] + q[3]),
        length = Math.max(.001, Math.hypot(dx, dy)), curvature = Math.abs(dx * ddy - dy * ddx),
        w = Math.min(width * plantProfile(kind, t),
                     kind >= 2 ? .72 * length ** 3 / Math.max(.00001, curvature) : Infinity);
  return {p, nx : -dy / length, ny : dx / length, width : w};
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

export function plantCurveClear(f, q, width, kind, geometry = plantWakeGeometry(f)) {
  const minX = Math.min(q[0], q[2], q[4], q[6]) - width,
        maxX = Math.max(q[0], q[2], q[4], q[6]) + width,
        minY = Math.min(q[1], q[3], q[5], q[7]) - width,
        maxY = Math.max(q[1], q[3], q[5], q[7]) + width,
        near = geometry.filter(o => o.right >= minX && o.left <= maxX && o.bottom >= minY &&
                                    o.top <= maxY);
  if (!near.length && minY >= 0 && maxY <= f.height)
    return true;
  const steps = Math.max(8, Math.min(64, Math.ceil(Math.hypot(q[6] - q[0], q[7] - q[1]))));
  for (let k = 1; k <= steps; ++k) {
    const t = k / steps, [ x, y ] = plantCurvePoint(q, t),
          margin = width *
                   (kind < 2  ? (kind === 0 ? Math.max(0, 1 - t ** 5) ** .45 : 1 - .75 * t)
                    : t < .12 ? .08
                              : Math.max(0, Math.sin(Math.PI * (t - .12) / .88)) **
                                    (kind === 2 ? .9 : .65) *
                                    (kind === 2 ? 1 + .06 * Math.sin(10 * Math.PI * (t - .12) / .88)
                                                : 1 - .27 * (t - .12) / .88));
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
                                              Math.max(1e-12, dx * dx + dy * dy)));
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

export function plantPartVisible(q, width, c, shifts) {
  if (!c)
    return true;
  const margin = Math.max(0, width || 0) + 24, ox = c.ox, oy = c.oy, s = c.scale;
  const left = Math.min(q[0], q[2], q[4], q[6]) - margin,
        right = Math.max(q[0], q[2], q[4], q[6]) + margin,
        top = Math.min(q[1], q[3], q[5], q[7]) - margin,
        bottom = Math.max(q[1], q[3], q[5], q[7]) + margin;
  return bottom * s + oy >= -160 && top * s + oy <= cameraState.viewportHeight + 160 &&
         shifts.some(shift => (right + shift) * s + ox >= -160 &&
                              (left + shift) * s + ox <= cameraState.viewportWidth + 160);
}

export function prepareGrassWakes(f, c = null, shifts = [ 0 ]) {
  const world = [ f.render_epoch, f.view_context, f.width, f.height ].join(':');
  if (plant_geometryState.grassWakeWorld !== world) {
    plant_geometryState.grassWakeWorld = world;
    plant_geometryState.grassWakeRevision = -1;
    plant_geometryState.grassWakeStep = null;
    plant_geometryState.grassWakeStates.clear();
  }
  if (c && c.scale < 1.5) {
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
        dt = Math.min(40, Math.max(0, elapsed)), width = f.width || 1e9;
  if (elapsed < 0 || elapsed > 240) {
    plant_geometryState.grassWakeStates.clear();
  }
  plant_geometryState.grassWakeStep = step;
  plant_geometryState.grassWakeCurves = new Map();
  const wrap = x => x - width * Math.round(x / width), grid = new Map(), cell = 64,
        priorFish = new Map((sceneState.previous?.fish || []).map(p => [p[4], p])),
        geometry = plantWakeGeometry(f);
  if (dt > 0)
    for (const p of f.fish || []) {
      if (!p[8] || p[23] <= 0)
        continue;
      const old = priorFish.get(p[4]);
      if (!old)
        continue;
      const dx = wrap(p[0] - old[0]), dy = p[1] - old[1],
            speed = Math.hypot(dx, dy) / Math.max(1, elapsed), radius = p[51] ?? 4;
      if (speed < .02 || Math.hypot(dx, dy) > 128)
        continue;
      const fish = {
        ax : p[0] - dx,
        ay : p[1] - dy,
        bx : p[0],
        by : p[1],
        vx : dx / elapsed,
        vy : dy / elapsed,
        radius
      };
      for (const shift of [-width, 0, width]) {
        const shifted = {...fish, ax : fish.ax + shift, bx : fish.bx + shift};
        for (let x = Math.floor((Math.min(fish.ax, fish.bx) + shift - radius - 4) / cell);
             x <= Math.floor((Math.max(fish.ax, fish.bx) + shift + radius + 4) / cell); ++x)
          for (let y = Math.floor((Math.min(fish.ay, fish.by) - radius - 4) / cell);
               y <= Math.floor((Math.max(fish.ay, fish.by) + radius + 4) / cell); ++y) {
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
      q.map((v, k) => v + (k < 2 ? 0 : (k % 2 ? y : x) * [ 0, .16, .62, 1 ][k >> 1]));
  for (const p of f.plants || []) {
    if (!p[9] || !plantRenderParts(p).some(o => plantPartVisible(o.q, o.width, c, shifts)))
      continue;
    const old = oldPlants.get(p[0]), parts = plantRenderParts(p),
          lookup = new Map(parts.map(o => [o.stem, o])),
          prior = new Map((old ? plantRenderParts(old) : []).map(o => [o.stem, o]));
    for (const part of parts) {
      const {stem} = part;
      let q = part.q, inherited = false;
      const parent = grassWakeCurve(p, part.parent);
      if (parent) {
        const raw = lookup.get(part.parent)?.q;
        if (raw) {
          const a = plantCurvePoint(raw, part.attach),
                b = plantCurvePoint(parent.next, part.attach), dx = b[0] - a[0], dy = b[1] - a[1];
          inherited = Math.abs(dx) + Math.abs(dy) > .001;
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
      const height = Math.hypot(q[6] - q[0], q[7] - q[1]), samples = [];
      let tx = 0, ty = 0;
      const minX = Math.min(q[0], q[2], q[4], q[6]), maxX = Math.max(q[0], q[2], q[4], q[6]),
            minY = Math.min(q[1], q[3], q[5], q[7]), maxY = Math.max(q[1], q[3], q[5], q[7]),
            candidates = new Set(), left = Math.floor(minX / cell), right = Math.floor(maxX / cell),
            top = Math.floor(minY / cell), bottom = Math.floor(maxY / cell);
      for (let x = left; x <= right; ++x)
        for (let y = top; y <= bottom; ++y)
          for (const fish of grid.get(x + ':' + y) || []) {
            const r = fish.radius + 4;
            if (Math.max(fish.ax, fish.bx) + r >= minX && Math.min(fish.ax, fish.bx) - r <= maxX &&
                Math.max(fish.ay, fish.by) + r >= minY && Math.min(fish.ay, fish.by) - r <= maxY)
              candidates.add(fish);
          }
      if (candidates.size)
        for (let i = 1; i <= 10; ++i) {
          const t = i / 10, u = 1 - t;
          samples.push([
            u * u * u * q[0] + 3 * u * u * t * q[2] + 3 * u * t * t * q[4] + t * t * t * q[6],
            u * u * u * q[1] + 3 * u * u * t * q[3] + 3 * u * t * t * q[5] + t * t * t * q[7]
          ]);
        }
      for (const fish of candidates) {
        const dx = fish.bx - fish.ax, dy = fish.by - fish.ay, span = dx * dx + dy * dy;
        let distance2 = Infinity;
        for (const [x, y] of samples) {
          const t = Math.max(0, Math.min(1, ((x - fish.ax) * dx + (y - fish.ay) * dy) /
                                                Math.max(1e-9, span))),
                rx = x - fish.ax - t * dx, ry = y - fish.ay - t * dy;
          distance2 = Math.min(distance2, rx * rx + ry * ry);
        }
        const contact = Math.max(0, 1 - Math.sqrt(distance2) / (fish.radius + 4));
        const force = contact * contact * fish.radius * (part.kind >= 2 ? 1.2 : 2.6);
        tx += force * fish.vx;
        ty += force * fish.vy;
      }
      const limit = Math.min(part.kind >= 2 ? 5 : 18, height * (part.kind >= 2 ? .18 : .32)),
            target = Math.hypot(tx, ty);
      if (target > limit) {
        tx *= limit / target;
        ty *= limit / target;
      }
      // Exact damped spring over the snapshot interval; pause and frame rate do not drive it.
      if (dt > 0) {
        const frequency = .20 / Math.sqrt((p[PLANT.fiber] ?? 1) * (part.hardness || 1)),
              decay = frequency * .55, omega = Math.sqrt(frequency * frequency - decay * decay),
              e = Math.exp(-decay * dt), co = Math.cos(omega * dt), si = Math.sin(omega * dt);
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
      if ((Math.abs(state.x) + Math.abs(state.y) > .001 || inherited) &&
          !plantCurveClear(f, next, part.width, part.kind, geometry)) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 6; ++k) {
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
  return plant_geometryState.grassWakeCurves.get(p[0] + ':' + stem);
}

export function algaeDisplay(p, f) {
  const start = p[PLANT.algae_start] ?? 0, end = p[PLANT.algae_end] ?? 1;
  const fill = Math.max(
      0, Math.min(1, p[7] / Math.max(1, (f.parameters?.algae_capacity ?? 1024) *
                                            (p[12] * (end - start) + (p[PLANT.mussel_arc] || 0)) /
                                            16)));
  return {fill, thickness : (f.parameters?.algae_thickness ?? 4) * Math.sqrt(fill), start, end};
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
