import {PALETTE} from './palette.js';
import {KIB} from './units.js';
import {displayRate} from './nutrition_model.js';
import {fishLabel} from './fish_names.js';
import {archiveCategory, eventText} from './event_model.js';
import {journal} from './journal_model.js';
import {populationOverview, speciesReplacement} from './population_model.js';
import {cssPercent, formatNumber, percent, t} from './strings.js';
import {traitExplanation, traitName} from './trait_model.js';
import {renderIndividualHormones} from './hormones.js';
import {openSpeciesDetails} from './evolution.js';
import {openPopulationPicker} from './population_picker.js';
import {chartContext, chartPointer, chartSize} from './dom.js';
import {updateEvolutionState} from './evolution.js';
import {FISH, PROTECTION, RECEPTOR, SENSE_KIND, SPECIES_TRACE, STEP_PHASE} from './schema.js';
import {brainClamp, brainState, brainStep, closeBrain} from './brain.js';
import {setFollowing} from './camera.js';
import {chartMarkerAt, chartPointAt, curveInfo, nichePointAt} from './charts.js';
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
  updateSceneState,
  wrapScreenX
} from './state.js';
import {selectFish, syncBrainRequest} from './fish_choice.js';
import {draw} from './tank.js';
import {setTool} from './world.js';
import {showWorld} from './world_parameters.js';
export const cockpitState = {};
const SUMMARY_LABELS = 4, PROTECTION_PENDING_MS = 4000, DISTANCE_DIGITS = 3;
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

function createSpeciesSpread() {
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

function updateSpeciesSpread(row, s) {
  const distance = s.genetic_spread,
        known = s.adults > 0 && Number.isFinite(distance) && s.species_distance > 0,
        ratio = known ? Math.max(0, distance / s.species_distance) : 0;
  row.parts.bar.value = Math.min(1, ratio);
  row.parts.value.textContent = known ? percent(ratio) : '–';
  row.title = known ? t('cockpit.distanceHelp', {
    distance : formatNumber(distance, DISTANCE_DIGITS, true),
    limit : formatNumber(s.species_distance, DISTANCE_DIGITS, true)
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
  for (const [value, kind] of [
           [ t('cockpit.ertrag'), 'metric-label' ],
           [ formatNumber(displayRate(s.nutrition_per_1000 || 0), 1, true), 'metric-value' ],
           [ t('cockpit.energyRateShort'), 'metric-unit' ]]) {
    const node = document.createElement('span');
    node.className = kind;
    node.textContent = value;
    stats.appendChild(node);
  }
  stats.title = t('cockpit.nutritionHelp',
                  {n : formatNumber(displayRate(s.nutrition_per_1000 || 0), 1, true)});
  button.appendChild(stats);
  appendSpeciesSuccess(button, s);
  appendSpeciesSpread(button, s);
}

const SPARK = Object.freeze({
  width : 140,
  height : 24,
  line_width : 2,
  pad_x : 2,
  pad_y : 3,
  adults : PALETTE.mint,
  nutrition : PALETTE.gold
});
function sparkline(canvas, points, key, color) {
  if (points.length < 2)
    return;
  const g = chartContext(canvas, () => sparkline(canvas, points, key, color)),
        values = points.map(p => p[key]), min = Math.min(...values),
        max = Math.max(min + 1, ...values);
  g.clearRect(0, 0, chartSize(canvas).width, chartSize(canvas).height);
  const S = SPARK, {width, height} = chartSize(canvas);
  g.strokeStyle = color;
  g.lineWidth = S.line_width;
  g.beginPath();
  points.forEach((p, i) => {
    const x = S.pad_x + i / (points.length - 1) * (width - 2 * S.pad_x),
          y = height - S.pad_y - (p[key] - min) / (max - min) * (height - 2 * S.pad_y);
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
  for (const [key, color, title, unit] of [
           [ SPECIES_TRACE.adults, SPARK.adults, t('cockpit.bestand'), t('cockpit.fische') ], [
             SPECIES_TRACE.nutrition, SPARK.nutrition, t('cockpit.nahrungsertrag'),
             t('cockpit.energyRate')
           ]]) {
    const c = document.createElement('canvas');
    c.width = SPARK.width;
    c.height = SPARK.height;
    c.title = t('cockpit.sparkline', {title, unit});
    c.onpointermove = e => {
      const rect = c.getBoundingClientRect(),
            i = Math.max(0,
                         Math.min(traces.length - 1, Math.round((e.clientX - rect.left) /
                                                                rect.width * (traces.length - 1))));
      c.title = t('cockpit.sparklinePoint', {
        title,
        value : formatNumber(traces[i][key], 1, true),
        unit,
        step : traces[i][SPECIES_TRACE.step]
      });
    };
    sparkline(c, traces, key, color);
    strip.appendChild(c);
  }
  button.appendChild(strip);
}

export let diversityRows;

export let energyParts;

function compareDiversity(a, b) {
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
    part.bar.style.width = cssPercent(s.adults / maximum);
    row.title = t('cockpit.speciesRow', {
      name : s.name,
      summary : summary.join(' · '),
      adults : s.adults,
      ratio : ratio === null ? t('cockpit.nochOffen') : formatNumber(ratio, 2, true),
      generation : s.max_g || 0,
      nutrition : formatNumber(displayRate(s.nutrition_per_1000 || 0), 1, true)
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

const REPRODUCTION = Object.freeze({
  top : 12,
  row : 35,
  text_dy : 11,
  bar_x : 157,
  bar_width : 240,
  bar_height : 13,
  value_x : 408,
  cross : '#8bcab6',
  self : '#d5b36d',
  clonal : '#b59bd6',
  text : '#bad0cb',
  track : '#263f49'
});
function renderReproduction(f) {
  const cv = el('reproduction-chart'), g = chartContext(cv, () => renderReproduction(f)),
        self = f.self_fertilisations || 0,
        values = [ Math.max(0, (f.fertilisations || 0) - self), self, f.clonal_starts || 0 ],
        names =
            [
              t('cockpit.fremdbefruchtet'), t('cockpit.selbstbefruchtet'),
              t('cockpit.klonalGestartet')
            ],
        colors = [ REPRODUCTION.cross, REPRODUCTION.self, REPRODUCTION.clonal ],
        max = Math.max(1, ...values), size = chartSize(cv);
  g.clearRect(0, 0, size.width, size.height);
  g.font = '13px system-ui';
  for (let i = 0; i < values.length; i++) {
    const y = REPRODUCTION.top + i * REPRODUCTION.row;
    g.fillStyle = REPRODUCTION.text;
    g.fillText(names[i], 0, y + REPRODUCTION.text_dy);
    g.fillStyle = REPRODUCTION.track;
    g.fillRect(REPRODUCTION.bar_x, y, REPRODUCTION.bar_width, REPRODUCTION.bar_height);
    g.fillStyle = colors[i];
    g.fillRect(REPRODUCTION.bar_x, y, REPRODUCTION.bar_width * values[i] / max,
               REPRODUCTION.bar_height);
    g.fillText(values[i].toLocaleString(t('units.locale')), REPRODUCTION.value_x,
               y + REPRODUCTION.text_dy);
  }
  cv.title = t('cockpit.begonneneNatuerlicheEntwicklungenSeit');
}

export let observationDescriptions;

export function isSickFish(p) { return !!p[FISH.hatched] && (p[FISH.disease] || 0) > 0; }

async function toggleSickSelection() {
  const next = !sceneState.highlightSick;
  if (next) {
    if (evolutionState.editing)
      el('edit-world').onclick();
    deselectSpecies();
    updateSceneState({highlightSick : true});
    if (sceneState.frame?.selected)
      await selectFish(0);
    setFollowing(false);
    setView('ecosystem');
  } else
    updateSceneState({highlightSick : false});
  if (sceneState.frame) {
    updateCockpit(sceneState.frame);
    draw(sceneState.frame);
  }
}

function updateDiseaseSelection(f) {
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
  const signature = sick.map(p => p[FISH.id]).join('/');
  if (signature !== cockpitState.patientSignature) {
    cockpitState.patientSignature = signature;
    const top = box.scrollTop;
    box.replaceChildren();
    cockpitState.patientRows.clear();
    for (const p of sick) {
      const button = document.createElement('button');
      button.onclick = () => selectFish(p[FISH.id], {preserveGroup : true});
      box.appendChild(button);
      cockpitState.patientRows.set(p[FISH.id], button);
    }
    box.scrollTop = top;
  }
  for (const p of sick) {
    const species = frameSpecies(f, p[FISH.species]);
    const button = cockpitState.patientRows.get(p[FISH.id]);
    button.textContent = t('cockpit.patient', {
      fish : fishLabel(p[FISH.id]),
      species : species?.name || t('cockpit.species', {id : p[FISH.species]}),
      steps : p[FISH.disease]
    });
    button.title = t('cockpit.fischAuswaehlenVerbleibendeKrankheitsdauer');
  }
  if (!sick.length)
    box.textContent = t('cockpit.zurzeitKeineKrankenFische');
}

function updateObservationNote(f) {
  const mode = el('observation-mode').value || 'normal',
        selected = f.fish.some(p => p[FISH.id] === f.selected && p[FISH.hatched]);
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
            uploaded : formatNumber(compute.uploaded_bytes / KIB, 1),
            reused : formatNumber((compute.reused_bytes || 0) / KIB, 1)
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
    const p = f.step_phases, P = STEP_PHASE, rows = [
      [ t('cockpit.entwicklungCppns'), p[P.development] ],
      [ t('cockpit.wasserSediment'), p[P.motion] + p[P.sediment] ],
      [ t('cockpit.pflanzen'), p[P.plants] + p[P.settle] ],
      [ t('cockpit.gpuPreparation'), p[P.gpu] ], [ t('cockpit.sinneGehirneBewegung'), p[P.act] ],
      [ t('cockpit.fressenKollisionenRest'), p[P.drift] + p[P.resolve] + p[P.reproduction] ]
    ];
    el('compute-state').title +=
        '\n' + t('cockpit.lastStep', {
          phases : rows.map(([ name, ms ]) => t('cockpit.phase', {name, ms : formatNumber(ms, 2)}))
                       .join(' · ')
        });
  }
  renderLiveOverview(f);
  if (evolutionState.activeView === 'ecosystem' && !evolutionState.editing) {
    renderDeathCauses(f);
    renderEnergy(f);
  }
  if (evolutionState.activeView === 'evolution' && !evolutionState.editing) {
    const reproduction = el('reproduction-details');
    reproduction.ontoggle = () => reproduction.open && renderReproduction(f);
    if (reproduction.open)
      renderReproduction(f);
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
  const h = (panel.brain?.id === p?.[FISH.id] ? panel.brain
             : f.brain?.id === p?.[FISH.id]   ? f.brain
                                              : null)
                ?.hormones;
  renderIndividualHormones(el('fish-hormones'), h, k => {
    openSpeciesDetails(p[FISH.species]);
    const box = el('species-hormones');
    const details = box.querySelector('details');
    if (details) {
      details.open = true;
      details.ontoggle?.();
    }
    box.querySelector('[data-hormone="' + k + '"]')?.scrollIntoView({block : 'nearest'});
  });
  if (p) {
    const own = f.individual_profile?.id === p[FISH.id] ? f.individual_profile : null;
    renderMergedTraitChips(el('fish-trait-words'), frameSpecies(f, p[FISH.species]), own);
    renderNovelty(f, p);
  }
  if (evolutionState.activeView === 'settings')
    showWorld(f);
}

const FISH_BARS = Object.freeze({
  width : 20,
  height : 3,
  gap : 5,
  step : 5,
  track : '#213a43',
  digesting : PALETTE.mint,
  reserve : '#93abb1',
  gut : '#d8b778'
});
const OBSERVE = Object.freeze({
  gain_ring : 9,
  max_gain : 20,
  wounded : .9,
  label_dx : 6,
  view_pad : 50,
  view_alpha : .10,
  gain : PALETTE.gold,
  wound : '#dc9d8f'
});
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
    if (!raw[FISH.hatched])
      continue;
    const p = blendFish(raw, blend), sx = x(wrapScreenX(p[FISH.x])), sy = y(p[FISH.y]);
    if (mode === 'nutrition') {
      const old = sceneState.previousFish.get(p[FISH.id]),
            gain = old ? p[FISH.nutrition] - old[FISH.nutrition] : 0;
      if (gain > 0) {
        ctx.strokeStyle = OBSERVE.gain;
        ctx.beginPath();
        ctx.arc(sx, sy, OBSERVE.gain_ring + Math.min(OBSERVE.max_gain, gain) * c.scale, 0,
                Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = FISH_BARS.track;
      const B = FISH_BARS, yy = sy + p[FISH.radius] * c.scale + B.gap,
            capacity = Math.max(1, p[FISH.reserve_capacity]);
      ctx.fillRect(sx - B.width / 2, yy, B.width, B.height);
      ctx.fillRect(sx - B.width / 2, yy + B.step, B.width, B.height);
      ctx.fillStyle = p[FISH.digestion] > 0 ? B.digesting : B.reserve;
      ctx.fillRect(sx - B.width / 2, yy, B.width * brainClamp(p[FISH.energy] / capacity), B.height);
      ctx.fillStyle = B.gut;
      ctx.fillRect(sx - B.width / 2, yy + B.step,
                   B.width * brainClamp((p[FISH.gut_fill] || 0) / capacity), B.height);
    } else if (mode === 'combat') {
      const radius = p[FISH.radius] * c.scale;
      if (p[FISH.health] < OBSERVE.wounded) {
        ctx.fillStyle = OBSERVE.wound;
        ctx.font = '10px system-ui';
        ctx.fillText(percent(p[FISH.health]), sx + radius + OBSERVE.label_dx, sy);
      }
    } else if (mode === 'senses' && selected) {
      const b = f.brain;
      if (!b)
        continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p[FISH.angle]);
      const reach = f.parameters.vision_range * c.scale, extent = reach, anatomy = fishAnatomy(p);
      ctx.beginPath();
      ctx.rect(-extent - OBSERVE.view_pad, -extent - OBSERVE.view_pad,
               2 * (extent + OBSERVE.view_pad), 2 * (extent + OBSERVE.view_pad));
      fishBodyPath(ctx, p[FISH.radius] * c.scale, anatomy, true);
      ctx.clip('evenodd');
      const visual = (b.receptors || []).filter(r => r[RECEPTOR.senses]?.[SENSE_KIND.light] > 0),
            focused = visual.find(r => r[RECEPTOR.neuron] === sessionState.neuronFocus),
            shown = focused ? [ focused ] : visual;
      for (const receptor of shown) {
        const left = receptor[RECEPTOR.view_left], right = receptor[RECEPTOR.view_right];
        if (right <= left)
          continue;
        ctx.fillStyle = 'hsla(' + (receptor[RECEPTOR.hue] || 0) + ',75%,65%,' +
                        (OBSERVE.view_alpha / Math.max(1, Math.sqrt(shown.length))) + ')';
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

function renderLiveOverview(f) {
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
  text('assistance-now', o.help.on ? percent(o.need) : t('cockpit.aus'));
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
  const protection = document.createElement('span'),
        proven = (s.feeding_generations || 0) >= PROTECTION.generations,
        used = Math.min(PROTECTION.max_uses, s.protection_used || 0);
  protection.className = 'species-protection';
  protection.textContent =
      proven ? t('cockpit.protectionMeter',
                 {marks : '●'.repeat(used) + '○'.repeat(PROTECTION.max_uses - used)})
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
  "speciesSummary" : () => {
    speciesSummary = s => s?.summary_labels || speciesLabels(s).slice(0, SUMMARY_LABELS);
  },
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
    cockpitState.protectionMinimum = 3;
    el('pulse-protection').onclick = async () => {
      const f = sceneState.frame, minimum = f?.assistance?.species_minimum || 0,
            button = el('pulse-protection'), on = button.getAttribute('aria-pressed') === 'true';
      if (!f || f.historical)
        return;
      cockpitState.protectionPending = {
        on : !on,
        until : performance.now() + PROTECTION_PENDING_MS
      };
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
      const c = el('behavior-map'), {x, y} = chartPointer(c, e);
      const point = nichePointAt(x, y);
      text('map-tooltip', point ? point.label : '');
    };
  },
  "behavior_map_onclick" : () => {
    el('behavior-map').onclick = e => {
      const c = el('behavior-map'), {x, y} = chartPointer(c, e);
      const p = nichePointAt(x, y);
      if (p?.fish)
        selectFish(p.fish);
    };
  },
  "chart_onpointermove" : () => {
    el('chart').onpointermove = e => {
      const c = el('chart'), {x, y} = chartPointer(c, e), mark = chartMarkerAt(x, y),
            point = chartPointAt(x, y);
      c.title = mark    ? t('cockpit.eventMark',
                            {step : formatNumber(mark.event.step), text : eventText(mark.event)})
                : point ? point.label
                        : curveInfo[el('chart-metric').value || 'population'].explain;
    };
  },
  "chart_onclick" : () => {
    el('chart').onclick = e => {
      const c = el('chart'), {x, y} = chartPointer(c, e);
      const hit = chartMarkerAt(x, y);
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
