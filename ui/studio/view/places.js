import {
  BODY_FRAME,
  centroid,
  findSite,
  NERVE_ROLE,
  sideAt,
  sideOf,
  sideSign,
  sitePoint,
  SNAP_DISTANCE,
  ZONE
} from '../model/layout.js';
import {radians} from '../../units.js';
import {skinAt} from './frame.js';
import {bearing} from '../model/retina.js';
import {isRegion, siteRole} from '../model/organs.js';
import {muscleNode} from './muscles.js';
import {layerShown} from './layers.js';

// Where the Atelier draws the organs and their nodes on its fixed fish: senses on their sites,
// nerve centers (the brain's and its regions') on theirs in the drawn brain, the eyes where the
// engine seats them, muscles where they work and the inner organs in a plan of the belly. A
// dropped organ goes to its home, if it has one.
// Where a center lies: on its site of the abstract frame.
export function centerLocation(center, organType, sites) {
  const site = findSite(sites, center.site);
  return site ? sitePoint(site, siteRole(organType))
              : {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
}
// The brain as the Atelier draws it, seen from above, as a brain is pictured: the cerebrum, two
// hemispheres (from FROM to TO, HALF wide each at the back, FRONT of that at the front, rounded
// out by FULL) meeting at the midline, their rims scalloped into LOBES gyri bulging BULGE of their
// length, with furrows inside (FOLDS: each the points it runs through, as shares of the hemisphere
// along it and across it from the midline); behind them the cerebellum (an ellipse, X, RX and RY)
// striped across with FOLIA folds bowed BOW of their length, and the spinal cord from it towards
// the tail (CORD: from, to, its half width at either end, its end rounded END long). The brain lies
// over the lattice the engine's nerve sites are drawn on (BRAIN_MAP), so every nerve center stands
// in it or in the cord. Its rim runs EDGE wide round all of it.
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
// A region stands as one cluster where it was put (its home site, drawn in the brain), whatever
// sites its nodes take near it: its nodes around it on an ellipse RING plus GROW per node wide
// (ASPECT along and across), those taking its inputs on the front arc (ARC each way from straight
// ahead), those sending its outputs on the outer side (SPREAD apart), the others inside, INNER of
// the way out, towards the back; in the spinal cord its nodes run along the cord STEP apart,
// inputs first.
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
function regionPoint(organ, index, sites) {
  const C = CLUSTER, home = findSite(sites, organ.region?.site ?? organ.centers[0]?.site);
  if (!home)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  const at = sitePoint(home, NERVE_ROLE), side = sideOf(organ);
  const center = organ.centers[index], port = center?.port ?? 'none';
  if (home.zone === ZONE.tail) {
    const order = [...organ.centers ].sort((a, b) => PORT_ORDER[a.port ?? 'none'] -
                                                     PORT_ORDER[b.port ?? 'none']);
    return {x : at.x + order.indexOf(center) * C.step, y : at.y};
  }
  if (organ.centers.length < 2)
    return at;
  // Its place among the nodes of the same kind, from the outer end.
  const kin = organ.centers.filter(c => (c.port ?? 'none') === port), rank = kin.indexOf(center);
  const share = kin.length > 1 ? rank / (kin.length - 1) : .5;
  const r = C.ring + C.grow * organ.centers.length;
  // Angles in the drawing: 0 straight back, PI straight ahead, PI/2 times side out.
  const angle = port === 'in'    ? Math.PI - side * C.arc * (1 - 2 * share)
                : port === 'out' ? side * Math.PI / 2 + C.spread * (share - .5) * (kin.length - 1)
                                 : C.spread * (share - .5) * (kin.length - 1) - side * C.spread;
  const reach = port === 'none' ? r * C.inner : r;
  return {
    x : at.x + Math.cos(angle) * reach * C.aspect[0],
    y : at.y + Math.sin(angle) * reach * C.aspect[1]
  };
}
// The inside of the body as the Atelier lays it out, a plan rather than where the engine's cells
// sit (as for the eyes, the brain and the muscles): the gut on side +1, from the throat under the
// brain (THROAT) into the stomach (STOMACH: its middle off the midline, its radii), then the
// intestine coiling back in as many loops as its length gives (COILS: from, to, off the midline
// and WAVE either way) to the vent (VENT); beside it the blood sense, where it reads the blood
// at the heart; across on side -1 the swim bladder, the eggs and the sperm; the glands in a row
// along both flanks, from FRONT, STEP apart, D off the midline but SKIN inside the skin at least.
// Further blood senses stand STACK apart behind the first. An organ's nodes stand NODE apart
// around its place, the gut's on the stomach (its fullness) and along the intestine's middle.
export const INSIDE = Object.freeze({
  blood : {x : 548, d : 88},
  bladder : {x : 610, d : -48},
  gut : {
    throat : 240,
    stomach : {x : 600, d : 44, rx : 34, ry : 22},
    coils : {from : 640, to : 790, d : 40, wave : 20},
    vent : {x : 815, d : 12},
    steps : 96
  },
  eggs : {x : 690, d : -50},
  sperm : {x : 752, d : -40},
  glands : {front : 600, step : 46, d : 86, skin : 26},
  stack : 28,
  node : 16
});
// The gut's way from the throat to the vent: the gullet, the stomach, the intestine coiling in
// `turns` loops; the stomach's middle and a point along the intestine (from 0 to 1).
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
// Where an inner organ lies in the plan; the k-th gland or blood sense of the design by its
// place among them.
function innerHome(doc, organ) {
  const I = INSIDE, middle = BODY_FRAME.middle;
  if (organ.type === 'gut')
    return {x : I.gut.stomach.x, y : middle + I.gut.stomach.d};
  if (organ.type === 'gland') {
    // A gland on a side takes the next place on that side, one on the midline the next free one.
    const glands = doc.organs.filter(o => o.type === 'gland'),
          k = Math.max(0, glands.indexOf(organ));
    const side = organ.side ? sideOf(organ) : k % 2 ? -1 : 1;
    const before =
        organ.side ? glands.slice(0, k).filter(o => sideOf(o) === side).length : Math.floor(k / 2);
    const x = I.glands.front + I.glands.step * before;
    return {x, y : middle + side * Math.min(I.glands.d, skinAt(x, 1) - middle - I.glands.skin)};
  }
  if (organ.type === 'blood') {
    const k = Math.max(0, doc.organs.filter(o => o.type === 'blood').indexOf(organ));
    return {x : I.blood.x + k * I.stack, y : middle + I.blood.d};
  }
  const home = I[organ.type];
  return {x : home.x, y : middle + home.d};
}
// Where the index-th node of an inner organ stands: along the gut, around the others' places.
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
// The place an organ type takes when placed: an inner organ the next place of its kind in the
// plan; none for the others.
export function organHome(doc, type) {
  if (!hasHome(type))
    return null;
  const organ = {type, centers : []};
  return innerHome({organs : [...doc.organs, organ ]}, organ);
}
// Where an organ dropped at `position` goes: one with a home takes it from any distance and the
// engine's places nearest to it (a home on the midline serves both sides, so it gets no twin);
// any other the places nearest to where it was dropped, within SNAP_DISTANCE.
export function placementTarget(doc, type, position) {
  const side = sideAt(position), home = organHome(doc, type);
  return home ? {position : home, snap : Infinity, paired : side !== 0}
              : {position, snap : SNAP_DISTANCE, paired : true};
}
// Muscles stand where they work, whatever sites their cells take (as the eyes and the brain
// do): their nodes lie along the muscle's shape.
export function musclePoint(organ, index, sites) {
  const first = organ.centers[0];
  return muscleNode(organ, index, sites) ?? (first ? centerLocation(first, organ.type, sites)
                                                   : {x : BODY_FRAME.snout, y : BODY_FRAME.middle});
}
// Where an organ lies: amid its centers; an inner organ at its place in the plan of the design
// `doc`.
export function organLocation(organ, sites, doc) {
  if (hasHome(organ.type))
    return innerHome(doc, organ);
  if (organ.type === 'lateral')
    return lateralAnchor(doc, sites, organ);
  const positions = isRegion(organ) ? organ.centers.map((c, i) => regionPoint(organ, i, sites))
                    : organ.type === 'muscle'
                        ? organ.centers.map((c, i) => musclePoint(organ, i, sites))
                        : organ.centers.map(c => centerLocation(c, organ.type, sites));
  if (!positions.length)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  return centroid(positions);
}
// Where a side looks from, as in the engine: along the body amid its light cells (amid its
// near-sense cells where it has none), weighted by how many cells each center makes, and across
// at the skin; the eye is drawn there, EYE.inset inside the skin past its own size. The engine
// seats one eye per side for all its eyes.
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
// The lateral line runs along the flank, INSET under the skin, from behind the eye (GAP past it,
// at least from SPAN's start) to SPAN's end, its pores STEP apart; its nerve leaves it above the
// middle of its cells.
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
// An eye grows with its cells, from EYE.base to EYE.most frame units.
export const EYE =
    Object.freeze({base : 11, per_center : 2, most : 21, aspect : 1.4, pupil : .44, inset : 4});
// An eye's cells as nodes behind it, where its retina lies: through the pupil a cell looking
// ahead sits at the back, one looking out at the inner side. Each colour type has its own arc,
// NODE.ring times the eye's size for the first and NODE.layer more for each further one. Shown
// while the eye is chosen or the scene shows nodes (layers.js).
export const NODE = Object.freeze({ring : 1.45, layer : .5, radius : 4.5});
export function showsNodes(state, organs) {
  const ids = new Set(organs.flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
  return layerShown(state, 'nodes') || ids.has(state.selected?.id) ||
         organs.some(o => state.multi?.has(o.id));
}
// Where a node of an organ is drawn: an eye's cells on their colour type's arc behind the eye,
// opposite their bearing; a region's in its cluster; other nodes on their site (a nerve
// center's in the brain).
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
  if (isRegion({type : organType}) || organType === 'muscle' || hasHome(organType)) {
    const organ = ownerOf(doc, center.id);
    const index = organ?.centers.findIndex(c => c.id === center.id) ?? -1;
    if (index >= 0)
      return organType === 'muscle' ? musclePoint(organ, index, sites)
             : hasHome(organType)   ? innerPoint(doc, organ, index)
                                    : regionPoint(organ, index, sites);
  }
  return centerLocation(center, organType, sites);
}
// The region, muscle or inner organ a node belongs to, looked up once per design.
const OWNERS = new WeakMap();
function ownerOf(doc, centerId) {
  let owners = OWNERS.get(doc);
  if (!owners) {
    owners = new Map();
    for (const organ of doc.organs.filter(o => isRegion(o) || o.type === 'muscle' ||
                                               hasHome(o.type)))
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
