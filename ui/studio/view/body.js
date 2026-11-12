import {regionRim} from './region_layout.js';
import {detailMix, nodeOpacity} from './layers.js';
import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  findSite,
  sideIndex,
  sideOf,
  sideSign,
  sitePoint
} from '../model/layout.js';
import {
  centerIndex,
  findAssembly,
  groupReport,
  finStroke,
  gillRakers,
  gutLength,
  muscleFibre,
  isChosen,
  isFinMuscle,
  organTypes,
  substanceRead,
  wheelAffinity
} from '../model/document.js';
import {substanceColor} from '../../hormones.js';
import {wrapAngle} from '../../units.js';
import {fishBodyColour} from '../model/pigment.js';
import {chromatophoresSvg} from './pigments.js';
import {
  bodyDirection,
  sideFins,
  finSizes,
  fishPath,
  HEAD,
  skinAt,
  skinDirection,
  skinPoints,
  SNOUT_TIP,
  tailFin,
  zoomOf
} from './frame.js';
import {ANATOMY, BODY_UNIT, FIN_STROKE} from '../../schema.js';
import {gutTurns, jawReach, lipWidth, toothForm} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {t} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
import {profileColor} from './spectrum.js';
import {arrowPath, lateralFeel, lateralRing, ringDiscs} from './lateral.js';
import {hairVector} from './balance.js';
import {isPelvicMuscle, isRegion, kindLimit, organFunction, siteRole} from '../model/organs.js';
import {muscleShape, workTone, finAttachments} from './muscles.js';
import {fibreHex} from '../../fibre.js';
import {preferredScent} from '../../tuning.js';
import {scentColors} from '../../brain_model.js';
import {
  BRAIN,
  regionGeometry,
  brainHalfWidth,
  centerLocation,
  cloacaPoint,
  EYE,
  eyeLocation,
  eyeRadius,
  gutShape,
  GUT_WALL,
  gutWallAt,
  INSIDE,
  lateralLine,
  NODE,
  nodeLocation,
  organLocation,
  showsNodes
} from './places.js';
import {organTitle} from './names.js';

const BRAIN_STEPS = 72;
function hemisphereWidth(u, C) { return brainHalfWidth(C.from + u * (C.to - C.from), C); }
function hemispherePoint(side, [ u, v ], C) {
  return {
    x : C.from + u * (C.to - C.from),
    y : BODY_FRAME.middle + side * v * hemisphereWidth(u, C)
  };
}
function hemisphere(side, C) {
  const rim = Array.from({length : BRAIN_STEPS + 1},
                         (_, k) => hemispherePoint(side, [ k / BRAIN_STEPS, 1 ], C));
  const along = [ 0 ];
  for (let k = 1; k < rim.length; k++)
    along.push(along[k - 1] + Math.hypot(rim[k].x - rim[k - 1].x, rim[k].y - rim[k - 1].y));
  const total = along[along.length - 1];
  const at = share => rim[along.findIndex(l => l >= share * total - 1e-9)];
  const ends = Array.from({length : C.lobes + 1}, (_, k) => at(k / C.lobes));
  let d = 'M' + fixed(ends[0].x) + ' ' + fixed(ends[0].y);
  for (let k = 1; k < ends.length; k++) {
    const a = ends[k - 1], b = ends[k], dx = b.x - a.x, dy = b.y - a.y;
    const turn = Math.sign(side * dx) || side;
    d += ' Q' + fixed((a.x + b.x) / 2 - turn * dy * C.bulge * 2) + ' ' +
         fixed((a.y + b.y) / 2 + turn * dx * C.bulge * 2) + ' ' + fixed(b.x) + ' ' + fixed(b.y);
  }
  return d + 'Z';
}
function brainSvg(fill, state) {
  const M = BODY_FRAME.middle, B = BRAIN, E = B.cerebellum, C = B.cord;
  const head = B.cerebrum;
  const cerebellum =
      '<ellipse cx="' + E.x + '" cy="' + M + '" rx="' + E.rx + '" ry="' + E.ry + '"/>';
  const cord = '<path d="M' + C.from + ' ' + (M - C.half[0]) + ' C' + (C.from + 90) + ' ' +
               (M - C.half[0]) + ' ' + (C.to - 50) + ' ' + (M - C.half[1]) + ' ' + (C.to + C.end) +
               ' ' + M + ' C' + (C.to - 50) + ' ' + (M + C.half[1]) + ' ' + (C.from + 90) + ' ' +
               (M + C.half[0]) + ' ' + C.from + ' ' + (M + C.half[0]) + 'Z"/>';
  const stem = '<path class="aid-brainstem" d="M' + (head.to - 12) + ' ' + (M - 18) + ' Q490 ' +
               (M - 24) + ' 535 ' + (M - 14) + ' L535 ' + (M + 14) + ' Q490 ' + (M + 24) + ' ' +
               (head.to - 12) + ' ' + (M + 18) + 'Z"/>';
  const hemispheres =
      '<path d="' + hemisphere(-1, head) + '"/><path d="' + hemisphere(1, head) + '"/>';
  const rimAt = x => E.ry * Math.sqrt(Math.max(0, 1 - ((x - E.x) / E.rx) ** 2));
  const folia = Array
                    .from({length : E.folia},
                          (_, k) => {
                            const x = E.x - E.rx + 2 * E.rx * (k + 1) / (E.folia + 1);
                            const bow = rimAt(x) * E.bow, end = x - bow, y = rimAt(end);
                            return 'M' + fixed(end) + ' ' + fixed(M - y) + ' Q' + fixed(x + bow) +
                                   ' ' + M + ' ' + fixed(end) + ' ' + fixed(M + y);
                          })
                    .join(' ');
  const segments =
      Array
          .from({length : C.segments},
                (_, i) => {
                  const x = C.from + (i + 1) * (C.to - C.from) / (C.segments + 1);
                  const half = C.half[0] + (C.half[1] - C.half[0]) * (x - C.from) / (C.to - C.from);
                  return 'M' + fixed(x) + ' ' + fixed(M - half) + ' Q' + fixed(x - 7) + ' ' + M +
                         ' ' + fixed(x) + ' ' + fixed(M + half);
                })
          .join(' ');
  const part = (shapes, lines) => '<g class="aid-brain-lobe" fill="' + fill + '">' + shapes +
                                  '</g><path class="aid-brain-fissure" d="' + lines + '"/>';
  return '<defs><clipPath id="aid-cns-cover">' + cord + cerebellum + hemispheres + stem +
         '</clipPath></defs><g class="aid-brain"><title>' + escapeText(t('studio.organs.brain')) +
         '</title><g class="aid-brain-edge" style="stroke-width:' + 2 * B.edge + 'px">' + cord +
         cerebellum + hemispheres + '</g>' + stem + part(cord, segments) + part(cerebellum, folia) +
         part(hemispheres, '') + '<g class="aid-brain-tint">' + cord + cerebellum + hemispheres +
         '</g></g>';
}
function retinaNodes(state, organs) {
  const zoom = zoomOf(state);
  let html = '';
  for (const organ of organs)
    for (const center of organ.centers) {
      const p = nodeLocation(state.document, state.sites, center, organ.type);
      const profile = organ.field?.profiles.find(q => q.id === center.profile);
      const chosen = state.selected?.id === center.id || state.multi?.has(center.id);
      const other = state.visionProfile && center.profile !== state.visionProfile;
      html += '<circle class="aid-retina-node' + (chosen ? ' selected' : '') +
              (other ? ' other' : '') + '" opacity="' + fixed(nodeOpacity(state, chosen)) +
              '" data-center="' + escapeText(center.id) + '" cx="' + fixed(p.x) + '" cy="' +
              fixed(p.y) + '" r="' + fixed(NODE.radius / Math.sqrt(zoom)) + '" fill="' +
              (profile ? profileColor(profile) : 'currentColor') + '"/>';
    }
  return html;
}
const GLYPH = Object.freeze({
  near_dot : 5,
  near_arcs : [ [ 14, 35, 12 ], [ 23, 53, 21 ] ],
  nose : [ 10, 6 ],
  ovary : {sac : [ 25, 12 ], egg : 3.2, eggs : [ 4, 12 ], turn : 2.4},
  testis : {sac : [ 24, 8 ], streaks : 3, gap : 5, length : 30, wave : 3, quarter : 4},
  bladder : [ 33, 13 ],
  blood : [ 8, 13 ],
  blood_step : 15,
  gland : [ 16, 11 ],
  balance : {sac : [ 10, 7 ], stone : 3, hair : 10},
  lateral_pore : 3.2
});
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
const NEAR_GAP = 3;
function proximityGlyph(state, organ, pos) {
  const side = sideOf(organ), eye = eyeLocation(state.document, state.sites, side);
  const ahead =
      eye ? eyeRadius(state.document, side) * EYE.aspect - GLYPH.near_arcs[0][0] + NEAR_GAP : 0;
  const c = {x : pos.x - ahead, y : pos.y};
  return '<g class="aid-anatomical-proximity">' +
         (eye ? ''
              : '<circle cx="' + fixed(c.x) + '" cy="' + fixed(c.y) + '" r="' + GLYPH.near_dot +
                    '"/>') +
         '<path d="' +
         GLYPH.near_arcs
             .map(([ inner, outer, half ]) => 'M' + fixed(c.x - inner) + ' ' + fixed(c.y - half) +
                                              ' Q' + fixed(c.x - outer) + ' ' + fixed(c.y) + ' ' +
                                              fixed(c.x - inner) + ' ' + fixed(c.y + half))
             .join(' ') +
         '"/></g>';
}
function noseGlyph(state, organ, pos) {
  const side = sideOf(organ), colour = scentColors?.[preferredScent(organ.centers[0])] ?? '#a6d8b7';
  let ribs = '';
  for (let k = 0; k < 7; k++) {
    const x = -14 + k * 4, h = 5 + 6 * Math.sin(Math.PI * k / 6);
    ribs += '<path d="M' + x + ' 0 Q' + (x + 5) + ' ' + (-h) + ' ' + (x - 2) + ' ' + (-h - 3) +
            ' M' + x + ' 0 Q' + (x + 5) + ' ' + h + ' ' + (x - 2) + ' ' + (h + 3) + '"/>';
  }
  return '<g class="aid-anatomical-nose" transform="translate(' + fixed(pos.x) + ' ' +
         fixed(pos.y) + ') rotate(' + (side * 12) + ')" style="fill:' + colour + '">' +
         '<path d="M-22 0 C-16-24 14-23 25-3 C22 19-10 24-22 0Z"/>' + ribs +
         '<path class="aid-nose-lumen" d="M-19 0 Q0-4 22 0"/></g>';
}
function glandGlyph(state, organ, pos) {
  const wheel = state.capabilities;
  const amount = index => organ.centers.reduce(
      (sum, c) => sum + (c.copies ?? 1) * wheelAffinity(wheel, c.q1, c.q2, c.qwidth, index), 0);
  const indices = Array.from({length : wheel?.hormones ?? 0}, (_, i) => i);
  const hormone = indices.length ? indices.reduce((a, b) => amount(a) >= amount(b) ? a : b) : 0;
  return '<g class="aid-anatomical-gland" style="--substance:' + substanceColor(hormone) +
         '" transform="translate(' + fixed(pos.x) + ' ' + fixed(pos.y) + ')">' +
         '<path d="M-17 0 C-23-8-15-16-8-12 C-2-19 10-16 11-10 C21-12 25-1 17 5 ' +
         'C21 13 9 18 3 11 C-7 18-21 12-16 5 C-20 4-20 1-17 0Z"/>' +
         '<path class="aid-gland-lobules" d="M-8-12 Q-12-5-5-1 M11-10 Q3-6 7 0 ' +
         'M17 5 Q7 3 3 11 M-16 5 Q-6 2-4 9"/></g>';
}
function gonadDuct(pos) {
  const {x, y} = cloacaPoint();
  const side = Math.sign(pos.y - y) || -1;
  return '<path class="aid-gonad-duct" d="M' + fixed(pos.x + 25) + ' ' + fixed(pos.y) + ' C' +
         fixed(Math.min(pos.x + 100, x - 40)) + ' ' + fixed(pos.y + side * 6) + ' ' +
         fixed(x - 45) + ' ' + fixed(y + side * 8) + ' ' + x + ' ' + y + '"/>';
}
function ovaryGlyph(state, organ, pos) {
  const O = GLYPH.ovary, cells = organ.centers.filter(c => c.key === 'growth').length;
  const count =
      Math.round(O.eggs[0] + (O.eggs[1] - O.eggs[0]) * cells / Math.max(1, kindLimit(organ, null)));
  let html = '<ellipse class="aid-anatomical-ovary" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
             '" rx="' + O.sac[0] + '" ry="' + O.sac[1] + '"/>';
  for (let i = 0; i < count; ++i) {
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
const ellipseGlyph = (cls, [ rx, ry ]) => (state, organ, pos) =>
    '<ellipse class="' + cls + '" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) + '" rx="' + rx +
    '" ry="' + ry + '"/>';
function balanceGlyph(state, organ, pos) {
  const {sac : [ rx, ry ], stone, hair} = GLYPH.balance;
  const v = hairVector(organ.centers[0]?.q1 ?? 0, sideOf(organ)),
        tip = {x : pos.x + v.x * hair * .45, y : pos.y + v.y * hair * .45};
  return '<ellipse class="aid-anatomical-balance" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
         '" rx="' + rx + '" ry="' + ry + '"/><path class="aid-hair" d="M' + fixed(pos.x) + ' ' +
         fixed(pos.y) + ' L' + fixed(tip.x) + ' ' + fixed(tip.y) +
         '"/><circle class="aid-anatomical-statolith" cx="' + fixed(tip.x) + '" cy="' +
         fixed(tip.y) + '" r="' + stone + '"/>';
}
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
function muscleGlyph(state, organ) {
  const shape = muscleShape(organ, state.sites);
  if (!shape)
    return '';
  const tone = workTone({code : organFunction(organ, state.sites), pelvic : isPelvicMuscle(organ)});
  const front = isFinMuscle(organ, state.sites) && finStroke(organ) === FIN_STROKE.front;
  return '<g style="--muscle:' + tone + ';--fibre:' + fibreHex(muscleFibre(organ)) +
         '"><path class="aid-anatomical-muscle' + (front ? ' front' : '') + '" d="' + shape.path +
         '"/><path class="aid-muscle-fibres" d="' + (shape.fibres ?? []).join(' ') +
         '"/><path class="aid-muscle-marks" d="' + shape.marks.join(' ') +
         '"/><path class="aid-muscle-marks sprint" d="' + shape.sprint.join(' ') + '"/></g>';
}
// Gill slits behind the eye: a few arcs on each pumping node, combed as densely as its rakers.
const GILL_GLYPH = Object.freeze({arcs : 3, gap : 4, height : 14, bow : 5, comb : [ 2, 6 ]});
function gillGlyph(state, organ) {
  const G = GILL_GLYPH, density = gillRakers(organ) ?? BODY_UNIT.trait_middle,
        teeth = Math.round(G.comb[0] + (G.comb[1] - G.comb[0]) * density);
  return organ.centers
      .map(center => {
        const site = findSite(state.sites, center.site);
        if (!site)
          return '';
        const p = nodeLocation(state.document, state.sites, center, organ.type);
        const arcs = Array.from({length : G.arcs}, (_, k) => {
          const x = p.x + (k - (G.arcs - 1) / 2) * G.gap, top = p.y - G.height / 2;
          const comb =
              Array
                  .from({length : teeth},
                        (_, i) => {
                          const y = top + G.height * (i + .5) / teeth;
                          return 'M' + fixed(x - G.bow / 2) + ' ' + fixed(y) + ' h' + -G.bow / 2;
                        })
                  .join(' ');
          return 'M' + fixed(x) + ' ' + fixed(top) + ' q' + -G.bow + ' ' + G.height / 2 + ' 0 ' +
                 G.height + ' ' + comb;
        });
        return '<path class="aid-anatomical-gills" d="' + arcs.join(' ') + '"/>';
      })
      .join('');
}
// A ring of gut muscle around the gut wall at each node; the nodes sit at its ends.
function gutMuscleGlyph(state, organ) {
  const rings = organ.centers.map(center => {
    const site = findSite(state.sites, center.site);
    if (!site)
      return '';
    const wall = gutWallAt(state.document, site), reach = wall.half + GUT_WALL.ring;
    return 'M' + fixed(wall.x - wall.across.x * reach) + ' ' +
           fixed(wall.y - wall.across.y * reach) + ' L' + fixed(wall.x + wall.across.x * reach) +
           ' ' + fixed(wall.y + wall.across.y * reach);
  });
  return '<path class="aid-anatomical-gutmuscle" style="--fibre:' + fibreHex(muscleFibre(organ)) +
         '" d="' + rings.join(' ') + '"/>';
}
const ORGAN_GLYPHS = Object.freeze({
  eye : eyeGlyph,
  proximity : proximityGlyph,
  nose : noseGlyph,
  eggs : ovaryGlyph,
  sperm : testisGlyph,
  bladder : ellipseGlyph('aid-anatomical-bladder', GLYPH.bladder),
  gland : glandGlyph,
  gut : state => gutPath(state),
  blood : bloodGlyph,
  balance : balanceGlyph,
  defense : (state, organ) => spinesSvg(state, organ),
  touch : (state, organ) => skinSenseSvg(organ, state.sites),
  pain : (state, organ) => skinSenseSvg(organ, state.sites),
  pigment : (state, organ) => chromatophoresSvg(state, organ, isChosen(state.selected, organ)),
  lateral : lateralGlyph,
  muscle : muscleGlyph,
  gills : gillGlyph,
  gutmuscle : gutMuscleGlyph
});
function organGlyph(state, organ, drawnEyes) {
  const draw = ORGAN_GLYPHS[organ.type] ?? (isRegion(organ) ? regionGlyph : null);
  return draw ? draw(state, organ, organLocation(organ, state.sites, state.document), drawnEyes)
              : '';
}
const SPINES = Object.freeze({step : 15, base : 8, length : [ 6, 64 ], lean : .3, least : .03});
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
                ? S.hairs.map(dx => 'M' + at(dx - 2, 0) + ' Q' + at(dx, -3) + ' ' + at(dx + 2, 0))
                      .join(' ')
                : 'M' + at(0, S.stem) + ' L' + at(0, S.root * 2) + ' M' + at(-S.fork, 0) + ' L' +
                      at(0, S.root * 2) + ' L' + at(S.fork, 0);
        return '<circle class="aid-skin-hit" cx="' + fixed(x) + '" cy="' + fixed(skin) + '" r="' +
               S.hit + '"/><path class="aid-anatomical-' + organ.type + '" d="' + strokes + '"/>';
      })
      .join('');
}
function smoothLine(points) {
  let d = 'M' + fixed(points[0].x) + ' ' + fixed(points[0].y);
  for (let k = 0; k + 1 < points.length; ++k) {
    const a = points[Math.max(0, k - 1)], b = points[k], c = points[k + 1],
          e = points[Math.min(points.length - 1, k + 2)];
    d += ' C' + fixed(b.x + (c.x - a.x) / 6) + ' ' + fixed(b.y + (c.y - a.y) / 6) + ' ' +
         fixed(c.x - (e.x - b.x) / 6) + ' ' + fixed(c.y - (e.y - b.y) / 6) + ' ' + fixed(c.x) +
         ' ' + fixed(c.y);
  }
  return d;
}
const shownGut = state =>
    gutShape(gutTurns(gutLength(state.document) ?? state.anatomy?.anatomy?.[ANATOMY.gut_length] ??
                      BODY_UNIT.trait_middle),
             state.document);
function gutPath(state) {
  const G = shownGut(state), S = INSIDE.gut.stomach;
  const line = smoothLine;
  return '<path class="aid-anatomical-gut" d="' + line(G.gullet) + ' ' + line(G.intestine) + '"/>' +
         stomachSvg(G.stomach, S);
}
function stomachSvg(p, S) {
  return '<path class="aid-anatomical-stomach" d="M' + fixed(p.x - S.rx) + ' ' + fixed(p.y) + ' C' +
         fixed(p.x - S.rx) + ' ' + fixed(p.y - S.ry) + ' ' + fixed(p.x + S.rx * .5) + ' ' +
         fixed(p.y - S.ry * 1.25) + ' ' + fixed(p.x + S.rx) + ' ' + fixed(p.y) + ' C' +
         fixed(p.x + S.rx) + ' ' + fixed(p.y + S.ry) + ' ' + fixed(p.x - S.rx * .6) + ' ' +
         fixed(p.y + S.ry * 1.35) + ' ' + fixed(p.x - S.rx) + ' ' + fixed(p.y) + 'Z"/>';
}
function gutHit(state) {
  const G = shownGut(state), S = INSIDE.gut.stomach;
  return '<path class="aid-gut-hit" d="M' +
         G.intestine.map(p => fixed(p.x) + ' ' + fixed(p.y)).join(' L') + '"/><ellipse cx="' +
         G.stomach.x + '" cy="' + fixed(G.stomach.y) + '" rx="' + S.rx + '" ry="' + S.ry + '"/>';
}
const smoothRim = points => {
  const mid = (a, b) => ({x : (a.x + b.x) / 2, y : (a.y + b.y) / 2});
  const p = point => fixed(point.x) + ' ' + fixed(point.y);
  let d = 'M' + p(mid(points.at(-1), points[0]));
  for (let i = 0; i < points.length; ++i)
    d += ' Q' + p(points[i]) + ' ' + p(mid(points[i], points[(i + 1) % points.length]));
  return d + 'Z';
};
function regionGlyph(state, organ) {
  const G = regionGeometry(state.document, state.sites, organ), mix = detailMix(state);
  if (!G.rows.length)
    return '';
  return '<g class="aid-region-card aid-region-detail ' + organ.type + '" opacity="' +
         fixed(.8 + .2 * mix.regions) + '">' +
         '<path class="aid-anatomical-region" d="' + smoothRim(regionRim(G)) + '"/></g>';
}
function organNodes(state, organ) {
  if (organ.type === 'eye' || organ.type === 'pigment' || isRegion(organ) ||
      organ.centers.length < 2 || !showsNodes(state, [ organ ]))
    return '';
  const zoom = zoomOf(state);
  return organ.centers
      .map(center => {
        const p = nodeLocation(state.document, state.sites, center, organ.type);
        const chosen = state.selected?.id === center.id || state.multi?.has(center.id);
        return '<circle class="aid-retina-node aid-organ-node ' + center.role +
               (chosen ? ' selected' : '') + '" opacity="' + fixed(nodeOpacity(state, chosen)) +
               '" data-center="' + escapeText(center.id) + '" cx="' + fixed(p.x) + '" cy="' +
               fixed(p.y) + '" r="' + fixed(NODE.radius / Math.sqrt(zoom)) + '"><title>' +
               escapeText(t('studio.centers.' + center.key)) + '</title></circle>';
      })
      .join('');
}
const FELT =
    Object.freeze({step : 6, least : .04, base : .35, arrow : 58, gap : 6, head : 10, point : 2.2});
function feltCells(state, organ) {
  return organ.centers.flatMap(
      c => (groupReport(state.document, state.anatomy, 'felt', c.id) ??
            []).map(cell => ({cell, at : centerLocation(c, organ.type, state.sites)})));
}
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
                         ' ' + fixed(point.y) + '" stroke-opacity="' +
                         fixed(FELT.base + (1 - FELT.base) * weight) + '"/>';
      })
      .join('');
}
function feltFlow(state, organ, cells) {
  const feel = lateralFeel(state, organ), ring = state.capabilities?.lateralRing;
  const centre = BODY_MIDDLE;
  const discs =
      feel && ring
          ? ringDiscs(lateralRing(ring, centre, BODY_RADIUS, skinAt(centre.x, 1) - centre.y),
                      feel.weights, FELT.point)
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
function barbelsSvg(columns) {
  const tip = SNOUT_TIP, H = HEAD;
  return [ -1, 1 ]
      .filter(side => columns[ANATOMY.barbel_left + sideIndex(side)] > 0)
      .map(side => '<path class="aid-head-barbel" d="M' + fixed(tip.x + H.barbel_root[0]) + ' ' +
                   fixed(tip.y + side * H.barbel_root[1]) + ' Q' + fixed(tip.x + H.barbel_bend[0]) +
                   ' ' + fixed(tip.y + side * H.barbel_bend[1]) + ' ' +
                   fixed(tip.x + H.barbel_end[0]) + ' ' + fixed(tip.y + side * H.barbel_end[1]) +
                   '">' + headTitle('studio.head.barbels') + '</path>')
      .join('');
}
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
      .map(
          side =>
              '<path class="aid-head-jawbone" data-part="jaw" data-head-control="jaw" data-side="' +
              side + '" d="M' + fixed(at.x) + ' ' + fixed(at.y + side * ry) + ' Q' +
              fixed(at.x + reach / 2) + ' ' + fixed(at.y + side * (ry + H.jaw_spread * H.jaw_bow)) +
              ' ' + fixed(at.x + reach) + ' ' + fixed(at.y + side * (ry + H.jaw_spread)) +
              '" style="stroke-width:' + fixed(H.jaw_width[0] + H.jaw_width[1] * bite) + '">' +
              headTitle('studio.head.jaw') + '</path>')
      .join('');
}
const mouthSvg = ({at, rx, ry, suction}) =>
    '<ellipse class="aid-head-mouth" data-part="mouth" data-head-control="mouth" cx="' +
    fixed(at.x) + '" cy="' + fixed(at.y) + '" rx="' + fixed(rx) + '" ry="' + fixed(ry) +
    '" style="stroke-width:' + fixed(HEAD.lip * lipWidth(suction) / lipWidth(0)) + '">' +
    headTitle('studio.head.mouth') + '</ellipse>';
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
  const columns = state.anatomy?.anatomy ?? [];
  const mouth = mouthShape(columns);
  const eats = columns[ANATOMY.suction_strength] > 0 || columns[ANATOMY.aggression] > 0 ||
               columns[ANATOMY.mouth] > 0;
  return '<g class="aid-head">' + barbelsSvg(columns) + throatSvg(mouth) +
         (eats ? intakeSvg(mouth) + cheeksSvg(mouth) + jawsSvg(mouth) : '') + mouthSvg(mouth) +
         teethSvg(columns, mouth) + '</g>';
}
export const fishOutline = state =>
    fishPath(finSizes(state.anatomy?.fins, finAttachments(state), state.anatomy?.forms));
// Where organs take clicks: above the wires, so a visible organ is chosen where it is seen, and
// over the whole of a fine or hollow glyph (a lateral line, a near sense's pits).
const SKIN_FIRST = (a, b) => (b.type === 'pigment') - (a.type === 'pigment');
export function organHitsSvg(state) {
  const drawnEyes = new Set();
  let html = '';
  for (const organ of [...state.document.organs].sort(SKIN_FIRST)) {
    if (organ.type === 'brain' || isRegion(organ))
      continue;
    const glyph = organ.type === 'gut'
                      ? gutHit(state)
                      : organGlyph(state, organ, drawnEyes) + organNodes(state, organ);
    if (glyph)
      html +=
          '<g class="aid-organ-hit" data-organ="' + escapeText(organ.id) + '">' + glyph + '</g>';
  }
  return '<g class="aid-organ-hits">' + html + '</g>' +
         state.document.organs.filter(isRegion)
             .map(organ => '<g class="aid-anatomical-organ' +
                           (organChosen(state, organ) ? ' selected' : '') + '" data-organ="' +
                           escapeText(organ.id) + '" pointer-events="' +
                           'auto' +
                           '"><title>' + escapeText(organTitle(organ, state.sites)) + '</title>' +
                           regionGlyph(state, organ) + '</g>')
             .join('');
}
function organChosen(state, organ) {
  const {selected} = state, own = id => id === organ.id || (!!organ.pair && id === organ.pair);
  return selected?.kind === 'organ' && selected.id === organ.id ||
         [...state.multi ?? [] ].some(own) ||
         (selected?.kind === 'assembly' &&
          (findAssembly(state.document, selected.id)?.organIds.some(own) ?? false));
}
const BODY_SHADE = Object.freeze({reach : 150, flank : .08, back : .12});
export function bodySvg(state) {
  const fill = fishBodyColour(state.document, state.anatomy);
  const drawnEyes = new Set(),
        sizes = finSizes(state.anatomy?.fins, finAttachments(state), state.anatomy?.forms);
  let organs = '', gut = '', felt = '', ducts = '';
  for (const organ of [...state.document.organs].sort(SKIN_FIRST)) {
    if (isRegion(organ))
      continue;
    felt += feltSvg(state, organ);
    if (organ.type === 'eggs' || organ.type === 'sperm')
      ducts += gonadDuct(organLocation(organ, state.sites, state.document));
    const glyph = organGlyph(state, organ, drawnEyes) + organNodes(state, organ);
    if (!glyph)
      continue;
    const drawn = '<g class="aid-anatomical-organ' +
                  (organChosen(state, organ) ? ' selected' : '') + '" data-organ="' +
                  escapeText(organ.id) + '"><title>' + escapeText(organTitle(organ, state.sites)) +
                  '</title>' + glyph + '</g>';
    if (organ.type === 'gut')
      gut += drawn;
    else
      organs += drawn;
  }
  const tail = tailFin(sizes), origin = p => fixed(p.x) + 'px ' + fixed(p.y) + 'px';
  const body = fishPath(sizes, false), M = BODY_FRAME.middle, S = BODY_SHADE;
  const vent = cloacaPoint();
  const G = shownGut(state),
        hidden = '<g class="aid-hidden-passages" clip-path="url(#aid-cns-cover)">' +
                 '<path d="' + smoothLine(G.gullet) + ' ' + smoothLine(G.intestine) + '"/>' +
                 ducts + '</g>';
  return sideFins(sizes)
             .map(fin => '<g class="aid-fish-fin" data-part="fin" data-fin="' +
                         (fin.pelvic ? 'pelvic' : 'pectoral') + '" data-side="' + fin.side +
                         '" style="transform-origin:' + origin(fin.root) + '"><path d="' + fin.d +
                         '"/><path class="aid-fish-ray" d="' + fin.rays + '"/></g>')
             .join('') +
         '<g class="aid-fish-tailfin" data-part="tail" style="transform-origin:' +
         origin(tail.root) + '"><path d="' + tail.d + '" fill="' + fill +
         '"/><path class="aid-fish-ray" d="' + tail.rays + '"/></g>' +
         '<path class="aid-fish-body" style="stroke:none" d="' + body + '" fill="' + fill +
         '"/><linearGradient id="aid-fish-shade" gradientUnits="userSpaceOnUse" x1="0" y1="' +
         (M - S.reach) + '" x2="0" y2="' + (M + S.reach) + '"><stop offset="0" ' +
         'stop-color="#fff" stop-opacity="' + S.flank + '"/><stop offset=".5" stop-color="#000" ' +
         'stop-opacity="' + S.back + '"/><stop offset="1" stop-color="#fff" stop-opacity="' +
         S.flank + '"/></linearGradient><path class="aid-fish-shade" d="' + body +
         '" fill="url(#aid-fish-shade)"/><path class="aid-fish-skin" d="' +
         fishPath(sizes, false, true) + '"/>' +
         '<path class="aid-symmetry-line" d="M130 365 H905"/>' + (gut || gutPath(state)) + ducts +
         brainSvg(fill, state) + hidden +
         '<path class="aid-operculum" d="M435 264 Q487 300 448 335 M435 466 Q487 430 448 395"/>' +
         headSvg(state) + felt + organs + '<ellipse class="aid-cloaca" cx="' + fixed(vent.x) +
         '" cy="' + fixed(vent.y) + '" rx="5" ry="3"/>';
}
