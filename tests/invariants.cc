#include "test_support.hh"
#include "field/retinal_tissue.hh"
#include "field/development_sites.hh"
#include "physiology.hh"
#include "movement.hh"
#include "ecology_internal.hh"
#include "plants.hh"
#include <algorithm>
#include <map>
#include <set>
using namespace test;
namespace {
constexpr unsigned SEED = 4242;
constexpr int FISH = 4, STEPS = 120;
constexpr double FIRST_X = 200, SPACING = 300, DEPTH = 200;
void initial_plants_use_the_available_energy() {
  for (double budget : {0., 100., 10000.}) {
    Field f(SEED, 0);
    f.index_geometry();
    f.set_energy_headroom(budget);
    f.seed_plants();
    const double planted = f.grass_energy() + f.algae_energy();
    check(planted <= budget + tolerance::precision,
          "initial plant growth stays inside the available world budget");
    check(std::abs(planted + f.energy_available - budget) < tolerance::precision,
          "initial biomass is deducted from the free energy");
    check(budget == 0 || f.grass_energy() > 0, "funded initial plants exist");
  }
}
void herbivores_start_at_reachable_leaves() {
  const auto g = Genome::load("genomes/handbau/alva.genome");
  check(g.viable() && g.interface->gut_length > .99, "Alva has a viable herbivore anatomy");
  Ecosystem w(SEED);
  w.starter_world();
  check(w.field.grass_energy() > 1000, "the aquarium starts with grown plant biomass");
  no_mutation(w);
  w.seed({g}, 6, run_limit::default_food);
  check(w.fish.size() == 6, "herbivore founders can be placed before their brains develop");
  double distances = 0;
  for (const auto &p : w.fish) {
    check(w.field.sediment_immersion(p.body.x, p.body.y, collision_radius(p.body)) == 0,
          "plant founders start outside sediment");
    double nearest = std::numeric_limits<double>::infinity();
    bool facing = false;
    for (const auto &part : w.field.vegetation().plants)
      if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
          part.energy > w.field.env().seed_energy) {
        const double dx = w.field.delta_x(part.x - p.body.x), dy = part.y - p.body.y,
                     distance = stroke_distance(part, dx, dy);
        nearest = std::min(nearest, distance);
        facing |= distance < 80 && dx * std::cos(p.body.angle) + dy * std::sin(p.body.angle) > 0;
      }
    distances += nearest;
    check(facing, "plant founders face nearby edible foliage");
  }
  check(distances / w.fish.size() < 40, "herbivores start near leaves rather than pellet clouds");
  Ecosystem empty(SEED);
  no_mutation(empty);
  empty.seed({g}, 1, run_limit::default_food);
  check(empty.fish.size() == 1, "an aquarium without plants still accepts herbivore founders");
}
void compact_founders_use_their_actual_reservation(const Genome &g) {
  Ecosystem w(SEED);
  w.starter_world();
  w.neural_budget = 1000000;
  constexpr int COUNT = 24;
  w.seed({g}, COUNT, run_limit::default_food);
  check(w.fish.size() == COUNT, "compact founders fit their actual neural budget");
  check(connection_storage(w) <= w.neural_budget, "the resolved reservation remains bounded");
  for (const auto &p : w.fish)
    check(p.genome.blueprint && !p.body.brain() && !p.body.hatched && p.body.age == 0,
          "startup resolves individual anatomy while neural construction still begins in the egg");
}
void start_fish_uses_external_vision_when_mature(const Genome &g) {
  Body hatchling;
  hatchling.prepare(g);
  hatchling.tissue = hatchling.peak_tissue = tissue_capacity(hatchling);
  field::Network brain(g.blueprint);
  brain.set_maturity(body_maturity(hatchling));
  brain.set_plasticity(false);
  std::vector<float> input(g.interface->sensory.size(), 0);
  field::Hormones mature_hormones{};
  mature_hormones[0] = .25;
  for (int tick = 0; tick < 256; ++tick) {
    brain.step(input, mature_hormones, SEED);
    for (const auto &cell : brain.retinal_state())
      check(cell.activity == 0, "mature start fish suppresses spontaneous retinal waves");
  }
  std::fill(input.begin(), input.end(), .7f);
  brain.step(input, mature_hormones, SEED);
  bool sees = false;
  for (const auto &r : g.interface->sensory)
    if (r.channel == field::Light) {
      sees = true;
      check(brain.signal(r.neuron) > .6f, "retinal wave inhibition preserves external vision");
    }
  check(sees, "start fish has retinal cells");
}
void start_fish_eats_nearby_food(const Genome &g) {
  constexpr double X = 300, Y = 205, DISTANCE = 8, FOOD = 80;
  constexpr int SETTLE = 200, RESPONSE = 80;
  for (double tissue : {HATCH_TISSUE, BODY_TISSUE})
    for (bool erased : {false, true}) {
      Ecosystem w(SEED);
      w.resize(615, 410);
      w.safety = false;
      w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
      w.set_parameter("energy_supply", 0);
      w.food_burst.strength = 0;
      w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
      w.field.clear_food();
      const auto id = adult(w, g, X, Y).id;
      auto hold = [&] {
        auto &b = individual(w, id).body;
        b.x = X;
        b.y = Y;
        b.angle = 0;
        b.tissue = b.peak_tissue = tissue;
        auto &m = StateAccess::motor(b);
        m.vx = m.vy = m.speed = m.angular_velocity = 0;
      };
      for (int tick = 0; tick < SETTLE; ++tick) {
        hold();
        w.tick(false);
      }
      check(individual(w, id).body.nutrition == 0, "feeding trial starts without food");
      if (erased)
        StateAccess::brain(individual(w, id).body) =
            individual(w, id).body.brain()->ablated_probe();
      for (int tick = 0; tick < 2 * MAX_STROKE_STEPS; ++tick) {
        hold();
        w.tick(false);
      }
      Food food{X + DISTANCE, Y, 0, 0, 0, FOOD};
      food.initial_energy = FOOD;
      food.color = FEED_COLOR;
      food.radius = food_radius(FOOD);
      w.field.append_fragment(food);
      for (int tick = 0; tick < RESPONSE; ++tick) {
        hold();
        w.tick(false);
      }
      std::cout << "Futter " << tissue << (erased ? " nach Ablation: " : " gelernt: ")
                << individual(w, id).body.nutrition << "\n";
      check(erased ? individual(w, id).body.nutrition == 0 : individual(w, id).body.nutrition > 1,
            "young and adult fish eat with acquired weights; erasing only weights removes feeding");
    }
}
void nonvisual_input_reaches_the_brain(const Genome &g) {
  Ecosystem w(SEED);
  auto &p = adult(w, g, FIRST_X, DEPTH);
  SensoryProbe probe;
  probe.kind = probe_kind::sense;
  probe.sense = field::Touch;
  probe.value = .8;
  probe.remaining = 1;
  p.body.set_probe(probe);
  advance_body(p.body, p.genome, &w.field, w.physiology(), false);
  bool touched = false;
  const auto &receptors = p.body.active_interface(g).sensory;
  for (std::size_t i = 0; i < receptors.size(); ++i)
    if (receptors[i].channel == field::Touch) {
      touched = true;
      check(p.body.perception().sensor_buffer.at(i) > .6f,
            "visual integration preserves the nonvisual signal reaching the brain");
    }
  check(touched, "start fish has touch receptors");
}
std::shared_ptr<field::Substrate> learning_tissue(bool negative = false, bool teacher = false) {
  std::vector<field::Neuron> cells(teacher ? 5 : 4);
  for (std::size_t i = 0; i < cells.size(); ++i) {
    auto &c = cells[i];
    c.id = i + 1;
    c.group = i;
    c.functional = true;
    c.role = i == 0 ? field::Role::Sensor : i == 3 ? field::Role::Effector : field::Role::Nerve;
    c.location = {1, 0, i == 2 ? 2.f / 3 : 1.f / 3, 0, 1};
    c.x = float(i) * .1f;
    c.y = c.z = 0;
    c.parameters.time_constant = 0;
    c.parameters.learning_time = field::encode_learning_steps(32);
    c.parameters.plasticity = 1;
    c.electrical_limit = .8f;
    c.teaching_limit = .7f;
    c.bias = .3f;
    c.identity = {0, 1, 1, -1, -1};
    c.hormone_receptors[field::Output].baseline = 1;
  }
  if (negative) {
    cells[1].identity[1] = -1;
    cells[2].bias = -.3f;
  }
  if (teacher) {
    cells[4].identity[1] = -1;
    cells[4].identity[4] = 1;
  }
  auto s = std::make_shared<field::Substrate>(cells);
  s->edges = {{0, 1, .8f}, {1, 2, .8f}, {2, 3, .8f}};
  if (teacher)
    s->edges.push_back({4, 2, -.7f});
  return s;
}
std::string brain_saved(const field::Network &n) {
  std::ostringstream out;
  n.write_runtime(out);
  return out.str();
}
void zero_start_learning_and_decay() {
  auto tissue = learning_tissue();
  field::Network n(tissue);
  for (auto e : n.synapses())
    check(e.weight == 0, "all contact types start at zero");
  n.step({1}, {}, 17);
  check(n.signal(0) == 1 && n.state()[1] > 0,
        "raw sensory activity and intrinsic postsynaptic activity exist with zero initial weights");
  check(n.organ_output()[3] == 0, "bias cannot actuate an unconnected organ");
  for (int t = 0; t < 100; ++t) {
    if (t % 12 < 6) {
      n.stimulate(1, .8f);
      n.stimulate(2, .8f);
      n.stimulate(3, .8f);
    }
    n.step({float(t % 12 < 6)}, {}, 17);
  }
  bool motor = false;
  for (auto e : n.synapses()) {
    check(e.weight >= 0 && e.weight <= .8f, "learned weight respects genetic limit");
    motor |= e.target == 3 && e.weight > 0;
  }
  check(n.learned_change() > .02 && motor, "inner and motor contacts learn from zero");
  auto frozen = n.frozen_probe();
  const auto before = frozen.learned_change();
  frozen.step({1}, {}, 17);
  check(frozen.learned_change() < before && frozen.learning_summary().decay > 0,
        "even used contacts decay in a frozen diagnostic copy");
  n.reset_learning();
  for (auto e : n.synapses())
    check(e.weight == 0, "erasing learning never restores inherited weights");
  auto silent = learning_tissue();
  silent->partners.clear();
  silent->partner_offset.clear();
  for (auto &c : silent->neurons) {
    c.bias = 0;
    c.parameters.learning_time = 0;
  }
  field::Network trial(silent);
  for (int t = 0; t < 15; ++t)
    trial.step({0}, {}, 19);
  check(trial.synapses().size() == 3, "zero contacts retain their local consolidation trial");
  trial.step({0}, {}, 19);
  check(trial.synapses().empty(), "unused zero contacts are removed after four time constants");
  auto negative = learning_tissue(true);
  field::Network inhibitory(negative);
  for (int t = 0; t < 16; ++t) {
    inhibitory.stimulate(1, .8f);
    inhibitory.step({1}, {}, 2);
  }
  bool learned_negative = false;
  for (auto e : inhibitory.synapses())
    learned_negative |= e.source == 1 && e.target == 2 && e.weight < 0;
  check(learned_negative, "an inhibitory contact can acquire negative strength from zero");
  auto taught = learning_tissue(false, true);
  field::Network teacher(taught);
  for (int t = 0; t < 48; ++t) {
    teacher.stimulate(1, .9f);
    teacher.stimulate(4, .9f);
    teacher.step({1}, {}, 3);
  }
  bool learned_teacher = false;
  for (auto e : teacher.synapses())
    learned_teacher |= e.source == 4 && e.target == 2 && e.weight < -.001f;
  check(learned_teacher,
        "teaching contacts consolidate from zero using independent local evidence");
  field::Network restored(taught);
  std::istringstream in(brain_saved(teacher));
  restored.read_runtime(in);
  for (int t = 0; t < 12; ++t) {
    teacher.step({float(t % 2)}, {}, 3);
    restored.step({float(t % 2)}, {}, 3);
    check(brain_saved(teacher) == brain_saved(restored),
          "contact traces, weights, clocks and RNG resume exactly");
  }
}
void nerve_levels_and_memory() {
  std::array<float, 3> held{}, trace{}, baseline{}, faded{};
  for (int response = 0; response < 3; ++response) {
    auto cells = learning_tissue()->neurons;
    cells.resize(2);
    auto &c = cells[1];
    c.bias = .15f;
    c.parameters.time_constant = response == 2 ? 1 : 0;
    c.parameters.learning_time = 1;
    c.parameters.quality1 = response ? 1 : 0;
    c.parameters.quality2 = .5f * response;
    c.identity[3] = .6f;
    c.hormone_receptors[field::Learning].baseline = 1;
    c.hormone_receptors[field::Competition].baseline = 1;
    c.hormone_receptors[field::Rhythm].baseline = 1;
    c.hormone_receptors[field::Rhythm].affinity[0] = 1;
    c.hormone_receptors[field::Rhythm].sensitivity = -2;
    auto tissue = std::make_shared<field::Substrate>(cells);
    tissue->edges = {{0, 1, .8f}};
    field::Network n(tissue);
    field::Hormones h{};
    for (int t = 0; t < 2400; ++t) {
      h[0] = t < 800 ? 0 : 1;
      if (response == 0 && t % 173 < 73)
        n.stimulate(1, .8f);
      n.step({t % 173 < 73 ? .8f : 0}, h, 51829);
    }
    auto probe = n.frozen_probe();
    for (int t = 0; t < 600; ++t)
      probe.step({0}, h, 51829);
    baseline[response] = probe.state()[1];
    for (int t = 0; t < 300; ++t)
      probe.step({.8f}, h, 51829);
    held[response] = probe.state()[1];
    for (int t = 0; t < 64; ++t)
      probe.step({0}, h, 51829);
    trace[response] = probe.state()[1];
    field::Network restored(tissue);
    std::istringstream in(brain_saved(probe));
    restored.read_runtime(in);
    for (int t = 0; t < 2000; ++t) {
      probe.step({0}, h, 51829);
      restored.step({0}, h, 51829);
    }
    check(brain_saved(probe) == brain_saved(restored), "a saved nerve trace continues exactly");
    faded[response] = probe.state()[1];
  }
  check(held[0] < baseline[0] + .02f, "change cells adapt to a held input");
  check(held[1] > baseline[1] + .05f && trace[1] < baseline[1] + .005f,
        "level cells relay a sustained input and release when it ends");
  check(trace[2] > baseline[2] + .02f && faded[2] < baseline[2] + .01f,
        "memory cells retain a stimulus beyond its end and then let it fade");
  auto cells = learning_tissue(true)->neurons;
  for (auto &c : cells) {
    c.bias = .3f;
    c.parameters.quality1 = 1;
    c.parameters.quality2 = .5f;
    c.parameters.learning_time = 1;
  }
  auto tissue = std::make_shared<field::Substrate>(cells);
  tissue->edges = {{0, 1, .8f}, {1, 2, -.8f}, {2, 3, .8f}};
  field::Network n(tissue);
  for (int t = 0; t < 600; ++t)
    n.step({t % 73 < 23 ? .8f : 0}, {}, 51983);
  bool inhibition = false, motor = false;
  for (auto e : n.synapses()) {
    inhibition |= e.source == 1 && e.target == 2 && e.weight < -.01f;
    motor |= e.source == 2 && e.target == 3 && e.weight > .01f;
  }
  check(inhibition && motor, "level learning consolidates inhibitory and motor contacts from zero");
}
void development_preserves_identity_and_reserves_capacity() {
  auto tissue = learning_tissue();
  tissue->neurons[2].development_receptor.baseline = 0;
  tissue->neurons[2].development_receptor.affinity[0] = 1;
  tissue->neurons[2].development_receptor.sensitivity = 1;
  field::Network n(tissue, true);
  check(n.active_count() == 0 && n.slot_count() == 0 && n.reserved_slots() > 0,
        "potential cells reserve capacity without allocating contact rows");
  bool rejected = false;
  try {
    n.set_plasticity(false);
  } catch (const std::logic_error &) {
    rejected = true;
  }
  check(rejected, "living development always learns");
  double charged = 0;
  for (int t = 0; t < 160; ++t)
    charged += n.grow({}, .2, 100);
  check(n.life(0) == field::Network::CellLife::Active &&
            n.life(2) == field::Network::CellLife::Precursor,
        "cell growth is locally gated");
  n.stimulate(1, .73f, 8);
  const auto state = n.state();
  const auto revision = n.cell_revision();
  field::Hormones dose{};
  dose[0] = 1;
  for (int t = 0; t < 40; ++t)
    charged += n.grow(dose, 1, 100);
  check(n.life(2) == field::Network::CellLife::Active && n.cell_revision() > revision,
        "late cells can appear after body maturity");
  check(n.state()[1] == state[1] && n.slot_count() <= n.reserved_slots(),
        "growth preserves existing activity and slot reservation");
  check(charged > 0 && charged < .1, "only actual births and contacts are charged");
  field::Network restored(tissue, true);
  std::istringstream in(brain_saved(n));
  restored.read_runtime(in);
  for (int t = 0; t < 20; ++t) {
    n.grow(dose, 1, 100);
    restored.grow(dose, 1, 100);
    n.step({float(t % 2)}, dose, 22);
    restored.step({float(t % 2)}, dose, 22);
    check(brain_saved(n) == brain_saved(restored), "development and learning resume together");
  }
  field::Network unfunded(tissue, true);
  for (int t = 0; t < 200; ++t)
    check(unfunded.grow(dose, 1, 0) == 0, "zero budget has no physical construction charge");
  check(unfunded.active_count() == 0 && unfunded.slot_count() == 0,
        "unfunded planning creates no tissue");
  auto isolated = learning_tissue();
  isolated->edges.clear();
  for (auto &c : isolated->neurons) {
    c.parameters.learning_time = 0;
    if (c.role == field::Role::Nerve) {
      c.hormone_receptors[field::Death].affinity[0] = 1;
      c.hormone_receptors[field::Death].sensitivity = 1;
    }
  }
  field::Network dying(isolated, true);
  for (int t = 0; t < 160; ++t)
    dying.grow({}, 1, 100);
  for (int t = 0; t < 200; ++t)
    dying.step({0}, {}, 1);
  check(dying.dead_count() == 0,
        "isolated cells may wait for future partners without a death timer");
  dying.step({0}, dose, 1);
  check(dying.dead(1) && dying.dead(2) && !dying.dead(0) && !dying.dead(3),
        "the inherited death receptors control permanent cell death");
  const auto dead = dying.dead_count();
  for (int t = 0; t < 100; ++t)
    dying.grow({}, 1, 100);
  check(dying.dead_count() == dead && dying.life(1) == field::Network::CellLife::Dead,
        "a dead cell identity never grows again");
  field::EmbryoConstruction stage(*tissue);
  stage.advance();
  check(stage.construction_fraction() == 1 && stage.ticks() == 1,
        "small construction has no arbitrary minimum duration");
  field::EmbryoConstruction larger(25, 0);
  check(larger.ticks() == 3, "construction duration follows workload and work rate");
  larger.advance();
  check(larger.completed_work() == 10 && std::abs(larger.construction_fraction() - .4) < 1e-12,
        "construction progress measures completed work");
  const auto cost = larger.remaining_cost();
  field::EmbryoConstruction resumed(25, 0);
  resumed.restore(larger.completed_work());
  check(resumed.remaining_cost() == cost, "construction estimates resume from actual work");
}
void wiring_has_no_inner_layers() {
  auto s = learning_tissue();
  auto &c = s->neurons;
  for (float first : {0.f, 1.f / 3, 2.f / 3, 1.f})
    for (float second : {0.f, 1.f / 3, 2.f / 3, 1.f}) {
      c[1].location.v = first;
      c[2].location.v = second;
      check(field::connection_kind(c[0], c[1]) >= 0 && field::connection_kind(c[0], c[2]) >= 0 &&
                field::connection_kind(c[1], c[2]) >= 0 &&
                field::connection_kind(c[2], c[1]) >= 0 &&
                field::connection_kind(c[1], c[3]) >= 0 && field::connection_kind(c[2], c[3]) >= 0,
            "cell roles allow free recurrent wiring at every inner depth");
    }
  check(field::connection_kind(c[0], c[3]) < 0 && field::connection_kind(c[1], c[0]) < 0 &&
            field::connection_kind(c[3], c[1]) < 0,
        "sensors have no inputs, effectors no outputs, and senses cannot bypass nerves");
}
void ordered_retinal_neighbors_match_geometry() {
  for (int density : {1, 0, 16}) {
    std::vector<field::Neuron> groups;
    for (std::size_t site = 0; site < field::DEVELOPMENT_SITES; ++site) {
      const auto location = field::development_site(site);
      if (location.zone != 1)
        continue;
      field::Neuron cell{};
      cell.id = site + 1;
      cell.location = location;
      cell.role = field::Role::Sensor;
      cell.functions.senses[field::Light] = 1;
      cell.parameters.capacity = (density ? density : 1 + site % 16) / 16.f;
      groups.push_back(cell);
    }
    std::vector<std::vector<field::NeuronIndex>> copies;
    bool limited = false;
    const auto cells = field::cell_copies(groups, 8192, copies, limited);
    const auto retina = field::retinal_tissue(cells);
    check(!limited, "retinal test stays within the cell budget");
    for (std::size_t i = 0; i < retina.size(); ++i) {
      const auto &a = retina[i];
      std::vector<std::pair<double, std::uint32_t>> expected;
      for (std::size_t j = 0; j < retina.size(); ++j) {
        const auto &b = retina[j];
        if (i == j || cells[a.neuron].location.side != cells[b.neuron].location.side)
          continue;
        const double dx = a.position - b.position,
                     dy = field::retinal_dynamics::transverse_scale * (a.transverse - b.transverse),
                     distance = dx * dx + dy * dy;
        if (distance <= field::retinal_dynamics::radius * field::retinal_dynamics::radius)
          expected.push_back({distance, std::uint32_t(j)});
      }
      std::sort(expected.begin(), expected.end(), [&](const auto &x, const auto &y) {
        return x.first != y.first
                   ? x.first < y.first
                   : cells[retina[x.second].neuron].id < cells[retina[y.second].neuron].id;
      });
      check(a.count == std::min(expected.size(), a.neighbors.size()),
            "ordered retina retains neighbor count");
      for (unsigned j = 0; j < a.count; ++j)
        check(a.neighbors[j] == expected[j].second,
              "ordered retina retains spatial and colour-layer neighbors");
    }
  }
}
void retinal_development_is_local_and_restorable() {
  std::vector<field::Neuron> cells;
  for (int side : {-1, 1})
    for (int group = 0; group < 3; ++group)
      for (int copy = 0; copy < 6; ++copy) {
        field::Neuron n{};
        n.id = cells.size() + 1;
        n.role = field::Role::Sensor;
        n.group = (side > 0 ? 3 : 0) + group;
        n.location = {1, 1 - group / 3.f, .5f, 0, float(side)};
        n.functional = true;
        n.functions.senses[field::Light] = 1;
        n.parameters.threshold = .4f;
        n.parameters.time_constant = 0;
        n.hormone_receptors[field::Output].baseline = 1;
        auto &r = n.hormone_receptors[field::Excitation];
        r.affinity[field::MATURITY_SUBSTANCE] = 1;
        r.sensitivity = -2;
        r.half = .01f;
        cells.push_back(n);
      }
  auto tissue = std::make_shared<field::Substrate>(cells);
  field::Network n(tissue), other(tissue), mature(tissue);
  mature.set_maturity(1);
  std::vector<float> dark(cells.size(), 0), light(cells.size(), .7f);
  bool wave = false, recovery = false, local = false, different = false;
  for (int tick = 0; tick < 800; ++tick) {
    const auto before = n.retinal_state();
    n.step(dark, field::Hormones{}, 185);
    other.step(dark, field::Hormones{}, 281);
    mature.step(dark, field::Hormones{}, 185);
    const auto after = n.retinal_state(), alternate = other.retinal_state(),
               suppressed = mature.retinal_state();
    int fresh = 0, nearby = 0;
    for (std::size_t i = 0; i < after.size(); ++i) {
      wave |= after[i].activity == 1;
      recovery |= after[i].recovery > .8f && after[i].activity < .5f;
      different |= after[i].activity != alternate[i].activity;
      check(suppressed[i].activity == 0, "maturity can stop intrinsic retinal activity");
      if (after[i].activity == 1 && before[i].activity < .9f) {
        ++fresh;
        for (std::size_t j = 0; j < before.size(); ++j)
          if (before[j].activity > .8f && cells[i].location.side == cells[j].location.side &&
              std::abs(after[i].position - before[j].position) < .3f) {
            ++nearby;
            break;
          }
      }
    }
    local |= fresh >= 2 && nearby == fresh;
  }
  check(wave && recovery && local && different,
        "retinal activity propagates locally, recovers and differs between individuals");
  mature.step(light, field::Hormones{}, 185);
  for (std::size_t i = 0; i < cells.size(); ++i)
    check(mature.signal(i) >= .69f, "intrinsic suppression preserves environmental vision");
  std::stringstream saved_state;
  n.write_runtime(saved_state);
  field::Network restored(tissue);
  restored.read_runtime(saved_state);
  auto copied = n;
  for (int i = 0; i < 40; ++i) {
    n.step(dark, field::Hormones{}, 185);
    copied.step(dark, field::Hormones{}, 185);
    restored.step(dark, field::Hormones{}, 185);
    std::stringstream a, b, c;
    n.write_runtime(a);
    copied.write_runtime(b);
    restored.write_runtime(c);
    check(a.str() == b.str() && a.str() == c.str(), "retinal and neural clocks resume exactly");
  }
}
Ecosystem closed_tank(const Genome &g) {
  Ecosystem w(SEED);
  w.starter_world();
  w.set_parameter("energy_supply", 0);
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  w.food_burst.strength = 0;
  no_mutation(w);
  for (int k = 0; k < FISH; ++k)
    adult(w, g, FIRST_X + k * SPACING, DEPTH);
  return w;
}
double tracked_energy(const Ecosystem &w) {
  const auto &web = w.field.food_web();
  return w.total_energy() + web.released - web.introduced;
}
void closed_tank_creates_no_energy(const Genome &g) {
  auto w = closed_tank(g);
  double before = tracked_energy(w);
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    const double now = tracked_energy(w);
    check(now <= before + tolerance::precision * std::max(1., before),
          "a closed tank never creates energy");
    before = now;
  }
}
void maturity_never_decreases(const Genome &g) {
  auto w = closed_tank(g);
  std::map<std::uint64_t, double> tissue, maturity;
  for (auto &p : w.fish) {
    p.body.energy = 0;
    tissue[p.id] = p.body.tissue;
    maturity[p.id] = 0;
  }
  bool starved = false;
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    for (const auto &p : w.fish)
      if (maturity.count(p.id) && p.body.alive && p.body.brain()) {
        const double now = p.body.brain()->maturity();
        check(now >= maturity[p.id], "maturity never decreases");
        maturity[p.id] = now;
        starved |= p.body.tissue < tissue[p.id];
      }
  }
  check(starved, "a fish without reserve breaks down tissue");
}
constexpr double YOUNG_TISSUE = 20, FULL_GUT = 300;
void growth_needs_a_hormone(const Genome &g) {
  auto w = closed_tank(g);
  std::map<std::uint64_t, bool> silenced;
  std::map<std::uint64_t, double> tissue;
  for (std::size_t k = 0; k < w.fish.size(); ++k) {
    auto &b = w.fish[k].body;
    b.tissue = b.peak_tissue = YOUNG_TISSUE;
    b.gut_energy = b.gut_digestible = FULL_GUT;
    silenced[w.fish[k].id] = k % 2;
    tissue[w.fish[k].id] = YOUNG_TISSUE;
    if (k % 2)
      for (const auto &e : g.interface->effectors)
        if (e.port == organ_port::gland)
          b.mute_neuron(e.neuron);
  }
  for (int step = 0; step < STEPS; ++step)
    w.tick();
  int quiet = 0;
  bool grew = false;
  for (const auto &p : w.fish)
    if (p.body.alive && silenced.count(p.id)) {
      if (silenced[p.id]) {
        check(p.body.tissue <= tissue[p.id], "a body without growth hormone does not grow");
        ++quiet;
      } else
        grew |= p.body.tissue > tissue[p.id];
    }
  check(quiet > 0, "a fish without growth hormone was observed");
  check(grew, "a body with growth hormone grows");
}
constexpr double BURY_DEPTH = 30, BURY_RADIUS = 2;
void algae_vanish_in_traces(const Genome &g) {
  auto w = closed_tank(g);
  const auto &surfaces = w.field.vegetation().surfaces;
  const auto floor = std::find_if(surfaces.begin(), surfaces.end(), [](const SurfacePatch &s) {
    return s.algae > 0 && s.normal.y <= -seabed::floor_normal;
  });
  check(floor != surfaces.end(), "a floor carries algae");
  const auto id = floor->id;
  const auto mid = surface_midpoint(*floor);
  double before = tracked_energy(w);
  check(w.field.edit_environment("sediment", mid.x, mid.y, BURY_RADIUS, -1, BURY_DEPTH),
        "sediment covers the algae");
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    const double now = tracked_energy(w);
    check(now <= before + tolerance::precision * std::max(1., before),
          "vanishing algae create no energy");
    before = now;
  }
  for (const auto &s : w.field.vegetation().surfaces)
    if (s.id == id)
      check(s.algae == 0, "algae buried under sediment vanish");
}
void development_queue_is_bounded(const Genome &g) {
  auto w = closed_tank(g);
  w.fish.clear();
  for (int i = 0; i < 21; ++i) {
    Genome egg = g;
    egg.blueprint.reset();
    egg.interface.reset();
    egg.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(egg, 400 + i * 10, 250, i == 20 ? fish_origin::immigrant : fish_origin::natural,
                  0, 0, 300),
          "queued embryo placement");
  }
  w.tick(false, true);
  int started = 0;
  for (const auto &egg : w.fish)
    started += bool(egg.genome.growing || egg.genome.blueprint);
  check(started == 1, "fresh evaluator preparations obey the population budget");
  auto copy = w.fork();
  for (int i = 0; i < 8; ++i) {
    w.tick(false, true);
    copy.tick(false, true);
  }
  check(saved(w) == saved(copy), "queued development resumes deterministically");
  const auto immigrant = std::find_if(w.fish.begin(), w.fish.end(), [](const auto &p) {
    return p.origin == fish_origin::immigrant;
  });
  check(immigrant != w.fish.end() && (immigrant->genome.growing || immigrant->genome.blueprint),
        "immigrant preparation keeps its reserved share");
}
void egg_development_checkpoint(const Genome &g) {
  Ecosystem w(731);
  w.resize(615, 410);
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  w.food_burst.strength = 0;
  w.set_parameter("energy_supply", 0);
  no_mutation(w);
  const auto id = egg(w, g, 300);
  w.tick(false);
  check(
      !individual(w, id).body.brain(),
      "an unfertilised egg has no maternal brain; development waits for fertilisation or cloning");
  for (int tick = 0; tick < 256; ++tick) {
    w.tick(false);
    const auto &brain = individual(w, id).body.brain();
    if (brain && brain->active_count())
      break;
  }
  const auto &brain = individual(w, id).body.brain();
  check(brain && brain->active_count() > 0 &&
            brain->active_count() < individual(w, id).genome.blueprint->neurons.size(),
        "checkpoint fixture has a partially born brain");
  auto restored = w.fork();
  check(saved(w) == saved(restored), "an egg with partially formed neural tissue restores exactly");
  for (int tick = 0; tick < 80; ++tick) {
    w.tick(false);
    restored.tick(false);
  }
  check(saved(w) == saved(restored),
        "body growth, neural births and learning continue together after loading");
  for (int tick = 0; tick < 512 && !individual(w, id).body.hatched; ++tick)
    w.tick(false);
  check(individual(w, id).body.hatched,
        "the untrained genome acquires the motor commands needed to hatch");
  auto limited = g;
  limited.development_options.max_nodes = 1;
  limited.compile(false);
  Body failed;
  failed.hatched = false;
  failed.energy = 300;
  advance_body(failed, limited, nullptr, {}, false);
  const double paid = limited.blueprint->queries / QUERY_ENERGY_DIVISOR +
                      field::DevelopmentCosts{}.egg_basal * PhysiologyParameters{}.neural_cost;
  check(failed.age == 1 && std::abs(300 - failed.energy - paid) < 1e-9 && !failed.brain(),
        "a failed plan pays queries and egg metabolism, without phantom construction");
}
void embryo_secretion_keeps_the_hatch_reserve(const Genome &g) {
  Ecosystem w(59219);
  w.resize(800, 500);
  w.safety = false;
  w.set_parameter("energy_supply", 0);
  w.food_burst.strength = 0;
  check(w.spawn(g, 400, 250, fish_origin::founder, 0, 0, 100), "small egg placement");
  const auto id = w.fish.back().id;
  w.fish.back().body.set_actuation_probe([](std::uint32_t, float) { return 1.f; });
  bool secreted = false;
  for (int tick = 0; tick < 160 && !individual(w, id).body.hatched; ++tick) {
    w.tick(false);
    const auto &b = individual(w, id).body;
    if (b.embryo.shell < 1) {
      secreted = true;
      check(b.energy > hatch_search_reserve(b), "shell secretion keeps the search reserve");
      check(b.energy < b.reproduction().motor_reserve,
            "shell secretion works below the adult reproductive reserve");
    }
  }
  auto &b = individual(w, id).body;
  check(secreted && b.hatched, "a small egg can open its shell and hatch");
  b.energy = 100;
  w.tick(false);
  check(individual(w, id).body.reproduction().sperm_transfer == 0,
        "after hatching sperm production keeps the adult reproductive reserve");
}
void laid_eggs_keep_the_parent_orientation(const Genome &g) {
  Ecosystem w(71849);
  w.resize(800, 500);
  w.safety = false;
  w.set_parameter("energy_supply", 0);
  w.food_burst.strength = 0;
  auto &parent = adult(w, g, 400, 250);
  const auto id = parent.id;
  parent.body.orient_to(.73);
  parent.body.energy = 500;
  parent.body.set_actuation_probe([](std::uint32_t, float) { return 1.f; });
  for (int tick = 0; tick < 160; ++tick) {
    w.tick();
    const auto egg = std::find_if(w.fish.begin(), w.fish.end(), [](const auto &p) {
      return p.origin == fish_origin::natural && !p.body.hatched;
    });
    if (egg == w.fish.end())
      continue;
    const double heading = individual(w, id).body.angle;
    check(std::abs(heading) > .1 &&
              std::abs(std::remainder(egg->body.angle - heading, 2 * PI)) < 1e-9,
          "an extruded egg keeps the parent's body orientation instead of facing east");
    return;
  }
  check(false, "the adult fixture releases an egg");
}
void development_checkpoint_stages(const Genome &g) {
  constexpr std::size_t SLICE = 37;
  for (int stage = 0; stage < 3; ++stage) {
    auto w = closed_tank(g);
    w.fish.clear();
    Genome fresh = g;
    fresh.discard_development();
    fresh.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(fresh, FIRST_X, DEPTH, fish_origin::natural, 0, 0, 300), "development fixture");
    auto &plan = w.fish.front().genome;
    plan.advance_development(SLICE);
    if (stage > 0) {
      while (!plan.growing->pending_finalization())
        check(!plan.advance_development(SLICE), "fixture reaches finalization");
      if (stage > 1)
        check(!plan.advance_development(SLICE), "fixture pauses within finalization");
    }
    auto copy = w.fork();
    check(saved(w) == saved(copy), "partial development restores exactly");
    for (int step = 0; step < 8; ++step) {
      w.tick(false, true);
      copy.tick(false, true);
    }
    check(saved(w) == saved(copy), "partial development continues exactly");
  }
}
// Resumable finalization shares the work budget across all admitted embryos. A slice quota must
// neither leave later embryos idle nor strand unused work while finalization is pending.
void development_finalization_uses_budget(const Genome &g) {
  constexpr int EMBRYOS = 5;
  constexpr std::size_t QUERY_SLICE = 64, WORK_BUDGET = 131072;
  auto w = closed_tank(g);
  w.fish.clear();
  w.evo.development_work = WORK_BUDGET;
  std::vector<std::size_t> before;
  for (int i = 0; i < EMBRYOS; ++i) {
    Genome fresh = g;
    fresh.discard_development();
    fresh.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(fresh, FIRST_X + i * SPACING, DEPTH, fish_origin::natural, 0, 0, 300),
          "finalization fixture placement");
    auto &plan = w.fish.back().genome;
    while (!plan.growing || !plan.growing->pending_finalization())
      check(!plan.advance_development(QUERY_SLICE), "fixture pauses before finalization");
    before.push_back(plan.pending_work());
  }
  auto restored = w.fork();
  w.tick(false, true);
  restored.tick(false, true);
  check(saved(w) == saved(restored), "budgeted finalization resumes deterministically");
  std::size_t used = 0;
  bool pending = false;
  for (std::size_t i = 0; i < before.size(); ++i) {
    const auto &plan = w.fish[i].genome;
    const auto after = plan.blueprint ? plan.blueprint->development_work() : plan.pending_work();
    check(after > before[i], "every admitted embryo receives finalization work");
    used += after - before[i];
    pending |= !plan.blueprint;
  }
  check(used <= WORK_BUDGET, "finalization obeys the population work budget");
  check(!pending || used == WORK_BUDGET, "pending finalization uses the available budget");
}
constexpr double WIDE_MARK = .3, SHORT_STUMP = .15, MARK_DEPTH = .5;
void cut_marks_stay_on_their_piece() {
  const PlantNotch mark{SHORT_STUMP / 2, MARK_DEPTH, WIDE_MARK, 0},
      stump = notch_on_piece(mark, 0, SHORT_STUMP);
  check(stump.width <= MAX_NOTCH_WIDTH, "a bite mark spans at most its whole piece");
  check(stump.at >= 0 && stump.at <= 1 && stump.depth == mark.depth,
        "a bite mark keeps its place and depth on the piece");
}
void plant_notches_follow_the_successful_bite() {
  Ecosystem weak(SEED);
  weak.starter_world();
  const auto &parts = weak.field.vegetation().plants;
  const auto found = std::find_if(parts.begin(), parts.end(), [](const auto &p) {
    return p.kind == food_kind::plant && p.organ_kind >= plant_organ::leaf && p.energy > 1 &&
           p.along > .25 && p.along < .75;
  });
  check(found != parts.end(), "plant bite fixture has edible foliage");
  const auto index = std::size_t(found - parts.begin()), patch = found->patch;
  const int organ = found->organ;
  auto strong = weak.fork();
  const auto damage = [&](Ecosystem &w, double strength) {
    Body b;
    b.tissue = HATCH_TISSUE;
    b.jaw_length = .4;
    b.blunt_teeth = 0;
    b.bite_strength = strength;
    b.bite_signal = 1;
    const auto cuts = w.field.plant_source(patch).organs[organ].cuts;
    const auto piece = w.field.bite_plant(b, index);
    check(piece && piece->energy > 0, "both bites remove a measurable piece");
    const auto &after = w.field.plant_source(patch).organs[organ];
    double depth = after.cuts > cuts ? 1 : 0;
    for (const auto &n : after.notches)
      depth = std::max(depth, std::abs(n.depth));
    return depth;
  };
  const double shallow = damage(weak, .1), deep = damage(strong, 12);
  check(shallow < .001 && deep > 100 * shallow,
        "a barely effective bite cannot leave the same deep notch as a strong bite");
}
void grass_blades_are_cut_as_leaves() {
  Ecosystem source(SEED);
  source.starter_world();
  const auto &parts = source.field.vegetation().plants;
  for (int kind : {plant_organ::blade, plant_organ::stem, plant_organ::leaf}) {
    const auto found = std::find_if(parts.begin(), parts.end(), [kind](const auto &p) {
      return p.kind == food_kind::plant && p.organ_kind == kind && p.energy > 10;
    });
    check(found != parts.end(), "the bite fixture has each plant tissue");
    const auto index = std::size_t(found - parts.begin());
    auto cutting = source.fork(), crushing = source.fork();
    Body mouth;
    mouth.tissue = HATCH_TISSUE;
    mouth.jaw_length = .4;
    mouth.bite_strength = 12;
    mouth.bite_signal = 1;
    mouth.blunt_teeth = 0;
    const auto sharp = cutting.field.bite_plant(mouth, index);
    mouth.blunt_teeth = 1;
    const auto blunt = crushing.field.bite_plant(mouth, index);
    if (kind == plant_organ::stem) {
      check(!sharp && blunt && blunt->blunt,
            "a fibrous stem needs crushing teeth and keeps that material when detached");
    } else {
      check(sharp && sharp->energy > .1 && !sharp->blunt && !blunt,
            "cutting teeth remove leaf tissue from both grass blades and broad leaves");
    }
  }
  const auto &materials = source.field.env();
  check(plant_bite_hardness(plant_organ::blade, .5, materials) ==
            plant_bite_hardness(plant_organ::leaf, .5, materials),
        "a grass blade uses leaf fibre resistance");
}
void grazing_preserves_foliage_until_repeated_bites() {
  Ecosystem w(SEED);
  w.starter_world();
  const auto &parts = w.field.vegetation().plants;
  const auto found = std::find_if(parts.begin(), parts.end(), [](const auto &p) {
    return p.kind == food_kind::plant && p.organ_kind == plant_organ::blade && p.energy > 10 &&
           p.along > .25 && p.along < .75;
  });
  check(found != parts.end(), "the grazing fixture has a grown grass blade");
  const auto target = *found;
  const auto cuts = w.field.plant_source(target.patch).organs[target.organ].cuts;
  Body b;
  b.tissue = HATCH_TISSUE;
  b.jaw_length = .4;
  b.blunt_teeth = 0;
  b.bite_strength = 60;
  b.bite_signal = 1;
  double eaten = 0;
  int bites = 0;
  for (; bites < 24; ++bites) {
    std::size_t best = w.field.vegetation().plants.size();
    double nearest = std::numeric_limits<double>::infinity();
    for (std::size_t i = 0; i < w.field.vegetation().plants.size(); ++i) {
      const auto &p = w.field.vegetation().plants[i];
      if (p.patch != target.patch || p.organ != target.organ || p.energy <= 0)
        continue;
      const double d = stroke_distance(p, w.field.delta_x(target.x - p.x), target.y - p.y);
      if (d < nearest) {
        nearest = d;
        best = i;
      }
    }
    check(best < w.field.vegetation().plants.size(), "the grazed blade remains indexed");
    const auto p = w.field.vegetation().plants[best];
    const double before = w.field.grass_energy();
    const auto piece = w.field.bite_plant(
        b, best, stroke_closest(p.hx, p.hy, w.field.delta_x(target.x - p.x), target.y - p.y));
    check(piece && piece->energy > 0, "each grazing bite supplies food");
    eaten += piece->energy;
    check(std::abs(w.field.grass_energy() + piece->energy - before) < 1e-6,
          "biting and detachment conserve plant energy");
    const auto now = w.field.plant_source(target.patch).organs[target.organ].cuts;
    if (bites == 0)
      check(now == cuts, "a grazing bite does not tear off the blade");
    if (now > cuts)
      break;
    w.field.time += 12;
    w.field.index_plants();
  }
  check(bites >= 3 && bites < 24 && eaten > 0,
        "successive bites feed repeatedly before severing the blade");
}
void healthy_foliage_retains_a_green_signal() {
  Ecosystem w(SEED);
  w.starter_world();
  double foliage = 0, green = 0;
  for (const auto &part : w.field.vegetation().plants)
    if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) && part.energy > 0) {
      const auto color = plant_organ_color(w.field.plant_source(part.patch), part.organ);
      foliage += part.energy;
      if (color[rgb::green] > color[rgb::blue])
        green += part.energy;
    }
  check(foliage > 0 && green > .99 * foliage,
        "living foliage retains a green signal apart from shaded tips");
}
void one_bite_grazes_the_foliage_inside_the_mouth() {
  Ecosystem w(SEED);
  w.starter_world();
  Body b;
  b.tissue = HATCH_TISSUE;
  b.organ_mass = 3;
  b.jaw_length = .4;
  b.blunt_teeth = 0;
  b.gut_length = 1;
  b.bite_strength = 12;
  b.bite_signal = 1;
  b.age = 100;
  b.hatch_age = 0;
  b.mouth.opening = 1;
  b.mouth.closing = b.mouth.biting = true;
  b.mouth.phase = .5;
  const double bite = bite_radius(b), offset = mouth_offset(b);
  bool placed = false;
  const auto &parts = w.field.vegetation().plants;
  for (const auto &p : parts) {
    if (p.kind != food_kind::plant || p.organ_kind != plant_organ::blade || p.energy < 10 ||
        p.width > bite / 3 || p.along < .3 || p.along > .7)
      continue;
    std::set<std::pair<std::size_t, int>> nearby;
    for (const auto &q : parts)
      if (q.kind == food_kind::plant && q.organ_kind == plant_organ::blade && q.energy > 0 &&
          stroke_distance(q, w.field.delta_x(q.x - p.x), q.y - p.y) < bite)
        nearby.emplace(q.patch, q.organ);
    if (nearby.size() < 2)
      continue;
    b.x = w.field.wrap_x(p.x - offset);
    b.y = p.y;
    if ((placed = w.field.free(b.x, b.y, body_radius(b))))
      break;
  }
  check(placed, "the fixture has a reachable tuft of narrow leaves");
  std::map<std::pair<std::size_t, int>, double> organs;
  for (const auto &p : parts)
    if (p.kind == food_kind::plant)
      organs[{p.patch, p.organ}] = w.field.plant_source(p.patch).organs[p.organ].energy;
  w.fish.emplace_back();
  w.fish.back().body = b;
  const double before = w.field.grass_energy();
  std::vector<unsigned char> bitten(1);
  const auto meal = w.feeding(0, b.x, b.y, false, bitten, 0);
  int grazed = 0;
  for (const auto &[key, energy] : organs)
    grazed +=
        w.field.plant_source(key.first).organs[key.second].energy < energy - tolerance::precision;
  double area = 0;
  for (const auto &e : w.combat_effects)
    area += e.radius * e.radius;
  check(grazed > 1 && meal.raw[food_kind::plant] > 0,
        "one bite can take several thin leaves inside the mouth");
  check(area <= bite * bite + tolerance::precision,
        "the slices share one mouthful of cross-sectional area");
  check(std::abs(w.field.grass_energy() + meal.raw[food_kind::plant] - before) < 1e-6,
        "the whole mouthful is deducted from the plants");
}
void illuminated_leaves_survive_their_own_shade() {
  Ecosystem w(817233);
  w.resize(960, 640);
  w.safety = false;
  w.field.flow = 0;
  w.field.seed_plants();
  std::uint64_t shaded = 0;
  for (const auto &s : w.field.vegetation().surfaces) {
    const auto p = surface_midpoint(s);
    const double height = w.field.soil_depth(s) + PLANT_LIGHT_LIFT;
    if (s.stump &&
        plant_light(w.field.light(p.x + s.normal.x * height, p.y + s.normal.y * height)) == 0 &&
        w.field.plant_illumination(s) > .15) {
      shaded = s.id;
      break;
    }
  }
  check(shaded > 0, "the fixture has lit leaves above a shaded crown");
  for (int tick = 0; tick < 400; ++tick)
    w.tick();
  for (const auto &s : w.field.vegetation().surfaces)
    if (s.id == shaded) {
      check(s.stump && s.vitality > .95, "lit foliage remains healthy above its own shade");
      for (const auto &o : s.organs)
        check(o.cuts == 0, "a shaded crown does not make lit leaves fall off");
      return;
    }
  check(false, "the shaded plant remains in the tank");
}
void checkpoint_continues_exactly(const Genome &g) {
  auto w = closed_tank(g);
  for (int step = 0; step < STEPS / 2; ++step)
    w.tick();
  auto copy = w.fork();
  check(saved(w) == saved(copy), "a checkpoint restores the whole tank");
  for (int step = 0; step < STEPS / 2; ++step) {
    w.tick();
    copy.tick();
  }
  check(saved(w) == saved(copy), "a restored tank continues exactly like the original");
}
}
int main() {
  try {
    Genome::begin_run(SEED);
    initial_plants_use_the_available_energy();
    herbivores_start_at_reachable_leaves();
    zero_start_learning_and_decay();
    nerve_levels_and_memory();
    development_preserves_identity_and_reserves_capacity();
    wiring_has_no_inner_layers();
    ordered_retinal_neighbors_match_geometry();
    retinal_development_is_local_and_restorable();
    const auto g = Genome::load(HAND_BUILT_GENOME);
    compact_founders_use_their_actual_reservation(g);
    start_fish_uses_external_vision_when_mature(g);
    start_fish_eats_nearby_food(g);
    nonvisual_input_reaches_the_brain(g);
    closed_tank_creates_no_energy(g);
    checkpoint_continues_exactly(g);
    cut_marks_stay_on_their_piece();
    plant_notches_follow_the_successful_bite();
    grazing_preserves_foliage_until_repeated_bites();
    healthy_foliage_retains_a_green_signal();
    one_bite_grazes_the_foliage_inside_the_mouth();
    illuminated_leaves_survive_their_own_shade();
    grass_blades_are_cut_as_leaves();
    development_queue_is_bounded(g);
    development_checkpoint_stages(g);
    egg_development_checkpoint(g);
    embryo_secretion_keeps_the_hatch_reserve(g);
    laid_eggs_keep_the_parent_orientation(g);
    development_finalization_uses_budget(g);
    maturity_never_decreases(g);
    growth_needs_a_hormone(g);
    algae_vanish_in_traces(g);
    std::cout << "Energie, Speicherstand, Bissspuren, Sinne, Reife, Wachstum und Algen: "
                 "OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
