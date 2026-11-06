import {
  BODY_FRAME,
  centroid,
  findSite,
  sideAt,
  sideOf,
  sideSign,
  sitePoint,
  SNAP_DISTANCE
} from '../model/layout.js';
import {allCenters} from '../model/document.js';
import {radians} from '../../units.js';
import {FIN_BASE, HEAD, skinAt, SNOUT_TIP, zoomOf} from './frame.js';
import {MOTOR_KIND} from '../../schema.js';
import {bearing} from '../model/retina.js';
import {isRegion, organFunction} from '../model/organs.js';

// Where the Atelier draws the organs and their nodes on its fixed fish: senses and nerve centers
// on their sites, the eyes where the engine seats them, brain regions at their spots in the
// drawn brain, muscles where they work and the inner organs in a plan of the belly. A dropped
// organ goes to its home, if it has one.
// Where a center lies: on its site of the abstract frame.
export function centerLocation(center, organType, sites) {
  const site = findSite(sites, center.site);
  return site ? sitePoint(site, organType) : {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
}
// The brain as the Atelier draws it: one place in the head where all brain regions lie as in a
// fish's brain seen from above, whatever sites their cells take in the engine (as the eyes and
// the nose stand where a fish has them), and the spinal cord running from it along the body to
// the tail. Each region has its spot (x along the fish, d off the midline towards its side), the
// olfactory bulbs in front, the hypothalamus between the eyes, the tectum behind them, the
// hindbrain at the back of the head; the spinal cord's rhythm lies along the cord, where the
// engine's spinal cells are, its nodes STEP apart, inputs first. The head's spots keep inside of
// where the eyes and their retinas lie and alternate between two lanes, so neighbouring regions
// stay apart. Each region's nodes stand around it on an ellipse RING plus GROW per node wide
// (ASPECT along and across), as a fish's brain runs: those taking its inputs on the front arc
// (ARC each way from straight ahead), those sending its outputs on the outer side (SPREAD apart;
// behind it for a region on the midline), the others inside, INNER of the way out, towards the
// back. OUTLINE is the brain's half width along it, down to the cord.
export const BRAIN = Object.freeze({
  spots : {
    olfactory : {x : 222, d : 20},
    pallium : {x : 276, d : 54},
    hypothalamus : {x : 318, d : 0},
    tectum : {x : 362, d : 30},
    torus : {x : 414, d : 52},
    cerebellum : {x : 454, d : 18},
    hindbrain : {x : 500, d : 48},
    spinal : {x : 580, d : 9, step : 26}
  },
  ring : 12,
  grow : 3.5,
  aspect : [ 1.25, .85 ],
  arc : Math.PI / 3,
  spread : Math.PI / 7,
  inner : .45,
  outline : [
    [ 186, 6 ], [ 196, 34 ], [ 230, 52 ], [ 276, 96 ], [ 318, 66 ], [ 362, 70 ], [ 414, 94 ],
    [ 454, 62 ], [ 500, 90 ], [ 538, 52 ], [ 560, 20 ], [ 590, 14 ], [ 870, 11 ], [ 892, 3 ]
  ]
});
// A region's spot on a side (-1 or 1), where it is placed and drawn.
function regionSpot(type, side) {
  const spot = BRAIN.spots[type];
  return spot ? {x : spot.x, y : BODY_FRAME.middle + side * spot.d} : null;
}
// The inside of the body as the Atelier lays it out, a plan rather than where the engine's cells
// sit (as for the eyes, the brain and the muscles): behind the brain, beside the spinal cord, the
// heart, where the blood sense reads the blood, and the swim bladder across from it; then the gut
// coiling back through the belly (GUT, from and to), the eggs on one side of it and the sperm on
// the other; the glands in a row along both flanks, from FRONT, STEP apart, D off the midline
// but SKIN inside the skin at least. Further blood senses stand STACK apart behind the first. An
// organ's nodes stand NODE apart around its place, the gut's along it.
export const INSIDE = Object.freeze({
  blood : {x : 610, d : 40},
  bladder : {x : 650, d : -46},
  gut : [ 700, 800 ],
  eggs : {x : 708, d : -50},
  sperm : {x : 734, d : 50},
  glands : {front : 600, step : 46, d : 86, skin : 26},
  stack : 28,
  node : 16
});
const INNER_TYPES = Object.freeze([ 'blood', 'bladder', 'gut', 'eggs', 'sperm', 'gland' ]);
const hasHome = type => INNER_TYPES.includes(type);
// Where an inner organ lies in the plan; the k-th gland or blood sense of the design by its
// place among them.
function innerHome(doc, organ) {
  const I = INSIDE, middle = BODY_FRAME.middle;
  if (organ.type === 'gut')
    return {x : (I.gut[0] + I.gut[1]) / 2, y : middle};
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
  if (organ.type === 'gut')
    return {
      x : INSIDE.gut[0] + (INSIDE.gut[1] - INSIDE.gut[0]) * (index + .5) / Math.max(1, count),
      y : home.y
    };
  if (count < 2)
    return home;
  const angle = 2 * Math.PI * index / count - Math.PI / 2;
  return {x : home.x + Math.cos(angle) * INSIDE.node, y : home.y + Math.sin(angle) * INSIDE.node};
}
// The place an organ type takes when placed: a brain region its spot on the side it is placed
// on, an inner organ the next place of its kind in the plan; none for the others.
export function organHome(doc, type, side) {
  if (BRAIN.spots[type])
    return regionSpot(type, side);
  if (!hasHome(type))
    return null;
  const organ = {type, centers : []};
  return innerHome({organs : [...doc.organs, organ ]}, organ);
}
// Where an organ dropped at `position` goes: one with a home takes it from any distance and the
// engine's places nearest to it (a home on the midline serves both sides, so it gets no twin);
// any other the places nearest to where it was dropped, within SNAP_DISTANCE.
export function placementTarget(doc, type, position) {
  const side = sideAt(position), home = organHome(doc, type, side);
  return home ? {position : home, snap : Infinity, paired : side !== 0}
              : {position, snap : SNAP_DISTANCE, paired : true};
}
// Muscles stand where they work, whatever sites their cells take (as the eyes and the brain do):
// a tail muscle along the tail stalk, a steering one along the base of its side's fin, a sucking
// one around the throat, a biting one along its jaw. Their nodes spread over that stretch, each
// INSET inside the skin or OFF the throat; STALK is the tail stalk's stretch.
const MUSCLE_AT = Object.freeze({inset : 30, off : 9, stalk : [ 770, 875 ], jaw : [ .3, .95 ]});
export function musclePoint(organ, index, sites) {
  const first = organ.centers[0], site = findSite(sites, first?.site);
  const code = organFunction(organ, sites), side = sideOf(organ);
  const share = (index + .5) / Math.max(1, organ.centers.length), M = MUSCLE_AT, H = HEAD;
  const along = ([ from, to ]) => from + (to - from) * share;
  const mouth = {x : SNOUT_TIP.x + H.mouth_in, y : SNOUT_TIP.y};
  if (code === MOTOR_KIND.forward || code === MOTOR_KIND.turn) {
    const x =
        along(code === MOTOR_KIND.turn ? [ FIN_BASE.at, FIN_BASE.at + FIN_BASE.length ] : M.stalk);
    return {x, y : skinAt(x, side) - side * M.inset};
  }
  if (code === MOTOR_KIND.suction) {
    const x = along([ mouth.x + H.mouth[0] + H.cheek[0] / 2, H.throat_end ]);
    return {x, y : BODY_FRAME.middle + side * M.off};
  }
  if (code === MOTOR_KIND.aggression) {
    // Along the jaw from the corner of the mouth back to the hinge.
    const t = along(M.jaw);
    return {x : mouth.x + H.jaw_back * t, y : mouth.y + side * (H.mouth[1] + H.jaw_spread * t)};
  }
  return site ? centerLocation(first, organ.type, sites) : {x : BODY_FRAME.snout, y : mouth.y};
}
const PORT_ORDER = Object.freeze({in : 0, none : 1, out : 2});
function regionPoint(organ, index) {
  const spot = BRAIN.spots[organ.type], B = BRAIN;
  if (!spot)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  const middle = !organ.side, side = sideOf(organ), y = BODY_FRAME.middle + side * spot.d;
  const center = organ.centers[index], port = center?.port ?? 'none';
  if (spot.step) {
    const order = [...organ.centers ].sort((a, b) => PORT_ORDER[a.port ?? 'none'] -
                                                     PORT_ORDER[b.port ?? 'none']);
    return {x : spot.x + order.indexOf(center) * spot.step, y};
  }
  if (organ.centers.length < 2)
    return {x : spot.x, y};
  // Its place among the nodes of the same kind, from the outer end.
  const kin = organ.centers.filter(c => (c.port ?? 'none') === port), rank = kin.indexOf(center);
  const share = kin.length > 1 ? rank / (kin.length - 1) : .5;
  const r = B.ring + B.grow * organ.centers.length;
  // Angles in the drawing: 0 straight back, PI straight ahead, PI/2 times side out.
  const out = middle ? 0 : side * Math.PI / 2;
  const angle = port === 'in' ? Math.PI - side * B.arc * (1 - 2 * share)
                : port === 'out'
                    ? out + B.spread * (share - .5) * (kin.length - 1)
                    : B.spread * (share - .5) * (kin.length - 1) - (middle ? 0 : side * B.spread);
  const reach = port === 'none' ? r * B.inner : r;
  return {
    x : spot.x + Math.cos(angle) * reach * B.aspect[0],
    y : y + Math.sin(angle) * reach * B.aspect[1]
  };
}
// Where an organ lies: amid its centers; a brain region at its place in the brain, an inner
// organ at its place in the plan of the design `doc`.
export function organLocation(organ, sites, doc) {
  if (hasHome(organ.type))
    return innerHome(doc, organ);
  if (organ.type === 'lateral')
    return lateralAnchor(doc, sites, organ);
  const positions = isRegion(organ) ? organ.centers.map((c, i) => regionPoint(organ, i))
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
// while the eye is chosen, a tool works on nodes, or from NODE.zoom on.
export const NODE =
    Object.freeze({ring : 1.45, layer : .5, radius : 4.5, zoom : 1.35, spread : 13});
const NODE_TOOLS = Object.freeze([ 'wire', 'hormone', 'learn', 'stimulate', 'erase' ]);
export const nodesAtZoom = zoom => zoom >= NODE.zoom;
export function showsNodes(state, organs) {
  const ids = new Set(organs.flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
  return nodesAtZoom(zoomOf(state)) || NODE_TOOLS.includes(state.tool) ||
         ids.has(state.selected?.id) || organs.some(o => state.multi?.has(o.id));
}
// Where a node of an organ is drawn: an eye's cells on their colour type's arc behind the eye,
// opposite their bearing; other nodes on their site. Nerve centers whose sites are drawn at the
// same point (they differ in depth alone) stand NODE.spread around it, each to be seen and
// chosen.
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
                                    : regionPoint(organ, index);
  }
  const p = centerLocation(center, organType, sites);
  if (center.role !== 'nerve')
    return p;
  const together = sharedPoints(doc, sites).get(pointKey(p)) ?? [];
  if (together.length < 2)
    return p;
  const angle = 2 * Math.PI * together.indexOf(center.id) / together.length;
  return {x : p.x + Math.cos(angle) * NODE.spread, y : p.y + Math.sin(angle) * NODE.spread};
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
// The nerve centers of a design by the point they are drawn at, worked out once per design.
const pointKey = p => Math.round(p.x) + ':' + Math.round(p.y);
const SHARED = new WeakMap();
function sharedPoints(doc, sites) {
  let points = SHARED.get(doc);
  if (!points) {
    points = new Map();
    for (const c of allCenters(doc))
      if (c.role === 'nerve' && !isRegion({type : c.organType})) {
        const key = pointKey(centerLocation(c, c.organType, sites));
        points.set(key, [...(points.get(key) ?? []), c.id ]);
      }
    SHARED.set(doc, points);
  }
  return points;
}
export function eyeRadius(doc, side) {
  const count = doc.organs.filter(o => o.type === 'eye' && sideOf(o) === side)
                    .reduce((n, o) => n + o.centers.length, 0);
  return Math.min(EYE.most, EYE.base + count * EYE.per_center);
}
