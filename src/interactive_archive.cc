#include "interactive_session.hh"
#include "session_io.hh"
#include "plants.hh"
#include "checkpoint.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "json_numbers.hh"
#include "interactive.hh"
#include "opencl.hh"
#include "ecology.hh"
#include "founders.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include "observations.hh"
#include "ecology_internal.hh"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <thread>
#include <poll.h>
#include <unistd.h>
namespace fishsim {
std::string InteractiveSession::serialize(const Ecosystem &saved, bool mode, bool protect) {
  return serialize_checkpoint({saved, session_founder, selected, last_observation,
                               seen_notifications, mode, protect, completed});
}
void InteractiveSession::snapshot(bool manual, std::uint64_t request) {
  bool full = manual;
  std::ostringstream pop;
  if (full) {
    std::vector<Genome> genes;
    for (const auto &p : world.fish)
      genes.push_back(p.genome);
    write_population(pop, genes);
  }
  double neural_total = 0;
  for (const auto &p : world.fish)
    if (p.body.hatched && p.genome.blueprint)
      neural_total += p.genome.blueprint->neurons.size();
  std::size_t archive_size =
      std::count_if(world.support().archive.begin(), world.support().archive.end(),
                    [&](const ArchiveEntry &a) { return a.environment == world.environment; });
  int best_index = 0;
  double best = world.metrics().dead_window_best;
  for (std::size_t i = 0; i < world.fish.size(); ++i) {
    const auto &p = world.fish[i];
    double rate =
        1000. * p.observations().window_nutrition / std::max(1, p.observations().window_steps);
    if (rate > best) {
      best = rate;
      best_index = int(i);
    }
  }
  if (manual)
    for (std::size_t i = 0; i < world.fish.size(); ++i)
      if (world.fish[i].id == selected)
        best_index = int(i);
  auto stem = o.session + "/spool/" + std::to_string(world.ticks) + "-" +
              std::to_string(Clock::now().time_since_epoch().count());
  if (full) {
    atomic_text(stem + ".population", pop.str());
    const auto saved = serialize(world, evolving, protected_life);
    atomic_text(stem + ".state", saved);
    if (!live)
      atomic_text(o.session + "/latest.state", saved);
  }
  std::cout << std::setprecision(10) << "{\"event\":\"" << (manual ? "bookmark" : "observation")
            << "\",\"request\":" << request
            << ",\"ecological\":true,\"observation_window\":" << completed
            << ",\"step\":" << world.ticks
            << ",\"population_path\":" << json_quoted(full ? stem + ".population" : "")
            << ",\"state_path\":" << json_quoted(full ? stem + ".state" : "")
            << ",\"best_index\":" << best_index << ",\"historical\":" << (live ? "true" : "false")
            << ",\"experiment\":" << (reference ? "true" : "false")
            << ",\"population_size\":" << world.population_size() << ",\"selected\":" << selected
            << ",\"species_id\":" << (world.fish.empty() ? 0 : world.fish[best_index].species)
            << ",\"archive_size\":" << archive_size << ",\"average\":"
            << 1000. * world.metrics().window_nutrition /
                   std::max<std::uint64_t>(1, world.metrics().window_exposure)
            << ",\"best\":" << best << ",\"births\":" << world.metrics().window_births
            << ",\"deaths\":" << world.metrics().window_deaths
            << ",\"rescues\":" << world.metrics().window_rescues << ",\"natural_adults\":"
            << std::count_if(world.fish.begin(), world.fish.end(),
                             [](const Individual &p) { return p.body.hatched && p.g >= 1; })
            << ",\"total_rescues\":" << world.metrics().rescues
            << ",\"total_imports\":" << world.metrics().imports << ",\"total_adult_deaths\":"
            << world.metrics().death_causes[0] + world.metrics().death_causes[1] +
                   world.metrics().death_causes[6] + world.metrics().death_causes[7]
            << ",\"total_births\":" << world.metrics().births
            << ",\"hatches\":" << world.taxonomy().hatches
            << ",\"fertilisations\":" << world.metrics().fertilisations
            << ",\"self_fertilisations\":" << world.support().self_fertilisations
            << ",\"reproductive_descendants\":" << world.taxonomy().reproductive_descendants
            << ",\"adults\":" << world.adult_population()
            << ",\"support_need\":" << world.assistance_need() << ",\"support_ratio\":"
            << (world.performance().support_deaths
                    ? std::to_string(double(world.performance().support_hatches) /
                                     world.performance().support_deaths)
                    : "null")
            << ",\"species_count\":"
            << std::count_if(world.taxonomy().species.begin(), world.taxonomy().species.end(),
                             [&](const GeneticSpecies &s) {
                               return std::any_of(
                                   world.fish.begin(), world.fish.end(), [&](const Individual &p) {
                                     return p.species == s.id && p.body.alive && p.body.hatched;
                                   });
                             })
            << ",\"mean_neurons\":" << neural_total / std::max(1, world.adult_population())
            << ",\"tank_energy\":" << world.total_energy()
            << ",\"food_energy\":" << world.field.food_energy()
            << ",\"environment\":" << world.environment << ",\"species\":";
  write_species(std::cout, world, true);
  std::cout << ",\"events\":[";
  for (std::size_t i = 0; i < world.events.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << "{\"tick\":" << world.events[i].tick
              << ",\"command\":" << json_quoted(world.events[i].command) << '}';
  }
  std::cout << "]}\n" << std::flush;
  if (!world.support().reserve.empty())
    world.support().reserve.front().save(o.output);
}
void InteractiveSession::curate() {
  if (live || world.ticks % 100)
    return;
  auto publish = [&](const char *kind, const std::string &key, const Individual &p, double value,
                     bool genes) {
    std::ostringstream genome;
    if (genes)
      p.genome.write(genome);
    std::cout << "{\"event\":\"genome-candidate\",\"kind\":" << json_quoted(kind)
              << ",\"key\":" << json_quoted(key) << ",\"value\":" << value
              << ",\"step\":" << world.ticks << ",\"fish\":";
    write_individual(std::cout, p);
    std::cout << ",\"intake\":{\"diet\":[";
    for (std::size_t k = 0; k < DIET_COUNT; ++k) {
      if (k)
        std::cout << ',';
      std::cout << p.observations().diet[k];
    }
    std::cout << "],\"raw_diet\":[";
    for (std::size_t k = 0; k < DIET_COUNT; ++k) {
      if (k)
        std::cout << ',';
      std::cout << p.observations().raw_diet[k];
    }
    std::cout << "]},\"species\":";
    write_species(std::cout, world, true, p.species);
    std::cout << ",\"genome\":" << "";
    json_string(std::cout, genome.str());
    std::cout << "}\n" << std::flush;
  };
  for (const std::string key : {"nutrition", "offspring", "age", "generation"}) {
    const Individual *winner = nullptr;
    double value = 0;
    for (const auto &p : world.fish)
      if (p.body.hatched && p.body.nutrition_steps >= 500) {
        double score = key == "nutrition"
                           ? 100 * p.body.nutrition / std::max(1, p.body.nutrition_steps)
                       : key == "offspring" ? p.offspring
                       : key == "age"       ? p.body.age
                       : p.offspring > 0    ? p.g
                                            : 0;
        if (score > value) {
          value = score;
          winner = &p;
        }
      }
    auto &old = record_candidates[key];
    if (winner && value > old.first) {
      publish("record", key, *winner, value, old.second != winner->id);
      old = {value, winner->id};
    }
  }
  for (const auto &species : world.taxonomy().species)
    if (species.confirmed && species.successful_offspring > recent_success[species.id]) {
      const Individual *winner = nullptr;
      for (const auto &p : world.fish)
        if (p.species == species.id && p.body.hatched && p.body.nutrition_steps >= 80 &&
            p.offspring > 0 && (!winner || p.offspring > winner->offspring))
          winner = &p;
      if (winner) {
        publish("recent", std::to_string(species.id), *winner, species.successful_offspring, true);
        recent_success[species.id] = species.successful_offspring;
      }
    }
}
void InteractiveSession::autosave(bool final) {
  if (o.choose_population)
    return;
  try {
    if (writer.busy() && !final)
      return;
    writer.finish();
    auto state = capture_checkpoint(
        live ? *live : world, live_founder ? *live_founder : session_founder, selected,
        live ? live_mode : evolving, live ? live_protect : protected_life, completed,
        last_observation, seen_notifications);
    writer.save(o.session + "/latest.state", std::move(state));
    if (final)
      writer.finish();
  } catch (const std::exception &error) {
    if (final)
      throw;
    std::cerr << "Autosave fehlgeschlagen: " << error.what() << '\n';
  }
}
}
