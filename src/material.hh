#pragma once
#include "food_web_parameters.hh"
#include "protocol_schema.hh"
#include "plant_types.hh"
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
// Morph: the integer part is the family, the fraction the variant within it.
inline double morph_variant(double morph) {
  return morph - std::floor(morph);
}
inline constexpr int crab_families = int(fauna::crab_family_size.size());
inline int crab_family(double morph) {
  return std::clamp(int(morph), 0, crab_families - 1);
}
inline double crab_size(double morph) {
  return fauna::crab_family_size[crab_family(morph)] *
         (fauna::crab_size_base + fauna::crab_size_spread * morph_variant(morph));
}
inline double crab_pace(std::uint64_t id, double morph) {
  const double individual = double(id * fauna::crab_hash_factor % fauna::crab_hash_modulus) /
                            (fauna::crab_hash_modulus - 1);
  return fauna::crab_family_pace[crab_family(morph)] *
         (fauna::crab_pace_base + fauna::crab_pace_spread * individual);
}
inline double crab_capacity(double morph, const FoodWebParameters &p) {
  const double size = crab_size(morph);
  return p.crab_energy * size * size;
}
inline double crab_radius(double energy, const FoodWebParameters &p, double morph) {
  return crab_size(morph) *
         (fauna::crab_radius_base +
          fauna::crab_radius_growth *
              std::clamp(energy / (fauna::crab_grown_share * crab_capacity(morph, p)), 0., 1.));
}
// Clearance follows the same depth perspective as the drawing. Feet enter sand;
// their lower envelope always clears the solid supporting surface.
inline double crab_support_height(double radius, double depth, double fraction) {
  if (depth <= seabed::bare_depth)
    return fauna::crab_bare_lift * radius;
  return std::max(
      {depth * fraction, fauna::crab_min_lift * radius,
       fauna::crab_lift_gain * radius / (1 + fauna::crab_lift_flatten * radius / depth)});
}
// Muschelfamilien: Schmal, Lang, Breit, Gerippt, Scheide, Fächer, Zebra.
namespace mussel_form {
inline constexpr int narrow = 0, elongate = 1, broad = 2, ribbed = 3, razor = 4, fan = 5, zebra = 6;
}
inline constexpr int mussel_families = int(fauna::mussel_family_size.size());
inline int mussel_family(double morph) {
  return std::clamp(int(morph), 0, mussel_families - 1);
}
inline double mussel_size(double morph) {
  return fauna::mussel_family_size[mussel_family(morph)] *
         (fauna::mussel_size_base + fauna::mussel_size_spread * morph_variant(morph));
}
inline double mussel_capacity(double morph, const FoodWebParameters &p) {
  return p.mussel_energy * mussel_size(morph) * mussel_size(morph);
}
inline double mussel_radius(double energy, const FoodWebParameters &p, double morph) {
  return fauna::mussel_radius * mussel_size(morph) *
         (1 + std::clamp(energy / mussel_capacity(morph, p), 0., 1.));
}
// Space along the bed follows shell width, rather than its taller upright radius.
inline double mussel_bed_radius(double morph, const FoodWebParameters &p) {
  return std::max(p.mussel_spacing * mussel_size(morph),
                  fauna::mussel_family_width[mussel_family(morph)] *
                      mussel_radius(mussel_capacity(morph, p), p, morph)) /
         2;
}
inline constexpr double mussel_algae_share = .25;
// Flesh colours of the small animals; fauna holds the colours fish and viewers see.
inline constexpr Color WORM_FLESH_COLOR{.85, .15, .12}, CRAB_FLESH_COLOR{.9, .35, .2},
    MUSSEL_FLESH_COLOR{.75, .25, .6};
inline const Color &small_animal_color(int kind) {
  return kind == food_kind::worm   ? fauna::worm_color
         : kind == food_kind::crab ? fauna::crab_color
                                   : fauna::mussel_color;
}
// Front value where a surface carries no sediment.
inline constexpr double BARE_FRONT = .5;
inline double sediment_front(double x, double y, double ax, double ay, double bx, double by,
                             double nx, double ny, double left, double right) {
  const double dx = bx - ax, dy = by - ay,
               along = std::clamp(((x - ax) * dx + (y - ay) * dy) /
                                      std::max(tolerance::negligible, dx * dx + dy * dy),
                                  0., 1.),
               depth = left + along * (right - left), height = (x - ax) * nx + (y - ay) * ny;
  return depth > seabed::bare_depth ? std::clamp(1 - height / depth, 0., 1.) : BARE_FRONT;
}
inline constexpr double worm_head_radius = fauna::worm_head_radius;
// Individual lifespans spread by LIFESPAN_SPREAD around the mean, by a variant in [0, 1].
inline constexpr double LIFESPAN_SPREAD = .4;
inline double individual_lifespan(double lifespan, double variant) {
  return lifespan * (1 - LIFESPAN_SPREAD / 2 + LIFESPAN_SPREAD * variant);
}
inline constexpr int worm_families = int(fauna::worm_family_length.size());
// Fixed individual variation of a worm in [0, 1].
inline double worm_individuality(std::uint64_t id) {
  return double(id * fauna::worm_hash_factor % fauna::worm_hash_modulus) /
         (fauna::worm_hash_modulus - 1);
}
// Share of the sediment depth that covers a buried base.
inline double burial_share(double individual) {
  return fauna::burial_min + fauna::burial_spread * individual;
}
inline double worm_length(std::uint64_t id, double morph) {
  const double v = worm_individuality(id);
  return fauna::worm_length_scale * (fauna::worm_length_min + fauna::worm_length_spread * v * v) *
         fauna::worm_family_length[std::clamp(int(morph), 0, worm_families - 1)];
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
  const double hardness = organ >= plant_organ::leaf
                              ? p.hardness_leaf + p.hardness_leaf_fiber * fiber
                              : p.hardness_stalk + p.hardness_stalk_fiber * fiber;
  return hardness *
         (drift_age >= 0 ? p.drift_softening * std::exp2(-drift_age / p.drift_softening_half) : 1);
}
inline double algae_density(double energy, double length, double thickness) {
  return length > 0 && thickness > 0 ? energy / (length * thickness) : 0;
}
// Largest algae flake a scrape or suction takes; the scraped share grows with the force.
inline constexpr double ALGAE_FLAKE_RADIUS = .5, SCRAPE_FORCE_GAIN = 2;
inline double scraped_algae(double density, double thickness, double force,
                            const FoodWebParameters &p) {
  const double radius = std::min(ALGAE_FLAKE_RADIUS, thickness / 2);
  return density * radius * radius * std::min(1., SCRAPE_FORCE_GAIN * force) *
         crack_success(force, p.hardness_algae, p);
}
// Fragments: about one per FRAGMENT_ENERGY, each between FRAGMENT_MIN_CRUMBS and
// FRAGMENT_MAX_CRUMBS crumbs; shares rise linearly from FRAGMENT_SHARE_MIN by
// FRAGMENT_SHARE_SPREAD.
inline constexpr double FRAGMENT_ENERGY = 6, FRAGMENT_MIN_CRUMBS = 1.25, FRAGMENT_MAX_CRUMBS = 3,
                        FRAGMENT_SHARE_MIN = .8, FRAGMENT_SHARE_SPREAD = .4;
inline std::vector<double> fragment_shares(double energy, double force, double hardness,
                                           const FoodWebParameters &p) {
  if (energy <= 0)
    return {};
  const int desired = int(std::clamp(
      std::max(std::ceil(energy / FRAGMENT_ENERGY),
               p.fragment_min + std::round(p.fragment_gain *
                                           (hardness > 0 ? force / hardness - 1 : p.fragment_max))),
      p.fragment_min, std::max(p.fragment_min, p.fragment_max)));
  // Larger prey produces more edible pieces rather than larger individual chunks.
  const int count = std::max(
      1, std::min(std::max(desired, int(std::ceil(energy / (FRAGMENT_MAX_CRUMBS * p.crumb_min)))),
                  int(std::floor(energy / (FRAGMENT_MIN_CRUMBS * p.crumb_min)))));
  std::vector<double> result(count);
  double sum = 0;
  for (int k = 0; k < count; ++k) {
    result[k] = FRAGMENT_SHARE_MIN + FRAGMENT_SHARE_SPREAD * (k + .5) / count;
    sum += result[k];
  }
  for (auto &share : result)
    share /= sum;
  return result;
}
inline double resting_spine_height(double capacity, double height, double half) {
  return height * capacity / (capacity + half);
}
// Skin without pigment reflects SKIN_REFLECTANCE, a pale grey-green. Pigment dims each channel by
// what it absorbs there, half of it at `half` absorption: a pigment absorbing all channels darkens
// the skin towards black, one absorbing a single channel tints it its colour.
inline constexpr Color SKIN_REFLECTANCE{.62, .66, .64};
inline Color pigment_color(const Color &absorption, double half) {
  Color result{};
  for (int c = 0; c < rgb::count; ++c)
    result[c] = SKIN_REFLECTANCE[c] * half / (half + std::max(0., absorption[c]));
  return result;
}
// Extra drag of fully turbid water.
inline constexpr double TURBIDITY_DRAG = .12;
inline double turbidity_resistance(double turbidity) {
  return 1 + TURBIDITY_DRAG * std::clamp(turbidity, 0., 1.);
}
inline double plant_light(double light) {
  return std::clamp((light - plant_light_floor) / (1 - plant_light_floor), 0., 1.);
}
inline double odor_maturity(double age, const FoodWebParameters &p) {
  return std::clamp(age / p.odor_rise, 0., 1.);
}
}
