#pragma once
#include "simulation_types.hh"
#include <string>
namespace fishsim {
struct InteractiveOptions {
  std::string input, output, session, resume;
  int pop, food, threads;
  std::uint64_t seed;
  std::vector<std::pair<std::string, double>> parameters; // --param NAME=VALUE
  std::vector<std::string> start_genomes{};
  bool empty_world = false;
  bool pool_start = true;
  bool choose_population = false;
  bool view_stream = false;
  bool render_stream = false;
  int metadata_fd = -1;
  std::string render_socket; // Unix socket of the image front process
  std::string founder_pool = "genomes/pool";
};
int interactive(const InteractiveOptions &);
}
