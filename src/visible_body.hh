#pragma once
#include "simulation_types.hh"
namespace fishsim {
struct VisibleBody {
  double x, y;
  int eaten;
  std::uint64_t id;
  bool egg_role = true, hatched = true;
  std::array<double, 3> color{.3, .7, .6};
  double egg_odor = 0, radius = BODY_RADIUS;
  int kind = 1;
  std::size_t source = 0;
  double flow_x = 0, flow_y = 0;
  bool hidden = false;
  std::uint64_t age = 0;
  double odor_energy = 0;
  int odor_channel = -1;
  double relative_speed = 0;
};
}
