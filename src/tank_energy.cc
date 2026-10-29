#include "protocol_schema.hh"
#include "ecology.hh"
#include "physiology.hh"
#include "ecology_internal.hh"
#include "plants.hh"
namespace fishsim {
const Genome *Ecosystem::exportable_genome(std::uint64_t id) const {
  for (const auto &p : fish)
    if (p.id == id)
      return &p.genome;
  for (const auto &p : support_.breeders)
    if (p.id == id)
      return &p.genome;
  for (const auto &p : recent_deaths)
    if (p.first == id)
      return &p.second;
  return nullptr;
}
double Ecosystem::fish_energy() const {
  double total = 0;
  for (const auto &p : fish)
    total += stored_energy(p.body);
  for (const auto &c : corpses)
    total += c.energy;
  for (const auto &s : sperm)
    total += s.energy;
  for (const auto &f : field.feeding().pieces)
    if (f.origin >= 1 && f.origin <= 3)
      total += f.energy;
  return total;
}
double Ecosystem::external_food_energy() const {
  return field.food_energy() + field.algae_energy() + field.grass_energy();
}
double Ecosystem::total_energy() const {
  return fish_energy() + external_food_energy() + field.small_animal_energy();
}
void Ecosystem::refresh_food_allowance() {
  field.refresh_niche_limits();
  field.set_energy_headroom(std::max(0., energy_limit() - total_energy()));
}
void Ecosystem::enforce_energy_limit() {
  refresh_food_allowance();
}
int Field::fund_from_sources(double amount) {
  double from_food = std::min(amount, this->food_energy());
  int removed = this->remove_deepest(from_food);
  amount -= from_food;
  feeding_.food_support += from_food;
  for (auto &piece : feeding_.pieces)
    if (piece.origin == 4 || piece.origin == 5) {
      double take = std::min(amount, piece.energy);
      piece.energy -= take;
      amount -= take;
    }
  for (int kind : {4, 5})
    for (auto &s : vegetation_.surfaces) {
      double &source = kind == 4 ? s.algae : s.grass;
      double take = std::min(amount, source);
      source -= take;
      amount -= take;
    }
  for (auto &d : vegetation_.drifting_grass) {
    double take = std::min(amount, d.plant.grass);
    d.plant.grass -= take;
    amount -= take;
  }
  this->index_plants();
  return removed;
}
int Ecosystem::fund_from_sources(double amount) {
  return field.fund_from_sources(amount);
}
std::optional<Food> Field::bite_plant(Body &b, std::size_t index, double along_stroke,
                                      double side) {
  if (index >= vegetation_.plants.size() || !b.alive || !b.hatched || b.health <= 0 ||
      b.bite_signal <= 0 || b.bite_strength <= 0)
    return {};
  auto &part = vegetation_.plants[index];
  auto &source = this->plant_source_mut(part.patch);
  const int kind = part.kind;
  double &store = kind == 4 ? source.algae : source.grass;
  const bool hard = kind == 5 && (part.organ < 0 || source.organs[part.organ].kind <= 1);
  const double force = bite_force(b, hard);
  const double drift_age =
      kind == 5 && part.patch >= vegetation_.surfaces.size()
          ? double(vegetation_.drifting_grass[part.patch - vegetation_.surfaces.size()].age)
          : -1;
  const double hardness =
      kind == 4 ? env_.hardness_algae
                : plant_bite_hardness(part.organ >= 0 ? source.organs[part.organ].kind : 0,
                                      grass_traits(source)[0], env_, drift_age);
  const double efficiency = crack_success(force, hardness, env_),
               local = kind == 5 && part.organ >= 0 ? source.organs[part.organ].energy : store,
               bite = bite_radius(b, hard), width = stroke_width(part),
               half = stroke_half_length(part),
               // Share of a stroke inside the bite: a disc of the bite radius across its width.
      area = 4 * width * half + PI * width * width,
               covered = std::min(1., std::min(2 * bite, 2 * (half + width)) *
                                          std::min(2 * bite, 2 * width) / std::max(1e-6, area)),
               amount = kind == 4
                            ? std::min({store, part.energy,
                                        algae_surface_density(source) * bite * bite * efficiency})
                            : std::min({store, local, part.energy,
                                        bite_portion(b, hard) * efficiency, part.energy * covered});
  if (amount <= 0)
    return {};
  const double s = kind == 5 ? std::clamp(along_stroke, -1., 1.) : 0.;
  Food piece{wrap_x(part.x + s * part.hx), part.y + s * part.hy, 0, 0, 0, amount};
  piece.origin = kind;
  piece.radius =
      kind == 5
          ? std::max(.2, std::min(bite, std::sqrt(amount / std::max(.01, part.energy) * area / PI)))
          : std::max(.2,
                     std::min(bite, part.radius * std::sqrt(amount / std::max(.01, part.energy))));
  piece.initial_energy = amount;
  piece.hardness = hardness;
  piece.blunt = hard;
  piece.color =
      kind == 4 ? std::array<double, 3>{.25, .65, .2} : plant_organ_color(source, part.organ);
  piece.buoyancy = kind == 4 ? .2 : -.25;
  piece.drift_plant = part.patch >= vegetation_.surfaces.size();
  if (piece.drift_plant) {
    const auto water = water_.velocity(piece.x, piece.y);
    piece.vx = water.x;
    piece.vy = water.y;
  }
  store -= amount;
  (kind == 4 ? source.algae_grazed : source.grass_grazed) += amount;
  part.energy -= amount;
  if (kind == 5 && part.patch < vegetation_.plant_geometry_cache.size())
    vegetation_.plant_geometry_cache[part.patch].clear();
  if (kind == 5 && part.organ >= 0) {
    source.organs[part.organ].energy -= amount;
    // A bite that goes through cuts the organ exactly where it was bitten; any other bite
    // leaves a crescent notch on the side the fish came from. A leaf is cut only when the
    // bite spans its whole width; otherwise the bite takes a piece out of its margin.
    const double at = stroke_along(part, s);
    auto &organ = source.organs[part.organ];
    const bool through = organ.kind < 2 || bite > 1.6 * width;
    if (organ.energy < 1e-9 || (through && efficiency > .35 && at > .12 && at < .88))
      this->cut_organ(part.patch, part.organ, at);
    else {
      double length = 0;
      for (int k = 0; k < 3; ++k)
        length += std::hypot(organ.draw_curve[k + 1].x - organ.draw_curve[k].x,
                             organ.draw_curve[k + 1].y - organ.draw_curve[k].y);
      const double heal = env_.plant_notch_heal,
                   depth = std::min(.85, piece.radius / std::max(.1, 2 * width)),
                   span = std::clamp(piece.radius / std::max(1., length), .01, .3);
      auto *slot = &organ.notches[0];
      for (auto &n : organ.notches)
        if (std::abs(notch_depth(n, time, heal)) < std::abs(notch_depth(*slot, time, heal)))
          slot = &n;
      // A second bite into the same mark widens and deepens it.
      for (auto &n : organ.notches)
        if (n.width > 0 && (n.depth < 0) == (side < 0) && std::abs(n.at - at) < n.width) {
          slot = &n;
          break;
        }
      const double previous = slot->width > 0 && (slot->depth < 0) == (side < 0) &&
                                      std::abs(slot->at - at) < slot->width
                                  ? std::abs(notch_depth(*slot, time, heal))
                                  : 0;
      const double deeper = std::min(.9, std::max(depth, previous + .6 * depth));
      *slot = {previous > 0 ? .5 * (slot->at + at) : at, side < 0 ? -deeper : deeper,
               previous > 0 ? std::min(.3, std::max(slot->width, span) * 1.15) : span, time};
    }
  }
  return piece;
}
std::optional<Food> Ecosystem::bite_plant(Body &b, std::size_t index, double along_stroke,
                                          double side) {
  return field.bite_plant(b, index, along_stroke, side);
}
double corpse_extent(const Corpse &c) {
  return c.radius > 0 ? c.radius : corpse_radius(c.initial_energy);
}
std::array<double, 3> remains_color(const Corpse &c, double bright, double half_life,
                                    double bone_time) {
  auto color = corpse_color(c.color, corpse_decay_age(c), c.energy, bright, half_life);
  double tissue =
      c.initial_energy > 0 ? std::pow(std::clamp(c.energy / c.initial_energy, 0., 1.), .65) : 0;
  for (int i = 0; i < 3; ++i)
    color[i] = tissue * color[i] + (1 - tissue) * .18 *
                                       std::max(0., 1 - double(c.bone_age) / bone_time) *
                                       (i == 2 ? .70 : .82);
  return color;
}
void Ecosystem::drift_corpses() {
  for (auto &c : corpses) {
    c.energy -= field.feed_plankton(c.x, c.y, c.energy, corpse_extent(c));
    c.energy -= field.feed_crabs(c.x, c.y, c.energy, corpse_extent(c));
    auto water = field.water().velocity(c.x, c.y);
    const double sink =
        field.gravity > 0
            ? .65 +
                  7.35 * std::max(1., field.geometry().height / 1640.) *
                      std::pow(std::clamp(double(c.age) / field.env().corpse_sink_time, 0., 1.), 2)
            : 0;
    auto drift = field.drift_velocity({c.vx, c.vy}, {water.x, water.y + (c.hatched ? sink : 0)},
                                      c.hatched ? 0 : 9.6, .19008);
    c.vx = drift.x;
    c.vy = drift.y;
    auto slowed = field.sediment_velocity({c.vx, c.vy}, c.x, c.y, corpse_extent(c));
    c.vx = slowed.x;
    c.vy = slowed.y;
    Body shape{};
    shape.x = c.x + c.vx;
    shape.y = c.y + c.vy;
    double x = c.x, y = c.y;
    field.collide(shape, x, y, corpse_extent(c));
    c.x = shape.x;
    c.y = shape.y;
    c.vx = field.delta_x(c.x - x);
    c.vy = c.y - y;
    const double radius = corpse_extent(c), co = std::cos(c.angle), si = std::sin(c.angle);
    double buried = 0, cover = 0;
    if (field.sediment_immersion(c.x, c.y, 2 * radius) > 0)
      for (int k = 0; k < 7; ++k) {
        const auto point = c.visual ? c.visual->burial_points[k]
                                    : std::array<double, 2>{k < 5 ? -.8 + .4 * k : 0,
                                                            k < 5 ? 0. : (k == 5 ? -.7 : .7)};
        const double along = point[0] * radius, across = point[1] * radius;
        double depth = field.sediment_cover(field.wrap_x(c.x + co * along - si * across),
                                            c.y + si * along + co * across);
        if (depth > .15)
          ++buried;
        cover = std::max(cover, depth);
      }
    const double burial = buried / 7,
                 factor = 1 + 31 * burial + 32 * std::clamp((cover - radius) / 16, 0., 1.);
    // Slow drifting in open water is not ground contact.
    const bool ground_contact = field.ray(c.x, c.y, 0, 1, radius, .5) < .25;
    c.resting = burial > 0 || ground_contact;
    if (c.resting && c.energy > 0) {
      c.decay_age =
          corpse_decay_age(c) +
          (c.hatched ? 1 : field.env().decay_half_life / field.env().egg_half_life) / factor;
      const double before = c.energy;
      c.energy *= std::exp2(
          -1 / (factor * (c.hatched ? field.env().decay_half_life : field.env().egg_half_life)));
      if (c.energy < field.env().crumb_min)
        c.energy = 0;
      field.deposit_detritus(c.x, c.y, before - c.energy, radius);
    }
    ++c.age;
    if (c.energy <= 0)
      ++c.bone_age;
  }
  std::vector<std::size_t> resting;
  for (std::size_t i = 0; i < corpses.size(); ++i)
    if (corpses[i].hatched && corpses[i].energy > 0 && corpses[i].resting)
      resting.push_back(i);
  if (resting.size() > std::size_t(field.source_count())) {
    std::sort(resting.begin(), resting.end(),
              [&](auto a, auto b) { return corpses[a].age > corpses[b].age; });
    for (std::size_t i = 0; i < resting.size() - field.source_count(); ++i) {
      auto &c = corpses[resting[i]];
      field.deposit_detritus(c.x, c.y, c.energy, corpse_extent(c));
      c.energy = 0;
      c.bone_age = 0;
    }
  }
  corpses.erase(std::remove_if(corpses.begin(), corpses.end(),
                               [&](const Corpse &c) {
                                 return c.energy <= 0 &&
                                        (!c.hatched || c.bone_age >= field.env().bone_time);
                               }),
                corpses.end());
}

void Ecosystem::collect_corpses() {
  for (auto &p : fish)
    if (!p.body.alive) {
      auto &b = p.body;
      double nutrition = stored_energy(b);
      if (nutrition > 0) {
        Corpse c{b.x, b.y, b.motor_.vx, b.motor_.vy, nutrition, nutrition, b.color, 0};
        c.decay_age = 0;
        c.blood_id = p.id;
        c.species = p.species ? p.species : p.maternal_species;
        c.death_cause = std::max(0, p.death_cause);
        c.blood_loss = b.motor_.blood_loss;
        c.blood_x = b.motor_.blood_x;
        c.blood_y = b.motor_.blood_y;
        c.angle = b.angle;
        c.radius = collision_radius(b);
        c.hatched = b.hatched;
        if (b.hatched) {
          if (p.genome.interface) {
            auto copy = std::make_shared<BrainInterface>();
            copy->anatomy = p.genome.interface->anatomy;
            copy->jaw_length = b.jaw_length;
            copy->gut_length = b.gut_length;
            copy->blunt_teeth = b.blunt_teeth;
            copy->undulation = b.undulation;
            copy->fins = p.genome.interface->fins;
            copy->forms = p.genome.interface->forms;
            copy->regions = p.genome.interface->regions;
            copy->contour = p.genome.interface->contour;
            copy->eye_positions = p.genome.interface->eye_positions;
            copy->eye_shape = p.genome.interface->eye_shape;
            copy->eye_clearance = p.genome.interface->eye_clearance;
            copy->body_plans = p.genome.interface->body_plans;
            copy->body_geometry = p.genome.interface->body_geometry;
            copy->burial_points = p.genome.interface->burial_points;
            c.visual = copy;
            c.visual_state = {b.energy,
                              reserve_capacity(b),
                              b.reproduction_.egg_yolk,
                              b.reproduction_.egg_limit,
                              b.reproduction_.sperm_store,
                              b.reproduction_.sperm_limit,
                              body_mass(b),
                              b.motor_.tail,
                              b.motor_.fin_tension[0],
                              b.motor_.fin_tension[1],
                              b.motor_.fin_tension[2],
                              b.motor_.mouth_pose,
                              b.motor_.bite_pose,
                              b.motor_.suction_pose,
                              b.defense(),
                              b.health,
                              b.motor_.aggression,
                              p.observations_.window_traits[3] /
                                  std::max(1, p.observations_.window_steps),
                              b.egg_shell_radius,
                              b.birth_tissue,
                              mouth_aperture(b),
                              b.gut_fill,
                              b.gut_energy,
                              b.gut_length,
                              b.undulation};
          }
        }
        corpses.push_back(c);
      }
      b.energy = b.tissue = b.reproduction_.egg_yolk = b.reproduction_.sperm_store = b.gut_energy =
          b.gut_digestible = b.gut_fill = b.feces_pending = 0;
      b.reproduction_.egg_laying = false;
    }
}
}
