import {ATELIER_LIMITS, BARBEL, TUNING} from '../../schema.js';
import {
  LONGEST_TIME_CONSTANT,
  preferredScent,
  scentAffinities,
  scentTuning,
  tuningSigma,
  tuningWidth
} from '../../tuning.js';
import {scentColors, scentIcons, scentNames} from '../../brain_model.js';
import {ecologyIconSvg} from '../../feeding_view.js';
import {escapeText, fixed} from './markup.js';
import {organTypes, typeOfCenter} from '../model/document.js';
import {handleMark, senseSensitivity} from './sense_marks.js';
import {fadeRow, intensityRow, SENSE_PLOT, sensePicture} from './sense_curves.js';
import {stimulusOfShare} from './sensitivity.js';
import {clamp, radians} from '../../units.js';
import {joinParts, percent, t} from '../../strings.js';
import {typeChips} from './types.js';
import {BARBEL_FEEL} from '../model/organs.js';

export const SCENT_MAP = Object.freeze({
  size : 240,
  height : 240,
  centre : 120,
  radius : 104,
  disc : 10,
  icon : .62,
  ring : 14,
  snap : 13,
  samples : 128
});
const turn = 2 * Math.PI;
const mapPoint = (colatitude, longitude) => {
  const r = SCENT_MAP.radius * Math.sin(colatitude / 2);
  return {
    x : SCENT_MAP.centre + r * Math.sin(longitude),
    y : SCENT_MAP.centre - r * Math.cos(longitude)
  };
};
export const scentMapPoint = (q1, q2) => mapPoint(Math.acos(clamp(q2, -1)), Math.PI * (q1 + 1));
const scentPoint = k => scentMapPoint(scentTuning(k).q1, scentTuning(k).q2);
export function scentMapTuning(fx, fy) {
  const M = SCENT_MAP, x = fx * M.size, y = fy * M.height;
  const near = TUNING.scent_latitudes.findIndex(
      (_, k) => Math.hypot(scentPoint(k).x - x, scentPoint(k).y - y) <= M.snap);
  if (near >= 0)
    return scentTuning(near);
  return scentMapAt(fx, fy);
}
function scentMapAt(fx, fy) {
  const M = SCENT_MAP, dx = fx * M.size - M.centre, dy = M.centre - fy * M.height;
  const colatitude = 2 * Math.asin(Math.min(1, Math.hypot(dx, dy) / M.radius));
  const longitude = (Math.atan2(dx, dy) + turn) % turn;
  return {q1 : longitude / Math.PI - 1, q2 : Math.cos(colatitude)};
}
const scentVector = center => {
  const z = clamp(center.q2, -1), r = Math.sqrt(1 - z * z), phi = Math.PI * (center.q1 + 1);
  return [ r * Math.cos(phi), r * Math.sin(phi), z ];
};
export function scentWidthHandle(center) {
  const p = scentVector(center), phi = Math.PI * (center.q1 + 1),
        angle = radians(tuningSigma(center.qwidth));
  const east = [ -Math.sin(phi), Math.cos(phi), 0 ];
  const v = p.map((x, i) => x * Math.cos(angle) + east[i] * Math.sin(angle));
  return mapPoint(Math.acos(clamp(v[2], -1)), Math.atan2(v[1], v[0]) + turn);
}
export function scentMapWidth(center, fx, fy) {
  const a = scentVector(center), b = scentVector(scentMapAt(fx, fy));
  const cosine = a.reduce((n, x, i) => n + x * b[i], 0);
  return tuningWidth(Math.acos(clamp(cosine, -1)) * 180 / Math.PI);
}
const POLE = 1e-9;
function haloPath(q1, q2, reach) {
  const M = SCENT_MAP, rim = 'M' + (M.centre - M.radius) + ' ' + M.centre + ' a' + M.radius + ' ' +
                             M.radius + ' 0 1 0 ' + 2 * M.radius + ' 0 a' + M.radius + ' ' +
                             M.radius + ' 0 1 0 ' + -2 * M.radius + ' 0Z';
  if (reach >= Math.PI)
    return rim;
  const h = clamp(q2, -1), r = Math.sqrt(1 - h * h), phi = Math.PI * (q1 + 1);
  const p = [ r * Math.cos(phi), r * Math.sin(phi), h ];
  const east = r > POLE ? [ -Math.sin(phi), Math.cos(phi), 0 ] : [ 0, 1, 0 ];
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
export function profileNames(organ) {
  const best = organTypes(organ).map(type => preferredScent(type.centers[0]));
  return best.map((k, i) => best.indexOf(k) === best.lastIndexOf(k)
                                ? scentNames?.[k] ?? ''
                                : t('units.numbered', {
                                    name : scentNames?.[k] ?? '',
                                    n : best.slice(0, i + 1).filter(b => b === k).length
                                  }));
}
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
// The barbels: the chin with its two barbels as long as their cells make them (body_plan.cc,
// barbel_tip: a radius times length + length_per_size · √cells / (√cells + organ_half)); the
// handle at a tip sets the cells. What a barbel reports, taste or touch at its tip, is chosen
// above; its threshold and time change next to nothing there (a tip touches or not), so they get
// no handle.
const BARBELS = Object.freeze({
  width : 300,
  height : 150,
  chin : 'M0 0 H300 V22 Q150 58 0 22 Z',
  roots : [ [ 118, 40 ], [ 182, 40 ] ],
  bend : 26,
  // One body radius in the picture, from the chin down.
  radius : 180,
  hairs : 7,
  fan : 1.2,
  hair : 14
});
const barbelLength = cells => {
  const grown = Math.sqrt(Math.max(0, cells));
  return BARBEL.length + BARBEL.length_per_size * grown / (grown + BARBEL.organ_half);
};
function barbelPicture(organ, center) {
  const B = BARBELS, touch = center.field >= BARBEL_FEEL.touch;
  const tipAt = (k, cells) => {
    const [rx, ry] = B.roots[k], side = k ? 1 : -1, reach = B.radius * barbelLength(cells);
    return {
      x : rx + side * reach * Math.sin(BARBEL.spread),
      y : ry + reach * Math.cos(BARBEL.spread)
    };
  };
  const barbel = k => {
    const [rx, ry] = B.roots[k], tip = tipAt(k, center.copies), side = k ? 1 : -1;
    const control = {x : (rx + tip.x) / 2 - side * B.bend, y : (ry + tip.y) / 2};
    return '<path class="aid-barbel" d="M' + rx + ' ' + ry + ' Q' + fixed(control.x) + ' ' +
           fixed(control.y) + ' ' + fixed(tip.x) + ' ' + fixed(tip.y) + '"/>';
  };
  const hairs = [ 0, 1 ]
                    .map(k => {
                      const tip = tipAt(k, center.copies);
                      return Array
                          .from({length : B.hairs},
                                (_, h) => {
                                  const a = Math.PI / 2 + B.fan * (h / (B.hairs - 1) - .5);
                                  return 'M' + fixed(tip.x) + ' ' + fixed(tip.y) + ' l' +
                                         fixed(B.hair * Math.cos(a)) + ' ' +
                                         fixed(B.hair * Math.sin(a));
                                })
                          .join(' ');
                    })
                    .join(' ');
  const places = Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => tipAt(1, k + 1));
  const tip = places[center.copies - 1];
  return '<svg class="aid-effector-graphic aid-barbel-touch" data-sense-field="' +
         escapeText(center.id) + '" data-sense-redraw="refreshScentMaps" viewBox="0 0 ' + B.width +
         ' ' + B.height + '" role="img" aria-label="' + escapeText(t('studio.barbels.title')) +
         '"><path class="aid-skin-fish" d="' + B.chin + '"/>' + barbel(0) + barbel(1) +
         (touch ? '<path class="aid-skin-hairs" d="' + hairs + '"/>' : '') +
         handleMark('cells', tip, t('studio.barbels.handle'),
                    'data-places="' + places.map(p => fixed(p.x) + ',' + fixed(p.y)).join(' ') +
                        '"',
                    t('studio.barbels.length',
                      {n : center.copies, p : percent(barbelLength(center.copies) / 2)}),
                    'below') +
         '</svg>';
}
// What the nose's cells report: over the scent's strength, half at their threshold, and while they
// stay in the same scent, how they get used to it (sense_curves.js).
// The steady scent of the time row, as many times the cells' half answer: they start at four
// fifths and settle near four ninths.
const NOSE_HELD = 4;
function noseCurves(state, center, held) {
  const dimmest = state.anatomy?.lightDimmest, sensitive = held ?? senseSensitivity(state, center);
  if (!(dimmest > 0) || sensitive === null)
    return '';
  const half = stimulusOfShare(1 - sensitive, dimmest);
  const words = (key, values) => t('studio.noseSense.' + key, values);
  return sensePicture(center, words('title'),
                      [
                        intensityRow(sensitive, dimmest, {
                          report : words('report'),
                          from : words('faint'),
                          to : words('strong'),
                          handle : words('handle')
                        }),
                        fadeRow(center, NOSE_HELD * half, half, {
                          report : words('report'),
                          from : words('stays'),
                          to : words('later', {n : SENSE_PLOT.window * LONGEST_TIME_CONSTANT}),
                          half : n => words('fade', {n}),
                          handle : words('fadeHandle')
                        })
                      ],
                      'refreshScentMaps');
}
// The scents a cell answers, on the map of all eight; below, for the nose what its cells report,
// for barbels how long they grow. Barbels that only touch need no map. `held` is a sensitivity
// dragged ahead of the design run.
export function scentMap(organ, center, state = null, held = null) {
  const barbels = organ.type === 'barbels';
  const below = !state    ? ''
                : barbels ? barbelPicture(organ, center)
                          : noseCurves(state, center, held);
  if (barbels && center.field >= BARBEL_FEEL.touch)
    return '<div data-scent-block="' + escapeText(center.id) + '">' + below + '</div>';
  const M = SCENT_MAP, at = scentMapPoint(center.q1, center.q2), wide = scentWidthHandle(center);
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
         'data-compass="' + escapeText(center.id) + '" data-sense-field="' + escapeText(center.id) +
         '" data-sense-redraw="refreshScentMaps" viewBox="0 0 ' + M.size + ' ' + M.height +
         '" tabindex="0" role="img" aria-label="' + escapeText(title) +
         '"><circle class="aid-scent-rim" cx="' + M.centre + '" cy="' + M.centre + '" r="' +
         M.radius + '"/><path class="aid-scent-halo" fill-rule="evenodd" d="' +
         haloPath(center.q1, center.q2, radians(tuningSigma(center.qwidth))) + '"/>' + others +
         '<circle class="aid-scent-selector" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) +
         '" r="' + M.ring + '"/>' + scents +
         '<circle class="aid-graphic-handle" data-graphic-handle="width" cx="' + fixed(wide.x) +
         '" cy="' + fixed(wide.y) + '" r="7"><title>' + t('studio.inspector.receptorWidth') +
         '</title></circle>' +
         '</svg>' + below + '</div>';
}
