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
void InteractiveSession::undo_geometry(std::string &reply) {
  if (!geometry_undo)
    throw Refusal("nothingToUndo");
  const auto plants = geometry_undo->plant_energies();
  if (world.total_energy() - world.field.algae_energy() - world.field.grass_energy() + plants[0] +
          plants[1] >
      world.energy_limit() + 1e-9)
    throw Refusal("undoNeedsPlantBudget");
  world.field.restore_edit(std::move(*geometry_undo));
  geometry_undo.reset();
  world.environment_changed();
  reply = wording("undone");
}
void InteractiveSession::edit_environment_brush(const std::string &op, std::istringstream &line,
                                                std::string &reply) {
  if (op == "grass" || op == "algae" || op == "remove-plants" || op == "sediment" ||
      op == "remove-sediment") {
    double x, y, radius, amount = 8;
    int type = -1;
    if (!(line >> x >> y >> radius))
      throw Refusal("invalidBrush");
    if (line >> type) {
      if (!(line >> amount))
        throw Refusal("invalidBrush");
    }
    if (type < -1 || type > 5 || !std::isfinite(amount) || amount < .5 || amount > 16 ||
        !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(radius) || radius < 1 ||
        radius > 120 ||
        !(world.refresh_food_allowance(),
          world.field.edit_environment(op, x, y, radius, type, amount)))
      throw Refusal(op == "grass" ? "plantsNeedRoom" : "noAreaOrBudget");
    reply = wording("areaEdited");
  }
}
void InteractiveSession::edit_environment_sources(const std::string &op, std::istringstream &line,
                                                  std::string &reply) {
  if (op == "current-source") {
    int index;
    double x, y, angle, width, strength;
    if (!(line >> index >> x >> y >> angle >> width >> strength))
      throw Refusal("invalidCurrentSource");
    world.field.set_current_source(index, x, y, angle, width, strength);
    reply = wording("currentSourceSet");
  } else if (op == "feeder") {
    double x, y, rate, radius;
    int index = -1;
    if (!(line >> x >> y >> rate >> radius))
      throw Refusal("invalidFeeder");
    line >> index;
    world.field.set_feeder(index, x, y, rate, radius);
    reply = wording("feederSet");
  } else if (op == "remove-feeder") {
    double x, y;
    if (line >> x >> y) {
      if (!world.field.erase_feeder(x, y))
        throw Refusal("noFeederHere");
      reply = wording("feederRemoved");
    }
  }
}
void InteractiveSession::execute_geometry(const std::string &op, std::istringstream &line, bool &,
                                          std::string &reply) {
  if (op == "polygon") {
    int n;
    if (!(line >> n) || n < 3 || n > 32)
      throw Refusal("invalidPolygon");
    std::vector<Point> points(n);
    for (auto &p : points)
      if (!(line >> p.x >> p.y))
        throw Refusal("invalidCorners");
    if (!world.polygon(points))
      throw Refusal("polygonOutside");
  } else if (op == "wall") {
    double x, y, tx, ty, w;
    if (line >> x >> y >> tx >> ty >> w)
      if (!world.wall(x, y, tx, ty, std::clamp(w, 4., 100.)))
        throw Refusal("wallOutside");
  } else if (op == "move-obstacle") {
    double x, y, tx, ty, a;
    if (line >> x >> y >> tx >> ty >> a)
      if (!world.move_obstacle(x, y, tx, ty, a))
        throw Refusal("obstacleBlocked");
  } else if (op == "current-source" || op == "feeder" || op == "remove-feeder") {
    edit_environment_sources(op, line, reply);
  } else if (op == "size") {
    double w, h;
    if (line >> w >> h && std::isfinite(w) && std::isfinite(h) && w >= 615 && w <= 4920 &&
        h >= 410 && h <= 3280)
      world.resize(w, h);
  } else if (op == "obstacle" || op == "erase") {
    double x, y, r = 28;
    if (line >> x >> y && std::isfinite(x) && std::isfinite(y)) {
      if (op == "erase") {
        auto before = world.field.geometry().obstacles.size();
        world.erase_obstacle(x, y);
        if (before == world.field.geometry().obstacles.size()) {
          if (!world.field.erase_feeder(x, y) && !world.field.erase_current(x, y))
            throw Refusal("noObjectHere");
        }
        reply = wording("objectRemoved");
      } else if (line >> r && std::isfinite(r)) {
        if (!world.obstacle(x, y, std::clamp(r, 8., 120.)))
          throw Refusal("stoneOutside");
      }
    }
  } else if (op == "mussels" || op == "worms" || op == "crabs") {
    double x, y, radius;
    int count;
    if (!(line >> x >> y >> radius >> count) || !std::isfinite(x) || !std::isfinite(y) ||
        !std::isfinite(radius) || radius < 1 || radius > 120 || count < 1 || count > 20)
      throw Refusal("invalidStocking");
    double morph = -1;
    if (line >> morph) {
      if (!std::isfinite(morph) || morph < -1 || morph >= (op == "mussels" ? mussel_families : 4))
        throw Refusal("invalidAnimalForm");
    }
    world.refresh_food_allowance();
    if (!world.field.place_animals(op == "mussels" ? 9
                                   : op == "crabs" ? 8
                                                   : 7,
                                   x, y, radius, count, morph)) {
      reply = wording("noRoomForAnimals");
      return;
    }
    reply = wording("animalsPlaced");
  } else if (op == "grass" || op == "algae" || op == "remove-plants" || op == "sediment" ||
             op == "remove-sediment") {
    edit_environment_brush(op, line, reply);
  } else if (op == "undo") {
    undo_geometry(reply);
  }
}
}
