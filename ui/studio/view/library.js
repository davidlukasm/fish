import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {EFFECT_ICON, PHASE_ICON, TEACH_ICON, TOOL_ICON} from './icons.js';
import {centerMarker} from './scene.js';
import {EFFECT_ORDER} from './effects.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {MODULES, NEURON_BY_KEY, NEURONS, ORGAN_BY_KEY, ORGANS, PAIRINGS} from '../model/organs.js';
import {escapeText, glyph} from './markup.js';
import {namedText, tList} from '../../strings.js';
import {heading, icon, ICON, label, regionTerm} from './kit.js';
import {substanceName} from './substances.js';
import {tone} from './names.js';

// The panel beside the scene: what each tool offers to drag onto the fish, all as one kind of tile
// (its symbol in a ring of its colour, its name below), in sections; and the tool palette.
// A tile: what a drop gives (kind and value), its name, its symbol (a path, or markup when
// MARKUP), the ring's colour, the hover title, and whether it offers nothing here (OFF).
// A tile is dragged onto the fish; one that acts (`act`) is clicked, to act at once or, `armed`,
// held ready (it may be dragged as well, `drag`).
function tile({
  kind,
  value,
  name,
  path = null,
  markup = null,
  colour,
  title = name,
  off = false,
  act = false,
  drag = !act,
  armed = false
}) {
  const v = escapeText(value);
  return '<button class="aid-palette-tile' + (off ? ' off' : '') + (armed ? ' armed' : '') + '"' +
         (off    ? ' disabled'
          : drag ? ' draggable="true"'
                 : '') +
         (drag ? ' data-drag-kind="' + kind + '" data-drag-value="' + v + '"' : '') +
         (act ? ' data-act-kind="' + kind + '" data-act-value="' + v + '" aria-pressed="' + armed +
                    '"'
              : '') +
         ' title="' + escapeText(title) +
         '"><span class="aid-palette-icon" style="--organ-color:' + colour + '">' +
         (markup ?? glyph(path, ICON.palette, {line : true})) + '</span><span>' + escapeText(name) +
         '</span></button>';
}
const section = (title, tiles, extra = '') => '<section class="aid-library-section"><h4>' + title +
                                              '</h4><div class="aid-palette-grid">' + tiles +
                                              '</div>' + extra + '</section>';
// A substance's section: its swatch and name as the title (a click shows it in the hormone
// tool's inspector) over its tiles.
const substanceTitle = (state, index, choose) =>
    '<span class="aid-substance-title" style="--substance:' + substanceColor(index) + '">' +
    (choose ? '<button data-select-substance="' + index + '">' : '<span>') +
    '<span class="aid-substance-swatch"></span>' + escapeText(substanceName(state, index)) +
    (choose ? '</button>' : '</span>') + '</span>';
// A tile adding a substance, while there is room for one.
const addSubstanceTile = state => state.document.substances.length < HORMONES.levels
                                      ? '<button class="aid-palette-tile add" data-add-substance>' +
                                            '<span class="aid-palette-icon">＋</span><span>' +
                                            label('sections.newSubstance') + '</span></button>'
                                      : '';
const organTile = (o, name = label('organs.' + o.key), title = name) =>
    tile({kind : 'organ', value : o.key, name, markup : icon(o.key), colour : tone(o.key), title});
// A nerve cell, with its marker as on the fish (MARKER wide in a box of BOX).
const CELL_MARK = Object.freeze({marker : 7, box : 10});
function cellTile(key) {
  const B = CELL_MARK.box, name = label('centers.' + key);
  return tile({
    kind : 'neuron',
    value : key,
    name,
    markup : '<svg viewBox="' + -B + ' ' + -B + ' ' + 2 * B + ' ' + 2 * B +
                 '" aria-hidden="true" style="color:' + tone('brain') + '">' +
                 centerMarker({role : 'nerve', key, ...NEURON_BY_KEY[key]}, CELL_MARK.marker) +
                 '</svg>',
    colour : tone('brain'),
    title : namedText(name, label('neuronPurpose.' + key))
  });
}
// Placing: the organs by kind, the nerve cells and the modules.
function placingLibrary(state) {
  const categories = [ 'senses', 'regions', 'internal', 'motor', 'reproduction' ];
  return categories
             .map(category => section(
                      label('sections.' + category),
                      ORGANS.filter(o => o.category === category)
                          .map(o => o.category === 'regions'
                                        ? organTile(
                                              o, regionTerm(o.key),
                                              namedText(label('organs.' + o.key).replace(/­/g, ''),
                                                        label('regions.' + o.key + '.purpose')))
                                        : organTile(o))
                          .join('')))
             .join('') +
         section(label('sections.nerves'), NEURONS.map(n => cellTile(n.key)).join('')) +
         section(label('sections.modules'),
                 MODULES.map(m => {
                          const shown =
                              m.organs.find(type => ORGAN_BY_KEY[type].category === 'regions') ??
                              m.organs[0];
                          return tile({
                            kind : 'module',
                            value : m.key,
                            name : label('modules.' + m.key),
                            markup : icon(shown),
                            colour : tone(shown),
                            title : namedText(label('modules.' + m.key),
                                              label('modulePurpose.' + m.key))
                          });
                        })
                         .join('') +
                     (state.userModules ?? [])
                         .map(m => tile({
                                kind : 'user-module',
                                value : m.id,
                                name : m.name,
                                markup : icon(m.organs[0]?.type ?? 'brain'),
                                colour : tone(m.organs[0]?.type ?? 'brain')
                              }))
                         .join(''));
}
// Wiring: the ways a wire between paired organs runs (same side, crossed, both) and a bend, each
// dropped onto a wire or clicked and then wires clicked with it. Their symbols: two organs on
// each side of the midline, joined as the way runs; a bend a point a wire bows through.
const WIRE_SYMBOL = Object.freeze({
  same : 'M5 6h14M5 18h14M5 6h.01M19 6h.01M5 18h.01M19 18h.01',
  crossed : 'M5 6l14 12M5 18l14-12M5 6h.01M19 6h.01M5 18h.01M19 18h.01',
  both : 'M5 6h14M5 18h14M5 6l14 12M5 18l14-12',
  bend : 'M3 18C7 18 8 6 12 6s5 12 9 12M12 6h.01'
});
function wiringLibrary(state) {
  const wiring = key => tile({
    kind : 'wiring',
    value : key,
    name : label('wiring.' + key),
    path : WIRE_SYMBOL[key],
    colour : tone('brain'),
    title : label('wiring.' + key + 'Title'),
    act : true,
    drag : true,
    armed : state.armed?.kind === 'wiring' && state.armed.value === key
  });
  return section(label('wiring.pairings'), PAIRINGS.map(wiring).join('')) +
         section(label('wiring.shape'), wiring('bend'));
}
// Hormones: each substance's gland and effects, the body's own signals (maturity, the energy
// reserve a blood sense feels), a new substance.
function hormoneLibrary(state) {
  const doc = state.document, words = tList('studio.hormoneCard.tiles');
  const titles = tList('studio.hormoneCard.tileTitles');
  const substances = state.capabilities ? doc.substances : [];
  return substances
             .map(sub => {
               const index = sub.index, colour = substanceColor(index);
               return section(substanceTitle(state, index, true),
                              tile({
                                kind : 'gland',
                                value : String(index),
                                name : label('hormoneCard.gland'),
                                path : STUDIO_ICON.gland,
                                colour,
                                title : label('hormoneCard.glandTitle')
                              }) + EFFECT_ORDER
                                       .map(effect => tile({
                                              kind : 'effect',
                                              value : index + ':' + effect,
                                              name : words[effect],
                                              path : EFFECT_ICON[effect],
                                              colour,
                                              title : titles[effect]
                                            }))
                                       .join(''));
             })
             .join('') +
         section(label('hormoneCard.body'), tile({
                                              kind : 'phase',
                                              value : 'start',
                                              name : label('hormoneCard.phaseStart'),
                                              path : PHASE_ICON.start,
                                              colour : BODY_SIGNAL
                                            }) + tile({
                                              kind : 'phase',
                                              value : 'end',
                                              name : label('hormoneCard.phaseEnd'),
                                              path : PHASE_ICON.end,
                                              colour : BODY_SIGNAL
                                            }) + tile({
                                              kind : 'reserve',
                                              value : 'blood',
                                              name : label('hormoneCard.reserveSense'),
                                              path : STUDIO_ICON.blood,
                                              colour : BODY_SIGNAL
                                            })) +
         section(label('hormoneCard.more'), addSubstanceTile(state));
}
// The body's own signals' colour.
const BODY_SIGNAL = '#d7c294';
// Learning: the cells learning needs (a learning circuit, a modulator teaching the cells it
// reaches, a pacemaker whose beat a learner can credit; dropped onto a nerve node the first makes
// it learn, the others are wired to it) and per substance a gland and what it can do to
// learning.
const LEARNING_CELLS = Object.freeze([ 'learn', 'modulate', 'pacemaker' ]);
const LEARNING_TILES = Object.freeze([
  {effect : HORMONE_EFFECT.excitation, path : TEACH_ICON},
  {effect : HORMONE_EFFECT.learning, path : EFFECT_ICON[HORMONE_EFFECT.learning]},
  {effect : HORMONE_EFFECT.competition, path : EFFECT_ICON[HORMONE_EFFECT.competition]},
  {effect : HORMONE_EFFECT.eligibility, path : EFFECT_ICON[HORMONE_EFFECT.eligibility]}
]);
function learningLibrary(state) {
  const words = tList('studio.learnCard.tiles'), titles = tList('studio.learnCard.tileTitles');
  const substances = state.capabilities ? state.document.substances : [];
  return section(label('learnCard.cells'), LEARNING_CELLS.map(cellTile).join('')) +
         substances
             .map(sub => {
               const index = sub.index, colour = substanceColor(index);
               return section(substanceTitle(state, index, false),
                              tile({
                                kind : 'gland',
                                value : String(index),
                                name : label('hormoneCard.gland'),
                                path : STUDIO_ICON.gland,
                                colour,
                                title : label('hormoneCard.glandTitle')
                              }) + LEARNING_TILES
                                       .map((t, k) => tile({
                                              kind : 'effect',
                                              value : index + ':' + t.effect,
                                              name : words[k],
                                              path : t.path,
                                              colour,
                                              title : titles[k]
                                            }))
                                       .join(''));
             })
             .join('') +
         section(label('hormoneCard.more'), addSubstanceTile(state));
}
// Stimulating: a test stimulus of each kind a sense feels, clicked to appear at its sense at once;
// one whose sense the fish lacks offers nothing.
const STIMULI = Object.freeze([
  {key : 'light', organ : 'eye'}, {key : 'object', organ : 'proximity'},
  {key : 'scent', organ : 'nose'}, {key : 'flow', organ : 'lateral'},
  {key : 'touch', organ : 'touch'}, {key : 'pain', organ : 'pain'}
]);
function stimulusLibrary(state) {
  const has = type => state.document.organs.some(o => o.type === type);
  return section(label('stimulusCard.senses'), STIMULI
                                                   .map(s => tile({
                                                          kind : 'stimulus',
                                                          value : s.key,
                                                          name : label('stimulusCard.' + s.key),
                                                          markup : icon(s.organ),
                                                          colour : tone(s.organ),
                                                          off : !has(s.organ),
                                                          act : true
                                                        }))
                                                   .join(''));
}
// The panel a tool offers, and which one it is.
const LIBRARIES = Object.freeze({
  select : placingLibrary,
  wire : wiringLibrary,
  hormone : hormoneLibrary,
  learn : learningLibrary,
  stimulate : stimulusLibrary
});
export function libraryOf(state) {
  const kind = LIBRARIES[state.tool] ? state.tool : 'select';
  return {
    kind,
    html : '<div class="aid-library-intro">' + heading(label('tools.' + kind)) + '</div>' +
               LIBRARIES[kind](state)
  };
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
