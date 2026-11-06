import {PERCENT} from './units.js';
import {KEY} from './keys.js';
import {formatNumber, t, percent} from './strings.js';
import {selectedPopulation, populationStarted} from './population_picker.js';
import {EDIT_LIMIT, FISH, GENERATION, ROUTE} from './schema.js';
import {updateWorldState} from './world.js';
import {updateSessionState} from './session.js';
import {sceneState, updateSceneState} from './state.js';
import {selectFish, syncBrainRequest} from './fish_choice.js';
import {request, serverText} from './session.js';
import {brainState, closeBrain, showBrain} from './brain.js';
import {brainArmProbe} from './brain_input.js';
import {resetCamera, setFollowing} from './camera.js';
import {behaviorMap, chart, helpSummary, rates} from './charts.js';
import {updateCockpit} from './cockpit.js';
import {el, text} from './dom.js';
import {renderWorlds} from './event_view.js';
import {deselectSpecies, evolutionState, renderSpecies} from './evolution.js';
import {feeding_viewState} from './feeding_view.js';
import {lineageState} from './lineage.js';
import {showSelection} from './selection.js';
import {command, sessionState} from './session.js';
import {endEggPlacement, setTool, worldState} from './world.js';
import {newEnergyFields, showBursts, showWorld} from './world_parameters.js';
export const controllerState = {};

export function newRunChoice() {
  return {
    fish : Number(el('new-fish').value),
    population : selectedPopulation(),
    world : el('new-world').value || 'starter',
    energy : Object.fromEntries(
        newEnergyFields.map(name => [name, Number(el('new-' + name.replaceAll('_', '-')).value)])),
    ...(el('new-seed').value.trim() ? {seed : Number(el('new-seed').value)} : {})
  };
}

export async function startNewRun(choice) {
  if (sessionState.busy)
    return false;
  updateSessionState({busy : true});
  el('new').disabled = true;
  const ok = await command('new', choice);
  if (ok) {
    controllerState.lastRun = {...choice};
    delete controllerState.lastRun.seed;
    populationStarted();
    el('new-run-dialog').close();
    el('new-seed').value = '';
    updateSceneState({frame : updateSceneState({previous : null})});
    updateSessionState({historyData : null});
    updateSessionState({lastHistory : 0});
    resetCamera();
    setFollowing(false);
    text('tank-status', t('controller.neuerLaufWirdGeladen'));
  }
  updateSessionState({busy : false});
  el('new').disabled = false;
  return ok;
}

export function showFrame(f, data) {
  text('generation', t('controller.step', {n : formatNumber(f.step)}));
  const key = [
    evolutionState.activeView, f.selected, brainState.brainOpen, sceneState.renderInputRevision
  ].join(':');
  if (showFrame.envelope === data && showFrame.key === key) {
    if (evolutionState.activeView === 'fish')
      showSelection(f);
    if (brainState.brainOpen)
      showBrain(f);
    return;
  }
  showFrame.envelope = data;
  showFrame.key = key;
  const tasks = [];
  const disease = f.disease || {};
  text('disease-summary', t('controller.sick', {n : disease.sick || 0}));
  for (const kind of ['spontaneous', 'food', 'carrion', 'contact', 'deaths'])
    text('disease-' + kind, disease[kind] || 0);
  text('live-disease', t('controller.sickCount', {n : disease.sick || 0}));
  el('live-disease').hidden = false;
  el('live-disease').title = t('controller.krankeGeschluepfteFischeIm');
  el('current-seed').hidden = !!f.historical;
  text('current-seed', t('controller.seed', {seed : data.options?.seed ?? '–'}));
  text('adults', f.hatched);
  text('eggs', Math.max(0, f.eggs - (f.nutrient_eggs_alive || 0)));
  text('nutrient-eggs', f.nutrient_eggs_alive || 0);
  el('nutrient-stock').hidden = !f.nutrient_eggs_alive;
  el('nutrient-eggs').title =
      t('controller.nurseEggs', {lying : f.nutrient_eggs_alive || 0, total : f.nutrient_eggs || 0});
  const natural =
      f.fish.filter(p => p[FISH.hatched] && p[FISH.generation] >= GENERATION.natural).length;
  text('natural-count', percent(f.hatched ? natural / f.hatched : 0));
  el('natural-count').title = t('controller.natural', {n : natural, total : f.hatched});
  el('natural-fill').style.width = (f.hatched ? PERCENT * natural / f.hatched : 0) + '%';
  text('pause', f.paused ? t('controller.weiter') : t('controller.pause'));
  el('pause').toggleAttribute?.('data-paused', !!f.paused);
  el('current').hidden = !f.historical;
  text('tank-status', f.historical ? t('controller.savedWorld', {step : formatNumber(f.step)})
                      : f.turbo    ? t('controller.maximaltempoAnsichtAusgesetzt')
                      : data.exit_code !== null ? t('controller.simulationBeendet')
                      : f.paused                ? t('controller.pausiert')
                      : brainState.brainOpen    ? t('controller.untersuchen')
                                                : t('controller.fischHeranzoomen'));
  const preset = [...el('speed').options ].some(o => o.value === String(f.delay_ms));
  if (document.activeElement !== el('speed'))
    el('speed').value = brainState.brainOpen ? 'inspection'
                        : f.turbo            ? 'turbo'
                        : preset             ? String(f.delay_ms)
                                             : 'inspection';
  if (f.parameters) {
    syncSlider('mutation', f.parameters.mutation, 'mutation-value', mutationLabel);
    syncSlider('strong-share', f.parameters.subgraph_mutation, 'strong-share-value',
               v => percent(v));
  }
  if (f.parameter_info)
    controllerState.standardSupply =
        EDIT_LIMIT.supply_scale * f.parameter_info.find(p => p.name === 'energy_supply').default;
  syncSlider('bottom-residence',
             f.bottom_residence === 0 ? unlimitedResidence() : f.bottom_residence,
             'bottom-residence-value', residenceLabel);
  el('bottom-residence').disabled = !!f.historical;
  if (f.parameters && controllerState.standardSupply)
    syncSlider('feeding', supplyPosition(EDIT_LIMIT.supply_scale * f.parameters.energy_supply),
               'feeding-value', supplyLabel);
  el('support').checked = f.safety;
  text('support-note', helpSummary(f));
  for (const id of ['mutation', 'strong-share', 'feeding', 'support', 'bookmark', 'pause', 'speed',
                    'single-step', 'edit-world', 'quick-feed', 'clear-food', 'resize-world',
                    'world-width', 'world-height', 'flow', 'gravity', 'population-limit',
                    'minimum-population', 'import-genome'])
    el(id).disabled = !!f.historical || (id === 'speed' && brainState.brainOpen);
  for (const input of worldState.parameterInputs.values())
    input.disabled = !!f.historical;
  for (const button of document.querySelectorAll('[data-tool]'))
    button.disabled = !!f.historical;
  el('undo-geometry').disabled = !evolutionState.editing || !!f.historical || !f.can_undo;
  const perf = f.performance;
  const intake = perf ? perf.food_rate + perf.ecosystem_rate : 0;
  text('performance-intake', perf?.exposure ? formatNumber(intake, 1) : '–');
  text('performance-ecosystem',
       perf?.exposure && intake ? percent(perf.ecosystem_rate / intake) : '–');
  text('performance-reserve', perf ? formatNumber(perf.mean_reserve) : '–');
  text('performance-replacement',
       perf ? f.assistance?.deaths ? formatNumber(f.assistance.hatches / f.assistance.deaths, 2)
                                   : '–'
            : '–');
  el('performance-intake').title = t('controller.intakeHelp', {n : perf?.window_steps || 0});
  tasks.push(() => showBursts(f), () => rates(f));
  if (evolutionState.activeView === 'evolution' && !evolutionState.editing) {
    tasks.push(() => behaviorMap(f));
    if (sessionState.historyData)
      tasks.push(() => chart(sessionState.historyData));
  }
  if (evolutionState.activeView === 'fish' || evolutionState.activeView === 'brain')
    tasks.push(() => showSelection(f));
  if (brainState.brainOpen)
    tasks.push(() => showBrain(f));
  tasks.push(() => renderSpecies(f));
  if (evolutionState.editing || evolutionState.activeView === 'settings')
    tasks.push(() => showWorld(f));
  tasks.push(() => updateCockpit(f));
  if (typeof requestIdleCallback !== 'function') {
    tasks.forEach(task => task());
    return;
  }
  const generation = sessionState.generation, run = deadline => {
    if (generation !== sessionState.generation || showFrame.envelope !== data ||
        showFrame.key !== key)
      return;
    const start = performance.now();
    do {
      tasks.shift()();
    } while (tasks.length && deadline.timeRemaining() > IDLE.reserve_ms &&
             performance.now() - start < IDLE.turn_ms);
    if (tasks.length)
      requestIdleCallback(run, {timeout : IDLE.timeout_ms});
  };
  requestIdleCallback(run, {timeout : IDLE.timeout_ms});
}

function renderHistory(data) {
  updateSessionState({historyData : data});
  chart(data);
  el('milestones').replaceChildren();
  for (const m of [...data.milestones].reverse()) {
    const button = document.createElement('button'), title = document.createElement('strong'),
          detail = document.createElement('span');
    title.textContent = t('controller.namedStep',
                          {name : m.name || t('controller.tank'), step : formatNumber(m.step)});
    detail.textContent = t('controller.reasons.' + m.reason);
    button.appendChild(title);
    button.appendChild(detail);
    button.disabled = !m.complete_state;
    button.onclick = () => command('observe', {session : m.session, id : m.id});
    el('milestones').appendChild(button);
  }
  renderWorlds();
  if (sceneState.frame)
    rates(sceneState.frame);
}

export async function refreshHistory() {
  if (sessionState.historyBusy)
    return;
  const requestGeneration = sessionState.generation;
  updateSessionState({historyBusy : true});
  try {
    const r = await request(ROUTE.history), d = await r.json();
    if (!r.ok)
      throw Error(serverText(d.error));
    if (requestGeneration === sessionState.generation &&
        (!sessionState.sessionId || d.active === sessionState.sessionId))
      renderHistory(d);
  } catch (e) {
    if (requestGeneration === sessionState.generation)
      text('error', e.message);
  } finally {
    if (requestGeneration === sessionState.generation)
      updateSessionState({historyBusy : false, lastHistory : Date.now()});
  }
}

export let movingSliders;

export let sliderHold;

const IDLE = Object.freeze({turn_ms : 3, reserve_ms : 2, timeout_ms : 1000});
const SUPPLY_FACTOR = 4, MUTATION_DIGITS = 3;
const supplyHalf = () => Number(el('feeding').max) / 2;
function supplyValue(position) {
  return controllerState.standardSupply * SUPPLY_FACTOR **
         ((position - supplyHalf()) / supplyHalf());
}
function supplyPosition(value) {
  const half = supplyHalf();
  return value > 0
             ? Math.max(0, Math.min(2 * half,
                                    half + half * Math.log(value / controllerState.standardSupply) /
                                               Math.log(SUPPLY_FACTOR)))
             : 0;
}
function supplyLabel(position) {
  return percent(supplyValue(position) / controllerState.standardSupply);
}
const mutationLabel = v =>
    v.toLocaleString(t('units.locale'), {maximumFractionDigits : MUTATION_DIGITS});
const unlimitedResidence = () => Number(el('bottom-residence').max);
const residenceLabel = v =>
    v === unlimitedResidence() ? t('controller.unbegrenzt') : t('controller.residence', {n : v});
const SLIDER_HOLD_MS = 500;
export function holdSlider(id) { sliderHold.set(id, Date.now() + SLIDER_HOLD_MS); }

function syncSlider(id, value, output, format) {
  if (movingSliders.has(id) || (sliderHold.get(id) || 0) > Date.now())
    return;
  el(id).value = String(value);
  text(output, format(value));
}

function bindSlider(id, output, format, send) {
  el(id).oninput = e => {
    movingSliders.add(id);
    text(output, format(Number(e.target.value)));
  };
  el(id).onchange = async e => {
    const value = Number(e.target.value);
    text(output, format(value));
    holdSlider(id);
    try {
      await send(value);
    } finally {
      movingSliders.delete(id);
      holdSlider(id);
    }
  };
  el(id).onpointercancel = () => movingSliders.delete(id);
}

const initializers = {
  "chart_metric_onchange" : () => {
    el('chart-metric').onchange = () => sessionState.historyData && chart(sessionState.historyData);
  },
  "pause_onclick" : () => {
    el('pause').onclick = () => sceneState.frame && !sceneState.frame.historical &&
                                command(sceneState.frame.paused ? 'resume' : 'pause');
  },
  "speed_onchange" : () => {
    el('speed').onchange = async e => {
      if (brainState.brainOpen) {
        el('speed').value = 'inspection';
        return;
      }
      const value = e.target.value, turbo = value === 'turbo',
            sequence = controllerState.speedSequence = (controllerState.speedSequence || 0) + 1,
            speedGeneration = sessionState.generation;
      if (await command('turbo', {value : turbo ? 1 : 0}) &&
          sequence === controllerState.speedSequence &&
          speedGeneration === sessionState.generation) {
        if (!turbo) {
          await command('delay', {value : Number(value)});
          syncBrainRequest();
        }
      }
    };
  },
  "movingSliders" : () => { movingSliders = new Set(); },
  "sliderHold" : () => { sliderHold = new Map(); },
  "bindSlider_mutation" : () => {
    bindSlider('mutation', 'mutation-value', mutationLabel, v => command('mutation', {value : v}));
  },
  "bindSlider_strong_share" : () => {
    bindSlider('strong-share', 'strong-share-value', v => percent(v),
               v => command('parameter', {name : 'subgraph_mutation', value : v}));
  },
  "bindSlider_feeding" : () => {
    bindSlider('feeding', 'feeding-value', supplyLabel,
               v => command('feeding', {value : supplyValue(v)}));
  },
  "bindSlider_bottom_residence" : () => {
    bindSlider('bottom-residence', 'bottom-residence-value', residenceLabel,
               v => command('bottom-residence', {value : v === unlimitedResidence() ? 0 : v}));
  },
  "support_onchange" : () => {
    el('support').onchange = e => command('safety', {value : e.target.checked ? 1 : 0});
  },
  "bookmark_onclick" : () => {
    el('bookmark').onclick = async () => {
      if (await command('bookmark'))
        refreshHistory();
    };
  },
  "current_onclick" : () => {
    el('current').onclick = async () => {
      if (await command('current')) {
        resetCamera();
      }
    };
  },
  "new_onclick" : () => {
    el('new').onclick = () => {
      if ([...el('new-run-dialog').querySelectorAll('input') ].some(input =>
                                                                        !input.checkValidity())) {
        el('new-run-dialog').querySelector('input:invalid')?.reportValidity();
        return;
      }
      startNewRun(newRunChoice());
    };
  },
  "addEventListener_keydown" : () => {
    document.addEventListener('keydown', e => {
      if (e.key === KEY.escape) {
        if (worldState.placingEggs) {
          e.preventDefault();
          endEggPlacement();
          return;
        }
        if (worldState.worldDrag || worldState.polygonPoints?.length) {
          e.preventDefault();
          setTool('inspect');
          return;
        }
        if (brainState.brainProbeArmed) {
          e.preventDefault();
          brainArmProbe(false);
          return;
        }
        if (brainState.brainOpen) {
          e.preventDefault();
          closeBrain();
          return;
        }
        if (el('new-run-dialog').open || el('worlds-dialog').open)
          return;
        e.preventDefault();
        updateWorldState({worldDrag : updateWorldState({worldCursor : null})});
        setTool('inspect');
        if (sceneState.frame?.selected || feeding_viewState.lastSelectedProfile)
          selectFish(0);
        else if (evolutionState.selectedSpecies || sceneState.highlightSpecies ||
                 sceneState.highlightSick || lineageState.speciesBranch)
          deselectSpecies();
        return;
      }
      if ([ 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON' ].includes(e.target.tagName))
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!el('pause').disabled)
          el('pause').onclick();
      }
    });
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
