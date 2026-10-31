#include "test_support.hh"

using namespace test;
namespace {
void death_provenance(const Genome &g) {
  for (int cause : {0, 1, 6, 7}) {
    auto w = small_world(109 + cause);
    auto &p = adult(w, g);
    auto &b = p.body;
    if (cause == 0) {
      b.energy = 0;
      b.tissue = MIN_TISSUE + .2;
      b.peak_tissue = HATCH_TISSUE;
      b.health = .001;
      b.disease = 10;
      pay_activity(b, 1);
    } else if (cause == 1) {
      b.health = .01;
      injure(b, .1);
    } else {
      b.health = .0001;
      if (cause == 6)
        b.age = b.hatch_age + 3000;
      else
        b.disease = 1;
    }
    if (cause <= 1) {
      check(b.health == 0 && b.fatal_cause == cause,
            "the event that first exhausts health records its own cause");
      auto restored = w.fork();
      check(saved(w) == saved(restored) && restored.fish[0].body.fatal_cause == cause,
            "pending fatal provenance survives saving before death collection");
    }
    w.tick(false);
    check(w.fish.empty() && StateAccess::metrics(w).deaths == 1 &&
              StateAccess::metrics(w).death_causes[cause] == 1,
          "starvation, injury, age and disease remain distinct even with another "
          "ongoing illness");
    if (cause == 0)
      check(StateAccess::metrics(w).collision_deaths == 0 &&
                StateAccess::metrics(w).predation_deaths == 0,
            "tissue mobilization is not recorded as a fatal collision or attack");
  }
  auto late = small_world(118);
  auto &b = adult(late, g).body;
  b.energy = -1;
  b.tissue = MIN_TISSUE + .2;
  b.peak_tissue = HATCH_TISSUE;
  b.health = .001;
  maintain_body(b);
  check(!b.alive && b.fatal_cause == 0, "end-of-step tissue mobilization also records starvation");
}

void breeding_space(const Genome &g) {
  for (int variant = 0; variant < 4; ++variant) {
    auto w = small_world(808 + variant);
    auto mother = adult(w, g).id;
    auto species = w.fish[0].species;
    auto other = StateAccess::taxonomy(w).species[0];
    other.id = StateAccess::taxonomy(w).next_species++;
    StateAccess::taxonomy(w).species.push_back(other);
    double radius = variant == 2 ? 70 : 60;
    for (int i = 0; i < 4; ++i) {
      check(w.spawn(g, 200 + radius * std::cos(i * PI / 2), 200 + radius * std::sin(i * PI / 2), 1,
                    0, 0, 100),
            "crowding fixture");
      auto &e = w.fish.back();
      if (variant == 1)
        e.species = other.id;
      else if (variant == 3) {
        e.species = 0;
        e.fertilised = false;
        e.maternal_species = species;
      }
    }
    auto &p = individual(w, mother);
    StateAccess::reproduction(p.body).egg_yolk = 200;
    StateAccess::reproduction(p.body).egg_laying = true;
    StateAccess::reproduction(p.body).spawn_signal = 0;
    fill(w, 0);
    bool blocked = variant == 0 || variant == 3;
    check(w.fish.size() == std::size_t(blocked ? 5 : 6),
          "only nearby eggs of own or maternal species block laying");
    check(blocked ? (StateAccess::reproduction(w.fish[0].body).egg_laying &&
                     StateAccess::reproduction(w.fish[0].body).egg_yolk == 200)
                  : StateAccess::reproduction(w.fish[0].body).egg_yolk == 0,
          "blocked yolk stays in mother");
  }
  auto seam = small_world(813);
  auto &p = adult(seam, g, 2, 200);
  StateAccess::reproduction(p.body).egg_yolk = 200;
  StateAccess::reproduction(p.body).egg_laying = true;
  StateAccess::reproduction(p.body).spawn_signal = 0;
  for (int i = 0; i < 4; ++i)
    check(seam.spawn(g, StateAccess::geometry(seam.field).width - 20, 180 + i * 10, 1, 0, 0, 100),
          "seam crowding fixture");
  fill(seam);
  check(seam.fish.size() == 5, "gelegeplatz counts across seam");
  auto nutrients = small_world(814);
  auto &tiny = adult(nutrients, g);
  StateAccess::reproduction(tiny.body).egg_yolk = 1;
  StateAccess::reproduction(tiny.body).spawn_signal = 0;
  nutrients.population_limit = 1;
  fill(nutrients);
  check(nutrients.fish.size() == 2 && nutrients.fish.back().nutrient_egg &&
            nutrients.population_size() == 1,
        "nutrient egg lays without consuming a population slot at the limit");
}

void nutrient_population_slots(const Genome &g) {
  auto full = small_world(335);
  full.population_limit = 1;
  auto &p = adult(full, g);
  StateAccess::reproduction(p.body).egg_yolk = 1;
  StateAccess::reproduction(p.body).egg_laying = true;
  auto meal = fill_natural_egg(full, p, full.population_size());
  check(meal && meal->nutrient_egg, "a full population still permits laying a nutrient egg");
  full.fish.push_back(std::move(*meal));
  check(full.population_size() == 1 && full.fish.size() == 2,
        "laid nutrient eggs occupy no offspring slot");
  auto resumed = full.fork();
  check(resumed.population_size() == 1 && saved(resumed) == saved(full),
        "nutrient egg counting survives a checkpoint");
  auto blocked = small_world(336);
  blocked.population_limit = 1;
  auto &parent = adult(blocked, g);
  StateAccess::reproduction(parent.body).egg_yolk =
      funding(g, StateAccess::physiology(blocked).neural_cost, HATCH_TISSUE);
  StateAccess::reproduction(parent.body).egg_laying = true;
  const double yolk = StateAccess::reproduction(parent.body).egg_yolk;
  check(!fill_natural_egg(blocked, parent, blocked.population_size()) &&
            StateAccess::reproduction(parent.body).egg_yolk == yolk,
        "the population cap still retains a developable egg");
  auto last = small_world(337);
  last.population_limit = 4;
  last.novelty_strength = 0;
  last.ticks = 0;
  for (int i = 0; i < 3; ++i)
    adult(last, g, 140 + 60 * i, 200);
  // Rotating order at tick one lays the nutrient egg first, then the offspring.
  StateAccess::reproduction(last.fish[1].body).egg_yolk = 1;
  StateAccess::reproduction(last.fish[1].body).egg_laying = true;
  StateAccess::reproduction(last.fish[2].body).egg_yolk =
      funding(g, StateAccess::physiology(last).neural_cost, HATCH_TISSUE);
  StateAccess::reproduction(last.fish[2].body).egg_laying = true;
  last.tick();
  check(StateAccess::metrics(last).nutrient_eggs == 1 &&
            StateAccess::metrics(last).released_eggs == 1 && last.population_size() == 4 &&
            last.fish.size() == 5,
        "a nutrient egg laid earlier in the same pass leaves the final offspring slot available");
}

void hatch_gametes(const Genome &g) {
  Body newborn;
  newborn.prepare(g);
  newborn.tissue = 20;
  newborn.embryo.target_tissue = 20;
  while (!StateAccess::development(newborn)->ready())
    StateAccess::development(newborn)->advance();
  newborn.energy = 80;
  mature_body(newborn);
  check(newborn.hatched && StateAccess::reproduction(newborn).egg_yolk == 0 &&
            StateAccess::reproduction(newborn).sperm_store == 0,
        "fish hatches without a developing egg or sperm reserve");
  auto w = small_world(311);
  auto &p = adult(w, g);
  auto &b = p.body;
  b.hatch_age = 0;
  b.age = 1;
  StateAccess::reproduction(b).egg_yolk = StateAccess::reproduction(b).sperm_store = 0;
  StateAccess::reproduction(b).egg_transfer = StateAccess::reproduction(b).sperm_transfer = 1;
  StateAccess::reproduction(b).spawn_signal = 1;
  const double energy = stored_energy(b);
  fill_natural_egg(w, p, w.fish.size());
  check(StateAccess::reproduction(b).egg_yolk > 0 && StateAccess::reproduction(b).sperm_store > 0 &&
            near(stored_energy(b), energy),
        "gamete transfer works immediately after hatching and conserves energy");
}

void nutrient_recruitment_checkpoint(const Genome &g) {
  for (int support : {0, 1, 2})
    for (bool sexual : {false, true}) {
      auto w = small_world(362 + sexual);
      w.ticks = 100;
      w.evo.recruitment_target = .1;
      w.evo.selfing_delay = 0;
      w.evo.fertilisation_wait = sexual ? 1000 : 1;
      auto &mother = adult(w, g, 200, 200, 4);
      mother.depth = 3;
      StateAccess::reproduction(mother.body).egg_yolk =
          1.3 * funding(g, StateAccess::physiology(w).neural_cost, HATCH_TISSUE);
      StateAccess::reproduction(mother.body).egg_laying = true;
      auto laid = fill_natural_egg(w, mother, w.population_size());
      check(laid && !laid->nutrient_egg && laid->parent == mother.id,
            "funded laid egg starts with maternal ancestry");
      const auto parent = laid->parent, id = laid->id;
      laid->body.x = 400;
      laid->body.y = 250;
      w.fish.push_back(std::move(*laid));
      if (sexual)
        w.sperm.push_back({g, 400, 250, parent, 40, 0, w.fish[0].species, true, 0, 4});
      const bool protected_egg = support != 0;
      if (support == 1)
        w.immortal_fish(id, true);
      if (support == 2)
        w.remember_fish(id, true);
      w.tick(sexual);
      const auto &meal = individual(w, id);
      check(meal.nutrient_egg != protected_egg && meal.parent == parent && meal.depth == 4 &&
                meal.developing() == protected_egg,
            "recruitment converts a laid egg without deleting its ancestry");
      const auto bytes = saved(w);
      auto copy = w.fork();
      check(saved(copy) == bytes && individual(copy, id).parent == parent,
            "converted nutrient egg retains its ancestry across a checkpoint");
      for (int step = 0; step < 3; ++step) {
        w.tick(false);
        copy.tick(false);
        check(saved(copy) == saved(w), "converted nutrient egg resumes identically");
      }
    }
  std::cout
      << "Nachträgliche Nähreier: sexuelle und klonale Rekrutierung, Eltern und Fortsetzung: OK\n";
}

void ovary() {
  auto g = Genome::load("genomes/cppn-start.genome");
  auto binding = std::make_shared<BrainInterface>(*g.interface);
  binding->motor_counts[4] = 8;
  g.interface = binding;
  auto w = small_world(141);
  w.evo.egg_organ_capacity = 10;
  auto &mother = adult(w, g);
  auto &b = mother.body;
  auto &r = StateAccess::reproduction(b);
  check(ovary_capacity(b, g, 160, 10) == 80, "eight egg cells hold eighty yolk units");
  b.tissue = 20;
  check(ovary_capacity(b, g, 160, 10) == 40 && ovary_capacity(b, g, 160, 100) == 80,
        "growth scales both inherited capacity and the fixed upper ceiling");
  b.tissue = 40;
  r.egg_yolk = 75.9;
  r.egg_release = true;
  check(!fill_natural_egg(w, mother, 1) && !r.egg_laying,
        "release impulses cannot empty an ovary below ninety-five percent");
  r.egg_yolk = 76;
  auto egg = fill_natural_egg(w, mother, 1);
  check(egg && near(egg->body.energy, 76) && r.egg_yolk == 0,
        "a full inherited ovary releases its stored material unchanged");
  r.egg_yolk = 10;
  r.egg_release = false;
  r.egg_laying = true;
  check(bool(fill_natural_egg(w, mother, 1)), "a previously begun laying sequence continues");
  w.evo.egg_organ_capacity = 0;
  r.egg_yolk = 10;
  r.egg_release = true;
  check(bool(fill_natural_egg(w, mother, 1)) && r.egg_limit == 0,
        "zero capacity does not discard previously stored yolk");
}
}
int main() {
  try {
    Genome::begin_run(42);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN query(base.cppn);
    auto g = quiet(base, query);
    death_provenance(g);
    breeding_space(g);
    nutrient_population_slots(g);
    hatch_gametes(g);
    nutrient_recruitment_checkpoint(g);
    ovary();
    std::cout << "lifecycle: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
