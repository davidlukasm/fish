#include "session_io.hh"
#include "world_view.hh"
#include "view_cache.hh"
#include "ecology.hh"
#include "observations.hh"
#include "physiology.hh"
#include <iomanip>
namespace fishsim {
void WorldViewWriter::performance() {
  double adult_reserve = 0;
  for (const auto &p : world.fish)
    if (p.body.alive && p.body.hatched)
      adult_reserve += p.body.energy;
  const auto performance = world.performance();
  out << ",\"recent_diet\":[";
  for (std::size_t i = 0; i < DIET_COUNT; ++i) {
    if (i)
      out << ',';
    out << performance.diet[i];
  }
  out << ']';
  out << ",\"recent_drift\":" << performance.drift;
  out << ",\"performance\":{\"exposure\":" << performance.exposure << ",\"food_per_100\":"
      << 100 * performance.food / std::max<std::uint64_t>(1, performance.exposure)
      << ",\"ecosystem_per_100\":"
      << 100 * std::max(0., performance.nutrition - performance.food) /
             std::max<std::uint64_t>(1, performance.exposure)
      << ",\"qualified_deaths\":" << performance.natural_deaths
      << ",\"qualified_hatches\":" << performance.hatches
      << ",\"mean_reserve\":" << adult_reserve / std::max(1, world.adult_population())
      << ",\"window_steps\":" << performance.tick
      << ",\"window_target\":" << world.performance_window() << "}";
}
void WorldViewWriter::support() {
  const auto performance = world.performance();
  out << ",\"bursts\":{";
  bool first_pulse = true;
  for (const auto &item : std::array<std::pair<const char *, const BurstState *>, 2>{
           {{"food", &world.food_pulse}, {"mutation", &world.mutation_pulse}}}) {
    if (!first_pulse)
      out << ',';
    first_pulse = false;
    out << json_quoted(item.first)
        << ":{\"active\":" << (item.second->active(world.ticks) ? "true" : "false")
        << ",\"remaining\":"
        << (item.second->active(world.ticks)  ? item.second->until - world.ticks
            : item.second->next > world.ticks ? item.second->next - world.ticks
                                              : 0)
        << '}';
  }
  out << '}';
  {
    const auto &b = world.support().breeding_help;
    const auto effective = world.breeding_food();
    out << ",\"breeding_help\":{\"enabled\":" << (b.enabled ? "true" : "false")
        << ",\"target_per_100\":" << 100 * b.target << ",\"current_per_100\":" << 100 * b.current
        << ",\"scale\":" << b.scale << ",\"food_limit\":" << effective.limit
        << ",\"food_rate\":" << effective.rate << ",\"food_min\":" << effective.minimum
        << ",\"food_max\":" << effective.maximum << ",\"energy_limited\":"
        << (f.food_energy() + effective.minimum > f.feeding().food_energy_limit ? "true" : "false")
        << '}';
  }
  const auto protection = world.species_protection();
  out << ",\"assistance\":{\"factor\":" << world.assistance_factor()
      << ",\"eligible\":" << protection.eligible << ",\"threatened\":" << protection.threatened
      << ",\"target\":" << world.assistance_target()
      << ",\"shortfall\":" << world.assistance_shortfall()
      << ",\"species_minimum\":" << world.evo.assist_species_minimum
      << ",\"food_budget\":" << world.assistance_food_budget()
      << ",\"hatches\":" << performance.support_hatches
      << ",\"deaths\":" << performance.support_deaths << "}";
}
void WorldViewWriter::energy() {
  double fish_energy = 0, egg_energy = 0, corpse_energy = 0, sperm_energy = 0, gut_energy = 0;
  for (const auto &piece : f.feeding().pieces) {
    if (piece.origin == 1)
      fish_energy += piece.energy;
    else if (piece.origin == 2)
      egg_energy += piece.energy;
    else if (piece.origin == 3)
      corpse_energy += piece.energy;
  }
  for (const auto &s : world.sperm)
    sperm_energy += s.energy;
  for (const auto &p : world.fish)
    if (p.body.alive)
      (p.body.hatched ? fish_energy : egg_energy) += stored_energy(p.body);
  for (const auto &c : world.corpses)
    corpse_energy += c.energy;
  for (const auto &p : world.fish)
    if (p.body.alive)
      gut_energy += p.body.gut_energy;
  double drift = 0;
  for (const auto &p : f.vegetation().drifting_grass)
    drift += p.plant.grass;
  for (const auto &p : f.feeding().pieces)
    if (p.origin == 5)
      drift += p.energy;
  const auto stores = f.small_animal_stores();
  out << ",\"energy_breakdown\":{\"algae\":" << f.algae_energy()
      << ",\"grass\":" << std::max(0., f.grass_energy() - drift) << ",\"drift\":" << drift
      << ",\"food\":" << f.food_energy() << ",\"eggs\":" << egg_energy
      << ",\"fish\":" << std::max(0., fish_energy - gut_energy) << ",\"gut\":" << gut_energy
      << ",\"corpses\":" << corpse_energy << ",\"sperm\":" << sperm_energy
      << ",\"plankton\":" << stores[0] << ",\"worms\":" << stores[1] << ",\"crabs\":" << stores[2]
      << ",\"mussels\":" << stores[3] << ",\"detritus\":" << stores[4]
      << "},\"tank_energy\":" << world.total_energy()
      << ",\"energy_limit\":" << world.energy_limit()
      << ",\"corpses_eaten\":" << world.metrics().corpses_eaten
      << ",\"collision_deaths\":" << world.metrics().collision_deaths
      << ",\"feeding_rate\":" << f.energy_supply()
      << ",\"egg_energy_per_radius2\":" << EGG_ENERGY_PER_RADIUS2
      << ",\"neural_cost\":" << world.physiology().neural_cost
      << ",\"environment\":" << world.environment
      << ",\"budget_rejections\":" << world.metrics().budget_rejections;
}
void WorldViewWriter::counters() {
  out << ",\"step_phases\":[";
  for (std::size_t phase = 0; phase < world.step_ms.size(); ++phase) {
    if (phase)
      out << ',';
    out << world.step_ms[phase];
  }
  out << "],\"tick_ms\":" << status.tick_ms
      << ",\"released_eggs\":" << world.metrics().released_eggs
      << ",\"nutrient_eggs\":" << world.metrics().nutrient_eggs << ",\"nutrient_eggs_alive\":"
      << std::count_if(world.fish.begin(), world.fish.end(),
                       [](const Individual &p) { return p.nutrient_egg && p.body.alive; })
      << ",\"released_sperm\":" << world.metrics().released_sperm
      << ",\"sperm_releases\":" << world.sperm.size()
      << ",\"sperm_release_limit\":" << MAX_SPERM_RELEASES
      << ",\"fertilisations\":" << world.metrics().fertilisations
      << ",\"self_fertilisations\":" << world.support().self_fertilisations
      << ",\"expired_eggs\":" << world.metrics().expired_eggs
      << ",\"clonal_starts\":" << world.metrics().clonal_starts
      << ",\"clonal_hatches\":" << world.metrics().clonal_hatches
      << ",\"eggs_eaten\":" << world.metrics().eggs_eaten
      << ",\"novelty_strength\":" << world.novelty_strength;
}
void WorldViewWriter::parameters(const std::vector<ParameterInfo> &table) {
  out << ",\"parameters\":{";
  {
    bool first_parameter = true;
    for (const auto &q : table) {
      if (!first_parameter)
        out << ',';
      first_parameter = false;
      out << '"' << q.name << "\":" << q.value;
    }
  }
  out << "},\"parameter_info\":[";
  {
    bool first = true;
    for (const auto &q : table) {
      if (!first)
        out << ',';
      first = false;
      out << "{\"name\":" << json_quoted(q.name) << ",\"min\":" << q.lo << ",\"max\":" << q.hi
          << ",\"integer\":" << (q.integer ? "true" : "false")
          << ",\"group\":" << json_quoted(q.group) << ",\"step\":" << q.step
          << ",\"default\":" << q.initial_value << ",\"label\":" << json_quoted(q.label)
          << ",\"help\":" << json_quoted(q.help) << ",\"unit\":" << json_quoted(q.unit)
          << ",\"initial\":" << (q.initial ? "true" : "false") << '}';
    }
  }
  out << ']';
}
void WorldViewWriter::health() {
  out << ",\"energy_max\":" << ENERGY_MAX << ",\"death_causes\":[";
  for (std::size_t i = 0; i < world.metrics().death_causes.size(); ++i) {
    if (i)
      out << ',';
    out << world.metrics().death_causes[i];
  }
  out << "],\"recent_deaths\":[";
  for (std::size_t i = 0; i < world.recent_mortality.size(); ++i) {
    if (i)
      out << ',';
    const auto &d = world.recent_mortality[i];
    out << '[' << d[0] << ',' << d[1] << ',' << d[2] << ']';
  }
  out << "],\"disease\":{\"sick\":"
      << std::count_if(world.fish.begin(), world.fish.end(),
                       [](const Individual &p) {
                         return p.body.alive && p.body.hatched && p.body.disease > 0;
                       })
      << ",\"spontaneous\":" << world.metrics().disease_cases[0]
      << ",\"carrion\":" << world.metrics().disease_cases[1]
      << ",\"contact\":" << world.metrics().disease_cases[2]
      << ",\"food\":" << world.metrics().disease_cases[3]
      << ",\"deaths\":" << world.metrics().death_causes[7] << "}";
}
void WorldViewWriter::profiles(ViewSchedule cadence) {
  out << ",\"selected_body\":";
  cache.section(out, "selected-profile", cadence.statistics, [&](auto &out) {
    if (status.chosen && status.chosen->body.hatched)
      write_body_profile(out, *status.chosen);
    else
      out << "null";
  });
  bool first = true;
  out << ",\"archive\":[";
  cache.section(out, "statistics", cadence.statistics, [&](auto &out) {
    for (std::size_t i = 0; i < world.support().archive.size(); ++i) {
      if (i)
        out << ',';
      const auto &a = world.support().archive[i];
      out << "{\"id\":" << i << ",\"quality\":" << a.quality << ",\"novelty\":" << a.novelty
          << ",\"tick\":" << a.tick
          << ",\"nodes\":" << (a.genome.blueprint ? a.genome.blueprint->neurons.size() : 0)
          << ",\"lineage\":" << json_quoted(a.genome.cppn->history()->lineage())
          << ",\"environment\":" << a.environment << ",\"descriptor\":[";
      for (std::size_t k = 0; k < a.behavior.size(); ++k) {
        if (k)
          out << ',';
        out << a.behavior[k];
      }
      out << "]}";
    }
    out << "],\"behavior\":[";
    first = true;
    for (const auto &p : world.fish)
      if (p.body.hatched) {
        if (!first)
          out << ',';
        first = false;
        out << "{\"id\":" << p.id << ",\"species\":" << p.species << ",\"novelty\":" << p.novelty
            << ",\"samples\":" << p.observations().window_steps << ",\"eligible\":"
            << (p.developing() && p.observations().window_steps >= 80 &&
                        p.observations().window_nutrition > 0
                    ? "true"
                    : "false")
            << ",\"descriptor\":[";
        auto d = p.behavior();
        for (std::size_t k = 0; k < d.size(); ++k) {
          if (k)
            out << ',';
          out << d[k];
        }
        out << "]}";
      }
    out << "],\"traits\":[";
    first = true;
    for (const auto &p : world.fish)
      if (p.body.hatched) {
        if (!first)
          out << ',';
        first = false;
        out << "{\"id\":" << p.id << ",\"diet\":[";
        for (std::size_t k = 0; k < DIET_COUNT; ++k) {
          if (k)
            out << ',';
          out << p.observations().diet[k];
        }
        out << "],\"raw_diet\":[";
        for (std::size_t k = 0; k < DIET_COUNT; ++k) {
          if (k)
            out << ',';
          out << p.observations().raw_diet[k];
        }
        out << "],\"digested\":" << p.body.digested
            << ",\"drift_grass\":" << p.observations().drift_nutrition
            << ",\"ecology_steps\":" << p.observations().ecology_steps << ",\"ecology\":[";
        for (int k = 0; k < 5; ++k) {
          if (k)
            out << ',';
          out << p.observations().habitat_totals[k];
        }
        out << "],\"habitat_steps\":" << p.observations().habitat_steps << ",\"bottom\":"
            << double(p.observations().bottom_steps) /
                   std::max<std::uint64_t>(1, p.observations().habitat_steps)
            << ",\"top\":"
            << double(p.observations().top_steps) /
                   std::max<std::uint64_t>(1, p.observations().habitat_steps)
            << '}';
      }
    out << "],\"species\":";
    write_species(out, world, true);
  });
}
void WorldViewWriter::statistics(const std::vector<ParameterInfo> &table) {
  performance();
  support();
  energy();
  counters();
  parameters(table);
  health();
}
}
