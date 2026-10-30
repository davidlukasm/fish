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
void InteractiveSession::edit_food(const std::string &op, std::istringstream &line,
                                   std::string &reply) {
  if (op == "food" || op == "spray") {
    double x, y;
    int n = 12;
    double radius = 18;
    if (line >> x >> y && std::isfinite(x) && std::isfinite(y) && x >= 0 &&
        x < world.field.geometry().width && y >= 0 && y < world.field.geometry().height) {
      if (op == "spray")
        line >> n >> radius;
      world.refresh_food_allowance();
      const auto added = world.field.manual_feed(x, y, n, radius);
      if (!added)
        throw std::runtime_error(
            "Kein Futter hinzugefügt: Energielimit erreicht oder Position blockiert.");
      reply = std::to_string(added) + " Futterstücke hinzugefügt.";
    }
  } else if (op == "clear-food") {
    auto removed = world.field.clear_food();
    world.refresh_food_allowance();
    reply = notice = std::to_string(removed) + " Futterstücke entfernt.";
  } else if (op == "remove-food") {
    double x, y, radius;
    if (line >> x >> y >> radius) {
      const auto removed = world.field.erase_food(x, y, radius);
      world.refresh_food_allowance();
      reply = notice = std::to_string(removed) + " Futterstücke entfernt.";
    }
  }
}
void InteractiveSession::execute_settings(const std::string &op, std::istringstream &line,
                                          bool &environment_effect, std::string &reply) {
  if (op == "neural-cost") {
    double v;
    if (line >> v && std::isfinite(v))
      world.set_neural_cost(v);
  } else if (op == "encourage") {
    int kind;
    std::uint64_t id;
    if (!(line >> kind >> id) || (kind != 5 && kind != 7 && kind != 8 && kind != 9))
      throw std::runtime_error("Ungültiges Ziel");
    world.refresh_food_allowance();
    if (!world.field.encourage_target(kind, id))
      throw std::runtime_error(kind == 5 ? "Kein Wachstumsraum oder Energievorrat."
                                         : "Tier nicht verfügbar.");
    environment_effect = true;
    reply = kind == 5 ? "Wachstum angeregt." : "Fressverhalten aktiviert.";
  } else if (op == "crush") {
    int kind, organ;
    std::uint64_t id;
    if (!(line >> kind >> id >> organ) || (kind != 5 && kind != 7 && kind != 8 && kind != 9))
      throw std::runtime_error("Ungültiges Ziel");
    double along = 0;
    if (!(line >> along) || !std::isfinite(along))
      along = 0;
    world.field.crush_target(kind, id, organ, along);
    environment_effect = true;
  } else if (op == "bite-plant") {
    std::uint64_t id;
    int organ;
    double along;
    if (!(line >> id >> organ >> along) || !std::isfinite(along))
      throw std::runtime_error("Ungültiges Ziel");
    if (!world.field.bite_target(id, organ, std::clamp(along, 0., 1.)))
      throw std::runtime_error("Hier lässt sich nichts abbeißen.");
    environment_effect = true;
  } else if (op == "startle") {
    double x, y, radius;
    if (!(line >> x >> y >> radius) || !std::isfinite(x) || !std::isfinite(y) ||
        !std::isfinite(radius) || radius < 1 || radius > 120)
      throw std::runtime_error("Ungültiger Berührungspunkt");
    world.field.startle_animals(x, y, radius);
  } else if (op == "parameter") {
    std::string name;
    double v;
    if (!(line >> name >> v) || !world.set_parameter(name, v))
      throw std::runtime_error(world.placement_notice.empty()
                                   ? "Unbekannter oder ungültiger Parameter"
                                   : world.placement_notice);
    environment_effect = true;
    world.field.sync_environment();
    world.field.index_plants();
  } else if (op == "burst") {
    std::string kind;
    if (!(line >> kind) || !world.trigger_burst(kind))
      throw std::runtime_error("Schub nicht verfügbar.");
  } else if (op == "feeding" || op == "novelty") {
    double v;
    if (line >> v && std::isfinite(v)) {
      if (op == "feeding") {
        world.set_parameter("energy_supply", v / 1000);
      } else
        world.novelty_strength = std::clamp(v, 0., 1.);
    }
  } else if (op == "turbo") {
    int n;
    if (line >> n) {
      turbo = n != 0;
      if (turbo) {
        delay = 0;
        brain_detail = false;
      }
      reply = turbo ? "Schnelle Evolution ohne Darstellung." : "Darstellung wieder aktiv.";
    }
  } else if (op == "delay") {
    int n;
    if (line >> n)
      delay = std::clamp(n, 0, 1000);
  } else if (op == "bottom-residence") {
    int v;
    if (line >> v)
      world.set_parameter("rest_steps", v);
  } else if (op == "history-interval") {
    int v;
    if (line >> v)
      world.observation_interval = std::clamp(v, 100, 1000000);
  } else if (op == "mutation") {
    double v;
    if (line >> v && std::isfinite(v)) {
      world.evo.mutation = std::clamp(v, 0., 1.);
    }
  } else if (op == "density") {
    int n;
    if (line >> n) {
      world.field.set_food_density(n);
    }
  } else if (op == "flow" || op == "gravity") {
    double n;
    if (line >> n && std::isfinite(n)) {
      if (op == "flow")
        world.field.flow = std::clamp(n, 0., 2.);
      else
        world.field.gravity = std::clamp(n, 0., .3);
    }
  } else if (op == "food" || op == "spray" || op == "clear-food" || op == "remove-food") {
    edit_food(op, line, reply);
  }
}
}
