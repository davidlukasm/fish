// Marks every organ's picture shares: its cells, how weak a stimulus they feel or how little input
// opens them, and how long they take to get used to a lasting stimulus. Each is set by dragging its
// handle in the picture; the handle carries the geometry it is dragged along, so one pointer serves
// every organ.
import {ATELIER_LIMITS} from '../../schema.js';
import {clamp} from '../../units.js';
import {
  activationLevel,
  activationQuality,
  planOfUnit,
  thresholdQualityShift,
  timeConstantSteps,
  unitOfPlan
} from '../../tuning.js';
import {groupReport} from '../model/document.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';

export const SENSE_MARK = Object.freeze({
  cell : 3.4,
  handle : 7,
  // The adaptation arc leaves a gap, so its two ends never meet.
  sweep : 1.7 * Math.PI,
  segments : 28,
  fade : .12
});
const TURN = 2 * Math.PI;
const point = p => fixed(p.x) + ',' + fixed(p.y);
const parsePoint = text => {
  const [x, y] = text.split(',').map(Number);
  return {x, y};
};
const handleMark = (name, at, title, geometry) =>
    '<circle class="aid-graphic-handle" data-sense-mark="' + name + '" ' + geometry + ' cx="' +
    fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' + SENSE_MARK.handle + '"><title>' +
    escapeText(title) + '</title></circle>';

// How readily the cells answer, 0 to 1: from the design run's answer, else from the threshold.
export function senseSensitivity(state, center) {
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const dimmest = answer?.intensity ? state.anatomy?.lightDimmest : null;
  if (answer?.half > 0 && (!answer.intensity || dimmest > 0))
    return 1 - stimulusShare(answer.half, dimmest);
  return answer?.intensity ? null : 1 - activationLevel(unitOfPlan(center.threshold));
}
// What a drag starts from: the design run's answer cannot follow the drag, so the threshold moves
// by as much as the handle moves from where it was.
export function senseStart(state, center) {
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  return {intensity : answer?.intensity, half : answer?.half, threshold : center.threshold};
}
export function sensitivityPatch(state, start, sensitive) {
  if (!start?.intensity) {
    const from = start?.half > 0 ? 1 - stimulusShare(start.half, null) : null;
    return {
      threshold : planOfUnit(from === null
                                 ? activationQuality(1 - sensitive)
                                 : unitOfPlan(start.threshold) + activationQuality(1 - sensitive) -
                                       activationQuality(1 - from))
    };
  }
  const dimmest = state.anatomy?.lightDimmest;
  if (!(dimmest > 0) || !(start.half > 0))
    return null;
  const shift = stimulusOfShare(1 - sensitive, dimmest) / start.half;
  return {threshold : planOfUnit(unitOfPlan(start.threshold) + thresholdQualityShift(shift))};
}

// The cells as dots on the places they sit, one per cell; the last carries the handle that adds
// or removes cells along the row.
export function cellMarks(places, center) {
  const copies = Math.min(center.copies, places.length);
  const dots = places.slice(0, copies)
                   .map(p => '<circle class="aid-sense-cell" cx="' + fixed(p.x) + '" cy="' +
                             fixed(p.y) + '" r="' + SENSE_MARK.cell + '"/>')
                   .join('');
  const free = places.slice(copies)
                   .map(p => '<circle class="aid-sense-free" cx="' + fixed(p.x) + '" cy="' +
                             fixed(p.y) + '" r="' + SENSE_MARK.cell / 2 + '"/>')
                   .join('');
  return free + dots +
         handleMark('cells', places[copies - 1],
                    t('studio.sense.cellsHandle', {n : copies, most : places.length}),
                    'data-places="' + places.map(point).join(' ') + '"');
}
export const cellPlaces = (from, to, count = ATELIER_LIMITS.max_copies) =>
    Array.from({length : count}, (_, k) => ({
                                   x : from.x + (to.x - from.x) * k / (count - 1),
                                   y : from.y + (to.y - from.y) * k / (count - 1)
                                 }));

// Sensitivity as a reach: from `least` (feels only the strongest stimulus) to `most` (the weakest).
export const reachPoint = (least, most, sensitive) =>
    ({x : least.x + (most.x - least.x) * sensitive, y : least.y + (most.y - least.y) * sensitive});
export const sensitivityHandle = (least, most, sensitive, title, name = 'sensitivity') =>
    handleMark(name, reachPoint(least, most, sensitive), title,
               'data-least="' + point(least) + '" data-most="' + point(most) + '"');
// How little input opens a working organ, 0 to 1: the share of the input range its gate leaves.
export const motorReadiness = (state, center) =>
    1 - clamp((state.capabilities?.biasScale ?? 0) * center.threshold);
// The gate's handle names its cells, so a picture can hold the gates of several kinds of cells.
export const gateHandle = (least, most, state, center, title) =>
    handleMark('gate', reachPoint(least, most, motorReadiness(state, center)), title,
               'data-least="' + point(least) + '" data-most="' + point(most) +
                   '" data-sense-center="' + escapeText(center.id) + '"');

// Adaptation as an arc round the picture: it starts where the stimulus comes from and fades along
// the time the cells take to get used to it, longer the slower they adapt.
export function adaptationMarks(centre, radius, start, center) {
  const S = SENSE_MARK, share = clamp(center.tau ?? 0), sweep = S.sweep * share;
  const at = angle =>
      ({x : centre.x + radius * Math.cos(angle), y : centre.y + radius * Math.sin(angle)});
  let arc = '';
  for (let k = 0; k < S.segments; ++k) {
    const a = start + sweep * k / S.segments, b = start + sweep * (k + 1) / S.segments;
    arc += '<path class="aid-sense-adapt" stroke-opacity="' +
           fixed(1 - (1 - S.fade) * k / S.segments) + '" d="M' + point(at(a)) + ' A' +
           fixed(radius) + ' ' + fixed(radius) + ' 0 0 1 ' + point(at(b)) + '"/>';
  }
  const steps = Math.round(timeConstantSteps(share));
  return arc +
         handleMark('adaptation', at(start + sweep), t('studio.sense.adaptHandle', {n : steps}),
                    'data-arc="' + point(centre) + ',' + fixed(radius) + ',' + fixed(start) + '"');
}

// The change a handle makes, from the pointer in the picture's own units.
export function senseMarkPatch(state, drag, p) {
  const h = drag.marks;
  if (drag.handle === 'cells' || drag.handle === 'nodes') {
    const places = h.places.split(' ').map(parsePoint);
    let best = 0;
    places.forEach((q, k) => {
      if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(places[best].x - p.x, places[best].y - p.y))
        best = k;
    });
    return drag.handle === 'cells' ? {copies : best + 1} : {nodes : best + 1};
  }
  if (drag.handle === 'sensitivity' || drag.handle === 'gate') {
    const least = parsePoint(h.least), most = parsePoint(h.most);
    const dx = most.x - least.x, dy = most.y - least.y;
    const share = clamp(((p.x - least.x) * dx + (p.y - least.y) * dy) / (dx * dx + dy * dy || 1));
    drag.sensitive = share;
    if (drag.handle === 'sensitivity')
      return sensitivityPatch(state, drag.start, share);
    const scale = state.capabilities?.biasScale;
    return scale > 0 ? {threshold : clamp((1 - share) / scale, -1)} : null;
  }
  if (drag.handle === 'adaptation') {
    const [cx, cy, , start] = h.arc.split(',').map(Number);
    const turned = ((Math.atan2(p.y - cy, p.x - cx) - start) % TURN + TURN) % TURN;
    // In the gap past the arc's end the nearer end wins.
    const share = turned <= SENSE_MARK.sweep ? turned / SENSE_MARK.sweep
                  : turned - SENSE_MARK.sweep < (TURN - SENSE_MARK.sweep) / 2 ? 1
                                                                              : 0;
    return {tau : share};
  }
  return null;
}
