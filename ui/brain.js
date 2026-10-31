import {FISH} from './schema.js';
import {t, tList, formatNumber} from './strings.js';

import {updateSessionState} from './session.js';
import {updateCameraState} from './camera.js';
import {brainCellDetail, brainOrganKey} from './brain_geometry.js';
import {brainArmProbe, brainHoverAt, brain_inputState} from './brain_input.js';
import {brainBuild} from './brain_layout.js';

import {brainRender} from './brain_painter.js';
import {brainTrackProbe} from './brain_probe.js';
import {brainPresentationFish, brainResetSignals, brainTrace} from './brain_signals.js';

import {cameraState, nearbyZoomFish, screenToWorld, worldToScreen} from './camera.js';
import {ctx, el, text} from './dom.js';
import {evolutionState, setView} from './evolution.js';
import {fishBodyRadius} from './fish_fins.js';
import {fishSnapshotAnatomy} from './fish_forms.js';
import {brainShowOrgan, renderOrganIcons} from './organs.js';
import {renderNerveMap} from './nerve_map.js';
import {command, requestTempo, sessionState, VIEW_TEMPO_RENEW} from './session.js';
import {
  blendFish,
  displayNow,
  frameFish,
  frameCorpse,
  horizontalDelta,
  sceneState
} from './state.js';
import {selectFish, syncBrainRequest} from './fish_choice.js';
export const brainState = {};
export let brainClamp;

export let brainWrap;

export function brainSetDrawing(next) { brainState.brainDrawing = next; }

export function resetBrainView() {
  brainState.brainLastFish = null;
  brainState.brainAcquireCandidate = null;
  brainResetSignals();
  brainState.brainZoom = 1;
  brainState.brainPan = {x : 0, y : 0};
  brainState.brainView = 'network';
  updateSessionState({neuronFocus : -1});
  brainState.brainSelectionPart = '';
  brainSetDrawing(null);
  brainState.brainPackets = [];
  brainState.brainTraceStep = -1;
  brainState.brainOptionsKey = '';
  brainState.brainLayoutId = '';
  brainState.brainDrawingKey = '';
  brainState.brainProbePoint = null;
  brainState.brainTissueFocus = 'all';
  brainState.brainPinnedTissue = '';
  brainState.brainHover = null;
  brainArmProbe(false);
}

export async function brainSetOpen(value) {
  if (brainState.brainOpen === value)
    return;
  brainState.brainOpen = value;
  el('layout').classList.toggle('inspecting', value);
  brainState.brainExitSince = 0;
  brainState.brainDrawingKey = '';
  brainState.brainPackets = [];
  brainState.brainTraceStep = -1;
  if (value) {
    brainState.brainEpoch = sceneState.frame?.render_epoch;
    brainState.brainReturnView = evolutionState.activeView === 'brain' ? brainState.brainReturnView
                                                                       : evolutionState.activeView;
    el('tab-brain').hidden = el('tab-organs').hidden = false;
    el('brain-workspace').hidden = false;
    el('brain-inputs').open = true;
    if (brainState.brainTempoBase === null)
      brainState.brainTempoBase = sceneState.frame?.delay_ms ?? 30;
  } else {
    brainArmProbe(false);
  }
  await command('brain-mode', {value : value ? 1 : 0});
  if (!value)
    syncBrainRequest();
}

export async function closeBrain() {
  if (sceneState.frame) {
    const p = frameFish(sceneState.frame),
          base = Math.min(cameraState.viewportWidth / sceneState.frame.width,
                          cameraState.viewportHeight / sceneState.frame.height);
    updateCameraState(
        {zoom : Math.min(cameraState.zoom, 42 / ((p ? fishBodyRadius(p) : 4) * base))});
  }
  await brainSetOpen(false);
}

export async function brainStep() {
  if (brainState.brainBusy || !brainState.brainOpen || sceneState.frame?.historical)
    return;
  brainState.brainBusy = true;
  await command('pause');
  await command('step');
  brainState.brainBusy = false;
}

export function brainAcquireAfterDeath(f, c, now) {
  if (!brainState.brainLastFish || frameCorpse(f) ||
      f.fish.some(p => p[FISH.id] === brainState.brainLastFish && p[FISH.hatched]) ||
      f.fish.some(p => p[FISH.id] === f.selected && p[FISH.hatched]) ||
      !brain_inputState.brainPointerInside || !brainState.brainPointer ||
      cameraState.zoomSelectionPending || sessionState.busy || brainState.brainBusy ||
      cameraState.drag || evolutionState.editing || f.turbo || f.historical ||
      brainState.brainProbeArmed || brainState.brainReferenceRadius * c.scale < 36) {
    brainState.brainAcquireCandidate = null;
    return;
  }
  const point = screenToWorld(brainState.brainPointer, c),
        candidate = nearbyZoomFish(
            point, c.scale,
            {clientX : brainState.brainPointer.x, clientY : brainState.brainPointer.y}, now);
  if (!candidate || fishBodyRadius(candidate) * c.scale < 18) {
    brainState.brainAcquireCandidate = null;
    return;
  }
  if (brainState.brainAcquireCandidate?.id !== candidate[4]) {
    brainState.brainAcquireCandidate = {id : candidate[4], since : now};
    return;
  }
  if (now - brainState.brainAcquireCandidate.since < 180)
    return;
  updateCameraState({zoomSelectionPending : 1});
  brainState.brainAcquireCandidate = null;
  selectFish(candidate[4], {details : false, fromZoom : true})
      .finally(() => { updateCameraState({zoomSelectionPending : 0}); });
}

export function brainZoomUpdate(f, c, now = displayNow()) {
  const p = frameFish(f), screen = p && worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
        bodyRadius = p ? fishBodyRadius(p) * c.scale : 0,
        eligible =
            !!(p?.[FISH.hatched] && sceneState.layout !== 'phone' && !evolutionState.editing &&
               !f.turbo && screen.x >= -bodyRadius &&
               screen.x <= cameraState.viewportWidth + bodyRadius && screen.y >= -bodyRadius &&
               screen.y <= cameraState.viewportHeight + bodyRadius),
        radius = eligible ? bodyRadius : 0;
  if (eligible && radius >= 52) {
    brainState.brainReferenceRadius = radius / c.scale;
    brainState.brainLastFish = p[FISH.id];
  }
  brainAcquireAfterDeath(f, c, now);
  if (!brainState.brainOpen && eligible && radius >= 52)
    brainSetOpen(true);
  if (brainState.brainOpen && (!eligible || radius < 36)) {
    if (!brainState.brainExitSince)
      brainState.brainExitSince = now;
    if (!eligible || now - brainState.brainExitSince >= 1000)
      brainSetOpen(false);
  } else
    brainState.brainExitSince = 0;
  const dt = brainState.brainLastZoomTime ? Math.min(100, now - brainState.brainLastZoomTime) : 16;
  brainState.brainLastZoomTime = now;
  const target = brainState.brainOpen ? 1 : 0;
  brainState.brainOpacity += (target - brainState.brainOpacity) * (1 - Math.exp(-dt / 160));
  if (Math.abs(brainState.brainOpacity - target) < .005)
    brainState.brainOpacity = target;
  const panel = el('brain-workspace');
  panel.hidden = brainState.brainOpacity <= .005;
  el('tab-brain').hidden = el('tab-organs').hidden = !p?.[FISH.hatched];
  if (!brainState.brainOpen && brainState.brainOpacity <= .005 &&
      evolutionState.activeView === 'brain')
    setView('fish');
  el('tab-brain').style.opacity = '1';
  panel.style.opacity = String(brainState.brainOpacity);
  panel.style.pointerEvents = brainState.brainOpen ? 'auto' : 'none';
  panel.style.transform = 'translateY(' + (6 * (1 - brainState.brainOpacity)) + 'px)';
  const zoomRadius = brainState.brainOpen ? radius : brainState.brainReferenceRadius * c.scale,
        slowZoom = !evolutionState.editing && !f.turbo &&
                   (brainState.brainOpen || brainState.brainTempoBase !== null && zoomRadius >= 36);
  if (brainState.brainTempoBase !== null && now - brainState.brainLastTempo > 350) {
    const base = brainState.brainTempoBase,
          wanted = slowZoom
                       ? Math.round(Math.max(base, 150 + 850 * brainClamp((zoomRadius - 52) / 168)))
                       : base;
    const renew = wanted !== base && now - brainState.brainLastTempo > VIEW_TEMPO_RENEW;
    if (renew || Math.abs(wanted - brainState.brainRequestedDelay) >= 25 ||
        (!slowZoom && wanted !== brainState.brainRequestedDelay)) {
      brainState.brainRequestedDelay = wanted;
      brainState.brainLastTempo = now;
      requestTempo(wanted, base);
    }
    if (!slowZoom) {
      brainState.brainTempoBase = null;
      brainState.brainRequestedDelay = -1;
    }
  }
  el('speed').disabled = slowZoom || !!f.historical;
  if (slowZoom) {
    el('speed').value = 'inspection';
    const rate = 1000 / Math.max(1, f.delay_ms || brainState.brainRequestedDelay || 30);
    el('speed').title = t('brain.zoomSpeed', {rate : formatNumber(rate, 1)});
  } else
    el('speed').title = '';
}

export function focusNeuron(id, part = '', reveal = true) {
  if (reveal && brainState.brainOpen && evolutionState.activeView !== 'brain')
    setView('brain');
  updateSessionState({neuronFocus : id});
  brainState.brainSelectionPart = part;
  brainState.brainPinnedTissue = '';
  brainState.brainTissueFocus = part || 'all';
  brainState.brainOptionsKey = '';
  if (sceneState.frame)
    showBrain(sceneState.frame);
}

export function brainTissueName(key) {
  return key === 'gut'        ? t('brain.gut')
         : key === 'reserve'  ? t('brain.reserve')
         : key === 'internal' ? t('brain.cns')
                              : tList(key[0] === 's' ? 'brain.senseTissues'
                                                     : 'brain.motorTissues')[Number(key.slice(1))];
}

export function focusTissue(hit) {
  updateSessionState({neuronFocus : -1});
  brainState.brainPinnedTissue = hit.tissue;
  brainState.brainTissueFocus = hit.part;
  brainState.brainSelectionPart = hit.part;
  brainState.brainOptionsKey = '';
  if (sceneState.frame)
    showBrain(sceneState.frame);
}

export function brainSelectedTissue(d, hit = brainState.brainHover) {
  const n = d.nodes.get(hit?.id ?? sessionState.neuronFocus),
        key = hit?.part || brainState.brainSelectionPart;
  const tissue = d.tissues.get(
      hit?.tissue ||
      (hit?.id !== undefined && n && key ? brainOrganKey(key, n) : brainState.brainPinnedTissue) ||
      (n && key ? brainOrganKey(key, n) : ''));
  return hit?.ids && tissue ? {
    ...tissue,
    group : hit.ids.join(','),
    members : tissue.members.filter(m => hit.ids.includes(m.n[5]))
  }
                            : tissue;
}

export function showBrain(f) {
  const b = f.brain,
        info = b?.planning ? t('brain.gehirnaufbau')
               : b ? t('brain.size', {cells : b.neuron_count, edges : formatNumber(b.edge_count)})
                   : '';
  text('brain-info', info);
  if (!brainState.brainOpen)
    return;
  if (brainState.brainEpoch !== f.render_epoch) {
    brainSetOpen(false);
    return;
  }
  text('brain-title',
       brainState.brainView === 'organs' ? t('brain.organe') : t('brain.nervensystem'));
  text('brain-summary', info);
  if (!b?.neurons?.length)
    return;
  const fresh = b.layout_id !== brainState.brainLayoutId;
  if (fresh) {
    brainResetSignals();
    brainState.brainLayoutId = b.layout_id;
    brainState.brainPackets = [];
    brainState.brainTraceStep = -1;
    brainState.brainOptionsKey = '';
    brainState.brainDrawingKey = '';
  }
  const p = frameFish(f);
  if (!p)
    return;
  const probe = b.probe;
  el('brain-spatial').hidden = !(probe?.remaining > 0 && probe.kind < 2);
  el('brain-clear-probe').disabled = !(probe?.remaining > 0);
  text('brain-probe-state',
       probe?.remaining > 0 ? t('brain.probeSteps', {n : probe.remaining}) : '');
  text('brain-heading-value',
       t('units.degrees', {n : Math.round(brainWrap(p[FISH.angle]) * 180 / Math.PI)}));
  text('brain-distance-value', probe?.remaining > 0 ? t('units.px', {
         n : formatNumber(Math.hypot(horizontalDelta(probe.x - p[FISH.x]), probe.y - p[FISH.y]), 1,
                          true)
       })
                                                    : '');
  for (const id of ['brain-probe'])
    el(id).disabled = !!f.historical || !p[FISH.hatched];
}

export function brainDrawOverlay(f, c) {
  if (brainState.brainProbeArmed)
    brainTrackProbe();
  if (brainState.brainOpacity <= .005 || !f.brain?.neurons?.length) {
    if (brainState.brainDrawing)
      brainSetDrawing(null);
    return;
  }
  const raw = frameFish(f);
  if (!raw?.[FISH.hatched])
    return;
  // While the wheel turns, the drawing keeps its detail level and is only scaled.
  const zooming = performance.now() - (cameraState.wheelAt || 0) < 220;
  const shown = brainPresentationFish(blendFish(raw)), bodyPixels = fishBodyRadius(shown) * c.scale,
        detail = zooming && brainState.brainDetail !== undefined
                     ? brainState.brainDetail
                     : (brainState.brainDetail = brainCellDetail(shown, c)),
        poses =
            [
              shown[FISH.mouth_pose], shown[FISH.bite_pose], shown[FISH.suction_pose],
              shown[FISH.tail], ...(shown[FISH.fin_pose]?.slice(0, 3) || [])
            ].map(v => Math.round((v || 0) * 8)),
        poseKey = poses.join(':'), key = [
          f.brain.layout_id, Math.round(detail * 16), sessionState.neuronFocus,
          brainState.brainPinnedTissue, brainState.brainView
        ].join(':');
  const body = fishSnapshotAnatomy(raw, 16);
  // New brain data or moving fins alone rebuild the layout at most ten times a second.
  const fresh = (brainState.brainDrawing?.b !== f.brain || brainState.brainPoseKey !== poseKey) &&
                performance.now() - (brainState.brainBuiltAt || 0) > 100;
  if (key !== brainState.brainDrawingKey || fresh || !brainState.brainDrawing ||
      brainState.brainDrawingBody !== body) {
    brainState.brainBuiltAt = performance.now();
    brainState.brainPoseKey = poseKey;
    brainState.brainDrawingBody = body;
    brainState.brainDrawingKey = key;
    brainSetDrawing(brainBuild(f, c));
  }
  const d = brainState.brainDrawing;
  if (!d)
    return;
  const q = worldToScreen({x : shown[FISH.x], y : shown[FISH.y]}, c);
  d.view = {x : q.x, y : q.y, angle : shown[FISH.angle], scale : bodyPixels / 200};
  d.c = c;
  d.p = shown;
  d.raw = raw;
  d.step = f.step;
  brainShowOrgan(d);
  if (el('view-brain')?.dataset?.mode === 'organs')
    renderOrganIcons(d);
  else
    renderNerveMap(f);
  if (brainState.brainTraceStep !== f.step ||
      brainState.tracedStimulus !== f.brain.stimulus_revision) {
    brainState.tracedStimulus = f.brain.stimulus_revision;
    brainState.brainTraceStep = f.step;
    brainTrace(d);
  }
  ctx.save();
  ctx.layerAlpha *= brainState.brainOpacity;
  brainRender();
  ctx.restore();
  if (brain_inputState.brainPointerInside && brainState.brainPointer && !cameraState.drag?.pan &&
      !brainState.brainProbeArmed)
    brainHoverAt([ brainState.brainPointer.x, brainState.brainPointer.y ]);
}

export function updateBrainState(patch) {
  Object.assign(brainState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "brainOpen" : () => { brainState.brainOpen = false; },
  "brainPlaying" : () => { brainState.brainPlaying = false; },
  "brainBusy" : () => { brainState.brainBusy = false; },
  "brainLastAuto" : () => { brainState.brainLastAuto = 0; },
  "brainZoom" : () => { brainState.brainZoom = 1; },
  "brainPan" : () => { brainState.brainPan = {x : 0, y : 0}; },
  "brainDrag" : () => { brainState.brainDrag = null; },
  "brainDragged" : () => { brainState.brainDragged = false; },
  "brainDrawing" : () => { brainState.brainDrawing = null; },
  "brainSelectionPart" : () => { brainState.brainSelectionPart = ''; },
  "brainHover" : () => { brainState.brainHover = null; },
  "brainPackets" : () => { brainState.brainPackets = []; },
  "brainTraceStep" : () => { brainState.brainTraceStep = -1; },
  "brainLayoutId" : () => { brainState.brainLayoutId = ''; },
  "brainEpoch" : () => { brainState.brainEpoch = ''; },
  "brainOptionsKey" : () => { brainState.brainOptionsKey = ''; },
  "brainDrawTime" : () => { brainState.brainDrawTime = 0; },
  "brainHoverText" : () => { brainState.brainHoverText = ''; },
  "brainEdgeCache" : () => { brainState.brainEdgeCache = null; },
  "brainNerveCache" : () => { brainState.brainNerveCache = null; },
  "brainView" : () => { brainState.brainView = 'network'; },
  "brainTissueFocus" : () => { brainState.brainTissueFocus = 'all'; },
  "brainPinnedTissue" : () => { brainState.brainPinnedTissue = ''; },
  "brainWiringCache" : () => { brainState.brainWiringCache = null; },
  "brainReferenceRadius" : () => { brainState.brainReferenceRadius = 4; },
  "brainLastFish" : () => { brainState.brainLastFish = null; },
  "brainAcquireCandidate" : () => { brainState.brainAcquireCandidate = null; },
  "brainReturnView" : () => { brainState.brainReturnView = 'evolution'; },
  "brainOpacity" : () => { brainState.brainOpacity = 0; },
  "brainLastZoomTime" : () => { brainState.brainLastZoomTime = 0; },
  "brainExitSince" : () => { brainState.brainExitSince = 0; },
  "brainTempoBase" : () => { brainState.brainTempoBase = null; },
  "brainLastTempo" : () => { brainState.brainLastTempo = 0; },
  "brainRequestedDelay" : () => { brainState.brainRequestedDelay = -1; },
  "brainProbeArmed" : () => { brainState.brainProbeArmed = false; },
  "brainProbePoint" : () => { brainState.brainProbePoint = null; },
  "brainPointer" : () => { brainState.brainPointer = null; },
  "brainDrawingKey" : () => { brainState.brainDrawingKey = ''; },
  "brainTool" : () => { brainState.brainTool = 'light'; },
  "brainHue" : () => { brainState.brainHue = 0; },
  "brainMix" : () => { brainState.brainMix = [ 1, 0, 0, 0, 0, 0, 0, 0 ]; },
  "brainProbeBearing" : () => { brainState.brainProbeBearing = -.4; },
  "brainDistance" : () => { brainState.brainDistance = 65; },
  "brainWheelDrag" : () => { brainState.brainWheelDrag = false; },
  "brainWheelComponent" : () => { brainState.brainWheelComponent = 0; },
  "brainClamp" : () => { brainClamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)); },
  "brainWrap" : () => { brainWrap = a => Math.atan2(Math.sin(a), Math.cos(a)); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
