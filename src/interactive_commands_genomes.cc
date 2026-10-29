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
#include "founder_pool.hh"
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
void InteractiveSession::start_genome_experiment(const std::string &op, std::istringstream &line,
                                                 std::string &) {
  if (op == "experiment") {
    std::string kind;
    std::uint64_t id;
    int neuron;
    if (line >> kind >> id >> neuron) {
      if (live)
        throw std::runtime_error("Return to the live tank before starting an experiment");
      if (kind != "vision" && kind != "nutrient" && kind != "neuron")
        throw std::runtime_error("Unknown experiment");
      auto target = std::find_if(world.fish.begin(), world.fish.end(),
                                 [&](const Individual &p) { return p.id == id && p.body.brain(); });
      if (target == world.fish.end())
        throw std::runtime_error("Tier besitzt noch kein aktives Gehirn.");
      if (kind == "neuron" &&
          (neuron < 0 || std::size_t(neuron) >= target->genome.blueprint->neurons.size()))
        throw std::runtime_error("Zuerst ein Neuron im Gehirn auswählen.");
      live_mode = evolving;
      live_protect = protected_life;
      live = world.fork();
      reference = world.fork();
      experiment_fish = id;
      experiment_start = world.ticks;
      experiment_kind = kind;
      experiment_count = 0;
      for (auto &p : world.fish)
        if (p.id == id && p.body.brain()) {
          if (kind == "neuron") {
            p.body.mute_neuron(neuron);
            experiment_count = 1;
          } else {
            int sense = kind == "vision" ? 0 : 5;
            p.body.disable_sense(sense);
            for (const auto &r : p.genome.interface->sensory)
              experiment_count += r.senses[sense] > 0;
          }
        }
      world.reset_window();
      reference->reset_window();
      evolving = false;
      protected_life = false;
      notice = "Vergleichskopie: " + std::to_string(experiment_count) +
               (kind == "neuron"   ? " Zelle stummgeschaltet."
                : kind == "vision" ? " Zellen mit abgeschaltetem Seheingang."
                                   : " Zellen mit abgeschaltetem Nahrungseingang.");
    }
  }
}
void InteractiveSession::execute_genomes(const std::string &op, std::istringstream &line, bool &,
                                         std::string &reply) {
  if (op == "reload-founders") {
    FounderPool pool(o.founder_pool);
    pool.load(true);
    prepare_pool(pool);
    std::vector<Genome> refreshed;
    for (const auto &entry : pool.entries)
      refreshed.push_back(entry.genome);
    world.replace_pool_founders(std::move(refreshed));
    notice = "Founder-Pool aktualisiert.";
  } else if (op == "archive-eggs") {
    int index, n;
    double x, y;
    if (line >> index >> x >> y >> n && index >= 0 &&
        std::size_t(index) < world.support().archive.size()) {
      int removed = 0, requested = std::clamp(n, 1, 50);
      int added = world.import({world.support().archive[index].genome}, x, y, requested, true,
                               &removed, true);
      insertion_message(added, requested, removed);
      reply = notice;
    } else
      throw std::runtime_error("Verhaltensbauplan ist nicht mehr verfügbar.");
  } else if (op == "experiment") {
    start_genome_experiment(op, line, reply);
  } else if (op == "mutant") {
    std::uint64_t id;
    int count;
    double strength;
    if (line >> id >> count >> strength && count >= 1 && count <= 20 && std::isfinite(strength) &&
        strength >= 0 && strength <= 1) {
      auto p = std::find_if(world.fish.begin(), world.fish.end(),
                            [&](const Individual &p) { return p.id == id; });
      if (p == world.fish.end())
        throw std::runtime_error("Unknown parent");
      auto source = p->genome;
      double x = p->body.x, y = p->body.y;
      int added = 0, removed = 0;
      for (int i = 0; i < count; ++i) {
        Genome g = source;
        g.mutate(world.rng, strength, true, world.evo.rates);
        auto energy = funded_egg_energy(g, world.physiology().neural_cost, world.evo.yolk);
        if (!energy)
          continue;
        if (world.spawn(g, x + world.rng.uniform(-12, 12), y + world.rng.uniform(-12, 12), 3, 0, 0,
                        *energy, true, &removed)) {
          ++added;
          world.record_import();
        }
      }
      insertion_message(added, count, removed);
      reply = notice;
    }
  } else if (op == "export-genome") {
    std::uint64_t id;
    std::string path;
    if (line >> id >> std::quoted(path)) {
      const auto *genome = world.exportable_genome(id);
      if (!genome)
        throw std::runtime_error("Bauplan nicht mehr vorhanden.");
      genome->save(path);
    }
  } else if (op == "import-file") {
    std::string path;
    double x, y;
    int count;
    if (line >> std::quoted(path) >> x >> y >> count) {
      std::ifstream input(path);
      auto g = Genome::read(input, false);
      g.development_options.max_nodes =
          std::min(g.development_options.max_nodes, default_development_options.max_nodes);
      g.development_options.max_edges =
          std::min(g.development_options.max_edges, default_development_options.max_edges);
      g.compile();
      int removed = 0, requested = std::clamp(count, 1, 50);
      int added = world.import({g}, x, y, requested, true, &removed, true);
      input.close();
      std::filesystem::remove(path);
      insertion_message(added, requested, removed);
      reply = notice;
    }
  } else if (op == "saved-eggs") {
    std::string path;
    double x, y;
    int n;
    if (line >> std::quoted(path) >> x >> y >> n) {
      std::ifstream input(path);
      auto g = Genome::read(input, false);
      g.development_options.max_nodes =
          std::min(g.development_options.max_nodes, default_development_options.max_nodes);
      g.development_options.max_edges =
          std::min(g.development_options.max_edges, default_development_options.max_edges);
      int removed = 0, requested = std::clamp(n, 1, 50);
      int added = world.import({g}, x, y, requested, true, &removed, true);
      insertion_message(added, requested, removed);
      reply = notice;
    }
  } else if (op == "eggs") {
    double x, y;
    int n;
    if (line >> x >> y >> n && std::isfinite(x) && std::isfinite(y)) {
      std::vector<Genome> g;
      for (const auto &p : world.fish)
        if (p.id == selected)
          g.push_back(p.genome);
      if (g.empty())
        g = world.support().reserve;
      int removed = 0, requested = std::clamp(n, 1, 50);
      int added = world.import(g, x, y, requested, true, &removed, true);
      insertion_message(added, requested, removed);
      reply = notice;
    }
  } else if (op == "import") {
    std::string path;
    double x, y;
    int n;
    if (line >> std::quoted(path) >> x >> y >> n && std::isfinite(x) && std::isfinite(y)) {
      int removed = 0, requested = std::clamp(n, 1, 50);
      int added = world.import(population(path), x, y, requested, true, &removed, true);
      insertion_message(added, requested, removed);
      reply = notice;
    }
  }
}
}
