#pragma once
#include "ecology_internal.hh"
#include <iostream>
#include <sstream>
#include <stdexcept>
namespace test {
using namespace fishsim;
// Fixtures set a fish's private motion, brain and development directly.
struct StateAccess {
  static MotorState &motor(Body &b) { return b.motor_; }
  static std::optional<field::Network> &brain(Body &b) { return b.brain_; }
  static std::optional<field::Maturation> &development(Body &b) { return b.development_; }
};
inline void check(bool value, const char *message) {
  if (!value)
    throw std::runtime_error(message);
}
// The whole tank as a checkpoint writes it.
inline std::string saved(const Ecosystem &w) {
  std::ostringstream out;
  w.write(out);
  return out.str();
}
inline void no_mutation(Ecosystem &w) {
  w.evo.mutation = 0;
  auto &r = w.evo.rates;
  r.weight_share = r.add_node = r.duplicate = r.add_connection = r.disable = r.node_edit =
      r.type_change = r.gain_rate = r.lateral_connection = r.step_evolution = r.subgraph_mutation =
          r.gate_insert = r.gate_switch = r.gate_remove = r.transfer = 0;
  w.mutation_burst.strength = 0;
}
// A hatched, grown fish with a finished brain: ADULT_ENERGY reserve and ADULT_TISSUE tissue,
// ADULT_AGE steps old, resting.
inline constexpr double ADULT_SPAWN_ENERGY = 300, ADULT_ENERGY = 260, ADULT_TISSUE = 40;
inline constexpr int ADULT_AGE = 100;
inline Individual &adult(Ecosystem &w, const Genome &g, double x, double y) {
  check(w.spawn(g, x, y, fish_origin::founder, 0, 0, ADULT_SPAWN_ENERGY),
        "adult fixture placement");
  auto &p = w.fish.back();
  p.genome = g;
  StateAccess::brain(p.body).reset();
  StateAccess::development(p.body).reset();
  p.body.prepare(g);
  auto &b = p.body;
  b.hatched = true;
  b.energy = ADULT_ENERGY;
  b.tissue = b.peak_tissue = ADULT_TISSUE;
  b.hatch_age = 0;
  b.age = ADULT_AGE;
  b.angle = StateAccess::motor(b).vx = StateAccess::motor(b).vy = StateAccess::motor(b).speed = 0;
  p.g = 0;
  p.last_spawn = p.last_sperm = 0;
  while (!StateAccess::development(b)->ready())
    StateAccess::development(b)->advance();
  return p;
}
}
