import {groupReport} from '../model/document.js';
import {BODY_MIDDLE, BODY_RADIUS} from '../model/layout.js';
import {fieldFish, fieldPoint, skinAt} from './frame.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';
import {contactHalfAngle, contactFieldOf} from '../../tuning.js';
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
const POINT = Object.freeze({least : 2, span : 6, field : .8});
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
  height : 228,
  cx : 150,
  cy : 98,
  scale : .14,
  inner : 60,
  reach : 32,
  arrow : 22,
});
export const lateralPatch = (fx, fy, direction) => {
  const L = LATERAL_FIELD;
  const angle = Math.atan2(fy * L.height - L.cy, -(fx * L.width - L.cx));
  return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - direction))))};
};
export function lateralField(state, organ) {
  const L = LATERAL_FIELD, feel = lateralFeel(state, organ), first = organ.centers[0];
  const ring = state.capabilities?.lateralRing;
  const block = '<div data-lateral-block="' + escapeText(organ.id) + '">';
  if (!feel || !ring || !first)
    return block + '</div>';
  const length = BODY_RADIUS * L.scale,
        width = (skinAt(BODY_MIDDLE.x, 1) - BODY_MIDDLE.y) * L.scale;
  const centre = {x : L.cx, y : L.cy};
  const at = (angle, r) => fieldPoint(L, angle, r);
  const count = feel.tuning.length;
  const lobe = 'M' +
               feel.tuning
                   .map((v, k) => {
                     const p = at(sampleAngle(k, count), L.inner + L.reach * v);
                     return fixed(p.x) + ' ' + fixed(p.y);
                   })
                   .join(' L') +
               'Z';
  const peak = feel.tuning.indexOf(Math.max(...feel.tuning)), angle = sampleAngle(peak, count);
  const tip = at(angle, L.inner + L.reach * feel.tuning[peak]);
  const arrow = '<path class="aid-lateral-arrow" d="' +
                arrowPath(at(angle, L.inner + L.reach * feel.tuning[peak] + L.arrow), tip) + '"/>';
  const half = radians(contactHalfAngle(first.field ?? 0));
  const boundary = at(angle + half, L.inner + L.reach), other = at(angle - half, L.inner + L.reach);
  const fish = fieldFish(L, L.scale, 'aid-lateral-fish');
  const label = key => escapeText(t('studio.lateral.' + key));
  return block + '<section class="aid-eye-section"><h4>' + label('title') + '</h4>' +
         '<svg class="aid-lateral-field" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-lateral-pad="' + escapeText(first.id) + '" data-lateral-angle="' + angle +
         '" role="img" aria-label="' + label('title') + '"><circle class="aid-lateral-limit" cx="' +
         L.cx + '" cy="' + L.cy + '" r="' + L.inner + '"/><circle class="aid-lateral-limit" cx="' +
         L.cx + '" cy="' + L.cy + '" r="' + (L.inner + L.reach) +
         '"/><path class="aid-lateral-lobe" d="' + lobe + '"/>' + fish +
         ringDiscs(lateralRing(ring, centre, length, width), feel.weights, POINT.field) + arrow +
         '<path class="aid-field-boundary" d="M' + fixed(boundary.x) + ' ' + fixed(boundary.y) +
         'L' + L.cx + ' ' + L.cy + 'L' + fixed(other.x) + ' ' + fixed(other.y) + '"/>' +
         '<circle class="aid-graphic-handle" data-graphic-handle="width" cx="' + fixed(boundary.x) +
         '" cy="' + fixed(boundary.y) + '" r="7"><title>' + t('studio.lateral.handle') +
         '</title></circle>' +
         '</svg></section></div>';
}
