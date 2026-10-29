import {renderIndividualHormones} from './hormones.js';
import {openSpeciesDetails} from './evolution.js';
import {openPopulationPicker} from './population_picker.js';
import {chartContext, chartSize} from './dom.js';
import {updateEvolutionState} from './evolution.js';
import {FISH} from './schema.js';
import {brainState, brainStep, closeBrain} from './brain.js';
import {setFollowing} from './camera.js';
import {chartsState, curveInfo} from './charts.js';
import {ctx, el, renderTraitChips, syncChildren, text} from './dom.js';
import {renderDeathCauses, renderEnergy, renderNovelty} from './energy_view.js';
import {renderWorlds} from './event_view.js';
import {
  deselectSpecies,
  evolutionState,
  focusLineage,
  renderSpecies,
  setView
} from './evolution.js';
import {displayNumber} from './feeding_view.js';
import {fishBodyPath} from './fish_fins.js';
import {fishAnatomy} from './fish_forms.js';
import {tankPanelFrame} from './hover.js';
import {lineageState} from './lineage.js';
import {command, sessionState} from './session.js';
import {
  blendFish,
  frameBlend,
  frameFish,
  frameSpecies,
  sceneState,
  selectFish,
  syncBrainRequest,
  wrapScreenX
} from './state.js';
import {draw} from './tank.js';
import {setTool} from './world.js';
import {showWorld} from './world_parameters.js';
export const cockpitState = {};
export let speciesLabels;

export let speciesSummary;

export function mergeJournalEvents(events) {
  const byId = new Map(cockpitState.journalData.events.map(event => [event.id, event]));
  for (const event of events)
    byId.set(event.id, event);
  cockpitState.journalData = {
    ...cockpitState.journalData,
    events : [...byId.values() ].sort((a, b) => a.id - b.id)
  };
}

export function traitExplanation(word, s) {
  const item = s?.trait_details?.[word];
  return item ? item.note + (item.evidence ? ' · ' + item.evidence : '') : word;
}

export function recordNames(id) {
  return Object.entries(cockpitState.journalData.records)
      .filter(([, e ]) => e.session === sessionState.sessionId && e.species_id === id)
      .map(([ key ]) => ({
             nutrition : 'Nahrungsertrag',
             offspring : 'Fortpflanzung',
             age : 'Langlebigkeit',
             generation : 'Generationenfolge'
           }[key]));
}

export function speciesComparator(a, b) {
  switch (el('species-sort').value) {
  case 'genus':
    return (a.genus_name || a.name).localeCompare(b.genus_name || b.name, 'de') ||
           b.adults - a.adults || a.id - b.id;
  case 'replacement':
    return (speciesReplacement(b) ?? -1) - (speciesReplacement(a) ?? -1) || b.adults - a.adults;
  case 'nutrition':
    return b.nutrition_per_1000 - a.nutrition_per_1000;
  case 'offspring':
    return b.successful_offspring - a.successful_offspring;
  case 'newest':
    return b.born - a.born;
  default:
    return b.adults - a.adults || b.alive - a.alive;
  }
}

export function rememberViewScroll() {
  if (typeof evolutionState.activeView !== 'undefined')
    cockpitState.viewScroll[evolutionState.activeView] = el('cockpit').scrollTop || 0;
}

export function restoreViewScroll(v) { el('cockpit').scrollTop = cockpitState.viewScroll[v] || 0; }

export function createSpeciesSpread() {
  const row = document.createElement('div'), label = document.createElement('span'),
        bar = document.createElement('progress'), value = document.createElement('span');
  row.className = 'species-spread';
  label.textContent = 'Artgrenze';
  bar.max = 1;
  bar.setAttribute('aria-label', 'Abstand zur Artgrenze');
  value.className = 'spread-value';
  for (const node of [label, bar, value])
    row.appendChild(node);
  row.parts = {bar, value};
  return row;
}

export function updateSpeciesSpread(row, s) {
  const distance = s.genetic_spread,
        known = s.adults > 0 && Number.isFinite(distance) && s.species_distance > 0,
        ratio = known ? Math.max(0, distance / s.species_distance) : 0;
  row.parts.bar.value = Math.min(1, ratio);
  row.parts.value.textContent = known ? Math.round(100 * ratio) + ' %' : '–';
  row.title =
      known
          ? 'Größter Abstand eines lebenden geschlüpften Fisches zum festen Artgründer: ' +
                distance.toFixed(3).replace('.', ',') + ' von ' +
                s.species_distance.toFixed(3).replace('.', ',') +
                '. Ab der Grenze wird ein neues Genom einer anderen Art zugeordnet. Der Balken sagt keine Artbildung voraus.'
          : 'Keine aktuellen Genomabstände geschlüpfter Fische verfügbar.';
  row.parts.bar.title = row.title;
}

export function appendSpeciesSpread(parent, s) {
  const row = createSpeciesSpread();
  updateSpeciesSpread(row, s);
  parent.appendChild(row);
}

export function appendSpeciesSummary(button, s) {
  const tags = document.createElement('div');
  tags.className = 'trait-tags';
  for (const word of speciesSummary(s)) {
    const tag = document.createElement('span');
    tag.textContent = word;
    tag.title = traitExplanation(word, s);
    tag.className = s.trait_details?.[word]?.group === 'Kombination' ? 'combined-trait' : '';
    tags.appendChild(tag);
  }
  button.appendChild(tags);
  const stats = document.createElement('p');
  stats.className = 'card-metrics';
  for (const [value, kind] of [
           [ 'Ertrag', 'metric-label' ],
           [ ((s.nutrition_per_1000 || 0) / 10).toFixed(1).replace('.', ','), 'metric-value' ],
           [ 'Energie / 100', 'metric-unit' ]]) {
    const node = document.createElement('span');
    node.className = kind;
    node.textContent = value;
    stats.appendChild(node);
  }
  stats.title =
      ((s.nutrition_per_1000 || 0) / 10).toFixed(1) +
      ' aufgenommene Energie je 100 Lebensschritte der lebenden geschlüpften Fische dieser Art.';
  button.appendChild(stats);
  appendSpeciesSuccess(button, s);
  appendSpeciesSpread(button, s);
}

export function sparkline(canvas, points, key, color) {
  if (points.length < 2)
    return;
  const g = chartContext(canvas, () => sparkline(canvas, points, key, color)),
        values = points.map(p => p[key]), min = Math.min(...values),
        max = Math.max(min + 1, ...values);
  g.clearRect(0, 0, chartSize(canvas).width, chartSize(canvas).height);
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  points.forEach((p, i) => {
    const x = 2 + i / (points.length - 1) * (chartSize(canvas).width - 4),
          y = chartSize(canvas).height - 3 -
              (p[key] - min) / (max - min) * (chartSize(canvas).height - 6);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
}

export function drawSpeciesTrace(button, s) {
  const traces = cockpitState.journalData.traces[String(s.id)] || [];
  if (traces.length < 2)
    return;
  const strip = document.createElement('div');
  strip.className = 'trace-strip';
  for (const [key, color, title] of [[ 1, '#a2d9c6', 'Bestand' ],
                                     [ 2, '#e9c185', 'Nahrungsertrag' ]]) {
    const c = document.createElement('canvas');
    c.width = 140;
    c.height = 24;
    c.title = title + ' · ' + (key === 1 ? 'Fische' : 'Energie / 100 Schritte') +
              '; X: Simulationsschritte';
    c.onpointermove = e => {
      const rect = c.getBoundingClientRect(),
            i = Math.max(0,
                         Math.min(traces.length - 1, Math.round((e.clientX - rect.left) /
                                                                rect.width * (traces.length - 1))));
      c.title = title + ': ' + traces[i][key].toFixed(1) + ' ' +
                (key === 1 ? 'Fische' : 'Energie / 100 Schritte') + ' · Schritt ' + traces[i][0];
    };
    sparkline(c, traces, key, color);
    strip.appendChild(c);
  }
  button.appendChild(strip);
}

export let diversityRows;

export let energyParts;

export function compareDiversity(a, b) {
  const {key, direction} = cockpitState.diversityOrder;
  let delta;
  if (key === 'name')
    delta = (a.name || '').localeCompare(b.name || '', 'de');
  else if (key === 'replacement') {
    const x = speciesReplacement(a), y = speciesReplacement(b);
    if (x === null || y === null)
      return x === y ? a.id - b.id : x === null ? 1 : -1;
    delta = x - y;
  } else
    delta =
        key === 'generation' ? (a.max_g || 0) - (b.max_g || 0) : (a.adults || 0) - (b.adults || 0);
  return direction * delta || a.id - b.id;
}

export function renderDiversity(f) {
  for (const key of ['name', 'fish', 'replacement', 'generation']) {
    const button = el('species-order-' + key), active = cockpitState.diversityOrder.key === key;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('data-direction',
                        active ? (cockpitState.diversityOrder.direction === 1 ? 'up' : 'down')
                               : '');
    button.title =
        (key === 'replacement'
             ? 'Spätere natürliche Schlupfe je Verlust; unbekannte Werte stehen am Ende. '
         : key === 'generation' ? 'Höchste lebende hilfsfreie Generation. '
                                : '') +
        'Klicken zum Sortieren, nochmals für die Gegenrichtung.';
  }
  const rows = [], retained = new Set(),
        living = (f.species || []).filter(s => s.adults > 0).sort(compareDiversity),
        maximum = Math.max(1, ...living.map(s => s.adults));
  for (const s of living) {
    let row = diversityRows.get(s.id);
    if (!row) {
      row = document.createElement('button');
      row.className = 'diversity-row';
      row.dataset.species = String(s.id);
      row.onclick = () => {
        if (evolutionState.selectedSpecies === s.id)
          deselectSpecies();
        else
          focusLineage(s.id, true);
      };
      const name = document.createElement('strong'), traits = document.createElement('small'),
            count = document.createElement('span'), replacement = document.createElement('span'),
            generation = document.createElement('span'), bar = document.createElement('span');
      name.className = 'species-row-name';
      traits.className = 'species-row-traits';
      count.className = 'species-row-count';
      replacement.className = 'species-row-replacement';
      generation.className = 'species-row-generation';
      bar.className = 'species-share';
      const spread = createSpeciesSpread();
      for (const node of [name, traits, count, replacement, generation, bar, spread])
        row.appendChild(node);
      row.parts = {name, traits, count, replacement, generation, bar, spread};
      diversityRows.set(s.id, row);
    }
    const part = row.parts, ratio = speciesReplacement(s), summary = speciesSummary(s);
    updateSpeciesSpread(part.spread, s);
    row.classList.toggle('active', s.id === evolutionState.selectedSpecies);
    row.setAttribute('aria-pressed', String(s.id === evolutionState.selectedSpecies));
    part.name.textContent = s.name;
    part.traits.textContent = summary.slice(0, 2).join(' · ') || 'Beobachtung läuft';
    part.count.textContent = s.adults;
    part.replacement.textContent = ratio === null ? '–' : ratio.toFixed(2).replace('.', ',');
    part.replacement.classList.toggle('self-sustaining', ratio !== null && ratio >= 1);
    part.replacement.title =
        'Natürliche Schlupfe ab der dritten Generation je Verlust ab der zweiten; ab 1 werden Verluste ersetzt.';
    part.generation.textContent = s.max_g || 0;
    part.generation.title = 'Höchste lebende hilfsfreie Generation.';
    part.bar.style.width = 100 * s.adults / maximum + '%';
    row.title = s.name + ' · ' + summary.join(' · ') + '\n' + s.adults +
                ' Fische · Nachwuchs je Verlust ' +
                (ratio === null ? 'noch offen' : ratio.toFixed(2).replace('.', ',')) +
                ' · Hilfsfreie Generation ' + (s.max_g || 0) + '\nNahrungsertrag ' +
                ((s.nutrition_per_1000 || 0) / 10).toFixed(1) + ' Energie je 100 Lebensschritte';
    rows.push(row);
    retained.add(s.id);
  }
  syncChildren(el('diversity-profiles'), rows);
  for (const id of diversityRows.keys())
    if (!retained.has(id))
      diversityRows.delete(id);
  text('living-species-count', living.length);
}

export function renderReproduction(f) {
  const cv = el('reproduction-chart'), g = chartContext(cv, () => renderReproduction(f)),
        self = f.self_fertilisations || 0,
        values = [ Math.max(0, (f.fertilisations || 0) - self), self, f.clonal_starts || 0 ],
        names = [ 'Fremdbefruchtet', 'Selbstbefruchtet', 'Klonal gestartet' ],
        colors = [ '#8bcab6', '#d5b36d', '#b59bd6' ], max = Math.max(1, ...values);
  g.clearRect(0, 0, 480, 114);
  g.font = '13px system-ui';
  for (let i = 0; i < 3; i++) {
    const y = 12 + i * 35;
    g.fillStyle = '#bad0cb';
    g.fillText(names[i], 0, y + 11);
    g.fillStyle = '#263f49';
    g.fillRect(157, y, 240, 13);
    g.fillStyle = colors[i];
    g.fillRect(157, y, 240 * values[i] / max, 13);
    g.fillText(values[i].toLocaleString('de'), 408, y + 11);
  }
  cv.title =
      'Begonnene natürliche Entwicklungen seit Laufbeginn: Fremdbefruchtung, Selbstbefruchtung oder Klonstart. Eigene Spermien zählen als Selbstbefruchtung.';
}

export let observationDescriptions;

export function isSickFish(p) { return !!p[FISH.hatched] && (p[FISH.disease] || 0) > 0; }

export async function toggleSickSelection() {
  const next = !evolutionState.highlightSick;
  if (next) {
    if (evolutionState.editing)
      el('edit-world').onclick();
    deselectSpecies();
    updateEvolutionState({highlightSick : true});
    if (sceneState.frame?.selected)
      await selectFish(0);
    setFollowing(false);
    setView('evolution');
  } else
    updateEvolutionState({highlightSick : false});
  if (sceneState.frame) {
    updateCockpit(sceneState.frame);
    draw(sceneState.frame);
  }
}

export function updateDiseaseSelection(f) {
  const sick = f.fish.filter(isSickFish);
  for (const id of ['live-disease', 'disease-summary']) {
    el(id).setAttribute('aria-pressed', String(evolutionState.highlightSick));
    el(id).disabled = !sick.length && !evolutionState.highlightSick;
    el(id).title =
        evolutionState.highlightSick
            ? 'Markierung der kranken Fische aufheben.'
            : 'Kranke Fische haben pulsierende rote Flecken am Körper; anklicken zum Markieren und Auflisten.';
  }
  el('live-disease').hidden = false;
  const box = el('disease-patients');
  box.hidden = !evolutionState.highlightSick;
  if (!evolutionState.highlightSick)
    return;
  const signature = sick.map(p => p[4]).join('/');
  if (signature !== cockpitState.patientSignature) {
    cockpitState.patientSignature = signature;
    const top = box.scrollTop;
    box.replaceChildren();
    cockpitState.patientRows.clear();
    for (const p of sick) {
      const button = document.createElement('button');
      button.onclick = () => selectFish(p[4], {preserveGroup : true});
      box.appendChild(button);
      cockpitState.patientRows.set(p[4], button);
    }
    box.scrollTop = top;
  }
  for (const p of sick) {
    const species = frameSpecies(f, p[22]);
    const button = cockpitState.patientRows.get(p[4]);
    button.textContent =
        '#' + p[4] + ' · ' + (species?.name || 'Art #' + p[22]) + ' · ' + p[52] + ' Schritte';
    button.title = 'Fisch auswählen · verbleibende Krankheitsdauer in Schritten.';
  }
  if (!sick.length)
    box.textContent = 'Zurzeit keine kranken Fische.';
}

export function updateObservationNote(f) {
  const mode = el('observation-mode').value || 'normal',
        selected = f.fish.some(p => p[4] === f.selected && p[8]);
  let note = observationDescriptions[mode] || observationDescriptions.normal;
  if (mode === 'senses' && !selected)
    note += ' Fisch auswählen.';
  else if (mode !== 'normal')
    note += f.selected                        ? ' Für den ausgewählten Fisch.'
            : evolutionState.highlightSick    ? ' Für die markierten Kranken.'
            : evolutionState.highlightSpecies ? ' Für die ausgewählte Art.'
                                              : ' Für alle Fische.';
  if (evolutionState.highlightSick)
    note += ' Rote Auswahlmarken: kranke Fische.';
  text('observation-note', note);
  el('observation-mode').title = note;
}

export function updateCockpit(f) {
  const compute = f.compute || {}, gpu = !!compute.active;
  text('compute-state',
       gpu ? (String(compute.mode).startsWith('opencl-cpu') ? 'CL CPU' : 'GPU') : 'CPU');
  el('compute-state').classList.toggle('gpu-active', gpu);
  el('compute-state').title =
      gpu ? 'OpenCL · ' + compute.device + '\n' +
                'GPU-Dämpfung · CPU-Augenbilder\n' + displayNumber(compute.queries) +
                ' Sichtabfragen' +
                ' · ' + displayNumber(compute.milliseconds, 2) +
                ' ms einschließlich Vorbereitung und Übertragung.' +
                (compute.uploaded_bytes !== undefined
                     ? '\n' + displayNumber(compute.uploaded_bytes / 1024, 1) +
                           ' KiB hochgeladen · ' +
                           displayNumber((compute.reused_bytes || 0) / 1024, 1) +
                           ' KiB wiederverwendet.'
                     : '') +
                (compute.fallback_queries
                     ? '\n' + displayNumber(compute.fallback_queries) + ' Grenzfälle auf der CPU.'
                     : '')
      : compute.mode === 'cpu' || !compute.mode
          ? 'Wahrnehmung auf der CPU.'
          : 'OpenCL angefordert · ' +
                (compute.reason || compute.device || 'wartet auf Sichtabfragen') +
                '\nDie CPU berechnet weiterhin alle benötigten Werte.';
  if (f.step_phases) {
    const p = f.step_phases, rows = [
      [ 'Entwicklung / CPPNs', p[0] ], [ 'Wasser / Sediment', p[1] + p[2] ],
      [ 'Pflanzen', p[3] + p[8] ], [ 'GPU-Vorbereitung', p[5] ],
      [ 'Sinne / Gehirne / Bewegung', p[6] ], [ 'Fressen / Kollisionen / Rest', p[4] + p[7] + p[9] ]
    ];
    el('compute-state').title +=
        '\nLetzter Schritt: ' +
        rows.map(([ name, ms ]) => name + ' ' + displayNumber(ms, 2) + ' ms').join(' · ');
  }
  renderLiveOverview(f);
  if (evolutionState.activeView === 'evolution' && !evolutionState.editing) {
    renderDeathCauses(f);
    renderEnergy(f);
  }
  el('single-step').hidden = false;
  el('single-step').style.visibility =
      (f.paused || brainState.brainOpen) && !f.historical ? 'visible' : 'hidden';
  el('single-step').disabled = (!f.paused && !brainState.brainOpen) || !!f.historical;
  el('world-banner').hidden = !f.historical;
  text('world-banner-text', 'Gespeicherte Welt · Schritt ' + f.step.toLocaleString('de'));
  el('clear-highlight').hidden = false;
  el('clear-highlight').style.visibility =
      evolutionState.highlightSpecies || evolutionState.highlightSick || lineageState.speciesBranch
          ? 'visible'
          : 'hidden';
  el('clear-highlight').disabled = !evolutionState.highlightSpecies &&
                                   !evolutionState.highlightSick && !lineageState.speciesBranch;
  el('clear-highlight').title = evolutionState.highlightSick
                                    ? 'Markierung der kranken Fische aufheben.'
                                    : 'Artauswahl aufheben.';
  updateDiseaseSelection(f);
  updateObservationNote(f);
  const panel = typeof tankPanelFrame === 'function' ? tankPanelFrame(f) : f, p = frameFish(panel);
  const h = (panel.brain?.id === p?.[4] ? panel.brain
             : f.brain?.id === p?.[4]   ? f.brain
                                        : null)
                ?.hormones;
  renderIndividualHormones(el('fish-hormones'), h, k => {
    openSpeciesDetails(p[22]);
    const box = el('species-hormones');
    const details = box.querySelector('details');
    if (details) {
      details.open = true;
      details.ontoggle?.();
    }
    box.querySelector('[data-hormone="' + k + '"]')?.scrollIntoView({block : 'nearest'});
  });
  if (p) {
    const own = f.individual_profile?.id === p[4] ? f.individual_profile : null;
    renderTraitChips(el('fish-species-profile'), frameSpecies(f, p[22]), false);
    renderTraitChips(el('fish-profile'), own);
    el('fish-own-traits').hidden = !own?.profile_labels?.length;
    renderNovelty(f, p);
  }
  if (evolutionState.activeView === 'settings')
    showWorld(f);
}

export function drawObservations(f, c, blend = frameBlend()) {
  const mode = el('observation-mode').value, x = v => v * c.scale + c.ox,
        y = v => v * c.scale + c.oy;
  if (mode === 'normal')
    return;
  const selected = frameFish(f),
        pool = selected ? [ selected ]
                        : f.fish.filter(p => evolutionState.highlightSick
                                                 ? isSickFish(p)
                                                 : !evolutionState.highlightSpecies ||
                                                       p[22] === evolutionState.highlightSpecies);
  for (const raw of pool) {
    if (!raw[8])
      continue;
    const p = blendFish(raw, blend), sx = x(wrapScreenX(p[0])), sy = y(p[1]);
    if (mode === 'nutrition') {
      const old = sceneState.previousFish.get(p[4]), gain = old ? p[36] - old[36] : 0;
      if (gain > 0) {
        ctx.strokeStyle = '#e9c185';
        ctx.beginPath();
        ctx.arc(sx, sy, 9 + Math.min(20, gain) * c.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#213a43';
      const yy = sy + (p[51] || 4) * c.scale + 5;
      ctx.fillRect(sx - 10, yy, 20, 3);
      ctx.fillRect(sx - 10, yy + 5, 20, 3);
      ctx.fillStyle = p[FISH.digestion] > 0 ? '#a2d9c6' : '#93abb1';
      ctx.fillRect(sx - 10, yy, 20 * Math.max(0, Math.min(1, p[5] / Math.max(1, p[53] || 400))), 3);
      ctx.fillStyle = '#d8b778';
      ctx.fillRect(
          sx - 10, yy + 5,
          20 * Math.max(0, Math.min(1, (p[FISH.gut_fill] || 0) / Math.max(1, p[53] || 400))), 3);
    } else if (mode === 'combat') {
      const radius = (p[51] || 4) * c.scale;
      if (p[23] < .9) {
        ctx.fillStyle = '#dc9d8f';
        ctx.font = '10px system-ui';
        ctx.fillText(Math.round(p[23] * 100) + ' %', sx + radius + 6, sy);
      }
    } else if (mode === 'senses' && selected) {
      const b = f.brain;
      if (!b)
        continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p[2]);
      const reach = (f.parameters.vision_range ?? 128) * c.scale, extent = reach,
            anatomy = fishAnatomy(p);
      ctx.beginPath();
      ctx.rect(-extent - 50, -extent - 50, 2 * extent + 100, 2 * extent + 100);
      fishBodyPath(ctx, (p[51] || 4) * c.scale, anatomy, true);
      ctx.clip('evenodd');
      const visual = (b.receptors || []).filter(r => r[9]?.[0] > 0),
            focused = visual.find(r => r[0] === sessionState.neuronFocus),
            shown = focused ? [ focused ] : visual;
      for (const receptor of shown) {
        const angle = receptor[2] || 0, width = receptor[6] || 0,
              left = receptor[11] ?? angle - width, right = receptor[12] ?? angle + width;
        if (right <= left)
          continue;
        ctx.fillStyle = 'hsla(' + (receptor[8] || 0) + ',75%,65%,' +
                        (.10 / Math.max(1, Math.sqrt(shown.length))) + ')';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, left, right);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function renderLiveOverview(f) {
  const s = (f.species || []).find(s => s.id === evolutionState.selectedSpecies),
        a = f.assistance || {}, deaths = s ? s.replacement_deaths : a.deaths,
        hatches = s ? s.replacement_hatches : a.hatches,
        ratio = deaths > 0 ? hatches / deaths : null;
  text('live-scope', s ? s.name : 'Gesamter Bestand');
  el('live-scope').title = s ? s.name : 'Gesamter Bestand';
  text('live-replacement', ratio === null ? '–' : ratio.toFixed(2).replace('.', ','));
  el('live-replacement').classList.toggle('positive', ratio !== null && ratio >= 1);
  const ratioHelp =
      'Schlupfe ab der dritten natürlichen Generation je Tod ab der zweiten, im gleitenden Messfenster. Ab 1 werden Verluste ersetzt; ohne passenden Tod noch offen.';
  el('live-replacement').title = ratioHelp;
  const adults = f.fish.filter(p => p[8]),
        generation = s ? s.max_g : Math.max(0, ...adults.map(p => p[41] || 0));
  text('live-generation', generation || 0);
  el('live-generation').title =
      'Höchste lebende Generation seit einer Einsetzung; zählt über Tochterarten hinweg.';
  text('live-success-label', s ? 'Lebende Fische' : 'Selbsttragende Arten');
  text('live-success', s ? s.adults
                         : (f.species || [])
                               .filter(group => speciesReplacement(group) >= 1 && group.adults > 0)
                               .length);
  el('live-success').title = s ? 'Lebende geschlüpfte Fische dieser Art.'
                               : 'Arten mit Nachwuchs je Verlust von mindestens 1 im Messfenster.';
  for (const [key, id, label] of [[ 'food', 'pulse-food', 'Futterschub' ],
                                  [ 'mutation', 'pulse-mutation', 'Mutationsschub' ]]) {
    const pulse = f.bursts?.[key], active = !!pulse?.active;
    text(id, label);
    el(id).classList.toggle('pulse-active', active);
    el(id).title =
        active ? label + ' · noch ' + pulse.remaining + ' Schritte' : label + ' zurzeit inaktiv';
    el(id).setAttribute('aria-label', el(id).title);
  }
  text('pulse-help', 'Hilfe');
  el('pulse-help')
      .classList.toggle('pulse-active', !!f.safety && (a.shortfall > 0 || a.threatened > 0));
  el('pulse-help').title =
      !f.safety
          ? 'Hilfe ausgeschaltet.'
          : 'Globaler Mindestbestand ' + (a.target || 0) + ' · fehlen ' + (a.shortfall || 0) +
                '. Artenschutz: ' + (a.threatened || 0) + ' bedrohte von ' + (a.eligible || 0) +
                ' geeigneten Arten; höchstens drei Rettungsgruppen je Ansiedlung.';
  el('pulse-help').setAttribute('aria-label', el('pulse-help').title);
  const breeding = f.breeding_help || {}, button = el('breeding-help'),
        number = v => (v || 0).toLocaleString('de', {maximumFractionDigits : 1});
  button.setAttribute('aria-pressed', String(!!breeding.enabled));
  button.classList.toggle('pulse-active', !!breeding.enabled);
  button.title =
      breeding.enabled
          ? 'Ziel ' + number(breeding.target_per_100) + ' · aktuell ' +
                number(breeding.current_per_100) +
                ' Energie je Fisch und 100 Schritte · Hilfszufuhr ×' + number(breeding.scale) +
                (breeding.energy_limited ? ' · Energielimit erreicht.' : '.')
          : 'Höchsten geglätteten Nahrungsertrag halten; Kunstfutterzufuhr vorübergehend erhöhen; als Hilfszufuhr gesondert erfasst.';
  for (const id of ['pulse-food', 'pulse-mutation', 'pulse-help', 'breeding-help'])
    el(id).disabled = !!f.historical || id === 'pulse-help';
  for (const id of ['pulse-food', 'pulse-mutation', 'pulse-help']) {
    el(id).setAttribute('aria-label', el(id).title);
  }
  text('pulse-state', f.historical ? 'Gespeichert' : f.paused ? 'Pause' : 'Läuft');
  el('pulse-state').classList.toggle('pulse-active', !!f.paused || !!f.historical);
  const globalRatio = a.deaths > 0 ? a.hatches / a.deaths : null,
        need = f.safety ? 100 * (a.factor ?? 0) : 0;
  text('replacement-now', globalRatio === null ? '–' : globalRatio.toFixed(2).replace('.', ','));
  el('replacement-now').classList.toggle('positive', globalRatio !== null && globalRatio >= 1);
  el('replacement-now').title = ratioHelp;
  text('assistance-now', f.safety ? Math.round(need) + ' %' : 'Aus');
  el('assistance-now').title =
      'Fehlender Anteil bis zum Mindestbestand; versorgte Hilfe-Eier zählen mit.';
  el('replacement-trend').title = ratioHelp + ' X: Schritte. Y: Schlupfe je Verlust.';
  el('assistance-trend').title = el('assistance-now').title + ' X: Schritte. Y: Prozent.';
}

export function speciesReplacement(s) {
  return s.replacement_deaths > 0 ? s.replacement_hatches / s.replacement_deaths : null;
}

export function appendSpeciesSuccess(box, s) {
  const value = speciesReplacement(s), panel = document.createElement('div'),
        score = document.createElement('strong'), depth = document.createElement('small');
  panel.className = 'species-success';
  score.textContent = 'Selbsterhalt ' + (value === null ? '–' : value.toFixed(2).replace('.', ','));
  score.classList.toggle('self-sustaining', value !== null && value >= 1);
  score.title =
      'Schlupfe ab der dritten hilfsfreien Generation je Tod geschlüpfter Fische ab der zweiten, im selben gleitenden Fenster wie der Beckenwert. Ab 1 werden Verluste ersetzt; ohne passenden Tod bleibt der Wert offen.';
  depth.textContent = 'Hilfsfreie Generation ' + (s.max_g || 0);
  depth.title = 'Höchste lebende natürliche Generation der Art seit der letzten Einsetzung.';
  panel.appendChild(score);
  panel.appendChild(depth);
  const protection = document.createElement('span'), proven = (s.feeding_generations || 0) >= 2,
        used = Math.min(3, s.protection_used || 0);
  protection.className = 'species-protection';
  protection.textContent = proven ? 'Artenschutz ' +
                                        '●'.repeat(used) + '○'.repeat(3 - used)
                                  : 'Nachwuchs ' + (s.feeding_generations || 0) + '/2';
  protection.title =
      proven
          ? used +
                ' von 3 Rettungsgruppen verbraucht. Voraussetzung: geeigneter Archivfisch. Erst eine neue Ansiedlung nach Aussterben setzt den Zähler zurück. Globale Hilfe bleibt unabhängig davon.'
          : 'Artenschutz setzt zwei aufeinanderfolgende natürliche, selbst fressende Nachwuchsgenerationen voraus. Hilfsschlüpfe zählen nicht.';
  protection.setAttribute('aria-label', protection.title);
  panel.appendChild(protection);
  box.appendChild(panel);
}

export function updateCockpitState(patch) {
  Object.assign(cockpitState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "cockpitState_journalData" : () => {
    cockpitState
        .journalData = {events : [], archive : [], traces : {}, records : {}, autosaves : []};
  },
  "lastJournal" : () => { cockpitState.lastJournal = 0; },
  "journalBusy" : () => { cockpitState.journalBusy = false; },
  "eventSeen" : () => { cockpitState.eventSeen = 0; },
  "archiveSignature" : () => { cockpitState.archiveSignature = ''; },
  "mapPoints" : () => { cockpitState.mapPoints = []; },
  "chartMarkers" : () => { cockpitState.chartMarkers = []; },
  "viewScroll" : () => { cockpitState.viewScroll = {}; },
  "lastObservationView" : () => { cockpitState.lastObservationView = 'evolution'; },
  "speciesLabels" : () => { speciesLabels = s => s?.labels || []; },
  "speciesSummary" :
      () => { speciesSummary = s => s?.summary_labels || speciesLabels(s).slice(0, 4); },
  "diversityRows" : () => { diversityRows = new Map(); },
  "energyParts" : () => { energyParts = new Map(); },
  "diversityOrder" : () => { cockpitState.diversityOrder = {key : 'fish', direction : -1}; },
  "el" : () => {
    for (const key of ['name', 'fish', 'replacement', 'generation'])
      el('species-order-' + key).onclick = () => {
        cockpitState.diversityOrder = {
          key,
          direction : cockpitState.diversityOrder.key === key
                          ? -cockpitState.diversityOrder.direction
                      : key === 'name' ? 1
                                       : -1
        };
        if (sceneState.frame)
          renderDiversity(sceneState.frame);
      };
  },
  "energyTrend" : () => { cockpitState.energyTrend = []; },
  "energyTrendEpoch" : () => { cockpitState.energyTrendEpoch = ''; },
  "observationDescriptions" : () => {
    observationDescriptions = {
      normal : 'Rote Flecken: krank.',
      nutrition :
          'Oben Reserve, unten Darmfüllung · Grün: Verdauung · Goldring: verwertbare Aufnahme.',
      senses : 'Fächer: Sehfelder im bevorzugten Farbton. Geruch folgt der Wasserströmung.',
      combat : 'Rot: aktive Kiefer · Blau: Abwehrstacheln · Zahl: Gesundheit in %.'
    };
  },
  "patientRows" : () => { cockpitState.patientRows = new Map(); },
  "patientSignature" : () => { cockpitState.patientSignature = ''; },
  "live_disease_onclick" :
      () => { el('live-disease').onclick = el('disease-summary').onclick = toggleSickSelection; },
  "settings_toggle_onclick" : () => {
    el('settings-toggle').onclick = async () => {
      if (brainState.brainOpen)
        await closeBrain();
      if (evolutionState.activeView === 'settings')
        setView(cockpitState.lastObservationView);
      else {
        cockpitState.lastObservationView = evolutionState.activeView === 'brain'
                                               ? brainState.brainReturnView
                                               : evolutionState.activeView;
        updateEvolutionState({editing : false});
        el('tools').hidden = true;
        el('controls').hidden = false;
        el('observations').hidden = false;
        el('view-world').hidden = true;
        el('edit-world').setAttribute('aria-pressed', 'false');
        text('edit-world', 'Welt bearbeiten');
        setView('settings');
      }
    };
  },
  "collapse_panel_onclick" : () => {
    el('collapse-panel').onclick = () => {
      const collapsed = el('layout').classList.toggle('cockpit-collapsed');
      el('collapse-panel').setAttribute('aria-expanded', String(!collapsed));
    };
  },
  "open_new_run_onclick" : () => { el('open-new-run').onclick = openPopulationPicker; },
  "open_worlds_onclick" : () => {
    el('open-worlds').onclick = () => {
      renderWorlds();
      el('worlds-dialog').showModal();
    };
  },
  "el_additional_2" : () => {
    for (const [id, kind] of [[ 'pulse-food', 'food' ], [ 'pulse-mutation', 'mutation' ]])
      el(id).onclick = () =>
          sceneState.frame && !sceneState.frame.historical && command('burst', {kind});
  },
  "breeding_help_onclick" : () => {
    el('breeding-help').onclick = () =>
        sceneState.frame && !sceneState.frame.historical &&
        command('breeding-help', {value : sceneState.frame.breeding_help?.enabled ? 0 : 1});
  },
  "single_step_onclick" : () => {
    el('single-step').onclick = () => brainState.brainOpen ? brainStep() : command('step');
  },
  "return_live_onclick" : () => { el('return-live').onclick = () => el('current').onclick(); },
  "quick_feed_onclick" : () => {
    el('quick-feed').onclick = () => {
      if (!evolutionState.editing)
        el('edit-world').onclick();
      setTool('feed');
    };
  },
  "undo_geometry_onclick" : () => { el('undo-geometry').onclick = () => command('undo'); },
  "species_sort_onchange" : () => {
    el('species-sort').onchange = () => sceneState.frame && renderSpecies(sceneState.frame, true);
  },
  "clear_highlight_onclick" : () => { el('clear-highlight').onclick = deselectSpecies; },
  "observation_mode_onchange" : () => {
    el('observation-mode').onchange = () => {
      syncBrainRequest();
      if (sceneState.frame) {
        updateObservationNote(sceneState.frame);
        draw(sceneState.frame);
      }
    };
  },
  "behavior_map_onpointermove" : () => {
    el('behavior-map').onpointermove = e => {
      const c = el('behavior-map'), r = c.getBoundingClientRect(),
            x = (e.clientX - r.left) / r.width * chartSize(c).width,
            y = (e.clientY - r.top) / r.height * chartSize(c).height;
      const point = cockpitState.mapPoints.find(p => Math.hypot(p.x - x, p.y - y) < 12);
      text('map-tooltip', point ? point.label : '');
    };
  },
  "behavior_map_onclick" : () => {
    el('behavior-map').onclick = e => {
      const c = el('behavior-map'), r = c.getBoundingClientRect(),
            x = (e.clientX - r.left) / r.width * chartSize(c).width,
            y = (e.clientY - r.top) / r.height * chartSize(c).height;
      const p = cockpitState.mapPoints.find(p => Math.hypot(p.x - x, p.y - y) < 12);
      if (p?.fish)
        selectFish(p.fish);
    };
  },
  "chart_onpointermove" : () => {
    el('chart').onpointermove = e => {
      const c = el('chart'), r = c.getBoundingClientRect(),
            x = (e.clientX - r.left) / r.width * chartSize(c).width,
            y = (e.clientY - r.top) / r.height * chartSize(c).height,
            mark = cockpitState.chartMarkers.find(p => Math.abs(p.x - x) < 8 && y > 172),
            point = chartsState.chartPoints.reduce((best, p) => {
              const distance = Math.hypot(p.x - x, p.y - y);
              return !best || distance < best.distance ? {p, distance} : best;
            }, null);
      c.title = mark ? 'Schritt ' + mark.event.step + ' · ' + mark.event.text
                : point && point.distance < 22
                    ? point.p.label
                    : curveInfo[el('chart-metric').value || 'population'].explain;
    };
  },
  "chart_onclick" : () => {
    el('chart').onclick = e => {
      const c = el('chart'), r = c.getBoundingClientRect(),
            x = (e.clientX - r.left) / r.width * chartSize(c).width,
            y = (e.clientY - r.top) / r.height * chartSize(c).height;
      const hit =
          cockpitState.chartMarkers.find(p => Math.abs(p.x - x) < 8 && y >= 172 && y <= 190);
      if (hit) {
        text('feedback', hit.event.text);
        if (hit.event.species_id)
          focusLineage(hit.event.species_id);
      }
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
