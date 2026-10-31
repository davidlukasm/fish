#include "world_view.hh"
#include "view_cache.hh"
#include "ecology.hh"
#include "observations.hh"
#include "physiology.hh"
#include "ecology_internal.hh"
#include "render_capture.hh"
#include "material.hh"
#include "protocol_schema.hh"
#include <iomanip>
namespace fishsim {
void WorldViewWriter::population(ViewSchedule cadence) {
  out << ",\"fish\":[";
  bool first = true;
  for (const auto &p : world.fish) {
    if (!first)
      out << ',';
    first = false;
    write_individual(out, p, cache.morphology(out, p), world.physiology().neural_cost);
  }
  out << "],\"wounds\":[";
  first = true;
  auto wound = [&](std::uint64_t id, double loss, double x, double y, double nx, double ny,
                   double radius, double vx, double vy) {
    if (loss <= 0)
      return;
    if (!first)
      out << ',';
    first = false;
    out << '[' << id << ',' << loss << ',' << x << ',' << y << ',' << nx << ',' << ny << ','
        << radius << ',' << vx << ',' << vy << ']';
  };
  if (!status.binary)
    for (const auto &p : world.fish) {
      const auto &b = p.body;
      wound(p.id, b.motor().blood_loss, b.x, b.y, b.motor().blood_x, b.motor().blood_y,
            collision_radius(b), b.motor().vx, b.motor().vy);
    }
  if (!status.binary)
    for (const auto &c : world.corpses)
      wound(c.blood_id, c.blood_loss, c.x, c.y, c.blood_x, c.blood_y, corpse_extent(c), c.vx, c.vy);
  out << "],\"buried\":[";
  first = true;
  for (const auto &p : world.fish) {
    double cover = f.sediment_immersion(p.body.x, p.body.y, collision_radius(p.body));
    if (cover > .05) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << p.id << ',' << cover << ']';
    }
  }
  out << "],\"fauna_next_id\":" << f.food_web().next_id << ",\"food\":[";
  cache.section(out, "food", cadence.particles, [&](auto &out) {
    if (status.binary)
      return;
    first = true;
    for (const auto &p : f.feeding().pieces) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << p.x << ',' << p.y << ',' << p.energy << ',' << p.render_id << ',' << p.age
          << ',' << p.bottom_steps << ',' << food_radius(p) << ',' << p.origin;
      for (auto c : f.food_color(p))
        out << ',' << c;
      out << ']';
    }
  });
  out << "] ,\"invertebrates\":[";
  if (!status.binary) {
    std::map<std::uint64_t, const SurfacePatch *> patches;
    for (const auto &p : f.vegetation().surfaces)
      patches.emplace(p.id, &p);
    bool first = true;
    auto animal = [&](std::uint64_t id, std::uint64_t patch, double x, double y, double energy,
                      double radius, int kind, double morph = 0, const WormHead *head = nullptr,
                      double state = 0, double direction = 1, double closed = 0, double ground = 1,
                      const Crab *crab = nullptr, double shell_angle = 0,
                      const Mussel *mussel = nullptr) {
      if (energy <= 0 && !(kind == 9 && state == 1))
        return;
      if (!first)
        out << ',';
      first = false;
      const auto it = patches.find(patch);
      const auto *s = it == patches.end() ? nullptr : it->second;
      namespace F = invertebrate_column;
      std::array<double, F::count> row{};
      row[F::x] = x;
      row[F::y] = y;
      row[F::energy] = energy;
      row[F::radius] = radius;
      row[F::kind] = kind;
      row[F::red] = kind == 7 ? .7 : kind == 8 ? .55 : .25;
      row[F::green] = kind == 7 ? .15 : .3;
      row[F::blue] = kind == 7 ? .15 : kind == 8 ? .2 : .35;
      row[F::angle] =
          (kind == 9 && state == 1 ? shell_angle
           : head ? std::atan2(head->y - head->base_y, f.delta_x(head->x - head->base_x)) + PI / 2
           : crab && s ? crab_display_angle(*crab, std::atan2(s->normal.x, -s->normal.y))
           : s         ? std::atan2(s->normal.x, -s->normal.y)
                       : 0);
      row[F::algae] =
          (s && kind == 9 ? std::clamp(s->algae / std::max(1., f.algae_capacity(*s)), 0., 1.) : 0);
      row[F::length] = (head ? std::hypot(f.delta_x(head->x - head->base_x), head->y - head->base_y)
                        : crab ? crab->stride
                               : 0);
      row[F::morph] = morph;
      row[F::state] = head && s ? std::atan2(s->normal.x, -s->normal.y) : state;
      row[F::direction] = direction;
      row[F::closed] = closed;
      row[F::ground] = crab ? double(crab->crossing <= 0 && s && sediment_depth(*s) > .01) : ground;
      const auto depths = s ? f.sediment_edges(std::size_t(s - f.vegetation().surfaces.data()))
                            : std::array<double, 2>{0, 0};
      row[F::bed_depth] =
          (s ? sediment_front(head ? head->base_x : x, head ? head->base_y : y, s->a.x, s->a.y,
                              s->b.x, s->b.y, s->normal.x, s->normal.y, depths[0], depths[1])
             : .5);
      row[F::body_length] = head ? worm_length(head->id, head->morph) : 0;
      row[F::feeding_rate] = (crab     ? crab->feeding.rate
                              : mussel ? mussel->filter_rate
                              : head   ? head->filter_rate
                                       : 0);
      row[F::food_x] = crab ? crab->feeding.x : x;
      row[F::food_y] = crab ? crab->feeding.y : y;
      row[F::food_kind] = crab ? crab->feeding.kind : 6;
      row[F::filtered] = mussel ? mussel->filtered : 0;
      out << '[';
      for (std::size_t column = 0; column < row.size(); ++column) {
        if (column)
          out << ',';
        if (column == F::id)
          out << id;
        else
          out << row[column];
      }
      out << ']';
    };
    for (const auto &v : f.food_web().heads)
      animal(v.id, v.patch, v.x, v.y, v.energy, worm_head_radius, 7, v.morph, &v, 0, 1, 0,
             v.ground);
    for (const auto &v : f.food_web().crabs)
      animal(v.id, v.patch, v.x, v.y, v.energy, crab_radius(v.energy, f.env(), v.morph), 8, v.morph,
             nullptr, crab_display_state(v), v.direction, v.exposure, 1, &v);
    for (const auto &v : f.food_web().mussels)
      animal(v.id, v.patch, v.x, v.y, v.energy, mussel_radius(v.energy, f.env(), v.morph), 9,
             v.morph, nullptr, 0, 1, v.closed > 0 ? 1 : 0, 1, nullptr, 0, &v);
    for (std::size_t i = 0; i < f.food_web().grazing.size(); ++i) {
      const auto &g = f.food_web().grazing[i];
      animal(std::uint64_t(9000000000000ULL + std::uint64_t(std::max(0., std::floor(g.x / 8))) +
                           65536ULL * std::uint64_t(std::max(0., std::floor(g.y / 8)))),
             0, g.x, g.y, g.amount, std::max(.5, g.radius), 6);
    }
    for (const auto &s : f.food_web().shells)
      animal(s.id, 0, s.x, s.y, 0, s.radius, 9, s.morph, nullptr, 1, 1, 0, 1, nullptr, s.angle);
  }
  out << ']';
}
void WorldViewWriter::geometry() {
  out << ",\"obstacles\":[";
  bool first = true;
  for (const auto &p : f.geometry().obstacles) {
    if (!first)
      out << ',';
    first = false;
    out << '[' << p.x << ',' << p.y << ',' << p.radius << ']';
  }
  out << "],\"shapes\":[";
  first = true;
  for (const auto &o : f.geometry().obstacles) {
    if (!first)
      out << ',';
    first = false;
    out << '[';
    for (std::size_t i = 0; i < o.vertices.size(); ++i) {
      if (i)
        out << ',';
      out << '[' << o.vertices[i].x << ',' << o.vertices[i].y << ']';
    }
    out << ']';
  }
  out << "],\"feeders\":[";
  first = true;
  for (const auto &q : f.feeding().feeders) {
    if (!first)
      out << ',';
    first = false;
    out << '[' << q.x << ',' << q.y << ',' << q.radius << ',' << q.rate << ']';
  }
  out << "],\"currents\":[";
  first = true;
  for (const auto &q : f.currents()) {
    if (!first)
      out << ',';
    first = false;
    out << '[' << q.x << ',' << q.y << ',' << q.angle << ',' << q.width << ',' << q.strength << ','
        << std::clamp(q.strength * (1 + q.noise), 0., 6.) << ']';
  }
  out << ']';
}
void WorldViewWriter::particles(ViewSchedule cadence) {
  out << ",\"gametes\":[";
  bool first = true;
  if (!status.binary) {
    const auto &grid = f.food_web().plankton;
    for (std::size_t at = 0; at < f.sperm_field().size(); ++at) {
      const auto &q = f.sperm_field()[at];
      if (q.density <= 0)
        continue;
      if (!first)
        out << ',';
      first = false;
      out << '[' << (at % grid.columns + .5) * grid.width / grid.columns << ','
          << (at / grid.columns + .5) * grid.height / grid.rows << ',' << q.density << ','
          << q.color[0] << ',' << q.color[1] << ',' << q.color[2] << ',' << at + 1 << ']';
    }
  }
  out << "],\"combat\":[";
  first = true;
  for (const auto &q : world.combat_effects) {
    if (!first)
      out << ',';
    first = false;
    out << '[' << q.id << ',' << q.tick << ',' << q.kind << ',' << q.source << ',' << q.target
        << ',' << q.x << ',' << q.y << ',' << q.angle << ',' << q.radius << ',' << q.strength;
    for (auto c : q.color)
      out << ',' << c;
    out << ']';
  }
  out << "],\"water\":[";
  cache.section(out, "water", cadence.environment, [&](auto &out) {
    first = true;
    for (int j = 1; j < f.water().rows; j += 3)
      for (int i = 1; i < f.water().columns; i += 3) {
        auto v = f.water().velocity(i * f.water().cell, j * f.water().cell);
        if (v.x == 0 && v.y == 0)
          continue;
        if (!first)
          out << ',';
        first = false;
        out << '[' << i * f.water().cell << ',' << j * f.water().cell << ',' << v.x << ',' << v.y
            << ']';
      }
  });
  out << "],\"corpses\":[";
  cache.section(out, "corpses", cadence.particles, [&](auto &out) {
    if (status.binary)
      return;
    cache.begin_corpses();
    first = true;
    for (const auto &c : world.corpses) {
      if (!first)
        out << ',';
      first = false;
      auto color =
          remains_color(c, f.feeding().food_bright, f.env().decay_half_life, f.env().bone_time);
      out << '[' << c.x << ',' << c.y << ',' << c.energy << ',' << c.age;
      for (int k = 0; k < 3; ++k)
        out << ',' << color[k];
      out << ',' << c.render_id << ',' << c.angle << ',' << corpse_extent(c) << ','
          << c.initial_energy << ',' << (c.hatched ? 1 : 0) << ',' << c.bone_age << ',';
      auto id = cache.corpse(out, c);
      out << id << ',' << c.blood_id << ',' << c.species << ',' << c.death_cause << ','
          << f.env().bone_time << ',' << c.resting << ','
          << std::clamp(double(c.age) / f.env().corpse_sink_time, 0., 1.);
      out << ']';
    }
  });
  out << ']';
}
}
