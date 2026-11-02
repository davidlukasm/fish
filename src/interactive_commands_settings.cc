#include "wording.hh"
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
namespace {
// Plants and the small animals can be encouraged and crushed.
bool editable(int kind) {
  return kind == food_kind::plant || kind == food_kind::worm || kind == food_kind::crab ||
         kind == food_kind::mussel;
}
}
void InteractiveSession::edit_food(const std::string &op, std::istringstream &line,
                                   std::string &reply) {
  if (op == "food" || op == "spray") {
    double x, y;
    int n = edit_limit::spray_count;
    double radius = edit_limit::spray_radius;
    if (line >> x >> y && std::isfinite(x) && std::isfinite(y) && x >= 0 &&
        x < world.field.geometry().width && y >= 0 && y < world.field.geometry().height) {
      if (op == "spray")
        line >> n >> radius;
      world.refresh_food_allowance();
      const auto added = world.field.manual_feed(x, y, n, radius);
      if (!added)
        throw Refusal("noFoodAdded");
      reply = wording("foodAdded", {{"n", added}});
    }
  } else if (op == "clear-food") {
    auto removed = world.field.clear_food();
    world.refresh_food_allowance();
    reply = wording("foodRemoved", {{"n", removed}});
  } else if (op == "remove-food") {
    double x, y, radius;
    if (line >> x >> y >> radius) {
      const auto removed = world.field.erase_food(x, y, radius);
      world.refresh_food_allowance();
      reply = wording("foodRemoved", {{"n", removed}});
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
    if (!(line >> kind >> id) || !editable(kind))
      throw Refusal("invalidTarget");
    unsigned steps = GrowthBoost::steps;
    line >> std::ws;
    if (!line.eof()) {
      if (!(line >> steps) || !steps || steps > edit_limit::max_held_steps)
        throw Refusal("invalidTarget");
      line >> std::ws;
      if (!line.eof())
        throw Refusal("invalidTarget");
    }
    world.refresh_food_allowance();
    if (!world.field.encourage_target(kind, id, steps))
      throw Refusal(kind == food_kind::plant ? "noRoomToGrow" : "animalUnavailable");
    environment_effect = true;
    reply = wording(kind == food_kind::plant ? "growthEncouraged" : "feedingActivated");
  } else if (op == "crush") {
    int kind, organ;
    std::uint64_t id;
    if (!(line >> kind >> id >> organ) || !editable(kind))
      throw Refusal("invalidTarget");
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
      throw Refusal("invalidTarget");
    if (!world.field.bite_target(id, organ, std::clamp(along, 0., 1.)))
      throw Refusal("nothingToBite");
    environment_effect = true;
  } else if (op == "startle") {
    double x, y, radius;
    if (!(line >> x >> y >> radius) || !std::isfinite(x) || !std::isfinite(y) ||
        !std::isfinite(radius) || radius < 1 || radius > edit_limit::max_brush_radius)
      throw Refusal("invalidTouchPoint");
    world.field.startle_animals(x, y, radius);
  } else if (op == "parameter") {
    std::string name;
    double v;
    if (!(line >> name >> v) || !world.set_parameter(name, v))
      throw world.placement_notice.empty() ? Refusal("invalidParameter")
                                           : Refusal::worded(world.placement_notice);
    environment_effect = true;
    world.field.sync_environment();
    world.field.index_plants();
  } else if (op == "burst") {
    std::string kind;
    if (!(line >> kind) || !world.trigger_burst(kind))
      throw Refusal("burstUnavailable");
  } else if (op == "feeding" || op == "novelty") {
    double v;
    if (line >> v && std::isfinite(v)) {
      if (op == "feeding") {
        world.set_parameter("energy_supply", v / edit_limit::supply_scale);
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
      reply = wording(turbo ? "turboOn" : "turboOff");
    }
  } else if (op == "delay") {
    int n;
    if (line >> n)
      delay = std::clamp(n, 0, edit_limit::max_delay);
  } else if (op == "bottom-residence") {
    int v;
    if (line >> v)
      world.set_parameter("rest_steps", v);
  } else if (op == "history-interval") {
    int v;
    if (line >> v)
      world.observation_interval =
          std::clamp(v, edit_limit::min_observation_interval, edit_limit::max_observation_interval);
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
        world.field.flow = std::clamp(n, 0., water_setting::max_flow);
      else
        world.field.gravity = std::clamp(n, 0., water_setting::max_gravity);
    }
  } else if (op == "food" || op == "spray" || op == "clear-food" || op == "remove-food") {
    edit_food(op, line, reply);
  }
}
}
