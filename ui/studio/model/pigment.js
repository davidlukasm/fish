import {hueAffinities, tuningHue} from '../../tuning.js';

// A design without pigment cells, or before the engine has painted it, shows in this neutral
// tone: the drawing is a plan, not a portrait. With pigment, the drawing's body takes TINT of
// the way towards the fish's colour at rest, so the organs on it stay readable.
export const UNPIGMENTED = Object.freeze([ .212, .357, .357 ]);
const TINT = .4;
export const cssColour = rgb =>
    'rgb(' + rgb.map(v => Math.round(255 * Math.max(0, Math.min(1, v)))).join(' ') + ')';
const hasPigment = doc => doc.organs.some(organ => organ.type === 'pigment');

// The fish's colours as the engine paints it (the design view's `colour`): its skin without
// pigment, at rest and with all pigment cells fully active; null before the engine has answered
// or without pigment cells.
export function fishColours(doc, anatomy) {
  const colour = anatomy?.colour;
  if (!hasPigment(doc) || !['skin', 'rest', 'raised'].every(key => colour?.[key]?.length === 3))
    return null;
  return colour;
}
// The drawing's body.
export function fishBodyColour(doc, anatomy) {
  const colours = fishColours(doc, anatomy);
  return cssColour(colours ? UNPIGMENTED.map((value, c) => value + (colours.rest[c] - value) * TINT)
                           : UNPIGMENTED);
}
// The colour a pigment cell gives the skin at full depth, as the engine's pigment colour tends
// to it: each channel of the skin (`skin`, the engine's) less the cell's share of absorption in
// it, which follows its hue kernel.
export function pigmentHue(center, skin) {
  const weights = hueAffinities(tuningHue(center.q1), center.qwidth);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return cssColour(skin.map((value, c) => value * (1 - weights[c] / total)));
}
