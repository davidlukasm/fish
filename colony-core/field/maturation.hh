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
  const double f = 1. / 16;
  c.neuron_work *= f;
  c.neuron_build *= f;
  c.neuron_maintenance *= f;
  return c;
}
// All tissue matures in parallel. Work, time and costs depend on the complete
// phenotype, never on traversal order or the CPPN's number of genes.
class Maturation {
  DevelopmentCosts costs;
  double workload = 0, construction = 0, full_construction = 0, maintenance = 0, progress_ = 0,
         work_done = 0;
  bool viable_ = false;
  std::uint64_t order_seed = 0;

public:
  Maturation(std::size_t neurons, std::size_t edges, DevelopmentCosts c = {}) : costs(c) {
    costs.validate();
    workload = neurons * c.neuron_work + edges * c.edge_work;
    full_construction = construction =
        neurons * c.neuron_build + edges * (c.edge_build + std::sqrt(12.) * c.edge_length_build);
    maintenance = neurons * c.neuron_maintenance +
                  edges * (c.edge_maintenance + std::sqrt(12.) * c.edge_length_maintenance);
  }
  Maturation(const Substrate &s, DevelopmentCosts given = {}, bool capable = true)
      : costs(scaled_costs(s.options, given)) {
    const DevelopmentCosts c = costs;
    order_seed = s.development_seed;
    costs.validate();
    workload = s.neurons.size() * c.neuron_work + s.edges.size() * c.edge_work;
    // a brain needs a developmental phase in the egg, also a very small one (Astra)
    constexpr double EGG_STEPS = 100;
    if (workload > 0)
      costs.work_per_tick = std::min(costs.work_per_tick, workload / EGG_STEPS);
    construction = (s.built_neurons ? s.built_neurons : s.neurons.size()) * c.neuron_build +
                   (s.built_edges ? s.built_edges : s.edges.size()) * c.edge_build;
    if (s.built_edges)
      construction += s.built_length * c.edge_length_build;
    maintenance = s.neurons.size() * c.neuron_maintenance + s.edges.size() * c.edge_maintenance;
    for (const auto &e : s.edges) {
      const auto &a = s.neurons[e.source];
      const auto &b = s.neurons[e.target];
      double length = std::sqrt(double((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) +
                                       (a.z - b.z) * (a.z - b.z)));
      maintenance += c.edge_length_maintenance * length;
      if (!s.built_edges)
        construction += c.edge_length_build * length;
    }
    full_construction = construction;
    bool sensor = false, motor = false;
    for (const auto &n : s.neurons)
      if (n.functional) {
        sensor |= n.functions.sensory() > 0;
        motor |= n.functions.motor() > 0;
      }
    viable_ = capable && sensor && motor && workload > 0 && !s.resource_limited;
  }
  double advance() {
    if (ready())
      return 0;
    if (workload == 0)
      return costs.egg_basal;
    const double before = progress_;
    work_done = std::min(workload, work_done + costs.work_per_tick);
    progress_ = work_done / workload;
    return construction * (progress_ - before) + costs.egg_basal +
           maintenance * (before + progress_) * .5;
  }
  double advance_construction() {
    const double before = progress_;
    advance();
    return construction * (progress_ - before);
  }
  double remaining_construction() const { return construction * (1 - progress_); }
  double progress() const { return progress_; }
  void prepaid_construction(double amount) {
    if (!std::isfinite(amount) || amount < 0)
      throw std::invalid_argument("invalid prepaid construction");
    construction = std::max(0., full_construction - amount);
  }
  // Stable spatial identities define a neutral construction order. No role,
  // vector index or CPPN age input influences which cell is completed first.
  bool neuron_ready(std::uint64_t id) const {
    if (progress_ >= 1)
      return true;
    id ^= order_seed;
    id += 0x9e3779b97f4a7c15ULL;
    id = (id ^ (id >> 30)) * 0xbf58476d1ce4e5b9ULL;
    id = (id ^ (id >> 27)) * 0x94d049bb133111ebULL;
    id ^= id >> 31;
    return double(id >> 11) / 9007199254740992. < progress_;
  }
  double completed_work() const { return work_done; }
  double remaining_cost() const {
    if (workload <= 0 || work_done >= workload)
      return 0;
    const double n = std::ceil((workload - work_done) / costs.work_per_tick),
                 r = costs.work_per_tick / workload;
    return construction * (1 - progress_) + costs.egg_basal * n +
           maintenance * .5 * ((2 * n - 1) * progress_ + r * n * (n - 1) + 1);
  }
  double birth_cost() const {
    if (workload <= 0)
      return 0;
    const double n = std::ceil(workload / costs.work_per_tick), r = costs.work_per_tick / workload;
    return construction + costs.egg_basal * n + maintenance * .5 * (r * n * (n - 1) + 1);
  }
  void restore(double work) {
    if (!std::isfinite(work) || work < 0 || work > workload)
      throw std::runtime_error("invalid maturation state");
    work_done = work;
    progress_ = workload > 0 ? work / workload : 0;
  }
  bool viable() const { return viable_; }
  bool ready() const { return viable_ && progress_ >= 1; }
  int ticks() const { return workload > 0 ? int(std::ceil(workload / costs.work_per_tick)) : 0; }
  double running_cost() const { return maintenance; }
};
}
