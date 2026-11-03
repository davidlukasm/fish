#include "json_numbers.hh"
#include "material.hh"
#include "world_view.hh"
#include "view_cache.hh"
#include "ecology.hh"
#include "plants.hh"
#include <iomanip>
namespace fishsim {
namespace {
// Bite marks show from VISIBLE_NOTCH depth on; grass is drawn SHOWN_GRASS_WIDTH of its width.
constexpr double VISIBLE_NOTCH = .02, SHOWN_GRASS_WIDTH = .7;
}
void WorldViewWriter::sources() {
  out << ",\"mating_distance\":" << world.taxonomy().mating_distance
      << ",\"hatches\":" << world.taxonomy().hatches
      << ",\"drained_food\":" << f.feeding().drained_food
      << ",\"bottom_residence\":" << f.env().rest_steps << ",\"sources\":[";
  for (int i = 0; i < f.source_count(); ++i) {
    if (i)
      out << ',';
    const auto p = f.food_cloud(i);
    out << '[' << p.x << ',' << p.y << ']';
  }
  out << ']';
  out << ",\"plankton_sources\":[";
  bool first_source = true;
  for (const auto &q : f.food_web().plankton.sources) {
    if (!first_source)
      out << ',';
    first_source = false;
    out << '[' << q.x * f.geometry().width << ',' << q.y * f.geometry().height << ']';
  }
  out << ']';
  out << ",\"placement_surfaces\":[";
  bool first_surface = true;
  for (const auto &s : f.vegetation().surfaces) {
    const auto depth = f.sediment_edges(&s - f.vegetation().surfaces.data());
    if (s.algae > 0 || s.stump || s.sediment > 0 || depth[0] > 0 || depth[1] > 0)
      continue;
    if (!first_surface)
      out << ',';
    first_surface = false;
    namespace P = placement_surface_column;
    std::array<double, P::count> row{};
    row[P::ax] = s.a.x;
    row[P::ay] = s.a.y;
    row[P::bx] = s.b.x;
    row[P::by] = s.b.y;
    row[P::nx] = s.normal.x;
    row[P::ny] = s.normal.y;
    row[P::sediment_left] = depth[0];
    row[P::sediment_right] = depth[1];
    row[P::algae_start] = s.algae_open[0];
    row[P::algae_end] = s.algae_open[1];
    out << '[';
    for (std::size_t k = 0; k < row.size(); ++k)
      out << (k ? "," : "") << row[k];
    out << ']';
  }
  out << ']';
  out << ",\"can_undo\":" << (status.can_undo ? "true" : "false")
      << ",\"selected_genome_available\":"
      << (world.exportable_genome(status.chosen ? status.chosen->id : world.watched_death)
              ? "true"
              : "false");
  out << ",\"selected_death\":{\"id\":" << world.watched_death
      << ",\"cause\":" << world.watched_cause << "}";
  out << ",\"food_flow\":{\"automatic\":"
      << std::max(0., f.feeding().food_supplied - f.feeding().food_initial -
                          f.feeding().food_manual - f.feeding().food_assisted)
      << ",\"assisted\":" << f.feeding().food_assisted << ",\"manual\":" << f.feeding().food_manual
      << ",\"initial\":" << f.feeding().food_initial << ",\"decayed\":" << f.feeding().food_decayed
      << ",\"support\":" << f.feeding().food_support
      << ",\"eaten\":" << world.metrics().performance_total.food
      << ",\"plankton\":" << f.food_web().food_eaten << "}";
  out << ",\"energy_supply\":{\"water_area\":" << f.food_web().plankton.water_area
      << ",\"total\":" << f.energy_supply() << ",\"artificial\":" << f.artificial_supply()
      << ",\"plankton\":" << f.plankton_supply() << ",\"benthic\":" << f.benthic_supply()
      << ",\"producers\":" << f.producer_supply() << ",\"nature\":" << f.feeding().nature_average
      << ",\"algae\":" << f.feeding().supply_algae << ",\"grass\":" << f.feeding().supply_grass
      << ",\"animal_initial\":" << f.food_web().initial
      << ",\"animal_introduced\":" << f.food_web().introduced << '}';
  out << ",\"source_budgets\":{\"fish\":[" << world.fish_energy() << ','
      << f.niche_limit(food_kind::fish) << "],\"food\":[" << f.food_energy() << ','
      << f.feeding().food_energy_limit << "],\"algae\":[" << f.algae_energy() << ','
      << f.niche_limit(food_kind::algae) << ',' << f.vegetation().algae_added << "],\"grass\":["
      << f.grass_energy() << ',' << f.niche_limit(food_kind::plant) << ','
      << f.vegetation().grass_added << ']';
  const auto stores = f.small_animal_stores();
  const std::array<const char *, animal_store::animals> names{"plankton", "worms", "crabs",
                                                              "mussels"};
  for (int k = 0; k < animal_store::animals; ++k)
    out << ",\"" << names[k] << "\":[" << stores[k] << ',' << f.niche_limit(store_food_kind(k))
        << ']';
  out << '}';
}
void WorldViewWriter::plants(ViewSchedule cadence) {
  out << ",\"plants\":[";
  cache.section(
      out, "plants",
      cadence.statistics || (cadence.environment && !f.vegetation().drifting_grass.empty()),
      [&](auto &out) {
        bool first_plant = true;
        auto write_plant = [&](const SurfacePatch &p, std::uint64_t id, std::uint64_t age,
                               bool drifting) {
          if (p.algae > 0 || p.stump || p.sediment > 0 ||
              (drifting ? 0 : f.sediment_edges(&p - f.vegetation().surfaces.data())[0]) > 0 ||
              (drifting ? 0 : f.sediment_edges(&p - f.vegetation().surfaces.data())[1]) > 0) {
            if (!first_plant)
              out << ',';
            first_plant = false;
            const auto depths = drifting ? std::array<double, 2>{0, 0}
                                         : f.sediment_edges(&p - f.vegetation().surfaces.data());
            auto write_root = [&](std::ostream &out) {
              namespace R = plant_root_column;
              Record(out, R::count)(R::height, p.root_height)(
                  R::depth, drifting ? 0 : std::max(0., sediment_depth(p) - p.root_height))(
                  R::drift_age, drifting ? age + 1 : 0)(R::id, p.id)(R::visual_depth,
                                                                     p.visual_depth)
                  .finish();
            };
            // The organs with their drawn curve, colour and visible bite marks (organ position,
            // signed depth share, half-width share).
            auto write_organs = [&](std::ostream &organs) {
              organs << '[';
              bool first = true;
              for (std::size_t j = 0; j < p.organs.size(); ++j) {
                const auto &o = p.organs[j];
                if (o.energy <= tolerance::negligible)
                  continue;
                if (!first)
                  organs << ',';
                first = false;
                std::vector<double> curve, notches;
                for (const auto &q : o.draw_curve) {
                  curve.push_back(q.x);
                  curve.push_back(q.y);
                }
                for (const auto &n : o.notches) {
                  const double depth = notch_depth(n, f.time, f.env().plant_notch_heal);
                  if (n.width <= 0 || std::abs(depth) < VISIBLE_NOTCH)
                    continue;
                  notches.insert(notches.end(), {n.at, depth, n.width});
                }
                namespace O = plant_organ_column;
                Record(organs, O::count)(O::id, j)(O::kind, o.kind)(O::parent, o.parent)
                    .list(O::curve, curve)(O::width, o.display_width)(O::hardness, o.hardness)(
                        O::energy, o.energy)(O::vitality, p.vitality)(O::attach, o.attach)
                    .list(O::color, plant_organ_color(p, int(j)))(
                        O::bite_hardness,
                        plant_bite_hardness(o.kind, grass_traits(p)[grass_trait::fiber], f.env(),
                                            drifting ? double(age) : -1))
                    .list(O::notches, notches)(O::cut, o.cuts)
                    .finish();
              }
              organs << ']';
            };
            namespace P = plant_column;
            Record(out, P::count)(P::id, id)(P::ax, p.a.x)(P::ay, p.a.y)(P::bx, p.b.x)(
                P::by, p.b.y)(P::nx, p.normal.x)(P::ny, p.normal.y)(P::algae, p.algae)(
                P::grass, p.grass)(P::stump, p.stump ? 1 : 0)(P::capacity, p.grass_max)(
                P::sediment, p.sediment)(P::length, p.length)(P::fiber, grass_fiber(p))(
                P::width, SHOWN_GRASS_WIDTH * grass_width(p, f.env().grass_capacity))(
                P::sediment_left, depths[0])(P::sediment_right, depths[1])
                .with(P::root, write_root)
                .list(P::color, grass_color(p))(P::form, grass_form(p))
                .with(P::organs, write_organs)(P::trait, grass_traits(p)[grass_trait::type])(
                    P::detritus, p.detritus)(P::worms, p.worms)(P::mussel_arc, p.mussel_arc)(
                    P::algae_start, p.algae_open[0])(P::algae_end, p.algae_open[1])
                .finish();
          }
        };
        for (const auto &p : f.vegetation().surfaces)
          write_plant(p, p.id, 0, false);
        for (const auto &d : f.vegetation().drifting_grass)
          write_plant(d.plant, d.id, d.age, true);
      });
  out << ']';
}
void WorldViewWriter::fields(ViewSchedule cadence) {
  auto light_bytes = [&](const auto &values) {
    return JsonViewCache::serialize(out, [&](auto &out) {
      out << '[';
      for (std::size_t k = 0; k < values.size(); ++k) {
        if (k)
          out << ',';
        out << std::lround(255 * std::clamp(double(values[k]), 0., 1.));
      }
      out << ']';
    });
  };
  cache.section(out, "light", cadence.light, [&](auto &out) {
    auto clear_asset = cache.light_template(light_bytes(f.lighting().clear_illumination));
    out << ",\"light\":{\"bottom\":" << f.env().light_bottom
        << ",\"shadow\":" << f.env().light_shadow << ",\"columns\":" << f.lighting().columns
        << ",\"rows\":" << f.lighting().rows
        << ",\"bytes\":" << (status.binary ? "[]" : light_bytes(f.lighting().illumination))
        << ",\"clear_asset\":" << clear_asset << "}";
  });
  out << ",\"daylight\":" << f.daylight();
  out << ",\"sediment\":{\"columns\":" << f.sediment().columns << ",\"rows\":" << f.sediment().rows
      << ",\"amounts\":[";
  cache.section(out, "sediment", cadence.environment, [&](auto &out) {
    if (status.binary)
      return;
    for (std::size_t k = 0; k < f.sediment().suspended.size(); ++k) {
      if (k)
        out << ',';
      out << f.sediment().suspended[k];
    }
  });
  out << "]}";
  const auto &p = f.food_web().plankton;
  out << ",\"odors\":{\"columns\":" << p.columns << ",\"rows\":" << p.rows << ",\"cells\":{";
  cache.section(out, "odors", cadence.environment, [&](auto &out) {
    bool first = true;
    for (int y = 0; y < p.rows; ++y)
      for (int x = 0; x < p.columns; ++x) {
        const auto values = f.odor_field((x + .5) * f.geometry().width / p.columns,
                                         (y + .5) * f.geometry().height / p.rows);
        if (std::none_of(values.begin(), values.end(), [](double v) { return v > 0; }))
          continue;
        if (!first)
          out << ',';
        first = false;
        out << '\"' << y * p.columns + x << "\":[";
        write_values(out, values);
        out << ']';
      }
  });
  out << "}}";

  out << ",\"plankton\":{\"columns\":" << p.columns << ",\"rows\":" << p.rows << ",\"amounts\":[";
  if (!status.binary)
    for (std::size_t i = 0; i < p.energy.size(); ++i) {
      if (i)
        out << ',';
      out << p.energy[i];
    }
  out << "]}";
}
void WorldViewWriter::environment(ViewSchedule cadence) {
  sources();
  plants(cadence);
  fields(cadence);
}
}
