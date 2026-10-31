#pragma once
#include "ecology_internal.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include "movement.hh"
#include "waterborne.hh"
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>
namespace test {
using namespace fishsim;
struct TestSpermSeed {
  double x, y, energy;
  std::array<double, 3> color;
  double radius = BODY_RADIUS, strength = 1;
};
inline void add_test_sperm(Field &f, const TestSpermSeed &seed) {
  f.sync_food_web();
  const auto &p = f.food_web().plankton;
  auto total = f.sperm_field();
  total.resize(p.energy.size());
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  const double radius = std::max(seed.radius, .5 * std::hypot(dx, dy));
  std::vector<std::pair<std::size_t, double>> weights;
  double sum = 0;
  for (int j = std::max(0, int((seed.y - radius) / dy));
       j <= std::min(p.rows - 1, int((seed.y + radius) / dy)); ++j)
    for (int i = int(std::floor((seed.x - radius) / dx)); i <= int((seed.x + radius) / dx); ++i) {
      const double x = (i + .5) * dx, y = (j + .5) * dy,
                   d = std::hypot(f.delta_x(x - seed.x), y - seed.y);
      const auto at = std::size_t(j * p.columns + (i % p.columns + p.columns) % p.columns);
      if (d <= radius && f.plankton_water_cell(at) && waterborne_path(f, seed.x, seed.y, x, y)) {
        const double w = std::exp(-2 * d * d / (radius * radius));
        weights.push_back({at, w});
        sum += w;
      }
    }
  for (auto [at, w] : weights) {
    auto &q = total[at];
    const double density = seed.energy * seed.strength * w / (sum * dx * dy);
    if (density <= 0)
      continue;
    for (int c = 0; c < 3; ++c)
      q.color[c] = (q.color[c] * q.density + seed.color[c] * density) / (q.density + density);
    q.density += density;
  }
  f.set_sperm_field(std::move(total), .012);
}
inline void recolor_test_sperm(Field &f, std::array<double, 3> color) {
  auto cells = f.sperm_field();
  for (auto &cell : cells)
    if (cell.density > 0)
      cell.color = color;
  f.set_sperm_field(std::move(cells), .012);
}
struct StateAccess {
  static void develop(Ecosystem &w) { w.develop_population(); }
  static void reproduce(Ecosystem &w, bool fertile = true) { w.reproduction(fertile); }
  static FoodWebState &food_web(Field &f) {
    f.food_web_.plankton.nonempty = true; // Direct test writes may introduce the first cell.
    return f.food_web_;
  }
  static std::vector<CurrentSource> &currents(Field &f) { return f.currents_; }
  static const std::vector<CurrentSource> &currents(const Field &f) { return f.currents_; }
  static bool &indexed(Field &f) { return f.indexed_; }
  static const bool &indexed(const Field &f) { return f.indexed_; }
  static double &indexed_body_radius(Field &f) { return f.indexed_body_radius_; }
  static const double &indexed_body_radius(const Field &f) { return f.indexed_body_radius_; }
  static SpatialGrid &body_grid(Field &f) { return f.body_grid_; }
  static const SpatialGrid &body_grid(const Field &f) { return f.body_grid_; }
  static std::vector<Field::OdorSource> &carrion_odor(Field &f) { return f.carrion_odor_; }
  static const std::vector<Field::OdorSource> &carrion_odor(const Field &f) {
    return f.carrion_odor_;
  }
  static std::vector<VisibleBody> &visible(Field &f) { return f.visible_; }
  static const std::vector<VisibleBody> &visible(const Field &f) { return f.visible_; }
  static HormoneState &hormones(Body &b) { return b.hormones_; }
  static EnergyLedger &ledger(Body &b) { return b.ledger_; }
  static const EnergyLedger &ledger(const Body &b) { return b.ledger(); }
  static ReproductionState &reproduction(Body &b) { return b.reproduction_; }
  static const ReproductionState &reproduction(const Body &b) { return b.reproduction(); }
  static MotorState &motor(Body &b) { return b.motor_; }
  static const MotorState &motor(const Body &b) { return b.motor(); }
  static PerceptionState &perception(Body &b) { return b.perception_; }
  static const PerceptionState &perception(const Body &b) { return b.perception(); }
  static std::optional<field::Network> &brain(Body &b) { return b.brain_; }
  static const std::optional<field::Network> &brain(const Body &b) { return b.brain(); }
  static std::optional<field::Maturation> &development(Body &b) { return b.development_; }
  static const std::optional<field::Maturation> &development(const Body &b) {
    return b.development();
  }
  static BehaviorStatistics &observations(Individual &p) { return p.observations_; }
  static const BehaviorStatistics &observations(const Individual &p) { return p.observations(); }

  static const PopulationSupport &support(const Ecosystem &v) { return v.support(); }
  static const SpeciesRegistry &taxonomy(const Ecosystem &v) { return v.taxonomy(); }
  static const WorldStatistics &metrics(const Ecosystem &v) { return v.metrics(); }
  static const PhysiologyParameters &physiology(const Ecosystem &v) { return v.physiology(); }
  static const EnvironmentParameters &env(const Field &v) { return v.env(); }
  static const Water &water(const Field &v) { return v.water(); }
  static const LightState &lighting(const Field &v) { return v.lighting(); }
  static const SedimentState &sediment(const Field &v) { return v.sediment(); }
  static const PlantState &vegetation(const Field &v) { return v.vegetation(); }
  static const GeometryState &geometry(const Field &v) { return v.geometry(); }
  static const FoodState &feeding(const Field &v) { return v.feeding(); }
  static double &sediment(SurfacePatch &p) { return p.sediment; }
  static double sediment(const SurfacePatch &p) { return p.sediment; }

  static FoodState &feeding(Field &f) { return f.feeding_; }
  static GeometryState &geometry(Field &f) { return f.geometry_; }
  static PlantState &vegetation(Field &f) { return f.vegetation_; }
  static SedimentState &sediment(Field &f) { return f.sediment_; }
  static LightState &lighting(Field &f) { return f.lighting_; }
  static Water &water(Field &f) { return f.water_; }
  static EnvironmentParameters &env(Field &f) { return f.env_; }
  static PhysiologyParameters &physiology(Ecosystem &w) { return w.physiology_; }
  static WorldStatistics &metrics(Ecosystem &w) { return w.metrics_; }
  static SpeciesRegistry &taxonomy(Ecosystem &w) { return w.taxonomy_; }
  static PopulationSupport &support(Ecosystem &w) { return w.support_; }
};

inline void advance_test_mouth(Body &b) {
  auto &clock = StateAccess::motor(b).strokes[StrokeSuction].recovery;
  if (clock > 0)
    --clock;
  const bool start = clock == 0;
  if (start)
    clock = 8;
  advance_mouth(b, start && b.eat_signal > 0, start && b.bite_signal > 0, 8, 8);
}

inline void check(bool value, const char *message) {
  if (!value)
    throw std::runtime_error(message);
}
inline bool near(double a, double b) {
  return std::abs(a - b) < 1e-7;
}
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
inline Ecosystem small_world(unsigned seed) {
  Ecosystem w(seed);
  w.resize(615, 410);
  w.set_parameter("fish_energy_density", 4);
  w.workers = 1;
  // These fixtures request release explicitly; organ-capacity gating has separate tests.
  w.evo.egg_organ_capacity = 10;
  StateAccess::physiology(w).neural_cost = StateAccess::physiology(w).basal_metabolism =
      StateAccess::physiology(w).suction_range = 1;
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  StateAccess::physiology(w).sinking = w.field.flow = w.field.gravity =
      StateAccess::env(w.field).energy_supply = 0;
  w.food_burst.strength = w.mutation_burst.strength = 0;
  no_mutation(w);
  w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
  return w;
}
inline field::Neuron sensor(std::uint64_t id, float x, float y, float z = 0, int sense = 0) {
  field::Neuron n{};
  n.id = id;
  n.group = id;
  n.x = x;
  n.y = y;
  n.z = z;
  n.location = {1, (y + 1) * .5f, (z + 1) * .5f, std::min(1.f, std::abs(x)), x < 0 ? -1.f : 1.f, 0};
  n.role = field::Role::Sensor;
  n.functional = true;
  n.hormone_receptors[field::Output].baseline = 1;
  n.strength = 1;
  n.functions.internal = 0;
  n.functions.senses[sense] = 1;
  return n;
}
inline field::Neuron motor(std::uint64_t id, float x, float y, float z, int function,
                           float bias = 0) {
  field::Neuron n{};
  n.id = id;
  n.group = id;
  n.x = x;
  n.y = y;
  n.z = z;
  n.bias = bias;
  n.location = {function == field::Aggression                            ? 0
                : function == field::Suction || function == field::Gland ? 1
                : function == field::Turn || function == field::Bladder  ? 2
                                                                         : 3,
                (y + 1) * .5f,
                (z + 1) * .5f,
                std::min(1.f, std::abs(x)),
                x < 0 ? -1.f : 1.f,
                0};
  n.role = field::Role::Effector;
  n.functional = true;
  n.hormone_receptors[field::Output].baseline = 1;
  n.strength = 1;
  n.functions.internal = 0;
  n.functions.motors[function] = 1;
  return n;
}
// Small explicit organs keep ecological fixtures independent of CPPN search.
inline Genome quiet(const Genome &genes, cppn::CPPN &query) {
  auto tissue = std::make_shared<field::Substrate>(query);
  tissue->neurons.push_back(sensor(1, 0, -.6f));
  for (int function : {field::Forward, field::Eggs, field::Sperm, field::Suction}) {
    auto i = field::NeuronIndex(tissue->neurons.size());
    tissue->neurons.push_back(motor(i + 1, 1.f, .8f, 0, function, -4));
    tissue->edges.push_back({0, i, function == field::Forward ? -.02f : .02f});
  }
  auto other = field::NeuronIndex(tissue->neurons.size());
  tissue->neurons.push_back(motor(other + 1, -.5f, .8f, 0, field::Suction, -4));
  tissue->edges.push_back({0, other, .02f});
  for (int function : {field::Eggs, field::Sperm}) {
    const auto i = field::NeuronIndex(tissue->neurons.size());
    tissue->neurons.push_back(motor(i + 1, 0, .5f, 0, function, -4));
    tissue->edges.push_back({0, i, .02f});
  }
  Genome g = genes;
  g.blueprint = tissue;
  g.interface = body_interface(*tissue);
  check(g.viable(), "biological controller must be viable");
  return g;
}
// Fixtures inject an explicit material request; motor pulse production is tested separately.
inline void fill_material(Ecosystem &, Individual &p) {
  auto &b = p.body;
  StateAccess::reproduction(b).egg_transfer =
      StateAccess::reproduction(b).spawn_signal > 0
          ? StateAccess::reproduction(b).spawn_signal /
                (1 + StateAccess::reproduction(b).spawn_signal)
          : 0;
  StateAccess::reproduction(b).sperm_transfer =
      StateAccess::reproduction(b).sperm_signal > 0 ? StateAccess::reproduction(b).sperm_signal : 0;
}
inline void release_sperm(Ecosystem &w, Individual &p) {
  fill_material(w, p);
  StateAccess::reproduction(p.body).sperm_release =
      StateAccess::reproduction(p.body).sperm_signal <= 0;
  fishsim::fill_sperm(w, p);
}
inline Individual &adult(Ecosystem &w, const Genome &g, double x = 200, double y = 200,
                         unsigned generation = 0) {
  check(w.spawn(g, x, y, generation ? 1 : 0, 0, 0, 300), "adult fixture placement");
  auto &p = w.fish.back();
  p.genome = g;
  StateAccess::brain(p.body).reset();
  StateAccess::development(p.body).reset();
  p.body.prepare(g);
  auto &b = p.body;
  b.hatched = true;
  b.energy = 260;
  b.tissue = b.peak_tissue = 40;
  b.hatch_age = 0;
  b.age = 100;
  b.angle = StateAccess::motor(b).vx = StateAccess::motor(b).vy = StateAccess::motor(b).speed = 0;
  p.g = generation;
  p.last_spawn = p.last_sperm = 0;
  while (!StateAccess::development(b)->ready())
    StateAccess::development(b)->advance();
  return p;
}
inline std::uint64_t egg(Ecosystem &w, const Genome &g, double energy = 800, int origin = 1,
                         unsigned maternal_generation = 2) {
  check(w.spawn(g, 400, 250, origin, 77, 1, energy), "egg fixture placement");
  auto &p = w.fish.back();
  p.fertilised = p.clonal = false;
  p.maternal_species = p.species;
  p.species = 0;
  p.maternal_g = maternal_generation;
  p.maternal_natural = true;
  StateAccess::brain(p.body).reset();
  StateAccess::development(p.body).reset();
  return p.id;
}
inline Individual &individual(Ecosystem &w, std::uint64_t id) {
  auto p = std::find_if(w.fish.begin(), w.fish.end(), [&](const auto &p) { return p.id == id; });
  check(p != w.fish.end(), "expected organism disappeared");
  return *p;
}
inline void fill(Ecosystem &w, std::size_t index = 0) {
  auto &p = w.fish.at(index);
  fill_material(w, p);
  StateAccess::reproduction(p.body).egg_release =
      StateAccess::reproduction(p.body).spawn_signal <= 0;
  if (StateAccess::reproduction(p.body).egg_release)
    StateAccess::reproduction(p.body).egg_laying = true;
  if (auto e = fill_natural_egg(w, w.fish.at(index), std::size_t(w.population_size())))
    w.fish.push_back(std::move(*e));
}
inline FeedingResult feed(Ecosystem &w, std::size_t index = 0, bool protected_life = false) {
  std::vector<VisibleBody> visible;
  for (std::size_t i = 0; i < w.fish.size(); ++i) {
    const auto &b = w.fish[i].body;
    VisibleBody q{};
    q.x = b.x;
    q.y = b.y;
    q.radius = collision_radius(b);
    q.kind = b.hatched ? 1 : 2;
    q.source = i;
    visible.push_back(q);
  }
  for (std::size_t i = 0; i < w.corpses.size(); ++i) {
    VisibleBody q{};
    q.x = w.corpses[i].x;
    q.y = w.corpses[i].y;
    q.radius = corpse_extent(w.corpses[i]);
    q.kind = 3;
    q.source = i;
    visible.push_back(q);
  }
  w.field.index(visible);
  std::vector<unsigned char> bitten(w.fish.size());
  auto &b = w.fish[index].body;
  return w.feeding(index, b.x, b.y, protected_life, bitten, 0);
}

}
