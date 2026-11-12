import {HORMONES} from '../../schema.js';
import {allCenters} from '../model/document.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {formatNumber, joinParts, namedText} from '../../strings.js';
import {clamp} from '../../units.js';
import {GROWTH_ICON} from './icons.js';
import {
  LIFE_EFFECTS,
  lifePhaseEditor,
  receptorBody,
  substanceMark,
  substanceName
} from './substances.js';
import {cellVariation} from './cell_tissue.js';
import {label} from './kit.js';
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT =
    Object.freeze({maturity : 0, hormones : Object.freeze(Array(HORMONES.levels).fill(0))});
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
export const DEFAULT_PREVIEW_INPUT = 1;
export const previewInputOf = state => state.previewInput ?? DEFAULT_PREVIEW_INPUT;
const word = key => label('development.' + key);
const PREVIEW_DIGITS = 2;
// The example situation in one picture. A pad holds age and input together: from the young fish
// on the left to the grown one on the right, from the strongest negative input at the bottom to
// the strongest positive one at the top; one handle sets both. Beside it every substance is a drop
// that grows with its level; the handle on its top sets it.
const SITUATION = Object.freeze({
  width : 300,
  height : 96,
  pad : {left : 22, top : 10, right : 150, bottom : 74},
  key : {young : 9, grown : 17, below : 12, sign : 12},
  drops : {left : 168, right : 292, middle : 42, least : 3, span : 11, most : 30, mark : 11},
  knob : 7
});
export const PREVIEW_INPUT_LOW = -1;
// A substance gets an example level once it is named or a cell answers it.
function previewSubstances(doc) {
  const used = new Set(doc.substances.map(substance => substance.index));
  for (const center of allCenters(doc))
    for (const receptor of [center.growth, ...center.receptors])
      if (receptor?.active && receptor.substance < HORMONES.levels)
        used.add(receptor.substance);
  return [...used ].sort((a, b) => a - b);
}
const padPoint = (maturity, input) => {
  const P = SITUATION.pad;
  return {
    x : P.left + (P.right - P.left) * maturity,
    y : P.bottom - (P.bottom - P.top) * (input - PREVIEW_INPUT_LOW) / (1 - PREVIEW_INPUT_LOW)
  };
};
const dropRadius = level => SITUATION.drops.least + SITUATION.drops.span * level;
// The values a handle sets, from the pointer in the picture's units and the geometry it carries.
export function previewPatch(key, p, marks) {
  const P = SITUATION.pad;
  if (key === 'situation')
    return {
      maturity : clamp((p.x - P.left) / (P.right - P.left)),
      input :
          PREVIEW_INPUT_LOW + (1 - PREVIEW_INPUT_LOW) * clamp((P.bottom - p.y) / (P.bottom - P.top))
    };
  const middle = Number(marks.dropMiddle);
  return Number.isFinite(middle)
             ? {[key] : clamp((middle - p.y - SITUATION.drops.least) / SITUATION.drops.span)}
             : {};
}
export function previewControls(state) {
  const S = SITUATION, P = S.pad, K = S.key, D = S.drops, context = previewContextOf(state);
  const input = previewInputOf(state), at = padPoint(context.maturity, input);
  const zero = padPoint(0, 0).y;
  const situation = joinParts([
    namedText(substanceName(state, HORMONES.levels),
              formatNumber(context.maturity, PREVIEW_DIGITS)),
    namedText(word('exampleInput'), formatNumber(input, PREVIEW_DIGITS))
  ]);
  const substances = previewSubstances(state.document);
  const step = Math.min(D.most, (D.right - D.left) / Math.max(1, substances.length));
  const drops = substances
                    .map((index, k) => {
                      const x = D.left + step * (k + .5), level = context.hormones[index];
                      const r = dropRadius(level), colour = substanceColor(index);
                      return '<g class="aid-preview-drop"><title>' +
                             escapeText(namedText(substanceName(state, index),
                                                  formatNumber(level, PREVIEW_DIGITS))) +
                             '</title><circle class="aid-preview-reach" cx="' + fixed(x) +
                             '" cy="' + D.middle + '" r="' + dropRadius(1) + '"/><circle cx="' +
                             fixed(x) + '" cy="' + D.middle + '" r="' + fixed(r) + '" fill="' +
                             colour + '"/><text x="' + fixed(x) + '" y="' +
                             (D.middle + dropRadius(1) + D.mark) + '" style="fill:' + colour +
                             '" text-anchor="middle" dominant-baseline="central">' +
                             escapeText(substanceMark(state, index)) +
                             '</text><circle class="aid-graphic-handle" data-preview-handle="' +
                             index + '" data-drop-middle="' + D.middle + '" cx="' + fixed(x) +
                             '" cy="' + fixed(D.middle - r) + '" r="' + S.knob + '"/></g>';
                    })
                    .join('');
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><svg class="aid-preview-bars" viewBox="0 0 ' + S.width + ' ' + S.height +
         '" data-preview-bars role="img" aria-label="' + escapeText(word('preview')) + '">' +
         '<g class="aid-preview-pad"><title>' + escapeText(situation) + '</title><rect x="' +
         P.left + '" y="' + P.top + '" width="' + (P.right - P.left) + '" height="' +
         (P.bottom - P.top) + '"/><path class="aid-dose-zero" d="M' + P.left + ' ' + fixed(zero) +
         ' H' + P.right + '"/>' +
         placedGlyph(GROWTH_ICON, K.young, {x : P.left + K.young / 2, y : P.bottom + K.below},
                     {line : true}) +
         placedGlyph(GROWTH_ICON, K.grown, {x : P.right - K.grown / 2, y : P.bottom + K.below},
                     {line : true}) +
         '<text x="' + (P.left - K.sign / 2) + '" y="' + P.top + '" text-anchor="middle" ' +
         'dominant-baseline="hanging">+</text><text x="' + (P.left - K.sign / 2) + '" y="' +
         P.bottom + '" text-anchor="middle">−</text></g>' +
         '<circle class="aid-graphic-handle" data-preview-handle="situation" cx="' + fixed(at.x) +
         '" cy="' + fixed(at.y) + '" r="' + S.knob + '"><title>' + escapeText(situation) +
         '</title></circle>' + drops + '</svg></details>';
}
export function cellDevelopment(state, center) {
  if (!center || !state.capabilities)
    return '';
  const chosen =
      LIFE_EFFECTS.includes(state.developmentEffect) ? state.developmentEffect : LIFE_EFFECTS[0];
  return '<details class="aid-cell-development"><summary>' + word('title') + '</summary>' +
         lifePhaseEditor(state, center, chosen) + receptorBody(state, center, chosen) +
         '</details>' + cellVariation(center);
}
