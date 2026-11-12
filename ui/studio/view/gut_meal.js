// What the gut muscle does, as one meal of leaves followed through the gut over the steps after
// eating, in three rows: a hungry fish with the gut at rest, the same with the gut driven hard,
// and a full fish driving it. Each row splits the meal into what is still in the gut, what the
// fish has taken up and what it has passed unused (physiology.cc, digest_nutrition): a driven gut
// moves food on sooner, the faster the larger its muscle, but leaves the fish less time to take it
// up; a full fish takes up nothing, and a full gut at rest keeps its food, so driving it is how a
// full fish makes room (fish_organs.js).
import {gutMeal, gutPassage} from '../../fish_organs.js';
import {BODY_UNIT} from '../../schema.js';
import {gutLength} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {formatNumber, percent, t} from '../../strings.js';

const word = (key, values) => t('studio.muscle.gutmuscle.' + key, values);
export const GUT_MEAL = Object.freeze({
  left : 8,
  right : 292,
  // A row: its name above the band at `label`, the band from `top` to `base`, the step the gut is
  // empty under it at `under`; the next row `step` lower.
  row : {label : 12, top : 16, base : 44, under : 54},
  step : 56,
  // The rows run over this many of the resting gut's passage times, long enough for a full fish's
  // driven gut to empty.
  window : 7,
  // The gut counts as empty once less than a twentieth of the meal is left in it.
  empty : .05,
  samples : 48,
  // Words inside a band need it at least this tall.
  room : 7,
  inset : 3,
  tick : 3
});
const M = GUT_MEAL;

// Each row's drive and whether the fish is full: the hungry fish's gut at rest and at full drive,
// the full fish's at full drive.
const ROWS = Object.freeze([
  {key : 'hungryRest', driven : 0, full : false}, {key : 'hungryDriven', driven : 1, full : false},
  {key : 'fullDriven', driven : 1, full : true}
]);

// Steps the meal takes to pass through this fish's gut at rest: the world's gut time, longer for a
// longer gut (physiology.hh, gut_transit), read from the gut size curve at the gut's length.
function restingPassage(state) {
  const time = state.capabilities?.gutTime, sizes = state.capabilities?.diet?.gut?.size;
  if (!(time > 0) || !sizes?.length || !state.capabilities.diet.foods)
    return null;
  const length = gutLength(state.document) ?? BODY_UNIT.trait_middle;
  const at = Math.min(1, Math.max(0, length)) * (sizes.length - 1), k = Math.floor(at);
  const size = sizes[k] + (sizes[Math.min(sizes.length - 1, k + 1)] - sizes[k]) * (at - k);
  return time * size;
}

const text = (x, y, content, anchor = 'start') => '<text class="aid-handle-word" x="' + fixed(x) +
                                                  '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                  '">' + escapeText(content) + '</text>';

function mealRow(spec, k, state, transit, window) {
  const top = M.row.top + k * M.step, base = M.row.base + k * M.step, height = base - top;
  const pace = transit / gutPassage(spec.driven, state.anatomy?.gutSpeed ?? 1),
        meal = steps => gutMeal(state.capabilities.diet.foods.plant, pace, steps, spec.full);
  const x = steps => M.left + (M.right - M.left) * steps / window;
  const y = value => base - height * value;
  // Stacked from below: taken up, then still in the gut, then passed unused on top.
  const taken = steps => meal(steps).taken, use = meal(Infinity).taken;
  const band = (cls, low, high) => {
    const points = Array.from({length : M.samples + 1}, (_, i) => window * i / M.samples);
    return '<path class="' + cls + '" d="M' +
           points.map(s => fixed(x(s)) + ' ' + fixed(y(high(s)))).join(' L') + ' L' +
           points.reverse().map(s => fixed(x(s)) + ' ' + fixed(y(low(s)))).join(' L') + 'Z"/>';
  };
  const inGut = steps => taken(steps) + meal(steps).held;
  const bands = band('aid-meal-taken', () => 0, taken) + band('aid-meal-gut', taken, inGut) +
                band('aid-meal-lost', inGut, () => 1);
  // The meal's end shares, written inside their bands where these leave room.
  const end = (value, from, key) => value * height >= M.room
                                        ? text(M.right - M.inset, y(from + value / 2) + M.tick,
                                               word(key, {p : percent(value)}), 'end')
                                        : '';
  // The first sampled step at which the gut counts as empty.
  const emptied = Array.from({length : M.samples + 1}, (_, i) => window * i / M.samples)
                      .find(steps => meal(steps).held < M.empty) ??
                  Infinity,
        at = x(emptied);
  const mark =
      emptied <= window
          ? '<path class="aid-gland-phase" d="M' + fixed(at) + ' ' + top + ' V' + base + '"/>' +
                text(at, M.row.under + k * M.step, word('empty', {n : formatNumber(emptied, 0)}),
                     at > (M.left + M.right) / 2 ? 'end' : 'start')
          : '';
  return text(M.left, M.row.label + k * M.step, word(spec.key)) + bands + end(use, 0, 'taken') +
         end(1 - use, use, 'lost') + mark;
}

// The rows for the gut muscle's picture, drawn in the effector frame, or nothing before the
// atelier has told the gut time.
export function gutMealRows(state) {
  const transit = restingPassage(state);
  if (!transit)
    return '';
  const window = M.window * transit;
  return text(M.right, M.row.label, word('meal', {n : formatNumber(window, 0)}), 'end') +
         ROWS.map((spec, k) => mealRow(spec, k, state, transit, window)).join('');
}
