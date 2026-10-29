#include "founder_pool.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include <set>
namespace fishsim {
FounderHatching founder_hatching(const Genome &candidate, std::atomic<bool> &stop,
                                 const std::vector<std::pair<std::string, double>> &parameters,
                                 std::uint64_t seed) {
  FounderHatching result;
  if (stop || !hatch_candidate(candidate))
    return result;
  Ecosystem world(seed);
  world.resize(1000, 700);
  for (const auto &[name, value] : parameters)
    world.set_parameter(name, value);
  world.safety = false;
  world.evo.recruitment_target = 0;
  world.food_burst.strength = world.mutation_burst.strength = 0;
  world.field.flow = world.field.gravity = 0;
  if (!founder_actuation_possible(*candidate.interface, world.physiology()))
    return result;
  const auto initial = funded_egg_energy(candidate, world.physiology().neural_cost, world.evo.yolk);
  if (!initial)
    return result;
  for (int i = 0; i < 3; ++i) {
    if (world.spawn(candidate, 150 + 300 * i, 300, 0, 0, 0, *initial))
      ++result.attempted;
  }
  std::set<std::uint64_t> hatched, built, secreted, contracted, ids, dead;
  for (const auto &fish : world.fish)
    ids.insert(fish.id);
  for (int step = 0; step < 1000 && !stop; ++step) {
    world.tick(false);
    result.steps = step + 1;
    std::set<std::uint64_t> alive;
    for (const auto &fish : world.fish) {
      const auto &body = fish.body;
      if (!body.alive)
        continue;
      alive.insert(fish.id);
      if (body.development() && body.development()->ready())
        built.insert(fish.id);
      if (body.embryo.shell < 1)
        secreted.insert(fish.id);
      const auto &m = body.motor();
      if (m.motor_factor * (m.impulse_forward + m.impulse_left + m.impulse_right) > 0)
        contracted.insert(fish.id);
      if (body.hatched) {
        if (hatched.empty()) {
          result.min_energy = body.energy;
          result.min_health = body.health;
        } else {
          result.min_energy = std::min(result.min_energy, body.energy);
          result.min_health = std::min(result.min_health, body.health);
        }
        hatched.insert(fish.id);
      }
    }
    for (auto id : ids)
      if (!alive.count(id) && !hatched.count(id))
        dead.insert(id);
    // Completed subjects leave the assay; do not turn successful hatchlings into carrion.
    world.fish.erase(std::remove_if(world.fish.begin(), world.fish.end(),
                                    [&](const auto &fish) { return hatched.count(fish.id); }),
                     world.fish.end());
    if (world.fish.empty())
      break;
  }
  if (stop)
    return {};
  result.hatched = int(hatched.size());
  result.built = int(built.size());
  result.secreted = int(secreted.size());
  result.contracted = int(contracted.size());
  result.dead = int(dead.size());
  return result;
}
FounderReproduction
founder_reproduction(const Genome &candidate, std::atomic<bool> &stop,
                     const std::vector<std::pair<std::string, double>> &parameters,
                     std::uint64_t seed) {
  FounderReproduction result;
  result.seed = seed;
  if (stop || !viable_entrant(candidate))
    return result;
  // The trial owns its genetic history; reproduction must not alter the search's
  // innovation counters or another concurrently evaluated candidate.
  Genome genome = candidate;
  genome.cppn = std::make_shared<evolution::Genome>(*candidate.cppn);
  genome.cppn->share_history(std::make_shared<evolution::History>(*candidate.cppn->history()));
  Ecosystem world(seed);
  world.resize(615, 410);
  for (const auto &[name, value] : parameters)
    world.set_parameter(name, value);
  world.safety = false;
  world.evo.mutation = 0;
  world.evo.rates.lateral_connection = 0;
  world.evo.recruitment_target = 0;
  world.food_burst.strength = world.mutation_burst.strength = 0;
  world.population_limit = 64;
  prepare_founder_habitat(world);
  // Match the default tank's initial six food pieces per founder. Ongoing supply
  // remains the configured aquarium supply; there are no replenishment grids.
  world.field.configure_seed_food(36);
  world.field.place_initial_food();
  const auto initial = funded_egg_energy(genome, world.physiology().neural_cost, world.evo.yolk);
  if (!initial)
    return result;
  std::set<std::uint64_t> parents, funded, hatched, feeding, parents_feeding;
  for (int n = 0; n < 6; ++n) {
    if (!world.spawn(genome, 105 + 200 * (n % 3), 125 + 160 * (n / 3), 0, 0, 0, *initial))
      return result;
    parents.insert(world.fish.back().id);
  }
  for (int step = 0; step < 4000 && !stop; ++step) {
    world.tick();
    result.steps = step + 1;
    bool living = false;
    for (const auto &p : world.fish) {
      if (!p.body.alive)
        continue;
      living |= p.developing() || !p.nutrient_egg;
      if (parents.count(p.id)) {
        if (p.body.hatched && p.body.nutrition > 0 && p.body.digested > 0)
          parents_feeding.insert(p.id);
      } else if (p.origin == 1) {
        if (!p.nutrient_egg)
          funded.insert(p.id);
        if (p.body.hatched) {
          hatched.insert(p.id);
          if (p.feeding_generations >= 2 && p.body.nutrition > 0 && p.body.digested > 0)
            feeding.insert(p.id);
        }
      }
    }
    if (!living || (feeding.size() >= 2 && parents_feeding.size() >= 2))
      break;
  }
  if (!stop) {
    result.exposure = world.metrics().performance_total.exposure;
    for (const auto &species : world.taxonomy().species) {
      for (std::size_t k = 0; k < DIET_COUNT; ++k) {
        result.diet[k] += species.lifetime_diet[k];
        result.raw_diet[k] += species.lifetime_raw_diet[k];
      }
      result.digested += species.lifetime_digested;
    }
    result.funded = int(funded.size());
    result.hatched = int(hatched.size());
    result.feeding = int(feeding.size());
    result.parents_feeding = int(parents_feeding.size());
  }
  return result;
}
}
