import {typeChips} from './types.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {organTypes, typeOfCenter} from '../model/document.js';
import {cssColour, fishColours, pigmentColour, pigmentKind} from '../model/pigment.js';
import {BODY_FRAME} from '../model/layout.js';
import {skinAt} from './frame.js';
import {escapeText, fixed} from './markup.js';
import {hueQuality, pigmentReflectance, tuningHue} from '../../tuning.js';
import {formatNumber, t, tList} from '../../strings.js';

const label = (key, values) => t('studio.pigment.' + key, values);
const kindName = rgb => tList('studio.pigment.kinds')[pigmentKind(rgb)] ?? '';

const PIGMENT_WHEEL =
    Object.freeze({size : 300, centre : 150, radius : 105, rings : 8, sectors : 36, ring : 8});
const W = PIGMENT_WHEEL, TURN = 360, HALF_TURN = 180;
const wheelAt = (shown, r) => ({
  x : W.centre + r * Math.sin(shown * Math.PI / HALF_TURN),
  y : W.centre - r * Math.cos(shown * Math.PI / HALF_TURN)
});
const wheelRadius = width => W.radius * (1 - width * width);
const wheelWidth = r => Math.sqrt(1 - Math.min(1, r / W.radius));
const wheelPoint = center =>
    wheelAt((tuningHue(center.q1) + HALF_TURN) % TURN, wheelRadius(center.qwidth));
export function pigmentWheelPatch(fx, fy) {
  const dx = fx * W.size - W.centre, dy = W.centre - fy * W.size;
  const shown = (Math.atan2(dx, dy) * HALF_TURN / Math.PI + TURN) % TURN;
  return {q1 : hueQuality((shown + HALF_TURN) % TURN), qwidth : wheelWidth(Math.hypot(dx, dy))};
}
function wheelPatches() {
  const step = TURN / W.sectors, ring = W.radius / W.rings;
  let html = '';
  for (let k = 0; k < W.rings; ++k)
    for (let j = 0; j < W.sectors; ++j) {
      const inner = k * ring, outer = (k + 1) * ring, from = j * step, to = (j + 1) * step;
      const colour =
          pigmentReflectance((from + step / 2 + HALF_TURN) % TURN, wheelWidth(inner + ring / 2));
      const [a, b, c, d] =
          [ wheelAt(from, inner), wheelAt(from, outer), wheelAt(to, outer), wheelAt(to, inner) ];
      html += '<path d="M' + fixed(a.x) + ' ' + fixed(a.y) + ' L' + fixed(b.x) + ' ' + fixed(b.y) +
              ' A' + fixed(outer) + ' ' + fixed(outer) + ' 0 0 1 ' + fixed(c.x) + ' ' + fixed(c.y) +
              ' L' + fixed(d.x) + ' ' + fixed(d.y) +
              (inner > 0 ? ' A' + fixed(inner) + ' ' + fixed(inner) + ' 0 0 0 ' + fixed(a.x) + ' ' +
                               fixed(a.y)
                         : '') +
              'Z" fill="' + cssColour(colour) + '"/>';
    }
  return html;
}
let patches = null;
function pigmentWheel(organ, chosen, state) {
  const center = chosen.centers[0], at = wheelPoint(center), most = ORGAN_BY_KEY[organ.type].nodes;
  const before = organ.centers.length - chosen.centers.length, room = most - before, radius = 128;
  const arc = (from, to) => {
    const a = wheelAt(from * TURN, radius), b = wheelAt(to * TURN, radius);
    return 'M' + fixed(a.x) + ' ' + fixed(a.y) + ' A' + radius + ' ' + radius + ' 0 ' +
           (to - from > .5 ? 1 : 0) + ' 1 ' + fixed(b.x) + ' ' + fixed(b.y);
  };
  let offset = 0;
  const types = organTypes(organ).filter(type => type.id !== chosen.id).concat(chosen);
  const ring = types
                   .map(type => {
                     const start = offset / most;
                     offset += type.centers.length;
                     return '<path d="' + arc(start + .002, Math.min(.999, offset / most)) +
                            '" stroke="' + cssColour(pigmentColour(type.centers[0])) + '"/>';
                   })
                   .join('');
  const edge = wheelAt(Math.min(.999, (before + chosen.centers.length) / most) * TURN, radius);
  const id = escapeText(center.id);
  return '<svg class="aid-pigment-palette" viewBox="0 0 300 360"><svg width="300" height="300" viewBox="0 0 300 300" data-pigment-amount="' +
         id + '" data-room="' + room + '" data-before="' + before + '" data-most="' + most + '">' +
         '<svg class="aid-pigment-wheel" width="300" height="300" viewBox="0 0 300 300" data-pigment-wheel="' +
         id + '">' +
         '<g class="aid-pigment-patches">' + (patches ??= wheelPatches()) +
         '</g><circle class="aid-pigment-choice" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) +
         '" r="' + W.ring + '"><title>' + escapeText(label('wheel')) + '</title></circle></svg>' +
         '<g class="aid-pigment-composition"><circle cx="150" cy="150" r="128"/>' + ring + '</g>' +
         '<circle class="aid-graphic-handle" data-graphic-handle="amount" cx="' + fixed(edge.x) +
         '" cy="' + fixed(edge.y) + '" r="6"><title>' +
         escapeText(label('amount', {n : chosen.centers.length})) + '</title></circle></svg>' +
         colourRange(state) + '</svg>';
}
function kindChips(organ, chosen) {
  return typeChips(organ, chosen, type => {
    const rgb = pigmentColour(type.centers[0]);
    return {icon : '<i style="background:' + cssColour(rgb) + '"></i>', name : kindName(rgb)};
  }, {add : label('add'), remove : label('remove')});
}
export function pigmentAmount(fx, fy, room, before = 0, most = room) {
  const angle =
      (Math.atan2(fx * W.size - W.centre, W.centre - fy * W.size) / (2 * Math.PI) + 1) % 1;
  return Math.max(1, Math.min(room, Math.round(angle * most) - before));
}
const RANGE = Object.freeze({
  width : 240,
  height : 62,
  skin : 26,
  gap : 8,
  top : 20,
  band : 22,
  mark : 5,
  above : 10,
  label : 58
});
function colourRange(state) {
  const colours = fishColours(state.document, state.anatomy);
  if (!colours)
    return '';
  const R = RANGE, left = R.skin + R.gap, span = R.width - left;
  const stops = colours.range
                    .map((rgb, k) => '<stop offset="' + fixed(k / (colours.range.length - 1)) +
                                     '" stop-color="' + cssColour(rgb) + '"/>')
                    .join('');
  const x = left + span * colours.restShare;
  return '<svg x="30" y="300" width="240" height="62" class="aid-pigment-range" viewBox="0 0 ' +
         R.width + ' ' + R.height + '" role="img" aria-label="' + escapeText(label('range')) +
         '"><defs><linearGradient id="aid-pigment-range">' + stops + '</linearGradient></defs>' +
         '<rect class="skin" x="0" y="' + R.top + '" width="' + R.skin + '" height="' + R.band +
         '" fill="' + cssColour(colours.skin) + '"><title>' + escapeText(label('skin')) +
         '</title></rect><rect x="' + left + '" y="' + R.top + '" width="' + span + '" height="' +
         R.band + '" fill="url(#aid-pigment-range)"/><path class="aid-pigment-rest" d="M' +
         fixed(x) + ' ' + R.top + ' l' + -R.mark + ' ' + -R.mark + ' h' + 2 * R.mark +
         'Z"><title>' + escapeText(label('rest')) + '</title></path></svg>';
}
export function pigmentInspector(state, organ, center) {
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  const times = state.anatomy?.pigmentTimes;
  const title = times ? label('times', {
    red : formatNumber(times[0], 1),
    green : formatNumber(times[1], 1),
    blue : formatNumber(times[2], 1)
  })
                      : '';
  return '<div data-pigment-block="' + escapeText(organ.id) + '"' +
         (title ? ' title="' + escapeText(title) + '"' : '') + '>' + kindChips(organ, chosen) +
         pigmentWheel(organ, chosen, state) + '</div>';
}
const DOTS = Object.freeze({step : 44, ends : [ 1, 2 ], inset : 16, least : 1.6, most : 8});
export function chromatophoresSvg(state, organ, chosen) {
  const types = organTypes(organ);
  const total = types.reduce((n, type) => n + type.centers.length, 0);
  if (!total)
    return '';
  const rest = fishColours(state.document, state.anatomy)?.restShare ?? 0;
  const gathered = DOTS.least + (DOTS.most - DOTS.least) * rest;
  const kinds = types.flatMap(
      type => Array(type.centers.length).fill(cssColour(pigmentColour(type.centers[0]))));
  let html = '', k = 0;
  const [front, back] = DOTS.ends.map(n => n * DOTS.step);
  for (let x = BODY_FRAME.snout + front; x <= BODY_FRAME.tail - back; x += DOTS.step) {
    const top = skinAt(x, -1) + DOTS.inset, bottom = skinAt(x, 1) - DOTS.inset;
    for (let y = top + ((x / DOTS.step) % 2) * DOTS.step / 2; y <= bottom; y += DOTS.step) {
      const colour = kinds[k++ % kinds.length];
      html += (chosen ? '<circle class="spread" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                            DOTS.most + '" style="fill:' + colour + '"/>'
                      : '') +
              '<circle class="gathered" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
              fixed(gathered) + '" style="fill:' + colour + '"/>';
    }
  }
  return '<g class="aid-chromatophores' + (chosen ? ' chosen' : '') + '">' + html + '</g>';
}
