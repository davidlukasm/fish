import {groupReport} from '../model/document.js';
import {BODY_FRAME} from '../model/layout.js';
import {bodyDirection, fishPath, skinAt} from './frame.js';
import {escapeText, fixed, namedTrack, trackShare} from './markup.js';
import {t} from '../../strings.js';

// What a lateral line feels, from the engine's design view: the four corners around the body
// where the lateral line samples the water (the capabilities' lateralCorners, in body radii along
// and across), each as large as the organ's cells weigh it, and how strongly water streaming
// against the resting fish from each direction stirs them, against the most (its tuning), as a
// lobe around it; an arrow comes from where it stirs them most. The organ's averages over its
// groups (null without any).
export function lateralFeel(state, organ) {
  const found = organ.centers.map(c => groupReport(state.document, state.anatomy, 'lateral', c.id))
                    .filter(Boolean);
  if (!found.length)
    return null;
  const mean = key =>
      found[0][key].map((_, k) => found.reduce((sum, f) => sum + f[key][k], 0) / found.length);
  return {weights : mean('weights'), tuning : mean('tuning')};
}
// A direction around the body of the k-th of `count` samples (the middles of equal arcs from
// straight behind, 0 ahead, positive towards side +1).
const sampleAngle = (k, count) => -Math.PI + (k + .5) * 2 * Math.PI / count;
// The corners on the frame of a fish with centre `centre`: the engine's round body stretched to
// the drawn one, its radius `length` along it and `width` across (ahead lies left, side +1
// below); in the engine's order (k & 1 ahead, k & 2 towards side +1).
export function lateralCorners(corners, centre, length, width) {
  const [along, across] = corners;
  return [ 0, 1, 2, 3 ].map(k => ({
                              x : centre.x - (k & 1 ? 1 : -1) * along * length,
                              y : centre.y + (k & 2 ? 1 : -1) * across * width
                            }));
}
// The corner discs: CORNER.least plus CORNER.span times the square root of their weight.
export const CORNER = Object.freeze({least : 3, span : 10});
export function cornerDiscs(points, weights, scale = 1) {
  return points
      .map((p, k) =>
               '<circle class="aid-lateral-corner" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
               '" r="' +
               fixed(scale * (CORNER.least + CORNER.span * Math.sqrt(Math.max(0, weights[k])))) +
               '"/>')
      .join('');
}
// An arrow from `from` to `to`, its head HEAD long, SPREAD radians to each side.
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

// The inspector's view: a small fish (FIELD.scale of the frame) with the corner discs, the lobe
// from FIELD.inner (not stirred) out by FIELD.reach (stirred most), the arrow from where it is
// stirred most, and below a track from local (the cells weigh the corners near them) to the whole
// body (all corners alike) with a handle on the cells' spatial width.
export const LATERAL_FIELD = Object.freeze({
  width : 300,
  height : 228,
  cx : 150,
  cy : 98,
  scale : .14,
  inner : 60,
  reach : 32,
  arrow : 22,
  track : [ 60, 240 ],
  track_y : 204
});
// The reach the pointer (a fraction of the field's width) sets along the track.
export const lateralPatch = fx =>
    ({field : trackShare(fx * LATERAL_FIELD.width, LATERAL_FIELD.track)});
export function lateralField(state, organ) {
  const L = LATERAL_FIELD, feel = lateralFeel(state, organ), first = organ.centers[0];
  const corners = state.capabilities?.lateralCorners;
  const block = '<div data-lateral-block="' + escapeText(organ.id) + '">';
  if (!feel || !corners || !first)
    return block + '</div>';
  const middle = {x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle};
  const length = (BODY_FRAME.tail - BODY_FRAME.snout) / 2 * L.scale,
        width = (skinAt(middle.x, 1) - middle.y) * L.scale;
  const centre = {x : L.cx, y : L.cy};
  const at = (angle, r) => {
    const d = bodyDirection(angle);
    return {x : L.cx + d.x * r, y : L.cy + d.y * r};
  };
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
  const fish = '<path class="aid-lateral-fish" d="' + fishPath() + '" transform="translate(' +
               fixed(L.cx - middle.x * L.scale) + ' ' + fixed(L.cy - middle.y * L.scale) +
               ') scale(' + L.scale + ')"/>';
  const label = key => escapeText(t('studio.lateral.' + key));
  return block + '<section class="aid-eye-section"><h4>' + label('title') + '</h4>' +
         '<svg class="aid-lateral-field" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" data-lateral-pad="' + escapeText(first.id) + '" role="img" aria-label="' +
         label('title') + '"><circle class="aid-lateral-limit" cx="' + L.cx + '" cy="' + L.cy +
         '" r="' + L.inner + '"/><circle class="aid-lateral-limit" cx="' + L.cx + '" cy="' + L.cy +
         '" r="' + (L.inner + L.reach) + '"/><path class="aid-lateral-lobe" d="' + lobe + '"/>' +
         fish + cornerDiscs(lateralCorners(corners, centre, length, width), feel.weights, .8) +
         arrow +
         namedTrack(L.track, L.track_y, first.field ?? 0, 'data-graphic-handle="width"',
                    t('studio.lateral.handle'),
                    [ t('studio.lateral.local'), t('studio.lateral.whole') ]) +
         '</svg></section></div>';
}
