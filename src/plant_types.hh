#pragma once
#include "geometry_types.hh"
#include <algorithm>
#include <cmath>
#include <limits>
namespace fishsim {
// Plant organs (organ_kind): grass blades, stems (stalks), leaves and round leaves; every kind
// from leaf on is a leaf.
namespace plant_organ = organ_kind;
// Grass traits: fibre (hardness), vigour, size and type.
namespace grass_trait {
inline constexpr int fiber = 0, vigor = 1, size = 2, type = 3, count = 4;
}
using GrassTraits = std::array<double, grass_trait::count>;
// Traits not drawn yet are UNSET_TRAIT; drawn traits lie in [0, 1].
inline constexpr double UNSET_TRAIT = -1;
inline constexpr GrassTraits UNSET_TRAITS{UNSET_TRAIT, UNSET_TRAIT, UNSET_TRAIT, UNSET_TRAIT};
inline bool traits_drawn(const GrassTraits &t) {
  return t[0] >= 0;
}
// Stable pseudo-random values in [0, 1) from a sine hash, shared by plants and their placement.
inline constexpr double SINE_HASH_SCALE = 43758.5453, NOISE_FREQUENCY = 12.9898,
                        NOISE_PHASE = 78.233;
inline double sine_hash(double x) {
  const double v = std::sin(x) * SINE_HASH_SCALE;
  return v - std::floor(v);
}
inline double noise(double k) {
  return sine_hash(k * NOISE_FREQUENCY + NOISE_PHASE);
}
// A separate draw per plant and organ: the weights of both in the hash.
struct NoiseSalt {
  double plant, organ;
};
inline double noise(NoiseSalt salt, double plant, double organ, double offset = 0) {
  return noise(plant * salt.plant + organ * salt.organ + offset);
}
// Organs are at most MAX_ORGAN_LENGTH times their reach long and MAX_ORGAN_WIDTH wide, aim at
// least MIN_ORGAN_TARGET energy and have a hardness within ORGAN_HARDNESS; surface patches are
// at most MAX_PATCH_LENGTH long; drifting plants turn at most MAX_DRIFT_TURN per step.
inline constexpr double MAX_ORGAN_LENGTH = 4, MAX_ORGAN_WIDTH = 16, MIN_ORGAN_TARGET = 1e-6,
                        MAX_PATCH_LENGTH = 16.001, MAX_DRIFT_TURN = .1;
inline constexpr std::array<double, 2> ORGAN_HARDNESS{.1, 16};
// Organs are cut no further than MAX_CUT_ALONG; organs below LIVING_ORGAN energy count as gone.
inline constexpr double MAX_CUT_ALONG = .9, LIVING_ORGAN = .05;
// Canopy cells for light and leaf crowding.
inline constexpr double CANOPY_CELL = 6;
// Plant light is measured PLANT_LIGHT_LIFT above the bed.
inline constexpr double PLANT_LIGHT_LIFT = 1;
// Roots sit at least MIN_ROOT deep.
inline constexpr double MIN_ROOT = .12;
// At most MAX_DRIFTING_GRASS pieces drift; REPLANT_STEPS steps of contact root a drifting plant;
// a plant draws PLANT_BLADES blades; growth history keeps GROWTH_HISTORY steps.
inline constexpr std::size_t MAX_DRIFTING_GRASS = 20000, PLANT_BLADES = 8, GROWTH_HISTORY = 200;
// A saved tank holds at most MAX_SURFACES bed patches, so at most MAX_PLANTS plants.
inline constexpr std::size_t MAX_SURFACES = 200000, MAX_PLANTS = MAX_SURFACES + MAX_DRIFTING_GRASS;
inline constexpr int REPLANT_STEPS = 60;
// The plant index starts from parts of INITIAL_PLANT_RADIUS.
inline constexpr double INITIAL_PLANT_RADIUS = 8;
inline constexpr std::uint64_t plant_shape_period = 24;
// A plant buds new organs while it has fewer than MAX_PLANT_ORGANS and its vitality exceeds
// BUDDING_VITALITY.
inline constexpr std::size_t MAX_PLANT_ORGANS = 48;
inline constexpr double BUDDING_VITALITY = .65;
// Organs are drawn in segments of SEGMENT_GIRTHS girths, between SEGMENT_MIN and SEGMENT_MAX.
inline constexpr double SEGMENT_GIRTHS = 2.4, SEGMENT_MIN = 12, SEGMENT_MAX = 24;
inline int plant_sample_count(double length, double girth) {
  return std::max(
      1, int(std::ceil(length / std::clamp(girth * SEGMENT_GIRTHS, SEGMENT_MIN, SEGMENT_MAX))));
}
// A bite mark: organ position, depth as a share of the full width (sign: side of the organ, +
// along the curve normal), half-width as a share of the organ length, and the step it was made.
struct PlantNotch {
  double at = 0, depth = 0, width = 0;
  std::uint64_t time = 0;
};
// A mark spans at most MAX_NOTCH_WIDTH, the whole organ.
inline constexpr double MAX_NOTCH_WIDTH = 1;
// A bite mark on the piece from..to of its organ, once the organ is cut there: its place and
// half-width become shares of the piece; a mark wider than the piece covers it whole.
inline PlantNotch notch_on_piece(const PlantNotch &n, double from, double to) {
  const double span = to - from;
  return {(n.at - from) / span, n.depth, std::min(MAX_NOTCH_WIDTH, n.width / span), n.time};
}
struct PlantOrgan {
  int kind = 0, parent = -1;
  double attach = .5, length = 1, width = 1, target = 1, energy = 0, root = -1, hardness = 1,
         display_width = 0, loose_width = 0, loose_length = 0, elongation = .04;
  std::uint64_t ready = 0, bare_steps = 0;
  Curve curve{}, draw_curve{};
  Color tint{};
  std::array<PlantNotch, 4> notches{};
  std::uint32_t cuts = 0; // Zählt Schnitte, damit die Anzeige den Stumpf nicht überblendet.
};
// Remaining signed depth of a bite mark; it heals with the given half-life in steps.
inline double notch_depth(const PlantNotch &n, std::uint64_t now, double heal) {
  if (n.depth == 0 || heal <= 0 || now < n.time)
    return n.depth;
  return n.depth * std::exp2(-double(now - n.time) / heal);
}
// Bites leave at least MIN_NOTCHED_WIDTH of the width; a mark of depth d and half-width w removes
// NOTCH_AREA * d * w of the area, at most MAX_NOTCHED_SHARE.
inline constexpr double MIN_NOTCHED_WIDTH = .1, NOTCH_AREA = 2.7, MAX_NOTCHED_SHARE = .6;
// Width factor of an organ at position t after its bite marks.
inline double notched_width(const PlantOrgan &o, double t, std::uint64_t now, double heal) {
  double factor = 1;
  for (const auto &n : o.notches)
    if (n.width > 0) {
      const double u = (t - n.at) / n.width;
      factor -= std::abs(notch_depth(n, now, heal)) * std::exp(-u * u);
    }
  return std::max(MIN_NOTCHED_WIDTH, factor);
}
// Share of the organ area that its bite marks currently remove. The drawn size keeps the
// pre-bite form: a bite shows as a mark, the leaf does not shrink as a whole.
inline double notched_share(const PlantOrgan &o, std::uint64_t now, double heal) {
  double share = 0;
  for (const auto &n : o.notches)
    if (n.width > 0)
      share += NOTCH_AREA * std::abs(notch_depth(n, now, heal)) * n.width;
  return std::min(MAX_NOTCHED_SHARE, share);
}
// Growth encouraged from the context menu: an immediate push of energy, then a few hundred steps
// in which the plant grows faster and above all puts out new blades, stalks and leaves sooner.
// Blades stretch only a little faster, so the energy goes into new blades rather than making
// the old ones shoot up; leaves keep their faster unfolding.
struct GrowthBoost {
  static constexpr std::uint64_t steps = 400;
  static constexpr double grass = .08;            // Immediate share of the grass capacity.
  static constexpr double blade_elongation = .03; // Immediate stretch of living blades.
  static constexpr double leaf_elongation = .12;  // Immediate stretch of unfolding leaves.
  static constexpr double regrowth = .015;        // Share of the missing grass per boosted step.
  static constexpr double blade_stretch = 8;      // Blade elongation speed, relative to normal.
  static constexpr double leaf_stretch = 32;      // Leaf elongation speed, relative to normal.
  static constexpr double budding = 4;            // New organs emerge this much sooner.
};

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
  std::uint64_t boost_until = 0; // Encouraged growth (not saved: a short, local effect).
  std::uint64_t algae_spread = 0, grass_spread = 0, plant_age = 0;
  double root_height = -1, root_lean = 0;
  GrassTraits grass_traits = UNSET_TRAITS;
  std::vector<PlantOrgan> organs;
  double vitality = 1, spin = 0, visual_depth = -1;
  Curve blade{};
  std::array<Curve, PLANT_BLADES> blades{};
  std::uint64_t curve_time = ~std::uint64_t(0);
};
// Length of the control polygon of a curve.
inline double curve_length(const Curve &q) {
  double length = 0;
  for (std::size_t k = 1; k < q.size(); ++k)
    length += std::hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
  return length;
}
inline Point surface_midpoint(const SurfacePatch &s) {
  return {(s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2};
}
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
  int kind = food_kind::algae;
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
  return l2 > (tolerance::rounding * tolerance::rounding)
             ? std::clamp((px * hx + py * hy) / l2, -1., 1.)
             : 0.;
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
  if (d2 < (tolerance::rounding * tolerance::rounding) || width <= 0)
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
  if (half > tolerance::rounding) {
    cap(cx + hx, cy + hy);
    const double ux = hx / half, uy = hy / half;
    double lo = -std::numeric_limits<double>::infinity(), hi = -lo;
    auto slab = [&](double at, double rate, double limit) {
      if (std::abs(rate) < tolerance::rounding) {
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
  if (length2 < (tolerance::rounding * tolerance::rounding))
    return 0;
  const double t = (x * dx + y * dy) / length2, rx = x - t * dx, ry = y - t * dy;
  if (t <= tolerance::precision || t >= 1 - tolerance::precision)
    return 0;
  return 2 * std::sqrt(std::max(0., radius2 - rx * rx - ry * ry));
}

// Stable material traits follow a patch through saves and moved platforms.
inline GrassTraits grass_traits(const SurfacePatch &p) {
  if (traits_drawn(p.grass_traits))
    return p.grass_traits;
  // Each trait follows two waves over the tank: amplitude, wavelengths along x and y, phase.
  struct Wave {
    double amplitude, x, y, phase;
  };
  constexpr std::array<std::array<Wave, 2>, grass_trait::count> waves{
      {{{{.30, 147, 211, 0}, {.15, 61, -173, 0}}},
       {{{.32, 219, -157, 1.4}, {.12, 83, 127, 0}}},
       {{{.32, 173, 233, 2.6}, {.12, 71, -97, 0}}},
       {{{.39, 109, -179, .7}, {.24, 47, 137, 0}}}}};
  const double x = (p.a.x + p.b.x) / 2, y = (p.a.y + p.b.y) / 2;
  GrassTraits traits{};
  for (std::size_t k = 0; k < traits.size(); ++k) {
    traits[k] = TRAIT_MIDDLE;
    for (const auto &w : waves[k])
      traits[k] += w.amplitude * std::sin(x / w.x + y / w.y + w.phase);
  }
  traits[grass_trait::type] = std::clamp(traits[grass_trait::type], 0., 1.);
  return traits;
}
// Offspring traits vary by up to half OFFSPRING_VARIATION around the parent's.
inline constexpr double OFFSPRING_VARIATION = .20, OFFSPRING_PARENT = 4.1414, OFFSPRING_TIME = .017,
                        OFFSPRING_TRAIT = 37.719;
inline GrassTraits grass_offspring(const SurfacePatch &parent, std::uint64_t child,
                                   std::uint64_t time) {
  auto traits = grass_traits(parent);
  for (int k = 0; k < grass_trait::count; ++k) {
    const double hash = sine_hash(child * NOISE_FREQUENCY + parent.id * OFFSPRING_PARENT +
                                  time * OFFSPRING_TIME + k * OFFSPRING_TRAIT);
    traits[k] = std::clamp(traits[k] + OFFSPRING_VARIATION * (hash - .5), 0., 1.);
  }
  return traits;
}
// Grass reaches beyond GRASS_BASE_LENGTH in proportion to the tank's grass length.
inline constexpr double GRASS_BASE_LENGTH = 4;
// Sediment depth is SEDIMENT_DEPTH_GAIN times the amount per unit length.
inline constexpr double SEDIMENT_DEPTH_GAIN = 4;
// Plant types (plant_type) in order; each pair shares a form (plant_form).
inline constexpr int GRASS_TYPES_PER_FORM = plant_type::count / plant_form::count;
inline int grass_type(const SurfacePatch &p) {
  return std::clamp(int(grass_traits(p)[grass_trait::type] * plant_type::count), 0,
                    plant_type::count - 1);
}
inline int grass_form(const SurfacePatch &p) {
  return grass_type(p) / GRASS_TYPES_PER_FORM;
}
// Crowns sit at least ANCHOR_MARGIN inside their patch, varied by patch, owner and edge.
inline constexpr double ANCHOR_MARGIN = .02, ANCHOR_ID = 7.931, ANCHOR_OWNER = .137,
                        ANCHOR_EDGE = 2.71;
inline double grass_anchor(const SurfacePatch &s) {
  const double h = noise(s.id * ANCHOR_ID + s.owner * ANCHOR_OWNER + s.edge * ANCHOR_EDGE);
  return ANCHOR_MARGIN + (1 - 2 * ANCHOR_MARGIN) * (h < .5 ? 2 * h * h : 1 - 2 * (1 - h) * (1 - h));
}
// Roots keep a spacing by form, varied by vigour; grass has MIN_STEMS plus up to EXTRA_STEMS
// stems by size; fibre ranges from FIBER_MIN by FIBER_SPREAD.
inline constexpr double ROOT_SPACING_MIN = .8, ROOT_SPACING_SPREAD = .4, FIBER_MIN = .5,
                        FIBER_SPREAD = 3.5;
inline constexpr int MIN_STEMS = 2, EXTRA_STEMS = 6;
inline double grass_root_spacing(const SurfacePatch &s) {
  constexpr Color spacing{5.6, 25, 13};
  return spacing[grass_form(s)] *
         (ROOT_SPACING_MIN + ROOT_SPACING_SPREAD * grass_traits(s)[grass_trait::vigor]);
}
inline int grass_stems(const SurfacePatch &p) {
  return MIN_STEMS +
         std::min(EXTRA_STEMS, int(grass_traits(p)[grass_trait::size] * (EXTRA_STEMS + 1)));
}
inline double grass_fiber(const SurfacePatch &p) {
  return FIBER_MIN + FIBER_SPREAD * grass_traits(p)[grass_trait::fiber];
}
// Root depth varies by ROOT_WAVE along the patch.
inline constexpr double ROOT_WAVE = .035, ROOT_WAVE_ID = 3.17, ROOT_WAVE_ALONG = 183.7;
inline double grass_root_depth(const SurfacePatch &p, double depth, double at = .5) {
  // Roots are buried like the bases of small animals, by the crown and its position.
  const double crown = sine_hash(p.id * ANCHOR_ID),
               offset = ROOT_WAVE * std::sin(p.id * ROOT_WAVE_ID + at * ROOT_WAVE_ALONG),
               deepest = fauna::burial_min + fauna::burial_spread;
  return std::max(0., depth) * std::clamp(fauna::burial_min + fauna::burial_spread * crown + offset,
                                          fauna::burial_min, deepest);
}
inline double sediment_depth(double amount, double length) {
  return length > 0 ? SEDIMENT_DEPTH_GAIN * amount / length : 0;
}
inline double sediment_depth(const SurfacePatch &p) {
  return sediment_depth(p.sediment, p.length);
}
inline double grass_root_depth(const SurfacePatch &p) {
  return grass_root_depth(p, sediment_depth(p));
}
// Algae films that cannot grow vanish into detritus below ALGAE_REMNANT_SHARE of a sprouting film
// (seed_energy).
inline constexpr double ALGAE_REMNANT_SHARE = .1;
// Algae on a patch without an exposed interval and without mussel shells lie buried: under
// sediment or against other rock.
inline bool algae_buried(const SurfacePatch &p) {
  return p.algae_open[1] <= p.algae_open[0] && p.mussel_arc <= 0;
}
inline double loose_sediment(const SurfacePatch &p) {
  return std::max(0., p.sediment - p.sediment_hold * p.length / SEDIMENT_DEPTH_GAIN);
}
// Displayed width: by form, by size from WIDTH_MIN, and growing with the filled capacity.
inline constexpr Color FORM_WIDTH{1, 14, 5};
inline constexpr double WIDTH_MIN = .35, WIDTH_SIZE = 1.45, WIDTH_FILL_MIN = .4;
inline double grass_width(const SurfacePatch &p, double capacity) {
  return FORM_WIDTH[grass_form(p)] * (WIDTH_MIN + WIDTH_SIZE * grass_traits(p)[grass_trait::size]) *
         (WIDTH_FILL_MIN +
          (1 - WIDTH_FILL_MIN) *
              std::sqrt(std::clamp(p.grass / std::max(tolerance::rounding, capacity), 0., 1.)));
}
// Plant colours keep GREEN_KEEP of their red and blue and take a share of the green into them.
inline constexpr double GREEN_KEEP = .8, GREEN_RED = .55, GREEN_BLUE = .35;
inline Color green_tint(Color color) {
  color[rgb::red] = GREEN_KEEP * color[rgb::red] + (1 - GREEN_KEEP) * GREEN_RED * color[rgb::green];
  color[rgb::blue] =
      GREEN_KEEP * color[rgb::blue] + (1 - GREEN_KEEP) * GREEN_BLUE * color[rgb::green];
  return color;
}
inline Color grass_color(const SurfacePatch &p) {
  auto t = grass_traits(p);
  // Colour by fibre m and vigour h: base, vigour and fibre gains per channel.
  constexpr Color base{.15, .80, .50}, vigor{.27, -.12, -.38}, fiber{-.10, -.38, .12};
  const double m = t[grass_trait::fiber], h = t[grass_trait::vigor];
  Color color{};
  for (int c = 0; c < rgb::count; ++c)
    color[c] = base[c] + vigor[c] * h + fiber[c] * m;
  return green_tint(color);
}
}
