import {formatNumber, t} from '../../strings.js';
import {radians} from '../../units.js';
import {fedBy, regionPlan, routedLinks} from '../model/regions.js';
import {findCenter} from '../model/document.js';
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
const line = (d, cls = '', key = null) => `<path class="region-line ${cls}"${
    key ? ` data-tectum-link="${escapeText(key)}"` : ''} d="${d}"/>`;
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

function cellPoints(count, x, y, width, height) {
  if (!count)
    return '';
  const columns = Math.min(count, Math.ceil(Math.sqrt(count * width / height)));
  const rows = Math.ceil(count / columns), step = Math.min(9, width / columns, height / rows);
  return Array
      .from({length : count},
            (_, i) => `<circle class="tectum-cell" cx="${
                fixed(x + width / 2 + (i % columns - (columns - 1) / 2) * step)}" cy="${
                fixed(y + height / 2 + (Math.floor(i / columns) - (rows - 1) / 2) * step)}" r="${
                fixed(Math.min(2.6, step * .31))}"/>`)
      .join('');
}

function incomingColours(doc, organ, links) {
  const own = new Set(organ.centers.map(c => c.id)), colours = new Map();
  for (const link of links) {
    if (!own.has(link.to))
      continue;
    const source = findCenter(doc, link.from);
    const profile = source?.organ.type === 'eye' &&
                    source.organ.field.profiles.find(p => p.id === source.center.profile);
    if (!profile)
      continue;
    if (!colours.has(link.to))
      colours.set(link.to, new Set());
    colours.get(link.to).add(profileColor(profile));
  }
  return colours;
}

function poolPaths(organ, maps, channels, width, common, links) {
  const pool = organ.centers.find(c => c.node === 'inhibit');
  const own = new Map(organ.centers.map(c => [c.id, c]));
  return links
      .map(link => {
        if (!link.wire.inner || !own.has(link.from) || !own.has(link.to) ||
            link.from !== pool.id && link.to !== pool.id)
          return '';
        const feed = link.to === pool.id, center = own.get(feed ? link.from : link.to);
        const index = maps.findIndex(n => n.node === center.node);
        if (index < 0)
          return '';
        const col = Math.floor(index / channels), row = index % channels;
        const x = D.left + (col + .5) * width - 2, y = D.grid + row * D.row + 28;
        return feed ? line(`M${fixed(x - 5)} ${y}v1H344V${common - 6}H338m3-2l-3 2 3 2`,
                           'tectum-route tectum-feed', link.key)
                    : line(`M338 ${common + 6}H354V${y + 4}H${fixed(x + 5)}V${y}m-3 0h6`,
                           'memory tectum-route tectum-return', link.key);
      })
      .join('');
}

export function tectumPictures(state, organ) {
  const plan = regionPlan(state.document, organ), maps = plan.nodes.filter(n => n.band);
  const bands = [...new Map(maps.map(n => [n.band.join(':'), n.band])).values() ];
  const channels = maps.length / bands.length;
  const eyes = fedBy(state.document, organ).filter(o => o.type === 'eye' && o.field);
  const sides = [...new Set((eyes.length ? eyes : [ organ ]).map(o => o.side < 0 ? -1 : 1)) ];
  const links = routedLinks(state.document, state.sites);
  const colours = incomingColours(state.document, organ, links);
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
  const bottom = D.grid + channels * D.row, common = bottom + 76, choiceY = common + 29;
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
                  return text(68, D.grid + row * D.row + 21,
                              word(organ.region.colours ? 'channel' : 'allColours', {n : row + 1}),
                              'end') +
                         bands
                             .map(([ lo, hi ], col) => {
                               const node = maps[col * channels + row];
                               const center = organ.centers.find(c => c.node === node.node);
                               const x = D.left + col * width, y = D.grid + row * D.row;
                               const shades = [...colours.get(center?.id) ?? [] ];
                               const stripes =
                                   shades
                                       .map((color, i) => `<rect class="tectum-colour" x="${
                                                fixed(x + 1 +
                                                      i * (width - 6) /
                                                          shades.length)}" y="${y + 1}" width="${
                                                fixed((width - 6) /
                                                      shades.length)}" height="5" style="fill:${
                                                color}"/>`)
                                       .join('');
                               return `<g data-tectum-node="${node.node}" data-tectum-band="${lo}:${
                                   hi}" data-tectum-channel="${row}"><title>${
                                   escapeText(word('cells', {
                                     n : center?.copies ?? 0
                                   }))}</title><rect class="tectum-channel" x="${fixed(x)}" y="${
                                   y}" width="${fixed(width - 4)}" height="28"/>${stripes}${
                                   cellPoints(center?.copies ?? 0, x + 3, y + 8, width - 10,
                                              17)}</g>`;
                             })
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
  const used = maps.filter(n => organ.centers.some(c => c.node === n.node)).length;
  const slots = text(18, bottom + 23, word('places', {n : used, most : plan.most.maps})) +
                Array
                    .from({length : plan.most.maps},
                          (_, i) => `<rect class="tectum-slot" data-tectum-slot="${
                              i < used ? 'occupied' : 'free'}" x="${174 + i * 21}" y="${
                              bottom + 11}" width="15" height="15" rx="2"/>`)
                    .join('');
  const cellsOfInhibition = organ.centers.find(c => c.node === 'inhibit')?.copies ?? 0;
  const feedback = cellsOfInhibition
                       ? poolPaths(organ, maps, channels, width, common, links) +
                             `<g data-tectum-node="inhibit"><title>${escapeText(word('cells', {
                               n : cellsOfInhibition
                             }))}</title><rect class="tectum-inhibition" x="78" y="${
                                 common - 17}" width="260" height="34" rx="6"/>${
                                 cellPoints(cellsOfInhibition, 178, common - 12, 152, 24)}</g>`
                       : '';
  const inhibition =
      [ 0, 1, 2 ]
          .map((value, i) => option(organ, 'contrast', value, 18 + i * 109, choiceY, 103, 32,
                                    text(51.5, 21, word('inhibition.' + value), 'middle'),
                                    word('inhibition.' + value), organ.region.contrast === value))
          .join('');
  const mapping =
      picture(organ, choiceY + 47, word('channelsTitle'),
              text(18, 20, word('channelsTitle')) + split + angles + cells + slots + feedback +
                  text(18, 92, word('limit', {n : channels, most : choices.at(-1)})) +
                  text(cellsOfInhibition ? 90 : 180, common + 4, word('commonInhibition'),
                       cellsOfInhibition ? 'start' : 'middle') +
                  inhibition);
  return sight + mapping;
}
