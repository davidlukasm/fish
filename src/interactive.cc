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
InteractiveSession::InteractiveSession(const InteractiveOptions &options)
    : o(options), render_epoch(std::to_string(Clock::now().time_since_epoch().count())),
      world(o.seed), view_cache(o.view_stream), metadata_output(o.metadata_fd) {
}
int interactive(const InteractiveOptions &options) {
  return InteractiveSession(options).run();
}
}
