import {archiveCategory, eventText} from './event_model.js';
import {journal} from './journal_model.js';
import {populationOverview, speciesReplacement} from './population_model.js';
import {t, formatNumber} from './strings.js';
import {traitExplanation, traitName} from './trait_model.js';
import {renderIndividualHormones} from './hormones.js';
import {openSpeciesDetails} from './evolution.js';
import {openPopulationPicker} from './population_picker.js';
import {chartContext, chartSize} from './dom.js';
import {updateEvolutionState} from './evolution.js';
import {FISH} from './schema.js';
import {brainState, brainStep, closeBrain} from './brain.js';
import {setFollowing} from './camera.js';
import {chartsState, curveInfo} from './charts.js';
import {ctx, el, renderMergedTraitChips, syncChildren, text} from './dom.js';
import {renderDeathCauses, renderEnergy, renderNovelty} from './energy_view.js';
import {renderWorlds} from './event_view.js';
import {
  deselectSpecies,
  evolutionState,
  focusLineage,
  renderSpecies,
  setView
} from './evolution.js';
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
  updateSceneState,
  wrapScreenX
} from './state.js';
import {draw} from './tank.js';
import {setTool} from './world.js';
import {showWorld} from './world_parameters.js';
export const cockpitState = {};
export let speciesLabels;

export let speciesSummary;

export function recordNames(id) {
  return Object.entries(journal().records)
      .filter(([, e ]) => e.session === sessionState.sessionId && e.species_id === id)
      .map(([ key ]) => archiveCategory(key));
}

export function speciesComparator(a, b) {
  switch (el('species-sort').value) {
  case 'genus':
    return (a.genus_name || a.name).localeCompare(b.genus_name || b.name, t('units.locale')) ||
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
  label.textContent = t('cockpit.artgrenze');
  bar.max = 1;
  bar.setAttribute('aria-label', t('cockpit.abstandZurArtgrenze'));
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
  row.parts.value.textContent = known ? t('units.percent', {n : Math.round(100 * ratio)}) : '–';
  row.title = known ? t('cockpit.distanceHelp', {
    distance : formatNumber(distance, 3, true),
    limit : formatNumber(s.species_distance, 3, true)
  })
                    : t('cockpit.keineAktuellenGenomabstaendeGeschluepfter');
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
    tag.textContent = traitName(word);
    tag.title = s.trait_details?.[word] ? traitExplanation(word, s.trait_details[word]) : word;
    tag.className = s.trait_details?.[word]?.group === 'Kombination' ? 'combined-trait' : '';
    tags.appendChild(tag);
  }
  button.appendChild(tags);
  const stats = document.createElement('p');
  stats.className = 'card-metrics';
  for (const [value,
              kind] of [[ t('cockpit.ertrag'), 'metric-label' ],
                        [ formatNumber((s.nutrition_per_1000 || 0) / 10, 1, true), 'metric-value' ],
                        [ t('cockpit.energie100'), 'metric-unit' ]]) {
    const node = document.createElement('span');
    node.className = kind;
    node.textContent = value;
    stats.appendChild(node);
  }
  stats.title =
      t('cockpit.nutritionHelp', {n : formatNumber((s.nutrition_per_1000 || 0) / 10, 1, true)});
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
  const traces = journal().traces[String(s.id)] || [];
  if (traces.length < 2)
    return;
  const strip = document.createElement('div');
  strip.className = 'trace-strip';
  for (const [key, color, title] of [[ 1, '#a2d9c6', t('cockpit.bestand') ],
                                     [ 2, '#e9c185', t('cockpit.nahrungsertrag') ]]) {
    const c = document.createElement('canvas');
    c.width = 140;
    c.height = 24;
    const unit = key === 1 ? t('cockpit.fische') : t('cockpit.energie100Schritte');
    c.title = t('cockpit.sparkline', {title, unit});
    c.onpointermove = e => {
      const rect = c.getBoundingClientRect(),
            i = Math.max(0,
                         Math.min(traces.length - 1, Math.round((e.clientX - rect.left) /
                                                                rect.width * (traces.length - 1))));
      c.title =
          t('cockpit.sparklinePoint',
            {title, value : formatNumber(traces[i][key], 1, true), unit, step : traces[i][0]});
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
    delta = (a.name || '').localeCompare(b.name || '', t('units.locale'));
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
    button.title = (key === 'replacement'  ? t('cockpit.spaetereNatuerlicheSchlupfeJe')
                    : key === 'generation' ? t('cockpit.hoechsteLebendeHilfsfreieGeneration')
                                           : '') +
                   t('cockpit.sortHelp');
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
    part.traits.textContent = summary.slice(0, 2).join(' · ') || t('cockpit.beobachtungLaeuft');
    part.count.textContent = s.adults;
    part.replacement.textContent = ratio === null ? '–' : formatNumber(ratio, 2, true);
    part.replacement.classList.toggle('self-sustaining', ratio !== null && ratio >= 1);
    part.replacement.title = t('cockpit.natuerlicheSchlupfeAbDer');
    part.generation.textContent = s.max_g || 0;
    part.generation.title = t('cockpit.hoechsteLebendeHilfsfreieGeneration2');
    part.bar.style.width = 100 * s.adults / maximum + '%';
    row.title = t('cockpit.speciesRow', {
      name : s.name,
      summary : summary.join(' · '),
      adults : s.adults,
      ratio : ratio === null ? t('cockpit.nochOffen') : formatNumber(ratio, 2, true),
      generation : s.max_g || 0,
      nutrition : formatNumber((s.nutrition_per_1000 || 0) / 10, 1, true)
    });
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
        names =
            [
              t('cockpit.fremdbefruchtet'), t('cockpit.selbstbefruchtet'),
              t('cockpit.klonalGestartet')
            ],
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
    g.fillText(values[i].toLocaleString(t('units.locale')), 408, y + 11);
  }
  cv.title = t('cockpit.begonneneNatuerlicheEntwicklungenSeit');
}

export let observationDescriptions;

export function isSickFish(p) { return !!p[FISH.hatched] && (p[FISH.disease] || 0) > 0; }

export async function toggleSickSelection() {
  const next = !sceneState.highlightSick;
  if (next) {
    if (evolutionState.editing)
      el('edit-world').onclick();
    deselectSpecies();
    updateSceneState({highlightSick : true});
    if (sceneState.frame?.selected)
      await selectFish(0);
    setFollowing(false);
    setView('evolution');
  } else
    updateSceneState({highlightSick : false});
  if (sceneState.frame) {
    updateCockpit(sceneState.frame);
    draw(sceneState.frame);
  }
}

export function updateDiseaseSelection(f) {
  const sick = f.fish.filter(isSickFish);
  for (const id of ['live-disease', 'disease-summary']) {
    el(id).setAttribute('aria-pressed', String(sceneState.highlightSick));
    el(id).disabled = !sick.length && !sceneState.highlightSick;
    el(id).title = sceneState.highlightSick ? t('cockpit.markierungDerKrankenFische')
                                            : t('cockpit.krankeFischeHabenPulsierende');
  }
  el('live-disease').hidden = false;
  const box = el('disease-patients');
  box.hidden = !sceneState.highlightSick;
  if (!sceneState.highlightSick)
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
    button.textContent = t(
        'cockpit.patient',
        {id : p[4], species : species?.name || t('cockpit.species', {id : p[22]}), steps : p[52]});
    button.title = t('cockpit.fischAuswaehlenVerbleibendeKrankheitsdauer');
  }
  if (!sick.length)
    box.textContent = t('cockpit.zurzeitKeineKrankenFische');
}

export function updateObservationNote(f) {
  const mode = el('observation-mode').value || 'normal',
        selected = f.fish.some(p => p[4] === f.selected && p[8]);
  let note = observationDescriptions[mode] || observationDescriptions.normal;
  if (mode === 'senses' && !selected)
    note += t('cockpit.fischAuswaehlen');
  else if (mode !== 'normal')
    note += f.selected                    ? t('cockpit.fuerDenAusgewaehltenFisch')
            : sceneState.highlightSick    ? t('cockpit.fuerDieMarkiertenKranken')
            : sceneState.highlightSpecies ? t('cockpit.fuerDieAusgewaehlteArt')
                                          : t('cockpit.fuerAlleFische');
  if (sceneState.highlightSick)
    note += t('cockpit.roteAuswahlmarkenKrankeFische');
  text('observation-note', note);
  el('observation-mode').title = note;
}

export function updateCockpit(f) {
  const compute = f.compute || {}, gpu = !!compute.active;
  text('compute-state',
       gpu ? (String(compute.mode).startsWith('opencl-cpu') ? t('cockpit.clCpu') : 'GPU') : 'CPU');
  el('compute-state').classList.toggle('gpu-active', gpu);
  el('compute-state').title =
      gpu ? [
          t('cockpit.gpuActive', {
            device : compute.device,
            queries : formatNumber(compute.queries),
            ms : formatNumber(compute.milliseconds, 2)
          }),
          ...(compute.uploaded_bytes !== undefined ? [ t('cockpit.gpuTransfer', {
            uploaded : formatNumber(compute.uploaded_bytes / 1024, 1),
            reused : formatNumber((compute.reused_bytes || 0) / 1024, 1)
          }) ]
                                                   : []),
          ...(compute.fallback_queries
                  ? [ t('cockpit.gpuFallback', {n : formatNumber(compute.fallback_queries)}) ]
                  : [])
        ].join('\n')
      : compute.mode === 'cpu' || !compute.mode
          ? t('cockpit.wahrnehmungAufDerCpu')
          : t('cockpit.gpuRequested',
              {reason : compute.reason || compute.device || t('cockpit.wartetAufSichtabfragen')});
  if (f.step_phases) {
    const p = f.step_phases, rows = [
      [ t('cockpit.entwicklungCppns'), p[0] ], [ t('cockpit.wasserSediment'), p[1] + p[2] ],
      [ t('cockpit.pflanzen'), p[3] + p[8] ], [ t('cockpit.gpuPreparation'), p[5] ],
      [ t('cockpit.sinneGehirneBewegung'), p[6] ],
      [ t('cockpit.fressenKollisionenRest'), p[4] + p[7] + p[9] ]
    ];
    el('compute-state').title +=
        '\n' + t('cockpit.lastStep', {
          phases : rows.map(([ name, ms ]) => t('cockpit.phase', {name, ms : formatNumber(ms, 2)}))
                       .join(' · ')
        });
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
  text('world-banner-text', t('cockpit.savedWorld', {step : formatNumber(f.step)}));
  el('clear-highlight').hidden = false;
  el('clear-highlight').style.visibility =
      sceneState.highlightSpecies || sceneState.highlightSick || lineageState.speciesBranch
          ? 'visible'
          : 'hidden';
  el('clear-highlight').disabled =
      !sceneState.highlightSpecies && !sceneState.highlightSick && !lineageState.speciesBranch;
  el('clear-highlight').title = sceneState.highlightSick ? t('cockpit.markierungDerKrankenFische')
                                                         : t('cockpit.artauswahlAufheben');
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
    renderMergedTraitChips(el('fish-trait-words'), frameSpecies(f, p[22]), own);
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
        pool = selected
                   ? [ selected ]
                   : f.fish.filter(p => sceneState.highlightSick
                                            ? isSickFish(p)
                                            : !sceneState.highlightSpecies ||
                                                  p[FISH.species] === sceneState.highlightSpecies);
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
        ctx.fillText(t('units.percent', {n : Math.round(p[23] * 100)}), sx + radius + 6, sy);
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
  const o = populationOverview(f, evolutionState.selectedSpecies), s = o.species,
        scope = s ? s.name : t('cockpit.gesamterBestand'),
        ratioHelp = t('cockpit.schlupfeAbDerDritten');
  text('live-scope', scope);
  el('live-scope').title = scope;
  text('live-replacement', o.ratio === null ? '–' : formatNumber(o.ratio, 2, true));
  el('live-replacement').classList.toggle('positive', o.ratio !== null && o.ratio >= 1);
  el('live-replacement').title = ratioHelp;
  text('live-generation', o.generation);
  el('live-generation').title = t('cockpit.hoechsteLebendeGenerationSeit');
  text('live-success-label', s ? t('cockpit.lebendeFische') : t('cockpit.selbsttragendeArten'));
  text('live-success', o.success);
  el('live-success').title =
      s ? t('cockpit.lebendeGeschluepfteFischeDieser') : t('cockpit.artenMitNachwuchsJe');
  const labels = {food : t('cockpit.futterschub'), mutation : t('cockpit.mutationsschub')};
  for (const pulse of o.pulses) {
    const id = 'pulse-' + pulse.key, label = labels[pulse.key];
    text(id, label);
    el(id).classList.toggle('pulse-active', pulse.active);
    el(id).title = pulse.active ? t('cockpit.pulseActive', {label, n : pulse.remaining})
                                : t('cockpit.pulseInactive', {label});
  }
  text('pulse-help', t('cockpit.hilfsschub'));
  el('pulse-help').classList.toggle('pulse-active', o.help.needed);
  el('pulse-help').title = t('cockpit.helpPulse', {
    state : o.help.on
                ? t('cockpit.minimumStock', {target : o.help.target, missing : o.help.shortfall})
                : t('cockpit.ausgeschaltet')
  });
  // A click shows its result at once; the server echo follows with the next frames.
  const protection = el('pulse-protection'), pending = cockpitState.protectionPending;
  if (pending && (pending.on === o.protection.on || performance.now() > pending.until))
    cockpitState.protectionPending = null;
  const protecting = cockpitState.protectionPending ? pending.on : o.protection.on;
  protection.setAttribute('aria-pressed', String(protecting));
  protection.classList.toggle('pulse-active', protecting);
  protection.title =
      protecting ? t('cockpit.protectionOn', o.protection) : t('cockpit.artenschutzAus');
  for (const id of ['pulse-food', 'pulse-mutation', 'pulse-help', 'pulse-protection'])
    el(id).disabled = o.historical || id === 'pulse-help';
  for (const id of ['pulse-food', 'pulse-mutation', 'pulse-help'])
    el(id).setAttribute('aria-label', el(id).title);
  text('pulse-state', o.historical ? t('cockpit.gespeichert')
                      : o.paused   ? t('cockpit.pause')
                                   : t('cockpit.laeuft'));
  el('pulse-state').classList.toggle('pulse-active', o.paused || o.historical);
  text('replacement-now', o.globalRatio === null ? '–' : formatNumber(o.globalRatio, 2, true));
  el('replacement-now').classList.toggle('positive', o.globalRatio !== null && o.globalRatio >= 1);
  el('replacement-now').title = ratioHelp;
  text('assistance-now',
       o.help.on ? t('units.percent', {n : Math.round(o.need)}) : t('cockpit.aus'));
  el('assistance-now').title = t('cockpit.fehlenderAnteilBisZum');
  el('replacement-trend').title = ratioHelp + ' ' + t('cockpit.replacementAxes');
  el('assistance-trend').title = el('assistance-now').title + ' ' + t('cockpit.assistanceAxes');
}

export function appendSpeciesSuccess(box, s) {
  const value = speciesReplacement(s), panel = document.createElement('div'),
        score = document.createElement('strong'), depth = document.createElement('small');
  panel.className = 'species-success';
  score.textContent =
      t('cockpit.selfSustain', {value : value === null ? '–' : formatNumber(value, 2, true)});
  score.classList.toggle('self-sustaining', value !== null && value >= 1);
  score.title = t('cockpit.schlupfeAbDerDritten2');
  depth.textContent = t('cockpit.freeGeneration', {n : s.max_g || 0});
  depth.title = t('cockpit.hoechsteLebendeNatuerlicheGeneration');
  panel.appendChild(score);
  panel.appendChild(depth);
  const protection = document.createElement('span'), proven = (s.feeding_generations || 0) >= 2,
        used = Math.min(3, s.protection_used || 0);
  protection.className = 'species-protection';
  protection.textContent =
      proven ? t('cockpit.protectionMeter', {marks : '●'.repeat(used) + '○'.repeat(3 - used)})
             : t('cockpit.offspringProgress', {n : s.feeding_generations || 0});
  protection.title = proven ? t('cockpit.protectionUsed', {n : used})
                            : t('cockpit.artenschutzSetztZweiAufeinanderfolgende');
  protection.setAttribute('aria-label', protection.title);
  panel.appendChild(protection);
  box.appendChild(panel);
}

export function updateCockpitState(patch) {
  Object.assign(cockpitState, patch);
  return Object.values(patch)[0];
}

const initializers = {
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
      normal : t('cockpit.roteFleckenKrank'),
      nutrition : t('cockpit.obenReserveUntenDarmfuellung'),
      senses : t('cockpit.faecherSehfelderImBevorzugten'),
      combat : t('cockpit.rotAktiveKieferBlau')
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
        text('edit-world', t('cockpit.weltBearbeiten'));
        setView('settings');
      }
    };
  },
  "show_cockpit_onchange" : () => {
    el('show-cockpit').onchange =
        () => { el('layout').classList.toggle('cockpit-collapsed', !el('show-cockpit').checked); };
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
  "pulse_protection_onclick" : () => {
    // Artenschutz = species minimum above 0; switching off remembers the last minimum.
    cockpitState.protectionMinimum = 3;
    el('pulse-protection').onclick = async () => {
      const f = sceneState.frame, minimum = f?.assistance?.species_minimum || 0,
            button = el('pulse-protection'), on = button.getAttribute('aria-pressed') === 'true';
      if (!f || f.historical)
        return;
      cockpitState.protectionPending = {on : !on, until : performance.now() + 4000};
      button.setAttribute('aria-pressed', String(!on));
      button.classList.toggle('pulse-active', !on);
      if (on) {
        if (minimum > 0)
          cockpitState.protectionMinimum = minimum;
        await command('parameter', {name : 'assist_species_minimum', value : 0});
        return;
      }
      if (!f.safety)
        await command('safety', {value : 1});
      await command('parameter',
                    {name : 'assist_species_minimum', value : cockpitState.protectionMinimum || 3});
    };
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
      c.title = mark ? t('cockpit.eventMark',
                         {step : formatNumber(mark.event.step), text : eventText(mark.event)})
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
        text('feedback', eventText(hit.event));
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
