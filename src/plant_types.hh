#pragma once
#include "geometry_types.hh"
#include <algorithm>
#include <cmath>
#include <limits>
namespace fishsim {
inline constexpr std::uint64_t plant_shape_period = 24;
inline int plant_sample_count(double length, double girth) {
  return std::max(1, int(std::ceil(length / std::clamp(girth * 2.4, 12., 24.))));
}
// A bite mark: organ position, depth as a share of the width (sign: side of the organ, + along
// the curve normal), half-width as a share of the organ length, and the step it was made.
struct PlantNotch {
  double at = 0, depth = 0, width = 0;
  std::uint64_t time = 0;
};
struct PlantOrgan {
  int kind = 0, parent = -1;
  double attach = .5, length = 1, width = 1, target = 1, energy = 0, root = -1, hardness = 1,
         display_width = 0, loose_width = 0, loose_length = 0, elongation = .04;
  std::uint64_t ready = 0, bare_steps = 0;
  std::array<Point, 4> curve{}, draw_curve{};
  std::array<double, 3> tint{};
  std::array<PlantNotch, 4> notches{};
};
// Remaining signed depth of a bite mark; it heals with the given half-life in steps.
inline double notch_depth(const PlantNotch &n, std::uint64_t now, double heal) {
  if (n.depth == 0 || heal <= 0 || now < n.time)
    return n.depth;
  return n.depth * std::exp2(-double(now - n.time) / heal);
}
// Width factor of an organ at position t after its bite marks.
inline double notched_width(const PlantOrgan &o, double t, std::uint64_t now, double heal) {
  double factor = 1;
  for (const auto &n : o.notches)
    if (n.width > 0) {
      const double u = (t - n.at) / n.width;
      factor -= std::abs(notch_depth(n, now, heal)) * std::exp(-u * u);
    }
  return std::max(.1, factor);
}
struct SurfacePatch {
  std::uint64_t id = 0, owner = 0;
  int edge = 0, slot = 0;
  Point a, b, normal;
  double length = 0, algae = 0, grass = 0, sediment = 0, grass_max = 0;
  double algae_grazed = 0, grass_grazed = 0;
  double detritus = 0, worms = 0, mussel_arc = 0;
  std::array<double, 2> algae_open{0, 1}; // Derived exposed interval along the surface.
  double sediment_hold = 0;               // Protected bed depth, derived from enclosing geometry.
  std::array<double, 2> sediment_rim{};   // Curvature towards the planter walls, also derived.
  bool stump = false;
  std::uint64_t algae_spread = 0, grass_spread = 0, plant_age = 0;
  double root_height = -1, root_lean = 0;
  std::array<double, 4> grass_traits{-1, -1, -1, -1};
  std::vector<PlantOrgan> organs;
  double vitality = 1, spin = 0, visual_depth = -1;
  std::array<Point, 4> blade{};
  std::array<std::array<Point, 4>, 8> blades{};
  std::uint64_t curve_time = ~std::uint64_t(0);
};
inline double soil_fertility(const SurfacePatch &s) {
  const double organic = std::max(0., s.detritus);
  return organic / (organic + std::max(1., 4 * s.sediment));
}
struct DriftingGrass {
  SurfacePatch plant;
  std::uint64_t id = 0, age = 0, contact_surface = 0;
  int root_contact = 0;
  double x = 0, y = 0, vx = 0, vy = 0;
};
// A plant part is a stroke: the segment (x, y) ± (hx, hy) with half-width `width`.
// Algae flakes are round strokes without length. `radius` bounds the whole stroke.
struct PlantPart {
  double x = 0, y = 0, radius = 0, energy = 0;
  std::size_t patch = 0;
  int kind = 4;
  double along = 1;
  int organ = -1;
  double hardness = 1;
  double hx = 0, hy = 0, width = 0, along_from = 1, along_to = 1;
  int organ_kind = -1;
};
// Parts built by hand (tests, old caches) without a stroke width are round strokes.
inline double stroke_width(const PlantPart &p) {
  return p.width > 0 ? p.width : p.radius;
}
inline double stroke_half_length(const PlantPart &p) {
  return std::hypot(p.hx, p.hy);
}
// Position along the stroke (-1 … 1) closest to the point (px, py) relative to its centre.
inline double stroke_closest(double hx, double hy, double px, double py) {
  const double l2 = hx * hx + hy * hy;
  return l2 > 1e-24 ? std::clamp((px * hx + py * hy) / l2, -1., 1.) : 0.;
}
// Distance from a point (relative to the stroke centre) to the stroke surface; negative inside.
inline double stroke_distance(double hx, double hy, double width, double px, double py) {
  const double s = stroke_closest(hx, hy, px, py);
  return std::hypot(px - s * hx, py - s * hy) - width;
}
inline double stroke_distance(const PlantPart &p, double px, double py) {
  return stroke_distance(p.hx, p.hy, stroke_width(p), px, py);
}
// Organ position (0 at the base, 1 at the tip) of a stroke position s in -1 … 1.
inline double stroke_along(const PlantPart &p, double s) {
  return p.along_from + (s + 1) * .5 * (p.along_to - p.along_from);
}
// Ray parameters t (point t·(dx, dy)) where the line enters and leaves the stroke whose centre
// lies at (cx, cy). The stroke is convex, so the union of its two caps and its body is one
// interval.
inline bool stroke_interval(double cx, double cy, double hx, double hy, double width, double dx,
                            double dy, double &enter, double &leave) {
  const double d2 = dx * dx + dy * dy;
  enter = std::numeric_limits<double>::infinity();
  leave = -enter;
  if (d2 < 1e-24 || width <= 0)
    return false;
  auto cap = [&](double px, double py) {
    const double b = (px * dx + py * dy) / d2, c = (px * px + py * py - width * width) / d2,
                 disc = b * b - c;
    if (disc < 0)
      return;
    const double r = std::sqrt(disc);
    enter = std::min(enter, b - r);
    leave = std::max(leave, b + r);
  };
  cap(cx - hx, cy - hy);
  const double half = std::hypot(hx, hy);
  if (half > 1e-12) {
    cap(cx + hx, cy + hy);
    const double ux = hx / half, uy = hy / half;
    double lo = -std::numeric_limits<double>::infinity(), hi = -lo;
    auto slab = [&](double at, double rate, double limit) {
      if (std::abs(rate) < 1e-15) {
        if (std::abs(at) > limit)
          hi = -std::numeric_limits<double>::infinity();
        return;
      }
      double a = (-limit - at) / rate, b = (limit - at) / rate;
      if (a > b)
        std::swap(a, b);
      lo = std::max(lo, a);
      hi = std::min(hi, b);
    };
    slab(-(ux * cx + uy * cy), ux * dx + uy * dy, half);
    slab(uy * cx - ux * cy, -uy * dx + ux * dy, width);
    if (hi >= lo) {
      enter = std::min(enter, lo);
      leave = std::max(leave, hi);
    }
  }
  return leave >= enter;
}
// Optical depth (log2 units) of the stroke along the sight line from the origin to (dx, dy).
// `depth` belongs to one crossing perpendicular to the stroke; oblique paths count up to twice.
inline double stroke_optical_depth(double cx, double cy, double hx, double hy, double width,
                                   double depth, double dx, double dy) {
  double enter, leave;
  if (depth <= 0 || !stroke_interval(cx, cy, hx, hy, width, dx, dy, enter, leave))
    return 0;
  const double path = std::max(0., std::min(1., leave) - std::max(0., enter)) * std::hypot(dx, dy);
  return depth * std::min(2., path / (2 * width));
}

inline double foliage_chord(double x, double y, double dx, double dy, double length2,
                            double radius2) {
  if (length2 < 1e-24)
    return 0;
  const double t = (x * dx + y * dy) / length2, rx = x - t * dx, ry = y - t * dy;
  if (t <= 1e-6 || t >= 1 - 1e-6)
    return 0;
  return 2 * std::sqrt(std::max(0., radius2 - rx * rx - ry * ry));
}

// Stable material traits follow a patch through saves and moved platforms.
inline std::array<double, 4> grass_traits(const SurfacePatch &p) {
  if (p.grass_traits[0] >= 0)
    return p.grass_traits;
  double x = (p.a.x + p.b.x) * .5, y = (p.a.y + p.b.y) * .5;
  return {.5 + .30 * std::sin(x / 147 + y / 211) + .15 * std::sin(x / 61 - y / 173),
          .5 + .32 * std::sin(x / 219 - y / 157 + 1.4) + .12 * std::sin(x / 83 + y / 127),
          .5 + .32 * std::sin(x / 173 + y / 233 + 2.6) + .12 * std::sin(x / 71 - y / 97),
          std::clamp(.5 + .39 * std::sin(x / 109 - y / 179 + .7) + .24 * std::sin(x / 47 + y / 137),
                     0., 1.)};
}
inline std::array<double, 4> grass_offspring(const SurfacePatch &parent, std::uint64_t child,
                                             std::uint64_t time) {
  auto traits = grass_traits(parent);
  for (int k = 0; k < 4; ++k) {
    double hash =
        std::sin(child * 12.9898 + parent.id * 4.1414 + time * .017 + k * 37.719) * 43758.5453;
    traits[k] = std::clamp(traits[k] + .20 * (hash - std::floor(hash) - .5), 0., 1.);
  }
  return traits;
}
inline int grass_type(const SurfacePatch &p) {
  return std::clamp(int(grass_traits(p)[3] * 6), 0, 5);
}
inline int grass_form(const SurfacePatch &p) {
  return grass_type(p) / 2;
}
inline double grass_anchor(const SurfacePatch &s) {
  double h =
      std::sin((s.id * 7.931 + s.owner * .137 + s.edge * 2.71) * 12.9898 + 78.233) * 43758.5453;
  h -= std::floor(h);
  return .02 + .96 * (h < .5 ? 2 * h * h : 1 - 2 * (1 - h) * (1 - h));
}
inline double grass_root_spacing(const SurfacePatch &s) {
  return (grass_form(s) == 0   ? 5.6
          : grass_form(s) == 1 ? 25.
                               : 13.) *
         (.8 + .4 * grass_traits(s)[1]);
}
inline int grass_stems(const SurfacePatch &p) {
  return 2 + std::min(6, int(grass_traits(p)[2] * 7));
}
inline double grass_fiber(const SurfacePatch &p) {
  return .5 + 3.5 * grass_traits(p)[0];
}
inline double grass_root_depth(const SurfacePatch &p, double depth, double at = .5) {
  double crown = std::sin(p.id * 7.931) * 43758.5453;
  crown -= std::floor(crown);
  const double offset = .035 * std::sin(p.id * 3.17 + at * 183.7);
  return std::max(0., depth) * std::clamp(.2 + .6 * crown + offset, .2, .8);
}
inline double sediment_depth(double amount, double length) {
  return length > 0 ? 4 * amount / length : 0;
}
inline double sediment_depth(const SurfacePatch &p) {
  return sediment_depth(p.sediment, p.length);
}
inline double grass_root_depth(const SurfacePatch &p) {
  return grass_root_depth(p, sediment_depth(p));
}
inline double loose_sediment(const SurfacePatch &p) {
  return std::max(0., p.sediment - p.sediment_hold * p.length / 4);
}
inline double grass_width(const SurfacePatch &p, double capacity) {
  return (grass_form(p) == 1   ? 14.
          : grass_form(p) == 2 ? 5.
                               : 1.) *
         (.35 + 1.45 * grass_traits(p)[2]) *
         (.4 + .6 * std::sqrt(std::clamp(p.grass / std::max(1e-12, capacity), 0., 1.)));
}
inline std::array<double, 3> green_tint(std::array<double, 3> color) {
  color[0] = .8 * color[0] + .2 * .55 * color[1];
  color[2] = .8 * color[2] + .2 * .35 * color[1];
  return color;
}
inline std::array<double, 3> grass_color(const SurfacePatch &p) {
  auto t = grass_traits(p);
  double m = t[0], h = t[1];
  return green_tint(
      {.15 + .27 * h - .10 * m, .80 - .38 * m - .12 * h, .12 + .38 * (1 - h) + .12 * m});
}
}
