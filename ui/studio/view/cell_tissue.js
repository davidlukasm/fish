import {clamp} from '../../units.js';
import {formatNumber} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

const CONTACT = Object.freeze({
  width : 300,
  height : 164,
  cellX : 230,
  cellY : 82,
  radius : 22,
  reach : 30,
  sourceX : 26,
  joinX : 116,
  electricY : 43,
  teachingY : 121,
  weight : 22,
  knob : 6
});
export function contactCapacityPatch(key, fx, fy) {
  const C = CONTACT;
  if (key === 'field')
    return {field : clamp((fx * C.width - C.cellX - C.radius) / C.reach)};
  const y = key === 'electrical_limit' ? C.electricY : C.teachingY;
  return {[key] : clamp((y - fy * C.height) / C.weight)};
}
export function contactCapacity(state, center) {
  if (!center || center.role === 'sensor' || !state.capabilities)
    return '';
  const C = CONTACT, neural = state.capabilities.neural, motor = center.role === 'motor';
  const count = motor ? neural.effectorSlots
                      : Math.round(neural.slotMin * Math.pow(neural.slotSpan, center.field));
  const radius = C.radius + (motor ? 0 : center.field * C.reach);
  const word = key => label('cellPicture.' + key);
  const grip = (key, x, y, title) => '<circle class="aid-graphic-handle" data-capacity-handle="' +
                                     key + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                                     C.knob + '"><title>' + escapeText(title) + '</title></circle>';
  const incoming = (key, y, type) => {
    const value = center[key], width = .7 + 2 * C.weight * value;
    const end = C.cellX - radius;
    return '<g class="' + type + '"><path class="aid-contact-fibre" d="M' + C.sourceX + ' ' + y +
           'H' + C.joinX + ' Q' + (end - 12) + ' ' + y + ' ' + end + ' ' + C.cellY +
           '" stroke-width="' + fixed(width) + '"/>' +
           grip(key, C.joinX, y - C.weight * value, word(key)) + '</g>';
  };
  const shown = Math.min(24, count);
  const points = Array
                     .from({length : shown},
                           (_, i) => {
                             const a = 2 * Math.PI * i / shown;
                             return '<circle class="aid-contact-seat" cx="' +
                                    fixed(C.cellX + radius * Math.cos(a)) + '" cy="' +
                                    fixed(C.cellY + radius * Math.sin(a)) + '" r="2.2"/>';
                           })
                     .join('');
  return '<details class="aid-cell-capacity"><summary>' + word('contacts') + '</summary>' +
         '<svg class="aid-capacity" data-capacity="' + escapeText(center.id) + '" viewBox="0 0 ' +
         C.width + ' ' + C.height + '" role="img" aria-label="' + word('contacts') + '">' +
         incoming('electrical_limit', C.electricY, 'electric') +
         (motor ? '' : incoming('teaching_limit', C.teachingY, 'teaching')) +
         '<circle class="aid-tissue-cell" cx="' + C.cellX + '" cy="' + C.cellY + '" r="' +
         fixed(radius) + '"><title>' + word('capacity') + ' · ' + formatNumber(count) +
         '</title></circle>' + points +
         (motor ? '' : grip('field', C.cellX + radius, C.cellY, word('capacity'))) +
         '</svg></details>';
}

const VARIATION =
    Object.freeze({width : 150, height : 98, cx : 48, cy : 48, span : 70, radius : 9});
export const variationPatch = fx =>
    clamp((fx * VARIATION.width - VARIATION.cx - VARIATION.radius) / VARIATION.span);
export function variationGraphic(value, target, family) {
  const V = VARIATION, word = key => label('cellPicture.' + key);
  const glyphs = [ -1, -.5, 0, .5, 1 ]
                     .map((q, i) => {
                       const x = V.cx + V.span * value * Math.abs(q), y = V.cy + 26 * q;
                       const varied = clamp(2 * value * q, -1);
                       let inside;
                       if (family === 'spread_contacts')
                         inside = '<path d="M-7 0H7 M0 -7V7 M-5 -5L5 5" stroke-width="' +
                                  fixed(1.8 + varied * 1.2) + '"/>';
                       else if (family === 'spread_receptors')
                         inside = '<circle r="' + fixed(4 + varied * 2) + '"/>';
                       else if (family === 'spread_development')
                         inside = '<circle r="5" fill="currentColor" fill-opacity="' +
                                  fixed((1 + varied) / 2) + '"/>';
                       else
                         inside = '<path d="M-6 2L-2 2 0 ' + fixed(-4 - varied * 3) + ' 3 2H7"/>';
                       return '<path class="aid-variation-branch" d="M10 ' + V.cy + 'Q' + V.cx +
                              ' ' + V.cy + ' ' + fixed(x) + ' ' + fixed(y) +
                              '"/><g transform="translate(' + fixed(x) + ' ' + fixed(y) +
                              ')"><circle class="aid-tissue-cell" r="' + V.radius + '"/>' + inside +
                              '</g>';
                     })
                     .join('');
  return '<svg class="aid-variation" data-variation="' + escapeText(target) +
         '" data-variation-family="' + family + '" viewBox="0 0 ' + V.width + ' ' + V.height +
         '" role="img" aria-label="' + word(family) + '"><title>' + word('variationDrag') +
         '</title>' + glyphs + '<circle class="aid-graphic-handle" data-variation-handle cx="' +
         fixed(V.cx + V.span * value + V.radius) + '" cy="' + (V.cy - 26) + '" r="6"/>' +
         '</svg>';
}
export function cellVariation(center) {
  return '<details class="aid-cell-variation"><summary>' + label('cellPicture.variation') +
         '</summary><div class="aid-variation-grid">' +
         Object.entries(center.distribution)
             .map(([ key, value ]) => variationGraphic(value, center.id, key))
             .join('') +
         '</div></details>';
}
