import {TOLERANCE} from './schema.js';

// Polygons [[x, y], ...] cut into triangles by ear clipping. The ring of corners is walked in the
// polygon's own winding; a corner that does not turn is dropped, a convex one is cut off as an ear
// unless the triangle holds another corner. `holds(sign, a, b, c, q)` decides that (strictly or
// with the edges counted in). Clipping stops when LEAST corners are left, no ear is found (stuck)
// or TRIES rounds are spent; it returns the ears' corner indices and the ring left.
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const windingOf = points =>
    points.reduce((v, p, i) => v + p[0] * points[(i + 1) % points.length][1] -
                               p[1] * points[(i + 1) % points.length][0],
                  0) < 0
        ? -1
        : 1;
export function clipEars(points, holds, least, tries = Infinity) {
  const sign = windingOf(points), ring = points.map((_, i) => i), ears = [];
  while (ring.length > least && tries-- > 0) {
    let cut = false;
    for (let k = 0; k < ring.length; k++) {
      const i = ring[(k + ring.length - 1) % ring.length], j = ring[k],
            l = ring[(k + 1) % ring.length], a = points[i], b = points[j], c = points[l],
            turn = sign * cross(a, b, c);
      if (Math.abs(turn) < TOLERANCE.negligible) {
        ring.splice(k, 1);
        cut = true;
        break;
      }
      if (turn < 0 ||
          ring.some(n => n !== i && n !== j && n !== l && holds(sign, a, b, c, points[n])))
        continue;
      ears.push(i, j, l);
      ring.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut)
      return {ears, ring, stuck : true};
  }
  return {ears, ring, stuck : false};
}
// Whether a triangle holds a point within it, edges included or not.
export const holdsWithEdges = (sign, a, b, c, q) =>
    sign * cross(a, b, q) >= -TOLERANCE.negligible &&
    sign * cross(b, c, q) >= -TOLERANCE.negligible &&
    sign * cross(c, a, q) >= -TOLERANCE.negligible;
export const holdsInside = (sign, a, b, c, q) => sign * cross(a, b, q) > TOLERANCE.negligible &&
                                                 sign * cross(b, c, q) > TOLERANCE.negligible &&
                                                 sign * cross(c, a, q) > TOLERANCE.negligible;
