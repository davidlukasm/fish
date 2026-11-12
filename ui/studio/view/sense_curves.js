// What sense cells report, as curves every sense picture can stack under its organ: the report
// over the stimulus, with the handle where they answer half, and for cells that get used to a
// lasting stimulus the report over time while it lasts. Each organ names its axes in its own words.
// Bounded senses answer x(1 − h) / (x(1 − h) + (1 − x) h), half at their threshold h (body_plan.cc,
// bounded_response); intensity senses answer s / (s + h) on a log scale of the stimulus
// (sensory_response); an adapting cell adds the running mean of what it felt to h
// (cppn_brain.cc, adapted_response), its rate one over its time constant.
import {clamp} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantSteps} from '../../tuning.js';
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
  // The time row runs over three times the longest cell time; cells count as used to a stimulus
  // after three of their time constants, when less than a twentieth of the change is left.
  window : 3,
  settled : 3
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
// The handle sits where the report reaches half, on a dashed line marked with that half; the
// report starts well before it and grows on past it.
const halfHandle = (row, sensitive, words) => {
  const at = senseX(1) + (senseX(0) - senseX(1)) * sensitive;
  return '<path class="aid-gland-phase" d="M' + P.left + ' ' + fixed(y(row, .5)) + ' H' +
         fixed(at) + '"/>' + senseText(P.left - P.tick, y(row, .5) + P.tick, percent(.5), 'end') +
         sensitivityHandle({x : senseX(1), y : y(row, .5)}, {x : senseX(0), y : y(row, .5)},
                           sensitive, words.handle, 'sensitivity', words.half ?? '', 'right');
};

// The report over a bounded stimulus, from none to full: `sensitive` is one less the threshold.
export const boundedRow = (sensitive, words) => row => {
  const h = clamp(1 - sensitive, .001, .999);
  return axes(row, words) + curve(row, x => x * (1 - h) / (x * (1 - h) + (1 - x) * h)) +
         halfHandle(row, sensitive, words);
};
// The report over a stimulus spanning many orders, from `dimmest` to one; `marks(row, xOf)` adds
// what the organ marks on that axis, `xOf` placing a stimulus.
export const intensityRow = (sensitive, dimmest, words, marks = () => '') => row => {
  const half = stimulusOfShare(1 - sensitive, dimmest);
  return axes(row, words) + marks(row, s => senseX(stimulusShare(s, dimmest))) +
         curve(row, share => {
           const s = stimulusOfShare(share, dimmest);
           return s / (s + half);
         }) + halfHandle(row, sensitive, words);
};
// The report while a stimulus `held` lasts, for intensity cells whose half answer is `half`: it
// falls as their mean catches up, the handle where they are used to it. Only intensity senses get
// used to what they feel (brain_interface.hh).
export const fadeRow = (center, held, half, words) => row => {
  const tau = timeConstantSteps(center.tau), window = P.window * LONGEST_TIME_CONSTANT;
  const at = step => held / (held + half + held * -Math.expm1(-step / tau));
  const used = P.settled * tau, mark = {x : senseX(used / window), y : y(row, at(used))};
  return axes(row, words) + curve(row, share => at(share * window)) +
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
