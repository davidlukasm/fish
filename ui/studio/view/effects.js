import {HORMONE_EFFECT} from '../../schema.js';
import {clamp} from '../../units.js';
import {effectLevel, startEnds} from '../model/document.js';
import {fixed} from './markup.js';
import {animate, travelling} from './episode.js';

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
  spike : 6,
  pulse : 3,
  loud : 5.5,
  glow : 7,
  cloud : 2.8,
  cross : .8,
  wave : 18,
  swing : 6,
  samples : 24,
  play : 3.2,
  travel : .1
});
const P = PANEL;
const TIMES = Object.freeze({
  input : [ .12, .45, .78 ],
  extra : [ .28, .61, .94 ],
  teach : [ .5, .58 ],
  beat : .3,
  death : .4,
  fading : .1,
  cross : [ .2, .3 ],
  flash : .025,
  rise : .02,
  fade : .12,
  edge : .005
});
const T = TIMES;
const way = (x1, y1, x2, y2) =>
    'M' + fixed(x1) + ' ' + fixed(y1) + ' L' + fixed(x2) + ' ' + fixed(y2);
const line = (x1, y1, x2, y2, cls, width, inner = '') =>
    '<path class="aid-effect-line ' + cls + '" d="' + way(x1, y1, x2, y2) + '" stroke-width="' +
    width + '">' + inner + '</path>';
const edge = (x, y) => {
  const dx = P.cx - x, dy = P.cy - y, d = Math.hypot(dx, dy) || 1;
  return {x : P.cx - dx * P.r / d, y : P.cy - dy * P.r / d};
};
const flashes = moments => {
  const keys = [ [ 0, .3 ] ];
  for (const t of moments)
    keys.push([ t - T.rise, .3 ], [ t, 1 ], [ t + T.fade, .3 ]);
  return animate('fill-opacity', keys, P.play);
};
const cell = moments => '<circle class="aid-effect-base" cx="' + P.cx + '" cy="' + P.cy + '" r="' +
                        P.r + '"/><circle class="aid-effect-cell" cx="' + P.cx + '" cy="' + P.cy +
                        '" r="' + P.r + '" fill-opacity=".3">' + flashes(moments) + '</circle>';
function input(y, moments, cls = '', grows = null, from = P.thick) {
  const to = edge(P.side, y), path = way(P.side, y, to.x, to.y);
  return (grows === null ? '' : line(P.side, y, to.x, to.y, 'ghost', grows)) +
         line(P.side, y, to.x, to.y, cls, from, grows === null ? '' : grown(grows, from)) +
         moments.map(t => travelling(path, t - P.travel, t, P.pulse, P.play)).join('');
}
const output = (moments, r = P.pulse, width = P.thick) =>
    line(P.cx + P.r, P.cy, P.end, P.cy, '', width) +
    (r > 0 ? moments
                 .map(t => travelling(way(P.cx + P.r, P.cy, P.end, P.cy), t, t + P.travel * 1.4, r,
                                      P.play))
                 .join('')
           : '');
const spikes = n => '<path class="aid-effect-spikes" d="' +
                    Array
                        .from({length : n}, (_, k) => 'M' + fixed(P.cx + P.r + P.spike * (k + 1)) +
                                                      ' ' + (P.cy + P.spike) + ' v' + P.spike)
                        .join(' ') +
                    '"/>';
const grown = (to, from = P.thick) => animate(
    'stroke-width',
    [ [ 0, from ], [ T.teach[0], from ], [ T.teach[1], to ], [ 1 - T.edge, to ], [ 1, from ] ],
    P.play);
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
// Drawn like the rhythm tile's icon.
function pacer(swing = 1, beats = [ T.beat ]) {
  const y = P.cy + P.below, A = P.swing * swing;
  const wave = Array
                   .from({length : P.samples + 1},
                         (_, k) => {
                           const u = k / P.samples;
                           return (k ? ' L' : 'M') + fixed(P.cx - P.wave + 2 * P.wave * u) + ' ' +
                                  fixed(y - A * Math.sin(2 * Math.PI * 2 * u));
                         })
                   .join('');
  const ring = attribute => animate(
      attribute,
      [
        [ 0, attribute === 'r' ? P.r : 0 ],
        ...beats.flatMap(t => attribute === 'r'
                                  ? [ [ t, P.r ], [ t + T.flash * 4, P.r * (1 + swing) ],
                                      [ t + T.flash * 4 + T.edge, P.r ] ]
                                  : [ [ t, 0 ], [ t + T.edge, swing ], [ t + T.flash * 4, 0 ] ])
      ],
      P.play);
  return line(P.cx, y, P.cx, P.cy + P.r, 'pace', 2) + '<path class="aid-effect-wave" d="' + wave +
         '"/><circle class="aid-effect-ring" cx="' + P.cx + '" cy="' + P.cy + '" r="' + P.r +
         '" stroke-opacity="0">' + ring('stroke-opacity') + ring('r') + '</circle>';
}
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
const CHANGE = Object.freeze(
    {learn : 7, compete : 5, quiet : 2.8, credit : 7, fires : 6, input : 3, louder : .6});
function firings(r) {
  const n = Math.round(clamp(CHANGE.input * (1 + r), 0, CHANGE.fires));
  return [...T.input, ...T.extra ].slice(0, n).sort((a, b) => a - b);
}
const SCENES = Object.freeze({
  [HORMONE_EFFECT.excitation] : r => {
    const level = effectLevel(HORMONE_EFFECT.excitation, r), fires = firings(level);
    return input(P.cy, T.input) + output(fires, P.pulse * (1 + CHANGE.louder * level)) +
           spikes(fires.length) + cell(fires);
  },
  [HORMONE_EFFECT.output] : r => {
    const level = effectLevel(HORMONE_EFFECT.output, r);
    return input(P.cy, T.input) + output(T.input, P.loud * level, P.thick + P.loud * level) +
           cell(T.input);
  },
  [HORMONE_EFFECT.death] : r => effectLevel(HORMONE_EFFECT.death, r)
                                    ? dying()
                                    : input(P.cy, T.input) + output(T.input) + cell(T.input),
  [HORMONE_EFFECT.rhythm] : r => {
    const swing = effectLevel(HORMONE_EFFECT.rhythm, r);
    return pacer(swing, T.input) + output(T.input, P.loud * swing) + cell(swing ? T.input : []);
  },
  [HORMONE_EFFECT.learning] : r =>
      input(P.cy, [ T.input[0] ], '',
            P.thick + CHANGE.learn * effectLevel(HORMONE_EFFECT.learning, r) / 2) +
      trace(P.cy, T.input[0], .6) + teaching() + output([ T.input[0] ]) + cell([ T.input[0] ]),
  [HORMONE_EFFECT.competition] : r => {
    const level = effectLevel(HORMONE_EFFECT.competition, r), start = 2 * P.thick;
    return input(P.upper, [ T.input[0] ], '', start + CHANGE.compete * level, start) +
           input(P.lower, [], 'still', start - CHANGE.quiet * level, start) +
           output([ T.input[0] ]) + cell([ T.input[0] ]);
  },
  [HORMONE_EFFECT.eligibility] : r => {
    const own = effectLevel(HORMONE_EFFECT.eligibility, r), beat = 1 - own;
    return input(P.upper, [ T.input[0] ], '', P.thick + CHANGE.credit * own) +
           input(P.lower, [ T.beat ], '', P.thick + CHANGE.credit * beat) +
           trace(P.upper, T.input[0], own * .7) + trace(P.lower, T.beat, beat * .7) + pacer() +
           teaching() + output([ T.input[0] ]) + cell([ T.input[0] ]);
  }
});
function taught(colour, ends) {
  const change = CHANGE.learn * (ends.with - ends.without) / 2;
  return (r, withIt) => input(P.cy, [ T.input[0] ], '',
                              withIt && change ? Math.max(P.thick / 2, P.thick + change) : null) +
                        trace(P.cy, T.input[0], .6) +
                        (withIt && change ? line(P.cx, P.top, P.cx, P.cy - P.r, 'teach', 2) +
                                                travelling(way(P.cx, P.top, P.cx, P.cy - P.r),
                                                           T.teach[0] - P.travel, T.teach[0],
                                                           P.pulse * 1.2, P.play, colour)
                                          : '') +
                        output([ T.input[0] ]) + cell([ T.input[0] ]);
}
function modulating(r, withIt) {
  if (!withIt)
    return input(P.cy, T.input) + output(T.input) + cell(T.input);
  return input(P.cy, [ T.input[0] ], '', P.thick + CHANGE.learn) + trace(P.cy, T.input[0], .6) +
         line(P.cx, P.top + P.r, P.cx, P.cy - P.r, 'teach', 2) +
         '<circle class="aid-effect-modulator" cx="' + P.cx + '" cy="' + (P.top + P.r / 2) +
         '" r="' + fixed(P.r / 2) + '"/>' +
         travelling(way(P.cx, P.top + P.r, P.cx, P.cy - P.r), T.teach[0] - P.travel, T.teach[0],
                    P.pulse * 1.2, P.play, 'var(--aid-teach)') +
         output([ T.input[0] ]) + cell([ T.input[0] ]);
}
export const EFFECT_ORDER = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.teaching,
  HORMONE_EFFECT.learning, HORMONE_EFFECT.competition, HORMONE_EFFECT.eligibility,
  HORMONE_EFFECT.rhythm
]);
export const effectScene = (effect, colour, ends = startEnds(effect)) => sideBySide(
    effect === HORMONE_EFFECT.teaching ? taught(colour, ends) : SCENES[effect], colour, ends);
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
export function effectPanel(effect, r, colour, share, baseline = 0) {
  const draw = effect === HORMONE_EFFECT.teaching
                   ? value => taught(colour, {without : baseline, with : value})(value, true)
                   : SCENES[effect];
  return draw ? (share > 0 ? '<circle class="aid-effect-cloud" cx="' + P.cx + '" cy="' + P.cy +
                                 '" r="' + P.r * P.cloud + '" fill="' + colour + '" opacity="' +
                                 fixed(share) + '"/>'
                           : '') +
                    draw(r)
              : '';
}
export const EFFECT_PANEL = Object.freeze({width : P.width, height : P.height});
