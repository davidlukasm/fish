#pragma once
#include "simulation_types.hh"
#include <string>
namespace fishsim {
struct InteractiveOptions {
  std::string output, session, resume;
  int pop, food, threads;
  std::uint64_t seed;
  std::vector<std::pair<std::string, double>> parameters;
  std::vector<std::string> start_genomes{};
  bool empty_world = false;
  bool choose_population = false;
  bool view_stream = false;
  bool render_stream = false;
  int metadata_fd = -1;
  std::string render_socket{};
  bool laboratory = false;
};
int interactive(const InteractiveOptions &);
}
