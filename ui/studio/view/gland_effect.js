// What a gland does to the blood, in two pictures below its wheel.
// Level: how high each substance it pours rises in the blood while the gland works at a full
// command, and how it fades once the gland rests. Its cells set how high (the source grows with
// them), its cell time how long the substance stays: the blood loses a substance at one over that
// time per step and the gland's pouring builds up over it (hormone_state.cc).
// Command: what the gland does at each command (command_line.js). An exciting one makes it pour,
// an inhibiting one makes it bind the substance, which then leaves the blood faster.
import {ATELIER_LIMITS, MOTOR_KIND} from '../../schema.js';
import {clamp} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
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
  // The gland works, and then rests, for the longest cell time: the slowest substance gets about
  // two thirds of the way to its level and back, a quick one all the way.
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

// How much of each substance the gland pours, as shares of its whole output (hormone_affinity).
function shares(wheel, center) {
  const raw = Array.from({length : wheel.hormones},
                         (_, k) => wheelAffinity(wheel, center.q1, center.q2, center.qwidth, k));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(a => sum > 0 ? a / sum : 0);
}
const phaseSteps = () => LEVEL.phase * LONGEST_TIME_CONSTANT;
// The level a full command builds up over a working phase, per unit of share.
const builtUp = (rate, copies, tau) =>
    rate * copies / ATELIER_LIMITS.max_copies * tau * -Math.expm1(-phaseSteps() / tau);

function levelPicture(state, organ, center, nameOf) {
  const L = LEVEL, wheel = state.capabilities, rate = wheel.hormoneRate;
  const tau = timeConstantSteps(center.tau), part = shares(wheel, center);
  const main = Math.max(...part), mid = (L.left + L.right) / 2;
  // The frame reaches the level of the strongest gland: all cells, the longest cell time.
  const most = builtUp(rate, ATELIER_LIMITS.max_copies, LONGEST_TIME_CONSTANT);
  const x = step => L.left + (L.right - L.left) * step / (2 * phaseSteps()),
        y = level => L.base - (L.base - L.top) * clamp(level / most);
  const top = builtUp(rate, center.copies, tau);
  const levelAt = (share, step) =>
      step <= phaseSteps()
          ? share * top * -Math.expm1(-step / tau) / -Math.expm1(-phaseSteps() / tau)
          : share * top * Math.exp(-(step - phaseSteps()) / tau);
  const curve = share =>
      'M' + Array
                .from({length : 2 * L.samples + 1},
                      (_, i) => {
                        const step = i * phaseSteps() / L.samples;
                        return fixed(x(step)) + ' ' + fixed(y(levelAt(share, step)));
                      })
                .join(' L');
  // Each substance's name stands above its curve halfway through the gland's work; substances
  // poured alike share one curve and one line of names.
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
                              fixed(x(named)) + '" y="' + fixed(y(levelAt(share, named)) - L.name) +
                              '" text-anchor="middle">' +
                              ks.map(k => '<tspan style="fill:' + substanceColor(k) + '">' +
                                          escapeText(nameOf(k)) + '</tspan>')
                                  .join(' ') +
                              '</text>')
                     .join('');
  const peak = {x : mid, y : y(main * top)};
  const gone = phaseSteps() + tau * Math.LN2, half = {x : x(gone), y : L.base};
  const phases = '<path class="aid-gland-phase" d="M' + fixed(mid) + ' ' + L.top + ' V' + L.base +
                 '"/>' +
                 text('aid-handle-word', (L.left + mid) / 2, L.phases, word('works'), 'middle') +
                 text('aid-handle-word', (mid + L.right) / 2, L.phases, word('rests'), 'middle');
  const axes = '<path class="aid-sense-axis" d="M' + L.left + ' ' + L.top + ' V' + L.base + ' H' +
               L.right + '"/>' + upright(L.title, (L.top + L.base) / 2, word('level')) +
               text('aid-handle-word', L.left - L.tick, L.top + L.tick, percent(most), 'end') +
               text('aid-handle-word', L.left - L.tick, L.base, percent(0), 'end');
  const marks = ' data-most="' + most + '" data-share="' + main + '" data-rate="' + rate +
                '" data-tau="' + tau + '" data-center="' + escapeText(center.id) + '"';
  return svg(L, organ, word('level'),
             axes + phases + curves + '<path class="aid-gland-phase" d="M' + fixed(half.x) + ' ' +
                 L.base + ' V' + fixed(y(levelAt(main, gone))) + '"/>' +
                 grip('gland:cells', peak, word('cellsHandle'), L, marks) +
                 handleWord(peak, t('studio.sense.cellsWord', {n : center.copies}), 'above') +
                 grip('gland:time', half, word('timeHandle'), L, marks) +
                 handleWord(half, word('half', {n : formatNumber(tau * Math.LN2, 0)})));
}

export const glandPictures = (state, organ, center, nameOf) =>
    state.capabilities?.hormoneRate > 0 && center
        ? levelPicture(state, organ, center, nameOf) +
              commandLine(state, organ, center, MOTOR_KIND.gland, 'gland')
        : '';

// The change a handle makes, from the pointer `p` in its picture's units, as a patch of the
// gland's cell.
export function glandPatch(name, p, marks) {
  const id = marks.center;
  if (name === 'gland:cells') {
    const level = Number(marks.most) * clamp((LEVEL.base - p.y) / (LEVEL.base - LEVEL.top));
    const per = builtUp(Number(marks.rate), 1, Number(marks.tau)) * Number(marks.share);
    return per > 0 ? {
      id,
      center : {copies : clamp(Math.round(level / per), 1, ATELIER_LIMITS.max_copies)}
    }
                   : null;
  }
  if (name === 'gland:time') {
    const mid = (LEVEL.left + LEVEL.right) / 2;
    const steps = (p.x - mid) / (LEVEL.right - LEVEL.left) * 2 * phaseSteps() / Math.LN2;
    return {id, center : {tau : timeConstantOf(Math.max(steps, timeConstantSteps(0)))}};
  }
  return null;
}
