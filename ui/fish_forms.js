import {INTERNAL_TISSUE, isSenseTissue, tissueKind} from './tissue.js';
import {
  ANATOMY,
  BODY_UNIT,
  DEVELOPMENT,
  EYE_PLACE,
  FIN,
  FIN_SHAPE,
  FISH,
  FORM_LAYOUT,
  MOTOR_KIND,
  ORGAN_FORM,
  SENSE_KIND
} from './schema.js';
import {FINS, FIN_STROKE, tailDirection} from './fin_stroke.js';
import {rgb} from './dom.js';
import {
  fishBodyPath,
  fishBodyRadius,
  fishBoundingRadius,
  fishDisplayRadius,
  fishPattern,
  fishRenderRadius,
  fishShapeOrigin,
  PATTERN_KIND
} from './fish_fins.js';
import {eggRadius, fishShapeAnatomy} from './fish_geometry.js';
import {horizontalDelta, sceneState} from './state.js';
export const fish_formsState = {};
export let fishAnatomyCache;

function fishGutCapacity(p) {
  const length = p[FISH.organs]?.[ANATOMY.gut_length] ?? BODY_UNIT.trait_middle;
  // Like the engine's gut_capacity: the reserve capacity scaled by the gut length.
  return Math.max(1, p[FISH.reserve_capacity] || BODY_UNIT.adult_reserve) * (1 + length) /
         (1 + BODY_UNIT.trait_middle);
}

// Snapshots quantize the live state in power-of-two bins, BINS_PER_PIXEL per pixel between
// MIN_BINS and MAX_BINS; each asset keeps LAYOUTS layouts with STATES states each.
export const SNAPSHOT = Object.freeze(
    {pixels : 16, min_bins : 4, max_bins : 32, bins_per_pixel : 2, layouts : 8, states : 4});
const snapshotBins = pixels => Math.max(
    SNAPSHOT.min_bins,
    Math.min(SNAPSHOT.max_bins, 2 ** Math.ceil(Math.log2(Math.max(
                                         SNAPSHOT.min_bins, pixels * SNAPSHOT.bins_per_pixel)))));
export function fishSnapshotAnatomy(p, pixels = SNAPSHOT.pixels) {
  const epoch = sceneState.frame?.render_epoch;
  if (epoch !== fish_formsState.fishOverviewEpoch) {
    fish_formsState.fishOverviewEpoch = epoch;
    fish_formsState.fishOverviewShapes = new WeakMap();
  }
  const requested = snapshotBins(pixels);
  const visionKey =
      [ sceneState.frame?.parameters?.vision_eye_offset ?? EYE_PLACE.default_offset ].join(':');
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
        bins = requested,
        signature =
            [
              Math.sqrt(Math.max(0, p[FISH.energy] || 0) /
                        Math.max(1, p[FISH.reserve_capacity] || BODY_UNIT.adult_reserve)),
              Math.sqrt(Math.max(0, p[FISH.egg_yolk] || 0) / Math.max(1, p[FISH.egg_capacity])),
              Math.sqrt(Math.max(0, p[FISH.sperm_store] || 0) /
                        Math.max(1, p[FISH.sperm_capacity])),
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
    if (entries.length > SNAPSHOT.layouts)
      entries.shift();
  }
  a = entry.states.get(signature);
  if (!a) {
    a = fishAnatomy(p);
    a.snapshot = p;
    entry.states.set(signature, a);
    if (entry.states.size > SNAPSHOT.states)
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

// Fins and barbels animate at PHASE_RATE plus PHASE_PER_UNDULATION radians per step, offset per
// fish by its id modulo PHASE_SPREAD; water moves them fully at MOTION_SPEED relative speed.
const SWIM = Object.freeze(
    {phase_rate : .065, phase_per_undulation : .08, phase_spread : 11, motion_speed : 1.5});
const animationPhase = p =>
    (p[FISH.age] || 0) * (SWIM.phase_rate +
                          SWIM.phase_per_undulation * (p[FISH.organs]?.[ANATOMY.undulation] || 0)) +
    (p[FISH.id] || 0) % SWIM.phase_spread;
const waterMotion = p => Math.min(1, (p[FISH.relative_speed] || 0) / SWIM.motion_speed);
// The mouth's share of the body radius, as the engine's mouth_share.
export const mouthShare = jaw => BODY_UNIT.mouth_share_short + BODY_UNIT.mouth_share_span * jaw;
// Movement and face pulses stay continuous; body geometry can reuse a quantized state.
// The body's rear bends with the tail stroke.
function strokeFlex(tailPose, direction) { return FIN_STROKE.body_bend * tailPose * direction; }
export function fishPoseAnatomy(a, p) {
  const direction = tailDirection(p[FISH.fin_pose]?.[FINS]),
        tailPose = Math.max(0, Math.min(1, p[FISH.fin_pose]?.[FIN.tail] || 0));
  return Object.assign({}, a, {
    finShapeCache : null,
    bodyCurvesCache : null,
    flex : strokeFlex(tailPose, direction),
    eyePull : [ p[FISH.eye_pull_left] ?? 1, p[FISH.eye_pull_right] ?? 1 ],
    tailDirection : direction,
    animationPhase : animationPhase(p),
    waterMotion : waterMotion(p),
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

// Organ sizes saturate, half at ORGAN_HALF squared cells; fillings may show up to their maxima.
const ANATOMY_SCALE = Object.freeze({
  organ_half : 3,
  egg_fill_max : 1.6,
  egg_fill : 1.3,
  brain_half : 20,
  sperm_fill_max : 1.5,
  min_radius : .001,
  gut_fill_max : 1.6
});
// An organ's size (0 to 1) from its anatomy column: half at ORGAN_HALF squared.
export const organSize = n => {
  const v = Math.sqrt(Math.max(0, n || 0));
  return v / (v + ANATOMY_SCALE.organ_half);
};
export function fishAnatomy(p, o = null, blend = 1, radius = fishRenderRadius(p),
                            origin = fishShapeOrigin(p)) {
  const organs = p[FISH.organs] || [], forms = p[FISH.forms] || [], fins = p[FISH.fins] || [],
        size = organSize, fin = i => fins[i] || Array(FIN_SHAPE.count).fill(0),
        muscle = column => size(organs[column]);
  const finPose = i =>
      Math.max(0, Math.min(1, ((o?.[FISH.fin_pose]?.[i] ?? p[FISH.fin_pose]?.[i] ?? 0) +
                               ((p[FISH.fin_pose]?.[i] ?? 0) -
                                (o?.[FISH.fin_pose]?.[i] ?? p[FISH.fin_pose]?.[i] ?? 0)) *
                                   blend)));
  const eggLimit = p[FISH.egg_capacity], spermLimit = p[FISH.sperm_capacity];
  const jaw = organs[ANATOMY.jaw_length] ?? BODY_UNIT.trait_middle,
        suction = muscle(ANATOMY.suction_strength), left = size(fin(FIN.left)[FIN_SHAPE.strength]),
        right = size(fin(FIN.right)[FIN_SHAPE.strength]), armor = muscle(ANATOMY.defense_strength),
        attack = muscle(ANATOMY.aggression_strength),
        nose = size((organs[ANATOMY.smell_left] || 0) + (organs[ANATOMY.smell_right] || 0)),
        yolk = Math.max(
            0,
            (o?.[FISH.egg_yolk] ?? p[FISH.egg_yolk] ?? 0) +
                ((p[FISH.egg_yolk] ?? 0) - (o?.[FISH.egg_yolk] ?? p[FISH.egg_yolk] ?? 0)) * blend),
        filled = Math.min(ANATOMY_SCALE.egg_fill_max,
                          ANATOMY_SCALE.egg_fill * Math.sqrt(yolk / Math.max(1, eggLimit))),
        drive = size(fin(FIN.tail)[FIN_SHAPE.strength] + fin(FIN.left)[FIN_SHAPE.strength] +
                     fin(FIN.right)[FIN_SHAPE.strength]),
        gonad = muscle(ANATOMY.egg_strength) + muscle(ANATOMY.sperm_strength);
  const reserve = Math.max(
            0, Math.min(1, (p[FISH.energy] || 0) /
                               Math.max(1, p[FISH.reserve_capacity] || BODY_UNIT.adult_reserve))),
        cord = Math.max(0, organs[ANATOMY.cord] || 0),
        head = Math.max(0, organs[ANATOMY.head] || 0),
        brainGrowth = Math.sqrt(head / (head + ANATOMY_SCALE.brain_half)),
        spermFilled = Math.min(ANATOMY_SCALE.sperm_fill_max,
                               Math.sqrt((p[FISH.sperm_store] || 0) / Math.max(1, spermLimit)));
  const direction = tailDirection(p[FISH.fin_pose]?.[FINS]);
  const aggressionCapacity = Math.max(0, organs[ANATOMY.aggression_strength] ||
                                             (organs[ANATOMY.attack_left] || 0) +
                                                 (organs[ANATOMY.attack_right] || 0)),
        aggressionMaximum = Math.max(1, p[FISH.neuron_budget] || DEVELOPMENT.sites);
  const a = {
    radius,
    origin,
    eyeScale : fishBodyRadius(p) / Math.max(ANATOMY_SCALE.min_radius, radius),
    eyeOffset : sceneState.frame?.parameters?.vision_eye_offset ?? EYE_PLACE.default_offset,
    eyePull : [ p[FISH.eye_pull_left] ?? 1, p[FISH.eye_pull_right] ?? 1 ],
    mouthOffset : Number.isFinite(p[FISH.mouth_offset]) && p[FISH.mouth_offset] > 0
                      ? p[FISH.mouth_offset] / radius
                      : null,
    aperture : (p[FISH.mouth_aperture] > 0 ? p[FISH.mouth_aperture]
                                           : fishBodyRadius(p) * mouthShare(jaw)) /
                   radius,
    tailDirection : direction,
    animationPhase : animationPhase(p),
    waterMotion : waterMotion(p),
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
        [ 0, 1 ].map(side => size(Math.max(0, (organs[ANATOMY.smell_left + side] || 0) -
                                                  (organs[ANATOMY.smell_outer_left + side] || 0)))),
    barbelSides : [ 0, 1 ].map(side => size(organs[ANATOMY.smell_outer_left + side])),
    attackSides : [ size(organs[ANATOMY.attack_left]), size(organs[ANATOMY.attack_right]) ],
    defenseSides : [ size(organs[ANATOMY.armor_left]), size(organs[ANATOMY.armor_right]) ],
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
    gutLength : organs[ANATOMY.gut_length] ?? BODY_UNIT.trait_middle,
    teeth : organs[ANATOMY.blunt_teeth] ?? BODY_UNIT.trait_middle,
    undulation : organs[ANATOMY.undulation] ?? BODY_UNIT.trait_middle,
    gutFilling : Math.min(ANATOMY_SCALE.gut_fill_max,
                          Math.max(0, p[FISH.gut_fill] || 0) / fishGutCapacity(p)),
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
    flex : strokeFlex(finPose(FIN.tail), direction)
  };
  Object.assign(a, fishFeedingPose(p));
  return fishShapeAnatomy(a);
}

// The first form of each organ as the engine lays them out (BrainInterface::sense_form and
// motor_form): the internal tissue, a side pair for each early sense, each early motor, the late
// senses but blood, the late motors, and blood.
const SIDES = 2, EARLY = FORM_LAYOUT.early_organs,
      FIRST_MOTOR = FORM_LAYOUT.first_sense + SIDES * EARLY,
      LATE_SENSE = FIRST_MOTOR + SIDES * EARLY,
      LATE_MOTOR = LATE_SENSE + SIDES * (SENSE_KIND.blood - EARLY),
      BLOOD = LATE_MOTOR + SIDES * (Object.keys(MOTOR_KIND).length - EARLY);
export function formIndex(key) {
  if (key === INTERNAL_TISSUE)
    return FORM_LAYOUT.internal;
  const k = tissueKind(key);
  if (isSenseTissue(key))
    return k === SENSE_KIND.blood ? BLOOD
           : k < EARLY            ? FORM_LAYOUT.first_sense + SIDES * k
                                  : LATE_SENSE + SIDES * (k - EARLY);
  return k < EARLY ? FIRST_MOTOR + SIDES * k : LATE_MOTOR + SIDES * (k - EARLY);
}
// Placement coordinates of a form, before its weight; a form without weight counts fully.
const PLACEMENT = [ 'x', 'y', 'z', 'sy', 'sz' ];
// Where an organ without cells sits, and how far it spreads.
const ABSENT_FORM = Object.freeze({
  x : FORM_LAYOUT.absent_place,
  y : FORM_LAYOUT.absent_place,
  z : FORM_LAYOUT.absent_place,
  sy : FORM_LAYOUT.absent_spread,
  sz : FORM_LAYOUT.absent_spread,
  weight : 0
});
// Organs grow with their cells in units of GROWTH_UNIT cell weights; gamete organs with the
// power GAMETE_GROWTH.
const GROWTH_UNIT = 8;
export const GAMETE_GROWTH = .26;
export const organGrowth = (f, power) => Math.pow(1 + f.weight / GROWTH_UNIT, power);
// A form or region as sent: its placement and weight.
export function formRecord(p) {
  return {
    ...Object.fromEntries(PLACEMENT.map(name => [name, p[ORGAN_FORM[name]]])),
    weight : p[ORGAN_FORM.weight]
  };
}
// Organ shape uses the same normalized coordinates as the cells it contains.
export function fishForm(a, key, side = -1) {
  const cache = a.formCache ??= new Map(), cacheKey = key + ':' + side;
  if (cache.has(cacheKey))
    return cache.get(cacheKey);
  const index = formIndex(key),
        parts = key === INTERNAL_TISSUE ? [ a.forms?.[index] ]
                : side < 0              ? [ a.forms?.[index], a.forms?.[index + 1] ]
                                        : [ a.forms?.[index + side] ],
        sum = Object.fromEntries(PLACEMENT.map(name => [name, 0]));
  let weight = 0;
  for (const p of parts)
    if (p?.length) {
      const w = p[ORGAN_FORM.weight] ?? 1;
      if (w <= 0)
        continue;
      weight += w;
      for (const name of PLACEMENT)
        sum[name] += p[ORGAN_FORM[name]] * w;
    }
  const form =
      weight ? {...Object.fromEntries(PLACEMENT.map(name => [name, sum[name] / weight])), weight}
             : ABSENT_FORM;
  cache.set(cacheKey, form);
  return form;
}

// An organ spans BASE plus PER_SPREAD of its cells' spread, centred by their place, between
// FIRST and LAST.
const ORGAN_SPAN = Object.freeze({
  max : .94,
  base : .25,
  per_spread : 1.9,
  center : .2,
  center_per_place : .6,
  first : .025,
  last : .975
});
export function fishOrganSpan(a, key, side) {
  const f = fishForm(a, key, side),
        span = Math.min(ORGAN_SPAN.max, ORGAN_SPAN.base + ORGAN_SPAN.per_spread * f.sy),
        center = ORGAN_SPAN.center + ORGAN_SPAN.center_per_place * f.y;
  return {
    f,
    start : Math.max(ORGAN_SPAN.first, Math.min(ORGAN_SPAN.last - span, center - span / 2)),
    span
  };
}

// Along coordinates: the head ends at HEAD, the chest at CHEST and the hind body at TAIL.
export const ALONG = Object.freeze({head : .18, chest : -.22, tail : -.87});
export function fishAlong(a, x) {
  return x >= ALONG.head ? x
         : x >= ALONG.chest
             ? a.headBack + (x - ALONG.head) / (ALONG.head - ALONG.chest) * a.chestLength
             : a.chestBack + (x - ALONG.chest) / (ALONG.chest - ALONG.tail) * a.hindLength;
}

// Hits count within an ellipse from the snout to TAIL behind the centre.
const HIT = Object.freeze({tail : .95});
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
        localY = (-dx * s + dy * c) / radius + (a.origin?.[1] || 0), tail = fishAlong(a, -HIT.tail),
        center = (a.snout + tail) / 2, rx = (a.snout - tail) / 2 + padding / radius,
        ry = Math.max(a.shoulder, ...a.flank) + padding / radius;
  return ((localX - center) / rx) ** 2 + (localY / ry) ** 2 <= 1;
}

// Spot patterns: ROWS rows of hashed spots per stripe, jittered and staggered.
export const PATTERN_SPOTS = Object.freeze({
  rows : 3,
  hash_i : 12.73,
  hash_j : 29.1,
  hash_phase : 47,
  hash_scale : 437.58,
  radius : .14,
  radius_noise : .07,
  jitter : .22,
  stagger : .37
});
function fishPatternSpots(pattern) {
  const spots = [];
  for (let i = 0; i < pattern.count; i++)
    for (let j = 0; j < PATTERN_SPOTS.rows; j++) {
      const hash = Math.sin(i * PATTERN_SPOTS.hash_i + j * PATTERN_SPOTS.hash_j +
                            pattern.phase * PATTERN_SPOTS.hash_phase) *
                   PATTERN_SPOTS.hash_scale,
            noise = hash - Math.floor(hash),
            radius = PATTERN_SPOTS.radius + PATTERN_SPOTS.radius_noise * noise;
      spots.push([
        (i + .5 - (noise - .5) * PATTERN_SPOTS.jitter) / pattern.count,
        -(j + .5 - (i * PATTERN_SPOTS.stagger) % 1) / PATTERN_SPOTS.rows, radius / pattern.count,
        radius / PATTERN_SPOTS.rows
      ]);
    }
  return spots;
}

// Dark pattern ink, scaled by the light.
export const PATTERN_INK = Object.freeze([ .025, .075, .11 ]);
// Pattern drawing in body lengths along and flank widths across; the pattern phase turns each
// wave by PHASE_TURNS radians.
export const PATTERN = Object.freeze({
  clip_height : 3,
  stripe_start : .13,
  stripe_span : .76,
  stripe_steps : 16,
  stripe_reach : 1.5,
  stripe_slant : .06,
  stripe_wave : .025,
  stripe_wave_rate : 3,
  stripe_wave_offset : 9,
  phase_turns : 6,
  bar_width : .070,
  stripe_width : .026,
  line_steps : 12,
  line_place : .12,
  line_wave : .13,
  line_wave_rate : 5,
  line_width : .22,
  line_accent : .06,
  saddle_start : .05,
  saddle_steps : 14,
  saddle_edge : .42,
  saddle_wave : .12,
  saddle_wave_rate : 7,
  saddle_line : .05,
  band_first : .30,
  band_second : .70,
  band_half : .04,
  band_reach : 1.5,
  band_width : .08,
  band_cover : 3
});
export function paintFishPattern(g, p, r, a, opacity, light) {
  const q = fishPattern(a), length = a.snout - a.tailRoot, width = Math.max(a.shoulder, ...a.flank),
        x = u => (a.tailRoot + u * length) * r, y = v => v * width * r,
        ink = PATTERN_INK.map(v => v * light), accent = q.accent.map(v => v * light);
  g.save();
  fishBodyPath(g, r, a);
  g.clip();
  g.globalAlpha = opacity * q.amount;
  for (const side of [-1, 1]) {
    g.save();
    g.scale(1, side);
    g.beginPath();
    g.rect((a.tailRoot - 1) * r, -width * r * PATTERN.clip_height, (length + 2) * r,
           width * r * PATTERN.clip_height);
    g.clip();
    g.fillStyle = rgb(ink);
    g.strokeStyle = rgb(ink);
    g.lineCap = 'round';
    if (q.kind === PATTERN_KIND.stripes || q.kind === PATTERN_KIND.bars) {
      for (let k = 0; k < q.count; k++) {
        const base = PATTERN.stripe_start + PATTERN.stripe_span * (k + .5) / q.count;
        g.beginPath();
        for (let j = 0; j <= PATTERN.stripe_steps; j++) {
          const v = j / PATTERN.stripe_steps * PATTERN.stripe_reach,
                u = base + PATTERN.stripe_slant * v -
                    PATTERN.stripe_wave *
                        Math.sin(v * PATTERN.stripe_wave_rate + base * PATTERN.stripe_wave_offset +
                                 q.phase * PATTERN.phase_turns);
          if (j)
            g.lineTo(x(u), y(-v));
          else
            g.moveTo(x(u), y(-v));
        }
        g.lineWidth =
            (q.kind === PATTERN_KIND.bars ? PATTERN.bar_width : PATTERN.stripe_width) * length * r;
        g.stroke();
      }
    } else if (q.kind === PATTERN_KIND.line) {
      g.beginPath();
      for (let k = 0; k <= PATTERN.line_steps; k++) {
        const u = k / PATTERN.line_steps,
              v = -PATTERN.line_place + PATTERN.line_wave * Math.sin(u * PATTERN.line_wave_rate +
                                                                     q.phase * PATTERN.phase_turns);
        if (k)
          g.lineTo(x(u), y(v));
        else
          g.moveTo(x(u), y(v));
      }
      g.lineWidth = PATTERN.line_width * width * r;
      g.stroke();
      g.strokeStyle = rgb(accent);
      g.lineWidth = PATTERN.line_accent * width * r;
      g.stroke();
    } else if (q.kind === PATTERN_KIND.spots) {
      g.fillStyle = rgb(accent);
      for (const [u, v, rx, ry] of fishPatternSpots(q)) {
        g.beginPath();
        g.ellipse(x(u), y(v), rx * length * r, ry * width * r, 0, 0, 2 * Math.PI);
        g.fill();
      }
    } else if (q.kind === PATTERN_KIND.saddle) {
      g.fillStyle = rgb(accent);
      g.beginPath();
      g.moveTo(x(0), y(PATTERN.saddle_start));
      for (let k = 0; k <= PATTERN.saddle_steps; k++) {
        const u = k / PATTERN.saddle_steps;
        g.lineTo(x(u), y(-PATTERN.saddle_edge +
                         PATTERN.saddle_wave * Math.sin(u * PATTERN.saddle_wave_rate +
                                                        q.phase * PATTERN.phase_turns)));
      }
      g.lineTo(x(1), y(-2));
      g.lineTo(x(0), y(-2));
      g.closePath();
      g.fill();
      g.strokeStyle = rgb(ink);
      g.lineWidth = PATTERN.saddle_line * width * r;
      g.stroke();
    } else {
      g.fillStyle = rgb(accent);
      for (const u of [PATTERN.band_first, PATTERN.band_second]) {
        g.beginPath();
        g.rect(x(u - PATTERN.band_half), y(-PATTERN.band_reach), length * r * PATTERN.band_width,
               width * r * PATTERN.band_cover);
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
