#pragma once
#include "simulation_types.hh"
namespace fishsim {
inline constexpr Color ALGAE_COLOR{.25, .65, .20};
inline constexpr double ALGAE_BUOYANCY = .2, PLANT_BUOYANCY = -.25;
inline constexpr Color FEED_COLOR{1, .2, .1};
// Flocks of faeces are fine matter that sinks slowly.
inline constexpr Color PLANT_FLOCK_COLOR{.38, .42, .22}, ANIMAL_FLOCK_COLOR{.45, .30, .22};
inline constexpr double FLOCK_BUOYANCY = .4;
// Transient drawing identities never enter checkpoints, randomness or physics.
std::uint64_t next_render_id();
// Faeces that still drift: half digested matter of plant or animal origin.
enum class Residue { none, plant, animal };
struct Food {
  double x, y, vx = 0, vy = 0;
  std::uint32_t bottom_steps = 0;
  double energy = FOOD_ENERGY;
  std::uint64_t render_id = next_render_id(), age = 0;
  int origin = 0, cloud = -1;
  double radius = 0, initial_energy = 0, decay_age = 0, buoyancy = 1;
  Color color{1, 0, 0};
  bool drift_plant = false;
  double hardness = 0;
  bool bitten = false;
  Residue residue = Residue::none;
};
inline constexpr double FOOD_DENSITY = 100; // Energy per radius squared, scaled by 16.
// Plant tissue holds a quarter of the energy feed packs into the same mouthful.
inline constexpr double PLANT_TISSUE_DENSITY = FOOD_DENSITY / 4;
inline constexpr double TISSUE_RADIUS_SCALE = 3;
inline double tissue_radius(double energy, double density) {
  return TISSUE_RADIUS_SCALE * std::sqrt(std::max(0., energy) / density);
}
// Energy of the tissue of this density that just fits a mouth of the given radius.
inline double mouthful(double radius, double density) {
  return density * std::pow(std::max(0., radius) / TISSUE_RADIUS_SCALE, 2);
}
inline double food_radius(double energy) {
  return tissue_radius(energy, FOOD_DENSITY);
}
inline double food_radius(const Food &f) {
  return f.radius > 0 ? f.radius : food_radius(f.energy);
}
}
