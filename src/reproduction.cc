#include "ecology_internal.hh"
#include "physiology.hh"
#include <numeric>
namespace fishsim {
namespace {
void mix_gamete(std::array<double, 3> &color, double stored, const std::array<double, 3> &incoming,
                double amount) {
  if (amount > 0)
    for (int c = 0; c < 3; ++c)
      color[c] = (stored * color[c] + amount * incoming[c]) / (stored + amount);
}
}
void Ecosystem::transfer_gametes(Individual &p) {
  auto &b = p.body;
  if (!b.hatched) {
    b.reproduction_.egg_transfer = b.reproduction_.sperm_transfer = 0;
    return;
  }
  const double growth = growth_fraction(b);
  b.reproduction_.sperm_limit = organ_capacity(b, p.genome, 5, physiology_.sperm_capacity);
  b.reproduction_.egg_limit = ovary_capacity(b, p.genome, evo.egg_capacity, evo.egg_organ_capacity);
  double egg =
      !b.reproduction_.egg_laying
          ? std::min(std::clamp(b.reproduction_.egg_transfer, 0., 1.) * evo.egg_fill_rate * growth,
                     std::max(0., b.reproduction_.egg_limit - b.reproduction_.egg_yolk))
          : 0;
  double sperm =
      !b.reproduction_.sperm_laying
          ? std::min(std::clamp(b.reproduction_.sperm_transfer, 0., 1.) * evo.sperm_fill_rate *
                         growth,
                     std::max(0., b.reproduction_.sperm_limit - b.reproduction_.sperm_store))
          : 0;
  const double available = std::max(0., b.energy - maternal_reserve(b, evo.egg_reserve)),
               requested = egg + sperm;
  if (requested > available && requested > 0) {
    egg *= available / requested;
    sperm *= available / requested;
  }
  mix_gamete(b.reproduction_.egg_color, b.reproduction_.egg_yolk, b.reproduction_.egg_signal_color,
             egg);
  mix_gamete(b.reproduction_.sperm_color, b.reproduction_.sperm_store,
             b.reproduction_.sperm_signal_color, sperm);
  b.energy -= egg + sperm;
  b.reproduction_.egg_yolk += egg;
  b.reproduction_.sperm_store += sperm;
  b.reproduction_.egg_transfer = b.reproduction_.sperm_transfer = 0;
}
std::optional<Individual> Ecosystem::fill_natural_egg(Individual &p, std::size_t occupied) {
  auto &b = p.body;
  if (!b.alive || !b.hatched)
    return std::nullopt;
  transfer_gametes(p);
  if (b.reproduction_.egg_yolk > 0 && b.reproduction_.egg_release &&
      b.reproduction_.egg_yolk >= .95 * b.reproduction_.egg_limit)
    b.reproduction_.egg_laying = true;
  if (!b.reproduction_.egg_laying)
    return std::nullopt;
  const bool nutrient = b.reproduction_.egg_yolk <
                        evo.nutrient_egg_threshold * minimum_egg_energy(p.genome, physiology_);
  if (!nutrient && occupied >= std::size_t(population_limit))
    return std::nullopt;
  std::size_t nearby = 0;
  if (!nutrient)
    for (const auto &q : fish)
      if (q.body.alive && !q.body.hatched && !q.nutrient_egg &&
          (q.species ? q.species : q.maternal_species) == p.species &&
          std::hypot(field.delta_x(q.body.x - b.x), q.body.y - b.y) <= evo.egg_crowding_radius)
        ++nearby;
  if (nutrient || nearby < std::size_t(evo.egg_crowding_limit)) {
    const double shell = egg_radius(b.reproduction_.egg_yolk), distance = body_radius(b) + shell;
    double x = 0, y = 0;
    bool placed = false;
    for (double offset : {0., .5, -.5, 1., -1., 1.5, -1.5, PI}) {
      const double angle = b.angle + PI + offset,
                   px = field.wrap_x(b.x + distance * std::cos(angle)),
                   py = b.y + distance * std::sin(angle);
      if (field.free(px, py, shell)) {
        x = px;
        y = py;
        placed = true;
        break;
      }
    }
    if (!placed)
      return std::nullopt;
    Individual egg;
    egg.genome = p.genome;
    egg.maternal_species = p.species;
    egg.id = next_id++;
    egg.body.identity = egg.id;
    egg.born = ticks;
    egg.origin = 1;
    egg.fertilised = false;
    egg.nutrient_egg = nutrient;
    if (!nutrient) {
      egg.parent = p.id;
      egg.maternal_depth = p.depth;
      egg.maternal_g = p.g;
      egg.feeding_generations = p.body.nutrition > 0 ? p.feeding_generations : 0;
      egg.maternal_natural = p.origin == 1 && !p.assisted;
      egg.depth = p.depth + 1;
      ++metrics_.released_eggs;
    } else
      ++metrics_.nutrient_eggs;
    egg.body.hatched = false;
    egg.body.energy = b.reproduction_.egg_yolk;
    size_egg(egg.body);

    egg.body.x = field.wrap_x(x);
    egg.body.y = y;
    egg.body.motor_.speed = 0;
    egg.body.hatched = false;
    egg.body.hatch_age = -1;
    egg.body.energy = b.reproduction_.egg_yolk;
    egg.body.color = b.reproduction_.egg_color;
    egg.body.reproduction_.egg_role = true;
    b.reproduction_.egg_yolk = 0;
    b.reproduction_.egg_color = {};
    b.reproduction_.egg_laying = false;
    b.energy -= evo.egg_overhead;
    if (b.energy < 0) {
      b.peak_tissue = std::max(b.peak_tissue, b.tissue);
      double used = std::min(std::max(0., b.tissue - tissue_floor(b)), -b.energy / .8);
      harm_body(b, starvation_damage(b, used), 0);
      b.tissue -= used;
      b.energy += .8 * used;
      b.energy = std::max(0., b.energy);
    }
    if (!nutrient) {
      ++p.observations_.window_spawn;
    }
    p.last_spawn = ticks;
    b.reproduction_.egg_readiness = b.energy > maternal_reserve(b, evo.egg_reserve) ? 1 : 0;
    b.reproduction_.readiness =
        std::max(b.reproduction_.egg_readiness, b.reproduction_.sperm_readiness);
    return egg;
  }
  return std::nullopt;
}
void Ecosystem::fill_sperm(Individual &p) {
  auto &b = p.body;
  if (!b.alive || !b.hatched)
    return;
  transfer_gametes(p);
  if (b.reproduction_.sperm_store >= evo.sperm_portion && b.reproduction_.sperm_release)
    b.reproduction_.sperm_laying = true;
  if (b.reproduction_.sperm_laying)
    release_sperm(p);
}
bool Ecosystem::release_sperm(Individual &p, bool manual) {
  auto &b = p.body;
  const double amount = manual ? std::max(evo.sperm_portion, physiology_.sperm_capacity)
                               : b.reproduction_.sperm_store;
  const auto color = b.reproduction_.sperm_store > 0 ? b.reproduction_.sperm_color
                                                     : b.reproduction_.sperm_signal_color;
  if (b.alive && b.hatched && amount >= evo.sperm_portion && sperm.size() < MAX_SPERM_RELEASES) {
    sperm.push_back({p.genome, b.x, b.y, p.id, amount, p.depth, p.species,
                     !manual && p.origin == 1 && !p.assisted, p.novelty, p.g, color});
    sperm.back().release_radius = body_radius(b);
    sperm.back().feeding_generations = b.nutrition > 0 ? p.feeding_generations : 0;
    sperm.back().render_id = next_sperm_id++;
    seed_sperm(sperm.back());
    if (sperm.back().cells.empty()) {
      sperm.pop_back();
      return false;
    }
    if (manual)
      return true;
    b.reproduction_.sperm_store = 0;
    b.reproduction_.sperm_color = {};
    b.reproduction_.sperm_laying = false;
    p.last_sperm = ticks;
    ++metrics_.released_sperm;
    ++p.observations_.window_sperm;
    return true;
  }
  return false;
}
std::vector<std::size_t> Ecosystem::mating_order(const Individual &egg, int pass) {
  std::vector<std::size_t> order;
  std::vector<std::size_t> pool;
  std::vector<double> weights;
  double concentration = 0, mean = 0;
  for (std::size_t c = 0; c < sperm.size(); ++c) {
    const auto i = (c + ticks) % sperm.size();
    const auto &s = sperm[i];
    if (!s.fertile)
      continue;
    const bool self = s.parent == egg.parent;
    if ((pass == 0 && self) || (pass == 1 && (!self || egg.body.age < int(evo.selfing_delay))) ||
        !compatible(egg.genome, s.genome, taxonomy_.mating_distance, egg.id, s.render_id))
      continue;
    const double density = local_sperm(s, egg.body.x, egg.body.y);
    if (density <= 0)
      continue;
    pool.push_back(i);
    weights.push_back(density);
    concentration += density;
    mean += density * s.novelty;
  }
  if (concentration < physiology_.sperm_dilution)
    return order;
  mean /= concentration;
  for (std::size_t k = 0; k < pool.size(); ++k) {
    const double ratio = mean > 0 ? sperm[pool[k]].novelty / mean : 1;
    weights[k] *= 1 + novelty_strength * (ratio * ratio - .75);
  }
  while (!pool.empty()) {
    double r = rng.uniform() * std::accumulate(weights.begin(), weights.end(), 0.);
    std::size_t k = 0;
    while (k + 1 < pool.size() && r >= weights[k]) {
      r -= weights[k];
      ++k;
    }
    order.push_back(pool[k]);
    pool.erase(pool.begin() + std::ptrdiff_t(k));
    weights.erase(weights.begin() + std::ptrdiff_t(k));
  }
  return order;
}
void Ecosystem::reproduction(bool fertile) {
  if (fertile && ticks % 100 == 0) {
    std::vector<std::shared_ptr<evolution::History>> histories;
    for (const auto &p : fish) {
      auto h = p.genome.cppn->history();
      if (std::find(histories.begin(), histories.end(), h) == histories.end()) {
        histories.push_back(h);
        h->next_generation();
      }
    }
    remember();
  }
  fish.erase(
      std::remove_if(fish.begin(), fish.end(), [](const Individual &p) { return !p.body.alive; }),
      fish.end());
  std::vector<std::size_t> order(fish.size());
  std::iota(order.begin(), order.end(), 0);
  if (!order.empty())
    std::rotate(order.begin(), order.begin() + ticks % order.size(), order.end());
  if (novelty_strength > 0) {
    std::vector<double> priority(fish.size());
    for (std::size_t i = 0; i < order.size(); ++i)
      priority[order[i]] =
          novelty_strength * fish[order[i]].novelty +
          (1 - novelty_strength) * (order.size() - i) / std::max<std::size_t>(1, order.size());
    std::stable_sort(order.begin(), order.end(),
                     [&](std::size_t a, std::size_t b) { return priority[a] > priority[b]; });
  }
  for (auto &p : fish) {
    auto &b = p.body;
    auto &e = b.embryo;
    if (!b.alive)
      continue;
    if (!b.hatched && p.developing()) {
      const double capacity = organ_capacity(b, p.genome, 5, physiology_.sperm_capacity);
      const double amount = std::min(
          {b.reproduction_.sperm_transfer * evo.sperm_fill_rate * growth_fraction(b),
           std::max(0., capacity - e.secretion), std::max(0., b.energy - hatch_search_reserve(b))});
      b.energy -= amount;
      e.secretion += amount;
      if (b.reproduction_.sperm_release && e.secretion > 0) {
        e.shell = std::max(0., e.shell - e.secretion / std::max(1., b.egg_shell_radius));
        e.pending += e.secretion;
        e.secretion = 0;
      }
      b.reproduction_.egg_transfer = b.reproduction_.sperm_transfer = 0;
    }
    if (e.pending > 0 && sperm.size() < MAX_SPERM_RELEASES) {
      Sperm cloud;
      cloud.genome = p.genome;
      cloud.x = b.x;
      cloud.y = b.y;
      cloud.parent = p.id;
      cloud.energy = e.pending;
      cloud.species = p.species;
      cloud.color = b.reproduction_.sperm_signal_color;
      cloud.release_radius = std::max(.001, b.egg_shell_radius);
      cloud.render_id = next_sperm_id++;
      cloud.fertile = false;
      seed_sperm(cloud);
      if (!cloud.cells.empty()) {
        sperm.push_back(std::move(cloud));
        e.pending = 0;
      }
    }
  }
  if (!fertile) {
    refresh_sperm_field();
    return;
  }
  std::size_t occupied = population_size();
  fish.reserve(fish.size() + order.size());
  for (auto i : order) {
    auto &p = fish[i];
    auto &b = p.body;
    if (!b.hatched)
      continue;
    if (auto egg = fill_natural_egg(p, occupied)) {
      if (!egg->nutrient_egg)
        ++occupied;
      fish.push_back(std::move(*egg));
    }
    fill_sperm(p);
  }
  refresh_sperm_field();
  // Local compatible concentration weights fathers; novelty retains its configured contribution.
  for (std::size_t e = 0; e < fish.size(); ++e) {
    auto &egg = fish[(e + ticks) % fish.size()];
    if (egg.nutrient_egg || egg.developing() || !egg.body.alive)
      continue;
    for (int pass = 0; pass < 2 && !egg.fertilised && !egg.nutrient_egg; ++pass) {
      auto order = mating_order(egg, pass);
      for (auto index : order) {
        auto &cloud = sperm[index];
        bool self = cloud.parent == egg.parent;
        if ((pass == 0 && self) || (pass == 1 && (!self || egg.body.age < int(evo.selfing_delay))))
          continue;
        if (local_sperm(cloud, egg.body.x, egg.body.y) <= 0 ||
            !compatible(egg.genome, cloud.genome, taxonomy_.mating_distance, egg.id,
                        cloud.render_id))
          continue;
        if (evo.recruitment_target > 0 &&
            rng.uniform() >=
                1 / (1 + std::pow(double(adult_population()) / evo.recruitment_target, 4))) {
          egg.nutrient_egg = true;
          ++metrics_.nutrient_eggs;
          break;
        }
        Genome child;
        try {
          child = Genome::cross(egg.genome, cloud.genome, rng, 1, 1, false);
          child.development_options.stop_at_resource_limit = true;
          child.mutate(rng, mutation_strength(), false, evo.rates);
          child.begin_individual(rng);
          child.development_options.stop_at_resource_limit = false;
          if (child.cppn->nodes() > 1024 || child.cppn->get_connection_genes().size() > 16384)
            throw std::length_error("Technical CPPN genotype budget exceeded");
        } catch (const std::length_error &) {
          ++metrics_.budget_rejections;
          continue;
        }
        if ((child.blueprint && child.blueprint->resource_limited) ||
            connection_storage(*this, &child) + planned_edges(child) > neural_budget) {
          ++metrics_.budget_rejections;
          continue;
        }
        auto previous_species = taxonomy_.species.size();
        auto species = classify(child, egg.maternal_species ? egg.maternal_species : cloud.species);
        if (!species) {
          ++metrics_.budget_rejections;
          continue;
        }
        if (this->taxonomy_.species.size() > previous_species) {
          auto &s = this->taxonomy_.species.back();
          s.mother_species = egg.maternal_species;
          s.father_species = cloud.species;
          for (auto &name : s.hormones.names)
            name.paternal_origin = cloud.species;
          s.origin = egg.origin;
        }
        egg.feeding_generations =
            std::max(species == egg.maternal_species ? egg.feeding_generations : 0u,
                     species == cloud.species ? cloud.feeding_generations : 0u);
        if (egg.assisted)
          egg.feeding_generations = 0;
        egg.species = species;
        egg.paternal_species = cloud.species;
        egg.paternal_depth = cloud.depth;
        egg.paternal_natural = cloud.natural;
        egg.g = egg.origin == 1 && !egg.assisted ? std::min(egg.maternal_g, cloud.g) + 1 : 0;
        egg.genome = std::move(child);
        egg.father = cloud.parent;
        egg.depth = std::max(egg.depth, cloud.depth + 1);
        egg.fertilised = true;
        egg.body.age = 0;
        egg.body.prepare(egg.genome);
        ++metrics_.fertilisations;
        if (self)
          ++support_.self_fertilisations;
        break;
      }
    }
  }
  assist_population();
}
void Ecosystem::begin_clonal_development() {
  for (auto &egg : fish)
    if (egg.body.alive && !egg.nutrient_egg && !egg.developing() &&
        egg.body.age >= int(evo.fertilisation_wait)) {
      if (evo.recruitment_target > 0 &&
          rng.uniform() >=
              1 / (1 + std::pow(double(adult_population()) / evo.recruitment_target, 4))) {
        egg.nutrient_egg = true;
        ++metrics_.nutrient_eggs;
        continue;
      }
      Genome child = egg.genome;
      try {
        child.mutate(rng, mutation_strength(), false, evo.rates);
        child.begin_individual(rng);
        if (connection_storage(*this, &child) - planned_edges(egg.genome) + planned_edges(child) >
            neural_budget)
          throw std::length_error("Technical neural budget exceeded");
      } catch (const std::length_error &) {
        ++metrics_.budget_rejections;
        child = egg.genome;
      }
      auto previous = taxonomy_.species.size();
      auto group = classify(child, egg.maternal_species);
      if (!group) {
        ++metrics_.budget_rejections;
        continue;
      }
      if (taxonomy_.species.size() > previous) {
        auto &s = taxonomy_.species.back();
        s.mother_species = egg.maternal_species;
        s.origin = egg.origin;
      }
      if (egg.assisted || group != egg.maternal_species)
        egg.feeding_generations = 0;
      egg.species = group;
      egg.genome = std::move(child);
      egg.g = egg.origin == 1 && !egg.assisted ? egg.maternal_g + 1 : 0;
      egg.clonal = true;
      egg.father = egg.paternal_species = 0;
      egg.paternal_natural = false;
      egg.body.age = 0;
      egg.body.prepare(egg.genome);
      ++metrics_.clonal_starts;
    }
}

void transfer_gametes(Ecosystem &w, Individual &p) {
  w.transfer_gametes(p);
}
std::optional<Individual> fill_natural_egg(Ecosystem &w, Individual &p, std::size_t occupied) {
  return w.fill_natural_egg(p, occupied);
}
void fill_sperm(Ecosystem &w, Individual &p) {
  w.fill_sperm(p);
}

}
