#pragma once
#include "protocol_schema.hh"
#include "small_animals.hh"
#include <algorithm>
#include <array>
#include <cmath>
namespace fishsim {
// Tuning of receptors and pigments; the viewer uses the same constants (tuning).
inline double degrees(double radians) {
  return radians * 180 / PI;
}
inline double radians(double degrees) {
  return degrees * PI / 180;
}
// A tuning curve of the given width: Gaussian in degrees, with a flat floor for wide curves.
inline double tuning_affinity(double offset_degrees, double width) {
  width = std::clamp(width, 0., 1.);
  const double sigma = tuning::sigma_min + tuning::sigma_span * width * width,
               wide = std::pow(width, tuning::wide_power);
  return wide + (1 - wide) * std::exp(-offset_degrees * offset_degrees / (2 * sigma * sigma));
}
// Hue in degrees from a quality in [-1, 1].
inline double tuning_hue(double quality) {
  return tuning::hue_half_circle * (std::clamp(quality, -1., 1.) + 1);
}
// Affinity of a hue to the three colour channels (red, green, blue at CHANNEL_HUE apart).
inline std::array<double, 3> hue_affinities(double hue, double width) {
  std::array<double, 3> result{};
  for (int c = 0; c < 3; ++c)
    result[c] = tuning_affinity(
        std::remainder(hue - tuning::channel_hue * c, 2 * tuning::hue_half_circle), width);
  return result;
}
// Affinity to each odour channel; channels sit at fixed points on a sphere of preferences.
inline std::array<float, odor_channel_count> scent_affinities(double quality1, double quality2,
                                                              double width) {
  static_assert(tuning::scent_latitudes.size() == std::size_t(odor_channel_count));
  const double height = std::clamp(quality2, -1., 1.),
               phi = PI * (std::clamp(quality1, -1., 1.) + 1), rad = std::sqrt(1 - height * height);
  std::array<float, odor_channel_count> result{};
  for (int c = 0; c < odor_channel_count; ++c) {
    const double latitude = radians(tuning::scent_latitudes[c]),
                 longitude = radians(tuning::scent_longitudes[c]),
                 dot = rad * std::cos(phi) * std::cos(latitude) * std::cos(longitude) +
                       rad * std::sin(phi) * std::cos(latitude) * std::sin(longitude) +
                       height * std::sin(latitude);
    result[c] = float(tuning_affinity(degrees(std::acos(std::clamp(dot, -1., 1.))), width));
  }
  return result;
}
// Response threshold of chemical and visual receptors, log-spaced from THRESHOLD_MIN.
inline double response_threshold(double t) {
  return tuning::threshold_min * std::pow(tuning::threshold_range, std::clamp(t, 0., 1.));
}
inline double response_threshold_quality(double threshold) {
  return std::log(std::max(tuning::threshold_min, threshold) / tuning::threshold_min) /
         std::log(tuning::threshold_range);
}
// Linear activation level from a quality in [0, 1].
inline double activation_level(double t) {
  return tuning::level_min + tuning::level_span * t;
}
inline double activation_level_quality(double level) {
  return (level - tuning::level_min) / tuning::level_span;
}
// Angular widths (radians) of receptor fields, visual fields and contact kernels.
inline double receptor_width(double w) {
  return radians(tuning::receptor_width_min + tuning::receptor_width_span * w);
}
inline double visual_width(double w) {
  return radians(tuning::visual_width_min *
                 std::pow(double(tuning::visual_width_max) / tuning::visual_width_min, w));
}
inline double contact_width(double w) {
  return radians(tuning::contact_width_min + tuning::contact_width_span * w);
}
}
