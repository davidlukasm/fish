import {HORMONE_EFFECT} from '../../schema.js';
import {effectLevel, startEnds} from '../model/document.js';
import {fixed, placedGlyph} from './markup.js';
import {EFFECT_ICON} from './icons.js';

export const EFFECT_ORDER = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.teaching,
  HORMONE_EFFECT.eligibility, HORMONE_EFFECT.learning, HORMONE_EFFECT.competition,
  HORMONE_EFFECT.rhythm
]);
export const EFFECT_PANEL = Object.freeze({width : 120, height : 76});
export function effectPanel(effect, response, colour, share) {
  const signed = effect === HORMONE_EFFECT.excitation || effect === HORMONE_EFFECT.teaching;
  const level = effectLevel(effect, response), maximum = effect === HORMONE_EFFECT.learning ? 2 : 1;
  const zero = signed ? 60 : 18, at = signed ? zero + 40 * level : zero + 84 * level / maximum;
  return '<g class="aid-effect-value">' +
         placedGlyph(EFFECT_ICON[effect], 22, {x : 60, y : 18}, {line : true}) +
         '<path class="aid-effect-scale" d="M18 48 H102"/>' +
         '<path class="aid-effect-level" stroke="' + colour + '" d="M' + zero + ' 48 H' +
         fixed(at) + '"/>' +
         '<circle cx="' + fixed(at) + '" cy="48" r="4" fill="' + colour + '"/>' +
         '<text x="60" y="70" text-anchor="middle">' + fixed(level, 2) + '</text></g>';
}
export function effectScene(effect, colour, ends = startEnds(effect)) {
  const panel = (value, x) =>
      '<g transform="translate(' + x + ' 0)">' + effectPanel(effect, value, colour, 0) + '</g>';
  return '<svg class="aid-effect-scene" viewBox="0 0 240 76" aria-hidden="true">' +
         panel(ends.without, 0) + panel(ends.with, 120) + '</svg>';
}
export const modulatorScene = colour =>
    '<svg class="aid-effect-scene" viewBox="0 0 240 76" aria-hidden="true">' +
    '<circle cx="40" cy="38" r="12" fill="' + colour +
    '"/><path class="aid-effect-scale" d="M56 38 H174 M164 32 L174 38 L164 44"/>' +
    '<circle cx="192" cy="38" r="17" fill="none" stroke="' + colour + '"/></svg>';
