import {clamp, hueOf} from '../../units.js';
import {hueQuality, pigmentReflectance, tuningHue} from '../../tuning.js';

// A design without pigment cells, or before the engine has painted it, shows in this neutral
// tone: the drawing is a plan, not a portrait. With pigment, the drawing's body takes TINT of
// the way towards the fish's ground colour, so the organs on it stay readable.
const UNPIGMENTED = Object.freeze([ .212, .357, .357 ]);
const TINT = .4;
export const cssColour = rgb => 'rgb(' + rgb.map(v => Math.round(255 * clamp(v))).join(' ') + ')';
const hasPigment = doc => doc.organs.some(organ => organ.type === 'pigment');

// The fish's colours as the engine paints it (the design view's `colour`): its skin without
// pigment, its colours from the pigment gathered to spread fully (`range`), its ground colour at
// rest and how far along the range that lies; null before the engine has answered or without
// pigment cells.
export function fishColours(doc, anatomy) {
  const colour = anatomy?.colour;
  if (!hasPigment(doc) || colour?.skin?.length !== 3 || colour?.rest?.length !== 3 ||
      !colour?.range?.length || !Number.isFinite(colour.restShare))
    return null;
  return colour;
}
// The drawing's body.
export function fishBodyColour(doc, anatomy) {
  const colours = fishColours(doc, anatomy);
  return cssColour(colours ? UNPIGMENTED.map((value, c) => value + (colours.rest[c] - value) * TINT)
                           : UNPIGMENTED);
}
// The pigments new kinds of cell start with, the first not yet among the organ's: yellow (it
// absorbs blue), red (green and blue), blue (red and green), dark (all), each as the absorbed
// hue in degrees and how broadly it absorbs.
const PIGMENT_STARTS = Object.freeze([ [ 240, .45 ], [ 180, .65 ], [ 60, .6 ], [ 0, 1 ] ]);
const NEAR = .05;
export function nextPigment(centers) {
  const starts = PIGMENT_STARTS.map(([ hue, qwidth ]) => ({q1 : hueQuality(hue), qwidth}));
  return starts.find(s => !centers.some(c => Math.abs(c.q1 - s.q1) < NEAR &&
                                             Math.abs(c.qwidth - s.qwidth) < NEAR)) ??
         starts[0];
}
// A pigment cell's own colour, as the engine gives it.
export const pigmentColour = center => pigmentReflectance(tuningHue(center.q1), center.qwidth);
// What kind of pigment cell a pigment colour makes, as real animals have them: a dark one (all of
// its channels below KINDS.dark) a melanophore, otherwise by the hue it shows (KINDS' hues, ending
// where each next begins): red an erythrophore, yellow a xanthophore, blue a cyanophore, others
// a pigment cell of their colour; the index into the kinds' names.
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
