#include "interactive_session.hh"
#include "session_io.hh"
#include "plants.hh"
#include "checkpoint.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "command_arguments.hh"
#include "wording.hh"
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
std::string InteractiveSession::insertion_message(int added, int requested, int removed) {
  if (!added) {
    if (world.population_size() >= world.population_limit)
      throw Refusal("populationFull");
    if (world.total_energy() + 60 > world.energy_limit())
      throw Refusal("energyBound");
    throw Refusal("noEggsPlaced");
  }
  return wording(removed ? "eggsPlacedFoodRemoved" : "eggsPlaced",
                 {{"added", added}, {"requested", requested}, {"removed", removed}});
}
void InteractiveSession::dispatch(const CommandLine &command) {
  // Commands may change the world without a request ID, or reuse an earlier ID.
  ++scene_revision;
  std::istringstream line(command.text);
  std::string op;
  line >> op;
  std::uint64_t request = 0;
  if (op == "request") {
    line >> request >> op;
  }
  if (op == "view-reset") {
    if (metadata_output.enabled())
      reset_metadata = true;
    else
      view_cache.invalidate();
    metadata_output.invalidate();
    sent_plan.reset();
    inspection_cache_key.clear();
    refresh = true;
    return;
  }
  refresh = true;
  bool accepted = true, environment_effect = false;
  std::string reply;
  try {
    if (command.too_long)
      throw Refusal("commandTooLong");
    const std::set<std::string> geometry_ops = {
        "wall",          "polygon",       "obstacle",       "erase", "move-obstacle",
        "feeder",        "remove-feeder", "current-source", "grass", "algae",
        "remove-plants", "sediment",      "remove-sediment"};
    auto old_geometry =
        geometry_ops.count(op) ? std::make_optional(world.field.capture_edit()) : std::nullopt;
    const auto original_line = op + line.str().substr(std::size_t(line.tellg() == std::streampos(-1)
                                                                      ? line.str().size()
                                                                      : std::size_t(line.tellg())));
    validate_command_arguments(op, line);
    active_request = request;
    execute(op, line, environment_effect, reply);
    active_request = 0;
    state_request = request;
    if (op == "load-state" || op == "current" || op == "evolution")
      ++view_context;
    if (op == "wall" || op == "obstacle" || op == "move-obstacle" || op == "polygon") {
      reply = world.placement_notice;
      for (auto it = pins.begin(); it != pins.end();) {
        if (std::none_of(world.fish.begin(), world.fish.end(),
                         [&](const Individual &p) { return p.id == *it; }))
          it = pins.erase(it);
        else
          ++it;
      }
      if (selected &&
          std::none_of(world.fish.begin(), world.fish.end(),
                       [&](const Individual &p) { return p.id == selected; }) &&
          std::none_of(world.corpses.begin(), world.corpses.end(),
                       [&](const Corpse &c) { return c.blood_id == selected; })) {
        selected = 0;
        world.watched_id = world.watched_death = 0;
        neuron_focus = -1;
      }
    }
    if (old_geometry)
      geometry_undo = std::move(old_geometry);
    const std::set<std::string> environmental = {"release-sperm",
                                                 "burst",
                                                 "support",
                                                 "neural-cost",
                                                 "feeding",
                                                 "density",
                                                 "flow",
                                                 "gravity",
                                                 "bottom-residence",
                                                 "size",
                                                 "polygon",
                                                 "obstacle",
                                                 "wall",
                                                 "erase",
                                                 "move-obstacle",
                                                 "feeder",
                                                 "remove-feeder",
                                                 "current-source",
                                                 "food",
                                                 "spray",
                                                 "eggs",
                                                 "archive-eggs",
                                                 "saved-eggs",
                                                 "import",
                                                 "import-file",
                                                 "mutant",
                                                 "reset-brain",
                                                 "minimum-population",
                                                 "safety",
                                                 "limit",
                                                 "novelty",
                                                 "clear-food",
                                                 "remove-food",
                                                 "grass",
                                                 "algae",
                                                 "remove-plants",
                                                 "sediment",
                                                 "remove-sediment",
                                                 "mussels",
                                                 "worms",
                                                 "crabs"};
    // Mouse actions on plants and animals change the scene at once, like edits.
    if (environmental.count(op) || environment_effect || op == "mutation" || op == "parameter") {
      if (environmental.count(op) || environment_effect)
        world.environment_changed();
      world.events.push_back({world.ticks, original_line});
      if (world.events.size() > 64)
        world.events.erase(world.events.begin());
    }
  } catch (const Refusal &e) {
    active_request = 0;
    accepted = false;
    reply = e.what();
  } catch (const std::exception &e) {
    active_request = 0;
    accepted = false;
    reply = wording("engineFault", {{"detail", e.what()}});
    std::cerr << "Eingriff: " << e.what() << '\n';
  }
  if (request)
    std::cout << "{\"event\":\"command\",\"request\":" << request
              << ",\"ok\":" << (accepted ? "true" : "false")
              << ",\"message\":" << (reply.empty() ? "null" : reply) << "}\n"
              << std::flush;
}

void InteractiveSession::execute(const std::string &op, std::istringstream &line,
                                 bool &environment_effect, std::string &reply) {
  using Handler = void (InteractiveSession::*)(const std::string &, std::istringstream &, bool &,
                                               std::string &);
  static const std::map<std::string, Handler> commands = {
      {"stop", &InteractiveSession::execute_lifecycle},
      {"pause", &InteractiveSession::execute_lifecycle},
      {"resume", &InteractiveSession::execute_lifecycle},
      {"step", &InteractiveSession::execute_lifecycle},
      {"evolution", &InteractiveSession::execute_lifecycle},
      {"protect", &InteractiveSession::execute_lifecycle},
      {"immortal", &InteractiveSession::execute_lifecycle},
      {"remember-fish", &InteractiveSession::execute_lifecycle},
      {"revive", &InteractiveSession::execute_lifecycle},
      {"neuron", &InteractiveSession::execute_neural},
      {"neural-cost", &InteractiveSession::execute_settings},
      {"parameter", &InteractiveSession::execute_settings},
      {"startle", &InteractiveSession::execute_settings},
      {"crush", &InteractiveSession::execute_settings},
      {"encourage", &InteractiveSession::execute_settings},
      {"bite-plant", &InteractiveSession::execute_settings},
      {"burst", &InteractiveSession::execute_settings},
      {"feeding", &InteractiveSession::execute_settings},
      {"novelty", &InteractiveSession::execute_settings},
      {"polygon", &InteractiveSession::execute_geometry},
      {"wall", &InteractiveSession::execute_geometry},
      {"move-obstacle", &InteractiveSession::execute_geometry},
      {"current-source", &InteractiveSession::execute_geometry},
      {"feeder", &InteractiveSession::execute_geometry},
      {"remove-feeder", &InteractiveSession::execute_geometry},
      {"archive-eggs", &InteractiveSession::execute_genomes},
      {"experiment", &InteractiveSession::execute_genomes},
      {"mutant", &InteractiveSession::execute_genomes},
      {"export-genome", &InteractiveSession::execute_genomes},
      {"import-file", &InteractiveSession::execute_genomes},
      {"saved-eggs", &InteractiveSession::execute_genomes},
      {"brain-all", &InteractiveSession::execute_neural},
      {"reset-brain", &InteractiveSession::execute_neural},
      {"brain-mode", &InteractiveSession::execute_neural},
      {"probe-clear", &InteractiveSession::execute_neural},
      {"release-sperm", &InteractiveSession::execute_neural},
      {"stimulate", &InteractiveSession::execute_neural},
      {"stimulate-group", &InteractiveSession::execute_neural},
      {"probe", &InteractiveSession::execute_neural},
      {"brain-turn", &InteractiveSession::execute_neural},
      {"brain", &InteractiveSession::execute_neural},
      {"turbo", &InteractiveSession::execute_settings},
      {"delay", &InteractiveSession::execute_settings},
      {"bottom-residence", &InteractiveSession::execute_settings},
      {"history-interval", &InteractiveSession::execute_settings},
      {"select", &InteractiveSession::execute_neural},
      {"pin", &InteractiveSession::execute_neural},
      {"minimum-population", &InteractiveSession::execute_population},
      {"support", &InteractiveSession::execute_population},
      {"mutation", &InteractiveSession::execute_settings},
      {"safety", &InteractiveSession::execute_population},
      {"limit", &InteractiveSession::execute_population},
      {"density", &InteractiveSession::execute_settings},
      {"flow", &InteractiveSession::execute_settings},
      {"gravity", &InteractiveSession::execute_settings},
      {"size", &InteractiveSession::execute_geometry},
      {"food", &InteractiveSession::execute_settings},
      {"spray", &InteractiveSession::execute_settings},
      {"obstacle", &InteractiveSession::execute_geometry},
      {"erase", &InteractiveSession::execute_geometry},
      {"eggs", &InteractiveSession::execute_genomes},
      {"import", &InteractiveSession::execute_genomes},
      {"clear-food", &InteractiveSession::execute_settings},
      {"remove-food", &InteractiveSession::execute_settings},
      {"mussels", &InteractiveSession::execute_geometry},
      {"worms", &InteractiveSession::execute_geometry},
      {"crabs", &InteractiveSession::execute_geometry},
      {"grass", &InteractiveSession::execute_geometry},
      {"algae", &InteractiveSession::execute_geometry},
      {"remove-plants", &InteractiveSession::execute_geometry},
      {"sediment", &InteractiveSession::execute_geometry},
      {"remove-sediment", &InteractiveSession::execute_geometry},
      {"undo", &InteractiveSession::execute_geometry},
      {"bookmark", &InteractiveSession::execute_lifecycle},
      {"current", &InteractiveSession::execute_lifecycle},
      {"load-state", &InteractiveSession::execute_lifecycle},
      {"count", &InteractiveSession::execute_population},
      {"group", &InteractiveSession::execute_population},
      {"rename-species", &InteractiveSession::execute_population},
      {"reset", &InteractiveSession::execute_lifecycle}};
  const auto found = commands.find(op);
  if (found == commands.end())
    throw Refusal("unknownEngineCommand", {{"command", op}});
  (this->*found->second)(op, line, environment_effect, reply);
}
}
