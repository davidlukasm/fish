import {labelledText, percent, t, tList} from '../../strings.js';
import {CHANNEL_MAX, clamp, degrees, FULL_TURN, radians} from '../../units.js';
import {CONTRAST_POLARITY, RECEPTOR, VISION, VISUAL_SAMPLE} from '../../schema.js';
import {PIXEL, retinalRaster} from '../../vision_view.js';
import {
  lightColor,
  profileColor,
  profileName,
  spectrumElement,
  spectrumValues
} from './spectrum.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';
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
const LIGHT_KNOB = 6;
const HANDLE = Object.freeze({radius : 235, reach : 150, hint : 1.7});
const CUT = Object.freeze({margin : 10});
const FIELD = Object.freeze(
    {resolution_reach : .77, density_start : 14, density_step : 7, density_max : 16, mark : 7});
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
    world : a?.bodyRadius > 0 ? BODY_RADIUS / a.bodyRadius : null,
    pointText(angle, radius) {
      const r = radians(angle);
      return {x : origin.x - radius * Math.cos(r), y : origin.y + radius * Math.sin(r)};
    },
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
const NEAR = Object.freeze({stops : 12, fill : .5, handle : .25, object : .5});
const nearDepth = (state, profile) => {
  const [least, most] = state.capabilities?.nearDepth ?? [];
  return least > 0 ? least * (most / least) ** unitOfPlan(profile.q2) : null;
};
// A test object outside the near sense's field or beyond its reach answers nothing, so choosing
// the near sense brings it into the middle of the field, within half that reach.
export function nearObject(state, organ, probe) {
  const field = organ.field, profile = field?.profiles[0];
  const depth = profile ? nearDepth(state, profile) : null;
  if (!probe || !depth)
    return probe;
  const turn = Math.abs(probe.bearing), inField = turn >= field.lo && turn <= field.hi;
  if (inField && probe.distance <= depth)
    return probe;
  return {
    ...probe,
    bearing : inField ? probe.bearing : sideOf(organ) * (field.lo + field.hi) / 2,
    distance : Math.min(probe.distance, depth * NEAR.object)
  };
}
function nearScale(state, profile, g) {
  const [least, most] = state.capabilities?.nearDepth ?? [];
  const body = state.anatomy?.bodyRadius;
  if (!(least > 0) || !(body > 0))
    return null;
  const depth = nearDepth(state, profile);
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
const RAY_FAINTEST = .15;
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
const lightAt = (state, organ, g) => {
  const probe = state.sightProbe;
  return probe && g?.world && probe.side === sideOf(organ)
             ? g.pointText(probe.bearing, probe.distance * g.world)
             : null;
};
function testLight(state, organ, g) {
  const probe = state.sightProbe, c = lightAt(state, organ, g);
  if (!c)
    return '';
  const r = probe.radius * g.world;
  const near = organ.type === 'proximity';
  return `<g class="aid-sight-light"><circle data-vision-handle="probe" data-vision-id="${
             idSafe(organ.id)}" cx="${fixed(c.x)}" cy="${fixed(c.y)}" r="${fixed(r)}" fill="${
             lightColor(probe.hue)}" tabindex="0" aria-label="${
             label(near ? 'object' : 'probe')}"/><circle class="aid-sight-knob" ` +
         `data-vision-handle="probe-size" data-vision-id="${idSafe(organ.id)}" cx="${
             fixed(c.x + r)}" cy="${fixed(c.y)}" r="${LIGHT_KNOB}" aria-label="${
             label(near ? 'objectSize' : 'size')}"/></g>`;
}
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
  const chosenNode = organ.centers.find(c => c.id === state.selected?.id)?.id ?? null;
  const selected = isChosen(state.selected, organ) ||
                   isChosen(state.selected, organ.pair && findOrgan(state.document, organ.pair));
  const profile =
      organ.field.profiles.find(p => p.id === state.visionProfile) ?? organ.field.profiles[0];
  const rays = retinalRays(organ, state.sites).filter(r => r.profile === profile.id);
  if (!rays.length)
    return '';
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
// The other colour types of the eye, to sit faintly in the same wheel; a click on one chooses it.
function otherTypes(organ, chosen) {
  const profiles = organ.field.profiles, names = profiles.map(profileName);
  const nameOf = i =>
      names.indexOf(names[i]) === names.lastIndexOf(names[i]) ? names[i] : names[i] + ' ' + (i + 1);
  return profiles
      .map((profile, i) => ({
             tuning : profile,
             choose : `data-vision-profile="${idSafe(profile.id)}"`,
             colour : profileColor(profile),
             name : label('profile') + ' ' + nameOf(i)
           }))
      .filter(o => o.tuning.id !== chosen.id);
}
// `shift` and `start` show a sensitivity being dragged before the design run answers.
export function spectrumEditor(state, organ, profile, shift = 1, start = null) {
  const light = start ?? state.anatomy?.light?.[profileIndex(state.document, organ.id, profile.id)];
  const least = state.anatomy?.contrastLeast, half = light?.half * shift;
  const faint = least > 0 && half > 0 ? {share : stimulusShare(half, least), half, least} : null;
  const [centre, width, opponent] = spectrumValues(profile, true);
  const values = [
    labelledText(label('centre'), centre), labelledText(label('width'), width),
    labelledText(label('opponent'), opponent)
  ].join(' · ');
  const target = {'spectrum-id' : organ.id, 'profile-id' : profile.id};
  return `<div data-spectrum-block title="${escapeText(values)}">` +
         spectrumElement(profile, {spectrum : 'field', ...target}, label('spectrum'), {
           light,
           testHue : state.sightProbe?.hue,
           axis : {excite : label('excites'), inhibit : label('inhibits')},
           others : otherTypes(organ, profile)
         }) +
         contrastScene(profile, faint, target) + '</div>';
}
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
         `aria-label="${label('nearAnswer')}"><title>${label('nearAnswer')}: ${label('ahead')} … ${
             label('aside')}</title><line x1="0" y1="${B.base}" x2="${B.width}" y2="${B.base}"/>${
             bars.join('')}</svg></div>`;
}
const SIGHT_CANVAS = Object.freeze({width : 360, height : 132});
const sightEyes = () => `<div class="aid-sight-eyes">${
        [0, 1]
            .map(side => `<figure><figcaption>${label('sight')} · ${
                             label(side ? 'right' : 'left')}</figcaption><canvas ` +
                         `data-sight-eye="${side}" width="${SIGHT_CANVAS.width}" height="${
                             SIGHT_CANVAS.height}"></canvas><div class="aid-sight-legend" ` +
                         `data-sight-legend></div></figure>`)
            .join('')}</div>`;
// The cell types of an eye's picture: each row's coloured mark with its colour's name.
export const sightLegend = types => {
  const names = tList('organ_graphics.hues'), marks = tList('organ_graphics.hueMarks');
  return `<span>${escapeText(label('answers'))}</span>` +
         types
             .map(type => `<span><b style="background:${type.colour}">${
                              escapeText(marks[type.name] ?? '')}` +
                          `</b>${escapeText(names[type.name] ?? '')}</span>`)
             .join('');
};
const section = body => `<section class="aid-eye-section">${body}</section>`;
const CONTRAST_CHOICES = Object.freeze([ 'bright', 'dark', 'both' ]);
// What the cells of a colour type report, as a scene. Above, a light and a dark thing on a grey
// ground; below, what the cells make of them: a reported thing in the type's colour, an unreported
// one as a dashed outline, both at half strength when the cells report both. A click turns to the
// next choice. At the bottom, how faint a difference the cells notice: spots on the same ground,
// from hardly brighter (or darker) than it to twice as bright (or black), on a log scale from the
// keenest cell's half contrast to full contrast (retina.cc). The shaded spots are too faint for
// half an answer; the handle between sets that.
const SCENE = Object.freeze({
  width : 300,
  words : 4,
  left : 92,
  right : 292,
  things : [ .3, .7 ],
  radius : 10,
  rows : [ 4, 40 ],
  row : 30,
  ramp : {top : 88, height : 22, spots : 7, radius : 6, ends : 122, mark : 82},
  height : 128,
  handle : 7
});
// The scene's ground, as the spots of the keenness row are measured against it.
const GROUND = Object.freeze([ 127, 138, 134 ]);
const sceneX = share => SCENE.left + (SCENE.right - SCENE.left) * share;
// How faint a contrast the cells answer (0 the faintest, 1 full contrast) from a point on the row.
export const sensitivityShare = p => clamp((p.x - SCENE.left) / (SCENE.right - SCENE.left));
function keennessRow(tone, faint) {
  const S = SCENE, R = S.ramp, mid = R.top + R.height / 2, edge = sceneX(faint.share);
  const spot = k => {
    const share = (k + .5) / R.spots, contrast = stimulusOfShare(share, faint.least);
    const sign = tone === 'dark' ? -1 : 1;
    const rgb = GROUND.map(v => Math.round(Math.min(CHANNEL_MAX, v * (1 + sign * contrast))));
    return `<circle cx="${fixed(sceneX(share))}" cy="${fixed(mid)}" r="${R.radius}" fill="rgb(${
        rgb.join(' ')})"/>`;
  };
  return `<text class="aid-scene-word" x="${S.words}" y="${fixed(mid)}" ` +
         `dominant-baseline="central">${escapeText(label('sensitivity'))}</text>` +
         `<rect class="aid-scene-ground" x="${S.left}" y="${R.top}" width="${
             S.right - S.left}" height="${R.height}" rx="6"/>` +
         Array.from({length : R.spots}, (_, k) => spot(k)).join('') +
         `<rect class="aid-scene-faint" x="${S.left}" y="${R.top}" width="${
             fixed(edge - S.left)}" height="${R.height}" rx="6"/>` +
         `<rect class="aid-scene-answered" x="${fixed(edge)}" y="${R.top}" width="${
             fixed(S.right - edge)}" height="${R.height}" rx="6"/>` +
         `<text class="aid-scene-word" x="${S.left}" y="${R.ends}">${
             escapeText(label('keenFrom.' + tone))}</text>` +
         `<text class="aid-scene-word" x="${S.right}" y="${R.ends}" text-anchor="end">${
             escapeText(label('keenTo.' + tone))}</text>` +
         // The half answer is named above the middle of the row, where its words always fit.
         `<text class="aid-scene-word" x="${fixed((S.left + S.right) / 2)}" y="${
             R.mark}" text-anchor="middle">${escapeText(t('studio.vision.keenHalf', {
           p : percent(faint.half, faint.half < .1 ? 1 : 0)
         }))}` +
         `</text><circle class="aid-spectrum-handle sensitivity" data-spectrum-handle=` +
         `"sensitivity" cx="${fixed(edge)}" cy="${fixed(mid)}" r="${S.handle}"><title>${
             escapeText(label('keenHandle'))}</title></circle>`;
}
function contrastScene(profile, faint, target) {
  const S = SCENE;
  const k =
      Math.max(0, CONTRAST_CHOICES.findIndex(key => CONTRAST_POLARITY[key] === profile.polarity));
  const key = CONTRAST_CHOICES[k], next = CONTRAST_CHOICES[(k + 1) % CONTRAST_CHOICES.length];
  const xs = S.things.map(sceneX), middle = top => top + S.row / 2;
  const word = (text, top) => `<text class="aid-scene-word" x="${S.words}" y="${
      fixed(top)}" dominant-baseline="central">${escapeText(text)}</text>`;
  const thing = (cls, x, top, style = '') => `<circle class="${cls}" cx="${fixed(x)}" cy="${
      fixed(middle(top))}" r="${S.radius}"${style}/>`;
  const reported = tone => key === 'both' || key === tone;
  const seen = (tone, x) => reported(tone)
                                ? thing('aid-scene-report' + (key === 'both' ? ' half' : ''), x,
                                        S.rows[1], ` style="fill:${profileColor(profile)}"`)
                                : thing('aid-scene-missed', x, S.rows[1]);
  const attributes =
      Object.entries(target).map(([ name, value ]) => ` data-${name}="${idSafe(value)}"`).join('');
  const band = (cls, top) => `<rect class="${cls}" x="${S.left}" y="${top}" width="${
      S.right - S.left}" height="${S.row}" rx="6"/>`;
  return `<svg class="aid-contrast-scene" data-spectrum="scene"${attributes} viewBox="0 0 ${
             S.width} ${S.height}" role="img" aria-label="${label('contrast')}">` +
         `<g class="aid-contrast-choice" data-vision-polarity="${
             CONTRAST_POLARITY[next]}" role="button"><title>${
             label('contrastTitle.' + key)}</title>` +
         word(label('scene'), middle(S.rows[0])) + band('aid-scene-ground', S.rows[0]) +
         thing('aid-scene-thing bright', xs[0], S.rows[0]) +
         thing('aid-scene-thing dark', xs[1], S.rows[0]) +
         word(label('contrast'), middle(S.rows[1])) + band('aid-scene-seen', S.rows[1]) +
         seen('bright', xs[0]) + seen('dark', xs[1]) + '</g>' +
         (faint ? keennessRow(key === 'dark' ? 'dark' : 'bright', faint) : '') + '</svg>';
}
export function visionInspector(state, organ) {
  const profiles = organ.field.profiles;
  const p = profiles.find(p => p.id === state.visionProfile) ?? profiles[0];
  if (organ.type !== 'eye')
    return section(nearAnswers(state, organ));
  return section(`<div class="aid-vision-profiles"><button class="aid-add" data-vision-add="${
             idSafe(
                 organ.id)}">${escapeText(t('studio.marks.add', {name : label('add')}))}</button>${
             profiles.length > 1
                 ? `<button class="aid-subtle" data-vision-remove="${idSafe(p.id)}" title="${
                       label('remove')}">${
                       escapeText(t('studio.marks.less', {name : label('add')}))}</button>`
                 : ''}</div>`) +
         section(spectrumEditor(state, organ, p)) + section(sightEyes());
}
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
