import {groupReport} from '../model/document.js';
import {fixed} from './markup.js';

export function lateralFeel(state, organ) {
  const found = organ.centers.map(c => groupReport(state.document, state.anatomy, 'lateral', c.id))
                    .filter(Boolean);
  if (!found.length)
    return null;
  const mean = key =>
      found[0][key].map((_, k) => found.reduce((sum, f) => sum + f[key][k], 0) / found.length);
  return {weights : mean('weights'), tuning : mean('tuning')};
}
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
