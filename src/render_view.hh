#pragma once
#include <cstdint>
namespace fishsim {
struct RenderView {
  double x = 0, y = 0, width = 0, height = 0, scale = 1;
  bool configured = false;
  bool includes(double px, double py, double radius, double world_width) const;
  double coordinate(double value) const;
  bool update(double cx, double cy, double w, double h, double pixels_per_unit);
};
}
