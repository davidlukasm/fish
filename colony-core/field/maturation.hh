#pragma once
#include "substrate.hh"
#include <cmath>
#include <stdexcept>

namespace field {
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
inline double development_credit_limit(const DevelopmentCosts &costs) {
  return std::max(CELL_DEVELOPMENT_INTERVAL * costs.work_per_tick, costs.neuron_work);
}
class EmbryoConstruction {
  DevelopmentCosts costs;
  double total_work_ = 0, completed_work_ = 0, construction = 0, maintenance = 0;
  bool viable_ = false;

public:
  EmbryoConstruction(std::size_t neurons, std::size_t edges, DevelopmentCosts c = {}) : costs(c) {
    costs.validate();
    total_work_ = neurons * c.neuron_work + edges * c.edge_work;
    const double maximum_length = std::sqrt(12.);
    construction =
        neurons * c.neuron_build + edges * (c.edge_build + maximum_length * c.edge_length_build);
    maintenance = neurons * c.neuron_maintenance +
                  edges * (c.edge_maintenance + maximum_length * c.edge_length_maintenance);
  }
  EmbryoConstruction(const Substrate &s, DevelopmentCosts given = {}, bool capable = true)
      : EmbryoConstruction(s.neurons.size(), s.edges.size(), scaled_costs(s.options, given)) {
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
  void advance() { completed_work_ = std::min(total_work_, completed_work_ + costs.work_per_tick); }
  double work_fraction() const { return total_work_ > 0 ? completed_work_ / total_work_ : 1; }
  double completed_work() const { return completed_work_; }
  double remaining_construction() const { return construction * (1 - work_fraction()); }
  double remaining_cost() const {
    if (completed_work_ >= total_work_)
      return 0;
    const double steps = std::ceil((total_work_ - completed_work_) / costs.work_per_tick),
                 rate = costs.work_per_tick / total_work_;
    return remaining_construction() + costs.egg_basal * steps +
           maintenance * .5 * ((2 * steps - 1) * work_fraction() + rate * steps * (steps - 1) + 1);
  }
  double birth_cost() const {
    auto start = *this;
    start.completed_work_ = 0;
    return start.remaining_cost();
  }
  void restore(double work) {
    if (!std::isfinite(work) || work < 0 || work > total_work_)
      throw std::runtime_error("invalid embryo construction state");
    completed_work_ = work;
  }
  bool viable() const { return viable_; }
  bool complete() const { return viable_ && completed_work_ >= total_work_; }
  int work_ticks() const { return int(std::ceil(total_work_ / costs.work_per_tick)); }
  double running_cost() const { return maintenance; }
};
}
