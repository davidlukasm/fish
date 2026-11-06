import {RGB} from '../../schema.js';
import {CHANNEL_MAX, clamp, hueOf} from '../../units.js';
import {hueQuality, pigmentReflectance, tuningHue} from '../../tuning.js';

const UNPIGMENTED = Object.freeze([ .212, .357, .357 ]);
const TINT = .4;
export const cssColour = rgb =>
    'rgb(' + rgb.map(v => Math.round(CHANNEL_MAX * clamp(v))).join(' ') + ')';
const CHANNELS = Object.keys(RGB).length;
const hasPigment = doc => doc.organs.some(organ => organ.type === 'pigment');

export function fishColours(doc, anatomy) {
  const colour = anatomy?.colour;
  if (!hasPigment(doc) || colour?.skin?.length !== CHANNELS || colour?.rest?.length !== CHANNELS ||
      !colour?.range?.length || !Number.isFinite(colour.restShare))
    return null;
  return colour;
}
export function fishBodyColour(doc, anatomy) {
  const colours = fishColours(doc, anatomy);
  return cssColour(colours ? UNPIGMENTED.map((value, c) => value + (colours.rest[c] - value) * TINT)
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
const KINDS = Object.freeze({
  dark : .35,
  pale : .08,
  hues : [ [ 20, 1 ], [ 70, 2 ], [ 160, 4 ], [ 260, 3 ], [ 330, 4 ], [ 360, 1 ] ],
  melanophore : 0,
  plain : 5
});
export function pigmentKind(rgb) {
  const most = Math.max(...rgb), least = Math.min(...rgb);
  if (most < KINDS.dark)
    return KINDS.melanophore;
  if (most - least < KINDS.pale)
    return KINDS.plain;
  const hue = hueOf(rgb);
  return KINDS.hues.find(([ end ]) => hue < end)[1];
}
