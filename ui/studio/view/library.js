import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {EFFECT_ICON, PHASE_ICON, TEACH_ICON, TOOL_ICON} from './icons.js';
import {centerMarker} from './scene.js';
import {EFFECT_ORDER} from './effects.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {MODULES, NEURON_BY_KEY, NEURONS, ORGAN_BY_KEY, ORGANS} from '../model/organs.js';
import {escapeText, glyph} from './markup.js';
import {namedText, tList} from '../../strings.js';
import {heading, icon, ICON, label, regionTerm} from './kit.js';
import {substanceName} from './substances.js';
import {tone} from './names.js';

// The library beside the scene: organs, modules and substances to drag onto the fish, and the
// tool palette.
function paletteItem(kind, name, type, key, title = name) {
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="' + type +
         '" data-drag-value="' + escapeText(key) + '" title="' + escapeText(title) + '">' +
         '<span class="aid-palette-icon" style="--organ-color:' + tone(kind) + '">' + icon(kind) +
         '</span><span>' + escapeText(name) + '</span></button>';
}
// A nerve cell to drag onto the fish, with its marker as on the fish (MARKER wide in a box of
// BOX) and on hover what it does.
const CELL_MARK = Object.freeze({marker : 7, box : 10});
function cellTile(key) {
  const B = CELL_MARK.box, name = label('centers.' + key);
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="neuron" ' +
         'data-drag-value="' + key + '" title="' +
         escapeText(namedText(name, label('neuronPurpose.' + key))) +
         '"><span class="aid-palette-icon" style="--organ-color:' + tone('brain') +
         ';color:' + tone('brain') + '"><svg viewBox="' + -B + ' ' + -B + ' ' + 2 * B + ' ' +
         2 * B + '" aria-hidden="true">' +
         centerMarker({role : 'nerve', key, ...NEURON_BY_KEY[key]}, CELL_MARK.marker) +
         '</svg></span><span>' + escapeText(name) + '</span></button>';
}
export function library(state) {
  const categories = [ 'senses', 'regions', 'internal', 'motor', 'reproduction' ];
  let html = '<div class="aid-library-intro">' + heading(label('app.parts')) + '</div>';
  for (const category of categories) {
    html +=
        '<section class="aid-library-section"><h4>' + label('sections.' + category) +
        '</h4><div class="aid-palette-grid">' +
        ORGANS.filter(o => o.category === category)
            .map(o => o.category === 'regions'
                          ? paletteItem(o.key, regionTerm(o.key), 'organ', o.key,
                                        namedText(label('organs.' + o.key).replace(/\u00ad/g, ''),
                                                  label('regions.' + o.key + '.purpose')))
                          : paletteItem(o.key, label('organs.' + o.key), 'organ', o.key))
            .join('') +
        '</div></section>';
  }
  html +=
      '<section class="aid-library-section"><h4>' + label('sections.nerves') +
      '</h4><div class="aid-palette-grid">' + NEURONS.map(n => cellTile(n.key)).join('') +
      '</div></section><section class="aid-library-section"><h4>' + label('sections.modules') +
      '</h4><div class="aid-palette-grid">' +
      // A built-in module shows its brain region and says on hover what it does.
      MODULES
          .map(m => paletteItem(
                   m.organs.find(type => ORGAN_BY_KEY[type].category === 'regions') ?? m.organs[0],
                   label('modules.' + m.key), 'module', m.key,
                   namedText(label('modules.' + m.key), label('modulePurpose.' + m.key))))
          .join('') +
      (state.userModules ?? [])
          .map(m => paletteItem(m.organs[0]?.type ?? 'brain', m.name, 'user-module', m.id))
          .join('') +
      '</div><p class="aid-hint">' + label('inspector.moduleHow') + '</p></section>';
  return html;
}
// The hormone tool's library: a card for each substance, the chosen one open, and one for the
// body's own signals. A card names its substance in place and shows where it comes from (its
// glands, a gland to drag onto the fish), what it can do as tiles to drag onto organs and nodes,
// which of them it acts on, whether the fish grows with it (one substance at most: the fish
// mark sits on one card) and, as a test, a dose to measure its effect with. The body's signals
// are not substances: maturity can switch cells on or let them die, the energy reserve can be
// read by a blood sense.

// A tile to drag onto the fish: a symbol and a word, its title saying what it does.
function hormoneTile(kind, value, text, path, title = text) {
  return '<button class="aid-hormone-tile" draggable="true" data-drag-kind="' + kind +
         '" data-drag-value="' + escapeText(value) + '" title="' + escapeText(title) + '">' +
         glyph(path, ICON.mark, {line : true}) + '<span>' + escapeText(text) + '</span></button>';
}
// A substance's card: its colour and name (a click shows it in the inspector) and what can be
// dragged from it onto the fish: a gland that releases it and each of its effects.
function substanceCard(state, substance) {
  const index = substance.index, open = state.focusSubstance === index;
  const words = tList('studio.hormoneCard.tiles'), titles = tList('studio.hormoneCard.tileTitles');
  const tiles = hormoneTile('gland', String(index), label('hormoneCard.gland'), STUDIO_ICON.gland,
                            label('hormoneCard.glandTitle')) +
                EFFECT_ORDER
                    .map(effect => hormoneTile('effect', index + ':' + effect, words[effect],
                                               EFFECT_ICON[effect], titles[effect]))
                    .join('');
  return '<section class="aid-substance-card' + (open ? ' open' : '') +
         '" style="--substance:' + substanceColor(index) +
         '"><header><button class="aid-substance-pill" ' +
         'data-select-substance="' + index + '"><span class="aid-substance-swatch"></span><span>' +
         escapeText(substanceName(state, index)) + '</span></button></header>' +
         '<div class="aid-hormone-tiles">' + tiles + '</div></section>';
}
// The body's own signals: maturity, to which cells can work or die, and the energy reserve, which
// a blood sense can feel.
function bodySignalsCard() {
  const row = (key, body) => '<div class="aid-card-row"><span>' + label('hormoneCard.' + key) +
                             '</span><div class="aid-hormone-tiles">' + body + '</div></div>';
  return '<section class="aid-substance-card body"><header><strong>' + label('hormoneCard.body') +
         '</strong></header>' +
         row('maturity',
             hormoneTile('phase', 'start', label('hormoneCard.phaseStart'), PHASE_ICON.start) +
                 hormoneTile('phase', 'end', label('hormoneCard.phaseEnd'), PHASE_ICON.end)) +
         row('reserve', hormoneTile('reserve', 'blood', label('hormoneCard.reserveSense'),
                                    STUDIO_ICON.blood)) +
         '</section>';
}
// The learning tool's library: the cells learning needs, each with its marker on the fish (a
// learning circuit learns by competition even without a teacher, a modulator teaches the cells it
// reaches, a pacemaker's beat is what a learner can credit; a modulator or pacemaker dropped onto
// a nerve center is wired to it), and a card for each substance with a gland and what the
// substance can do to learning, as tiles to drag onto nerve centers.
const LEARNING_CELLS = Object.freeze([ 'learn', 'modulate', 'pacemaker' ]);
const LEARNING_TILES = Object.freeze([
  {effect : HORMONE_EFFECT.excitation, path : TEACH_ICON},
  {effect : HORMONE_EFFECT.learning, path : EFFECT_ICON[HORMONE_EFFECT.learning]},
  {effect : HORMONE_EFFECT.competition, path : EFFECT_ICON[HORMONE_EFFECT.competition]},
  {effect : HORMONE_EFFECT.eligibility, path : EFFECT_ICON[HORMONE_EFFECT.eligibility]}
]);
function learningCard(state, substance) {
  const index = substance.index, words = tList('studio.learnCard.tiles');
  const titles = tList('studio.learnCard.tileTitles');
  return '<section class="aid-substance-card" style="--substance:' + substanceColor(index) +
         '"><header><span class="aid-substance-pill"><span class="aid-substance-swatch"></span>' +
         '<span>' + escapeText(substanceName(state, index)) + '</span></span></header>' +
         '<div class="aid-hormone-tiles">' +
         hormoneTile('gland', String(index), label('hormoneCard.gland'), STUDIO_ICON.gland,
                     label('hormoneCard.glandTitle')) +
         LEARNING_TILES
             .map((tile, k) => hormoneTile('effect', index + ':' + tile.effect, words[k], tile.path,
                                           titles[k]))
             .join('') +
         '</div></section>';
}
export function learningLibrary(state) {
  const doc = state.document;
  return '<div class="aid-library-intro">' + heading(label('tools.learn')) + '</div>' +
         '<section class="aid-library-section"><h4>' + label('learnCard.cells') +
         '</h4><div class="aid-palette-grid">' + LEARNING_CELLS.map(cellTile).join('') +
         '</div></section><section class="aid-library-section"><h4>' +
         label('learnCard.substances') + '</h4>' +
         (state.capabilities ? doc.substances.map(sub => learningCard(state, sub)).join('') : '') +
         (doc.substances.length < HORMONES.levels
              ? '<button class="aid-secondary" data-add-substance>+ ' +
                    label('sections.newSubstance') + '</button>'
              : '') +
         '</section>';
}
// The library a tool offers, and which one it is.
export function libraryOf(state) {
  if (state.tool === 'hormone')
    return {kind : 'hormones', html : hormoneLibrary(state)};
  if (state.tool === 'learn')
    return {kind : 'learning', html : learningLibrary(state)};
  return {kind : 'organs', html : library(state)};
}
function hormoneLibrary(state) {
  const doc = state.document;
  return '<div class="aid-library-intro">' + heading(label('hormoneCard.title')) + '</div>' +
         (state.capabilities ? doc.substances.map(sub => substanceCard(state, sub)).join('') : '') +
         (doc.substances.length < HORMONES.levels
              ? '<button class="aid-secondary" data-add-substance>+ ' +
                    label('sections.newSubstance') + '</button>'
              : '') +
         bodySignalsCard();
}
// The way through the Atelier, step by step; a step with a tool switches to it.
const WORKFLOW = Object.freeze([ 'select', 'wire', 'hormone', 'learn', 'stimulate' ]);
export function workflow() {
  return '<ol class="aid-workflow">' +
         WORKFLOW
             .map(key => '<li><button type="button" data-tool="' + key + '" title="' +
                         label('tools.' + key) + '">' +
                         glyph(TOOL_ICON[key], ICON.workflow, {line : true}) + '</button><span>' +
                         label('workflow.' + key) + '</span></li>')
             .join('') +
         '<li><span class="aid-workflow-mark">→</span><span>' + label('workflow.develop') +
         '</span></li></ol>';
}
export function toolPalette(state) {
  const tools = [ 'select', 'wire', 'hormone', 'learn', 'stimulate', 'erase', 'pan' ];
  return '<div class="aid-tools" role="toolbar" aria-label="' + label('app.parts') + '">' +
         [ 'undo', 'redo' ]
             .map(key => '<button type="button" data-history="' + key + '" title="' +
                         label('tools.' + key) + '" aria-label="' + label('tools.' + key) + '"' +
                         ((key === 'undo' ? !state.canUndo : !state.canRedo) ? ' disabled' : '') +
                         '>' + glyph(TOOL_ICON[key], ICON.tool, {line : true}) + '</button>')
             .join('') +
         '<span class="aid-tools-divider"></span>' +
         tools
             .map(key => '<button type="button" data-tool="' + key + '" class="' +
                         (state.tool === key ? 'active' : '') + '" title="' +
                         label('tools.' + key) + '" aria-label="' + label('tools.' + key) + '">' +
                         glyph(TOOL_ICON[key], ICON.tool, {line : true}) + '</button>')
             .join('') +
         '<span class="aid-tools-divider"></span>' +
         '<button data-zoom="in" title="' + label('tools.zoomIn') + '">＋</button>' +
         '<button data-zoom="out" title="' + label('tools.zoomOut') + '">−</button>' +
         '<button data-zoom="fit" title="' + label('tools.fit') + '">⌗</button>' +
         '</div>';
}
