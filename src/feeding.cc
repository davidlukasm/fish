#include "ecology_internal.hh"
#include "physiology.hh"
#include "perception.hh"
#include "plants.hh"
namespace fishsim {
namespace {
// A flesh bite takes FLESH_BITE tissue per doubled bite force at body scale 1, at most a quarter
// of the prey (FLESH_SHARE); a smaller eater still counts as a quarter of the prey's mass. The
// wound is measured in the same unit. A bite of LETHAL_BITE_SHARE of the tissue kills.
constexpr double FLESH_BITE = 3, FLESH_SHARE = .25, FLESH_MIN_MASS_RATIO = .25,
                 LETHAL_BITE_SHARE = .2;
// Loose pieces keep most of their source's motion and take a quarter of the eater's.
constexpr double FRAGMENT_INERTIA = .75;
// A food piece whose rest would fall below half the crumb limit is taken whole.
constexpr double CRUMB_REST_SHARE = .5;
// Carrion sinks; other loose pieces float neutrally.
constexpr double CARRION_BUOYANCY = 1.2, NEUTRAL_BUOYANCY = 1;
// Sucked items move at least SUCTION_MIN_STEP per step, by SUCTION_PULL of the reach times the
// flow, and arrive within ARRIVAL_SHARE of the gape.
constexpr double SUCTION_MIN_STEP = .15, SUCTION_PULL = .5, ARRIVAL_SHARE = .35;
// Feeding effects last feeding_effect_steps; at most Ecosystem::MAX_COMBAT_EFFECTS are kept.
constexpr Color EFFECT_COLOR{1, 0, 0};
}
FleshBite sever_flesh(Body &eater, Body &prey, double wound, bool protected_life) {
  if (protected_life || prey.immortal || !eater.alive || !prey.alive || !eater.hatched ||
      !prey.hatched || eater.health <= 0 || prey.health <= 0 || eater.bite_signal <= 0 ||
      eater.bite_strength <= 0 || prey.tissue <= 0)
    return {};
  const double factor = MOUTH_FORCE_GAIN * bite_force(eater);
  const double tissue = prey.tissue, reserve = std::max(0., prey.energy),
               radius = body_radius(prey), gape = bite_radius(eater);
  const double maximum = FLESH_BITE * body_scale(eater) * factor *
                         std::max(FLESH_MIN_MASS_RATIO, body_mass(eater) / body_mass(prey));
  const double requested = std::min(
                   {maximum, FLESH_SHARE * tissue, tissue * gape * gape / (radius * radius)}),
               damage = wound * requested / FLESH_BITE * BODY_TISSUE / tissue;
  // Spines facing the bite block it; holding them costs the prey energy.
  const double bearing = std::atan2(eater.y - prey.y, eater.x - prey.x),
               spines = prey.local_defense(bearing),
               cost = PhysiologyParameters::spine_block_cost * BODY_TISSUE * damage * spines,
               defense_paid = pay_activity(prey, cost),
               blocked = cost > 0 ? spines * defense_paid / cost : 0;
  prey.peak_tissue = std::max(prey.peak_tissue, tissue);
  const double lost = requested * (1 - blocked),
               energy = std::min(std::max(0., prey.energy), reserve * lost / tissue);
  prey.tissue -= lost;
  prey.energy -= energy;
  harm_body(prey, wound * lost / FLESH_BITE * BODY_TISSUE / tissue, death_reason::injury, bearing);
  if (prey.tissue <= tissue_floor(prey) || lost >= LETHAL_BITE_SHARE * tissue) {
    harm_body(prey, prey.health, death_reason::injury);
    if (prey.fatal_cause < 0)
      prey.fatal_cause = death_reason::injury;
  }
  return {lost, lost + energy};
}
class Ecosystem::FeedingSession {
  Ecosystem &world;
  const std::size_t index;
  const double old_x, old_y, body_displacement;
  const bool protected_life;
  std::vector<unsigned char> &bitten;
  Individual &p;
  Body &b;
  FeedingResult result;
  double mx = 0, my = 0, gape = 0;
  struct Target {
    int kind;
    std::size_t id;
    double distance;
  };

  bool reaches(double x, double y, double radius) {
    return bite_reaches(b, world.field, old_x, old_y, x, y, radius);
  }
  void kill_egg(Individual &q) {
    if (q.body.immortal)
      return;
    q.body.alive = false;
    q.death_cause = death_reason::eaten_egg;
    if (!q.nutrient_egg) {
      ++world.metrics_.deaths;
      ++world.metrics_.window_deaths;
      ++world.metrics_.death_causes[death_reason::eaten_egg];
    }
  }
  void count_egg() {
    ++result.eggs;
    ++b.eggs_eaten;
    ++world.metrics_.eggs_eaten;
  }
  void fragment(double x, double y, double radius, double source_radius, double vx, double vy,
                double amount, int origin, Color color, double age, double buoyancy,
                bool drift = false, double physical_age = -1, double hardness = 0,
                bool blunt = false) {
    if (amount <= 0)
      return;
    // Cracked shellfish leaves loose meat; every other fitting bite goes straight into the gut.
    if (origin != food_kind::crab && origin != food_kind::mussel &&
        radius <= maximum_mouth_aperture(b)) {
      const double eaten = std::min(amount, gut_room(b, origin, world.physiology_));
      if (eaten > 0) {
        ingest(eaten, origin);
        radius *= std::sqrt((amount - eaten) / amount);
        amount -= eaten;
      }
      if (amount <= tolerance::negligible)
        return;
    }
    double dx = world.field.delta_x(mx - x), dy = my - y, d = std::hypot(dx, dy);
    if (d > 0) {
      x = world.field.wrap_x(x + dx / d * std::max(0., source_radius - radius));
      y += dy / d * std::max(0., source_radius - radius);
    }
    Body shape{};
    shape.x = x;
    shape.y = y;
    world.field.collide(shape, mx, my, radius);
    Food piece{shape.x,
               shape.y,
               FRAGMENT_INERTIA * vx + (1 - FRAGMENT_INERTIA) * b.motor_.vx,
               FRAGMENT_INERTIA * vy + (1 - FRAGMENT_INERTIA) * b.motor_.vy,
               0,
               amount};
    piece.origin = origin;
    piece.radius = radius;
    piece.initial_energy = amount;
    piece.decay_age = age;
    piece.age = std::uint64_t(std::max(0., physical_age < 0 ? age : physical_age));
    piece.color = color;
    piece.buoyancy = buoyancy;
    piece.drift_plant = drift;
    piece.hardness = hardness;
    piece.blunt = blunt;
    piece.bitten = true;
    world.field.append_fragment(piece);
  }
  void effect(int kind, double x, double y, double radius, double amount, std::uint64_t target = 0,
              Color color = EFFECT_COLOR) {
    b.feeding_action = kind;
    b.feeding_action_age = feeding_effect_steps::full;
    world.combat_effects.push_back({world.next_combat_effect++, world.ticks + 1, p.id, target, kind,
                                    x, y, b.angle, radius, amount, color});
  }
  double ingest(double raw, int origin) {
    const double accepted = take_nutrition(b, raw, origin, world.physiology_),
                 usable = accepted * digestibility(b, origin);
    b.mouth.swallowed += accepted;
    if (origin == food_kind::plankton)
      b.mouth.filtered += accepted;
    result.raw[origin] += accepted;
    result.nutrition[origin] += usable;
    if (origin != food_kind::feed)
      world.field.record_nature(usable);
    return usable;
  }
  void bite() {
    const bool buried =
        world.field.sediment_immersion(mx, my, gape) >= world.field.env().burial_cover;
    int kind = -1;
    std::size_t target = 0;
    double best = std::numeric_limits<double>::infinity();
    auto candidate = [&](int k, std::size_t id, double x, double y, double radius) {
      if (!reaches(x, y, radius))
        return;
      double d = std::max(0., std::hypot(world.field.delta_x(x - mx), y - my) - radius);
      if (d < best || (d == best && (k < kind || (k == kind && id < target)))) {
        best = d;
        kind = k;
        target = id;
      }
    };
    const double reach =
        body_radius(b) + mouth_reach(b) + std::hypot(world.field.delta_x(b.x - old_x), b.y - old_y);
    world.field.vegetation().plant_grid.nearby(
        mx, my, reach + world.field.vegetation().indexed_plant_radius, [&](std::uint32_t j) {
          const auto &q = world.field.vegetation().plants[j];
          if (q.energy <= 0)
            return;
          if (q.kind != food_kind::plant) {
            candidate(q.kind, j, q.x, q.y, q.radius);
            return;
          }
          // A stroke is reached at its point nearest to the mouth.
          const double s = stroke_closest(q.hx, q.hy, world.field.delta_x(mx - q.x), my - q.y);
          candidate(food_kind::plant, j, world.field.wrap_x(q.x + s * q.hx), q.y + s * q.hy,
                    stroke_width(q));
        });
    world.field.feeding().grid.nearby(
        mx, my, reach + world.field.feeding().indexed_food_radius, [&](std::uint32_t j) {
          if (!world.field.feeding().consumed[j] && world.field.feeding().pieces[j].energy > 0) {
            const auto &q = world.field.feeding().pieces[j];
            candidate(food_kind::feed, j, q.x, q.y, food_radius(q));
          }
        });
    world.field.body_grid().nearby(
        mx, my, reach + world.field.indexed_body_radius() + body_displacement,
        [&](std::uint32_t j) {
          const auto &o = world.field.visible()[j];
          if (o.kind >= food_kind::worm && o.kind <= food_kind::mussel &&
              (!o.hidden || (o.kind == food_kind::crab && buried))) {
            candidate(o.kind, o.source, o.x, o.y, o.radius);
          } else if (o.kind == food_kind::fish || o.kind == food_kind::egg) {
            const auto &q = world.fish[o.source];
            if (o.source != index && !q.body.immortal && q.body.alive && q.body.health > 0 &&
                (o.kind != food_kind::fish || !protected_life))
              candidate(o.kind, o.source, q.body.x, q.body.y,
                        collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1));
          } else if (o.kind == food_kind::carrion && o.source < world.corpses.size() &&
                     world.corpses[o.source].energy > 0) {
            const auto &q = world.corpses[o.source];
            candidate(food_kind::carrion, o.source, q.x, q.y, corpse_extent(q));
          }
        });
    if (buried) {
      for (std::size_t j = 0; j < world.field.food_web().crabs.size(); ++j) {
        const auto &c = world.field.food_web().crabs[j];
        if (c.state == crab_state::buried && c.energy > 0 &&
            reaches(c.x, c.y, crab_radius(c.energy, world.field.env(), c.morph))) {
          kind = food_kind::crab;
          target = j;
          break;
        }
      }
      if (kind != food_kind::crab) {
        const double force = bite_force(b);
        if (world.rng.uniform() <
            crack_success(force, world.field.env().hardness_leaf, world.field.env())) {
          const double amount = world.field.grip_worm(
              mx, my, gape,
              std::min(world.field.env().worm_head_energy * bite_share(b, worm_head_radius),
                       gut_room(b, food_kind::worm, world.physiology_)));
          if (amount > 0) {
            fragment(mx, my, food_radius(amount), gape, 0, 0, amount, food_kind::worm,
                     WORM_FLESH_COLOR, 0, NEUTRAL_BUOYANCY);
            effect(feeding_effect::bite, mx, my, worm_head_radius, amount);
          }
        }
        return;
      }
    }
    const double morsel = bite_radius(b);
    if (kind == food_kind::fish) {
      auto &q = world.fish[target];
      const double before = q.body.tissue, radius = body_radius(q.body), health = q.body.health;
      const auto cut = sever_flesh(b, q.body, world.physiology_.bite_wound, protected_life);
      if (cut.energy > 0) {
        fragment(q.body.x, q.body.y, radius * std::sqrt(cut.tissue / before), radius,
                 q.body.motor_.vx, q.body.motor_.vy, cut.energy, food_kind::fish, q.body.color, 0,
                 NEUTRAL_BUOYANCY);
        b.feeding_action = feeding_effect::bite;
        b.feeding_action_age = feeding_effect_steps::full;
        ++world.metrics_.fish_bites;
        const double loss = health - q.body.health;
        q.body.motor_.blood_loss += loss;
        double dx = world.field.delta_x(b.x - q.body.x), dy = b.y - q.body.y,
               d = std::hypot(dx, dy);
        if (d > 0) {
          q.body.motor_.blood_x = dx / d;
          q.body.motor_.blood_y = dy / d;
        }
        world.combat_effects.push_back({world.next_combat_effect++, world.ticks + 1, p.id, q.id,
                                        feeding_effect::wound, q.body.x, q.body.y,
                                        std::atan2(dy, dx), radius, cut.tissue / FLESH_BITE});
        if (q.body.health <= 0)
          bitten[target] = 1;
      }
    } else if (kind == food_kind::egg) {
      // An egg is one morsel: its embryo and remaining yolk. A bite never divides it; an egg too
      // large for the mouth or the gut stays where it is.
      auto &q = world.fish[target];
      const double amount = stored_energy(q.body), radius = collision_radius(q.body);
      if (amount > 0 && radius <= maximum_mouth_aperture(b) &&
          amount <= gut_room(b, food_kind::egg, world.physiology_) + tolerance::negligible) {
        empty_stores(q.body);
        kill_egg(q);
        ingest(amount, food_kind::egg);
        count_egg();
        effect(feeding_effect::bite, q.body.x, q.body.y, radius, amount);
      }
    } else if (kind == food_kind::carrion) {
      auto &q = world.corpses[target];
      const double before = q.energy, radius = corpse_extent(q),
                   amount = before * bite_share(b, radius);
      q.energy -= amount;
      fragment(q.x, q.y, radius * std::sqrt(amount / std::max(.01, before)), radius, q.vx, q.vy,
               amount, q.hatched ? food_kind::carrion : food_kind::egg, q.color,
               corpse_decay_age(q), CARRION_BUOYANCY);
      if (amount > 0)
        effect(feeding_effect::bite, q.x, q.y, morsel, amount);
    } else if (kind == food_kind::feed) {
      auto q = world.field.feeding().pieces[target];
      const double force = bite_force(b, q.blunt),
                   efficiency = crack_success(force, q.hardness, world.field.env()),
                   radius = food_radius(q);
      double amount = q.energy * bite_share(b, radius) * efficiency;
      if (amount > 0 && q.energy - amount < CRUMB_REST_SHARE * world.field.env().crumb_min &&
          radius <= morsel)
        amount = q.energy;
      world.field.bite_food(target, amount, true);
      fragment(q.x, q.y, radius * std::sqrt(amount / q.energy), radius, q.vx, q.vy, amount,
               q.origin, q.color, q.decay_age, q.buoyancy, q.drift_plant, double(q.age), q.hardness,
               q.blunt);
      if (amount > 0)
        effect(feeding_effect::bite, q.x, q.y, morsel, amount);
    } else if (kind == food_kind::worm) {
      // A bite tears a piece off the head; the rest withdraws into the bed.
      const double force = bite_force(b);
      if (world.rng.uniform() <
          crack_success(force, world.field.env().hardness_leaf, world.field.env()))
        if (auto meal = world.field.take_small_animal(food_kind::worm, target, force, true, false,
                                                      world.field.food_web().heads[target].energy *
                                                          bite_share(b, worm_head_radius))) {
          fragment(meal->x, meal->y, food_radius(meal->energy), meal->radius, 0, 0, meal->energy,
                   food_kind::worm, meal->color, 0, 1);
          effect(feeding_effect::bite, meal->x, meal->y, meal->radius, meal->energy);
        }
    } else if (kind == food_kind::crab || kind == food_kind::mussel) {
      const double force = bite_force(b, true);
      if (auto meal = world.field.take_small_animal(kind, target, force, true, buried)) {
        world.field.scatter_fragments(*meal, force);
        effect(feeding_effect::crack, meal->x, meal->y, meal->radius, meal->energy);
      } else if (kind == food_kind::crab && !buried && !protected_life) {
        const auto &c = world.field.food_web().crabs[target];
        const double damage =
            world.field.env().crab_pinch *
            std::clamp(c.energy / crab_capacity(c.morph, world.field.env()), 0., 1.);
        harm_body(b, damage, death_reason::injury);
        effect(feeding_effect::pinch, b.x, b.y, body_radius(b), damage, p.id);
      } else if (kind == food_kind::mussel) {
        const auto &m = world.field.food_web().mussels[target];
        effect(feeding_effect::shell_closed, m.x, m.y,
               mussel_radius(m.energy, world.field.env(), m.morph), 0);
      }
    } else if (kind == food_kind::algae || kind == food_kind::plant) {
      const auto &part = world.field.vegetation().plants[target];
      const auto &source = world.field.plant_source(part.patch);
      const bool hard =
          part.kind == food_kind::plant && (part.organ < 0 || source.organs[part.organ].kind <= 1);
      const double radius = part.kind == food_kind::plant ? stroke_width(part) : part.radius,
                   s = part.kind == food_kind::plant
                           ? stroke_closest(part.hx, part.hy, world.field.delta_x(mx - part.x),
                                            my - part.y)
                           : 0,
                   // The organ normal (-hy, hx) points to side +1, as in the drawing.
          side = part.kind == food_kind::plant &&
                         -part.hy * world.field.delta_x(mx - part.x - s * part.hx) +
                                 part.hx * (my - part.y - s * part.hy) <
                             0
                     ? -1.
                     : 1.;
      if (auto piece = world.bite_plant(b, target, s, side)) {
        fragment(piece->x, piece->y, piece->radius, radius, piece->vx, piece->vy, piece->energy,
                 piece->origin, piece->color, 0, piece->buoyancy, piece->drift_plant, -1,
                 piece->hardness, piece->blunt);
        result.plants = true;
        effect(hard ? feeding_effect::crack : feeding_effect::bite, piece->x, piece->y,
               piece->radius, piece->energy, 0, piece->color);
      }
    }
  }
  std::vector<Target> candidates(double area) {
    const double suction = mouth_reach(b) * world.physiology_.suction_range;
    std::vector<Target> targets;
    auto candidate = [&](int kind, std::size_t id, double x, double y, double radius) {
      const double swallowed_radius = radius;
      if (fits_mouth(b, swallowed_radius) && swallowed_radius * swallowed_radius <= area &&
          bite_reaches(b, world.field, old_x, old_y, x, y, radius, suction))
        targets.push_back(
            {kind, id, std::max(0., std::hypot(world.field.delta_x(x - mx), y - my) - radius)});
    };
    const double reach = suction + gape + std::hypot(world.field.delta_x(b.x - old_x), b.y - old_y);
    world.field.feeding().grid.nearby(mx, my, reach, [&](std::uint32_t j) {
      if (!world.field.feeding().consumed[j] && world.field.feeding().pieces[j].energy > 0) {
        const auto &q = world.field.feeding().pieces[j];
        candidate(food_kind::feed, j, q.x, q.y, food_radius(q));
      }
    });
    // Suction removes a thin flake from soft algae; stems and leaves still require a bite.
    world.field.vegetation().plant_grid.nearby(
        mx, my, reach + world.field.vegetation().indexed_plant_radius, [&](std::uint32_t j) {
          const auto &q = world.field.vegetation().plants[j];
          if (q.kind == food_kind::algae && q.energy > 0)
            candidate(food_kind::algae, j, q.x, q.y, std::min(ALGAE_FLAKE_RADIUS, q.radius));
        });
    world.field.body_grid().nearby(mx, my, reach + body_displacement, [&](std::uint32_t j) {
      const auto &o = world.field.visible()[j];
      if (o.kind == food_kind::fish || o.kind == food_kind::egg) {
        const auto &q = world.fish[o.source];
        if (o.source == index || q.body.immortal || !q.body.alive || q.body.health <= 0 ||
            (o.kind == food_kind::fish && protected_life))
          return;
        candidate(o.kind, o.source, q.body.x, q.body.y,
                  collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1));
      } else if (o.kind == food_kind::carrion && o.source < world.corpses.size()) {
        const auto &q = world.corpses[o.source];
        if (q.energy > 0)
          candidate(food_kind::carrion, o.source, q.x, q.y, corpse_extent(q));
      }
    });
    std::stable_sort(targets.begin(), targets.end(),
                     [](const auto &a, const auto &c) { return a.distance < c.distance; });

    return targets;
  }
  void swallow(const Target &target, double &area) {
    double raw = 0, radius = 0, age = 0;
    int origin = food_kind::feed;
    bool drift = false;
    Color color{};
    double x = 0, y = 0;
    if (target.kind == food_kind::feed) {
      const auto &q = world.field.feeding().pieces[target.id];
      if (world.field.feeding().consumed[target.id] || q.energy <= 0)
        return;
      raw = q.energy;
      radius = food_radius(q);
      origin = q.origin;
      age = q.decay_age;
      drift = q.drift_plant;
      color = q.color;
      x = q.x;
      y = q.y;
    } else if (target.kind == food_kind::fish || target.kind == food_kind::egg) {
      const auto &q = world.fish[target.id];
      if (!q.body.alive || q.body.health <= 0)
        return;
      raw = stored_energy(q.body);
      radius = collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1);
      origin = target.kind;
      color = q.body.color;
      x = q.body.x;
      y = q.body.y;
    } else if (target.kind == food_kind::algae) {
      const auto &q = world.field.vegetation().plants[target.id];
      const auto &source = world.field.plant_source(q.patch);
      radius = std::min(ALGAE_FLAKE_RADIUS, q.radius);
      const double thickness = 2 * q.radius, density = world.field.algae_surface_density(source);
      raw = std::min({q.energy, source.algae, gut_room(b, food_kind::algae, world.physiology_),
                      scraped_algae(density, thickness, scrape_force(b), world.field.env()) *
                          std::min(1., area / std::max(.01, radius * radius))});
      origin = food_kind::algae;
      color = ALGAE_COLOR;
      x = q.x;
      y = q.y;
      if (raw <= 0)
        return;
    } else {
      const auto &q = world.corpses[target.id];
      if (q.energy <= 0)
        return;
      raw = q.energy;
      radius = corpse_extent(q);
      origin = q.hatched ? food_kind::carrion : food_kind::egg;
      age = corpse_decay_age(q);
      color = q.color;
      x = q.x;
      y = q.y;
    }
    const double free = gut_room(b, origin, world.physiology_);
    if (radius * radius > area + tolerance::negligible || raw > free + tolerance::negligible)
      return;
    if (target.kind == food_kind::fish || target.kind == food_kind::egg ||
        target.kind == food_kind::carrion) {
      const double dx = world.field.delta_x(mx - x), dy = my - y, distance = std::hypot(dx, dy),
                   arrival = std::max(SUCTION_MIN_STEP, gape * ARRIVAL_SHARE),
                   travel =
                       std::min(distance, std::max(SUCTION_MIN_STEP,
                                                   mouth_reach(b) * b.mouth.flow * SUCTION_PULL));
      if (distance > arrival) {
        if (world.field.ray(x, y, dx / distance, dy / distance) < travel - radius)
          return;
        const double nx = world.field.wrap_x(x + dx / distance * travel),
                     ny = y + dy / distance * travel;
        if (target.kind == food_kind::carrion) {
          world.corpses[target.id].x = nx;
          world.corpses[target.id].y = ny;
        } else {
          world.fish[target.id].body.x = nx;
          world.fish[target.id].body.y = ny;
        }
        if (distance - travel > arrival)
          return;
      }
    }
    if (target.kind == food_kind::feed) {
      if (!world.field.draw_food(
              target.id, mx, my,
              std::max(SUCTION_MIN_STEP, mouth_reach(b) * b.mouth.flow * SUCTION_PULL),
              std::max(SUCTION_MIN_STEP, gape * ARRIVAL_SHARE)))
        return;
      world.field.consume_food(target.id);
    } else if (target.kind == food_kind::fish || target.kind == food_kind::egg) {
      auto &q = world.fish[target.id];
      empty_stores(q.body);
      if (target.kind == food_kind::fish) {
        harm_body(q.body, q.body.health, death_reason::injury);
        if (q.body.fatal_cause < 0)
          q.body.fatal_cause = death_reason::injury;
        bitten[target.id] = 1;
      } else
        kill_egg(q);
    } else if (target.kind == food_kind::algae) {
      world.field.consume_algae(target.id, raw);
      result.plants = true;
    } else
      world.corpses[target.id].energy = 0;
    const double accepted = ingest(raw, origin);
    area -= radius * radius;
    if (origin == food_kind::feed) {
      ++p.observations_.window_food;
      ++b.eaten;
      const double chance = world.disease_food_chance(
          target.kind == food_kind::feed ? double(world.field.feeding().pieces[target.id].age)
                                         : age);
      if (!protected_life && !b.disease && chance > 0 && world.rng.uniform() < chance)
        world.infect(b, infection_source::food);
    } else if (origin <= food_kind::carrion) {
      if (origin == food_kind::carrion) {
        ++result.corpses;
        ++world.metrics_.corpses_eaten;
      }
      const double chance = world.disease_carrion_chance(age);
      if (!protected_life && !b.disease && origin != food_kind::egg && chance > 0 &&
          world.rng.uniform() < chance)
        world.infect(b, infection_source::carrion);
    }
    if (origin == food_kind::egg)
      count_egg();
    if (origin == food_kind::plant && drift)
      p.observations_.drift_nutrition += accepted;
    const int action = target.kind == food_kind::fish    ? feeding_effect::gulp_fish
                       : target.kind == food_kind::algae ? feeding_effect::scrape
                       : origin == food_kind::worm       ? feeding_effect::worm
                                                         : feeding_effect::swallow;
    effect(action, x, y, radius, raw);
    world.combat_effects.back().color = color;
  }
  void trim_effects() {
    while (world.combat_effects.size() > MAX_COMBAT_EFFECTS)
      world.combat_effects.pop_front();
  }

public:
  FeedingSession(Ecosystem &world, std::size_t index, double old_x, double old_y,
                 bool protected_life, std::vector<unsigned char> &bitten, double body_displacement)
      : world(world), index(index), old_x(old_x), old_y(old_y),
        body_displacement(body_displacement), protected_life(protected_life), bitten(bitten),
        p(world.fish[index]), b(p.body) {}
  FeedingResult run() {
    if (!b.alive || !b.hatched || b.health <= 0 || b.age <= b.hatch_age)
      return result;
    mx = world.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle));
    my = b.y + mouth_offset(b) * std::sin(b.angle);
    gape = mouth_aperture(b);
    b.mouth.swallowed = b.mouth.filtered = 0;
    if (b.mouth.closing && b.bite_signal > 0 && b.bite_strength > 0) {
      b.mouth.closing = false; // Consume the single contact, even if this session is called again.
      bite();
    }
    if (b.mouth.biting && b.mouth.phase >= MOUTH_HALF_CYCLE) {
      trim_effects();
      return result;
    }
    if (b.mouth.flow <= 0 || b.mouth.credit <= 0 || b.gut_fill >= gut_capacity(b)) {
      trim_effects();
      return result;
    }
    double area = std::min(b.mouth.budget, b.mouth.credit);
    for (const auto &target : candidates(area))
      swallow(target, area);
    const double density = world.field.plankton_density(mx, my);
    const double plankton = world.field.consume_plankton(
        mx, my, area, gut_room(b, food_kind::plankton, world.physiology_));
    if (plankton > 0) {
      ingest(plankton, food_kind::plankton);
      area = std::max(0., area - plankton / std::max(tolerance::rounding, density));
      if (b.feeding_action_age <= feeding_effect_steps::brief) {
        b.feeding_action = feeding_effect::filter;
        b.feeding_action_age = feeding_effect_steps::brief;
      }
    }
    const double bed = world.field.graze_bed(mx, my, gape, area,
                                             gut_room(b, food_kind::benthic, world.physiology_));
    if (bed > 0) {
      ingest(bed, food_kind::benthic);
      // Detritus uses the same remaining pump transport, never a second allowance.
      area = 0;
      if (b.feeding_action_age <= feeding_effect_steps::brief) {
        b.feeding_action = feeding_effect::scrape;
        b.feeding_action_age = feeding_effect_steps::brief;
      }
    }
    const double used = std::max(0., std::min(b.mouth.budget, b.mouth.credit) - area);
    b.mouth.budget = std::max(0., b.mouth.budget - used);
    b.mouth.credit = std::max(0., b.mouth.credit - used);
    trim_effects();
    return result;
  }
};
FeedingResult Ecosystem::feeding(std::size_t index, double old_x, double old_y, bool protected_life,
                                 std::vector<unsigned char> &bitten, double body_displacement) {
  return FeedingSession(*this, index, old_x, old_y, protected_life, bitten, body_displacement)
      .run();
}

}
