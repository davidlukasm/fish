#pragma once
#include "plant_types.hh"
#include <deque>
namespace fishsim {
struct PlantGeometryCache {
  struct Cell {
    std::size_t index, organ;
  };
  std::vector<PlantPart> parts;
  std::vector<Cell> canopy;
  bool canopy_ready = false;
  bool bent = false; // Shaped around a fish body; reshaped again once it has left.
  bool empty() const { return parts.empty(); }
  void clear() {
    parts.clear();
    canopy.clear();
    canopy_ready = false;
    bent = false;
  }
};
struct PlantState {
  std::vector<SurfacePatch> surfaces;
  std::vector<DriftingGrass> drifting_grass;
  std::vector<PlantPart> plants;
  SpatialGrid plant_grid;
  SpatialGrid surface_grid;
  double indexed_plant_radius = 8;
  std::uint64_t next_surface_id = 1;
  double algae_added = 0;
  double grass_added = 0;
  std::deque<std::array<double, 2>> growth_history;
  std::vector<PlantGeometryCache> plant_geometry_cache;
  std::uint64_t algae_exposure_geometry = ~std::uint64_t(0);
  std::vector<double> algae_exposure_sediment;
};
}
