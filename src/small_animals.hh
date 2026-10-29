#pragma once
#include "geometry_types.hh"
#include <cstdint>
#include <cmath>
#include <iosfwd>
#include <vector>
namespace fishsim {
struct PlanktonField {
  int columns = 0, rows = 0;
  bool nonempty = false; // Conservative derived flag; it may stay true after feeding.
  double width = 0, height = 0, water_area = 0;
  std::vector<double> energy, scratch, strain;
  std::vector<Point> flow; // Derived once per occupied cell and its immediate neighborhood.
  std::vector<unsigned char> sampled;
  std::vector<Point> sources;  // Persistent positions as fractions of tank dimensions.
  std::vector<double> nursery; // Derived source/rock field; current sediment is checked when used.
  std::vector<std::uint16_t> cooldown;
  std::vector<unsigned char> open, links;
  // Transported odor channels 0–6; channel 7 reads the sperm concentration.
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
  int state = 1, digging = 0;
  double direction = 1, destination = .5, exposure = 1, stride = 0;
  double crossing = 0, crossing_x = 0, crossing_y = 0, crossing_angle = 0;
  double depth = .5;
  AnimalFeeding feeding;
  std::vector<std::uint64_t> path;
};
inline int crab_display_state(const Crab &c) {
  if (c.crossing > 0)
    return 5;
  if (c.state == 0 || c.state == 2)
    return 2;
  return c.exposure < 1 ? 4 : c.state;
}
inline double crab_display_angle(const Crab &c, double target) {
  if (c.crossing <= 0)
    return target;
  const double t = 1 - c.crossing, blend = t * t * (3 - 2 * t);
  return c.crossing_angle + blend * std::remainder(target - c.crossing_angle, 6.283185307179586);
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
struct FoodWebState {
  PlanktonField plankton;
  std::vector<WormHead> heads;
  std::vector<Crab> crabs;
  std::vector<Mussel> mussels;
  std::vector<EmptyShell> shells;
  std::vector<GrazingTrace> grazing; // Bounded display evidence of this step, like combat effects.
  std::vector<std::vector<std::size_t>> neighbors;
  std::uint64_t next_id = 1, geometry = 0;
  double introduced = 0, initial = 0, released = 0, food_eaten = 0, neighbor_gap = -1;
  void write(std::ostream &) const;
  void read(std::istream &);
};
struct SmallAnimalMeal {
  double x = 0, y = 0, radius = 0, energy = 0, hardness = 0, algae_energy = 0;
  int origin = 0;
  std::array<double, 3> color{};
};
}
