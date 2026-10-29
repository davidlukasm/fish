#pragma once
#include "geometry_types.hh"
namespace fishsim {
struct CurrentSource {
  double x = 0, y = 0, angle = 0, width = 40, strength = 2, noise = 0;
};
struct Water {
  int columns = 0, rows = 0;
  double cell = 32, width = 0, height = 0;
  std::vector<double> u, v, previous_u, previous_v;
  std::vector<unsigned char> solid;
  std::vector<unsigned char> u_open, v_open;
  std::vector<std::array<int, 4>> neighbors;
  std::vector<float> pressure, divergence, pressure_next;
  std::vector<double> neighbor_weight;
  std::vector<std::pair<int, int>> pressure_runs;
  std::vector<int> pressure_boundary;
  std::uint64_t geometry_signature = 0, stencil_signature = 0;
  int pressure_iterations = 0;
  void update(const struct Field &, int iterations = 60, bool adaptive = true);
  Point velocity(double, double) const;

private:
  bool fluid(int, int) const;
  std::uint64_t refresh_geometry(const struct Field &, int, int, double, double);
  void advect_velocity(const struct Field &, int, int, double, double);
  void refresh_pressure_stencil(int, int, double, double, std::uint64_t);
  void project_velocity(int, int, double, double, double, double, int, bool);
};
}
