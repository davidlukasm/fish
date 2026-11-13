import {RGB, TIME_CONSTANT, TUNING} from './schema.js';
import {clamp, degrees, radians} from './units.js';

export const HUE_CIRCLE = 2 * TUNING.hue_half_circle;

export const unitOfPlan = value => clamp((value + 1) / 2);
export const planOfUnit = unit => 2 * clamp(unit) - 1;
export const timeConstantSteps = tau => TIME_CONSTANT.min_steps * TIME_CONSTANT.span ** clamp(tau);
export const timeConstantOf = steps =>
    clamp(Math.log(steps / TIME_CONSTANT.min_steps) / Math.log(TIME_CONSTANT.span));
// Steps a sense cell takes to get used to a lasting stimulus (substrate.hh, adaptation_steps).
export const adaptationSteps = tau =>
    TIME_CONSTANT.adaptation_min_steps * TIME_CONSTANT.adaptation_span ** clamp(tau);
export const adaptationOf = steps => clamp(Math.log(steps / TIME_CONSTANT.adaptation_min_steps) /
                                           Math.log(TIME_CONSTANT.adaptation_span));
// Steps a gland's substance stays in the blood after the gland falls silent, from its field width
// (substrate.hh, residence_steps): the same span as getting used to a stimulus.
export const residenceSteps = field => adaptationSteps(field);
export const residenceOf = steps => adaptationOf(steps);
export const LONGEST_ADAPTATION =
    TIME_CONSTANT.adaptation_min_steps * TIME_CONSTANT.adaptation_span;
export const LONGEST_TIME_CONSTANT = TIME_CONSTANT.min_steps * TIME_CONSTANT.span;
export const learningTimeSteps = tau =>
    TIME_CONSTANT.learning_min_steps * TIME_CONSTANT.learning_span ** clamp(tau);
export const learningTimeOf = steps => clamp(Math.log(steps / TIME_CONSTANT.learning_min_steps) /
                                             Math.log(TIME_CONSTANT.learning_span));
export const LONGEST_LEARNING_TIME = TIME_CONSTANT.learning_min_steps * TIME_CONSTANT.learning_span;

export const contactHalfAngle = field =>
    TUNING.contact_width_min + TUNING.contact_width_span * clamp(field);
export const contactFieldOf = half =>
    clamp((half - TUNING.contact_width_min) / TUNING.contact_width_span);

export const tuningSigma = width => TUNING.sigma_min + TUNING.sigma_span * clamp(width) ** 2;
export const tuningWidth = sigma =>
    Math.sqrt(clamp((sigma - TUNING.sigma_min) / TUNING.sigma_span));

export function tuningAffinity(offset, width) {
  const wide = clamp(width) ** TUNING.wide_power, sigma = tuningSigma(width);
  return wide + (1 - wide) * Math.exp(-offset * offset / (2 * sigma * sigma));
}

export function tuningHalfOffset(width) {
  const wide = clamp(width) ** TUNING.wide_power;
  return wide >= .5 ? Infinity
                    : tuningSigma(width) * Math.sqrt(-2 * Math.log((.5 - wide) / (1 - wide)));
}

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
export function preferredScent(tuning) {
  const affinity = scentAffinities(tuning.q1, tuning.q2, tuning.qwidth);
  return affinity.indexOf(Math.max(...affinity));
}
export const scentTuning = k => ({
  q1 : ((TUNING.scent_longitudes[k] + 2 * TUNING.hue_half_circle) % (2 * TUNING.hue_half_circle)) /
               TUNING.hue_half_circle -
           1,
  q2 : Math.sin(radians(TUNING.scent_latitudes[k]))
});

export const tuningHue = quality => TUNING.hue_half_circle * (clamp(quality, -1) + 1);
export const hueQuality = hue => hue / TUNING.hue_half_circle - 1;

export const hueOffset = (hue, from) =>
    ((hue - from) % HUE_CIRCLE + HUE_CIRCLE * 1.5) % HUE_CIRCLE - TUNING.hue_half_circle;

export const hueAffinities = (hue, width) => Object.values(RGB).map(
    channel => tuningAffinity(hueOffset(hue, TUNING.channel_hue * channel), width));

export const pigmentReflectance = (hue, width) => hueAffinities(hue, width).map(a => 1 - a);

const TYPE_COLOUR = Object.freeze({flat : .85, saturation : 72, lightness : 68, plain : '#e8eed8'});
export function typeColour(hue, channels) {
  const most = Math.max(...channels), least = Math.min(...channels);
  return most > 0 && least / most > TYPE_COLOUR.flat
             ? TYPE_COLOUR.plain
             : `hsl(${Math.round(hue)} ${TYPE_COLOUR.saturation}% ${TYPE_COLOUR.lightness}%)`;
}

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
export const thresholdQualityShift = factor => Math.log(factor) / Math.log(TUNING.threshold_range);

export const activationQuality = level => clamp((level - TUNING.level_min) / TUNING.level_span);
export const activationLevel = quality => TUNING.level_min + TUNING.level_span * clamp(quality);
