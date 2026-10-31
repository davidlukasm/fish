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
void InteractiveSession::execute_population(const std::string &op, std::istringstream &line, bool &,
                                            std::string &) {
  if (op == "safety") {
    int n;
    if (line >> n)
      world.safety = n != 0;
  } else if (op == "limit") {
    int n;
    if (line >> n)
      world.population_limit = std::clamp(n, 3, 2000);
  } else if (op == "count") {
    int n;
    if (line >> n)
      count = std::clamp(n, 0, 2000);
  } else if (op == "rename-species") {
    std::uint64_t id;
    std::string name;
    if (!(line >> id >> std::quoted(name)))
      throw Refusal("speciesAndNameRequired");
    world.rename_species(id, name);
  } else if (op == "group") {
    std::string g;
    if (line >> g)
      group = g;
  }
}
}
