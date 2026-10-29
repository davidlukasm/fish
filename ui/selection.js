import {beginEggPlacement} from './world.js';
import {command} from './session.js';
import {displayFaults} from './diagnostics.js';
import {chartContext, chartSize, syncChildren} from './dom.js';
import {updateFeedingViewState} from './feeding_view.js';
import {FISH, CORPSE, ANATOMY} from './schema.js';
import {fishGutCapacity} from './fish_forms.js';
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
  displayNumber,
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
  text('tab-fish', index === 0 ? 'Ei' : index === 2 ? 'Kadaver' : 'Fisch');
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
  const reserve = bar('Reserve', 'fish-card-reserve'),
        health = bar('Gesundheit', 'fish-card-health');
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
  displayFaults.run('Fischkarte', () => {
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
  text('fish-list-count', '· ' + fish.length);
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
    item.name.textContent = fishName(id) || '#' + id;
    item.generation.textContent =
        'G' + (p[FISH.depth] || 0) + ' · ◷ ' + displayNumber(p[FISH.adult_age] || 0);
    item.species.textContent = species?.name || 'Art #' + p[FISH.species];
    const figures =
              [
                [ 'Nachkommen', String(p[FISH.offspring] || 0) ],
                [ 'Aufnahme', displayNumber(intake, 1) ],
                [ 'Größe', displayNumber(p[FISH.tissue] || 0) ]
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
    item.card.title = 'Fisch #' + id + ' · Aufnahme je 100 Schritte · Größe = Gewebe';
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
  text('fish-title',
       (c[CORPSE.hatched] ? 'Kadaver #' : 'Totes Ei #') + id + (preview ? ' · Vorschau' : ''));
  el('selection-body').hidden = true;
  el('selection-empty').hidden = true;
  el('deselect').hidden = preview;
  showLifeStage(2);
  if (!preview)
    setFollowing(false);
  const box = el('remains-stats');
  box.replaceChildren();
  for (const [label,
              value] of [[ 'Art', species?.name || 'Art #' + c[CORPSE.species] ],
                         [
                           'Energie', displayNumber(c[CORPSE.energy], 1) + ' / ' +
                                          displayNumber(c[CORPSE.initial_energy], 1)
                         ],
                         [ 'Seit dem Tod', displayNumber(c[CORPSE.age]) + ' Schritte' ],
                         [ 'Zustand', c[CORPSE.energy] <= 0 ? 'Skelett · noch ' + displayNumber(Math.max(0,(c[CORPSE.bone_time] || 1000) - c[CORPSE.bone_age])) + ' Schritte' : c[CORPSE.resting] ? 'Liegt · wird zersetzt' : 'Sinkt oder treibt' ],
                         [ 'Todesursache', deathNames[c[CORPSE.death_cause]] || 'Gestorben' ]]) {
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
  const painted = displayFaults.run('Kadaverbild', () => {
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
  el('selection-body').hidden = !p;
  el('fish-list-area').hidden = !!p;
  el('selection-empty').hidden = !!p || f.fish.some(q => q[FISH.hatched]);
  el('deselect').hidden = !p || preview;
  if (!p)
    renderFishList(f);
  if (!selectionState.fishNames)
    refreshFishNames().then(() => sceneState.frame && showSelection(sceneState.frame));
  const given = p && p[FISH.hatched] ? fishName(p[FISH.id]) : '';
  text('fish-title', p ? (given                  ? given + ' · #'
                          : p[FISH.hatched]      ? 'Fisch #'
                          : p[FISH.nutrient_egg] ? 'Nährei #'
                                                 : 'Ei #') +
                             p[FISH.id] + (preview ? ' · Vorschau' : '')
                       : 'Fische');
  const rename = el('rename-fish');
  if (rename) {
    rename.hidden = !p || !p[FISH.hatched] || preview;
    if (p)
      rename.onclick = async () => {
        const id = p[FISH.id],
              name = window.prompt('Name für Fisch #' + id + ' (leer lassen entfernt ihn):',
                                   fishName(id));
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
  text('fish-body-title', p[FISH.hatched] ? 'Körper und Aktivität' : 'Ei und Eltern');
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
  text('fish-species', species ? species.name + ' →'
                       : !p[FISH.hatched]
                           ? 'Ei von ' + (maternal?.name || 'Art #' + p[FISH.maternal_species])
                           : 'Spezies #' + p[FISH.species]);
  el('fish-species').onclick = () => focusLineage(p[FISH.species] || p[FISH.maternal_species]);
  const trait = f.traits?.find(t => t.id === p[FISH.id]) ||
                (dead ? feeding_viewState.lastSelectedProfile?.trait : null);
  renderFeeding(el('fish-feeding'), trait?.diet || [], steps, ecologyFor(trait));
  text('fish-nutrition', steps ? displayNumber(100 * intake / steps, 1) : '–');
  text('fish-nutrition-rate', 'Energie / 100 Schritte');
  el('fish-nutrition').title = displayNumber(intake) + ' Energie seit dem Schlupf aufgenommen.';
  const state = p[FISH.nutrient_egg] ? 'Nährei · keine Entwicklung'
                : p[FISH.clonal]     ? 'Klonale Entwicklung'
                : p[FISH.fertilised] ? 'Befruchtet'
                                     : 'Wartet auf Befruchtung';
  text('fish-info',
       p[FISH.hatched]
           ? `${p[FISH.offspring]} Nachkommen · hilfsfreie Generation ${p[FISH.generation]}`
           : `${state}`);
  fishStat(
      'origin', 'Herkunft',
      [ 'Gründer', 'Natürliche Fortpflanzung', 'Bestandshilfe', 'Einwanderung' ][p[FISH.origin]] ||
          'Unbekannt',
      'Herkunft dieses Individuums.');
  if (p[FISH.hatched] && p[FISH.disease] > 0)
    fishStat('disease', 'Krank', p[FISH.disease] + ' Schritte übrig',
             'Restliche Krankheitsdauer; pro Schritt sinkt die Gesundheit.', 'vitals');
  fishStat('reserve', p[FISH.hatched] ? 'Energiereserve' : 'Eigelb',
           displayNumber(p[FISH.energy]) +
               (p[FISH.hatched] ? ' / ' + displayNumber(p[FISH.reserve_capacity]) : ''),
           p[FISH.hatched] ? 'Energie im Körper; Obergrenze wächst mit dem Gewebe.'
                           : 'Verbleibender Dotter für Entwicklung und Schlupf.',
           'vitals');
  fishStat('age', p[FISH.hatched] ? 'Alter seit Schlupf' : 'Entwicklung',
           p[FISH.hatched] ? displayNumber(p[FISH.adult_age]) + ' Schritte'
                           : Math.round(p[FISH.development] * 100) + ' %',
           '', 'vitals');
  fishStat('health', 'Gesundheit', Math.round(p[FISH.health] * 100) + ' %', '', 'vitals');
  fishStat(
      'size', 'Körpergröße',
      displayNumber(p[FISH.radius], 1) + ' px · ' + displayNumber(p[FISH.mass], 2) + ' Masse',
      'Radius für Sehen und Begegnungen; Masse aus Gewebe, Vorräten, Darmfüllung und Organen.');
  if (p[FISH.hatched] && b?.tissue !== undefined)
    fishStat(
        'growth', 'Gewebe', displayNumber(b.tissue, 1),
        'Endgewebe aus der Organmasse; die Gewebemenge skaliert Darmvolumen, Vorräte und Fortpflanzung.');
  if (p[FISH.hatched]) {
    for (const [key, name, note] of [
             [
               'jaw_length', 'Kieferlänge',
               'Kurz: kräftiges Abschaben und Beißen. Lang: große Öffnung.'
             ],
             [
               'gut_length', 'Darmlänge',
               'Pflanzliche Verdaulichkeit ist das Quadrat der Darmlänge.'
             ],
             [
               'blunt_teeth', 'Stumpfe Zähne',
               'Stumpf knackt Schalen und Halme; spitz reißt Weiches und packt Würmer.'
             ],
             [
               'undulation', 'Schlängeln',
               'Senkt den Sedimentwiderstand; kostet Schub im freien Wasser.'
             ]]) {
      const value = b?.[key] ?? p[FISH.organs]?.[ANATOMY[key]];
      fishStat(key, name, Number.isFinite(value) ? Math.round(100 * value) + ' %' : '–', note);
      fishGauge(key, value || 0, '#8bbfb5');
    }
    fishStat('gut-energy', 'Darmenergie', displayNumber(b?.gut_energy ?? p[FISH.gut_energy], 1),
             'Rohe geschluckte Energie, einschließlich unverdaulichem Anteil.');
    fishStat('digestion', 'Verdauung',
             displayNumber(b?.digestion ?? p[FISH.digestion], 3) + ' / Schritt',
             'Verdaute Energie vor 12 % Verdauungsverbrauch.');
    fishStat('digested', 'Tatsächlich verdaut', displayNumber(b?.digested ?? p[FISH.digested], 1),
             'Seit dem Schlupf verdaut, vor 12 % Verdauungsverbrauch.');
    fishStat('raw-intake', 'Rohe Aufnahme',
             displayNumber((trait?.raw_diet || []).reduce((sum, v) => sum + v, 0), 1),
             'Geschluckte Energie vor Berücksichtigung der Verdaulichkeit.');
  }
  if (p[FISH.hatched])
    fishStat('speed', 'Schwimmtempo', displayNumber(p[FISH.relative_speed], 2),
             'Schwimmtempo relativ zum Wasser, in Pixeln pro Schritt');
  if (!p[FISH.hatched] && Number.isFinite(b?.hatch_reserve))
    fishStat(
        'hatch-reserve', 'Reserve nach Schlupf', displayNumber(b.hatch_reserve, 1) + ' Energie',
        'Schätzung nach restlichem Aufbau und Zielgewebe; zusätzlich muss die Suchreserve erhalten bleiben. Wartezeit und weitere Aktivität kosten Energie.',
        'vitals');

  if (p[FISH.hatched])
    fishStat('muscle-tension', 'Vortriebsschlag', displayNumber(p[FISH.impulse_forward], 3),
             'Stärke des letzten Vortriebsereignisses; null während des Gleitens.');
  if (p[FISH.hatched])
    fishStat(
        'muscle-rise', 'Drehschlag links / rechts',
        displayNumber(p[FISH.impulse_left], 3) + ' / ' + displayNumber(p[FISH.impulse_right], 3),
        'Seitenimpulse des letzten Drehereignisses; die Differenz ihrer Quadrate bestimmt die Drehung.');
  if (p[FISH.hatched])
    fishStat(
        'mouth', 'Wassertransport',
        Math.round((b?.pump_flow ?? p[FISH.suction_pose] ?? 0) * 100) + ' %',
        'Anhaltende Saugaktivierung. Aufnahme verbraucht das gemeinsame Transportbudget und freien Darmplatz.');
  if (p[FISH.hatched])
    fishStat(
        'aggression', 'Schließkraft',
        Math.round((b?.bite_signal ?? p[FISH.aggression] ?? 0) * 100) + ' %',
        'Kapazitätsgewichtete Beißaktivierung. Je Schließbewegung gibt es höchstens einen Bissversuch.');
  if (p[FISH.hatched] && Number.isFinite(p[FISH.mouth_aperture]))
    fishStat(
        'aperture', 'Maulbreite',
        displayNumber(2 * p[FISH.mouth_aperture] * (p[FISH.mouth_pose] || 0), 1) + ' / ' +
            displayNumber(2 * p[FISH.mouth_aperture], 1) + ' px',
        'Öffnung aus der Kieferlänge; passende Beute kann ganz geschluckt werden. Aufgestellte Stacheln vergrößern ihren wirksamen Radius.');
  if (p[FISH.hatched])
    fishStat('defense', 'Abwehr', Math.round(p[FISH.defense] * 100) + ' %',
             'Aktuelle Muskelaktivität, in Prozent');
  if (p[FISH.hatched])
    fishGauge('reserve', p[FISH.energy] / Math.max(1, p[FISH.reserve_capacity]), '#d3bb72');
  if (!p[FISH.hatched])
    fishGauge('age', p[FISH.development], '#a6ce85');
  fishGauge('health', p[FISH.health],
            p[FISH.health] > .65  ? '#8cc4ac'
            : p[FISH.health] > .3 ? '#d3bb72'
                                  : '#d89787');
  const rows = [
    [ 'Gehirn', b?.maintenance, 'Energieverbrauch des Gehirns pro 100 Schritte.', 100 ],
    [
      'Körper', b?.movement_cost,
      'Energieverbrauch von Körper und Muskeln pro 100 Schritte, einschließlich Maul und Abwehr.',
      100
    ]
  ];
  for (const [key, value, note, factor] of rows)
    fishStat(key, key,
             displayNumber(value === undefined ? undefined : value * factor, 2) + ' Energie / 100',
             note, 'brain');
  fishStat('novelty', 'Neuheit', displayNumber(b?.novelty, 3),
           'Mittelwert der Abstände zu bis zu ' + (f.parameters?.novelty_neighbors || 15) +
               ' benachbarten Profilen aus Bestand und Umweltarchiv',
           'novelty');
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
  el('favorite-fish').title = favorite ? 'Als Favorit gespeichert' : 'Als Favorit behalten';
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
    el('follow').title = 'Fisch verfolgen';
    el('follow').setAttribute('aria-pressed', 'false');
  } else {
    el('follow').title = cameraState.following ? 'Folgen beenden' : 'Folgen';
    el('follow').setAttribute('aria-pressed', String(cameraState.following));
  }
  el('fish-place-eggs').onclick = () => beginEggPlacement(p[FISH.id]);
  el('fish-place-eggs').disabled = !!f.historical;
  el('genome').title = dead
                           ? 'Genom aus Zuchtbank oder Puffer der letzten 256 Todesfälle speichern.'
                           : 'Genom dieses Tiers speichern.';
  if (dead) {
    text('fish-title', (p[FISH.hatched]        ? 'Fisch #'
                        : p[FISH.nutrient_egg] ? 'Nährei #'
                                               : 'Ei #') +
                           p[FISH.id] + ' · gestorben');
    text('fish-info', deathNames[f.selected_death.cause] || 'Gestorben');
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
