#include "material.hh"
#include "world_view.hh"
#include "view_cache.hh"
#include "ecology.hh"
#include "plants.hh"
#include <iomanip>
namespace fishsim {
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
    out << '[' << s.a.x << ',' << s.a.y << ',' << s.b.x << ',' << s.b.y << ',' << s.normal.x << ','
        << s.normal.y << ',' << depth[0] << ',' << depth[1] << ',' << s.algae_open[0] << ','
        << s.algae_open[1] << ']';
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
  out << ",\"source_budgets\":{\"fish\":[" << world.fish_energy() << ',' << f.niche_limit(1)
      << "],\"food\":[" << f.food_energy() << ',' << f.feeding().food_energy_limit
      << "],\"algae\":[" << f.algae_energy() << ',' << f.niche_limit(4) << ','
      << f.vegetation().algae_added << "],\"grass\":[" << f.grass_energy() << ','
      << f.niche_limit(5) << ',' << f.vegetation().grass_added << ']';
  const auto stores = f.small_animal_stores();
  const char *names[] = {"plankton", "worms", "crabs", "mussels"};
  for (int k = 0; k < 4; ++k)
    out << ",\"" << names[k] << "\":[" << stores[k] << ',' << f.niche_limit(6 + k) << ']';
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
            out << '[' << id << ',' << p.a.x << ',' << p.a.y << ',' << p.b.x << ',' << p.b.y << ','
                << p.normal.x << ',' << p.normal.y << ',' << p.algae << ',' << p.grass << ','
                << (p.stump ? 1 : 0) << ',' << p.grass_max << ',' << p.sediment << ',' << p.length
                << ',' << grass_fiber(p) << ',' << .7 * grass_width(p, f.env().grass_capacity);
            auto depths = drifting ? std::array<double, 2>{0, 0}
                                   : f.sediment_edges(&p - f.vegetation().surfaces.data());
            out << ',' << depths[0] << ',' << depths[1] << ",[" << p.root_height << ','
                << (drifting ? 0 : std::max(0., sediment_depth(p) - p.root_height)) << ','
                << (drifting ? age + 1 : 0) << ',' << p.id << ',' << p.visual_depth << "],[";
            auto tint = grass_color(p);
            out << tint[0] << ',' << tint[1] << ',' << tint[2] << "]," << grass_form(p) << ",[";
            bool first = true;
            for (std::size_t j = 0; j < p.organs.size(); ++j) {
              const auto &o = p.organs[j];
              if (o.energy <= 1e-9)
                continue;
              if (!first)
                out << ',';
              first = false;
              out << '[' << j << ',' << o.kind << ',' << o.parent << ",[";
              for (int k = 0; k < 4; ++k) {
                if (k)
                  out << ',';
                out << o.draw_curve[k].x << ',' << o.draw_curve[k].y;
              }
              out << "]," << o.display_width << ',' << o.hardness << ',' << o.energy << ','
                  << p.vitality << ',' << o.attach << ",[";
              auto color = plant_organ_color(p, int(j));
              out << color[0] << ',' << color[1] << ',' << color[2] << "],"
                  << plant_bite_hardness(o.kind, grass_traits(p)[0], f.env(),
                                         drifting ? double(age) : -1)
                  << ",[";
              // Visible bite marks: organ position, signed depth share, half-width share.
              bool first_notch = true;
              for (const auto &n : o.notches) {
                const double depth = notch_depth(n, f.time, f.env().plant_notch_heal);
                if (n.width <= 0 || std::abs(depth) < .02)
                  continue;
                if (!first_notch)
                  out << ',';
                first_notch = false;
                out << n.at << ',' << depth << ',' << n.width;
              }
              out << "]]";
            }
            out << "]," << grass_traits(p)[3] << ',' << p.detritus << ',' << p.worms << ','
                << p.mussel_arc << ',' << p.algae_open[0] << ',' << p.algae_open[1] << ']';
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
        for (int c = 0; c < 8; ++c) {
          if (c)
            out << ',';
          out << values[c];
        }
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
