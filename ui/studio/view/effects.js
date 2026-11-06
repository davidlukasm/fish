import {HORMONE_EFFECT} from '../../schema.js';
import {fixed} from './markup.js';
import {lessonScene} from './episode.js';

// What each of the hormones' effects does to a cell, played in a loop of PLAY seconds: the cell
// as it is without the substance, then the substance arriving as a cloud in its colour (from
// ARRIVE to HERE of the loop, CLOUD times the cell wide), then the cell as it is with it, as the
// engine's cell step has it (colony-core/field/substrate.cc):
// - firing: the substance adds to what the cell takes in, so it fires more (a muscle or gland
//   works harder); for a learning cell its rise is the teaching signal (episode.js);
// - learning, competition, eligibility: what the substance changes in learning, as an episode
//   (episode.js);
// - rhythm: a pacemaker beats the stronger;
// - output: the cell passes less on (what it sends shrinks), down to nothing;
// - death: past a threshold the cell dies and its connections go.
// SCENE lays the drawing out: the cell's middle and radius, the inputs coming in from SIDE, the
// output leaving to the right, lines THICK wide, a pulse PULSE wide, the beat's WAVE.
const SCENE = Object.freeze({
  width : 170,
  height : 70,
  cx : 92,
  cy : 35,
  r : 11,
  side : 12,
  end : 160,
  thick : 3,
  pulse : 3.5,
  play : 4,
  arrive : .38,
  here : .5,
  cloud : 2.8,
  flash : .025,
  wave : {from : 18, to : 70, y : 14, steps : 24, turns : 3, low : 2, high : 9}
});
const S = SCENE;
// The effects in the order the Atelier offers them: on firing and passing on first, then on
// learning, then the pacemaker's beat.
export const EFFECT_ORDER = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.learning,
  HORMONE_EFFECT.competition, HORMONE_EFFECT.eligibility, HORMONE_EFFECT.rhythm
]);
const loop = (attribute, values, times) => '<animate attributeName="' + attribute + '" values="' +
                                           values.join(';') + '" keyTimes="' + times.join(';') +
                                           '" dur="' + S.play + 's" repeatCount="indefinite"/>';
// A value held, then changed to another between ARRIVE and HERE, held until the loop ends.
const before = (attribute, from, to) =>
    loop(attribute, [ from, from, to, to, from ], [ 0, S.arrive, S.here, .98, 1 ]);
// A cell flashing at the given moments of the loop (each FLASH long either side).
function flashes(moments) {
  const values = [ .25 ], times = [ 0 ];
  for (const t of moments)
    values.push(.25, 1, .25), times.push(fixed(t - S.flash), fixed(t), fixed(t + S.flash));
  values.push(.25), times.push(1);
  return loop('fill-opacity', values, times);
}
const cloud = colour =>
    '<circle class="aid-effect-cloud" cx="' + S.cx + '" cy="' + S.cy + '" fill="' + colour + '">' +
    loop('r', [ 0, 0, S.r * S.cloud, S.r * S.cloud, 0 ], [ 0, S.arrive, S.here, .98, 1 ]) +
    loop('opacity', [ 0, 0, .35, .25, 0 ], [ 0, S.arrive, S.here, .98, 1 ]) + '</circle>';
const cell = (inner = '') => '<circle class="aid-effect-cell" cx="' + S.cx + '" cy="' + S.cy +
                             '" r="' + S.r + '">' + inner + '</circle>';
const line = (x1, y1, x2, y2, inner = '', cls = '') =>
    '<line class="aid-effect-line' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 +
    '" y2="' + y2 + '" stroke-width="' + S.thick + '">' + inner + '</line>';
const input = (y, inner = '') => line(S.side, y, S.cx - S.r, S.cy, inner);
const output = (inner = '') => line(S.cx + S.r, S.cy, S.end, S.cy, inner);
// A pulse running out along the output from each of the moments, R wide before the substance
// and R2 with it.
function sent(moments, r, r2) {
  return moments
      .map(t => '<circle class="aid-effect-pulse" r="' + (t < S.here ? r : r2) + '" cy="' + S.cy +
                '">' +
                loop('cx', [ S.cx + S.r, S.cx + S.r, S.end, S.end ],
                     [ 0, fixed(t), fixed(t + .1), 1 ]) +
                loop('opacity', [ 0, 0, 1, 0, 0 ],
                     [ 0, fixed(t), fixed(t + .02), fixed(t + .1), 1 ]) +
                '</circle>')
      .join('');
}
const wave = amplitude => {
  const W = S.wave, points = [];
  for (let k = 0; k <= W.steps; ++k)
    points.push(fixed(W.from + (W.to - W.from) * k / W.steps) + ' ' +
                fixed(W.y + amplitude * Math.sin(2 * Math.PI * W.turns * k / W.steps)));
  return 'M' + points.join(' L');
};
const BEATS = [ .1, .26 ], FIRING = [ .56, .63, .7, .77, .84, .91 ];
const SCENES = Object.freeze({
  [HORMONE_EFFECT.excitation] : () => input(S.cy) + output() +
                                      cell(flashes([...BEATS, ...FIRING ])) +
                                      sent(FIRING, S.pulse, S.pulse),
  [HORMONE_EFFECT.rhythm] : () => '<path class="aid-effect-wave" d="' + wave(S.wave.low) + '">' +
                                  loop('d',
                                       [
                                         wave(S.wave.low), wave(S.wave.low), wave(S.wave.high),
                                         wave(S.wave.high), wave(S.wave.low)
                                       ],
                                       [ 0, S.arrive, S.here, .98, 1 ]) +
                                  '</path>' + line(S.wave.to, S.wave.y, S.cx - S.r, S.cy) +
                                  output() + cell(flashes([...BEATS, ...FIRING ])),
  [HORMONE_EFFECT.output] : () => input(S.cy) + output(before('stroke-opacity', 1, .25)) +
                                  cell(flashes([...BEATS, ...FIRING ])) +
                                  sent([...BEATS, ...FIRING ], S.pulse, 1),
  [HORMONE_EFFECT.death] : () => input(S.cy, before('stroke-opacity', 1, .1)) +
                                 output(before('stroke-opacity', 1, .1)) +
                                 cell(flashes(BEATS) + before('opacity', 1, .2))
});
// The effects on learning play as a learning episode (episode.js).
const LESSONS = Object.freeze({
  [HORMONE_EFFECT.learning] : 'learning',
  [HORMONE_EFFECT.competition] : 'competition',
  [HORMONE_EFFECT.eligibility] : 'eligibility'
});
export function effectScene(effect, colour) {
  if (LESSONS[effect])
    return lessonScene(LESSONS[effect], colour);
  const draw = SCENES[effect];
  return draw ? '<svg class="aid-effect-scene" viewBox="0 0 ' + S.width + ' ' + S.height +
                    '" aria-hidden="true">' + cloud(colour) + draw() + '</svg>'
              : '';
}
