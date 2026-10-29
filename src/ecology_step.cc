#include "ecology_internal.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "physiology.hh"
#include "movement.hh"
#include <limits>
namespace fishsim {
void Ecosystem::develop_population() {
  std::vector<std::size_t> pending;
  for (std::size_t i = 0; i < fish.size(); ++i)
    if (fish[i].developing() && fish[i].body.alive && !fish[i].genome.blueprint)
      pending.push_back(i);
  // The budget follows the demand: open developments (shared plans counted once) should finish
  // in about eight steps. It depends only on the state, so runs stay reproducible.
  double need = 0;
  {
    constexpr double typical = 40000; // CPPN queries of a whole brain, as measured for large ones
    std::vector<const void *> plans;
    for (auto i : pending) {
      const auto &g = fish[i].genome;
      const void *plan = g.growing ? static_cast<const void *>(g.growing.get())
                                   : static_cast<const void *>(&g);
      if (std::find(plans.begin(), plans.end(), plan) != plans.end())
        continue;
      plans.push_back(plan);
      need += std::max(4096., typical - double(g.pending_queries()));
    }
  }
  const auto query_budget = std::size_t(std::clamp(
      need / 8, evo.development_queries,
      std::max(evo.development_queries, evo.development_query_limit)));
  std::size_t budget = query_budget;
  const int finalizations = std::max(1, int(evo.development_finalizations));
  int finalized = 0;
  auto develop_tier = [&](int priority, std::size_t &remaining) {
    std::vector<std::size_t> active;
    for (auto i : pending) {
      auto origin = fish[i].origin;
      int tier = origin == 1 ? 0 : origin == 0 ? 1 : origin == 3 ? 2 : 3;
      if (tier == priority)
        active.push_back(i);
    }
    std::sort(active.begin(), active.end(), [&](auto a, auto b) {
      return fish[a].born != fish[b].born ? fish[a].born < fish[b].born : fish[a].id < fish[b].id;
    });
    for (auto i : active) {
      auto &g = fish[i].genome;
      while (remaining && !g.blueprint) {
        if (g.growing && g.growing->pending_finalization()) {
          if (finalized >= finalizations)
            break;
          ++finalized;
        }
        auto before = g.pending_queries();
        g.advance_development(remaining, workers);
        auto used = g.blueprint ? g.blueprint->queries - before : g.pending_queries() - before;
        remaining -= std::min(remaining, used);
        if (!used && !g.blueprint && !(g.growing && g.growing->pending_finalization()))
          break;
      }
    }
  };
  std::size_t reserved =
      std::any_of(pending.begin(), pending.end(), [&](auto i) { return fish[i].origin == 3; })
          ? query_budget / 8
          : 0;
  std::size_t primary = budget - reserved;
  develop_tier(0, primary);
  develop_tier(1, primary);
  develop_tier(2, reserved);
  budget = primary + reserved;
  develop_tier(0, budget);
  develop_tier(1, budget);
  develop_tier(3, budget);
  // A shared plan can finish in one member; finish its other aliases without additional queries.
  for (auto i : pending) {
    auto &g = fish[i].genome;
    if (!g.blueprint && g.growing && !g.growing->pending_finalization())
      g.advance_development(0, workers);
  }
}
void Ecosystem::index_organisms() {
  std::vector<VisibleBody> visible;
  visible.reserve(fish.size());
  for (std::size_t i = 0; i < fish.size(); ++i) {
    const auto &p = fish[i];
    if (p.body.alive) {
      visible.push_back({p.body.x, p.body.y, 0, p.id, p.body.reproduction_.egg_role, p.body.hatched,
                         p.body.color, p.body.hatched ? 0 : p.body.energy,
                         collision_radius(p.body)});
      visible.back().hidden =
          p.body.hatched && p.body.sediment_coverage >= field.env().burial_cover;
      visible.back().age = p.body.age;
      visible.back().kind = p.body.hatched ? 1 : 2;
      visible.back().source = i;
      visible.back().relative_speed = p.body.motor_.relative_speed;
      visible.back().flow_x = p.body.motor_.vx - p.body.motor_.water_vx +
                              .4 * p.body.motor_.thrust * std::cos(p.body.angle);
      visible.back().flow_y = p.body.motor_.vy - p.body.motor_.water_vy +
                              .4 * p.body.motor_.thrust * std::sin(p.body.angle);
    }
  }
  for (const auto &c : corpses) {
    auto color = remains_color(c, field.feeding().food_bright, field.env().decay_half_life,
                               field.env().bone_time);
    visible.push_back({c.x, c.y, 0, 0, false, true, color, 0, corpse_extent(c), 3,
                       std::size_t(&c - corpses.data())});
    if (!c.hatched) {
      visible.back().odor_channel = 6;
      visible.back().odor_energy =
          c.energy * std::exp2(-corpse_decay_age(c) / (2 * field.env().decay_half_life)) *
          odor_maturity(c.age, field.env());
    }
  }
  std::vector<Field::OdorSource> odors;
  odors.reserve(corpses.size());
  for (const auto &c : corpses)
    if (c.hatched)
      odors.push_back(
          {c.x, c.y,
           c.energy * std::exp2(-corpse_decay_age(c) / (2 * field.env().decay_half_life)) *
               odor_maturity(c.age, field.env())});
  refresh_sperm_field();
  field.index_small_animals(visible);
  field.index(visible, std::move(odors));
}
void Ecosystem::act_population(const std::vector<std::vector<VisualObject>> &optical,
                               bool gpu_optics, bool protected_life,
                               const std::vector<unsigned char> &hatched,
                               std::vector<std::array<double, 2>> &old) {
  Field::SedimentReadScope bed(field);
  const auto hormone_target = hormone_analysis_.requested();
  std::size_t neural_work = 0;
  for (const auto &p : fish)
    if (p.body.alive && p.body.hatched && p.body.brain_)
      neural_work += p.body.brain_->slot_count();
  parallel(
      fish.size(), workers,
      [&](std::size_t i) {
        auto &p = fish[i];
        auto &b = p.body;
        old[i] = {b.x, b.y};
        p.observations_.neural_sampled = false;
        if (!b.alive)
          return;
        b.motor_.impact *= .8;
        if (!b.hatched) {
          size_egg(b);
          const double shell = collision_radius(b),
                       density = b.energy / std::max(1e-9, EGG_ENERGY_PER_RADIUS2 * shell * shell),
                       material = std::clamp(2 * (density - .75), -.5, .5);
          auto water = field.water().velocity(b.x, b.y),
               v = field.drift_velocity({b.motor_.vx, b.motor_.vy}, water,
                                        material > 0 ? .8 * material : material, .14256);
          auto drift = field.sediment_velocity(v, b.x, b.y, collision_radius(b));
          double ox = b.x, oy = b.y;
          b.x += drift.x;
          b.y += drift.y;
          field.collide(b, ox, oy);
          b.motor_.vx = field.delta_x(b.x - ox);
          b.motor_.vy = b.y - oy;
          b.anchored = false;
        }
        if (p.nutrient_egg) {
          ++b.age;
          b.ledger_.development_cost = 0;
          if (b.age >= int(evo.fertilisation_wait)) {
            b.alive = false;
            p.death_cause = 2;
          }
          return;
        }
        if (!p.developing()) {
          ++b.age;
          b.ledger_.development_cost = .025;
          if (!protected_life)
            b.energy -= .025;
          return;
        }

        b.reproduction_.motor_reserve = maternal_reserve(b, evo.egg_reserve);
        b.reproduction_.egg_limit =
            ovary_capacity(b, p.genome, evo.egg_capacity, evo.egg_organ_capacity);
        b.reproduction_.sperm_limit = organ_capacity(b, p.genome, 5, physiology_.sperm_capacity);
        bool mature = b.hatched;
        b.reproduction_.egg_readiness =
            mature && p.genome.interface && p.genome.interface->motor_counts[4] &&
                    (b.reproduction_.egg_yolk > 0 || b.energy > b.reproduction_.motor_reserve)
                ? 1
                : 0;
        b.reproduction_.sperm_readiness =
            mature && p.genome.interface && p.genome.interface->motor_counts[5] &&
                    (b.reproduction_.sperm_store > 0 || b.energy > b.reproduction_.motor_reserve)
                ? 1
                : 0;
        b.reproduction_.readiness =
            std::max(b.reproduction_.egg_readiness, b.reproduction_.sperm_readiness);
        if (b.hatched)
          sense_generated(b, p.genome, field, gpu_optics ? &optical[i] : nullptr, true,
                          physiology_);
        if (p.id == hormone_target)
          hormone_analysis_.capture(p, ticks);
        p.observations_.neural_sampled = b.brain().has_value();
        advance_body(b, p.genome, &field, physiology_, protected_life);
        p.observations_.hormone_release_pending |=
            b.reproduction().egg_release || b.reproduction().sperm_release;
        if (hatched[i] && !protected_life) {
          harm_body(b, senescence_loss(b, physiology_), 6);
        }
        if (hatched[i] && b.hatched && b.age > b.hatch_age) {
          p.observations_.habitat_sampled = true;
          ++p.observations_.window_steps;
          ++p.observations_.habitat_steps;
          bool surface = field.surface_gap(b.x, b.y, body_radius(b)) <= 24,
               grass = field.in_grass(b.x, b.y, body_radius(b));
          double illumination = field.light(b.x, b.y);
          p.observations_.window_surface += surface;
          p.observations_.window_grass += grass;
          ++p.observations_.ecology_steps;
          p.observations_.habitat_sample = {
              double(surface), double(grass),
              double(field.sediment_immersion(b.x, b.y, body_radius(b)) > .5),
              double(illumination < .2), illumination};
          for (int k = 0; k < 5; ++k)
            p.observations_.habitat_totals[k] += p.observations_.habitat_sample[k];
          p.observations_.window_turbidity += std::min(1., field.turbidity(b.x, b.y));
          p.observations_.window_current +=
              std::min(1., std::hypot(b.motor_.water_vx, b.motor_.water_vy) / 2);
          p.observations_.bottom_steps += b.y > field.geometry().height * .8;
          p.observations_.top_steps += b.y < field.geometry().height * .2;
          p.observations_.window_mouth += std::clamp(b.eat_signal, 0., 1.);
          p.observations_.window_bottom += b.y > field.geometry().height * .8;
          p.observations_.window_top += b.y < field.geometry().height * .2;
          p.observations_.window_pulses += b.motor_.thrust >= MIN_SWIMMING_PULSE;
          p.observations_.window_glides +=
              b.motor_.thrust < MIN_SWIMMING_PULSE && b.motor_.relative_speed > .05;
          for (int k = 0; k < 3; ++k)
            p.observations_.window_traits[k] += b.color[k];
          p.observations_.window_traits[3] += b.motor_.aggression;
          p.observations_.window_traits[4] += b.motor_.defense / .85;
          int cx = std::clamp(int(b.x / field.geometry().width * 8), 0, 7),
              cy = std::clamp(int(b.y / field.geometry().height * 8), 0, 7);
          if (b.motor_.relative_speed > .05)
            p.observations_.visited |= std::uint64_t(1) << (cy * 8 + cx);
          p.observations_.window_travel += b.motor_.relative_speed;
          p.observations_.window_turn += std::abs(b.motor_.turn);
          p.observations_.window_pauses += b.motor_.relative_speed < .75;
        }
      },
      neural_work);
}
bool Ecosystem::resolve_population(const std::vector<std::array<double, 2>> &old,
                                   const std::vector<unsigned char> &hatched, bool protected_life) {
  for (auto &p : fish) {
    field.deposit_feces(p.body.x, p.body.y, p.body.feces_pending);
    p.body.feces_pending = 0;
  }
  advance_diseases(protected_life);
  collide_fish(old, protected_life);
  double maximum_displacement = 0;
  for (std::size_t i = 0; i < fish.size(); ++i)
    maximum_displacement =
        std::max(maximum_displacement,
                 std::hypot(field.delta_x(fish[i].body.x - old[i][0]), fish[i].body.y - old[i][1]));
  for (const auto &p : fish)
    if (p.body.hatched && p.body.motor_.impact_wound > 0) {
      const auto &b = p.body;
      combat_effect(0, 0, p.id, b.x, b.y, std::atan2(b.motor_.contact_y, b.motor_.contact_x),
                    body_radius(b), b.motor_.impact_wound);
    }
  std::vector<unsigned char> bitten(fish.size());
  bool grazed = false;
  for (std::size_t k = 0; k < fish.size(); ++k) {
    auto i = (k + ticks) % fish.size();
    auto &p = fish[i];
    auto &b = p.body;
    if (b.hatched && !hatched[i])
      record_hatch(p);
    bool alive = b.alive, fatal_impact = b.hatched && b.fatal_cause == 1;
    if (alive && b.hatched && b.age > b.hatch_age) {
      ++metrics_.window_exposure;
      ++metrics_.performance_total.exposure;
    }
    auto *species = taxonomy_.find(p.species);
    if (species && alive && b.hatched && b.age > b.hatch_age)
      ++species->diet_steps;
    if (p.observations_.neural_sampled && b.brain()) {
      HormoneMoments sample;
      sample.steps = 1;
      sample.level = b.hormones().levels();
      for (int k = 0; k < 4; ++k)
        sample.square[k] = sample.level[k] * sample.level[k];
      sample.secretion = b.hormones().secretion();
      sample.binding = b.hormones().binding();
      sample.net = b.hormones().integrated();
      sample.work = b.hormones().work();
      const auto learning = b.brain()->learning_summary();
      sample.learning_change = learning.change;
      sample.surprise = learning.surprise;
      sample.learning_cells = learning.cells;
      if ((ticks + p.id * 0x9e3779b97f4a7c15ULL) % 16 == 0) {
        const std::array<bool, 4> context{
            b.nutrition > p.observations_.hormone_nutrition_sample,
            (1 - b.health) > .1 || b.health < .75, b.motor().relative_speed > .75,
            gonad_filling(b) > .5 ||
                bounded_filling(b.reproduction().sperm_store, b.reproduction().sperm_limit) > .5 ||
                p.observations_.hormone_release_pending};
        p.observations_.hormone_release_pending = false;
        p.observations_.hormone_nutrition_sample = b.nutrition;
        for (int c = 0; c < 4; ++c) {
          const int side = context[c];
          sample.contexts[c].count[side] = 1;
          sample.contexts[c].level[side] = sample.level;
        }
      }
      p.observations_.hormones.add(sample);
      p.observations_.window_hormones.add(sample);
      if (species) {
        species->hormones.lifetime.add(sample);
        species->hormones.window.add(sample);
      }
    }
    // Neural work runs in parallel; species totals are collected here serially.
    if (species && p.observations_.habitat_sampled) {
      ++species->habitat_steps;
      for (int k = 0; k < 5; ++k)
        species->lifetime_habitat[k] += p.observations_.habitat_sample[k];
    }
    p.observations_.habitat_sampled = false;
    const double drift_before = p.observations_.drift_nutrition;
    double nutrition_before = b.nutrition;
    int prey = 0, carrion = 0;
    double food_nutrition = 0, animal_nutrition = 0;
    auto meal = feeding(i, old[i][0], old[i][1], protected_life, bitten, maximum_displacement);
    if (species && p.origin == 1 && nutrition_before <= 0 && b.nutrition > 0) {
      p.feeding_generations = std::min(2u, p.feeding_generations + 1);
      species->feeding_generations = std::max(species->feeding_generations, p.feeding_generations);
    }
    grazed = grazed || meal.plants;
    prey = meal.eggs;
    carrion = meal.corpses;
    food_nutrition = meal.nutrition[0];
    for (int kind = 0; kind < int(DIET_COUNT); ++kind) {
      p.observations_.raw_diet[kind] += meal.raw[kind];
      if (species)
        species->lifetime_raw_diet[kind] += meal.raw[kind];
      p.observations_.diet[kind] += meal.nutrition[kind];
      if (species)
        species->lifetime_diet[kind] += meal.nutrition[kind];
      p.observations_.window_diet[kind] += meal.nutrition[kind];
      metrics_.performance_total.diet[kind] += meal.nutrition[kind];
    }
    if (species)
      species->lifetime_digested += b.digestion;
    metrics_.performance_total.drift += p.observations_.drift_nutrition - drift_before;
    if (species)
      species->lifetime_drift += p.observations_.drift_nutrition - drift_before;
    animal_nutrition = meal.nutrition[1] + meal.nutrition[2] + meal.nutrition[3];
    for (int kind = 6; kind < 10; ++kind)
      animal_nutrition += meal.nutrition[kind];
    field.stir_sediment(b);
    // Foliage touches the body from the side where it lies, more firmly the more it covers.
    if (const auto leaves = field.foliage_contact(b.x, b.y, body_radius(b)); leaves.cover > 0) {
      const double touch = std::min(.5, .25 + .25 * leaves.cover);
      if (b.reproduction_.contact < touch) {
        b.reproduction_.contact = touch;
        b.motor_.contact_x = leaves.toward.x;
        b.motor_.contact_y = leaves.toward.y;
        record_touch(b, leaves.toward.x, leaves.toward.y, 0);
      }
    }
    collide_food(b, old[i][0], old[i][1]);
    metrics_.performance_total.food += food_nutrition;
    metrics_.performance_total.nutrition += b.nutrition - nutrition_before;
    metrics_.window_food_nutrition += food_nutrition;
    p.observations_.window_nutrition += b.nutrition - nutrition_before;
    p.observations_.window_prey_nutrition += animal_nutrition;
    p.observations_.window_corpses += carrion;
    p.observations_.window_eggs += prey;
    metrics_.window_nutrition += b.nutrition - nutrition_before;
    if (prey)
      b.hunger = 0;
    settle_energy(b, protected_life);
    if ((ticks + 1) % 100 == 0 || !b.alive)
      remember_breeder(p);
    if (alive && !b.alive && !p.nutrient_egg)
      record_death(p, fatal_impact, bitten[i]);
  }
  for (std::size_t i = 0; i < fish.size(); ++i) {
    auto &p = fish[i];
    if (bitten[i] && p.body.alive && p.body.health <= 0 && !protected_life) {
      settle_energy(p.body);
      remember_breeder(p);
      if (p.body.fatal_cause == 1)
        ++metrics_.predation_deaths;
      ++metrics_.deaths;
      ++metrics_.window_deaths;
      ++metrics_.window_adult_deaths;
      if (p.g >= 1)
        ++metrics_.performance_total.natural_deaths;
      if (p.g >= 2) {
        ++metrics_.performance_total.support_deaths;
        if (auto *s = taxonomy_.find(p.species))
          ++s->replacement_deaths;
      }
      p.death_cause = p.body.fatal_cause >= 0 ? p.body.fatal_cause : 1;
      ++metrics_.death_causes[p.death_cause];
    }
  }
  for (const auto &p : fish)
    if (p.id == watched_id && !p.body.alive) {
      watched_death = p.id;
      watched_cause = std::max(0, p.death_cause);
    }
  for (const auto &p : fish)
    if (!p.body.alive) {
      recent_deaths.emplace_back(p.id, p.genome);
      {
        auto &gene = recent_deaths.back().second;
        gene.blueprint.reset();
        gene.interface.reset();
        gene.growing.reset();
        gene.growth_query.reset();
      }
      recent_mortality.push_back({p.id, std::uint64_t(std::max(0, p.death_cause)), ticks + 1});
      if (recent_mortality.size() > 256)
        recent_mortality.pop_front();
      if (recent_deaths.size() > 256)
        recent_deaths.pop_front();
    }

  return grazed;
}
void Ecosystem::combat_effect(int kind, std::uint64_t source, std::uint64_t target, double x,
                              double y, double angle, double radius, double strength) {
  combat_effects.push_back(
      {next_combat_effect++, ticks + 1, source, target, kind, x, y, angle, radius, strength});
  if (combat_effects.size() > 64)
    combat_effects.pop_front();
}
void Ecosystem::record_death(Individual &p, bool fatal_impact, bool bitten) {
  auto &b = p.body;
  if (b.hatched) {
    ++metrics_.window_adult_deaths;
    if (p.g >= 1)
      ++metrics_.performance_total.natural_deaths;
    if (p.g >= 2) {
      ++metrics_.performance_total.support_deaths;
      if (auto *s = taxonomy_.find(p.species))
        ++s->replacement_deaths;
    }
  }
  if (fatal_impact) {
    if (bitten)
      ++metrics_.predation_deaths;
    else
      ++metrics_.collision_deaths;
  }
  ++metrics_.deaths;
  ++metrics_.window_deaths;
  metrics_.dead_window_best =
      std::max(metrics_.dead_window_best, 1000. * p.observations_.window_nutrition /
                                              std::max(1, p.observations_.window_steps));
  p.death_cause = b.hatched && b.fatal_cause >= 0                              ? b.fatal_cause
                  : p.genome.blueprint && p.genome.blueprint->resource_limited ? 4
                  : !p.developing()                                            ? 2
                  : fatal_impact                                               ? 1
                  : p.developing() && !b.hatched                               ? 3
                                                                               : 0;
  ++metrics_.death_causes[p.death_cause];
  if (!p.developing())
    ++metrics_.expired_eggs;
}

}
