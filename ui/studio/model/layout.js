export const SNAP_DISTANCE = 95;
const PLACEMENT_MARGIN = 120;
export const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
export const ZONE = Object.freeze({snout : 0, head : 1, trunk : 2, tail : 3});
// Single nerve nodes sit inside the brain and the cord, where the regions sit, never out at the
// body wall.
export const nerveZone = site =>
    !site.outer && (site.zone === ZONE.head || site.zone === ZONE.trunk);
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;
export const BODY_MIDDLE =
    Object.freeze({x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle});
export const BODY_RADIUS = (BODY_FRAME.tail - BODY_FRAME.snout) / 2;

export const BODY_KNOTS = Object.freeze([
  [ 130, 40 ], [ 200, 92 ], [ 300, 124 ], [ 420, 138 ], [ 560, 126 ], [ 690, 98 ], [ 800, 62 ],
  [ 905, 26 ]
]);
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
export const onMidline = site => !!site && !site.outer && site.w === 0;
export const sideSign = side => side < 0 ? -1 : 1;
export const sideIndex = side => side < 0 ? 0 : 1;
export const sideOf = organ => sideSign(organ.side);
const MIDLINE_BAND = 14;
export const sideAt = point =>
    Math.abs(point.y - CENTRE_Y) < MIDLINE_BAND ? 0 : Math.sign(point.y - CENTRE_Y);
export const findSite = (sites, id) => sites.find(s => s.id === id);
const SITE_DEPTH = Object.freeze({least : 4, skin : .94, inner : .13, span : .75});
const FIN_ANCHOR = Object.freeze({depth : .8, [ZONE.trunk] : 31, [ZONE.tail] : 30});
export const NERVE_ROLE = 'nerve';
export const SKIN_ROLE = 'skin';
const BRAIN_MAP = Object.freeze({
  [ZONE.snout] : {front : 196, length : 30, height : 0, out : 26, narrow : 0},
  [ZONE.head] : {front : 262, length : 150, height : 70, out : 44, narrow : 0},
  [ZONE.trunk] : {front : 455, length : 105, height : 50, out : 36, narrow : .3},
  [ZONE.tail] : {front : 620, length : 220, height : 40, out : 16, narrow : 0}
});
const MIDDLE_HEIGHT = .5;
const nerveSite = site => !site.outer && BRAIN_MAP[site.zone] !== undefined;
function brainPoint(site) {
  const M = BRAIN_MAP[site.zone];
  return {
    x : M.front + (1 - site.u) * M.length + (site.v - MIDDLE_HEIGHT) * M.height,
    y : onMidline(site) ? CENTRE_Y
                        : CENTRE_Y + sideSign(site.side) * M.out * (1 - M.narrow * (1 - site.u))
  };
}
export function sitePoint(site, role = '') {
  if (role === NERVE_ROLE && nerveSite(site))
    return brainPoint(site);
  const [start, end] = ZONE_X[site.zone];
  const x = start + (1 - site.u) * (end - start);
  const side = sideSign(site.side), width = halfWidth(x), D = SITE_DEPTH;
  if (role === SKIN_ROLE)
    return {x, y : CENTRE_Y + side * width * D.skin};
  if (onMidline(site))
    return {x, y : CENTRE_Y};
  const offset = Math.max(D.least, Math.min(width * D.skin, width * (D.inner + D.span * site.w)));
  const fin = role === 'muscle' && site.w > FIN_ANCHOR.depth ? FIN_ANCHOR[site.zone] ?? 0 : 0;
  return {x, y : CENTRE_Y + side * (offset + fin)};
}
export const centroid = points => ({
  x : points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y : points.reduce((sum, p) => sum + p.y, 0) / points.length
});
export function pointDistance(site, position, role = '') {
  const q = sitePoint(site, role);
  return Math.hypot(q.x - position.x, q.y - position.y);
}
export function nearFish(position, sites, radius = PLACEMENT_MARGIN) {
  return sites.some(site => pointDistance(site, position) <= radius ||
                            pointDistance(site, position, 'muscle') <= radius);
}
