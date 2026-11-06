import {labelledText, percent, t} from '../../strings.js';
import {CHANNEL_MAX, clamp, degrees, FULL_TURN, radians} from '../../units.js';
import {RECEPTOR, SENSE_KIND, VISION, VISUAL_SAMPLE} from '../../schema.js';
import {PIXEL, retinalRaster} from '../../vision_view.js';
import {
  lightColor,
  profileColor,
  profileName,
  spectrumElement,
  spectrumValues
} from './spectrum.js';
import {sensitivityElement} from './sensitivity.js';
import {stimulusPicture} from './stimuli.js';
import {escapeText, fixed, idSafe, pointText} from './markup.js';
import {allCenters, findOrgan, isChosen, organOf, profileIndex} from '../model/document.js';
import {fedBy, regionPlan} from '../model/regions.js';
import {EYE, eyeRadius, fieldOrigin} from './places.js';
import {HALF_VIEW, receptorWidth, retinalRays} from '../model/retina.js';
import {
  BODY_FRAME,
  BODY_MIDDLE,
  BODY_RADIUS,
  sideIndex,
  sideOf,
  sideSign
} from '../model/layout.js';
import {planOfUnit, unitOfPlan} from '../../tuning.js';
import {finSizes, fishPath, skinAt, SNOUT_TIP, steadyAt, zoomOf} from './frame.js';

const label = key => t('studio.vision.' + key);
// The test light's size knob, in frame units.
const LIGHT_KNOB = 6;
// A field reaches as deep as the grown fish sees, like the fans in the Aquarium. Its rays run from
// where the engine's eye looks from, which lies elsewhere in the fish than the eye drawn at its
// side, but it shows only outside the fish and outside a circle around the drawn eye, the cut,
// which reaches CUT.margin past the eye's glyph and past the engine's eye. Its handles lie on
// rings around the drawn eye, the edges' HANDLE.reach past the cut and at least HANDLE.radius out.
const HANDLE = Object.freeze({radius : 235, reach : 150, hint : 1.7});
const CUT = Object.freeze({margin : 10});
// Field handles: the resolution handle RESOLUTION_REACH of the way from the cut to the edges'
// ring, density rings DENSITY_STEP apart from DENSITY_START past the cut.
const FIELD = Object.freeze(
    {resolution_reach : .77, density_start : 14, density_step : 7, density_max : 16, mark : 7});
// Where the engine's eye of a side looks from (anatomy.eyePlaces: body radii along the body and
// across it), in frame units; null before the design view answers.
function enginePlace(anatomy, side) {
  const place = anatomy?.eyePlaces?.[sideIndex(side)];
  return place ? {
    x : BODY_MIDDLE.x - place[0] * BODY_RADIUS,
    y : BODY_MIDDLE.y + place[1] * BODY_RADIUS
  }
               : null;
}
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
export function visionGeometry(state, organ) {
  const eye = fieldOrigin(state.document, state.sites, organ);
  if (!eye)
    return null;
  const a = state.anatomy, origin = enginePlace(a, sideOf(organ)) ?? eye;
  const g = {
    origin,
    eye,
    radius : a?.visionDepth > 0 ? a.visionDepth * BODY_RADIUS : HANDLE.radius,
    // Frame units per world unit.
    world : a?.bodyRadius > 0 ? BODY_RADIUS / a.bodyRadius : null,
    // The point at an angle from the origin and a distance from it.
    pointText(angle, radius) {
      const r = radians(angle);
      return {x : origin.x - radius * Math.cos(r), y : origin.y + radius * Math.sin(r)};
    },
    // The point at an angle from the origin on the ring of a radius around the drawn eye.
    ring(angle, radius) {
      const r = radians(angle), ux = -Math.cos(r), uy = Math.sin(r);
      const ox = origin.x - eye.x, oy = origin.y - eye.y, b = ox * ux + oy * uy;
      const t = -b + Math.sqrt(Math.max(0, b * b - (ox * ox + oy * oy - radius * radius)));
      return {x : origin.x + t * ux, y : origin.y + t * uy};
    }
  };
  g.cut =
      CUT.margin +
      Math.max(distance(origin, eye),
               organ.type === 'eye' ? eyeRadius(state.document, sideOf(organ)) * EYE.aspect : 0);
  g.handle = Math.max(HANDLE.radius, g.cut + HANDLE.reach);
  return g;
}
// How deep a near sense senses: an object at its depth counts half, one twice as far a quarter
// (proximity_depth in src/retina.cc); its range moves the depth between the engine's least and
// most. Depths reach many body lengths, so the fan shows them on a log scale from its cut at the
// least depth to its handles' ring at the most, with rings at whole body lengths doubling outward
// and the fill fading as the sense does over NEAR.stops.
// Its handle sits NEAR.handle of the way from the fan's start to its end, clear of the density
// handle in the middle.
const NEAR = Object.freeze({stops : 12, fill : .5, handle : .25});
function nearScale(state, profile, g) {
  const [least, most] = state.capabilities?.nearDepth ?? [];
  const body = state.anatomy?.bodyRadius;
  if (!(least > 0) || !(body > 0))
    return null;
  const depth = least * (most / least) ** unitOfPlan(profile.q2);
  const span = g.handle - g.cut;
  const at = d => g.cut + span * Math.log(d / least) / Math.log(most / least);
  const depthAt = r => least * (most / least) ** ((r - g.cut) / span);
  const length = 2 * body, rings = [];
  for (let l = 1; l * length <= most; l *= 2)
    if (l * length >= least)
      rings.push({lengths : l, radius : at(l * length)});
  const stops = Array.from({length : NEAR.stops + 1}, (_, k) => {
    const f = k / NEAR.stops, r = f * g.handle, d = r < g.cut ? least * r / g.cut : depthAt(r);
    return {offset : f, weight : 2 ** (-d / depth)};
  });
  return {depth, least, most, length, radius : at(depth), rings, stops};
}
// A field's sector from its origin out to a distance (`sector`) or to a ring around the drawn
// eye (`ringSector`).
const arcFlag = (left, right) => right - left > FULL_TURN / 2 ? 1 : 0;
const sector = (g, left, right, radius) => {
  if (right < left)
    [left, right] = [ right, left ];
  return `M${pointText(g.origin)} L${pointText(g.pointText(left, radius))} A${radius} ${radius} 0 ${
      arcFlag(left, right)} 0 ${pointText(g.pointText(right, radius))} Z`;
};
const ringSector = (g, left, right, radius) => {
  if (right < left)
    [left, right] = [ right, left ];
  return `M${pointText(g.origin)} L${pointText(g.ring(left, radius))} A${radius} ${radius} 0 ${
      arcFlag(left, right)} 0 ${pointText(g.ring(right, radius))} Z`;
};
// What hides a field: the fish, and the circle of its cut; each clips everything around its origin
// as far as the field reaches (`id` with -body and -cut).
function fieldClips(g, id) {
  const reach = Math.max(g.radius, g.handle * BANDS.reach) + g.cut, side = 2 * reach, c = g.cut;
  const around = `M${fixed(g.origin.x - reach)} ${fixed(g.origin.y - reach)}h${fixed(side)}v${
      fixed(side)}h${fixed(-side)}Z `;
  const clip = (key, d) =>
      `<clipPath id="${id}-${key}"><path clip-rule="evenodd" d="${around}${d}"/></clipPath>`;
  return clip('body', fishPath(finSizes(), false)) +
         clip('cut', `M${fixed(g.eye.x - c)} ${fixed(g.eye.y)}a${fixed(c)} ${fixed(c)} 0 1 0 ${
                         fixed(2 * c)} 0a${fixed(c)} ${fixed(c)} 0 1 0 ${fixed(-2 * c)} 0Z`);
}
// A near sense's ray shows at least RAY_FAINTEST, fully where its cell answers fully.
const RAY_FAINTEST = .15;
function organCells(state, organ) {
  const sight = state.anatomy?.sight;
  if (!sight?.receptors)
    return [];
  const centers = allCenters(state.document), near = organ.type === 'proximity' ? 1 : 0;
  const answers = new Map(sight.samples.map(s => [s[VISUAL_SAMPLE.neuron], s]));
  return sight.receptors.flatMap((r, i) => {
    const center = centers[sight.groups[i]];
    if (center?.organId !== organ.id || r[RECEPTOR.proximity] !== near)
      return [];
    return [ {
      receptor : r,
      center,
      answer : answers.get(r[RECEPTOR.neuron])?.[VISUAL_SAMPLE.response] ?? 0
    } ];
  });
}
// What a side's eye receives, as the Aquarium paints it into its fields: each bearing of the
// light image coloured as seen, reaching to the nearest thing seen there.
function seenLight(state, organ, g) {
  const sight = state.anatomy?.sight;
  if (!sight?.bands || !g.world)
    return '';
  const raster = retinalRaster(sight)[sideIndex(organ.side)], step = FULL_TURN / VISION.pixels;
  let html = '<g class="aid-vision-seen">';
  raster.forEach((pixel, k) => {
    if (!pixel[PIXEL.width] || pixel[PIXEL.distance] <= 0)
      return;
    const depth = Math.min(g.radius, Math.min(sight.range, pixel[PIXEL.distance]) * g.world);
    const colour = [ PIXEL.red, PIXEL.green, PIXEL.blue ].map(
        c => Math.round(CHANNEL_MAX * Math.sqrt(clamp(pixel[c]))));
    html +=
        `<path d="${sector(g, k * step, (k + 1) * step, depth)}" fill="rgb(${colour.join(' ')})"/>`;
  });
  return html + '</g>';
}
// The test light: a food-sized disc of one hue at a bearing and distance from a side's view
// origin, moved by dragging it and sized by its knob; for a near sense the thing it senses.
function testLight(state, organ, g) {
  const probe = state.sightProbe;
  if (!probe || !g.world || probe.side !== sideOf(organ))
    return '';
  const c = g.pointText(probe.bearing, probe.distance * g.world), r = probe.radius * g.world;
  const near = organ.type === 'proximity';
  return `<g class="aid-sight-light"><circle data-vision-handle="probe" data-vision-id="${
             idSafe(organ.id)}" cx="${fixed(c.x)}" cy="${fixed(c.y)}" r="${fixed(r)}" fill="${
             lightColor(probe.hue)}" tabindex="0" aria-label="${
             label(near ? 'object' : 'probe')}"/><circle class="aid-sight-knob" ` +
         `data-vision-handle="probe-size" data-vision-id="${idSafe(organ.id)}" cx="${
             fixed(c.x + r)}" cy="${fixed(c.y)}" r="${LIGHT_KNOB}" aria-label="${
             label(near ? 'objectSize' : 'size')}"/></g>`;
}
// The test light alone, to move it while it is dragged without redrawing the scene.
// While an optic tectum (or one of its nodes) is chosen, each eye feeding it shows how its field
// splits over the tectum's map: a ray at each border, the map node's number amid its band.
const BANDS = Object.freeze({reach : 2.2, label : 1.7});
export function tectumBands(state) {
  const doc = state.document, chosen = organOf(doc, state.selected?.id);
  if (chosen?.type !== 'tectum')
    return '';
  const plan = regionPlan(doc, chosen), {lo, hi} = plan.view;
  const bands = chosen.region.resolution, step = (hi - lo) / bands;
  let html = '';
  for (const eye of fedBy(doc, chosen).filter(o => o.type === 'eye')) {
    const g = visionGeometry(state, eye);
    if (!g)
      continue;
    const side = sideSign(eye.side), reach = g.handle * BANDS.reach;
    for (let k = 0; k <= bands; ++k)
      html += `<path d="M${pointText(g.ring(side * (lo + k * step), g.cut))} L${
          pointText(g.ring(side * (lo + k * step), reach))}"/>`;
    for (let k = 0; k < bands; ++k) {
      const p = g.ring(side * (lo + (k + .5) * step), g.handle * BANDS.label);
      html += `<text x="${fixed(p.x)}" y="${fixed(p.y)}" text-anchor="middle">${k + 1}</text>`;
    }
  }
  return html ? `<g class="aid-tectum-bands">${html}</g>` : '';
}
export function testLightMarkup(state, organ) {
  const g = visionGeometry(state, organ);
  return g ? testLight(state, organ, g) : '';
}
// A near sense's field on its depth scale, shaded by how near things are felt, with rings at
// lengths of the fish, all on rings around the drawn eye.
function nearField(organ, g, near, [ lo, hi ]) {
  const id = `aid-near-${idSafe(organ.id)}`;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fixed(g.eye.x)}" cy="${
             fixed(g.eye.y)}" r="${fixed(g.handle)}">${
             near.stops
                 .map(s => `<stop offset="${
                          fixed(s.offset)}" stop-color="currentColor" stop-opacity="${
                          fixed(NEAR.fill * s.weight)}"/>`)
                 .join('')}</radialGradient>` +
         `<path d="${ringSector(g, lo, hi, g.handle)}" class="aid-vision-union" style="fill:url(#${
             id});fill-opacity:1"/>` +
         near.rings
             .map(ring => `<path d="M${pointText(g.ring(lo, ring.radius))} A${fixed(ring.radius)} ${
                      fixed(ring.radius)} 0 0 0 ${
                      pointText(g.ring(hi, ring.radius))}" class="aid-near-ring"/><text x="${
                      fixed(g.ring(hi, ring.radius).x)}" y="${
                      fixed(g.ring(hi, ring.radius).y)}" class="aid-near-label">${
                      ring.lengths}</text>`)
             .join('');
}
// Every cell of the organ is one ray along its middle, as bright as it answers; a chosen node's
// cells also show the whole field each of them sees. Before the engine answers, the design's
// rays stand in for them. Fields and rays reach as far as `reach` says.
function cellRays(state, organ, g, profile, rays, chosenNode, reach) {
  const cells = organCells(state, organ);
  let html = '';
  for (const cell of cells.filter(c => c.center.id === chosenNode)) {
    const [from, to] =
        [ RECEPTOR.view_left, RECEPTOR.view_right ].map(k => degrees(cell.receptor[k]));
    html += `<path d="${reach.outline(Math.min(from, to), Math.max(from, to))}" ` +
            `class="aid-vision-cell-field"/>`;
  }
  for (const cell of cells) {
    const angle = degrees(cell.receptor[RECEPTOR.angle]);
    html +=
        `<path d="M${pointText(g.origin)} L${pointText(reach.end(angle))}" class="aid-vision-ray${
            cell.center.id === chosenNode ? ' chosen' : ''}" style="stroke:${
            profileColor(
                organ.field.profiles.find(p => p.id === cell.center.profile) ??
                profile)};opacity:${fixed(RAY_FAINTEST + (1 - RAY_FAINTEST) * cell.answer)}"/>`;
  }
  if (!cells.length)
    for (const ray of rays)
      html += `<path d="M${pointText(g.origin)} L${
          pointText(reach.end(ray.angle))}" class="aid-vision-ray pending"/>`;
  return html;
}
// The field's handles: its edges, its resolution beside the middle ray, its density and a near
// sense's depth, on rings around the drawn eye. Handles keep their size on screen at any zoom, as
// organ stamps do.
function fieldHandles(state, organ, g, near, middle) {
  const zoom = zoomOf(state), f = organ.field;
  const handle = (key, p, value) => `<g class="aid-vision-handle" data-vision-handle="${
      key}" data-vision-id="${idSafe(organ.id)}" tabindex="0" role="slider" aria-label="${
      label(key)}" aria-valuenow="${fixed(value)}"${steadyAt(p, zoom)}><circle r="${
      FIELD.mark}"/><text y="${- 2 * FIELD.mark}" text-anchor="middle">${label(key)} ${
      Math.round(value)}${['lo', 'hi', 'resolution'].includes(key) ? '°' : ''}</text>${
      key === 'distance' ? `<title>${label('distanceTitle')}</title>` : ''}</g>`;
  return (near ? handle('distance',
                        g.ring(organ.side * (f.lo + NEAR.handle * (f.hi - f.lo)), near.radius),
                        near.depth / near.length)
               : '') +
         handle('lo', g.ring(organ.side * f.lo, g.handle), f.lo) +
         handle('hi', g.ring(organ.side * f.hi, g.handle), f.hi) +
         handle('resolution',
                g.ring(middle.angle + organ.side * receptorWidth(f.resolution),
                       g.cut + (g.handle - g.cut) * FIELD.resolution_reach),
                2 * receptorWidth(f.resolution)) +
         handle('density',
                g.ring(organ.side * (f.lo + f.hi) / 2,
                       g.cut + FIELD.density_start + f.density * FIELD.density_step),
                f.density);
}
export function visionFan(state, organ) {
  const g = visionGeometry(state, organ);
  if (!g)
    return '';
  // The organ is chosen as a whole or through one of its nodes, whose rays then stand out.
  // Both eyes of a pair open their fields when either is chosen.
  const chosenNode = organ.centers.find(c => c.id === state.selected?.id)?.id ?? null;
  const selected = isChosen(state.selected, organ) ||
                   isChosen(state.selected, organ.pair && findOrgan(state.document, organ.pair));
  const profile =
      organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
  const rays = retinalRays(organ, state.sites).filter(r => r.profile === profile.id);
  if (!rays.length)
    return '';
  // Only the chosen organ's field reaches as far as the fish sees, a near sense on its depth
  // scale; the others stay a hint HANDLE.hint times as far as the handles' ring. A field not
  // chosen picks its organ.
  const near = organ.type === 'proximity' ? nearScale(state, profile, g) : null;
  const deep = selected && !near,
        hint = Math.max(g.cut, Math.min(g.radius, g.handle * HANDLE.hint));
  const reach = {
    outline : (left, right) =>
        deep ? sector(g, left, right, g.radius) : ringSector(g, left, right, hint),
    end : angle => deep ? g.pointText(angle, g.radius) : g.ring(angle, hint)
  };
  const span = [ Math.min(...rays.map(r => r.left)), Math.max(...rays.map(r => r.right)) ];
  const id = idSafe(organ.id), clip = `aid-fan-${id}`;
  const open = `<g class="aid-vision-fan${organ.type === 'proximity' ? ' near' : ''}${
      selected ? ' selected'
               : ''}" data-vision-organ="${id}" style="color:${profileColor(profile)}">${
      fieldClips(g, clip)}<g clip-path="url(#${clip}-body)"><g clip-path="url(#${clip}-cut)">`;
  const field = near && selected
                    ? nearField(organ, g, near, span)
                    : `<path d="${reach.outline(...span)}" class="aid-vision-union"${
                          selected ? '' : ` data-select-organ="${escapeText(organ.id)}"`}/>`;
  if (!selected)
    return open + field + '</g></g></g>';
  const middle = rays[Math.floor(rays.length / 2)];
  return open + field + seenLight(state, organ, g) +
         `<path d="${reach.outline(middle.left, middle.right)}" class="aid-vision-resolution"/>` +
         cellRays(state, organ, g, profile, rays, chosenNode, reach) + '</g></g>' +
         fieldHandles(state, organ, g, near, middle) + testLight(state, organ, g) + '</g>';
}
// The colour of a colour type: its tuning with the engine's balance, the test light's hue.
export function spectrumEditor(state, organ, profile) {
  const light = state.anatomy?.light?.[profileIndex(state.document, organ.id, profile.id)];
  const [centre, width, opponent] = spectrumValues(profile, true);
  return `<div data-spectrum-block>${
             spectrumElement(
                 profile, {spectrum : 'field', 'spectrum-id' : organ.id, 'profile-id' : profile.id},
                 label('spectrum'), light, state.sightProbe?.hue,
                 {excite : label('excites'), inhibit : label('inhibits')})}` +
         `<div class="aid-spectrum-legend"><span class="centre">${
             label('centre')}</span><span class="test">${
             label('probe')}</span></div><div class="aid-profile-values"><span>${
             labelledText(label('centre'),
                          centre)}</span><span>${labelledText(label('width'), width)}</span><span>${
             labelledText(label('opponent'), opponent)}</span></div></div>`;
}
// How sensitive a colour type is: the engine's answer over brightness, the threshold's handle.
// While its handle is dragged, the curve the drag started from shifted by the threshold's factor.
export function sensitivityEditor(state, organ, profile, shift = 1, start = null) {
  const light = start ?? state.anatomy?.light?.[profileIndex(state.document, organ.id, profile.id)];
  const graphic = sensitivityElement(
      light, state.anatomy?.lightDimmest,
      {sensitivity : 'field', 'sensitivity-id' : organ.id, 'profile-id' : profile.id},
      label('sensitivity'),
      (share, point, title, size) =>
          stimulusPicture(SENSE_KIND.light, share, point, title, profileColor(profile), size),
      shift);
  return `<div data-sensitivity-block="field" data-sensitivity-id="${
      idSafe(organ.id)}" data-profile-id="${idSafe(profile.id)}">${graphic}${
      graphic ? `<div class="aid-profile-values"><span>${label('half')}</span><span>${
                    percent(light.half * shift, 2)}</span></div>`
              : ''}</div>`;
}
// How each cell of a near sense answers to the test object, from ahead to the side as its rays
// lie in the fan: one bar each, as high as it answers; in a block the controller redraws as the
// design view answers.
const NEAR_BARS =
    Object.freeze({width : 300, height : 64, top : 6, base : 50, gap : 1, label : 62});
export function nearAnswers(state, organ) {
  const B = NEAR_BARS, cells = organCells(state, organ)
                                   .sort((a, b) => Math.abs(a.receptor[RECEPTOR.angle]) -
                                                   Math.abs(b.receptor[RECEPTOR.angle]));
  const block = `<div data-near-answers="${idSafe(organ.id)}">`;
  if (!cells.length)
    return block + '</div>';
  const step = B.width / cells.length, plot = B.base - B.top;
  const bars = cells.map(
      (cell, k) => `<rect x="${fixed(k * step)}" y="${fixed(B.base - plot * cell.answer)}" width="${
          fixed(Math.max(B.gap, step - B.gap))}" height="${fixed(plot * cell.answer)}"/>`);
  return block + `<svg class="aid-near-answers" viewBox="0 0 ${B.width} ${B.height}" role="img" ` +
         `aria-label="${label('nearAnswer')}"><line x1="0" y1="${B.base}" x2="${B.width}" y2="${
             B.base}"/>${bars.join('')}<text x="0" y="${B.label}">${
             label('ahead')}</text><text x="${B.width}" y="${B.label}" text-anchor="end">${
             label('aside')}</text></svg></div>`;
}
// What both eyes see now, drawn as the Aquarium draws an eye's view on a canvas this large.
const SIGHT_CANVAS = Object.freeze({width : 360, height : 132});
const sightEyes = () => `<div class="aid-sight-eyes">${
        [0, 1]
            .map(side => `<figure><canvas data-sight-eye="${side}" width="${
                     SIGHT_CANVAS.width}" height="${SIGHT_CANVAS.height}"></canvas><figcaption>${
                     label(side ? 'right' : 'left')}</figcaption></figure>`)
            .join('')}</div>`;
const section = (key, body) =>
    `<section class="aid-eye-section"><h4>${label(key)}</h4>${body}</section>`;
export function visionInspector(state, organ) {
  const profiles = organ.field.profiles;
  const p = profiles.find(p => p.id === state.visionProfile) ?? profiles[0];
  if (organ.type !== 'eye')
    return section('nearAnswer', nearAnswers(state, organ));
  // Each colour type by its name, numbered where two share one.
  const names = profiles.map(profileName);
  const chip = (profile, i) => {
    const name = names.indexOf(names[i]) === names.lastIndexOf(names[i]) ? names[i]
                                                                         : names[i] + ' ' + (i + 1);
    return `<button data-vision-profile="${idSafe(profile.id)}" class="${
        profile.id === p.id ? 'active'
                            : ''}" style="--profile:${profileColor(profile)}" aria-label="${
        label('profile')} ${escapeText(name)}"><i></i>${escapeText(name)}</button>`;
  };
  return section('profiles',
                 `<div class="aid-vision-profiles">${
                     profiles.map(chip).join('')}<button class="aid-add" data-vision-add="${
                     idSafe(organ.id)}">＋ ${label('add')}</button>${
                     profiles.length > 1 ? `<button class="aid-subtle" data-vision-remove="${
                                               idSafe(p.id)}">${label('remove')}</button>`
                                         : ''}</div>`) +
         section('spectrum', spectrumEditor(state, organ, p)) +
         section('sensitivity', sensitivityEditor(state, organ, p)) + section('sight', sightEyes());
}
// The test light lies where the engine sees it, from where the engine's eye looks; it shows
// only outside the fish and outside the cut round the drawn eye. A light that would lie within
// either moves out along its bearing, a STEP of the cut at a time, at most as far as the eye sees.
const CLEAR = Object.freeze({step : .25});
export function clearOfFish(state, organ, probe) {
  const g = visionGeometry(state, organ), range = state.capabilities?.visionRange;
  if (!g || !g.world || !probe || !(range > 0))
    return probe;
  const hidden = d => {
    const c = g.pointText(probe.bearing, d * g.world), r = probe.radius * g.world;
    const onSkin =
        Math.abs(c.y - BODY_FRAME.middle) - r <
        Math.abs(skinAt(c.x, Math.sign(c.y - BODY_FRAME.middle) || 1) - BODY_FRAME.middle);
    return distance(c, g.eye) < g.cut + r ||
           (c.x + r > SNOUT_TIP.x && c.x - r < BODY_FRAME.tail && onSkin);
  };
  let d = probe.distance;
  while (hidden(d) && d < range)
    d = Math.min(range, d + g.cut * CLEAR.step / g.world);
  return d === probe.distance ? probe : {...probe, distance : d};
}
// A new test light starts out beyond the field's handles, BEYOND times as far from the eye as
// their ring, so it covers none of them.
const BEYOND = 1.3;
export function beyondHandles(state, organ, probe) {
  const g = visionGeometry(state, organ), range = state.capabilities?.visionRange;
  if (!g || !g.world || !probe || !(range > 0))
    return probe;
  const ring = g.handle * BEYOND + probe.radius * g.world;
  let d = probe.distance;
  while (distance(g.pointText(probe.bearing, d * g.world), g.eye) < ring && d < range)
    d = Math.min(range, d + g.cut * CLEAR.step / g.world);
  return d === probe.distance ? probe : {...probe, distance : d};
}
export function visionDragPatch(state, organ, key, p) {
  const g = visionGeometry(state, organ);
  if (!g)
    return null;
  const dx = g.origin.x - p.x, dy = p.y - g.origin.y;
  const angle = degrees(Math.atan2(dy, dx));
  if (key === 'lo' || key === 'hi')
    return {[key] : clamp(angle * organ.side, 0, HALF_VIEW)};
  const ring = distance(p, g.eye);
  if (key === 'density')
    return {
      density : clamp(Math.round((ring - g.cut - FIELD.density_start) / FIELD.density_step), 1,
                      FIELD.density_max)
    };
  if (key === 'resolution') {
    const rays = retinalRays(organ, state.sites)
                     .filter(r => r.profile ===
                                  (organ.field.profiles.find(p => p.id === state.visionProfile) ??
                                   organ.field.profiles[0])
                                      .id);
    const middle = rays[Math.floor(rays.length / 2)];
    if (!middle)
      return null;
    const width = clamp(Math.abs(angle - middle.angle), receptorWidth(0), receptorWidth(1));
    return {
      resolution :
          Math.log(width / receptorWidth(0)) / Math.log(receptorWidth(1) / receptorWidth(0))
    };
  }
  const range = state.capabilities?.visionRange,
        [ least, most ] = state.capabilities?.sightRadius ?? [];
  if (!g.world || !(range > 0))
    return null;
  if (key === 'distance') {
    const profile =
        organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
    const unit = (ring - g.cut) / (g.handle - g.cut);
    return {profile : {id : profile.id, q2 : planOfUnit(clamp(unit, 0, 1))}};
  }
  if (key === 'probe')
    return clearOfFish(state, organ, {
      ...state.sightProbe,
      bearing : angle,
      distance : clamp(Math.hypot(dx, dy) / g.world, 0, range)
    });
  if (key === 'probe-size' && state.sightProbe) {
    const c = g.pointText(state.sightProbe.bearing, state.sightProbe.distance * g.world);
    return {radius : clamp(Math.hypot(p.x - c.x, p.y - c.y) / g.world, least, most)};
  }
  return null;
}
