import {BLOOD_SUBSTANCE, HORMONES} from '../../schema.js';
import {
  allCenters,
  bloodLevel,
  DEFAULT_BLOOD_CONTEXT,
  NOTICEABLE_AFFINITY,
  receptorAffinity
} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {namedText, percent, t} from '../../strings.js';
import {clamp} from '../../units.js';
import {substanceName} from './substances.js';
import {lifeCycle} from './life_cycle.js';
import {cellVariation} from './cell_tissue.js';
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT = DEFAULT_BLOOD_CONTEXT;
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
const word = (key, values) => t('studio.development.' + key, values);
const KNOB = 7;
const LEVEL =
    Object.freeze({width : 100, height : 32, left : 12, right : 88, middle : 16, depth : 12});
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
// The values a handle sets, from the pointer in the picture's units and the geometry it carries.
export function previewPatch(key, p, marks) {
  const left = Number(marks.levelLeft), right = Number(marks.levelRight);
  return Number.isFinite(left) && Number.isFinite(right) && right > left
             ? {[key] : clamp((p.x - left) / (right - left))}
             : {};
}
// `handle` names what the knob sets: the substance's index, or maturity.
function substanceLevel(state, index, context, handle = index) {
  const L = LEVEL, span = L.right - L.left, level = bloodLevel(context, index);
  const name = index < HORMONES.levels
                   ? state.document.substances.find(substance => substance.index === index)?.name ||
                         word('unnamedSubstance', {n : index + 1})
                   : substanceName(state, index);
  const colour = substanceColor(index);
  const x = L.left + span * level, top = L.middle - L.depth / 2;
  return '<div class="aid-preview-level-row">' +
         '<span>' + escapeText(name) + '</span>' +
         '<svg class="aid-preview-level" width="' + L.width + '" height="' + L.height +
         '" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-preview-bars data-preview-substance="' + index + '" role="img" aria-label="' +
         escapeText(namedText(name, percent(level))) + '" style="--substance:' + colour +
         '"><rect class="aid-preview-vessel" x="' + L.left + '" y="' + top + '" width="' + span +
         '" height="' + L.depth + '" rx="' + L.depth / 2 +
         '"/><rect class="aid-preview-amount" x="' + L.left + '" y="' + top + '" width="' +
         fixed(span * level) + '" height="' + L.depth + '" rx="' + L.depth / 2 +
         '"/><circle class="aid-graphic-handle" data-preview-handle="' + handle +
         '" data-level-left="' + L.left + '" data-level-right="' + L.right + '" cx="' + fixed(x) +
         '" cy="' + L.middle + '" r="' + KNOB + '"/></svg></div>';
}
// The example situation the pictures show: how mature the fish is and how much of each substance
// its blood carries, each as a level with its knob.
export function previewControls(state) {
  const context = previewContextOf(state);
  const substances = previewSubstances(state.document, state.capabilities);
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><div class="aid-preview-levels">' +
         substanceLevel(state, BLOOD_SUBSTANCE.maturity, context, 'maturity') +
         substances.map(index => substanceLevel(state, index, context)).join('') +
         '</div></details>';
}
// A cell's life cycle (when it comes into being, how active it is, when it dies) and how much its
// copies differ.
export function cellDevelopment(state, center, own = false) {
  if (!center || !state.capabilities)
    return '';
  return lifeCycle(state, center, own) + cellVariation(center);
}
