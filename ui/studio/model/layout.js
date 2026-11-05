// The design frame: where the development sites of the four anatomical zones lie in a top
// projection of the fish, and how near a point must be to snap to one.
export const SNAP_DISTANCE = 95;
export const PLACEMENT_MARGIN = 120;
export const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;

// The fish's half width along the frame, linear between these knots (x, half width); past the
// last one it narrows on to TAIL_LEAST.
export const BODY_KNOTS = Object.freeze(
    [ [ 130, 22 ], [ 185, 90 ], [ 410, 144 ], [ 655, 129 ], [ 805, 51 ], [ 905, 22 ] ]);
const TAIL_LEAST = 12;
export function halfWidth(x) {
  const k = BODY_KNOTS, last = k.length - 1;
  if (x <= k[0][0])
    return k[0][1];
  for (let i = 1; i <= last; ++i)
    if (x <= k[i][0])
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
  const slope = (k[last][1] - k[last - 1][1]) / (k[last][0] - k[last - 1][0]);
  return Math.max(TAIL_LEAST, k[last][1] + slope * (x - k[last][0]));
}
// The engine's inner sites at depth zero lie on the midline, shared by both sides.
export const onMidline = site => !!site && !site.outer && site.w === 0;
// A point dropped within MIDLINE_BAND of the midline goes on it, else to its side (-1 or 1).
export const MIDLINE_BAND = 14;
export const sideAt = point =>
    Math.abs(point.y - CENTRE_Y) < MIDLINE_BAND ? 0 : Math.sign(point.y - CENTRE_Y);
export function sitePoint(site, role = '') {
  if (site.point)
    return site.point;
  const [start, end] = ZONE_X[site.zone];
  const roughX = start + (1 - site.u) * (end - start);
  const x = roughX;
  const side = site.side < 0 ? -1 : 1;
  const width = halfWidth(x);
  if (onMidline(site))
    return {x, y : CENTRE_Y};
  const offset = Math.max(4, Math.min(width * .94, width * (.13 + .75 * site.w)));
  // The fin muscle anchors extend through the paired side fins.
  if (role === 'muscle' && site.zone === 2 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 31)};
  if (role === 'muscle' && site.zone === 3 && site.w > .8)
    return {x, y : CENTRE_Y + side * (offset + 30)};
  return {x, y : CENTRE_Y + side * offset};
}
export function pointDistance(site, position, role = '') {
  const q = sitePoint(site, role);
  return Math.hypot(q.x - position.x, q.y - position.y);
}
export function nearFish(position, sites, radius = PLACEMENT_MARGIN) {
  return sites.some(site => pointDistance(site, position) <= radius ||
                            pointDistance(site, position, 'muscle') <= radius);
}
