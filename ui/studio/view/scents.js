import {TUNING} from '../../schema.js';
import {preferredScent, scentAffinities, scentTuning, tuningHalfOffset} from '../../tuning.js';
import {scentColors, scentIcons, scentNames} from '../../brain_model.js';
import {ecologyIconSvg} from '../../feeding_view.js';
import {escapeText, fixed, trackShare, widthTrack} from './markup.js';
import {organTypes, typeOfCenter} from '../model/document.js';
import {clamp, radians} from '../../units.js';
import {joinParts, percent, t} from '../../strings.js';
import {typeChips} from './types.js';

// A nose's scent map: the scent sphere seen from its pole, food (at the pole) in the middle and
// every scent around it by its longitude (quality 1), as far out as the part of the sphere
// nearer the pole than it takes of the whole (equal area): most scents lie within 55 degrees of
// food, and the far pole, where none lies, narrows to the rim. The nose's preference is a ring;
// around it, its halo holds what it smells at least half as well (its true shape on the sphere),
// and each scent fills as strongly as it is smelled. Dragging moves the preference (near a scent
// onto it); a track below sets the width.
export const SCENT_MAP = Object.freeze({
  size : 240,
  height : 262,
  centre : 120,
  radius : 104,
  disc : 10,
  icon : .62,
  ring : 14,
  snap : 13,
  samples : 128,
  track : [ 72, 168 ],
  track_y : 248
});
const turn = 2 * Math.PI;
// A point of the sphere (colatitude from the pole and longitude, radians) on the map, and back.
const mapPoint = (colatitude, longitude) => {
  const r = SCENT_MAP.radius * Math.sin(colatitude / 2);
  return {
    x : SCENT_MAP.centre + r * Math.sin(longitude),
    y : SCENT_MAP.centre - r * Math.cos(longitude)
  };
};
export const scentMapPoint = (q1, q2) => mapPoint(Math.acos(clamp(q2, -1)), Math.PI * (q1 + 1));
const scentPoint = k => scentMapPoint(scentTuning(k).q1, scentTuning(k).q2);
// The tuning under a pointer at a fraction (fx, fy) of the map: the scent there when it is
// within SNAP of one.
export function scentMapTuning(fx, fy) {
  const M = SCENT_MAP, x = fx * M.size, y = fy * M.height;
  const near = TUNING.scent_latitudes.findIndex(
      (_, k) => Math.hypot(scentPoint(k).x - x, scentPoint(k).y - y) <= M.snap);
  if (near >= 0)
    return scentTuning(near);
  const dx = x - M.centre, dy = M.centre - y;
  const colatitude = 2 * Math.asin(Math.min(1, Math.hypot(dx, dy) / M.radius));
  const longitude = (Math.atan2(dx, dy) + turn) % turn;
  return {q1 : longitude / Math.PI - 1, q2 : Math.cos(colatitude)};
}
export const scentMapWidth = fx => trackShare(fx * SCENT_MAP.size, SCENT_MAP.track);
// The halo: the circle on the sphere `reach` radians around the preference, as a path; where it
// holds the far pole, the map's rim closes it from outside.
function haloPath(q1, q2, reach) {
  const M = SCENT_MAP, rim = 'M' + (M.centre - M.radius) + ' ' + M.centre + ' a' + M.radius + ' ' +
                             M.radius + ' 0 1 0 ' + 2 * M.radius + ' 0 a' + M.radius + ' ' +
                             M.radius + ' 0 1 0 ' + -2 * M.radius + ' 0Z';
  if (reach >= Math.PI)
    return rim;
  const h = clamp(q2, -1), r = Math.sqrt(1 - h * h), phi = Math.PI * (q1 + 1);
  const p = [ r * Math.cos(phi), r * Math.sin(phi), h ];
  // Two directions across the sphere at the preference.
  const east = r > 1e-9 ? [ -Math.sin(phi), Math.cos(phi), 0 ] : [ 0, 1, 0 ];
  const north = [
    p[1] * east[2] - p[2] * east[1], p[2] * east[0] - p[0] * east[2],
    p[0] * east[1] - p[1] * east[0]
  ];
  const points = Array.from({length : M.samples}, (_, k) => {
    const a = turn * k / M.samples, c = Math.cos(reach), s = Math.sin(reach);
    const v = p.map((pi, i) => c * pi + s * (Math.cos(a) * east[i] + Math.sin(a) * north[i]));
    const point = mapPoint(Math.acos(clamp(v[2], -1)), Math.atan2(v[1], v[0]) + turn);
    return fixed(point.x) + ' ' + fixed(point.y);
  });
  const ring = 'M' + points.join(' L') + 'Z';
  return Math.acos(-h) < reach ? rim + ring : ring;
}
// The scent a profile smells best, and its name: that scent's, numbered where two profiles of
// the organ share it.
export function profileNames(organ) {
  const best = organTypes(organ).map(type => preferredScent(type.centers[0]));
  return best.map((k, i) => best.indexOf(k) === best.lastIndexOf(k)
                                ? scentNames?.[k] ?? ''
                                : t('units.numbered', {
                                    name : scentNames?.[k] ?? '',
                                    n : best.slice(0, i + 1).filter(b => b === k).length
                                  }));
}
// A nose's profiles as chips with their best scent's sign, the chosen one marked; another can be
// added while there is room, the chosen one removed while there are others.
function profileChips(organ, chosen) {
  const names = profileNames(organ);
  return typeChips(organ, chosen, (type, i) => {
    const k = preferredScent(type.centers[0]);
    return {
      icon : '<svg viewBox="-14 -14 28 28">' +
                 ecologyIconSvg(scentIcons?.[k], scentColors?.[k] ?? '', SCENT_MAP.icon) + '</svg>',
      name : names[i]
    };
  }, {add : t('studio.inspector.addProfile'), remove : t('studio.inspector.removeProfile')});
}
// The map of a nose's chosen profile; the organ's other profiles show as fainter rings.
export function scentMap(organ, center) {
  const M = SCENT_MAP, at = scentMapPoint(center.q1, center.q2);
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  const others = organTypes(organ)
                     .filter(type => type.id !== chosen.id)
                     .map(type => {
                       const p = scentMapPoint(type.centers[0].q1, type.centers[0].q2);
                       return '<circle class="aid-scent-other" cx="' + fixed(p.x) + '" cy="' +
                              fixed(p.y) + '" r="' + M.ring + '"/>';
                     })
                     .join('');
  const affinity = scentAffinities(center.q1, center.q2, center.qwidth);
  const scents = TUNING.scent_latitudes
                     .map((_, k) => {
                       const p = scentPoint(k), colour = scentColors?.[k] ?? '';
                       return '<g class="aid-scent-source" transform="translate(' + fixed(p.x) +
                              ' ' + fixed(p.y) + ')" style="--scent:' + colour +
                              ';--smelled:' + fixed(affinity[k]) + '"><circle r="' + M.disc +
                              '"/>' + ecologyIconSvg(scentIcons?.[k], colour, M.icon) + '<title>' +
                              escapeText(joinParts([ scentNames?.[k], percent(affinity[k]) ])) +
                              '</title></g>';
                     })
                     .join('');
  const title = t('studio.inspector.scents');
  return '<div data-scent-block="' + escapeText(center.id) + '">' + profileChips(organ, chosen) +
         '<svg class="aid-scent-map" ' +
         'data-compass="' + escapeText(center.id) + '" viewBox="0 0 ' + M.size + ' ' + M.height +
         '" tabindex="0" role="img" aria-label="' + escapeText(title) +
         '"><circle class="aid-scent-rim" cx="' + M.centre + '" cy="' + M.centre + '" r="' +
         M.radius + '"/><path class="aid-scent-halo" fill-rule="evenodd" d="' +
         haloPath(center.q1, center.q2, radians(tuningHalfOffset(center.qwidth))) + '"/>' + others +
         '<circle class="aid-scent-selector" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) +
         '" r="' + M.ring + '"/>' + scents +
         widthTrack(M.track, M.track_y, center.qwidth, 'data-graphic-handle="width"',
                    t('studio.inspector.receptorWidth')) +
         '</svg></div>';
}
