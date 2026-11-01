#pragma once
#include "body.hh"
#include "environment.hh"
#include "perception.hh"
#include <limits>
namespace fishsim {
class SightMedium {
  struct Bed {
    double sx, sy, length2, nx, ny, t, gap, cover, slope;
  };
  struct Plant {
    double x, y, hx, hy, width, radius;
    Color depth;
  };
  const Field *world = nullptr;
  double x = 0, y = 0;
  bool dusty = true;
  // Only the smooth suspended medium is sampled in polar cells. Solid beds and
  // foliage retain their geometric intersections.
  static constexpr std::size_t DUST_BEARINGS = 64, PLANT_BEARINGS = 128;
  mutable std::array<std::vector<double>, DUST_BEARINGS> dust_integrals;
  std::vector<Bed> beds;
  std::vector<Plant> plants;
  std::array<std::vector<std::size_t>, PLANT_BEARINGS> plant_angles;

public:
  void prepare(const Field &, double, double);
  // Suspended medium, then the foliage transmission per colour channel.
  std::array<double, 4> transmission(double, double) const;
};
// Geometry local to one observer, reused by all of its visual receptors.
class SightFilter {
  const Field *world = nullptr;
  double x = 0, y = 0;
  mutable double last_x = std::numeric_limits<double>::infinity(),
                 last_y = std::numeric_limits<double>::infinity();
  mutable Field::SpermOptics last_optics;
  const Field::SpermOptics &optics(double, double) const;

public:
  void prepare(const Field &, double, double);
  Color apply(double, double, Color) const;
  Color scatter(double, double, double) const;
};
class SightRays {
  struct Edge {
    double x, y;
    Segment segment;
  };
  struct Circle {
    double x, y, radius;
  };
  std::vector<Edge> edges;
  std::vector<Circle> circles;
  double y = 0, height = 0, reach = RANGE;
  bool inside = false;

public:
  void prepare(const Field &, double, double, bool sediment = false);
  bool obstructed() const {
    return inside || !edges.empty() || !circles.empty() || y < reach || height - y < reach;
  }
  double cast(double, double) const;
};
}
