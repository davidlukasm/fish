#include "ecology_internal.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "physiology.hh"
#include "movement.hh"
#include "stable_hash.hh"
#include <unordered_set>
namespace fishsim {
namespace {
constexpr std::size_t DEVELOPMENT_WORK_CHUNK = 16384;
constexpr std::size_t IMMIGRANT_SHARES = 8;
constexpr double WAKE_SHARE = .4, IMPACT_KEEP = .8;
constexpr double EGG_NEUTRAL_DENSITY = .75, EGG_BUOYANCY_GAIN = 2, EGG_BUOYANCY_LIMIT = .5,
                 EGG_RISE_SHARE = .8, EGG_DRIFT = .14256;
constexpr double SURFACE_GAP = habitat_zone::surface_gap, DARK_LIGHT = habitat_zone::dark_light,
                 STRONG_CURRENT = habitat_zone::strong_current,
                 BOTTOM_ZONE = habitat_zone::bottom_zone, TOP_ZONE = habitat_zone::top_zone;
constexpr double MOVING_SPEED = .05, CRUISING_SPEED = behavior_scale::cruising_speed;
constexpr std::uint64_t HORMONE_SAMPLE_PERIOD = 16;
constexpr double INJURED = .1, WEAKENED = .75, GONAD_HALF = .5;
constexpr double FOLIAGE_TOUCH_BASE = .1, FOLIAGE_TOUCH_GAIN = .2, FOLIAGE_TOUCH_MAX = .3;
constexpr std::size_t RECENT_RECORDS = 256;
}
void Ecosystem::develop_population() {
  std::vector<std::size_t> pending;
  for (std::size_t i = 0; i < fish.size(); ++i)
    if (fish[i].developing() && fish[i].body.alive && !fish[i].genome.blueprint)
      pending.push_back(i);
  const auto work_budget = std::size_t(evo.development_work);
  std::size_t budget = work_budget;
  bool prepared = false;
  auto develop_tier = [&](int priority, std::size_t &remaining) {
    std::vector<std::size_t> active;
    std::unordered_set<const field::Substrate *> shared;
    for (auto i : pending) {
      const auto &g = fish[i].genome;
      auto origin = fish[i].origin;
      int tier = origin == fish_origin::natural     ? 0
                 : origin == fish_origin::founder   ? 1
                 : origin == fish_origin::immigrant ? 2
                                                    : 3;
      if (tier == priority && !g.blueprint && (!g.growing || shared.insert(g.growing.get()).second))
        active.push_back(i);
    }
    std::sort(active.begin(), active.end(), [&](auto a, auto b) {
      return fish[a].born != fish[b].born ? fish[a].born < fish[b].born : fish[a].id < fish[b].id;
    });
    // Only runnable plans share the budget. Including every not-yet-admitted egg would shrink
    // each preparation slice as the queue grows, despite the single-start limit.
    bool can_start = !prepared;
    std::size_t runnable = 0;
    for (auto i : active) {
      if (!fish[i].genome.growing) {
        if (!can_start)
          continue;
        can_start = false;
      }
      active[runnable++] = i;
    }
    active.resize(runnable);
    for (std::size_t at = 0; at < active.size() && remaining; ++at) {
      auto &g = fish[active[at]].genome;
      // Older plans receive useful chunks; splitting a small budget among hundreds of plans
      // would open all their temporary structures together. Unused work passes to the next.
      auto share =
          std::min(remaining, std::max(DEVELOPMENT_WORK_CHUNK, remaining / (active.size() - at)));
      while (share && !g.blueprint) {
        if (!g.growing) {
          if (prepared)
            break;
          prepared = true;
        }
        auto before = g.pending_work();
        g.advance_development(share);
        auto used =
            g.blueprint ? g.blueprint->development_work() - before : g.pending_work() - before;
        remaining -= std::min(remaining, used);
        share -= std::min(share, used);
        if (!used && !g.blueprint && !(g.growing && g.growing->pending_finalization()))
          break;
      }
    }
  };
  std::size_t reserved =
      std::any_of(pending.begin(), pending.end(),
                  [&](auto i) { return fish[i].origin == fish_origin::immigrant; })
          ? work_budget / IMMIGRANT_SHARES
          : 0;
  std::size_t primary = budget - reserved;
  if (ticks % IMMIGRANT_SHARES == 0)
    develop_tier(2, reserved);
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
      g.advance_development(0);
  }
  auto storage = connection_storage(*this);
  for (auto i : pending)
    if (fish[i].genome.blueprint)
      storage -= planned_edges(fish[i].genome);
  for (auto i : pending) {
    auto &p = fish[i];
    if (!p.genome.blueprint)
      continue;
    const auto rows = planned_edges(p.genome);
    if (storage > neural_budget || rows > neural_budget - storage) {
      p.body.alive = false;
      p.body.fatal_cause = death_reason::brain_budget;
      ++metrics_.budget_rejections;
    } else
      storage += rows;
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
      visible.back().kind = p.body.hatched ? food_kind::fish : food_kind::egg;
      visible.back().source = i;
      visible.back().relative_speed = p.body.motor_.relative_speed;
      visible.back().flow_x = p.body.motor_.vx - p.body.motor_.water_vx +
                              WAKE_SHARE * p.body.motor_.thrust * std::cos(p.body.angle);
      visible.back().flow_y = p.body.motor_.vy - p.body.motor_.water_vy +
                              WAKE_SHARE * p.body.motor_.thrust * std::sin(p.body.angle);
    }
  }
  for (const auto &c : corpses) {
    auto color = remains_color(c, field.feeding().food_bright, field.env().decay_half_life,
                               field.env().bone_time);
    visible.push_back({c.x, c.y, 0, 0, false, true, color, 0, corpse_extent(c), food_kind::carrion,
                       std::size_t(&c - corpses.data())});
    if (!c.hatched) {
      visible.back().odor_channel = odor_kind::eggs;
      visible.back().odor_energy = c.energy * field.env().odor_freshness(corpse_decay_age(c)) *
                                   odor_maturity(c.age, field.env());
    }
  }
  std::vector<Field::OdorSource> odors;
  odors.reserve(corpses.size());
  for (const auto &c : corpses)
    if (c.hatched)
      odors.push_back({c.x, c.y,
                       c.energy * field.env().odor_freshness(corpse_decay_age(c)) *
                           odor_maturity(c.age, field.env())});
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
        const bool individual_protection = protected_life || b.immortal;
        old[i] = {b.x, b.y};
        p.observations_.neural_sampled = false;
        if (!b.alive)
          return;
        b.motor_.impact *= IMPACT_KEEP;
        if (!b.hatched) {
          size_egg(b);
          const double shell = collision_radius(b),
                       density = b.energy / std::max(tolerance::negligible,
                                                     EGG_ENERGY_PER_RADIUS2 * shell * shell),
                       material = std::clamp(EGG_BUOYANCY_GAIN * (density - EGG_NEUTRAL_DENSITY),
                                             -EGG_BUOYANCY_LIMIT, EGG_BUOYANCY_LIMIT);
          auto water = field.water().velocity(b.x, b.y),
               v = field.drift_velocity({b.motor_.vx, b.motor_.vy}, water,
                                        material > 0 ? EGG_RISE_SHARE * material : material,
                                        EGG_DRIFT);
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
          b.advance_age();
          b.ledger_.development_cost = 0;
          if (!b.immortal && b.age >= int(evo.fertilisation_wait)) {
            b.alive = false;
            p.death_cause = death_reason::unfertilised;
          }
          return;
        }
        if (!p.developing()) {
          b.advance_age();
          b.ledger_.development_cost = field::DevelopmentCosts{}.egg_basal;
          if (!individual_protection) {
            b.energy -= field::DevelopmentCosts{}.egg_basal;
            b.record_incubation(field::DevelopmentCosts{}.egg_basal);
          }
          return;
        }

        b.reproduction_.motor_reserve = maternal_reserve(b, evo.egg_reserve);
        b.reproduction_.egg_limit =
            ovary_capacity(b, p.genome, evo.egg_capacity, evo.egg_organ_capacity);
        b.reproduction_.sperm_limit =
            organ_capacity(b, p.genome, organ_port::sperm, physiology_.sperm_capacity);
        bool mature = b.hatched;
        b.reproduction_.egg_readiness =
            mature && p.genome.interface && p.genome.interface->motor_counts[organ_port::eggs] &&
                    (b.reproduction_.egg_yolk > 0 || b.energy > b.reproduction_.motor_reserve)
                ? 1
                : 0;
        b.reproduction_.sperm_readiness =
            mature && p.genome.interface && p.genome.interface->motor_counts[organ_port::sperm] &&
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
        advance_body(b, p.genome, &field, physiology_, individual_protection);
        p.observations_.hormone_release_pending |=
            b.reproduction().egg_release || b.reproduction().sperm_release;
        if (hatched[i] && !individual_protection) {
          harm_body(b, senescence_loss(b, physiology_), death_reason::age);
        }
        if (hatched[i] && b.hatched && b.age > b.hatch_age) {
          p.observations_.habitat_sampled = true;
          ++p.observations_.window_steps;
          ++p.observations_.habitat_steps;
          bool surface = field.surface_gap(b.x, b.y, body_radius(b)) <= SURFACE_GAP,
               grass = field.in_grass(b.x, b.y, body_radius(b));
          double illumination = field.light(b.x, b.y);
          p.observations_.window_surface += surface;
          p.observations_.window_grass += grass;
          ++p.observations_.ecology_steps;
          p.observations_.habitat_sample = {
              double(surface), double(grass),
              double(field.sediment_immersion(b.x, b.y, body_radius(b)) > field.env().burial_cover),
              double(illumination < DARK_LIGHT), illumination};
          for (std::size_t k = 0; k < habitat_column::count; ++k)
            p.observations_.habitat_totals[k] += p.observations_.habitat_sample[k];
          p.observations_.window_turbidity += std::min(1., field.turbidity(b.x, b.y));
          p.observations_.window_current +=
              std::min(1., std::hypot(b.motor_.water_vx, b.motor_.water_vy) / STRONG_CURRENT);
          p.observations_.bottom_steps += b.y > field.geometry().height * BOTTOM_ZONE;
          p.observations_.top_steps += b.y < field.geometry().height * TOP_ZONE;
          p.observations_.window_mouth += std::clamp(b.eat_signal, 0., 1.);
          p.observations_.window_bottom += b.y > field.geometry().height * BOTTOM_ZONE;
          p.observations_.window_top += b.y < field.geometry().height * TOP_ZONE;
          p.observations_.window_pulses += std::abs(b.motor_.thrust) >= MIN_SWIMMING_PULSE;
          p.observations_.window_glides += std::abs(b.motor_.thrust) < MIN_SWIMMING_PULSE &&
                                           b.motor_.relative_speed > MOVING_SPEED;
          for (std::size_t k = 0; k < b.color.size(); ++k)
            p.observations_.window_traits[window_trait::color + k] += b.color[k];
          p.observations_.window_traits[window_trait::aggression] += b.motor_.aggression;
          p.observations_.window_traits[window_trait::defense] +=
              b.motor_.defense / MAX_SPINE_EXTENT;
          int cx = std::clamp(int(b.x / field.geometry().width * VISIT_GRID), 0, VISIT_GRID - 1),
              cy = std::clamp(int(b.y / field.geometry().height * VISIT_GRID), 0, VISIT_GRID - 1);
          if (b.motor_.relative_speed > MOVING_SPEED)
            p.observations_.visited |= std::uint64_t(1) << (cy * VISIT_GRID + cx);
          p.observations_.window_travel += b.motor_.relative_speed;
          p.observations_.window_turn += std::abs(b.motor_.turn);
          p.observations_.window_pauses += b.motor_.relative_speed < CRUISING_SPEED;
        }
      },
      neural_work);
}
bool Ecosystem::resolve_population(const std::vector<std::array<double, 2>> &old,
                                   const std::vector<unsigned char> &hatched, bool protected_life) {
  for (auto &p : fish)
    field.release_feces(p.body);
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
      combat_effect(feeding_effect::none, 0, p.id, b.x, b.y,
                    std::atan2(b.motor_.contact_y, b.motor_.contact_x), body_radius(b),
                    b.motor_.impact_wound);
    }
  std::vector<unsigned char> bitten(fish.size());
  bool grazed = false;
  for (std::size_t k = 0; k < fish.size(); ++k) {
    auto i = (k + ticks) % fish.size();
    auto &p = fish[i];
    auto &b = p.body;
    if (b.hatched && !hatched[i])
      record_hatch(p);
    bool alive = b.alive, fatal_impact = b.hatched && b.fatal_cause == death_reason::injury;
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
      for (int k = 0; k < field::HORMONES; ++k)
        sample.square[k] = sample.level[k] * sample.level[k];
      sample.secretion = b.hormones().secretion();
      sample.binding = b.hormones().binding();
      sample.net = b.hormones().integrated();
      sample.work = b.hormones().work();
      const auto learning = b.brain()->learning_summary();
      sample.learning_change = learning.change;
      sample.surprise = learning.surprise;
      sample.learning_cells = learning.cells;
      if ((ticks + p.id * SPLITMIX_GAMMA) % HORMONE_SAMPLE_PERIOD == 0) {
        const std::array<bool, hormone_context::count> context{
            b.nutrition > p.observations_.hormone_nutrition_sample,
            (1 - b.health) > INJURED || b.health<WEAKENED, b.motor().relative_speed> CRUISING_SPEED,
            gonad_filling(b) > GONAD_HALF ||
                bounded_filling(b.reproduction().sperm_store, b.reproduction().sperm_limit) >
                    GONAD_HALF ||
                p.observations_.hormone_release_pending};
        p.observations_.hormone_release_pending = false;
        p.observations_.hormone_nutrition_sample = b.nutrition;
        for (std::size_t c = 0; c < context.size(); ++c) {
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
    if (species && p.observations_.habitat_sampled) {
      ++species->habitat_steps;
      for (std::size_t k = 0; k < habitat_column::count; ++k)
        species->lifetime_habitat[k] += p.observations_.habitat_sample[k];
    }
    p.observations_.habitat_sampled = false;
    const double drift_before = p.observations_.drift_nutrition;
    double nutrition_before = b.nutrition;
    int prey = 0, carrion = 0;
    double food_nutrition = 0, animal_nutrition = 0;
    auto meal = feeding(i, old[i][0], old[i][1], protected_life, bitten, maximum_displacement);
    if (species && p.origin == fish_origin::natural && !p.assisted && nutrition_before <= 0 &&
        b.nutrition > 0) {
      p.feeding_generations = std::min(PROTECTED_GENERATIONS, p.feeding_generations + 1);
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
    animal_nutrition = meal.nutrition[food_kind::fish] + meal.nutrition[food_kind::egg] +
                       meal.nutrition[food_kind::carrion];
    for (int kind = food_kind::plankton; kind <= food_kind::mussel; ++kind)
      animal_nutrition += meal.nutrition[kind];
    field.stir_sediment(b);
    if (const auto leaves = field.foliage_contact(b.x, b.y, body_radius(b)); leaves.cover > 0) {
      const double touch =
          std::min(FOLIAGE_TOUCH_MAX, FOLIAGE_TOUCH_BASE + FOLIAGE_TOUCH_GAIN * leaves.cover);
      if (b.reproduction_.contact < touch) {
        b.reproduction_.contact = touch;
        b.motor_.contact_x = leaves.toward.x;
        b.motor_.contact_y = leaves.toward.y;
        record_touch(b, leaves.toward.x, leaves.toward.y, 0);
      }
    }
    // The lips feel a leaf within biting reach, so a grazer can tell when a bite will close on
    // a plant.
    const double lip_x = field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                 lip_y = b.y + mouth_offset(b) * std::sin(b.angle);
    if (field.foliage_contact(lip_x, lip_y, mouth_reach(b)).cover > 0)
      record_touch(b, std::cos(b.angle), std::sin(b.angle), 0);
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
    const double supplied = b.supplied_energy(), withdrawn = b.withdrawn_energy();
    settle_energy(b, protected_life);
    field.record_external_exchange(b.supplied_energy() - supplied,
                                   b.withdrawn_energy() - withdrawn);
    if ((ticks + 1) % SAMPLE_PERIOD == 0 || !b.alive)
      remember_breeder(p);
    if (alive && !b.alive && !p.nutrient_egg)
      record_death(p, fatal_impact, bitten[i]);
  }
  for (std::size_t i = 0; i < fish.size(); ++i) {
    auto &p = fish[i];
    if (bitten[i] && p.body.alive && p.body.health <= 0 && !protected_life && !p.body.immortal) {
      const double supplied = p.body.supplied_energy(), withdrawn = p.body.withdrawn_energy();
      settle_energy(p.body);
      field.record_external_exchange(p.body.supplied_energy() - supplied,
                                     p.body.withdrawn_energy() - withdrawn);
      remember_breeder(p);
      if (p.body.fatal_cause == death_reason::injury)
        ++metrics_.predation_deaths;
      ++metrics_.deaths;
      ++metrics_.window_deaths;
      ++metrics_.window_adult_deaths;
      if (p.g >= NATURAL_GENERATION)
        ++metrics_.performance_total.natural_deaths;
      if (p.g >= SUPPORT_GENERATION) {
        ++metrics_.performance_total.support_deaths;
        if (auto *s = taxonomy_.find(p.species))
          ++s->replacement_deaths;
      }
      p.death_cause = p.body.fatal_cause >= 0 ? p.body.fatal_cause : death_reason::injury;
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
      if (p.remembered && !p.nutrient_egg &&
          std::none_of(remembered_dead.begin(), remembered_dead.end(),
                       [&](const Individual &q) { return q.id == p.id; })) {
        remembered_dead.push_back(p);
        auto &body = remembered_dead.back().body;
        body.energy = std::max(0., p.body.energy);
        body.reproduction_.egg_laying = false;
      }
      recent_deaths.emplace_back(p.id, p.genome);
      {
        auto &gene = recent_deaths.back().second;
        gene.blueprint.reset();
        gene.interface.reset();
        gene.growing.reset();
        gene.growth_query.reset();
      }
      std::array<std::uint64_t, death_record_column::count> death{};
      death[death_record_column::id] = p.id;
      death[death_record_column::cause] = std::uint64_t(std::max(0, p.death_cause));
      death[death_record_column::step] = ticks + 1;
      recent_mortality.push_back(death);
      if (recent_mortality.size() > RECENT_RECORDS)
        recent_mortality.pop_front();
      if (recent_deaths.size() > RECENT_RECORDS)
        recent_deaths.pop_front();
    }

  return grazed;
}
void Ecosystem::combat_effect(int kind, std::uint64_t source, std::uint64_t target, double x,
                              double y, double angle, double radius, double strength) {
  combat_effects.push_back(
      {next_combat_effect++, ticks + 1, source, target, kind, x, y, angle, radius, strength});
  if (combat_effects.size() > MAX_COMBAT_EFFECTS)
    combat_effects.pop_front();
}
void Ecosystem::record_death(Individual &p, bool fatal_impact, bool bitten) {
  auto &b = p.body;
  if (b.hatched) {
    ++metrics_.window_adult_deaths;
    if (p.g >= NATURAL_GENERATION)
      ++metrics_.performance_total.natural_deaths;
    if (p.g >= SUPPORT_GENERATION) {
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
      std::max(metrics_.dead_window_best, rate_window::steps * p.observations_.window_nutrition /
                                              std::max(1, p.observations_.window_steps));
  p.death_cause = b.hatched && b.fatal_cause >= 0 ? b.fatal_cause
                  : p.genome.blueprint && p.genome.blueprint->resource_limited
                      ? death_reason::brain_budget
                  : !p.developing()              ? death_reason::unfertilised
                  : fatal_impact                 ? death_reason::injury
                  : p.developing() && !b.hatched ? death_reason::failed_development
                                                 : death_reason::hunger;
  ++metrics_.death_causes[p.death_cause];
  if (!p.developing())
    ++metrics_.expired_eggs;
}

}
