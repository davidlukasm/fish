import {clamp} from '../../units.js';
import {BODY_FRAME, halfWidth, sitePoint} from './layout.js';
import {musclePlaces} from './organs.js';
import {MOTOR_KIND} from '../../schema.js';

const MUSCLE_AREAS = Object.freeze([
  {code : MOTOR_KIND.aggression, pelvic : false, inner : .1, outer : .6},
  {code : MOTOR_KIND.suction, pelvic : false, inner : 0, outer : .35},
  {code : MOTOR_KIND.turn, pelvic : false, inner : .82, outer : 1.04},
  {code : MOTOR_KIND.turn, pelvic : true, inner : .82, outer : 1.04},
  {code : MOTOR_KIND.forward, pelvic : false, inner : .6, outer : .94}
]);
export const muscleAreas = sites =>
    MUSCLE_AREAS
        .map(area => {
          const xs =
              musclePlaces(sites, area.code, 1, area.pelvic).map(s => sitePoint(s, 'muscle').x);
          if (area.code === MOTOR_KIND.turn)
            return {...area, from : area.pelvic ? 665 : 435, to : area.pelvic ? 750 : 500};
          return {...area, from : Math.min(...xs), to : Math.max(...xs)};
        })
        .filter(area => Number.isFinite(area.from));
export function musclePosition(sites, position, code = null, pelvic = false) {
  const areas =
      muscleAreas(sites).filter(a => code === null || a.code === code && a.pelvic === pelvic);
  return areas.map(area => ({area, position : areaPosition(area, position)}))
             .sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) -
                             Math.hypot(b.position.x - position.x, b.position.y - position.y))[0] ??
         null;
}
export function nativeMusclePosition(sites, position, code, pelvic) {
  if (code !== MOTOR_KIND.turn)
    return position;
  const area = muscleAreas(sites).find(a => a.code === code && a.pelvic === pelvic);
  const xs = musclePlaces(sites, code, 1, pelvic).map(s => sitePoint(s, 'muscle').x);
  const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) *
                                  clamp((position.x - area.from) / (area.to - area.from));
  return {
    x,
    y : BODY_FRAME.middle + (position.y - BODY_FRAME.middle) * halfWidth(x) / halfWidth(position.x)
  };
}

export const BRAIN = Object.freeze({
  cerebrum : {from : 205, to : 454, half : 73, front : .9, full : .35, lobes : 4, bulge : .1},
  cerebellum : {x : 465, rx : 25, ry : 35, folia : 7, bow : .25},
  stem : {from : 475, to : 535, half : 18},
  cord : {from : 490, to : 898, half : [ 22, 6 ], end : 7, segments : 14},
  edge : 1.5
});
export function brainHalfWidth(x, C = BRAIN.cerebrum) {
  const u = clamp((x - C.from) / (C.to - C.from));
  return C.half * Math.sin(Math.PI * u) ** C.full * (C.front + (1 - C.front) * u);
}
export function nerveHalfWidth(x) {
  const C = BRAIN.cord, E = BRAIN.cerebellum;
  if (x < BRAIN.cerebrum.to)
    return brainHalfWidth(x);
  if (x < C.from)
    return Math.max(BRAIN.stem.half, E.ry * Math.sqrt(Math.max(0, 1 - ((x - E.x) / E.rx) ** 2)));
  return C.half[0] + (C.half[1] - C.half[0]) * clamp((x - C.from) / (C.to - C.from));
}
const NEURAL =
    new Set([ 'brain', 'tectum', 'olfaction', 'value', 'state', 'choice', 'motor', 'spine' ]);
export const neuralOrgan = type => NEURAL.has(type);
const SURFACE = new Set([ 'touch', 'pain', 'lateral', 'pigment', 'defense', 'barbels' ]);
export const surfaceOrgan = type => SURFACE.has(type);
// These are continuous anatomical areas. Native sites are chosen separately, inside them.
export function placementArea(type) {
  if (type === 'muscle')
    return {from : 130, to : 895, inner : 0, outer : 1.08};
  if (neuralOrgan(type))
    return {from : BRAIN.cerebrum.from + 8, to : BRAIN.cord.to, neural : true};
  if (type === 'eye' || type === 'proximity')
    return {from : 230, to : 420, inner : .58, outer : .96};
  if (type === 'nose' || type === 'barbels')
    return {from : 145, to : 258, inner : .6, outer : .96};
  if (type === 'balance')
    return {from : 345, to : 430, inner : .72, outer : .9};
  if (type === 'eggs' || type === 'sperm')
    return {from : 550, to : 780, inner : .25, outer : .65};
  if (type === 'gut' || type === 'gutmuscle')
    return {from : 475, to : 740, inner : .28, outer : .6};
  if (SURFACE.has(type))
    return {
      from : 160,
      to : 880,
      inner : type === 'pain' ? .82 : .96,
      outer : type === 'pain'      ? .94
              : type === 'lateral' ? 1.12
                                   : 1.04
    };
  return {from : 475, to : 810, inner : .3, outer : .82};
}
export function anatomicalPosition(type, position, mode = 'single') {
  return areaPosition(placementArea(type), position, mode);
}
export function areaPosition(area, position, mode = 'single') {
  const x = clamp(position.x, area.from, area.to), M = BODY_FRAME.middle;
  if (area.neural) {
    const half = Math.max(2, nerveHalfWidth(x) - 7);
    return {x, y : mode === 'middle' ? M : clamp(position.y, M - half, M + half)};
  }
  const side = position.y < M ? -1 : 1, half = halfWidth(x);
  return {x, y : M + side * clamp(Math.abs(position.y - M), half * area.inner, half * area.outer)};
}
export function withinAnatomy(type, p, tolerance = 1) {
  const q = anatomicalPosition(type, p);
  return Math.hypot(p.x - q.x, p.y - q.y) <= tolerance;
}
