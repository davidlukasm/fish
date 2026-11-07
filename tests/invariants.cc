#include "test_support.hh"
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
