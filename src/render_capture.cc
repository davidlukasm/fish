#include "protocol_schema.hh"
#include "render_capture.hh"
#include "ecology.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include "material.hh"
#include <cmath>
#include <unordered_map>
namespace fishsim {
namespace {
double fraction(double value, double capacity) {
  return capacity > 0 ? std::max(0., value / capacity) : 0.;
}
std::string fish_record(const Individual &p, const Ecosystem &world, const RenderView &view,
                        std::uint32_t asset) {
  namespace F = render_wire::fish;
  const auto &b = p.body;
  const auto &m = b.motor();
  const auto &r = b.reproduction();
  RenderRow row(RenderKind::Fish);
  row.set(F::x, view.coordinate(b.x));
  row.set(F::y, view.coordinate(b.y));
  row.set(F::angle, std::remainder(b.angle, 2 * PI));
  row.set(F::birth_step, double(world.ticks) - b.age);
  const auto *anatomy = p.genome.interface.get();
  namespace Flag = render_wire::fish_flag;
  unsigned flags =
      (b.hatched ? Flag::hatched : 0) | (p.fertilised ? Flag::fertilised : 0) |
      (p.nutrient_egg ? Flag::nutrient_egg : 0) | (r.egg_laying ? Flag::egg_laying : 0) |
      (p.clonal ? Flag::clonal : 0) |
      (anatomy && anatomy->anatomy[anatomy_column::eggs] > 0 ? Flag::egg_organs : 0) |
      (anatomy && anatomy->anatomy[anatomy_column::sperm] > 0 ? Flag::sperm_organs : 0);
  row.set(F::flags, flags);
  row.set(F::development, b.development() ? b.development()->progress() : 1);
  row.set(F::red, b.color[0]);
  row.set(F::green, b.color[1]);
  row.set(F::blue, b.color[2]);
  row.set(F::health, b.health);
  row.set(F::radius, collision_radius(b));
  row.set(F::mass, body_mass(b));
  row.set(F::energy, fraction(b.energy, reserve_capacity(b)));
  row.set(F::reserve_capacity, reserve_capacity(b));
  row.set(F::egg_yolk, fraction(r.egg_yolk, r.egg_limit));
  row.set(F::egg_capacity, r.egg_limit);
  row.set(F::sperm_store, fraction(r.sperm_store, r.sperm_limit));
  row.set(F::sperm_capacity, r.sperm_limit);
  row.set(F::tissue, b.tissue);
  row.set(F::mouth_aperture, maximum_mouth_aperture(b));
  row.set(F::mouth_pose, m.mouth_pose);
  row.set(F::bite_pose, m.bite_pose);
  row.set(F::suction_pose, m.suction_pose);
  row.set(F::defense, b.defense());
  row.set(F::aggression, m.aggression);
  row.set(F::relative_speed, m.relative_speed);
  row.set(F::tail, m.tail);
  row.set(F::impulse_left, m.impulse_left);
  row.set(F::impulse_right, m.impulse_right);
  row.set(F::impulse_forward, m.impulse_forward);
  row.set(F::motor_factor, m.motor_factor);
  row.set(F::bladder_fill, b.bladder_fill);
  row.set(F::satiety, gut_filling(b));
  row.set(F::pain, b.pain);
  row.set(F::fin_age_left, m.fin_stroke_age[0]);
  row.set(F::fin_age_right, m.fin_stroke_age[1]);
  row.set(F::fin_peak_tail, m.fin_stroke_peak[0]);
  row.set(F::fin_peak_left, m.fin_stroke_peak[1]);
  row.set(F::fin_peak_right, m.fin_stroke_peak[2]);
  row.set(F::morphology_asset, asset);
  row.set(F::hatch_radius, predicted_hatch_radius(b, p.genome, world.physiology().neural_cost));
  row.set(F::birth_tissue, b.birth_tissue);
  row.set(F::hatch_step, b.hatched ? double(world.ticks) - b.age + b.hatch_age : -1);
  row.set(F::species, p.species);
  row.set(F::gut_fill, b.gut_fill);
  row.set(F::gut_energy, b.gut_energy);
  row.set(F::gut_digestible, b.gut_digestible);
  row.set(F::digestion, b.digestion);
  row.set(F::digested, b.digested);
  row.set(F::feeding_action, b.feeding_action);
  row.set(F::feeding_action_age, b.feeding_action_age);
  row.set(F::mouth_phase, b.mouth.phase);
  row.set(F::mouth_cycle, b.mouth.cycle);
  row.set(F::mouth_biting, b.mouth.biting);
  row.set(F::mouth_budget, b.mouth.budget);
  row.set(F::swallowed, b.mouth.swallowed);
  row.set(F::filtered, b.mouth.filtered);
  row.set(F::mouth_offset, mouth_offset(b));

  return std::move(row).finish();
}
std::string food_record(const Food &p, const Ecosystem &world, const RenderView &view) {
  namespace F = render_wire::food;
  RenderRow row(RenderKind::Food);
  row.set(F::x, view.coordinate(p.x));
  row.set(F::y, view.coordinate(p.y));
  row.set(F::energy, p.energy);
  row.set(F::birth_step, double(world.ticks) - double(p.age));
  row.set(F::bottom_step, p.bottom_steps ? double(world.ticks) - p.bottom_steps : -1);
  row.set(F::radius, food_radius(p));
  row.set(F::origin, p.origin);
  const auto color = world.field.food_color(p);
  row.set(F::red, color[0]);
  row.set(F::green, color[1]);
  row.set(F::blue, color[2]);
  return std::move(row).finish();
}
std::string corpse_record(const Corpse &p, const Ecosystem &world, const RenderView &view,
                          std::uint32_t asset) {
  namespace F = render_wire::corpse;
  RenderRow row(RenderKind::Corpse);
  row.set(F::x, view.coordinate(p.x));
  row.set(F::y, view.coordinate(p.y));
  row.set(F::energy, p.energy);
  row.set(F::birth_step, double(world.ticks) - double(p.age));
  const auto color = remains_color(p, world.field.feeding().food_bright,
                                   world.field.env().decay_half_life, world.field.env().bone_time);
  row.set(F::red, color[0]);
  row.set(F::green, color[1]);
  row.set(F::blue, color[2]);
  row.set(F::angle, std::remainder(p.angle, 2 * PI));
  row.set(F::radius, p.radius);
  row.set(F::initial_energy, p.initial_energy);
  row.set(F::hatched, p.hatched);
  row.set(F::bone_age, p.bone_age);
  row.set(F::bone_time, world.field.env().bone_time);
  row.set(F::resting, p.resting);
  row.set(F::sink_phase, std::clamp(double(p.age) / world.field.env().corpse_sink_time, 0., 1.));
  row.set(F::source_id, p.blood_id);
  row.set(F::species, p.species);
  row.set(F::death_cause, p.death_cause);
  row.set(F::morphology_asset, asset);
  return std::move(row).finish();
}
std::string gamete_record(std::size_t at, const Field::SpermCell &p, const Field &f,
                          const RenderView &view) {
  namespace F = render_wire::gamete;
  const auto &grid = f.food_web().plankton;
  RenderRow row(RenderKind::Gamete);
  row.set(F::x, view.coordinate((at % grid.columns + .5) * grid.width / grid.columns));
  row.set(F::y, view.coordinate((at / grid.columns + .5) * grid.height / grid.rows));
  row.set(F::density, p.density);
  row.set(F::red, p.color[0]);
  row.set(F::green, p.color[1]);
  row.set(F::blue, p.color[2]);
  return std::move(row).finish();
}
void wound(RenderRows &rows, const RenderView &view, double world_width, std::uint64_t id,
           double loss, double x, double y, double nx, double ny, double radius, double vx,
           double vy) {
  if (loss <= 0 || !view.includes(x, y, 8 * radius, world_width))
    return;
  namespace F = render_wire::wound;
  RenderRow row(RenderKind::Wound);
  row.set(F::loss, loss);
  row.set(F::x, view.coordinate(x));
  row.set(F::y, view.coordinate(y));
  row.set(F::nx, nx);
  row.set(F::ny, ny);
  row.set(F::radius, radius);
  row.set(F::vx, vx);
  row.set(F::vy, vy);
  rows.emplace(id, std::move(row).finish());
}
void fields(RenderCapture &capture, const Ecosystem &world, const RenderView &view) {
  const auto &f = world.field;
  const auto &light = f.lighting();
  const auto &sediment = f.sediment();
  const auto &plankton = f.food_web().plankton;
  capture.plankton_columns = plankton.columns;
  capture.plankton_rows = plankton.rows;
  capture.light_columns = light.columns;
  capture.light_rows = light.rows;
  capture.sediment_columns = sediment.columns;
  capture.sediment_rows = sediment.rows;
  auto visible = [&](std::size_t i, unsigned columns, unsigned rows) {
    if (!columns || !rows)
      return false;
    double width = f.geometry().width / columns, height = f.geometry().height / rows;
    return view.includes((i % columns + .5) * width, (i / columns + .5) * height,
                         std::hypot(width, height), f.geometry().width);
  };
  for (std::size_t i = 0; i < light.illumination.size(); ++i)
    if (visible(i, light.columns, light.rows))
      capture.light.emplace(
          std::uint32_t(i),
          std::uint8_t(std::lround(255 * std::clamp(light.illumination[i], 0., 1.))));
  const auto area = sediment.columns && sediment.rows ? f.geometry().width * f.geometry().height /
                                                            (sediment.columns * sediment.rows)
                                                      : 1;
  const double p_quantum = plankton.columns && plankton.rows
                               ? f.geometry().width * f.geometry().height /
                                     (plankton.columns * plankton.rows * 64. * 255)
                               : 1;
  for (std::size_t i = 0; i < plankton.energy.size(); ++i)
    if (visible(i, plankton.columns, plankton.rows))
      capture.plankton.emplace(std::uint32_t(i),
                               float(std::round(plankton.energy[i] / p_quantum) * p_quantum));
  const auto quantum = area / (64 * 255);
  for (std::size_t i = 0; i < sediment.suspended.size(); ++i)
    if (visible(i, sediment.columns, sediment.rows))
      capture.sediment.emplace(std::uint32_t(i),
                               float(std::round(sediment.suspended[i] / quantum) * quantum));
}
}
RenderCapture capture_render(const Ecosystem &world, const RenderView &view, std::uint64_t selected,
                             const RenderAssetLookup &assets) {
  RenderCapture result;
  const double width = world.field.geometry().width;
  auto &fish = result.rows[std::size_t(RenderKind::Fish)],
       &food = result.rows[std::size_t(RenderKind::Food)],
       &corpses = result.rows[std::size_t(RenderKind::Corpse)],
       &gametes = result.rows[std::size_t(RenderKind::Gamete)],
       &wounds = result.rows[std::size_t(RenderKind::Wound)];
  for (const auto &p : world.fish) {
    const auto &b = p.body;
    if (p.id == selected || view.includes(b.x, b.y, 8 * collision_radius(b), width)) {
      const auto asset = assets.fish ? assets.fish(p) : 0;
      fish.emplace(p.id, fish_record(p, world, view, asset));
    }
    wound(wounds, view, width, p.id, b.motor().blood_loss, b.x, b.y, b.motor().blood_x,
          b.motor().blood_y, collision_radius(b), b.motor().vx, b.motor().vy);
  }
  if (view.configured && view.scale < .75) {
    // Only the picture combines subpixel grains. Feeding and motion keep their real objects.
    const double cell = std::exp2(std::ceil(std::log2(6 / view.scale)));
    const int columns = int(std::ceil(width / cell)),
              rows = int(std::ceil(world.field.geometry().height / cell));
    struct Group {
      Food sample;
      double area = 0, x = 0, y = 0, age = 0;
      unsigned count = 0;
      explicit Group(const Food &p) : sample(p) { sample.energy = 0; }
    };
    std::unordered_map<std::uint64_t, Group> groups;
    for (const auto &p : world.field.feeding().pieces) {
      if (!view.includes(p.x, p.y, food_radius(p), width))
        continue;
      if (food_radius(p) * view.scale >= 1) {
        food.emplace(p.render_id, food_record(p, world, view));
        continue;
      }
      const auto key = std::uint64_t(std::max(0, p.origin)) * columns * rows +
                       std::uint64_t(std::clamp(int(p.y / cell), 0, rows - 1)) * columns +
                       std::clamp(int(p.x / cell), 0, columns - 1);
      auto &g = groups.try_emplace(key, p).first->second;
      g.sample.energy += p.energy;
      g.area += food_radius(p) * food_radius(p);
      g.x += p.x;
      g.y += p.y;
      g.age += p.age;
      ++g.count;
    }
    for (auto &[key, g] : groups) {
      g.sample.x = g.x / g.count;
      g.sample.y = g.y / g.count;
      g.sample.age = std::uint64_t(g.age / g.count);
      g.sample.radius = std::min(.4 * cell, std::sqrt(g.area));
      food.emplace((1ULL << 48) + key, food_record(g.sample, world, view));
    }
  } else {
    for (const auto &p : world.field.feeding().pieces)
      if (view.includes(p.x, p.y, food_radius(p), width))
        food.emplace(p.render_id, food_record(p, world, view));
  }
  for (const auto &p : world.corpses) {
    if (p.blood_id == selected || view.includes(p.x, p.y, 8 * corpse_extent(p), width))
      corpses.emplace(p.render_id,
                      corpse_record(p, world, view, assets.corpse ? assets.corpse(p) : 0));
    wound(wounds, view, width, p.blood_id, p.blood_loss, p.x, p.y, p.blood_x, p.blood_y,
          corpse_extent(p), p.vx, p.vy);
  }
  const auto &grid = world.field.food_web().plankton;
  for (std::size_t at = 0; at < world.field.sperm_field().size(); ++at) {
    const auto &p = world.field.sperm_field()[at];
    const double x = (at % grid.columns + .5) * grid.width / grid.columns,
                 y = (at / grid.columns + .5) * grid.height / grid.rows;
    if (p.density > 0 &&
        view.includes(x, y, std::hypot(grid.width / grid.columns, grid.height / grid.rows), width))
      gametes.emplace(at + 1, gamete_record(at, p, world.field, view));
  }
  const auto &f = world.field;
  std::map<std::uint64_t, const SurfacePatch *> patches;
  for (const auto &s : f.vegetation().surfaces)
    patches.emplace(s.id, &s);
  auto small = [&](std::uint64_t id, std::uint64_t patch, double x, double y, double energy,
                   double radius, int kind, double morph = 0, const WormHead *head = nullptr,
                   double state = 0, double direction = 1, double closed = 0, double ground = 1,
                   const Crab *crab = nullptr, double shell_angle = 0,
                   const Mussel *mussel = nullptr) {
    if ((energy <= 0 &&
         !(kind == invertebrate_kind::mussel && state == mussel_state::empty_shell)) ||
        !view.includes(x, y,
                       head
                           ? std::hypot(f.delta_x(head->x - head->base_x), head->y - head->base_y) +
                                 2 * radius
                           : 2 * radius,
                       width))
      return;
    namespace F = render_wire::invertebrate;
    RenderRow row(RenderKind::Invertebrate);
    row.set(F::x, view.coordinate(x));
    row.set(F::y, view.coordinate(y));
    row.set(F::energy, energy);
    row.set(F::radius, radius);
    row.set(F::kind, kind);
    row.set(F::morph, morph);

    row.set(F::direction, direction);
    row.set(F::closed, closed);
    const auto found = patches.find(patch);
    const auto *s = found == patches.end() ? nullptr : found->second;
    row.set(F::ground,
            crab ? double(crab->crossing <= 0 && s && sediment_depth(*s) > .01) : ground);
    row.set(F::state, head && s ? std::atan2(s->normal.x, -s->normal.y) : state);
    row.set(F::angle,
            kind == invertebrate_kind::mussel && state == mussel_state::empty_shell ? shell_angle
            : head ? std::atan2(head->y - head->base_y, f.delta_x(head->x - head->base_x)) + PI / 2
            : crab && s ? crab_display_angle(*crab, std::atan2(s->normal.x, -s->normal.y))
            : s         ? std::atan2(s->normal.x, -s->normal.y)
                        : 0);
    const auto depths = s ? f.sediment_edges(std::size_t(s - f.vegetation().surfaces.data()))
                          : std::array<double, 2>{0, 0};
    row.set(F::bed_depth,
            s ? sediment_front(head ? head->base_x : x, head ? head->base_y : y, s->a.x, s->a.y,
                               s->b.x, s->b.y, s->normal.x, s->normal.y, depths[0], depths[1])
              : .5);
    row.set(F::body_length, head ? worm_length(head->id, head->morph) : 0);
    row.set(F::feeding_rate, crab     ? crab->feeding.rate
                             : mussel ? mussel->filter_rate
                             : head   ? head->filter_rate
                                      : 0);
    row.set(F::food_x, crab ? crab->feeding.x : x);
    row.set(F::food_y, crab ? crab->feeding.y : y);
    row.set(F::food_kind, crab ? crab->feeding.kind : food_kind::plankton);
    row.set(F::filtered, mussel ? mussel->filtered : 0);
    row.set(F::length, head ? std::hypot(f.delta_x(head->x - head->base_x), head->y - head->base_y)
                       : crab ? crab->stride
                              : 0);
    row.set(F::algae, kind == invertebrate_kind::mussel && s
                          ? std::clamp(s->algae / std::max(1., f.algae_capacity(*s)), 0., 1.)
                          : 0);
    result.rows[std::size_t(RenderKind::Invertebrate)].emplace(id, std::move(row).finish());
  };
  for (const auto &v : f.food_web().heads)
    small(v.id, v.patch, v.x, v.y, v.energy, worm_head_radius, invertebrate_kind::worm, v.morph, &v,
          0, 1, 0, v.ground);
  for (const auto &v : f.food_web().crabs)
    small(v.id, v.patch, v.x, v.y, v.energy, crab_radius(v.energy, f.env(), v.morph),
          invertebrate_kind::crab, v.morph, nullptr, crab_display_state(v), v.direction, v.exposure,
          1, &v);
  for (const auto &v : f.food_web().mussels)
    small(v.id, v.patch, v.x, v.y, v.energy, mussel_radius(v.energy, f.env(), v.morph),
          invertebrate_kind::mussel, v.morph, nullptr, mussel_state::living, 1,
          v.closed > 0 ? 1 : 0, 1, nullptr, 0, &v);
  for (const auto &s : f.food_web().shells)
    small(s.id, 0, s.x, s.y, 0, s.radius, invertebrate_kind::mussel, s.morph, nullptr,
          mussel_state::empty_shell, 1, 0, 1, nullptr, s.angle);
  for (std::size_t i = 0; i < f.food_web().grazing.size(); ++i) {
    const auto &g = f.food_web().grazing[i];
    small(std::uint64_t(9000000000000ULL + std::uint64_t(std::max(0., std::floor(g.x / 8))) +
                        65536ULL * std::uint64_t(std::max(0., std::floor(g.y / 8)))),
          0, g.x, g.y, g.amount, std::max(.5, g.radius), invertebrate_kind::grazing);
  }
  fields(result, world, view);
  return result;
}
}
