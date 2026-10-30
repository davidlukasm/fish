import {renderThoughtList} from './thought_view.js';
import {t, formatNumber} from './strings.js';
import {beginEggPlacement} from './world.js';
import {command} from './session.js';
import {displayFaults} from './diagnostics.js';
import {chartContext, chartSize, syncChildren} from './dom.js';
import {updateFeedingViewState} from './feeding_view.js';
import {FISH, CORPSE, ANATOMY} from './schema.js';
import {showBrain} from './brain.js';
import {cameraState, setFollowing} from './camera.js';
import {el, text} from './dom.js';
import {
  evolutionState,
  focusLineage,
  drawBodyOverview,
  zoomToFish,
  fishSightPixels
} from './evolution.js';
import {
  deathNames,
  ecologyFor,
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

// Names the user gave to single fish; kept by the viewer next to the run.
export function fishName(id) { return selectionState.fishNames?.[String(id)] || ''; }
export async function refreshFishNames() {
  selectionState.fishNames ??= {};
  try {
    const r = await fetch('/names');
    if (r.ok)
      selectionState.fishNames = (await r.json()).fish || {};
  } catch {
  }
}

export function fishRelatives(f, p) { renderIndividualFamily(el('fish-family'), f, p[FISH.id]); }

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
  card.className = t('selection.speciesCardFishCard');
  button.type = 'button';
  head.className = 'species-card-head';
  head.append(name, generation);
  portrait.width = 400;
  portrait.height = 150;
  portrait.className = t('selection.speciesSpecimensFishCard');
  species.className = 'fish-card-species';
  figures.className = 'fish-card-figures';
  bars.className = 'fish-card-bars';
  const bar = (label, kind) => {
    const row = document.createElement('span'), text = document.createElement('small'),
          track = document.createElement('i'), fill = document.createElement('b');
    text.textContent = label;
    track.className = kind;
    track.append(fill);
    row.append(text, track);
    bars.append(row);
    return fill;
  };
  const reserve = bar(t('selection.reserve'), 'fish-card-reserve'),
        health = bar(t('selection.gesundheit'), 'fish-card-health');
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

export function renderFishList(f, force = false) {
  const now = Date.now();
  if (!force && now - (selectionState.fishListTime || 0) < 400)
    return;
  selectionState.fishListTime = now;
  selectionState.fishCards ??= new Map();
  const key = FISH_SORTS[el('fish-sort')?.value] ? el('fish-sort').value : 'energy',
        [ value, direction ] = FISH_SORTS[key], fish = f.fish.filter(p => p[FISH.hatched]);
  fish.sort((a, b) => {
    const x = value(a), y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * direction || a[FISH.id] - b[FISH.id];
  });
  text('fish-list-count', t('selection.listCount', {n : fish.length}));
  const cards = [], alive = new Set();
  for (const p of fish) {
    const id = p[FISH.id];
    alive.add(id);
    let item = selectionState.fishCards.get(id);
    if (!item)
      selectionState.fishCards.set(id, item = fishListCard(id));
    const species = frameSpecies(f, p[FISH.species]),
          reserve = p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]),
          intake = p[FISH.nutrition_steps] ? 100 * p[FISH.nutrition] / p[FISH.nutrition_steps] : 0;
    item.name.textContent = fishName(id) || t('selection.fishNumber', {id});
    item.generation.textContent =
        t('selection.cardGeneration',
          {generation : p[FISH.depth] || 0, age : formatNumber(p[FISH.adult_age] || 0)});
    item.species.textContent =
        species?.name || t('selection.speciesNumber', {id : p[FISH.species]});
    const figures =
              [
                [ t('selection.nachkommen'), String(p[FISH.offspring] || 0) ],
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
    item.reserve.style.width = Math.round(100 * Math.max(0, Math.min(1, reserve))) + '%';
    item.health.style.width = Math.round(100 * Math.max(0, Math.min(1, p[FISH.health]))) + '%';
    item.card.classList.toggle('sick', p[FISH.disease] > 0);
    item.card.classList.toggle('active', id === f.selected);
    item.card.title = t('selection.cardTitle', {id});
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
  const title = t(c[CORPSE.hatched] ? 'selection.corpseTitle' : 'selection.deadEggTitle', {id});
  text('fish-title', preview ? t('selection.previewTitle', {title}) : title);
  el('selection-body').hidden = true;
  el('selection-empty').hidden = true;
  el('deselect').hidden = preview;
  showLifeStage(2);
  if (!preview)
    setFollowing(false);
  const box = el('remains-stats');
  box.replaceChildren();
  const skeletonSteps =
      formatNumber(Math.max(0, (c[CORPSE.bone_time] || 1000) - c[CORPSE.bone_age]));
  for (const [label, value] of [[
         t('selection.art'), species?.name || t('selection.speciesNumber', {id : c[CORPSE.species]})
       ],
                                [
                                  t('selection.energie'), t('units.ratio', {
                                    a : formatNumber(c[CORPSE.energy], 1),
                                    b : formatNumber(c[CORPSE.initial_energy], 1)
                                  })
                                ],
                                [
                                  t('selection.seitDemTod'),
                                  t('units.steps', {n : formatNumber(c[CORPSE.age])})
                                ],
                                [
                                  t('selection.zustand'),
                                  c[CORPSE.energy] <= 0
                                      ? t('selection.skeleton', {n : skeletonSteps})
                                  : c[CORPSE.resting] ? t('selection.liegtWirdZersetzt')
                                                      : t('selection.sinktOderTreibt')
                                ],
                                [
                                  t('selection.todesursache'),
                                  deathNames[c[CORPSE.death_cause]] || t('selection.gestorben')
                                ]]) {
    const row = document.createElement('div'), name = document.createElement('small'),
          number = document.createElement('strong');
    name.textContent = label;
    number.textContent = value;
    row.append(name, number);
    box.append(row);
  }
  el('remains-energy').value = c[CORPSE.energy] / Math.max(.001, c[CORPSE.initial_energy]);
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

// t('selection.fisch12'), t('selection.naehrei12') or "Ei #12".
function livingTitle(p) {
  return t(p[FISH.hatched]        ? 'selection.fishTitle'
           : p[FISH.nutrient_egg] ? 'selection.nutrientEggTitle'
                                  : 'selection.eggTitle',
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
        species : frameSpecies(f, liveP[22]),
        trait : f.traits?.find(t => t.id === liveP[4])
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
  if (!p)
    renderFishList(f);
  if (!selectionState.fishNames)
    refreshFishNames().then(() => sceneState.frame && showSelection(sceneState.frame));
  const given = p && p[FISH.hatched] ? fishName(p[FISH.id]) : '';
  if (p) {
    const title =
        given ? t('selection.namedTitle', {name : given, id : p[FISH.id]}) : livingTitle(p);
    text('fish-title', preview ? t('selection.previewTitle', {title}) : title);
  } else
    text('fish-title', t('selection.fische'));
  const rename = el('rename-fish');
  if (rename) {
    rename.hidden = !p || !p[FISH.hatched] || preview;
    if (p)
      rename.onclick = async () => {
        const id = p[FISH.id],
              name = window.prompt(t('selection.renamePrompt', {id}), fishName(id));
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
  const intent = evolutionState.followIntent;
  if (intent?.id === p[FISH.id] && !preview && !cameraState.following &&
      performance.now() < intent.until)
    setFollowing(true);
  for (const id of ['fish-intake', 'fish-feeding-details', 'fish-trait-words', 'brain-section',
                    'novelty-detail', 'fish-body-details'])
    el(id).hidden = !p[FISH.hatched];
  text('fish-body-title',
       p[FISH.hatched] ? t('selection.koerperUndAktivitaet') : t('selection.eiUndEltern'));
  (updateFeedingViewState({fishStatEpoch : feeding_viewState.fishStatEpoch + 1}));
  const species =
            frameSpecies(f, p[FISH.species]) || feeding_viewState.lastSelectedProfile?.species,
        b = f.brain || (dead ? feeding_viewState.lastSelectedProfile.brain : null),
        intake = p[FISH.nutrition], steps = p[FISH.nutrition_steps];
  if (p[FISH.hatched]) {
    const body = f.selected_body ||
                 Object.fromEntries([ 'jaw_length', 'gut_length', 'blunt_teeth', 'undulation' ].map(
                     key => [key, b?.[key] ?? p[FISH.organs]?.[ANATOMY[key]]]));
    drawBodyOverview(el('fish-body-overview'), body,
                     species?.body_samples ? species.lifetime_body : species?.body_profile);
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
  text('fish-info', p[FISH.hatched]
                        ? t('selection.fishInfo',
                            {offspring : p[FISH.offspring], generation : p[FISH.generation]})
                        : `${state}`);
  fishStat('origin', t('selection.herkunft'),
           [
             t('selection.gruender'), t('selection.natuerlicheFortpflanzung'),
             t('selection.bestandshilfe'), t('selection.einwanderung')
           ][p[FISH.origin]] ||
               t('selection.unbekannt'),
           t('selection.herkunftDiesesIndividuums'));
  if (p[FISH.hatched] && p[FISH.disease] > 0)
    fishStat('disease', t('selection.krank'), t('selection.diseaseLeft', {n : p[FISH.disease]}),
             t('selection.restlicheKrankheitsdauerProSchritt'), 'vitals');
  fishStat('reserve', p[FISH.hatched] ? t('selection.energiereserve') : t('selection.eigelb'),
           p[FISH.hatched]
               ? t('units.ratio',
                   {a : formatNumber(p[FISH.energy]), b : formatNumber(p[FISH.reserve_capacity])})
               : formatNumber(p[FISH.energy]),
           p[FISH.hatched] ? t('selection.energieImKoerperObergrenze')
                           : t('selection.verbleibenderDotterFuerEntwicklung'),
           'vitals');
  fishStat('age', p[FISH.hatched] ? t('selection.alterSeitSchlupf') : t('selection.entwicklung'),
           p[FISH.hatched] ? t('units.steps', {n : formatNumber(p[FISH.adult_age])})
                           : t('units.percent', {n : Math.round(p[FISH.development] * 100)}),
           '', 'vitals');
  fishStat('health', t('selection.gesundheit'),
           t('units.percent', {n : Math.round(p[FISH.health] * 100)}), '', 'vitals');
  fishStat('size', t('selection.koerpergroesse'),
           t('selection.sizeValue',
             {radius : formatNumber(p[FISH.radius], 1), mass : formatNumber(p[FISH.mass], 2)}),
           t('selection.radiusFuerSehenUnd'));
  if (p[FISH.hatched] && b?.tissue !== undefined)
    fishStat('growth', t('selection.gewebe'), formatNumber(b.tissue, 1),
             t('selection.endgewebeAusDerOrganmasse'));
  if (p[FISH.hatched]) {
    for (const [key, name, note] of [
             [
               'jaw_length', t('selection.kieferlaenge'), t('selection.kurzKraeftigesAbschabenUnd')
             ],
             [
               'gut_length', t('selection.darmlaenge'),
               t('selection.pflanzlicheVerdaulichkeitIstDas')
             ],
             [ 'blunt_teeth', t('selection.stumpfeZaehne'), t('selection.stumpfKnacktSchalenUnd') ],
             [
               'undulation', t('selection.schlaengeln'),
               t('selection.senktDenSedimentwiderstandKostet')
             ]]) {
      const value = b?.[key] ?? p[FISH.organs]?.[ANATOMY[key]];
      fishStat(key, name,
               Number.isFinite(value) ? t('units.percent', {n : Math.round(100 * value)}) : '–',
               note);
      fishGauge(key, value || 0, '#8bbfb5');
    }
    fishStat('gut-energy', t('selection.darmenergie'),
             formatNumber(b?.gut_energy ?? p[FISH.gut_energy], 1),
             t('selection.roheGeschluckteEnergieEinschliesslich'));
    fishStat('digestion', t('selection.verdauung'),
             t('units.perStep', {n : formatNumber(b?.digestion ?? p[FISH.digestion], 3)}),
             t('selection.verdauteEnergieVor12'));
    fishStat('digested', t('selection.tatsaechlichVerdaut'),
             formatNumber(b?.digested ?? p[FISH.digested], 1),
             t('selection.seitDemSchlupfVerdaut'));
    fishStat('raw-intake', t('selection.roheAufnahme'),
             formatNumber((trait?.raw_diet || []).reduce((sum, v) => sum + v, 0), 1),
             t('selection.geschluckteEnergieVorBeruecksichtigung'));
  }
  if (p[FISH.hatched])
    fishStat('speed', t('selection.schwimmtempo'), formatNumber(p[FISH.relative_speed], 2),
             t('selection.schwimmtempoRelativZumWasser'));
  if (!p[FISH.hatched] && Number.isFinite(b?.hatch_reserve))
    fishStat('hatch-reserve', t('selection.reserveNachSchlupf'),
             t('units.energy', {n : formatNumber(b.hatch_reserve, 1)}),
             t('selection.schaetzungNachRestlichemAufbau'), 'vitals');

  if (p[FISH.hatched])
    fishStat('muscle-tension', t('selection.vortriebsschlag'),
             formatNumber(p[FISH.impulse_forward], 3),
             t('selection.staerkeDesLetztenVortriebsereignisses'));
  if (p[FISH.hatched])
    fishStat(
        'muscle-rise', t('selection.drehschlagLinksRechts'),
        t('units.ratio',
          {a : formatNumber(p[FISH.impulse_left], 3), b : formatNumber(p[FISH.impulse_right], 3)}),
        t('selection.seitenimpulseDesLetztenDrehereignisses'));
  if (p[FISH.hatched])
    fishStat(
        'mouth', t('selection.wassertransport'),
        t('units.percent', {n : Math.round((b?.pump_flow ?? p[FISH.suction_pose] ?? 0) * 100)}),
        t('selection.anhaltendeSaugaktivierungAufnahmeVerbraucht'));
  if (p[FISH.hatched])
    fishStat(
        'aggression', t('selection.schliesskraft'),
        t('units.percent', {n : Math.round((b?.bite_signal ?? p[FISH.aggression] ?? 0) * 100)}),
        t('selection.kapazitaetsgewichteteBeissaktivierungJeSchliessbewegung'));
  if (p[FISH.hatched] && Number.isFinite(p[FISH.mouth_aperture]))
    fishStat('aperture', t('selection.maulbreite'), t('units.pxOf', {
               n : formatNumber(2 * p[FISH.mouth_aperture] * (p[FISH.mouth_pose] || 0), 1),
               of : formatNumber(2 * p[FISH.mouth_aperture], 1)
             }),
             t('selection.oeffnungAusDerKieferlaenge'));
  if (p[FISH.hatched])
    fishStat('defense', t('selection.abwehr'),
             t('units.percent', {n : Math.round(p[FISH.defense] * 100)}),
             t('selection.aktuelleMuskelaktivitaetInProzent'));
  if (p[FISH.hatched])
    fishGauge('reserve', p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]), '#d3bb72');
  if (!p[FISH.hatched])
    fishGauge('age', p[FISH.development], '#a6ce85');
  fishGauge('health', p[FISH.health],
            p[FISH.health] > .65  ? '#8cc4ac'
            : p[FISH.health] > .3 ? '#d3bb72'
                                  : '#d89787');
  const rows = [
    [ t('selection.gehirn'), b?.maintenance, t('selection.energieverbrauchDesGehirnsPro'), 100 ],
    [ t('selection.koerper'), b?.movement_cost, t('selection.energieverbrauchVonKoerperUnd'), 100 ]
  ];
  for (const [key, value, note, factor] of rows)
    fishStat(key, key,
             t('selection.costPer100',
               {n : formatNumber(value === undefined ? undefined : value * factor, 2)}),
             note, 'brain');
  fishStat('novelty', t('selection.neuheit'), formatNumber(b?.novelty, 3),
           t('selection.noveltyNote', {n : f.parameters?.novelty_neighbors || 15}), 'novelty');
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

const initializers = {
  "fish_sort_onchange" : () => {
    el('fish-sort').onchange = () => sceneState.frame && renderFishList(sceneState.frame, true);
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
