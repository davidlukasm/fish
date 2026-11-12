import {t} from './strings.js';
import {offerPopulation} from './population_picker.js';
import {ROUTE} from './schema.js';
import {updateEventViewState} from './event_view.js';
import {updateCockpitState} from './cockpit.js';
import {updateEvolutionState} from './evolution.js';
import {updateSessionState} from './session.js';
import {
  displayNow,
  frameChangesContext,
  frameStartsAnew,
  PLAYBACK,
  receiveFrame,
  resetInterpolation,
  sceneState,
  storeFrame,
  takeFramesWith,
  updateSceneState
} from './state.js';
import {recordEggBirths} from './egg_births.js';
import {updateFeedingViewState} from './feeding_view.js';
import {updateWorldState} from './world.js';
import {request} from './session.js';
import {resetDrawing, tankState} from './tank.js';
import {resetFamilies} from './lineage.js';
import {brainState, resetBrainView, updateBrainState} from './brain.js';
import {camera, cameraState, resetCamera, setFollowing, updateCameraState} from './camera.js';
import {DisplayScene} from './scene_frame.js';
import {cockpitState, diversityRows} from './cockpit.js';
import {refreshHistory, showFrame} from './controller.js';
import {el, tankVisible, text} from './dom.js';
import {refreshJournal, resetJournalRequests} from './event_view.js';
import {journal_modelState, resetJournal} from './journal_model.js';
import {evolutionState, pinnedSpecies, speciesCards} from './evolution.js';
import {fpsReport} from './report.js';
import {diagnostics, displayFaults} from './diagnostics.js';
import {command, sessionState, setObservation} from './session.js';
import {resetBlood} from './effects.js';
import {rememberFamilies} from './family_model.js';
import {updateMinds} from './mind.js';
import {cancelWorldGesture} from './world.js';
import {resetScene, transportState} from './transport.js';
import {
  decodeState as decodeStatistics,
  hydrateFrame as hydrateStatisticsFrame
} from './statistics_frame.js';
export const connectionState = {};
const POLL =
    Object.freeze({slow_ms : 1000, statistics_ms : 1000, history_ms : 2000, worker_ms : 15000});

const hydrateFrame = frame => hydrateStatisticsFrame(frame, connectionState);

export function acceptFrame(next, now = displayNow(), from = null,
                            interval = PLAYBACK.interval_ms) {
  if (frameChangesContext(next)) {
    evolutionState.speciesRepresentatives.clear();
    pinnedSpecies.clear();
    resetFamilies();
  }
  if (frameStartsAnew(next)) {
    resetDrawing();
    updateSessionState({selectionSequence : (sessionState.selectionSequence || 0) + 1});
    fpsReport?.suspend('scene');
    resetBlood();
    updateBrainState({brainLastFish : null, brainAcquireCandidate : null});
    resetMotion(now);
    cancelWorldGesture();
    tankState.contextMenu = null;
  } else if (sceneState.frame.step !== next.step) {
    recordEggBirths(next, now);
  }
  storeFrame(next, now, from, interval);
  rememberFamilies(next);
  updateMinds(next);
}

function resetMotion(now) {
  resetInterpolation(now);
  updateCameraState({zoomIntent : null});
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
  forgetSpecies();
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
  resetJournal();
  updateCockpitState({archiveSignature : ''});
  speciesCards.clear();
  diversityRows.clear();
  evolutionState.speciesRepresentatives.clear();
  pinnedSpecies.clear();
  cockpitState.patientRows.clear();
  updateSceneState({highlightSick : false});
  updateCockpitState({patientSignature : ''});
  updateWorldState({placingEggs : null});
  updateWorldState({currentSelection : updateWorldState({feederSelection : -1})});
  updateWorldState({currentSignature : updateWorldState({feederSignature : ''})});
  updateFeedingViewState({lastSelectedProfile : null});
  updateSceneState({frame : updateSceneState({previous : null})});
  updateEvolutionState({selectedSpecies : updateEvolutionState({lineageFocus : 0})});
  updateSceneState({highlightSpecies : 0});
  updateEvolutionState({individualSignature : ''});
  resetCamera();
  resetMotion(displayNow());
  resetBrainView();
  setFollowing(false);
  if (d.options) {
    el('new-fish').value = String(d.options.fish);
    el('new-world').value = d.options.empty_world ? 'empty' : 'starter';
  }
  if (d.frame?.selected && !d.frame.turbo && brainState.brainOpen && !evolutionState.editing)
    command('brain', {value : 1});
}

export function decodeState(d, brain = true) { return decodeStatistics(d, connectionState, brain); }

function startupStatus(d) {
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
      // A species the worker considers known but this thread lost cannot be shown; the next
      // delivery is then complete again.
      if (d.species_order.some(id => !rows.has(id)))
        forgetSpecies(false);
      d.prepared_frame.species = d.species_order.map(id => rows.get(id)).filter(Boolean);
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
      resetJournal();
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

// The statistics worker only sends species fields that changed; whenever this thread forgets its
// species rows, the worker must forget its fingerprints too, or species would arrive empty.
function forgetSpecies(rows = true) {
  if (rows)
    connectionState.speciesRows = new Map();
  connectionState.statisticsReset = (connectionState.statisticsReset || 0) + 1;
}

function recoverConnection(e, scope) {
  displayFaults.report(scope, e);
  diagnostics.event('connection-error', {message : e.message});
  if (scope === t('connection.bildverbindung')) {
    connectionState.sceneGeneration = (connectionState.sceneGeneration || 0) + 1;
    connectionState.display.reset();
  }
  connectionState.stateVersion = '';
  resetScene();
  connectionState.profileKey = '';
  connectionState.speciesKey = '';
  connectionState.speciesProfiles = {};
  forgetSpecies();
  connectionState.cachedIndividualProfile = null;
  connectionState.cachedBrainLayout = null;
  connectionState.renderAssetsKey = '';
  if (!sceneState.frame)
    text('tank-status', t('connection.startFehlgeschlagen'));
}

const viewKeys = () => ({
  brain : connectionState.cachedBrainLayout?.layout_id || '',
  inspection : connectionState.display.inspection?.inspection_id || '',
  focus : String(brainState.brainHover?.id ?? sessionState.neuronFocus ?? -1)
});
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
            ...viewKeys()
          }),
          response =
              await request(ROUTE.scene + '?' + query, {signal : connectionState.abort.signal});
    if (!response.ok)
      throw Error(t('connection.darstellungsstromUnterbrochen'));
    const receivedBytes = Number(response.headers.get('Content-Length'));
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
          // Behind another station the aquarium is not drawn, so its pictures arrive slowly too.
          connectionState.metadata?.turbo || document.hidden || !tankVisible()
              ? POLL.slow_ms
              : Math.max(displayFaults.issues.has(t('connection.bildverbindung')) ? POLL.slow_ms
                                                                                  : 0,
                         PLAYBACK.interval_ms - (performance.now() - requestAt)));
  }
}

async function readStatistics(query, signal) {
  const worker = connectionState.statisticsWorker;
  if (!worker) {
    const response = await request(ROUTE.state + '?' + query, {signal});
    if (!response.ok)
      throw Error(t('connection.verbindungUnterbrochen'));
    return {result : await response.json(), bytes : Number(response.headers.get('Content-Length'))};
  }
  return workerRequest(
      'statistics', {url : ROUTE.state + '?' + query, reset : connectionState.statisticsReset || 0},
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
    }, POLL.worker_ms);
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
    const worker = new Worker(ROUTE.assets + kind + '_worker.js', {type : 'module'});
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
            ...viewKeys()
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
    if (Date.now() - sessionState.lastHistory > POLL.history_ms)
      refreshHistory();
    if (Date.now() - journal_modelState.loadedAt > POLL.history_ms)
      refreshJournal();
  } catch (e) {
    if (e.name === 'AbortError' || signal.aborted || signal !== connectionState.abort.signal)
      return;
    recoverConnection(e, t('connection.statistikverbindung'));
  } finally {
    if (!connectionState.stopped && !signal.aborted && signal === connectionState.abort.signal)
      connectionState.timer = setTimeout(update, POLL.statistics_ms);
  }
}

const initializers = {
  "takeFrames" : () => { takeFramesWith(acceptFrame); },
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
      connectionState.stateVersion = '';
      connectionState.renderAssetsKey = '';
      connectionState.profileKey = '';
      connectionState.speciesKey = '';
      connectionState.speciesProfiles = {};
      forgetSpecies();
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
