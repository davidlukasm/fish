import {BLOOD_SUBSTANCE, HORMONES} from '../../schema.js';
import {
  allCenters,
  bloodLevel,
  DEFAULT_BLOOD_CONTEXT,
  NOTICEABLE_AFFINITY,
  receptorAffinity
} from '../model/document.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {formatNumber, formatSigned, joinParts, namedText, percent, t} from '../../strings.js';
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
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT = DEFAULT_BLOOD_CONTEXT;
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
export const DEFAULT_PREVIEW_INPUT = 1;
export const previewInputOf = state => state.previewInput ?? DEFAULT_PREVIEW_INPUT;
const word = (key, values) => t('studio.development.' + key, values);
const PREVIEW_DIGITS = 2;
// The example situation in one picture. A pad holds age and input together: from the young fish
// on the left to the grown one on the right, from the strongest negative input at the bottom to
// the strongest positive one at the top; one handle sets both. Beside it every substance is a drop
// that grows with its level; the handle on its top sets it.
const SITUATION = Object.freeze({
  width : 300,
  height : 122,
  pad : {left : 34, top : 24, right : 160, bottom : 88},
  key : {young : 9, grown : 17, below : 12, sign : 40},
  drops : {
    left : 180,
    right : 292,
    middle : 56,
    least : 3,
    span : 11,
    most : 30,
    mark : 11,
    columns : 4,
    rowGap : 48
  },
  knob : 7
});
export const PREVIEW_INPUT_LOW = -1;
// A substance gets an example level once it is named or a cell answers it.
function previewSubstances(doc, wheel) {
  const used = new Set(doc.substances.map(substance => substance.index));
  for (const center of allCenters(doc))
    for (const receptor of [center.growth, ...center.receptors])
      if (receptor?.active) {
        if (receptor.substance !== BLOOD_SUBSTANCE.maturity &&
            receptor.substance < wheel?.regulators)
          used.add(receptor.substance);
        for (const index of [BLOOD_SUBSTANCE.reserve, BLOOD_SUBSTANCE.fatigue])
          if (index < wheel?.regulators && receptor.sensitivity &&
              receptorAffinity(wheel, receptor, index) >= NOTICEABLE_AFFINITY)
            used.add(index);
      }
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
  const substances = previewSubstances(state.document, state.capabilities);
  const rows = Math.ceil(substances.length / D.columns);
  const columns = Math.ceil(substances.length / Math.max(1, rows));
  const step = Math.min(D.most, (D.right - D.left) / Math.max(1, columns));
  const drops =
      substances
          .map((index, k) => {
            const x = D.left + step * (k % columns + .5), level = bloodLevel(context, index);
            const middle = D.middle + (Math.floor(k / columns) - (rows - 1) / 2) * D.rowGap;
            const r = dropRadius(level), colour = substanceColor(index);
            return '<g class="aid-preview-drop"><title>' +
                   escapeText(namedText(substanceName(state, index),
                                        formatNumber(level, PREVIEW_DIGITS))) +
                   '</title><circle class="aid-preview-reach" cx="' + fixed(x) + '" cy="' + middle +
                   '" r="' + dropRadius(1) + '"/><circle cx="' + fixed(x) + '" cy="' + middle +
                   '" r="' + fixed(r) + '" fill="' + colour + '"/><text x="' + fixed(x) + '" y="' +
                   (middle + dropRadius(1) + D.mark) + '" style="fill:' + colour +
                   '" text-anchor="middle" dominant-baseline="central">' +
                   escapeText(substanceMark(state, index)) +
                   '</text><circle class="aid-graphic-handle" data-preview-handle="' + index +
                   '" data-drop-middle="' + middle + '" cx="' + fixed(x) + '" cy="' +
                   fixed(middle - r) + '" r="' + S.knob + '"/></g>';
          })
          .join('');
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><svg class="aid-preview-bars" viewBox="0 0 ' + S.width + ' ' + S.height +
         '" data-preview-bars role="img" aria-label="' + escapeText(word('preview')) + '">' +
         '<text class="aid-curve-label" x="' + P.left + '" y="' + (P.top - K.below) + '">' +
         escapeText(word('inputAt', {n : formatSigned(input, PREVIEW_DIGITS)})) +
         '</text><text class="aid-curve-label" x="' + (P.left + P.right) / 2 + '" y="' +
         (S.height - 3) + '" text-anchor="middle">' +
         escapeText(word('maturityAt', {p : percent(context.maturity)})) + '</text>' +
         (substances.length
              ? '<text class="aid-curve-label" x="' + D.left + '" y="' + (P.top - K.below) + '">' +
                    escapeText(word('substanceLevels')) + '</text>'
              : '') +
         '<g class="aid-preview-pad"><title>' + escapeText(situation) + '</title><rect x="' +
         P.left + '" y="' + P.top + '" width="' + (P.right - P.left) + '" height="' +
         (P.bottom - P.top) + '"/><path class="aid-dose-zero" d="M' + P.left + ' ' + fixed(zero) +
         ' H' + P.right + '"/>' +
         placedGlyph(GROWTH_ICON, K.young, {x : P.left + K.young / 2, y : P.bottom + K.below},
                     {line : true}) +
         placedGlyph(GROWTH_ICON, K.grown, {x : P.right - K.grown / 2, y : P.bottom + K.below},
                     {line : true}) +
         '<text class="aid-preview-sign" x="' + (P.left - K.sign / 2) + '" y="' + P.top +
         '" text-anchor="middle" dominant-baseline="hanging">' + formatSigned(1) + '</text><text ' +
         'class="aid-preview-sign" x="' + (P.left - K.sign / 2) + '" y="' + P.bottom +
         '" text-anchor="middle">' + formatSigned(PREVIEW_INPUT_LOW) + '</text></g>' +
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
