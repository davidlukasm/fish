import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  centroid,
  findSite,
  onMidline,
  sideAt,
  sideOf,
  sideSign,
  sitePoint,
  SNAP_DISTANCE
} from '../model/layout.js';
import {clamp, radians} from '../../units.js';
import {skinAt} from './frame.js';
import {bearing} from '../model/retina.js';
import {isRegion, siteRole} from '../model/organs.js';
import {muscleNode} from './muscles.js';
import {nodeOpacity} from './layers.js';
import {gutLength} from '../model/document.js';
import {gutTurns} from '../../fish_organs.js';
import {BODY_UNIT} from '../../schema.js';

export function centerLocation(center, organType, sites) {
  const site = findSite(sites, center.site);
  return site ? sitePoint(site, siteRole(organType))
              : {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
}
export {BRAIN, brainHalfWidth, regionAnchors, regionGeometry} from './region_layout.js';
import {regionAnchors, regionCell as regionPoint} from './region_layout.js';
export const INSIDE = Object.freeze({
  blood : {x : 548, d : 128},
  bladder : {x : 648, d : -90},
  gut : {
    throat : 240,
    stomach : {x : 640, d : 82, rx : 34, ry : 22},
    coils : {from : 680, to : 820, d : 76, wave : 14},
    vent : {x : 842, d : 38},
    steps : 96
  },
  eggs : {x : 722, d : -93},
  sperm : {x : 784, d : -84},
  glands : {front : 600, step : 46, d : 125, skin : 26},
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
// tube: half the drawn gut's width; ring: how far a muscle ring reaches beyond it; rows: the gap
// along the body between the two rows of gut wall places.
export const GUT_WALL = Object.freeze({tube : 4.5, ring : 8, rows : 24});
// The gut wall at a place along the body, from the gullet over the stomach to the coils: where
// its line runs, which way is across it and how far its wall lies from the line.
export function gutWall(doc, x) {
  const G = gutShape(gutTurns(gutLength(doc) ?? BODY_UNIT.trait_middle)), S = INSIDE.gut.stomach;
  const line = [...G.gullet, ...G.intestine ];
  const at = x => {
    const k = clamp(line.findIndex(p => p.x >= x), 1, line.length - 1);
    const a = line[k - 1], b = line[k], share = clamp((x - a.x) / (b.x - a.x || 1), 0, 1);
    return {x : a.x + (b.x - a.x) * share, y : a.y + (b.y - a.y) * share};
  };
  // Across the gut's course between both rows, not across each bend of the coils.
  const before = at(x - GUT_WALL.rows), after = at(x + GUT_WALL.rows);
  const length = Math.hypot(after.x - before.x, after.y - before.y) || 1, inside = (x - S.x) / S.rx;
  return {
    ...at(x),
    across : {x : -(after.y - before.y) / length, y : (after.x - before.x) / length},
    half : Math.abs(inside) < 1 ? Math.max(GUT_WALL.tube, S.ry * Math.sqrt(1 - inside * inside))
                                : GUT_WALL.tube
  };
}
// Gut muscle nodes sit on the gut wall where their places lie along the body, the two sides of
// the wall on either side of its line.
export const gutWallAt = (doc, site) =>
    gutWall(doc, sitePoint(site).x + (2 * site.v - 1) * GUT_WALL.rows / 2);
export function gutWallPoint(doc, sites, center) {
  const site = findSite(sites, center.site);
  if (!site)
    return gutWall(doc, INSIDE.gut.stomach.x);
  const wall = gutWallAt(doc, site), reach = sideSign(site.side) * (wall.half + GUT_WALL.ring);
  return {x : wall.x + wall.across.x * reach, y : wall.y + wall.across.y * reach};
}
const INNER_TYPES =
    Object.freeze([ 'blood', 'bladder', 'gut', 'gutmuscle', 'eggs', 'sperm', 'gland' ]);
const hasHome = type => INNER_TYPES.includes(type);
function innerHome(doc, organ) {
  const I = INSIDE, middle = BODY_FRAME.middle;
  if (organ.type === 'gut')
    return {x : I.gut.stomach.x, y : middle + I.gut.stomach.d};
  if (organ.type === 'gutmuscle')
    return gutWall(doc, (I.gut.coils.from + I.gut.coils.to) / 2);
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
function innerPoint(doc, organ, index, sites) {
  if (organ.type === 'gutmuscle')
    return gutWallPoint(doc, sites, organ.centers[index]);
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
  if (isRegion(organ))
    return regionAnchors(doc, sites).get(organ.id) ??
           centerLocation(organ.centers[0], organ.type, sites);
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
  const chosen = organs.some(o => o.id === state.selected?.id ||
                                  o.centers.some(c => c.id === state.selected?.id));
  return nodeOpacity(state, chosen) > 0;
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
             : hasHome(organType)     ? innerPoint(doc, organ, index, sites)
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
