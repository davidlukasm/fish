import {typeChips} from './types.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {organTypes, typeOfCenter} from '../model/document.js';
import {cssColour, fishColours, pigmentColour, pigmentKind} from '../model/pigment.js';
import {BODY_FRAME} from '../model/layout.js';
import {fieldFish, skinAt} from './frame.js';
import {escapeText, fixed} from './markup.js';
import {
  hueQuality,
  LONGEST_TIME_CONSTANT,
  pigmentReflectance,
  timeConstantOf,
  timeConstantSteps,
  tuningHue
} from '../../tuning.js';
import {formatNumber, t, tList} from '../../strings.js';
import {handleWord} from './sense_marks.js';
import {clamp} from '../../units.js';
import {MOTOR_KIND} from '../../schema.js';
import {sideOf} from '../model/layout.js';

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
  return '<svg class="aid-pigment-palette" viewBox="0 0 300 300"><svg width="300" height="300" viewBox="0 0 300 300" data-pigment-amount="' +
         id + '" data-room="' + room + '" data-before="' + before + '" data-most="' + most + '">' +
         '<svg class="aid-pigment-wheel" width="300" height="300" viewBox="0 0 300 300" data-pigment-wheel="' +
         id + '">' +
         '<g class="aid-pigment-patches">' + (patches ??= wheelPatches()) +
         '</g><circle class="aid-pigment-choice" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) +
         '" r="' + W.ring + '"><title>' + escapeText(label('wheel')) + '</title></circle></svg>' +
         '<g class="aid-pigment-composition"><circle cx="150" cy="150" r="128"/>' + ring + '</g>' +
         '<circle class="aid-graphic-handle" data-graphic-handle="amount" cx="' + fixed(edge.x) +
         '" cy="' + fixed(edge.y) + '" r="6"><title>' +
         escapeText(label('amount', {n : chosen.centers.length})) + '</title></circle></svg></svg>';
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
// What the chosen kind does to the fish's colour, as rows of little fish in the colour the
// fish takes (pigment_color over the pigment's spread, body_plan.cc):
// Command: the spread follows the command past the gate (the effector output, substrate.cc), so
// a command inside the gate leaves the fish as it is.
// Time: after a strong command the spread comes on over the cells' time, 1 − e^(−t/τ).
const SPREAD = Object.freeze({
  width : 300,
  height : 80,
  left : 56,
  right : 264,
  fish : 16,
  scale : .046,
  axis : 40,
  // The ends' words, clear of a handle's word written below it.
  words : 72,
  edge : 30,
  count : 5,
  handle : 5.5,
  // A command this strong spreads the pigment nearly all the way (tanh 2 ≈ .96).
  span : 2,
  // The time row runs over twice the longest cell time.
  window : 2
});
const spreadColour = (range, d) => {
  const at = clamp(d) * (range.length - 1), k = Math.min(range.length - 2, Math.floor(at));
  return cssColour(range[k].map((v, c) => v + (range[k + 1][c] - v) * (at - k)));
};
// `place` puts the handle's word where it fits: above the handle, or below it, growing towards
// the middle, for words too long to centre on a handle near an end.
function spreadRow(organ, center, range, key, spreadAt, handle, word, marks, place = 'above') {
  const S = SPREAD, x = share => S.left + (S.right - S.left) * share;
  const fish =
      Array
          .from({length : S.count},
                (_, i) => {
                  const share = i / (S.count - 1);
                  return '<g style="fill:' + spreadColour(range, spreadAt(share)) + '">' +
                         fieldFish({cx : x(share), cy : S.fish}, S.scale, 'aid-spread-fish') +
                         '</g>';
                })
          .join('');
  const at = {x : x(handle.share), y : S.axis};
  return '<svg class="aid-effector-graphic aid-spread-picture" viewBox="0 0 ' + S.width + ' ' +
         S.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
         MOTOR_KIND.pigment + '" data-effector-side="' + sideOf(organ) +
         '" role="img" aria-label="' + escapeText(label(key + '.title')) + '">' +
         (handle.zone ?? '') + fish + '<path class="aid-sense-axis" d="M' + S.left + ' ' + S.axis +
         ' H' + S.right + '"/>' +
         '<text class="aid-handle-word" x="' + S.edge + '" y="' + S.words + '">' +
         escapeText(label(key + '.from')) + '</text><text class="aid-handle-word" x="' +
         (S.width - S.edge) + '" y="' + S.words + '" text-anchor="end">' +
         escapeText(label(key + '.to', handle.values)) + '</text>' +
         '<circle class="aid-graphic-handle" data-effector-handle="pigment:' + key +
         '" data-frame="' + S.width + ',' + S.height + '" data-center="' + escapeText(center.id) +
         '"' + marks + ' cx="' + fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' + S.handle +
         '"><title>' + escapeText(label(key + '.handle')) + '</title></circle>' +
         handleWord(at, word, place) + '</svg>';
}
function spreadPictures(state, organ, center) {
  const colours = fishColours(state.document, state.anatomy), scale = state.capabilities?.biasScale;
  if (!colours || !(scale > 0) || center.role !== 'motor')
    return '';
  const S = SPREAD, gate = Math.max(0, center.threshold) * scale,
        window = S.window * LONGEST_TIME_CONSTANT;
  const tau = timeConstantSteps(center.tau), x = share => S.left + (S.right - S.left) * share;
  const zone = '<rect class="aid-command-gate" x="' + S.left + '" y="' + (S.axis - S.handle) +
               '" width="' + fixed(x(gate / S.span) - S.left) + '" height="' + 2 * S.handle + '"/>';
  return spreadRow(organ, center, colours.range, 'command',
                   share => Math.tanh(Math.max(0, share * S.span - gate)),
                   {share : gate / S.span, zone}, t('studio.sense.gateWord'),
                   ' data-scale="' + scale + '"') +
         spreadRow(organ, center, colours.range, 'time',
                   share => -Math.expm1(-share * window / tau),
                   {share : tau * Math.LN2 / window, values : {n : window}},
                   label('time.half', {n : formatNumber(tau * Math.LN2, 0)}),
                   ' data-window="' + window + '"', 'below');
}
// The change a handle makes, from the pointer `p` in its picture's units, as a patch of the
// kind's cell.
export function pigmentPatch(name, p, marks) {
  const S = SPREAD, share = clamp((p.x - S.left) / (S.right - S.left)), id = marks.center;
  if (name === 'pigment:command') {
    const scale = Number(marks.scale);
    return {id, center : {threshold : clamp(share * S.span, 0, scale) / scale}};
  }
  if (name === 'pigment:time')
    return {
      id,
      center : {
        tau :
            timeConstantOf(Math.max(share * Number(marks.window) / Math.LN2, timeConstantSteps(0)))
      }
    };
  return null;
}
export function pigmentInspector(state, organ, center) {
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  return '<div data-pigment-block="' + escapeText(organ.id) + '">' + kindChips(organ, chosen) +
         pigmentWheel(organ, chosen, state) + '</div>' +
         spreadPictures(state, organ, chosen.centers[0]);
}
const DOTS = Object.freeze({step : 44, ends : [ 1, 2 ], inset : 16, least : 1.6, most : 8});
export function chromatophoresSvg(state, organ, chosen) {
  const types = organTypes(organ);
  const total = types.reduce((n, type) => n + type.centers.length, 0);
  if (!total)
    return '';
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
              DOTS.least + '" style="fill:' + colour + '"/>';
    }
  }
  return '<g class="aid-chromatophores' + (chosen ? ' chosen' : '') + '">' + html + '</g>';
}
