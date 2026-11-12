// What the gut's sense cells tell the brain, in a picture for each kind below the gut.
// Fullness: the stretch cells report the gut's fill, half at their threshold; they do not get used
// to it.
// Food: the food cells report the nutrients the gut delivers, as a share of that flow against the
// resting cost (physiology.hh, nutrient_signal: flow / (flow + resting cost), so one half where the
// flow covers the resting cost). They get used to a lasting flow: the time row shows the fish
// eating as much as it rests on.
import {groupReport} from '../model/document.js';
import {stimulusOfShare} from './sensitivity.js';
import {senseSensitivity} from './sense_marks.js';
import {
  boundedRow,
  fadeRow,
  intensityRow,
  SENSE_PLOT,
  sensePicture,
  senseText
} from './sense_curves.js';
import {fixed} from './markup.js';
import {LONGEST_TIME_CONSTANT} from '../../tuning.js';
import {percent, t} from '../../strings.js';

const word = (key, values) => t('studio.gutSense.' + key, values);
// The nutrient signal where the gut's flow covers the resting cost.
const REST = .5;

function fullnessPicture(state, center, held) {
  const sensitive = held ?? senseSensitivity(state, center) ?? 0;
  return sensePicture(center, word('fullness'), [ boundedRow(sensitive, {
                        report : word('report'),
                        from : word('empty'),
                        to : word('full'),
                        half : word('fullnessHalf', {p : percent(1 - sensitive)}),
                        handle : word('fullnessHandle')
                      }) ],
                      'refreshEffectors');
}
function foodPicture(state, center, held) {
  const dimmest = state.anatomy?.lightDimmest, sensitive = held ?? senseSensitivity(state, center);
  if (!(dimmest > 0) || sensitive === null)
    return '';
  const half = stimulusOfShare(1 - sensitive, dimmest), P = SENSE_PLOT;
  // The flow as a share of the resting cost, from the nutrient signal: s / (1 − s).
  const ofRest = s => s / (1 - s);
  const rest = (row, xOf) => '<path class="aid-gland-phase" d="M' + fixed(xOf(REST)) + ' ' +
                             row.top + ' V' + row.base + '"/>' +
                             senseText(xOf(REST) - P.tick, row.base - P.tick, word('rest'), 'end');
  return sensePicture(center, word('food'),
                      [
                        intensityRow(sensitive, dimmest, {
                          report : word('report'),
                          from : word('little'),
                          to : word('much'),
                          half : word('foodHalf', {p : percent(ofRest(half), half < .01 ? 1 : 0)}),
                          handle : word('foodHandle')
                        },
                                     rest),
                        fadeRow(center, REST, half, {
                          report : word('report'),
                          from : word('eats'),
                          to : word('later', {n : P.window * LONGEST_TIME_CONSTANT}),
                          half : n => word('fade', {n}),
                          handle : word('fadeHandle')
                        })
                      ],
                      'refreshEffectors');
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
