import {ATELIER_LIMITS, TUNING} from '../../schema.js';
import {
  preferredScent,
  scentAffinities,
  scentTuning,
  tuningSigma,
  tuningWidth
} from '../../tuning.js';
import {scentColors, scentIcons, scentNames} from '../../brain_model.js';
import {ecologyIconSvg} from '../../feeding_view.js';
import {escapeText, fixed} from './markup.js';
import {groupReport, organTypes, typeOfCenter} from '../model/document.js';
import {adaptationMarks, cellMarks, senseSensitivity, sensitivityHandle} from './sense_marks.js';
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
  samples : 128,
  // The catching ring spans this share of the ring at the least and the most sensitive; the
  // cells sit just outside it, the adaptation arc just outside the map.
  least : .5,
  most : 1.5,
  cells : 5,
  arc : 8
});
const TURN_QUARTER = Math.PI / 2;
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
// The map holds the whole profile: which scents (the halo, its width at the handle), how faint a
// scent the cells notice (the catching ring round the chosen scent, wider the more sensitive), how
// many cells there are (dots on that ring) and how long a lasting scent takes until they no longer
// answer it (the fading arc round the map). `held` is a sensitivity dragged ahead of the design
// run.
// Barbels that only touch: the chin with its two barbels, the cells along one of them, the hairs
// at both tips as long as they are sensitive, and round the tip the adaptation arc.
const BARBEL_TOUCH = Object.freeze({
  width : 300,
  height : 160,
  chin : 'M0 0 H300 V22 Q150 58 0 22 Z',
  roots : [ [ 118, 40 ], [ 182, 40 ] ],
  bend : 26,
  tips : [ [ 92, 122 ], [ 208, 122 ] ],
  cells : [ .18, .92 ],
  hairs : 7,
  fan : 1.2,
  least : 6,
  most : 30,
  clock : 18
});
function barbelTouch(organ, center, state, held) {
  const B = BARBEL_TOUCH, sensitive = held ?? senseSensitivity(state, center) ?? 0;
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const curve = k => {
    const [rx, ry] = B.roots[k], [ tx, ty ] = B.tips[k], side = k ? 1 : -1;
    const control = {x : (rx + tx) / 2 - side * B.bend, y : (ry + ty) / 2};
    return {
      d : 'M' + rx + ' ' + ry + ' Q' + fixed(control.x) + ' ' + fixed(control.y) + ' ' + tx + ' ' +
              ty,
      at : u => ({
        x : (1 - u) * (1 - u) * rx + 2 * u * (1 - u) * control.x + u * u * tx,
        y : (1 - u) * (1 - u) * ry + 2 * u * (1 - u) * control.y + u * u * ty
      })
    };
  };
  const barbels = [ 0, 1 ].map(curve);
  const reach = B.least + (B.most - B.least) * sensitive;
  const hairs =
      B.tips
          .map(([ x, y ]) => Array
                                 .from({length : B.hairs},
                                       (_, k) => {
                                         const a = Math.PI / 2 + B.fan * (k / (B.hairs - 1) - .5);
                                         return 'M' + x + ' ' + y + ' l' +
                                                fixed(reach * Math.cos(a)) + ' ' +
                                                fixed(reach * Math.sin(a));
                                       })
                                 .join(' '))
          .join(' ');
  const places =
      Array.from({length : ATELIER_LIMITS.max_copies},
                 (_, k) => barbels[0].at(B.cells[0] + (B.cells[1] - B.cells[0]) * k /
                                                          (ATELIER_LIMITS.max_copies - 1)));
  const [tx, ty] = B.tips[1];
  return '<div data-scent-block="' + escapeText(center.id) + '"><svg class="aid-barbel-touch" ' +
         'data-sense-field="' + escapeText(center.id) + '" data-sense-redraw="refreshScentMaps" ' +
         'viewBox="0 0 ' + B.width + ' ' + B.height + '" role="img"><title>' +
         escapeText(t('studio.inspector.barbelFeel.touch')) +
         '</title><path class="aid-skin-fish" d="' + B.chin + '"/>' +
         barbels.map(b => '<path class="aid-barbel" d="' + b.d + '"/>').join('') +
         '<path class="aid-skin-hairs" d="' + hairs + '"/>' +
         (answer?.adapt?.steps > 0
              ? adaptationMarks({x : tx, y : ty}, B.clock, -Math.PI / 2, center)
              : '') +
         cellMarks(places, center) +
         sensitivityHandle({x : tx, y : ty + B.least}, {x : tx, y : ty + B.most}, sensitive,
                           t('studio.inspector.skin.touchHandle')) +
         '</svg></div>';
}
export function scentMap(organ, center, state = null, held = null) {
  if (organ.type === 'barbels' && center.field >= BARBEL_FEEL.touch && state)
    return barbelTouch(organ, center, state, held);
  const M = SCENT_MAP, at = scentMapPoint(center.q1, center.q2), wide = scentWidthHandle(center);
  const sensitive = held ?? (state ? senseSensitivity(state, center) : null);
  const answer = state ? groupReport(state.document, state.anatomy, 'senses', center.id) : null;
  const catching = M.ring * (M.least + (M.most - M.least) * (sensitive ?? 0));
  const ring = r => Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const a = TURN_QUARTER + turn * k / ATELIER_LIMITS.max_copies;
    return {x : at.x + r * Math.cos(a), y : at.y + r * Math.sin(a)};
  });
  const below = r => ({x : at.x, y : at.y - r});
  const marks =
      state ? (answer?.adapt?.steps > 0
                   ? adaptationMarks({x : M.centre, y : M.centre}, M.radius + M.arc,
                                     Math.atan2(at.y - M.centre, at.x - M.centre), center)
                   : '') +
                  cellMarks(ring(catching + M.cells), center) +
                  (sensitive === null
                       ? ''
                       : sensitivityHandle(below(M.ring * M.least), below(M.ring * M.most),
                                           sensitive, t('studio.inspector.scentSensitivity')))
            : '';
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
         '" r="' + fixed(state ? catching : M.ring) + '"/>' + scents + marks +
         '<circle class="aid-graphic-handle" data-graphic-handle="width" cx="' + fixed(wide.x) +
         '" cy="' + fixed(wide.y) + '" r="7"><title>' + t('studio.inspector.receptorWidth') +
         '</title></circle>' +
         '</svg></div>';
}
