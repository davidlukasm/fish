import {anatomyHandlesSvg} from './anatomy_handles.js';
import {clamp} from '../../units.js';
import {tectumBands, visionFan} from './vision.js';
import {bodySvg, organDrawings, organHitsSvg} from './body.js';
import {nodeLocation, organLocation, regionGeometry, showsNodes} from './places.js';
import {centerTitle} from './names.js';
import {TOOL_ICON} from './icons.js';
import {escapeText, fixed, glyph} from './markup.js';
import {substanceColor} from '../../hormones.js';
import {t} from '../../strings.js';
import {isRegion, nerveKind, ORGAN_BY_KEY} from '../model/organs.js';
import {
  allCenters,
  contactCenters,
  findAssembly,
  findCenter,
  organOf,
  wiredCrossing
} from '../model/document.js';
import {BODY_FRAME, BODY_RADIUS, centroid, findSite, onMidline} from '../model/layout.js';
import {cameraBox, steadyAt, viewBoxOf, zoomOf} from './frame.js';
import {hormoneOverlay, hormoneRoles} from './influence.js';
import {CATEGORY_TONE, isSelected, moduleName, tone} from './names.js';
import {
  developedContactsSvg,
  endpointIndex,
  regionContactsSvg,
  wireMarkers,
  wireSvg
} from './wires.js';
import {ICON} from './kit.js';
import {stimulusKind} from './stimulus.js';
import {groundOptions, probeGround, probeScents, probeWater, senseProbeSvg} from './probes.js';
import {lifeBar} from './life_tool.js';
import {detailMix, nodeOpacity, layerShown} from './layers.js';

const MARKER = Object.freeze({
  size : 5.5,
  ink : '#10292d',
  round : 2,
  motor : 'M-3 -3 L3 3 M-3 3 L3 -3',
  eye : 2.3,
  shapes : {inhibit : 'M0 -7 L6.5 5.5 H-6.5 Z', other : 'M0 -7 L7 0 L0 7 L-7 0 Z'},
  signs : {
    pacemaker : 'M-5 0 H-3 L-1.5 -3 L1.5 3 L3 0 H5',
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
  const kind = nerveKind(center);
  return '<path class="aid-neural-dot" d="' + (M.shapes[kind] ?? M.shapes.other) +
         '" fill="currentColor"/><path d="' + (M.signs[kind] ?? M.signs.other) + ink;
}
export const centerMarker = (center, radius) =>
    '<g transform="scale(' + fixed(radius / MARKER.size) + ')">' + markerShape(center) + '</g>';
const CENTER_GLYPH = Object.freeze({radius : 8.25, chosen : 11, halo : 5, ring : 9});
function centersSvg(state) {
  const {document : doc, sites, selected} = state;
  const zoom = zoomOf(state);
  const {roles, index} = hormoneRoles(state);
  const substance = substanceColor(index);
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
    if (organ.type !== 'brain' && !(isRegion(organ) && showsNodes(state, [ organ ])))
      continue;
    for (const center of organ.centers) {
      const cp = nodeLocation(doc, sites, center, organ.type);
      const selectedCenter = isSelected(selected, 'center', center.id) ||
                             (state.multi?.has(center.id) ?? false) || selectedOrg ||
                             assemblyCenters.has(center.id);
      const G = CENTER_GLYPH, region = isRegion(organ) ? regionGeometry(doc, sites, organ) : null;
      const spacing = region ? region.spacing : Infinity;
      const r = Math.min(selectedCenter ? G.chosen : G.radius, spacing * zoom * .32);
      result +=
          '<g class="aid-neural-center' + (selectedCenter ? ' selected' : '') + '" data-center="' +
          escapeText(center.id) + '" opacity="' + fixed(nodeOpacity(state, selectedCenter)) + '"' +
          steadyAt(cp, zoom) + '>' +
          '<title>' + escapeText(centerTitle(center)) +
          '</title><circle class="aid-neural-body" r="' + fixed(r + Math.min(G.halo, r * .35)) +
          '" fill="' + color + '"/>' +
          (roles.has(center.id) ? '<circle class="aid-hormone-ring ' + roles.get(center.id) +
                                      '" r="' + fixed(r + G.ring) + '" stroke="' + substance + '"/>'
                                : '') +
          '<g style="color:' + color + '">' + centerMarker(center, r) + '</g></g>';
    }
  }
  return result;
}

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
function reachSvg(state) {
  const {document : doc, sites, selected} = state, least = state.capabilities?.reachLeast;
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  const site = findSite(sites, found?.center.site);
  if (!found || found.center.role !== 'nerve' || isRegion(found.organ) || !(least >= 0) || !site)
    return '';
  const p = nodeLocation(doc, sites, found.center, found.organ.type);
  const reach = (least + (1 - least) * found.center.range) * BODY_RADIUS;
  const crossing = wiredCrossing(doc, found.center, sites) ?? found.center.crossing;
  const own = onMidline(site) ? 1 : clamp(1 - crossing),
        other = onMidline(site) ? 1 : clamp(1 + crossing);
  const upper = p.y < BODY_FRAME.middle || onMidline(site) && site.side < 0;
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
const BODY_MAP_ID = 'aid-body-map';
export const BODY_MAP = '#' + BODY_MAP_ID;
const LAYER_ID = Object.freeze(
    {hints : 'aid-placement-hints', preview : 'aid-drag-preview', line : 'aid-connecting-line'});
export const PROBE_LAYER = 'aid-sense-probe';
export const LAYER = Object.freeze(
    Object.fromEntries(Object.entries(LAYER_ID).map(([ key, id ]) => [key, '#' + id])));
function wiresShown(state, centers) {
  const shown = layerShown(state, 'wires') ? state
                : state.selected           ? {...state, wireScope : 'focus'}
                                           : null;
  if (!shown)
    return {lines : '', branches : ''};
  return state.contactView === 'actual' && !state.stale && state.report?.compiler
             ? {lines : developedContactsSvg(shown, centers), branches : ''}
             : wireSvg(shown, centers);
}
function fieldsShown(state) {
  const organ = organOf(state.document, state.selected?.id);
  return !organ || !!organ.field || ORGAN_BY_KEY[organ.type]?.category !== 'senses';
}
function generatedCenters(state) {
  if (state.stale || !state.report?.compiler || state.contactView !== 'actual')
    return '';
  const zoom = zoomOf(state);
  return '<g class="aid-generated-centers">' +
         contactCenters(state)
             .filter(center => center.generated)
             .map(center => {
               const at = nodeLocation(state.document, state.sites, center, 'brain');
               return '<g class="aid-generated-center" data-generated="' + escapeText(center.id) +
                      '"' + steadyAt(at, zoom) + '><title>' +
                      escapeText(centerTitle(center) + ' · ' + center.copies) +
                      '</title><circle r="12" fill="#efc17422" stroke="#efc174"/>' +
                      centerMarker(center, 7) + '</g>';
             })
             .join('') +
         '</g>';
}
const transparent = ' style="display:contents"';

function fieldLayers(state) {
  const chosen = organOf(state.document, state.selected?.id);
  const ownField = o => !!chosen && (o.id === chosen.id || o.id === chosen.pair);
  const fading = detailMix(state).fields > 0 && fieldsShown(state);
  const fans = state.document.organs.filter(o => o.field);
  const other = fading ? fans.filter(o => !ownField(o)).map(o => visionFan(state, o)).join('') +
                             tectumBands(state)
                       : '';
  return [ other, fans.filter(ownField).map(o => visionFan(state, o)).join('') ];
}

function wireLayers(state) {
  const centers = endpointIndex(state.document), wires = wiresShown(state, centers);
  return [
    [ 'wires', wires.lines, ' class="aid-wires"' ],
    [
      'wire-ends',
      wires.branches + (layerShown(state, 'wires') ? regionContactsSvg(state, centers) : '')
    ]
  ];
}

function sceneLayers(state) {
  const [wires, wireEnds] = wireLayers(state);
  const [fields, selectedFields] = fieldLayers(state);
  const drawings = organDrawings(state);
  return [
    [ 'anatomy', bodySvg(state, drawings), ' class="aid-anatomy"' ],
    [ 'hormones', hormoneOverlay(state) ], wires,
    [ 'organ-hits', reachSvg(state) + organHitsSvg(state, drawings) ], wireEnds,
    [ 'centers', centersSvg(state), ' class="aid-centers"' ],
    [ 'handles', anatomyHandlesSvg(state) + generatedCenters(state) ],
    [ 'assemblies', assembliesSvg(state), ' class="aid-assemblies"' ],
    [
      'fields', fields, ' class="aid-fov-fields" opacity="' + fixed(detailMix(state).fields) + '"'
    ],
    [ 'chosen-fields', selectedFields, ' class="aid-fov-fields"' ]
  ];
}

// A probe can also be repainted independently of the fish. The moving water keeps its SVG
// elements and animation until its direction, strength or scale changes.
export function paintFishProbes(target, state, animateWater = true) {
  const water = target?.querySelector('[data-probe-water]');
  const current = water && animateWater ? probeWater(state) : null;
  setMarkup(target?.querySelector('[data-probe-ground]'), probeGround(state));
  setMarkup(target?.querySelector('[data-probe-controls]'), senseProbeSvg(state));
  setMarkup(target?.querySelector('[data-probe-scents-layer]'),
            probeScents(state) + groundOptions(state));
  if (water && water.dataset.probeWater !== (current?.key ?? '')) {
    water.dataset.probeWater = current?.key ?? '';
    water.innerHTML = current?.svg() ?? '';
  }
}

const painted = new WeakMap();
const sceneInputs = new WeakMap();
function setMarkup(element, markup) {
  if (!element || painted.get(element) === markup)
    return false;
  painted.set(element, markup);
  element.innerHTML = markup;
  return true;
}

export function invalidateFishLayer(element) {
  painted.delete(element.closest('[data-fish-layer]'));
  sceneInputs.delete(element.closest(BODY_MAP));
}

const cameraAttributes = camera =>
    Object.fromEntries([ 'x', 'y', 'width', 'height' ].map(key => [key, fixed(camera[key])]));

export function fishScene(state) {
  const camera = cameraBox(state.camera), water = probeWater(state);
  const layers = sceneLayers(state)
                     .map(([ key, markup, attrs = '' ]) =>
                              '<g data-fish-layer="' + key + '"' + attrs + '>' + markup + '</g>')
                     .join('');
  const frame = Object.entries(cameraAttributes(camera))
                    .map(([ key, value ]) => ' ' + key + '="' + value + '"')
                    .join('');
  return '<svg id="' + BODY_MAP_ID + '" viewBox="' + viewBoxOf(state.camera) +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs data-fish-defs>' + wireMarkers(camera.zoom) + '</defs><rect' + frame +
         ' class="aid-canvas-ground"/>' +
         '<g data-probe-ground>' + probeGround(state) + '</g>' + layers + '<g id="' + PROBE_LAYER +
         '"><g data-probe-water="' + (water?.key ?? '') + '">' + (water?.svg() ?? '') +
         '</g><g data-probe-controls>' + senseProbeSvg(state) + '</g></g>' +
         '<g id="' + LAYER_ID.hints + '"></g>' +
         '<g id="' + LAYER_ID.preview + '" pointer-events="none"></g>' +
         '<path id="' + LAYER_ID.line +
         '" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>' + trashZone() + '<div data-fish-stimulus' + transparent + '>' +
         stimulusKind(state) + '</div><div data-probe-scents-layer>' + probeScents(state) +
         groundOptions(state) + '</div><div data-fish-life' + transparent + '>' + lifeBar(state) +
         '</div><div class="aid-hint-legend" data-hint-legend hidden></div>';
}

export function paintFishScene(target, state, scope, animateWater = true) {
  const svg = target.querySelector(BODY_MAP);
  if (!svg) {
    target.innerHTML = fishScene(state);
    return true;
  }
  const draw = ([ key, markup ]) =>
      setMarkup(svg.querySelector('[data-fish-layer="' + key + '"]'), markup);
  if (scope === 'wires') {
    sceneInputs.delete(svg);
    return wireLayers(state).map(draw).includes(true);
  }
  if (scope === 'hormones') {
    sceneInputs.delete(svg);
    return draw([ 'hormones', hormoneOverlay(state) ]);
  }
  // Camera and multiple selection change in place. The other scene inputs are replaced.
  const {x, y, zoom} = state.camera;
  const inputs = [...Object.values(state), x, y, zoom, ...(state.multi ?? []) ];
  const previous = sceneInputs.get(svg);
  const life = target.querySelector('[data-fish-life]');
  const lifeDirty = life?.hasAttribute('data-life-dirty');
  if (!lifeDirty && previous?.length === inputs.length &&
      previous.every((value, i) => value === inputs[i]))
    return false;
  sceneInputs.set(svg, inputs);
  const camera = cameraBox(state.camera);
  const viewBox = viewBoxOf(state.camera);
  if (svg.getAttribute('viewBox') !== viewBox)
    svg.setAttribute('viewBox', viewBox);
  const ground = svg.querySelector('.aid-canvas-ground');
  for (const [key, value] of Object.entries(cameraAttributes(camera)))
    if (ground.getAttribute(key) !== value)
      ground.setAttribute(key, value);
  setMarkup(svg.querySelector('[data-fish-defs]'), wireMarkers(camera.zoom));
  let marksChanged = false;
  for (const layer of sceneLayers(state))
    if (draw(layer) && layer[0] !== 'fields' && layer[0] !== 'chosen-fields')
      marksChanged = true;
  const fields = svg.querySelector('[data-fish-layer="fields"]'),
        opacity = fixed(detailMix(state).fields);
  if (fields.getAttribute('opacity') !== opacity)
    fields.setAttribute('opacity', opacity);
  setMarkup(target.querySelector('[data-fish-stimulus]'), stimulusKind(state));
  if (lifeDirty) {
    painted.delete(life);
    life.removeAttribute('data-life-dirty');
  }
  setMarkup(life, lifeBar(state));
  paintFishProbes(target, state, animateWater);
  return marksChanged;
}
function trashZone() {
  return '<div class="aid-trash" data-trash hidden title="' + escapeText(t('studio.tools.trash')) +
         '">' + glyph(TOOL_ICON.erase, ICON.trash, {line : true}) + '<span>' +
         escapeText(t('studio.tools.trash')) + '</span></div>';
}
