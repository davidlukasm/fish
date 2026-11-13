// What sense cells report, as curves every sense picture can stack under its organ: the report
// over the stimulus, with the handle where they answer half, and for cells that get used to a
// lasting stimulus the report over time while it lasts. Each organ names its axes in its own words.
// Every cell has a threshold up to which it reports nothing (body_plan.cc, bounded_response and
// excess_response). An adapting cell raises its
// threshold by the running mean of what it felt (cppn_brain.cc, adapted_response), so a lasting
// stimulus fades to nothing; the mean's rate is one over the cell's adaptation time.
import {clamp} from '../../units.js';
import {adaptationSteps, LONGEST_ADAPTATION} from '../../tuning.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';
import {cellCount, fadeHandle, sensitivityHandle} from './sense_marks.js';
import {escapeText, fixed} from './markup.js';
import {formatNumber, percent} from '../../strings.js';

export const SENSE_PLOT = Object.freeze({
  width : 300,
  // Room on the left for the report's title and its scale beside the axis.
  left : 52,
  right : 284,
  title : 12,
  tick : 4,
  samples : 48,
  // The cell count's short track sits above the plot's left end, clear of its marks on the right.
  cells : [ 60, 116 ],
  count : 10,
  // A row: `top` and `base` bound its curve, its axis words sit at `words`, the next row
  // `step` lower.
  row : {top : 22, base : 64, words : 80},
  step : 90,
  bottom : 10,
  // The handle's words: how high under the curve they stand and the room they need.
  words : .3,
  room : 120,
  // The time row runs, on a log scale, from one step to the longest adaptation time; the handle
  // sits one adaptation time after the stimulus began.
  window : 1,
  settled : 1
});
const P = SENSE_PLOT;
export const senseX = share => P.left + (P.right - P.left) * share;
const rowAt = k => ({
  top : P.row.top + k * P.step,
  base : P.row.base + k * P.step,
  words : P.row.words + k * P.step
});
const y = (row, value) => row.base - (row.base - row.top) * clamp(value);
const curve = (row, value) =>
    '<path class="aid-sense-answer" d="M' +
    Array
        .from({length : P.samples + 1},
              (_, k) => fixed(senseX(k / P.samples)) + ' ' + fixed(y(row, value(k / P.samples))))
        .join(' L') +
    '"/>';
export const senseText = (px, py, content, anchor = 'start') =>
    '<text class="aid-handle-word" x="' + fixed(px) + '" y="' + fixed(py) + '" text-anchor="' +
    anchor + '">' + escapeText(content) + '</text>';
// The report runs from none to full; its scale stands beside the axis.
const axes = (row, words) =>
    '<path class="aid-sense-axis" d="M' + P.left + ' ' + row.top + ' V' + row.base + ' H' +
    P.right + '"/><text class="aid-handle-word" transform="translate(' + P.title + ' ' +
    fixed((row.top + row.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
    escapeText(words.report) + '</text>' +
    senseText(P.left - P.tick, row.top + P.tick, percent(1), 'end') +
    senseText(P.left - P.tick, row.base, percent(0), 'end') +
    senseText(P.left, row.words, words.from) + senseText(P.right, row.words, words.to, 'end');
// The handle sits on the axis where the cells begin to report: below it nothing, above it more
// and more. Its words stand under the curve, right of where the report reaches half at `halfAt`,
// or left of the handle, where the report is nothing, if there is no room on the right.
const thresholdHandle = (row, sensitive, words, halfAt) => {
  const at = senseX(1) + (senseX(0) - senseX(1)) * sensitive, level = y(row, P.words),
        right = halfAt + P.tick < P.right - P.room;
  return sensitivityHandle({x : senseX(1), y : row.base}, {x : senseX(0), y : row.base}, sensitive,
                           words.handle, 'sensitivity', '') +
         (words.half ? senseText(right ? halfAt + P.tick : at - P.tick, level, words.half,
                                 right ? 'start' : 'end')
                     : '');
};

// What a cell reports (body_plan.cc): of a stimulus without upper bound, with `mean` what it is
// used to, and of a stimulus between nothing and all. Up to the threshold it reports nothing.
export function excessAnswer(stimulus, threshold, mean = 0) {
  const excess = stimulus - threshold - mean;
  return excess > 0 ? excess / (excess + threshold + mean) : 0;
}
export function boundedAnswer(stimulus, threshold, mean = 0) {
  const excess = (clamp(stimulus) - mean - threshold) / (1 - threshold);
  return excess > 0 ? excess / (excess + threshold * (1 - excess)) : 0;
}
// The report over a bounded stimulus, from none to full: `sensitive` is one less the threshold.
export const boundedRow = (sensitive, words, marks = () => '') => row => {
  const h = clamp(1 - sensitive, .001, .999);
  return axes(row, words) + marks(row, senseX) + curve(row, x => boundedAnswer(x, h)) +
         thresholdHandle(row, sensitive, words, senseX(h + (1 - h) * h / (1 + h)));
};
// The report over a stimulus spanning many orders, from `dimmest` to one; `marks(row, xOf)` adds
// what the organ marks on that axis, `xOf` placing a stimulus.
export const intensityRow = (sensitive, dimmest, words, marks = () => '') => row => {
  const half = stimulusOfShare(1 - sensitive, dimmest);
  return axes(row, words) + marks(row, s => senseX(stimulusShare(s, dimmest))) +
         curve(row, share => { return excessAnswer(stimulusOfShare(share, dimmest), half); }) +
         thresholdHandle(row, sensitive, words, senseX(stimulusShare(2 * half, dimmest)));
};
// The report while a stimulus `held` lasts, for intensity cells whose half answer is `half`: it
// falls as their mean catches up, the handle one adaptation time after it began; `bounded` for
// a stimulus between nothing and all.
export const fadeRow = (center, held, half, words, bounded = false) => row => {
  const tau = adaptationSteps(center.tau), window = P.window * LONGEST_ADAPTATION;
  const at = step =>
      (bounded ? boundedAnswer : excessAnswer)(held, half, held * -Math.expm1(-step / tau));
  const used = P.settled * tau,
        mark = {x : senseX(Math.log(used) / Math.log(window)), y : y(row, at(used))};
  return axes(row, words) + curve(row, share => at(window ** share)) +
         fadeHandle(mark, senseX(0), P.right - P.left, window, P.settled, words.handle,
                    words.half(formatNumber(used, 0)));
};
// The picture: its name top right, the cells' count top left, the rows below one another.
// `redraw` names the refresh a drag calls when the picture sits outside a sense block.
export function sensePicture(center, label, rows, redraw = null) {
  const height = rows.length * P.step + P.bottom;
  return '<svg class="aid-effector-graphic aid-sense-curves" viewBox="0 0 ' + P.width + ' ' +
         height + '" data-sense-field="' + escapeText(center.id) + '"' +
         (redraw ? ' data-sense-redraw="' + redraw + '"' : '') + ' role="img" aria-label="' +
         escapeText(label) + '">' + senseText(P.right, P.count + P.tick, label, 'end') +
         rows.map((row, k) => row(rowAt(k))).join('') +
         cellCount({x : P.cells[0], y : P.count}, {x : P.cells[1], y : P.count}, center, 'right') +
         '</svg>';
}
