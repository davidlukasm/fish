import {RGB, TIME_CONSTANT, TUNING} from './schema.js';
import {clamp, degrees, radians} from './units.js';

// Tuning curves of receptors and pigments, as in src/receptor_tuning.hh. The Aquarium and the
// Atelier draw them with these functions.
export const HUE_CIRCLE = 2 * TUNING.hue_half_circle;

// A time constant (tau in [0, 1]) in steps, as the engine stretches it, the constant of a number
// of steps, and the longest constant.
export const timeConstantSteps = tau => TIME_CONSTANT.min_steps * TIME_CONSTANT.span ** clamp(tau);
export const timeConstantOf = steps =>
    clamp(Math.log(steps / TIME_CONSTANT.min_steps) / Math.log(TIME_CONSTANT.span));
export const LONGEST_TIME_CONSTANT = TIME_CONSTANT.min_steps * TIME_CONSTANT.span;

// The half angle in degrees a contact or spine field opens to, and the field of a half angle.
export const contactHalfAngle = field =>
    TUNING.contact_width_min + TUNING.contact_width_span * clamp(field);
export const contactFieldOf = half =>
    clamp((half - TUNING.contact_width_min) / TUNING.contact_width_span);

// The spread in degrees of a curve of the given width, and the width of a given spread.
export const tuningSigma = width => TUNING.sigma_min + TUNING.sigma_span * clamp(width) ** 2;
export const tuningWidth = sigma =>
    Math.sqrt(clamp((sigma - TUNING.sigma_min) / TUNING.sigma_span));

// A tuning curve of the given width: Gaussian in degrees, with a flat floor for wide curves.
export function tuningAffinity(offset, width) {
  const wide = clamp(width) ** TUNING.wide_power, sigma = tuningSigma(width);
  return wide + (1 - wide) * Math.exp(-offset * offset / (2 * sigma * sigma));
}

// How far from its centre (degrees) a tuning curve of the given width still holds half its
// affinity; Infinity where its floor alone reaches half.
export function tuningHalfOffset(width) {
  const wide = clamp(width) ** TUNING.wide_power;
  return wide >= .5 ? Infinity
                    : tuningSigma(width) * Math.sqrt(-2 * Math.log((.5 - wide) / (1 - wide)));
}

// Affinity to each scent channel. Quality 1 is the longitude and quality 2 the height of a point
// on the scent sphere; channel k sits at TUNING.scent_latitudes[k], TUNING.scent_longitudes[k].
export function scentAffinities(q1, q2, width) {
  const height = clamp(q2, -1), phi = Math.PI * (clamp(q1, -1) + 1),
        rad = Math.sqrt(1 - height * height);
  return TUNING.scent_latitudes.map((latitude, k) => {
    const a = radians(latitude), b = radians(TUNING.scent_longitudes[k]),
          dot = rad * Math.cos(phi) * Math.cos(a) * Math.cos(b) +
                rad * Math.sin(phi) * Math.cos(a) * Math.sin(b) + height * Math.sin(a);
    return tuningAffinity(degrees(Math.acos(clamp(dot, -1))), width);
  });
}
// The scent channel a tuning prefers: the one it binds most.
export function preferredScent(tuning) {
  const affinity = scentAffinities(tuning.q1, tuning.q2, tuning.qwidth);
  return affinity.indexOf(Math.max(...affinity));
}
// The qualities of a tuning aimed straight at scent channel k.
export const scentTuning = k => ({
  q1 : ((TUNING.scent_longitudes[k] + 2 * TUNING.hue_half_circle) % (2 * TUNING.hue_half_circle)) /
               TUNING.hue_half_circle -
           1,
  q2 : Math.sin(radians(TUNING.scent_latitudes[k]))
});

// Hue in degrees from a quality in [-1, 1], and back.
export const tuningHue = quality => TUNING.hue_half_circle * (clamp(quality, -1) + 1);
export const hueQuality = hue => hue / TUNING.hue_half_circle - 1;

// Signed distance in degrees from one hue to another around the hue circle.
export const hueOffset = (hue, from) =>
    ((hue - from) % HUE_CIRCLE + HUE_CIRCLE * 1.5) % HUE_CIRCLE - TUNING.hue_half_circle;

// Affinity of a hue to the three colour channels (red, green, blue CHANNEL_HUE apart).
export const hueAffinities = (hue, width) => Object.values(RGB).map(
    channel => tuningAffinity(hueOffset(hue, TUNING.channel_hue * channel), width));

// A pigment's own colour: what it reflects of each channel, all its tuning does not absorb there
// (as the engine's pigment cells, add_effectors in src/body_plan.cc).
export const pigmentReflectance = (hue, width) => hueAffinities(hue, width).map(a => 1 - a);

// A colour type's colour: the hue it prefers, or white when its colour channels answer alike
// (their least within TYPE_COLOUR.flat of their most).
const TYPE_COLOUR = Object.freeze({flat : .85, saturation : 72, lightness : 68, plain : '#e8eed8'});
export function typeColour(hue, channels) {
  const most = Math.max(...channels), least = Math.min(...channels);
  return most > 0 && least / most > TYPE_COLOUR.flat
             ? TYPE_COLOUR.plain
             : `hsl(${Math.round(hue)} ${TYPE_COLOUR.saturation}% ${TYPE_COLOUR.lightness}%)`;
}

// A colour type's name: the nearest of HUE_CENTRES (hues on the colour wheel, named in that order)
// to the hue it answers to, or light alone (the name after them) when it answers to all colours
// alike; as the index into the names' list.
const HUE_CENTRES = Object.freeze([ 0, 30, 60, 120, 175, 225, 275, 315 ]);
export function typeNameIndex(hue, channels) {
  const most = Math.max(...channels), least = Math.min(...channels);
  if (most > 0 && least / most > TYPE_COLOUR.flat)
    return HUE_CENTRES.length;
  const away = centre => {
    const turn = Math.abs(((hue - centre) % 360 + 360) % 360);
    return Math.min(turn, 360 - turn);
  };
  return HUE_CENTRES.reduce((best, centre, k) => away(centre) < away(HUE_CENTRES[best]) ? k : best,
                            0);
}
// Response thresholds are log-spaced (response_threshold): multiplying one by a factor moves its
// quality in [0, 1] by this much.
export const thresholdQualityShift = factor => Math.log(factor) / Math.log(TUNING.threshold_range);

// Activation levels run linearly from LEVEL_MIN over LEVEL_SPAN (activation_level): the quality in
// [0, 1] of a level.
export const activationQuality = level => clamp((level - TUNING.level_min) / TUNING.level_span);
export const activationLevel = quality => TUNING.level_min + TUNING.level_span * clamp(quality);
