#include "state_environment.hh"
#include "state_validation.hh"
#include "environment.hh"
#include "physiology_parameters.hh"
#include <set>
namespace fishsim {
using state::scalar;
using state::value;
void read_plant_organs(std::istream &in, SurfacePatch &p, double grass_limit) {
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };

  std::string tag;
  value(in, tag);
  // PLANT_STRUCTURE2 adds the bite marks of every organ.
  if (tag != "PLANT_STRUCTURE" && tag != "PLANT_STRUCTURE2")
    throw std::runtime_error("invalid plant structure");
  const bool notches = tag == "PLANT_STRUCTURE2";
  scalar(in, p.vitality, 0, 1);
  scalar(in, p.spin, -.1, .1);
  value(in, p.plant_age);
  scalar(in, p.visual_depth, -1, 1);
  for (auto n = count(64); n; --n) {
    PlantOrgan o;
    value(in, o.kind);
    value(in, o.parent);
    if (o.kind < 0 || o.kind > 3 || o.parent < -1 || o.parent >= int(p.organs.size()))
      throw std::runtime_error("invalid plant attachment");
    scalar(in, o.attach, 0, 1);
    scalar(in, o.length, 0, 4);
    scalar(in, o.width, 0, 16);
    scalar(in, o.target, .000001, 1e7);
    scalar(in, o.energy, 0, grass_limit);
    scalar(in, o.root, -1, 1e9);
    scalar(in, o.hardness, .1, 16);
    value(in, o.ready);
    value(in, o.bare_steps);
    scalar(in, o.loose_width, 0, 16);
    scalar(in, o.loose_length, 0, 1e6);
    scalar(in, o.elongation, 0, 1);
    for (auto &q : o.curve) {
      scalar(in, q.x, -1e6, 1e6);
      scalar(in, q.y, -1e6, 1e6);
    }
    if (notches)
      for (auto &n : o.notches) {
        scalar(in, n.at, 0, 1);
        scalar(in, n.depth, -1, 1);
        scalar(in, n.width, 0, 1);
        value(in, n.time);
      }
    p.organs.push_back(o);
  }
}
void EnvironmentCheckpoint::read_geometry(std::istream &in, Field &field) {
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  field.geometry_.obstacles.clear();
  for (auto n = count(64); n; --n) {
    Obstacle o;
    scalar(in, o.x, -1000000, 1000000);
    scalar(in, o.y, -1000000, 1000000);
    scalar(in, o.radius, 1, 10000);
    for (auto j = count(32); j; --j) {
      Point p;
      scalar(in, p.x, -1000000, 1000000);
      scalar(in, p.y, -1000000, 1000000);
      o.vertices.push_back(p);
    }
    if (!o.vertices.empty() && o.vertices.size() < 3)
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
  scalar(in, w.cell, 32, 32);
  if (w.columns < 0 || w.rows < 0 || w.columns > 154 || w.rows > 103)
    throw std::runtime_error("invalid water grid");
  for (auto *v : {&w.u, &w.v}) {
    auto n = count(20000);
    v->resize(n);
    for (auto &x : *v)
      scalar(in, x, -16, 16);
  }
  if (w.u.size() != std::size_t((w.columns + 1) * w.rows) ||
      w.v.size() != std::size_t(w.columns * (w.rows + 1)))
    throw std::runtime_error("invalid water state");
  w.solid.resize(w.columns * w.rows);
}
void EnvironmentCheckpoint::read(std::istream &in, Field &field, PhysiologyParameters &physiology) {
  scalar(in, field.geometry_.width, 615, 4920);
  scalar(in, field.geometry_.height, 410, 3280);
  value(in, field.feeding_.density);
  scalar(in, field.flow, 0, 2);
  scalar(in, field.gravity, 0, .3);
  value(in, field.time);
  scalar(in, physiology.neural_cost, .01, 100);
  scalar(in, field.feeding_.source_motion, 0, 1000);
  value(in, field.feeding_.drained_food);
  value(in, field.rng.engine);
  scalar(in, field.feeding_.nature_average, 0, 1e12);
  scalar(in, field.feeding_.nature_intake, 0, 1e12);
  scalar(in, field.feeding_.food_assisted, 0, 1e18);
  std::vector<FoodCloud> clouds(state::count(in, 2000));
  for (auto &cloud : clouds) {
    scalar(in, cloud.position.x, 0, 1);
    scalar(in, cloud.position.y, 0, 1);
    scalar(in, cloud.angle, -PI, PI);
    scalar(in, cloud.turn, -.00003, .00003);
  }
  field.indexed_ = false;
  if (field.feeding_.density < 0 || field.feeding_.density > 20000)
    throw std::runtime_error("invalid initial food");
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  field.feeding_.pieces.clear();
  for (auto n = count(2000000); n; --n) {
    Food f;
    scalar(in, f.x, 0, field.geometry_.width);
    scalar(in, f.y, 0, field.geometry_.height);
    scalar(in, f.vx, -16, 16);
    scalar(in, f.vy, -16, 16);
    value(in, f.bottom_steps);
    if (f.bottom_steps > 100000)
      throw std::runtime_error("invalid settled food");
    scalar(in, f.energy, 0, 20000);
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
      if (f.origin < 0 || f.origin > 9)
        throw std::runtime_error("invalid food origin");
      scalar(in, f.radius, 0, std::max(double(MAX_BODY_RADIUS), food_radius(1e9)));
      scalar(in, f.initial_energy, 0, 1e9);
      scalar(in, f.decay_age, 0, 1e12);
      scalar(in, f.buoyancy, -4, 4);
      for (auto &c : f.color)
        scalar(in, c, 0, 1);
      value(in, f.drift_plant);
      scalar(in, f.hardness, 0, 2);
      value(in, f.blunt);
      value(in, f.bitten);
    }
    field.feeding_.pieces.push_back(f);
  }
  read_geometry(in, field);
  field.feeding_.feeders.clear();
  for (auto n = count(64); n; --n) {
    Feeder f;
    scalar(in, f.x, 0, field.geometry_.width);
    scalar(in, f.y, 0, field.geometry_.height);
    scalar(in, f.radius, 1, 300);
    scalar(in, f.rate, 0, 100);
    field.feeding_.feeders.push_back(f);
  }
  for (auto n = count(64); n; --n) {
    CurrentSource source;
    scalar(in, source.x, 0, field.geometry_.width);
    scalar(in, source.y, 0, field.geometry_.height);
    scalar(in, source.angle, -PI, PI);
    scalar(in, source.width, 32, 600);
    scalar(in, source.strength, 0, 6);
    scalar(in, source.noise, -10, 10);
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
    for (auto n = count(200000); n; --n) {
      SurfacePatch p;
      value(in, p.id);
      value(in, p.owner);
      value(in, p.edge);
      value(in, p.slot);
      for (auto *v : {&p.a.x, &p.a.y, &p.b.x, &p.b.y})
        scalar(in, *v, -1000000, 1000000);
      scalar(in, p.normal.x, -1, 1);
      scalar(in, p.normal.y, -1, 1);
      scalar(in, p.length, 0, 16.001);
      scalar(in, p.algae, 0, 1e7);
      scalar(in, p.grass, 0, 1e7);
      scalar(in, p.sediment, 0, 1e15);
      scalar(in, p.grass_max, 0, 1e7);
      value(in, p.stump);
      value(in, p.algae_spread);
      value(in, p.grass_spread);
      {
        scalar(in, p.root_height, -1, 1e9);
        scalar(in, p.root_lean, -PI, PI);
        scalar(in, p.algae_grazed, 0, 1e9);
        scalar(in, p.grass_grazed, 0, 1e9);
        scalar(in, p.detritus, 0, 1e12);
        scalar(in, p.worms, 0, 1e12);
      }
      if (!p.id || p.id >= field.vegetation_.next_surface_id || !ids.insert(p.id).second ||
          p.algae_spread > field.time || p.grass_spread > field.time)
        throw std::runtime_error("invalid surface");
      field.vegetation_.surfaces.push_back(p);
    }
    value(in, field.sediment_.columns);
    value(in, field.sediment_.rows);
    auto n = count(20000);
    if (field.sediment_.columns < 0 || field.sediment_.rows < 0 ||
        n != std::size_t(field.sediment_.columns * field.sediment_.rows))
      throw std::runtime_error("invalid sediment grid");
    field.sediment_.suspended.resize(n);
    for (auto &m : field.sediment_.suspended)
      scalar(in, m, 0, 1e15);
    scalar(in, field.vegetation_.algae_added, 0, 1e9);
    scalar(in, field.vegetation_.grass_added, 0, 1e9);
    for (auto n = count(200); n; --n) {
      std::array<double, 2> h;
      for (auto &v : h)
        scalar(in, v, 0, 1e9);
      field.vegetation_.growth_history.push_back(h);
    }
    {
      std::string tag;
      value(in, tag);
      if (tag != "DRIFTING_GRASS")
        throw std::runtime_error("invalid drifting grass: " + tag);
      for (auto n = count(20000); n; --n) {
        DriftingGrass d;
        auto &p = d.plant;
        value(in, d.id);
        value(in, d.age);
        value(in, d.root_contact);
        value(in, d.contact_surface);
        if (d.root_contact < -1 || d.root_contact > 60 ||
            d.contact_surface >= field.vegetation_.next_surface_id)
          throw std::runtime_error("invalid root contact");
        scalar(in, d.x, 0, field.geometry_.width);
        scalar(in, d.y, 0, field.geometry_.height);
        scalar(in, d.vx, -16, 16);
        scalar(in, d.vy, -16, 16);
        value(in, p.id);
        scalar(in, p.grass, 0, 1e9);
        scalar(in, p.grass_max, 0, 1e7);
        scalar(in, p.root_height, -1, 1e9);
        scalar(in, p.length, .001, 16.001);
        for (int stem = 0; stem < 8; ++stem)
          for (auto &q : p.blades[stem]) {
            scalar(in, q.x, -1e6, 1e6);
            scalar(in, q.y, -1e6, 1e6);
          }
        if (!d.id || d.id >= field.vegetation_.next_surface_id || !p.id ||
            p.id >= field.vegetation_.next_surface_id || !ids.insert(d.id).second)
          throw std::runtime_error("invalid drifting plant identity");
        p.stump = true;
        p.blade = p.blades[0];
        p.a = {d.x - p.length * .5, d.y};
        p.b = {d.x + p.length * .5, d.y};
        field.vegetation_.drifting_grass.push_back(d);
      }
    }
    {
      std::string tag;
      value(in, tag);
      if (tag != "GRASS_TRAITS" || count(220000) != field.vegetation_.surfaces.size() +
                                                        field.vegetation_.drifting_grass.size())
        throw std::runtime_error("invalid grass traits");
      auto traits = [&](SurfacePatch &p) {
        for (int k = 0; k < 4; ++k)
          scalar(in, p.grass_traits[k], -1, 1);
        if (std::any_of(p.grass_traits.begin(), p.grass_traits.end(),
                        [](double v) { return v < 0; }) &&
            p.grass_traits != std::array<double, 4>{-1, -1, -1, -1})
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
      if (tag != "PLANT_ORGANS" || count(220000) != field.vegetation_.surfaces.size() +
                                                        field.vegetation_.drifting_grass.size())
        throw std::runtime_error("invalid plant structures");
      for (auto &p : field.vegetation_.surfaces)
        read_plant_organs(in, p, 1e9);
      for (auto &d : field.vegetation_.drifting_grass)
        read_plant_organs(in, d.plant, 1e9);
    }
    field.food_web_.read(in);
    field.sync_environment();
    field.sync_food_web();
  }
  // Geometry setup may move sources out of obstacles. A checkpoint restores exact positions.
  field.feeding_.clouds = clouds;
  field.refresh_niche_limits();
}
}
