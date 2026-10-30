#include "test_support.hh"
#include <iomanip>
#include "sight.hh"
#include "founders.hh"
#include <filesystem>
using namespace test;
namespace {
void regular_animal_budgets() {
  Ecosystem w(18715);
  w.starter_world();
  w.refresh_food_allowance();
  auto &f = w.field;
  f.time = 2; // Regular production, excluding separately booked initial settlement.
  const double before = f.food_web().introduced, total = w.total_energy();
  const auto worms = f.small_animal_stores()[1];
  f.advance_food_web();
  const double added = f.food_web().introduced - before;
  check(added > 0 && added <= f.plankton_supply() + f.benthic_supply() + 1e-8,
        "regular plankton and bottom animal production respects separate daily budgets");
  check(f.small_animal_stores()[1] > worms,
        "bottom supply can establish worms in suitable sediment");
  check(w.total_energy() <= total + added + 1e-6, "animal production has no unbooked energy");
  f.set_energy_headroom(0);
  const double capped = f.food_web().introduced;
  f.advance_food_web();
  check(near(f.food_web().introduced, capped), "no external animal energy beyond tank headroom");
}
void gut_and_formulas() {
  Body b{};
  b.alive = b.hatched = true;
  b.tissue = 40;
  b.energy = 100;
  const double tissues[] = {0, 20, 40, 160, 360};
  const double reserves[] = {0, 150 / std::sqrt(2.), 150, 300, 450};
  for (int i = 0; i < 5; ++i) {
    Body mother{};
    mother.tissue = tissues[i];
    check(near(maternal_reserve(mother, 150), reserves[i]),
          "reproductive reserve scales with square root of tissue");
    mother.energy = 999;
    mother.gut_fill = 500;
    check(near(maternal_reserve(mother, 150), reserves[i]) && maternal_reserve(mother, 0) == 0 &&
              maternal_reserve(mother, -10) == 0,
          "reserve threshold is independent of current stores and supports zero reserve");
  }
  b.organ_mass = b.organ_mass_ref = 1.56;
  b.gut_length = .5;
  b.jaw_length = .5;
  b.suction_strength = b.bite_strength = 110;
  b.bite_signal = b.eat_signal = 1;
  PhysiologyParameters p;
  check(near(tissue_capacity(b), 90), "end size uses organ mass");
  b.organ_mass = .78;
  check(near(tissue_capacity(b), 45), "half organ mass halves end tissue");
  check(near(maximum_mouth_aperture(b), body_radius(b) * .5) && mouth_aperture(b) == 0,
        "median jaw capacity and resting closure");
  check(near(sediment_resistance(1, 0, 0), 19) && near(sediment_resistance(1, 0, .5), 10) &&
            near(sediment_resistance(1, 0, 1), 1),
        "undulation replaces suction in sediment resistance");
  {
    Body example{};
    example.alive = example.hatched = true;
    example.tissue = 90;
    const double volumes[] = {600, 900, 1200}, times[] = {400. * 2 / 3, 400, 400. * 4 / 3};
    for (int k = 0; k < 3; ++k) {
      example.gut_length = .5 * k;
      example.gut_fill = 0;
      const double empty = body_mass(example);
      example.gut_fill = gut_capacity(example);
      check(near(example.gut_fill, volumes[k]) && near(gut_transit(example, p), times[k]),
            "length-dependent gut volume and residence time match the three specified cases");
      check(near(body_mass(example) - empty, 2 + k), "full gut adds the specified ballast mass");
      check(near(reserve_capacity(example), 900), "gut length does not change the reserve");
    }
  }
  for (int k = 0; k < 3; ++k) {
    Body diet{};
    diet.gut_length = k * .5;
    const double animal[] = {1, .65, .1}, plant[] = {.1, .65, 1};
    check(near(digestibility(diet, 1), animal[k]) && near(digestibility(diet, 4), plant[k]) &&
              near(digestibility(diet, 0), .8) && near(digestibility(diet, 10), .8),
          "specialization, prepared mixture and sediment digestibility");
    check(near(fill_factor(8, p), 1) && near(fill_factor(9, p), 1) && near(fill_factor(10, p), 3),
          "edible shellfish meat has no fictitious shell ballast");
  }
  const double before = stored_energy(b), mass = body_mass(b);
  check(near(take_nutrition(b, 100, 4, p), 100), "plant meal accepted");
  check(near(take_nutrition(b, 50, 1, p), 50), "mixed meat meal accepted");
  check(near(b.gut_energy, 150) && near(b.gut_digestible, 97.5) && near(b.gut_fill, 250),
        "three mixed gut sums");
  check(near(b.energy, 100) && near(b.nutrition, 97.5) && near(b.nutrient_flow, 19.5),
        "immediate usable intake, delayed reserve");
  check(near(stored_energy(b), before + 150) &&
            near(body_mass(b), mass + 250 / RESERVE_ENERGY_PER_MASS),
        "energy uses E and mass uses F");
  const double feces = digest_nutrition(b, p);
  check(near(feces, 52.5 / 400) && near(b.digestion, 97.5 / 400) &&
            near(b.gut_fill, 250. * 399 / 400),
        "proportional mixed transit");
  check(near(stored_energy(b) + feces + .12 * b.digestion, before + 150),
        "digestion conserves raw energy");
  b.energy = reserve_capacity(b) - .01;
  const double e = b.gut_energy, d = b.gut_digestible, f = b.gut_fill;
  const double waste = digest_nutrition(b, p), ratio = .01 / (.88 * d);
  check(near(b.energy, reserve_capacity(b)) && near(b.gut_fill, f * (1 - ratio)) &&
            near(b.gut_energy, e * (1 - ratio)) && near(waste, (e - d) * ratio),
        "reserve headroom limits the common fraction");
  check(near(digest_nutrition(b, p), 0) && near(b.gut_fill, f * (1 - ratio)),
        "full reserve pauses all transit");
  const double room = gut_room(b, 10, p);
  check(near(take_nutrition(b, 1000, 10, p), room) && near(b.gut_fill, gut_capacity(b)),
        "ballast limits acceptance before withdrawal");
  check(near(take_nutrition(b, 1, 1, p), 0), "full gut accepts nothing");
  VisibleBody fish{};
  fish.kind = 1;
  fish.x = 20;
  fish.y = 20;
  fish.radius = 4;
  fish.relative_speed = 0;
  Field field(2, 0);
  check(field.threatens(fish, 22, 20, 8, 2, -1) && !field.threatens(fish, 22, 20, 8, 2, .3),
        "stationary fish frightens crabs only");
  fish.relative_speed = .4;
  check(field.threatens(fish, 22, 20, 8, 2, .3), "moving fish frightens other prey");
}
void foliage() {
  auto w = small_world(20);
  auto &f = w.field;
  auto &v = StateAccess::vegetation(f);
  v.plants.clear();
  v.plant_grid.reset(f.geometry().width, f.geometry().height);
  v.indexed_plant_radius = 4;
  SightMedium medium;
  medium.prepare(f, 100, 100);
  check(near(medium.transmission(200, 100)[1], 1), "clear water transmits the unobstructed scene");
  double single = 1;
  for (int k = 0; k < 8; ++k) {
    v.plants.push_back({120. + k * 8, 100, 4, 1, std::size_t(k), 5});
    v.plant_grid.add(120. + k * 8, 100, k);
    medium.prepare(f, 100, 100);
    const auto seen = medium.transmission(200, 100);
    const auto probe = f.grass_transmission(100, 100, 200, 100);
    double sight = 0;
    for (int c = 0; c < 3; ++c) {
      check(near(seen[1 + c], probe[c]),
            "retina and individual light queries share foliage attenuation");
      sight += seen[1 + c] / 3;
    }
    check(seen[2] > seen[1] && seen[2] > seen[3], "foliage passes green more than red and blue");
    if (k == 0)
      single = sight;
    if (k == 7)
      check(single > .5 && seen[1] < .1,
            "one small plant remains porous; a thicket conceals a red target");
  }
}
void budgets_and_save() {
  Ecosystem standard(11);
  standard.starter_world();
  standard.field.sync_food_web();
  check(standard.field.energy_supply() > 85 && standard.field.energy_supply() <= 95.01,
        "standard tank calibration");
  auto w = small_world(17);
  w.set_parameter("energy_supply", .0001);
  w.field.sync_food_web();
  auto &f = w.field;
  const double total = f.energy_supply(), maximum = total * .5;
  check(near(f.artificial_supply(), maximum), "maximum artificial flux scales with water area");
  StateAccess::feeding(f).nature_average = maximum / f.env().nature_weight;
  check(near(f.artificial_supply(), maximum / 2), "weighted nature intake halves artificial flux");
  check(near(f.artificial_supply() + f.small_animal_supply() + f.producer_supply(), total),
        "all external budgets sum to T");
  check(near(f.plankton_supply(), .12 * total) && near(f.benthic_supply(), .18 * total),
        "plankton and bottom animals have independent supply budgets");
  check(!w.set_parameter("benthic_supply_share", .9), "supply fractions cannot exceed total");
  const double area = f.food_web().plankton.water_area;
  w.wall(100, 100, 450, 100, 30);
  f.sync_food_web();
  check(f.food_web().plankton.water_area < area, "obstacles remove productive water area");
  auto genes = Genome::load("genomes/cppn-start.genome");
  auto g = genes;
  auto &adult_fish = adult(w, g, 200, 250);
  auto &b = adult_fish.body;
  take_nutrition(b, 80, 4, w.physiology());
  take_nutrition(b, 20, 8, w.physiology());
  const auto E = b.gut_energy, D = b.gut_digestible, F = b.gut_fill;
  StateAccess::observations(adult_fish).raw_diet[10] = 12;
  StateAccess::observations(adult_fish).diet[10] = 12;
  Ecosystem restored(0);
  std::istringstream in(saved(w));
  restored.read(in);
  const auto &r = restored.fish.front().body;
  check(near(r.gut_energy, E) && near(r.gut_digestible, D) && near(r.gut_fill, F),
        "save roundtrip preserves all gut sums");
  check(near(restored.fish.front().observations().diet[10], 12) &&
            near(restored.fish.front().observations().raw_diet[10], 12),
        "detritus survives save roundtrip");
  const double energy = stored_energy(b);
  b.alive = false;
  w.collect_corpses();
  check(w.corpses.size() == 1 && near(w.corpses[0].energy, energy) && near(b.gut_energy, 0),
        "death transfers gut exactly once");
  w.collect_corpses();
  check(w.corpses.size() == 1, "repeated collection does not duplicate gut");
  check(w.set_parameter("benthic_supply_share", .1) &&
            w.set_parameter("plankton_supply_share", .1) &&
            w.set_parameter("food_supply_share", .8),
        "custom supply allocation is accepted");
  auto changed = w.fork();
  check(saved(w) == saved(changed),
        "custom supply shares restore independently of parameter order");
  w.set_parameter("energy_supply", 0);
  check(near(f.artificial_supply(), 0) && near(f.producer_supply(), 0),
        "zero supply avoids division and imports");
}
}
int main() {
  std::cout << std::unitbuf;
  regular_animal_budgets();
  gut_and_formulas();
  foliage();
  budgets_and_save();
  std::cout << "Nischen: Formeln, gemischter Darm, Energie, Gefahr und Speicher-Rundlauf: OK\n";
}
