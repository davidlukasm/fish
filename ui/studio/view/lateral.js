import {ATELIER_LIMITS} from '../../schema.js';
import {groupReport} from '../model/document.js';
import {BODY_MIDDLE, BODY_RADIUS} from '../model/layout.js';
import {fieldFish, fieldPoint, skinAt} from './frame.js';
import {adaptationMarks, cellMarks, senseSensitivity, sensitivityHandle} from './sense_marks.js';
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
  arc : 100,
  arrow : 18,
  // The pores run along the flank, from behind the head to before the tail, inside the outline.
  pores : [ .22, .86 ],
  flank : .7
});
export const lateralPatch = (fx, fy, direction) => {
  const L = LATERAL_FIELD;
  const angle = Math.atan2(fy * L.height - L.cy, -(fx * L.width - L.cx));
  return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - direction))))};
};
// The pores of one side, where the organ's cells sit, drawn to the picture's small fish.
function porePlaces(side) {
  const L = LATERAL_FIELD, snout = BODY_MIDDLE.x - BODY_RADIUS;
  return Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const x =
        snout + 2 * BODY_RADIUS *
                    (L.pores[0] + (L.pores[1] - L.pores[0]) * k / (ATELIER_LIMITS.max_copies - 1));
    const y = BODY_MIDDLE.y + (skinAt(x, side) - BODY_MIDDLE.y) * L.flank;
    return {x : L.cx + (x - BODY_MIDDLE.x) * L.scale, y : L.cy + (y - BODY_MIDDLE.y) * L.scale};
  });
}
// One picture holds the whole organ: the pores with its cells along the flank, the lobe of where
// the water it feels comes from, as large as the cells are sensitive, its width, and the arc of how
// long a steady current takes until the cells no longer answer it.
export function lateralField(state, organ, held = null) {
  const L = LATERAL_FIELD, feel = lateralFeel(state, organ), first = organ.centers[0];
  const block = '<div data-sense-block="' + escapeText(organ.id) + '">';
  if (!feel || !first)
    return block + '</div>';
  const at = (angle, r) => fieldPoint(L, angle, r);
  const count = feel.tuning.length, most = Math.max(...feel.tuning, Number.EPSILON);
  const sensitive = held ?? senseSensitivity(state, first) ?? 0;
  const radius = v => L.inner + L.reach * sensitive * v / most;
  const lobe = 'M' +
               feel.tuning
                   .map((v, k) => {
                     const p = at(sampleAngle(k, count), radius(v));
                     return fixed(p.x) + ' ' + fixed(p.y);
                   })
                   .join(' L') +
               'Z';
  const peak = feel.tuning.indexOf(most), angle = sampleAngle(peak, count);
  const tip = at(angle, radius(most));
  const arrow = '<path class="aid-lateral-arrow" d="' +
                arrowPath(at(angle, L.inner + L.reach + L.arrow), at(angle, L.inner + L.reach)) +
                '"/>';
  const half = radians(contactHalfAngle(first.field ?? 0));
  const boundary = at(angle + half, L.inner + L.reach), other = at(angle - half, L.inner + L.reach);
  const answer = groupReport(state.document, state.anatomy, 'senses', first.id);
  const word = key => t('studio.lateral.' + key);
  const side = organ.side < 0 ? -1 : 1;
  return block + '<svg class="aid-lateral-field" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-sense-field="' + escapeText(first.id) + '" data-sense-organ="' +
         escapeText(organ.id) + '" data-sense-aim="' + fixed(angle) + '" data-sense-centre="' +
         L.cx + ',' + L.cy + '" role="img" aria-label="' + escapeText(word('title')) +
         '"><circle class="aid-lateral-limit" cx="' + L.cx + '" cy="' + L.cy + '" r="' +
         (L.inner + L.reach) + '"/><path class="aid-lateral-lobe" d="' + lobe + '"><title>' +
         escapeText(word('lobe')) + '</title></path>' + fieldFish(L, L.scale, 'aid-lateral-fish') +
         arrow + '<path class="aid-field-boundary" d="M' + fixed(boundary.x) + ' ' +
         fixed(boundary.y) + 'L' + L.cx + ' ' + L.cy + 'L' + fixed(other.x) + ' ' + fixed(other.y) +
         '"/>' + cellMarks(porePlaces(side), first) +
         (answer?.adapt?.steps > 0
              ? adaptationMarks({x : L.cx, y : L.cy}, L.arc, Math.PI - angle, first)
              : '') +
         sensitivityHandle(at(angle, L.inner), at(angle, L.inner + L.reach), sensitive,
                           word('sensitivityHandle')) +
         '<circle class="aid-graphic-handle" data-sense-mark="width" cx="' + fixed(boundary.x) +
         '" cy="' + fixed(boundary.y) + '" r="7"><title>' + escapeText(word('handle')) +
         '</title></circle></svg></div>';
}
