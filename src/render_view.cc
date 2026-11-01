#include "render_view.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace fishsim {
namespace {
// Objects within VIEW_MARGIN screen pixels of the view are included; coordinates are quantised to
// an eighth of a pixel (SUBPIXELS), but no finer than the wire's coordinate units.
constexpr double VIEW_MARGIN = 96, SUBPIXELS = 8;
// Views lie within MAX_VIEW_CENTER, span at most MAX_VIEW_SIZE and scale between MIN_VIEW_SCALE
// and MAX_VIEW_SCALE pixels per unit.
constexpr double MAX_VIEW_CENTER = 1e9, MAX_VIEW_SIZE = 1e8, MIN_VIEW_SCALE = 1e-4,
                 MAX_VIEW_SCALE = 1e6;
}
bool RenderView::includes(double px, double py, double radius, double world_width) const {
  if (!configured)
    return true;
  const double margin = radius + VIEW_MARGIN / scale;
  return std::abs(py - y) <= height / 2 + margin &&
         (width >= world_width ||
          std::abs(std::remainder(px - x, world_width)) <= width / 2 + margin);
}
double RenderView::coordinate(double value) const {
  const double step = std::max(1 / render_wire::coordinate_units, 1 / (SUBPIXELS * scale));
  return std::round(value / step) * step;
}
bool RenderView::update(double cx, double cy, double w, double h, double pixels_per_unit) {
  if (!std::isfinite(cx) || !std::isfinite(cy) || !std::isfinite(w) || !std::isfinite(h) ||
      !std::isfinite(pixels_per_unit) || std::abs(cx) > MAX_VIEW_CENTER ||
      std::abs(cy) > MAX_VIEW_CENTER || w <= 0 || h <= 0 || w > MAX_VIEW_SIZE ||
      h > MAX_VIEW_SIZE || pixels_per_unit < MIN_VIEW_SCALE || pixels_per_unit > MAX_VIEW_SCALE)
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
