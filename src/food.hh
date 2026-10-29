#pragma once
#include "simulation_types.hh"
namespace fishsim {
// Transient drawing identities never enter checkpoints, randomness or physics.
std::uint64_t next_render_id();
struct Food {
  double x, y, vx = 0, vy = 0;
  std::uint32_t bottom_steps = 0;
  double energy = FOOD_ENERGY;
  std::uint64_t render_id = next_render_id(), age = 0;
  int origin = 0, cloud = -1;
  double radius = 0, initial_energy = 0, decay_age = 0, buoyancy = 1;
  std::array<double, 3> color{1, 0, 0};
  bool drift_plant = false;
  double hardness = 0;
  bool blunt = false, bitten = false;
};
inline constexpr double FOOD_DENSITY = 100; // Energy per radius squared, scaled by 16.
inline double food_radius(double energy) {
  return 4 * std::sqrt(std::max(0., energy) / FOOD_DENSITY);
}
inline double food_radius(const Food &f) {
  return f.radius > 0 ? f.radius : food_radius(f.energy);
}
}
