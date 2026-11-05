import {BODY_FRAME, sitePoint} from '../model/layout.js';
import {allCenters} from '../model/document.js';
import {wrapAngle} from '../../units.js';
import {fishBodyColour} from '../model/pigment.js';
import {SNOUT_TIP, finPaths, fishPath} from './frame.js';
import {ANATOMY} from '../../schema.js';
import {t} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
import {profileColor} from './spectrum.js';
import {bearing} from '../model/retina.js';
import {isRegion} from '../model/organs.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {scentAffinities} from '../../tuning.js';
import {scentColors} from '../../brain_model.js';

// The Atelier draws a fixed, abstract fish: this outline and simple glyphs where the organs'
// cells sit. It does not change with the design. The engine's body shape follows from where the
// cells sit and how much tissue lies there; the Aquarium shows it.
//
// The engine's fish spans about its body diameter from snout to tail root, so the abstract fish
// is two body radii long; fields of view and test lights are drawn at that scale.
export const BODY_RADIUS_PIXELS = (BODY_FRAME.tail - BODY_FRAME.snout) / 2;

const lookup = (sites, id) => sites.find(s => s.id === id);

// Where a center lies: on its site of the abstract frame.
export function centerLocation(center, organType, sites) {
  const site = lookup(sites, center.site);
  return site ? sitePoint(site, organType) : {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
}
// Where an organ lies: amid its centers.
export function organLocation(organ, sites) {
  const positions = organ.centers.map(c => centerLocation(c, organ.type, sites));
  if (!positions.length)
    return {x : BODY_FRAME.snout, y : BODY_FRAME.middle};
  return {
    x : positions.reduce((n, p) => n + p.x, 0) / positions.length,
    y : positions.reduce((n, p) => n + p.y, 0) / positions.length
  };
}
// The eye of a side: amid the centers of all eyes on that side, as the engine seats one eye per
// side for all of them.
const sideOf = organ => organ.side < 0 ? -1 : 1;
export function eyeLocation(doc, sites, side) {
  const centers =
      doc.organs.filter(o => o.type === 'eye' && sideOf(o) === side).flatMap(o => o.centers);
  return centers.length ? organLocation({type : 'eye', centers}, sites) : null;
}
// Where a side looks from: as in the engine, amid its light and near-sense cells, weighted by
// how many cells each center makes.
export function viewOrigin(doc, sites, side) {
  const centers = doc.organs.filter(o => o.field && sideOf(o) === side).flatMap(o => o.centers);
  const weight = centers.reduce((n, c) => n + (c.copies ?? 1), 0);
  if (!weight)
    return null;
  const at = centers.map(c => ({c, p : centerLocation(c, 'eye', sites)}));
  return {
    x : at.reduce((n, {c, p}) => n + p.x * (c.copies ?? 1), 0) / weight,
    y : at.reduce((n, {c, p}) => n + p.y * (c.copies ?? 1), 0) / weight
  };
}
export const fieldOrigin = (doc, sites, organ) => viewOrigin(doc, sites, sideOf(organ));
// An eye grows with its cells, from EYE.base to EYE.most frame units.
const EYE = Object.freeze({base : 11, per_center : 2, most : 21, aspect : 1.4, pupil : .44});
// An eye's cells as nodes behind it, where its retina lies: through the pupil a cell looking
// ahead sits at the back, one looking out at the inner side. Each colour type has its own arc,
// NODE.ring times the eye's size for the first and NODE.layer more for each further one. Shown
// while the eye is chosen, a tool works on nodes, or from NODE.zoom on.
const NODE = Object.freeze({ring : 1.45, layer : .5, radius : 4.5, zoom : 1.35, spread : 13});
const NODE_TOOLS = Object.freeze([ 'wire', 'hormone', 'learn', 'stimulate', 'erase' ]);
export function showsNodes(state, organs) {
  const ids = new Set(organs.flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
  return (state.camera?.zoom ?? 1) >= NODE.zoom || NODE_TOOLS.includes(state.tool) ||
         ids.has(state.selected?.id) || organs.some(o => state.multi?.has(o.id));
}
// Where a node of an organ is drawn: an eye's cells on their colour type's arc behind the eye,
// opposite their bearing; other nodes on their site. Nerve centers whose sites are drawn at the
// same point (they differ in depth alone) stand NODE.spread around it, each to be seen and
// chosen.
export function nodeLocation(doc, sites, center, organType) {
  const site = lookup(sites, center.site);
  if (organType === 'eye' && site) {
    const side = site.side < 0 ? -1 : 1, eye = eyeLocation(doc, sites, side);
    if (eye) {
      const organ = doc.organs.find(o => o.centers.some(c => c.id === center.id));
      const type = Math.max(0, organ?.field?.profiles.findIndex(p => p.id === center.profile) ?? 0);
      const r = eyeRadius(doc, side) * (NODE.ring + type * NODE.layer),
            a = side * bearing(site) * Math.PI / 180;
      return {x : eye.x + Math.cos(a) * r * EYE.aspect, y : eye.y - Math.sin(a) * r};
    }
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
// The nerve centers of a design by the point they are drawn at, worked out once per design.
const pointKey = p => Math.round(p.x) + ':' + Math.round(p.y);
const SHARED = new WeakMap();
function sharedPoints(doc, sites) {
  let points = SHARED.get(doc);
  if (!points) {
    points = new Map();
    for (const c of allCenters(doc))
      if (c.role === 'nerve') {
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
  gonads : [ 2, 7 ],
  gonad_step : 8,
  gonad_wave : 7,
  egg : 5,
  sperm : 3,
  bladder : [ 39, 24 ],
  gut_reach : 112,
  gut_wave : 27,
  spikes : 3,
  spike_step : 12,
  spike : [ 8, 30 ],
  gland : [ 26, 19 ],
  lateral_reach : 65,
  lateral_bend : 12,
  muscle_lines : 3,
  muscle_step : 9,
  muscle_reach : 22
});
function organGlyph(state, organ, drawnEyes) {
  const {document : doc, sites} = state, pos = organLocation(organ, sites), G = GLYPH;
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
    const c = organ.centers[0], affinity = c ? scentAffinities(c.q1, c.q2, c.qwidth) : [];
    const colour = scentColors?.[affinity.indexOf(Math.max(...affinity))];
    return '<ellipse class="aid-anatomical-nose" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.nose[0] + '" ry="' + G.nose[1] + '"' +
           (colour ? ' style="fill:' + colour + '"' : '') + '/>';
  }
  case 'eggs':
  case 'sperm': {
    const count = Math.max(G.gonads[0], Math.min(G.gonads[1], organ.centers.length + 1));
    let html = '';
    for (let i = 0; i < count; ++i)
      html += '<circle class="aid-anatomical-gonad" cx="' +
              fixed(pos.x + (i - (count - 1) / 2) * G.gonad_step) + '" cy="' +
              fixed(pos.y + Math.sin(i * 2) * G.gonad_wave) + '" r="' +
              (organ.type === 'eggs' ? G.egg : G.sperm) + '"/>';
    return html;
  }
  case 'bladder':
    return '<ellipse class="aid-anatomical-bladder" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.bladder[0] + '" ry="' + G.bladder[1] + '"/>';
  case 'gut': {
    const q = G.gut_reach / 4;
    return '<path class="aid-anatomical-gut" d="M' + fixed(pos.x - 2 * q) + ' ' + fixed(pos.y) +
           ' c' + fixed(q) + ' -' + G.gut_wave + ' ' + fixed(q) + ' ' + G.gut_wave + ' ' +
           fixed(2 * q) + ' 0 s' + fixed(q) + ' ' + G.gut_wave + ' ' + fixed(2 * q) + ' 0"/>';
  }
  // Spines stand out of the skin, away from the midline, as the Aquarium raises them.
  case 'defense': {
    const out = sideOf(organ);
    let html = '';
    for (let i = 0; i < G.spikes; i++)
      html += '<path class="aid-anatomical-spike" d="M' +
              fixed(pos.x + (i - (G.spikes - 1) / 2) * G.spike_step - G.spike[0] / 2) + ' ' +
              fixed(pos.y) + ' l' + G.spike[0] / 2 + ' ' + out * G.spike[1] + ' l' +
              G.spike[0] / 2 + ' ' + -out * G.spike[1] + '"/>';
    return html;
  }
  case 'gland':
    return '<ellipse class="aid-anatomical-gland" cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) +
           '" rx="' + G.gland[0] + '" ry="' + G.gland[1] + '"/>';
  case 'lateral':
    return '<path class="aid-anatomical-lateral" d="M' + fixed(pos.x - G.lateral_reach) + ' ' +
           fixed(pos.y) + ' Q' + fixed(pos.x) + ' ' + fixed(pos.y - G.lateral_bend) + ' ' +
           fixed(pos.x + G.lateral_reach) + ' ' + fixed(pos.y) + '"/>';
  case 'muscle': {
    let html = '';
    for (let i = 0; i < G.muscle_lines; ++i)
      html += '<path class="aid-anatomical-muscle" d="M' + fixed(pos.x - G.muscle_reach) + ' ' +
              fixed(pos.y + (i - (G.muscle_lines - 1) / 2) * G.muscle_step) + ' l' +
              2 * G.muscle_reach + ' 0"/>';
    return html;
  }
  default:
    return isRegion(organ) ? regionGlyph(state, organ) : '';
  }
}
// A brain region: a soft hull around its nodes, REGION.pad wider than they lie apart.
// A region's hull around its nodes, its symbol at the hull's upper left (BADGE: radius, icon
// size), kept at its size on screen.
const REGION = Object.freeze({pad : 26, least : 22, badge : 11, icon : 14, corner : .7});
function regionGlyph(state, organ) {
  const points = organ.centers.map(c => nodeLocation(state.document, state.sites, c, organ.type));
  if (!points.length)
    return '';
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = Math.max(REGION.least, (Math.max(...xs) - Math.min(...xs)) / 2 + REGION.pad),
        ry = Math.max(REGION.least, (Math.max(...ys) - Math.min(...ys)) / 2 + REGION.pad);
  const zoom = state.camera?.zoom ?? 1;
  return '<ellipse class="aid-anatomical-region ' + escapeText(organ.type) + '" cx="' + fixed(cx) +
         '" cy="' + fixed(cy) + '" rx="' + fixed(rx) + '" ry="' + fixed(ry) + '"/>' +
         '<g class="aid-region-badge" transform="translate(' + fixed(cx - rx * REGION.corner) +
         ' ' + fixed(cy - ry * REGION.corner) + ') scale(' + fixed(1 / zoom) + ')"><circle r="' +
         REGION.badge + '"/><svg x="' + -REGION.icon / 2 + '" y="' + -REGION.icon / 2 +
         '" width="' + REGION.icon + '" height="' + REGION.icon +
         '" viewBox="0 0 24 24"><path d="' + STUDIO_ICON[organ.type] + '"/></svg></g>';
}
// The abstract fish in the colour of its pigment, with its organs.
// The nodes of an organ with several, each on its site, to choose or wire one of them alone.
function organNodes(state, organ) {
  // A brain region's nodes are drawn as nerve centers.
  if (organ.type === 'eye' || isRegion(organ) || organ.centers.length < 2 ||
      !showsNodes(state, [ organ ]))
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
const FELT = Object.freeze({
  step : Math.PI / 60,
  overlap : 1.15,
  reach : 900,
  least : .04,
  arrow : 52,
  head : 10,
  spread : .45
});
const BODY_CENTRE =
    Object.freeze({x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle});
// The way a direction around the body points, as the engine counts it: 0 ahead, positive
// towards side +1.
const bodyDirection = angle => ({x : -Math.cos(angle), y : Math.sin(angle)});
// The engine's cells of each of the organ's groups, with where the group sits on the frame.
function feltCells(state, organ) {
  const centers = allCenters(state.document);
  return organ.centers.flatMap(
      c => (state.anatomy?.felt?.[centers.findIndex(other => other.id === c.id)] ??
            []).map(cell => ({cell, at : centerLocation(c, organ.type, state.sites)})));
}
// The fish's outline, masked to the directions touch and injury cells feel: in steps of
// FELT.step radians from the body's centre, each as bright as the cells' kernels weigh it there.
function feltSkin(cells, id) {
  let wedges = '';
  for (let a = -Math.PI; a < Math.PI; a += FELT.step) {
    const middle = a + FELT.step / 2;
    const weight = Math.max(...cells.map(({cell : [ angle, width ]}) =>
                                             1 - Math.abs(wrapAngle(middle - angle)) / width));
    if (weight <= FELT.least)
      continue;
    const ray = angle => {
      const d = bodyDirection(angle);
      return fixed(BODY_CENTRE.x + d.x * FELT.reach) + ' ' +
             fixed(BODY_CENTRE.y + d.y * FELT.reach);
    };
    wedges += '<path d="M' + fixed(BODY_CENTRE.x) + ' ' + fixed(BODY_CENTRE.y) + ' L' + ray(a) +
              ' L' + ray(a + FELT.step * FELT.overlap) + ' Z" fill-opacity="' + fixed(weight) +
              '"/>';
  }
  const mask = 'aid-felt-' + escapeText(id);
  return '<mask id="' + mask + '" maskUnits="userSpaceOnUse" x="' + -FELT.reach + '" y="' +
         -FELT.reach + '" width="' + 4 * FELT.reach + '" height="' + 4 * FELT.reach + '">' +
         wedges + '</mask><path d="' + fishPath() + '" mask="url(#' + mask + ')"/>';
}
function feltFlow(cells) {
  return cells
      .map(({cell : [ angle ], at : from}) => {
        const d = bodyDirection(angle);
        const to = {x : from.x + d.x * FELT.arrow, y : from.y + d.y * FELT.arrow};
        const head = (turn) => {
          const c = Math.cos(turn), s = Math.sin(turn);
          return fixed(to.x - FELT.head * (d.x * c - d.y * s)) + ' ' +
                 fixed(to.y - FELT.head * (d.x * s + d.y * c));
        };
        return '<path d="M' + fixed(from.x) + ' ' + fixed(from.y) + ' L' + fixed(to.x) + ' ' +
               fixed(to.y) + ' M' + head(FELT.spread) + ' L' + fixed(to.x) + ' ' + fixed(to.y) +
               ' L' + head(-FELT.spread) + '"/>';
      })
      .join('');
}
function feltSvg(state, organ) {
  const chosen =
      state.selected?.id === organ.id || organ.centers.some(c => c.id === state.selected?.id);
  const cells =
      chosen && [ 'touch', 'pain', 'lateral' ].includes(organ.type) ? feltCells(state, organ) : [];
  if (!cells.length)
    return '';
  return '<g class="aid-felt ' + organ.type + '">' +
         (organ.type === 'lateral' ? feltFlow(cells) : feltSkin(cells, organ.id)) + '</g>';
}
// What grows at the head, as the engine's design view finds it and the Aquarium draws it: a
// mouth where muscles suck, a jaw with teeth where they bite, and barbels where smell cells also
// feel touch.
const HEAD = Object.freeze({
  mouth : [ 7, 13 ],
  mouth_in : 9,
  teeth : 5,
  tooth_spread : .55,
  tooth : [ 4, 5 ],
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
    if (columns[ANATOMY.smell_outer_left + (side < 0 ? 0 : 1)] > 0)
      html += '<path class="aid-head-barbel" d="M' + fixed(tip.x + H.barbel_root[0]) + ' ' +
              fixed(tip.y + side * H.barbel_root[1]) + ' Q' + fixed(tip.x + H.barbel_bend[0]) +
              ' ' + fixed(tip.y + side * H.barbel_bend[1]) + ' ' + fixed(tip.x + H.barbel_end[0]) +
              ' ' + fixed(tip.y + side * H.barbel_end[1]) + '">' + title('studio.head.barbels') +
              '</path>';
  // Teeth stand on the rim of the mouth around its front, pointing into it.
  const mouth = {x : tip.x + H.mouth_in, y : tip.y};
  if (columns[ANATOMY.aggression] > 0)
    for (let i = 0; i < H.teeth; ++i) {
      const angle = Math.PI + (i - (H.teeth - 1) / 2) * H.tooth_spread, c = Math.cos(angle),
            s = Math.sin(angle);
      const base = {x : mouth.x + c * H.mouth[0], y : mouth.y + s * H.mouth[1]};
      const half = H.tooth[0] / 2;
      html += '<path class="aid-head-tooth" d="M' + fixed(base.x - s * half) + ' ' +
              fixed(base.y + c * half) + ' L' + fixed(base.x - c * H.tooth[1]) + ' ' +
              fixed(base.y - s * H.tooth[1]) + ' L' + fixed(base.x + s * half) + ' ' +
              fixed(base.y - c * half) + 'Z">' + title('studio.head.jaw') + '</path>';
    }
  if (columns[ANATOMY.suction_strength] > 0 || columns[ANATOMY.mouth] > 0)
    html = '<ellipse class="aid-head-mouth" cx="' + fixed(mouth.x) + '" cy="' + fixed(mouth.y) +
           '" rx="' + H.mouth[0] + '" ry="' + H.mouth[1] + '">' + title('studio.head.mouth') +
           '</ellipse>' + html;
  return '<g class="aid-head">' + html + '</g>';
}
export function bodySvg(state) {
  const fill = fishBodyColour(state.document, state.anatomy, state.capabilities?.pigmentHalf);
  const drawnEyes = new Set();
  let organs = '', felt = '';
  for (const organ of state.document.organs) {
    felt += feltSvg(state, organ);
    const glyph = organGlyph(state, organ, drawnEyes) + organNodes(state, organ);
    if (glyph)
      organs +=
          '<g class="aid-anatomical-organ' +
          (state.selected?.kind === 'organ' && state.selected.id === organ.id ? ' selected' : '') +
          '" data-organ="' + escapeText(organ.id) + '"><title>' +
          escapeText(t('studio.organs.' + organ.type)) + '</title>' + glyph + '</g>';
  }
  return finPaths().map(d => '<path class="aid-fish-fin" d="' + d + '"/>').join('') +
         '<path class="aid-fish-body" d="' + fishPath() + '" fill="' + fill + '"/>' +
         headSvg(state) + felt + organs;
}
