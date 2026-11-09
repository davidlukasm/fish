import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  centroid,
  findSite,
  NERVE_ROLE,
  onMidline,
  sideAt,
  sideOf,
  sideSign,
  sitePoint,
  SNAP_DISTANCE,
  ZONE
} from '../model/layout.js';
import {clamp, radians} from '../../units.js';
import {skinAt} from './frame.js';
import {bearing} from '../model/retina.js';
import {isRegion, ORGAN_BY_KEY, siteRole} from '../model/organs.js';
import {regionSlots} from '../model/regions.js';
import {muscleNode} from './muscles.js';
import {layerShown} from './layers.js';

export function centerLocation(center, organType, sites) {
  const site = findSite(sites, center.site);
  return site ? sitePoint(site, siteRole(organType))
              : {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
}
export const BRAIN = Object.freeze({
  cerebrum : {from : 186, to : 450, half : 82, front : .75, full : .45, lobes : 9, bulge : .2},
  folds : [
    [ [ .12, .9 ], [ .16, .65 ], [ .12, .45 ], [ .15, .25 ] ],
    [ [ .27, .97 ], [ .24, .75 ], [ .3, .55 ], [ .27, .35 ] ],
    [ [ .33, .08 ], [ .38, .25 ], [ .35, .42 ] ],
    [ [ .45, .98 ], [ .48, .7 ], [ .43, .45 ], [ .47, .2 ] ],
    [ [ .6, .95 ], [ .57, .75 ], [ .62, .55 ] ], [ [ .58, .1 ], [ .63, .3 ], [ .6, .45 ] ],
    [ [ .73, .92 ], [ .77, .68 ], [ .72, .45 ], [ .76, .22 ] ],
    [ [ .88, .75 ], [ .85, .5 ], [ .9, .3 ] ]
  ],
  cerebellum : {x : 505, rx : 80, ry : 60, folia : 5, bow : .25},
  cord : {from : 560, to : 868, half : [ 22, 19 ], end : 14},
  edge : 2.4
});
const CLUSTER = Object.freeze({
  ring : 12,
  grow : 3.5,
  aspect : [ 1.25, .85 ],
  arc : Math.PI / 3,
  spread : Math.PI / 7,
  inner : .45,
  step : 26
});
const PORT_ORDER = Object.freeze({in : 0, none : 1, out : 2});
const regionHome = (organ, sites) => findSite(sites, organ.region?.site ?? organ.centers[0]?.site);
const clusterRadius = organ => CLUSTER.ring + CLUSTER.grow * organ.centers.length;
export const REGION_CHIP = Object.freeze({width : 26, height : 20, gap : 5, away : 22});
const BRAIN_END = BRAIN.cerebellum.x + BRAIN.cerebellum.rx;
// Where a region's row of slot chips sits: beyond its outermost node toward the body edge, not
// past the brain's end, as organs line the cord behind it; a region behind the brain has its row
// further back along the cord.
export function slotRow(organ, points, count, zoom) {
  const R = REGION_CHIP, xs = points.map(p => p.x), at = centroid(points);
  const half = count * (R.width + R.gap) / 2 / zoom;
  if (isRegion(organ) && Math.min(...xs) > BRAIN_END)
    return {x : Math.max(...xs) + R.away / zoom + half, y : at.y};
  const out = sideOf(organ);
  return {
    x : isRegion(organ) ? Math.min(at.x, BRAIN_END - half) : at.x,
    y : (out < 0 ? Math.min : Math.max)(...points.map(p => p.y)) + out * R.away / zoom
  };
}
const SEPARATE =
    Object.freeze({margin : 3, node : 5, inside : 6, front : .25, rows : 2, least : .6});
const anchorCache = new WeakMap();
// Regions whose engine sites lie close would hide each other's clusters and slot chips; the
// drawing keeps them apart within their half of the brain, as near their sites as room allows.
function regionAnchors(doc, sites) {
  const cached = anchorCache.get(doc);
  if (cached?.sites === sites)
    return cached.anchors;
  const S = SEPARATE, C = CLUSTER, R = REGION_CHIP, middle = BODY_FRAME.middle;
  const placed = doc.organs.filter(o => isRegion(o) && o.centers.length).flatMap(organ => {
    const home = regionHome(organ, sites);
    return home && home.zone !== ZONE.tail ? [ {organ, home} ] : [];
  });
  const sideOfItem = organ =>
      organ.side && ORGAN_BY_KEY[organ.type].scope === 'side' ? sideOf(organ) : 0;
  // A crowded half of the brain draws its clusters smaller, down to SEPARATE.least.
  const fit = side => {
    const need =
        placed.filter(p => !sideOfItem(p.organ) || sideOfItem(p.organ) === side)
            .reduce((sum, p) => sum + 2 * (clusterRadius(p.organ) * C.aspect[0] + S.node), 0);
    return need ? clamp(S.rows * (BRAIN_END - BRAIN.cerebrum.from) / need, S.least, 1) : 1;
  };
  const fits = {[-1] : fit(-1), [1] : fit(1)};
  const items = placed.map(({organ, home}) => {
    const at = sitePoint(home, NERVE_ROLE), side = sideOfItem(organ);
    const k = side ? fits[side] : Math.min(fits[-1], fits[1]), r = clusterRadius(organ) * k;
    const chips =
        regionSlots(doc, organ).filter(slot => slot.required && !slot.filled.length).length;
    return {
      id : organ.id,
      home : at,
      x : at.x,
      y : at.y,
      k,
      out : sideOf(organ),
      side,
      wide : Math.max(r * C.aspect[0], chips * (R.width + R.gap) / 2) + S.node,
      inner : r * C.aspect[1] + S.node,
      outer : r * C.aspect[1] + (chips ? R.away + R.height / 2 : S.node)
    };
  });
  const span = item => item.out > 0 ? [ item.y - item.inner, item.y + item.outer ]
                                    : [ item.y - item.outer, item.y + item.inner ];
  const left = item => BRAIN.cerebrum.from + item.wide * S.front,
        right = item => BRAIN.cord.to - item.wide / 2;
  const packed = [];
  const order = [...items ].sort((a, b) => Number(!!a.side) - Number(!!b.side) ||
                                           b.wide * b.inner - a.wide * a.inner);
  for (const item of order) {
    const top = item.out > 0 ? item.inner : item.outer,
          bottom = item.out > 0 ? item.outer : item.inner;
    const xs = [ item.home.x, left(item), right(item) ];
    const ys = [
      item.home.y, middle + item.side * S.inside,
      middle + item.side * (BRAIN.cerebrum.half - item.inner)
    ];
    for (const other of packed) {
      xs.push(other.x - other.wide - item.wide - S.margin,
              other.x + other.wide + item.wide + S.margin);
      const [upper, lower] = span(other);
      ys.push(upper - bottom - S.margin, lower + top + S.margin);
    }
    let best = null;
    for (const rawX of new Set(xs)) {
      const x = clamp(rawX, left(item), right(item));
      const outward = x > BRAIN_END ? BRAIN.cord.half[0] : BRAIN.cerebrum.half - item.inner;
      for (const rawY of new Set(ys)) {
        const y = item.side ? middle + item.side * clamp(item.side * (rawY - middle), S.inside,
                                                         Math.max(S.inside, outward))
                            : item.home.y;
        let overlap = 0;
        for (const other of packed) {
          const [upper, lower] = span(other);
          overlap += Math.max(0, Math.min(x + item.wide, other.x + other.wide) -
                                     Math.max(x - item.wide, other.x - other.wide) + S.margin) *
                     Math.max(0, Math.min(y + bottom, lower) - Math.max(y - top, upper) + S.margin);
        }
        const distance = (x - item.home.x) ** 2 + (y - item.home.y) ** 2;
        if (!best || overlap < best.overlap - 1e-6 ||
            Math.abs(overlap - best.overlap) <= 1e-6 && distance < best.distance)
          best = {x, y, overlap, distance};
      }
    }
    Object.assign(item, {x : best.x, y : best.y});
    packed.push(item);
  }
  const anchors = new Map(items.map(item => [item.id, {x : item.x, y : item.y, k : item.k}]));
  anchorCache.set(doc, {sites, anchors});
  return anchors;
}
function regionPoint(doc, organ, index, sites) {
  const C = CLUSTER, home = regionHome(organ, sites);
  if (!home)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  const anchor = regionAnchors(doc, sites).get(organ.id);
  const at = anchor ?? sitePoint(home, NERVE_ROLE), side = sideOf(organ);
  const center = organ.centers[index], port = center?.port ?? 'none';
  if (home.zone === ZONE.tail) {
    const order = [...organ.centers ].sort((a, b) => PORT_ORDER[a.port ?? 'none'] -
                                                     PORT_ORDER[b.port ?? 'none']);
    return {x : at.x + order.indexOf(center) * C.step, y : at.y};
  }
  if (organ.centers.length < 2)
    return at;
  const kin = organ.centers.filter(c => (c.port ?? 'none') === port), rank = kin.indexOf(center);
  const share = kin.length > 1 ? rank / (kin.length - 1) : .5;
  const r = clusterRadius(organ) * (anchor?.k ?? 1);
  const angle = port === 'in'    ? Math.PI - side * C.arc * (1 - 2 * share)
                : port === 'out' ? side * Math.PI / 2 + C.spread * (share - .5) * (kin.length - 1)
                                 : C.spread * (share - .5) * (kin.length - 1) - side * C.spread;
  const reach = port === 'none' ? r * C.inner : r;
  return {
    x : at.x + Math.cos(angle) * reach * C.aspect[0],
    y : at.y + Math.sin(angle) * reach * C.aspect[1]
  };
}
export const INSIDE = Object.freeze({
  blood : {x : 548, d : 88},
  bladder : {x : 648, d : -64},
  gut : {
    throat : 240,
    stomach : {x : 640, d : 56, rx : 34, ry : 22},
    coils : {from : 680, to : 820, d : 46, wave : 14},
    vent : {x : 842, d : 12},
    steps : 96
  },
  eggs : {x : 722, d : -62},
  sperm : {x : 784, d : -54},
  glands : {front : 600, step : 46, d : 86, skin : 26},
  stack : 28,
  node : 16
});
export function gutShape(turns) {
  const G = INSIDE.gut, M = BODY_FRAME.middle, S = G.stomach, C = G.coils;
  const stomach = {x : S.x, y : M + S.d};
  const coil = t => (
      {x : C.from + (C.to - C.from) * t, y : M + C.d + C.wave * Math.sin(2 * Math.PI * turns * t)});
  const intestine = Array.from({length : G.steps + 1}, (_, k) => coil(k / G.steps));
  return {
    gullet : [ {x : G.throat, y : M}, {x : S.x - S.rx, y : stomach.y} ],
    stomach,
    intestine : [ {x : S.x + S.rx, y : stomach.y}, ...intestine, {x : G.vent.x, y : M + G.vent.d} ],
    along : coil
  };
}
const INNER_TYPES = Object.freeze([ 'blood', 'bladder', 'gut', 'eggs', 'sperm', 'gland' ]);
const hasHome = type => INNER_TYPES.includes(type);
function innerHome(doc, organ) {
  const I = INSIDE, middle = BODY_FRAME.middle;
  if (organ.type === 'gut')
    return {x : I.gut.stomach.x, y : middle + I.gut.stomach.d};
  if (organ.type === 'gland') {
    const glands = doc.organs.filter(o => o.type === 'gland'),
          k = Math.max(0, glands.indexOf(organ));
    const side = organ.side ? sideOf(organ) : k % 2 ? -1 : 1;
    const before =
        organ.side ? glands.slice(0, k).filter(o => sideOf(o) === side).length : Math.floor(k / 2);
    const x = I.glands.front - I.glands.step * before;
    return {x, y : middle + side * Math.min(I.glands.d, skinAt(x, 1) - middle - I.glands.skin)};
  }
  if (organ.type === 'blood') {
    const k = Math.max(0, doc.organs.filter(o => o.type === 'blood').indexOf(organ));
    return {x : I.blood.x + k * I.stack, y : middle + I.blood.d};
  }
  const home = I[organ.type];
  return {x : home.x, y : middle + home.d};
}
function innerPoint(doc, organ, index) {
  const home = innerHome(doc, organ), count = organ.centers.length;
  if (organ.type === 'gut') {
    const C = INSIDE.gut.coils, t = (index + .5) / Math.max(1, count);
    return organ.centers[index]?.key === 'fullness'
               ? home
               : {x : C.from + (C.to - C.from) * t, y : BODY_FRAME.middle + C.d};
  }
  if (count < 2)
    return home;
  const angle = 2 * Math.PI * index / count - Math.PI / 2;
  return {x : home.x + Math.cos(angle) * INSIDE.node, y : home.y + Math.sin(angle) * INSIDE.node};
}
export function organHome(doc, type) {
  if (!hasHome(type))
    return null;
  const organ = {type, centers : []};
  return innerHome({organs : [...doc.organs, organ ]}, organ);
}
export function placementTarget(doc, type, position) {
  const side = sideAt(position), home = organHome(doc, type);
  return home ? {position : home, snap : Infinity, paired : side !== 0}
              : {position, snap : SNAP_DISTANCE, paired : true};
}
function musclePoint(organ, index, sites) {
  const first = organ.centers[0];
  return muscleNode(organ, index, sites) ?? (first ? centerLocation(first, organ.type, sites)
                                                   : {x : BODY_FRAME.snout, y : BODY_FRAME.middle});
}
export function organLocation(organ, sites, doc) {
  if (hasHome(organ.type))
    return innerHome(doc, organ);
  if (HEAD_SENSES[organ.type])
    return HEAD_SENSES[organ.type](doc, sites, sideOf(organ));
  if (organ.type === 'lateral')
    return lateralAnchor(doc, sites, organ);
  const positions = isRegion(organ) ? organ.centers.map((c, i) => regionPoint(doc, organ, i, sites))
                    : organ.type === 'muscle'
                        ? organ.centers.map((c, i) => musclePoint(organ, i, sites))
                        : organ.centers.map(c => centerLocation(c, organ.type, sites));
  if (!positions.length)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  return centroid(positions);
}
export function viewOrigin(doc, sites, side) {
  const of = type =>
      doc.organs.filter(o => o.type === type && sideOf(o) === side).flatMap(o => o.centers);
  const centers = of('eye').length ? of('eye') : of('proximity');
  const weight = centers.reduce((n, c) => n + (c.copies ?? 1), 0);
  if (!weight)
    return null;
  const x =
      centers.reduce((n, c) => n + centerLocation(c, 'eye', sites).x * (c.copies ?? 1), 0) / weight;
  return {x, y : skinAt(x, side) - side * (eyeRadius(doc, side) + EYE.inset)};
}
export function eyeLocation(doc, sites, side) {
  return doc.organs.some(o => o.type === 'eye' && sideOf(o) === side) ? viewOrigin(doc, sites, side)
                                                                      : null;
}
export const fieldOrigin = (doc, sites, organ) => viewOrigin(doc, sites, sideOf(organ));
export const LATERAL = Object.freeze({span : [ 285, 860 ], inset : 9, step : 36, gap : 10});
export function lateralLine(doc, sites, organ) {
  const L = LATERAL, out = sideOf(organ), eye = eyeLocation(doc, sites, out);
  const from = Math.max(L.span[0], eye ? eye.x + eyeRadius(doc, out) * EYE.aspect + L.gap : 0);
  const at = x => ({x, y : skinAt(x, out) - out * L.inset});
  const count = Math.round((L.span[1] - from) / L.step);
  return Array.from({length : count + 1}, (_, k) => at(from + (L.span[1] - from) * k / count));
}
function lateralAnchor(doc, sites, organ) {
  const line = lateralLine(doc, sites, organ);
  const cells = organ.centers.map(c => centerLocation(c, organ.type, sites));
  const middle = cells.length ? centroid(cells).x : line[0].x;
  return line.reduce((best, p) => Math.abs(p.x - middle) < Math.abs(best.x - middle) ? p : best);
}
export const EYE =
    Object.freeze({base : 11, per_center : 2, most : 21, aspect : 1.4, pupil : .44, inset : 4});
export const NODE = Object.freeze({ring : 1.45, layer : .5, radius : 4.5});
export function showsNodes(state, organs) {
  const ids = new Set(organs.flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
  return layerShown(state, 'nodes') || ids.has(state.selected?.id) ||
         organs.some(o => state.multi?.has(o.id));
}
export function nodeLocation(doc, sites, center, organType) {
  const site = findSite(sites, center.site);
  if (organType === 'eye' && site) {
    const side = sideSign(site.side), eye = eyeLocation(doc, sites, side);
    if (eye) {
      const organ = doc.organs.find(o => o.centers.some(c => c.id === center.id));
      const type = Math.max(0, organ?.field?.profiles.findIndex(p => p.id === center.profile) ?? 0);
      const r = eyeRadius(doc, side) * (NODE.ring + type * NODE.layer),
            a = radians(side * bearing(site));
      return {x : eye.x + Math.cos(a) * r * EYE.aspect, y : eye.y - Math.sin(a) * r};
    }
  }
  if (isRegion({type : organType}) || organType === 'muscle' || hasHome(organType) ||
      HEAD_SENSES[organType]) {
    const organ = ownerOf(doc, center.id);
    const index = organ?.centers.findIndex(c => c.id === center.id) ?? -1;
    if (index >= 0)
      return organType === 'muscle'   ? musclePoint(organ, index, sites)
             : hasHome(organType)     ? innerPoint(doc, organ, index)
             : HEAD_SENSES[organType] ? headSenseNode(doc, sites, organ, center, index)
                                      : regionPoint(doc, organ, index, sites);
  }
  const at = centerLocation(center, organType, sites);
  return organType === 'brain' ? midlinePair(doc, sites, site, at) : at;
}
const PAIR_GAP = 10;
function midlinePair(doc, sites, site, at) {
  if (!onMidline(site))
    return at;
  const twin = sites.find(s => s !== site && onMidline(s) && s.zone === site.zone &&
                               s.u === site.u && s.v === site.v);
  const taken = twin && doc.organs.some(o => o.centers.some(c => c.site === twin.id));
  return taken ? {x : at.x, y : at.y + sideSign(site.side) * PAIR_GAP} : at;
}
export const NOSE = Object.freeze({ahead : .8, inset : 14, ring : 12});
const NEAR = Object.freeze({ring : 2.3});
function nostril(side) {
  const x = BODY_MIDDLE.x - NOSE.ahead * BODY_RADIUS;
  return {x, y : skinAt(x, side) - side * NOSE.inset};
}
const nearPlace = (doc, sites, side) => viewOrigin(doc, sites, side) ?? nostril(side);
const HEAD_SENSES =
    Object.freeze({nose : (doc, sites, side) => nostril(side), proximity : nearPlace});
function headSenseNode(doc, sites, organ, center, index) {
  const side = sideOf(organ), at = HEAD_SENSES[organ.type](doc, sites, side);
  if (organ.type === 'nose') {
    const a = Math.PI * (index + 1) / (organ.centers.length + 1);
    return {x : at.x - Math.cos(a) * NOSE.ring, y : at.y - side * Math.sin(a) * NOSE.ring};
  }
  const site = findSite(sites, center.site), r = eyeRadius(doc, side) * NEAR.ring;
  const a = radians(side * (site ? bearing(site) : 0));
  return {x : at.x + Math.cos(a) * r * EYE.aspect, y : at.y - Math.sin(a) * r};
}
const OWNERS = new WeakMap();
function ownerOf(doc, centerId) {
  let owners = OWNERS.get(doc);
  if (!owners) {
    owners = new Map();
    for (const organ of doc.organs.filter(o => isRegion(o) || o.type === 'muscle' ||
                                               hasHome(o.type) || HEAD_SENSES[o.type]))
      for (const center of organ.centers)
        owners.set(center.id, organ);
    OWNERS.set(doc, owners);
  }
  return owners.get(centerId) ?? null;
}
export function eyeRadius(doc, side) {
  const count = doc.organs.filter(o => o.type === 'eye' && sideOf(o) === side)
                    .reduce((n, o) => n + o.centers.length, 0);
  return Math.min(EYE.most, EYE.base + count * EYE.per_center);
}
