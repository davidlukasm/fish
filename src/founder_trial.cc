#include "founder_pool.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include "body_plan.hh"
#include "perception.hh"
namespace fishsim {
bool place_trial_food(Ecosystem &world, double x, double y, double energy, int origin) {
  if (world.total_energy() + energy > world.energy_limit())
    return false;
  Food f{x, y, 0, 0, 0, energy};
  f.initial_energy = energy;
  f.origin = origin;
  f.hardness = origin == 4   ? world.field.env().hardness_algae
               : origin == 5 ? world.field.env().hardness_leaf
                             : 0;
  f.color = origin == 4 || origin == 5 ? std::array<double, 3>{.25, .6, .2}
            : origin == 3              ? std::array<double, 3>{.5, .25, .2}
                                       : std::array<double, 3>{1, .2, .1};
  f.radius = food_radius(energy);
  if (!world.field.free(x, y, f.radius))
    return false;
  world.field.append_fragment(f);
  return true;
}
void prepare_founder_habitat(Ecosystem &world) {
  // Real surface food, rooted plants and sediment complement suspended morsels.
  world.wall(120, 240, 260, 240, 12);
  world.wall(370, 330, 520, 330, 12);
  world.field.seed_plants();
  world.field.refresh_niche_limits();
}
namespace {
std::unique_ptr<Ecosystem>
foraging_baseline(const Genome &genome, std::atomic<bool> &stop,
                  const std::vector<std::pair<std::string, double>> &parameters) {
  if (stop)
    return {};
  auto baseline = std::make_unique<Ecosystem>(187);
  auto &arena = *baseline;
  arena.resize(615, 410);
  for (const auto &[name, value] : parameters)
    arena.set_parameter(name, value);
  arena.safety = false;
  arena.field.flow = arena.field.gravity = 0;
  arena.field.set_energy_supply(0);
  arena.food_burst.strength = arena.mutation_burst.strength = 0;
  arena.evo.mutation = 0;
  const auto energy = funded_egg_energy(genome, arena.physiology().neural_cost, arena.evo.yolk);
  if (!energy || !arena.spawn(genome, 300, 205, 0, 0, 0, *energy))
    return {};
  for (int t = 0; t < 4000 && !stop && !arena.fish.empty() && !arena.fish[0].body.hatched; ++t)
    arena.tick();
  if (stop || arena.fish.empty() || !arena.fish[0].body.hatched)
    return {};
  return baseline;
}
FounderForaging foraging_from_baseline(const Ecosystem &baseline, int disabled_sense,
                                       std::atomic<bool> &stop) {
  FounderForaging result;
  for (double distance : {40., 80., 120.})
    for (double side : {-1., 1.}) {
      if (stop)
        return {};
      auto arena = baseline.fork();
      const auto id = arena.fish[0].id;
      auto &body = arena.fish[0].body;
      body.x = 300;
      body.y = 205;
      body.angle = 0;
      if (disabled_sense >= 0)
        body.disable_sense(disabled_sense);
      const double x = 300 + distance * std::cos(side * PI / 3),
                   y = 205 + distance * std::sin(side * PI / 3);
      if (!place_trial_food(arena, x, y, 120))
        return {};
      double closest = distance, travel = body.motor().travel;
      bool eaten = false;
      for (int t = 0; t < 300 && !stop; ++t) {
        arena.tick();
        auto p = std::find_if(arena.fish.begin(), arena.fish.end(),
                              [&](const auto &p) { return p.id == id; });
        if (p == arena.fish.end() || !p->body.alive)
          break;
        result.speed += p->body.motor().travel - travel;
        travel = p->body.motor().travel;
        result.turn += std::abs(p->body.motor().turn);
        ++result.samples;
        closest = std::min(closest, std::hypot(arena.field.delta_x(p->body.x - x), p->body.y - y));
        if (p->body.eaten > 0) {
          eaten = true;
          break;
        }
      }
      result.eaten += eaten;
      result.score += eaten ? 1 : .5 * (1 - closest / distance);
    }
  if (stop)
    return {};
  result.score /= 6;
  if (result.samples) {
    result.speed /= result.samples;
    result.turn /= result.samples;
  }
  return result;
}
} // namespace
FounderForaging founder_foraging(const Genome &genome, int disabled_sense, std::atomic<bool> &stop,
                                 const std::vector<std::pair<std::string, double>> &parameters) {
  const auto baseline = foraging_baseline(genome, stop, parameters);
  return baseline ? foraging_from_baseline(*baseline, disabled_sense, stop) : FounderForaging{};
}
bool assess_founder_foraging(PoolFounder &entry, std::atomic<bool> &stop,
                             const std::vector<std::pair<std::string, double>> &parameters) {
  const auto baseline = foraging_baseline(entry.genome, stop, parameters);
  if (!baseline)
    return false;
  const auto all = foraging_from_baseline(*baseline, -1, stop);
  std::array<double, 2> scores{-1, -1};
  int senses = 0;
  for (int sense : {0, 1}) {
    if (entry.genome.interface->sense_counts[sense] <= 0)
      continue;
    const auto result = foraging_from_baseline(*baseline, 1 - sense, stop);
    scores[sense] = result.score;
    if (result.score >= .2)
      senses |= 1 << sense;
  }
  if (stop || !all.samples)
    return false;
  entry.foraging = all;
  entry.sense_foraging = scores;
  entry.senses = senses;
  return true;
}
}
