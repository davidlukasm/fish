import {typeChips} from './types.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {organTypes, typeOfCenter} from '../model/document.js';
import {cssColour, fishColours, pigmentColour, pigmentKind} from '../model/pigment.js';
import {BODY_FRAME} from '../model/layout.js';
import {skinAt} from './frame.js';
import {escapeText, fixed, trackShare, widthTrack} from './markup.js';
import {hueQuality, pigmentReflectance, tuningHue} from '../../tuning.js';
import {t, tList} from '../../strings.js';

// The skin's pigment cells, as real fish, octopus and chameleons have them: kinds of cell, each
// with a pigment of its own colour. At rest a cell keeps its pigment gathered; excited, it spreads
// it over the skin, and the fish takes its colour.
const label = (key, values) => t('studio.pigment.' + key, values);
const kindName = rgb => tList('studio.pigment.kinds')[pigmentKind(rgb)] ?? '';

// The pigment wheel: every pigment a cell can carry, by the colour it shows. Around the wheel
// the hue it shows (the opposite of the one it absorbs); from the rim inwards it absorbs ever more
// broadly, down to black in the middle, as melanin does: at a width w it lies 1 - w² of the way
// out, so the narrow pigments, which absorb hardly anything between the colour channels, take a
// thin rim and the colours room. RINGS × SECTORS patches paint it, each in the colour of its
// pigment; the cell's pigment is a ring.
const PIGMENT_WHEEL =
    Object.freeze({size : 200, centre : 100, radius : 88, rings : 8, sectors : 36, ring : 9});
const W = PIGMENT_WHEEL, TURN = 360, HALF_TURN = 180;
const wheelAt = (shown, r) => ({
  x : W.centre + r * Math.sin(shown * Math.PI / HALF_TURN),
  y : W.centre - r * Math.cos(shown * Math.PI / HALF_TURN)
});
// Where a cell's pigment lies on the wheel, and the pigment under a pointer at (fx, fy).
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
function pigmentWheel(center) {
  const at = wheelPoint(center);
  return '<svg class="aid-pigment-wheel" data-pigment-wheel="' + escapeText(center.id) +
         '" viewBox="0 0 ' + W.size + ' ' + W.size + '" role="img" aria-label="' +
         escapeText(label('wheel')) + '"><g class="aid-pigment-patches">' +
         (patches ??= wheelPatches()) + '</g><circle class="aid-pigment-rim" cx="' + W.centre +
         '" cy="' + W.centre + '" r="' + W.radius + '"/><circle class="aid-pigment-choice" cx="' +
         fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' + W.ring + '"/></svg>';
}
// The kinds of cell as chips in their pigment's colour, the chosen one marked; one more kind can
// be added while there is room, the chosen one removed while there are others.
function kindChips(organ, chosen) {
  return typeChips(organ, chosen, type => {
    const rgb = pigmentColour(type.centers[0]);
    return {icon : '<i style="background:' + cssColour(rgb) + '"></i>', name : kindName(rgb)};
  }, {add : label('add'), remove : label('remove')});
}
// How much pigment a kind of cell has: its nodes, along a track up to all the organ has room for.
const AMOUNT = Object.freeze({width : 240, height : 34, track : [ 30, 200 ], y : 16});
function amountTrack(organ, chosen) {
  const most = ORGAN_BY_KEY[organ.type].nodes,
        room = most - organ.centers.length + chosen.centers.length;
  const share = room > 1 ? (chosen.centers.length - 1) / (room - 1) : 1;
  return '<div class="aid-pigment-amount"><span>' +
         escapeText(label('amount', {n : chosen.centers.length})) + '</span><svg viewBox="0 0 ' +
         AMOUNT.width + ' ' + AMOUNT.height + '" data-pigment-amount="' +
         escapeText(chosen.centers[0].id) + '" data-room="' + room + '">' +
         widthTrack(AMOUNT.track, AMOUNT.y, share, 'data-graphic-handle="amount"',
                    label('amount', {n : room})) +
         '</svg></div>';
}
// The nodes a pointer along the amount track asks for.
export const pigmentAmount = (fx, room) =>
    1 + Math.round(trackShare(fx * AMOUNT.width, AMOUNT.track) * Math.max(0, room - 1));
// The fish's colours from the engine: from its pigment gathered to spread fully, its ground
// colour marked where its cells' resting activity leaves it, its skin without pigment beside.
const RANGE = Object.freeze({
  width : 240,
  height : 58,
  skin : 26,
  gap : 8,
  top : 16,
  band : 22,
  mark : 5,
  above : 11,
  label : 54
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
  return '<svg class="aid-pigment-range" viewBox="0 0 ' + R.width + ' ' + R.height +
         '" role="img" aria-label="' + escapeText(label('range')) +
         '"><defs><linearGradient id="aid-pigment-range">' + stops + '</linearGradient></defs>' +
         '<rect class="skin" x="0" y="' + R.top + '" width="' + R.skin + '" height="' + R.band +
         '" fill="' + cssColour(colours.skin) + '"><title>' + escapeText(label('skin')) +
         '</title></rect><rect x="' + left + '" y="' + R.top + '" width="' + span + '" height="' +
         R.band + '" fill="url(#aid-pigment-range)"/><path class="aid-pigment-rest" d="M' +
         fixed(x) + ' ' + R.top + ' l' + -R.mark + ' ' + -R.mark + ' h' + 2 * R.mark +
         'Z"/><text x="' + fixed(x) + '" y="' + R.above + '" text-anchor="middle">' +
         escapeText(label('rest')) + '</text><text x="' + left + '" y="' + R.label + '">' +
         escapeText(label('gathered')) + '</text><text x="' + R.width + '" y="' + R.label +
         '" text-anchor="end">' + escapeText(label('spread')) + '</text></svg>';
}
export function pigmentInspector(state, organ, center) {
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  return '<div data-pigment-block="' + escapeText(organ.id) + '">' + kindChips(organ, chosen) +
         pigmentWheel(chosen.centers[0]) + amountTrack(organ, chosen) + colourRange(state) +
         '</div>';
}
// The organ on the fish: pigment cells all over the skin, every DOTS.step along and across it
// (from DOTS.ends steps behind the snout to as many before the tail, `inset` inside the skin),
// each of a kind by its share of the nodes; gathered small at rest (by the ground colour's place
// in the range), with the spread they take shown faintly while the organ is chosen.
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
