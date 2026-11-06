import {clamp} from '../../units.js';
import {tectumBands, visionFan} from './vision.js';
import {bodySvg, organHitsSvg} from './body.js';
import {nodeLocation, organLocation, showsNodes} from './places.js';
import {organTitle} from './names.js';
import {TOOL_ICON} from './icons.js';
import {escapeText, fixed, glyph, placedGlyph} from './markup.js';
import {substanceColor} from '../../hormones.js';
import {joinList, joinParts, namedText, t} from '../../strings.js';
import {isRegion, ORGAN_BY_KEY} from '../model/organs.js';
import {allCenters, findAssembly, findCenter, isChosen, wiredCrossing} from '../model/document.js';
import {BODY_FRAME, BODY_RADIUS, centroid, findSite, onMidline, sideOf} from '../model/layout.js';
import {regionSlots} from '../model/regions.js';
import {cameraBox, steadyAt, viewBoxOf, zoomOf} from './frame.js';
import {hormoneOverlay, hormoneRoles} from './influence.js';
import {CATEGORY_TONE, isSelected, moduleName, tone} from './names.js';
import {developedContactsSvg, wireMarkers, wireSvg} from './wires.js';
import {ICON, slotFill, slotShape} from './kit.js';
import {stimulusKind} from './stimulus.js';
import {probeScents, senseProbeSvg} from './probes.js';

// A center's marker: a motor center a rounded square ROUND with a cross, a sense center a disc
// with an eye, a nerve center a diamond (a triangle when it inhibits) with the sign of its kind;
// the marks in INK on its colour, drawn for a marker SIZE wide and scaled to the one asked.
const MARKER = Object.freeze({
  size : 5.5,
  ink : '#10292d',
  round : 2,
  motor : 'M-3 -3 L3 3 M-3 3 L3 -3',
  eye : 2.3,
  shapes : {inhibit : 'M0 -7 L6.5 5.5 H-6.5 Z', other : 'M0 -7 L7 0 L0 7 L-7 0 Z'},
  signs : {
    pacemaker : 'M0 -4 V0 L3 2',
    learn : 'M-4 0 H4 M0 -4 V4 M-2.5 -2.5 L2.5 2.5 M-2.5 2.5 L2.5 -2.5',
    modulate : 'M-3 -3 V3 M0 -4 V4 M3 -3 V3',
    inhibit : 'M-3 2 H3',
    other : 'M-3 0 H3 M0 -3 V3'
  }
});
function markerShape(center) {
  const M = MARKER, r = fixed(M.size), ink = '" stroke="' + M.ink + '" fill="none"/>';
  if (center.role === 'motor')
    return '<rect class="aid-neural-dot" x="-' + r + '" y="-' + r + '" width="' +
           fixed(M.size * 2) + '" height="' + fixed(M.size * 2) + '" rx="' + M.round +
           '" fill="currentColor"/><path d="' + M.motor + ink;
  if (center.role === 'sensor')
    return '<circle class="aid-neural-dot" r="' + r + '" fill="currentColor"/><circle r="' + M.eye +
           '" fill="' + M.ink + '"/>';
  return '<path class="aid-neural-dot" d="' + (M.shapes[center.key] ?? M.shapes.other) +
         '" fill="currentColor"/><path d="' + (M.signs[center.key] ?? M.signs.other) + ink;
}
export const centerMarker = (center, radius) =>
    '<g transform="scale(' + fixed(radius / MARKER.size) + ')">' + markerShape(center) + '</g>';
// A nerve center's glyph is RADIUS wide (CHOSEN when chosen), on a body HALO wider; a hormone's
// ring RING wider marks what it does with the focused substance.
const CENTER_GLYPH = Object.freeze({radius : 8.25, chosen : 11, halo : 5, ring : 9});
function centersSvg(state) {
  const {document : doc, sites, selected} = state;
  const zoom = zoomOf(state);
  const roles = hormoneRoles(state), substance = substanceColor(state.focusSubstance);
  const activeAssembly = selected?.kind === 'assembly' ? findAssembly(doc, selected.id) : null;
  const assemblyCenters = new Set(activeAssembly?.centerIds ?? []);
  let result = '';
  for (const organ of doc.organs) {

    const pos = organLocation(organ, sites, doc);
    const color = tone(organ.type);
    const selectedOrg = isSelected(selected, 'organ', organ.id) ||
                        (state.multi?.has(organ.id) ?? false) ||
                        (activeAssembly?.organIds.includes(organ.id) &&
                         organ.centers.some(center => assemblyCenters.has(center.id)));
    // A region shows its nodes while it is chosen, a tool works on nodes or from NODE.zoom on;
    // else it stands as its hull and symbol.
    if (organ.type !== 'brain' && !(isRegion(organ) && showsNodes(state, [ organ ])))
      continue;
    for (const center of organ.centers) {
      const cp = nodeLocation(doc, sites, center, organ.type);
      const selectedCenter = isSelected(selected, 'center', center.id) ||
                             (state.multi?.has(center.id) ?? false) || selectedOrg ||
                             assemblyCenters.has(center.id);
      const G = CENTER_GLYPH, r = selectedCenter ? G.chosen : G.radius;
      result +=
          '<g class="aid-neural-center' + (selectedCenter ? ' selected' : '') + '" data-center="' +
          escapeText(center.id) + '"' + steadyAt(cp, zoom) + '>' +
          '<circle class="aid-neural-body" r="' + fixed(r + G.halo) + '" fill="' + color + '"/>' +
          (roles.has(center.id) ? '<circle class="aid-hormone-ring ' + roles.get(center.id) +
                                      '" r="' + fixed(r + G.ring) + '" stroke="' + substance + '"/>'
                                : '') +
          '<g style="color:' + color + '">' + centerMarker(center, r) + '</g></g>';
    }
    // The name shows for the organ chosen itself; a chosen module's organs stay unnamed, so their
    // names do not pile up.
    if (isSelected(selected, 'organ', organ.id)) {
      const place = organLabelPlace(pos.y, zoom);
      result += '<text data-label-y="' + fixed(pos.y) + '" x="' + fixed(pos.x) + '" y="' +
                fixed(place.y) + '" text-anchor="middle" class="aid-organ-label" font-size="' +
                fixed(place['font-size']) + '">' + escapeText(organTitle(organ, state.sites)) +
                '</text>';
    }
  }
  return result;
}

// A module's stamp, a card with two waves, stands ABOVE the middle of its nodes.
const STAMP = Object.freeze({
  above : 45,
  glyph : '<rect x="-17" y="-15" width="34" height="30" rx="9"/>' +
              '<path d="M-8 -2 L-3 -6 L4 -2 L9 -6 M-8 5 L-3 1 L4 5 L9 1" fill="none"/>'
});
function assembliesSvg(state) {
  const {document : doc, sites, selected} = state, zoom = zoomOf(state);
  return doc.assemblies
      .map(assembly => {
        const included = new Set(assembly.centerIds ?? []);
        const centers = allCenters(doc).filter(c => included.has(c.id));
        if (!centers.length)
          return '';
        const positions = centers.map(c => nodeLocation(doc, sites, c, c.organType));
        const {x, y} = centroid(positions);
        const active = isSelected(selected, 'assembly', assembly.id);
        return '<g class="aid-assembly-stamp' + (active ? ' selected' : '') + '" data-assembly="' +
               escapeText(assembly.id) + '"' + steadyAt({x, y : y - STAMP.above}, zoom) + '>' +
               STAMP.glyph + '<title>' + escapeText(moduleName(doc, assembly)) + '</title></g>';
      })
      .join('');
}
// A chosen organ's name stands BELOW its glyph, SIZE high, both kept on screen as the view zooms.
const ORGAN_LABEL = Object.freeze({below : 47, size : 14});
export const organLabelPlace = (y, zoom) =>
    ({y : y + ORGAN_LABEL.below / zoom, 'font-size' : ORGAN_LABEL.size / zoom});
// The slots of a brain region (or a gonad) beside its nodes, away from the midline: what fills
// them, or the kind of organ that fits, marked where it needs one. A chosen one shows them all,
// others only the ones they still need. A click on one starts a wire there.
const SLOT = Object.freeze({width : 26, height : 20, round : 6, gap : 5, away : 22, icon : 14});
function slotsSvg(state) {
  const {document : doc, sites, selected} = state, zoom = zoomOf(state);
  let html = '';
  for (const organ of doc.organs.filter(o => ORGAN_BY_KEY[o.type].slots)) {
    const chosen = isChosen(selected, organ);
    const slots = regionSlots(doc, organ).filter(s => chosen || s.required && !s.filled.length);
    const points = organ.centers.map(c => nodeLocation(doc, sites, c, organ.type));
    if (!slots.length || !points.length)
      continue;
    const out = sideOf(organ);
    const x = centroid(points).x;
    const y = (out < 0 ? Math.min : Math.max)(...points.map(p => p.y)) + out * SLOT.away / zoom;
    slots.forEach((slot, i) => {
      const fill = slotFill(slot);
      const dx = (i - (slots.length - 1) / 2) * (SLOT.width + SLOT.gap);
      const need = joinParts([
        t('studio.regions.slots.' + slot.key),
        t(slot.required ? 'studio.regions.required' : 'studio.regions.optional')
      ]);
      const name = slot.filled.length
                       ? namedText(need, joinList(slot.filled.map(o => organTitle(o, sites))))
                       : need;
      html += '<g class="aid-slot-chip ' + fill + ' ' + slot.dir + '" data-slot-region="' +
              escapeText(organ.id) + '" data-slot-dir="' + slot.dir + '"' + steadyAt({x, y}, zoom) +
              '><title>' + escapeText(name.replace(/\u00ad/g, '')) + '</title><rect x="' +
              fixed(dx - SLOT.width / 2) + '" y="' + fixed(-SLOT.height / 2) + '" width="' +
              SLOT.width + '" height="' + SLOT.height + '" rx="' + SLOT.round + '"/>' +
              placedGlyph(slotShape(slot), SLOT.icon, {x : dx}) + '</g>';
    });
  }
  return html;
}
// How far a chosen nerve center's signals reach, as the engine weighs a contact: falling to 1/e
// at its reach (from the engine's least reach to the whole body as its range goes from 0 to 1),
// on its own half of the body as much as it keeps to its side, on the other half as much as it
// crosses; a center on the midline reaches both halves alike.
function reachSvg(state) {
  const {document : doc, sites, selected} = state, least = state.capabilities?.reachLeast;
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  const site = findSite(sites, found?.center.site);
  // A region's nodes stand in the drawn brain, not where their cells lie: they show no reach.
  if (!found || found.center.role !== 'nerve' || isRegion(found.organ) || !(least >= 0) || !site)
    return '';
  const p = nodeLocation(doc, sites, found.center, found.organ.type);
  const reach = (least + (1 - least) * found.center.range) * BODY_RADIUS;
  const crossing = wiredCrossing(doc, found.center, sites) ?? found.center.crossing;
  const own = onMidline(site) ? 1 : clamp(1 - crossing),
        other = onMidline(site) ? 1 : clamp(1 + crossing);
  const upper = p.y < BODY_FRAME.middle || onMidline(site) && site.side < 0;
  // The weight falls by e with each reach: drawn out to REACH.span reaches.
  const fade = '<radialGradient id="aid-reach-fade">' +
               Array
                   .from({length : REACH.span + 1},
                         (_, k) => '<stop offset="' + fixed(k / REACH.span) + '" stop-color="' +
                                   CATEGORY_TONE.brain + '" stop-opacity="' +
                                   fixed(REACH.fill * Math.exp(-k)) + '"/>')
                   .join('') +
               '</radialGradient>';
  const half = (top, weight) =>
      weight > 0 ? '<circle cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
                       fixed(reach * REACH.span) +
                       '" fill="url(#aid-reach-fade)" clip-path="url(#aid-reach-' +
                       (top ? 'upper' : 'lower') + ')" opacity="' + fixed(weight) + '"/>'
                 : '';
  // Each half is cut as far out as the halo reaches.
  const far = reach * REACH.span;
  const clip = (id, y) => '<clipPath id="aid-reach-' + id + '"><rect x="' + fixed(p.x - far) +
                          '" y="' + fixed(y) + '" width="' + fixed(2 * far) + '" height="' +
                          fixed(far + Math.abs(p.y - BODY_FRAME.middle)) + '"/></clipPath>';
  return '<g class="aid-reach">' + fade +
         clip('upper', BODY_FRAME.middle - far - Math.abs(p.y - BODY_FRAME.middle)) +
         clip('lower', BODY_FRAME.middle) + half(upper, own) + half(!upper, other) +
         '<circle class="aid-reach-edge" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
         fixed(reach) + '"/></g>';
}
const REACH = Object.freeze({fill : .32, span : 2});
// The scene's drawing of the fish, by its id and as a selector, and the layers on it for what
// follows the pointer: placement hints, the places a field organ can take, a dragged item's preview
// and the line a wire being drawn follows.
export const BODY_MAP_ID = 'aid-body-map', BODY_MAP = '#' + BODY_MAP_ID;
const LAYER_ID = Object.freeze({
  hints : 'aid-placement-hints',
  choices : 'aid-choices',
  preview : 'aid-drag-preview',
  line : 'aid-connecting-line'
});
// The layer of a sense's test stimulus on the fish (probes.js).
export const PROBE_LAYER = 'aid-sense-probe';
export const LAYER = Object.freeze(
    Object.fromEntries(Object.entries(LAYER_ID).map(([ key, id ]) => [key, '#' + id])));
export function fishScene(state) {
  const camera = cameraBox(state.camera);
  const centers = new Map();
  for (const organ of state.document.organs)
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
  const anatomy = bodySvg(state);
  for (const organ of state.document.organs) {
    if (organ.type !== 'brain' && organ.centers.length)
      centers.set(organ.id, {organ, center : organ.centers[0]});
  }
  const cones = state.document.organs.filter(o => o.field).map(o => visionFan(state, o)).join('') +
                tectumBands(state);
  return '<svg id="' + BODY_MAP_ID + '" viewBox="' + viewBoxOf(state.camera) +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs>' + wireMarkers(camera.zoom) + '</defs><rect x="' + fixed(camera.x) + '" y="' +
         fixed(camera.y) + '" width="' + fixed(camera.width) + '" height="' + fixed(camera.height) +
         '" class="aid-canvas-ground"/>' +
         '<g class="aid-anatomy">' + anatomy + '</g>' + hormoneOverlay(state) +
         '<g class="aid-wires">' +
         (state.contactView === 'actual' && !state.stale && state.report?.contacts
              ? developedContactsSvg(state, centers)
              : wireSvg(state, centers)) +
         '</g>' + reachSvg(state) + organHitsSvg(state) + '<g class="aid-centers">' +
         centersSvg(state) + '</g>' +
         '<g class="aid-slots">' + slotsSvg(state) + '</g>' +
         '<g class="aid-assemblies">' + assembliesSvg(state) + '</g>' +
         '<g class="aid-fov-fields">' + cones + '</g>' +
         '<g id="' + PROBE_LAYER + '">' + senseProbeSvg(state) + '</g>' +
         '<g id="' + LAYER_ID.hints + '"></g>' +
         '<g id="' + LAYER_ID.choices + '" pointer-events="none"></g>' +
         '<g id="' + LAYER_ID.preview + '" pointer-events="none"></g>' +
         '<path id="' + LAYER_ID.line +
         '" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>' + trashZone() + stimulusKind(state) + '<div data-probe-scents-layer>' +
         probeScents(state) + '</div>' +
         '<div class="aid-hint-legend" data-hint-legend hidden></div>';
}
// While an organ is dragged, dropping it here removes it.
function trashZone() {
  return '<div class="aid-trash" data-trash hidden title="' + escapeText(t('studio.tools.trash')) +
         '">' + glyph(TOOL_ICON.erase, ICON.trash, {line : true}) + '<span>' +
         escapeText(t('studio.tools.trash')) + '</span></div>';
}
