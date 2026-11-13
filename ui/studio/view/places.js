import {anatomicalPosition, nerveHalfWidth} from '../model/anatomy.js';
import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  halfWidth,
  centroid,
  findSite,
  onMidline,
  sideOf,
  sideSign,
  sitePoint
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
  blood : {x : 610, d : -38},
  bladder : {x : 560, d : -35},
  gut : {
    throat : 190,
    stomach : {x : 540, d : 48, rx : 35, ry : 17},
    coils : {from : 575, to : 775, wave : 16},
    vent : {x : 820},
    steps : 96
  },
  eggs : {x : 650, d : -33},
  sperm : {x : 720, d : -24},
  glands : {front : 475, step : 55, d : 62, skin : 22},
  stack : 28,
  node : 11
});
export const cloacaPoint = () => ({x : INSIDE.gut.vent.x, y : BODY_FRAME.middle});
export function gutShape(turns, doc = null) {
  const G = INSIDE.gut, M = BODY_FRAME.middle, S = G.stomach, C = G.coils;
  const stomach = doc?.organs.find(o => o.type === 'gut')?.position ?? {x : S.x, y : M + S.d};
  const vent = cloacaPoint(), from = stomach.x + S.rx, to = Math.max(from + 12, C.to),
        pitch = (to - from) / Math.max(1, turns);
  const coil = t => {
    const angle = 2 * Math.PI * turns * t, taper = Math.sin(Math.PI * t) ** .6;
    const x = from + (to - from) * t + pitch * .13 * Math.sin(angle);
    const side = Math.sign(stomach.y - M) || 1, outer = halfWidth(x) * .66 - 8,
          inner = Math.min(outer, nerveHalfWidth(x) + 7), blend = Math.min(1, t * 5),
          base = Math.abs(stomach.y - M) * (1 - blend) + (inner + outer) / 2 * blend,
          room = Math.max(0, Math.min(outer - base, base - inner)),
          wave = Math.min(C.wave * taper, room);
    return {x, y : M + side * (base + wave * Math.sin(angle))};
  };
  const bend = Math.min(420, stomach.x - S.rx - 45);
  const gullet = Array.from({length : 33}, (_, k) => {
    const t = k / 32, u = 1 - t;
    return {
      x : u * u * u * bend + 3 * u * u * t * (stomach.x - S.rx - 35) +
              3 * u * t * t * (stomach.x - S.rx - 35) + t * t * t * (stomach.x - S.rx),
      y : u * u * u * M + 3 * u * u * t * M + 3 * u * t * t * stomach.y + t * t * t * stomach.y
    };
  });
  return {
    gullet : [ {x : G.throat, y : M}, ...gullet ],
    stomach,
    intestine : [...Array.from({length : G.steps + 1}, (_, k) => coil(k / G.steps)), vent ],
    along : coil
  };
}
// tube: half the drawn gut's width; ring: how far a muscle ring reaches beyond it; rows: the gap
// along the body between the two rows of gut wall places.
export const GUT_WALL = Object.freeze({tube : 4.5, ring : 8, rows : 24});
// The gut wall at a place along the body, from the gullet over the stomach to the coils: where
// its line runs, which way is across it and how far its wall lies from the line.
export function gutWall(doc, x) {
  const G = gutShape(gutTurns(gutLength(doc) ?? BODY_UNIT.trait_middle), doc),
        S = INSIDE.gut.stomach;
  const line = [...G.gullet, ...G.intestine ];
  const at = x => {
    const k = clamp(line.findIndex(p => p.x >= x), 1, line.length - 1);
    const a = line[k - 1], b = line[k], share = clamp((x - a.x) / (b.x - a.x || 1), 0, 1);
    return {x : a.x + (b.x - a.x) * share, y : a.y + (b.y - a.y) * share};
  };
  // Across the gut's course between both rows, not across each bend of the coils.
  const before = at(x - GUT_WALL.rows), after = at(x + GUT_WALL.rows);
  const length = Math.hypot(after.x - before.x, after.y - before.y) || 1,
        inside = (x - G.stomach.x) / S.rx;
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
    Object.freeze([ 'blood', 'bladder', 'gut', 'gutmuscle', 'eggs', 'sperm', 'gland', 'balance' ]);
const hasHome = type => INNER_TYPES.includes(type);
function innerHome(doc, organ) {
  if (organ.position)
    return organ.position;
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
    return {
      x,
      y : middle + side * Math.min(I.glands.d + before * 10, skinAt(x, 1) - middle - I.glands.skin)
    };
  }
  if (organ.type === 'blood') {
    const k = Math.max(0, doc.organs.filter(o => o.type === 'blood').indexOf(organ));
    return {x : I.blood.x + k * I.stack, y : middle + I.blood.d};
  }
  if (organ.type === 'balance')
    return {x : 395, y : middle + sideOf(organ) * 99};
  const home = I[organ.type];
  return {x : home.x, y : middle + home.d};
}
function innerPoint(doc, organ, index, sites) {
  if (organ.type === 'gutmuscle')
    return gutWallPoint(doc, sites, organ.centers[index]);
  const home = innerHome(doc, organ), count = organ.centers.length;
  if (organ.type === 'gut') {
    const t = (index + .5) / Math.max(1, count);
    return organ.centers[index]?.key === 'fullness'
               ? home
               : gutShape(gutTurns(gutLength(doc) ?? BODY_UNIT.trait_middle), doc).along(t);
  }
  if (count < 2)
    return home;
  const angle = 2 * Math.PI * index / count - Math.PI / 2;
  return {x : home.x + Math.cos(angle) * INSIDE.node, y : home.y + Math.sin(angle) * INSIDE.node};
}
export function placementTarget(doc, type, position) {
  return {position : anatomicalPosition(type, position), snap : Infinity, paired : true};
}
function musclePoint(organ, index, sites) {
  const first = organ.centers[0];
  return muscleNode(organ, index, sites) ?? (first ? centerLocation(first, organ.type, sites)
                                                   : {x : BODY_FRAME.snout, y : BODY_FRAME.middle});
}
export function organLocation(organ, sites, doc) {
  if (organ.type === 'touch' || organ.type === 'pain')
    return skinSenseAnchor(organ, sites);
  if (organ.type === 'lateral')
    return lateralAnchor(doc, sites, organ);
  if (organ.type === 'gills')
    return organ.position ?? {x : 440, y : BODY_FRAME.middle};
  if (organ.position && !isRegion(organ))
    return organ.position;
  if (hasHome(organ.type))
    return innerHome(doc, organ);
  if (isRegion(organ))
    return regionAnchors(doc, sites).get(organ.id) ??
           centerLocation(organ.centers[0], organ.type, sites);
  if (HEAD_SENSES[organ.type])
    return HEAD_SENSES[organ.type](doc, sites, sideOf(organ));
  const positions = isRegion(organ) ? organ.centers.map((c, i) => regionPoint(doc, organ, i, sites))
                    : organ.type === 'muscle'
                        ? organ.centers.map((c, i) => musclePoint(organ, i, sites))
                        : organ.centers.map(c => centerLocation(c, organ.type, sites));
  if (!positions.length)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  return centroid(positions);
}
export function viewOrigin(doc, sites, side) {
  const explicit = doc.organs.find(o => o.type === 'eye' && sideOf(o) === side && o.position) ??
                   doc.organs.find(o => o.field && sideOf(o) === side && o.position);
  if (explicit)
    return explicit.position;
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
const LATERAL = Object.freeze({inset : 6, step : 8, reach : 90});
export function lateralLine(doc, sites, organ) {
  const L = LATERAL, out = sideOf(organ), anchor = lateralAnchor(doc, sites, organ);
  const cells = organ.centers.reduce((n, c) => n + (c.copies ?? 1), 0),
        reach = Math.min(L.reach, 16 + 8 * Math.sqrt(cells)),
        from = Math.max(BODY_FRAME.snout, anchor.x - reach / 2),
        to = Math.min(BODY_FRAME.tail - 8, anchor.x + reach / 2),
        depth = (anchor.y - BODY_FRAME.middle) / (skinAt(anchor.x, out) - BODY_FRAME.middle);
  const count = Math.max(2, Math.round((to - from) / L.step));
  return Array.from({length : count + 1}, (_, k) => {
    const x = from + (to - from) * k / count,
          y = BODY_FRAME.middle + depth * (skinAt(x, out) - BODY_FRAME.middle);
    return {x, y : clamp(y, skinAt(x, -1) + L.inset, skinAt(x, 1) - L.inset)};
  });
}
function lateralAnchor(doc, sites, organ) {
  const cells = organ.centers.map(c => centerLocation(c, organ.type, sites));
  const p = organ.position ?? (cells.length ? centroid(cells) : {x : 560, y : 440});
  return {x : p.x, y : clamp(p.y, skinAt(p.x, -1) + LATERAL.inset, skinAt(p.x, 1) - LATERAL.inset)};
}
function skinSenseAnchor(organ, sites) {
  const p =
      organ.position ?? centroid(organ.centers.map(c => centerLocation(c, organ.type, sites)));
  const side = Math.sign(p.y - BODY_FRAME.middle) || sideOf(organ),
        inset = organ.type === 'pain' ? 18 : 8;
  return {x : p.x, y : skinAt(p.x, side) - side * inset};
}
export const EYE =
    Object.freeze({base : 7, per_center : 1, most : 12, aspect : 1.2, pupil : .44, inset : 4});
export const NODE = Object.freeze({ring : 1.45, layer : .5, radius : 4.5});
export function showsNodes(state, organs) {
  const chosen = organs.some(o => o.id === state.selected?.id ||
                                  o.centers.some(c => c.id === state.selected?.id));
  return nodeOpacity(state, chosen) > 0;
}
export function nodeLocation(doc, sites, center, organType) {
  const site = findSite(sites, center.site);
  if (organType === 'touch' || organType === 'pain') {
    const organ = ownerOf(doc, center.id);
    if (!organ)
      return centerLocation(center, organType, sites);
    const anchor = skinSenseAnchor(organ, sites),
          rank = organ.centers.findIndex(c => c.id === center.id) - (organ.centers.length - 1) / 2,
          x = anchor.x + rank * 8, side = Math.sign(anchor.y - BODY_FRAME.middle) || sideOf(organ);
    return {x, y : anchor.y + skinAt(x, side) - skinAt(anchor.x, side)};
  }
  if (organType === 'gills') {
    const organ = ownerOf(doc, center.id);
    if (!organ)
      return centerLocation(center, organType, sites);
    const side = sideSign(site?.side),
          peers = organ.centers.filter(c => sideSign(findSite(sites, c.site)?.side) === side),
          spread = (peers.findIndex(c => c.id === center.id) - (peers.length - 1) / 2) * 6;
    return {
      x : (organ.position?.x ?? 440) + spread,
      y : BODY_FRAME.middle +
              side * (organ.position ? Math.abs(organ.position.y - BODY_FRAME.middle) : 64)
    };
  }
  if (organType === 'lateral') {
    const organ = ownerOf(doc, center.id);
    if (!organ)
      return centerLocation(center, organType, sites);
    const line = lateralLine(doc, sites, organ),
          at = (organ.centers.findIndex(c => c.id === center.id) + .5) / organ.centers.length *
               (line.length - 1),
          lo = Math.floor(at), t = at - lo;
    return {
      x : line[lo].x + (line[Math.min(lo + 1, line.length - 1)].x - line[lo].x) * t,
      y : line[lo].y + (line[Math.min(lo + 1, line.length - 1)].y - line[lo].y) * t
    };
  }
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
  const owner = doc.organs.find(o => o.centers.some(c => c.id === center.id));
  if (owner?.position) {
    const home = centroid(owner.centers.map(c => centerLocation(c, organType, sites)));
    return {x : owner.position.x + at.x - home.x, y : owner.position.y + at.y - home.y};
  }
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
  const side = sideOf(organ), at = organ.position ?? HEAD_SENSES[organ.type](doc, sites, side);
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
    for (const organ of doc.organs)
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
