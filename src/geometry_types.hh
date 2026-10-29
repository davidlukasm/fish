#pragma once
#include "simulation_types.hh"
namespace fishsim {
struct Point {
  double x = 0, y = 0;
};
struct Segment {
  Point a, b;
  double length, tx, ty;
};
struct Obstacle {
  double x, y, radius;
  std::vector<Point> vertices{};
  mutable std::vector<Segment> segments{};
  std::uint64_t id = 0;
};
struct SpatialGrid {
  double cell = 32, width = 0;
  int columns = 0, rows = 0;
  std::vector<std::vector<std::uint32_t>> bins;
  void reset(double, double);
  void add(double, double, std::uint32_t);
  void relocate(double ox, double oy, double x, double y, std::uint32_t index);
  template <class F> void nearby(double x, double y, double radius, F visit) const {
    if (columns == 0)
      return;
    if (x < 0 || x >= width)
      x -= width * std::floor(x / width);
    int top = std::max(0, int(std::floor((y - radius) / cell))),
        bottom = std::min(rows - 1, int(std::floor((y + radius) / cell)));
    if (x - radius >= 0 && x + radius < width) {
      const int first = int((x - radius) / cell), last = int((x + radius) / cell);
      for (int j = top; j <= bottom; ++j)
        for (int i = first; i <= last; ++i)
          for (auto index : bins[j * columns + i])
            visit(index);
      return;
    }
    // Merge the seam intervals before visiting bins: no object can be visited twice.
    std::array<std::pair<int, int>, 3> ranges{};
    int count = 0;
    for (double shift : {-width, 0., width}) {
      double lo = x - radius + shift, hi = x + radius + shift;
      if (hi < 0 || lo >= width)
        continue;
      ranges[count++] = {std::max(0, int(std::floor(lo / cell))),
                         std::min(columns - 1, int(std::floor(hi / cell)))};
    }
    for (int i = 1; i < count; ++i)
      for (int j = i; j > 0 && ranges[j] < ranges[j - 1]; --j)
        std::swap(ranges[j], ranges[j - 1]);
    int last = -1;
    for (int k = 0; k < count; ++k) {
      int first = std::max(last + 1, ranges[k].first), end = ranges[k].second;
      for (int j = top; j <= bottom; ++j)
        for (int i = first; i <= end; ++i)
          for (auto index : bins[j * columns + i])
            visit(index);
      last = std::max(last, end);
    }
  }
};
}
