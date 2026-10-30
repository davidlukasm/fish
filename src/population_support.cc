#include "maturation_cache.hh"
#include "body_plan.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include "parallel.hh"
#include "founders.hh"
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <numeric>
namespace fishsim {
namespace {
int breeder_tier(const Breeder &b, std::uint64_t environment) {
  return b.environment != environment ? -1 : b.feeds_adequately() ? (b.offspring > 0 ? 2 : 1) : 0;
}
bool better(const Breeder &a, const Breeder &b, double weight, std::uint64_t environment) {
  auto at = breeder_tier(a, environment), bt = breeder_tier(b, environment);
  return at != bt ? at > bt : a.score(weight) > b.score(weight);
}
void sort_breeders(std::vector<Breeder> &breeders, double weight, std::uint64_t environment) {
  // The diversity archive can retain hundreds of species. Compute each score
  // once per update instead of repeating its logarithms in every comparison.
  std::vector<std::pair<int, double>> ranks;
  ranks.reserve(breeders.size());
  for (const auto &b : breeders)
    ranks.emplace_back(breeder_tier(b, environment), b.score(weight));
  std::vector<std::size_t> order(breeders.size());
  std::iota(order.begin(), order.end(), 0);
  auto precedes = [&](std::size_t a, std::size_t b) {
    return ranks[a].first != ranks[b].first ? ranks[a].first > ranks[b].first
                                            : ranks[a].second > ranks[b].second;
  };
  if (std::is_sorted(order.begin(), order.end(), precedes))
    return;
  std::stable_sort(order.begin(), order.end(), precedes);
  std::vector<Breeder> sorted;
  sorted.reserve(breeders.size());
  for (auto i : order)
    sorted.push_back(std::move(breeders[i]));
  breeders = std::move(sorted);
}
using Population = std::unordered_map<std::uint64_t, int>;
Population protected_population(const Ecosystem &w, const std::set<std::uint64_t> &wanted,
                                int target) {
  Population result;
  if (wanted.empty())
    return result;
  for (const auto &p : w.fish)
    if (p.body.alive && p.body.hatched && wanted.count(p.species))
      ++result[p.species];
  for (const auto &p : w.fish) {
    const auto species = p.species ? p.species : p.maternal_species;
    if (!p.body.alive || p.body.hatched || p.nutrient_egg || p.body.energy < HATCH_TISSUE ||
        !wanted.count(species) || result[species] >= target)
      continue;
    const auto reserve = predicted_hatch_reserve(p.body, p.genome, w.physiology().neural_cost);
    if ((reserve && *reserve >= 0) || (p.origin == 2 && !p.genome.blueprint))
      ++result[species];
  }
  return result;
}
const Breeder *species_breeder(const Ecosystem &w, std::uint64_t species) {
  const Breeder *best = nullptr;
  for (const auto &b : w.support().breeders)
    if (b.species == species && b.feeds_adequately() && b.genome.viable() &&
        (!best || better(b, *best, w.evo.breeder_offspring_weight, w.environment)))
      best = &b;
  return best;
}
bool protectable(const Ecosystem &w, const GeneticSpecies &s) {
  return s.feeding_generations >= 2 && s.protection_used < 3 && species_breeder(w, s.id);
}
// Select current resource sites, never archived or averaged fish coordinates.
std::optional<Point> protection_site(Ecosystem &w, const GeneticSpecies &s) {
  std::array<std::vector<std::pair<Point, double>>, DIET_COUNT> sites;
  const auto &f = w.field;
  auto add = [&](int kind, double x, double y, double energy) {
    if (s.lifetime_diet[kind] <= 0 || energy <= 0)
      return;
    Point site{f.wrap_x(x), y};
    if (f.free(site.x, site.y, 16) && f.sediment_immersion(site.x, site.y, 16) < .1)
      sites[kind].push_back({site, std::sqrt(energy)});
  };
  for (int i = 0; i < f.source_count(); ++i) {
    const auto p = f.food_cloud(i);
    add(0, p.x, p.y, 1);
  }
  for (const auto &feeder : f.feeding().feeders)
    add(0, feeder.x, feeder.y, feeder.rate);
  for (const auto &p : f.vegetation().surfaces) {
    const double x = (p.a.x + p.b.x) * .5 + p.normal.x * 60,
                 y = (p.a.y + p.b.y) * .5 + p.normal.y * 60;
    add(4, x, y, p.algae);
    add(5, x, y, p.grass);
    add(7, x, y, p.worms);
    add(10, x, y, p.detritus);
  }
  for (const auto &p : f.feeding().pieces)
    if (p.origin > 0 && p.origin < int(DIET_COUNT))
      add(p.origin, p.x, std::max(24., p.y - 32), p.energy);
  for (const auto &p : w.fish)
    if (p.body.alive && (!p.body.hatched || p.species != s.id))
      add(p.body.hatched ? 1 : 2, p.body.x, std::max(24., p.body.y - 48), stored_energy(p.body));
  for (const auto &p : w.corpses)
    add(p.hatched ? 3 : 2, p.x, std::max(24., p.y - 48), p.energy);
  for (const auto &p : f.food_web().crabs)
    add(8, p.x, p.y - 60, p.energy);
  for (const auto &p : f.food_web().mussels)
    add(9, p.x, p.y - 60, p.energy);
  if (s.lifetime_diet[6] > 0) {
    const auto &p = f.food_web().plankton;
    for (std::size_t i = 0; i < p.energy.size(); ++i)
      if (p.energy[i] > 0)
        add(6, (i % p.columns + .5) * p.width / p.columns, (i / p.columns + .5) * p.height / p.rows,
            p.energy[i]);
  }
  // Select a consumed source first, then a current site of that same source.
  // Plankton, benthos and artificial food never share an unrelated fallback pool.
  std::array<double, DIET_COUNT> weights = s.lifetime_diet;
  for (std::size_t k = 0; k < DIET_COUNT; ++k)
    if (sites[k].empty())
      weights[k] = 0;
  if (std::accumulate(weights.begin(), weights.end(), 0.) <= 0)
    return std::nullopt;
  const auto kind = std::discrete_distribution<int>(weights.begin(), weights.end())(w.rng.engine);
  const auto &pool = sites[kind];
  std::vector<double> local;
  for (const auto &site : pool)
    local.push_back(site.second);
  return pool[std::discrete_distribution<std::size_t>(local.begin(), local.end())(w.rng.engine)]
      .first;
}
// Check resource limits and safe positions before insertion.
}
int Ecosystem::insert_group(SupportGroup &job, Point anchor) {
  auto g = job.source;
  const int origin = job.origin;
  const auto source_species = job.species;
  auto members = job.members;
  int count = std::min(int(members.size()), population_limit - population_size());
  const int minimum = 1;
  if (count < minimum)
    return 0;
  members.resize(count);
  for (auto &member : members) {
    auto energy = funded_egg_energy(member.candidate, physiology_.neural_cost, evo.yolk);
    if (!energy)
      return -1;
    member.energy = *energy;
  }
  auto paid = [&]() {
    double cost = 0;
    for (const auto &member : members)
      cost += member.energy;
    return cost;
  };
  const double available = assistance_food_budget();
  while (members.size() > std::size_t(minimum) && paid() > available)
    members.pop_back();
  count = members.size();
  if (paid() > available)
    return 0;
  const auto existing = connection_storage(*this);
  std::size_t storage = existing;
  std::set<const field::Substrate *> plans;
  for (const auto &member : members) {
    storage += planned_edges(member.candidate);
    if (plans.insert(member.candidate.blueprint.get()).second)
      storage += connection_storage(*this, &member.candidate) - existing;
  }
  if (storage > neural_budget) {
    ++metrics_.budget_rejections;
    return 0;
  }
  if (taxonomy_.species.size() >= 4096 &&
      std::none_of(
          taxonomy_.species.begin(), taxonomy_.species.end(), [&](const GeneticSpecies &s) {
            return s.representative.cppn->history()->lineage() == g.cppn->history()->lineage() &&
                   evolution::Genome::compatibility_distance(*s.representative.cppn, *g.cppn) <
                       taxonomy_.mating_distance;
          }))
    return 0;
  struct Occupied {
    Point position;
    double radius;
  };
  std::vector<Occupied> occupied;
  occupied.reserve(fish.size() + members.size());
  for (const auto &p : fish)
    if (p.body.alive && !p.nutrient_egg)
      occupied.push_back(
          {{p.body.x, p.body.y},
           std::max(collision_radius(p.body),
                    predicted_hatch_radius(p.body, p.genome, physiology_.neural_cost))});
  std::vector<double> radii;
  double spread = 96;
  for (const auto &member : members) {
    Body embryo;
    embryo.energy = member.energy;
    embryo.prepare(member.candidate);
    const double radius =
        std::max(collision_radius(embryo),
                 predicted_hatch_radius(embryo, member.candidate, physiology_.neural_cost));
    radii.push_back(radius);
    spread = std::max(spread, 4 * radius * std::sqrt(double(count)));
  }
  std::vector<Point> positions;
  for (int i = 0; i < count; ++i) {
    bool placed = false;
    Point p;
    for (int attempt = 0; attempt < 300 && !placed; ++attempt) {
      p = {field.wrap_x(anchor.x + rng.uniform(-spread, spread)),
           anchor.y + rng.uniform(-spread, spread)};
      const double radius = radii[std::size_t(i)];
      placed = field.free(p.x, p.y, radius + 12) &&
               std::none_of(occupied.begin(), occupied.end(), [&](const auto &other) {
                 return std::hypot(field.delta_x(p.x - other.position.x), p.y - other.position.y) <
                        std::max(64., 4 * (radius + other.radius));
               });
    }
    if (!placed)
      break;
    positions.push_back(p);
    occupied.push_back({p, radii[std::size_t(i)]});
  }
  // These supplied genotypes are complete; development starts without another mating or mutation.
  int added = 0;
  for (std::size_t index = 0; index < positions.size(); ++index) {
    const auto &p = positions[index];
    auto &member = members[index];
    double energy = member.energy;
    int displaced = 0;
    auto previous = taxonomy_.species.size();
    if (!spawn(member.candidate, p.x, p.y, origin, member.parent, member.depth, energy, true,
               &displaced, true, source_species))
      break;
    auto &egg = fish.back();
    egg.fertilised = false;
    egg.clonal = true;
    egg.maternal_species = egg.species;
    egg.maternal_depth = member.depth;
    egg.body.hatched = false;
    egg.body.hatch_age = -1;
    egg.body.motor_.speed = 0;

    if (taxonomy_.species.size() > previous && source_species < taxonomy_.species.back().id)
      taxonomy_.species.back().mother_species = source_species;
    auto pieces = displaced;
    ++added;
    if (origin == 2) {
      field.rescue_nature();
      ++metrics_.rescues;
      ++metrics_.window_rescues;
      support_.assistance_food += pieces;
    } else
      ++metrics_.imports;
  }
  return added;
}
void PopulationSupport::remember_breeder(const Individual &p,
                                         const PhysiologyParameters &physiology,
                                         SpeciesRegistry &taxonomy, const EvolutionParameters &evo,
                                         std::uint64_t environment) {
  if (!p.developing() || !p.body.hatched || p.body.nutrition <= 0 || !p.genome.blueprint ||
      !p.genome.viable())
    return;
  if (auto *group = taxonomy.find(p.species))
    group->best_nutrition_rate = std::max(group->best_nutrition_rate,
                                          p.body.nutrition / std::max(80, p.body.nutrition_steps));
  Breeder candidate{p.genome,    p.id,   p.species, environment, p.body.nutrition / FOOD_ENERGY,
                    p.offspring, p.depth};
  // Compare a rate in the current observation window with this body's actual resting cost.
  // Lifetime food is retained as an energy record, not an age-dependent selection score.
  candidate.observed_steps = p.observations().window_steps;
  candidate.food_rate = p.observations().window_steps >= 80
                            ? p.observations().window_nutrition / p.observations().window_steps
                            : 0;
  candidate.resting_cost = (.06 * (.35 + .65 * p.body.tissue / BODY_TISSUE) +
                            (p.genome.interface ? p.genome.interface->muscle_maintenance : 0)) *
                               physiology.basal_metabolism +
                           (p.body.development() ? p.body.development()->running_cost()
                                                 : maturation_template(p.genome).running_cost()) *
                               physiology.neural_cost;
  auto old = std::find_if(breeders.begin(), breeders.end(), [&](const Breeder &b) {
    return b.id == p.id || b.genome.same_genes(p.genome);
  });
  if (old != breeders.end()) {
    if (better(candidate, *old, evo.breeder_offspring_weight, environment))
      *old = std::move(candidate);
    else if (old->id == p.id)
      old->offspring = std::max(old->offspring, p.offspring);
  } else
    breeders.push_back(std::move(candidate));
  sort_breeders(breeders, evo.breeder_offspring_weight, environment);
  if (breeders.size() > std::size_t(evo.breeder_slots)) {
    std::vector<Breeder> kept;
    kept.reserve(breeders.size());
    std::unordered_set<std::uint64_t> groups;
    groups.reserve(breeders.size());
    for (const auto &b : breeders)
      if (b.feeds_adequately() && groups.insert(b.species).second) {
        kept.push_back(b);
      }
    for (const auto &b : breeders)
      if (kept.size() < std::size_t(evo.breeder_slots) &&
          std::none_of(kept.begin(), kept.end(), [&](const Breeder &k) { return k.id == b.id; }))
        kept.push_back(b);
    breeders = std::move(kept);
  }
}
void Ecosystem::remember_breeder(const Individual &p) {
  support_.remember_breeder(p, physiology_, taxonomy_, evo, environment);
}
int Ecosystem::assistance_target() const {
  return std::min(int(std::ceil(evo.assist_min_population)), population_limit);
}

double Ecosystem::assistance_food_budget() const {
  return external_food_energy();
}

SpeciesProtection Ecosystem::species_protection() const {
  SpeciesProtection result;
  const int target = std::min(int(std::ceil(evo.assist_species_minimum)), population_limit);
  if (!target)
    return result;
  std::set<std::uint64_t> wanted;
  for (const auto &s : taxonomy_.species)
    if (protectable(*this, s))
      wanted.insert(s.id);
  auto counts = protected_population(*this, wanted, target);
  for (const auto &s : taxonomy_.species) {
    if (!protectable(*this, s))
      continue;
    ++result.eligible;
    const int missing = std::max(0, target - counts[s.id]);
    result.missing += missing;
    result.threatened += missing > 0;
  }
  return result;
}
int Ecosystem::assistance_shortfall() const {
  const int target = assistance_target();
  int total = adult_population();
  if (total >= target)
    return 0;
  for (const auto &p : fish) {
    if (p.origin != 2 || !p.body.alive || p.body.hatched || p.nutrient_egg ||
        p.body.energy < HATCH_TISSUE)
      continue;
    const auto reserve = predicted_hatch_reserve(p.body, p.genome, physiology_.neural_cost);
    // Assisted eggs were funded before placement. Their individual construction
    // plan can still be pending; do not place another batch while it is computed.
    if (((reserve && *reserve >= 0) || !p.genome.blueprint) && ++total >= target)
      return 0;
  }
  return target - total;
}
double Ecosystem::assistance_need() const {
  return double(assistance_shortfall()) / std::max(1, assistance_target());
}
void Ecosystem::restore_population() {
  int missing = std::min(assistance_shortfall(), population_limit - population_size());
  if (missing <= 0)
    return;
  const auto &feeders = field.feeding().feeders;
  const int spots = field.source_count() + int(feeders.size()), first = rng.index(spots);
  for (int batch = 0; missing > 0 && batch < assistance_target() + spots && !cancelled; ++batch) {
    SupportGroup job;
    std::vector<const Breeder *> breeders;
    int tier = -1;
    for (const auto &b : support_.breeders)
      if (b.genome.viable())
        tier = std::max(tier, breeder_tier(b, environment));
    for (const auto &b : support_.breeders)
      if (b.genome.viable() && breeder_tier(b, environment) == tier)
        breeders.push_back(&b);
    if (!breeders.empty()) {
      const auto &b = *breeders[rng.index(int(breeders.size()))];
      job.source = b.genome;
      job.parent = b.id;
      job.depth = b.depth;
      job.species = b.species;
    } else if (!support_.reserve.empty())
      job.source = support_.reserve[rng.index(int(support_.reserve.size()))];
    else
      job.source = support_.founder;
    if (!job.source.blueprint || !funded_egg_energy(job.source, physiology_.neural_cost, evo.yolk))
      continue;
    const int spot = (first + batch) % spots;
    Point site = spot < int(feeders.size()) ? Point{feeders[spot].x, feeders[spot].y}
                                            : field.food_cloud(spot - int(feeders.size()));
    if (const auto *s = find_species(job.species))
      if (const auto matched = protection_site(*this, *s))
        site = *matched;
    const bool absent =
        job.species && std::none_of(fish.begin(), fish.end(), [&](const Individual &p) {
          return p.body.alive && !p.nutrient_egg &&
                 (p.species == job.species || (!p.species && p.maternal_species == job.species));
        });
    job.members.resize(std::min(missing, 3));
    for (auto &member : job.members) {
      member.candidate = job.source;
      member.parent = job.parent;
      member.depth = job.depth;
    }
    const int added = insert_group(job, site);
    if (added > 0) {
      missing -= added;
      // A new settlement renews protection; topping up a surviving settlement does not.
      if (absent)
        if (auto *s = taxonomy_.find(job.species)) {
          s->protection_used = 0;
          s->last_protection = 0;
        }
    }
  }
}

void Ecosystem::assist_population() {
  if (!safety)
    return;
  restore_population();
  const int target = std::min(int(std::ceil(evo.assist_species_minimum)), population_limit);
  if (!target || population_size() >= population_limit)
    return;
  std::vector<std::uint64_t> eligible;
  for (const auto &species : taxonomy_.species)
    if (protectable(*this, species) &&
        (!species.protection_used || ticks - species.last_protection >= 600))
      eligible.push_back(species.id);
  if (eligible.empty())
    return;
  const std::set<std::uint64_t> wanted(eligible.begin(), eligible.end());
  auto counts = protected_population(*this, wanted, target);
  for (auto id : eligible) {
    auto &species = *taxonomy_.find(id);
    if (cancelled || !protectable(*this, species) || counts[species.id] >= target ||
        (species.protection_used && ticks - species.last_protection < 600))
      continue;
    const auto *b = species_breeder(*this, species.id);
    SupportGroup job;
    job.source = b->genome;
    job.parent = b->id;
    job.depth = b->depth;
    job.species = species.id;
    job.members.resize(3);
    for (auto &member : job.members) {
      member.candidate = job.source;
      member.parent = job.parent;
      member.depth = job.depth;
    }
    for (int attempt = 0; attempt < 6; ++attempt) {
      auto site = protection_site(*this, species);
      if (!site)
        break;
      const int added = insert_group(job, *site);
      if (added > 0) {
        auto &rescued = *taxonomy_.find(id);
        ++rescued.protection_used;
        rescued.last_protection = ticks;
        counts[id] += added;
        break;
      }
    }
  }
}
}
