import {hormoneName} from './hormones.js';
import {updateSessionState} from './session.js';
import {updateCameraState} from './camera.js';
import {brainCellDetail, brainOrganKey} from './brain_geometry.js';
import {brainArmProbe, brainHoverAt, brain_inputState} from './brain_input.js';
import {brainBuild} from './brain_layout.js';
import {
  brainScentWeights,
  cellDescription,
  neuronName,
  scentColors,
  scentNames
} from './brain_model.js';
import {brainRender} from './brain_painter.js';
import {brainOdorMarks, brainTrackProbe, scentSphere} from './brain_probe.js';
import {brainPresentationFish, brainResetSignals, brainTrace} from './brain_signals.js';
import {drawCellTuning, drawCppnOutputs} from './brain_tuning.js';
import {cameraState, nearbyZoomFish, screenToWorld, worldToScreen} from './camera.js';
import {ctx, el, text} from './dom.js';
import {evolutionState, setView} from './evolution.js';
import {fishBodyRadius} from './fish_fins.js';
import {fishSnapshotAnatomy} from './fish_forms.js';
import {brainShowOrgan, renderOrganIcons} from './organs.js';
import {renderNerveMap} from './nerve_map.js';
import {command, sessionState} from './session.js';
import {
  blendFish,
  displayNow,
  frameFish,
  frameCorpse,
  horizontalDelta,
  sceneState,
  selectFish,
  syncBrainRequest
} from './state.js';
export const brainState = {};
export let brainClamp;

export let brainWrap;

// Keep only the current inspection's image storage; moving poses reuse its GPU targets.
export function brainSetDrawing(next) {
  const old = brainState.brainDrawing;
  if (old && old !== next) {
    if (next) {
      old.mesh.replace(next.mesh);
      next.mesh = old.mesh;
    } else
      ctx.releaseImage(old.mesh);
  }
  brainState.brainDrawing = next;
}

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
  el('brain-cell-details').open = false;
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
      f.fish.some(p => p[4] === brainState.brainLastFish && p[8]) ||
      f.fish.some(p => p[4] === f.selected && p[8]) || !brain_inputState.brainPointerInside ||
      !brainState.brainPointer || cameraState.zoomSelectionPending || sessionState.busy ||
      brainState.brainBusy || cameraState.drag || evolutionState.editing || f.turbo ||
      f.historical || brainState.brainProbeArmed ||
      brainState.brainReferenceRadius * c.scale < 36) {
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
  const p = frameFish(f), screen = p && worldToScreen({x : p[0], y : p[1]}, c),
        bodyRadius = p ? fishBodyRadius(p) * c.scale : 0,
        eligible =
            !!(p?.[8] && !evolutionState.editing && !f.turbo && screen.x >= -bodyRadius &&
               screen.x <= cameraState.viewportWidth + bodyRadius && screen.y >= -bodyRadius &&
               screen.y <= cameraState.viewportHeight + bodyRadius),
        radius = eligible ? bodyRadius : 0;
  if (eligible && radius >= 52) {
    brainState.brainReferenceRadius = radius / c.scale;
    brainState.brainLastFish = p[4];
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
  el('tab-brain').hidden = el('tab-organs').hidden = !p?.[8];
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
    const wanted = slowZoom ? Math.round(Math.max(brainState.brainTempoBase,
                                                  150 + 850 * brainClamp((zoomRadius - 52) / 168)))
                            : brainState.brainTempoBase;
    if (Math.abs(wanted - brainState.brainRequestedDelay) >= 25 ||
        (!slowZoom && wanted !== brainState.brainRequestedDelay)) {
      brainState.brainRequestedDelay = wanted;
      brainState.brainLastTempo = now;
      command('delay', {value : wanted});
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
    el('speed').title = 'Tempo folgt dem Zoom · ' +
                        rate.toLocaleString('de', {maximumFractionDigits : 1}) + ' Schritte/s';
  } else
    el('speed').title = '';
}

export function brainTissueMatches(n, key) {
  return key === 'all' || (key === 'internal' ? n[12] > 0
                           : key[0] === 's'   ? n[13]?.[Number(key.slice(1))] > 0
                                              : n[14]?.[Number(key.slice(1))] > 0);
}

export function focusNeuron(id, part = '', reveal = true) {
  if (reveal && brainState.brainOpen && evolutionState.activeView !== 'brain')
    setView('brain');
  updateSessionState({neuronFocus : id});
  brainState.brainSelectionPart = part;
  brainState.brainPinnedTissue = '';
  brainState.brainTissueFocus = part || 'all';
  brainState.brainOptionsKey = '';
  if (el('brain-flow').value === 'selection')
    brainState.brainPackets = [];
  if (el('brain-flow').value === 'selection')
    brainState.brainDrawingKey = '';
  if (sceneState.frame)
    showBrain(sceneState.frame);
}

export function brainTissueName(key) {
  return key==='gut'?'Darm':key==='reserve'?'Reserve':key==='internal'?'ZNS':key[0]==='s'?['Auge','Nase','Seitenlinie','Haut','Nähe','Aufnahme','Schaden','Blasendruck','Gonadendruck','Innendruck','Blutwerte'][Number(key.slice(1))]:['Schwanzflosse','Drehflosse','Saugapparat','Ei-Organ','Sperma-Organ','Kiefer','Schutzstacheln','Pigmente','Schwimmblase','Hirndrüse'][Number(key.slice(1))];
}

export function focusTissue(hit) {
  updateSessionState({neuronFocus : -1});
  brainState.brainPinnedTissue = hit.tissue;
  brainState.brainTissueFocus = hit.part;
  brainState.brainSelectionPart = hit.part;
  brainState.brainOptionsKey = '';
  if (el('brain-flow').value === 'selection')
    brainState.brainDrawingKey = '';
  if (sceneState.frame)
    showBrain(sceneState.frame);
}

export function showNeuron(n, b, nodes) {
  text('neuron-info', n ? cellDescription(n, b) : '');
  const learned = new Map(b.learning?.weights || []), box = el('neuron-links'),
        ranked = b.edges.filter(e => e[0] === n?.[5] || e[1] === n?.[5])
                     .sort((a, c) => Math.abs(learned.get(c[3]) ?? c[2]) -
                                         Math.abs(learned.get(a[3]) ?? a[2]) ||
                                     a[3] - c[3])
                     .slice(0, 16),
        key = b.layout_id + ':' + sessionState.neuronFocus + ':' + ranked.map(e => e[3]).join(',');
  const update = (cell, edge) => {
    const value = learned.get(edge[3]) ?? edge[2];
    cell.textContent = value.toFixed(3);
    cell.title = 'Gewicht bei Bildung: ' + edge[2].toFixed(3);
  };
  if (box.brainKey === key) {
    for (const [cell, edge] of box.brainWeights || [])
      update(cell, edge);
    return;
  }
  box.brainKey = key;
  box.brainWeights = [];
  box.replaceChildren();
  if (!n)
    return;
  const receptor = b.receptors.find(r => r[0] === n[5]);
  if (receptor?.[9]?.[1] > 0)
    box.appendChild(scentSphere(receptor));
  const table = document.createElement('table');
  table.className = 'neuron-table';
  const list = ranked;
  for (const edge of list) {
    const id = edge[0] === n[5] ? edge[1] : edge[0], other = nodes.get(id),
          row = document.createElement('tr'), cell = document.createElement('td'),
          button = document.createElement('button');
    button.textContent =
        (edge[0] === n[5] ? '→ ' : '← ') + '#' + id + ' ' + (other ? neuronName(other) : '');
    button.onclick = () => focusNeuron(id);
    cell.appendChild(button);
    row.appendChild(cell);
    const weight = document.createElement('td');
    update(weight, edge);
    box.brainWeights.push([ weight, edge ]);
    row.appendChild(weight);
    const delay = document.createElement('td');
    delay.textContent = '1 Schritt';
    row.appendChild(delay);
    table.appendChild(row);
  }
  box.appendChild(table);
}

export function brainInspector(d) {
  const n = d.nodes.get(sessionState.neuronFocus);
  text('brain-cell-summary',
       n ? '#' + n[5] + ' · ' + neuronName(n, brainState.brainSelectionPart) : '');
  el('brain-activity').value = n?.[3] || 0;
  text('brain-activity-value', (n?.[3] || 0).toFixed(2).replace('.', ','));
  const r = n && d.receptors.get(n[5]);
  text('brain-cell-properties', n ? [
    ...(r ? [(r[1] === 1 ? 'Grundschwelle ' : 'Schwelle ') + r[r[1] < 2 || r[1] === 10 ? 13 : 4].toPrecision(2)] : []),
    ...(n[12] > 0 || !r ? ['Bias ' + (n[15] || 0).toFixed(2).replace('.', ',')] : []),
    ...(n[16] > 0 ? [([1, 2, 5, 6, 10].includes(r?.[1]) ? 'Adaptation ' : 'Zeitkonstante ') + Math.round(n[16] || 0) + ' Schritte'] : [])
  ].join(' · ') : '');
  if (r?.[1] === 10) {
    text('brain-cell-properties',
         'Blut · ' +
             [ 0, 1, 2, 3, 4, 5 ]
                 .map(k => (k < 4 ? hormoneName(d.b.hormones, k) : [ 'Reife', 'Reserve' ][k - 4]) +
                           ' ' + Math.round(100 * (r[21]?.[k] || 0)) + ' %')
                 .join(' · ') +
             ' · Schwelle ' + r[13].toPrecision(3) + ' · Signal ' + (n[3] || 0).toFixed(3));
  } else if (n?.[12] > 0) {
    const p = n[20] || [], index = d.b.neurons.findIndex(v => v[5] === n[5]),
          surprise = d.b.learning?.surprise?.[index];
    text('brain-cell-properties',
         'Hormonwirkungen ' +
             (n[27] || [])
                 .map((v, k) => ['Erregung', 'Lernen', 'Konkurrenz', 'Spur', 'Rhythmus', 'Ausgabe',
                                 'Zelltod'][k] +
                                ' ' + v.toFixed(2))
                 .join(' · ') +
             ' · Anpassung ' + (n[30] || 0).toFixed(3) + ' · Lernstärke ' + (p[8] || 0).toFixed(2) +
             ' · Spurzeit ' + (2 * 12 ** (p[6] || 0)).toFixed(1) + ' · Überraschung ' +
             (surprise?.[0] || 0).toFixed(3) + ' · Aktionsabweichung ' +
             (surprise?.[1] || 0).toFixed(3));
  }
  if (n?.[29])
    text('brain-cell-properties', 'Abgestorbene Zelle · Verbindungen entfernt');
  drawCellTuning(el('brain-cell-tuning'), n, r, d);
  drawCppnOutputs(el('brain-cppn-chart'), n, d);
  const odor = !!n?.[13]?.[1];
  el('brain-odor-profile').hidden = !odor;
  if (odor) {
    const weights = brainScentWeights(n, r);
    for (let k = 0; k < 8; k++) {
      const mark = brainOdorMarks[k], value = weights[k];
      mark.label.textContent = scentNames[k] + ' ' + Math.round(value * 100) + ' %';
      mark.dot.style.opacity = .15 + .85 * value;
      mark.dot.style.background = scentColors[k];
      mark.box.title = 'Empfindlichkeit für ' + scentNames[k];
    }
  }
  showNeuron(n, d.b, d.nodes);
  if (n)
    el('brain-cell').value = String(n[5]);
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

export function brainRefreshOptions(d) {
  const key = d.b.layout_id + ':' + brainState.brainTissueFocus;
  if (key === brainState.brainOptionsKey)
    return;
  brainState.brainOptionsKey = key;
  const select = el('brain-cell');
  select.replaceChildren();
  for (const n of d.b.neurons.filter(n => n[4] &&
                                          brainTissueMatches(n, brainState.brainTissueFocus))) {
    const option = document.createElement('option');
    option.value = n[5];
    option.textContent = '#' + n[5] + ' · ' + neuronName(n, brainState.brainTissueFocus);
    select.appendChild(option);
  }
  if (sessionState.neuronFocus >= 0 &&
      (!d.nodes.has(sessionState.neuronFocus) ||
       !brainTissueMatches(d.nodes.get(sessionState.neuronFocus), brainState.brainTissueFocus)))
    updateSessionState({neuronFocus : -1});
  select.value = String(sessionState.neuronFocus);
}

export function showBrain(f) {
  const b = f.brain, info = b?.planning ? 'Gehirnaufbau'
                            : b         ? b.neuron_count + ' Zellen · ' +
                                      b.edge_count.toLocaleString('de') + ' Verbindungen'
                                : '';
  text('brain-info', info);
  if (!brainState.brainOpen)
    return;
  if (brainState.brainEpoch !== f.render_epoch) {
    brainSetOpen(false);
    return;
  }
  text('brain-title', brainState.brainView === 'organs' ? 'Organe' : 'Nervensystem');
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
  brainRefreshOptions({b, nodes : new Map(b.neurons.map(n => [n[5], n]))});
  const p = frameFish(f);
  if (!p)
    return;
  brainInspector({
    b,
    p,
    nodes : new Map(b.neurons.map(n => [n[5], n])),
    receptors : new Map(b.receptors.map(r => [r[0], r]))
  });
  const probe = b.probe;
  el('brain-spatial').hidden = !(probe?.remaining > 0 && probe.kind < 2);
  el('brain-clear-probe').disabled = !(probe?.remaining > 0);
  text('brain-probe-state', probe?.remaining > 0 ? 'Reiz · ' + probe.remaining + ' Schritte' : '');
  text('brain-heading-value', Math.round(brainWrap(p[2]) * 180 / Math.PI) + '°');
  text('brain-distance-value', probe?.remaining > 0
                                   ? Math.hypot(horizontalDelta(probe.x - p[0]), probe.y - p[1])
                                             .toFixed(1)
                                             .replace('.', ',') +
                                         ' px'
                                   : '');
  for (const id of ['brain-probe'])
    el(id).disabled = !!f.historical || !p[8];
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
  if (!raw?.[8])
    return;
  // While the wheel turns, the drawing keeps its detail level and is only scaled.
  const zooming = performance.now() - (cameraState.wheelAt || 0) < 220;
  const shown = brainPresentationFish(blendFish(raw)), bodyPixels = fishBodyRadius(shown) * c.scale,
        detail = zooming && brainState.brainDetail !== undefined
                     ? brainState.brainDetail
                     : (brainState.brainDetail = brainCellDetail(shown, c)),
        poses =
            [ shown[19], shown[64], shown[65], shown[44], ...(shown[57]?.slice(0, 3) || []) ].map(
                v => Math.round((v || 0) * 8)),
        poseKey = poses.join(':'), key = [
          f.brain.layout_id, Math.round(detail * 16), el('brain-flow').value,
          el('strong-edges').checked, sessionState.neuronFocus, brainState.brainPinnedTissue,
          brainState.brainView
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
  const q = worldToScreen({x : shown[0], y : shown[1]}, c);
  d.view = {x : q.x, y : q.y, angle : shown[2], scale : bodyPixels / 200};
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
