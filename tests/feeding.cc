#include "test_support.hh"
#include <numeric>

using namespace test;
namespace {
FeedingResult step_feed(Ecosystem &w) {
  auto &b = w.fish[0].body;
  advance_test_mouth(b);
  StateAccess::motor(b).mouth_pose = b.mouth.opening;
  StateAccess::motor(b).bite_pose = b.mouth.biting ? b.mouth.opening : 0;
  StateAccess::motor(b).suction_pose = b.mouth.flow;
  return feed(w);
}

void bite_remainder(const Genome &g) {
  auto w = small_world(1209);
  auto &b = adult(w, g, 200, 200).body;
  b.bite_signal = 1;
  b.eat_signal = 0;
  b.bite_strength = default_max_bite_force;
  b.angle = 0;
  Food piece{200 + mouth_offset(b), 200, 0, 0, 0, 15};
  piece.bitten = true;
  piece.radius = .5 * bite_radius(b, false);
  piece.initial_energy = piece.energy;
  w.field.append_fragment(piece);
  const auto original = w.field.feeding().pieces.size() - 1;
  double swallowed = 0;
  for (int k = 0; k < 5; ++k)
    swallowed += step_feed(w).raw[0];
  double energy = 0;
  int live = 0;
  for (const auto &f : w.field.feeding().pieces)
    if (f.energy > 0) {
      energy += f.energy;
      ++live;
      check(f.bitten, "fish bite marks its real fragments");
    }
  // A bite that fits the mouth goes straight into the gut; only what the gut cannot take stays
  // loose.
  check(w.field.feeding().pieces[original].energy == 0 && swallowed > 0 && live <= 1 &&
            near(energy + swallowed, 15),
        "a fitting bite is swallowed together with its tiny remainder");
}

void mouth_mechanics(const Genome &g) {
  Body b{};
  b.tissue = 40;
  b.suction_strength = b.bite_strength = default_max_bite_force;
  b.eat_signal = b.bite_signal = 1;
  int closures = 0;
  for (int i = 0; i < 16; ++i) {
    advance_test_mouth(b);
    closures += b.mouth.closing;
    check(b.mouth.credit <= b.mouth.budget + 1e-9,
          "transport credit stays within the cycle budget");
    check(near(mouth_aperture(b), maximum_mouth_aperture(b) * b.mouth.opening),
          "one actual opening controls physical admission");
  }
  check(closures == 2, "sustained biting causes exactly one contact per eight-step cycle");
  b.mouth = {};
  StateAccess::motor(b).strokes = {};
  b.bite_signal = 0;
  for (int i = 0; i < 12; ++i) {
    advance_test_mouth(b);
    if (i >= 3)
      check(near(b.mouth.opening, 1) && b.mouth.flow > 0, "suction alone holds the mouth open");
  }
  b.gut_fill = gut_capacity(b);
  advance_test_mouth(b);
  check(b.mouth.flow > 0, "a full gut cannot turn off pumping");
  auto w = small_world(1210);
  auto &eater = adult(w, g).body;
  eater.eat_signal = 1;
  eater.bite_signal = 0;
  eater.mouth = {};
  StateAccess::motor(eater).strokes = {};
  step_feed(w);
  auto copy = w.fork();
  check(saved(w) == saved(copy), "part-used mouth cycles survive checkpoints exactly");
  for (int i = 0; i < 9; ++i) {
    step_feed(w);
    step_feed(copy);
    check(saved(w) == saved(copy), "restored mouth phases and transport remain deterministic");
  }
  // Two continuous food sources cannot each consume an independent transport allowance.
  auto &web = StateAccess::food_web(w.field);
  w.field.sync_food_web();
  for (auto &v : web.plankton.energy)
    v = 100;
  eater.mouth = {};
  StateAccess::motor(eater).strokes = {};
  eater.gut_fill = eater.gut_energy = eater.gut_digestible = 0;
  advance_test_mouth(eater);
  const double density = w.field.plankton_density(eater.x + mouth_offset(eater), eater.y),
               offered_area = eater.mouth.credit, budget = eater.mouth.budget;
  const auto filtered = feed(w);
  check(near(eater.mouth.filtered, filtered.raw[6]),
        "display uptake tracks the actual filtered plankton");
  check(filtered.raw[6] > 0 && near(filtered.raw[6], density * offered_area),
        "plankton extraction uses exactly the physical pumped water area");
  check(near(eater.mouth.budget, budget) && eater.mouth.credit < 1e-9,
        "uptake consumes this step's water credit without charging the cycle a second time");
  for (int source : {0, 1, 2, 3, 4}) {
    auto eating = small_world(1212 + source);
    auto &fish = adult(eating, g).body;
    fish.eat_signal = 1;
    fish.bite_signal = 0;
    fish.suction_strength = default_max_bite_force;
    Food food{fish.x + mouth_offset(fish), fish.y, 0, 0, 0, 10};
    food.radius = .2;
    food.origin = source;
    StateAccess::feeding(eating.field).pieces.push_back(food);
    for (int k = 0; k < 4; ++k)
      step_feed(eating);
    const double expected = source > 0 ? 10 * digestibility(fish, source) : 0;
    check(near(StateAccess::feeding(eating.field).nature_intake, expected),
          "natural feedback includes usable flesh, eggs, carrion and plant intake");
  }
  auto shell_world = small_world(1211);
  auto &crusher = adult(shell_world, g).body;
  crusher.bite_strength = default_max_bite_force;
  crusher.bite_signal = 1;
  crusher.eat_signal = 1;
  crusher.gut_fill = gut_capacity(crusher);
  StateAccess::env(shell_world.field).hardness_mussel = 0;
  StateAccess::env(shell_world.field).hardness_mussel_growth = 0;
  auto &sw = StateAccess::food_web(shell_world.field);
  Mussel mussel;
  mussel.id = sw.next_id++;
  mussel.x = crusher.x + mouth_offset(crusher);
  mussel.y = crusher.y;
  mussel.energy = 60;
  sw.mussels.push_back(mussel);
  for (int i = 0; i < 5; ++i)
    advance_test_mouth(crusher);
  std::vector<VisibleBody> animals;
  shell_world.field.index_small_animals(animals);
  shell_world.field.index(animals);
  std::vector<unsigned char> bitten(1);
  const double full = crusher.gut_fill;
  shell_world.feeding(0, crusher.x, crusher.y, false, bitten, 0);
  double fragments = 0;
  for (const auto &piece : shell_world.field.feeding().pieces)
    fragments += piece.energy;
  check(near(fragments, 60) && crusher.gut_fill == full && sw.shells.size() == 1,
        "a full fish can crack a shell: all energy becomes real fragments, with empty valves");
  const auto count = shell_world.field.feeding().pieces.size();
  shell_world.feeding(0, crusher.x, crusher.y, false, bitten, 0);
  check(shell_world.field.feeding().pieces.size() == count && near(crusher.gut_fill, full),
        "the same closure cannot deliver a second contact");
  auto restored_shells = shell_world.fork();
  check(saved(shell_world) == saved(restored_shells), "empty shells survive checkpoints");
}

void separate_material(const Genome &g) {
  auto w = small_world(1201);
  StateAccess::env(w.field).crumb_min = .001; // Isolate biting and swallowing from crumb decay.
  adult(w, g, 200, 200);
  adult(w, g, 208, 200); // Touching bodies isolate the bite from the actual gape.
  auto &a = w.fish[0].body;
  auto &prey = w.fish[1].body;
  a.angle = 0;
  a.bite_strength = default_max_bite_force; // Same reference force on the shared force scale.
  a.bite_signal = 1;
  a.eat_signal = 0;
  a.energy = 100;
  prey.color = {0, 0, 1};
  prey.energy = 100;
  // A fitting bite goes straight into the gut; a full gut leaves the bitten flesh loose.
  a.gut_fill = gut_capacity(a);
  const double before = w.total_energy(), tissue = prey.tissue, reserve = prey.energy;
  for (int i = 0; i < 5; ++i)
    step_feed(w);
  check(a.nutrition == 0 && StateAccess::feeding(w.field).pieces.size() == 1 &&
            StateAccess::feeding(w.field).pieces[0].origin == 1,
        "a bite creates free flesh without feeding the attacker");
  check(near((tissue - prey.tissue) / tissue, (reserve - prey.energy) / reserve),
        "the fragment carries the proportional prey reserve");
  check(w.total_energy() <= before && before - w.total_energy() < .3,
        "only bite work dissipates energy before swallowing");
  auto piece = StateAccess::feeding(w.field).pieces[0];
  check(piece.color == prey.color && piece.energy > 0 &&
            piece.vx == .75 * StateAccess::motor(prey).vx + .25 * StateAccess::motor(a).vx,
        "flesh retains source colour and contact motion");
  StateAccess::feeding(w.field).pieces[0].x = 200 + body_radius(a);
  StateAccess::feeding(w.field).pieces[0].y = 200;
  StateAccess::feeding(w.field).pieces[0].radius = 1;
  a.bite_signal = 0;
  a.eat_signal = 1;
  a.suction_strength = default_max_bite_force;
  a.gut_fill = 0;
  const double raw = StateAccess::feeding(w.field).pieces[0].energy;
  for (int i = 0; i < 12 && a.nutrition == 0; ++i)
    step_feed(w);
  check(near(a.nutrition, raw * digestibility(a, 1)) && near(a.gut_energy, raw),
        "swallowing alone assimilates the real flesh fragment");
}

void suction(const Genome &g) {
  auto w = small_world(1202);
  StateAccess::env(w.field).crumb_min = .001; // Exercise fragment transport independently.
  auto &b = adult(w, g).body;
  b.energy = 100;
  b.eat_signal = 1;
  b.bite_signal = 0;
  b.suction_strength = default_max_bite_force;
  const double mx = b.x + mouth_offset(b);
  for (int k = 0; k < 3; ++k) {
    Food p{mx + .2, b.y, 0, 0, 0, 10};
    p.radius = .2;
    StateAccess::feeding(w.field).pieces.push_back(p);
  }
  const double total = w.total_energy();
  for (int i = 0; i < 4; ++i)
    step_feed(w);
  check(near(b.nutrition, 30 * digestibility(b, 0)) && near(w.total_energy(), total),
        "several whole grains share one transport budget and conserve energy");
  b.gut_fill = gut_capacity(b) - 5;
  StateAccess::feeding(w.field).pieces = {Food{mx, b.y, 0, 0, 0, 10}};
  StateAccess::feeding(w.field).pieces[0].radius = .2;
  check(step_feed(w).nutrition[0] == 0 && StateAccess::feeding(w.field).pieces[0].energy == 10,
        "a whole grain remains intact when it does not fit the free gut");
  b.gut_fill = 0;
  StateAccess::feeding(w.field).pieces[0].radius = maximum_mouth_aperture(b) + 1;
  check(step_feed(w).nutrition[0] == 0, "the actual opening rejects an oversized object");
  b.mouth = {};
  StateAccess::motor(b).strokes = {};
  b.bite_signal = 1;
  b.bite_strength = default_max_bite_force;
  double bitten = 0;
  for (int i = 0; i < 5; ++i)
    bitten += step_feed(w).raw[0];
  double loose = 0;
  for (const auto &f : StateAccess::feeding(w.field).pieces)
    loose += f.energy;
  // The bite fits the mouth, so it goes straight into the gut; the oversized rest stays loose.
  check(bitten > 0 && loose > 0 && near(bitten + loose, 10),
        "closure swallows a fitting bite directly and leaves the rest of the grain loose");
  auto barrier = small_world(1203);
  auto &blocked = adult(barrier, g).body;
  blocked.eat_signal = 1;
  check(barrier.wall(205, 180, 205, 220, 1), "suction wall fixture");
  StateAccess::feeding(barrier.field).pieces = {Food{207, 200, 0, 0, 0, 10}};
  StateAccess::feeding(barrier.field).pieces[0].radius = .2;
  for (int i = 0; i < 8; ++i)
    check(step_feed(barrier).nutrition[0] == 0, "walls block the actual incoming grain");
}

void pools_and_state(const Genome &g) {
  auto w = small_world(1204);
  // Fragment persistence starts after the initial external colonisation pulse.
  w.ticks = w.field.time = 1;
  StateAccess::env(w.field).plankton_limit = 0;
  auto &b = adult(w, g).body;
  b.eat_signal = 0;
  b.bite_signal = 0;
  for (int origin = 0; origin < 6; ++origin) {
    Food f{300. + origin, 200, 1, -.2, 0, 20};
    f.origin = origin;
    f.radius = 1;
    f.initial_energy = 20;
    f.color = {.2, .5, .7};
    f.age = 81;
    f.decay_age = 40;
    f.buoyancy = -.25;
    StateAccess::feeding(w.field).pieces.push_back(f);
  }
  check(near(w.field.food_energy(), 20) && near(w.field.algae_energy(), 20) &&
            near(w.field.grass_energy(), 20),
        "loose fragments remain in the original external energy pool");
  const double total = w.total_energy();
  auto copy = w.fork();
  check(saved(w) == saved(copy) && StateAccess::feeding(copy.field).pieces[5].origin == 5 &&
            near(StateAccess::feeding(copy.field).pieces[5].buoyancy, -.25),
        "all material properties survive saving");
  for (int k = 0; k < 15; ++k) {
    w.tick(false);
    copy.tick(false);
    check(saved(w) == saved(copy), "free fragments continue identically after loading");
    check(w.total_energy() <= total, "closed tank cannot gain energy from fragments");
  }
}
}
int main() {
  try {
    Genome::begin_run(42);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN query(base.cppn);
    auto g = quiet(base, query);
    bite_remainder(g);
    mouth_mechanics(g);
    separate_material(g);
    suction(g);
    pools_and_state(g);
    std::cout << "feeding: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
