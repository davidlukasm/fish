#include "maturation_cache.hh"
#include "ecology.hh"
#include "physiology.hh"
#include "perception.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "ecology_internal.hh"
#include <istream>
#include <ostream>
#include <iomanip>
#include <stdexcept>
#include <set>
#include <map>
#include <sstream>
#include <numeric>
#include <limits>
#include <chrono>
#include <tuple>
namespace fishsim {
Ecosystem Ecosystem::fork() const {
  std::stringstream state;
  write(state);
  Ecosystem independent(0);
  independent.read(state, this);
  if (support_.founder.cppn) {
    std::stringstream founder_state;
    support_.founder.write(founder_state);
    independent.support_.founder = Genome::read(founder_state, false);
  }
  return independent;
}
int Individual::niche() const {
  return behavior_niche(observations_.window_travel / std::max(1, observations_.window_steps),
                        observations_.window_turn / std::max(1, observations_.window_steps),
                        double(observations_.window_pauses) /
                            std::max(1, observations_.window_steps));
}
double funding(const Genome &g, double scale, double yolk) {
  return development_energy(g, scale, yolk);
}
std::optional<double> funded_egg_energy(const Genome &g, double scale, double yolk) {
  if (!viable_entrant(g))
    return std::nullopt;
  const double energy = funding(g, scale, yolk);
  if (!std::isfinite(energy) || energy > ENERGY_MAX)
    return std::nullopt;
  Body egg;
  egg.hatched = false;
  egg.energy = energy;
  const auto reserve = predicted_hatch_reserve(egg, g, scale);
  if (!reserve || *reserve <= 1e-9)
    return std::nullopt;
  return energy;
}
// Count each shared blueprint once, plus each body's private connection state.
// Archived genomes and gametes can outlive bodies, so they must stay in the budget.
int developing_eggs(const Ecosystem &w) {
  return int(std::count_if(w.fish.begin(), w.fish.end(), [](const Individual &p) {
    return p.body.alive && p.developing() && !p.body.hatched;
  }));
}
// Count shared CPPN construction jobs; tissue maturation consumes no query budget.
int planning_brains(const Ecosystem &w) {
  std::set<const field::Substrate *> plans;
  std::set<std::tuple<const evolution::Genome *, std::uint64_t, std::uint64_t>> unstarted;
  for (const auto &p : w.fish)
    if (p.body.alive && p.developing() && !p.genome.blueprint) {
      if (p.genome.growing)
        plans.insert(p.genome.growing.get());
      else if (p.genome.cppn)
        unstarted.emplace(p.genome.cppn.get(), p.genome.development_seed, p.genome.variation_seed);
    }
  return int(plans.size() + unstarted.size());
}
std::size_t planned_edges(const Genome &g) {
  if (g.blueprint)
    return g.blueprint->edges.size();
  auto n = std::min(g.development_options.neuron_budget, g.development_options.max_nodes);
  return std::min(g.development_options.max_edges, n * n);
}
std::size_t connection_storage(const Ecosystem &w, const Genome *additional) {
  std::set<const field::Substrate *> seen;
  std::set<std::tuple<const evolution::Genome *, std::uint64_t, std::uint64_t>> pending;
  std::size_t total = 0;
  auto keep = [&](const Genome &g) {
    if (g.blueprint && seen.insert(g.blueprint.get()).second)
      total += g.blueprint->edges.size();
    else if (g.cppn && !g.blueprint &&
             pending.emplace(g.cppn.get(), g.development_seed, g.variation_seed).second)
      total += planned_edges(g);
  };
  for (const auto &p : w.fish) {
    if (p.nutrient_egg)
      continue;
    keep(p.genome);
    total += p.body.brain() ? p.body.brain()->slot_count() : planned_edges(p.genome);
  }
  for (const auto &g : w.recent_deaths)
    if (g.second.blueprint)
      keep(g.second);
  for (const auto &g : w.support().reserve) {
    keep(g);
  }
  for (const auto &g : w.support().pool_founders) {
    keep(g);
  }
  for (const auto &s : w.sperm) {
    keep(s.genome);
  }
  for (const auto &a : w.support().archive) {
    keep(a.genome);
  }
  for (const auto &b : w.support().breeders) {
    keep(b.genome);
  }
  if (additional)
    keep(*additional);
  return total;
}
double mating_chance(double distance, double scale) {
  return std::exp2(-std::pow(distance / scale, 2));
}
bool compatible(const Genome &a, const Genome &b, double scale, std::uint64_t egg_id,
                std::uint64_t cloud_id) {
  if (!a.cppn || !b.cppn || a.cppn->history()->lineage() != b.cppn->history()->lineage())
    return false;
  auto mix = [](std::uint64_t x) {
    x += 0x9e3779b97f4a7c15ULL;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
    return x ^ (x >> 31);
  };
  double draw = double(mix(egg_id ^ mix(cloud_id)) >> 11) * 0x1.0p-53;
  return draw < mating_chance(evolution::Genome::compatibility_distance(*a.cppn, *b.cppn), scale);
}
bool Ecosystem::spawn(const Genome &g, double x, double y, int origin, std::uint64_t parent,
                      int depth, double energy, bool replace_food, int *removed_food,
                      bool food_funded, std::uint64_t maternal_species) {
  if (population_size() >= population_limit || !std::isfinite(energy) || energy < 0 ||
      energy > ENERGY_MAX)
    return false;
  std::size_t edges = connection_storage(*this, &g) + planned_edges(g);
  if (edges > neural_budget) {
    ++metrics_.budget_rejections;
    return false;
  }
  x = field.wrap_x(x);
  const double radius = egg_radius(energy);
  if (!field.free(x, y, radius) && (replace_food || !field.position(rng, x, y, radius)))
    return false;
  const double deficit = food_funded ? 0 : total_energy() + energy - energy_limit();
  const double payment = food_funded ? energy : 0;
  if (deficit > 1e-9 || payment > external_food_energy() + 1e-9)
    return false;
  if (parent) {
    auto a =
        std::find_if(fish.begin(), fish.end(), [&](const Individual &q) { return q.id == parent; });
    if (a != fish.end())
      maternal_species = a->species;
    else {
      auto b = std::find_if(support_.breeders.begin(), support_.breeders.end(),
                            [&](const Breeder &q) { return q.id == parent; });
      if (b != support_.breeders.end())
        maternal_species = b->species;
    }
  }
  Individual p;
  p.genome = g;
  p.genome.begin_individual(rng);
  auto previous_species = taxonomy_.species.size();
  p.species = classify(g, maternal_species);
  if (!p.species)
    return false;
  if (taxonomy_.species.size() > previous_species)
    taxonomy_.species.back().origin = origin;
  if ((origin == 0 || origin == 3) &&
      std::none_of(fish.begin(), fish.end(), [&](const Individual &other) {
        return (other.species == p.species ||
                (!other.species && other.maternal_species == p.species)) &&
               other.body.alive && !other.nutrient_egg;
      })) {
    auto *species = taxonomy_.find(p.species);
    species->protection_used = 0;
    species->last_protection = 0;
  }
  if (payment > 0) {
    int remove = fund_from_sources(payment);
    if (removed_food)
      *removed_food += remove;
  }
  p.id = next_id++;
  p.body.identity = p.id;
  p.parent = parent;
  p.depth = depth;
  p.origin = origin;
  p.born = p.last_spawn = p.last_sperm = ticks;
  p.body.x = x;
  p.body.y = y;
  p.body.angle = rng.uniform(-PI, PI);
  p.body.energy = energy;
  p.body.prepare(p.genome);
  size_egg(p.body);
  if (p.body.hatched)
    mature_body(p.body);
  fish.push_back(std::move(p));
  refresh_food_allowance();
  return true;
}
int Ecosystem::population_size() const {
  return int(std::count_if(fish.begin(), fish.end(),
                           [](const Individual &p) { return p.body.alive && !p.nutrient_egg; }));
}
int Ecosystem::viable_population() const {
  return int(std::count_if(fish.begin(), fish.end(), [](const Individual &p) {
    return p.body.alive && p.developing() && (p.body.hatched || p.body.energy >= HATCH_TISSUE) &&
           (!p.body.development_ || p.body.development_->viable());
  }));
}
void Ecosystem::starter_world() {
  const double w = field.geometry().width, h = field.geometry().height;
  // Staggered platforms leave lit planting sites and open passages at every depth.
  wall(.42 * w, .72 * h, .42 * w, .90 * h, 24);
  wall(.76 * w, .84 * h, .91 * w, .69 * h, 24);
  int platform = 0;
  for (const auto &p : std::array<std::array<double, 3>, 6>{{{.055, .235, .24},
                                                             {.44, .53, .15},
                                                             {.675, .945, .39},
                                                             {.235, .395, .53},
                                                             {.49, .685, .73},
                                                             {.08, .155, .83}}})
    if (platform++ % 2 == 0) {
      const double left = p[0] * w, right = p[1] * w, floor = p[2] * h - 12,
                   rim = 10 + 2 * platform;
      polygon({{left, floor - rim},
               {left + 10, floor - rim},
               {left + 10, floor},
               {right - 10, floor},
               {right - 10, floor - rim},
               {right, floor - rim},
               {right, floor + 24},
               {left, floor + 24}});
    } else
      wall(p[0] * w, p[2] * h, p[1] * w, p[2] * h, 24);
  for (int n = 0; n < 6; ++n) {
    const double cx = (n < 2 ? (.12 + .70 * n + rng.uniform(-.035, .035)) * w
                             : (n - 1.55 + rng.uniform(0, .1)) * w / 4),
                 rx = rng.uniform(42, 95), ry = rng.uniform(30, 78),
                 rotation = rng.uniform(-.45, .45);
    const int corners = 6 + rng.index(5);
    std::vector<Point> shape;
    for (int k = 0; k < corners; ++k) {
      const double a = 2 * PI * k / corners, x = rx * std::cos(a), y = ry * std::sin(a);
      shape.push_back({cx + x * std::cos(rotation) - y * std::sin(rotation),
                       (n < 2 ? h - 2 * ry - rx * .45 - 4 : .06 * h) +
                           std::min(.48 * ry, x * std::sin(rotation) + y * std::cos(rotation))});
    }
    const double base_y =
        std::max_element(shape.begin(), shape.end(), [](Point a, Point b) { return a.y < b.y; })->y;
    double base_left = cx + rx, base_right = cx - rx;
    for (auto p : shape)
      if (std::abs(p.y - base_y) < .01) {
        base_left = std::min(base_left, p.x);
        base_right = std::max(base_right, p.x);
      }
    double best_x = 0, best_drop = 0;
    int best_support = -1;
    // A flat base must be supported across its width, not balanced on a platform lip.
    for (double shift : {0., -.5, .5, -1., 1.}) {
      const double dx = shift * rx;
      auto fits = [&](double d) {
        for (const auto &p : shape)
          if (!field.free(p.x + dx, p.y + d, 1))
            return false;
        return true;
      };
      if (!fits(0))
        continue;
      double drop = 0;
      while (drop + 4 < h && fits(drop + 4))
        drop += 4;
      double lo = drop, hi = drop + 4;
      for (int k = 0; k < 10; ++k) {
        const double mid = (lo + hi) / 2;
        if (fits(mid))
          lo = mid;
        else
          hi = mid;
      }
      int supported = 0;
      for (int k = 0; k < 5; ++k) {
        const double x = base_left + (base_right - base_left) * (k + .5) / 5 + dx;
        supported += field.ray(x, base_y + lo, 0, 1, 0, 4) < 4;
      }
      if (supported > best_support) {
        best_support = supported;
        best_x = dx;
        best_drop = lo;
      }
      if (supported >= 4)
        break;
    }
    for (auto &p : shape) {
      p.x += best_x;
      p.y += best_drop;
    }
    polygon(shape);
  }
  field.seed_plants();
}

void Ecosystem::tick(bool reproduce, bool protected_life, const Water *replay_water) {
  using Clock = std::chrono::steady_clock;
  auto stamp = profile_steps ? Clock::now() : Clock::time_point{};
  std::size_t phase = 0;
  auto mark = [&]() {
    if (profile_steps) {
      auto now = Clock::now();
      step_ms[phase] = std::chrono::duration<double, std::milli>(now - stamp).count();
      stamp = now;
    }
    ++phase;
  };
  // Independent founder trials use one local worker and immutable water frames.
  if (replay_water && (workers != 1 || reproduce))
    throw std::invalid_argument("Water replay requires a solitary, non-reproducing trial");
  while (!combat_effects.empty() && combat_effects.front().tick + 16 < ticks)
    combat_effects.pop_front();
  for (auto &p : fish) {
    p.body.identity = p.id;
    p.body.motor_.impact_wound = 0;
  }
  advance_bursts();
  develop_population();
  mark();
  field.motion_workers = workers;
  field.motion(replay_water);
  mark();
  field.advance_sediment(int(field.time % 5), 5);
  refresh_food_allowance();
  field.advance_nature();
  field.advance_food_web();
  mark();
  field.grow_plants(true);
  field.refresh_water_cells();
  mark();
  drift_corpses();
  drift_sperm();
  index_organisms();
  field.advance_odor();
  mark(); // Growth has already rebuilt the plant index.
  std::vector<std::vector<VisualObject>> optical;
  const bool gpu_optics = !replay_water && prepare_opencl_objects(*this, optical);
  mark();
  std::vector<double> bed_before;
  bed_before.reserve(field.vegetation().surfaces.size());
  for (const auto &p : field.vegetation().surfaces)
    bed_before.push_back(p.sediment);
  std::vector<unsigned char> hatched;
  for (const auto &p : fish)
    hatched.push_back(p.body.hatched);
  std::vector<std::array<double, 2>> old(fish.size());
  prepare_hormone_analysis();
  act_population(optical, gpu_optics, protected_life, hatched, old);
  advance_hormone_analysis();
  mark();
  bool grazed = resolve_population(old, hatched, protected_life);
  mark();
  collect_corpses();
  field.compact_food();
  field.settle_plant_geometry(bed_before, grazed);
  ++ticks;
  mark();
  reproduction(reproduce);

  begin_clonal_development();
  observe_ecology();
  refresh_food_allowance();
  feed_burst();
  if (ticks % 200 == 0) {
    prune_species();
  }
  record_performance();
  mark();
}
int Ecosystem::import(const std::vector<Genome> &genomes, double x, double y, int count,
                      bool replace_food, int *removed_food, bool mutate) {
  if (genomes.empty())
    return 0;
  int added = 0;
  std::vector<Genome> incoming;
  for (const auto &original : genomes) {
    Genome g = original;
    if (g.cppn) {
      auto root = std::find_if(
          taxonomy_.species.begin(), taxonomy_.species.end(), [&](const GeneticSpecies &s) {
            return s.representative.cppn->history()->lineage() == g.cppn->history()->lineage();
          });
      if (root != taxonomy_.species.end()) {
        try {
          g.cppn = evolution::Genome::copy_genome(g.cppn);
          g.cppn->share_history(root->representative.cppn->history());
        } catch (const std::exception &) {
          g = Genome::immigrants({original}, rng).front();
        }
      }
    }
    incoming.push_back(std::move(g));
  }
  Genome::unite(incoming);
  for (int i = 0; i < count; ++i) {
    Genome g = incoming[i % incoming.size()];
    if (mutate)
      g.mutate(rng, evo.mutation, true, evo.rates);
    else if (!g.blueprint)
      g.compile();
    auto energy = funded_egg_energy(g, physiology_.neural_cost, evo.yolk);
    if (!energy)
      continue;
    const double radius = i ? 6 * std::sqrt(double(i)) : 0, angle = i * 2.399963229728653;
    if (spawn(g, x + std::cos(angle) * radius,
              std::clamp(y + std::sin(angle) * radius, 3., field.geometry().height - 3), 3, 0, 0,
              *energy, replace_food, removed_food)) {
      ++added;
      ++metrics_.imports;
      if ((!g.blueprint || g.viable()) && support_.reserve.size() < 32)
        support_.reserve.push_back(g);
    }
  }
  return added;
}
}
