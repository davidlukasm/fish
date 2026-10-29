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
void InteractiveSession::execute_lifecycle(const std::string &op, std::istringstream &line, bool &,
                                           std::string &reply) {
  if (op == "stop") {
    cancelled = true;
  } else if (op == "pause") {
    paused = true;
  } else if (op == "resume")
    paused = false;
  else if (op == "step")
    single = true;
  else if (op == "evolution") {
    int n;
    if (line >> n) {
      if (n && live) {
        reference.reset();
        world = std::move(*live);
        live.reset();
        if (live_founder) {
          session_founder = std::move(*live_founder);
          live_founder.reset();
        }
      }
      evolving = n != 0;
      protected_life = false;
      count = 0;
      group = "best";
      choose();
    }
  } else if (op == "protect") {
    int n;
    if (evolving)
      throw std::runtime_error("Fortpflanzung zuerst pausieren, um Energie und Leben zu erhalten.");
    if (line >> n)
      protected_life = n != 0;
  } else if (op == "bookmark") {
    writer.finish();
    snapshot(true, active_request);
    reply = "Vollständiger Weltzustand gespeichert.";
  } else if (op == "current") {
    reference.reset();
    if (live) {
      world = std::move(*live);
      live.reset();
      if (live_founder) {
        session_founder = std::move(*live_founder);
        live_founder.reset();
      }
      evolving = live_mode;
      protected_life = live_protect;
    }
    choose();
  } else if (op == "load-state") {
    std::string path;
    if (line >> std::quoted(path)) {
      std::ifstream input(path);
      auto restored = read_checkpoint(input, o.threads);
      reference.reset();
      if (!live) {
        live_mode = evolving;
        live_protect = protected_life;
        live = world.fork();
        live_founder = session_founder;
      }
      world = std::move(restored.world);
      session_founder = std::move(restored.founder);
      selected = restored.selected;
      paused = true;
      evolving = false;
      protected_life = false;
      notice = "Vollständiger gespeicherter Weltzustand, einschließlich Körpern und "
               "Neuronenaktivitäten.";
      choose();
    }
  } else if (op == "reset" && !evolving) {
    if (!live) {
      live_mode = evolving;
      live_protect = protected_life;
      live = world.fork();
    }
    std::vector<Genome> g;
    for (const auto &p : world.fish)
      g.push_back(p.genome);
    world.fish.clear();
    for (const auto &gene : g) {
      double x = 0, y = 0;
      if (world.field.position(world.rng, x, y))
        world.spawn(gene, x, y);
    }
    choose();
  }
}
}
