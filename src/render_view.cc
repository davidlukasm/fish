#include "render_view.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace fishsim {
bool RenderView::includes(double px, double py, double radius, double world_width) const {
  if (!configured)
    return true;
  const double margin = radius + 96 / scale;
  return std::abs(py - y) <= height * .5 + margin &&
         (width >= world_width ||
          std::abs(std::remainder(px - x, world_width)) <= width * .5 + margin);
}
double RenderView::coordinate(double value) const {
  const double step = std::max(1. / 65536, 1 / (8 * scale));
  return std::round(value / step) * step;
}
bool RenderView::update(double cx, double cy, double w, double h, double pixels_per_unit) {
  if (!std::isfinite(cx) || !std::isfinite(cy) || !std::isfinite(w) || !std::isfinite(h) ||
      !std::isfinite(pixels_per_unit) || std::abs(cx) > 1e9 || std::abs(cy) > 1e9 || w <= 0 ||
      h <= 0 || w > 1e8 || h > 1e8 || pixels_per_unit < 1e-4 || pixels_per_unit > 1e6)
    throw std::invalid_argument("Ungültiger Bildausschnitt");
  bool changed =
      !configured || x != cx || y != cy || width != w || height != h || scale != pixels_per_unit;
  x = cx;
  y = cy;
  width = w;
  height = h;
  scale = pixels_per_unit;
  configured = true;
  return changed;
}
}
