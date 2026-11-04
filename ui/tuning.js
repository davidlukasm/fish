import {RGB, TUNING} from './schema.js';

// Tuning curves of receptors and pigments, as in src/receptor_tuning.hh. The Aquarium and the
// Atelier draw them with these functions.
const clampUnit = (value, low = 0) => Math.max(low, Math.min(1, value));
export const HUE_CIRCLE = 2 * TUNING.hue_half_circle;

// The spread in degrees of a curve of the given width, and the width of a given spread.
export const tuningSigma = width => TUNING.sigma_min + TUNING.sigma_span * clampUnit(width) ** 2;
export const tuningWidth = sigma =>
    Math.sqrt(clampUnit((sigma - TUNING.sigma_min) / TUNING.sigma_span));

// A tuning curve of the given width: Gaussian in degrees, with a flat floor for wide curves.
export function tuningAffinity(offset, width) {
  const wide = clampUnit(width) ** TUNING.wide_power, sigma = tuningSigma(width);
  return wide + (1 - wide) * Math.exp(-offset * offset / (2 * sigma * sigma));
}

// Hue in degrees from a quality in [-1, 1], and back.
export const tuningHue = quality => TUNING.hue_half_circle * (clampUnit(quality, -1) + 1);
export const hueQuality = hue => hue / TUNING.hue_half_circle - 1;

// Signed distance in degrees from one hue to another around the hue circle.
export const hueOffset = (hue, from) =>
    ((hue - from) % HUE_CIRCLE + HUE_CIRCLE * 1.5) % HUE_CIRCLE - TUNING.hue_half_circle;

// Affinity of a hue to the three colour channels (red, green, blue CHANNEL_HUE apart).
export const hueAffinities = (hue, width) => Object.values(RGB).map(
    channel => tuningAffinity(hueOffset(hue, TUNING.channel_hue * channel), width));

// Response thresholds are log-spaced (response_threshold): multiplying one by a factor moves its
// quality in [0, 1] by this much.
export const thresholdQualityShift = factor => Math.log(factor) / Math.log(TUNING.threshold_range);
