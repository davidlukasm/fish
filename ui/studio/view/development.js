import {BLOOD_SUBSTANCE} from '../../schema.js';
import {
  allCenters,
  DEFAULT_BLOOD_CONTEXT,
  findCenter,
  NOTICEABLE_AFFINITY,
  receptorAffinity
} from '../model/document.js';
import {clamp} from '../../units.js';
import {lifeCycle} from './life_cycle.js';
import {cellVariation} from './cell_tissue.js';

// What the Atelier's pictures are drawn at until the life tool sets it otherwise: the grown
// fish, fed and rested, with no messenger in its blood.
export const DEFAULT_PREVIEW_CONTEXT = Object.freeze({...DEFAULT_BLOOD_CONTEXT, maturity : 1});
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
// A substance has a level to set once it is named or a cell answers it.
export function previewSubstances(doc, wheel) {
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
// The level a knob sets, from the pointer in the picture's units and the geometry it carries: a
// level is dragged along its picture, across it or up it (life_tool.js, the vessels).
export function previewPatch(key, p, marks) {
  const left = Number(marks.levelLeft), right = Number(marks.levelRight),
        bottom = Number(marks.levelBottom), top = Number(marks.levelTop);
  // A level axis may show only part of the level (data-level-span, the hormone pictures).
  const span = Number(marks.levelSpan) || 1;
  return Number.isFinite(left) && Number.isFinite(right) && right > left
             ? {[key] : span * clamp((p.x - left) / (right - left))}
         : Number.isFinite(bottom) && Number.isFinite(top) && bottom > top
             ? {[key] : clamp((bottom - p.y) / (bottom - top))}
             : {};
}
// A cell's life cycle (when it comes into being, how active it is, when it dies) and how much its
// copies differ.
// Organs whose own picture carries the grip for how far their cells' thresholds spread
// (live/pain.js, live/lateral.js, live/nose.js): their spread of physiology is set there, not
// here a second time.
const SPREAD_IN_PICTURE = new Set([ 'pain', 'lateral', 'nose' ]);
export function cellDevelopment(state, center, own = false) {
  if (!center || !state.capabilities)
    return '';
  const organ = findCenter(state.document, center.id)?.organ;
  return lifeCycle(state, center, own) +
         cellVariation(center, SPREAD_IN_PICTURE.has(organ?.type) ? [ 'spread_physiology' ] : []);
}
