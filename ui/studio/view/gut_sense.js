// What the gut's sense cells tell the brain, in a picture for each kind below the gut.
// Fullness: the stretch cells report the gut's fill on a bounded curve, half at their threshold
// (body_plan.cc, bounded_response); they do not get used to it.
// Food: the food cells report the nutrients the gut delivers, as a share of that flow against the
// resting cost (physiology.hh, nutrient_signal): half where it reaches their threshold (sensory
// response, body_plan.cc). They get used to a lasting flow (cppn_brain.cc, adapted_response): while
// the fish keeps eating as much as it rests on, their report falls towards half of what it was,
// halfway there after their time constant times ln 2.
import {clamp} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantSteps} from '../../tuning.js';
import {groupReport} from '../model/document.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';
import {cellCount, fadeHandle, senseSensitivity, sensitivityHandle} from './sense_marks.js';
import {escapeText, fixed} from './markup.js';
import {formatNumber, percent, t} from '../../strings.js';

const word = (key, values) => t('studio.gutSense.' + key, values);
const PLOT = Object.freeze({
  width : 300,
  left : 40,
  right : 284,
  title : 12,
  tick : 4,
  samples : 48,
  // The cell count's short track sits above the plot's left end, clear of its marks on the right.
  cells : [ 48, 104 ],
  count : 10
});
// One curve with its axis: `top` and `base` bound it, `words` holds the axis words below.
const FULL = Object.freeze({height : 92, top : 22, base : 64, words : 80});
const FOOD = Object.freeze({
  height : 190,
  rows : [ {top : 22, base : 64, words : 80}, {top : 112, base : 154, words : 170} ],
  // A meal as large as the resting cost: the nutrient signal then stands at one half.
  rest : .5
});
const x = share => PLOT.left + (PLOT.right - PLOT.left) * share;
const curve = (row, value) =>
    'M' + Array
              .from({length : PLOT.samples + 1},
                    (_, k) => {
                      const share = k / PLOT.samples;
                      return fixed(x(share)) + ' ' +
                             fixed(row.base - (row.base - row.top) * clamp(value(share)));
                    })
              .join(' L');
const text = (px, py, content, anchor = 'start') =>
    '<text class="aid-handle-word" x="' + fixed(px) + '" y="' + fixed(py) + '" text-anchor="' +
    anchor + '">' + escapeText(content) + '</text>';
const axes = (row, title, from, to) =>
    '<path class="aid-sense-axis" d="M' + PLOT.left + ' ' + row.top + ' V' + row.base + ' H' +
    PLOT.right + '"/><text class="aid-handle-word" transform="translate(' + PLOT.title + ' ' +
    fixed((row.top + row.base) / 2) + ') rotate(-90)" text-anchor="middle">' + escapeText(title) +
    '</text>' + text(PLOT.left, row.words, from) + text(PLOT.right, row.words, to, 'end');
const picture = (center, height, label, body) =>
    '<svg class="aid-effector-graphic aid-gut-sense" viewBox="0 0 ' + PLOT.width + ' ' + height +
    '" data-sense-field="' + escapeText(center.id) + '" data-sense-redraw="refreshEffectors" ' +
    'role="img" aria-label="' + escapeText(label) + '">' +
    text(PLOT.right, PLOT.count + PLOT.tick, label, 'end') + body +
    cellCount({x : PLOT.cells[0], y : PLOT.count}, {x : PLOT.cells[1], y : PLOT.count}, center,
              'right') +
    '</svg>';

function fullnessPicture(state, center, held) {
  const R = FULL, sensitive = held ?? senseSensitivity(state, center) ?? 0, half = 1 - sensitive;
  const y = value => R.base - (R.base - R.top) * value;
  const bounded = share => {
    const h = clamp(half, .001, .999);
    return share * (1 - h) / (share * (1 - h) + (1 - share) * h);
  };
  return picture(center, R.height, word('fullness'),
                 axes(R, word('report'), word('empty'), word('full')) +
                     '<path class="aid-sense-answer" d="' + curve(R, bounded) + '"/>' +
                     sensitivityHandle({x : x(1), y : y(.5)}, {x : x(0), y : y(.5)}, sensitive,
                                       word('fullnessHandle'), 'sensitivity',
                                       word('fullnessHalf', {p : percent(half)}), 'right'));
}
function foodPicture(state, center, held) {
  const R = FOOD, [ above, below ] = R.rows, dimmest = state.anatomy?.lightDimmest;
  const sensitive = held ?? senseSensitivity(state, center);
  if (!(dimmest > 0) || sensitive === null)
    return '';
  const half = stimulusOfShare(1 - sensitive, dimmest);
  const y = (row, value) => row.base - (row.base - row.top) * value;
  const answer = s => s / (s + half);
  // The flow as a share of the resting cost, from the nutrient signal: s / (1 − s).
  const ofRest = s => s / (1 - s);
  const tau = timeConstantSteps(center.tau), window = 2 * LONGEST_TIME_CONSTANT;
  const used = step => {
    const s = R.rest, mean = s * -Math.expm1(-step / tau);
    return s / (s + half + mean);
  };
  const halfway = {x : x(tau * Math.LN2 / window), y : y(below, used(tau * Math.LN2))};
  const restAt = x(stimulusShare(R.rest, dimmest));
  return picture(
      center, R.height, word('food'),
      axes(above, word('report'), word('little'), word('much')) +
          '<path class="aid-gland-phase" d="M' + fixed(restAt) + ' ' + above.top + ' V' +
          above.base + '"/>' +
          text(restAt - PLOT.tick, above.base - PLOT.tick, word('rest'), 'end') +
          '<path class="aid-sense-answer" d="' +
          curve(above, share => answer(stimulusOfShare(share, dimmest))) + '"/>' +
          sensitivityHandle({x : x(1), y : y(above, .5)}, {x : x(0), y : y(above, .5)}, sensitive,
                            word('foodHandle'), 'sensitivity',
                            word('foodHalf', {p : percent(ofRest(half), half < .01 ? 1 : 0)}),
                            'right') +
          axes(below, word('report'), word('eats'), word('later', {n : window})) +
          '<path class="aid-sense-answer" d="' + curve(below, share => used(share * window)) +
          '"/>' +
          fadeHandle(halfway, x(0), PLOT.right - PLOT.left, window, word('fadeHandle'),
                     word('fade', {n : formatNumber(tau * Math.LN2, 0)}), 'right'));
}
// `held` is the sensitivity a drag of one of these cells holds, with that cell's id.
export function gutSensePictures(state, organ, held = null) {
  const own = key => organ.centers.find(c => c.key === key);
  const food = own('food'), fullness = own('fullness');
  const heldFor = center => held?.id === center.id ? held.sensitive : null;
  return (fullness ? fullnessPicture(state, fullness, heldFor(fullness)) : '') +
         (food && groupReport(state.document, state.anatomy, 'senses', food.id)
              ? foodPicture(state, food, heldFor(food))
              : '');
}
