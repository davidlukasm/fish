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
import {substanceName} from './substances.js';
import {lifeCycle} from './life_cycle.js';
import {cellVariation} from './cell_tissue.js';
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT = DEFAULT_BLOOD_CONTEXT;
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
export const DEFAULT_PREVIEW_INPUT = 1;
export const previewInputOf = state => state.previewInput ?? DEFAULT_PREVIEW_INPUT;
const word = (key, values) => t('studio.development.' + key, values);
const PREVIEW_DIGITS = 2;
const SITUATION = Object.freeze({
  width : 300,
  height : 122,
  pad : {left : 34, top : 24, right : 278, bottom : 88},
  key : {young : 9, grown : 17, below : 12, sign : 40},
  knob : 7
});
const LEVEL =
    Object.freeze({width : 100, height : 32, left : 12, right : 88, middle : 16, depth : 12});
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
// The values a handle sets, from the pointer in the picture's units and the geometry it carries.
export function previewPatch(key, p, marks) {
  const P = SITUATION.pad;
  if (key === 'situation')
    return {
      maturity : clamp((p.x - P.left) / (P.right - P.left)),
      input :
          PREVIEW_INPUT_LOW + (1 - PREVIEW_INPUT_LOW) * clamp((P.bottom - p.y) / (P.bottom - P.top))
    };
  const left = Number(marks.levelLeft), right = Number(marks.levelRight);
  return Number.isFinite(left) && Number.isFinite(right) && right > left
             ? {[key] : clamp((p.x - left) / (right - left))}
             : {};
}
function substanceLevel(state, index, context) {
  const L = LEVEL, span = L.right - L.left, level = bloodLevel(context, index);
  const name = index < HORMONES.levels
                   ? state.document.substances.find(substance => substance.index === index)?.name ||
                         word('unnamedSubstance', {n : index + 1})
                   : substanceName(state, index);
  const colour = substanceColor(index);
  const x = L.left + span * level, top = L.middle - L.depth / 2;
  return '<div class="aid-preview-level-row"><span>' + escapeText(name) +
         '</span><svg class="aid-preview-level" width="' + L.width + '" height="' + L.height +
         '" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-preview-bars data-preview-substance="' + index + '" role="img" aria-label="' +
         escapeText(namedText(name, percent(level))) + '" style="--substance:' + colour +
         '"><rect class="aid-preview-vessel" x="' + L.left + '" y="' + top + '" width="' + span +
         '" height="' + L.depth + '" rx="' + L.depth / 2 +
         '"/><rect class="aid-preview-amount" x="' + L.left + '" y="' + top + '" width="' +
         fixed(span * level) + '" height="' + L.depth + '" rx="' + L.depth / 2 +
         '"/><circle class="aid-graphic-handle" data-preview-handle="' + index +
         '" data-level-left="' + L.left + '" data-level-right="' + L.right + '" cx="' + fixed(x) +
         '" cy="' + L.middle + '" r="' + SITUATION.knob + '"/></svg></div>';
}
export function previewControls(state) {
  const S = SITUATION, P = S.pad, K = S.key, context = previewContextOf(state);
  const input = previewInputOf(state), at = padPoint(context.maturity, input);
  const zero = padPoint(0, 0).y;
  const situation = joinParts([
    namedText(substanceName(state, HORMONES.levels),
              formatNumber(context.maturity, PREVIEW_DIGITS)),
    namedText(word('exampleInput'), formatNumber(input, PREVIEW_DIGITS))
  ]);
  const substances = previewSubstances(state.document, state.capabilities);
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><svg class="aid-preview-bars" viewBox="0 0 ' + S.width + ' ' + S.height +
         '" data-preview-bars role="img" aria-label="' + escapeText(word('preview')) + '">' +
         '<text class="aid-curve-label" x="' + P.left + '" y="' + (P.top - K.below) + '">' +
         escapeText(word('inputAt', {n : formatSigned(input, PREVIEW_DIGITS)})) +
         '</text><text class="aid-curve-label" x="' + (P.left + P.right) / 2 + '" y="' +
         (S.height - 3) + '" text-anchor="middle">' +
         escapeText(word('maturityAt', {p : percent(context.maturity)})) + '</text>' +
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
         '</title></circle></svg>' +
         (substances.length
              ? '<div class="aid-preview-levels">' +
                    substances.map(index => substanceLevel(state, index, context)).join('') +
                    '</div>'
              : '') +
         '</details>';
}
// A cell's life cycle (when it comes into being, how active it is, when it dies) and how much its
// copies differ.
export function cellDevelopment(state, center) {
  if (!center || !state.capabilities)
    return '';
  return lifeCycle(state, center) + cellVariation(center);
}
