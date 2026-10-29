#pragma once
#include "food_web_parameters.hh"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>
namespace fishsim {
inline constexpr double optical_sample_spacing = 16, optical_density_scale = 64;
inline constexpr double plant_light_floor = .08, algae_light_floor = .18;
inline double algae_light(double value) {
  return std::pow(std::clamp((value - algae_light_floor) / (1 - algae_light_floor), 0., 1.), 2);
}
inline double crab_size(double morph) {
  constexpr double sizes[] = {.82, 1.15, .90, 1.};
  return sizes[std::clamp(int(morph), 0, 3)] * (.75 + .5 * (morph - std::floor(morph)));
}
inline double crab_pace(std::uint64_t id, double morph) {
  const double individual = (id * 73 % 257) / 256.;
  constexpr double family[] = {.65, 1.25, .85, 1.05};
  return family[std::clamp(int(morph), 0, 3)] * (.55 + .9 * individual);
}
inline double crab_capacity(double morph, const FoodWebParameters &p) {
  const double size = crab_size(morph);
  return p.crab_energy * size * size;
}
inline double crab_radius(double energy, const FoodWebParameters &p, double morph = 3.5) {
  return crab_size(morph) *
         (5.625 + 3.75 * std::clamp(energy / (.5 * crab_capacity(morph, p)), 0., 1.));
}
// Clearance follows the same depth perspective as the drawing. Feet enter sand;
// their lower envelope always clears the solid supporting surface.
inline double crab_support_height(double radius, double depth, double fraction) {
  if (depth <= .01)
    return 1.025 * radius;
  return std::max({depth * fraction, .82 * radius, 1.23 * radius / (1 + .41 * radius / depth)});
}
inline double mussel_size(double morph) {
  constexpr double sizes[] = {.85, 1.15, 1., .75};
  return sizes[std::clamp(int(morph), 0, 3)] * (.65 + .7 * (morph - std::floor(morph)));
}
inline double mussel_capacity(double morph, const FoodWebParameters &p) {
  return p.mussel_energy * mussel_size(morph) * mussel_size(morph);
}
inline double mussel_radius(double energy, const FoodWebParameters &p, double morph = 2.5) {
  return 6.1875 * mussel_size(morph) * (1 + std::clamp(energy / mussel_capacity(morph, p), 0., 1.));
}
inline double sediment_front(double x, double y, double ax, double ay, double bx, double by,
                             double nx, double ny, double left, double right) {
  const double dx = bx - ax, dy = by - ay,
               along = std::clamp(
                   ((x - ax) * dx + (y - ay) * dy) / std::max(1e-9, dx * dx + dy * dy), 0., 1.),
               depth = left + along * (right - left), height = (x - ax) * nx + (y - ay) * ny;
  return depth > .01 ? std::clamp(1 - height / depth, 0., 1.) : .5;
}
inline constexpr double worm_head_radius = .72;
inline double worm_length(std::uint64_t id, double morph) {
  const double v = (id * 37 % 101) / 100.;
  return .8 * (6 + 19 * v * v) * (int(morph) == 0 ? .75 : int(morph) == 2 ? 1.25 : 1.);
}
inline double effective_force(double raw, double maximum) {
  raw = std::max(0., raw);
  return raw / (raw + maximum);
}
inline double crack_success(double force, double hardness, const FoodWebParameters &p) {
  if (force <= 0)
    return 0;
  if (hardness <= 0)
    return 1;
  return 1 / (1 + std::pow(hardness / force, p.crack_exponent));
}
inline double plant_bite_hardness(int organ, double fiber, const FoodWebParameters &p,
                                  double drift_age = -1) {
  const double hardness = organ >= 2 ? p.hardness_leaf + p.hardness_leaf_fiber * fiber
                                     : p.hardness_stalk + p.hardness_stalk_fiber * fiber;
  return hardness *
         (drift_age >= 0 ? p.drift_softening * std::exp2(-drift_age / p.drift_softening_half) : 1);
}
inline double algae_density(double energy, double length, double thickness) {
  return length > 0 && thickness > 0 ? energy / (length * thickness) : 0;
}
inline double scraped_algae(double density, double thickness, double force,
                            const FoodWebParameters &p) {
  const double radius = std::min(.5, thickness / 2);
  return density * radius * radius * std::min(1., 2 * force) *
         crack_success(force, p.hardness_algae, p);
}
inline std::vector<double> fragment_shares(double energy, double force, double hardness,
                                           const FoodWebParameters &p) {
  if (energy <= 0)
    return {};
  const int desired = int(std::clamp(
      std::max(std::ceil(energy / 6.),
               p.fragment_min + std::round(p.fragment_gain *
                                           (hardness > 0 ? force / hardness - 1 : p.fragment_max))),
      p.fragment_min, std::max(p.fragment_min, p.fragment_max)));
  // Larger prey produces more edible pieces rather than larger individual chunks.
  const int count =
      std::max(1, std::min(std::max(desired, int(std::ceil(energy / (3 * p.crumb_min)))),
                           int(std::floor(energy / (1.25 * p.crumb_min)))));
  std::vector<double> result(count);
  double sum = 0;
  for (int k = 0; k < count; ++k) {
    result[k] = .8 + .4 * (k + .5) / count;
    sum += result[k];
  }
  for (auto &share : result)
    share /= sum;
  return result;
}
inline double resting_spine_height(double capacity, double height, double half) {
  return height * capacity / (capacity + half);
}
inline std::array<double, 3> pigment_color(const std::array<double, 3> &absorption, double half) {
  const double capacity = absorption[0] + absorption[1] + absorption[2];
  std::array<double, 3> result{};
  for (int c = 0; c < 3; ++c)
    result[c] = 1 - absorption[c] / (capacity + half);
  return result;
}
inline double turbidity_resistance(double turbidity) {
  return 1 + .12 * std::clamp(turbidity, 0., 1.);
}
inline double plant_light(double light) {
  return std::clamp((light - plant_light_floor) / (1 - plant_light_floor), 0., 1.);
}
inline double odor_maturity(double age, const FoodWebParameters &p) {
  return std::clamp(age / p.odor_rise, 0., 1.);
}
}
