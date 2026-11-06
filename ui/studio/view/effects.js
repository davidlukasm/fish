import {HORMONE_EFFECT} from '../../schema.js';
import {clamp} from '../../units.js';
import {effectLevel, startEnds} from '../model/document.js';
import {fixed} from './markup.js';
import {animate, travelling} from './episode.js';

// What each of the hormones' effects does to a cell, as the engine's cell step has it
// (colony-core/field/substrate.cc), played side by side: the same cell with the same input
// without the substance (left) and in its cloud (right), each side as the receptor answers there
// (its response R, effectLevel), so the difference shows at once; what the cell sends leaves it to
// the right.
// - firing: R adds to what the cell takes in, so it fires more often, or less;
// - passing on: it sends from nothing to its full signal with each firing, as often as before;
// - dying: past a threshold the cell dies (a red cross), its lines go with it;
// - rhythm: a pacemaker beats from not at all to fully and sends as much;
// - learning: the same teaching signal changes the line it met from not at all to twice as much;
// - competition: the line firing with the cell grows and the still one shrinks, the more the
//   sharper;
// - credit: the lines met by the cell's own firing and by its pacemaker's beat share the credit as
//   the receptor shifts it.
// PANEL lays one side out (WIDTH wide, HEIGHT high): the cell's middle and radius, inputs from
// SIDE (two of them at UPPER and LOWER), the output to END, the teaching signal from TOP, the
// pacemaker BELOW the cell, lines THICK wide, pulses PULSE wide (at most LOUD sent), a trace GLOW
// wide, the cloud CLOUD times the cell, the cross CROSS times it, a pulse's way TRAVEL of the loop;
// a loop lasts PLAY seconds.
const PANEL = Object.freeze({
  width : 120,
  height : 76,
  cx : 66,
  cy : 40,
  r : 9,
  side : 6,
  end : 114,
  upper : 20,
  lower : 60,
  top : 4,
  below : 20,
  thick : 1.6,
  pulse : 3,
  loud : 5.5,
  glow : 7,
  cloud : 2.8,
  cross : .8,
  play : 3.2,
  travel : .1
});
const P = PANEL;
// When the input reaches the cell, when the cell fires besides, when a teaching signal arrives
// and its change is done, when a pacemaker beats and when a cell dies; a flash lasts FLASH either
// side.
const TIMES = Object.freeze({
  input : [ .12, .45, .78 ],
  extra : [ .28, .61, .94 ],
  teach : [ .5, .58 ],
  beat : .3,
  death : .4,
  fading : .1,
  cross : [ .2, .3 ],
  flash : .025,
  edge : .005
});
const T = TIMES;
const way = (x1, y1, x2, y2) =>
    'M' + fixed(x1) + ' ' + fixed(y1) + ' L' + fixed(x2) + ' ' + fixed(y2);
const line = (x1, y1, x2, y2, cls, width, inner = '') =>
    '<path class="aid-effect-line ' + cls + '" d="' + way(x1, y1, x2, y2) + '" stroke-width="' +
    width + '">' + inner + '</path>';
// The cell's edge where a line from (x, y) reaches it.
const edge = (x, y) => {
  const dx = P.cx - x, dy = P.cy - y, d = Math.hypot(dx, dy) || 1;
  return {x : P.cx - dx * P.r / d, y : P.cy - dy * P.r / d};
};
const flashes = moments => {
  const keys = [ [ 0, .3 ] ];
  for (const t of moments)
    keys.push([ t - T.flash, .3 ], [ t, 1 ], [ t + T.flash, .3 ]);
  return animate('fill-opacity', keys, P.play);
};
// The cell over an opaque disc, so the lines end under it.
const cell = moments => '<circle class="aid-effect-base" cx="' + P.cx + '" cy="' + P.cy + '" r="' +
                        P.r + '"/><circle class="aid-effect-cell" cx="' + P.cx + '" cy="' + P.cy +
                        '" r="' + P.r + '" fill-opacity=".3">' + flashes(moments) + '</circle>';
// An input line from (SIDE, y) with a pulse reaching the cell at each moment.
function input(y, moments, cls = '', inner = '') {
  const to = edge(P.side, y), path = way(P.side, y, to.x, to.y);
  return line(P.side, y, to.x, to.y, cls, P.thick, inner) +
         moments.map(t => travelling(path, t - P.travel, t, P.pulse, P.play)).join('');
}
// The output line with a pulse R wide leaving at each moment (none where R is nothing).
const output = (moments, r = P.pulse) =>
    line(P.cx + P.r, P.cy, P.end, P.cy, '', P.thick) +
    (r > 0 ? moments
                 .map(t => travelling(way(P.cx + P.r, P.cy, P.end, P.cy), t, t + P.travel * 1.4, r,
                                      P.play))
                 .join('')
           : '');
// A line's width changed to TO when a teaching signal's change is done.
const grown = to => animate('stroke-width',
                            [
                              [ 0, P.thick ], [ T.teach[0], P.thick ], [ T.teach[1], to ],
                              [ 1 - T.edge, to ], [ 1, P.thick ]
                            ],
                            P.play);
// A trace glowing on a line from where the cell met it until the change is done.
function trace(y, from, strength) {
  if (!strength)
    return '';
  const to = edge(P.side, y);
  return line(P.side, y, to.x, to.y, 'trace', P.glow,
              animate('stroke-opacity',
                      [ [ 0, 0 ], [ from, 0 ], [ from + T.edge, strength ], [ T.teach[1], 0 ] ],
                      P.play));
}
const teaching = () => line(P.cx, P.top, P.cx, P.cy - P.r, 'teach', 2) +
                       travelling(way(P.cx, P.top, P.cx, P.cy - P.r), T.teach[0] - P.travel,
                                  T.teach[0], P.pulse * 1.2, P.play, 'var(--aid-teach)');
// A pacemaker below the cell beating at BEAT, as strongly as SWING says (a ring round the cell).
const pacer = (swing = 1) =>
    line(P.cx, P.cy + P.below, P.cx, P.cy + P.r, 'pace', 2) +
    '<circle class="aid-effect-pacer" cx="' + P.cx + '" cy="' + (P.cy + P.below) + '" r="' +
    fixed(3 + 2 * swing) + '"/><circle class="aid-effect-ring" cx="' + P.cx + '" cy="' + P.cy +
    '" r="' + P.r + '" stroke-opacity="0">' +
    animate('stroke-opacity',
            [ [ 0, 0 ], [ T.beat, 0 ], [ T.beat + T.edge, swing ], [ T.beat + T.flash * 4, 0 ] ],
            P.play) +
    animate('r', [ [ 0, P.r ], [ T.beat, P.r ], [ T.beat + T.flash * 4, P.r * (1 + swing) ] ],
            P.play) +
    '</circle>';
function dying() {
  const C = P.r * P.cross;
  const fade = animate(
      'opacity',
      [ [ 0, 1 ], [ T.death, 1 ], [ T.death + T.fading, .12 ], [ 1 - T.edge, .12 ], [ 1, 1 ] ],
      P.play);
  return '<g>' + fade + input(P.cy, [ T.input[0] ]) + output([ T.input[0] ]) +
         cell([ T.input[0] ]) + '</g><path class="aid-effect-cross" d="M' + (P.cx - C) + ' ' +
         (P.cy - C) + ' L' + (P.cx + C) + ' ' + (P.cy + C) + ' M' + (P.cx + C) + ' ' + (P.cy - C) +
         ' L' + (P.cx - C) + ' ' + (P.cy + C) + '" stroke-opacity="0">' +
         animate('stroke-opacity',
                 [
                   [ 0, 0 ], [ T.death, 0 ], [ T.death + T.edge, 1 ], [ T.death + T.cross[0], 1 ],
                   [ T.death + T.cross[1], 0 ]
                 ],
                 P.play) +
         '</path>';
}
// How much a line changes at most in a side by side scene: LEARN (at twice the rate), COMPETE,
// CREDIT; how many times at most a cell fires (FIRES, INPUT of them from its input alone), and how
// much larger (LOUDER) or smaller what it sends as its input is raised or lowered.
const CHANGE =
    Object.freeze({learn : 7, compete : 6, credit : 7, fires : 6, input : 3, louder : .6});
// The cell's firings as R adds to its input: three from its input, from none (R -1) to six (R 1).
function firings(r) {
  const n = Math.round(clamp(CHANGE.input * (1 + r), 0, CHANGE.fires));
  return [...T.input, ...T.extra ].slice(0, n).sort((a, b) => a - b);
}
// Each side of an effect as the receptor's response R there makes it.
const SCENES = Object.freeze({
  [HORMONE_EFFECT.excitation] : r => {
    const level = effectLevel(HORMONE_EFFECT.excitation, r), fires = firings(level);
    return input(P.cy, T.input) + output(fires, P.pulse * (1 + CHANGE.louder * level)) +
           cell(fires);
  },
  [HORMONE_EFFECT.output] : r => input(P.cy, T.input) +
                                 output(T.input, P.loud * effectLevel(HORMONE_EFFECT.output, r)) +
                                 cell(T.input),
  [HORMONE_EFFECT.death] : r => effectLevel(HORMONE_EFFECT.death, r)
                                    ? dying()
                                    : input(P.cy, T.input) + output(T.input) + cell(T.input),
  [HORMONE_EFFECT.rhythm] : r => {
    const swing = effectLevel(HORMONE_EFFECT.rhythm, r);
    return pacer(swing) + output([ T.beat ], P.loud * swing) + cell(swing ? [ T.beat ] : []);
  },
  [HORMONE_EFFECT.learning] : r =>
      input(P.cy, [ T.input[0] ], '',
            grown(P.thick + CHANGE.learn * effectLevel(HORMONE_EFFECT.learning, r) / 2)) +
      trace(P.cy, T.input[0], .6) + teaching() + output([ T.input[0] ]) + cell([ T.input[0] ]),
  [HORMONE_EFFECT.competition] : r => {
    const change = CHANGE.compete * effectLevel(HORMONE_EFFECT.competition, r);
    return input(P.upper, [ T.input[0] ], '', grown(P.thick + change)) +
           input(P.lower, [], 'still',
                 grown(P.thick * (1 - effectLevel(HORMONE_EFFECT.competition, r) / 2))) +
           output([ T.input[0] ]) + cell([ T.input[0] ]);
  },
  [HORMONE_EFFECT.eligibility] : r => {
    const own = effectLevel(HORMONE_EFFECT.eligibility, r), beat = 1 - own;
    return input(P.upper, [ T.input[0] ], '', grown(P.thick + CHANGE.credit * own)) +
           input(P.lower, [ T.beat ], '', grown(P.thick + CHANGE.credit * beat)) +
           trace(P.upper, T.input[0], own * .7) + trace(P.lower, T.beat, beat * .7) + pacer() +
           teaching() + output([ T.input[0] ]) + cell([ T.input[0] ]);
  }
});
// A substance teaching a learning cell: without it nothing teaches, the line the cell met keeps its
// width; with it its change is the teaching signal (in its colour), the line grows as far as it
// rises, or shrinks where it falls.
function taught(colour, ends) {
  const change = CHANGE.learn * (ends.with - ends.without) / 2;
  return (r, withIt) =>
             input(P.cy, [ T.input[0] ], '',
                   withIt && change ? grown(Math.max(P.thick / 2, P.thick + change)) : '') +
             trace(P.cy, T.input[0], .6) +
             (withIt && change
                  ? line(P.cx, P.top, P.cx, P.cy - P.r, 'teach', 2) +
                        travelling(way(P.cx, P.top, P.cx, P.cy - P.r), T.teach[0] - P.travel,
                                   T.teach[0], P.pulse * 1.2, P.play, colour)
                  : '') +
             output([ T.input[0] ]) + cell([ T.input[0] ]);
}
// What a modulator does, beside what a plain input does: a plain input makes the cell fire and
// send; the modulator's firing (a cell above) makes it fire no more, but it teaches it: the line
// the cell's own firing met grows.
function modulating(r, withIt) {
  if (!withIt)
    return input(P.cy, T.input) + output(T.input) + cell(T.input);
  return input(P.cy, [ T.input[0] ], '', grown(P.thick + CHANGE.learn)) +
         trace(P.cy, T.input[0], .6) + line(P.cx, P.top + P.r, P.cx, P.cy - P.r, 'teach', 2) +
         '<circle class="aid-effect-modulator" cx="' + P.cx + '" cy="' + (P.top + P.r / 2) +
         '" r="' + fixed(P.r / 2) + '"/>' +
         travelling(way(P.cx, P.top + P.r, P.cx, P.cy - P.r), T.teach[0] - P.travel, T.teach[0],
                    P.pulse * 1.2, P.play, 'var(--aid-teach)') +
         output([ T.input[0] ]) + cell([ T.input[0] ]);
}
// The order the Atelier offers the effects in: on firing and passing on first, then on
// learning, then the pacemaker's beat.
export const EFFECT_ORDER = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.learning,
  HORMONE_EFFECT.competition, HORMONE_EFFECT.eligibility, HORMONE_EFFECT.rhythm
]);
// Both sides of an effect, the right one in the substance's cloud (where there is one), a dot over
// each saying without (hollow) and with (in the substance's colour); each side as the receptor
// answers there (`ends`, its response without and with plenty of the substance), by default as a
// receptor put down by a tile starts.
export const effectScene = (effect, colour, ends = startEnds(effect)) =>
    sideBySide(SCENES[effect], colour, ends);
export const teachingScene = (colour, ends = startEnds(HORMONE_EFFECT.excitation)) =>
    sideBySide(taught(colour, ends), colour, ends);
export const modulatorScene = colour =>
    sideBySide(modulating, colour, {without : 0, with : 0}, false);
function sideBySide(draw, colour, ends, cloud = true) {
  if (!draw)
    return '';
  const side = (withIt, x) =>
      '<g transform="translate(' + x + ' 0)">' +
      (withIt && cloud ? '<circle class="aid-effect-cloud" cx="' + P.cx + '" cy="' + P.cy +
                             '" r="' + P.r * P.cloud + '" fill="' + colour + '"/>'
                       : '') +
      draw(withIt ? ends.with : ends.without, withIt) + '<circle class="aid-effect-mark' +
      (withIt ? ' with' : '') + '" cx="' + (P.width - P.side * 2) + '" cy="' + P.side * 2 +
      '" r="' + fixed(P.side / 1.5) + '"' + (withIt ? ' fill="' + colour + '"' : '') + '/></g>';
  return '<svg class="aid-effect-scene" viewBox="0 0 ' + 2 * P.width + ' ' + P.height +
         '" aria-hidden="true">' + side(false, 0) + '<line class="aid-effect-divide" x1="' +
         P.width + '" y1="' + P.side + '" x2="' + P.width + '" y2="' + (P.height - P.side) + '"/>' +
         side(true, P.width) + '</svg>';
}
