import {t} from '../../strings.js';
import {aquariumEyePoint, aquariumVisionDepth} from './anatomy.js';
import {HALF_VIEW, receptorWidth, retinalRays} from '../model/retina.js';
const label = key => t('studio.vision.' + key);
const n = x => Number(x).toFixed(2);
const safe = s => String(s).replace(/[^a-zA-Z0-9_:-]/g, '');
export const profileColor = p => p.qwidth > .95 ? '#e8eed8' : `hsl(${(p.q1 + 1) * 180} 72% 68%)`;
// A field reaches as deep as the grown fish sees, like the fans in the Aquarium; its handles stay
// within HANDLE_RADIUS of the eye, where they can be reached.
const HANDLE_RADIUS = 235;
export function visionGeometry(state, organ) {
  const origin = aquariumEyePoint(state.anatomy, organ.side < 0 ? 0 : 1);
  if (!origin)
    return null;
  return {
    origin,
    radius : aquariumVisionDepth(state.anatomy) ?? HANDLE_RADIUS,
    handle : HANDLE_RADIUS,
    point(angle, radius = HANDLE_RADIUS) {
      const a = angle * Math.PI / 180;
      return {x : origin.x - radius * Math.cos(a), y : origin.y + radius * Math.sin(a)};
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
export function visionFan(state, organ) {
  const g = visionGeometry(state, organ);
  if (!g)
    return '';
  const selected = state.selected?.id === organ.id;
  const profile =
      organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
  const rays = retinalRays(organ, state.sites).filter(r => r.profile === profile.id);
  if (!rays.length)
    return '';
  const color = profileColor(profile), radius = g.radius;
  const lo = Math.min(...rays.map(r => r.left)), hi = Math.max(...rays.map(r => r.right));
  let html =
      `<g class="aid-vision-fan" data-vision-organ="${safe(organ.id)}" style="color:${color}">`;
  html += `<path d="${sector(g, lo, hi, radius)}" class="aid-vision-union"/>`;
  if (!selected)
    return html + '</g>';
  if (state.opticalProbe) {
    const grey = Math.round(state.opticalProbe.background * 255);
    html += `<path d="${sector(g, lo, hi, radius)}" fill="rgb(${grey} ${grey} ${
        grey})" fill-opacity=".25"/>`;
  }
  if (organ.type === 'proximity')
    html = html.replace('aid-vision-union', 'aid-vision-union aid-vision-near');
  const middle = rays[Math.floor(rays.length / 2)];
  html +=
      `<path d="${sector(g, middle.left, middle.right, radius)}" class="aid-vision-resolution"/>`;
  for (const ray of rays) {
    const group = state.document.organs.flatMap(o => o.centers).findIndex(c => c.id === ray.center);
    const response =
        state.optical?.receptors
            ?.find(r => r[0] === group && Math.abs(r[1] * 180 / Math.PI - ray.angle) < .001)
            ?.[4] ??
        0;
    html += `<path d="M${point(g.origin)} L${
        point(g.point(ray.angle,
                      radius))}" class="aid-vision-ray" style="opacity:${.18 + .82 * response}"/>`;
  }
  const handle = (key, p, value) => `<g class="aid-vision-handle" data-vision-handle="${
      key}" data-vision-id="${safe(organ.id)}" tabindex="0" role="slider" aria-label="${
      label(key)}" aria-valuenow="${n(value)}"><circle cx="${n(p.x)}" cy="${
      n(p.y)}" r="7"/><text x="${n(p.x)}" y="${n(p.y - 13)}" text-anchor="middle">${label(key)} ${
      Math.round(value)}${['lo', 'hi', 'resolution'].includes(key) ? '°' : ''}</text></g>`;
  const f = organ.field;
  html += handle('lo', g.point(organ.side * f.lo), f.lo);
  html += handle('hi', g.point(organ.side * f.hi), f.hi);
  html += handle('resolution',
                 g.point(middle.angle + organ.side * receptorWidth(f.resolution), g.handle * .77),
                 2 * receptorWidth(f.resolution));
  html += handle('density', g.point(organ.side * (f.lo + f.hi) / 2, 45 + f.density * 7), f.density);
  if (state.opticalProbe) {
    const probe = state.opticalProbe, p = g.point(probe.angle, probe.distance * g.handle);
    html += `<circle class="aid-optical-probe" data-vision-handle="probe" data-vision-id="${
        safe(organ.id)}" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(probe.size * g.handle)}" fill="${
        probe.color}" tabindex="0" aria-label="${label('probe')}"/>`;
  }
  return html + '</g>';
}
export function visionInspector(state, organ) {
  const profiles = organ.field.profiles;
  const p = profiles.find(p => p.id === state.visionProfile) ?? profiles[0];
  const chip = (profile, i) => `<button data-vision-profile="${safe(profile.id)}" class="${
      profile.id === p.id ? 'active' : ''}" style="--profile:${
      profileColor(profile)}" aria-label="${label('profile')} ${i + 1}"><i></i>${i + 1}</button>`;
  let html = organ.type === 'eye'
                 ? `<div class="aid-vision-profiles">${
                       profiles.map(chip).join('')}<button data-vision-add="${
                       safe(organ.id)}" aria-label="${label('add')}">＋</button>${
                       profiles.length > 1
                           ? `<button data-vision-remove="${safe(p.id)}" aria-label="${
                                 label('remove')}">−</button>`
                           : ''}</div>`
                 : '';
  if (organ.type === 'eye') {
    html += `<div class="aid-profile-spectrum" data-vision-spectrum="${
        safe(organ.id)}" data-profile-id="${safe(p.id)}" role="img" aria-label="${
        label('spectrum')}"><i style="left:${(p.q1 + 1) * 50}%;top:${p.qwidth * 100}%"></i></div>`;
    html += `<div class="aid-profile-values"><span>${label('spectrum')}</span><span>${
        Math.round((p.q1 + 1) * 180)}° · ${Math.round(p.qwidth * 100)}%</span></div>`;
    html += `<div class="aid-vision-opponent"><span>${label('opponent')}</span>${
            [-1, 0, 1]
                .map((q, i) => `<button data-vision-opponent="${q}" class="${
                         Math.abs(p.q2 - q) < .01 ? 'active' : ''}">${['○', '◐', '●'][i]}</button>`)
                .join('')}</div>`;
  }
  html += `<label class="aid-vision-threshold">${
      label(organ.type === 'eye'
                ? 'sensitivity'
                : 'distance')}<input type="range" min="-1" max="1" step=".02" value="${
      organ.type === 'eye'
          ? -p.threshold
          : p.q2}" data-vision-property="${organ.type === 'eye' ? 'threshold' : 'q2'}"/></label>`;
  html += `<div class="aid-vision-probe-tools"><button data-vision-probe="toggle" class="${
      state.opticalProbe ? 'active' : ''}">◉ ${label('probe')}</button>`;
  if (state.opticalProbe)
    html += `<input type="color" aria-label="${label('color')}" data-probe-color value="${
        state.opticalProbe.color}"/><button data-vision-probe="background" aria-label="${
        label('background')}">${
        state.opticalProbe.background > .4
            ? '☀'
            : '☾'}</button><button data-vision-probe="size" aria-label="${
        label('size')}">⊕</button>`;
  return html + '</div>';
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
    return {density : clamp(Math.round((Math.hypot(dx, dy) - 45) / 7), 1, 16)};
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
  if (key === 'probe')
    return {angle, distance : clamp(Math.hypot(dx, dy) / g.handle, .03, 1.4)};
  return null;
}
