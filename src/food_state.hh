#pragma once
#include "food.hh"
#include "geometry_types.hh"
namespace fishsim {
struct Feeder {
  double x, y, radius = 24, rate = 1;
};
struct FoodCloud {
  Point position; // Fractions of the tank dimensions, also used when resizing.
  double angle = 0, turn = 0;
};
// Food clouds turn by at most MAX_CLOUD_TURN per step.
inline constexpr double MAX_CLOUD_TURN = .00003;
struct Rng;
struct FoodSupply {
  double rate, minimum, maximum, cluster, limit, factor;
};
// Food energies are drawn quadratically between lo and hi: rich pieces are rarer. Mean lo + (hi -
// lo) / 3.
inline double quadratic_draw(double lo, double hi, double u) {
  return lo + (hi - lo) * u * u;
}
inline double quadratic_draw_mean(double lo, double hi) {
  return lo + (hi - lo) / 3;
}
// Food pieces are FOOD_SIZE_MIN to FOOD_SIZE_MAX energy.
constexpr double FOOD_SIZE_MIN = 1, FOOD_SIZE_MAX = 200;
// Food sources wander at most MAX_SOURCE_MOTION.
constexpr double MAX_SOURCE_MOTION = 1000;
struct FoodState {
  double energy_from(int origin) const;
  double energy() const;
  std::size_t count() const;
  Color color(const Food &, double half_life) const;
  double draw_energy(Rng &);
  std::vector<Food> pieces;
  int density = 0;
  std::vector<Feeder> feeders;
  double feeding_factor = 1;
  double food_allowance = PLAUSIBLE_RUNNING; // Unrestricted until the first budget.
  double food_energy_limit = 0;
  double food_supplied = 0;
  double food_decayed = 0;
  double food_initial = 0;
  double food_manual = 0;
  double food_support = 0, food_assisted = 0;
  double nature_average = 0, nature_intake = 0;
  double supply_algae = 0, supply_grass = 0;

  double source_motion = 30; // Pixels per 1,000 simulation steps.
  std::vector<FoodCloud> clouds;
  std::uint64_t drained_food = 0;
  double food_min = 25;
  double food_max = 400;
  double food_bright = 200;
  double food_cluster = 4;
  double food_spread = 20;
  double food_sink = .5;
  bool batch_food = true;
  double indexed_food_radius = 0;
  SpatialGrid grid;
  std::vector<unsigned char> consumed;
};
}
