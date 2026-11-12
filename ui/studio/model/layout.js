export const SNAP_DISTANCE = 95;
const PLACEMENT_MARGIN = 120;
export const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
export const ZONE = Object.freeze({snout : 0, head : 1, trunk : 2, tail : 3});
// Single nerve nodes sit inside the brain and the cord, where the regions sit, never out at the
// body wall.
export const nerveZone = site => !site.outer && site.zone >= ZONE.head;
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;
export const BODY_MIDDLE =
    Object.freeze({x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle});
export const BODY_RADIUS = (BODY_FRAME.tail - BODY_FRAME.snout) / 2;

export const BODY_KNOTS = Object.freeze([
  [ 130, 24 ], [ 200, 65 ], [ 300, 105 ], [ 420, 112 ], [ 560, 94 ], [ 690, 65 ], [ 800, 38 ],
  [ 905, 12 ]
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
// Scenes look sites up by the thousand; the list of sites never changes.
const siteIndex = new WeakMap();
export function findSite(sites, id) {
  let index = siteIndex.get(sites);
  if (!index) {
    index = new Map();
    for (const site of sites)
      if (!index.has(site.id))
        index.set(site.id, site);
    siteIndex.set(sites, index);
  }
  return index.get(id);
}
const SITE_DEPTH = Object.freeze({least : 4, skin : .94, inner : .13, span : .75});
export function bodyCoordinates(position, zone) {
  const [start, end] = ZONE_X[zone];
  const unit = value => Math.max(0, Math.min(1, value));
  return {
    u : 1 - unit((position.x - start) / (end - start)),
    w : unit((Math.abs(position.y - CENTRE_Y) / halfWidth(position.x) - SITE_DEPTH.inner) /
             SITE_DEPTH.span)
  };
}
const FIN_ANCHOR = Object.freeze({depth : .8, [ZONE.trunk] : 31, [ZONE.tail] : 30});
export const NERVE_ROLE = 'nerve';
export const SKIN_ROLE = 'skin';
const BRAIN_MAP = Object.freeze({
  [ZONE.head] : {front : 242, length : 178, inner : 12, outer : 50},
  [ZONE.trunk] : {front : 530, length : 205, inner : 4, outer : 17},
  [ZONE.tail] : {front : 760, length : 115, inner : 3, outer : 10}
});
function brainPoint(site) {
  const M = BRAIN_MAP[site.zone], row = Math.max(0, Math.min(1, 3 * site.v - 1));
  const pitch = M.length / (site.zone === ZONE.tail ? 10 : 8);
  return {
    x : M.front + (1 - site.u) * M.length + (onMidline(site) ? (row - .5) * pitch / 2 : 0),
    y : onMidline(site) ? CENTRE_Y
                        : CENTRE_Y + sideSign(site.side) * (M.inner + row * (M.outer - M.inner))
  };
}
export function sitePoint(site, role = '') {
  if (role === NERVE_ROLE && nerveZone(site))
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
