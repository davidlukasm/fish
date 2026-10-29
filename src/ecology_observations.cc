#include "perception.hh"
#include "maturation_cache.hh"
#include "ecology.hh"
#include "physiology.hh"
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
namespace fishsim {
Ecosystem::Ecosystem(const Ecosystem &w, Observation)
    : field(w.field), rng(w.rng), combat_effects(w.combat_effects),
      next_combat_effect(w.next_combat_effect), recent_deaths(w.recent_deaths),
      recent_mortality(w.recent_mortality), placement_notice(w.placement_notice), sperm(w.sperm),
      next_sperm_id(w.next_sperm_id), corpses(w.corpses), evo(w.evo), disease(w.disease),
      food_burst(w.food_burst), mutation_burst(w.mutation_burst), food_pulse(w.food_pulse),
      mutation_pulse(w.mutation_pulse), workers(w.workers), profile_steps(w.profile_steps),
      step_ms(w.step_ms), environment(w.environment), novelty_strength(w.novelty_strength),
      neural_budget(w.neural_budget), ticks(w.ticks), next_id(w.next_id), watched_id(w.watched_id),
      watched_death(w.watched_death), watched_cause(w.watched_cause),
      observation_interval(w.observation_interval), population_limit(w.population_limit),
      safety(w.safety), physiology_(w.physiology_), metrics_(w.metrics_), taxonomy_(w.taxonomy_),
      support_(w.support_) {
  fish.reserve(w.fish.size());
  for (const auto &p : w.fish)
    fish.push_back(p.observation());
}
Ecosystem Ecosystem::observation() const {
  return Ecosystem(*this, Observation{});
}

void Ecosystem::observe_behavior() {
  using Features = std::array<double, BEHAVIOR_FEATURES>;
  struct Observed {
    Individual *fish;
    Features features;
  };
  std::vector<Observed> adults, candidates;
  for (auto &p : fish)
    if (p.developing() && p.body.hatched) {
      Observed observed{&p, p.behavior()};
      adults.push_back(observed);
      if (p.observations_.window_steps >= 80 && p.observations_.window_nutrition > 0)
        candidates.push_back(observed);
    }
  auto nearest = [&](std::vector<double> &distances) {
    auto n = std::min<std::size_t>(std::size_t(evo.novelty_neighbors), distances.size());
    if (!n)
      return 0.;
    if (n < distances.size())
      std::nth_element(distances.begin(), distances.begin() + n, distances.end());
    return std::accumulate(distances.begin(), distances.begin() + n, 0.) / n;
  };
  for (auto &observed : adults) {
    if (observed.fish->observations().window_steps < 80)
      continue;
    std::vector<double> distances;
    distances.reserve(adults.size() + support_.archive.size());
    for (const auto &other : adults)
      if (other.fish->observations().window_steps >= 80 && other.fish->id != observed.fish->id)
        distances.push_back(behavior_distance(observed.features, other.features));
    for (const auto &a : support_.archive)
      if (a.environment == environment)
        distances.push_back(behavior_distance(observed.features, a.behavior));
    observed.fish->novelty = nearest(distances);
  }
  for (const auto &candidate : candidates) {
    const auto &p = *candidate.fish;
    const auto &d = candidate.features;
    double quality =
        p.observations_.window_nutrition / FOOD_ENERGY / double(p.observations_.window_steps) +
        .02 * p.offspring;
    auto closest = support_.archive.end();
    double distance = std::numeric_limits<double>::infinity();
    for (auto a = support_.archive.begin(); a != support_.archive.end(); ++a)
      if (a->environment == environment) {
        double v = behavior_distance(d, a->behavior);
        if (v < distance) {
          distance = v;
          closest = a;
        }
      }
    for (auto &known : support_.archive)
      if (known.genome.same_genes(p.genome) && p.offspring > known.offspring) {
        known.quality += .02 * (p.offspring - known.offspring);
        known.offspring = p.offspring;
        known.source_id = p.id;
      }
    ArchiveEntry entry{
        p.genome,    d,         quality,     p.novelty, ticks, p.body.reproduction_.egg_role,
        environment, p.species, p.offspring, p.id};
    if (closest != support_.archive.end() && distance < .08) {
      if (quality > closest->quality)
        *closest = std::move(entry);
    } else if (support_.archive.size() < 128)
      support_.archive.push_back(std::move(entry));
    else {
      auto weakest =
          std::min_element(support_.archive.begin(), support_.archive.end(),
                           [&](const ArchiveEntry &a, const ArchiveEntry &b) {
                             if ((a.environment == environment) != (b.environment == environment))
                               return a.environment != environment;
                             return a.novelty < b.novelty;
                           });
      if (weakest->environment != environment || p.novelty > weakest->novelty)
        *weakest = std::move(entry);
    }
  }
  // Re-evaluate archive novelty against the current population and archive; scores are not frozen
  // at admission.
  for (std::size_t i = 0; i < support_.archive.size(); ++i)
    if (support_.archive[i].environment == environment) {
      std::vector<double> distances;
      for (const auto &p : adults)
        if (p.fish->observations().window_steps >= 80)
          distances.push_back(behavior_distance(support_.archive[i].behavior, p.features));
      for (std::size_t j = 0; j < support_.archive.size(); ++j)
        if (i != j && support_.archive[j].environment == environment)
          distances.push_back(
              behavior_distance(support_.archive[i].behavior, support_.archive[j].behavior));
      support_.archive[i].novelty = nearest(distances);
    }
}
void Ecosystem::remember() {
  for (const auto &p : fish)
    remember_breeder(p);
  observe_behavior();
  std::vector<Genome> bank;
  auto keep = [&](const Genome &g) {
    if (bank.size() < 32 &&
        std::none_of(bank.begin(), bank.end(), [&](const Genome &v) { return g.same_genes(v); }))
      bank.push_back(g);
  };
  auto entries = support_.archive;
  std::stable_sort(entries.begin(), entries.end(),
                   [&](const ArchiveEntry &a, const ArchiveEntry &b) {
                     if ((a.environment == environment) != (b.environment == environment))
                       return a.environment == environment;
                     return a.novelty > b.novelty;
                   });
  // Reserve space for both proven breeders and distinct observed lifestyles.
  for (std::size_t i = 0;
       i < std::max(support_.breeders.size(), entries.size()) && bank.size() < 32; ++i) {
    if (i < support_.breeders.size())
      keep(support_.breeders[i].genome);
    if (i < entries.size())
      keep(entries[i].genome);
  }
  for (const auto &g : support_.reserve)
    keep(g);
  support_.reserve = std::move(bank);
}
void Ecosystem::reset_window() {
  metrics_.window_adult_deaths = 0;
  metrics_.window_food_nutrition = 0;
  metrics_.window_nutrition = metrics_.window_exposure = metrics_.window_births =
      metrics_.window_deaths = metrics_.window_rescues = 0;
  metrics_.dead_window_best = 0;
  for (auto &s : taxonomy_.species)
    s.hormones.window = {};
  for (auto &p : fish) {
    p.observations_.window_hormones = {};
    p.observations_.window_food = p.observations_.window_steps = p.observations_.window_pauses =
        p.observations_.window_eggs = p.observations_.window_corpses =
            p.observations_.window_mouth = 0;
    p.observations_.window_traits = {};
    p.observations_.window_diet = {};
    p.observations_.window_surface = p.observations_.window_grass =
        p.observations_.window_turbidity = p.observations_.window_current = 0;
    p.observations_.window_bottom = p.observations_.window_top = p.observations_.window_pulses =
        p.observations_.window_glides = 0;
    p.observations_.window_nutrition = p.observations_.window_prey_nutrition =
        p.observations_.window_spawn = p.observations_.window_sperm = 0;
    p.observations_.window_turn = p.observations_.window_travel = 0;
    p.observations_.visited = 0;
  }
}
Individual *Ecosystem::prepare_inspection(std::uint64_t selected, bool brain_detail,
                                          bool brain_mode, int neuron) {
  Individual *chosen = nullptr;
  for (auto &p : fish) {
    if (p.body.brain_)
      p.body.brain_->observe_connections(brain_detail && p.id == selected);
    bool inspect = brain_mode && p.id == selected;
    const bool retina = p.id == selected;
    bool fresh = (inspect && (!p.body.perception_.inspect_vision ||
                              p.body.perception_.inspection_neuron != neuron)) ||
                 (retina && !p.body.perception_.inspect_retina);
    p.body.perception_.inspection_neuron = inspect ? neuron : -1;
    p.body.perception_.inspect_retina = retina;
    p.body.perception_.inspect_vision = inspect;
    if (!inspect) {
      p.body.perception_.visual_contributions.clear();
      p.body.perception_.visual_samples.clear();
    }
    if (fresh && p.body.hatched && p.genome.interface) {
      sense_generated(p.body, p.genome, field, nullptr, false, physiology_);
      p.body.perception_.perception_prepared = false;
    }
    if (p.id == selected)
      chosen = &p;
  }
  return chosen;
}

}
