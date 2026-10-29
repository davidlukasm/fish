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
InteractiveSession::InteractiveSession(const InteractiveOptions &options)
    : o(options), render_epoch(std::to_string(Clock::now().time_since_epoch().count())),
      world(o.seed), view_cache(o.view_stream), metadata_output(o.metadata_fd) {
}
int interactive(const InteractiveOptions &options) {
  return InteractiveSession(options).run();
}
void InteractiveSession::prepare_pool(FounderPool &pool) {
  bool restricted = false;
  for (auto &entry : pool.entries) {
    auto &g = entry.genome;
    auto &opt = g.development_options;
    if (opt.max_nodes > default_development_options.max_nodes ||
        opt.max_edges > default_development_options.max_edges) {
      restricted = true;
      opt.max_nodes = std::min(opt.max_nodes, default_development_options.max_nodes);
      opt.max_edges = std::min(opt.max_edges, default_development_options.max_edges);
      g.blueprint.reset();
      g.interface.reset();
      g.growing.reset();
      g.growth_query.reset();
      g.compile();
      entry.hatching = founder_hatching(g, cancelled, o.parameters);
      entry.reproduction = entry.hatching.passed()
                               ? founder_reproduction(g, cancelled, o.parameters)
                               : FounderReproduction{};
      entry.measured = entry.hatching.passed() && entry.reproduction.passed();
      entry.describe();
    }
  }
  if (restricted) {
    pool.entries.erase(std::remove_if(pool.entries.begin(), pool.entries.end(),
                                      [](const auto &e) {
                                        return !viable_entrant(e.genome) || !e.hatching.passed() ||
                                               !e.reproduction.passed();
                                      }),
                       pool.entries.end());
    if (pool.ready() < starting_founder_count(o.pop))
      throw std::runtime_error("Gehirnbudget zu klein für genügend lebensfähige Founder. "
                               "Neuronen-/Verbindungsgrenze erhöhen.");
  }
}
}
