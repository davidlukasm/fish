import {clamp} from '../../units.js';
import {formatNumber, t} from '../../strings.js';
import {cellVariationExamples} from '../model/variation.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

const V = Object.freeze({
  width : 300,
  left : 22,
  right : 278,
  title : 16,
  control : 42,
  header : 70,
  row : 100,
  axis : 36,
  ends : 56,
  caption : 74,
  band : 12,
  dot : 2.6,
  stack : 5,
  handle : 7,
  footer : 20
});
const HALF = (V.right - V.left) / 2, MIDDLE = V.left + HALF;
const word = key => label('development.' + key);
const text = (x, y, content, anchor = 'middle', cls = '') =>
    '<text' + (cls ? ' class="' + cls + '"' : '') + ' x="' + fixed(x) + '" y="' + fixed(y) +
    '" text-anchor="' + anchor + '">' + escapeText(content) + '</text>';
export const variationPatch = fx => clamp((fx * V.width - MIDDLE) / HALF);

function traitGraphic(row, index) {
  const {key, unit, scale, blueprint, extent, interval, examples} = row;
  const transform = value => scale === 'log' ? Math.log(value) : value;
  const x = value => V.left + (V.right - V.left) * (transform(value) - transform(extent[0])) /
                                  (transform(extent[1]) - transform(extent[0]));
  const valueText = value => unit === 'role'      ? word('roleExamples.' + value)
                             : unit === 'percent' ? formatNumber(value, 0) + ' %'
                                                  : formatNumber(value, unit === 'level' ? 4 : 1);
  const values = examples.map(x), stacks = new Map();
  for (const value of values)
    stacks.set(value, (stacks.get(value) ?? 0) + 1);
  const seen = new Map();
  const dots = values
                   .map(value => {
                     const count = seen.get(value) ?? 0;
                     seen.set(value, count + 1);
                     const rise =
                         Math.min(V.stack, 2 * V.band / Math.max(1, stacks.get(value) - 1));
                     return '<circle class="aid-variation-cell" cx="' + fixed(value) + '" cy="' +
                            fixed(V.axis + (count - (stacks.get(value) - 1) / 2) * rise) + '" r="' +
                            V.dot + '"/>';
                   })
                   .join('');
  const ticks = unit === 'role' ? [ 0, 1, 2 ] : extent;
  return '<g transform="translate(0 ' + (V.header + index * V.row) + ')">' +
         text(V.left, 0, word(key), 'start', 'aid-variation-title') +
         text(V.left, 15, t('studio.development.planValue', {value : valueText(blueprint)}),
              'start', 'aid-variation-value') +
         '<path class="aid-variation-axis" d="M' + V.left + ' ' + V.axis + 'H' + V.right + '"/>' +
         '<rect class="aid-variation-band" x="' + fixed(x(interval[0])) + '" y="' +
         (V.axis - V.band / 2) + '" width="' + fixed(x(interval[1]) - x(interval[0])) +
         '" height="' + V.band + '" rx="3"/>' +
         '<path class="aid-variation-plan" d="M' + fixed(x(blueprint)) + ' ' + (V.axis - V.band) +
         'V' + (V.axis + V.band) + '"/>' + dots +
         ticks
             .map((value, i) => text(x(value), V.ends, valueText(value),
                                     i === 0                  ? 'start'
                                     : i === ticks.length - 1 ? 'end'
                                                              : 'middle'))
             .join('') +
         text(V.left, V.caption,
              word(unit === 'role'   ? 'groupRoleNote'
                   : scale === 'log' ? 'logScale.' + unit
                                     : 'units.' + unit),
              'start') +
         '</g>';
}

export function variationGraphic(value, target, family, examples) {
  const reach = HALF * clamp(value), height = V.header + examples.length * V.row + V.footer;
  const title = label('cellPicture.' + family);
  return '<svg class="aid-variation" data-variation="' + escapeText(target) +
         '" data-variation-family="' + family + '" viewBox="0 0 ' + V.width + ' ' + height +
         '" role="img" aria-label="' + escapeText(word(family)) + '">' +
         text(V.left, V.title, title, 'start', 'aid-variation-title') +
         text(V.right, V.title,
              t('studio.development.spreadValue', {n : formatNumber(Math.round(value * 100))}),
              'end', 'aid-variation-value') +
         '<path class="aid-variation-band" d="M' + MIDDLE + ' ' + (V.control - V.band) + 'L' +
         fixed(MIDDLE - reach) + ' ' + V.control + 'H' + fixed(MIDDLE + reach) + 'Z"/>' +
         '<circle class="aid-graphic-handle" data-variation-handle cx="' + fixed(MIDDLE + reach) +
         '" cy="' + V.control + '" r="' + V.handle + '"><title>' +
         escapeText(word('spreadHandle')) + '</title></circle>' +
         examples.map(traitGraphic).join('') +
         text(V.left, height - 6, word('exampleTraits'), 'start') + '</svg>';
}

export function cellVariation(center) {
  return '<details class="aid-cell-variation"><summary>' + label('cellPicture.variation') +
         '</summary>' +
         Object.entries(center.distribution)
             .filter(([ key ]) => key !== 'spread_receptors')
             .map(([ key, value ]) =>
                      variationGraphic(value, center.id, key, cellVariationExamples(center, key)))
             .join('') +
         '</details>';
}
