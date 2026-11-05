import {formatNumber, t} from '../../strings.js';
import {PERCENT} from '../../units.js';
import {RECEPTOR, VISION, VISUAL_SAMPLE} from '../../schema.js';
import {PIXEL, retinalRaster} from '../../vision_view.js';
import {lightColor, profileColor, spectrumElement, spectrumValues} from './spectrum.js';
import {sensitivityElement} from './sensitivity.js';
import {allCenters, findCenter, findOrgan} from '../model/document.js';
import {fedBy, regionPlan} from '../model/regions.js';
import {BODY_RADIUS_PIXELS, fieldOrigin} from './body.js';
import {HALF_VIEW, planOfUnit, receptorWidth, retinalRays, unitOfPlan} from '../model/retina.js';
const label = key => t('studio.vision.' + key);
const n = x => Number(x).toFixed(2);
const safe = s => String(s).replace(/[^a-zA-Z0-9_:-]/g, '');
// The test light's size knob, in frame units.
const LIGHT_KNOB = 6;
// A field reaches as deep as the grown fish sees, like the fans in the Aquarium; its handles stay
// within HANDLE_RADIUS of the eye, where they can be reached.
const HANDLE_RADIUS = 235;
// Field handles: the resolution handle at RESOLUTION_REACH of the handle radius, density rings
// DENSITY_STEP apart from DENSITY_START.
const FIELD = Object.freeze(
    {resolution_reach : .77, density_start : 45, density_step : 7, density_max : 16, mark : 7});
const sideIndex = organ => organ.side < 0 ? 0 : 1;
export function visionGeometry(state, organ) {
  const origin = fieldOrigin(state.document, state.sites, organ);
  if (!origin)
    return null;
  const a = state.anatomy;
  return {
    origin,
    radius : a?.visionDepth > 0 ? a.visionDepth * BODY_RADIUS_PIXELS : HANDLE_RADIUS,
    handle : HANDLE_RADIUS,
    // Frame units per world unit.
    world : a?.bodyRadius > 0 ? BODY_RADIUS_PIXELS / a.bodyRadius : null,
    point(angle, radius = HANDLE_RADIUS) {
      const r = angle * Math.PI / 180;
      return {x : origin.x - radius * Math.cos(r), y : origin.y + radius * Math.sin(r)};
    }
  };
}
// How deep a near sense senses: an object at its depth counts half, one twice as far a quarter
// (proximity_depth in src/retina.cc); its range moves the depth between the engine's least and
// most. Depths reach many body lengths, so the fan shows them on a log scale from NEAR.inner of the
// fan's handle radius at the least depth to its full radius at the most, with rings at whole
// body lengths doubling outward and the fill fading as the sense does over NEAR.stops.
// Its handle sits NEAR.handle of the way from the fan's start to its end, clear of the density
// handle in the middle.
const NEAR = Object.freeze({inner : .25, stops : 12, fill : .5, handle : .25});
function nearScale(state, profile, g) {
  const [least, most] = state.capabilities?.nearDepth ?? [];
  const body = state.anatomy?.bodyRadius;
  if (!(least > 0) || !(body > 0))
    return null;
  const depth = least * (most / least) ** unitOfPlan(profile.q2);
  const at = d =>
      g.handle * (NEAR.inner + (1 - NEAR.inner) * Math.log(d / least) / Math.log(most / least));
  const depthAt = r => least * (most / least) ** ((r / g.handle - NEAR.inner) / (1 - NEAR.inner));
  const length = 2 * body, rings = [];
  for (let l = 1; l * length <= most; l *= 2)
    if (l * length >= least)
      rings.push({lengths : l, radius : at(l * length)});
  const stops = Array.from({length : NEAR.stops + 1}, (_, k) => {
    const f = k / NEAR.stops, d = f < NEAR.inner ? least * f / NEAR.inner : depthAt(f * g.handle);
    return {offset : f, weight : 2 ** (-d / depth)};
  });
  return {depth, least, most, length, radius : at(depth), rings, stops};
}
const point = p => n(p.x) + ' ' + n(p.y);
const sector = (g, left, right, radius) => {
  if (right < left)
    [left, right] = [ right, left ];
  return `M${point(g.origin)} L${point(g.point(left, radius))} A${radius} ${radius} 0 ${
      right - left > 180 ? 1 : 0} 0 ${point(g.point(right, radius))} Z`;
};
// The cells of a field organ as the engine made them: each light or near-sense receptor of the
// design view's sight that belongs to one of the organ's centers, with what it answers now.
export function organCells(state, organ) {
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
  const raster = retinalRaster(sight)[sideIndex(organ)], step = 360 / VISION.pixels;
  let html = '<g class="aid-vision-seen">';
  raster.forEach((pixel, k) => {
    if (!pixel[PIXEL.width] || pixel[PIXEL.distance] <= 0)
      return;
    const depth = Math.min(g.radius, Math.min(sight.range, pixel[PIXEL.distance]) * g.world);
    const colour = [ PIXEL.red, PIXEL.green, PIXEL.blue ].map(
        c => Math.round(255 * Math.sqrt(Math.max(0, Math.min(1, pixel[c])))));
    html +=
        `<path d="${sector(g, k * step, (k + 1) * step, depth)}" fill="rgb(${colour.join(' ')})"/>`;
  });
  return html + '</g>';
}
// The test light: a food-sized disc of one hue at a bearing and distance from a side's view
// origin, moved by dragging it and sized by its knob.
function testLight(state, organ, g) {
  const probe = state.sightProbe;
  if (!probe || !g.world || probe.side !== (organ.side < 0 ? -1 : 1))
    return '';
  const c = g.point(probe.bearing, probe.distance * g.world), r = probe.radius * g.world;
  return `<g class="aid-sight-light"><circle data-vision-handle="probe" data-vision-id="${
      safe(organ.id)}" cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="${
      lightColor(probe.hue)}" tabindex="0" aria-label="${
      label(
          'probe')}"/><circle class="aid-sight-knob" data-vision-handle="probe-size" data-vision-id="${
      safe(organ.id)}" cx="${n(c.x + r)}" cy="${n(c.y)}" r="${LIGHT_KNOB}" aria-label="${
      label('size')}"/></g>`;
}
// The test light alone, to move it while it is dragged without redrawing the scene.
// While an optic tectum (or one of its nodes) is chosen, each eye feeding it shows how its field
// splits over the tectum's map: a ray at each border, the map node's number amid its band.
const BANDS = Object.freeze({reach : 2.2, label : 1.7});
export function tectumBands(state) {
  const doc = state.document,
        chosen = findOrgan(doc, state.selected?.id) ?? findCenter(doc, state.selected?.id)?.organ;
  if (chosen?.type !== 'tectum')
    return '';
  const plan = regionPlan(doc, chosen), {lo, hi} = plan.view;
  const bands = chosen.region.resolution, step = (hi - lo) / bands;
  let html = '';
  for (const eye of fedBy(doc, chosen).filter(o => o.type === 'eye')) {
    const g = visionGeometry(state, eye);
    if (!g)
      continue;
    const side = eye.side < 0 ? -1 : 1, reach = g.handle * BANDS.reach;
    for (let k = 0; k <= bands; ++k)
      html += `<path d="M${point(g.origin)} L${point(g.point(side * (lo + k * step), reach))}"/>`;
    for (let k = 0; k < bands; ++k) {
      const p = g.point(side * (lo + (k + .5) * step), g.handle * BANDS.label);
      html += `<text x="${n(p.x)}" y="${n(p.y)}" text-anchor="middle">${k + 1}</text>`;
    }
  }
  return html ? `<g class="aid-tectum-bands">${html}</g>` : '';
}
export function testLightMarkup(state, organ) {
  const g = visionGeometry(state, organ);
  return g ? testLight(state, organ, g) : '';
}
export function visionFan(state, organ) {
  const g = visionGeometry(state, organ);
  if (!g)
    return '';
  // The organ is chosen as a whole or through one of its nodes, whose rays then stand out.
  // Both eyes of a pair open their fields when either is chosen.
  const chosenNode = organ.centers.find(c => c.id === state.selected?.id)?.id ?? null;
  const owns = o =>
      o && (state.selected?.id === o.id || o.centers.some(c => c.id === state.selected?.id));
  const selected = owns(organ) || owns(organ.pair && findOrgan(state.document, organ.pair));
  const profile =
      organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
  const rays = retinalRays(organ, state.sites).filter(r => r.profile === profile.id);
  if (!rays.length)
    return '';
  // Only the chosen organ's field reaches as far as the fish sees, a near sense on its depth
  // scale; the others stay a hint.
  const near = organ.type === 'proximity' ? nearScale(state, profile, g) : null;
  const radius = selected && !near ? g.radius : Math.min(g.radius, g.handle);
  const lo = Math.min(...rays.map(r => r.left)), hi = Math.max(...rays.map(r => r.right));
  let html = `<g class="aid-vision-fan${organ.type === 'proximity' ? ' near' : ''}${
      selected
          ? ' selected'
          : ''}" data-vision-organ="${safe(organ.id)}" style="color:${profileColor(profile)}">`;
  if (near && selected) {
    const id = `aid-near-${safe(organ.id)}`;
    html +=
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(g.origin.x)}" cy="${
            n(g.origin.y)}" r="${n(g.handle)}">${
            near.stops
                .map(s => `<stop offset="${n(s.offset)}" stop-color="currentColor" stop-opacity="${
                         n(NEAR.fill * s.weight)}"/>`)
                .join('')}</radialGradient>` +
        `<path d="${sector(g, lo, hi, radius)}" class="aid-vision-union" style="fill:url(#${
            id});fill-opacity:1"/>` +
        near.rings
            .map(ring => `<path d="M${point(g.point(lo, ring.radius))} A${n(ring.radius)} ${
                     n(ring.radius)} 0 0 0 ${
                     point(g.point(hi, ring.radius))}" class="aid-near-ring"/><text x="${
                     n(g.point(hi, ring.radius).x)}" y="${
                     n(g.point(hi, ring.radius).y)}" class="aid-near-label">${ring.lengths}</text>`)
            .join('');
  } else
    html += `<path d="${sector(g, lo, hi, radius)}" class="aid-vision-union"/>`;
  if (!selected)
    return html + '</g>';
  html += seenLight(state, organ, g);
  const middle = rays[Math.floor(rays.length / 2)];
  html +=
      `<path d="${sector(g, middle.left, middle.right, radius)}" class="aid-vision-resolution"/>`;
  // Every cell of the organ is one ray along its middle, as bright as it answers; a chosen node's
  // cells also show the whole field each of them sees.
  const cells = organCells(state, organ);
  for (const cell of cells.filter(c => c.center.id === chosenNode)) {
    const [from, to] =
        [ RECEPTOR.view_left, RECEPTOR.view_right ].map(k => cell.receptor[k] * 180 / Math.PI);
    html += `<path d="${sector(g, Math.min(from, to), Math.max(from, to), radius)}" ` +
            `class="aid-vision-cell-field"/>`;
  }
  for (const cell of cells) {
    const angle = cell.receptor[RECEPTOR.angle] * 180 / Math.PI;
    html += `<path d="M${point(g.origin)} L${point(g.point(angle, radius))}" class="aid-vision-ray${
        cell.center.id === chosenNode ? ' chosen' : ''}" style="stroke:${
        profileColor(organ.field.profiles.find(p => p.id === cell.center.profile) ??
                     profile)};opacity:${n(.15 + .85 * cell.answer)}"/>`;
  }
  if (!cells.length)
    for (const ray of rays)
      html += `<path d="M${point(g.origin)} L${
          point(g.point(ray.angle, radius))}" class="aid-vision-ray pending"/>`;
  // Handles keep their size on screen at any zoom, as organ stamps do.
  const scale = n(1 / (state.camera?.zoom ?? 1));
  const handle = (key, p, value) =>
      `<g class="aid-vision-handle" data-vision-handle="${key}" data-vision-id="${
          safe(organ.id)}" tabindex="0" role="slider" aria-label="${label(key)}" aria-valuenow="${
          n(value)}" transform="translate(${n(p.x)} ${n(p.y)}) scale(${scale})"><circle r="${
          FIELD.mark}"/><text y="${- 2 * FIELD.mark}" text-anchor="middle">${label(key)} ${
          Math.round(value)}${['lo', 'hi', 'resolution'].includes(key) ? '°' : ''}</text></g>`;
  const f = organ.field;
  if (near)
    html +=
        handle('distance', g.point(organ.side * (f.lo + NEAR.handle * (f.hi - f.lo)), near.radius),
               near.depth / near.length);
  html += handle('lo', g.point(organ.side * f.lo), f.lo);
  html += handle('hi', g.point(organ.side * f.hi), f.hi);
  html += handle('resolution',
                 g.point(middle.angle + organ.side * receptorWidth(f.resolution),
                         g.handle * FIELD.resolution_reach),
                 2 * receptorWidth(f.resolution));
  html += handle(
      'density',
      g.point(organ.side * (f.lo + f.hi) / 2, FIELD.density_start + f.density * FIELD.density_step),
      f.density);
  return html + testLight(state, organ, g) + '</g>';
}
// The colour of a colour type: its tuning with the engine's balance, the test light's hue.
export function spectrumEditor(state, organ, profile) {
  const index =
      allCenters(state.document).findIndex(c => c.organId === organ.id && c.profile === profile.id);
  const light = state.anatomy?.light?.[index];
  const [centre, width, opponent] = spectrumValues(profile, true);
  return `<div data-spectrum-block>${
             spectrumElement(
                 profile, {spectrum : 'field', 'spectrum-id' : organ.id, 'profile-id' : profile.id},
                 label('spectrum'), light, state.sightProbe?.hue,
                 {excite : label('excites'), inhibit : label('inhibits')})}` +
         `<div class="aid-spectrum-legend"><span class="centre">${
             label('centre')}</span><span class="test">${
             label('probe')}</span></div><div class="aid-profile-values"><span>${
             label('centre')}\u00a0${centre}</span><span>${label('width')}\u00a0${
             width}</span><span>${label('opponent')}\u00a0${opponent}</span></div></div>`;
}
// How sensitive a colour type is: the engine's answer over brightness, the threshold's handle.
// While its handle is dragged, the curve the drag started from shifted by the threshold's factor.
export function sensitivityEditor(state, organ, profile, shift = 1, start = null) {
  const index =
      allCenters(state.document).findIndex(c => c.organId === organ.id && c.profile === profile.id);
  const light = start ?? state.anatomy?.light?.[index];
  const graphic = sensitivityElement(
      light, state.anatomy?.lightDimmest,
      {sensitivity : 'field', 'sensitivity-id' : organ.id, 'profile-id' : profile.id},
      label('sensitivity'), shift);
  return `<div data-sensitivity-block="field" data-sensitivity-id="${
      safe(organ.id)}" data-profile-id="${safe(profile.id)}">${graphic}${
      graphic ? `<div class="aid-profile-values"><span>${label('half')}</span><span>${
                    formatNumber(PERCENT * light.half * shift, 2)}\u00a0%</span></div>`
              : ''}</div>`;
}
// What both eyes see now, drawn as the Aquarium draws an eye's view.
const sightEyes = () => `<div class="aid-sight-eyes">${
        [0, 1]
            .map(side => `<figure><canvas data-sight-eye="${
                     side}" width="360" height="132"></canvas><figcaption>${
                     label(side ? 'right' : 'left')}</figcaption></figure>`)
            .join('')}</div>`;
const section = (key, body) =>
    `<section class="aid-eye-section"><h4>${label(key)}</h4>${body}</section>`;
export function visionInspector(state, organ) {
  const profiles = organ.field.profiles;
  const p = profiles.find(p => p.id === state.visionProfile) ?? profiles[0];
  if (organ.type !== 'eye')
    return `<p class="aid-hint">${label('nearHint')}</p>`;
  const chip = (profile, i) => `<button data-vision-profile="${safe(profile.id)}" class="${
      profile.id === p.id ? 'active' : ''}" style="--profile:${
      profileColor(profile)}" aria-label="${label('profile')} ${i + 1}"><i></i>${i + 1}</button>`;
  return section('profiles',
                 `<div class="aid-vision-profiles">${
                     profiles.map(chip).join('')}<button class="aid-add" data-vision-add="${
                     safe(organ.id)}">＋ ${label('add')}</button>${
                     profiles.length > 1 ? `<button class="aid-subtle" data-vision-remove="${
                                               safe(p.id)}">${label('remove')}</button>`
                                         : ''}</div>`) +
         section('spectrum', spectrumEditor(state, organ, p)) +
         section('sensitivity', sensitivityEditor(state, organ, p)) + section('sight', sightEyes());
}
export function visionDragPatch(state, organ, key, p) {
  const g = visionGeometry(state, organ);
  if (!g)
    return null;
  const dx = g.origin.x - p.x, dy = p.y - g.origin.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (key === 'lo' || key === 'hi')
    return {[key] : clamp(angle * organ.side, 0, HALF_VIEW)};
  if (key === 'density')
    return {
      density : clamp(Math.round((Math.hypot(dx, dy) - FIELD.density_start) / FIELD.density_step),
                      1, FIELD.density_max)
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
    const unit = (Math.hypot(dx, dy) / g.handle - NEAR.inner) / (1 - NEAR.inner);
    return {profile : {id : profile.id, q2 : planOfUnit(clamp(unit, 0, 1))}};
  }
  if (key === 'probe')
    return {bearing : angle, distance : clamp(Math.hypot(dx, dy) / g.world, 0, range)};
  if (key === 'probe-size' && state.sightProbe) {
    const c = g.point(state.sightProbe.bearing, state.sightProbe.distance * g.world);
    return {radius : clamp(Math.hypot(p.x - c.x, p.y - c.y) / g.world, least, most)};
  }
  return null;
}
