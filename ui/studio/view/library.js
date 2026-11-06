import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {TOOL_ICON} from './icons.js';
import {MODULES, NEURONS, ORGAN_BY_KEY, ORGANS} from '../model/organs.js';
import {
  boundEffects,
  growsWith,
  producers,
  receivers,
  SUBSTANCE_NAME_LENGTH
} from '../model/document.js';
import {escapeText, glyph} from './markup.js';
import {namedText, t, tList} from '../../strings.js';
import {heading, icon, ICON, label, regionTerm} from './kit.js';
import {measurement, organsOf} from './substances.js';
import {organTitle} from './body.js';
import {tone} from './names.js';

// The library beside the scene: organs, modules and substances to drag onto the fish, and the
// tool palette.
function paletteItem(kind, name, type, key, title = name) {
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="' + type +
         '" data-drag-value="' + escapeText(key) + '" title="' + escapeText(title) + '">' +
         '<span class="aid-palette-icon" style="--organ-color:' + tone(kind) + '">' + icon(kind) +
         '</span><span>' + escapeText(name) + '</span></button>';
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
      '</h4><div class="aid-palette-grid">' +
      NEURONS.map(n => paletteItem('brain', label('centers.' + n.key), 'neuron', n.key)).join('') +
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
const HORMONE_TILES = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.learning,
  HORMONE_EFFECT.eligibility, HORMONE_EFFECT.competition, HORMONE_EFFECT.rhythm
]);
const FISH_MARK = 'M3 12c3-4 7-5 11-3l5-3v12l-5-3c-4 2-8 1-11-3zM9 11h.01';
function hormoneTile(kind, value, text, title = text) {
  return '<button class="aid-hormone-tile" draggable="true" data-drag-kind="' + kind +
         '" data-drag-value="' + escapeText(value) + '" title="' + escapeText(title) + '">' +
         escapeText(text) + '</button>';
}
function substanceCard(state, substance) {
  const {document : doc, capabilities : wheel} = state, index = substance.index;
  const open = state.focusSubstance === index;
  const fallback = t('units.numbered', {
    name : label('inspector.substanceName'),
    n : tList('studio.inspector.substanceLetters')[index]
  });
  const grows = growsWith(doc, index, wheel);
  const head =
      '<header><button class="aid-substance-pill" data-select-substance="' + index +
      '" aria-label="' + escapeText(fallback) + '"><span class="aid-substance-swatch"></span>' +
      '</button><input class="aid-inline-name" data-substance-name="' + index + '" value="' +
      escapeText(substance.name) + '" placeholder="' + escapeText(fallback) + '" maxlength="' +
      SUBSTANCE_NAME_LENGTH + '" aria-label="' + label('inspector.substanceName') + '">' +
      '<button class="aid-growth-mark' + (grows ? ' on' : '') + '" ' +
      (grows ? 'data-growth-off' : 'data-growth-substance="' + index + '"') + ' title="' +
      label(grows ? 'hormoneCard.growsOn' : 'hormoneCard.growsOff') + '">' +
      glyph(FISH_MARK, ICON.mark) +
      '</button><button class="aid-row-menu" data-remove-substance="' + index + '" aria-label="' +
      label('inspector.removeSubstance') + '">' + t('studio.marks.remove') + '</button></header>';
  const style = ' style="--substance:' + substanceColor(index) + '"';
  const releasing = producers(doc, index, wheel), receiving = receivers(doc, index, wheel);
  if (!open)
    return '<section class="aid-substance-card"' + style + '>' + head +
           '<button class="aid-card-summary" data-select-substance="' + index + '">' +
           escapeText(t('studio.hormoneCard.summary', {
             glands : organsOf(doc, releasing).length,
             targets : organsOf(doc, receiving).length
           })) +
           '</button></section>';
  const row = (key, body) => '<div class="aid-card-row"><span>' + label('hormoneCard.' + key) +
                             '</span><div>' + body + '</div></div>';
  const glands = organsOf(doc, releasing)
                     .map(organ => '<button data-select-organ="' + escapeText(organ.id) + '">' +
                                   icon(organ.type, ICON.list) +
                                   escapeText(organTitle(organ, state.sites)) + '</button>')
                     .join('');
  const tiles = HORMONE_TILES
                    .map(effect => hormoneTile('effect', index + ':' + effect,
                                               tList('studio.hormoneCard.tiles')[effect]))
                    .join('');
  const targets =
      organsOf(doc, receiving)
          .map(organ => {
            const effects = new Set(organ.centers.flatMap(c => boundEffects(c, index, wheel)));
            return '<button data-select-organ="' + escapeText(organ.id) + '">' +
                   icon(organ.type, ICON.list) + escapeText(organTitle(organ, state.sites)) +
                   [...effects ]
                       .map(e => '<small class="aid-bound-effect">' +
                                 escapeText(tList('studio.hormoneCard.tiles')[e]) + '</small>')
                       .join('') +
                   '</button>';
          })
          .join('');
  return '<section class="aid-substance-card open"' + style + '>' + head +
         row('sources', glands + hormoneTile('gland', String(index), label('hormoneCard.gland'))) +
         row('can', '<div class="aid-hormone-tiles">' + tiles + '</div>') +
         (targets ? row('acts', targets) : '') + measurement(state, index) + '</section>';
}
function bodySignalsCard() {
  const row = (key, body) => '<div class="aid-card-row"><span>' + label('hormoneCard.' + key) +
                             '</span><div>' + body + '</div></div>';
  return '<section class="aid-substance-card body"><header><strong>' + label('hormoneCard.body') +
         '</strong></header>' +
         row('maturity', hormoneTile('phase', 'start', label('hormoneCard.phaseStart')) +
                             hormoneTile('phase', 'end', label('hormoneCard.phaseEnd'))) +
         row('reserve', hormoneTile('reserve', 'blood', label('hormoneCard.reserveSense'))) +
         '</section>';
}
export function hormoneLibrary(state) {
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
