// The design frame: where the development sites of the four anatomical zones lie in a top
// projection of the fish, and how near a point must be to snap to one.
export const SNAP_DISTANCE = 95;
const PLACEMENT_MARGIN = 120;
export const ZONE_X = Object.freeze([ [ 130, 260 ], [ 260, 470 ], [ 470, 780 ], [ 780, 964 ] ]);
// The anatomical zones along the body from the snout back (development_sites.hh): the jaw's
// muscles in the snout, the eyes and the suction muscle in the head, turning in the trunk, thrust
// in the tail. Nerve centers lie in the head and the trunk.
export const ZONE = Object.freeze({snout : 0, head : 1, trunk : 2, tail : 3});
export const nerveZone = site => site.zone === ZONE.head || site.zone === ZONE.trunk;
export const BODY_FRAME = Object.freeze({snout : ZONE_X[0][0], tail : 905, middle : 365});
const CENTRE_Y = BODY_FRAME.middle;
// The drawn fish's middle, and its body radius (half its length) in frame units.
export const BODY_MIDDLE =
    Object.freeze({x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle});
export const BODY_RADIUS = (BODY_FRAME.tail - BODY_FRAME.snout) / 2;

// The fish's half width along the frame, linear between these knots (x, half width); past the
// last one it narrows on to TAIL_LEAST.
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
// The engine's inner sites at depth zero lie on the midline, shared by both sides.
export const onMidline = site => !!site && !site.outer && site.w === 0;
// A side as the frame draws it, -1 or 1 (the midline's counted with 1), and as the engine
// indexes its left and right columns, 0 or 1; an organ's side.
export const sideSign = side => side < 0 ? -1 : 1;
export const sideIndex = side => side < 0 ? 0 : 1;
export const sideOf = organ => sideSign(organ.side);
// A point dropped within MIDLINE_BAND of the midline goes on it, else to its side (-1 or 1).
const MIDLINE_BAND = 14;
export const sideAt = point =>
    Math.abs(point.y - CENTRE_Y) < MIDLINE_BAND ? 0 : Math.sign(point.y - CENTRE_Y);
// A site by its id.
export const findSite = (sites, id) => sites.find(s => s.id === id);
// A site lies off the midline by its depth (w), from INNER of the half width to INNER + SPAN, at
// least LEAST and at most SKIN of the half width. Muscle sites deeper than FIN_ANCHOR.depth in the
// trunk and the tail anchor the side fins and lie out in them, as far as the zone's entry says.
const SITE_DEPTH = Object.freeze({least : 4, skin : .94, inner : .13, span : .75});
const FIN_ANCHOR = Object.freeze({depth : .8, [ZONE.trunk] : 31, [ZONE.tail] : 30});
// Nerve centers are drawn in the brain as the Atelier draws it (NERVE_ROLE asks for that): the
// engine's inner lattice from the snout to the tail laid into the brain from the olfactory bulbs
// back and on along the spinal cord, each zone over its own stretch. A site stands as far back
// from the zone's FRONT as its place along the zone (u, front first) puts it within LENGTH, a
// little further by its height (v, over HEIGHT); a deep one (w) OUT off the midline (NARROW of it
// less at the zone's back, as the brain narrows there), a midline one (one on each side) MIDDLE
// off it on its side.
export const NERVE_ROLE = 'nerve';
// The skin senses feel where their cells face, whatever depth their sites lie at: SKIN_ROLE draws
// a site at the skin of its side.
export const SKIN_ROLE = 'skin';
export const BRAIN_MAP = Object.freeze({
  [ZONE.snout] : {front : 196, length : 30, height : 0, out : 26, middle : 10, narrow : 0},
  [ZONE.head] : {front : 262, length : 150, height : 70, out : 44, middle : 12, narrow : 0},
  [ZONE.trunk] : {front : 440, length : 120, height : 60, out : 42, middle : 12, narrow : .3},
  [ZONE.tail] : {front : 620, length : 220, height : 40, out : 16, middle : 6, narrow : 0}
});
const MIDDLE_HEIGHT = .5;
const nerveSite = site => !site.outer && BRAIN_MAP[site.zone] !== undefined;
function brainPoint(site) {
  const M = BRAIN_MAP[site.zone];
  return {
    x : M.front + (1 - site.u) * M.length + (site.v - MIDDLE_HEIGHT) * M.height,
    y : CENTRE_Y + sideSign(site.side) *
                       (onMidline(site) ? M.middle : M.out * (1 - M.narrow * (1 - site.u)))
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
  // The fin muscle anchors extend through the paired side fins.
  const fin = role === 'muscle' && site.w > FIN_ANCHOR.depth ? FIN_ANCHOR[site.zone] ?? 0 : 0;
  return {x, y : CENTRE_Y + side * (offset + fin)};
}
// The middle of a set of points.
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
