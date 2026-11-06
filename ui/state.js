import {SECOND_MS, wrapAngle} from './units.js';
import {
  CORPSE,
  EDIT_LIMIT,
  FEEDING_EFFECT,
  FEEDING_EFFECT_STEPS,
  FISH,
  FOOD,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  MOUTH_CYCLE,
  TOLERANCE
} from './schema.js';
import {FINS, blendedFinPose} from './fin_stroke.js';

export const sceneState = {};

export function displayNow() { return sceneState.renderTime ?? Date.now(); }

export let frameIndexes;

export const PLAYBACK = Object.freeze(
    {interval_ms : 50, buffer : 16, ahead : 2, delay_ms : 150, stale_ms : 2000, speed_limit : 3});
export function frameIndex(items, key) {
  let saved = frameIndexes.get(items);
  if (!saved || saved.length !== items.length) {
    saved = {length : items.length, byId : new Map(items.map(p => [p[key], p]))};
    frameIndexes.set(items, saved);
  }
  return saved.byId;
}

export function frameFish(f, id = f?.selected) {
  return f && id ? frameIndex(f.fish, FISH.id).get(id) : undefined;
}

export function frameCorpse(f, id = f?.selected) {
  return f && id ? (f.corpses || []).find(c => c[CORPSE.source_id] === id) : undefined;
}

export function frameSpecies(f, id) {
  return f && id ? frameIndex(f.species, 'id').get(id) : undefined;
}

export function resetInterpolation(now) {
  sceneState.playback = null;
  sceneState.previous = null;
  sceneState.previousFish.clear();
  sceneState.previousFood.clear();
  sceneState.previousInvertebrates?.clear();
  sceneState.previousCorpses.clear();
  sceneState.eggBirths.clear();
  sceneState.maternalBirths.clear();
  sceneState.frameTime = now;
  sceneState.frameInterval = PLAYBACK.interval_ms;
  sceneState.tankPreviewFish = 0;
}

export function horizontalDelta(dx, width = sceneState.frame?.width) {
  return width ? dx - width * Math.round(dx / width) : dx;
}

export function wrapScreenX(x) {
  return sceneState.frame ? x - sceneState.frame.width * Math.floor(x / sceneState.frame.width) : x;
}

export function displayStep(f = sceneState.frame, blend = frameBlend()) {
  return sceneState.previous
             ? sceneState.previous.step + (f.step - sceneState.previous.step) * blend
             : f.step;
}

let frameTaker = storeFrame;
export function takeFramesWith(take) { frameTaker = take; }

// Keep two received states ahead of playback. Packet jitter then consumes the
// buffer instead of repeatedly stopping and restarting each object's motion.
export function receiveFrame(next, now = Date.now()) {
  const key = [
    next.render_epoch, next.view_context, next.observation?.key, next.width, next.height,
    next.turbo, next.paused, next.selected
  ].join(':');
  let playback = sceneState.playback;
  if (!playback || playback.key !== key || next.step < playback.points.at(-1).frame.step ||
      now - playback.points.at(-1).at > PLAYBACK.stale_ms || next.paused || next.turbo) {
    frameTaker(next, now);
    sceneState.playback = {key, points : [ {frame : next, at : now} ], shown : next};
    return;
  }
  const last = playback.points.at(-1);
  if (next.step === last.frame.step) {
    last.frame = next;
    return;
  }
  playback.points.push({frame : next, at : Math.max(now, last.at + 1)});
  if (playback.points.length > PLAYBACK.buffer)
    playback.points.shift();
}

export const HELD_ACTION_SECONDS = 3;

export function stepsInSeconds(seconds) {
  const points = sceneState.playback?.points || [], first = points[0], last = points.at(-1),
        measured = points.length > 1 && last.at > first.at
                       ? SECOND_MS * (last.frame.step - first.frame.step) / (last.at - first.at)
                       : 0,
        rate = measured || SECOND_MS / Math.max(1, sceneState.frame?.delay_ms || EDIT_LIMIT.delay);
  return Math.max(1, Math.min(EDIT_LIMIT.max_held_steps, Math.round(rate * seconds)));
}

export function advanceScene(now = Date.now()) {
  const playback = sceneState.playback;
  if (!playback || playback.points.length < PLAYBACK.ahead)
    return;
  const delay = Math.max(PLAYBACK.delay_ms, playback.points.at(-1).frame.delay_ms || 0),
        target = now - delay;
  while (playback.points.length > PLAYBACK.ahead && playback.points[1].at <= target)
    playback.points.shift();
  const [from, to] = playback.points;
  if (target < from.at || playback.shown === to.frame)
    return;
  frameTaker(to.frame, from.at + delay, from.frame, to.at - from.at);
  playback.shown = to.frame;
}

export function frameBlend(now = displayNow()) {
  return Math.max(0, Math.min(1, (now - sceneState.frameTime) / sceneState.frameInterval));
}

function fishPositionBlend(old, p, t) {
  const dt = Math.max(0, (p[FISH.age] ?? 0) - (old[FISH.age] ?? p[FISH.age] ?? 0)),
        d = Math.hypot(horizontalDelta(p[FISH.x] - old[FISH.x]), p[FISH.y] - old[FISH.y]);
  if (!dt || d < TOLERANCE.precision)
    return t;
  const limit = PLAYBACK.speed_limit;
  let a = Math.max(0, Math.min(limit, (old[FISH.speed] || 0) * dt / d)),
      b = Math.max(0, Math.min(limit, (p[FISH.speed] || 0) * dt / d)), norm = Math.hypot(a, b);
  if (norm > limit) {
    a *= limit / norm;
    b *= limit / norm;
  }
  return (-2 * t + 3) * t * t + t * (t - 1) * (t - 1) * a + (t - 1) * t * t * b;
}

function fishStrokePose(p, old, t) {
  const age = (old[FISH.age] ?? p[FISH.age]) + (p[FISH.age] - (old[FISH.age] ?? p[FISH.age])) * t;
  return blendedFinPose(p[FISH.fin_pose]?.[FINS], old[FISH.fin_pose]?.[FINS], age);
}

export function mouthCyclePose(p, old, t) {
  const dt = Math.max(0, (p[FISH.age] || 0) - (old[FISH.age] || 0));
  if (!dt || p[FISH.mouth_phase] < 0 || old[FISH.mouth_phase] < 0 || !p[FISH.mouth_biting] ||
      !old[FISH.mouth_biting])
    return null;
  if (p[FISH.mouth_cycle] !== old[FISH.mouth_cycle] || p[FISH.mouth_phase] < old[FISH.mouth_phase])
    return null;
  const start = old[FISH.mouth_phase], end = p[FISH.mouth_phase], phase = start + (end - start) * t,
        opening = MOUTH_CYCLE.opening, at = Math.min(MOUTH_CYCLE.steps, phase),
        i = Math.min(Math.floor(at), MOUTH_CYCLE.steps - 1), u = at - i,
        pose = opening[i] + (opening[i + 1] - opening[i]) * u;

  return {phase : at, opening : pose};
}

let birthPose = p => p;
export function blendBirthsWith(pose) { birthPose = pose; }

export function blendFish(p, blend = frameBlend()) {
  const old = sceneState.previousFish.get(p[FISH.id]);
  if (!old || old[FISH.hatched] !== p[FISH.hatched])
    return birthPose(p);
  const v = p.slice();
  for (const i of [FISH.x, FISH.y, FISH.red, FISH.green, FISH.blue, FISH.mouth_pose, FISH.thrust,
                   FISH.defense, FISH.aggression, FISH.impulse_left, FISH.impulse_right, FISH.tail,
                   FISH.egg_yolk, FISH.mass, FISH.radius, FISH.adult_age, FISH.impulse_forward,
                   FISH.motor_factor, FISH.bite_pose, FISH.suction_pose, FISH.tissue]) {
    const end = p[i] ?? 0;
    v[i] = (old[i] ?? end) + (end - (old[i] ?? end)) * blend;
  }
  const mouth = mouthCyclePose(p, old, blend);
  if (mouth) {
    v[FISH.mouth_phase] = mouth.phase;
    v[FISH.mouth_pose] = v[FISH.bite_pose] = mouth.opening;
    v[FISH.suction_pose] = mouth.phase < MOUTH_CYCLE.steps / 2
                               ? mouth.opening * ((old[FISH.eat_signal] || 0) * (1 - blend) +
                                                  (p[FISH.eat_signal] || 0) * blend)
                               : 0;
  }
  const dt = Math.max(0, p[FISH.age] - old[FISH.age]), oldAge = old[FISH.feeding_action_age] || 0,
        newAge = p[FISH.feeding_action_age] || 0,
        sameEvent = p[FISH.feeding_action] === old[FISH.feeding_action] && newAge <= oldAge,
        continuous =
            newAge <= FEEDING_EFFECT_STEPS.brief &&
            [ FEEDING_EFFECT.scrape, FEEDING_EFFECT.filter ].includes(p[FISH.feeding_action]),
        eventOffset = dt - Math.max(0, FEEDING_EFFECT_STEPS.full - newAge), elapsed = dt * blend;
  if (sameEvent || (!continuous && elapsed < eventOffset)) {
    v[FISH.feeding_action] = old[FISH.feeding_action];
    v[FISH.feeding_action_age] = Math.max(0, oldAge - elapsed);
  } else {
    v[FISH.feeding_action_age] =
        continuous ? newAge : Math.min(FEEDING_EFFECT_STEPS.full, newAge + dt - elapsed);
  }
  if (p[FISH.fin_pose])
    v[FISH.fin_pose] = fishStrokePose(p, old, blend);
  const positionBlend = fishPositionBlend(old, p, blend);
  v[FISH.x] = old[FISH.x] + horizontalDelta(p[FISH.x] - old[FISH.x]) * positionBlend;
  v[FISH.y] = old[FISH.y] + (p[FISH.y] - old[FISH.y]) * positionBlend;
  v[FISH.age] =
      (old[FISH.age] ?? p[FISH.age]) + (p[FISH.age] - (old[FISH.age] ?? p[FISH.age])) * blend;
  v[FISH.angle] = old[FISH.angle] + wrapAngle(p[FISH.angle] - old[FISH.angle]) * blend;
  return birthPose(v);
}

export function blendSmallAnimal(p, blend = frameBlend()) {
  const old = sceneState.previousInvertebrates?.get(p[INVERTEBRATE.id]);
  if (!old)
    return p;
  const v = blendParticle(p, sceneState.previousInvertebrates, INVERTEBRATE.id, blend),
        t = blend * blend * (3 - 2 * blend);
  v[INVERTEBRATE.angle] =
      (old[INVERTEBRATE.angle] || 0) +
      wrapAngle((p[INVERTEBRATE.angle] || 0) - (old[INVERTEBRATE.angle] || 0)) * t;
  for (const k of [INVERTEBRATE.radius, INVERTEBRATE.length, INVERTEBRATE.closed,
                   INVERTEBRATE.ground, INVERTEBRATE.bed_depth, INVERTEBRATE.feeding_rate])
    v[k] = (old[k] ?? p[k] ?? 0) + ((p[k] ?? 0) - (old[k] ?? p[k] ?? 0)) * blend;
  if (p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.worm) {
    const ax = old[INVERTEBRATE.x] -
               Math.sin(old[INVERTEBRATE.angle] || 0) * (old[INVERTEBRATE.length] || 0),
          ay = old[INVERTEBRATE.y] +
               Math.cos(old[INVERTEBRATE.angle] || 0) * (old[INVERTEBRATE.length] || 0),
          bx = p[INVERTEBRATE.x] -
               Math.sin(p[INVERTEBRATE.angle] || 0) * (p[INVERTEBRATE.length] || 0),
          by = p[INVERTEBRATE.y] +
               Math.cos(p[INVERTEBRATE.angle] || 0) * (p[INVERTEBRATE.length] || 0),
          dx = horizontalDelta(ax + horizontalDelta(bx - ax) * blend - v[INVERTEBRATE.x]),
          dy = ay + (by - ay) * blend - v[INVERTEBRATE.y];
    v[INVERTEBRATE.length] = Math.hypot(dx, dy);
    v[INVERTEBRATE.angle] =
        v[INVERTEBRATE.length] > TOLERANCE.precision ? Math.atan2(-dx, dy) : v[INVERTEBRATE.angle];
  }
  return v;
}
export function blendParticle(p, origins, idIndex, blend) {
  const old = origins.get(p[idIndex]);
  if (!old)
    return p;
  const v = p.slice();
  for (const i of [FOOD.y, FOOD.energy])
    v[i] = old[i] + (p[i] - old[i]) * blend;
  v[FOOD.x] = old[FOOD.x] + horizontalDelta(p[FOOD.x] - old[FOOD.x]) * blend;
  return v;
}

const ID_CYCLE = 997, GOLDEN = .61803398875;
export const idPhase = id => (id % ID_CYCLE * GOLDEN) % 1;
export function storeFrame(next, now, from = null, interval = PLAYBACK.interval_ms) {
  sceneState.previous = from;
  sceneState.previousFish = new Map((from?.fish || []).map(p => [p[FISH.id], p]));
  sceneState.previousFood = new Map((from?.food || []).map(p => [p[FOOD.id], p]));
  sceneState.previousInvertebrates =
      new Map((from?.invertebrates || []).map(p => [p[INVERTEBRATE.id], p]));
  sceneState.previousCorpses = new Map((from?.corpses || []).map(p => [p[CORPSE.id], p]));
  sceneState.frameTime = now;
  sceneState.frameInterval = Math.max(1, interval);
  sceneState.frame = next;
  sceneState.frameRevision++;
}

export function frameStartsAnew(next) {
  const f = sceneState.frame;
  return !f || f.render_epoch !== next.render_epoch || next.step < f.step ||
         f.historical !== next.historical || f.observation?.key !== next.observation?.key ||
         f.width !== next.width || f.height !== next.height || f.turbo !== next.turbo;
}

export function frameChangesContext(next) {
  const f = sceneState.frame;
  return !f || f.render_epoch !== next.render_epoch || next.step < f.step ||
         f.historical !== next.historical || f.observation?.key !== next.observation?.key;
}

export function updateSceneState(patch) {
  Object.assign(sceneState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "highlightSpecies" : () => { sceneState.highlightSpecies = 0; },
  "highlightSick" : () => { sceneState.highlightSick = false; },
  "layout" : () => { sceneState.layout = 'desktop'; },
  "renderInputRevision" : () => { sceneState.renderInputRevision = 0; },
  "renderTime" : () => { sceneState.renderTime = null; },
  "renderScale" : () => { sceneState.renderScale = null; },
  "eggBirths" : () => { sceneState.eggBirths = new Map(); },
  "maternalBirths" : () => { sceneState.maternalBirths = new Map(); },
  "previousFish" : () => { sceneState.previousFish = new Map(); },
  "previousFood" : () => { sceneState.previousFood = new Map(); },
  "previousCorpses" : () => { sceneState.previousCorpses = new Map(); },
  "frameInterval" : () => { sceneState.frameInterval = 50; },
  "frameRevision" : () => { sceneState.frameRevision = 0; },
  "tankPreviewFish" : () => { sceneState.tankPreviewFish = 0; },
  "frame" : () => { sceneState.frame = null; },
  "previous" : () => { sceneState.previous = null; },
  "frameTime" : () => { sceneState.frameTime = 0; },
  "frameIndexes" : () => { frameIndexes = new WeakMap(); },
  "addEventListener_input" :
      () => { document.addEventListener('input', () => sceneState.renderInputRevision++); },
  "addEventListener_change" :
      () => { document.addEventListener('change', () => sceneState.renderInputRevision++); },
  "addEventListener_scroll" :
      () => { document.addEventListener('scroll', () => sceneState.renderInputRevision++, true); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
