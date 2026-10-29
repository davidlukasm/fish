import {FISH, ANATOMY} from './schema.js';
import {rgb} from './dom.js';
import {
  fishBodyPath,
  fishBodyRadius,
  fishBoundingRadius,
  fishDisplayRadius,
  fishPattern,
  fishRenderRadius,
  fishShapeOrigin
} from './fish_fins.js';
import {eggRadius, fishShapeAnatomy} from './fish_geometry.js';
import {horizontalDelta, sceneState} from './state.js';
export const fish_formsState = {};
export let fishAnatomyCache;

export function fishGutCapacity(p) {
  const length = p[FISH.organs]?.[ANATOMY.gut_length] ?? .5;
  return Math.max(1, p[FISH.reserve_capacity] || 400) * (1 + length) / 1.5;
}

export function fishSnapshotAnatomy(p, pixels = 16) {
  const epoch = sceneState.frame?.render_epoch;
  if (epoch !== fish_formsState.fishOverviewEpoch) {
    fish_formsState.fishOverviewEpoch = epoch;
    fish_formsState.fishOverviewShapes = new WeakMap();
  }
  const requested = Math.max(4, Math.min(32, 2 ** Math.ceil(Math.log2(Math.max(4, pixels * 2)))));
  const visionKey = [ sceneState.frame?.parameters?.vision_eye_offset ?? 2.4 ].join(':');
  let cached = fishAnatomyCache.get(p), a;
  if (cached?.bins >= requested && cached.visionKey === visionKey)
    return cached.anatomy;
  // Shared immutable render assets also share geometry; identity alone never changes a shape.
  const asset = p[FISH.forms] || p,
        layout =
            [
              p[FISH.organs], p[FISH.fins], p[FISH.contour], p[FISH.regions], p[FISH.body_geometry],
              p.shapePlans, p[FISH.neuron_budget]
            ],
        bins = Math.max(4, Math.min(32, 2 ** Math.ceil(Math.log2(Math.max(4, pixels * 2))))),
        signature =
            [
              Math.sqrt(Math.max(0, p[FISH.energy] || 0) /
                        Math.max(1, p[FISH.reserve_capacity] || 400)),
              Math.sqrt(Math.max(0, p[FISH.egg_yolk] || 0) /
                        Math.max(1, p[FISH.egg_capacity] || 160)),
              Math.sqrt(Math.max(0, p[FISH.sperm_store] || 0) /
                        Math.max(1, p[FISH.sperm_capacity] || 40)),
              Math.sqrt(Math.max(0, p[FISH.gut_fill] || 0) / fishGutCapacity(p)),
              (p[FISH.egg_yolk] > 0 ? eggRadius(p[FISH.egg_yolk]) : 0) / fishRenderRadius(p)
            ].map(v => Math.round(v * bins))
                .concat(bins, visionKey)
                .join(':');
  let entries = fish_formsState.fishOverviewShapes.get(asset);
  if (!entries) {
    entries = [];
    fish_formsState.fishOverviewShapes.set(asset, entries);
  }
  let entry = entries.find(e => layout.every((v, i) => v === e.layout[i]));
  if (!entry) {
    entry = {layout, states : new Map()};
    entries.push(entry);
    if (entries.length > 8)
      entries.shift();
  }
  a = entry.states.get(signature);
  if (!a) {
    a = fishAnatomy(p);
    a.snapshot = p;
    entry.states.set(signature, a);
    if (entry.states.size > 4)
      entry.states.delete(entry.states.keys().next().value);
  }
  fishAnatomyCache.set(p, {bins, anatomy : a, visionKey});
  return a;
}

// One physical jaw; pump flow and contact effects are independent overlays.
export function fishFeedingPose(p) {
  return {
    mouthOpening : p[FISH.mouth_pose] || 0,
    bitePose : p[FISH.bite_pose] || 0,
    swallowPose : p[FISH.suction_pose] || 0
  };
}

// Movement and face pulses stay continuous; body geometry can reuse a quantized state.
export function fishPoseAnatomy(a, p) {
  return Object.assign({}, a, {
    finShapeCache : null,
    eyePull : [ p[FISH.eye_pull_left] ?? 1, p[FISH.eye_pull_right] ?? 1 ],
    tailDirection : Math.sign(p[FISH.fin_pose]?.[3]?.[2] || 1),
    animationPhase :
        (p[FISH.age] || 0) * (.065 + .08 * (p[FISH.organs]?.[ANATOMY.undulation] || 0)) +
            (p[FISH.id] || 0) % 11,
    waterMotion : Math.min(1, (p[FISH.relative_speed] || 0) / 1.5),
    finPose : i => Math.max(0, Math.min(1, p[FISH.fin_pose]?.[i] || 0)),
    defenseActivity : p[FISH.defense] || 0,
    mouthOpening : p[FISH.mouth_pose] || 0,
    feedingAction : p[FISH.feeding_action] || 0,
    bitePose : p[FISH.bite_pose] || 0,
    swallowPose : p[FISH.suction_pose] || 0,
    aggression : p[FISH.aggression] || 0,
    typicalAggression : p[FISH.mean_aggression] || 0
  },
                       fishFeedingPose(p));
}

export function fishAnatomy(p, o = null, blend = 1, radius = fishRenderRadius(p),
                            origin = fishShapeOrigin(p)) {
  const organs = p[FISH.organs] || [], forms = p[FISH.forms] || [], fins = p[FISH.fins] || [],
        size = n => {
          const v = Math.sqrt(Math.max(0, n || 0));
          return v / (v + 3);
        }, fin = i => fins[i] || [ 0, 0, 0, 0, 0 ], muscle = i => size(organs[21 + i]);
  const finPose = i =>
      Math.max(0, Math.min(1, ((o?.[FISH.fin_pose]?.[i] ?? p[FISH.fin_pose]?.[i] ?? 0) +
                               ((p[FISH.fin_pose]?.[i] ?? 0) -
                                (o?.[FISH.fin_pose]?.[i] ?? p[FISH.fin_pose]?.[i] ?? 0)) *
                                   blend)));
  const growth = (p[FISH.tissue] ?? ((p[FISH.reserve_capacity] || 400) * 40 / 400)) / 40,
        eggLimit =
            p[FISH.egg_capacity] ?? ((sceneState.frame?.parameters?.egg_capacity || 160) * growth),
        spermLimit = p[FISH.sperm_capacity] ??
                     ((sceneState.frame?.parameters?.sperm_capacity || 40) * growth);
  const jaw = organs[ANATOMY.jaw_length] ?? .5, suction = muscle(0), left = size(fin(1)[1]),
        right = size(fin(2)[1]), armor = muscle(7), attack = muscle(8),
        nose = size((organs[9] || 0) + (organs[10] || 0)),
        yolk = Math.max(
            0,
            (o?.[FISH.egg_yolk] ?? p[FISH.egg_yolk] ?? 0) +
                ((p[FISH.egg_yolk] ?? 0) - (o?.[FISH.egg_yolk] ?? p[FISH.egg_yolk] ?? 0)) * blend),
        filled = Math.min(1.6, 1.3 * Math.sqrt(yolk / Math.max(1, eggLimit))),
        drive = size(fin(0)[1] + fin(1)[1] + fin(2)[1]), gonad = muscle(5) + muscle(6);
  const reserve = Math.max(
            0, Math.min(1, (p[FISH.energy] || 0) / Math.max(1, p[FISH.reserve_capacity] || 400))),
        cord = Math.max(0, organs[37] || 0), head = Math.max(0, organs[34] || 0),
        brainGrowth = Math.sqrt(head / (head + 20)),
        spermFilled =
            Math.min(1.5, Math.sqrt((p[FISH.sperm_store] || 0) / Math.max(1, spermLimit)));
  const deflection = (o?.[FISH.tail] ?? p[FISH.tail] ?? 0) +
                     ((p[FISH.tail] ?? 0) - (o?.[FISH.tail] ?? p[FISH.tail] ?? 0)) * blend;
  const aggressionCapacity = Math.max(0, organs[29] || (organs[30] || 0) + (organs[31] || 0)),
        aggressionMaximum = Math.max(1, p[FISH.neuron_budget] || 512);
  const a = {
    radius,
    origin,
    eyeScale : fishBodyRadius(p) / Math.max(.001, radius),
    eyeOffset : sceneState.frame?.parameters?.vision_eye_offset ?? 2.4,
    eyePull : [ p[FISH.eye_pull_left] ?? 1, p[FISH.eye_pull_right] ?? 1 ],
    mouthOffset : Number.isFinite(p[FISH.mouth_offset]) && p[FISH.mouth_offset] > 0
                      ? p[FISH.mouth_offset] / radius
                      : null,
    aperture : (p[FISH.mouth_aperture] > 0 ? p[FISH.mouth_aperture]
                                           : fishBodyRadius(p) * (.28 + .44 * jaw)) /
                   radius,
    tailDirection : Math.sign(p[FISH.fin_pose]?.[3]?.[2] || 1),
    animationPhase :
        (p[FISH.age] || 0) * (.065 + .08 * (p[FISH.organs]?.[ANATOMY.undulation] || 0)) +
            (p[FISH.id] || 0) % 11,
    waterMotion : Math.min(1, (p[FISH.relative_speed] || 0) / 1.5),
    regions : p[FISH.regions] || [],
    bodyGeometry : p[FISH.body_geometry],
    shapePlans : p.shapePlans,
    contour : p[FISH.contour] || [],
    eggLimit,
    spermLimit,
    aggressionCapacity,
    aggressionMaximum,
    organs,
    forms,
    fins,
    size,
    fin,
    head,
    brainGrowth,
    cord,
    birthing : !!p.birthing,
    birthProgress : p.birthProgress ?? -1,
    birthDuct : p.birthDuct,
    muscle,
    finPose,
    sperm : p[FISH.sperm_store] || 0,
    spermFilled,
    mass : p[FISH.mass] || 1,
    reserve,
    noseSides :
        [ 0, 1 ].map(side => size(Math.max(0, (organs[9 + side] || 0) - (organs[35 + side] || 0)))),
    barbelSides : [ 0, 1 ].map(side => size(organs[35 + side])),
    attackSides : [ size(organs[30]), size(organs[31]) ],
    defenseSides : [ size(organs[32]), size(organs[33]) ],
    defenseActivity : p[FISH.defense] || 0,
    mouthOpening :
        (o?.[FISH.mouth_pose] ?? p[FISH.mouth_pose] ?? 0) +
            ((p[FISH.mouth_pose] ?? 0) - (o?.[FISH.mouth_pose] ?? p[FISH.mouth_pose] ?? 0)) * blend,
    bitePose :
        (o?.[FISH.bite_pose] ?? p[FISH.bite_pose] ?? 0) +
            ((p[FISH.bite_pose] ?? 0) - (o?.[FISH.bite_pose] ?? p[FISH.bite_pose] ?? 0)) * blend,
    swallowPose :
        (o?.[FISH.suction_pose] ?? p[FISH.suction_pose] ?? 0) +
            ((p[FISH.suction_pose] ?? 0) - (o?.[FISH.suction_pose] ?? p[FISH.suction_pose] ?? 0)) *
                blend,
    typicalAggression : p[FISH.mean_aggression] || 0,
    aggression : p[FISH.aggression] || 0,
    jaw,
    suction,
    gutLength : organs[ANATOMY.gut_length] ?? .5,
    teeth : organs[ANATOMY.blunt_teeth] ?? .5,
    undulation : organs[ANATOMY.undulation] ?? .5,
    gutFilling : Math.min(1.6, Math.max(0, p[FISH.gut_fill] || 0) / fishGutCapacity(p)),
    feedingAction : p[FISH.feeding_action] || 0,
    left,
    right,
    armor,
    attack,
    nose,
    yolk,
    filled,
    drive,
    gonad,
    deflection,
    flex : 0
  };
  Object.assign(a, fishFeedingPose(p));
  return fishShapeAnatomy(a);
}

// Organ shape uses the same normalized coordinates as the cells it contains.
export function fishForm(a, key, side = -1) {
  const cache = a.formCache ??= new Map(), cacheKey = key + ':' + side;
  if (cache.has(cacheKey))
    return cache.get(cacheKey);
  const index = key === 'internal'
                    ? 0
                    : (key[0] === 's'
                           ? (key === 's10'              ? 41
                              : Number(key.slice(1)) < 8 ? 1 + 2 * Number(key.slice(1))
                                                         : 33 + 2 * (Number(key.slice(1)) - 8))
                           : (Number(key.slice(1)) < 8 ? 17 + 2 * Number(key.slice(1))
                                                       : 37 + 2 * (Number(key.slice(1)) - 8))),
        parts = key === 'internal' ? [ a.forms?.[0] ]
                : side < 0         ? [ a.forms?.[index], a.forms?.[index + 1] ]
                                   : [ a.forms?.[index + side] ],
        q = [ 0, 0, 0, 0, 0 ];
  let weight = 0;
  for (const p of parts)
    if (p?.length) {
      const w = p[5] === undefined ? 1 : p[5];
      if (w <= 0)
        continue;
      weight += w;
      for (let k = 0; k < 5; k++)
        q[k] += p[k] * w;
    }
  const form = weight ? {
    x : q[0] / weight,
    y : q[1] / weight,
    z : q[2] / weight,
    sy : q[3] / weight,
    sz : q[4] / weight,
    weight
  }
                      : {x : .5, y : .5, z : .5, sy : .18, sz : .18, weight : 0};
  cache.set(cacheKey, form);
  return form;
}

export function fishOrganSpan(a, key, side) {
  const f = fishForm(a, key, side), span = Math.min(.94, .25 + 1.9 * f.sy), center = .2 + .6 * f.y;
  return {f, start : Math.max(.025, Math.min(.975 - span, center - span / 2)), span};
}

export function fishAlong(a, x) {
  return x >= .18    ? x
         : x >= -.22 ? a.headBack + (x - .18) / .40 * a.chestLength
                     : a.chestBack + (x + .22) / .65 * a.hindLength;
}

export function fishBodyContains(p, x, y, padding = 0, scale = 0) {
  const dx = horizontalDelta(x - p[FISH.x]), dy = y - p[FISH.y],
        bound = fishBoundingRadius(p) + padding;
  if (Math.abs(dx) > bound || Math.abs(dy) > bound)
    return false;
  const radius = scale ? fishDisplayRadius(p, scale) / scale : fishRenderRadius(p);
  if (!p[FISH.hatched])
    return Math.hypot(dx, dy) <= radius + padding;
  const a = fishAnatomy(p), c = Math.cos(p[FISH.angle]), s = Math.sin(p[FISH.angle]),
        localX = (dx * c + dy * s) / radius + (a.origin?.[0] || 0),
        localY = (-dx * s + dy * c) / radius + (a.origin?.[1] || 0), tail = fishAlong(a, -.95),
        center = (a.snout + tail) / 2, rx = (a.snout - tail) / 2 + padding / radius,
        ry = Math.max(a.shoulder, ...a.flank) + padding / radius;
  return ((localX - center) / rx) ** 2 + (localY / ry) ** 2 <= 1;
}

export function fishPatternSpots(pattern) {
  const spots = [];
  for (let i = 0; i < pattern.count; i++)
    for (let j = 0; j < 3; j++) {
      const hash = Math.sin(i * 12.73 + j * 29.1 + pattern.phase * 47) * 437.58,
            noise = hash - Math.floor(hash), radius = .14 + .07 * noise;
      spots.push([
        (i + .5 - (noise - .5) * .22) / pattern.count, -(j + .5 - (i * .37) % 1) / 3,
        radius / pattern.count, radius / 3
      ]);
    }
  return spots;
}

export function paintFishPattern(g, p, r, a, opacity, light) {
  const q = fishPattern(a), length = a.snout - a.tailRoot, width = Math.max(a.shoulder, ...a.flank),
        x = u => (a.tailRoot + u * length) * r, y = v => v * width * r,
        ink = [ .025, .075, .11 ].map(v => v * light), accent = q.accent.map(v => v * light);
  g.save();
  fishBodyPath(g, r, a);
  g.clip();
  g.globalAlpha = opacity * q.amount;
  for (const side of [-1, 1]) {
    g.save();
    g.scale(1, side);
    g.beginPath();
    g.rect((a.tailRoot - 1) * r, -width * r * 3, (length + 2) * r, width * r * 3);
    g.clip();
    g.fillStyle = rgb(ink);
    g.strokeStyle = rgb(ink);
    g.lineCap = 'round';
    if (q.kind === 0 || q.kind === 3) {
      for (let k = 0; k < q.count; k++) {
        const base = .13 + .76 * (k + .5) / q.count;
        g.beginPath();
        for (let j = 0; j <= 16; j++) {
          const v = j / 16 * 1.5,
                u = base + .06 * v - .025 * Math.sin(v * 3 + base * 9 + q.phase * 6);
          if (j)
            g.lineTo(x(u), y(-v));
          else
            g.moveTo(x(u), y(-v));
        }
        g.lineWidth = (q.kind === 3 ? .070 : .026) * length * r;
        g.stroke();
      }
    } else if (q.kind === 1) {
      g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const u = k / 12, v = -.12 + .13 * Math.sin(u * 5 + q.phase * 6);
        if (k)
          g.lineTo(x(u), y(v));
        else
          g.moveTo(x(u), y(v));
      }
      g.lineWidth = .22 * width * r;
      g.stroke();
      g.strokeStyle = rgb(accent);
      g.lineWidth = .06 * width * r;
      g.stroke();
    } else if (q.kind === 2) {
      g.fillStyle = rgb(accent);
      for (const [u, v, rx, ry] of fishPatternSpots(q)) {
        g.beginPath();
        g.ellipse(x(u), y(v), rx * length * r, ry * width * r, 0, 0, 2 * Math.PI);
        g.fill();
      }
    } else if (q.kind === 4) {
      g.fillStyle = rgb(accent);
      g.beginPath();
      g.moveTo(x(0), y(.05));
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        g.lineTo(x(u), y(-.42 + .12 * Math.sin(u * 7 + q.phase * 6)));
      }
      g.lineTo(x(1), y(-2));
      g.lineTo(x(0), y(-2));
      g.closePath();
      g.fill();
      g.strokeStyle = rgb(ink);
      g.lineWidth = .05 * width * r;
      g.stroke();
    } else {
      g.fillStyle = rgb(accent);
      for (const u of [.30, .70]) {
        g.beginPath();
        g.rect(x(u - .04), y(-1.5), length * r * .08, width * r * 3);
        g.fill();
      }
    }
    g.restore();
  }
  g.restore();
}

const initializers = {
  "fishAnatomyCache" : () => { fishAnatomyCache = new WeakMap(); },
  "fishOverviewEpoch" : () => { fish_formsState.fishOverviewEpoch = null; },
  "fishOverviewShapes" : () => { fish_formsState.fishOverviewShapes = new WeakMap(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
