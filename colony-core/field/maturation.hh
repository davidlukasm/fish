#pragma once
#include "substrate.hh"
#include <cmath>
#include <stdexcept>

namespace field {
inline constexpr double EMBRYONIC_STEPS = 100;
struct DevelopmentCosts {
  double work_per_tick = 10, neuron_work = 1, edge_work = .0002;
  double neuron_build = .02, edge_build = .00002, edge_length_build = .000005, egg_basal = .025;
  // Keep complex brains near the body's basal cost while charging every cell and wire.
  double neuron_maintenance = .000025, edge_maintenance = .0000001,
         edge_length_maintenance = .00000005;
  void validate() const {
    for (double v :
         {work_per_tick, neuron_work, edge_work, neuron_build, edge_build, edge_length_build,
          egg_basal, neuron_maintenance, edge_maintenance, edge_length_maintenance})
      if (!std::isfinite(v) || v < 0)
        throw std::invalid_argument("invalid development cost");
    if (work_per_tick == 0 || neuron_work == 0 || edge_work == 0)
      throw std::invalid_argument("zero development work");
  }
};
inline DevelopmentCosts scaled_costs(const Options &, DevelopmentCosts c = {}) {
  const double f = 1. / CELL_COPIES;
  c.neuron_work *= f;
  c.neuron_build *= f;
  c.neuron_maintenance *= f;
  return c;
}
class Maturation {
  DevelopmentCosts costs;
  double construction = 0, maintenance = 0, progress_ = 0;
  bool viable_ = false;

public:
  Maturation(std::size_t neurons, std::size_t edges, DevelopmentCosts c = {}) : costs(c) {
    costs.validate();
    const double length = std::sqrt(12.);
    construction = neurons * c.neuron_build + edges * (c.edge_build + length * c.edge_length_build);
    maintenance = neurons * c.neuron_maintenance +
                  edges * (c.edge_maintenance + length * c.edge_length_maintenance);
  }
  Maturation(const Substrate &s, DevelopmentCosts given = {}, bool capable = true)
      : Maturation(s.neurons.size(), s.edges.size(), scaled_costs(s.options, given)) {
    construction = s.neurons.size() * costs.neuron_build + s.edges.size() * costs.edge_build;
    maintenance =
        s.neurons.size() * costs.neuron_maintenance + s.edges.size() * costs.edge_maintenance;
    for (const auto &e : s.edges) {
      const double length = connection_length(s.neurons[e.source], s.neurons[e.target]);
      construction += length * costs.edge_length_build;
      maintenance += length * costs.edge_length_maintenance;
    }
    bool sensor = false, motor = false;
    for (const auto &n : s.neurons)
      if (n.functional) {
        sensor |= n.functions.sensory() > 0;
        motor |= n.functions.motor() > 0;
      }
    viable_ = capable && sensor && motor && !s.resource_limited;
  }
  double advance() {
    progress_ = std::min(1., progress_ + 1 / EMBRYONIC_STEPS);
    return 0;
  }
  double progress() const { return progress_; }
  double completed_work() const { return progress_ * EMBRYONIC_STEPS; }
  double remaining_construction() const { return construction * (1 - progress_); }
  double remaining_cost() const {
    return remaining_construction() +
           (costs.egg_basal + maintenance * .5) * EMBRYONIC_STEPS * (1 - progress_);
  }
  double birth_cost() const {
    return construction + (costs.egg_basal + maintenance * .5) * EMBRYONIC_STEPS;
  }
  void restore(double work) {
    if (!std::isfinite(work) || work < 0 || work > EMBRYONIC_STEPS)
      throw std::runtime_error("invalid maturation state");
    progress_ = work / EMBRYONIC_STEPS;
  }
  bool viable() const { return viable_; }
  bool ready() const { return viable_ && progress_ >= 1; }
  int ticks() const { return int(EMBRYONIC_STEPS); }
  double running_cost() const { return maintenance; }
};
}
