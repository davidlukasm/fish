#include "protocol_schema.hh"
#include "ecology.hh"
#include "physiology.hh"
#include "ecology_internal.hh"
#include "plants.hh"
namespace fishsim {
namespace {
// Bitten-off plant pieces are at least MIN_PIECE_RADIUS.
constexpr double MIN_PIECE_RADIUS = .2;
// Shares of a part's energy are taken against at least MIN_PART_ENERGY; bites and widths count as
// at least MIN_BITE; marks span bites over at least MIN_MARK_LENGTH.
constexpr double MIN_PART_ENERGY = .01, MIN_BITE = .1, MIN_MARK_LENGTH = 1;
// A bite wider than LEAF_THROUGH leaf widths cuts through; thin blades need less force.
constexpr double LEAF_THROUGH = 1.6, CUT_FORCE = .35, CUT_FORCE_MIN = .08;
// Bite notches: depth, widening and the margin of an organ that is never cut.
constexpr double NOTCH_MIN_WIDTH = .04, NOTCH_MAX_DEPTH = .85, NOTCH_CUT_DEPTH = .95,
                 NOTCH_MARGIN = .12, NOTCH_MIN_SPAN = .03, NOTCH_MAX_SPAN = .3, NOTCH_DEEPEST = .9,
                 NOTCH_DEEPEN = .6, NOTCH_WIDEN = 1.15;
// Remains lose their tissue colour along this curve and shade towards bone.
constexpr double REMAINS_TISSUE_CURVE = .65, BONE_SHADE = .18, BONE_BLUE = .70, BONE_WARM = .82;
// Corpses sink faster with age, scaled to the tank height; dead eggs drift with the water.
constexpr double CORPSE_SINK_START = .65, CORPSE_SINK_GAIN = 7.35, EGG_CORPSE_DRAG = 9.6,
                 CORPSE_DRIFT = .19008;
// Burial is probed at five points along the body (from BURIAL_START radii in BURIAL_STEP steps)
// and two BURIAL_ACROSS radii across it, once sediment lies within BURIAL_REACH radii.
constexpr int BURIAL_POINTS = 7, AXIAL_BURIAL_POINTS = 5;
constexpr double BURIAL_START = -.8, BURIAL_STEP = .4, BURIAL_ACROSS = .7, BURIAL_REACH = 2;
constexpr double BURIED_DEPTH = .15, BURIAL_DRAG = 31, COVER_DRAG = 32, COVER_DEPTH = 16,
                 GROUND_PROBE = .5, GROUND_GAP = .25;
}
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
    if (f.origin >= food_kind::fish && f.origin <= food_kind::carrion)
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
    if (piece.origin == food_kind::algae || piece.origin == food_kind::plant) {
      double take = std::min(amount, piece.energy);
      piece.energy -= take;
      amount -= take;
    }
  for (int kind : {food_kind::algae, food_kind::plant})
    for (auto &s : vegetation_.surfaces) {
      double &source = kind == food_kind::algae ? s.algae : s.grass;
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
  double &store = kind == food_kind::algae ? source.algae : source.grass;
  const bool hard = kind == food_kind::plant &&
                    (part.organ < 0 || source.organs[part.organ].kind <= plant_organ::stem);
  const double force = bite_force(b, hard);
  const double drift_age =
      kind == food_kind::plant && part.patch >= vegetation_.surfaces.size()
          ? double(vegetation_.drifting_grass[part.patch - vegetation_.surfaces.size()].age)
          : -1;
  const double hardness =
      kind == food_kind::algae
          ? env_.hardness_algae
          : plant_bite_hardness(part.organ >= 0 ? source.organs[part.organ].kind
                                                : plant_organ::blade,
                                grass_traits(source)[grass_trait::fiber], env_, drift_age);
  const double efficiency = crack_success(force, hardness, env_),
               local = kind == food_kind::plant && part.organ >= 0
                           ? source.organs[part.organ].energy
                           : store,
               bite = bite_radius(b), width = stroke_width(part), half = stroke_half_length(part),
               // Share of a stroke inside the bite: a disc of the bite radius across its width.
      area = 4 * width * half + PI * width * width,
               covered = std::min(1., std::min(2 * bite, 2 * (half + width)) *
                                          std::min(2 * bite, 2 * width) /
                                          std::max(tolerance::precision, area)),
               amount = kind == food_kind::algae
                            ? std::min({store, part.energy,
                                        algae_surface_density(source) * bite * bite * efficiency})
                            : std::min({store, local, part.energy * covered * efficiency});
  if (amount <= 0)
    return {};
  const double s = kind == food_kind::plant ? std::clamp(along_stroke, -1., 1.) : 0.;
  Food piece{wrap_x(part.x + s * part.hx), part.y + s * part.hy, 0, 0, 0, amount};
  piece.origin = kind;
  piece.radius =
      kind == food_kind::plant
          ? std::max(MIN_PIECE_RADIUS,
                     std::min(bite, std::sqrt(amount / std::max(MIN_PART_ENERGY, part.energy) *
                                              area / PI)))
          : std::max(MIN_PIECE_RADIUS,
                     std::min(bite, part.radius * std::sqrt(amount / std::max(MIN_PART_ENERGY,
                                                                              part.energy))));
  piece.initial_energy = amount;
  piece.hardness = hardness;
  piece.blunt = hard;
  piece.color = kind == food_kind::algae ? ALGAE_COLOR : plant_organ_color(source, part.organ);
  piece.buoyancy = kind == food_kind::algae ? ALGAE_BUOYANCY : PLANT_BUOYANCY;
  piece.drift_plant = part.patch >= vegetation_.surfaces.size();
  if (piece.drift_plant) {
    const auto water = water_.velocity(piece.x, piece.y);
    piece.vx = water.x;
    piece.vy = water.y;
  }
  store -= amount;
  (kind == food_kind::algae ? source.algae_grazed : source.grass_grazed) += amount;
  part.energy -= amount;
  if (kind == food_kind::plant && part.patch < vegetation_.plant_geometry_cache.size())
    vegetation_.plant_geometry_cache[part.patch].clear();
  if (kind == food_kind::plant && part.organ >= 0) {
    source.organs[part.organ].energy -= amount;
    // A bite that goes through cuts the organ exactly where it was bitten; any other bite
    // leaves a crescent notch on the side the fish came from. A leaf is cut only when the
    // bite spans its whole width; otherwise the bite takes a piece out of its margin.
    const double at = stroke_along(part, s);
    auto &organ = source.organs[part.organ];
    const bool through = organ.kind < plant_organ::leaf || bite > LEAF_THROUGH * width;
    // Thin blades need less force to go through; repeated bites at one place cut as well.
    const double needed =
        std::clamp(CUT_FORCE * width / std::max(MIN_BITE, bite), CUT_FORCE_MIN, CUT_FORCE);
    double worn = 0;
    for (const auto &n : organ.notches)
      if (n.width > 0 && std::abs(n.at - at) < std::max(n.width, NOTCH_MIN_WIDTH))
        worn = std::max(worn, std::abs(notch_depth(n, time, env_.plant_notch_heal)));
    if (organ.energy < tolerance::negligible ||
        (((through && efficiency > needed) ||
          worn + std::min(NOTCH_MAX_DEPTH, bite / std::max(MIN_BITE, 2 * width)) >
              NOTCH_CUT_DEPTH) &&
         at > NOTCH_MARGIN && at < 1 - NOTCH_MARGIN))
      this->cut_organ(part.patch, part.organ, at);
    else {
      const double length = curve_length(organ.draw_curve);
      // The mark has the size of the mouth that bit, not of the piece it tore off: a small
      // mouthful from an energy-rich leaf still leaves a clearly visible bite.
      const double heal = env_.plant_notch_heal,
                   depth = std::min(NOTCH_MAX_DEPTH, bite / std::max(MIN_BITE, 2 * width)),
                   span = std::clamp(bite / std::max(MIN_MARK_LENGTH, length), NOTCH_MIN_SPAN,
                                     NOTCH_MAX_SPAN);
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
      const double deeper =
          std::min(NOTCH_DEEPEST, std::max(depth, previous + NOTCH_DEEPEN * depth));
      *slot = {previous > 0 ? (slot->at + at) / 2 : at, side < 0 ? -deeper : deeper,
               previous > 0 ? std::min(NOTCH_MAX_SPAN, std::max(slot->width, span) * NOTCH_WIDEN)
                            : span,
               time};
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
Color remains_color(const Corpse &c, double bright, double half_life, double bone_time) {
  auto color = corpse_color(c.color, corpse_decay_age(c), c.energy, bright, half_life);
  double tissue = c.initial_energy > 0 ? std::pow(std::clamp(c.energy / c.initial_energy, 0., 1.),
                                                  REMAINS_TISSUE_CURVE)
                                       : 0;
  for (std::size_t i = 0; i < color.size(); ++i)
    color[i] = tissue * color[i] + (1 - tissue) * BONE_SHADE *
                                       std::max(0., 1 - double(c.bone_age) / bone_time) *
                                       (i == color.size() - 1 ? BONE_BLUE : BONE_WARM);
  return color;
}
void Ecosystem::drift_corpses() {
  for (auto &c : corpses) {
    c.energy -= field.feed_plankton(c.x, c.y, c.energy, corpse_extent(c));
    c.energy -= field.feed_crabs(c.x, c.y, c.energy, corpse_extent(c));
    auto water = field.water().velocity(c.x, c.y);
    const double sink =
        field.gravity > 0
            ? CORPSE_SINK_START +
                  CORPSE_SINK_GAIN * std::max(1., field.geometry().height / tank::standard_height) *
                      std::pow(std::clamp(double(c.age) / field.env().corpse_sink_time, 0., 1.), 2)
            : 0;
    auto drift = field.drift_velocity({c.vx, c.vy}, {water.x, water.y + (c.hatched ? sink : 0)},
                                      c.hatched ? 0 : EGG_CORPSE_DRAG, CORPSE_DRIFT);
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
    if (field.sediment_immersion(c.x, c.y, BURIAL_REACH * radius) > 0)
      for (int k = 0; k < BURIAL_POINTS; ++k) {
        const auto point = c.visual
                               ? c.visual->burial_points[k]
                               : std::array<double, 2>{
                                     k < AXIAL_BURIAL_POINTS ? BURIAL_START + BURIAL_STEP * k : 0,
                                     k < AXIAL_BURIAL_POINTS    ? 0.
                                     : k == AXIAL_BURIAL_POINTS ? -BURIAL_ACROSS
                                                                : BURIAL_ACROSS};
        const double along = point[0] * radius, across = point[1] * radius;
        double depth = field.sediment_cover(field.wrap_x(c.x + co * along - si * across),
                                            c.y + si * along + co * across);
        if (depth > BURIED_DEPTH)
          ++buried;
        cover = std::max(cover, depth);
      }
    const double burial = buried / BURIAL_POINTS,
                 factor = 1 + BURIAL_DRAG * burial +
                          COVER_DRAG * std::clamp((cover - radius) / COVER_DEPTH, 0., 1.);
    // Slow drifting in open water is not ground contact.
    const bool ground_contact = field.ray(c.x, c.y, 0, 1, radius, GROUND_PROBE) < GROUND_GAP;
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
            namespace V = corpse_state_column;
            auto &s = c.visual_state;
            s[V::energy] = b.energy;
            s[V::reserve_capacity] = reserve_capacity(b);
            s[V::egg_yolk] = b.reproduction_.egg_yolk;
            s[V::egg_capacity] = b.reproduction_.egg_limit;
            s[V::sperm_store] = b.reproduction_.sperm_store;
            s[V::sperm_capacity] = b.reproduction_.sperm_limit;
            s[V::mass] = body_mass(b);
            s[V::tail] = b.motor_.tail;
            s[V::fin_tail] = b.motor_.fin_tension[fin::tail];
            s[V::fin_left] = b.motor_.fin_tension[fin::left];
            s[V::fin_right] = b.motor_.fin_tension[fin::right];
            s[V::mouth_pose] = b.motor_.mouth_pose;
            s[V::bite_pose] = b.motor_.bite_pose;
            s[V::suction_pose] = b.motor_.suction_pose;
            s[V::defense] = b.defense();
            s[V::health] = b.health;
            s[V::aggression] = b.motor_.aggression;
            s[V::mean_aggression] = p.observations_.window_traits[window_trait::aggression] /
                                    std::max(1, p.observations_.window_steps);
            s[V::shell_radius] = b.egg_shell_radius;
            s[V::birth_tissue] = b.birth_tissue;
            s[V::mouth_aperture] = mouth_aperture(b);
            s[V::gut_fill] = b.gut_fill;
            s[V::gut_energy] = b.gut_energy;
            s[V::gut_length] = b.gut_length;
            s[V::undulation] = b.undulation;
          }
        }
        corpses.push_back(c);
      }
      empty_stores(b);
      b.reproduction_.egg_laying = false;
    }
}
}
