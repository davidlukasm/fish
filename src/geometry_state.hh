#pragma once
#include "geometry_types.hh"
namespace fishsim {
// The tank holds at most MAX_OBSTACLES rocks, each a polygon of 3 to MAX_POLYGON_POINTS points.
inline constexpr std::size_t MAX_OBSTACLES = 64, MIN_POLYGON_POINTS = 3, MAX_POLYGON_POINTS = 32;
struct GeometryState {
  double width = SIZE;
  double height = SIZE;
  std::vector<Obstacle> obstacles;
  std::uint64_t next_obstacle_id = 1;
  SpatialGrid shape_grid;
  std::size_t indexed_shapes = 0;
};
}
