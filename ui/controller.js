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
import {displayNumber, feeding_viewState} from './feeding_view.js';
import {lineageState} from './lineage.js';
import {showSelection} from './selection.js';
import {command, sessionState} from './session.js';
import {sceneState, selectFish, syncBrainRequest} from './state.js';
import {endEggPlacement, setTool, worldState} from './world.js';
import {newEnergyFields, showBursts, showWorld} from './world_parameters.js';
export const controllerState = {};

export function showFrame(f, data) {
  text('generation', 'Schritt ' + f.step.toLocaleString('de'));
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
  text('disease-summary', 'Kranke Fische: ' + (disease.sick || 0));
  for (const kind of ['spontaneous', 'food', 'carrion', 'contact', 'deaths'])
    text('disease-' + kind, disease[kind] || 0);
  text('live-disease', (disease.sick || 0) + ' krank');
  el('live-disease').hidden = false;
  el('live-disease').title = 'Kranke geschlüpfte Fische im Aquarium.';
  el('current-seed').hidden = !!f.historical;
  text('current-seed', 'Laufseed: ' + (data.options?.seed ?? '–'));
  text('adults', f.hatched);
  text('eggs', Math.max(0, f.eggs - (f.nutrient_eggs_alive || 0)));
  text('nutrient-eggs', f.nutrient_eggs_alive || 0);
  el('nutrient-stock').hidden = !f.nutrient_eggs_alive;
  el('nutrient-eggs').title = 'Liegende Nähreier: ' + (f.nutrient_eggs_alive || 0) +
                              '; insgesamt gelegt: ' + (f.nutrient_eggs || 0) +
                              '. Werden gefressen oder zerfallen; entwickeln sich nicht.';
  const natural = f.fish.filter(p => p[FISH.hatched] && p[FISH.generation] >= 1).length;
  text('natural-count', `${f.hatched ? Math.round(100 * natural / f.hatched) : 0} %`);
  el('natural-count').title = natural + ' von ' + f.hatched + ' Fischen sind natürlich geboren';
  el('natural-fill').style.width = (f.hatched ? 100 * natural / f.hatched : 0) + '%';
  text('pause', f.paused ? 'Weiter' : 'Pause');
  el('current').hidden = !f.historical;
  text('tank-status', f.historical              ? 'Gespeicherte Welt · Schritt ' + f.step
                      : f.turbo                 ? 'Maximaltempo · Ansicht ausgesetzt'
                      : data.exit_code !== null ? 'Simulation beendet'
                      : f.paused                ? 'Pausiert'
                      : brainState.brainOpen    ? 'Untersuchen'
                                                : 'Fisch heranzoomen');
  if (document.activeElement !== el('speed'))
    el('speed').value = brainState.brainOpen ? 'inspection'
                        : f.turbo            ? 'turbo'
                                             : String(f.delay_ms);
  syncSlider('mutation', f.parameters?.mutation ?? .06, 'mutation-value',
             v => v.toLocaleString('de', {maximumFractionDigits : 3}));
  syncSlider('strong-share', f.parameters?.broad_mutation ?? .03, 'strong-share-value',
             v => Math.round(v * 100) + ' %');
  syncSlider('bottom-residence', f.bottom_residence === 0 ? 610 : f.bottom_residence ?? 60,
             'bottom-residence-value', v => v === 610 ? 'Unbegrenzt' : v + ' Schritte / Radius');
  el('bottom-residence').disabled = !!f.historical;
  syncSlider('feeding', 1000 * (f.parameters?.energy_supply || 0), 'feeding-value',
             v => v.toLocaleString('de', {maximumFractionDigits : 3}));
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
  text('performance-intake', perf?.exposure ? displayNumber(intake, 1) : '–');
  text('performance-ecosystem',
       perf?.exposure && intake ? Math.round(100 * perf.ecosystem_per_100 / intake) + ' %' : '–');
  text('performance-reserve', perf ? displayNumber(perf.mean_reserve) : '–');
  text('performance-replacement',
       perf ? f.assistance?.deaths ? displayNumber(f.assistance.hatches / f.assistance.deaths, 2)
                                   : '–'
            : '–');
  el('performance-intake').title =
      'Verwertbare Aufnahme pro 100 Lebensschritte nach dem Schlupf; gemessen über die letzten ' +
      (perf?.window_steps || 0) + ' Schritte.';
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
    title.textContent = m.name + ' · Schritt ' + m.step;
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

export async function refreshFounders() {
  controllerState.lastFounderUpdate = Date.now();
  try {
    const r = await request('/founders');
    if (!r.ok)
      return;
    const d = await r.json();
    if (!Array.isArray(d.entries))
      return;
    text('founder-count', d.entries.length + ' Founder');
    text('founder-progress', (d.candidates || 0).toLocaleString('de') + ' Kandidaten');
    if (d.running)
      el('founder-bar').removeAttribute('value');
    else
      el('founder-bar').value = 0;
    el('population-find').disabled = d.running;
    el('population-stop').hidden = !d.running;
    el('founder-search').disabled = d.running;
    el('founder-stop').hidden = !d.running;
    const signature = JSON.stringify(d.entries);
    if (signature !== controllerState.founderSignature) {
      controllerState.founderSignature = signature;
      const grid = el('founder-grid');
      grid.replaceChildren();
      const senses = [
        'Sehen', 'Geruch', 'Seitenlinie', 'Berührung', 'Energie', 'Nährstofffluss', 'Verletzung',
        'Tiefe', 'Dehnung', 'Schmerz', 'Hormone'
      ];

      const blank = document.createElement('small');
      grid.appendChild(blank);
      for (const label of ['Drehmuskeln einseitig', 'Drehmuskeln beidseitig']) {
        const head = document.createElement('small');
        head.textContent = label;
        head.style.gridColumn = 'span 3';
        head.title =
            'Jeweils kleines, mittleres und großes Gehirn. Founder sind unabhängige Zufallsentwürfe. Je etwa zwanzig Startfische wird eine unabhängige Linie per Seed zufällig gewählt; alle Fische werden individuell mutiert.';
        grid.appendChild(head);
      }
      for (let sense = 0; sense < 11; sense++) {
        const label = document.createElement('small');
        label.textContent = senses[sense];
        grid.appendChild(label);
        for (let type = 0; type < 6; type++) {
          const category = 6 * sense + type, group = d.entries.filter(e => e.class === category),
                e = group[0], tile = document.createElement('span');
          tile.textContent = e ? String(group.length) : '–';
          tile.className = e ? '' : 'founder-empty';
          tile.title =
              senses[sense] + ' · ' + (type < 3 ? 'einseitiger' : 'beidseitiger') + ' Schwanz · ' +
              [ 'unter 150', '150–300', 'über 300' ][type % 3] + ' Neuronen. ' +
              (e ? group.length + ' Founder. Fortpflanzungsprüfungen zusammen: ' +
                       group.reduce((sum, f) => sum + f.funded_eggs, 0) + ' versorgte Eier, ' +
                       group.reduce((sum, f) => sum + f.hatched_offspring, 0) + ' geschlüpft, ' +
                       group.reduce((sum, f) => sum + f.feeding_offspring, 0) +
                       ' Jungfische fressen selbst.'
                 : 'Noch kein Founder.');
          grid.appendChild(tile);
        }
      }
    }
    if (d.error)
      text('error', d.error);
    if (controllerState.founderWasRunning && !d.running && sceneState.frame &&
        !sceneState.frame.historical)
      await command('reload-founders');
    if (controllerState.founderWasRunning && !d.running && el('new-run-dialog').open)
      await el('population-refresh').onclick();
    controllerState.founderWasRunning = d.running;
  } catch (e) {
    text('error', e.message);
  }
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
               v => v.toLocaleString('de', {maximumFractionDigits : 3}),
               v => command('mutation', {value : v}));
  },
  "bindSlider_strong_share" : () => {
    bindSlider('strong-share', 'strong-share-value', v => Math.round(100 * v) + ' %',
               v => command('parameter', {name : 'broad_mutation', value : v}));
  },
  "bindSlider_feeding" : () => {
    bindSlider('feeding', 'feeding-value', v => v.toLocaleString('de', {maximumFractionDigits : 3}),
               v => command('feeding', {value : v}));
  },
  "bindSlider_bottom_residence" : () => {
    bindSlider('bottom-residence', 'bottom-residence-value',
               v => v === 610 ? 'Unbegrenzt' : v + ' Schritte / Radius',
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
        text('tank-status', 'Neuer Lauf wird geladen …');
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
  },
  "lastFounderUpdate" : () => { controllerState.lastFounderUpdate = 0; },
  "founderWasRunning" : () => { controllerState.founderWasRunning = false; },
  "founderSignature" : () => { controllerState.founderSignature = ''; },
  "founder_search_onclick" : () => {
    el('founder-search').onclick = async () => {
      if (await command('founder-search'))
        refreshFounders();
    };
  },
  "founder_stop_onclick" : () => {
    el('founder-stop').onclick = async () => {
      if (await command('founder-stop'))
        refreshFounders();
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
