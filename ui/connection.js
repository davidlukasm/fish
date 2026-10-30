import {t} from './strings.js';
import {offerPopulation} from './population_picker.js';
import {FISH, CORPSE} from './schema.js';
import {updateEventViewState} from './event_view.js';
import {updateCockpitState} from './cockpit.js';
import {updateEvolutionState} from './evolution.js';
import {updateSessionState} from './session.js';
import {updateSceneState} from './state.js';
import {updateFeedingViewState} from './feeding_view.js';
import {updateWorldState} from './world.js';
import {request} from './session.js';
import {resetDrawing} from './tank.js';
import {resetFamilies} from './lineage.js';
import {brainState, resetBrainView} from './brain.js';
import {camera, cameraState, resetCamera, setFollowing} from './camera.js';
import {DisplayScene} from './scene_frame.js';
import {cockpitState, diversityRows} from './cockpit.js';
import {refreshHistory, showFrame} from './controller.js';
import {el, text} from './dom.js';
import {refreshJournal, resetJournalRequests} from './event_view.js';
import {evolutionState, pinnedSpecies, speciesCards} from './evolution.js';
import {fpsReport} from './report.js';
import {diagnostics, displayFaults} from './diagnostics.js';
import {command, sessionState, setObservation} from './session.js';
import {acceptFrame, receiveFrame, displayNow, resetInterpolation, sceneState} from './state.js';
import {decodeScene, lightCache, resetScene, transportState} from './transport.js';
export const connectionState = {};

export function hydrateRender(raw) {
  const savedLight = raw.light && lightCache.get(raw.light);
  const f = {
    ...raw,
    fish : (raw.fish || []).map(p => p.slice()),
    corpses : (raw.corpses || []).map(p => p.slice()),
    light : savedLight || {...raw.light},
    species : (raw.species || []).map(s => ({...s}))
  };
  const get = id => {
    const value = connectionState.renderAssets[String(id)];
    if (value === undefined)
      throw Error(t('connection.darstellungsdatenFehlen'));
    return value;
  };
  for (const p of f.fish || [])
    if (p[FISH.morphology_asset] && p[FISH.organs] == null) {
      const shape = get(p[FISH.morphology_asset]);
      [FISH.organs, FISH.fins, FISH.forms, FISH.contour, FISH.regions, FISH.body_geometry].forEach(
          (index, i) => p[index] = shape[i]);
    }
  for (const p of f.corpses || [])
    if (Number.isInteger(p[CORPSE.morphology_asset]))
      p[CORPSE.morphology_asset] = get(p[CORPSE.morphology_asset]);
  const l = f.light;
  if (!savedLight && l?.bytes) {
    l.values = Float32Array.from(l.bytes, v => v / 255);
    delete l.bytes;
    const key = String(l.clear_asset), base = get(key);
    l.clear_values = base.normalized || (base.normalized = Float32Array.from(base, v => v / 255));
    if (raw.light)
      lightCache.set(raw.light, l);
  }
  delete f.assets;
  return f;
}

export function hydrateFrame(f) {
  const b = f.brain;
  if (b) {
    const key = [ f.render_epoch, f.view_context, b.id ].join(':');
    if (b.hormones)
      connectionState.hormones = {key, value : b.hormones};
    else if (connectionState.hormones?.key === key)
      b.hormones = connectionState.hormones.value;
  }
  if (!b?.layout_id)
    return f;
  const layout = b.layout || b;
  if (layout.neurons) {
    connectionState.cachedBrainLayout = {layout_id : b.layout_id};
    for (const key of ['neurons', 'receptors', 'effectors', 'edges', 'focus', 'motor_counts'])
      connectionState.cachedBrainLayout[key] = layout[key];
  }
  if (connectionState.cachedBrainLayout?.layout_id !== b.layout_id)
    throw Error(t('connection.gehirnbauplanWirdErneutGeladen'));
  const brain = {...connectionState.cachedBrainLayout, ...b, visual_image : f.vision?.bands || []};
  delete brain.layout;
  brain.neurons = (brain.neurons || []).map(n => {
    const row = n.slice(), state = b.neuron_state?.[row[5]];
    if (state) {
      row[3] = state[0];
      row[7] = state[1];
      row[10] = state[2];
      row[18] = state[3];
      row[19] = state[4];
    }
    return row;
  });
  brain.receptors = (brain.receptors || []).map((r, i) => {
    const row = r.slice();
    if (b.sensor_state)
      row[3] = b.sensor_state[i] || 0;
    return row;
  });
  return {...f, brain};
}

export function resetSession(d) {
  setObservation('live', true);
  resetJournalRequests();
  updateSessionState({
    generation : (sessionState.generation || 0) + 1,
    historyBusy : false,
    lastHistory : 0,
    historyData : null
  });
  updateSessionState({selectionSequence : (sessionState.selectionSequence || 0) + 1});
  resetDrawing();
  connectionState.profileKey = '';
  connectionState.speciesKey = '';
  connectionState.speciesProfiles = {};
  connectionState.speciesRows = new Map();
  connectionState.cachedIndividualProfile = null;
  resetScene();
  connectionState.display?.reset();
  connectionState.sceneGeneration = (connectionState.sceneGeneration || 0) + 1;
  connectionState.metadata = null;
  fpsReport?.suspend('session');
  updateSessionState({sessionId : d.session});
  connectionState.stateVersion = '';
  connectionState.cachedBrainLayout = null;
  connectionState.renderAssets = {};
  connectionState.renderAssetsKey = '';
  updateCockpitState({eventSeen : updateEventViewState({eventOffset : 0})});
  updateCockpitState(
      {journalData : {events : [], archive : [], traces : {}, records : {}, autosaves : []}});
  updateCockpitState({lastJournal : 0});
  updateCockpitState({archiveSignature : ''});
  speciesCards.clear();
  diversityRows.clear();
  evolutionState.speciesRepresentatives.clear();
  pinnedSpecies.clear();
  cockpitState.patientRows.clear();
  updateEvolutionState({highlightSick : false});
  updateCockpitState({patientSignature : ''});
  updateWorldState({placingEggs : null});
  updateWorldState({currentSelection : updateWorldState({feederSelection : -1})});
  updateWorldState({currentSignature : updateWorldState({feederSignature : ''})});
  updateFeedingViewState({lastSelectedProfile : null});
  updateSceneState({frame : updateSceneState({previous : null})});
  updateEvolutionState({
    selectedSpecies :
        updateEvolutionState({highlightSpecies : updateEvolutionState({lineageFocus : 0})})
  });
  updateEvolutionState({individualSignature : ''});
  resetCamera();
  resetInterpolation(displayNow());
  resetBrainView();
  setFollowing(false);
  if (d.options) {
    el('new-fish').value = String(d.options.fish);
    el('new-world').value = d.options.empty_world ? 'empty' : 'starter';
  }
  if (d.frame?.selected && !d.frame.turbo && brainState.brainOpen && !evolutionState.editing)
    command('brain', {value : 1});
}

export function decodeState(d, brain = true) {
  if (d.render_assets) {
    Object.assign(connectionState.renderAssets, d.render_assets);
    if (d.asset_ids) {
      const ids = new Set(d.asset_ids);
      for (const key of Object.keys(connectionState.renderAssets))
        if (!ids.has(key))
          delete connectionState.renderAssets[key];
    }
    connectionState.renderAssetsKey = d.assets_key;
  }
  const f = hydrateRender(decodeScene(d));
  const profiles = connectionState.speciesProfiles ||= {};
  if (d.species_profiles)
    Object.assign(profiles, d.species_profiles);
  if (d.species_profile_ids) {
    const ids = new Set(d.species_profile_ids.map(String));
    for (const key of Object.keys(profiles))
      if (!ids.has(key))
        delete profiles[key];
  }
  for (const species of f.species || [])
    Object.assign(species, profiles[species.id] || {});
  if ('individual_profile' in d)
    connectionState.cachedIndividualProfile = d.individual_profile;
  connectionState.profileKey = d.profile_key || '';
  connectionState.speciesKey = d.species_key || '';
  f.individual_profile = connectionState.cachedIndividualProfile;
  if (d.brain_layout && f.brain)
    f.brain = {...f.brain, layout : d.brain_layout};
  return brain ? hydrateFrame(f) : f;
}

export function startupStatus(d) {
  if (d.exit_code !== null)
    return t('connection.startFehlgeschlagen');
  const p = d.startup;
  if (p?.phase === 'population')
    return t('connection.population', {created : p.created, requested : p.requested});
  if (p?.phase === 'genome')
    return t('connection.startgenomWirdVorbereitet');
  if (p?.phase === 'resume')
    return t('connection.gespeicherteWeltWirdGeladen');
  return t('connection.simulationStartet');
}

export function receiveState(d) {
  diagnostics.server = {session : d.session, options : d.options || diagnostics.server?.options};
  const stats = d.prepared_frame || d.frame;
  if (d.exit_code !== null) {
    displayFaults.confirm(t('connection.simulationBeendet'));
    displayFaults.report(t('connection.simulation'),
                         (d.logs || []).at(-1) || t('connection.exitCode', {code : d.exit_code}));
  } else {
    const current = stats || sceneState.frame;
    displayFaults.confirm(current?.historical ? t('connection.archivansicht')
                          : current?.paused   ? t('connection.simulationPausiert')
                          : current           ? t('connection.simulationLaeuft')
                                              : t('connection.simulationStartet2'));
    displayFaults.clear(t('connection.simulation'));
  }
  if (stats)
    diagnostics.event('simulation', {
      step : stats.step,
      tick_ms : stats.tick_ms,
      phases_ms : stats.step_phases,
      paused : stats.paused,
      turbo : stats.turbo
    });
  if (sessionState.sessionId !== d.session)
    resetSession(d);
  if (d.frame || d.frame_patches || d.prepared_frame) {
    if (d.prepared_frame && d.species_order) {
      const rows = connectionState.speciesRows ||= new Map();
      for (const change of d.species_updates || [])
        rows.set(change.id, {...rows.get(change.id), ...change});
      const ids = new Set(d.species_order);
      for (const id of rows.keys())
        if (!ids.has(id))
          rows.delete(id);
      d.prepared_frame.species = d.species_order.map(id => rows.get(id));
    }
    const f = d.prepared_frame ? hydrateFrame(d.prepared_frame) : decodeState(d);
    if (d.prepared_frame) {
      transportState.sceneKey = d.scene_key || '';
      connectionState.profileKey = d.profile_key || '';
      connectionState.speciesKey = d.species_key || '';
      connectionState.renderAssetsKey = d.assets_key || '';
    }
    f.observation = d.observation || {key : f.historical ? 'historical' : 'live'};
    if (setObservation(f.observation.key)) {
      resetJournalRequests();
      updateCockpitState(
          {journalData : {events : [], archive : [], traces : {}, records : {}, autosaves : []}});
      updateCockpitState({lastJournal : 0});
      updateEventViewState({eventOffset : 0});
      resetFamilies();
    }
    if (sceneState.frame?.selected !== f.selected)
      resetBrainView();
    if (sceneState.frame &&
        (sceneState.frame.historical !== f.historical || sceneState.frame.width !== f.width ||
         sceneState.frame.height !== f.height))
      resetCamera();
    if (f.binary_scene) {
      const startDisplay = !connectionState.sceneStarted;
      connectionState.sceneStarted = true;
      connectionState.metadata = f;
      connectionState.envelope = d;
      if (startDisplay)
        updateDisplay();
      // Turbo has no image stream; its regular status still drives the controls.
      if (f.turbo || !sceneState.frame) {
        acceptFrame(f);
        showFrame(f, d);
      }
    } else {
      acceptFrame(f);
      showFrame(sceneState.frame, d);
    }
    connectionState.stateVersion = d.frame_version || '';
  } else if (!d.unchanged)
    text('tank-status', startupStatus(d));
  offerPopulation(d);
}

function recoverConnection(e, scope) {
  displayFaults.report(scope, e);
  diagnostics.event('connection-error', {message : e.message});
  if (scope === t('connection.bildverbindung')) {
    connectionState.sceneGeneration = (connectionState.sceneGeneration || 0) + 1;
    connectionState.display.reset();
  }
  connectionState.statisticsReset = (connectionState.statisticsReset || 0) + 1;
  connectionState.stateVersion = '';
  resetScene();
  connectionState.profileKey = '';
  connectionState.speciesKey = '';
  connectionState.speciesProfiles = {};
  connectionState.speciesRows = new Map();
  connectionState.cachedIndividualProfile = null;
  connectionState.cachedBrainLayout = null;
  connectionState.renderAssetsKey = '';
  if (!sceneState.frame)
    text('tank-status', t('connection.startFehlgeschlagen'));
}

async function updateDisplay() {
  const generation = sessionState.generation, sceneGeneration = connectionState.sceneGeneration,
        signal = connectionState.abort.signal, requestAt = performance.now();
  try {
    if (connectionState.stopped)
      return;
    if (!connectionState.metadata?.binary_scene || connectionState.metadata.turbo ||
        document.hidden)
      return;
    const f = connectionState.metadata, c = camera(f),
          query = new URLSearchParams({
            base : String(connectionState.display.binary.sequence),
            x : String((cameraState.viewportWidth / 2 - c.ox) / c.scale),
            y : String((cameraState.viewportHeight / 2 - c.oy) / c.scale),
            width : String(cameraState.viewportWidth / c.scale),
            height : String(cameraState.viewportHeight / c.scale),
            scale : String(c.scale),
            brain : connectionState.cachedBrainLayout?.layout_id || '',
            inspection : connectionState.display.inspection?.inspection_id || '',
            focus : String(brainState.brainHover?.id ?? sessionState.neuronFocus ?? -1)
          }),
          response = await request('/scene?' + query, {signal : connectionState.abort.signal});
    if (!response.ok)
      throw Error(t('connection.darstellungsstromUnterbrochen'));
    const receivedBytes = Number(response.headers.get(t('connection.contentLength')));
    const buffer = await response.arrayBuffer();
    const downloadedAt = performance.now();
    if (signal.aborted || generation !== sessionState.generation ||
        sceneGeneration !== connectionState.sceneGeneration)
      return;
    const prepared = connectionState.sceneWorker
                         ? await workerRequest('scene', {buffer, generation : sceneGeneration},
                                               signal, [ buffer ])
                         : {result : connectionState.display.decoder.accept(buffer)};
    const packet = prepared.result;
    if (signal.aborted || generation !== sessionState.generation ||
        sceneGeneration !== connectionState.sceneGeneration)
      return;
    const readyAt = performance.now();
    const stages = {
      download_ms : downloadedAt - requestAt,
      prepare_ms : readyAt - downloadedAt,
      worker : !!connectionState.sceneWorker,
      worker_decode_ms : prepared.decode_ms,
      worker_roundtrip_ms : prepared.roundtrip_ms,
      step : packet.header.step,
      sequence : packet.header.sequence,
      delta : packet.header.delta
    };
    const decoded = connectionState.display.acceptPrepared(packet, connectionState.metadata);
    displayFaults.clear(t('connection.bildverbindung'));
    if (!decoded || connectionState.metadata.turbo || decoded === connectionState.lastDecoded) {
      fpsReport?.response(requestAt, readyAt, receivedBytes, true, 'scene', stages);
      return;
    }
    connectionState.lastDecoded = decoded;
    const next = hydrateFrame(decoded);
    receiveFrame(next);
    showFrame(next, connectionState.envelope);
    fpsReport?.response(requestAt, readyAt, receivedBytes, false, 'scene', stages);
  } catch (e) {
    if (e.name !== 'AbortError' && generation === sessionState.generation &&
        sceneGeneration === connectionState.sceneGeneration)
      recoverConnection(e, t('connection.bildverbindung'));
  } finally {
    if (!connectionState.stopped && !signal.aborted && signal === connectionState.abort.signal)
      connectionState.sceneTimer = setTimeout(
          updateDisplay,
          connectionState.metadata?.turbo || document.hidden
              ? 1000
              : Math.max(displayFaults.issues.has(t('connection.bildverbindung')) ? 1000 : 0,
                         50 - (performance.now() - requestAt)));
  }
}

async function readStatistics(query, signal) {
  const worker = connectionState.statisticsWorker;
  if (!worker) {
    const response = await request('/state?' + query, {signal});
    if (!response.ok)
      throw Error(t('connection.verbindungUnterbrochen'));
    return {
      result : await response.json(),
      bytes : Number(response.headers.get(t('connection.contentLength')))
    };
  }
  return workerRequest('statistics',
                       {url : '/state?' + query, reset : connectionState.statisticsReset || 0},
                       signal);
}

function workerRequest(kind, payload, signal, transfer = []) {
  const worker = connectionState[kind + 'Worker'], pendingKey = kind + 'Pending',
        startedAt = performance.now(), ticketKey = kind + 'Ticket',
        ticket = connectionState[ticketKey] = (connectionState[ticketKey] || 0) + 1;
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (value, error) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (connectionState[pendingKey]?.ticket === ticket)
        connectionState[pendingKey] = null;
      if (error)
        reject(error);
      else
        resolve({...value, roundtrip_ms : performance.now() - startedAt});
    }, abort = () => {
      worker.postMessage({cancel : true});
      finish(null, Object.assign(Error(t('connection.anfrageAbgebrochen')),
                                 {name : t('connection.aborterror')}));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, {once : true});
    connectionState[pendingKey] = {ticket, finish};
    timer = setTimeout(() => {
      worker.postMessage({cancel : true});
      finish(null, Error(t('connection.datenverarbeitungDauertZuLange')));
    }, 15000);
    try {
      worker.postMessage({ticket, ...payload}, transfer);
    } catch (error) {
      finish(null, error);
    }
  });
}

function startWorker(kind) {
  if (typeof Worker === 'undefined')
    return;
  const workerKey = kind + 'Worker', pendingKey = kind + 'Pending';
  try {
    const worker = new Worker('/ui/' + kind + '_worker.js', {type : 'module'});
    connectionState[workerKey] = worker;
    worker.onmessage = ({data}) => {
      const pending = connectionState[pendingKey];
      if (pending?.ticket !== data.ticket)
        return;
      const error = data.error ? Object.assign(Error(data.error), {name : data.name}) : null;
      pending.finish(data, error);
    };
    worker.onerror = () => {
      worker.terminate();
      connectionState[workerKey] = null;
      connectionState[pendingKey]?.finish(null, Error(t('connection.darstellungWirdNeuGeladen')));
    };
  } catch {
    connectionState[workerKey] = null;
  }
}

export async function update() {
  const signal = connectionState.abort.signal;
  try {
    if (connectionState.stopped)
      return;
    const requestAt = fpsReport ? performance.now() : 0,
          query = new URLSearchParams({
            wire : '1',
            after : connectionState.stateVersion,
            scene : transportState.sceneKey,
            profile : connectionState.profileKey,
            species : connectionState.speciesKey || '',
            assets : connectionState.renderAssetsKey,
            brain : connectionState.cachedBrainLayout?.layout_id || '',
            inspection : connectionState.display.inspection?.inspection_id || '',
            focus : String(brainState.brainHover?.id ?? sessionState.neuronFocus ?? -1)
          }),
          response = await readStatistics(query, signal), data = response.result;
    if (signal.aborted)
      return;
    const receivedBytes = response.bytes;
    const readyAt = performance.now();
    receiveState(data);
    displayFaults.clear(t('connection.statistikverbindung'));
    fpsReport?.response(requestAt, readyAt, receivedBytes, !!data.unchanged, 'statistics', {
      worker : !!connectionState.statisticsWorker,
      worker_roundtrip_ms : response.roundtrip_ms,
      ...response.timing
    });
    if (Date.now() - sessionState.lastHistory > 2000)
      refreshHistory();
    if (Date.now() - cockpitState.lastJournal > 2000)
      refreshJournal();
  } catch (e) {
    if (e.name === 'AbortError' || signal.aborted || signal !== connectionState.abort.signal)
      return;
    recoverConnection(e, t('connection.statistikverbindung'));
  } finally {
    if (!connectionState.stopped && !signal.aborted && signal === connectionState.abort.signal)
      connectionState.timer = setTimeout(update, 1000);
  }
}

const initializers = {
  "stateVersion" : () => { connectionState.stateVersion = ''; },
  "cachedBrainLayout" : () => { connectionState.cachedBrainLayout = null; },
  "profileKey" : () => { connectionState.profileKey = ''; },
  "cachedIndividualProfile" : () => { connectionState.cachedIndividualProfile = null; },
  "renderAssets" : () => { connectionState.renderAssets = {}; },
  "renderAssetsKey" : () => { connectionState.renderAssetsKey = ''; },
  "display" : () => {
    connectionState.display = new DisplayScene();
    connectionState.abort = new AbortController();
    connectionState.stopped = false;
    startWorker('statistics');
    startWorker('scene');
    window.addEventListener('pagehide', () => {
      connectionState.stopped = true;
      clearTimeout(connectionState.timer);
      clearTimeout(connectionState.sceneTimer);
      connectionState.abort.abort();
      connectionState.statisticsReset = (connectionState.statisticsReset || 0) + 1;
      connectionState.stateVersion = '';
      connectionState.renderAssetsKey = '';
      connectionState.profileKey = '';
      connectionState.speciesKey = '';
      connectionState.speciesProfiles = {};
      connectionState.speciesRows = new Map();
      resetScene();
    });
    window.addEventListener('pageshow', () => {
      if (!connectionState.stopped)
        return;
      connectionState.stopped = false;
      connectionState.abort = new AbortController();
      update();
      updateDisplay();
    });
    update();
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
