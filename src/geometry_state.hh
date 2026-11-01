#pragma once
#include "geometry_types.hh"
namespace fishsim {
// The tank holds at most MAX_OBSTACLES rocks, each a polygon of MIN_POLYGON_POINTS to
// MAX_POLYGON_POINTS points (tank limits, shared with the viewer).
inline constexpr std::size_t MAX_OBSTACLES = tank::max_obstacles,
                             MIN_POLYGON_POINTS = tank::min_polygon_points,
                             MAX_POLYGON_POINTS = tank::max_polygon_points;
struct GeometryState {
  double width = SIZE;
  double height = SIZE;
  std::vector<Obstacle> obstacles;
  std::uint64_t next_obstacle_id = 1;
  SpatialGrid shape_grid;
  std::size_t indexed_shapes = 0;
};
}
