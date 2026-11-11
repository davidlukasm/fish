#include "state_environment.hh"
#include "state_validation.hh"
#include "environment.hh"
#include "physiology_parameters.hh"
#include <set>
namespace fishsim {
using state::scalar;
using state::value;
namespace {
constexpr std::size_t MAX_FOOD_PIECES = 2000000, MAX_FOOD_CLOUDS = 2000, MAX_SEDIMENT_CELLS = 20000;
constexpr std::uint64_t MAX_RESTING_STEPS = 100000;
constexpr double MIN_DRIFT_PATCH = .001, MAX_PIECE_ENERGY = 20000, MAX_BUOYANCY = 4,
                 MAX_FOOD_HARDNESS = 2, MAX_CURRENT_NOISE = 10;
constexpr int MAX_WATER_COLUMNS = int(tank::max_width / WATER_CELL) + 1,
              MAX_WATER_ROWS = int(tank::max_height / WATER_CELL) + 1;
}
void read_plant_organs(std::istream &in, SurfacePatch &p, double grass_limit) {
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };

  std::string tag;
  value(in, tag);
  if (tag != "PLANT_STRUCTURE" && tag != "PLANT_STRUCTURE2")
    throw std::runtime_error("invalid plant structure");
  const bool notches = tag == "PLANT_STRUCTURE2";
  scalar(in, p.vitality, 0, 1);
  scalar(in, p.spin, -MAX_DRIFT_TURN, MAX_DRIFT_TURN);
  value(in, p.plant_age);
  scalar(in, p.visual_depth, -1, 1);
  for (auto n = count(MAX_PLANT_ORGANS); n; --n) {
    PlantOrgan o;
    value(in, o.kind);
    value(in, o.parent);
    if (o.kind < 0 || o.kind > organ_kind::round_leaf || o.parent < -1 ||
        o.parent >= int(p.organs.size()))
      throw std::runtime_error("invalid plant attachment");
    scalar(in, o.attach, 0, 1);
    scalar(in, o.length, 0, MAX_ORGAN_LENGTH);
    scalar(in, o.width, 0, MAX_ORGAN_WIDTH);
    scalar(in, o.target, MIN_ORGAN_TARGET, PLAUSIBLE_AMOUNT);
    scalar(in, o.energy, 0, grass_limit);
    scalar(in, o.root, -1, PLAUSIBLE_AMOUNT);
    scalar(in, o.hardness, ORGAN_HARDNESS[0], ORGAN_HARDNESS[1]);
    value(in, o.ready);
    value(in, o.bare_steps);
    scalar(in, o.loose_width, 0, MAX_ORGAN_WIDTH);
    scalar(in, o.loose_length, 0, PLAUSIBLE_LOCAL);
    scalar(in, o.elongation, 0, 1);
    for (auto &q : o.curve) {
      scalar(in, q.x, -tank::max_coordinate, tank::max_coordinate);
      scalar(in, q.y, -tank::max_coordinate, tank::max_coordinate);
    }
    if (notches)
      for (auto &n : o.notches) {
        scalar(in, n.at, 0, 1);
        scalar(in, n.depth, -1, 1);
        scalar(in, n.width, 0, MAX_NOTCH_WIDTH);
        value(in, n.time);
      }
    p.organs.push_back(o);
  }
}
void EnvironmentCheckpoint::read_geometry(std::istream &in, Field &field) {
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  field.geometry_.obstacles.clear();
  for (auto n = count(MAX_OBSTACLES); n; --n) {
    Obstacle o;
    scalar(in, o.x, -tank::max_coordinate, tank::max_coordinate);
    scalar(in, o.y, -tank::max_coordinate, tank::max_coordinate);
    scalar(in, o.radius, 1, PLAUSIBLE_EXTENT);
    for (auto j = count(MAX_POLYGON_POINTS); j; --j) {
      Point p;
      scalar(in, p.x, -tank::max_coordinate, tank::max_coordinate);
      scalar(in, p.y, -tank::max_coordinate, tank::max_coordinate);
      o.vertices.push_back(p);
    }
    if (!o.vertices.empty() && o.vertices.size() < MIN_POLYGON_POINTS)
      throw std::runtime_error("invalid polygon");
    field.geometry_.obstacles.push_back(o);
  }
  {
    std::string tag;
    value(in, tag);
    value(in, field.geometry_.next_obstacle_id);
    if (tag != "OBSTACLE_IDS" || !field.geometry_.next_obstacle_id)
      throw std::runtime_error("invalid obstacle ids");
    std::set<std::uint64_t> ids;
    for (auto &o : field.geometry_.obstacles) {
      value(in, o.id);
      if (!o.id || o.id >= field.geometry_.next_obstacle_id || !ids.insert(o.id).second)
        throw std::runtime_error("invalid obstacle id");
    }
  }
}
void EnvironmentCheckpoint::read_water(std::istream &in, Field &field) {
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  auto &w = field.water_;
  w.width = field.geometry_.width;
  w.height = field.geometry_.height;
  value(in, w.columns);
  value(in, w.rows);
  scalar(in, w.cell, WATER_CELL, WATER_CELL);
  if (w.columns < 0 || w.rows < 0 || w.columns > MAX_WATER_COLUMNS || w.rows > MAX_WATER_ROWS)
    throw std::runtime_error("invalid water grid");
  for (auto *v : {&w.u, &w.v}) {
    auto n = count(std::size_t(MAX_WATER_COLUMNS + 1) * (MAX_WATER_ROWS + 1));
    v->resize(n);
    for (auto &x : *v)
      scalar(in, x, -MAX_DRIFT_SPEED, MAX_DRIFT_SPEED);
  }
  if (w.u.size() != std::size_t((w.columns + 1) * w.rows) ||
      w.v.size() != std::size_t(w.columns * (w.rows + 1)))
    throw std::runtime_error("invalid water state");
  w.solid.resize(w.columns * w.rows);
}
void EnvironmentCheckpoint::read(std::istream &in, Field &field, PhysiologyParameters &physiology) {
  scalar(in, field.geometry_.width, tank::min_width, tank::max_width);
  scalar(in, field.geometry_.height, tank::min_height, tank::max_height);
  value(in, field.feeding_.density);
  scalar(in, field.flow, 0, water_setting::max_flow);
  scalar(in, field.gravity, 0, water_setting::max_gravity);
  value(in, field.time);
  scalar(in, physiology.neural_cost, NEURAL_COST_MIN, NEURAL_COST_MAX);
  scalar(in, field.feeding_.source_motion, 0, MAX_SOURCE_MOTION);
  value(in, field.feeding_.drained_food);
  value(in, field.rng.engine);
  scalar(in, field.feeding_.nature_average, 0, PLAUSIBLE_RUNNING);
  scalar(in, field.feeding_.nature_intake, 0, PLAUSIBLE_RUNNING);
  scalar(in, field.feeding_.food_assisted, 0, PLAUSIBLE_SUM);
  std::vector<FoodCloud> clouds(state::count(in, MAX_FOOD_CLOUDS));
  for (auto &cloud : clouds) {
    scalar(in, cloud.position.x, 0, 1);
    scalar(in, cloud.position.y, 0, 1);
    scalar(in, cloud.angle, -PI, PI);
    scalar(in, cloud.turn, -MAX_CLOUD_TURN, MAX_CLOUD_TURN);
  }
  field.indexed_ = false;
  if (field.feeding_.density < 0 || field.feeding_.density > run_limit::max_food)
    throw std::runtime_error("invalid initial food");
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  field.feeding_.pieces.clear();
  for (auto n = count(MAX_FOOD_PIECES); n; --n) {
    Food f;
    scalar(in, f.x, 0, field.geometry_.width);
    scalar(in, f.y, 0, field.geometry_.height);
    scalar(in, f.vx, -MAX_DRIFT_SPEED, MAX_DRIFT_SPEED);
    scalar(in, f.vy, -MAX_DRIFT_SPEED, MAX_DRIFT_SPEED);
    value(in, f.bottom_steps);
    if (f.bottom_steps > MAX_RESTING_STEPS)
      throw std::runtime_error("invalid settled food");
    scalar(in, f.energy, 0, MAX_PIECE_ENERGY);
    value(in, f.age);
    value(in, f.cloud);
    if (f.cloud < -1 || f.cloud >= int(clouds.size()))
      throw std::runtime_error("invalid food source");
    {
      std::string tag;
      value(in, tag);
      if (tag != "FRAGMENT")
        throw std::runtime_error("missing food material");
      value(in, f.origin);
      if (f.origin < 0 || f.origin > food_kind::mussel)
        throw std::runtime_error("invalid food origin");
      scalar(in, f.radius, 0, std::max(double(MAX_BODY_RADIUS), food_radius(PLAUSIBLE_AMOUNT)));
      scalar(in, f.initial_energy, 0, PLAUSIBLE_AMOUNT);
      scalar(in, f.decay_age, 0, PLAUSIBLE_RUNNING);
      scalar(in, f.buoyancy, -MAX_BUOYANCY, MAX_BUOYANCY);
      for (auto &c : f.color)
        scalar(in, c, 0, 1);
      value(in, f.drift_plant);
      scalar(in, f.hardness, 0, MAX_FOOD_HARDNESS);
      value(in, f.bitten);
    }
    field.feeding_.pieces.push_back(f);
  }
  read_geometry(in, field);
  field.feeding_.feeders.clear();
  for (auto n = count(source_limits::max_count); n; --n) {
    Feeder f;
    scalar(in, f.x, 0, field.geometry_.width);
    scalar(in, f.y, 0, field.geometry_.height);
    scalar(in, f.radius, source_limits::min_feeder_radius, source_limits::max_feeder_radius);
    scalar(in, f.rate, 0, source_limits::max_feeder_rate);
    field.feeding_.feeders.push_back(f);
  }
  for (auto n = count(source_limits::max_count); n; --n) {
    CurrentSource source;
    scalar(in, source.x, 0, field.geometry_.width);
    scalar(in, source.y, 0, field.geometry_.height);
    scalar(in, source.angle, -PI, PI);
    scalar(in, source.width, source_limits::min_width, source_limits::max_width);
    scalar(in, source.strength, 0, source_limits::max_strength);
    scalar(in, source.noise, -MAX_CURRENT_NOISE, MAX_CURRENT_NOISE);
    field.currents_.push_back(source);
  }
  read_water(in, field);
  {
    std::string tag;
    value(in, tag);
    value(in, field.vegetation_.next_surface_id);
    if (tag != "ENVIRONMENT" || !field.vegetation_.next_surface_id)
      throw std::runtime_error("invalid environment");
    std::set<std::uint64_t> ids;
    for (auto n = count(MAX_SURFACES); n; --n) {
      SurfacePatch p;
      value(in, p.id);
      value(in, p.owner);
      value(in, p.edge);
      value(in, p.slot);
      for (auto *v : {&p.a.x, &p.a.y, &p.b.x, &p.b.y})
        scalar(in, *v, -tank::max_coordinate, tank::max_coordinate);
      scalar(in, p.normal.x, -1, 1);
      scalar(in, p.normal.y, -1, 1);
      scalar(in, p.length, 0, MAX_PATCH_LENGTH);
      scalar(in, p.algae, 0, PLAUSIBLE_AMOUNT);
      scalar(in, p.grass, 0, PLAUSIBLE_AMOUNT);
      scalar(in, p.sediment, 0, PLAUSIBLE_TOTAL);
      scalar(in, p.grass_max, 0, PLAUSIBLE_AMOUNT);
      value(in, p.stump);
      value(in, p.algae_spread);
      value(in, p.grass_spread);
      {
        scalar(in, p.root_height, -1, PLAUSIBLE_AMOUNT);
        scalar(in, p.root_lean, -PI, PI);
        scalar(in, p.algae_grazed, 0, PLAUSIBLE_AMOUNT);
        scalar(in, p.grass_grazed, 0, PLAUSIBLE_AMOUNT);
        scalar(in, p.detritus, 0, PLAUSIBLE_RUNNING);
        scalar(in, p.worms, 0, PLAUSIBLE_RUNNING);
      }
      if (!p.id || p.id >= field.vegetation_.next_surface_id || !ids.insert(p.id).second ||
          p.algae_spread > field.time || p.grass_spread > field.time)
        throw std::runtime_error("invalid surface");
      field.vegetation_.surfaces.push_back(p);
    }
    value(in, field.sediment_.columns);
    value(in, field.sediment_.rows);
    auto n = count(MAX_SEDIMENT_CELLS);
    if (field.sediment_.columns < 0 || field.sediment_.rows < 0 ||
        n != std::size_t(field.sediment_.columns * field.sediment_.rows))
      throw std::runtime_error("invalid sediment grid");
    field.sediment_.suspended.resize(n);
    for (auto &m : field.sediment_.suspended)
      scalar(in, m, 0, PLAUSIBLE_TOTAL);
    scalar(in, field.vegetation_.algae_added, 0, PLAUSIBLE_AMOUNT);
    scalar(in, field.vegetation_.grass_added, 0, PLAUSIBLE_AMOUNT);
    for (auto n = count(GROWTH_HISTORY); n; --n) {
      std::array<double, 2> h;
      for (auto &v : h)
        scalar(in, v, 0, PLAUSIBLE_AMOUNT);
      field.vegetation_.growth_history.push_back(h);
    }
    {
      std::string tag;
      value(in, tag);
      if (tag != "DRIFTING_GRASS")
        throw std::runtime_error("invalid drifting grass: " + tag);
      for (auto n = count(MAX_DRIFTING_GRASS); n; --n) {
        DriftingGrass d;
        auto &p = d.plant;
        value(in, d.id);
        value(in, d.age);
        value(in, d.root_contact);
        value(in, d.contact_surface);
        if (d.root_contact < -1 || d.root_contact > REPLANT_STEPS ||
            d.contact_surface >= field.vegetation_.next_surface_id)
          throw std::runtime_error("invalid root contact");
        scalar(in, d.x, 0, field.geometry_.width);
        scalar(in, d.y, 0, field.geometry_.height);
        scalar(in, d.vx, -MAX_DRIFT_SPEED, MAX_DRIFT_SPEED);
        scalar(in, d.vy, -MAX_DRIFT_SPEED, MAX_DRIFT_SPEED);
        value(in, p.id);
        scalar(in, p.grass, 0, PLAUSIBLE_AMOUNT);
        scalar(in, p.grass_max, 0, PLAUSIBLE_AMOUNT);
        scalar(in, p.root_height, -1, PLAUSIBLE_AMOUNT);
        scalar(in, p.length, MIN_DRIFT_PATCH, MAX_PATCH_LENGTH);
        for (std::size_t stem = 0; stem < PLANT_BLADES; ++stem)
          for (auto &q : p.blades[stem]) {
            scalar(in, q.x, -tank::max_coordinate, tank::max_coordinate);
            scalar(in, q.y, -tank::max_coordinate, tank::max_coordinate);
          }
        if (!d.id || d.id >= field.vegetation_.next_surface_id || !p.id ||
            p.id >= field.vegetation_.next_surface_id || !ids.insert(d.id).second)
          throw std::runtime_error("invalid drifting plant identity");
        p.stump = true;
        p.blade = p.blades[0];
        p.a = {d.x - p.length / 2, d.y};
        p.b = {d.x + p.length / 2, d.y};
        field.vegetation_.drifting_grass.push_back(d);
      }
    }
    {
      std::string tag;
      value(in, tag);
      if (tag != "GRASS_TRAITS" || count(MAX_PLANTS) != field.vegetation_.surfaces.size() +
                                                            field.vegetation_.drifting_grass.size())
        throw std::runtime_error("invalid grass traits");
      auto traits = [&](SurfacePatch &p) {
        for (auto &trait : p.grass_traits)
          scalar(in, trait, UNSET_TRAIT, 1);
        if (std::any_of(p.grass_traits.begin(), p.grass_traits.end(),
                        [](double v) { return v < 0; }) &&
            p.grass_traits != UNSET_TRAITS)
          throw std::runtime_error("invalid grass material");
      };
      for (auto &p : field.vegetation_.surfaces)
        traits(p);
      for (auto &d : field.vegetation_.drifting_grass)
        traits(d.plant);
    }

    {
      std::string tag;
      value(in, tag);
      if (tag != "PLANT_ORGANS" || count(MAX_PLANTS) != field.vegetation_.surfaces.size() +
                                                            field.vegetation_.drifting_grass.size())
        throw std::runtime_error("invalid plant structures");
      for (auto &p : field.vegetation_.surfaces)
        read_plant_organs(in, p, PLAUSIBLE_AMOUNT);
      for (auto &d : field.vegetation_.drifting_grass)
        read_plant_organs(in, d.plant, PLAUSIBLE_AMOUNT);
    }
    field.food_web_.read(in);
    field.sync_environment();
    field.sync_food_web();
  }
  field.feeding_.clouds = clouds;
  field.refresh_niche_limits();
}
}
