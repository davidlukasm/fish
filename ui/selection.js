import {ecologyFor} from './nutrition_model.js';
import {fishOrigin, fishProfile} from './fish_profile.js';
import {fishActivity} from './activity_model.js';
import {renderActivity} from './activity_view.js';
import {renderBodyOverview} from './body_view.js';
import {fishLabel, fishName, fishNamesLoaded, fishTitle, refreshFishNames} from './fish_names.js';
import {renderRevivable, showRevival, showShield} from './fish_life.js';
import {renderThoughtList} from './thought_view.js';
import {t, tList, formatNumber} from './strings.js';
import {beginEggPlacement} from './world.js';
import {command} from './session.js';
import {displayFaults} from './diagnostics.js';
import {chartContext, chartSize, syncChildren} from './dom.js';
import {updateFeedingViewState} from './feeding_view.js';
import {FISH, CORPSE, ANATOMY} from './schema.js';
import {showBrain} from './brain.js';
import {cameraState, fishSightPixels, setFollowing, zoomToFish} from './camera.js';
import {el, text} from './dom.js';
import {evolutionState, focusLineage} from './evolution.js';
import {
  deathBadge,
  deathNames,
  feeding_viewState,
  fishGauge,
  fishStat,
  renderFeeding
} from './feeding_view.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph, corpseFish} from './fish_painter.js';
import {tankPanelFrame} from './hover.js';
import {renderIndividualFamily} from './lineage.js';
import {
  blendFish,
  displayStep,
  frameBlend,
  frameFish,
  frameCorpse,
  frameSpecies,
  sceneState
} from './state.js';
export const selectionState = {};

function fishRelatives(f, p) { renderIndividualFamily(el('fish-family'), f, p[FISH.id]); }

function showLifeStage(index) {
  const stages = el('life-stages');
  stages.hidden = index < 0;
  for (let i = 0; i < stages.children.length; ++i)
    stages.children[i].classList.toggle('current', i === index);
  text('tab-fish', index === 0   ? t('selection.tabEgg')
                   : index === 2 ? t('selection.tabCorpse')
                                 : t('selection.tabFish'));
}

// Living fish as cards (portrait, name, species, age, reserve); sorted by symbol buttons.
// Sort keys of the fish list: value and whether larger values come first.
const FISH_SORTS = {
  energy : [ p => p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]), -1 ],
  health : [ p => p[FISH.health], -1 ],
  intake : [ p => p[FISH.nutrition_steps] ? p[FISH.nutrition] / p[FISH.nutrition_steps] : 0, -1 ],
  offspring : [ p => p[FISH.offspring] || 0, -1 ],
  generation : [ p => p[FISH.depth] || 0, -1 ],
  age : [ p => p[FISH.adult_age] || 0, -1 ],
  size : [ p => p[FISH.tissue] || 0, -1 ],
  species : [ p => (frameSpecies(sceneState.frame, p[FISH.species])?.name || '\uffff'), 1 ],
  name : [ p => (fishName(p[FISH.id]) || '\uffff') + String(p[FISH.id]).padStart(10, '0'), 1 ]
};

// A fish card follows the species cards: name and generation, a large portrait, the species,
// key figures and the reserve and health bars.
function fishListCard(id) {
  const card = document.createElement('div'), button = document.createElement('button'),
        head = document.createElement('div'), name = document.createElement('span'),
        generation = document.createElement('small'), portrait = document.createElement('canvas'),
        species = document.createElement('small'), figures = document.createElement('div'),
        bars = document.createElement('div');
  card.className = 'species-card fish-card';
  button.type = 'button';
  head.className = 'species-card-head';
  head.append(name, generation);
  portrait.width = 400;
  portrait.height = 150;
  portrait.className = 'species-specimens fish-card-portrait';
  species.className = 'fish-card-species';
  figures.className = 'fish-card-figures';
  bars.className = 'fish-card-bars';
  const bar = kind => {
    const row = document.createElement('span'), label = document.createElement('small'),
          track = document.createElement('i'), fill = document.createElement('b');
    track.className = kind;
    track.append(fill);
    row.append(label, track);
    bars.append(row);
    return {fill, label};
  };
  const reserve = bar('fish-card-reserve'), health = bar('fish-card-health');
  button.append(head, portrait, species, figures, bars);
  button.onclick = () => zoomToFish(id, fishSightPixels());
  card.append(button);
  return {card, portrait, name, generation, species, figures, reserve, health, painted : 0};
}

function paintFishCard(item, p) {
  const rect = item.portrait.getBoundingClientRect?.();
  if (!rect || rect.bottom < 0 || rect.top > (window.innerHeight || 0) || !rect.width)
    return;
  const now = Date.now();
  if (item.painted && now - item.painted < 4000)
    return;
  item.painted = now;
  const g = chartContext(item.portrait, () => {
    item.painted = 0;
    paintFishCard(item, p);
  });
  const size = chartSize(item.portrait);
  g.clearRect(0, 0, size.width, size.height);
  displayFaults.run(t('selection.faultFishCard'), () => {
    const fit = fishPreviewPose(p, size.width, size.height, 4.2 * fishRenderRadius(p));
    g.save();
    try {
      g.translate(fit.x, fit.y);
      paintFishGlyph(g, p, fit.r, 0, 0, 1, null, false, 1, fit.a);
    } finally {
      g.restore();
    }
  });
}

function renderFishList(f, force = false) {
  const now = Date.now();
  if (!force && now - (selectionState.fishListTime || 0) < 400)
    return;
  selectionState.fishListTime = now;
  selectionState.fishCards ??= new Map();
  // The list shows living fish or the eggs still developing (nutrient eggs never hatch).
  const eggs = selectionState.listStage === 'eggs',
        key = FISH_SORTS[el('fish-sort')?.value] ? el('fish-sort').value : 'energy',
        [ value, direction ] = FISH_SORTS[key],
        fish =
            f.fish.filter(p => eggs ? !p[FISH.hatched] && !p[FISH.nutrient_egg] : p[FISH.hatched]);
  el('list-fish').setAttribute('aria-pressed', String(!eggs));
  el('list-eggs').setAttribute('aria-pressed', String(eggs));
  // Favourites lead the list; the chosen order applies within both parts.
  const favorites = favoriteFish();
  fish.sort((a, b) => {
    const x = value(a), y = value(b);
    return favorites.has(b[FISH.id]) - favorites.has(a[FISH.id]) ||
           (x < y   ? -1
            : x > y ? 1
                    : 0) *
               direction ||
           a[FISH.id] - b[FISH.id];
  });
  text('fish-list-count', t('selection.listCount', {n : fish.length}));
  const cards = [], alive = new Set();
  for (const p of fish) {
    const id = p[FISH.id];
    alive.add(id);
    let item = selectionState.fishCards.get(id);
    if (!item)
      selectionState.fishCards.set(id, item = fishListCard(id));
    // Eggs placed without a mother belong to no species yet.
    const lineage = eggs ? p[FISH.maternal_species] || p[FISH.species] : p[FISH.species],
          species = frameSpecies(f, lineage),
          reserve =
              eggs ? p[FISH.development] : p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]),
          intake = p[FISH.nutrition_steps] ? 100 * p[FISH.nutrition] / p[FISH.nutrition_steps] : 0;
    item.name.textContent = eggs ? t('selection.eggTitle', {id}) : fishLabel(id);
    item.generation.textContent =
        t('selection.cardGeneration',
          {generation : p[FISH.depth] || 0, age : formatNumber(p[FISH.adult_age] || 0)});
    item.species.textContent =
        species?.name || (lineage ? t('selection.speciesNumber', {id : lineage}) : '');
    // An egg's development shows in its bar; its figures are what it carries.
    const figures =
              eggs ? [
                [ t('selection.eggFigureEnergy'), formatNumber(p[FISH.energy] || 0, 1) ],
                [ t('selection.groesse'), formatNumber(p[FISH.tissue] || 0) ]
              ] : [
                [ t('selection.junge'), String(p[FISH.offspring] || 0) ],
                [ t('selection.aufnahme'), formatNumber(intake, 1) ],
                [ t('selection.groesse'), formatNumber(p[FISH.tissue] || 0) ]
              ],
          signature = JSON.stringify(figures);
    if (item.figuresSignature !== signature) {
      item.figuresSignature = signature;
      item.figures.replaceChildren(...figures.map(([ label, number ]) => {
        const cell = document.createElement('span'), small = document.createElement('small'),
              strong = document.createElement('strong');
        small.textContent = label;
        strong.textContent = number;
        cell.append(small, strong);
        return cell;
      }));
    }
    item.reserve.label.textContent = eggs ? t('selection.entwicklung') : t('selection.reserve');
    item.health.label.textContent = t('selection.gesundheit');
    item.reserve.fill.style.width = Math.round(100 * Math.max(0, Math.min(1, reserve))) + '%';
    item.health.fill.style.width = Math.round(100 * Math.max(0, Math.min(1, p[FISH.health]))) + '%';
    item.card.classList.toggle('sick', p[FISH.disease] > 0);
    item.card.classList.toggle('active', id === f.selected);
    item.card.title = eggs ? t('selection.eggCardTitle', {egg : t('selection.eggTitle', {id})})
                           : t('selection.cardTitle', {fish : fishTitle(id)});
    cards.push(item.card);
  }
  for (const id of selectionState.fishCards.keys())
    if (!alive.has(id))
      selectionState.fishCards.delete(id);
  syncChildren(el('fish-list'), cards);
  // Portraits are painted once the cards are laid out, and only where they are visible.
  for (const p of fish)
    paintFishCard(selectionState.fishCards.get(p[FISH.id]), p);
}

function favoriteFish() {
  if (!selectionState.favorites) {
    let ids = [];
    try {
      ids = JSON.parse(localStorage.getItem('fish-favorite-ids') || '[]');
    } catch (error) {
    }
    selectionState.favorites = new Set(Array.isArray(ids) ? ids : []);
  }
  return selectionState.favorites;
}

function showRemains(f, c, preview) {
  const id = c[CORPSE.source_id], species = frameSpecies(f, c[CORPSE.species]);
  const title = c[CORPSE.hatched] ? t('selection.corpseTitle', {fish : fishTitle(id)})
                                  : t('selection.deadEggTitle', {id});
  text('fish-title', preview ? t('selection.previewTitle', {title}) : title);
  el('selection-body').hidden = true;
  el('selection-empty').hidden = true;
  el('deselect').hidden = preview;
  showLifeStage(2);
  if (!preview)
    setFollowing(false);
  showRevival(el('remains-revive'), preview ? null : f, id);
  // Cause, decay stage and nutrient left; the species is the link below.
  const stage = c[CORPSE.energy] <= 0 ? 2
                : c[CORPSE.resting]   ? 1
                                      : 0,
        stages = document.createElement('div');
  stages.className = 'remains-stages';
  tList('selection.decayStages').forEach((name, i) => {
    const step = document.createElement('span');
    step.textContent = name;
    step.className = i === stage ? 'is-now' : i < stage ? 'is-past' : '';
    stages.append(step);
  });
  stages.title =
      stage === 2
          ? t('selection.skeleton',
              {n : formatNumber(Math.max(0, (c[CORPSE.bone_time] || 1000) - c[CORPSE.bone_age]))})
          : t('selection.deadSince', {n : formatNumber(c[CORPSE.age])});
  el('remains-facts').replaceChildren(deathBadge(c[CORPSE.death_cause]), stages);
  const share = c[CORPSE.energy] / Math.max(.001, c[CORPSE.initial_energy]);
  el('remains-energy').value = share;
  text('remains-energy-value',
       t('units.ratio',
         {a : formatNumber(c[CORPSE.energy], 1), b : formatNumber(c[CORPSE.initial_energy], 1)}));
  text('remains-species', species?.name || t('selection.speciesNumber', {id : c[CORPSE.species]}));
  el('remains-species').onclick = () => focusLineage(c[CORPSE.species]);
  el('remains-species').disabled = !species;
  el('remains-genome').href = '/genome?id=' + id;
  el('remains-genome').hidden = f.selected_genome_available === false;
  const canvas = el('remains-portrait'), g = chartContext(canvas, () => showRemains(f, c, preview)),
        size = chartSize(canvas);
  g.clearRect(0, 0, size.width, size.height);
  const painted = displayFaults.run(t('selection.faultCorpsePortrait'), () => {
    const p = corpseFish(c);
    if (!p)
      return false;
    const fit = fishPreviewPose(p, size.width, size.height, 60);
    g.save();
    try {
      g.translate(fit.x, fit.y);
      paintFishGlyph(g, p, fit.r, 0, 0, 1, null, false, 1, fit.a);
    } finally {
      g.restore();
    }
  });
  if (!painted) {
    g.fillStyle = '#a99270';
    g.beginPath();
    g.ellipse(size.width / 2, size.height / 2, 25, 32, 0, 0, 2 * Math.PI);
    g.fill();
  }
}

// The fish's name or number, or which egg it still is.
function livingTitle(p) {
  return p[FISH.hatched]
             ? fishTitle(p[FISH.id])
             : t(p[FISH.nutrient_egg] ? 'selection.nutrientEggTitle' : 'selection.eggTitle',
                 {id : p[FISH.id]});
}

export function showSelection(f) {
  const original = f;
  if (typeof tankPanelFrame === 'function')
    f = tankPanelFrame(f);
  const preview = f !== original;
  const corpse = frameCorpse(f);
  el('remains-body').hidden = !corpse;
  el('fish-list-area').hidden = true;
  if (corpse) {
    showRemains(f, corpse, preview);
    return;
  }
  const liveP = frameFish(f);
  if (liveP && !preview)
    updateFeedingViewState({
      lastSelectedProfile : {
        p : liveP,
        brain : f.brain,
        species : frameSpecies(f, liveP[FISH.species]),
        trait : f.traits?.find(t => t.id === liveP[FISH.id])
      }
    });
  const dead = !liveP && feeding_viewState.lastSelectedProfile &&
               f.selected_death?.id === feeding_viewState.lastSelectedProfile.p[FISH.id];
  const p = liveP || (dead ? feeding_viewState.lastSelectedProfile.p : null);
  renderThoughtList(el('fish-thoughts'), p?.[FISH.id], {limit : 3});
  el('selection-body').hidden = !p;
  el('fish-list-area').hidden = !!p;
  el('selection-empty').hidden = !!p || f.fish.some(q => q[FISH.hatched]);
  el('deselect').hidden = !p || preview;
  if (!p) {
    renderFishList(f);
    renderRevivable(el('revivable-fish'), f);
  }
  if (!fishNamesLoaded())
    refreshFishNames().then(() => sceneState.frame && showSelection(sceneState.frame));
  if (p) {
    const title = livingTitle(p);
    text('fish-title', preview ? t('selection.previewTitle', {title}) : title);
  } else
    text('fish-title', t('selection.fische'));
  const rename = el('rename-fish');
  if (rename) {
    rename.hidden = !p || !p[FISH.hatched] || preview;
    if (p)
      rename.onclick = async () => {
        const id = p[FISH.id],
              name =
                  window.prompt(t('selection.renamePrompt', {fish : fishTitle(id)}), fishName(id));
        if (name === null)
          return;
        if (await command('rename-fish', {id, name})) {
          await refreshFishNames();
          if (sceneState.frame)
            showSelection(sceneState.frame);
        }
      };
  }
  showLifeStage(p ? (p[FISH.hatched] ? 1 : 0) : -1);
  if (!p) {
    setFollowing(false);
    return;
  }
  const intent = cameraState.followIntent;
  if (intent?.id === p[FISH.id] && !preview && !cameraState.following &&
      performance.now() < intent.until)
    setFollowing(true);
  for (const id of ['fish-intake', 'fish-feeding-details', 'fish-trait-words', 'brain-section',
                    'novelty-detail', 'fish-body-details', 'fish-activity-details'])
    el(id).hidden = !p[FISH.hatched];
  (updateFeedingViewState({fishStatEpoch : feeding_viewState.fishStatEpoch + 1}));
  const species =
            frameSpecies(f, p[FISH.species]) || feeding_viewState.lastSelectedProfile?.species,
        b = f.brain || (dead ? feeding_viewState.lastSelectedProfile.brain : null),
        intake = p[FISH.nutrition], steps = p[FISH.nutrition_steps];
  if (p[FISH.hatched]) {
    const body = f.selected_body || {
      ...Object.fromEntries([ 'jaw_length', 'gut_length', 'blunt_teeth', 'undulation' ].map(
          key => [key, b?.[key] ?? p[FISH.organs]?.[ANATOMY[key]]])),
      radius : p[FISH.radius],
      mass : p[FISH.mass],
      aperture : p[FISH.mouth_aperture]
    };
    renderBodyOverview(el('fish-body-overview'), body,
                       species?.body_samples ? species.lifetime_body : species?.body_profile);
    if (!preview && !dead)
      renderActivity(el('fish-activity'), fishActivity(p, f.step, performance.now()),
                     performance.now());
  }
  const maternal = frameSpecies(f, p[FISH.maternal_species]);
  text('fish-species',
       species            ? t('selection.speciesLink', {name : species.name})
       : !p[FISH.hatched] ? t('selection.eggOf', {
           species : maternal?.name || t('selection.speciesNumber', {id : p[FISH.maternal_species]})
         })
                          : t('selection.speciesFallback', {id : p[FISH.species]}));
  el('fish-species').onclick = () => focusLineage(p[FISH.species] || p[FISH.maternal_species]);
  const trait = f.traits?.find(t => t.id === p[FISH.id]) ||
                (dead ? feeding_viewState.lastSelectedProfile?.trait : null);
  renderFeeding(el('fish-feeding'), trait?.diet || [], steps, ecologyFor(trait));
  text('fish-nutrition', steps ? formatNumber(100 * intake / steps, 1) : '–');
  text('fish-nutrition-rate', t('selection.energie100Schritte'));
  el('fish-nutrition').title = t('selection.nutritionTitle', {n : formatNumber(intake)});
  const state = p[FISH.nutrient_egg] ? t('selection.naehreiKeineEntwicklung')
                : p[FISH.clonal]     ? t('selection.klonaleEntwicklung')
                : p[FISH.fertilised] ? t('selection.befruchtet')
                                     : t('selection.wartetAufBefruchtung');
  text('fish-info', p[FISH.hatched] ? t('selection.fishInfo', {
         origin : fishOrigin(p),
         offspring : p[FISH.offspring],
         generation : p[FISH.generation]
       })
                                    : t('selection.eggInfo', {state, origin : fishOrigin(p)}));
  const profile = fishProfile(p, b);
  for (const {key, label, value, note} of profile.stats)
    fishStat(key, label, value, note);
  for (const {key, value, color} of profile.gauges)
    fishGauge(key, value, color);
  for (const cell of feeding_viewState.fishStatCells.values())
    cell.box.hidden = cell.epoch !== feeding_viewState.fishStatEpoch;
  el('genome').href = '/genome?id=' + p[FISH.id];
  el('follow').disabled = !p[FISH.hatched];
  fishRelatives(f, p);
  if (evolutionState.activeView === 'fish' && !evolutionState.editing)
    showBrain(dead ? {...f, brain : b} : f);
  el('follow').disabled = dead || !p[FISH.hatched];
  el('genome').hidden = f.selected_genome_available === false;
  el('favorite-fish').hidden = preview || dead || !p[FISH.hatched];
  el('fish-release-sperm').hidden = preview || dead || !p[FISH.hatched];
  el('fish-release-sperm').disabled = !!f.historical;
  el('fish-release-sperm').onclick = () => command('release-sperm', {value : p[FISH.id]});
  showShield(el('fish-immortal'), f, preview || dead ? null : p);
  showRevival(el('fish-revive'), dead && !preview ? f : null, p[FISH.id]);
  // A kept favourite shows a golden star; the set lives in this browser.
  const favorites = favoriteFish(), favorite = favorites.has(p[FISH.id]);
  el('favorite-fish').setAttribute('aria-pressed', String(favorite));
  el('favorite-fish').title =
      favorite ? t('selection.alsFavoritGespeichert') : t('selection.alsFavoritBehalten');
  el('favorite-fish').onclick = async () => {
    if (await command('favorite-fish', {id : p[FISH.id]}) === false)
      return;
    favorites.add(p[FISH.id]);
    try {
      localStorage.setItem('fish-favorite-ids', JSON.stringify([...favorites ].slice(-500)));
    } catch (error) {
    }
    el('favorite-fish').setAttribute('aria-pressed', 'true');
  };
  if (preview) {
    el('follow').title = t('selection.fischVerfolgen');
    el('follow').setAttribute('aria-pressed', 'false');
  } else {
    el('follow').title =
        cameraState.following ? t('selection.folgenBeenden') : t('selection.folgen');
    el('follow').setAttribute('aria-pressed', String(cameraState.following));
  }
  el('fish-place-eggs').onclick = () => beginEggPlacement(p[FISH.id]);
  el('fish-place-eggs').disabled = !!f.historical;
  el('genome').title =
      dead ? t('selection.genomAusZuchtbankOder') : t('selection.genomDiesesTiersSpeichern');
  if (dead) {
    text('fish-title', t('selection.deadTitle', {title : livingTitle(p)}));
    text('fish-info', deathNames[f.selected_death.cause] || t('selection.gestorben'));
  }
}

export function animateSelectedFish() {
  if (evolutionState.activeView !== 'fish' || evolutionState.editing || !sceneState.frame ||
      sceneState.frame.turbo)
    return;
  const shown =
      typeof tankPanelFrame === 'function' ? tankPanelFrame(sceneState.frame) : sceneState.frame;
  if (sceneState.frame.paused && frameBlend() >= 1) {
    const key =
        sceneState.frameRevision + ':' + sceneState.renderInputRevision + ':' + shown.selected;
    if (animateSelectedFish.idleKey === key)
      return;
    animateSelectedFish.idleKey = key;
  } else
    animateSelectedFish.idleKey = null;
  const p = frameFish(shown);
  if (!p)
    return;
  const c = el('fish-portrait'),
        g = chartContext(c, () => {
          animateSelectedFish.idleKey = null;
          animateSelectedFish();
        }), blend = frameBlend(), step = displayStep(sceneState.frame, blend);
  g.fillStyle = "#405057";
  g.fillRect(0, 0, chartSize(c).width, chartSize(c).height);
  g.save();
  if (!p[FISH.hatched]) {
    const size = chartSize(c);
    g.fillStyle = '#d9bd77';
    g.beginPath();
    g.ellipse(size.width / 2, size.height / 2, 28, 35, 0, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = '#91bdad';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(size.width / 2, size.height / 2, 43, -Math.PI / 2,
          -Math.PI / 2 + 2 * Math.PI * p[FISH.development]);
    g.stroke();
    g.restore();
    return;
  }
  const poseFish = blendFish(p, blend),
        fit = fishPreviewPose(poseFish, chartSize(c).width, chartSize(c).height,
                              7.5 * fishRenderRadius(p));
  g.translate(fit.x, fit.y);
  paintFishGlyph(g, poseFish, fit.r, 0, step, 1, null, false, 1, fit.a);
  g.restore();
}

// Which list the fish tab shows without a chosen fish: living fish or developing eggs.
export function setFishListStage(stage) {
  selectionState.listStage = stage;
  if (sceneState.frame)
    renderFishList(sceneState.frame, true);
}

const initializers = {
  "listStage" : () => { selectionState.listStage = 'fish'; },
  "fish_sort_onchange" : () => {
    el('fish-sort').onchange = () => sceneState.frame && renderFishList(sceneState.frame, true);
  },
  "list_stage_onclick" : () => {
    el('list-fish').onclick = () => setFishListStage('fish');
    el('list-eggs').onclick = () => setFishListStage('eggs');
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
