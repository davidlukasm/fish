import {RGB} from '../../schema.js';
import {CHANNEL_MAX, clamp} from '../../units.js';
import {hueQuality, pigmentReflectance, tuningHue} from '../../tuning.js';

const UNPIGMENTED = Object.freeze([ .212, .357, .357 ]);
const TINT = .4;
export const cssColour = rgb =>
    'rgb(' + rgb.map(v => Math.round(CHANNEL_MAX * clamp(v))).join(' ') + ')';
const CHANNELS = Object.keys(RGB).length;
const hasPigment = doc => doc.organs.some(organ => organ.type === 'pigment');

export function fishColours(doc, anatomy) {
  const colour = anatomy?.colour;
  if (!hasPigment(doc) || colour?.skin?.length !== CHANNELS || !(colour?.range?.length > 1))
    return null;
  return colour;
}
// The fish's body in the fish panel. At rest the pigment is gathered: the first colour of the
// range. It only tints the body, so that the organs on it stay readable; `full` shows the colour
// itself.
export function fishBodyColour(doc, anatomy, full = false) {
  const colours = fishColours(doc, anatomy), share = full ? 1 : TINT;
  return cssColour(
      colours ? UNPIGMENTED.map((value, c) => value + (colours.range[0][c] - value) * share)
              : UNPIGMENTED);
}
const PIGMENT_STARTS = Object.freeze([ [ 240, .45 ], [ 180, .65 ], [ 60, .6 ], [ 0, 1 ] ]);
const NEAR = .05;
export function nextPigment(centers) {
  const starts = PIGMENT_STARTS.map(([ hue, qwidth ]) => ({q1 : hueQuality(hue), qwidth}));
  return starts.find(s => !centers.some(c => Math.abs(c.q1 - s.q1) < NEAR &&
                                             Math.abs(c.qwidth - s.qwidth) < NEAR)) ??
         starts[0];
}
export const pigmentColour = center => pigmentReflectance(tuningHue(center.q1), center.qwidth);
