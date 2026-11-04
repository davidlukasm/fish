// The design frame: where the development sites of the four anatomical zones lie in a top
// projection of the fish, and how near a point must be to snap to one.
export const SNAP_DISTANCE = 95;
export const PLACEMENT_MARGIN = 120;
const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;

export function halfWidth(x) {
  if (x <= 185)
    return 22 + (x - 130) * 1.25;
  if (x <= 410)
    return 90 + (x - 185) * .24;
  if (x <= 655)
    return 144 - (x - 410) * .06;
  if (x <= 805)
    return 129 - (x - 655) * .52;
  return Math.max(12, 51 - (x - 805) * .29);
}
export function sitePoint(site, role = '') {
  if (site.point)
    return site.point;
  const [start, end] = ZONE_X[site.zone];
  const roughX = start + (1 - site.u) * (end - start);
  const x = roughX;
  const side = site.side < 0 ? -1 : 1;
  const width = halfWidth(x);
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
