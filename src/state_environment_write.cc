#include "state_environment.hh"
#include "environment.hh"
#include "physiology_parameters.hh"
#include <ostream>
namespace fishsim {
void EnvironmentCheckpoint::write(std::ostream &out, const Field &field,
                                  const PhysiologyParameters &physiology) {
  out << field.geometry_.width << ' ' << field.geometry_.height << ' ' << field.feeding_.density
      << ' ' << field.flow << ' ' << field.gravity << ' ' << field.time << ' '
      << physiology.neural_cost << ' ' << field.feeding_.source_motion << ' '
      << field.feeding_.drained_food << '\n'
      << field.rng.engine << '\n';
  out << field.feeding_.nature_average << ' ' << field.feeding_.nature_intake << ' '
      << field.feeding_.food_assisted << '\n';
  out << field.feeding_.clouds.size() << '\n';
  for (const auto &cloud : field.feeding_.clouds)
    out << cloud.position.x << ' ' << cloud.position.y << ' ' << cloud.angle << ' ' << cloud.turn
        << '\n';
  out << field.feeding_.pieces.size() << '\n';
  for (const auto &p : field.feeding_.pieces) {
    out << p.x << ' ' << p.y << ' ' << p.vx << ' ' << p.vy << ' ' << p.bottom_steps << ' '
        << p.energy << ' ' << p.age << ' ' << p.cloud << "\nFRAGMENT " << p.origin << ' '
        << p.radius << ' ' << p.initial_energy << ' ' << p.decay_age << ' ' << p.buoyancy;
    for (auto c : p.color)
      out << ' ' << c;
    out << ' ' << p.drift_plant << ' ' << p.hardness << ' ' << p.blunt << ' ' << p.bitten << '\n';
  }
  out << field.geometry_.obstacles.size() << '\n';
  for (const auto &o : field.geometry_.obstacles) {
    out << o.x << ' ' << o.y << ' ' << o.radius << ' ' << o.vertices.size() << '\n';
    for (const auto &v : o.vertices)
      out << v.x << ' ' << v.y << ' ';
    out << '\n';
  }
  out << "OBSTACLE_IDS " << field.geometry_.next_obstacle_id;
  for (const auto &o : field.geometry_.obstacles)
    out << ' ' << o.id;
  out << '\n';
  out << field.feeding_.feeders.size() << '\n';
  for (const auto &f : field.feeding_.feeders)
    out << f.x << ' ' << f.y << ' ' << f.radius << ' ' << f.rate << '\n';
  out << field.currents().size() << '\n';
  for (const auto &source : field.currents())
    out << source.x << ' ' << source.y << ' ' << source.angle << ' ' << source.width << ' '
        << source.strength << ' ' << source.noise << '\n';
  out << field.water_.columns << ' ' << field.water_.rows << ' ' << field.water_.cell << '\n';
  for (const auto *v : {&field.water_.u, &field.water_.v}) {
    out << v->size() << ' ';
    for (auto x : *v)
      out << x << ' ';
    out << '\n';
  }
  out << "ENVIRONMENT " << field.vegetation_.next_surface_id << ' '
      << field.vegetation_.surfaces.size() << '\n';
  for (const auto &p : field.vegetation_.surfaces)
    out << p.id << ' ' << p.owner << ' ' << p.edge << ' ' << p.slot << ' ' << p.a.x << ' ' << p.a.y
        << ' ' << p.b.x << ' ' << p.b.y << ' ' << p.normal.x << ' ' << p.normal.y << ' ' << p.length
        << ' ' << p.algae << ' ' << p.grass << ' ' << p.sediment << ' ' << p.grass_max << ' '
        << p.stump << ' ' << p.algae_spread << ' ' << p.grass_spread << ' ' << p.root_height << ' '
        << p.root_lean << ' ' << p.algae_grazed << ' ' << p.grass_grazed << ' ' << p.detritus << ' '
        << p.worms << '\n';
  out << field.sediment_.columns << ' ' << field.sediment_.rows << ' '
      << field.sediment_.suspended.size();
  for (double m : field.sediment_.suspended)
    out << ' ' << m;
  out << '\n';
  out << field.vegetation_.algae_added << ' ' << field.vegetation_.grass_added << ' '
      << field.vegetation_.growth_history.size();
  for (auto h : field.vegetation_.growth_history)
    out << ' ' << h[0] << ' ' << h[1];
  out << '\n';
  out << "DRIFTING_GRASS " << field.vegetation_.drifting_grass.size() << '\n';
  for (const auto &d : field.vegetation_.drifting_grass) {
    const auto &p = d.plant;
    out << d.id << ' ' << d.age << ' ' << d.root_contact << ' ' << d.contact_surface << ' ' << d.x
        << ' ' << d.y << ' ' << d.vx << ' ' << d.vy << ' ' << p.id << ' ' << p.grass << ' '
        << p.grass_max << ' ' << p.root_height << ' ' << p.length;
    for (const auto &c : p.blades)
      for (auto q : c)
        out << ' ' << q.x << ' ' << q.y;
    out << '\n';
  }
  out << "GRASS_TRAITS "
      << field.vegetation_.surfaces.size() + field.vegetation_.drifting_grass.size();
  auto traits = [&](const SurfacePatch &p) {
    for (double v : p.grass_traits)
      out << ' ' << v;
  };
  for (const auto &p : field.vegetation_.surfaces)
    traits(p);
  for (const auto &d : field.vegetation_.drifting_grass)
    traits(d.plant);
  out << '\n';
  out << "PLANT_ORGANS "
      << field.vegetation_.surfaces.size() + field.vegetation_.drifting_grass.size() << '\n';
  auto organs = [&](const SurfacePatch &p) {
    out << "PLANT_STRUCTURE2 " << p.vitality << ' ' << p.spin << ' ' << p.plant_age << ' '
        << p.visual_depth << ' ' << p.organs.size();
    for (const auto &o : p.organs) {
      out << ' ' << o.kind << ' ' << o.parent << ' ' << o.attach << ' ' << o.length << ' '
          << o.width << ' ' << o.target << ' ' << o.energy << ' ' << o.root << ' ' << o.hardness
          << ' ' << o.ready << ' ' << o.bare_steps << ' ' << o.loose_width << ' ' << o.loose_length
          << ' ' << o.elongation;
      for (auto q : o.curve)
        out << ' ' << q.x << ' ' << q.y;
      for (const auto &n : o.notches)
        out << ' ' << n.at << ' ' << n.depth << ' ' << n.width << ' ' << n.time;
    }
    out << '\n';
  };
  for (const auto &p : field.vegetation_.surfaces)
    organs(p);
  for (const auto &d : field.vegetation_.drifting_grass)
    organs(d.plant);
  field.food_web_.write(out);
}
}
