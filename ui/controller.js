import {formatNumber, t} from './strings.js';
import {selectedPopulation, populationStarted} from './population_picker.js';
import {FISH} from './schema.js';
import {updateWorldState} from './world.js';
import {updateSessionState} from './session.js';
import {updateSceneState} from './state.js';
import {request} from './session.js';
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
import {sceneState, selectFish, syncBrainRequest} from './state.js';
import {endEggPlacement, setTool, worldState} from './world.js';
import {newEnergyFields, showBursts, showWorld} from './world_parameters.js';
export const controllerState = {};

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
  const natural = f.fish.filter(p => p[FISH.hatched] && p[FISH.generation] >= 1).length;
  text('natural-count',
       t('units.percent', {n : f.hatched ? Math.round(100 * natural / f.hatched) : 0}));
  el('natural-count').title = t('controller.natural', {n : natural, total : f.hatched});
  el('natural-fill').style.width = (f.hatched ? 100 * natural / f.hatched : 0) + '%';
  text('pause', f.paused ? t('controller.weiter') : t('controller.pause'));
  el('pause').toggleAttribute?.('data-paused', !!f.paused);
  el('current').hidden = !f.historical;
  text('tank-status', f.historical ? t('controller.savedWorld', {step : formatNumber(f.step)})
                      : f.turbo    ? t('controller.maximaltempoAnsichtAusgesetzt')
                      : data.exit_code !== null ? t('controller.simulationBeendet')
                      : f.paused                ? t('controller.pausiert')
                      : brainState.brainOpen    ? t('controller.untersuchen')
                                                : t('controller.fischHeranzoomen'));
  if (document.activeElement !== el('speed'))
    el('speed').value = brainState.brainOpen ? 'inspection'
                        : f.turbo            ? 'turbo'
                                             : String(f.delay_ms);
  syncSlider('mutation', f.parameters?.mutation ?? .06, 'mutation-value',
             v => v.toLocaleString(t('units.locale'), {maximumFractionDigits : 3}));
  syncSlider('strong-share', f.parameters?.broad_mutation ?? .03, 'strong-share-value',
             v => t('units.percent', {n : Math.round(v * 100)}));
  syncSlider('bottom-residence', f.bottom_residence === 0 ? 610 : f.bottom_residence ?? 60,
             'bottom-residence-value',
             v => v === 610 ? t('controller.unbegrenzt') : t('controller.residence', {n : v}));
  el('bottom-residence').disabled = !!f.historical;
  syncSlider('feeding', supplyPosition(1000 * (f.parameters?.energy_supply || 0)), 'feeding-value',
             supplyLabel);
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
  const intake = perf ? perf.food_per_100 + perf.ecosystem_per_100 : 0;
  text('performance-intake', perf?.exposure ? formatNumber(intake, 1) : '–');
  text('performance-ecosystem',
       perf?.exposure && intake
           ? t('units.percent', {n : Math.round(100 * perf.ecosystem_per_100 / intake)})
           : '–');
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
  // DOM changes stay on the main thread, in small turns between tank frames.
  const generation = sessionState.generation, run = deadline => {
    if (generation !== sessionState.generation || showFrame.envelope !== data ||
        showFrame.key !== key)
      return;
    const start = performance.now();
    do {
      tasks.shift()();
    } while (tasks.length && deadline.timeRemaining() > 2 && performance.now() - start < 3);
    if (tasks.length)
      requestIdleCallback(run, {timeout : 1000});
  };
  requestIdleCallback(run, {timeout : 1000});
}

export function renderHistory(data) {
  updateSessionState({historyData : data});
  chart(data);
  el('milestones').replaceChildren();
  for (const m of [...data.milestones].reverse()) {
    const button = document.createElement('button'), title = document.createElement('strong'),
          detail = document.createElement('span');
    title.textContent = t('controller.namedStep', {name : m.name, step : m.step});
    detail.textContent = m.reason;
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
    const r = await request('/history'), d = await r.json();
    if (!r.ok)
      throw Error(d.error);
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

// Total supply on a logarithmic scale around the standard value (middle = 100 %, 25 %–400 %).
const STANDARD_SUPPLY = 1000 * 95 / 5933055.733418587;
function supplyValue(position) { return STANDARD_SUPPLY * Math.pow(4, (position - 50) / 50); }
function supplyPosition(value) {
  return value > 0
             ? Math.max(0, Math.min(100, 50 + 50 * Math.log(value / STANDARD_SUPPLY) / Math.log(4)))
             : 0;
}
function supplyLabel(position) {
  return t('units.percent', {n : Math.round(100 * supplyValue(position) / STANDARD_SUPPLY)});
}

export function syncSlider(id, value, output, format) {
  if (movingSliders.has(id) || (sliderHold.get(id) || 0) > Date.now())
    return;
  el(id).value = String(value);
  text(output, format(value));
}

export function bindSlider(id, output, format, send) {
  el(id).oninput = e => {
    movingSliders.add(id);
    text(output, format(Number(e.target.value)));
  };
  el(id).onchange = async e => {
    const value = Number(e.target.value);
    text(output, format(value));
    sliderHold.set(id, Date.now() + 500);
    try {
      await send(value);
    } finally {
      movingSliders.delete(id);
      sliderHold.set(id, Date.now() + 500);
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
    bindSlider('mutation', 'mutation-value',
               v => v.toLocaleString(t('units.locale'), {maximumFractionDigits : 3}),
               v => command('mutation', {value : v}));
  },
  "bindSlider_strong_share" : () => {
    bindSlider('strong-share', 'strong-share-value',
               v => t('units.percent', {n : Math.round(100 * v)}),
               v => command('parameter', {name : 'broad_mutation', value : v}));
  },
  "bindSlider_feeding" : () => {
    bindSlider('feeding', 'feeding-value', supplyLabel,
               v => command('feeding', {value : supplyValue(v)}));
  },
  "bindSlider_bottom_residence" : () => {
    bindSlider('bottom-residence', 'bottom-residence-value',
               v => v === 610 ? t('controller.unbegrenzt') : t('controller.residence', {n : v}),
               v => command('bottom-residence', {value : v === 610 ? 0 : v}));
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
    el('new').onclick = async () => {
      if (sessionState.busy)
        return;
      if ([...el('new-run-dialog').querySelectorAll('input') ].some(input =>
                                                                        !input.checkValidity())) {
        el('new-run-dialog').querySelector('input:invalid')?.reportValidity();
        return;
      }
      updateSessionState({busy : true});
      el('new').disabled = true;
      const ok = await command('new', {
        fish : Number(el('new-fish').value),
        population : selectedPopulation(),
        world : el('new-world').value || 'starter',
        energy : Object.fromEntries(newEnergyFields.map(
            name => [name, Number(el('new-' + name.replaceAll('_', '-')).value)])),
        ...(el('new-seed').value.trim() ? {seed : Number(el('new-seed').value)} : {}),
      });
      if (ok) {
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
    };
  },
  "addEventListener_keydown" : () => {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
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
        else if (evolutionState.selectedSpecies || evolutionState.highlightSpecies ||
                 evolutionState.highlightSick || lineageState.speciesBranch)
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
