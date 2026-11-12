import {formatNumber, t} from '../../strings.js';
import {radians} from '../../units.js';
import {fedBy, regionPlan} from '../model/regions.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {escapeText, fixed} from './markup.js';
import {profileColor} from './spectrum.js';

const D = Object.freeze({
  width : 360,
  origin : {x : 180, y : 148},
  radius : 90,
  left : 78,
  right : 338,
  row : 34,
  grid : 125
});
const word = (key, vars) => t('studio.regions.tectumMap.' + key, vars);
const text = (x, y, value, anchor = 'start') =>
    `<text x="${fixed(x)}" y="${fixed(y)}" text-anchor="${anchor}">${escapeText(value)}</text>`;
const line = (d, cls = '') => `<path class="region-line ${cls}" d="${d}"/>`;
const picture = (organ, height, title, content) =>
    `<svg class="aid-tectum-map" viewBox="0 0 ${D.width} ${height}" data-region-picture="${
        escapeText(organ.id)}" role="group" aria-label="${escapeText(title)}">${content}</svg>`;
const at = (angle, side, radius = D.radius) => ({
  x : D.origin.x + side * radius * Math.sin(radians(angle)),
  y : D.origin.y - radius * Math.cos(radians(angle))
});
const sector = (lo, hi, side) => {
  const a = at(lo, side), b = at(hi, side);
  return `M${D.origin.x} ${D.origin.y}L${fixed(a.x)} ${fixed(a.y)}A${D.radius} ${D.radius} 0 0 ${
      side > 0 ? 1 : 0} ${fixed(b.x)} ${fixed(b.y)}Z`;
};
function option(organ, key, value, x, y, width, height, content, title, selected) {
  return `<g class="region-button${selected ? ' selected' : ''}" data-region-setting="${
      key}" data-region-value="${value}" data-organ-id="${
      escapeText(organ.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${
      escapeText(title)}" transform="translate(${x} ${y})"><rect width="${width}" height="${
      height}" rx="6"/>${content}</g>`;
}

export function tectumPictures(state, organ) {
  const plan = regionPlan(state.document, organ), maps = plan.nodes.filter(n => n.band);
  const bands = [...new Map(maps.map(n => [n.band.join(':'), n.band])).values() ];
  const channels = maps.length / bands.length;
  const eyes = fedBy(state.document, organ).filter(o => o.type === 'eye' && o.field);
  const sides = [...new Set((eyes.length ? eyes : [ organ ]).map(o => o.side < 0 ? -1 : 1)) ];
  const profiles = eyes.reduce(
      (found, eye) => eye.field.profiles.length > found.length ? eye.field.profiles : found, []);
  const settings = ORGAN_BY_KEY.tectum.settings.resolution;
  const choices =
      Array.from({length : settings.most - settings.least + 1}, (_, i) => i + settings.least)
          .filter(resolution =>
                      regionPlan(state.document, {...organ, region : {...organ.region, resolution}})
                          .most.resolution === resolution);
  const fan =
      sides
          .map(side => `<g data-tectum-side="${side}">` +
                       bands
                           .map(([ lo, hi ]) =>
                                    `<path class="region-fan" d="${sector(lo, hi, side)}"/>`)
                           .join('') +
                       '</g>')
          .join('');
  const origin = D.origin;
  const fish = line(
      `M${origin.x} ${origin.y - 23}Q${origin.x - 13} ${origin.y} ${origin.x} ${origin.y + 22}Q${
          origin.x +
          13} ${origin.y} ${origin.x} ${origin.y - 23}M${origin.x} ${origin.y + 22}l-8 10h16Z`);
  const choicesWidth = 316 / choices.length;
  const division =
      choices
          .map((count, i) => {
            const width = choicesWidth - 6, bar = (width - 12) / count;
            const illustration =
                Array
                    .from({length : count},
                          (_, k) => `<rect class="tectum-partition" x="${
                              fixed(6 + k * bar)}" y="7" width="${fixed(bar - 2)}" height="14"/>`)
                    .join('');
            return option(organ, 'resolution', count, 22 + i * choicesWidth, 222, width, 39,
                          illustration + text(width / 2, 33, formatNumber(count), 'middle'),
                          word('directions', {n : count}), count === bands.length);
          })
          .join('');
  const field =
      word('field', {lo : formatNumber(plan.view.lo, 1), hi : formatNumber(plan.view.hi, 1)});
  const sight = picture(
      organ, 272, word('directionsTitle'),
      text(18, 20, word('directionsTitle')) + text(18, 39, field) +
          text(origin.x, 55, word('front'), 'middle') +
          sides
              .map(side => text(origin.x + side * 105, origin.y, word(side < 0 ? 'left' : 'right'),
                                side < 0 ? 'end' : 'start'))
              .join('') +
          fan + fish + text(18, 202, eyes.length ? word('fromEye') : word('noEye')) + division);

  const columns = bands.length, width = (D.right - D.left) / columns;
  const bottom = D.grid + channels * D.row, common = bottom + 48, choiceY = common + 29;
  const split = [ 0, 1 ]
                    .map((value, i) => option(
                             organ, 'colours', value, 18 + i * 164, 35, 158, 36,
                             text(79, 23, word(value ? 'separate' : 'together'), 'middle'),
                             word(value ? 'separate' : 'together'), organ.region.colours === value))
                    .join('');
  const cells =
      Array
          .from({length : channels},
                (_, row) => {
                  const color = organ.region.colours && profiles[row] ? profileColor(profiles[row])
                                                                      : 'var(--region-primary)';
                  return text(68, D.grid + row * D.row + 21,
                              word(organ.region.colours ? 'channel' : 'allColours', {n : row + 1}),
                              'end') +
                         bands
                             .map(([ lo, hi ], col) =>
                                      `<rect class="tectum-channel" data-tectum-band="${lo}:${
                                          hi}" data-tectum-channel="${row}" x="${
                                          fixed(D.left +
                                                col * width)}" y="${D.grid + row * D.row}" width="${
                                          fixed(width - 4)}" height="28" style="fill:${color}"/>`)
                             .join('');
                })
          .join('');
  const angles =
      '<g class="tectum-angles">' +
      bands
          .map(([ lo, hi ], i) => text(D.left + (i + .5) * width, D.grid - 8,
                                       `${formatNumber(lo, 0)}–${formatNumber(hi, 0)}°`, 'middle'))
          .join('') +
      '</g>';
  const cellsOfInhibition = plan.nodes.find(n => n.node === 'inhibit')?.set.copies ?? 0;
  const feedback =
      cellsOfInhibition
          ? line(`M${D.left} ${bottom}H${D.right}M180 ${bottom}V${common - 18}m-4-6l4 6 4-6`,
                 'memory') +
                `<rect class="tectum-inhibition" x="70" y="${
                    common - 15}" width="220" height="30" rx="6"/>` +
                line(`M290 ${common}H350V${D.grid + 14}H${D.right}M${D.right} ${D.grid + 6}V${
                         D.grid + 22}`,
                     'memory')
          : '';
  const inhibition =
      [ 0, 1, 2 ]
          .map((value, i) => option(organ, 'contrast', value, 18 + i * 109, choiceY, 103, 32,
                                    text(51.5, 21, word('inhibition.' + value), 'middle'),
                                    word('inhibition.' + value), organ.region.contrast === value))
          .join('');
  const mapping =
      picture(organ, choiceY + 47, word('channelsTitle'),
              text(18, 20, word('channelsTitle')) + split + angles + cells + feedback +
                  text(18, 92, word('limit', {n : channels, most : choices.at(-1)})) +
                  text(180, common + 4, word('commonInhibition'), 'middle') + inhibition);
  return sight + mapping;
}
