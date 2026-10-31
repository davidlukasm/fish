import {nameReason, newestSpecimens, speciesCensus} from './species_model.js';
import {family_modelState} from './family_model.js';
import {t, tList, formatNumber} from './strings.js';
import {command} from './session.js';
import {setBrainView} from './brain_probe.js';
import {beginEggPlacement} from './world.js';
import {renderSpeciesHormones} from './hormones.js';
import {updateLineageState} from './lineage.js';
import {updateSceneState} from './state.js';
import {appendSpeciesBehaviorComparison} from './behavior_view.js';
import {brainClamp, brainSetOpen, brainState} from './brain.js';
import {brainArmProbe} from './brain_input.js';
import {brainSenseColors} from './brain_model.js';
import {fishSightPixels, zoomToFish, zoomToSpecimen} from './camera.js';
import {behaviorMap} from './charts.js';
import {
  appendSpeciesSpread,
  appendSpeciesSuccess,
  appendSpeciesSummary,
  cockpitState,
  drawSpeciesTrace,
  recordNames,
  rememberViewScroll,
  renderDiversity,
  restoreViewScroll,
  speciesComparator,
  speciesLabels,
  speciesSummary,
  updateCockpit
} from './cockpit.js';
import {chartContext, el, syncChildren, text, traitChip, renderTraitGroups} from './dom.js';
import {BEHAVIOR_SCALE} from './schema.js';
import {renderEvents} from './event_view.js';
import {renderFeeding} from './feeding_view.js';
import {ecologyFor} from './nutrition_model.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishAnatomy} from './fish_forms.js';
import {fishPreviewBounds} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {
  drawTree,
  lineageButton,
  lineageElement,
  lineageState,
  redrawFamilies,
  renderIndividualFamily,
  showIndividualFamily
} from './lineage.js';
import {organNumber} from './organ_readout.js';
import {showSelection} from './selection.js';
import {
  blendFish,
  displayStep,
  frameBlend,
  frameFish,
  frameIndex,
  frameSpecies,
  sceneState,
  selectFish,
  syncBrainRequest
} from './state.js';
import {showWorld} from './world_parameters.js';
export const evolutionState = {};
export let featureNames;

export let speciesCards;

export let pinnedSpecies;

export function orderSpeciesCards(sorted) {
  const pinned =
            sorted.filter(s => pinnedSpecies.has(s.id))
                .sort((a, b) => pinnedSpecies.get(a.id) - pinnedSpecies.get(b.id) || a.id - b.id),
        rest = sorted.filter(s => !pinnedSpecies.has(s.id));
  for (const s of pinned)
    rest.splice(Math.min(pinnedSpecies.get(s.id), rest.length), 0, s);
  return rest;
}

export function setView(v, {preview = false} = {}) {
  if (!preview) {
    if (evolutionState.previewSpecies)
      previewSpecies(0);
    updateSceneState({tankPreviewFish : 0});
    el('layout').classList.remove('cockpit-collapsed');
    el('show-cockpit').checked = true;
  }
  if (v !== 'brain' && typeof brainState.brainProbeArmed !== 'undefined') {
    brainArmProbe(false);
  }
  rememberViewScroll();
  evolutionState.activeView = v;
  // One cockpit width for every tab; only the divider changes it.
  for (const key of ['evolution', 'species', 'fish', 'events', 'brain']) {
    const active = key === v || key === 'fish' && v === 'brain';
    el('view-' + key).hidden = evolutionState.editing || !active;
    if (key === 'brain')
      continue;
    el('tab-' + key).classList.toggle('active', active);
    el('tab-' + key).setAttribute('aria-pressed', String(active));
  }
  el('selection').hidden = v === 'brain';
  syncFishTabs();
  el('view-settings').hidden = evolutionState.editing || v !== 'settings';
  el('settings-toggle').setAttribute('aria-pressed', String(v === 'settings'));
  if (v === 'settings' && sceneState.frame)
    showWorld(sceneState.frame);
  if (v === 'events')
    renderEvents();
  restoreViewScroll(v);
  if (v === 'species' && sceneState.frame)
    renderSpecies(sceneState.frame, true);
  if (sceneState.frame) {
    if (!preview)
      syncBrainRequest();
    if ((v === 'fish' || v === 'brain') && !evolutionState.editing)
      showSelection(sceneState.frame);
    if (v === 'evolution' && !evolutionState.editing)
      behaviorMap(sceneState.frame);
  }
}

// Fish tab parts: Fisch (overview), Organe and Nervensystem; the tank zoom follows the part.
export function syncFishTabs() {
  const brain = evolutionState.activeView === 'brain', organs = brainState.brainView === 'organs';
  el('fish-overview').setAttribute('aria-pressed', String(evolutionState.activeView === 'fish'));
  el('tab-organs').setAttribute('aria-pressed', String(brain && organs));
  el('tab-brain').setAttribute('aria-pressed', String(brain && !organs));
  el('view-brain').dataset.mode = organs ? 'organs' : 'network';
  text('brain-title', organs ? t('evolution.organe') : t('evolution.nervensystem'));
}

export async function showFishPart(part) {
  const f = sceneState.frame, id = f?.selected, p = id && frameFish(f, id);
  if (part === 'fish') {
    setView('fish');
    if (p && brainState.brainOpen) {
      await zoomToFish(id, fishSightPixels());
      await brainSetOpen(false);
    }
    return;
  }
  if (!p?.[8])
    return;
  await zoomToFish(id, part === 'organs' ? 112 : 260);
  // Selecting resets the inspection view, so the part is chosen after the zoom.
  if (brainState.brainView !== part)
    setBrainView(part);
  setView('brain');
}

export function featureValue(index, value) {
  return index === 0
             ? t('units.pxPerStep', {n : formatNumber(BEHAVIOR_SCALE.speed * value, 1, true)})
         : index === 1 ? t('units.degPerStep',
                           {n : formatNumber(BEHAVIOR_SCALE.turn_degrees * value, 1, true)})
         : [ 4, 12, 13 ].includes(index)
             ? t('units.per100Steps', {n : formatNumber(100 * value, 1, true)})
             : t('units.percent', {n : Math.round(100 * value)});
}

export function renderProfile(s, all) {
  renderSpeciesHormones(el('species-hormones'), s, all);
  const box=el('species-profile'),changes=el('species-profile-changes'),signature=JSON.stringify(s?[s.id,s.profile,s.profile_samples,s.typical_fish,s.typical_distance,s.typical_parent,s.name,s.genus_name,s.epithet,s.name_reason,s.max_founder_distance,s.genetic_spread,s.species_distance,s.replacement_hatches,s.replacement_deaths,s.max_g,s.successful_offspring,s.feeding_generations,s.protection_used,s.born,s.profile_samples,s.profile,s.initial_profile,s.initial_step,s.comparison_parents,s.first_delta,s.body_profile,s.lifetime_body,s.body_samples,s.lifetime_diet,s.lifetime_raw_diet,s.lifetime_digested,s.lifetime_steps,s.lifetime_drift,s.lifetime_ecology,s.lifetime_ecology_steps,s.lifetime_profile,s.lifetime_profile_samples,s.diet,s.ecology,s.habitat_steps,s.nutrition_steps,s.labels,s.summary_labels,s.profile_labels,s.trait_details,all.filter(p=>p.id===s.mother||p.id===s.father||p.mother===s.id).map(p=>[p.id,p.name,p.profile,p.profile_samples])]:null);
  if (signature === box.profileSignature)
    return;
  box.profileSignature = signature;
  box.replaceChildren();
  changes.replaceChildren();
  el('species-body-profile').replaceChildren();
  el('species-body-overview').hidden = !s?.body_profile && !s?.body_samples;
  el('species-traits').replaceChildren();
  const typical = el('species-typical-brain');
  typical.disabled = !s?.typical_fish;
  typical.title =
      s?.typical_fish
          ? t(s.typical_parent ? 'evolution.typicalParent' : 'evolution.typical',
              {id : s.typical_fish, distance : formatNumber(s.typical_distance, 3, true)})
          : t('evolution.keinLebenderVertreterVerfuegbar');
  typical.onclick = () => s?.typical_fish && zoomToSpecimen(s.typical_fish);
  el('species-place-eggs').disabled = !s?.typical_fish;
  el('species-place-eggs').onclick = () => s?.typical_fish && beginEggPlacement(s.typical_fish);
  el('species-behavior').replaceChildren();
  if (!s)
    return;
  renderFeeding(el('species-feeding'), s.lifetime_diet || [], s.lifetime_steps || 0, {
    ...ecologyFor({ecology : s.lifetime_ecology, ecology_steps : s.lifetime_ecology_steps}),
    drift_grass : s.lifetime_drift || 0,
    raw_diet : s.lifetime_raw_diet || [],
    digested : s.lifetime_digested || 0
  },
                {diet : s.diet || [], eco : s.ecology || {}});
  appendSpeciesSuccess(box, s);
  appendSpeciesBehaviorComparison(el('species-behavior'), s, all);
  if (s.genus_name) {
    const taxonomy = document.createElement('p');
    taxonomy.className = 'caption';
    taxonomy.textContent = t('evolution.taxonomy', {genus : s.genus_name, id : s.id});
    taxonomy.title = t('evolution.nurDerAbstandZum');
    box.appendChild(taxonomy);
    const meaning = document.createElement('p');
    meaning.className = 'caption';
    meaning.textContent = s.epithet
                              ? t('evolution.nameReason', {reason : nameReason(s.name_reason)})
                              : t('evolution.artnameFolgtNachBestaetigter');
    meaning.title = t('evolution.derWissenschaftlicheNameBleibt');
    box.appendChild(meaning);
  }
  appendSpeciesSpread(box, s);
  const tags = document.createElement('div');
  tags.className = 'trait-tags';
  for (const label of s.profile_labels || speciesSummary(s))
    tags.appendChild(traitChip(label, s));
  box.appendChild(tags);
  text('species-traits-count', t('evolution.allTraits', {n : speciesLabels(s).length}));
  const allTraits = el('species-traits-details');
  allTraits.hidden = speciesLabels(s).length <= (s.profile_labels || speciesSummary(s)).length;
  allTraits.ontoggle = () => {
    if (allTraits.open)
      renderTraitGroups(el('species-traits'), s);
  };
  if (allTraits.open)
    renderTraitGroups(el('species-traits'), s);
  const line = value => {
    const p = document.createElement('p');
    p.className = 'caption';
    p.textContent = value;
    changes.appendChild(p);
  };
  const note = document.createElement('p');
  note.className = 'caption';
  note.textContent = s.profile_samples
                         ? t('evolution.speciesOrigin',
                             {offspring : s.successful_offspring, step : formatNumber(s.born)})
                         : t('evolution.verhaltenWirdNochBeobachtet');
  box.appendChild(note);
  el('species-anatomy').hidden = !s.body_profile && !s.body_samples;
  if (s.body_profile || s.body_samples) {
    const body = s.body_profile, details = el('species-body-profile');
    const chart = document.createElement('canvas');
    chart.width = 360;
    chart.height = 570;
    chart.className = 'anatomy-chart';
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', t('evolution.gesamtUndLebendSinne'));
    drawBodyProfile(chart, s.body_samples ? s.lifetime_body : body, body, s.body_samples);
    drawBodyOverview(el('species-body-overview'), s.body_samples ? s.lifetime_body : body, body,
                     [ t('evolution.gesamt'), t('evolution.lebend') ]);
    details.appendChild(chart);
  }
  const speciesName = id => all.find(p => p.id === id)?.name || t('evolution.speciesNumber', {id});
  line(s.mother ? t('evolution.motherSpecies', {name : speciesName(s.mother)})
                : t('evolution.unabhaengigerUrsprung'));
  if (s.father && s.father !== s.mother)
    line(t('evolution.fatherSpecies', {name : speciesName(s.father)}));
  const baseline = s.initial_profile, profile = s.profile || [];
  if (baseline && s.profile_samples) {
    line(t('evolution.sinceFirstProfile', {step : formatNumber(s.initial_step)}));
    const deltas = profile.map((value, k) => ({value : value - (baseline[k] ?? value), k}))
                       .filter(x => Math.abs(x.value) > .04)
                       .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                       .slice(0, 5);
    if (deltas.length) {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 30 + deltas.length * 38;
      c.className = 'profile-deltas';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', t('evolution.profileChanges', {
                       changes : deltas
                                     .map(v => t('evolution.featureChange', {
                                            feature : featureNames[v.k],
                                            from : featureValue(v.k, baseline[v.k]),
                                            to : featureValue(v.k, profile[v.k])
                                          }))
                                     .join('; ')
                     }));
      const g = c.getContext('2d', {willReadFrequently : true});
      g.font = '11px system-ui';
      deltas.forEach((v, j) => {
        const y = 24 + j * 38;
        g.fillStyle = '#abc5cb';
        g.textAlign = 'left';
        g.fillText(featureNames[v.k], 8, y);
        g.strokeStyle = '#2d4c58';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(8, y + 13);
        g.lineTo(348, y + 13);
        g.stroke();
        const x = 8 + 340 * brainClamp(profile[v.k]), old = 8 + 340 * brainClamp(baseline[v.k]);
        g.strokeStyle = v.value > 0 ? '#87c7b1' : '#d3ab83';
        g.beginPath();
        g.moveTo(old, y + 13);
        g.lineTo(x, y + 13);
        g.stroke();
        g.fillStyle = '#819ca5';
        g.beginPath();
        g.arc(old, y + 13, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f1d08b';
        g.beginPath();
        g.arc(x, y + 13, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d8e7e6';
        g.textAlign = 'right';
        g.fillText(featureValue(v.k, baseline[v.k]) + ' → ' + featureValue(v.k, profile[v.k]), 348,
                   y);
      });
      changes.appendChild(c);
    } else
      line(t('evolution.bisherKeineGroessereProfilaenderung'));
  } else
    line(s.profile_samples ? t('evolution.dasErsteProfilWird')
                           : t('evolution.fuerEinVerhaltensprofilFehlen'));
  if (s.comparison_parents) {
    const changed = (s.first_delta || [])
                        .map((value, k) => ({value, k}))
                        .filter(x => Math.abs(x.value) > .12)
                        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                        .slice(0, 3);
    for (const x of changed)
      line(x.value > 0 ? t('evolution.originHigher', {feature : featureNames[x.k]})
                       : t('evolution.originLower', {feature : featureNames[x.k]}));
  }
}

export function previewSpecies(id) {
  const old = evolutionState.previewSpecies || 0;
  if (old === id)
    return;
  if (!old)
    evolutionState.previewHighlight = sceneState.highlightSpecies;
  evolutionState.previewSpecies = id;
  sceneState.highlightSpecies = id || evolutionState.previewHighlight || 0;
  for (const {card, button} of speciesCards.values()) {
    const active = Number(card.dataset.species) === (id || evolutionState.selectedSpecies);
    card.classList.toggle('active', active);
    button.classList.toggle('active', active);
  }
  const all = sceneState.frame?.species || [];
  renderProfile(all.find(s => s.id === (id || evolutionState.selectedSpecies)), all);
}

export function deselectSpecies() {
  previewSpecies(0);
  sceneState.highlightSick = false;
  evolutionState.selectedSpecies = evolutionState.lineageFocus = sceneState.highlightSpecies = 0;
  updateLineageState({speciesFamilyFocus : 0});
  updateLineageState({speciesBranch : 0});
  updateLineageState({speciesTrail : []});
  updateLineageState({memberPage : 0});
  evolutionState.individualSignature = '';
  if (sceneState.frame) {
    renderSpecies(sceneState.frame, true);
    renderDiversity(sceneState.frame);
    updateCockpit(sceneState.frame);
  }
}

export function focusLineage(id, keepView = false) {
  if (!sceneState.frame)
    return;
  previewSpecies(0);
  if (!sceneState.frame?.species.some(s => s.id === id)) {
    const old = family_modelState.speciesHistory.get(id);
    if (!old || old.born > sceneState.frame.step) {
      text('feedback', t('evolution.dieseArtIstNicht'));
      return;
    }
    deselectSpecies();
    updateLineageState({speciesBranch : id});
    el('species-tree').open = true;
    setView('species');
    text('feedback', t('evolution.historicSpecies', {name : old.name}));
    return;
  }
  sceneState.highlightSick = false;
  updateLineageState({speciesBranch : id});
  updateLineageState({speciesTrail : []});
  evolutionState.selectedSpecies = sceneState.highlightSpecies = id;
  evolutionState.lineageFocus = 0;
  if (!keepView)
    setView('species');
  if (sceneState.frame) {
    renderSpecies(sceneState.frame, true);
    renderDiversity(sceneState.frame);
    updateCockpit(sceneState.frame);
  }
}

export function openSpeciesDetails(id) {
  previewSpecies(0);
  sceneState.highlightSick = false;
  updateLineageState({speciesBranch : id});
  updateLineageState({speciesTrail : []});
  if (evolutionState.lineageFocus !== id) {
    updateLineageState({memberPage : 0});
    evolutionState.individualSignature = '';
    updateLineageState({speciesFamilyFocus : 0});
  }
  el('species-tree').open = true;
  el('species-profile-history').open = true;
  evolutionState.selectedSpecies = sceneState.highlightSpecies = evolutionState.lineageFocus = id;
  setView('species');
  if (sceneState.frame) {
    renderSpecies(sceneState.frame, true);
    updateCockpit(sceneState.frame);
  }
}

export function renderSpecies(f, force = false) {
  const {all, living, extinct, genera} = speciesCensus(f);
  text('living-species-count', living.length);
  el('species-summary').title =
      t('evolution.speciesSummary', {living : living.length, extinct : extinct.length});
  text('species-counts',
       t('evolution.speciesCounts', {living : living.length, genera, extinct : extinct.length}));
  if (!force &&
      (evolutionState.activeView !== 'species' || Date.now() - evolutionState.lastSpecies < 1500))
    return;
  evolutionState.lastSpecies = Date.now();
  if (evolutionState.selectedSpecies && !all.some(s => s.id === evolutionState.selectedSpecies))
    evolutionState.selectedSpecies = evolutionState.lineageFocus = sceneState.highlightSpecies = 0;
  evolutionState.speciesPreviews = [];
  const retained = new Set();
  for (const [id, list] of [[ 'species-living', orderSpeciesCards(living.sort(speciesComparator)) ],
                            [ 'species-extinct', extinct ]]) {
    const cards = [];
    for (const s of list) {
      const key = id + ':' + s.id;
      retained.add(key);
      let item = speciesCards.get(key);
      if (!item) {
        const card = document.createElement('div'), button = document.createElement('button'),
              head = document.createElement('div'), name = document.createElement('span'),
              count = document.createElement('small'), info = document.createElement('div'),
              trace = document.createElement('div'), details = document.createElement('button');
        card.className = 'species-card';
        card.dataset.species = String(s.id);
        card.onpointerenter = e => {
          if (e.pointerType !== 'touch')
            previewSpecies(s.id);
        };
        card.onpointerleave = () => previewSpecies(0);
        card.onfocusin = () => previewSpecies(s.id);
        card.onfocusout = e => {
          if (!card.contains?.(e.relatedTarget))
            previewSpecies(0);
        };
        trace.className = 'species-card-trace';
        head.className = 'species-card-head';
        head.appendChild(name);
        head.appendChild(count);
        button.appendChild(head);
        let portrait = null;
        if (id === 'species-living') {
          portrait = document.createElement('canvas');
          portrait.width = 400;
          portrait.height = 300;
          portrait.className = 'species-specimens';
          button.appendChild(portrait);
        }
        button.appendChild(info);
        button.appendChild(trace);
        button.onclick = () => focusLineage(s.id);
        card.appendChild(button);
        details.className = 'species-details-button';
        details.textContent = t('evolution.detailsAnsehen');
        details.onclick = () => openSpeciesDetails(s.id);
        const actions = document.createElement('div');
        actions.className = 'species-card-actions';
        actions.appendChild(details);
        card.appendChild(actions);
        const pin = document.createElement('button');
        pin.className = 'species-pin';
        pin.onclick = () => {
          if (pinnedSpecies.has(s.id))
            pinnedSpecies.delete(s.id);
          else
            pinnedSpecies.set(s.id, Array.from(el('species-living').children).indexOf(card));
          renderSpecies(sceneState.frame, true);
        };
        actions.appendChild(pin);
        item = {card, button, name, count, info, trace, portrait, pin};
        speciesCards.set(key, item);
      }
      const {card, button, name, count, info, trace, portrait, pin} = item,
                                                               records = recordNames(s.id),
                                                               pinned = pinnedSpecies.has(s.id);
      name.textContent = s.name + (records.length ? ' ' +
                                                        '★'.repeat(Math.min(3, records.length))
                                                  : '');
      name.title = records.join(' · ');
      pin.hidden = !portrait;
      pin.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 3h8l-1 6 4 4v2h-6v6l-1 2-1-2v-6H5v-2l4-4z" fill="' +
          (pinned ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5"/></svg>';
      pin.setAttribute('aria-label',
                       pinned ? t('evolution.karteLoesen') : t('evolution.karteAnheften'));
      pin.title =
          pinned ? t('evolution.karteWiederMitsortieren') : t('evolution.dieseKarteBehaeltIhren');
      pin.setAttribute('aria-pressed', String(pinned));
      card.classList.toggle('pinned', pinned);
      count.textContent = s.alive     ? t('evolution.fishCount', {n : s.adults})
                          : s.gametes ? t('evolution.gameteCount', {n : s.gametes})
                                      : t('evolution.extinctStep', {step : s.extinct_at});
      button.classList.toggle(
          'active', s.id === (evolutionState.previewSpecies || evolutionState.selectedSpecies));
      card.classList.toggle(
          'active', s.id === (evolutionState.previewSpecies || evolutionState.selectedSpecies));
      button.setAttribute('aria-pressed', String(s.id === evolutionState.selectedSpecies));
      button.classList.toggle('extinct', !s.alive);
      if (portrait) {
        const signature = JSON.stringify([
          s.genetic_spread, s.species_distance, s.adults, s.nutrition_per_1000,
          s.replacement_hatches, s.replacement_deaths, s.max_g, s.summary_labels, s.labels,
          s.trait_details
        ]);
        if (signature !== item.infoSignature) {
          item.infoSignature = signature;
          info.replaceChildren();
          appendSpeciesSummary(info, s);
        }
        const traces = JSON.stringify(cockpitState.journalData.traces[String(s.id)] || []);
        if (traces !== item.traceSignature) {
          item.traceSignature = traces;
          trace.replaceChildren();
          drawSpeciesTrace(trace, s);
        }
        evolutionState.speciesPreviews.push({canvas : portrait, species : s.id, ids : []});
      }
      cards.push(card);
    }
    syncChildren(el(id), cards);
  }
  for (const key of speciesCards.keys())
    if (!retained.has(key))
      speciesCards.delete(key);

  const focused = all.find(s => s.id === evolutionState.lineageFocus);
  text('species-detail-title', focused?.name || '');
  el('species-deselect').hidden = !evolutionState.selectedSpecies && !lineageState.speciesBranch;
  el('tree-overview').hidden = !focused;
  el('species-detail').hidden = !focused;
  el('species-members-area').hidden = !focused;
  el('species-overview').hidden = !!focused;
  el('species-extinct-section').hidden = !!focused || !extinct.length;
  renderProfile(
      all.find(s => s.id === (evolutionState.previewSpecies || evolutionState.selectedSpecies)),
      all);
  if (focused && el('species-members').open !== false)
    renderIndividuals(f, focused);
  drawTree(all);
  if (evolutionState.activeView === 'species')
    animateSpecies();
}

export function stableSpecimens(species, group) {
  const alive = new Map(group.filter(p => p[8]).map(p => [p[4], p]));
  let ids = evolutionState.speciesRepresentatives.get(species);
  if (!ids) {
    ids = newestSpecimens(group).map(p => p[4]);
    evolutionState.speciesRepresentatives.set(species, ids);
  } else {
    const used = new Set(ids.filter(id => alive.has(id)));
    for (let i = 0; i < 2; ++i) {
      if (alive.has(ids[i]))
        continue;
      const replacement = newestSpecimens([...alive.values() ].filter(p => !used.has(p[4])))[0];
      ids[i] = replacement?.[4] || 0;
      if (replacement)
        used.add(replacement[4]);
    }
  }
  return ids.map(id => alive.get(id)).filter(Boolean);
}

export function specimenRadius(p) { return 15 * fishRenderRadius(p); }

export function animateSpecies() {
  if (evolutionState.activeView !== 'species' || evolutionState.editing || !sceneState.frame ||
      sceneState.frame.turbo)
    return;
  const paused = sceneState.frame.paused && frameBlend() >= 1,
        key = paused ? sceneState.frameRevision + ':' + sceneState.renderInputRevision + ':' +
                           evolutionState.selectedSpecies
                     : null;
  if (key && animateSpecies.idleKey === key &&
      animateSpecies.items === evolutionState.speciesPreviews)
    return;
  if (animateSpecies.items !== evolutionState.speciesPreviews ||
      animateSpecies.pendingKey !== key) {
    animateSpecies.cursor = 0;
    animateSpecies.items = evolutionState.speciesPreviews;
    animateSpecies.pendingKey = key;
  }
  if (!paused)
    animateSpecies.idleKey = null;
  if (evolutionState.specimenRevision !== sceneState.frameRevision) {
    evolutionState.specimenRevision = sceneState.frameRevision;
    evolutionState.specimenGroups = new Map();
    for (const p of sceneState.frame.fish) {
      if (!evolutionState.specimenGroups.has(p[22]))
        evolutionState.specimenGroups.set(p[22], []);
      evolutionState.specimenGroups.get(p[22]).push(p);
    }
  }
  const blend = frameBlend(), step = displayStep(sceneState.frame, blend),
        items = evolutionState.speciesPreviews, deadline = performance.now() + 3;
  for (let count = 0; count < items.length; count++) {
    const index = animateSpecies.cursor || 0;
    animateSpecies.cursor = (index + 1) % items.length;
    paintSpeciesPreview(items[index], blend, step);
    if (!animateSpecies.cursor && paused) {
      animateSpecies.idleKey = key;
      return;
    }
    if (performance.now() >= deadline)
      return;
  }
}

function paintSpeciesPreview(item, blend, step) {
  const rect = item.canvas.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight)
    return;
  const group = evolutionState.specimenGroups.get(item.species) || [],
        specimens = item.individual ? item.ids.map(id => frameFish(sceneState.frame, id))
                                          .filter(p => p?.[22] === item.species)
                                    : stableSpecimens(item.species, group);
  item.ids = specimens.map(p => p[4]);
  item.hover =
      item.ids.includes(item.canvas.specimenItem?.hover) ? item.canvas.specimenItem.hover : 0;
  item.canvas.specimenItem = item;
  if (!item.canvas.specimenBound) {
    const cv = item.canvas;
    cv.specimenBound = true;
    cv.tabIndex = 0;
    cv.setAttribute('role', 'button');
    cv.style.cursor = 'pointer';
    const hit = e => {
      const r = cv.getBoundingClientRect(), t = (e.clientX - r.left) / r.width;
      const ids = cv.specimenItem.ids;
      return ids[Math.min(ids.length - 1, Math.max(0, Math.floor(t * ids.length)))];
    };
    cv.onpointermove = e => {
      const hover = hit(e);
      if (cv.specimenItem.hover !== hover)
        (updateSceneState({renderInputRevision : sceneState.renderInputRevision + 1}) - 1);
      cv.specimenItem.hover = hover;
      cv.title = t('evolution.zoomFish', {id : cv.specimenItem.hover});
    };
    cv.onpointerleave = () => {
      cv.specimenItem.hover = 0;
      (updateSceneState({renderInputRevision : sceneState.renderInputRevision + 1}) - 1);
    };
    cv.onclick = e => {
      e.stopPropagation();
      zoomToSpecimen(hit(e));
    };
    cv.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        zoomToSpecimen(cv.specimenItem.hover || cv.specimenItem.ids[0]);
      }
    };
  }
  const g = item.canvas.getContext('2d', {willReadFrequently : true}), width = item.canvas.width,
        height = item.canvas.height, poses = specimens.map(raw => {
          const p = blendFish(raw, blend), a = fishAnatomy(p);
          return {p, a, bounds : fishPreviewBounds(a, p[2])};
        }),
        cellWidth = width / Math.max(1, poses.length),
        drawHeight = height - (item.individual ? 6 : 23),
        fit =
            Math.min(1, ...poses.map(({p, bounds}) => Math.min(
                                         (cellWidth - 14) / (specimenRadius(p) * bounds.width),
                                         (drawHeight - 10) / (specimenRadius(p) * bounds.height))));
  g.clearRect(0, 0, width, height);
  for (let i = 0; i < poses.length; i++) {
    const {p, a, bounds} = poses[i], r = specimenRadius(p) * fit;
    g.save();
    g.beginPath();
    g.rect(i * cellWidth + 2, 2, cellWidth - 4, height - 4);
    g.clip();
    if (item.hover === p[4]) {
      g.strokeStyle = '#efd069';
      g.lineWidth = 3;
      g.strokeRect(i * cellWidth + 3, 3, cellWidth - 6, height - 6);
    }
    g.translate((i + .5) * cellWidth - bounds.cx * r, drawHeight / 2 - bounds.cy * r);
    paintFishGlyph(g, p, r, p[2], step, 1, null, false, 1, a);
    g.restore();
    g.font = '12px system-ui';
    g.fillStyle = '#a7bfb8';
    g.textAlign = 'center';
    if (!item.individual)
      g.fillText('#' + p[4] + ' · G' + p[12], (i + .5) * cellWidth, height - 8);
  }
}

export function renderIndividuals(f, s) {
  const sort = el('individual-sort').value || 'generation',
        query = el('individual-search').value.trim().replace(/^#/, ''),
        all = f.fish.filter(p => p[22] === s.id && p[8]),
        members = all.filter(p => !query || String(p[4]).includes(query));
  members.sort(sort === 'offspring' ? (a, b) => b[11] - a[11] || b[4] - a[4]
               : sort === 'nutrition'
                   ? (a, b) =>
                         (b[37] ? b[36] / b[37] : 0) - (a[37] ? a[36] / a[37] : 0) || b[4] - a[4]
               : sort === 'youngest'
                   ? (a, b) => (a[54] ?? f.step - a[40]) - (b[54] ?? f.step - b[40]) || b[4] - a[4]
                   : (a, b) => b[12] - a[12] || b[4] - a[4]);
  const pages = Math.max(1, Math.ceil(members.length / 12));
  updateLineageState({memberPage : Math.max(0, Math.min(lineageState.memberPage, pages - 1))});
  const shown = members.slice(lineageState.memberPage * 12, lineageState.memberPage * 12 + 12),
        byId = frameIndex(f.fish, 4);
  text('species-detail-title', s.name);
  const rename = el('rename-species');
  if (rename)
    rename.onclick = async () => {
      const name = window.prompt(t('evolution.renamePrompt', {name : s.name}), s.name);
      if (name === null || !name.trim())
        return;
      await command('rename-species', {id : s.id, name});
    };
  text('species-detail-count', t('evolution.fishCount', {n : all.length}));
  text('individuals-note', '');
  text('individual-page',
       t('evolution.memberPage', {page : lineageState.memberPage + 1, pages, n : members.length}));
  el('individual-previous').disabled = !lineageState.memberPage;
  el('individual-next').disabled = lineageState.memberPage >= pages - 1;
  const signature = JSON.stringify(
      [ s.id, sort, query, lineageState.memberPage, shown.map(p => [p[4], p[12], p[35], p[15]]) ]);
  if (signature !== evolutionState.individualSignature) {
    evolutionState.individualSignature = signature;
    evolutionState.individualCards = [];
    const box = el('species-individuals');
    box.replaceChildren();
    for (const p of shown) {
      const card = document.createElement('div'), button = document.createElement('button'),
            head = document.createElement('span'), name = document.createElement('strong'),
            age = document.createElement('small'), portrait = document.createElement('canvas'),
            metrics = document.createElement('div'), intake = document.createElement('span'),
            reserve = document.createElement('span'), actions = document.createElement('div');
      card.className = 'individual-card';
      head.className = 'individual-title';
      name.textContent = '#' + p[4];
      head.appendChild(name);
      head.appendChild(age);
      portrait.className = 'individual-portrait';
      portrait.width = 200;
      portrait.height = 150;
      button.appendChild(head);
      button.appendChild(portrait);
      metrics.className = 'individual-metrics';
      metrics.appendChild(intake);
      metrics.appendChild(reserve);
      button.appendChild(metrics);
      button.setAttribute('aria-label', t('evolution.viewFish', {id : p[4]}));
      button.onclick = () => selectFish(p[4]);
      card.appendChild(button);
      actions.className = 'individual-actions';
      actions.appendChild(lineageButton(t('evolution.familie'), () => showIndividualFamily(p[4]),
                                        t('evolution.familyOf', {id : p[4]})));
      card.appendChild(actions);
      box.appendChild(card);
      evolutionState.individualCards.push({id : p[4], canvas : portrait, age, intake, reserve});
    }
    if (!shown.length)
      box.appendChild(lineageElement('p', 'caption',
                                     query ? t('evolution.keinePassendeFischkennung')
                                           : t('evolution.zurzeitKeineGeschluepftenFische')));
  }
  for (const item of evolutionState.individualCards) {
    const p = byId.get(item.id);
    item.age.textContent = t('evolution.generation', {n : p[12]});
    item.age.title = t('evolution.abstammungsgenerationEinschliesslichDerVorlagen');
    item.intake.textContent =
        t('evolution.intakeRate', {n : formatNumber(p[37] ? 100 * p[36] / p[37] : 0, 1, true)});
    item.reserve.textContent = t('evolution.offspring', {n : p[11]});
    evolutionState.speciesPreviews.push(
        {canvas : item.canvas, species : s.id, ids : [ item.id ], individual : true});
  }
  const family = el('species-family');
  if (lineageState.speciesFamilyFocus)
    renderIndividualFamily(family, f, lineageState.speciesFamilyFocus);
  else
    family.replaceChildren(lineageElement('p', 'caption', t('evolution.beiEinemFischAuf')));
}

export function drawBodyOverview(canvas, body = {}, comparison = null,
                                 labels = [ t('evolution.individuum'), t('evolution.spezies') ]) {
  const signature = JSON.stringify([ body, comparison, labels ]);
  if (canvas.bodySignature === signature)
    return;
  canvas.bodySignature = signature;
  // Backing store follows the displayed size and device pixel ratio; drawing stays in 360 × 302.
  const g = chartContext(canvas, () => {
    canvas.bodySignature = '';
    drawBodyOverview(canvas, body, comparison, labels);
  }), width = 360;
  g.clearRect(0, 0, width, 302);
  g.font = '11px system-ui';
  g.textAlign = 'left';
  g.fillStyle = '#a2d9c6';
  g.fillRect(3, 7, 12, 5);
  g.fillText(labels[0], 21, 13);
  if (comparison) {
    g.globalAlpha = .45;
    g.fillRect(181, 7, 12, 5);
    g.globalAlpha = 1;
    g.fillText(labels[1], 199, 13);
  }
  const tips = [], traits = [
    [ 'jaw_length', t('evolution.kiefer') ], [ 'gut_length', t('evolution.darm') ],
    [ 'blunt_teeth', t('evolution.zaehne') ], [ 'undulation', t('evolution.schlaengeln') ]
  ];
  traits.forEach(([ key, name ], i) => {
    const value = body[key], other = comparison?.[key], v = Math.max(0, Math.min(1, value || 0)),
          x = i * 90 + 4;
    g.fillStyle = '#16323b';
    g.fillRect(x, 24, 84, 94);
    g.save();
    g.translate(x + 42, 51);
    g.strokeStyle = '#a2d9c6';
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    if (i === 0) {
      g.moveTo(-22, -11);
      g.lineTo(10 + 14 * v, -5 - 6 * v);
      g.moveTo(-22, 11);
      g.lineTo(10 + 14 * v, 5 + 6 * v);
    }
    if (i === 1) {
      g.moveTo(-26, -11);
      for (let j = 0; j < 5; j++) {
        const xx = -26 + j * 12;
        g.bezierCurveTo(xx, -11 - (8 + 10 * v), xx + 12, 11 + (8 + 10 * v), xx + 12,
                        11 * (j % 2 ? 1 : -1));
      }
    }
    if (i === 2) {
      g.moveTo(-26, -11);
      g.lineTo(26, -11);
      for (let j = 0; j < 5; j++) {
        const xx = -24 + j * 10;
        g.moveTo(xx, -11);
        g.quadraticCurveTo(xx + 5, 22 - 12 * v, xx + 9, -11);
      }
    }
    if (i === 3) {
      g.moveTo(-28, 0);
      for (let j = 0; j <= 28; j++) {
        const xx = -28 + j * 2;
        g.lineTo(xx, Math.sin(xx * .14) * (2 + 14 * v));
      }
    }
    g.stroke();
    g.restore();
    g.fillStyle = '#c9dcdb';
    g.textAlign = 'center';
    g.fillText(name, x + 42, 84);
    g.fillStyle = '#29454d';
    g.fillRect(x + 6, 94, 72, 5);
    g.fillStyle = '#a2d9c6';
    if (Number.isFinite(value))
      g.fillRect(x + 6, 94, 72 * v, 5);
    if (Number.isFinite(other)) {
      g.globalAlpha = .45;
      g.fillRect(x + 6, 102, 72 * Math.max(0, Math.min(1, other)), 4);
      g.globalAlpha = 1;
    }
    const detail =
        name + ': ' +
        (Number.isFinite(value) ? t('units.percent', {n : Math.round(100 * value)})
                                : t('evolution.unknown')) +
        (Number.isFinite(other) ? ' / ' + t('units.percent', {n : Math.round(100 * other)}) : '');
    tips.push(detail);
  });
  const names = [
    t('evolution.sehen'), t('evolution.riechen'), t('evolution.seitenlinie'),
    t('evolution.beruehrung'), t('evolution.naehe'), t('evolution.aufnahme'),
    t('evolution.schaden'), t('evolution.wasserdruck'), t('evolution.gonadendruck'),
    t('evolution.innendruck'), t('evolution.blut')
  ];
  const maximum = Math.max(1, ...(body.senses || []), ...(comparison?.senses || []));
  names.forEach((name, k) => {
    const col = k < 6 ? 0 : 1, row = k % 6, x = col * 180 + 4, y = 133 + row * 25,
          a = body.senses?.[k], b = comparison?.senses?.[k];
    g.textAlign = 'left';
    g.fillStyle = '#c9dcdb';
    g.fillText(name, x, y);
    g.textAlign = 'right';
    g.fillStyle = brainSenseColors[k];
    g.fillText(Number.isFinite(a)
                   ? organNumber(a) + (Number.isFinite(b) ? ' / ' + organNumber(b) : '')
                   : '–',
               x + 166, y);
    g.fillStyle = '#29454d';
    g.fillRect(x, y + 5, 166, 4);
    g.fillStyle = brainSenseColors[k];
    g.fillRect(x, y + 5, 166 * (a || 0) / maximum, 4);
    if (Number.isFinite(b)) {
      g.globalAlpha = .45;
      g.fillRect(x, y + 11, 166 * b / maximum, 3);
      g.globalAlpha = 1;
    }
    const count = Number.isFinite(a) ? organNumber(a) : t('evolution.unknown');
    tips.push(t('evolution.senseCells', {
      name,
      count : Number.isFinite(b) ? t('units.ratio', {a : count, b : organNumber(b)}) : count
    }));
  });
  g.textAlign = 'left';
  g.fillStyle = '#8fa8ad';
  g.fillText(t('evolution.sinneZellzahlenGemeinsamerMassstab'), 4, 296);
  canvas.title = labels.join(' / ') + '\n' + tips.join('\n');
  canvas.setAttribute('aria-label', canvas.title);
}

export function drawBodyProfile(canvas, overall, living = null, samples = 0) {
  const g = canvas.getContext('2d'), rows = [], names = tList('evolution.senseNames');
  for (let k = 0; k < names.length; k++)
    rows.push({
      name : names[k],
      a : overall.senses?.[k] || 0,
      b : living?.senses?.[k] || 0,
      color : brainSenseColors[k],
      note : t('evolution.senseThreshold', {
        lifetime : organNumber(overall.thresholds?.[k] || 0),
        living : organNumber(living?.thresholds?.[k] || 0)
      })
    });
  for (let k = 0; k < 3; ++k)
    rows.push({
      name : [
        t('evolution.darmfuellung'), t('evolution.eifuellung'), t('evolution.spermienfuellung')
      ][k],
      a : overall.fillings?.[k] || 0,
      b : living?.fillings?.[k] || 0,
      color : brainSenseColors[8],
      note : t('evolution.druckzellenAmZugeordnetenOrgan')
    });
  for (const [key, name, unit,
              factor] of [[ 'radius', t('evolution.koerperradius'), 'units.px', 1 ],
                          [ 'mass', t('evolution.masse'), 'units.plain', 1 ],
                          [ 'aperture', t('evolution.maulbreite'), 'units.px', 2 ],
                          [ 'mouth', t('evolution.saugkraft'), 'units.plain', 1 ],
                          [ 'bite', t('evolution.bisskraft'), 'units.plain', 1 ],
                          [ 'jaw_length', t('evolution.kieferlaenge'), 'units.percent', 100 ],
                          [ 'gut_length', t('evolution.darmlaenge'), 'units.percent', 100 ],
                          [ 'blunt_teeth', t('evolution.stumpfeZaehne'), 'units.percent', 100 ],
                          [ 'undulation', t('evolution.schlaengeln'), 'units.percent', 100 ],
                          [ 'propulsion', t('evolution.vortrieb'), 'units.plain', 1 ],
                          [ 'armor', t('evolution.abwehr'), 'units.plain', 1 ],
                          [ 'internal', t('evolution.innenzellen'), 'units.plain', 1 ],
                          [ 'egg_organs', t('evolution.eiOrgan'), 'units.percent', 100 ],
                          [ 'sperm_organs', t('evolution.spermienorgan'), 'units.percent', 100 ],
                          [ 'hermaphrodites', t('evolution.beideOrgane'), 'units.percent', 100 ]])
    rows.push({
      name,
      a : (overall[key] || 0) * factor,
      b : (living?.[key] || 0) * factor,
      unit,
      color : '#a2d9c6'
    });
  canvas.height = 36 + rows.length * 24;
  g.clearRect(0, 0, 360, canvas.height);
  g.font = '11px system-ui';
  g.fillStyle = '#a2d9c6';
  g.fillRect(4, 8, 14, 4);
  g.fillText(t('evolution.gesamt'), 24, 14);
  g.globalAlpha = .55;
  g.fillRect(110, 8, 14, 4);
  g.globalAlpha = 1;
  g.fillText(t('evolution.lebend'), 130, 14);
  const tips = [];
  rows.forEach((row, i) => {
    const y = 38 + i * 24, max = Math.max(row.a, row.b, 1e-9), w = 100;
    g.fillStyle = '#bad0d3';
    g.textAlign = 'left';
    g.fillText(row.name, 4, y);
    g.fillStyle = '#2b424a';
    g.fillRect(126, y - 10, w, 12);
    g.fillStyle = row.color;
    g.fillRect(126, y - 10, w * row.a / max, 5);
    if (living) {
      g.globalAlpha = .55;
      g.fillRect(126, y - 3, w * row.b / max, 5);
      g.globalAlpha = 1;
    }
    g.textAlign = 'right';
    g.fillStyle = '#e0e9e6';
    g.fillText(
        t('units.ratio',
          {a : organNumber(row.a), b : t(row.unit || 'units.plain', {n : organNumber(row.b)})}),
        354, y);
    tips.push(t('evolution.rowLifetime', {
                name : row.name,
                lifetime : t(row.unit || 'units.plain', {n : organNumber(row.a)}),
                living : t(row.unit || 'units.plain', {n : organNumber(row.b)})
              }) +
              (row.note ? '\n' + row.note : ''));
  });
  const note = t('evolution.gesamtZeitgewichteterMittelwertAlle');
  canvas.title = note;
  canvas.setAttribute('aria-label', note + ' ' + tips.join('; '));
  canvas.onpointermove = e => {
    const b = canvas.getBoundingClientRect(),
          i = Math.floor(((e.clientY - b.top) * canvas.height / b.height - 25) / 24);
    canvas.title = (tips[i] || note) +
                   (samples ? '\n' + t('evolution.observations', {n : formatNumber(samples)}) : '');
  };
}

export function updateEvolutionState(patch) {
  Object.assign(evolutionState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "featureNames" : () => { featureNames = tList('evolution.featureNames'); },
  "speciesCards" : () => { speciesCards = new Map(); },
  "pinnedSpecies" : () => { pinnedSpecies = new Map(); },
  "lineageFocus" : () => { evolutionState.lineageFocus = 0; },
  "speciesPreviews" : () => { evolutionState.speciesPreviews = []; },
  "individualCards" : () => { evolutionState.individualCards = []; },
  "individualSignature" : () => { evolutionState.individualSignature = ''; },
  "specimenRevision" : () => { evolutionState.specimenRevision = -1; },
  "specimenGroups" : () => { evolutionState.specimenGroups = new Map(); },
  "speciesRepresentatives" : () => { evolutionState.speciesRepresentatives = new Map(); },
  "activeView" : () => { evolutionState.activeView = 'evolution'; },
  "editing" : () => { evolutionState.editing = false; },
  "selectedSpecies" : () => { evolutionState.selectedSpecies = 0; },
  "lastSpecies" : () => { evolutionState.lastSpecies = 0; },
  "el" : () => {
    el('fish-overview').onclick = () => showFishPart('fish');
    el('tab-organs').onclick = () => showFishPart('organs');
    el('tab-brain').onclick = () => showFishPart('network');
    for (const v of ['evolution', 'species', 'fish', 'events'])
      el('tab-' + v).onclick = () => setView(v);
  },
  "species_summary_onclick" : () => {
    el('species-summary').onclick = () => {
      deselectSpecies();
      setView('species');
    };
  },
  "tree_overview_onclick" : () => {
    el('tree-overview').onclick = () => {
      evolutionState.lineageFocus = 0;
      evolutionState.individualSignature = '';
      if (sceneState.frame)
        renderSpecies(sceneState.frame, true);
    };
  },
  "individual_sort_onchange" : () => {
    el('individual-sort').onchange = el('individual-search').oninput = () => {
      updateLineageState({memberPage : 0});
      if (sceneState.frame) {
        const s = frameSpecies(sceneState.frame, evolutionState.lineageFocus);
        if (s)
          renderSpecies(sceneState.frame, true);
      }
    };
  },
  "individual_previous_onclick" : () => {
    el('individual-previous').onclick = () => {
      (updateLineageState({memberPage : lineageState.memberPage - 1}) + 1);
      if (sceneState.frame)
        renderSpecies(sceneState.frame, true);
    };
  },
  "individual_next_onclick" : () => {
    el('individual-next').onclick = () => {
      (updateLineageState({memberPage : lineageState.memberPage + 1}) - 1);
      if (sceneState.frame)
        renderSpecies(sceneState.frame, true);
    };
  },
  "species_tree_ontoggle" : () => {
    el('species-tree').ontoggle = () => {
      if (sceneState.frame)
        drawTree(sceneState.frame.species || []);
    };
  },
  "species_members_ontoggle" : () => {
    el('species-members').ontoggle = () => {
      if (sceneState.frame && el('species-members').open) {
        const s = frameSpecies(sceneState.frame, evolutionState.lineageFocus);
        if (s)
          renderSpecies(sceneState.frame, true);
      }
    };
  },
  "species_family_details_ontoggle" : () => {
    el('species-family-details').ontoggle = () => {
      if (sceneState.frame && lineageState.speciesFamilyFocus)
        renderIndividualFamily(el('species-family'), sceneState.frame,
                               lineageState.speciesFamilyFocus);
      redrawFamilies();
    };
  },
  "fish_family_details_ontoggle" :
      () => { el('fish-family-details').ontoggle = () => redrawFamilies(); },
  "species_deselect_onclick" : () => { el('species-deselect').onclick = deselectSpecies; },
  "species_sort_onchange" : () => {
    el('species-sort').onchange = () => sceneState.frame && renderSpecies(sceneState.frame, true);
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
