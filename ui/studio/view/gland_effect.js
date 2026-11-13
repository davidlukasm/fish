// What a gland does to the blood, in two pictures below its wheel.
// Level: how high each substance it pours rises in the blood while the gland works at a full
// command, and how it fades once the gland rests. Its cells set how high (the source grows with
// them), its cell time how long the substance stays: the blood loses a substance at one over that
// time per step and the gland's pouring builds up over it (hormone_state.cc).
// Command: what the gland does at each command (command_line.js). An exciting one makes it pour,
// an inhibiting one makes it bind the substance, which then leaves the blood faster.
import {ATELIER_LIMITS, MOTOR_KIND} from '../../schema.js';
import {clamp} from '../../units.js';
import {
  LONGEST_ADAPTATION,
  LONGEST_TIME_CONSTANT,
  residenceOf,
  residenceSteps,
  timeConstantOf,
  timeConstantSteps
} from '../../tuning.js';
import {substanceColor} from '../../hormones.js';
import {wheelAffinity} from '../model/document.js';
import {sideOf} from '../model/layout.js';
import {handleWord} from './sense_marks.js';
import {commandLine} from './command_line.js';
import {escapeText, fixed} from './markup.js';
import {formatNumber, percent, t} from '../../strings.js';

const word = (key, values) => t('studio.gland.' + key, values);
const LEVEL = Object.freeze({
  width : 300,
  height : 140,
  left : 40,
  right : 284,
  top : 22,
  base : 114,
  title : 12,
  tick : 4,
  phases : 12,
  // The gland works for the longest cell time: the slowest rise gets about two thirds of the way
  // to its level. The rest shows the steps after it on a log scale, up to twice the longest
  // residence, so a quick substance and a lasting one both read.
  phase : 1,
  samples : 48,
  handle : 5.5,
  // A substance the gland pours at less than this share of its main one is left out.
  least : .1,
  // Shares closer than this part of the main one count as alike.
  alike : .02,
  name : 4
});
const text = (cls, x, y, content, anchor = 'start') =>
    '<text class="' + cls + '" x="' + fixed(x) + '" y="' + fixed(y) + '" text-anchor="' + anchor +
    '">' + escapeText(content) + '</text>';
const upright = (x, y, content) =>
    '<text class="aid-handle-word" transform="translate(' + fixed(x) + ' ' + fixed(y) +
    ') rotate(-90)" text-anchor="middle">' + escapeText(content) + '</text>';
const grip = (name, p, title, frame, extra = '') =>
    '<circle class="aid-graphic-handle" data-effector-handle="' + name + '" data-frame="' +
    frame.width + ',' + frame.height + '"' + extra + ' cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
    '" r="' + frame.handle + '"><title>' + escapeText(title) + '</title></circle>';
const svg = (frame, organ, label, body) =>
    '<svg class="aid-effector-graphic aid-gland-picture" viewBox="0 0 ' + frame.width + ' ' +
    frame.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
    MOTOR_KIND.gland + '" data-effector-side="' + sideOf(organ) + '" role="img" aria-label="' +
    escapeText(label) + '">' + body + '</svg>';

// How much of each substance a gland at this place of the wheel pours, as shares of its whole
// output (hormone_affinity, normalised in body_plan.cc).
export function pouredShares(wheel, {x, y, width}) {
  const raw = Array.from({length : wheel.hormones}, (_, k) => wheelAffinity(wheel, x, y, width, k));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(a => sum > 0 ? a / sum : 0);
}
const phaseSteps = () => LEVEL.phase * LONGEST_TIME_CONSTANT;
const REST_STEPS = 2 * LONGEST_ADAPTATION;
// The level a full command holds, per unit of share: the gland's height times its strength
// (hormone_state.cc).
const held = (height, copies) => height * copies / ATELIER_LIMITS.max_copies;
const mid = () => (LEVEL.left + LEVEL.right) / 2;
// Work runs linearly over the left half, rest on a log scale over the right half.
const xAt = step => step <= phaseSteps()
                        ? LEVEL.left + (mid() - LEVEL.left) * step / phaseSteps()
                        : mid() + (LEVEL.right - mid()) * Math.log1p(step - phaseSteps()) /
                                      Math.log1p(REST_STEPS);
const restAt = x =>
    Math.expm1(clamp((x - mid()) / (LEVEL.right - mid())) * Math.log1p(REST_STEPS));

function levelPicture(state, organ, center, nameOf) {
  const L = LEVEL, wheel = state.capabilities, height = wheel.hormoneHeight;
  const rise = timeConstantSteps(center.tau), stay = residenceSteps(center.field),
        part = pouredShares(wheel, {x : center.q1, y : center.q2, width : center.qwidth});
  const main = Math.max(...part);
  // The frame reaches the level this gland's main substance holds with all cells, so its own peak
  // stands at its share of the cells.
  const most = main * held(height, ATELIER_LIMITS.max_copies);
  const y = level => L.base - (L.base - L.top) * clamp(level / most);
  const top = held(height, center.copies), reached = -Math.expm1(-phaseSteps() / rise);
  const levelAt = (share, step) =>
      step <= phaseSteps() ? share * top * -Math.expm1(-step / rise)
                           : share * top * reached * Math.exp(-(step - phaseSteps()) / stay);
  const steps = Array.from({length : L.samples + 1}, (_, i) => phaseSteps() * i / L.samples)
                    .concat(Array.from({length : L.samples},
                                       (_, i) => phaseSteps() +
                                                 Math.expm1(Math.log1p(REST_STEPS) * (i + 1) /
                                                            L.samples)));
  const curve = share =>
      'M' + steps.map(step => fixed(xAt(step)) + ' ' + fixed(y(levelAt(share, step)))).join(' L');
  // Each substance's name stands above its curve halfway up its rise; substances poured alike
  // share one curve and one line of names.
  const named = phaseSteps() / 2;
  const alike = [];
  for (const [k, share] of part.entries()) {
    if (share < L.least * main)
      continue;
    const same = alike.find(g => Math.abs(g.share - share) <= L.alike * main);
    if (same)
      same.ks.push(k);
    else
      alike.push({share, ks : [ k ]});
  }
  const curves = alike.sort((a, b) => a.share - b.share)
                     .map(({share, ks}) =>
                              '<path class="aid-use-curve" d="' + curve(share) + '" stroke="' +
                              substanceColor(ks[0]) + '"/><text class="aid-handle-word" x="' +
                              fixed(xAt(named)) + '" y="' + fixed(y(levelAt(share, named)) - L.name) +
                              '" text-anchor="middle">' +
                              ks.map(k => '<tspan style="fill:' + substanceColor(k) + '">' +
                                          escapeText(nameOf(k)) + '</tspan>')
                                  .join(' ') +
                              '</text>')
                     .join('');
  const peak = {x : mid(), y : y(main * top * reached)};
  const up = Math.min(rise * Math.LN2, phaseSteps()), halfUp = {x : xAt(up), y : y(levelAt(main, up))};
  const gone = phaseSteps() + stay * Math.LN2, half = {x : xAt(gone), y : y(levelAt(main, gone))};
  const phases = '<path class="aid-gland-phase" d="M' + fixed(mid()) + ' ' + L.top + ' V' + L.base +
                 '"/>' +
                 text('aid-handle-word', (L.left + mid()) / 2, L.phases, word('works'), 'middle') +
                 text('aid-handle-word', (mid() + L.right) / 2, L.phases, word('rests'), 'middle');
  const axes = '<path class="aid-sense-axis" d="M' + L.left + ' ' + L.top + ' V' + L.base + ' H' +
               L.right + '"/>' + upright(L.title, (L.top + L.base) / 2, word('level')) +
               text('aid-handle-word', L.left - L.tick, L.top + L.tick, percent(most), 'end') +
               text('aid-handle-word', L.left - L.tick, L.base, percent(0), 'end');
  const marks = ' data-most="' + most + '" data-share="' + main + '" data-height="' + height +
                '" data-reached="' + reached + '" data-center="' + escapeText(center.id) + '"';
  return svg(
      L, organ, word('level'),
      axes + phases + curves +
          grip('gland:cells', peak, word('cellsHandle'), L, marks) +
          handleWord(peak, word('peak', {n : center.copies, p : percent(main * top * reached)}),
                     'above') +
          grip('gland:rise', halfUp, word('riseHandle'), L, marks) +
          handleWord(halfUp, word('halfUp', {n : formatNumber(rise * Math.LN2, 0)})) +
          grip('gland:time', half, word('timeHandle'), L, marks) +
          handleWord(half, word('half', {n : formatNumber(stay * Math.LN2, 0)})));
}

export const glandPictures = (state, organ, center, nameOf) =>
    state.capabilities?.hormoneHeight > 0 && center
        ? levelPicture(state, organ, center, nameOf) +
              commandLine(state, organ, center, MOTOR_KIND.gland, 'gland')
        : '';

// The change a handle makes, from the pointer `p` in its picture's units, as a patch of the
// gland's cell.
export function glandPatch(name, p, marks) {
  const id = marks.center;
  if (name === 'gland:cells') {
    const level = Number(marks.most) * clamp((LEVEL.base - p.y) / (LEVEL.base - LEVEL.top));
    const per = held(Number(marks.height), 1) * Number(marks.reached) * Number(marks.share);
    return per > 0 ? {
      id,
      center : {copies : clamp(Math.round(level / per), 1, ATELIER_LIMITS.max_copies)}
    }
                   : null;
  }
  if (name === 'gland:rise') {
    const steps = (p.x - LEVEL.left) / (mid() - LEVEL.left) * phaseSteps() / Math.LN2;
    return {id, center : {tau : timeConstantOf(Math.max(steps, timeConstantSteps(0)))}};
  }
  if (name === 'gland:time')
    return {id, center : {field : residenceOf(Math.max(restAt(p.x) / Math.LN2, residenceSteps(0)))}};
  return null;
}
