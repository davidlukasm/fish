import {groupReport} from '../model/document.js';
import {fieldFish, fieldPoint} from './frame.js';
import {handleWord, senseSensitivity} from './sense_marks.js';
import {fadeRow, intensityRow, SENSE_PLOT, sensePicture} from './sense_curves.js';
import {stimulusOfShare} from './sensitivity.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';
import {contactHalfAngle, contactFieldOf, LONGEST_ADAPTATION} from '../../tuning.js';
import {degrees, radians, wrapAngle} from '../../units.js';

export function lateralFeel(state, organ) {
  const found = organ.centers.map(c => groupReport(state.document, state.anatomy, 'lateral', c.id))
                    .filter(Boolean);
  if (!found.length)
    return null;
  const mean = key =>
      found[0][key].map((_, k) => found.reduce((sum, f) => sum + f[key][k], 0) / found.length);
  return {weights : mean('weights'), tuning : mean('tuning')};
}
const sampleAngle = (k, count) => -Math.PI + (k + .5) * 2 * Math.PI / count;
// The engine's sampling ring, forward and rightward in body radii, drawn head to the left.
export const lateralRing = (ring, centre, length, width) => ring.map(
    ([ forward, right ]) => ({x : centre.x - forward * length, y : centre.y + right * width}));
const POINT = Object.freeze({least : 2, span : 6});
export function ringDiscs(points, weights, scale = 1) {
  const most = Math.max(...weights, Number.EPSILON);
  return points
      .map((p, k) => '<circle class="aid-lateral-point" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
                     '" r="' +
                     fixed(scale *
                           (POINT.least + POINT.span * Math.sqrt(Math.max(0, weights[k]) / most))) +
                     '"/>')
      .join('');
}
const ARROW = Object.freeze({head : 9, spread : .45});
export function arrowPath(from, to, head = ARROW.head) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const side = turn => {
    const c = Math.cos(turn), s = Math.sin(turn);
    return fixed(to.x - head * (ux * c - uy * s)) + ' ' + fixed(to.y - head * (ux * s + uy * c));
  };
  return 'M' + fixed(from.x) + ' ' + fixed(from.y) + ' L' + fixed(to.x) + ' ' + fixed(to.y) + ' M' +
         side(ARROW.spread) + ' L' + fixed(to.x) + ' ' + fixed(to.y) + ' L' + side(-ARROW.spread);
}

const LATERAL_FIELD = Object.freeze({
  width : 300,
  height : 216,
  cx : 150,
  cy : 108,
  scale : .14,
  inner : 58,
  reach : 34,
  arrow : 18,
  // The picture's name stands top left, clear of the lobe.
  title : [ 4, 12 ]
});
export const lateralPatch = (fx, fy, direction) => {
  const L = LATERAL_FIELD;
  const angle = Math.atan2(fy * L.height - L.cy, -(fx * L.width - L.cx));
  return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - direction))))};
};
// The steady current of the time row, as many times the cells' half answer.
const LATERAL_HELD = 4;
// Where the water the cells feel comes from: the lobe round the fish, its width at the handle.
// Below, what they report (sense_curves.js): over how strong the current is, and how they get used
// to a steady one, so they report changes: a neighbour starting off, a current setting in.
export function lateralField(state, organ, held = null) {
  const L = LATERAL_FIELD, feel = lateralFeel(state, organ), first = organ.centers[0];
  const block = '<div data-sense-block="' + escapeText(organ.id) + '">';
  if (!feel || !first)
    return block + '</div>';
  const at = (angle, r) => fieldPoint(L, angle, r);
  const count = feel.tuning.length, most = Math.max(...feel.tuning, Number.EPSILON);
  const radius = v => L.inner + L.reach * v / most;
  const lobe = 'M' +
               feel.tuning
                   .map((v, k) => {
                     const p = at(sampleAngle(k, count), radius(v));
                     return fixed(p.x) + ' ' + fixed(p.y);
                   })
                   .join(' L') +
               'Z';
  const peak = feel.tuning.indexOf(most), angle = sampleAngle(peak, count);
  const arrow = '<path class="aid-lateral-arrow" d="' +
                arrowPath(at(angle, L.inner + L.reach + L.arrow), at(angle, L.inner + L.reach)) +
                '"/>';
  const half = radians(contactHalfAngle(first.field ?? 0));
  const boundary = at(angle + half, L.inner + L.reach), other = at(angle - half, L.inner + L.reach);
  const word = (key, values) => t('studio.lateral.' + key, values);
  return block + '<svg class="aid-lateral-field" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-sense-field="' + escapeText(first.id) + '" data-sense-organ="' +
         escapeText(organ.id) + '" data-sense-aim="' + fixed(angle) + '" data-sense-centre="' +
         L.cx + ',' + L.cy + '" role="img" aria-label="' + escapeText(word('title')) +
         '"><text class="aid-handle-word" x="' + L.title[0] + '" y="' + L.title[1] + '">' +
         escapeText(word('lobe')) + '</text><circle class="aid-lateral-limit" cx="' + L.cx +
         '" cy="' + L.cy + '" r="' + (L.inner + L.reach) + '"/><path class="aid-lateral-lobe" d="' +
         lobe + '"/>' + fieldFish(L, L.scale, 'aid-lateral-fish') + arrow +
         '<path class="aid-field-boundary" d="M' + fixed(boundary.x) + ' ' + fixed(boundary.y) +
         'L' + L.cx + ' ' + L.cy + 'L' + fixed(other.x) + ' ' + fixed(other.y) + '"/>' +
         handleWord(boundary, word('field', {degrees : Math.round(degrees(half))})) +
         '<circle class="aid-graphic-handle" data-sense-mark="width" cx="' + fixed(boundary.x) +
         '" cy="' + fixed(boundary.y) + '" r="7"><title>' + escapeText(word('handle')) +
         '</title></circle></svg>' + lateralCurves(state, first, held, word) + '</div>';
}
function lateralCurves(state, center, held, word) {
  const sensitive = held ?? senseSensitivity(state, center), dimmest = state.anatomy?.lightDimmest;
  if (sensitive === null || !(dimmest > 0))
    return '';
  const half = stimulusOfShare(1 - sensitive, dimmest);
  const adapts = groupReport(state.document, state.anatomy, 'senses', center.id)?.adapt?.steps > 0;
  return sensePicture(center, word('cells'), [
    intensityRow(sensitive, dimmest, {
      report : word('report'),
      from : word('faint'),
      to : word('strong'),
      handle : word('sensitivityHandle')
    }),
    ...(adapts ? [ fadeRow(center, LATERAL_HELD * half, half, {
      report : word('report'),
      from : word('steady'),
      to : word('later', {n : SENSE_PLOT.window * LONGEST_ADAPTATION}),
      half : n => word('fade', {n}),
      handle : word('fadeHandle')
    }) ]
               : [])
  ]);
}
