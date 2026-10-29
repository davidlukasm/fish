import {cancelWorldGesture} from './world.js';
import {displayFaults} from './diagnostics.js';
import {updateTankSceneryState} from './tank_scenery.js';
import {updateFeedingViewState} from './feeding_view.js';
import {updateCameraState} from './camera.js';
import {updateSessionState} from './session.js';
import {updateBrainState} from './brain.js';
import {FISH, CORPSE} from './schema.js';
import {brainState, resetBrainView} from './brain.js';
import {cameraState, resizeAquarium, setFollowing} from './camera.js';
import {canvas, ctx, el} from './dom.js';
import {resetBlood} from './effects.js';
import {evolutionState, pinnedSpecies, setView, previewSpecies} from './evolution.js';
import {feeding_viewState} from './feeding_view.js';
import {fishDisplayRadius, fishRenderRadius} from './fish_fins.js';
import {fishAnatomy} from './fish_forms.js';
import {fishBezier} from './fish_geometry.js';
import {fishEggDuctCurve} from './fish_organs.js';
import {tankHideTooltip} from './hover.js';
import {rememberFamilies, resetFamilies} from './lineage.js';
import {fpsReport} from './report.js';
import {showSelection} from './selection.js';
import {command, sessionState} from './session.js';
import {draw, resetDrawing, tankState} from './tank.js';
import {tank_sceneryState} from './tank_scenery.js';
import {resetTankBatches} from './vegetation.js';
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
  updateCameraState({zoomIntent : null});
  sceneState.tankPreviewFish = 0;
}

export function horizontalDelta(dx, width = sceneState.frame?.width) {
  return width ? dx - width * Math.round(dx / width) : dx;
}

export function wrapScreenX(x) {
  return sceneState.frame ? x - sceneState.frame.width * Math.floor(x / sceneState.frame.width) : x;
}

export function horizontalShifts(f, c) {
  const tile = Math.floor((cameraState.viewportWidth / 2 - c.ox) / c.scale / f.width);
  return [ tile - 1, tile, tile + 1 ].map(i => i * f.width);
}

// One interpolation clock for the pair selected by buffered playback.
export function displayStep(f = sceneState.frame, blend = frameBlend()) {
  return sceneState.previous
             ? sceneState.previous.step + (f.step - sceneState.previous.step) * blend
             : f.step;
}

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
    acceptFrame(next, now);
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
  acceptFrame(to.frame, from.at + delay, from.frame, to.at - from.at);
  playback.shown = to.frame;
}

export function frameBlend(now = displayNow()) {
  return Math.max(0, Math.min(1, (now - sceneState.frameTime) / sceneState.frameInterval));
}

// Endpoint speeds recover acceleration during a sampled stroke without moving either endpoint.
export function fishPositionBlend(old, p, t) {
  const dt = Math.max(0, (p[FISH.age] ?? 0) - (old[FISH.age] ?? p[FISH.age] ?? 0)),
        d = Math.hypot(horizontalDelta(p[FISH.x] - old[FISH.x]), p[FISH.y] - old[FISH.y]);
  if (!dt || d < 1e-6)
    return t;
  let a = Math.max(0, Math.min(3, (old[FISH.speed] || 0) * dt / d)),
      b = Math.max(0, Math.min(3, (p[FISH.speed] || 0) * dt / d)), norm = Math.hypot(a, b);
  if (norm > 3) {
    a *= 3 / norm;
    b *= 3 / norm;
  }
  return (-2 * t + 3) * t * t + t * (t - 1) * (t - 1) * a + (t - 1) * t * t * b;
}

export function fishStrokePose(p, old, t) {
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
    const peak = sample[57]?.[3]?.[2 + k] || 0, elapsed = age - tick,
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

export function blendFish(p, blend = frameBlend()) {
  const old = sceneState.previousFish.get(p[FISH.id]);
  if (!old || old[8] !== p[FISH.hatched])
    return blendEggBirth(p);
  const v = p.slice();
  for (const i
           of [0, 1, 16, 17, 18, 19, 24, 26, 27, 42, 43, 44, 46, 50, 51, 54, 55, 56, 64, 65, 69]) {
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
  v[FISH.x] = old[0] + horizontalDelta(p[FISH.x] - old[0]) * positionBlend;
  v[FISH.y] = old[1] + (p[FISH.y] - old[1]) * positionBlend;
  v[FISH.age] = (old[6] ?? p[FISH.age]) + (p[FISH.age] - (old[6] ?? p[FISH.age])) * blend;
  v[FISH.angle] =
      old[2] +
      Math.atan2(Math.sin(p[FISH.angle] - old[2]), Math.cos(p[FISH.angle] - old[2])) * blend;
  return blendEggBirth(v);
}

export function eggBirthProgress(birth, now = displayNow()) {
  return Math.max(0, Math.min(1, (now - birth.started) / birth.duration));
}

export function blendEggBirth(p) {
  const scale =
      sceneState.renderScale ?? Math.min(cameraState.viewportWidth / sceneState.frame.width,
                                         cameraState.viewportHeight / sceneState.frame.height) *
                                    cameraState.zoom;
  if (fishDisplayRadius(p, scale) < 3)
    return p;
  const birth = sceneState.eggBirths.get(p[FISH.id]),
        maternal = sceneState.maternalBirths.get(p[FISH.id]);
  if (!birth && !maternal)
    return p;
  const v = p.slice();
  if (maternal && eggBirthProgress(maternal) < 1) {
    const t = eggBirthProgress(maternal), ease = t * t * (3 - 2 * t);
    v[FISH.egg_yolk] = Math.max(v[FISH.egg_yolk] || 0, maternal.yolk * (1 - ease));
    v.birthing = true;
    v.birthProgress = t;
    v.birthDuct = maternal.duct;
  }
  if (birth && !p[FISH.hatched]) {
    const t = eggBirthProgress(birth);
    if (t >= 1)
      return v;
    const mother = frameFish(sceneState.frame, birth.mother),
          pose = mother ? blendFish(mother) : birth.pose, early = Math.min(1, t / .55),
          late = Math.max(0, (t - .55) / .45), ease = early * early * (3 - 2 * early),
          release = late * late * (3 - 2 * late),
          local = fishBezier(birth.duct, ease)
                      .map((v, i) => (v - (birth.origin?.[i] || 0)) * birth.radius),
          sourceX = pose[0] + Math.cos(pose[2]) * local[0] - Math.sin(pose[2]) * local[1],
          sourceY = pose[1] + Math.sin(pose[2]) * local[0] + Math.cos(pose[2]) * local[1],
          r = p[FISH.radius] || 1;
    v[FISH.x] = sourceX + horizontalDelta(p[FISH.x] - sourceX) * release;
    v[FISH.y] = sourceY + (p[FISH.y] - sourceY) * release;
    v[FISH.angle] = pose[2];
    const squeeze = 1 - .48 * Math.sin(Math.PI * ease) * (1 - release);
    v.birthShape = {rx : r / squeeze, ry : r * squeeze};
  }
  return v;
}

export function recordEggBirths(next, now) {
  const current = frameIndex(next.fish, 4), old = frameIndex(sceneState.frame.fish, 4);
  for (const [id, birth] of sceneState.eggBirths)
    if (!current.has(id) || eggBirthProgress(birth, now) >= 1) {
      sceneState.eggBirths.delete(id);
      if (sceneState.maternalBirths.get(birth.mother) === birth)
        sceneState.maternalBirths.delete(birth.mother);
    }
  const scale =
      Math.min(cameraState.viewportWidth / next.width, cameraState.viewportHeight / next.height) *
      cameraState.zoom;
  for (const egg of next.fish) {
    if (egg[8] || egg[10] !== 1 || old.has(egg[4]) || fishDisplayRadius(egg, scale) < 3)
      continue;
    let mother = old.get(egg[35]);
    if (!mother && egg[49]) {
      let best = Infinity;
      for (const p of old.values())
        if (p[8] && p[46] >= egg[5] && (current.get(p[4])?.[46] ?? p[46]) < p[46]) {
          const d = Math.hypot(horizontalDelta(egg[0] - p[0]), egg[1] - p[1]);
          if (d < best && d < (p[51] || 4) * 3 + (egg[51] || 1)) {
            best = d;
            mother = p;
          }
        }
    }
    if (!mother)
      continue;
    const pose = blendFish(mother), radius = fishRenderRadius(pose), anatomy = fishAnatomy(mother),
          birth = {
            mother : mother[4],
            pose : pose.slice(),
            radius,
            yolk : mother[46] || egg[5],
            duct : fishEggDuctCurve(anatomy),
            origin : anatomy.origin,
            started : now,
            duration : Math.max(400, Math.min(1000, next.delay_ms || 400))
          };
    sceneState.eggBirths.set(egg[4], birth);
    sceneState.maternalBirths.set(mother[4], birth);
  }
}

export function blendSmallAnimal(p, blend = frameBlend()) {
  const old = sceneState.previousInvertebrates?.get(p[3]);
  if (!old)
    return p;
  const v = blendParticle(p, sceneState.previousInvertebrates, 3, blend),
        t = blend * blend * (3 - 2 * blend);
  v[11] = (old[11] || 0) + Math.atan2(Math.sin((p[11] || 0) - (old[11] || 0)),
                                      Math.cos((p[11] || 0) - (old[11] || 0))) *
                               t;
  for (const k of [6, 13, 17, 18, 19, 21])
    v[k] = (old[k] ?? p[k] ?? 0) + ((p[k] ?? 0) - (old[k] ?? p[k] ?? 0)) * blend;
  if (p[7] === 7) {
    const ax = old[0] - Math.sin(old[11] || 0) * (old[13] || 0),
          ay = old[1] + Math.cos(old[11] || 0) * (old[13] || 0),
          bx = p[0] - Math.sin(p[11] || 0) * (p[13] || 0),
          by = p[1] + Math.cos(p[11] || 0) * (p[13] || 0),
          dx = horizontalDelta(ax + horizontalDelta(bx - ax) * blend - v[0]),
          dy = ay + (by - ay) * blend - v[1];
    v[13] = Math.hypot(dx, dy);
    v[11] = v[13] > .0001 ? Math.atan2(-dx, dy) : v[11];
  }
  return v;
}
export function blendParticle(p, origins, idIndex, blend) {
  const old = origins.get(p[idIndex]);
  if (!old)
    return p;
  const v = p.slice();
  for (const i of [0, 1, 2])
    v[i] = old[i] + (p[i] - old[i]) * blend;
  v[0] = old[0] + horizontalDelta(p[0] - old[0]) * blend;
  return v;
}

export function acceptFrame(next, now = displayNow(), from = null, interval = 50) {
  if ((!sceneState.frame || sceneState.frame.render_epoch !== next.render_epoch ||
       next.step < sceneState.frame.step || sceneState.frame.historical !== next.historical ||
       sceneState.frame.observation?.key !== next.observation?.key)) {
    evolutionState.speciesRepresentatives.clear();
    pinnedSpecies.clear();
    resetFamilies();
  }
  const reset = !sceneState.frame || sceneState.frame.render_epoch !== next.render_epoch ||
                next.step < sceneState.frame.step ||
                sceneState.frame.historical !== next.historical ||
                sceneState.frame.observation?.key !== next.observation?.key ||
                sceneState.frame.width !== next.width || sceneState.frame.height !== next.height ||
                sceneState.frame.turbo !== next.turbo;
  if (reset) {
    resetDrawing();
    updateSessionState({selectionSequence : (sessionState.selectionSequence || 0) + 1});
    fpsReport?.suspend('scene');
    resetBlood();
    updateBrainState({brainLastFish : null});
    updateBrainState({brainAcquireCandidate : null});
    resetInterpolation(now);
    cancelWorldGesture();
    tankState.contextMenu = null;
  } else if (sceneState.frame.step !== next.step) {
    recordEggBirths(next, now);
  }
  sceneState.previous = from;
  sceneState.previousFish = new Map((from?.fish || []).map(p => [p[4], p]));
  sceneState.previousFood = new Map((from?.food || []).map(p => [p[3], p]));
  sceneState.previousInvertebrates = new Map((from?.invertebrates || []).map(p => [p[3], p]));
  sceneState.previousCorpses = new Map((from?.corpses || []).map(p => [p[7], p]));
  sceneState.frameTime = now;
  sceneState.frameInterval = Math.max(1, interval);
  sceneState.frame = next;
  sceneState.frameRevision++;
  rememberFamilies(next);
}

export function syncBrainRequest() {
  if (!sceneState.frame)
    return;
  return command('brain', {
    value : !sceneState.frame.turbo && !evolutionState.editing && sceneState.frame.selected &&
                    (brainState.brainOpen || el('observation-mode').value === 'senses')
                ? 1
                : 0
  });
}

export async function selectFish(
    id, {follow = true, details = true, fromZoom = false, preserveGroup = false} = {}) {
  const sequence =
            updateSessionState({selectionSequence : (sessionState.selectionSequence || 0) + 1}),
        requestGeneration = sessionState.generation || 0;
  if (evolutionState.previewSpecies)
    previewSpecies(0);
  sceneState.pendingSelection = id;
  if (id && !preserveGroup) {
    evolutionState.highlightSpecies = 0;
    evolutionState.highlightSick = false;
  }
  if (!fromZoom)
    updateCameraState({zoomIntent : null});
  sceneState.tankPreviewFish = 0;
  if (typeof tankHideTooltip === 'function')
    tankHideTooltip(true);
  if (await command('select', {value : id})) {
    if (sequence !== sessionState.selectionSequence ||
        requestGeneration !== (sessionState.generation || 0))
      return;
    sceneState.pendingSelection = null;
    sceneState.playback = null;
    resetBrainView();
    if (!id && typeof feeding_viewState.lastSelectedProfile !== 'undefined')
      updateFeedingViewState({lastSelectedProfile : null});
    if (sceneState.frame) {
      sceneState.frame = {
        ...sceneState.frame,
        selected : id,
        selected_body : id && sceneState.frame.selected === id ? sceneState.frame.selected_body
                                                               : null,
        selected_death : null,
        brain : id && sceneState.frame.selected === id ? sceneState.frame.brain : null
      };
      showSelection(sceneState.frame);
    }
    setFollowing(!!(follow && !evolutionState.editing && frameFish(sceneState.frame, id)?.[8]),
                 true);
    if (details && !evolutionState.editing && id)
      setView('fish');
    if (evolutionState.editing)
      await command('brain', {value : 0});
  }
  if (sequence === sessionState.selectionSequence)
    sceneState.pendingSelection = null;
}

export function updateSceneState(patch) {
  Object.assign(sceneState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "renderInputRevision" : () => { sceneState.renderInputRevision = 0; },
  "renderTime" : () => {
    // One clock for camera, body and organ poses within a rendered image.
    sceneState.renderTime = null;
  },
  "renderScale" : () => { sceneState.renderScale = null; },
  "ctx_onRestore" : () => {
    canvas.addEventListener?.(
        'webglcontextlost',
        () => displayFaults.report('Grafik',
                                   Error('Grafikkontext verloren; Wiederherstellung läuft.')));
    ctx.onRestore = () => {
      resetTankBatches();
      updateTankSceneryState({sceneryKey : ''});
      draw.error = null;
      displayFaults.clear('Grafik');
      displayFaults.clear('Tank');
      sceneState.renderInputRevision++;
      draw.idleStamp = null;
    };
    // Markers switched on or off appear at once, also while the run is paused.
    for (const id of ['show-current-sources', 'show-food-sources', 'show-plankton-sources'])
      el(id)?.addEventListener?.('change', () => {
        updateTankSceneryState({sceneryKey : ''});
        sceneState.renderInputRevision++;
        draw.idleStamp = null;
      });
  },
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
  "new_ResizeObserver_resizeAquarium_observe" : () => {
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(resizeAquarium).observe(canvas);
  },
  "addEventListener_resize" : () => { window.addEventListener?.('resize', resizeAquarium); },
  "resizeAquarium" : () => { resizeAquarium(); },
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
