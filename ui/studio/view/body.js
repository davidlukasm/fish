import {
  BODY_FRAME,
  centroid,
  sideAt,
  sideIndex,
  sideOf,
  sideSign,
  sitePoint,
  SNAP_DISTANCE
} from '../model/layout.js';
import {allCenters, centerIndex, groupReport, isChosen} from '../model/document.js';
import {radians, wrapAngle} from '../../units.js';
import {fishBodyColour} from '../model/pigment.js';
import {chromatophoresSvg} from './pigments.js';
import {
  FIN_BASE,
  SNOUT_TIP,
  bodyDirection,
  finPaths,
  finRoots,
  finSizes,
  fishPath,
  skinAt,
  skinDirection,
  skinPoints,
  tailFin
} from './frame.js';
import {ANATOMY, ATELIER_LIMITS, BODY_UNIT, MOTOR_KIND} from '../../schema.js';
import {gutTurns, jawReach, lipWidth, toothForm} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {t, tList} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
import {profileColor} from './spectrum.js';
import {arrowPath, cornerDiscs, lateralCorners, lateralFeel} from './lateral.js';
import {bearing} from '../model/retina.js';
import {isRegion, MUSCLE_LABEL_INDEX, organFunction} from '../model/organs.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {preferredScent} from '../../tuning.js';
import {scentColors} from '../../brain_model.js';

// The Atelier draws a fixed, abstract fish: this outline and simple glyphs where the organs'
// cells sit. It does not change with the design. The engine's body shape follows from where the
// cells sit and how much tissue lies there; the Aquarium shows it.
//
// The engine's fish spans about its body diameter from snout to tail root, so the abstract fish
// is two body radii long; fields of view and test lights are drawn at that scale.
export const BODY_RADIUS_PIXELS = (BODY_FRAME.tail - BODY_FRAME.snout) / 2;

const lookup = (sites, id) => sites.find(s => s.id === id);
// An organ's name; a muscle's by what it does where it lies, when the sites are known.
export function organTitle(organ, sites = null) {
  const index = organ.type === 'muscle' && organ.centers
                    ? MUSCLE_LABEL_INDEX.get(organFunction(organ, sites))
                    : undefined;
  return index === undefined ? t('studio.organs.' + organ.type)
                             : tList('studio.muscleTitles')[index];
}

// Where a center lies: on its site of the abstract frame.
function centerLocation(center, organType, sites) {
  const site = lookup(sites, center.site);
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
const BRAIN = Object.freeze({
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
const INSIDE = Object.freeze({
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
function musclePoint(organ, index, sites) {
  const first = organ.centers[0], site = sites.find(s => s.id === first?.site);
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
// The outline runs smoothly through the middles between its points, bending at each.
function brainOutline() {
  const M = BODY_FRAME.middle, upper = BRAIN.outline.map(([ x, h ]) => [x, M - h]);
  const lower = [...BRAIN.outline ].reverse().map(([ x, h ]) => [x, M + h]);
  const ring = [...upper, ...lower ], mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const at = p => fixed(p[0]) + ' ' + fixed(p[1]);
  let d = 'M' + at(mid(ring.at(-1), ring[0]));
  ring.forEach((p, k) => { d += ' Q' + at(p) + ' ' + at(mid(p, ring[(k + 1) % ring.length])); });
  return d + 'Z';
}
// Where an organ lies: amid its centers; a brain region at its place in the brain, an inner
// organ at its place in the plan of the design `doc`.
export function organLocation(organ, sites, doc) {
  if (hasHome(organ.type))
    return innerHome(doc, organ);
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
// An eye grows with its cells, from EYE.base to EYE.most frame units.
const EYE =
    Object.freeze({base : 11, per_center : 2, most : 21, aspect : 1.4, pupil : .44, inset : 4});
// An eye's cells as nodes behind it, where its retina lies: through the pupil a cell looking
// ahead sits at the back, one looking out at the inner side. Each colour type has its own arc,
// NODE.ring times the eye's size for the first and NODE.layer more for each further one. Shown
// while the eye is chosen, a tool works on nodes, or from NODE.zoom on.
const NODE = Object.freeze({ring : 1.45, layer : .5, radius : 4.5, zoom : 1.35, spread : 13});
const NODE_TOOLS = Object.freeze([ 'wire', 'hormone', 'learn', 'stimulate', 'erase' ]);
export const nodesAtZoom = zoom => zoom >= NODE.zoom;
export function showsNodes(state, organs) {
  const ids = new Set(organs.flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
  return nodesAtZoom(state.camera?.zoom ?? 1) || NODE_TOOLS.includes(state.tool) ||
         ids.has(state.selected?.id) || organs.some(o => state.multi?.has(o.id));
}
// Where a node of an organ is drawn: an eye's cells on their colour type's arc behind the eye,
// opposite their bearing; other nodes on their site. Nerve centers whose sites are drawn at the
// same point (they differ in depth alone) stand NODE.spread around it, each to be seen and
// chosen.
export function nodeLocation(doc, sites, center, organType) {
  const site = lookup(sites, center.site);
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
function retinaNodes(state, organs) {
  const zoom = state.camera?.zoom ?? 1;
  let html = '';
  for (const organ of organs)
    for (const center of organ.centers) {
      const p = nodeLocation(state.document, state.sites, center, organ.type);
      const profile = organ.field?.profiles.find(q => q.id === center.profile);
      const chosen = state.selected?.id === center.id || state.multi?.has(center.id);
      // The colour type being edited stands out; the others stay behind it.
      const other = state.visionProfile && center.profile !== state.visionProfile;
      html += '<circle class="aid-retina-node' + (chosen ? ' selected' : '') +
              (other ? ' other' : '') + '" data-center="' + escapeText(center.id) + '" cx="' +
              fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' + fixed(NODE.radius / Math.sqrt(zoom)) +
              '" fill="' + (profile ? profileColor(profile) : 'currentColor') + '"/>';
    }
  return html;
}
export function eyeRadius(doc, side) {
  const count = doc.organs.filter(o => o.type === 'eye' && sideOf(o) === side)
                    .reduce((n, o) => n + o.centers.length, 0);
  return Math.min(EYE.most, EYE.base + count * EYE.per_center);
}
// Glyph sizes in frame units.
const GLYPH = Object.freeze({
  near_dot : 5,
  near_arcs : [ [ 14, 35, 12 ], [ 23, 53, 21 ] ],
  nose : [ 10, 6 ],
  ovary : {sac : [ 24, 17 ], egg : 4.2, eggs : [ 4, 12 ], turn : 2.4},
  testis : {sac : [ 26, 11 ], streaks : 3, gap : 5, length : 30, wave : 3},
  bladder : [ 39, 24 ],
  gut_wave : 20,
  gut_steps : 96,
  blood : [ 7, 11 ],
  blood_drops : 3,
  blood_step : 13,
  gland : [ 16, 11 ],
  lateral_span : [ 285, 860 ],
  lateral_inset : 9,
  lateral_step : 36,
  lateral_gap : 10,
  lateral_pore : 3.2,
  muscle_lines : 3,
  muscle_step : 9,
  muscle_reach : 22
});
function organGlyph(state, organ, drawnEyes) {
  const {document : doc, sites} = state, pos = organLocation(organ, sites, doc), G = GLYPH;
  switch (organ.type) {
  case 'eye': {
    const side = sideOf(organ), eye = eyeLocation(doc, sites, side);
    if (!eye || drawnEyes.has(side))
      return '';
    drawnEyes.add(side);
    const r = eyeRadius(doc, side);
    const eyes = doc.organs.filter(o => o.type === 'eye' && sideOf(o) === side);
    return '<ellipse class="aid-anatomical-eye" cx="' + fixed(eye.x) + '" cy="' + fixed(eye.y) +
           '" rx="' + fixed(r * EYE.aspect) + '" ry="' + fixed(r) + '"/>' +
           '<circle class="aid-anatomical-pupil" cx="' + fixed(eye.x) + '" cy="' + fixed(eye.y) +
           '" r="' + fixed(r * EYE.pupil) + '"/>' +
           (showsNodes(state, eyes) ? retinaNodes(state, eyes) : '');
  }
  case 'proximity':
    return '<g class="aid-anatomical-proximity"><circle cx="' + fixed(pos.x) + '" cy="' +
           fixed(pos.y) + '" r="' + G.near_dot + '"/><path d="' +
           G.near_arcs
               .map(([ inner, outer, half ]) => 'M' + fixed(pos.x - inner) + ' ' +
                                                fixed(pos.y - half) + ' Q' + fixed(pos.x - outer) +
                                                ' ' + fixed(pos.y) + ' ' + fixed(pos.x - inner) +
                                                ' ' + fixed(pos.y + half))
               .join(' ') +
           '"/></g>';
  // A nose in the colour of the scent it prefers, as the Aquarium colours smell cells.
  case 'nose': {
    const c = organ.centers[0], colour = c ? scentColors?.[preferredScent(c)] : null;
    return '<ellipse class="aid-anatomical-nose" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.nose[0] + '" ry="' + G.nose[1] + '"' +
           (colour ? ' style="fill:' + colour + '"' : '') + '/>';
  }
  // The ovary a sac of round eggs, the more the more its growth cells make; the testis a
  // slimmer pale sac streaked with sperm.
  case 'eggs': {
    const O = GLYPH.ovary, growth = organ.centers.find(c => c.key === 'growth');
    const count = Math.round(O.eggs[0] + (O.eggs[1] - O.eggs[0]) * (growth?.copies ?? 1) /
                                             ATELIER_LIMITS.max_copies);
    let html = '<ellipse class="aid-anatomical-ovary" cx="' + fixed(pos.x) + '" cy="' +
               fixed(pos.y) + '" rx="' + O.sac[0] + '" ry="' + O.sac[1] + '"/>';
    for (let i = 0; i < count; ++i) {
      // Eggs on a sunflower spiral, filling the sac.
      const r = Math.sqrt((i + .5) / count), a = i * O.turn;
      html += '<circle class="aid-anatomical-egg" cx="' +
              fixed(pos.x + Math.cos(a) * r * (O.sac[0] - O.egg)) + '" cy="' +
              fixed(pos.y + Math.sin(a) * r * (O.sac[1] - O.egg)) + '" r="' + O.egg + '"/>';
    }
    return html;
  }
  case 'sperm': {
    const T = GLYPH.testis;
    let html = '<ellipse class="aid-anatomical-testis" cx="' + fixed(pos.x) + '" cy="' +
               fixed(pos.y) + '" rx="' + T.sac[0] + '" ry="' + T.sac[1] + '"/><path ' +
               'class="aid-anatomical-sperm" d="';
    for (let i = 0; i < T.streaks; ++i) {
      const y = pos.y + (i - (T.streaks - 1) / 2) * T.gap, x = pos.x - T.length / 2;
      html += 'M' + fixed(x) + ' ' + fixed(y) + ' q' + T.length / 4 + ' ' + -T.wave + ' ' +
              T.length / 2 + ' 0 t' + T.length / 2 + ' 0 ';
    }
    return html + '"/>';
  }
  case 'bladder':
    return '<ellipse class="aid-anatomical-bladder" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.bladder[0] + '" ry="' + G.bladder[1] + '"/>';
  case 'gut':
    return gutPath(state);
  // The blood sense: drops of blood where its cells read it.
  case 'blood': {
    let html = '';
    for (let i = 0; i < G.blood_drops; ++i) {
      const x = pos.x + (i - (G.blood_drops - 1) / 2) * G.blood_step, [ w, h ] = G.blood;
      html += '<path class="aid-anatomical-blood" d="M' + fixed(x) + ' ' + fixed(pos.y - h) + ' C' +
              fixed(x + w) + ' ' + fixed(pos.y) + ' ' + fixed(x + w / 2) + ' ' +
              fixed(pos.y + h / 2) + ' ' + fixed(x) + ' ' + fixed(pos.y + h / 2) + ' C' +
              fixed(x - w / 2) + ' ' + fixed(pos.y + h / 2) + ' ' + fixed(x - w) + ' ' +
              fixed(pos.y) + ' ' + fixed(x) + ' ' + fixed(pos.y - h) + 'Z"/>';
    }
    return html;
  }
  case 'defense':
    return spinesSvg(state, organ);
  case 'touch':
  case 'pain':
    return skinSenseSvg(organ, sites);
  // The skin's pigment cells all over the fish, not at their nodes.
  case 'pigment':
    return chromatophoresSvg(state, organ, isChosen(state.selected, organ));
  case 'gland':
    return '<ellipse class="aid-anatomical-gland" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.gland[0] + '" ry="' + G.gland[1] + '"/>';
  // The lateral line runs along the flank under the skin, from behind the eye (LATERAL_GAP past
  // it) to the tail, its pores LATERAL_STEP apart; a broad band behind it takes clicks.
  case 'lateral': {
    const out = sideOf(organ), eye = eyeLocation(doc, sites, out);
    const from = Math.max(G.lateral_span[0],
                          eye ? eye.x + eyeRadius(doc, out) * EYE.aspect + G.lateral_gap : 0),
          to = G.lateral_span[1];
    const at = x => ({x, y : skinAt(x, out) - out * G.lateral_inset});
    const count = Math.round((to - from) / G.lateral_step);
    const points = Array.from({length : count + 1}, (_, k) => at(from + (to - from) * k / count));
    const line = 'M' + points.map(p => fixed(p.x) + ' ' + fixed(p.y)).join(' L');
    return '<path class="aid-lateral-hit" d="' + line +
           '"/><path class="aid-anatomical-lateral" d="' + line + '"/>' +
           points
               .map(p => '<circle class="aid-lateral-pore" cx="' + fixed(p.x) + '" cy="' +
                         fixed(p.y) + '" r="' + G.lateral_pore + '"/>')
               .join('');
  }
  // A bundle of fibres on each node of a muscle.
  case 'muscle': {
    let html = '';
    for (const [index] of organ.centers.entries()) {
      const at = musclePoint(organ, index, sites);
      for (let i = 0; i < G.muscle_lines; ++i)
        html += '<path class="aid-anatomical-muscle" d="M' + fixed(at.x - G.muscle_reach) + ' ' +
                fixed(at.y + (i - (G.muscle_lines - 1) / 2) * G.muscle_step) + ' l' +
                2 * G.muscle_reach + ' 0"/>';
    }
    return html;
  }
  default:
    return isRegion(organ) ? regionGlyph(state, organ) : '';
  }
}
// Spines stand out of the skin, SPINES.step apart along it, where the engine finds them shielding
// the body: in each direction around it as long as they shield it there at rest, from
// SPINES.length's least (hardly) to its most (fully), leaning back by SPINES.lean of that; behind
// them, as the organ is chosen or raises them, as long as they shield it fully raised. Each organ
// draws the spines of the directions its nodes spread the most into; until the engine has
// answered, one spine at each node.
const SPINES = Object.freeze({step : 15, base : 8, length : [ 6, 64 ], lean : .3, least : .03});
// A value of the engine's samples around the body (the middles of equal arcs from straight
// behind) at a direction, between the two nearest.
function aroundAt(samples, angle) {
  const count = samples.length, at = (angle + Math.PI) / (2 * Math.PI) * count - .5;
  const k = Math.floor(at), share = at - k;
  return samples[(k % count + count) % count] * (1 - share) +
         samples[((k + 1) % count + count) % count] * share;
}
function spinePath(root, out, value) {
  const S = SPINES, length = S.length[0] + (S.length[1] - S.length[0]) * value;
  const along = {x : -out.y, y : out.x}, back = along.x >= 0 ? 1 : -1;
  const tip = {
    x : root.x + out.x * length + back * along.x * length * S.lean,
    y : root.y + out.y * length + back * along.y * length * S.lean
  };
  const end = sign => fixed(root.x + sign * along.x * S.base / 2) + ' ' +
                      fixed(root.y + sign * along.y * S.base / 2);
  return 'M' + end(-1) + ' L' + fixed(tip.x) + ' ' + fixed(tip.y) + ' L' + end(1) + 'Z';
}
function spinesSvg(state, organ) {
  const {spinesRest : rest, spinesRaised : raised, spineGroups : owners} = state.anatomy ?? {};
  const own = new Set(organ.centers.map(c => centerIndex(state.document, c.id)));
  const chosen = isChosen(state.selected, organ);
  let resting = '', lifted = '';
  for (const point of rest?.length && owners ? skinPoints(SPINES.step) : []) {
    const angle = skinDirection(point, state.anatomy?.zones), count = owners.length,
          nearest = Math.floor((angle + Math.PI) / (2 * Math.PI) * count) % count;
    const most = aroundAt(raised, angle);
    if (!own.has(owners[nearest]) || most < SPINES.least)
      continue;
    lifted += '<path d="' + spinePath(point, point.out, most) + '"/>';
    resting += '<path d="' + spinePath(point, point.out, aroundAt(rest, angle)) + '"/>';
  }
  if (!resting)
    for (const center of organ.centers) {
      const {x} = centerLocation(center, organ.type, state.sites), side = sideOf(organ);
      resting += '<path d="' + spinePath({x, y : skinAt(x, side)}, {x : 0, y : side}, 0) + '"/>';
    }
  return '<g class="aid-anatomical-spines' + (chosen ? ' chosen' : '') + '" data-part="spines" ' +
         'data-spines="' + escapeText(organ.id) + '"><g class="aid-spines-raised">' + lifted +
         '</g><g class="aid-spines-rest">' + resting + '</g></g>';
}
// Touch cells as bristles out of the skin where each node lies, pain cells as nerve endings
// forking under it; a disc around each takes clicks. SKIN_SENSE: the bristles' spacing, how far
// they reach out and start inside, the fork's stem and spread, the disc's radius.
const SKIN_SENSE =
    Object.freeze({hairs : [ -5, 0, 5 ], reach : 8, root : 3, stem : 12, fork : 5, hit : 13});
function skinSenseSvg(organ, sites) {
  const S = SKIN_SENSE;
  return organ.centers
      .map(center => {
        const site = lookup(sites, center.site), side = sideSign(site?.side);
        const {x} = centerLocation(center, organ.type, sites), skin = skinAt(x, side);
        const at = (dx, depth) => fixed(x + dx) + ' ' + fixed(skin - side * depth);
        const strokes =
            organ.type === 'touch'
                ? S.hairs.map(dx => 'M' + at(dx, S.root) + ' L' + at(dx * 1.4, -S.reach)).join(' ')
                : 'M' + at(0, S.stem) + ' L' + at(0, S.root * 2) + ' M' + at(-S.fork, 0) + ' L' +
                      at(0, S.root * 2) + ' L' + at(S.fork, 0);
        return '<circle class="aid-skin-hit" cx="' + fixed(x) + '" cy="' + fixed(skin) + '" r="' +
               S.hit + '"/><path class="aid-anatomical-' + organ.type + '" d="' + strokes + '"/>';
      })
      .join('');
}
// The gut coils back through the belly in as many loops as the engine and the Aquarium give its
// length.
function gutPath(state) {
  const G = GLYPH, [ front, back ] = INSIDE.gut;
  const turns = gutTurns(state.anatomy?.anatomy?.[ANATOMY.gut_length] ?? BODY_UNIT.trait_middle);
  const points = Array.from({length : G.gut_steps + 1}, (_, k) => {
    const t = k / G.gut_steps;
    return fixed(front + (back - front) * t) + ' ' +
           fixed(BODY_FRAME.middle + G.gut_wave * Math.sin(2 * Math.PI * turns * t));
  });
  return '<path class="aid-anatomical-gut" d="M' + points.join(' L') + '"/>';
}
// A brain region: a soft hull around its nodes, REGION.pad wider than they lie apart.
// A region's hull around its nodes, its symbol at the hull's upper left (BADGE: radius, icon
// size), kept at its size on screen.
const REGION = Object.freeze({pad : 9, least : 16, badge : 11, icon : 14, corner : .7});
function regionHull(state, organ) {
  const points = organ.centers.map(c => nodeLocation(state.document, state.sites, c, organ.type));
  if (!points.length)
    return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {
    cx : (Math.min(...xs) + Math.max(...xs)) / 2,
    cy : (Math.min(...ys) + Math.max(...ys)) / 2,
    rx : Math.max(REGION.least, (Math.max(...xs) - Math.min(...xs)) / 2 + REGION.pad),
    ry : Math.max(REGION.least, (Math.max(...ys) - Math.min(...ys)) / 2 + REGION.pad)
  };
}
function regionGlyph(state, organ) {
  const hull = regionHull(state, organ);
  if (!hull)
    return '';
  const {cx, cy, rx, ry} = hull;
  return '<ellipse class="aid-anatomical-region ' + escapeText(organ.type) + '" cx="' + fixed(cx) +
         '" cy="' + fixed(cy) + '" rx="' + fixed(rx) + '" ry="' + fixed(ry) + '"/>' +
         regionBadge(state, organ, hull);
}
// A region's symbol at its hull's upper left.
function regionBadge(state, organ, hull = regionHull(state, organ)) {
  if (!hull)
    return '';
  const {cx, cy, rx, ry} = hull, zoom = state.camera?.zoom ?? 1;
  return '<g class="aid-region-badge" transform="translate(' + fixed(cx - rx * REGION.corner) +
         ' ' + fixed(cy - ry * REGION.corner) + ') scale(' + fixed(1 / zoom) + ')"><circle r="' +
         REGION.badge + '"/><svg x="' + -REGION.icon / 2 + '" y="' + -REGION.icon / 2 +
         '" width="' + REGION.icon + '" height="' + REGION.icon +
         '" viewBox="0 0 24 24"><path d="' + STUDIO_ICON[organ.type] + '"/></svg></g>';
}
// The abstract fish in the colour of its pigment, with its organs.
// The nodes of an organ with several, each on its site, to choose or wire one of them alone.
function organNodes(state, organ) {
  // A brain region's nodes are drawn as nerve centers.
  if (organ.type === 'eye' || organ.type === 'pigment' || isRegion(organ) ||
      organ.centers.length < 2 || !showsNodes(state, [ organ ]))
    return '';
  const zoom = state.camera?.zoom ?? 1;
  return organ.centers
      .map(center => {
        const p = nodeLocation(state.document, state.sites, center, organ.type);
        const chosen = state.selected?.id === center.id || state.multi?.has(center.id);
        return '<circle class="aid-retina-node aid-organ-node ' + center.role +
               (chosen ? ' selected' : '') + '" data-center="' + escapeText(center.id) + '" cx="' +
               fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' + fixed(NODE.radius / Math.sqrt(zoom)) +
               '"><title>' + escapeText(t('studio.centers.' + center.key)) + '</title></circle>';
      })
      .join('');
}
// What touch, injury and lateral-line cells feel, from the engine's design view, while their
// organ is chosen: the skin touch and injury cells feel on, the brighter the more their angular
// kernel weighs it; for lateral-line cells the way water passing them makes them answer.
const FELT = Object.freeze({step : 6, least : .04, arrow : 58, gap : 6, head : 10, corner : 2.2});
// The engine's cells of each of the organ's groups, with where the group sits on the frame.
function feltCells(state, organ) {
  return organ.centers.flatMap(
      c => (groupReport(state.document, state.anatomy, 'felt', c.id) ??
            []).map(cell => ({cell, at : centerLocation(c, organ.type, state.sites)})));
}
// The skin where touch and injury cells feel, in pieces FELT.step long, each as bright as the
// cells' kernels weigh its direction.
function feltSkin(state, cells) {
  const points = skinPoints(FELT.step);
  return points.slice(1)
      .map((point, k) => {
        const from = points[k], middle = {x : (from.x + point.x) / 2, y : (from.y + point.y) / 2},
              angle = skinDirection(middle, state.anatomy?.zones);
        const weight = Math.max(...cells.map(({cell : [ aim, width ]}) =>
                                                 1 - Math.abs(wrapAngle(angle - aim)) / width));
        return weight <= FELT.least
                   ? ''
                   : '<path d="M' + fixed(from.x) + ' ' + fixed(from.y) + ' L' + fixed(point.x) +
                         ' ' + fixed(point.y) + '" stroke-opacity="' + fixed(weight) + '"/>';
      })
      .join('');
}
// While a lateral line is chosen: the corners where it samples the water, as large as its cells
// weigh them, and at each of its nodes on the skin an arrow of the water streaming against it
// from the way its cells face.
function feltFlow(state, organ, cells) {
  const feel = lateralFeel(state, organ), corners = state.capabilities?.lateralCorners;
  const centre = {x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle};
  const discs = feel && corners ? cornerDiscs(lateralCorners(corners, centre, BODY_RADIUS_PIXELS,
                                                             skinAt(centre.x, 1) - centre.y),
                                              feel.weights, FELT.corner)
                                : '';
  return discs +
         cells
             .map(({cell : [ angle ], at}) => {
               const side = Math.sin(angle) < 0 ? -1 : 1;
               const root = {x : at.x, y : skinAt(at.x, side)}, d = bodyDirection(angle);
               return '<path class="aid-felt-arrow" d="' +
                      arrowPath({x : root.x + d.x * FELT.arrow, y : root.y + d.y * FELT.arrow},
                                {x : root.x + d.x * FELT.gap, y : root.y + d.y * FELT.gap},
                                FELT.head) +
                      '"/>';
             })
             .join('');
}
function feltSvg(state, organ) {
  const chosen = isChosen(state.selected, organ);
  const cells =
      chosen && [ 'touch', 'pain', 'lateral' ].includes(organ.type) ? feltCells(state, organ) : [];
  if (!cells.length)
    return '';
  return '<g class="aid-felt ' + organ.type + '">' +
         (organ.type === 'lateral' ? feltFlow(state, organ, cells) : feltSkin(state, cells)) +
         '</g>';
}
// What grows at the head, as the engine's design view finds it and the Aquarium draws it: a
// mouth where muscles suck or bite, as wide and deep as the jaw is long and with lips as thick
// as they suck; teeth on each side of its rim where muscles bite there, as many, as long and as
// blunt as the Aquarium grows them; and barbels where smell cells also feel touch. HEAD.mouth is
// the mouth of a middle jaw, HEAD.lip its lips without suction, HEAD.tooth the base and reach
// of a tooth at full biting power; the teeth of a side spread over HEAD.tooth_arc of the rim.
// Behind the mouth the jaws run back JAW_BACK (for a middle jaw) to their hinges, JAW_SPREAD
// further out, as thick as they bite (JAW_WIDTH, least and more at full power); the cheeks
// swell CHEEK with suction; the throat, THROAT wide, leads back to THROAT_END, below the brain.
// Suction draws INTAKE.lines streams of water into the mouth from LEAST plus SPAN at full
// strength ahead, SPREAD times the mouth's height apart there and NARROW at the mouth.
const HEAD = Object.freeze({
  mouth : [ 10, 20 ],
  mouth_in : 12,
  lip : 1.6,
  tooth_arc : 1.4,
  tooth : [ 5, 8 ],
  jaw_back : 66,
  jaw_spread : 14,
  jaw_width : [ 3, 4 ],
  cheek : [ 40, 16 ],
  throat : 10,
  throat_end : 195,
  intake : {lines : 5, least : 18, span : 46, spread : 1.7, bend : .45, gap : 3, narrow : .45},
  barbel_root : [ 26, 15 ],
  barbel_bend : [ 4, 46 ],
  barbel_end : [ -14, 62 ]
});
function headSvg(state) {
  const columns = state.anatomy?.anatomy;
  if (!Array.isArray(columns))
    return '';
  const tip = SNOUT_TIP, H = HEAD, title = key => '<title>' + escapeText(t(key)) + '</title>';
  let html = '';
  for (const side of [-1, 1])
    if (columns[ANATOMY.smell_outer_left + sideIndex(side)] > 0)
      html += '<path class="aid-head-barbel" d="M' + fixed(tip.x + H.barbel_root[0]) + ' ' +
              fixed(tip.y + side * H.barbel_root[1]) + ' Q' + fixed(tip.x + H.barbel_bend[0]) +
              ' ' + fixed(tip.y + side * H.barbel_bend[1]) + ' ' + fixed(tip.x + H.barbel_end[0]) +
              ' ' + fixed(tip.y + side * H.barbel_end[1]) + '">' + title('studio.head.barbels') +
              '</path>';
  const middle = BODY_UNIT.trait_middle, jaw = columns[ANATOMY.jaw_length] ?? middle;
  const rx = H.mouth[0] * jawReach(jaw) / jawReach(middle),
        ry = H.mouth[1] * mouthShare(jaw) / mouthShare(middle);
  const mouth = {x : tip.x + H.mouth_in, y : tip.y};
  const bite = organSize(columns[ANATOMY.aggression_strength]),
        suction = organSize(columns[ANATOMY.suction_strength]);
  const eats = columns[ANATOMY.suction_strength] > 0 || columns[ANATOMY.aggression] > 0 ||
               columns[ANATOMY.mouth] > 0;
  if (eats) {
    // The throat from the back of the mouth to the gut, the cheeks swelling with suction, and
    // the jaws from the corners of the mouth back to their hinges.
    const back = mouth.x + rx, reach = H.jaw_back * jawReach(jaw) / jawReach(middle);
    html += '<path class="aid-head-throat" data-part="throat" d="M' + fixed(back) + ' ' +
            fixed(mouth.y) + ' L' + H.throat_end + ' ' + fixed(mouth.y) +
            '" style="stroke-width:' + fixed(H.throat * (1 + suction)) + '">' +
            title('studio.head.throat') + '</path>';
    // Water drawn into the mouth from ahead, the further the stronger the suction.
    if (suction) {
      const I = H.intake, reachOut = I.least + I.span * suction;
      for (let k = 0; k < I.lines; ++k) {
        const across = (k - (I.lines - 1) / 2) / ((I.lines - 1) / 2 || 1);
        const from = {x : mouth.x - reachOut, y : mouth.y + across * ry * I.spread};
        html += '<path class="aid-head-intake" data-part="intake" d="M' + fixed(from.x) + ' ' +
                fixed(from.y) + ' Q' + fixed(mouth.x - reachOut * I.bend) + ' ' +
                fixed(mouth.y + across * ry * I.spread * I.bend) + ' ' + fixed(mouth.x - I.gap) +
                ' ' + fixed(mouth.y + across * ry * I.narrow) + '"/>';
      }
    }
    if (suction)
      html += '<ellipse class="aid-head-cheek" data-part="cheek" cx="' +
              fixed(back + H.cheek[0] / 2) + '" cy="' + fixed(mouth.y) + '" rx="' +
              fixed(H.cheek[0] * (.6 + .4 * suction)) + '" ry="' +
              fixed(ry + H.cheek[1] * suction) + '">' + title('studio.head.mouth') + '</ellipse>';
    for (const side of [-1, 1])
      html += '<path class="aid-head-jawbone" data-part="jaw" data-side="' + side + '" d="M' +
              fixed(mouth.x) + ' ' + fixed(mouth.y + side * ry) + ' Q' +
              fixed(mouth.x + reach / 2) + ' ' + fixed(mouth.y + side * (ry + H.jaw_spread * 1.4)) +
              ' ' + fixed(mouth.x + reach) + ' ' + fixed(mouth.y + side * (ry + H.jaw_spread)) +
              '" style="stroke-width:' + fixed(H.jaw_width[0] + H.jaw_width[1] * bite) + '">' +
              title('studio.head.jaw') + '</path>';
  }
  // Teeth stand on the rim of the mouth around its front, pointing into it, over the mouth.
  let teeth = '';
  const bluntness = columns[ANATOMY.blunt_teeth] ?? middle, full = toothForm(1, bluntness).reach;
  for (const [k, side] of [-1, 1].entries()) {
    const power = organSize(columns[ANATOMY.attack_left + k]);
    if (!power)
      continue;
    const form = toothForm(power, bluntness), half = H.tooth[0] / 2,
          height = H.tooth[1] * form.reach / full * form.height;
    for (let i = 0; i < form.count; ++i) {
      const angle = Math.PI - side * H.tooth_arc * (i + .5) / form.count, c = Math.cos(angle),
            s = Math.sin(angle);
      const base = {x : mouth.x + c * rx, y : mouth.y + s * ry};
      const at = (along, inward) =>
          fixed(base.x - s * along - c * inward) + ' ' + fixed(base.y + c * along - s * inward);
      teeth += '<path class="aid-head-tooth" d="M' + at(-half, 0) + ' L' +
               at(-half * form.flat, height) + ' L' + at(half * form.flat, height) + ' L' +
               at(half, 0) + 'Z">' + title('studio.head.jaw') + '</path>';
    }
  }
  if (eats) {
    const lips = H.lip * lipWidth(suction) / lipWidth(0);
    html += '<ellipse class="aid-head-mouth" data-part="mouth" cx="' + fixed(mouth.x) + '" cy="' +
            fixed(mouth.y) + '" rx="' + fixed(rx) + '" ry="' + fixed(ry) +
            '" style="stroke-width:' + fixed(lips) + '">' + title('studio.head.mouth') +
            '</ellipse>';
  }
  html += teeth;
  return '<g class="aid-head">' + html + '</g>';
}
// The outline of the fish with its fins as large as their muscles grow them.
export const fishOutline = state => fishPath(finSizes(state.anatomy?.fins));
// Where organs take clicks: above the wires, so a visible organ is chosen where it is seen, and
// over the whole of a fine or hollow glyph (a lateral line, a near sense's pits). A region
// takes them at its symbol, a wire elsewhere; the gut, under everything, takes them below, the
// skin's pigment cells under the other organs.
const SKIN_FIRST = (a, b) => (b.type === 'pigment') - (a.type === 'pigment');
export function organHitsSvg(state) {
  const drawnEyes = new Set();
  let html = '';
  for (const organ of [...state.document.organs].sort(SKIN_FIRST)) {
    if (organ.type === 'gut' || organ.type === 'brain')
      continue;
    const glyph = isRegion(organ) ? regionBadge(state, organ)
                                  : organGlyph(state, organ, drawnEyes) + organNodes(state, organ);
    if (glyph)
      html +=
          '<g class="aid-organ-hit" data-organ="' + escapeText(organ.id) + '">' + glyph + '</g>';
  }
  return '<g class="aid-organ-hits">' + html + '</g>';
}
export function bodySvg(state) {
  const fill = fishBodyColour(state.document, state.anatomy);
  const drawnEyes = new Set(), sizes = finSizes(state.anatomy?.fins);
  let organs = '', felt = '';
  // The gut and the skin's pigment cells lie under the other organs.
  const order = [...state.document.organs ].sort(
      (a, b) => (b.type === 'gut') - (a.type === 'gut') || SKIN_FIRST(a, b));
  for (const organ of order) {
    felt += feltSvg(state, organ);
    const glyph = organGlyph(state, organ, drawnEyes) + organNodes(state, organ);
    if (glyph)
      organs +=
          '<g class="aid-anatomical-organ' +
          (state.selected?.kind === 'organ' && state.selected.id === organ.id ? ' selected' : '') +
          '" data-organ="' + escapeText(organ.id) + '"><title>' +
          escapeText(organTitle(organ, state.sites)) + '</title>' + glyph + '</g>';
  }
  // Fins and the tail fin are drawn apart from the body, each to beat about its root.
  const tail = tailFin(sizes), roots = finRoots(),
        origin = p => fixed(p.x) + 'px ' + fixed(p.y) + 'px';
  return finPaths(sizes)
             .map((d, k) => '<path class="aid-fish-fin" data-part="fin" data-side="' +
                            (k ? 1 : -1) + '" style="transform-origin:' + origin(roots[k]) +
                            '" d="' + d + '"/>')
             .join('') +
         '<path class="aid-fish-tailfin" data-part="tail" style="transform-origin:' +
         origin(tail.root) + '" d="' + tail.d + '" fill="' + fill + '"/>' +
         '<path class="aid-fish-body" style="stroke:none" d="' + fishPath(sizes, false) +
         '" fill="' + fill + '"/><path class="aid-fish-skin" d="' + fishPath(sizes, false, true) +
         '"/>' +
         '<path class="aid-brain-place" d="' + brainOutline() + '"><title>' +
         escapeText(t('studio.organs.brain')) + '</title></path>' + headSvg(state) + felt + organs;
}
