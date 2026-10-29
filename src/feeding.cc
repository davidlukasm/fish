#include "ecology_internal.hh"
#include "physiology.hh"
#include "perception.hh"
#include "plants.hh"
namespace fishsim {
FleshBite sever_flesh(Body &eater, Body &prey, double wound, bool protected_life) {
  if (protected_life || !eater.alive || !prey.alive || !eater.hatched || !prey.hatched ||
      eater.health <= 0 || prey.health <= 0 || eater.bite_signal <= 0 || eater.bite_strength <= 0 ||
      prey.tissue <= 0)
    return {};
  const double factor = 2 * bite_force(eater);
  const double tissue = prey.tissue, reserve = std::max(0., prey.energy),
               radius = body_radius(prey), gape = bite_radius(eater);
  const double maximum =
      3 * body_scale(eater) * factor * std::max(.25, body_mass(eater) / body_mass(prey));
  const double requested =
      std::min({maximum, .25 * tissue, tissue * gape * gape / (radius * radius)});
  const double bearing = std::atan2(eater.y - prey.y, eater.x - prey.x),
               blocked = prey.local_defense(bearing);
  prey.peak_tissue = std::max(prey.peak_tissue, tissue);
  const double lost = requested * (1 - blocked),
               energy = std::min(std::max(0., prey.energy), reserve * lost / tissue);
  prey.tissue -= lost;
  prey.energy -= energy;
  harm_body(prey, wound * lost / 3 * BODY_TISSUE / tissue, 1, bearing);
  if (prey.tissue <= tissue_floor(prey) || lost >= .2 * tissue) {
    harm_body(prey, prey.health, 1);
    if (prey.fatal_cause < 0)
      prey.fatal_cause = 1;
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
    q.body.alive = false;
    q.death_cause = 5;
    if (!q.nutrient_egg) {
      ++world.metrics_.deaths;
      ++world.metrics_.window_deaths;
      ++world.metrics_.death_causes[5];
    }
  }
  void fragment(double x, double y, double radius, double source_radius, double vx, double vy,
                double amount, int origin, std::array<double, 3> color, double age, double buoyancy,
                bool drift = false, double physical_age = -1, double hardness = 0,
                bool blunt = false) {
    if (amount <= 0)
      return;
    // Cracked shellfish leaves loose meat; every other fitting bite goes straight into the gut.
    if (origin != 8 && origin != 9 && radius <= maximum_mouth_aperture(b)) {
      const double eaten = std::min(amount, gut_room(b, origin, world.physiology_));
      if (eaten > 0) {
        ingest(eaten, origin);
        radius *= std::sqrt((amount - eaten) / amount);
        amount -= eaten;
      }
      if (amount <= 1e-9)
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
    Food piece{shape.x, shape.y, .75 * vx + .25 * b.motor_.vx, .75 * vy + .25 * b.motor_.vy,
               0,       amount};
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
              std::array<double, 3> color = {1, 0, 0}) {
    b.feeding_action = kind;
    b.feeding_action_age = 48;
    world.combat_effects.push_back({world.next_combat_effect++, world.ticks + 1, p.id, target, kind,
                                    x, y, b.angle, radius, amount, color});
  }
  double ingest(double raw, int origin) {
    const double accepted = take_nutrition(b, raw, origin, world.physiology_),
                 usable = accepted * digestibility(b, origin);
    b.mouth.swallowed += accepted;
    if (origin == 6)
      b.mouth.filtered += accepted;
    result.raw[origin] += accepted;
    result.nutrition[origin] += usable;
    if (origin > 0)
      world.field.record_nature(usable);
    return usable;
  }
  void bite() {
    const bool buried =
        world.field.sediment_immersion(mx, my, gape) >= world.field.env().burial_cover;
    int kind = -1;
    std::size_t target = 0;
    double best = 1e30;
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
          if (q.kind != 5) {
            candidate(q.kind, j, q.x, q.y, q.radius);
            return;
          }
          // A stroke is reached at its point nearest to the mouth.
          const double s = stroke_closest(q.hx, q.hy, world.field.delta_x(mx - q.x), my - q.y);
          candidate(5, j, world.field.wrap_x(q.x + s * q.hx), q.y + s * q.hy, stroke_width(q));
        });
    world.field.feeding().grid.nearby(
        mx, my, reach + world.field.feeding().indexed_food_radius, [&](std::uint32_t j) {
          if (!world.field.feeding().consumed[j] && world.field.feeding().pieces[j].energy > 0) {
            const auto &q = world.field.feeding().pieces[j];
            candidate(0, j, q.x, q.y, food_radius(q));
          }
        });
    world.field.body_grid().nearby(
        mx, my, reach + world.field.indexed_body_radius() + body_displacement,
        [&](std::uint32_t j) {
          const auto &o = world.field.visible()[j];
          if (o.kind >= 7 && o.kind <= 9 && (!o.hidden || (o.kind == 8 && buried))) {
            candidate(o.kind, o.source, o.x, o.y, o.radius);
          } else if (o.kind == 1 || o.kind == 2) {
            const auto &q = world.fish[o.source];
            if (o.source != index && q.body.alive && q.body.health > 0 &&
                (o.kind != 1 || !protected_life))
              candidate(o.kind, o.source, q.body.x, q.body.y,
                        collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1));
          } else if (o.kind == 3 && o.source < world.corpses.size() &&
                     world.corpses[o.source].energy > 0) {
            const auto &q = world.corpses[o.source];
            candidate(3, o.source, q.x, q.y, corpse_extent(q));
          }
        });
    if (buried) {
      for (std::size_t j = 0; j < world.field.food_web().crabs.size(); ++j) {
        const auto &c = world.field.food_web().crabs[j];
        if (c.state == 0 && c.energy > 0 &&
            reaches(c.x, c.y, crab_radius(c.energy, world.field.env(), c.morph))) {
          kind = 8;
          target = j;
          break;
        }
      }
      if (kind != 8) {
        const double force = bite_force(b);
        if (world.rng.uniform() <
            crack_success(force, world.field.env().hardness_leaf, world.field.env())) {
          const double amount = world.field.grip_worm(
              mx, my, gape, std::min(bite_portion(b), gut_room(b, 7, world.physiology_)));
          if (amount > 0) {
            fragment(mx, my, food_radius(amount), gape, 0, 0, amount, 7, {.85, .15, .12}, 0, 1);
            effect(5, mx, my, worm_head_radius, amount);
          }
        }
        return;
      }
    }
    const double morsel = bite_radius(b), portion = bite_portion(b);
    if (kind == 1) {
      auto &q = world.fish[target];
      const double before = q.body.tissue, radius = body_radius(q.body), health = q.body.health;
      const auto cut = sever_flesh(b, q.body, world.physiology_.bite_wound, protected_life);
      if (cut.energy > 0) {
        fragment(q.body.x, q.body.y, radius * std::sqrt(cut.tissue / before), radius,
                 q.body.motor_.vx, q.body.motor_.vy, cut.energy, 1, q.body.color, 0, 1);
        b.feeding_action = 5;
        b.feeding_action_age = 48;
        ++world.metrics_.fish_bites;
        const double loss = health - q.body.health;
        q.body.motor_.blood_loss += loss;
        double dx = world.field.delta_x(b.x - q.body.x), dy = b.y - q.body.y,
               d = std::hypot(dx, dy);
        if (d > 0) {
          q.body.motor_.blood_x = dx / d;
          q.body.motor_.blood_y = dy / d;
        }
        world.combat_effects.push_back({world.next_combat_effect++, world.ticks + 1, p.id, q.id, 1,
                                        q.body.x, q.body.y, std::atan2(dy, dx), radius,
                                        cut.tissue / 3});
        if (q.body.health <= 0)
          bitten[target] = 1;
      }
    } else if (kind == 2) {
      auto &q = world.fish[target];
      double before = q.body.energy, radius = collision_radius(q.body),
             amount = std::min({before, portion, before * morsel * morsel / (radius * radius)});
      q.body.energy -= amount;
      fragment(q.body.x, q.body.y, radius * std::sqrt(amount / std::max(.01, before)), radius,
               q.body.motor_.vx, q.body.motor_.vy, amount, 2, q.body.color, 0, .8);
      if (amount > 0)
        effect(5, q.body.x, q.body.y, morsel, amount);
      if (q.body.energy <= 1e-9)
        kill_egg(q);
    } else if (kind == 3) {
      auto &q = world.corpses[target];
      double before = q.energy, radius = corpse_extent(q),
             amount = std::min({before, portion, before * morsel * morsel / (radius * radius)});
      q.energy -= amount;
      fragment(q.x, q.y, radius * std::sqrt(amount / std::max(.01, before)), radius, q.vx, q.vy,
               amount, q.hatched ? 3 : 2, q.color, corpse_decay_age(q), 1.2);
      if (amount > 0)
        effect(5, q.x, q.y, morsel, amount);
    } else if (kind == 0) {
      auto q = world.field.feeding().pieces[target];
      const double force = bite_force(b, q.blunt),
                   efficiency = crack_success(force, q.hardness, world.field.env()),
                   cut_radius = bite_radius(b, q.blunt), radius = food_radius(q);
      double amount = std::min({q.energy, bite_portion(b, q.blunt) * efficiency,
                                q.energy * cut_radius * cut_radius / (radius * radius)});
      if (amount > 0 && q.energy - amount < .5 * world.field.env().crumb_min &&
          radius <= cut_radius)
        amount = q.energy;
      world.field.bite_food(target, amount, true);
      fragment(q.x, q.y, radius * std::sqrt(amount / q.energy), radius, q.vx, q.vy, amount,
               q.origin, q.color, q.decay_age, q.buoyancy, q.drift_plant, double(q.age), q.hardness,
               q.blunt);
      if (amount > 0)
        effect(5, q.x, q.y, morsel, amount);
    } else if (kind == 7) {
      const auto &h = world.field.food_web().heads[target];
      const double force = bite_force(b);
      if (h.energy > 0 && bite_portion(b) >= h.energy &&
          world.rng.uniform() <
              crack_success(force, world.field.env().hardness_leaf, world.field.env()))
        if (auto meal = world.field.take_small_animal(7, target, force, true)) {
          fragment(meal->x, meal->y, food_radius(meal->energy), meal->radius, 0, 0, meal->energy, 7,
                   meal->color, 0, 1);
          effect(5, meal->x, meal->y, meal->radius, meal->energy);
        }
    } else if (kind == 8 || kind == 9) {
      const double force = bite_force(b, true);
      if (auto meal = world.field.take_small_animal(kind, target, force, true, buried)) {
        world.field.scatter_fragments(*meal, force);
        effect(6, meal->x, meal->y, meal->radius, meal->energy);
      } else if (kind == 8 && !buried && !protected_life) {
        const auto &c = world.field.food_web().crabs[target];
        const double damage =
            world.field.env().crab_pinch *
            std::clamp(c.energy / crab_capacity(c.morph, world.field.env()), 0., 1.);
        harm_body(b, damage, 1);
        effect(8, b.x, b.y, body_radius(b), damage, p.id);
      } else if (kind == 9) {
        const auto &m = world.field.food_web().mussels[target];
        effect(10, m.x, m.y, mussel_radius(m.energy, world.field.env(), m.morph), 0);
      }
    } else if (kind == 4 || kind == 5) {
      const auto &part = world.field.vegetation().plants[target];
      const auto &source = world.field.plant_source(part.patch);
      const bool hard = part.kind == 5 && (part.organ < 0 || source.organs[part.organ].kind <= 1);
      const double radius = part.kind == 5 ? stroke_width(part) : part.radius,
                   s = part.kind == 5
                           ? stroke_closest(part.hx, part.hy, world.field.delta_x(mx - part.x),
                                            my - part.y)
                           : 0,
                   // The organ normal (-hy, hx) points to side +1, as in the drawing.
          side = part.kind == 5 && -part.hy * world.field.delta_x(mx - part.x - s * part.hx) +
                                           part.hx * (my - part.y - s * part.hy) <
                                       0
                     ? -1.
                     : 1.;
      if (auto piece = world.bite_plant(b, target, s, side)) {
        fragment(piece->x, piece->y, piece->radius, radius, piece->vx, piece->vy, piece->energy,
                 piece->origin, piece->color, 0, piece->buoyancy, piece->drift_plant, -1,
                 piece->hardness, piece->blunt);
        result.plants = true;
        effect(hard ? 6 : 5, piece->x, piece->y, piece->radius, piece->energy, 0, piece->color);
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
        candidate(0, j, q.x, q.y, food_radius(q));
      }
    });
    // Suction removes a thin flake from soft algae; stems and leaves still require a bite.
    world.field.vegetation().plant_grid.nearby(
        mx, my, reach + world.field.vegetation().indexed_plant_radius, [&](std::uint32_t j) {
          const auto &q = world.field.vegetation().plants[j];
          if (q.kind == 4 && q.energy > 0)
            candidate(4, j, q.x, q.y, std::min(.5, q.radius));
        });
    world.field.body_grid().nearby(mx, my, reach + body_displacement, [&](std::uint32_t j) {
      const auto &o = world.field.visible()[j];
      if (o.kind == 1 || o.kind == 2) {
        const auto &q = world.fish[o.source];
        if (o.source == index || !q.body.alive || q.body.health <= 0 ||
            (o.kind == 1 && protected_life))
          return;
        candidate(o.kind, o.source, q.body.x, q.body.y,
                  collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1));
      } else if (o.kind == 3 && o.source < world.corpses.size()) {
        const auto &q = world.corpses[o.source];
        if (q.energy > 0)
          candidate(3, o.source, q.x, q.y, corpse_extent(q));
      }
    });
    std::stable_sort(targets.begin(), targets.end(),
                     [](const auto &a, const auto &c) { return a.distance < c.distance; });

    return targets;
  }
  void swallow(const Target &target, double &area) {
    double raw = 0, radius = 0, age = 0;
    int origin = 0;
    bool drift = false;
    std::array<double, 3> color{};
    double x = 0, y = 0;
    if (target.kind == 0) {
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
    } else if (target.kind == 1 || target.kind == 2) {
      const auto &q = world.fish[target.id];
      if (!q.body.alive || q.body.health <= 0)
        return;
      raw = stored_energy(q.body);
      radius = collision_radius(q.body) * (q.body.hatched ? 1 + q.body.defense() : 1);
      origin = target.kind;
      color = q.body.color;
      x = q.body.x;
      y = q.body.y;
    } else if (target.kind == 4) {
      const auto &q = world.field.vegetation().plants[target.id];
      const auto &source = world.field.plant_source(q.patch);
      radius = std::min(.5, q.radius);
      const double thickness = 2 * q.radius, density = world.field.algae_surface_density(source);
      raw = std::min({q.energy, source.algae, gut_room(b, 4, world.physiology_),
                      scraped_algae(density, thickness, scrape_force(b), world.field.env()) *
                          std::min(1., area / std::max(.01, radius * radius))});
      origin = 4;
      color = {.25, .65, .20};
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
      origin = q.hatched ? 3 : 2;
      age = corpse_decay_age(q);
      color = q.color;
      x = q.x;
      y = q.y;
    }
    const double free = gut_room(b, origin, world.physiology_);
    if (radius * radius > area + 1e-9 || raw > free + 1e-9)
      return;
    if (target.kind == 1 || target.kind == 2 || target.kind == 3) {
      const double dx = world.field.delta_x(mx - x), dy = my - y, distance = std::hypot(dx, dy),
                   arrival = std::max(.15, gape * .35),
                   travel = std::min(distance, std::max(.15, mouth_reach(b) * b.mouth.flow * .5));
      if (distance > arrival) {
        if (world.field.ray(x, y, dx / distance, dy / distance) < travel - radius)
          return;
        const double nx = world.field.wrap_x(x + dx / distance * travel),
                     ny = y + dy / distance * travel;
        if (target.kind == 3) {
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
    if (target.kind == 0) {
      if (!world.field.draw_food(target.id, mx, my,
                                 std::max(.15, mouth_reach(b) * b.mouth.flow * .5),
                                 std::max(.15, gape * .35)))
        return;
      world.field.consume_food(target.id);
    } else if (target.kind == 1 || target.kind == 2) {
      auto &q = world.fish[target.id];
      q.body.energy = q.body.tissue = q.body.reproduction_.egg_yolk =
          q.body.reproduction_.sperm_store = q.body.gut_energy = q.body.gut_digestible =
              q.body.gut_fill = q.body.feces_pending = 0;
      if (target.kind == 1) {
        harm_body(q.body, q.body.health, 1);
        if (q.body.fatal_cause < 0)
          q.body.fatal_cause = 1;
        bitten[target.id] = 1;
      } else
        kill_egg(q);
    } else if (target.kind == 4) {
      world.field.consume_algae(target.id, raw);
      result.plants = true;
    } else
      world.corpses[target.id].energy = 0;
    const double accepted = ingest(raw, origin);
    area -= radius * radius;
    if (origin == 0) {
      ++p.observations_.window_food;
      ++b.eaten;
      const double chance = world.disease_food_chance(
          target.kind == 0 ? double(world.field.feeding().pieces[target.id].age) : age);
      if (!protected_life && !b.disease && chance > 0 && world.rng.uniform() < chance)
        world.infect(b, 3);
    } else if (origin <= 3) {
      if (origin == 3) {
        ++result.corpses;
        ++world.metrics_.corpses_eaten;
      }
      const double chance = world.disease_carrion_chance(age);
      if (!protected_life && !b.disease && origin != 2 && chance > 0 &&
          world.rng.uniform() < chance)
        world.infect(b, 1);
    }
    if (origin == 2) {
      ++result.eggs;
      ++b.eggs_eaten;
      ++world.metrics_.eggs_eaten;
    }
    if (origin == 5 && drift)
      p.observations_.drift_nutrition += accepted;
    const int action = target.kind == 1 ? 9 : target.kind == 4 ? 3 : origin == 7 ? 7 : 2;
    effect(action, x, y, radius, raw);
    world.combat_effects.back().color = color;
  }
  void trim_effects() {
    while (world.combat_effects.size() > 64)
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
    if (b.mouth.biting && b.mouth.phase >= 4) {
      trim_effects();
      return result;
    }
    if (b.mouth.flow <= 0 || b.mouth.credit <= 0 || b.gut_fill >= gut_capacity(b)) {
      trim_effects();
      return result;
    }
    double area = b.mouth.credit;
    for (const auto &target : candidates(area))
      swallow(target, area);
    const double density = world.field.plankton_density(mx, my);
    const double plankton =
        world.field.consume_plankton(mx, my, area, gut_room(b, 6, world.physiology_));
    if (plankton > 0) {
      ingest(plankton, 6);
      area = std::max(0., area - plankton / std::max(1e-12, density));
      if (b.feeding_action_age <= 2) {
        b.feeding_action = 4;
        b.feeding_action_age = 2;
      }
    }
    const double bed =
        world.field.graze_bed(mx, my, gape, area, gut_room(b, 10, world.physiology_));
    if (bed > 0) {
      ingest(bed, 10);
      // Detritus uses the same remaining pump transport, never a second allowance.
      area = 0;
      if (b.feeding_action_age <= 2) {
        b.feeding_action = 3;
        b.feeding_action_age = 2;
      }
    }
    b.mouth.credit = area;
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
