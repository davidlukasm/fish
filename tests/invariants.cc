#include "test_support.hh"
#include "field/retinal_tissue.hh"
#include "field/development_sites.hh"
#include <algorithm>
#include <map>
using namespace test;
namespace {
constexpr unsigned SEED = 4242;
constexpr int FISH = 4, STEPS = 120;
constexpr double FIRST_X = 200, SPACING = 300, DEPTH = 200;
void excitation_and_teaching_are_independent() {
  constexpr field::NeuronIndex FIRST = 0, SECOND = 1, LEARNER = 2, MODULATOR = 3, MOTOR = 4;
  constexpr int CELLS = 5, WARMUP = 12;
  constexpr int DRIVE = 0, TEACH = 1, RATE = 2;
  constexpr float WEIGHT = .5f, INPUT = .8f, HALF = .1f, EPSILON = 1e-6f;
  const auto brain = [&](float teaching_sign = 1, bool modulator = false) {
    std::vector<field::Neuron> neurons(CELLS);
    for (int i = 0; i < CELLS; ++i) {
      auto &n = neurons[i];
      n.id = i;
      n.role = i < LEARNER  ? field::Role::Sensor
               : i == MOTOR ? field::Role::Effector
                            : field::Role::Nerve;
      n.functional = true;
      if (n.role == field::Role::Sensor) {
        n.functions.internal = 0;
        n.functions.senses[field::Touch] = 1;
      } else if (n.role == field::Role::Effector) {
        n.functions.internal = 0;
        n.functions.motors[field::Forward] = 1;
      }
      n.identity = {1, 1, 0, -1, -1};
      n.parameters.plasticity = i == LEARNER ? .5f : 0;
      n.hormone_receptors[field::Output].baseline = 1;
    }
    neurons[MODULATOR].identity.back() = 1;
    neurons[MODULATOR].bias = modulator ? WEIGHT : 0;
    const auto receptor = [&](int effect, int substance, float sensitivity) {
      auto &r = neurons[LEARNER].hormone_receptors[effect];
      r.affinity[substance] = 1;
      r.sensitivity = sensitivity;
      r.half = HALF;
    };
    receptor(field::Excitation, DRIVE, 1);
    receptor(field::Teaching, TEACH, teaching_sign);
    receptor(field::Learning, RATE, -field::HORMONE_SENSITIVITY_SPAN);
    auto s = std::make_shared<field::Substrate>(std::move(neurons));
    s->edges = {{FIRST, LEARNER, WEIGHT}, {SECOND, LEARNER, WEIGHT}, {LEARNER, MOTOR, WEIGHT}};
    if (modulator)
      s->edges.push_back({MODULATOR, LEARNER, WEIGHT});
    return field::Network(s);
  };
  auto quiet = brain(), driven = brain(), taught = brain(), punished = brain(-1), stopped = brain();
  field::Hormones none{}, excite{}, teach{}, pause{};
  excite[DRIVE] = teach[TEACH] = pause[TEACH] = 1;
  pause[RATE] = 1;
  for (int step = 0; step < WARMUP; ++step)
    for (auto *net : {&quiet, &driven, &taught, &punished, &stopped})
      net->step({step % 2 ? INPUT : 0, step % 2 ? 0 : INPUT}, none, 0);
  quiet.step({INPUT, 0}, none, 0);
  driven.step({INPUT, 0}, excite, 0);
  taught.step({INPUT, 0}, teach, 0);
  punished.step({INPUT, 0}, teach, 0);
  stopped.step({INPUT, 0}, pause, 0);
  check(driven.state()[LEARNER] > quiet.state()[LEARNER], "excitation changes firing");
  check(driven.surprise(LEARNER) == 0, "excitation supplies no teaching signal");
  check(std::abs(driven.learning_contrast(LEARNER) - quiet.learning_contrast(LEARNER)) > EPSILON,
        "eligibility follows the actual firing, including excitation");
  check(taught.state() == quiet.state() && punished.state() == quiet.state(),
        "positive and negative teaching do not drive cells or muscles");
  check(taught.surprise(LEARNER) > 0 && punished.surprise(LEARNER) < 0,
        "the teaching receptor supports both learning directions");
  check(stopped.surprise(LEARNER) == 0, "the learning-rate receptor can stop learning");
  for (auto *net : {&quiet, &driven, &taught, &punished, &stopped})
    net->step({INPUT, 0}, none, 0);
  check(quiet.learned_change() == 0 && driven.learned_change() == 0 &&
            stopped.learned_change() == 0,
        "learning requires a teacher in neutral learning mode");
  check(taught.learned_change() > EPSILON && punished.learned_change() > EPSILON,
        "signed hormonal teaching changes synapses");
  auto local = brain(1, true), combined = brain(1, true);
  local.step({INPUT, 0}, none, 0);
  combined.step({INPUT, 0}, none, 0);
  local.step({INPUT, 0}, none, 0);
  combined.step({INPUT, 0}, teach, 0);
  check(local.surprise(LEARNER) > 0 && combined.surprise(LEARNER) > local.surprise(LEARNER),
        "local modulators and hormonal teaching add together");
}

void all_sources_can_form_first_contacts() {
  constexpr int SOURCES = 3, TARGET = 3, STEPS = 800;
  std::vector<field::Neuron> neurons(SOURCES + 1);
  for (int i = 0; i <= TARGET; ++i) {
    auto &n = neurons[i];
    n.id = i + 1;
    n.group = i;
    n.role = field::Role::Nerve;
    n.functional = true;
    n.slots = SOURCES;
    n.identity = {0, 1, 0, -1, -1};
    n.parameters.plasticity = .1f;
    n.hormone_receptors[field::Output].baseline = 1;
  }
  neurons[0].identity[3] = 1;
  neurons[1].identity[4] = 1;
  neurons[2].identity[3] = neurons[2].identity[4] = 1;
  auto tissue = std::make_shared<field::Substrate>(std::move(neurons));
  tissue->partner_offset = {0, 0, 0, 0, 3};
  tissue->partners = {{0, 1}, {1, 1}, {2, 1}};
  field::Network net(tissue);
  std::array<bool, SOURCES> connected{};
  for (int step = 0; step < STEPS; ++step) {
    net.step({}, field::Hormones{}, 19);
    for (const auto &edge : net.synapses())
      if (edge.target == TARGET)
        connected[edge.source] = true;
  }
  check(std::all_of(connected.begin(), connected.end(), [](bool b) { return b; }),
        "pacers, modulators and modulating pacers can form a first contact");
}
void contact_formation_uses_genetic_strength_and_current_experience() {
  for (bool teaching : {false, true})
    for (float sign : {-1.f, 1.f}) {
      int formed = 0;
      for (unsigned seed = 11; seed < 35; ++seed) {
        std::vector<field::Neuron> cells(2);
        for (int i = 0; i < 2; ++i) {
          auto &n = cells[i];
          n.id = i + 1;
          n.group = i;
          n.role = field::Role::Nerve;
          n.functional = true;
          n.slots = 1;
          n.identity = {0, i == 0 ? sign : 1, 0, -1, i == 0 && teaching ? 1.f : -1.f};
          n.bias = 1;
          n.parameters.plasticity = .5f;
          n.parameters.learning_time = 1;
          n.hormone_receptors[field::Output].baseline = 1;
        }
        cells[1].initial_weight = .19f;
        cells[1].initial_teaching = .73f;
        check(field::initial_contact_weight(cells[0], cells[1]) == sign * (teaching ? .73f : .19f),
              "contact type selects its genetic strength");
        auto tissue = std::make_shared<field::Substrate>(cells);
        tissue->partner_offset = {0, 0, 1};
        tissue->partners = {{0, 1}};
        field::Network net(tissue);
        // Build a teaching history before a connection exists.
        for (int tick = 0; tick < 12; ++tick) {
          net.step({}, field::Hormones{}, seed);
          const auto contacts = net.synapses();
          if (contacts.empty())
            continue;
          const auto &edge = contacts[0];
          ++formed;
          check(edge.formed == field::initial_contact_weight(cells[0], cells[1]),
                "new contacts use the same initial strength as embryonic contacts");
          check(edge.weight == edge.formed, "new contacts inherit no earlier experience");
          if (teaching) {
            for (int i = 0; i < 16; ++i)
              net.step({}, field::Hormones{}, seed);
            check(net.synapse_count() == 1 && net.synapses()[0].weight == edge.formed,
                  "signed teaching contacts survive grace and skip electrical learning");
          }
          break;
        }
      }
      check(formed > (teaching ? 18 : 0), "active teachers are not restricted to basal acceptance");
    }
}
std::shared_ptr<field::Substrate> learning_tissue() {
  std::vector<field::Neuron> cells(3);
  for (int i = 0; i < 3; ++i) {
    auto &n = cells[i];
    n.id = i + 1;
    n.group = i;
    n.role = i == 0 ? field::Role::Sensor : i == 2 ? field::Role::Effector : field::Role::Nerve;
    n.functional = true;
    n.identity = {0, 1, 0, -1, -1};
    n.functions.internal = i == 1;
    if (i == 0)
      n.functions.senses[field::Touch] = 1;
    if (i == 2)
      n.functions.motors[field::Forward] = 1;
    n.hormone_receptors[field::Output].baseline = 1;
    n.parameters.time_constant = 0;
    n.parameters.learning_time = field::encode_learning_steps(128);
    n.parameters.plasticity = .5f;
  }
  auto &r = cells[1].hormone_receptors[field::Teaching];
  r.affinity[0] = 1;
  r.sensitivity = 1;
  r.half = .001;
  auto tissue = std::make_shared<field::Substrate>(cells);
  tissue->edges = {{0, 1, .2f}, {1, 2, .2f}};
  return tissue;
}
void delayed_teaching_preserves_credit() {
  for (int delay : {100, 200}) {
    auto tissue = learning_tissue();
    field::Network n(tissue);
    for (int i = 0; i < 100; ++i)
      n.step({0}, field::Hormones{}, 73);
    n.step({1}, field::Hormones{}, 73);
    for (int i = 0; i < delay; ++i)
      n.step({0}, field::Hormones{}, 73);
    auto positive = n, negative = n;
    auto punishment = std::make_shared<field::Substrate>(*tissue);
    punishment->network_layout.reset();
    punishment->neurons[1].hormone_receptors[field::Teaching].sensitivity = -1;
    field::Network punished(punishment);
    std::stringstream saved_state;
    n.write_runtime(saved_state);
    punished.read_runtime(saved_state);
    field::Hormones reward{};
    reward[0] = 1;
    positive.step({0}, reward, 73);
    negative.step({0}, field::Hormones{}, 73);
    punished.step({0}, reward, 73);
    const auto p = positive.synapses(), q = negative.synapses(), m = punished.synapses();
    check(p[0].weight > q[0].weight + 1e-5f, "delayed reward uses the old learning trace");
    check(m[0].weight < q[0].weight - 1e-5f, "delayed punishment uses the old learning trace");
    check(positive.surprise(1) > .9f && punished.surprise(1) < -.9f,
          "the prediction rule permits delayed signed teaching");
  }
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
void wiring_costs_follow_formation_and_death() {
  std::vector<field::Neuron> cells(2);
  for (int i = 0; i < 2; ++i) {
    auto &n = cells[i];
    n.id = i + 1;
    n.group = i;
    n.x = float(i);
    n.role = field::Role::Nerve;
    n.functional = true;
    n.slots = 1;
    n.bias = 1;
    n.identity = {0, 1, 0, -1, i == 0 ? 1.f : -1.f};
    n.hormone_receptors[field::Output].baseline = 1;
  }
  auto &death = cells[0].hormone_receptors[field::Death];
  death.affinity[0] = 1;
  death.sensitivity = 2;
  death.half = .01f;
  auto tissue = std::make_shared<field::Substrate>(cells);
  tissue->partner_offset = {0, 0, 1};
  tissue->partners = {{0, 1}};
  field::Network net(tissue);
  check(net.wiring().contacts == 0 && net.wiring().length == 0, "empty tissue has no wire upkeep");
  bool formed = false;
  for (int tick = 0; tick < 80 && !formed; ++tick) {
    net.step({}, field::Hormones{}, 39);
    formed = net.synapse_count() != 0;
  }
  check(formed && net.wiring().contacts == 1 && net.wiring().length == 1,
        "new contact adds its live count and length");
  check(net.formed_wiring().contacts == 1 && net.formed_wiring().length == 1,
        "new contact reports its construction exactly once");
  std::stringstream saved;
  net.write_runtime(saved);
  field::Network restored(tissue);
  restored.read_runtime(saved);
  check(restored.wiring().contacts == 1 && restored.wiring().length == 1,
        "wire upkeep survives loading");
  net.step({}, field::Hormones{}, 39);
  check(net.formed_wiring().contacts == 0, "existing contact has no repeated construction charge");
  field::Hormones h{};
  h[0] = 1;
  net.step({}, h, 39);
  check(net.dead_count() == 1 && net.wiring().contacts == 0 && net.wiring().length == 0,
        "cell death removes wire upkeep");
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
constexpr double VISIBLE_COLOUR_CHANGE = .05;
void life_phases_follow_maturity(const Genome &g) {
  auto w = closed_tank(g);
  std::map<std::uint64_t, bool> young;
  std::map<std::uint64_t, std::size_t> dead;
  for (std::size_t k = 0; k < w.fish.size(); ++k) {
    auto &b = w.fish[k].body;
    young[w.fish[k].id] = k % 2;
    if (k % 2)
      b.tissue = b.peak_tissue = YOUNG_TISSUE;
  }
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    for (const auto &p : w.fish)
      if (young.count(p.id) && p.body.alive && p.body.brain()) {
        const auto now = p.body.brain()->dead_count();
        check(now >= dead[p.id], "a dead cell stays dead");
        dead[p.id] = now;
      }
  }
  const Individual *young_fish = nullptr, *mature_fish = nullptr;
  for (const auto &p : w.fish)
    if (young.count(p.id) && p.body.alive && p.body.brain()) {
      if (young[p.id]) {
        check(dead[p.id] == 0, "a young body keeps its juvenile cells");
        young_fish = &p;
      } else {
        check(dead[p.id] > 0, "a mature body loses its juvenile cells");
        mature_fish = &p;
      }
    }
  check(young_fish && mature_fish, "young and mature fish were observed");
  double change = 0;
  for (int c = 0; c < 3; ++c)
    change += std::abs(young_fish->body.color[c] - mature_fish->body.color[c]);
  check(change > VISIBLE_COLOUR_CHANGE, "young and mature fish differ in colour");
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
    excitation_and_teaching_are_independent();
    all_sources_can_form_first_contacts();
    contact_formation_uses_genetic_strength_and_current_experience();
    delayed_teaching_preserves_credit();
    ordered_retinal_neighbors_match_geometry();
    wiring_costs_follow_formation_and_death();
    retinal_development_is_local_and_restorable();
    const auto g = Genome::load(HAND_BUILT_GENOME);
    closed_tank_creates_no_energy(g);
    checkpoint_continues_exactly(g);
    cut_marks_stay_on_their_piece();
    development_queue_is_bounded(g);
    development_checkpoint_stages(g);
    development_finalization_uses_budget(g);
    maturity_never_decreases(g);
    growth_needs_a_hormone(g);
    life_phases_follow_maturity(g);
    algae_vanish_in_traces(g);
    std::cout << "Energie, Speicherstand, Bissspuren, Reife, Wachstum, Lebensabschnitte und Algen: "
                 "OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
