#pragma once
#include "geometry_types.hh"
#include "material.hh"
#include <cstdint>
#include <cmath>
#include <iosfwd>
#include <map>
#include <vector>
namespace fishsim {
namespace cell_side {
inline constexpr int left = 0, right = 1, up = 2, down = 3, count = 4;
}
inline constexpr int side_dx(int side) {
  return side == cell_side::left ? -1 : side == cell_side::right ? 1 : 0;
}
inline constexpr int side_dy(int side) {
  return side == cell_side::up ? -1 : side == cell_side::down ? 1 : 0;
}
inline constexpr bool side_linked(unsigned links, int side) {
  return links & (1u << side);
}
template <class Index> constexpr Index cell_neighbor(Index at, int side, Index columns) {
  const Index x = at % columns, y = at / columns;
  return side == cell_side::left    ? y * columns + (x + columns - 1) % columns
         : side == cell_side::right ? y * columns + (x + 1) % columns
         : side == cell_side::up    ? at - columns
                                    : at + columns;
}
namespace animal_store {
inline constexpr int plankton = 0, worms = 1, crabs = 2, mussels = 3, detritus = 4, count = 5,
                     animals = 4;
}
inline constexpr int store_food_kind(int store) {
  return food_kind::plankton + store;
}
inline constexpr int CRAB_FEEDING_STEPS = 18, CRAB_PLANT_FEEDING_STEPS = 22;
inline constexpr double CRAB_FOOTING = .35, CRAB_SITE_MARGIN = .1, CRAB_END_MARGIN = .02;
inline constexpr double GRAZING_TRACE_CELL = 8;
inline constexpr std::size_t MAX_GRAZING_TRACES = 32;
inline constexpr std::size_t MAX_EMPTY_SHELLS = 128;
inline constexpr std::size_t MAX_PLANKTON_SOURCES = 256;
inline constexpr int SHELL_LIFETIME = 1600;
struct PlanktonField {
  int columns = 0, rows = 0;
  bool nonempty = false; // Conservative derived flag; it may stay true after feeding.
  double width = 0, height = 0, water_area = 0;
  std::vector<double> energy, scratch, strain;
  std::vector<Point> flow;
  std::vector<unsigned char> sampled;
  std::vector<Point> sources;  // Persistent positions as fractions of tank dimensions.
  std::vector<double> nursery; // Derived source/rock field; current sediment is checked when used.
  std::vector<std::uint16_t> cooldown;
  std::vector<unsigned char> open, links;
  std::vector<float> odor, odor_scratch;
};
struct WormHead {
  std::uint64_t id = 0, patch = 0, age = 0, duration = 0;
  double x = 0, y = 0, energy = 0, along = .5, base_x = 0, base_y = 0;
  double extension = 0, morph = 0, ground = 1;
  bool withdrawing = false;
  double filter_rate = 0;
};
struct AnimalFeeding {
  double rate = 0, x = 0, y = 0;
  int kind = 0, remaining = 0;
};
struct Crab {
  std::uint64_t id = 0, patch = 0, target = 0, age = 0, next_move = 0, exposed_age = 0;
  double x = 0, y = 0, energy = 0, along = .5, morph = .5;
  int state = crab_state::foraging, digging = 0;
  double direction = 1, destination = .5, exposure = 1, stride = 0;
  double crossing = 0, crossing_x = 0, crossing_y = 0, crossing_angle = 0;
  double depth = .5;
  int stalled = 0; // Steps in the open without getting anywhere (not saved; restarts at 0).
  AnimalFeeding feeding;
  std::vector<std::uint64_t> path;
};
inline bool crab_walking(const Crab &c) {
  return c.state == crab_state::foraging || c.state == crab_state::fleeing;
}
inline bool crab_hidden(const Crab &c) {
  return c.state == crab_state::buried || c.state == crab_state::digging;
}
inline int crab_display_state(const Crab &c) {
  if (c.crossing > 0)
    return crab_state::crossing;
  if (crab_hidden(c))
    return crab_state::digging;
  return c.exposure < 1 ? crab_state::emerging : c.state;
}
inline double crab_display_angle(const Crab &c, double target) {
  if (c.crossing <= 0)
    return target;
  const double t = 1 - c.crossing, blend = t * t * (3 - 2 * t);
  return c.crossing_angle + blend * std::remainder(target - c.crossing_angle, 2 * PI);
}
struct Mussel {
  std::uint64_t id = 0, patch = 0, age = 0, buried = 0;
  double along = .5, x = 0, y = 0, energy = 0, morph = 2.5;
  int closed = 0;
  double filtered = 0, filter_rate = 0;
};
struct EmptyShell {
  std::uint64_t id = 0;
  double x = 0, y = 0, radius = 0, morph = 0, angle = 0;
  int age = 0;
};
struct GrazingTrace {
  double x = 0, y = 0, radius = 0, amount = 0;
};
inline constexpr std::uint64_t GRAZING_TRACE_IDS = 9000000000000ULL, GRAZING_TRACE_ROW = 65536;
inline constexpr double GRAZING_TRACE_MIN_RADIUS = .5;
inline std::uint64_t grazing_trace_id(const GrazingTrace &g) {
  const auto cell = [](double v) {
    return std::uint64_t(std::max(0., std::floor(v / GRAZING_TRACE_CELL)));
  };
  return GRAZING_TRACE_IDS + cell(g.x) + GRAZING_TRACE_ROW * cell(g.y);
}
inline double grazing_trace_radius(const GrazingTrace &g) {
  return std::max(GRAZING_TRACE_MIN_RADIUS, g.radius);
}
struct FoodWebState {
  PlanktonField plankton;
  std::vector<WormHead> heads;
  std::vector<Crab> crabs;
  std::vector<Mussel> mussels;
  std::vector<EmptyShell> shells;
  std::vector<GrazingTrace> grazing;
  std::vector<std::vector<std::size_t>> neighbors;
  std::map<std::uint64_t, std::size_t> patches;
  std::uint64_t next_id = 1, geometry = 0;
  double introduced = 0, initial = 0, released = 0, food_eaten = 0, neighbor_gap = -1;
  void write(std::ostream &) const;
  void read(std::istream &);
};
struct SmallAnimalMeal {
  double x = 0, y = 0, radius = 0, energy = 0, hardness = 0, algae_energy = 0;
  int origin = 0;
  Color color{};
};
}
