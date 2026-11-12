import {clamp} from '../../units.js';
import {formatNumber, t} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

// How far new cells of a group may differ from the blueprint in one family of traits. The axis
// spans a trait's whole range from its least to its greatest value, the mark in the middle stands
// for the blueprint's value, and the band around it is where each new cell draws its own value
// (evenly). The dots are example cells; the handle at the band's edge widens or narrows it.
const VARIATION = Object.freeze({
  width : 300,
  height : 64,
  left : 22,
  right : 278,
  title : 13,
  axis : 36,
  band : 14,
  tick : 6,
  ends : 56,
  dot : 3,
  rows : 3,
  rise : 3.5,
  handle : 7,
  gap : 3,
  // Beyond this spread the value stands left of the handle, inside the picture.
  flip : .7
});
// Example cells, as fixed places inside the band (−1 … 1), so the picture keeps still while the
// band is dragged.
const EXAMPLES = Object.freeze(
    [ -.93, -.7, -.46, -.27, -.1, .06, .22, .39, .57, .76, .91, -.58, .66, -.18, .13 ]);
const HALF = (VARIATION.right - VARIATION.left) / 2, MIDDLE = VARIATION.left + HALF;
const PERCENT = 100;
export const variationPatch = fx => clamp((fx * VARIATION.width - MIDDLE) / HALF);
export function variationGraphic(value, target, family) {
  const V = VARIATION, word = key => label('development.' + key);
  const reach = HALF * clamp(value);
  const dots =
      EXAMPLES
          .map((e, k) => '<circle class="aid-variation-cell" cx="' + fixed(MIDDLE + e * reach) +
                         '" cy="' + fixed(V.axis + (k % V.rows - 1) * V.rise) + '" r="' + V.dot +
                         '"/>')
          .join('');
  const text = (x, y, content, anchor = 'middle', cls = '') =>
      '<text' + (cls ? ' class="' + cls + '"' : '') + ' x="' + fixed(x) + '" y="' + fixed(y) +
      '" text-anchor="' + anchor + '">' + escapeText(content) + '</text>';
  return '<svg class="aid-variation" data-variation="' + escapeText(target) +
         '" data-variation-family="' + family + '" viewBox="0 0 ' + V.width + ' ' + V.height +
         '" role="img" aria-label="' + word(family) + '">' +
         text(V.left, V.title, word(family), 'start', 'aid-variation-title') +
         '<path class="aid-variation-axis" d="M' + V.left + ' ' + (V.axis - V.tick) + 'V' +
         (V.axis + V.tick) + 'M' + V.left + ' ' + V.axis + 'H' + V.right + 'M' + V.right + ' ' +
         (V.axis - V.tick) + 'V' + (V.axis + V.tick) + '"/>' +
         '<rect class="aid-variation-band" x="' + fixed(MIDDLE - reach) + '" y="' +
         fixed(V.axis - V.band / 2) + '" width="' + fixed(2 * reach) + '" height="' + V.band +
         '" rx="4"/>' + dots + '<line class="aid-variation-plan" x1="' + MIDDLE + '" y1="' +
         (V.axis - V.band / 2 - V.tick) + '" x2="' + MIDDLE + '" y2="' + (V.axis + V.band / 2) +
         '"/>' + text(V.left, V.ends, word('least'), 'start') +
         text(MIDDLE, V.ends, word('blueprint')) + text(V.right, V.ends, word('greatest'), 'end') +
         text(MIDDLE + reach + (value > V.flip ? -1 : 1) * (V.handle + V.gap),
              V.axis - V.band / 2 - V.gap,
              t('studio.development.spreadValue', {n : formatNumber(Math.round(value * PERCENT))}),
              value > V.flip ? 'end' : 'start', 'aid-variation-value') +
         '<circle class="aid-graphic-handle" data-variation-handle cx="' + fixed(MIDDLE + reach) +
         '" cy="' + (V.axis - V.band / 2) + '" r="' + V.handle + '"/></svg>';
}
// How new cells differ: one spread band per family of traits.
export function cellVariation(center) {
  return '<details class="aid-cell-variation"><summary>' + label('cellPicture.variation') +
         '</summary>' +
         Object.entries(center.distribution)
             .map(([ key, value ]) => variationGraphic(value, center.id, key))
             .join('') +
         '</details>';
}
