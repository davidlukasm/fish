import {formatNumber, t} from '../../strings.js';
import {PERCENT} from '../../units.js';
import {RECEPTOR, VISION, VISUAL_SAMPLE} from '../../schema.js';
import {PIXEL, retinalRaster} from '../../vision_view.js';
import {lightColor, profileColor, spectrumElement, spectrumValues} from './spectrum.js';
import {sensitivityElement} from './sensitivity.js';
import {allCenters} from '../model/document.js';
import {BODY_RADIUS_PIXELS, fieldOrigin} from './body.js';
import {HALF_VIEW, receptorWidth, retinalRays} from '../model/retina.js';
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
export function visionFan(state, organ) {
  const g = visionGeometry(state, organ);
  if (!g)
    return '';
  // The organ is chosen as a whole or through one of its nodes, whose rays then stand out.
  const chosenNode = organ.centers.find(c => c.id === state.selected?.id)?.id ?? null;
  const selected = state.selected?.id === organ.id || chosenNode !== null;
  const profile =
      organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
  const rays = retinalRays(organ, state.sites).filter(r => r.profile === profile.id);
  if (!rays.length)
    return '';
  const radius = g.radius;
  const lo = Math.min(...rays.map(r => r.left)), hi = Math.max(...rays.map(r => r.right));
  let html = `<g class="aid-vision-fan${organ.type === 'proximity' ? ' near' : ''}${
      selected
          ? ' selected'
          : ''}" data-vision-organ="${safe(organ.id)}" style="color:${profileColor(profile)}">`;
  html += `<path d="${sector(g, lo, hi, radius)}" class="aid-vision-union"/>`;
  if (!selected)
    return html + '</g>';
  html += seenLight(state, organ, g);
  const middle = rays[Math.floor(rays.length / 2)];
  html +=
      `<path d="${sector(g, middle.left, middle.right, radius)}" class="aid-vision-resolution"/>`;
  // Every cell of the organ is one ray, as bright as it answers.
  const cells = organCells(state, organ);
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
  const handle = (key, p, value) =>
      `<g class="aid-vision-handle" data-vision-handle="${key}" data-vision-id="${
          safe(organ.id)}" tabindex="0" role="slider" aria-label="${label(key)}" aria-valuenow="${
          n(value)}"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${FIELD.mark}"/><text x="${
          n(p.x)}" y="${n(p.y - 2 * FIELD.mark)}" text-anchor="middle">${label(key)} ${
          Math.round(value)}${['lo', 'hi', 'resolution'].includes(key) ? '°' : ''}</text></g>`;
  const f = organ.field;
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
                 label('spectrum'), light, state.sightProbe?.hue)}` +
         `<div class="aid-spectrum-legend"><span class="excite">${
             label('excites')}</span><span class="inhibit">${
             label('inhibits')}</span><span class="test">${
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
  return `<div data-sensitivity-block data-sensitivity-id="${safe(organ.id)}" data-profile-id="${
      safe(profile.id)}">${graphic}${
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
    return `<label class="aid-vision-threshold">${
               label('distance')}<input type="range" min="-1" max="1" step=".02" value="${
               p.q2}" data-vision-property="q2"/></label>` +
           section('sight', sightEyes());
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
  if (key === 'probe')
    return {bearing : angle, distance : clamp(Math.hypot(dx, dy) / g.world, 0, range)};
  if (key === 'probe-size' && state.sightProbe) {
    const c = g.point(state.sightProbe.bearing, state.sightProbe.distance * g.world);
    return {radius : clamp(Math.hypot(p.x - c.x, p.y - c.y) / g.world, least, most)};
  }
  return null;
}
