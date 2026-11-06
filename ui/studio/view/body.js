import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  findSite,
  sideIndex,
  sideOf,
  sideSign
} from '../model/layout.js';
import {centerIndex, groupReport, isChosen, organTypes, substanceRead} from '../model/document.js';
import {substanceColor} from '../../hormones.js';
import {wrapAngle} from '../../units.js';
import {fishBodyColour} from '../model/pigment.js';
import {chromatophoresSvg} from './pigments.js';
import {
  bodyDirection,
  finPaths,
  finRoots,
  finSizes,
  fishPath,
  HEAD,
  skinAt,
  skinDirection,
  skinPoints,
  SNOUT_TIP,
  steadyAt,
  tailFin,
  zoomOf
} from './frame.js';
import {ANATOMY, BODY_UNIT} from '../../schema.js';
import {gutTurns, jawReach, lipWidth, toothForm} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {t} from '../../strings.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {profileColor} from './spectrum.js';
import {arrowPath, cornerDiscs, lateralCorners, lateralFeel} from './lateral.js';
import {isRegion, kindLimit, organFunction} from '../model/organs.js';
import {MUSCLE_TONE, muscleShape} from './muscles.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {preferredScent} from '../../tuning.js';
import {scentColors} from '../../brain_model.js';
import {
  BRAIN,
  centerLocation,
  EYE,
  eyeLocation,
  eyeRadius,
  INSIDE,
  lateralLine,
  NODE,
  nodeLocation,
  organLocation,
  showsNodes
} from './places.js';
import {organTitle} from './names.js';

// The Atelier draws a fixed, abstract fish: this outline and simple glyphs where the organs'
// cells sit. It does not change with the design. The engine's body shape follows from where the
// cells sit and how much tissue lies there; the Aquarium shows it.
//
// The engine's fish spans about its body diameter from snout to tail root, so the abstract fish
// is two body radii long; fields of view and test lights are drawn at that scale.

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
function retinaNodes(state, organs) {
  const zoom = zoomOf(state);
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
// Glyph sizes in frame units.
const GLYPH = Object.freeze({
  near_dot : 5,
  near_arcs : [ [ 14, 35, 12 ], [ 23, 53, 21 ] ],
  nose : [ 10, 6 ],
  ovary : {sac : [ 24, 17 ], egg : 4.2, eggs : [ 4, 12 ], turn : 2.4},
  testis : {sac : [ 26, 11 ], streaks : 3, gap : 5, length : 30, wave : 3, quarter : 4},
  bladder : [ 39, 24 ],
  gut_wave : 20,
  gut_steps : 96,
  blood : [ 8, 13 ],
  blood_step : 15,
  gland : [ 16, 11 ],
  lateral_pore : 3.2
});
// Each organ's glyph on the fish, drawn at the organ's place `pos`; a pair of eyes shares one
// glyph per side (drawnEyes holds the sides drawn).
function eyeGlyph(state, organ, pos, drawnEyes) {
  const {document : doc, sites} = state, side = sideOf(organ), eye = eyeLocation(doc, sites, side);
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
const proximityGlyph = (state, organ, pos) =>
    '<g class="aid-anatomical-proximity"><circle cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
    '" r="' + GLYPH.near_dot + '"/><path d="' +
    GLYPH.near_arcs
        .map(([ inner, outer, half ]) => 'M' + fixed(pos.x - inner) + ' ' + fixed(pos.y - half) +
                                         ' Q' + fixed(pos.x - outer) + ' ' + fixed(pos.y) + ' ' +
                                         fixed(pos.x - inner) + ' ' + fixed(pos.y + half))
        .join(' ') +
    '"/></g>';
// A nose in the colour of the scent it prefers, as the Aquarium colours smell cells.
function noseGlyph(state, organ, pos) {
  const c = organ.centers[0], colour = c ? scentColors?.[preferredScent(c)] : null;
  return '<ellipse class="aid-anatomical-nose" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
         '" rx="' + GLYPH.nose[0] + '" ry="' + GLYPH.nose[1] + '"' +
         (colour ? ' style="fill:' + colour + '"' : '') + '/>';
}
// The ovary a sac of round eggs, the more the more its growth cells make; the testis a slimmer
// pale sac streaked with sperm.
function ovaryGlyph(state, organ, pos) {
  const O = GLYPH.ovary, cells = organ.centers.filter(c => c.key === 'growth').length;
  const count =
      Math.round(O.eggs[0] + (O.eggs[1] - O.eggs[0]) * cells / Math.max(1, kindLimit(organ, null)));
  let html = '<ellipse class="aid-anatomical-ovary" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
             '" rx="' + O.sac[0] + '" ry="' + O.sac[1] + '"/>';
  for (let i = 0; i < count; ++i) {
    // Eggs on a sunflower spiral, filling the sac.
    const r = Math.sqrt((i + .5) / count), a = i * O.turn;
    html += '<circle class="aid-anatomical-egg" cx="' +
            fixed(pos.x + Math.cos(a) * r * (O.sac[0] - O.egg)) + '" cy="' +
            fixed(pos.y + Math.sin(a) * r * (O.sac[1] - O.egg)) + '" r="' + O.egg + '"/>';
  }
  return html;
}
function testisGlyph(state, organ, pos) {
  const T = GLYPH.testis;
  let html = '<ellipse class="aid-anatomical-testis" cx="' + fixed(pos.x) + '" cy="' +
             fixed(pos.y) + '" rx="' + T.sac[0] + '" ry="' + T.sac[1] + '"/><path ' +
             'class="aid-anatomical-sperm" d="';
  for (let i = 0; i < T.streaks; ++i) {
    const y = pos.y + (i - (T.streaks - 1) / 2) * T.gap, x = pos.x - T.length / 2;
    html += 'M' + fixed(x) + ' ' + fixed(y) + ' q' + T.length / T.quarter + ' ' + -T.wave + ' ' +
            T.length / 2 + ' 0 t' + T.length / 2 + ' 0 ';
  }
  return html + '"/>';
}
// An organ drawn as an ellipse of its size at its place.
const ellipseGlyph = (cls, [ rx, ry ]) => (state, organ, pos) =>
    '<ellipse class="' + cls + '" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) + '" rx="' + rx +
    '" ry="' + ry + '"/>';
// The blood sense: drops of blood where its cells read it.
function bloodGlyph(state, organ, pos) {
  const G = GLYPH, types = organTypes(organ), wheel = state.capabilities;
  let html = '';
  for (const [i, type] of types.entries()) {
    const x = pos.x + (i - (types.length - 1) / 2) * G.blood_step, [ w, h ] = G.blood;
    const colour = wheel ? substanceColor(substanceRead(wheel, type.centers[0])) : null;
    html += '<path class="aid-anatomical-blood"' + (colour ? ' style="fill:' + colour + '"' : '') +
            ' d="M' + fixed(x) + ' ' + fixed(pos.y - h) + ' C' + fixed(x + w) + ' ' + fixed(pos.y) +
            ' ' + fixed(x + w / 2) + ' ' + fixed(pos.y + h / 2) + ' ' + fixed(x) + ' ' +
            fixed(pos.y + h / 2) + ' C' + fixed(x - w / 2) + ' ' + fixed(pos.y + h / 2) + ' ' +
            fixed(x - w) + ' ' + fixed(pos.y) + ' ' + fixed(x) + ' ' + fixed(pos.y - h) + 'Z"/>';
  }
  return html;
}
// The lateral line along the flank with its pores; a broad band behind it takes clicks.
function lateralGlyph(state, organ) {
  const points = lateralLine(state.document, state.sites, organ);
  const line = 'M' + points.map(p => fixed(p.x) + ' ' + fixed(p.y)).join(' L');
  return '<path class="aid-lateral-hit" d="' + line +
         '"/><path class="aid-anatomical-lateral" d="' + line + '"/>' +
         points
             .map(p => '<circle class="aid-lateral-pore" cx="' + fixed(p.x) + '" cy="' +
                       fixed(p.y) + '" r="' + GLYPH.lateral_pore + '"/>')
             .join('');
}
// A muscle as one shape where it works, in the colour of its work, its nodes marked across it.
function muscleGlyph(state, organ) {
  const shape = muscleShape(organ, state.sites);
  if (!shape)
    return '';
  const tone = MUSCLE_TONE[organFunction(organ, state.sites)];
  return '<path class="aid-anatomical-muscle" d="' + shape.path + '" style="--muscle:' + tone +
         '"/><path class="aid-muscle-marks" d="' + shape.marks.join(' ') + '"/>';
}
// The skin's pigment cells lie all over the fish, not at their nodes; the skin senses, spines and
// gut have their own drawings, brain regions theirs.
const ORGAN_GLYPHS = Object.freeze({
  eye : eyeGlyph,
  proximity : proximityGlyph,
  nose : noseGlyph,
  eggs : ovaryGlyph,
  sperm : testisGlyph,
  bladder : ellipseGlyph('aid-anatomical-bladder', GLYPH.bladder),
  gland : ellipseGlyph('aid-anatomical-gland', GLYPH.gland),
  gut : state => gutPath(state),
  blood : bloodGlyph,
  defense : (state, organ) => spinesSvg(state, organ),
  touch : (state, organ) => skinSenseSvg(organ, state.sites),
  pain : (state, organ) => skinSenseSvg(organ, state.sites),
  pigment : (state, organ) => chromatophoresSvg(state, organ, isChosen(state.selected, organ)),
  lateral : lateralGlyph,
  muscle : muscleGlyph
});
function organGlyph(state, organ, drawnEyes) {
  const draw = ORGAN_GLYPHS[organ.type] ?? (isRegion(organ) ? regionGlyph : null);
  return draw ? draw(state, organ, organLocation(organ, state.sites, state.document), drawnEyes)
              : '';
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
const SKIN_SENSE = Object.freeze(
    {hairs : [ -5, 0, 5 ], fan : 1.4, reach : 8, root : 3, stem : 12, fork : 5, hit : 13});
function skinSenseSvg(organ, sites) {
  const S = SKIN_SENSE;
  return organ.centers
      .map(center => {
        const site = findSite(sites, center.site), side = sideSign(site?.side);
        const {x} = centerLocation(center, organ.type, sites), skin = skinAt(x, side);
        const at = (dx, depth) => fixed(x + dx) + ' ' + fixed(skin - side * depth);
        const strokes =
            organ.type === 'touch'
                ? S.hairs.map(dx => 'M' + at(dx, S.root) + ' L' + at(dx * S.fan, -S.reach))
                      .join(' ')
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
  const {cx, cy, rx, ry} = hull, zoom = zoomOf(state);
  return '<g class="aid-region-badge"' +
         steadyAt({x : cx - rx * REGION.corner, y : cy - ry * REGION.corner}, zoom) +
         '><circle r="' + REGION.badge + '"/>' + placedGlyph(STUDIO_ICON[organ.type], REGION.icon) +
         '</g>';
}
// The abstract fish in the colour of its pigment, with its organs.
// The nodes of an organ with several, each on its site, to choose or wire one of them alone.
function organNodes(state, organ) {
  // A brain region's nodes are drawn as nerve centers.
  if (organ.type === 'eye' || organ.type === 'pigment' || isRegion(organ) ||
      organ.centers.length < 2 || !showsNodes(state, [ organ ]))
    return '';
  const zoom = zoomOf(state);
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
  const centre = BODY_MIDDLE;
  const discs = feel && corners ? cornerDiscs(lateralCorners(corners, centre, BODY_RADIUS,
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
const headTitle = key => '<title>' + escapeText(t(key)) + '</title>';
// Barbels at the snout on each side where smell cells also feel touch.
function barbelsSvg(columns) {
  const tip = SNOUT_TIP, H = HEAD;
  return [ -1, 1 ]
      .filter(side => columns[ANATOMY.smell_outer_left + sideIndex(side)] > 0)
      .map(side => '<path class="aid-head-barbel" d="M' + fixed(tip.x + H.barbel_root[0]) + ' ' +
                   fixed(tip.y + side * H.barbel_root[1]) + ' Q' + fixed(tip.x + H.barbel_bend[0]) +
                   ' ' + fixed(tip.y + side * H.barbel_bend[1]) + ' ' +
                   fixed(tip.x + H.barbel_end[0]) + ' ' + fixed(tip.y + side * H.barbel_end[1]) +
                   '">' + headTitle('studio.head.barbels') + '</path>')
      .join('');
}
// The mouth as the jaw shapes it (half width RX, half height RY, its jaws REACH long), and how
// strongly the fish bites and sucks.
function mouthShape(columns) {
  const H = HEAD, middle = BODY_UNIT.trait_middle, jaw = columns[ANATOMY.jaw_length] ?? middle;
  const reach = jawReach(jaw) / jawReach(middle);
  return {
    at : {x : SNOUT_TIP.x + H.mouth_in, y : SNOUT_TIP.y},
    rx : H.mouth[0] * reach,
    ry : H.mouth[1] * mouthShare(jaw) / mouthShare(middle),
    reach : H.jaw_back * reach,
    bite : organSize(columns[ANATOMY.aggression_strength]),
    suction : organSize(columns[ANATOMY.suction_strength])
  };
}
// The throat from the back of the mouth to the gut; water drawn into the mouth from ahead, the
// further the stronger the suction; the cheeks swelling with suction; and the jaws from the
// corners of the mouth back to their hinges.
function throatSvg({at, rx, suction}) {
  return '<path class="aid-head-throat" data-part="throat" d="M' + fixed(at.x + rx) + ' ' +
         fixed(at.y) + ' L' + HEAD.throat_end + ' ' + fixed(at.y) +
         '" style="stroke-width:' + fixed(HEAD.throat * (1 + suction)) + '">' +
         headTitle('studio.head.throat') + '</path>';
}
function intakeSvg({at, ry, suction}) {
  if (!suction)
    return '';
  const I = HEAD.intake, reachOut = I.least + I.span * suction;
  let html = '';
  for (let k = 0; k < I.lines; ++k) {
    const across = (k - (I.lines - 1) / 2) / ((I.lines - 1) / 2 || 1);
    const from = {x : at.x - reachOut, y : at.y + across * ry * I.spread};
    html += '<path class="aid-head-intake" data-part="intake" d="M' + fixed(from.x) + ' ' +
            fixed(from.y) + ' Q' + fixed(at.x - reachOut * I.bend) + ' ' +
            fixed(at.y + across * ry * I.spread * I.bend) + ' ' + fixed(at.x - I.gap) + ' ' +
            fixed(at.y + across * ry * I.narrow) + '"/>';
  }
  return html;
}
function cheeksSvg({at, rx, ry, suction}) {
  const H = HEAD;
  return suction ? '<ellipse class="aid-head-cheek" data-part="cheek" cx="' +
                       fixed(at.x + rx + H.cheek[0] / 2) + '" cy="' + fixed(at.y) + '" rx="' +
                       fixed(H.cheek[0] * (H.cheek_least + (1 - H.cheek_least) * suction)) +
                       '" ry="' + fixed(ry + H.cheek[1] * suction) + '">' +
                       headTitle('studio.head.mouth') + '</ellipse>'
                 : '';
}
function jawsSvg({at, ry, reach, bite}) {
  const H = HEAD;
  return [ -1, 1 ]
      .map(side => '<path class="aid-head-jawbone" data-part="jaw" data-side="' + side + '" d="M' +
                   fixed(at.x) + ' ' + fixed(at.y + side * ry) + ' Q' + fixed(at.x + reach / 2) +
                   ' ' + fixed(at.y + side * (ry + H.jaw_spread * H.jaw_bow)) + ' ' +
                   fixed(at.x + reach) + ' ' + fixed(at.y + side * (ry + H.jaw_spread)) +
                   '" style="stroke-width:' + fixed(H.jaw_width[0] + H.jaw_width[1] * bite) + '">' +
                   headTitle('studio.head.jaw') + '</path>')
      .join('');
}
// The mouth's rim, its lips as thick as they suck.
const mouthSvg = ({at, rx, ry, suction}) =>
    '<ellipse class="aid-head-mouth" data-part="mouth" cx="' + fixed(at.x) + '" cy="' +
    fixed(at.y) + '" rx="' + fixed(rx) + '" ry="' + fixed(ry) +
    '" style="stroke-width:' + fixed(HEAD.lip * lipWidth(suction) / lipWidth(0)) + '">' +
    headTitle('studio.head.mouth') + '</ellipse>';
// Teeth stand on the rim of the mouth around its front, pointing into it, over the mouth.
function teethSvg(columns, {at, rx, ry}) {
  const H = HEAD, bluntness = columns[ANATOMY.blunt_teeth] ?? BODY_UNIT.trait_middle;
  const full = toothForm(1, bluntness).reach;
  let html = '';
  for (const [k, side] of [-1, 1].entries()) {
    const power = organSize(columns[ANATOMY.attack_left + k]);
    if (!power)
      continue;
    const form = toothForm(power, bluntness), half = H.tooth[0] / 2,
          height = H.tooth[1] * form.reach / full * form.height;
    for (let i = 0; i < form.count; ++i) {
      const angle = Math.PI - side * H.tooth_arc * (i + .5) / form.count, c = Math.cos(angle),
            s = Math.sin(angle);
      const base = {x : at.x + c * rx, y : at.y + s * ry};
      const point = (along, inward) =>
          fixed(base.x - s * along - c * inward) + ' ' + fixed(base.y + c * along - s * inward);
      html += '<path class="aid-head-tooth" d="M' + point(-half, 0) + ' L' +
              point(-half * form.flat, height) + ' L' + point(half * form.flat, height) + ' L' +
              point(half, 0) + 'Z">' + headTitle('studio.head.jaw') + '</path>';
    }
  }
  return html;
}
function headSvg(state) {
  const columns = state.anatomy?.anatomy;
  if (!Array.isArray(columns))
    return '';
  const mouth = mouthShape(columns);
  const eats = columns[ANATOMY.suction_strength] > 0 || columns[ANATOMY.aggression] > 0 ||
               columns[ANATOMY.mouth] > 0;
  return '<g class="aid-head">' + barbelsSvg(columns) +
         (eats ? throatSvg(mouth) + intakeSvg(mouth) + cheeksSvg(mouth) + jawsSvg(mouth) +
                     mouthSvg(mouth)
               : '') +
         teethSvg(columns, mouth) + '</g>';
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
