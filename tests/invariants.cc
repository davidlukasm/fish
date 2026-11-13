#include "test_support.hh"
#include "checkpoint.hh"
#include "physiology.hh"
#include "ecology_internal.hh"
#include "body_plan.hh"
#include "muscle_fibre.hh"
#include "perception.hh"
#include "laboratory.hh"
#include "interactive_session.hh"
#include <algorithm>
#include <map>
#include <set>
namespace test {
struct SessionAccess {
  static Ecosystem &world(InteractiveSession &s) { return s.world; }
  static const std::optional<Ecosystem> &reference(const InteractiveSession &s) {
    return s.reference;
  }
  static bool preparing(const InteractiveSession &s) { return s.laboratory_preparing; }
  static std::uint64_t comparison_start(const InteractiveSession &s) { return s.experiment_start; }
  static void pending(InteractiveSession &s, std::future<Ecosystem> task) {
    s.laboratory_fork = std::move(task);
    s.laboratory_preparing = true;
  }
  static void command(InteractiveSession &s, const std::string &op) {
    bool effect = false;
    std::string reply;
    std::istringstream args;
    s.execute_laboratory(op, args, effect, reply);
  }
  static void prepare(InteractiveSession &s) { s.prepare_laboratory(); }
  static bool finish(InteractiveSession &s) {
    return !s.laboratory_fork.valid() ||
           s.laboratory_fork.wait_for(std::chrono::seconds(2)) == std::future_status::ready;
  }
};
}
using namespace test;
namespace {
constexpr unsigned SEED = 4242;
constexpr int FISH = 2, STEPS = 24;
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
void compact_founders_use_their_actual_reservation(const Genome &g) {
  Ecosystem w(SEED);
  w.starter_world();
  w.neural_budget = 300000;
  constexpr int COUNT = 8;
  w.seed({g}, COUNT, run_limit::default_food);
  check(w.fish.size() == COUNT, "compact founders fit their actual neural budget");
  check(connection_storage(w) <= w.neural_budget, "the resolved reservation remains bounded");
  for (const auto &p : w.fish)
    check(p.genome.blueprint && !p.body.brain() && !p.body.hatched && p.body.age == 0,
          "startup resolves individual anatomy while neural construction still begins in the egg");
}
// A morsel stands out from open water by far less than its own brightness. The eye compares each
// cell's field with a wider surround, and the cell's threshold is the contrast it needs: the
// morsel reaches the brain from as far as the fish sees clearly, and only through the eye it lies
// before.
void eye_reports_a_morsel_against_open_water(const Genome &g) {
  constexpr double X = 300, Y = 205, BEARING = .6, FOOD = 80, SILENT = 1e-6, CLEAR = .5;
  for (double distance : {20., 40., 80.}) {
    Ecosystem w(SEED);
    w.resize(615, 410);
    w.safety = false;
    w.set_parameter("energy_supply", 0);
    w.field.clear_food();
    const auto &b = adult(w, g, X, Y).body;
    const auto &binding = b.active_interface(g);
    const auto strongest = [&] {
      const auto seen = visual_stimuli(b, g, w.field);
      std::array<double, EYES> answer{};
      for (std::size_t i = 0; i < binding.sensory.size() && i < seen.size(); ++i) {
        const auto &r = binding.sensory[i];
        if (r.visual() && !r.proximity)
          answer[r.lateral >= 0] = std::max(
              answer[r.lateral >= 0], double(sensory_response(seen[i], r.response_threshold)));
      }
      return answer;
    };
    const auto open_water = strongest();
    check(open_water[0] < SILENT && open_water[1] < SILENT, "open water leaves the eyes silent");
    Food food{X + distance * std::cos(BEARING), Y + distance * std::sin(BEARING), 0, 0, 0, FOOD};
    food.initial_energy = FOOD;
    // The example fish grazes: its eyes are tuned to the green of plants.
    food.origin = food_kind::algae;
    food.color = ALGAE_COLOR;
    food.radius = food_radius(FOOD);
    w.field.append_fragment(food);
    const auto seen = strongest();
    check(seen[1] > CLEAR && seen[0] < SILENT,
          "a morsel beside the fish is seen clearly, and only by the eye on its side");
  }
}
// The fish smells at one point; only oncoming water sets its nostrils apart.
void nostrils_differ_only_in_oncoming_water() {
  constexpr double SPEED = .5, CLOSE = 1e-12;
  Body b{};
  b.angle = 0;
  const auto nose = nose_position(b);
  const auto offset = [&](Point flow, int side) {
    const auto source = nostril_source(b, nose, flow, side);
    return Point{source.x - nose.x, source.y - nose.y};
  };
  for (int side = 0; side < 2; ++side) {
    const auto still = offset({}, side);
    check(still.x == 0 && still.y == 0, "in still water both nostrils smell the nose itself");
  }
  // The fish swims ahead: the water meets it head-on and reaches both nostrils alike.
  const auto ahead_left = offset({-SPEED, 0}, 0), ahead_right = offset({-SPEED, 0}, 1);
  check(ahead_left.x > 0 && std::abs(ahead_left.x - ahead_right.x) < CLOSE && ahead_left.y == 0 &&
            ahead_right.y == 0,
        "water from ahead brings both nostrils the same scent from ahead");
  // Water streams in from the right (larger y): only the right nostril smells upstream.
  const auto lee = offset({0, -SPEED}, 0), washed = offset({0, -SPEED}, 1);
  check(std::abs(lee.x) < CLOSE && std::abs(lee.y) < CLOSE && washed.y > 0 &&
            std::abs(washed.x) < CLOSE,
        "the nostril facing the oncoming water smells upstream, the other the nose itself");
}
// A gut full of one food, emptied by a fish that spends what it gains: what the fish gains, what
// it passes and whether it hurts.
struct Digested {
  double gained = 0, passed = 0, ache = 0;
  int emptied = 0;
};
Digested digest(int food, double gut_length, double drive = 0, double strength = 0) {
  constexpr int STEPS = 20000;
  constexpr double EMPTY = .05;
  const PhysiologyParameters physiology;
  Body b{};
  b.hatched = true;
  b.tissue = BODY_TISSUE;
  b.gut_length = gut_length;
  b.gut_strength = strength;
  Digested result;
  const double eaten = take_nutrition(b, gut_room(b, food, physiology), food, physiology);
  for (int k = 0; k < STEPS && b.gut_energy > 0; ++k) {
    b.energy = 0;
    b.gut_motility = drive / 2;
    result.passed += digest_nutrition(b, physiology);
    result.ache = std::max(result.ache, b.gut_irritation);
    if (!result.emptied && b.gut_energy < EMPTY * eaten)
      result.emptied = k + 1;
  }
  result.gained = b.digested / eaten;
  result.passed /= eaten;
  return result;
}
// Fibre needs time to break open, flesh spoils when it stays long, pulp feeds almost any gut, and
// the gut muscle shortens the stay only so far.
void gut_takes_up_what_time_allows() {
  constexpr double SHORT = 0, MIDDLE = .5, LONG = 1, STRONG = 1e6, CLOSE = 1e-9, SCARCE = .05;
  constexpr int LEAVES = food_kind::plant, FLESH = food_kind::worm, FLOCK = food_kind::feed,
                ALGAE = food_kind::algae, PLANKTON = food_kind::plankton;
  for (int food : {LEAVES, ALGAE, FLOCK, PLANKTON, FLESH})
    for (double length : {SHORT, MIDDLE, LONG}) {
      const auto meal = digest(food, length);
      check(std::abs(meal.gained + meal.passed - 1) < CLOSE, "a meal is taken up or passed");
    }
  check(digest(LEAVES, LONG).gained > 2 * digest(LEAVES, SHORT).gained,
        "a long gut takes up far more of a meal of leaves");
  check(digest(LEAVES, SHORT).gained < SCARCE,
        "leaves need time to break open: a short gut takes up next to nothing of them");
  const double flesh = digest(FLESH, SHORT).gained;
  check(flesh > 2 * digest(FLESH, LONG).gained,
        "flesh spoils in a long gut: a short gut takes up far more of it");
  const PhysiologyParameters physiology;
  const auto yield = [&](int food, double stay) {
    return gut_yield(stay, fodder(food, physiology));
  };
  // Every food has a stay at which it feeds better than all others, in this order.
  constexpr std::array<std::pair<int, double>, 4> WINDOWS{
      {{FLESH, 100}, {PLANKTON, 200}, {FLOCK, 340}, {LEAVES, 800}}};
  for (const auto &[best, stay] : WINDOWS)
    for (int food : {LEAVES, ALGAE, FLOCK, PLANKTON, FLESH})
      check(food == best || yield(best, stay) > yield(food, stay),
            "every food has its own stay at which it feeds best");
  constexpr double QUICKEST = 25, SLOWEST = 800;
  check(yield(ALGAE, SLOWEST) > yield(ALGAE, QUICKEST) * 4 &&
            yield(ALGAE, 400) > yield(LEAVES, 400),
        "algae feed a long gut, and a middle one better than leaves do");
  const double quick = yield(FLESH, QUICKEST), flock = yield(FLOCK, QUICKEST) / quick,
               algae = yield(ALGAE, QUICKEST) / quick, plankton = yield(PLANKTON, QUICKEST) / quick;
  check(flock > .8 && flock < 1 && algae > .2 && algae < .3 && plankton > .4 && plankton < .6,
        "the quickest gut gets nearly as much from flocks as from flesh, half from plankton and "
        "a quarter from algae");
  const double slow = yield(FLOCK, SLOWEST) / yield(ALGAE, SLOWEST);
  check(slow > .35 && slow < .5 && yield(FLOCK, SLOWEST) < yield(FLOCK, 340) * .6,
        "the slowest gut gets half as much from flocks as from algae");
  check(digest(FLESH, LONG).ache > 0 && digest(FLESH, SHORT).ache == 0,
        "flesh that spoils hurts a long gut, not a short one");
  check(digest(LEAVES, SHORT).ache > 0 && digest(LEAVES, LONG).ache == 0,
        "leaves that pass still closed hurt a short gut, not a long one");
  for (double length : {SHORT, MIDDLE, LONG})
    check(digest(FLOCK, length).ache == 0, "flocks hurt no gut");
  for (int food : {LEAVES, ALGAE, PLANKTON, FLESH})
    check(digest(food, MIDDLE).ache == 0, "a gut of middle length bears every food");
  check(digest(ALGAE, SHORT).ache > 0 && digest(ALGAE, SHORT).ache < digest(LEAVES, SHORT).ache &&
            digest(ALGAE, SHORT, 1, STRONG).ache > digest(ALGAE, SHORT).ache,
        "algae hurt the shortest gut, less than leaves, and more the faster it is driven");
  check(digest(PLANKTON, LONG).ache > 0 && digest(PLANKTON, SHORT).ache == 0 &&
            digest(PLANKTON, LONG).ache < digest(FLESH, LONG).ache,
        "plankton hurts only the longest gut, and less than flesh");
  const auto rested = digest(FLESH, LONG), hurried = digest(FLESH, LONG, 1, STRONG);
  check(hurried.gained > 2 * rested.gained && hurried.gained < flesh,
        "the largest gut muscle saves much flesh in a long gut, but not as much as a short gut");
  check(digest(LEAVES, LONG, 1, STRONG).gained < digest(LEAVES, LONG).gained &&
            hurried.emptied < rested.emptied,
        "a driven gut muscle empties the gut sooner and takes up less of leaves");
  check(digest(LEAVES, LONG, 1, 0).gained == digest(LEAVES, LONG).gained,
        "a gut without a muscle cannot be hurried");
}
// A twitch lasts as long as its fibres make it, also between whole steps: a muscle driven
// without pause twitches that often, and does the work its impulses announce.
void twitches_last_as_long_as_their_fibres() {
  constexpr int STEPS = 9000;
  constexpr double CLOSE = .01;
  for (double steps : {4., 4.25, 4.5, 5.75}) {
    StrokeTiming timing;
    timing.set(steps);
    StrokeState stroke;
    int twitches = 0;
    double announced = 0, done = 0;
    for (int k = 0; k < STEPS; ++k) {
      const double impulse = stroke_step(stroke, 1, timing, 0);
      twitches += impulse > 0;
      announced += impulse;
      done += stroke_shape(stroke);
    }
    check(std::abs(twitches * steps / STEPS - 1) < CLOSE,
          "a driven muscle twitches as often as its twitch is long");
    check(std::abs(done / announced - 1) < CLOSE, "a twitch does the work its impulse announces");
  }
}
// A muscle of slow cells that answer a weak command and fast cells that answer only a strong one.
// Each cell pulls, tires and charges by its own fibres, and the twitch lasts as long as the cells
// that pull make it.
void muscle_cells_keep_their_own_fibres() {
  constexpr double SLOW_STEPS = 12, FAST_STEPS = 4, CLOSE = 1e-9;
  constexpr int SLOW = 0, FAST = 1, ALL_OUT = 60;
  BrainInterface layout;
  for (int cell : {SLOW, FAST}) {
    BrainInterface::Effector e{};
    e.neuron = std::uint32_t(cell);
    e.port = organ_port::suction;
    e.strength = 1;
    e.fibre = float(cell);
    e.steps = float(cell == SLOW ? SLOW_STEPS : FAST_STEPS);
    layout.effectors.push_back(e);
    layout.pulls.push_back({std::uint32_t(cell), StrokeSuction, 1});
  }
  std::vector<double> reserve(2, 1.);
  const auto weak = muscle_demand(layout, {1, 0}, reserve),
             strong = muscle_demand(layout, {1, 1}, reserve);
  const auto lasting = [](const MuscleDemand &d) {
    return d.steps[StrokeSuction] / d.drive[StrokeSuction];
  };
  const auto price = [](const MuscleDemand &d) {
    return d.price[StrokeSuction] / d.drive[StrokeSuction];
  };
  check(std::abs(lasting(weak) - SLOW_STEPS) < CLOSE && lasting(strong) < lasting(weak) &&
            lasting(strong) > FAST_STEPS,
        "a weak command twitches as long as the slow cells, a strong one shorter");
  check(price(strong) > price(weak), "work costs more once the fast cells join");
  std::array<double, STROKE_COUNT> work{};
  work[StrokeSuction] = 2;
  for (int k = 0; k < ALL_OUT; ++k)
    tire_fibres(layout, muscle_demand(layout, {1, 1}, reserve), work, reserve);
  check(reserve[SLOW] == 1 && reserve[FAST] < .5, "only the fast cells tire");
  const auto tired = muscle_demand(layout, {1, 1}, reserve);
  check(tired.drive[StrokeSuction] < strong.drive[StrokeSuction] &&
            tired.drive[StrokeSuction] >= 1 && lasting(tired) > lasting(strong),
        "a tired muscle falls back on its slow cells: weaker, and slower again");
  for (int k = 0; k < ALL_OUT; ++k)
    tire_fibres(layout, muscle_demand(layout, {1, 0}, reserve), work, reserve);
  check(reserve[FAST] > tired.weights[FAST], "fast cells recover while only the slow ones work");
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
void body_substances_control_cell_life() {
  for (int substance : {field::RESERVE_SUBSTANCE, field::FATIGUE_SUBSTANCE}) {
    const double reserve = substance == field::RESERVE_SUBSTANCE ? 1 : 0;
    const double fatigue = substance == field::FATIGUE_SUBSTANCE ? 1 : 0;
    field::HormoneReceptor receptor;
    receptor.affinity[substance] = 1;
    receptor.sensitivity = 1;
    receptor.half = .25f;
    auto tissue = learning_tissue();
    tissue->neurons[2].development_receptor = receptor;
    field::Network growing(tissue, true);
    for (int t = 0; t < 160; ++t)
      growing.grow({}, .4, 0, 0, 100);
    check(growing.life(2) == field::Network::CellLife::Precursor,
          "without its body substance a cell waits to form");
    for (int t = 0; t < 40; ++t)
      growing.grow({}, .4, reserve, fatigue, 100);
    check(growing.life(2) == field::Network::CellLife::Active,
          "reserve and fatigue can each trigger cell formation");

    auto active_tissue = learning_tissue();
    auto &output = active_tissue->neurons[0].hormone_receptors[field::Output];
    output = receptor;
    output.baseline = 1;
    output.sensitivity = -2;
    field::Network active(active_tissue);
    active.set_body_levels(.4, 0, 0);
    active.step({1}, {}, 223);
    check(active.signal(0) == 1, "the unbound output receptor leaves activity intact");
    active.set_body_levels(.4, reserve, fatigue);
    active.step({1}, {}, 223);
    check(std::abs(active.signal(0) - .2f) < 1e-6,
          "reserve and fatigue each modulate actual cell output");
    field::Network restored(active_tissue);
    std::istringstream saved(brain_saved(active));
    restored.read_runtime(saved);
    check(brain_saved(active) == brain_saved(restored), "the brain retains its full blood context");
    for (int t = 0; t < 8; ++t) {
      active.step({1}, {}, 223);
      restored.step({1}, {}, 223);
      check(brain_saved(active) == brain_saved(restored),
            "restored body receptors continue identically without fresh body inputs");
    }

    auto dying_tissue = learning_tissue();
    dying_tissue->neurons[2].hormone_receptors[field::Death] = receptor;
    field::Network dying(dying_tissue), precursor(dying_tissue, true);
    dying.set_body_levels(.4, reserve, fatigue);
    dying.step({0}, {}, 223);
    check(dying.dead(2), "body substances can kill an active cell during a brain step");
    for (unsigned t = 0; t < field::CELL_DEVELOPMENT_INTERVAL; ++t)
      precursor.grow({}, .4, reserve, fatigue, 100);
    check(precursor.dead(2), "body substances can end a cell before its birth");
    for (int t = 0; t < 80; ++t)
      precursor.grow({}, .4, 0, 0, 100);
    check(precursor.dead(2), "removing the body stimulus never resurrects a dead cell");
  }
}
void contact_turnover_pays_for_its_construction() {
  auto s = learning_tissue();
  s->edges.clear();
  s->partner_offset = {0, 0, 1, 1, 1};
  s->partners = {{0, 1}};
  field::Network blocked(s), live(s);
  double paid = 0;
  bool formed = false;
  const auto costs = field::scaled_costs(s->options);
  for (int tick = 0; tick < 128; ++tick) {
    const float cue = tick % 12 < 6 ? 1 : 0;
    blocked.construction_budget(0, 3);
    live.construction_budget(1, 3);
    if (cue) {
      blocked.stimulate(1, .8f);
      live.stimulate(1, .8f);
    }
    blocked.step({cue}, {}, 91723);
    live.step({cue}, {}, 91723);
    const auto &built = live.formed_wiring();
    paid += 3 * (built.contacts * costs.edge_build + built.length * costs.edge_length_build);
    formed |= built.contacts > 0;
    check(blocked.synapse_count() == 0 && blocked.formed_wiring().contacts == 0,
          "activity cannot create a contact without construction energy");
  }
  check(formed && paid > 0 && live.learned_change() > 0,
        "coincident local activity forms, pays and consolidates a new contact");
  auto frozen = live.frozen_probe();
  const auto revision = frozen.wiring_revision();
  for (int tick = 0; tick < 128; ++tick)
    frozen.step({float(tick % 2)}, {}, 91723);
  check(frozen.wiring_revision() == revision, "a frozen probe cannot create replacement contacts");
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
    charged += n.grow({}, .2, 1, 0, 100);
  check(n.life(0) == field::Network::CellLife::Active &&
            n.life(2) == field::Network::CellLife::Precursor,
        "cell growth is locally gated");
  n.stimulate(1, .73f, 8);
  const auto state = n.state();
  const auto revision = n.cell_revision();
  field::Hormones dose{};
  dose[0] = 1;
  for (int t = 0; t < 40; ++t)
    charged += n.grow(dose, 1, 1, 0, 100);
  check(n.life(2) == field::Network::CellLife::Active && n.cell_revision() > revision,
        "late cells can appear after body maturity");
  check(n.state()[1] == state[1] && n.slot_count() <= n.reserved_slots(),
        "growth preserves existing activity and slot reservation");
  check(charged > 0 && charged < .1, "only actual births and contacts are charged");
  field::Network restored(tissue, true);
  std::istringstream in(brain_saved(n));
  restored.read_runtime(in);
  for (int t = 0; t < 20; ++t) {
    n.grow(dose, 1, 1, 0, 100);
    restored.grow(dose, 1, 1, 0, 100);
    n.step({float(t % 2)}, dose, 22);
    restored.step({float(t % 2)}, dose, 22);
    check(brain_saved(n) == brain_saved(restored), "development and learning resume together");
  }
  field::Network unfunded(tissue, true);
  for (int t = 0; t < 200; ++t)
    check(unfunded.grow(dose, 1, 1, 0, 0) == 0, "zero budget has no physical construction charge");
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
    dying.grow({}, 1, 1, 0, 100);
  for (int t = 0; t < 200; ++t)
    dying.step({0}, {}, 1);
  check(dying.dead_count() == 0,
        "isolated cells may wait for future partners without a death timer");
  dying.step({0}, dose, 1);
  check(dying.dead(1) && dying.dead(2) && !dying.dead(0) && !dying.dead(3),
        "the inherited death receptors control permanent cell death");
  const auto dead = dying.dead_count();
  for (int t = 0; t < 100; ++t)
    dying.grow({}, 1, 1, 0, 100);
  check(dying.dead_count() == dead && dying.life(1) == field::Network::CellLife::Dead,
        "a dead cell identity never grows again");
  field::EmbryoConstruction stage(*tissue);
  stage.advance();
  check(stage.work_fraction() == 1 && stage.work_ticks() == 1,
        "small construction has no arbitrary minimum duration");
  field::EmbryoConstruction larger(25, 0);
  check(larger.work_ticks() == 3, "construction duration follows workload and work rate");
  larger.advance();
  check(larger.completed_work() == 10 && std::abs(larger.work_fraction() - .4) < 1e-12,
        "construction progress measures completed work");
  const auto cost = larger.remaining_cost();
  field::EmbryoConstruction resumed(25, 0);
  resumed.restore(larger.completed_work());
  check(resumed.remaining_cost() == cost, "construction estimates resume from actual work");
}
Ecosystem closed_tank(const Genome &g, int count = FISH) {
  Ecosystem w(SEED);
  w.resize(1000, 500);
  w.starter_world();
  w.set_parameter("energy_supply", 0);
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  w.food_burst.strength = 0;
  no_mutation(w);
  for (int k = 0; k < count; ++k)
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
void laboratory_comparison_restarts_during_copy() {
  struct Output {
    std::ostringstream events, errors;
    std::streambuf *out = std::cout.rdbuf(events.rdbuf()), *err = std::cerr.rdbuf(errors.rdbuf());
    ~Output() {
      std::cout.rdbuf(out);
      std::cerr.rdbuf(err);
    }
  };
  for (bool failure : {false, true})
    for (bool cancel : {false, true}) {
      InteractiveOptions options{};
      options.laboratory = true;
      options.seed = SEED;
      InteractiveSession session(options);
      auto &world = SessionAccess::world(session);
      std::promise<Ecosystem> abandoned;
      SessionAccess::pending(session, abandoned.get_future());
      SessionAccess::command(session, "lab-end-compare");
      world.ticks = 17;
      SessionAccess::command(session, "lab-compare");
      bool duplicate_rejected = false;
      try {
        SessionAccess::command(session, "lab-compare");
      } catch (const std::runtime_error &) {
        duplicate_rejected = true;
      }
      check(duplicate_rejected, "an active comparison is not requested twice");
      SessionAccess::command(session, "lab-end-compare");
      world.ticks = 23;
      SessionAccess::command(session, "lab-compare");
      world.ticks = 31;
      SessionAccess::prepare(session);
      check(SessionAccess::preparing(session) && !SessionAccess::reference(session),
            "a restarted comparison waits for the old worker without accepting its result");
      if (cancel)
        SessionAccess::command(session, "lab-end-compare");
      if (failure)
        abandoned.set_exception(std::make_exception_ptr(std::runtime_error("abandoned copy")));
      else {
        Ecosystem previous(SEED);
        previous.ticks = 7;
        abandoned.set_value(std::move(previous));
      }
      Output output;
      SessionAccess::prepare(session);
      check(!SessionAccess::reference(session), "a canceled result never becomes the reference");
      check(output.events.str().empty() && output.errors.str().empty(),
            "a canceled success or failure emits no reset or comparison error");
      check(SessionAccess::finish(session), "a replacement reference completes promptly");
      SessionAccess::prepare(session);
      check(!SessionAccess::preparing(session), "the comparison preparation ends");
      if (cancel)
        check(!SessionAccess::reference(session) && output.events.str().empty(),
              "ending a queued comparison prevents its launch");
      else {
        const auto &reference = SessionAccess::reference(session);
        check(reference && reference->ticks == 23 && SessionAccess::comparison_start(session) == 23,
              "only the latest request becomes the reference, frozen at request time");
        check(output.events.str().find("labor-reset") != std::string::npos &&
                  output.events.str().find("labor-error") == std::string::npos,
              "the latest reference resets the recording without stale errors");
      }
    }
}
void laboratory_energy_is_accounted(const Genome &g) {
  auto w = closed_tank(g);
  const auto id = w.fish.front().id;
  auto &b = w.fish.front().body;
  const double held = b.energy;
  b.hold_energy(held);
  const double introduced = w.field.food_web().introduced, released = w.field.food_web().released;
  double before = tracked_energy(w);
  for (int k = 0; k < 30; ++k) {
    w.tick(false);
    const double now = tracked_energy(w);
    check(now <= before + 1e-6 * std::max(1., before),
          "energy assistance uses the existing external energy balance");
    before = now;
  }
  const auto &held_body = individual(w, id).body;
  check(held_body.energy == held && held_body.supplied_energy() > 0,
        "holding reserve pays the measured metabolism");
  check(w.field.food_web().introduced - introduced + 1e-7 >= held_body.supplied_energy() &&
            w.field.food_web().released - released + 1e-7 >= held_body.withdrawn_energy(),
        "external totals include laboratory exchange alongside the food web's own exchanges");
  auto control = w.fork();
  control.tick(false);
  check(individual(control, id).body.supplied_energy() == 0,
        "a control fork does not inherit the intervention");
}
void laboratory_uses_the_muscles(const Genome &g) {
  for (double turn : {-1., 1.}) {
    Ecosystem w(SEED);
    w.resize(800, 500);
    w.safety = false;
    auto &p = adult(w, g, 400, 250);
    LaboratoryControl c;
    c.forward = 0;
    c.turn = turn;
    apply_laboratory_control(p, w, c);
    anatomical_action(p.body, p.body.active_interface(p.genome), w.physiology(), false);
    const double torque = p.body.motor().drive_left - p.body.motor().drive_right;
    check(turn * torque > 0, "laboratory turn follows the actual fin torque, on both sides");
    check(p.body.ledger().muscle_cost > 0, "manual steering pays muscle work");
  }
}
void laboratory_mouth_hands_over_to_manual_control(const Genome &g) {
  Ecosystem w(SEED);
  w.resize(800, 500);
  auto &p = adult(w, g, 400, 250);
  LaboratoryControl c;
  c.auto_mouth = true;
  for (bool closing : {false, true, false}) {
    c.set_mouth(closing, 1.);
    check(!c.auto_mouth, "a manual mouth command disables its autopilot");
    apply_laboratory_control(p, w, c);
    anatomical_action(p.body, p.body.active_interface(g), w.physiology(), false);
    check(closing ? p.body.bite_signal > 0 && p.body.eat_signal == 0
                  : p.body.eat_signal > 0 && p.body.bite_signal == 0,
          "opening and closing hand over without the antagonist still pulling");
  }
  c.set_mouth(true, 0.);
  check(c.jaw == 0. && c.suction == 0., "zero manual drive leaves both mouth muscles slack");
  c.set_mouth(false, std::nullopt);
  check(!c.jaw && !c.suction, "returning the mouth to the brain clears both overrides");
}
void laboratory_release_waits_for_the_running_twitch(const Genome &g) {
  Ecosystem w(SEED);
  w.resize(800, 500);
  auto &p = adult(w, g, 400, 250);
  const auto &layout = p.body.active_interface(g);
  for (bool eggs : {false, true})
    for (double remaining : {0., .25, 4., 4.25, MAX_STROKE_STEPS - .5}) {
      const int index = eggs ? StrokeEgg : StrokeSperm;
      auto &stroke = StateAccess::motor(p.body).strokes[index];
      stroke = {};
      stroke.span = MAX_STROKE_STEPS;
      stroke.recovery = remaining;
      LaboratoryControl c;
      c.release_gametes(eggs, p.body, w.ticks);
      const auto until = eggs ? c.egg_until : c.sperm_until;
      check((eggs ? c.sperm_until : c.egg_until) == 0,
            "a release request leaves the other gonad alone");
      int impulses = 0;
      while (w.ticks < until) {
        apply_laboratory_control(p, w, c);
        anatomical_action(p.body, layout, w.physiology(), false);
        const bool released =
            eggs ? p.body.reproduction().egg_release : p.body.reproduction().sperm_release;
        impulses += released;
        check(released == (w.ticks + 1 == until),
              "the release command ends at the first available impulse");
        ++w.ticks;
      }
      check(impulses == 1, "one laboratory request produces one release impulse");
    }
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
void worker_counts_preserve_the_simulation(const Genome &g) {
  Ecosystem serial(83921);
  serial.safety = false;
  serial.evo.assist_min_population = serial.evo.assist_species_minimum = 0;
  serial.resize(1000, 500);
  serial.seed({g}, 4, run_limit::default_food);
  auto parallel = serial.fork();
  check(saved(serial) == saved(parallel),
        "a just-seeded aquarium restores before private brains are constructed");
  serial.workers = 1;
  parallel.workers = 4;
  for (int step = 0; step < 64; ++step) {
    serial.tick();
    parallel.tick();
  }
  parallel.workers = serial.workers;
  check(saved(serial) == saved(parallel),
        "one and four workers produce exactly the same developmental and aquarium state");
}
void completed_anatomy_is_admitted_before_runtime_allocation(const Genome &g) {
  Ecosystem w(83921);
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  auto pending = g;
  pending.development_options.max_edges = 4096;
  pending.discard_development();
  w.neural_budget = pending.development_options.max_edges;
  check(w.spawn(pending, 400, 250, fish_origin::natural, 0, 0, 180),
        "a pending egg initially fits its plan reservation");
  for (int step = 0; step < 100 && !w.fish.empty(); ++step) {
    w.tick();
    check(connection_storage(w) <= w.neural_budget,
          "actual runtime reservations never exceed the aquarium budget");
    for (const auto &p : w.fish)
      check(!p.body.brain(), "an oversized brain is rejected before private rows are allocated");
  }
  check(w.metrics().budget_rejections == 1 && w.fish.empty(),
        "one actual oversized anatomy causes one deterministic rejection");
}
// Recorded incubation cost and measured loss may differ only by floating-point rounding.
void development_queue_is_bounded(const Genome &g) {
  auto w = closed_tank(g, 0);
  constexpr int EGGS = 4;
  for (int i = 0; i < EGGS; ++i) {
    Genome egg = g;
    egg.blueprint.reset();
    egg.interface.reset();
    egg.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(egg, 400 + i * 10, 250,
                  i == EGGS - 1 ? fish_origin::immigrant : fish_origin::natural, 0, 0, 300),
          "queued embryo placement");
  }
  check(w.metrics().budget_rejections == 0 && connection_storage(w) < w.neural_budget,
        "a burst of pending natural eggs reserves plans without fictitious runtime rows");
  w.tick(false, true);
  int started = 0;
  for (const auto &egg : w.fish)
    started += bool(egg.genome.growing || egg.genome.blueprint);
  check(started == 1, "fresh evaluator preparations obey the population budget");
  for (int i = 0; i < 8; ++i)
    w.tick(false, true);
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
void development_checkpoint_stages(const Genome &g) {
  constexpr std::size_t SLICE = 37, QUERY_BATCH = 4096;
  for (bool finalizing : {false, true}) {
    auto w = closed_tank(g, 0);
    Genome fresh = g;
    fresh.discard_development();
    fresh.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(fresh, FIRST_X, DEPTH, fish_origin::natural, 0, 0, 300), "development fixture");
    auto &plan = w.fish.front().genome;
    plan.advance_development(SLICE);
    if (finalizing) {
      while (!plan.growing->pending_finalization())
        check(!plan.advance_development(QUERY_BATCH), "fixture reaches finalization");
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
  constexpr int EMBRYOS = 3;
  constexpr std::size_t QUERY_SLICE = 4096, WORK_BUDGET = 131072;
  auto w = closed_tank(g, 0);
  w.evo.development_work = WORK_BUDGET;
  std::vector<std::size_t> before;
  for (int i = 0; i < EMBRYOS; ++i) {
    Genome fresh = g;
    fresh.discard_development();
    fresh.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    check(w.spawn(fresh, FIRST_X + i * 120, DEPTH, fish_origin::natural, 0, 0, 300),
          "finalization fixture placement");
    auto &plan = w.fish.back().genome;
    while (!plan.growing || !plan.growing->pending_finalization())
      check(!plan.advance_development(QUERY_SLICE), "fixture pauses before finalization");
    before.push_back(plan.pending_work());
  }
  w.tick(false, true);
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
void checkpoint_continues_exactly(const Genome &g) {
  std::map<const evolution::History *, std::shared_ptr<evolution::History>> histories;
  Genome founder = g;
  founder.cppn = g.cppn->snapshot(histories);
  auto w = closed_tank(g);
  w.fish.front().genome.cppn->history()->next_generation();
  for (int step = 0; step < STEPS / 2; ++step)
    w.tick();
  std::stringstream state(
      serialize_checkpoint(capture_checkpoint(w, founder, 0, true, false, 0, w.ticks, 0)));
  auto copy = std::move(read_checkpoint(state, w.workers).world);
  check(saved(w) == saved(copy), "a checkpoint restores the whole tank");
  const auto &seen = w.field.visible(), &kept = copy.field.visible();
  check(!seen.empty() && seen.size() == kept.size() &&
            std::equal(seen.begin(), seen.end(), kept.begin(),
                       [](const VisibleBody &a, const VisibleBody &b) {
                         return a.x == b.x && a.y == b.y && a.id == b.id && a.kind == b.kind &&
                                a.source == b.source && a.radius == b.radius &&
                                a.color == b.color && a.flow_x == b.flow_x &&
                                a.flow_y == b.flow_y && a.odor_energy == b.odor_energy;
                       }) &&
            w.field.carrion_odor().size() == copy.field.carrion_odor().size(),
        "a checkpoint keeps the bodies and scents the next step's food web reads");
  for (int step = 0; step < STEPS / 2; ++step) {
    w.tick();
    copy.tick();
  }
  check(saved(w) == saved(copy), "a restored tank continues exactly like the original");
}
// The last step's index still points at the fish list as it was before a death in that step
// (the first fish dies, so every later one moves up); a checkpoint taken right then loads and
// continues like the original.
void checkpoint_after_death(const Genome &g) {
  auto w = closed_tank(g);
  w.tick();
  const auto living = w.fish.size();
  w.fish.front().body.health = 0;
  w.tick(false);
  check(w.fish.size() < living, "the dead fish leaves the population");
  auto copy = w.fork();
  check(copy.field.visible().size() == w.field.visible().size(),
        "a checkpoint right after a death keeps the last step's bodies");
  for (int step = 0; step < 4; ++step) {
    w.tick(false);
    copy.tick(false);
  }
  check(saved(w) == saved(copy), "a tank saved right after a death continues exactly");
}
void organ_muscles_survive_checkpoint(const Genome &g) {
  Ecosystem w(SEED);
  w.resize(800, 500);
  w.safety = false;
  w.set_parameter("energy_supply", 0);
  auto &b = adult(w, g, 400, 250).body;
  take_nutrition(b, 20, food_kind::feed, w.physiology());
  // Digestion uses the previous step's gut drive before the next neural action replaces it.
  b.gut_motility = .8;
  b.gill_signal = StateAccess::motor(b).gill_pose = .6;
  StateAccess::motor(b).fin_tension = {.4, -.25, .5, -.75, -1};
  auto copy = w.fork();
  const auto &restored = copy.fish.front().body;
  check(restored.gut_motility == b.gut_motility && restored.gill_signal == b.gill_signal &&
            restored.motor().gill_pose == b.motor().gill_pose,
        "a checkpoint retains the working gut and gill muscles");
  check(restored.motor().fin_tension == b.motor().fin_tension,
        "a checkpoint retains forward and backward poses of pectoral and pelvic fins");
  for (int step = 0; step < 4; ++step) {
    w.tick(false);
    copy.tick(false);
    check(saved(w) == saved(copy), "digestion and motion continue identically after loading");
  }
}
void embryo_uses_delivered_muscle_force(const Genome &g) {
  Ecosystem w(SEED);
  w.resize(800, 500);
  auto &b = adult(w, g, 400, 250).body;
  std::set<std::uint32_t> tail;
  for (const auto &e : g.interface->effectors)
    if (e.port == organ_port::forward && e.lever < 0)
      tail.insert(e.neuron);
  check(!tail.empty(), "the embryo force fixture has a left tail muscle");
  b.set_actuation_probe(
      [&tail](std::uint32_t cell, float) { return tail.count(cell) ? 1.f : 0.f; });
  anatomical_action(b, *g.interface, w.physiology(), false);
  const double delivered = b.motor().strokes[StrokeTailLeft].force,
               planned = b.motor().impulse_tail_left * b.motor().motor_factor,
               progress = b.development()->work_fraction();
  check(delivered > 0 && planned > delivered && progress > 0,
        "a new twitch has delivered only its first step, not its planned whole impulse");
  auto physiology = w.physiology();
  physiology.hatch_force_base =
      (delivered + planned) * progress / (2 * std::max(physiology.hatch_mass_floor, body_mass(b)));
  physiology.hatch_force_shell = 0;
  b.hatched = false;
  b.embryo.shell = 0;
  advance_embryo(b, g, physiology, true);
  check(!b.hatched, "unpaid future muscle work cannot break the eggshell");
  const double flow = *std::max_element(b.embryo.flow.begin(), b.embryo.flow.end());
  check(flow > 0 &&
            flow <= physiology.embryo_flow_gain * delivered * progress + tolerance::precision,
        "embryonic water movement is bounded by the muscle force already paid for");
}
// One tail flank strikes, rests, and the other answers with the given share of its drive.
struct TailAnswer {
  double sweep, forward, turn_left, turn_right;
  bool answered;
};
TailAnswer tail_answer(const Genome &g, float first, float answer) {
  Ecosystem w(SEED);
  w.resize(800, 500);
  auto &b = adult(w, g, 400, 250).body;
  std::array<std::set<std::uint32_t>, 2> flank;
  for (const auto &e : g.interface->effectors)
    if (e.port == organ_port::forward && e.lever != 0)
      flank[e.lever < 0 ? 0 : 1].insert(e.neuron);
  check(!flank[0].empty() && !flank[1].empty(), "the tail fixture has muscles on both flanks");
  std::array<float, 2> level{first, 0};
  b.set_actuation_probe([&](std::uint32_t cell, float) {
    return flank[0].count(cell) ? level[0] : flank[1].count(cell) ? level[1] : 0.f;
  });
  anatomical_action(b, *g.interface, w.physiology(), false);
  level = {0, 0};
  for (int step = 0; step < 64 && b.motor().strokes[StrokeTailLeft].recovery > 0; ++step)
    anatomical_action(b, *g.interface, w.physiology(), false);
  level = {0, answer};
  anatomical_action(b, *g.interface, w.physiology(), false);
  return {b.motor().sweep[StrokeTailRight], b.motor().drive_forward, b.motor().drive_left,
          b.motor().drive_right, b.motor().impulse_tail_right > 0 && b.motor().tail_pair.last == 1};
}
void a_stronger_answering_tail_stroke_steers(const Genome &g) {
  const auto equal = tail_answer(g, .8f, .8f), weaker = tail_answer(g, .8f, .4f),
             stronger = tail_answer(g, .4f, .8f);
  check(equal.answered && weaker.answered && stronger.answered,
        "each answer starts a right stroke after the left one");
  check(std::abs(equal.sweep - 1) < tolerance::precision && equal.turn_left == equal.turn_right,
        "an equally strong answer only pushes");
  check(std::abs(weaker.sweep - 1) < tolerance::precision, "a weaker answer only pushes");
  check(stronger.sweep < 1 && stronger.sweep > antagonist::lone_sweep &&
            stronger.turn_left > stronger.turn_right,
        "a stronger right answer steers toward the left like a lone right stroke, less strongly");
}
void ancestral_histories_keep_current_mutations() {
  evolution::History old("ancestor");
  const auto connection = old.connection(0, 1);
  old.split(connection, 0, 1);
  old.duplicate(1);
  auto current = old;
  current.next_generation();
  const auto newer = current.connection(0, 1), twin = current.duplicate(1);
  const auto split = current.split(connection, 0, 1);
  const auto expected = current;
  for (bool older_first : {false, true}) {
    auto combined = older_first ? old : current;
    combined.merge(older_first ? expected : old);
    check(combined.generation() == expected.generation() && combined.connection(0, 1) == newer &&
              combined.duplicate(1) == twin && combined.split(connection, 0, 1).node == split.node,
          "restoring an ancestor preserves current mutation identities in either order");
  }
  auto conflicting = old;
  conflicting.next_generation();
  conflicting.connection(1, 0);
  bool rejected = false;
  try {
    current.merge(conflicting);
  } catch (const std::runtime_error &) {
    rejected = true;
  }
  check(rejected, "conflicting innovation endpoints remain invalid");
}
}
// A gland's substance heads for half of what is poured: up with the cell time, down with its own
// residence, and binding clears what is left. One substance is fleeting, the other lasting.
void gland_substances_rise_and_stay_by_their_cells() {
  const HormoneParameters parameters;
  HormoneState state;
  field::Hormones pour{}, none{}, rise{}, stay{};
  rise.fill(4);
  stay.fill(8);
  stay[1] = 512;
  pour[0] = pour[1] = 1;
  for (int step = 0; step < 20; ++step)
    state.advance(pour, none, 1, parameters, rise, stay);
  check(std::abs(state.levels()[0] - parameters.height) < .01 * parameters.height &&
            std::abs(state.levels()[1] - parameters.height) < .01 * parameters.height,
        "a full command holds both substances at the gland's height, whatever their residence");
  for (int step = 0; step < 40; ++step)
    state.advance(none, none, 1, parameters, rise, stay);
  check(state.levels()[0] < .01 * parameters.height && state.levels()[1] > .9 * parameters.height,
        "after the gland falls silent the fleeting substance is gone and the lasting one stays");
  field::Hormones bind{};
  bind[1] = 1;
  const double before = state.levels()[1];
  for (int step = 0; step < 22; ++step)
    state.advance(none, bind, 1, parameters, rise, stay);
  check(state.levels()[1] < .55 * before, "binding clears a lasting substance in about 22 steps");
}
// The cells of one sense group share their place, not their answer: each reports by its own
// threshold and gets used to a lasting stimulus at its own pace.
void cells_of_a_sense_group_answer_each_for_itself() {
  constexpr double FILLING = .6, ACHE = .8;
  constexpr int LASTING = 40;
  Ecosystem w(SEED);
  const auto cell = [](BrainInterface &layout, int sense, float threshold, float habit) {
    BrainInterface::Receptor r{};
    r.neuron = std::uint32_t(layout.sensory.size());
    r.senses[sense] = 1;
    r.refresh_modality();
    r.inner = true;
    r.threshold = threshold;
    r.adaptation_rate = habit;
    layout.active_sensory.push_back(r.neuron);
    layout.sensory.push_back(r);
  };
  auto layout = std::make_shared<BrainInterface>();
  // Three fullness cells with staggered thresholds, two pain cells that differ only in how fast
  // they get used to the ache.
  for (float threshold : {.2f, .5f, .8f})
    cell(*layout, field::InnerPressure, threshold, 0);
  for (double steps : {field::ADAPTATION_MIN, field::ADAPTATION_MIN * field::ADAPTATION_SPAN})
    cell(*layout, field::Damage, .2f, float(1 / steps));
  Genome g;
  g.interface = layout;
  Body b{};
  b.x = b.y = SIZE / 2;
  b.hatched = true;
  b.tissue = BODY_TISSUE;
  b.gut_fill = FILLING * gut_capacity(b);
  b.gut_irritation = ACHE;
  sense_generated(b, g, w.field, nullptr, true, w.physiology());
  const auto first = b.perception().sensor_buffer;
  check(first[0] > first[1] && first[1] > 0 && first[2] == 0,
        "fullness cells of one group report by their own thresholds: the lowest most, the "
        "highest not yet");
  check(first[3] > 0 && first[3] == first[4], "a fresh ache reaches both pain cells alike");
  for (int step = 1; step < LASTING; ++step)
    sense_generated(b, g, w.field, nullptr, true, w.physiology());
  const auto &lasting = b.perception().sensor_buffer;
  const auto &used = b.perception().adapted;
  check(used[3] > .9 * ACHE && used[4] < .1 * ACHE,
        "each pain cell keeps its own measure of the ache it is used to");
  check(lasting[3] == 0 && lasting[4] > .5 * first[4],
        "the quick cell has fallen silent under a lasting ache, the slow one still reports it");
  check(lasting[0] == first[0] && lasting[2] == 0, "fullness cells do not get used to a full gut");
}
int main() {
  try {
    Genome::begin_run(SEED);
    gland_substances_rise_and_stay_by_their_cells();
    cells_of_a_sense_group_answer_each_for_itself();
    laboratory_comparison_restarts_during_copy();
    ancestral_histories_keep_current_mutations();
    nostrils_differ_only_in_oncoming_water();
    gut_takes_up_what_time_allows();
    twitches_last_as_long_as_their_fibres();
    muscle_cells_keep_their_own_fibres();
    initial_plants_use_the_available_energy();
    contact_turnover_pays_for_its_construction();
    body_substances_control_cell_life();
    development_preserves_identity_and_reserves_capacity();
    const auto g = Genome::load(EXAMPLE_GENOME);
    compact_founders_use_their_actual_reservation(g);
    worker_counts_preserve_the_simulation(g);
    completed_anatomy_is_admitted_before_runtime_allocation(g);
    eye_reports_a_morsel_against_open_water(g);
    closed_tank_creates_no_energy(g);
    laboratory_energy_is_accounted(g);
    laboratory_uses_the_muscles(g);
    laboratory_mouth_hands_over_to_manual_control(g);
    laboratory_release_waits_for_the_running_twitch(g);
    checkpoint_continues_exactly(g);
    checkpoint_after_death(g);
    organ_muscles_survive_checkpoint(g);
    embryo_uses_delivered_muscle_force(g);
    a_stronger_answering_tail_stroke_steers(g);
    development_queue_is_bounded(g);
    development_checkpoint_stages(g);
    egg_development_checkpoint(g);
    development_finalization_uses_budget(g);
    algae_vanish_in_traces(g);
    std::cout
        << "Energie, Speicherstand, Bissspuren, Sinne, Schwere, Seitenlinie, Muscheln, Barteln, "
           "Reife, "
           "Wachstum "
           "und Algen: "
           "OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
