#pragma once
#include "geometry_types.hh"
namespace fishsim {
struct GeometryState {
  double width = SIZE;
  double height = SIZE;
  std::vector<Obstacle> obstacles;
  std::uint64_t next_obstacle_id = 1;
  SpatialGrid shape_grid;
  std::size_t indexed_shapes = 0;
};
}
