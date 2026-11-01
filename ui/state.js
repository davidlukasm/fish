

import {CORPSE, FISH, FOOD, INVERTEBRATE, INVERTEBRATE_KIND, TOLERANCE} from './schema.js';

export const sceneState = {};

export function displayNow() { return sceneState.renderTime ?? Date.now(); }

export let frameIndexes;

export function frameIndex(items, key) {
  let saved = frameIndexes.get(items);
  if (!saved || saved.length !== items.length) {
    saved = {length : items.length, byId : new Map(items.map(p => [p[key], p]))};
    frameIndexes.set(items, saved);
  }
  return saved.byId;
}

export function frameFish(f, id = f?.selected) {
  return f && id ? frameIndex(f.fish, 4).get(id) : undefined;
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
  sceneState.frameInterval = 50;
  sceneState.tankPreviewFish = 0;
}

export function horizontalDelta(dx, width = sceneState.frame?.width) {
  return width ? dx - width * Math.round(dx / width) : dx;
}

export function wrapScreenX(x) {
  return sceneState.frame ? x - sceneState.frame.width * Math.floor(x / sceneState.frame.width) : x;
}

// One interpolation clock for the pair selected by buffered playback.
export function displayStep(f = sceneState.frame, blend = frameBlend()) {
  return sceneState.previous
             ? sceneState.previous.step + (f.step - sceneState.previous.step) * blend
             : f.step;
}

// What taking a frame involves is the application's business (connection.js registers it);
// the playback buffer below only decides when a frame is taken.
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
      now - playback.points.at(-1).at > 2000 || next.paused || next.turbo) {
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
  if (playback.points.length > 16)
    playback.points.shift();
}

// Held actions from the tank and the nerve map (growth, stimulation) last this long.
export const HELD_ACTION_SECONDS = 3;

// Simulation steps that pass in the given seconds at the current pace: measured from the
// received frames, otherwise from the requested step delay; within the engine's 1..10000.
export function stepsInSeconds(seconds) {
  const points = sceneState.playback?.points || [], first = points[0], last = points.at(-1),
        measured = points.length > 1 && last.at > first.at
                       ? 1000 * (last.frame.step - first.frame.step) / (last.at - first.at)
                       : 0,
        rate = measured || 1000 / Math.max(1, sceneState.frame?.delay_ms || 30);
  return Math.max(1, Math.min(10000, Math.round(rate * seconds)));
}

export function advanceScene(now = Date.now()) {
  const playback = sceneState.playback;
  if (!playback || playback.points.length < 2)
    return;
  const delay = Math.max(150, playback.points.at(-1).frame.delay_ms || 0), target = now - delay;
  while (playback.points.length > 2 && playback.points[1].at <= target)
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

// Endpoint speeds recover acceleration during a sampled stroke without moving either endpoint.
function fishPositionBlend(old, p, t) {
  const dt = Math.max(0, (p[FISH.age] ?? 0) - (old[FISH.age] ?? p[FISH.age] ?? 0)),
        d = Math.hypot(horizontalDelta(p[FISH.x] - old[FISH.x]), p[FISH.y] - old[FISH.y]);
  if (!dt || d < TOLERANCE.precision)
    return t;
  let a = Math.max(0, Math.min(3, (old[FISH.speed] || 0) * dt / d)),
      b = Math.max(0, Math.min(3, (p[FISH.speed] || 0) * dt / d)), norm = Math.hypot(a, b);
  if (norm > 3) {
    a *= 3 / norm;
    b *= 3 / norm;
  }
  return (-2 * t + 3) * t * t + t * (t - 1) * (t - 1) * a + (t - 1) * t * t * b;
}

function fishStrokePose(p, old, t) {
  const age = (old[FISH.age] ?? p[FISH.age]) + (p[FISH.age] - (old[FISH.age] ?? p[FISH.age])) * t,
        pose = [], events = [ -1, -1, 0, 0, 0 ];
  for (let k = 0; k < 3; k++) {
    if (k > 0) {
      const a = old[FISH.fin_pose]?.[k] || 0, b = p[FISH.fin_pose]?.[k] || 0,
            eased = t * t * (3 - 2 * t);
      pose[k] = a + (b - a) * eased;
      continue;
    }
    const index = k ? 1 : 0, next = p[FISH.fin_pose]?.[3]?.[index];
    let sample = p, tick = next;
    if (!(tick >= 0 && tick <= age + .6)) {
      sample = old;
      tick = old[FISH.fin_pose]?.[3]?.[index];
    }
    if (!(tick >= 0 && tick <= age + .6)) {
      pose[k] = (old[FISH.fin_pose]?.[k] || 0) +
                ((p[FISH.fin_pose]?.[k] || 0) - (old[FISH.fin_pose]?.[k] || 0)) * t;
      continue;
    }
    const peak = sample[FISH.fin_pose]?.[3]?.[2 + k] || 0, elapsed = age - tick,
          u = Math.max(0, Math.min(1, (elapsed + .6) / .6));
    pose[k] = Math.abs(peak) * (elapsed < 0 ? u * u * (3 - 2 * u) : Math.pow(.55, elapsed));
    events[index] = tick;
    events[2 + k] = peak;
  }
  pose[3] = events;
  return pose;
}

export function mouthCyclePose(p, old, t) {
  const dt = Math.max(0, (p[FISH.age] || 0) - (old[FISH.age] || 0));
  if (!dt || p[FISH.mouth_phase] < 0 || old[FISH.mouth_phase] < 0 || !p[FISH.mouth_biting] ||
      !old[FISH.mouth_biting])
    return null;
  if (p[FISH.mouth_cycle] !== old[FISH.mouth_cycle] || p[FISH.mouth_phase] < old[FISH.mouth_phase])
    return null;
  const start = old[FISH.mouth_phase], end = p[FISH.mouth_phase], phase = start + (end - start) * t,
        opening = [ .35, .8, 1, 1, .65, .1, 0, .15, .35 ], at = Math.min(7.999, phase),
        i = Math.floor(at), u = at - i, pose = opening[i] + (opening[i + 1] - opening[i]) * u;

  return {phase : at, opening : pose};
}

// Eggs being laid take their pose from the mother; egg_births.js hands that pose in.
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
    v[FISH.suction_pose] = mouth.phase < 4
                               ? mouth.opening * ((old[FISH.eat_signal] || 0) * (1 - blend) +
                                                  (p[FISH.eat_signal] || 0) * blend)
                               : 0;
  }
  const dt = Math.max(0, p[FISH.age] - old[FISH.age]), oldAge = old[FISH.feeding_action_age] || 0,
        newAge = p[FISH.feeding_action_age] || 0,
        sameEvent = p[FISH.feeding_action] === old[FISH.feeding_action] && newAge <= oldAge,
        continuous = newAge <= 2 && [ 3, 4 ].includes(p[FISH.feeding_action]),
        eventOffset = dt - Math.max(0, 48 - newAge), elapsed = dt * blend;
  if (sameEvent || (!continuous && elapsed < eventOffset)) {
    v[FISH.feeding_action] = old[FISH.feeding_action];
    v[FISH.feeding_action_age] = Math.max(0, oldAge - elapsed);
  } else {
    v[FISH.feeding_action_age] = continuous ? newAge : Math.min(48, newAge + dt - elapsed);
  }
  if (p[FISH.fin_pose])
    v[FISH.fin_pose] = fishStrokePose(p, old, blend);
  const positionBlend = fishPositionBlend(old, p, blend);
  v[FISH.x] = old[FISH.x] + horizontalDelta(p[FISH.x] - old[FISH.x]) * positionBlend;
  v[FISH.y] = old[FISH.y] + (p[FISH.y] - old[FISH.y]) * positionBlend;
  v[FISH.age] =
      (old[FISH.age] ?? p[FISH.age]) + (p[FISH.age] - (old[FISH.age] ?? p[FISH.age])) * blend;
  v[FISH.angle] = old[FISH.angle] + Math.atan2(Math.sin(p[FISH.angle] - old[FISH.angle]),
                                               Math.cos(p[FISH.angle] - old[FISH.angle])) *
                                        blend;
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
      Math.atan2(Math.sin((p[INVERTEBRATE.angle] || 0) - (old[INVERTEBRATE.angle] || 0)),
                 Math.cos((p[INVERTEBRATE.angle] || 0) - (old[INVERTEBRATE.angle] || 0))) *
          t;
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
        v[INVERTEBRATE.length] > .0001 ? Math.atan2(-dx, dy) : v[INVERTEBRATE.angle];
  }
  return v;
}
// Food, small animals and remains share their first columns: position and energy.
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

// Takes the next snapshot as the current frame; the one before stays as the origin of every
// interpolated pose.
export function storeFrame(next, now, from = null, interval = 50) {
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

// A frame from another run, observation, size or speed starts the scene afresh.
export function frameStartsAnew(next) {
  const f = sceneState.frame;
  return !f || f.render_epoch !== next.render_epoch || next.step < f.step ||
         f.historical !== next.historical || f.observation?.key !== next.observation?.key ||
         f.width !== next.width || f.height !== next.height || f.turbo !== next.turbo;
}

// A frame from another run or observation brings other species and families.
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
  // Species or sick fish marked in the tank, on every view.
  "highlightSpecies" : () => { sceneState.highlightSpecies = 0; },
  "highlightSick" : () => { sceneState.highlightSick = false; },
  // "desktop" or "phone": phones inspect a fish in their own portrait, with their own tempo.
  "layout" : () => { sceneState.layout = 'desktop'; },
  "renderInputRevision" : () => { sceneState.renderInputRevision = 0; },
  "renderTime" : () => {
    // One clock for camera, body and organ poses within a rendered image.
    sceneState.renderTime = null;
  },
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
  "frameIndexes" : () => {
    // UI lookups share one index for each snapshot array, including preview frames.
    frameIndexes = new WeakMap();
  },
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
