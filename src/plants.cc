#include "body.hh"
#include "plants.hh"
#include <numeric>
namespace fishsim {
namespace {
constexpr std::array<Color, plant_type::count> TYPE_COLORS{{{{.40, .76, .12}},
                                                            {{.08, .46, .43}},
                                                            {{.34, .48, .17}},
                                                            {{.12, .38, .20}},
                                                            {{.38, .55, .23}},
                                                            {{.27, .66, .26}}}};
constexpr double TINT_BASE = .75, TINT_VIGOR = .45, TINT_FIBER = .22, RED_KEEP = .45,
                 BLUE_KEEP = .5, FIBER_TINT = .34, SHIMMER_ID = 1.71, SHIMMER_ORGAN = 2.39,
                 SHADE_BASE = .93, SHADE_SPREAD = .10, SHADE_ORGAN = 2.1, SHADE_ID = .73,
                 MAX_DRYNESS = .82, ORGAN_DRYING = 4800, TIP_RED = .10, TIP_GREEN = .05;
constexpr Color SHIMMER{.025, .014, -.015}, DEAD_COLOR{.43, .32, .16};
Color organ_tint(const SurfacePatch &p, int index) {
  auto traits = grass_traits(p);
  int form = grass_form(p);
  bool second = grass_type(p) % GRASS_TYPES_PER_FORM;
  auto color = TYPE_COLORS[grass_type(p)];
  const double hard = traits[grass_trait::fiber], soft = 1 - hard;
  for (int k = 0; k < rgb::count; ++k)
    color[k] *= (TINT_BASE + TINT_VIGOR * traits[grass_trait::vigor]) * (1 - TINT_FIBER * hard);
  color[rgb::red] = color[rgb::red] * RED_KEEP + FIBER_TINT * soft;
  color[rgb::green] = color[rgb::green] * (1 - TINT_FIBER * hard);
  color[rgb::blue] = color[rgb::blue] * BLUE_KEEP + FIBER_TINT * hard;
  color = green_tint(color);

  double phase = std::sin(p.id * SHIMMER_ID + index * SHIMMER_ORGAN),
         shade = SHADE_BASE + SHADE_SPREAD * std::sin(index * SHADE_ORGAN + p.id * SHADE_ID),
         dry = 1 - p.vitality;
  if (form <= plant_form::rosette && index >= 0 && std::size_t(index) < p.organs.size() &&
      p.organs[index].kind != plant_organ::stem)
    dry = std::max(dry, std::min(MAX_DRYNESS, p.organs[index].bare_steps / ORGAN_DRYING));
  bool stalk = index >= 0 && std::size_t(index) < p.organs.size() &&
               p.organs[index].kind == plant_organ::stem;
  if (form == plant_form::stem && !second && index > 0) {
    color[rgb::red] += TIP_RED * index / std::max<std::size_t>(1, p.organs.size());
    color[rgb::green] -= TIP_GREEN * index / std::max<std::size_t>(1, p.organs.size());
  }
  for (int k = 0; k < rgb::count; ++k)
    color[k] = std::clamp((color[k] * shade + phase * SHIMMER[k]) *
                                  (stalk ? organ_profile::stem_tint[k] : 1.) * (1 - dry) +
                              DEAD_COLOR[k] * dry,
                          0., 1.);
  return color;
}
}
Color plant_organ_color(const SurfacePatch &p, int index) {
  return index >= 0 && std::size_t(index) < p.organs.size() ? p.organs[index].tint : grass_color(p);
}
namespace {
constexpr NoiseSalt BLADE_SALT{9.7, 3.1}, ROOT_SALT{3.7, 7.3}, ROSETTE_SALT{7.1, 6.7},
    ROSETTE_LEAF_SALT{1.3, 7.2}, NODE_SALT{4.1, 9.2}, STEM_LEAF_SALT{1.7, 3.2},
    BLADE_PAUSE_SALT{1, 91}, BUD_SALT{19.1, 3.7}, SHAPE_SALT{1.7, 3.19}, BLADE_GROWTH_SALT{1, 7.13},
    LEAF_GROWTH_SALT{2.91, 7.13}, ORGAN_LIFE_SALT{3.17, 8.31};
constexpr int NODE_LEAVES = 2, ROSETTE_PAIR = 2;
constexpr double MIN_TARGET = .001;
constexpr double RIBBON_LENGTH = .85, RIBBON_SPREAD = .40, FINE_LENGTH = .40, FINE_SPREAD = .25;
constexpr double ATTACH_MARGIN = .025, ROOT_SPREAD = 5;
constexpr double CLEARANCE_GAIN = 1.07, CLEARANCE_MIN = .08, CLEARANCE_LENGTH = .45,
                 CONSTRAIN_SAMPLE = 4, POSITION_TOLERANCE = .01;
constexpr int MIN_CONSTRAIN_SAMPLES = 8, MAX_CONSTRAIN_SAMPLES = 40;
constexpr double LEAF_MAX_WIDTH = 5.7, ROUND_MAX_WIDTH = 6.9, LEAF_MIN_WIDTH = .15;
constexpr int PROFILE_KINDS = plant_organ::round_leaf + 1;
double grass_blade_length(bool band, double variation) {
  return band ? RIBBON_LENGTH + RIBBON_SPREAD * variation : FINE_LENGTH + FINE_SPREAD * variation;
}
double crown_anchor(const SurfacePatch &s) {
  return grass_anchor(s);
}
double root_attach(const SurfacePatch &s, double h, double spread) {
  return std::clamp(crown_anchor(s) + (h - .5) * spread * ROOT_SPREAD, ATTACH_MARGIN,
                    1 - ATTACH_MARGIN);
}
Point mix(Point a, Point b, double t) {
  return {a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t};
}
Point curve(const Curve &q, double t) {
  auto a = mix(q[0], q[1], t), b = mix(q[1], q[2], t), c = mix(q[2], q[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
Curve upper(const Curve &q, double t) {
  auto a = mix(q[0], q[1], t), b = mix(q[1], q[2], t), c = mix(q[2], q[3], t), d = mix(a, b, t),
       e = mix(b, c, t);
  return {mix(d, e, t), e, c, q[3]};
}
double mass(const SurfacePatch &p) {
  double result = 0;
  for (const auto &o : p.organs)
    result += o.energy;
  return result;
}
bool passage(const Field &f, Point a, Point b, double margin = 0) {
  double dx = f.delta_x(b.x - a.x), dy = b.y - a.y, length = std::hypot(dx, dy);
  if (length < tolerance::negligible)
    return true;
  return f.clear_line(a.x, a.y, b.x, b.y) ||
         f.ray(a.x, a.y, dx / length, dy / length, margin, length + POSITION_TOLERANCE) >=
             length - POSITION_TOLERANCE;
}
double profile(int kind, double t) {
  namespace O = organ_profile;
  if (kind == plant_organ::blade)
    return std::pow(std::max(0., 1 - std::pow(t, O::blade_power)), O::blade_shape);
  if (kind == plant_organ::stem)
    return (1 - O::stem_taper * t) *
           (1 + O::stem_knot * std::exp(-std::pow((t - O::knot_at) / O::knot_width, 2)));
  if (t < O::leaf_base)
    return O::leaf_stalk;
  double u = (t - O::leaf_base) / (1 - O::leaf_base), s = std::max(0., std::sin(PI * u));
  return kind == plant_organ::leaf ? std::pow(s, O::leaf_power) *
                                         (1 + O::leaf_ripple * std::sin(O::leaf_ripples * PI * u))
                                   : std::pow(s, O::round_power) * (1 - O::round_taper * u);
}
const std::vector<double> &sampled_profile(int kind, int n, bool midpoint = true) {
  thread_local std::array<std::vector<std::vector<double>>, 2 * PROFILE_KINDS> cache;
  auto &grids = cache[kind + (midpoint ? 0 : PROFILE_KINDS)];
  if (grids.size() <= std::size_t(n))
    grids.resize(n + 1);
  auto &values = grids[n];
  if (values.empty()) {
    values.reserve(n);
    for (int k = 0; k < n; ++k)
      values.push_back(profile(kind, (k + (midpoint ? .5 : 1.)) / n));
  }
  return values;
}
double organ_width(const PlantOrgan &o, double length) {
  return o.loose_width > 0 ? o.loose_width
         : o.kind < plant_organ::leaf
             ? o.width
             : std::min(o.kind == plant_organ::leaf ? LEAF_MAX_WIDTH : ROUND_MAX_WIDTH,
                        std::max(LEAF_MIN_WIDTH, length * o.width));
}
bool empty_area(const Field &f, const Curve &q, double girth) {
  double left = q[0].x, right = left, top = q[0].y, bottom = top;
  for (int k = 1; k < CURVE_POINTS; ++k) {
    left = std::min(left, q[k].x);
    right = std::max(right, q[k].x);
    top = std::min(top, q[k].y);
    bottom = std::max(bottom, q[k].y);
  }
  double margin = CLEARANCE_GAIN * girth + CLEARANCE_MIN;
  left -= margin;
  right += margin;
  top -= margin;
  bottom += margin;
  if (top < 0 || bottom >= f.geometry().height)
    return false;
  if (f.geometry().obstacles.empty())
    return true;
  const auto &grid = f.geometry().shape_grid;
  if (!grid.columns || f.geometry().indexed_shapes != f.geometry().obstacles.size() ||
      grid.width != f.geometry().width || right - left >= f.geometry().width)
    return false;
  std::array<bool, MAX_OBSTACLES> seen{};
  int a = int(top / grid.cell), b = std::min(grid.rows - 1, int(bottom / grid.cell));
  for (double shift : {-f.geometry().width, 0., f.geometry().width}) {
    double lo = left + shift, hi = right + shift;
    if (hi < 0 || lo >= f.geometry().width)
      continue;
    int start = std::max(0, int(lo / grid.cell)),
        end = std::min(grid.columns - 1, int(hi / grid.cell));
    for (int j = a; j <= b; ++j)
      for (int i = start; i <= end; ++i)
        for (auto id : grid.bins[j * grid.columns + i]) {
          if (seen[id])
            continue;
          seen[id] = true;
          const auto &o = f.geometry().obstacles[id];
          double x1 = o.x - o.radius, x2 = o.x + o.radius, y1 = o.y - o.radius, y2 = o.y + o.radius;
          if (!o.vertices.empty()) {
            x1 = x2 = o.vertices[0].x;
            y1 = y2 = o.vertices[0].y;
            for (auto p : o.vertices) {
              x1 = std::min(x1, p.x);
              x2 = std::max(x2, p.x);
              y1 = std::min(y1, p.y);
              y2 = std::max(y2, p.y);
            }
          }
          if (y2 < top || y1 > bottom)
            continue;
          for (double image : {-f.geometry().width, 0., f.geometry().width})
            if (x2 + image >= left && x1 + image <= right)
              return false;
        }
  }
  return true;
}
Curve constrain(const Field &f, Curve q, double girth, int kind) {
  if (empty_area(f, q, girth))
    return q;
  const double length = curve_length(q);
  int samples = std::clamp(int(std::ceil(length / CONSTRAIN_SAMPLE)), MIN_CONSTRAIN_SAMPLES,
                           MAX_CONSTRAIN_SAMPLES);
  Point last = q[0];
  double extent = 1;
  const auto &widths = sampled_profile(kind, samples, false);
  for (int k = 1; k <= samples; ++k) {
    double t = double(k) / samples;
    auto p = curve(q, t);
    double margin = std::min(CLEARANCE_MIN + girth * widths[k - 1],
                             CLEARANCE_MIN + length * t * CLEARANCE_LENGTH);
    if (!f.free(p.x, p.y, margin) || !passage(f, last, p)) {
      extent = double(k - 1) / samples;
      break;
    }
    last = p;
  }
  if (extent < 1) {
    double t = extent, u = 1 - t;
    return {q[0], mix(q[0], q[1], t),
            Point{u * u * q[0].x + 2 * u * t * q[1].x + t * t * q[2].x,
                  u * u * q[0].y + 2 * u * t * q[1].y + t * t * q[2].y},
            curve(q, t)};
  }
  return q;
}
}
double Field::plant_illumination(const SurfacePatch &s) const {
  double illuminated = 0, foliage = 0;
  for (const auto &o : s.organs)
    if (o.kind != plant_organ::stem && o.energy > 0) {
      const auto near = curve(o.curve, .25), far = curve(o.curve, .75);
      illuminated += o.energy * (light(near.x, near.y) + light(far.x, far.y)) / 2;
      foliage += o.energy;
    }
  if (foliage > 0)
    return illuminated / foliage;
  const auto p = surface_midpoint(s);
  const double height = soil_depth(s) + PLANT_LIGHT_LIFT;
  return light(p.x + s.normal.x * height, p.y + s.normal.y * height);
}
Curve lower_curve(Curve q, double t) {
  Curve result{q[0], {}, {}, {}};
  for (int level = CURVE_POINTS - 1; level > 0; --level) {
    for (int i = 0; i < level; ++i)
      q[i] = mix(q[i], q[i + 1], t);
    result[CURVE_POINTS - level] = q[0];
  }
  return result;
}
void release_organ(PlantOrgan &o, double cut) {
  if (o.display_width > 0) {
    o.curve = o.draw_curve;
    o.loose_width = o.display_width;
  } else if (o.loose_width <= 0)
    o.loose_width = organ_width(o, chord_length(o.curve));
  o.elongation = 1;
  if (cut > 0)
    o.curve = upper(o.curve, cut);
  o.draw_curve = o.curve;
  o.loose_length = curve_length(o.curve);
}
namespace {
using Traits = GrassTraits;
namespace T = grass_trait;
struct OrganShape {
  double length, width, weight, hardness;
};
constexpr double ROSETTE_STALK_SHARE = .18, STALK_SHARE_MIN = .60, STALK_SHARE_VIGOR = .20;
constexpr int MIN_BLADES = 3, FEWER_RIBBONS = 1, MORE_FINE = 2, EXTRA_BLADES = 4;
constexpr double RIBBON_SPREAD_ROOT = .22, FINE_SPREAD_ROOT = .10, SPREAD_SIZE = .055,
                 BUD_SPREAD = .035, BUD_SPREAD_SIZE = .05, RIBBON_WIDTH = 1.5,
                 RIBBON_WIDTH_SIZE = 1.0, FINE_WIDTH = .28, FINE_WIDTH_SIZE = .24,
                 ROOT_JITTER_MIN = .2, ROOT_JITTER = .6, BLADE_PAUSE = 900,
                 BLADE_PAUSE_SPREAD = 700;
constexpr int MIN_ROSETTE_LEAVES = 3, ROSETTE_LEAVES_SIZE = 3, MAX_ROSETTE_LEAVES = 5,
              ROSETTE_BUDS_SIZE = 2;
constexpr double ROSETTE_FAN = .12, ROSETTE_STALK_WEIGHT = .35, LEAF_WIDENING = 1.4;
constexpr int MIN_NODES = 2, NODES_SIZE = 2, MAX_NODES = 16;
constexpr double STEM_STALK_WEIGHT = .65, SECOND_LEAF = .88, NODE_LENGTH = .10,
                 LATER_NODE_LENGTH = .13, NODE_LENGTH_SPREAD = .065;
constexpr double BUD_PAUSE = 900, LEAF_PAUSE = 440;
constexpr double SEEDLING_SHARE = .18;
constexpr int FIRST_STEM_PARENTS = 3;
constexpr double BUD_FILL = .68, BOOSTED_BUD_FILL = .35, BUD_STRETCH = .35,
                 BOOSTED_BUD_STRETCH = .1, BUDDING_FILL = .28;
constexpr double NEIGHBOUR_STRETCH = .22, ROSETTE_FILL = .2, STALK_PARENT_FILL = .62,
                 LEAF_PARENT_FILL = .35;
double stalk_share(int form, const Traits &t) {
  return form == plant_form::rosette ? ROSETTE_STALK_SHARE
                                     : STALK_SHARE_MIN + STALK_SHARE_VIGOR * t[T::vigor];
}
struct ShapeRule {
  double length, length_size, length_chance, width, width_fiber, hardness, hardness_fiber;
};
constexpr double LEAF_WEIGHT = 1;
constexpr ShapeRule LANCE_STALK{.10, .22, .16, .25, .20, 1.7, 1},
    ROUND_STALK{.08, .15, .10, .25, .20, 1.7, 1},
    LANCE_LEAF{.18, 0, .16, .055 * LEAF_WIDENING, .095 * LEAF_WIDENING, .85, .4},
    ROUND_LEAF{.10, 0, .09, .16 * LEAF_WIDENING, .18 * LEAF_WIDENING, 1.8, .6},
    STEM_NODE{0, 0, NODE_LENGTH_SPREAD, .27, .20, 1.9, 1},
    PAIRED_LEAF{.10, 0, NODE_LENGTH_SPREAD, .065, .105, .9, .4},
    ALTERNATE_LEAF{.075, 0, NODE_LENGTH_SPREAD, .17, .19, .9, .4};
OrganShape organ_shape(const ShapeRule &r, const Traits &t, double h, double weight,
                       double length = 0) {
  return {length + r.length + r.length_size * t[T::size] + r.length_chance * h,
          r.width + r.width_fiber * t[T::fiber], weight,
          r.hardness + r.hardness_fiber * t[T::fiber]};
}
OrganShape rosette_stalk(bool round, const Traits &t, double h) {
  return organ_shape(round ? ROUND_STALK : LANCE_STALK, t, h, ROSETTE_STALK_WEIGHT);
}
OrganShape rosette_leaf(bool round, const Traits &t, double h) {
  return organ_shape(round ? ROUND_LEAF : LANCE_LEAF, t, h, LEAF_WEIGHT);
}
OrganShape stem_node(const Traits &t, double h, double length) {
  return organ_shape(STEM_NODE, t, h, STEM_STALK_WEIGHT, length);
}
OrganShape stem_leaf(bool alternate, const Traits &t, double h) {
  return organ_shape(alternate ? ALTERNATE_LEAF : PAIRED_LEAF, t, h, LEAF_WEIGHT);
}
int leaf_kind(bool round) {
  return round ? plant_organ::round_leaf : plant_organ::leaf;
}
int add_organ(Field &f, SurfacePatch &s, int kind, int parent, double at, const OrganShape &shape,
              std::uint64_t ready) {
  PlantOrgan o;
  o.kind = kind;
  o.parent = parent;
  o.attach = at;
  o.length =
      shape.length * (kind == plant_organ::stem ? stalk_share(grass_form(s), grass_traits(s)) : 1.);
  o.width = shape.width;
  o.target = shape.weight;
  o.hardness = shape.hardness;
  o.ready = ready;
  if (parent < 0) {
    const auto edges = f.sediment_edges(&s - f.vegetation().surfaces.data());
    double depth = edges[0] + (edges[1] - edges[0]) * at;
    if (!f.bed_site_clear(s, at, depth - grass_root_depth(s, depth, at),
                          placement::grass_headroom)) {
      at = crown_anchor(s);
      depth = edges[0] + (edges[1] - edges[0]) * at;
      o.attach = at;
    }
    o.root = depth - grass_root_depth(s, depth, at);
  }
  s.organs.push_back(o);
  return int(s.organs.size() - 1);
}
}
void Field::seed_organs(SurfacePatch &s) {
  const auto traits = grass_traits(s);
  const int form = grass_form(s);
  auto add = [&](int kind, int parent, double at, const OrganShape &shape) {
    return add_organ(*this, s, kind, parent, at, shape, 0);
  };
  const bool second = grass_type(s) % GRASS_TYPES_PER_FORM;
  if (form == plant_form::grass) {
    int n = std::max(MIN_BLADES, grass_stems(s) + (second ? -FEWER_RIBBONS : MORE_FINE));
    for (int k = 0; k < n; ++k) {
      double h = noise(BLADE_SALT, s.id, k),
             at = root_attach(
                 s, (k + ROOT_JITTER_MIN + ROOT_JITTER * noise(ROOT_SALT, s.id, k)) / n,
                 (second ? RIBBON_SPREAD_ROOT : FINE_SPREAD_ROOT) + SPREAD_SIZE * traits[T::size]);
      add(plant_organ::blade, -1, at,
          {grass_blade_length(second, h),
           second ? RIBBON_WIDTH + RIBBON_WIDTH_SIZE * traits[T::size]
                  : FINE_WIDTH + FINE_WIDTH_SIZE * traits[T::size],
           1, 1});
    }
  } else if (form == plant_form::rosette) {
    int leaves = MIN_ROSETTE_LEAVES + int(ROSETTE_LEAVES_SIZE * traits[T::size]);
    for (int k = 0; k < leaves; ++k) {
      double h = noise(ROSETTE_SALT, s.id, k),
             at = std::clamp(crown_anchor(s) +
                                 (k % 2 ? -1. : 1.) * ((k + 1) / 2) * ROSETTE_FAN / leaves,
                             ATTACH_MARGIN, 1 - ATTACH_MARGIN);
      int stalk = add(plant_organ::stem, -1, at, rosette_stalk(second, traits, h));
      add(leaf_kind(second), stalk, 1,
          rosette_leaf(second, traits, noise(ROSETTE_LEAF_SALT, s.id, k)));
    }
  } else {
    int nodes = MIN_NODES + int(NODES_SIZE * traits[T::size]), parent = -1;
    for (int k = 0; k < nodes; ++k) {
      double h = noise(NODE_SALT, s.id, k);
      parent = add(plant_organ::stem, parent, parent < 0 ? crown_anchor(s) : 1,
                   stem_node(traits, h, NODE_LENGTH));
      for (int side = 0; side < (second ? 1 : NODE_LEAVES); ++side)
        add(leaf_kind(second), parent, side ? SECOND_LEAF : 1,
            stem_leaf(second, traits, noise(STEM_LEAF_SALT, s.id, k, side)));
    }
  }
  if (form == plant_form::grass) {
    const double center = crown_anchor(s);
    std::stable_sort(s.organs.begin(), s.organs.end(), [&](const auto &a, const auto &b) {
      return std::abs(a.attach - center) > std::abs(b.attach - center);
    });
    for (std::size_t k = 0; k < s.organs.size(); ++k)
      s.organs[k].ready =
          time +
          std::uint64_t(k * (BLADE_PAUSE + BLADE_PAUSE_SPREAD * noise(BLADE_PAUSE_SALT, s.id, k)));
  }
  double weights = 0;
  for (const auto &o : s.organs)
    weights += o.target;
  for (auto &o : s.organs)
    o.target *= std::max(1., env_.grass_capacity) / weights;
  const bool seedling = s.grass < env_.grass_capacity * SEEDLING_SHARE;
  double weights_first = 0;
  int leaves = 0;
  const int first_parents = form == plant_form::rosette ? 1 : FIRST_STEM_PARENTS;
  for (auto &o : s.organs) {
    bool first =
        !seedling || (o.parent < 0 && leaves++ < 1) || (o.parent >= 0 && o.parent < first_parents);
    if (first)
      weights_first += o.target;
  }
  leaves = 0;
  for (auto &o : s.organs) {
    bool first =
        !seedling || (o.parent < 0 && leaves++ < 1) || (o.parent >= 0 && o.parent < first_parents);
    o.energy = first ? s.grass * o.target / std::max(tolerance::rounding, weights_first) : 0;
  }
}
void Field::prepare_organs(SurfacePatch &s, bool drifting) {
  if (!s.stump)
    return;
  if (s.grass <= 0) {
    for (auto &o : s.organs)
      o.energy = 0;
    return;
  }
  if (s.organs.empty()) {
    if (drifting)
      return;
    seed_organs(s);
  }
  double total = mass(s);
  const bool reserve = std::any_of(s.organs.begin(), s.organs.end(), [](const auto &o) {
    return o.energy > o.target + tolerance::negligible;
  });
  const int form = grass_form(s);
  auto can_grow = [&](const PlantOrgan &o) {
    if (o.ready > time && o.energy <= 0)
      return false;
    const auto k = &o - s.organs.data();
    if (o.kind == plant_organ::blade && o.energy <= 0 && k > 0 && s.organs[k - 1].energy > 0 &&
        s.organs[k - 1].elongation < NEIGHBOUR_STRETCH)
      return false;
    if (form == plant_form::rosette && o.parent < 0 && o.energy <= 0 && k > 0 &&
        (s.organs[k - 1].energy < ROSETTE_FILL * s.organs[k - 1].target ||
         s.organs[k - 1].elongation < ROSETTE_FILL))
      return false;
    return o.parent < 0 ||
           s.organs[o.parent].energy >
               (o.kind == plant_organ::stem ? STALK_PARENT_FILL : LEAF_PARENT_FILL) *
                   s.organs[o.parent].target;
  };
  const bool bud = std::any_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
    return o.target - o.energy > tolerance::negligible && can_grow(o);
  });
  if (std::abs(total - s.grass) <= tolerance::negligible && (drifting || !reserve || !bud))
    return;
  if (total > s.grass && total > 0) {
    const double factor = std::max(0., s.grass) / total;
    for (auto &o : s.organs)
      o.energy *= factor;
  }
  if (!drifting)
    for (auto &o : s.organs)
      o.energy = std::min(o.energy, o.target);
  double difference = s.grass - mass(s);
  // Fill parents before their buds. Unusable growth remains root reserves, never disappears.
  for (std::size_t pass = 0; difference > tolerance::negligible && pass <= s.organs.size();
       ++pass) {
    double wanted = 0;
    std::vector<unsigned char> eligible(s.organs.size());
    const bool stems = form == plant_form::stem &&
                       std::any_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
                         return o.kind == plant_organ::stem &&
                                o.target - o.energy > tolerance::negligible && can_grow(o);
                       });
    for (std::size_t k = 0; k < s.organs.size(); ++k) {
      const auto &o = s.organs[k];
      eligible[k] = can_grow(o) && (!stems || o.kind == plant_organ::stem);
      if (eligible[k])
        wanted += std::max(0., o.target - o.energy);
    }
    if (wanted <= tolerance::rounding)
      break;
    const double scale = std::min(1., difference / wanted);
    for (std::size_t k = 0; k < s.organs.size(); ++k)
      if (eligible[k]) {
        auto &o = s.organs[k];
        o.energy += scale * std::max(0., o.target - o.energy);
      }
    difference = s.grass - mass(s);
  }
  if (difference > tolerance::negligible && !s.organs.empty())
    s.organs.front().energy += difference;
}
namespace {
void bud_organs(Field &f, SurfacePatch &s) {
  const auto &env = f.env();
  const auto time = f.time;
  if (!s.organs.empty() && s.organs.size() < MAX_PLANT_ORGANS && s.vitality > BUDDING_VITALITY) {
    const auto traits = grass_traits(s);
    const int type = grass_type(s), form = grass_form(s);
    const bool second = type % GRASS_TYPES_PER_FORM;
    int roots = 0, nodes = 0, tip = -1;
    double mature = 0;
    for (std::size_t k = 0; k < s.organs.size(); ++k) {
      const auto &o = s.organs[k];
      if (o.parent < 0)
        ++roots;
      if (o.kind == plant_organ::stem && form == plant_form::stem) {
        ++nodes;
        tip = int(k);
      }
      mature += o.energy;
    }
    const bool boosted = time < s.boost_until;
    const auto &last = form == plant_form::stem && tip >= 0 ? s.organs[tip] : s.organs.back();
    const bool ready = last.ready <= time &&
                       last.energy > (boosted ? BOOSTED_BUD_FILL : BUD_FILL) * last.target &&
                       (form != plant_form::grass ||
                        last.elongation > (boosted ? BOOSTED_BUD_STRETCH : BUD_STRETCH));
    auto add = [&](int kind, int parent, double at, const OrganShape &shape) {
      return add_organ(f, s, kind, parent, at, shape, time);
    };
    if (ready && mature > BUDDING_FILL * env.grass_capacity) {
      const auto before = s.organs.size();
      const double h = noise(BUD_SALT, s.id, s.organs.size()), unit = s.organs.front().target;
      if (form == plant_form::grass && roots < grass_stems(s) + EXTRA_BLADES)
        add(plant_organ::blade, -1,
            root_attach(s, h, BUD_SPREAD + BUD_SPREAD_SIZE * traits[T::size]),
            {grass_blade_length(second, h), s.organs.front().width, unit, 1.});
      else if (form == plant_form::rosette &&
               roots < MAX_ROSETTE_LEAVES + int(ROSETTE_BUDS_SIZE * traits[T::size])) {
        auto stalk_shape = rosette_stalk(second, traits, h);
        stalk_shape.weight = unit;
        int stalk = add(
            plant_organ::stem, -1,
            std::clamp(crown_anchor(s) + (h - .5) * ROSETTE_FAN, ATTACH_MARGIN, 1 - ATTACH_MARGIN),
            stalk_shape);
        auto leaf_shape = rosette_leaf(second, traits, h);
        leaf_shape.length = s.organs[1].length;
        leaf_shape.width = s.organs[1].width;
        leaf_shape.weight = unit / ROSETTE_STALK_WEIGHT;
        add(leaf_kind(second), stalk, 1, leaf_shape);
      } else if (form == plant_form::stem && nodes < MAX_NODES && tip >= 0) {
        auto node = stem_node(traits, h, LATER_NODE_LENGTH);
        node.weight = unit;
        int stalk = add(plant_organ::stem, tip, 1, node);
        for (int side = 0; side < (second ? 1 : NODE_LEAVES); ++side) {
          auto leaf = stem_leaf(second, traits, h);
          leaf.weight = unit / STEM_STALK_WEIGHT;
          add(leaf_kind(second), stalk, side ? SECOND_LEAF : 1, leaf);
        }
      }
      if (s.organs.size() > before) {
        double capacity = 0;
        for (const auto &o : s.organs)
          capacity += o.target;
        const double factor = std::min(1., env.grass_capacity / capacity);
        double reserve = 0;
        for (std::size_t k = 0; k < s.organs.size(); ++k) {
          auto &o = s.organs[k];
          o.target *= factor;
          if (k < before) {
            reserve += o.energy * (1 - factor);
            o.energy *= factor;
          } else
            o.ready = time + std::uint64_t((form == plant_form::grass ? BUD_PAUSE : LEAF_PAUSE) /
                                           (boosted ? GrowthBoost::budding : 1.));
        }
        if (reserve > 0)
          s.organs.front().energy += reserve;
      }
    }
  }
}
}
namespace {
constexpr double GRASS_REACH = 1.5, MAX_REACH = 160, REACH_STRETCH = 1.65, REACH_MIN = .64,
                 REACH_SIZE = .62, REACH_CHANCE = .22, REACH_PHASE = 8.31;
struct Character {
  double stature, fan, curvature, leafness, sway_rate;
};
double id_wave(std::uint64_t id, double phase) {
  return (1 + std::sin(id * phase)) / 2;
}
struct TraitWave {
  double base, spread, phase;
};
constexpr TraitWave STATURE{.72, .56, REACH_PHASE}, FAN{.7, .6, 5.17}, CURVATURE{.65, .7, 3.73},
    LEAFNESS{.75, .5, 9.23}, SWAY_RATE_WAVE{.65, .7, 2.47};
double trait(std::uint64_t id, const TraitWave &w) {
  return w.base + w.spread * id_wave(id, w.phase);
}
Character character(std::uint64_t id) {
  return {trait(id, STATURE), trait(id, FAN), trait(id, CURVATURE), trait(id, LEAFNESS),
          trait(id, SWAY_RATE_WAVE)};
}
constexpr double MIN_ORGAN_LENGTH = .8, MAX_LEAF_LENGTH = 45, YOUNG_SHARE = .035;
double organ_length(const PlantOrgan &o, double reach, double grown) {
  return std::max(MIN_ORGAN_LENGTH,
                  (o.kind >= plant_organ::leaf ? std::min(MAX_LEAF_LENGTH, reach * o.length)
                                               : reach * o.length) *
                      (YOUNG_SHARE + (1 - YOUNG_SHARE) * grown));
}
constexpr double CURRENT_BEND = .22, CURRENT_LEAN = .48, BLADE_SWAY = .11, OTHER_SWAY = .025,
                 MAX_SWAY_SPEED = 2, WILT_LEAF = .95, WILT_STEM = .35, FLUTTER = .018,
                 FLOW_PROBE = .5;
constexpr double HANDLE_START = .26, HANDLE_MIDDLE = .60, HANDLE_VIGOR = .20, WILT_DROP = .16,
                 BLADE_ARC = .12, STEM_ARC = .08, RIBBON_ARC = .18, RIBBON_ARC_SPREAD = .16,
                 INITIAL_TURN = .55, BLADE_RISE = .26;
constexpr double FINE_LEAN = .65, FINE_LEAN_SIZE = .55, RIBBON_LEAN = .18, RIBBON_LEAN_SIZE = .24,
                 ROSETTE_OPEN = .35, ROSETTE_OPENING = 1.25, MAX_FAN = 1.1, ROOT_STALK_LEAN = .5,
                 STALK_LEAN = .34, LEAF_OPEN = .22, LEAF_OPENING = 1.24, LEAF_JITTER = .14,
                 LEAF_UNFOLD = .20, STEM_LEAF_ANGLE = .9, STEM_LEAF_SPREAD = .35;
constexpr double SWAY_RATE = .045, SWAY_ALONG = .026, SWAY_DEPTH = .009, SWAY_BLADE = .83,
                 SWAY_SECOND = .35, SWAY_SECOND_RATE = .071, SWAY_SECOND_ALONG = .013,
                 SWAY_SECOND_ORGAN = 1.71, FLUTTER_RATE = .035, FLUTTER_ID = .41,
                 FLUTTER_ORGAN = 1.3;
constexpr double LEAF_SPAN = .25, LEAF_RISE = .65, LEAF_RISE_MIN = .08, LEAF_DROP = .10,
                 LEAF_HANDLE_1 = .30, LEAF_HANDLE_2 = .78, LEAF_HANDLE_RISE = .60,
                 LEAF_TIP_RISE = .25;
}
double Field::plant_reach(const SurfacePatch &s) const {
  const auto traits = grass_traits(s);
  return (grass_form(s) == plant_form::grass ? GRASS_REACH : 1.) *
         std::min(MAX_REACH,
                  GRASS_BASE_LENGTH + (env_.grass_length - GRASS_BASE_LENGTH) * REACH_STRETCH) *
         (REACH_MIN + REACH_SIZE * traits[T::size] + REACH_CHANCE * noise(s.id * REACH_PHASE));
}
bool Field::shape_organs(SurfacePatch &s) {
  bool bent = false;
  const auto traits = grass_traits(s);
  const auto c = character(s.id);
  const double fan = c.fan, curvature = c.curvature, leafness = c.leafness, sway_rate = c.sway_rate;
  double reach = plant_reach(s) * c.stature;
  const int form = grass_form(s);
  bool depth_updated = false;
  for (std::size_t i = 0; i < s.organs.size(); ++i) {
    auto &o = s.organs[i];
    if (o.energy <= tolerance::negligible)
      continue;
    double grown = std::clamp(o.energy / std::max(MIN_TARGET, o.target) /
                                  (1 - notched_share(o, time, env_.plant_notch_heal)),
                              0., 1.),
           h = noise(SHAPE_SALT, s.id, i), length = organ_length(o, reach, grown);
    double buried_stalk = 0;
    Point root;
    if (o.parent < 0) {
      root = {s.a.x + o.attach * (s.b.x - s.a.x) + s.normal.x * std::max(MIN_ROOT, o.root),
              s.a.y + o.attach * (s.b.y - s.a.y) + s.normal.y * std::max(MIN_ROOT, o.root)};
      auto bed = sediment_edges(&s - vegetation_.surfaces.data());
      double cover = bed[0] + (bed[1] - bed[0]) * o.attach - o.root;
      const double front = sediment_front(root.x, root.y, s.a.x, s.a.y, s.b.x, s.b.y, s.normal.x,
                                          s.normal.y, bed[0], bed[1]);
      if (!depth_updated) {
        if (s.visual_depth < 0)
          s.visual_depth = front;
        depth_updated = true;
      }
      buried_stalk =
          form == plant_form::rosette && o.kind == plant_organ::stem ? std::max(0., cover) : 0;
      length += std::max(0., cover);
    } else {
      const auto &parent = s.organs[o.parent];
      if (parent.energy <= tolerance::negligible) {
        o.curve.fill(parent.curve.back());
        continue;
      }
      root = curve(parent.curve, o.attach);
    }
    auto flow = water_.velocity(root.x, root.y - length * FLOW_PROBE);
    double speed = std::hypot(flow.x, flow.y), angle = 0;
    const double leaf_maturity =
        form == plant_form::rosette
            ? (o.kind >= plant_organ::leaf
                   ? o.elongation
                   : (i + 1 < s.organs.size() ? s.organs[i + 1].elongation : 0.))
            : 0;
    if (o.kind == plant_organ::blade)
      angle = (h - .5) * (grass_type(s) == plant_type::fine_grass
                              ? FINE_LEAN + FINE_LEAN_SIZE * traits[T::size]
                              : RIBBON_LEAN + RIBBON_LEAN_SIZE * traits[T::size]);
    else if (o.kind == plant_organ::stem)
      angle = o.parent < 0 ? (form == plant_form::rosette
                                  ? ((i / ROSETTE_PAIR) % 2 ? 1. : -1.) *
                                        (ROSETTE_OPEN + ROSETTE_OPENING * leaf_maturity) *
                                        std::min(MAX_FAN, fan)
                                  : (h - .5) * ROOT_STALK_LEAN)
                           : (h - .5) * STALK_LEAN;
    else if (form == plant_form::rosette) {
      const double side = (o.parent / ROSETTE_PAIR) % 2 ? 1. : -1.;
      angle = side * (LEAF_OPEN + LEAF_OPENING * leaf_maturity) + (h - .5) * LEAF_JITTER;
      length *= leafness * (LEAF_UNFOLD + (1 - LEAF_UNFOLD) * std::sqrt(leaf_maturity));
    } else {
      int side = 0, leaves = 0;
      for (std::size_t k = std::size_t(o.parent + 1); k < s.organs.size(); ++k)
        if (s.organs[k].parent == o.parent && s.organs[k].kind >= plant_organ::leaf) {
          ++leaves;
          side += k < i;
        }
      const bool alternate = grass_type(s) == plant_type::alternate_stem && leaves == 1;
      int node = 0;
      if (alternate)
        for (int k = 0; k <= o.parent; ++k)
          node += s.organs[k].kind == plant_organ::stem;
      angle = ((alternate ? node : side) % 2 ? 1. : -1.) * (STEM_LEAF_ANGLE + STEM_LEAF_SPREAD * h);
    }
    const double wave =
        std::sin(time * SWAY_RATE * sway_rate - root.x * SWAY_ALONG + root.y * SWAY_DEPTH +
                 (o.kind == plant_organ::blade ? i * SWAY_BLADE : 0)) +
        SWAY_SECOND *
            std::sin(time * SWAY_SECOND_RATE - root.x * SWAY_SECOND_ALONG + i * SWAY_SECOND_ORGAN);
    angle +=
        std::clamp(flow.x * CURRENT_BEND / std::sqrt(grass_fiber(s)), -CURRENT_LEAN, CURRENT_LEAN) +
        s.root_lean +
        (o.kind == plant_organ::blade ? BLADE_SWAY : OTHER_SWAY) * std::min(MAX_SWAY_SPEED, speed) *
            wave / std::sqrt(o.hardness);
    const double wilt = 1 - s.vitality;
    angle += wilt * (o.kind >= plant_organ::leaf ? (angle < 0 ? -1. : 1.) * WILT_LEAF : WILT_STEM);
    double dx = std::sin(angle) * (length - buried_stalk) + s.normal.x * buried_stalk,
           dy = -std::cos(angle) * (length - buried_stalk) + s.normal.y * buried_stalk,
           flutter = FLUTTER * std::min(MAX_SWAY_SPEED, speed) * length *
                     std::sin(time * FLUTTER_RATE + s.id * FLUTTER_ID + i * FLUTTER_ORGAN) /
                     std::sqrt(o.hardness);
    const double arc = o.kind == plant_organ::blade && grass_type(s) == plant_type::ribbon_grass
                           ? (h < .5 ? -1 : 1) * length * (RIBBON_ARC + RIBBON_ARC_SPREAD * h)
                           : (h - .5) * length *
                                 (o.kind == plant_organ::blade  ? BLADE_ARC
                                  : o.kind >= plant_organ::leaf ? BLADE_ARC * curvature
                                                                : STEM_ARC);
    Point tip{root.x + dx, root.y + dy};
    Point initial =
        o.parent < 0
            ? (o.kind == plant_organ::blade
                   ? Point{s.normal.x * BLADE_RISE,
                           -std::sqrt(std::max(0., 1 - std::pow(s.normal.x * BLADE_RISE, 2)))}
                   : s.normal)
            : Point{std::sin(angle * INITIAL_TURN), -std::cos(angle * INITIAL_TURN)};
    const double handle = HANDLE_MIDDLE + HANDLE_VIGOR * traits[T::vigor];
    o.curve = {root,
               Point{root.x + length * HANDLE_START * initial.x,
                     root.y + length * HANDLE_START * initial.y},
               Point{root.x + dx * handle + flutter + arc,
                     root.y + dy * handle + wilt * length * WILT_DROP},
               tip};
    if (form == plant_form::rosette && o.kind >= plant_organ::leaf) {
      const double side = (o.parent / ROSETTE_PAIR) % 2 ? 1. : -1.,
                   maturity = std::clamp(leaf_maturity, 0., 1.),
                   span = length * (LEAF_SPAN + (1 - LEAF_SPAN) * maturity),
                   rise = length * (LEAF_RISE * (1 - maturity) + LEAF_RISE_MIN),
                   drop = length * LEAF_DROP * maturity;
      o.curve = {root,
                 {root.x + side * span * LEAF_HANDLE_1, root.y - rise},
                 {root.x + side * span * LEAF_HANDLE_2, root.y - rise * LEAF_HANDLE_RISE},
                 {root.x + side * span, root.y + drop - rise * LEAF_TIP_RISE}};
    }
    if (env_.foliage_yield > 0) {
      const double width = organ_width(o, length);
      body_grid_.nearby(
          root.x, root.y, length + width + indexed_body_radius_, [&](std::uint32_t index) {
            const auto &p = visible_[index];
            if (p.kind != food_kind::fish || p.hidden || !p.hatched)
              return;
            for (int k = 1; k < CURVE_POINTS; ++k) {
              auto &q = o.curve[k];
              const double dx = delta_x(q.x - p.x), dy = q.y - p.y, d = std::hypot(dx, dy),
                           reach = p.radius + width;
              if (d >= reach || d < tolerance::negligible)
                continue;
              const double move =
                  (reach - d) * std::min(1., env_.foliage_yield * k / double(o.curve.size() - 1));
              q.x += dx / d * move;
              q.y += dy / d * move;
              bent = true;
            }
          });
    }
    o.curve = constrain(*this, o.curve, organ_width(o, length), o.kind);
  }
  int roots = 0;
  for (const auto &o : s.organs)
    if (o.parent < 0 && o.energy > 0 && roots < int(s.blades.size()))
      s.blades[roots++] = o.curve;
  if (roots) {
    s.blade = s.blades[0];
    for (int k = roots; k < int(s.blades.size()); ++k)
      s.blades[k] = s.blades[0];
  }
  return bent;
}
namespace {
constexpr double CANOPY_MIN_WIDTH = .45;
constexpr int CANOPY_SAMPLES = 12, CANOPY_LAYERS = 4;
constexpr double YOUNG_GIRTH = .15, MIN_GIRTH = .01, SEGMENT_LEAF_GIRTHS = 2.5, MIN_SEGMENT = .5,
                 MIN_STROKE_WIDTH = .08;
constexpr int WALL_SAMPLES = 16, WALL_BISECTIONS = 7, MAX_LEAF_SEGMENTS = 6;
constexpr double BLADE_SHADE = .22, LEAF_SHADE = .85, MIN_SHADING_RADIUS = .1;
}
void Field::reserve_canopy(const SurfacePatch &s, PlantGeometryCache &cache) {
  if (!cache.canopy_ready) {
    cache.canopy.clear();
    const int nx = int(std::ceil(geometry_.width / CANOPY_CELL)),
              ny = int(std::ceil(geometry_.height / CANOPY_CELL));
    for (const auto &o : s.organs)
      if (o.kind >= plant_organ::leaf && o.energy > tolerance::negligible &&
          o.display_width > CANOPY_MIN_WIDTH) {
        const auto &widths = sampled_profile(o.kind, CANOPY_SAMPLES);
        std::vector<std::size_t> cells;
        for (int k = 0; k < CANOPY_SAMPLES; ++k) {
          double t = (k + .5) / CANOPY_SAMPLES;
          auto q = curve(o.draw_curve, t);
          double r = o.display_width * widths[k];
          for (int y = std::max(0, int(std::floor((q.y - r) / CANOPY_CELL)));
               y <= std::min(ny - 1, int(std::floor((q.y + r) / CANOPY_CELL))); ++y)
            for (int x = int(std::floor((q.x - r) / CANOPY_CELL));
                 x <= int(std::floor((q.x + r) / CANOPY_CELL)); ++x) {
              auto cell = std::size_t(y * nx + (x % nx + nx) % nx);
              if (std::find(cells.begin(), cells.end(), cell) == cells.end())
                cells.push_back(cell);
            }
        }
        for (auto cell : cells)
          cache.canopy.push_back({cell, std::size_t(&o - s.organs.data())});
      }
    cache.canopy_ready = true;
  }
  for (const auto &cell : cache.canopy)
    if (cell.organ < s.organs.size() && s.organs[cell.organ].energy > tolerance::negligible)
      ++lighting_.canopy_counts[cell.index];
}

void Field::index_organs(SurfacePatch &s, std::size_t patch) {
  for (std::size_t j = 0; j < s.organs.size(); ++j) {
    auto &o = s.organs[j];
    if (o.energy <= tolerance::negligible)
      continue;
    double length = chord_length(o.curve), girth = organ_width(o, length);
    auto qcurve =
        patch < vegetation_.surfaces.size() ? o.curve : constrain(*this, o.curve, girth, o.kind);
    if (o.kind == plant_organ::blade && o.elongation < 1) {
      for (int k = 1; k < CURVE_POINTS; ++k) {
        qcurve[k].x = qcurve.front().x + (qcurve[k].x - qcurve.front().x) * o.elongation;
        qcurve[k].y = qcurve.front().y + (qcurve[k].y - qcurve.front().y) * o.elongation;
      }
      length *= o.elongation;
      girth *= YOUNG_GIRTH + (1 - YOUNG_GIRTH) * std::sqrt(o.elongation);
    }
    int n = plant_sample_count(length, girth);
    if (!empty_area(*this, qcurve, girth))
      for (int k = 1; k <= WALL_SAMPLES; ++k) {
        double t = (k - .5) / WALL_SAMPLES, shape = profile(o.kind, t);
        auto q = curve(qcurve, t);
        if (shape <= 0 || free(q.x, q.y, girth * shape))
          continue;
        double lo = 0, hi = girth;
        for (int trial = 0; trial < WALL_BISECTIONS; ++trial) {
          double mid = (lo + hi) / 2;
          if (free(q.x, q.y, mid * shape))
            lo = mid;
          else
            hi = mid;
        }
        girth = lo;
      }
    girth = std::max(MIN_GIRTH, girth);
    if (o.kind >= plant_organ::leaf && !lighting_.canopy_counts.empty()) {
      const int nx = int(std::ceil(geometry_.width / CANOPY_CELL)),
                ny = int(std::ceil(geometry_.height / CANOPY_CELL));
      std::vector<std::size_t> cells;
      static const auto profiles = []() {
        std::array<std::array<double, CANOPY_SAMPLES>, PROFILE_KINDS - plant_organ::leaf> v{};
        for (int kind = plant_organ::leaf; kind < PROFILE_KINDS; ++kind)
          for (int k = 0; k < CANOPY_SAMPLES; ++k)
            v[kind - plant_organ::leaf][k] = profile(kind, (k + .5) / CANOPY_SAMPLES);
        return v;
      }();
      std::array<Point, CANOPY_SAMPLES> points;
      for (int k = 0; k < CANOPY_SAMPLES; ++k)
        points[k] = curve(qcurve, (k + .5) / CANOPY_SAMPLES);
      auto occupied = [&](double w) {
        cells.clear();
        for (int k = 0; k < CANOPY_SAMPLES; ++k) {
          auto q = points[k];
          double r = w * profiles[o.kind - plant_organ::leaf][k];
          for (int y = std::max(0, int(std::floor((q.y - r) / CANOPY_CELL)));
               y <= std::min(ny - 1, int(std::floor((q.y + r) / CANOPY_CELL))); ++y)
            for (int x = int(std::floor((q.x - r) / CANOPY_CELL));
                 x <= int(std::floor((q.x + r) / CANOPY_CELL)); ++x) {
              auto at = std::size_t(y * nx + (x % nx + nx) % nx);
              if (lighting_.canopy_counts[at] >= CANOPY_LAYERS)
                return true;
              if (std::find(cells.begin(), cells.end(), at) == cells.end())
                cells.push_back(at);
            }
        }
        return false;
      };
      if (girth > CANOPY_MIN_WIDTH && !occupied(girth))
        for (auto at : cells)
          ++lighting_.canopy_counts[at];
    }
    o.display_width = girth;
    o.draw_curve = qcurve;
    o.tint = organ_tint(s, int(j));
    if (o.kind >= plant_organ::leaf)
      n = std::clamp(int(std::ceil(length / std::max(MIN_SEGMENT, SEGMENT_LEAF_GIRTHS * girth))), 1,
                     MAX_LEAF_SEGMENTS);
    const auto &widths = sampled_profile(o.kind, n);
    auto from = curve(qcurve, 0);
    for (int k = 0; k < n; ++k) {
      const double t = (k + .5) / n;
      const auto to = curve(qcurve, double(k + 1) / n);
      PlantPart part{};
      part.x = wrap_x((from.x + to.x) / 2);
      part.y = (from.y + to.y) / 2;
      part.hx = (to.x - from.x) / 2;
      part.hy = (to.y - from.y) / 2;
      double remaining_width = notched_width(o, t, time, env_.plant_notch_heal);
      for (const auto &notch : o.notches)
        if (notch.depth != 0 && notch.width > 0)
          remaining_width =
              std::min(remaining_width,
                       notched_width(o, std::clamp(notch.at, double(k) / n, double(k + 1) / n),
                                     time, env_.plant_notch_heal));
      part.width = std::max(MIN_STROKE_WIDTH, girth * widths[k] * remaining_width);
      part.radius = stroke_half_length(part) + part.width;
      part.energy = o.energy / n;
      part.patch = patch;
      part.kind = food_kind::plant;
      part.along = t;
      part.along_from = double(k) / n;
      part.along_to = double(k + 1) / n;
      part.organ = int(j);
      part.organ_kind = o.kind;
      part.hardness = o.hardness;
      vegetation_.plants.push_back(part);
      from = to;
    }
  }
}
void Field::update_canopy_light() {
  lighting_.canopy_density.assign(lighting_.illumination.size(), 0);
  if (lighting_.columns < 2 || lighting_.rows < 2)
    return;
  const int nx = lighting_.columns, ny = lighting_.rows, period = nx - 1;
  const double dx = geometry_.width / period, dy = geometry_.height / (ny - 1), area = dx * dy;
  for (const auto &p : vegetation_.plants) {
    if (p.kind != food_kind::plant || p.radius < MIN_SHADING_RADIUS)
      continue;
    const auto &s = plant_source_mut(p.patch);
    if (p.organ < 0 || std::size_t(p.organ) >= s.organs.size())
      continue;
    const auto &o = s.organs[p.organ];
    if (o.kind == plant_organ::stem)
      continue;
    const double spacing = 2 * stroke_half_length(p),
                 footprint = std::max(MIN_STROKE_WIDTH, std::hypot(p.width, stroke_half_length(p)));
    const double optical = (o.kind == plant_organ::blade ? BLADE_SHADE : LEAF_SHADE) * 2 * spacing *
                           footprint / area,
                 gx = wrap_x(p.x) / dx, gy = std::clamp(p.y / dy, 0., double(ny - 1));
    int x = int(gx), y = int(gy);
    double fx = gx - x, fy = gy - y;
    for (int j = 0; j < 2; ++j)
      for (int i = 0; i < 2; ++i)
        lighting_.canopy_density[std::min(ny - 1, y + j) * nx + (x + i) % period] +=
            optical * (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
  }
  for (int y = 0; y < ny; ++y)
    lighting_.canopy_density[y * nx + nx - 1] = lighting_.canopy_density[y * nx];
  update_sediment_light();
}
namespace {
constexpr int CUT_SAMPLES = 64;
constexpr std::uint64_t REGROWTH_PAUSE = 600;
constexpr double MIN_DRIFT_ENERGY = .02, DRIFT_VITALITY = .9, DRIFT_SPIN = .012, DRIFT_EDGE = .01;
constexpr double PLANT_LIFE_MIN = .45, PLANT_LIFE_SPREAD = 1.3, PLANT_LIFE_ID = 17.831,
                 PLANT_LIFE_PHASE = 4.73, BLADE_GROWTH = 3600, BLADE_GROWTH_VIGOR = 3600,
                 BLADE_GROWTH_SPREAD = 1200, LEAF_GROWTH = 2800, LEAF_GROWTH_SPREAD = 4800,
                 ORGAN_LIFE = 2400, ORGAN_LIFE_SPREAD = 4800, REGROW_PAUSE = 1200,
                 REGROW_SPREAD = 2400, REGROW_STRETCH = .04;
constexpr std::uint64_t BARE_STEM_STEPS = 600;
constexpr double LEAN_KEEP = .992, ANCHOR_DEPTH = .6, ROOT_SINK = .03, ROOT_RISE = .015,
                 ROOT_MIN_SHARE = .2, ROOT_MAX_SHARE = .8, DEPTH_RATE = .02, UPROOT_SHARE = .25;
constexpr double VITALITY_HALF_LIFE = 240, VITALITY_GAIN = .005, WILT_VITALITY = .5,
                 DEATH_VITALITY = .08;
constexpr std::uint64_t WILT_PERIOD = 20;
}
void Field::cut_organ(std::size_t patch, int index, double t) {
  if (vegetation_.drifting_grass.size() >= MAX_DRIFTING_GRASS || index < 0)
    return;
  auto &s = plant_source_mut(patch);
  if (std::size_t(index) >= s.organs.size())
    return;
  auto &cut = s.organs[index];
  t = std::clamp(t, 0., MAX_CUT_ALONG);
  if (cut.energy < LIVING_ORGAN &&
      std::none_of(s.organs.begin(), s.organs.end(),
                   [&](const auto &o) { return o.parent == index && o.energy > LIVING_ORGAN; }))
    return;
  DriftingGrass d;
  d.plant = s;
  d.plant.organs.clear();
  d.plant.algae = d.plant.sediment = 0;
  d.root_contact = -1;
  d.id = vegetation_.next_surface_id++;
  std::vector<int> mapped(s.organs.size(), -1);
  for (std::size_t i = index; i < s.organs.size(); ++i) {
    auto &o = s.organs[i];
    bool included = int(i) == index || (o.parent >= 0 && mapped[o.parent] >= 0);
    if (!included)
      continue;
    auto copy = o;
    if (int(i) == index) {
      double total = 0, beyond = 0;
      for (int k = 0; k < CUT_SAMPLES; ++k) {
        const double u = (k + .5) / CUT_SAMPLES, w = profile(o.kind, u);
        total += w;
        beyond += u > t ? w : 0;
      }
      const double share = total > 0 ? beyond / total : 1 - t;
      copy.energy *= share;
      copy.parent = -1;
      o.energy *= 1 - share;
      o.ready = time + REGROWTH_PAUSE;
      ++o.cuts;
      if (t > 0) {
        o.length *= t;
        o.curve = lower_curve(o.curve, t);
        o.draw_curve = lower_curve(o.draw_curve, t);
      }
      for (auto &n : o.notches)
        n = n.at < t && t > 0 ? notch_on_piece(n, 0, t) : PlantNotch{};
      for (auto &n : copy.notches)
        n = n.at > t && t < 1 ? notch_on_piece(n, t, 1) : PlantNotch{};
    } else {
      copy.parent = mapped[o.parent];
      o.energy = 0;
      o.ready = time + REGROWTH_PAUSE;
    }
    release_organ(copy, int(i) == index ? t : 0);
    mapped[i] = int(d.plant.organs.size());
    d.plant.organs.push_back(copy);
  }
  if (patch < vegetation_.plant_geometry_cache.size())
    vegetation_.plant_geometry_cache[patch].clear();
  d.plant.grass = mass(d.plant);
  if (d.plant.grass < MIN_DRIFT_ENERGY)
    return;
  const double remaining = mass(s);
  s.grass_grazed += std::max(0., s.grass - remaining);
  s.grass = remaining;
  s.curve_time = ~std::uint64_t(0);
  d.plant.vitality = std::min(DRIFT_VITALITY, s.vitality);
  d.plant.spin = DRIFT_SPIN * (noise(d.id) - .5);
  d.x = wrap_x(d.plant.organs[0].curve.front().x);
  d.y = std::clamp(d.plant.organs[0].curve.front().y, DRIFT_EDGE, geometry_.height - DRIFT_EDGE);
  auto v = water_.velocity(d.x, d.y);
  d.vx = v.x;
  d.vy = v.y;
  d.plant.blade = d.plant.organs[0].curve;
  d.plant.blades.fill(d.plant.blade);
  vegetation_.drifting_grass.push_back(std::move(d));
}
void Field::advance_anchored_grass() {

  for (auto &s : vegetation_.surfaces)
    if (s.stump) {
      prepare_organs(s);
      ++s.plant_age;
      const double lifespan =
          env_.plant_lifespan *
          (PLANT_LIFE_MIN + PLANT_LIFE_SPREAD * noise(s.id * PLANT_LIFE_ID + PLANT_LIFE_PHASE));
      const bool old = s.plant_age > lifespan;
      if (!old)
        bud_organs(*this, s);
      thread_local std::vector<unsigned char> leafy, living_stem;
      leafy.assign(s.organs.size(), 0);
      living_stem.assign(s.organs.size(), 0);
      for (std::size_t k = s.organs.size(); k--;) {
        const auto &o = s.organs[k];
        leafy[k] |= o.kind >= plant_organ::leaf && o.energy > LIVING_ORGAN;
        if (o.parent >= 0) {
          leafy[o.parent] |= leafy[k];
          living_stem[o.parent] |= o.kind == plant_organ::stem && o.energy > LIVING_ORGAN;
        }
      }
      for (std::size_t k = s.organs.size(); k--;) {
        auto &o = s.organs[k];
        if (o.kind != plant_organ::stem || o.energy <= LIVING_ORGAN)
          continue;
        if (leafy[k] || living_stem[k])
          o.bare_steps = 0;
        else if (++o.bare_steps >= BARE_STEM_STEPS) {
          shape_organs(s);
          cut_organ(&s - vegetation_.surfaces.data(), int(k), 0);
          o.bare_steps = 0;
          break;
        }
      }
      for (std::size_t k = 0; k < s.organs.size(); ++k) {
        auto &o = s.organs[k];
        if (o.energy <= 0)
          continue;
        if (o.kind == plant_organ::blade ||
            (grass_form(s) == plant_form::rosette && o.kind >= plant_organ::leaf)) {
          const double growth_time =
              o.kind == plant_organ::blade
                  ? BLADE_GROWTH + BLADE_GROWTH_VIGOR * grass_traits(s)[T::vigor] +
                        BLADE_GROWTH_SPREAD * noise(BLADE_GROWTH_SALT, s.id, k)
                  : LEAF_GROWTH + LEAF_GROWTH_SPREAD * noise(LEAF_GROWTH_SALT, s.id, k);
          o.elongation = std::min(1., o.elongation + (time >= s.boost_until ? 1.
                                                      : o.kind == plant_organ::blade
                                                          ? GrowthBoost::blade_stretch
                                                          : GrowthBoost::leaf_stretch) /
                                                         growth_time);
          if (o.elongation >= 1 &&
              ++o.bare_steps > ORGAN_LIFE + ORGAN_LIFE_SPREAD * noise(ORGAN_LIFE_SALT, s.id, k)) {
            shape_organs(s);
            cut_organ(&s - vegetation_.surfaces.data(), int(k), 0);
            if (o.parent >= 0)
              s.organs[o.parent].bare_steps = BARE_STEM_STEPS;
            o.ready = time + std::uint64_t(REGROW_PAUSE + REGROW_SPREAD * noise(s.id + k));
            o.elongation = REGROW_STRETCH;
            o.bare_steps = 0;
          }
        }
      }
      s.root_lean *= LEAN_KEEP;
      double anchored = 0, root_mass = 0;
      auto edges = sediment_edges(&s - vegetation_.surfaces.data());
      double root = 0;
      int roots = 0;
      for (auto &o : s.organs)
        if (o.parent < 0 && o.energy > 0) {
          double depth = edges[0] + (edges[1] - edges[0]) * o.attach;
          anchored += o.energy * std::clamp((depth - o.root) / ANCHOR_DEPTH, 0., 1.);
          root_mass += o.energy;
          auto p = mix(s.a, s.b, o.attach);
          if (plant_light(light(p.x + s.normal.x * (depth + PLANT_LIGHT_LIFT),
                                p.y + s.normal.y * (depth + PLANT_LIGHT_LIFT))) > 0)
            o.root = std::clamp(
                o.root + std::clamp(depth - grass_root_depth(s, depth, o.attach) - o.root,
                                    -ROOT_RISE, ROOT_SINK),
                ROOT_MIN_SHARE * depth, ROOT_MAX_SHARE * depth);
          // Animation advances with plant time, never while rebuilding a view or loading.
          if (!roots && s.visual_depth >= 0 &&
              s.id % plant_shape_period == time % plant_shape_period) {
            const double front = depth > seabed::bare_depth
                                     ? std::clamp(1 - std::max(MIN_ROOT, o.root) / depth, 0., 1.)
                                     : BARE_FRONT;
            s.visual_depth += std::clamp(front - s.visual_depth, -DEPTH_RATE, DEPTH_RATE);
          }
          root += o.root;
          ++roots;
        }
      if (root_mass > 0 && anchored < UPROOT_SHARE * root_mass) {
        shape_organs(s);
        uproot(s);
      } else {
        bool lit = plant_light(plant_illumination(s)) > 0;
        s.vitality = !old && lit ? std::min(1., s.vitality + VITALITY_GAIN)
                                 : s.vitality * std::exp2(-1. / VITALITY_HALF_LIFE);
        if (roots)
          s.root_height = root / roots;
        if (s.vitality < WILT_VITALITY && time % WILT_PERIOD == 0) {
          for (std::size_t k = 0; k < s.organs.size(); ++k)
            if (s.organs[k].kind != plant_organ::stem && s.organs[k].energy > LIVING_ORGAN) {
              cut_organ(&s - vegetation_.surfaces.data(), int(k), 0);
              break;
            }
        }
        if (s.vitality < DEATH_VITALITY)
          uproot(s);
      }
    }
}
namespace {
constexpr double WAKE_SHARE = .35, LEAF_BUOYANCY = -2.5, LEAF_SINKING = 4, LEAF_SOAK = 350,
                 STEM_SINKING = 4, WILT_SINKING = 2, LEAF_DRAG = .218592, STEM_DRAG = .123552;
constexpr double PUSH_ASIDE = .05, DRIFT_RADIUS = .4, SLIP_TORQUE = .08, SPIN_KEEP = .95248,
                 SPIN_GAIN = .0152064, MAX_SPIN = .03, MIN_DRIFT_LENGTH = 1;
constexpr double SLIDE_ASIDE = .35, SLIDE_DOWN = .1, ROOT_MARGIN = .3, POINT_MARGIN = .08,
                 POINT_RADIUS = .1;
constexpr double MAX_FLUTTER = 1.8, FLUTTER_BASE = .008, FLUTTER_WILT = .018, MAX_FLUTTER_SPEED = 2,
                 FLUTTER_STEP = .065, FLUTTER_SHIFT = 2.1, MAX_STRETCH = 1.015,
                 DRIFT_VITALITY_HALF_LIFE = 110;
constexpr std::uint64_t BREAK_PERIOD = 24, SHED_PERIOD = 12;
constexpr double BREAK_LENGTH = 28, BREAK_PIECE = 20, MIN_BREAK = .2, MAX_BREAK = .8,
                 BREAK_SPIN = -.6, SHED_VITALITY = .68, SHED_SINK = .02;
constexpr double REPLANT_VITALITY = .25, REPLANT_SEARCH = 20, REPLANT_COVER = .1,
                 REPLANT_SPEED = .35, MIN_LENGTH = .001;
constexpr int REPLANT_LOSS = 2;
}
void Field::advance_drifting_grass(DriftingGrass &d, std::vector<DriftingGrass> &shed) {

  prepare_organs(d.plant, true);
  auto &p = d.plant;
  if (p.organs.empty())
    return;
  // Wrap the whole plant together. Wrapping each point distorts long organs at the seam.
  const double origin = p.organs[0].curve.front().x,
               wrap_shift = d.x + delta_x(origin - d.x) - origin;
  for (auto &o : p.organs) {
    for (auto &q : o.curve)
      q.x += wrap_shift;
    if (o.loose_length <= 0)
      o.loose_length = curve_length(o.curve);
  }
  auto flow = water_.velocity(d.x, d.y);
  Body nearby;
  nearby.x = d.x;
  nearby.y = d.y;
  auto wake = nearby_flow(nearby);
  flow.x += wake.x * WAKE_SHARE;
  flow.y += wake.y * WAKE_SHARE;
  bool leaf = std::none_of(p.organs.begin(), p.organs.end(), [](const auto &o) {
    return o.kind == plant_organ::stem && o.energy > LIVING_ORGAN;
  });
  double material = leaf
                        ? LEAF_BUOYANCY + LEAF_SINKING * (1 - std::exp2(-double(d.age) / LEAF_SOAK))
                        : STEM_SINKING + WILT_SINKING * (1 - p.vitality),
         drag = leaf ? LEAF_DRAG : STEM_DRAG;
  auto drift = drift_velocity({d.vx, d.vy}, flow, material, drag);
  d.vx = drift.x;
  d.vy = drift.y;
  if (env_.foliage_yield > 0) {
    const auto &axis = p.organs[0].curve;
    const double cx = d.x + delta_x(axis.back().x - axis.front().x) / 2,
                 cy = d.y + (axis.back().y - axis.front().y) / 2, half = chord_length(axis) / 2;
    body_grid_.nearby(cx, cy, half + indexed_body_radius_, [&](std::uint32_t index) {
      const auto &q = visible_[index];
      if (q.kind != food_kind::fish || q.hidden || !q.hatched)
        return;
      const double dx = delta_x(cx - q.x), dy = cy - q.y, gap = std::hypot(dx, dy),
                   reach = q.radius + half;
      if (gap >= reach)
        return;
      const double share = std::min(1., env_.foliage_yield * (1 - gap / reach));
      d.vx += share * (q.flow_x - d.vx) + (gap > 0 ? PUSH_ASIDE * share * dx / gap : 0);
      d.vy += share * (q.flow_y - d.vy) + (gap > 0 ? PUSH_ASIDE * share * dy / gap : 0);
    });
  }
  auto slowed = sediment_velocity({d.vx, d.vy}, d.x, d.y, DRIFT_RADIUS);
  d.vx = slowed.x;
  d.vy = slowed.y;
  const auto axis = p.organs[0].curve;
  double length = std::max(MIN_DRIFT_LENGTH, chord_length(axis)),
         ux = (axis.back().x - axis.front().x) / length,
         uy = (axis.back().y - axis.front().y) / length;
  auto tip_flow = water_.velocity(axis.back().x, axis.back().y);
  double torque = (ux * (tip_flow.y - flow.y) - uy * (tip_flow.x - flow.x)) / length +
                  SLIP_TORQUE * (ux * (flow.y - d.vy) - uy * (flow.x - d.vx));
  p.spin = std::clamp(SPIN_KEEP * p.spin + SPIN_GAIN * torque, -MAX_SPIN, MAX_SPIN);
  double co = std::cos(p.spin), si = std::sin(p.spin), dx = d.vx, dy = d.vy;
  auto slide = [&](Point from, Point to, double margin) {
    auto allowed = [&](Point q) {
      return free(q.x, q.y, margin) && passage(*this, from, q, margin);
    };
    if (allowed(to))
      return to;
    Point x{to.x, from.y}, y{from.x, to.y};
    if (allowed(x))
      return x;
    if (allowed(y))
      return y;
    if (to.y > from.y) {
      for (double side : {-1., 1.}) {
        Point tangent{from.x + side * SLIDE_ASIDE, from.y + SLIDE_DOWN};
        if (allowed(tangent))
          return tangent;
      }
    }
    return from;
  };
  auto root = slide({d.x, d.y}, {d.x + dx, d.y + dy}, ROOT_MARGIN);
  dx = delta_x(root.x - d.x);
  dy = root.y - d.y;
  d.vx = dx;
  d.vy = dy;
  for (std::size_t j = 0; j < p.organs.size(); ++j) {
    auto &o = p.organs[j];
    const auto previous = o.curve;
    double amplitude =
               std::min(MAX_FLUTTER,
                        (FLUTTER_BASE + FLUTTER_WILT * (1 - p.vitality)) * chord_length(o.curve) *
                            std::min(MAX_FLUTTER_SPEED,
                                     std::hypot(flow.x, flow.y) + std::hypot(wake.x, wake.y))),
           flutter = (std::sin((d.age + 1) * FLUTTER_STEP + j * FLUTTER_SHIFT + d.id) -
                      std::sin(d.age * FLUTTER_STEP + j * FLUTTER_SHIFT + d.id)) *
                     amplitude;
    for (int k = 0; k < CURVE_POINTS; ++k) {
      auto &q = o.curve[k];
      double x = q.x - d.x, y = q.y - d.y;
      Point next{d.x + dx + co * x - si * y, d.y + dy + si * x + co * y};
      if (o.kind >= plant_organ::leaf && (k == 1 || k == 2)) {
        next.x += uy * flutter * (k == 1 ? 1 : -1);
        next.y -= ux * flutter * (k == 1 ? 1 : -1);
      }
      auto v = sediment_velocity({delta_x(next.x - q.x) - dx, next.y - q.y - dy}, q.x, q.y,
                                 POINT_RADIUS);
      q = slide(q, {q.x + dx + v.x, q.y + dy + v.y}, POINT_MARGIN);
    }
    const double length = curve_length(o.curve);
    if (length > o.loose_length * MAX_STRETCH) {
      const auto anchor = o.curve.front();
      const double scale = o.loose_length / length;
      for (int k = 1; k < CURVE_POINTS; ++k) {
        o.curve[k].x = anchor.x + scale * (o.curve[k].x - anchor.x);
        o.curve[k].y = anchor.y + scale * (o.curve[k].y - anchor.y);
      }
      bool valid = true;
      for (int k = 0; k < CURVE_POINTS; ++k)
        valid &= free(o.curve[k].x, o.curve[k].y, POINT_MARGIN);
      if (!valid)
        o.curve = previous;
    }
    const double lost = o.energy * half_life_loss(1 / env_.decay_half_life);
    o.energy -= lost;
    deposit_detritus(o.curve.front().x, o.curve.front().y, lost);
  }
  p.vitality *= std::exp2(-1. / DRIFT_VITALITY_HALF_LIFE);
  p.grass = mass(p);
  d.x = wrap_x(p.organs[0].curve.front().x);
  d.y = std::clamp(p.organs[0].curve.front().y, DRIFT_EDGE, geometry_.height - DRIFT_EDGE);
  double shift = d.x - p.organs[0].curve.front().x;
  for (auto &o : p.organs) {
    for (auto &q : o.curve)
      q.x += shift;
    o.draw_curve = o.curve;
  }
  p.blade = p.organs[0].curve;
  p.blades.fill(p.blade);
  p.a = {d.x - p.length / 2, d.y};
  p.b = {d.x + p.length / 2, d.y};
  ++d.age;
  if (!p.organs.empty() && p.organs[0].kind == plant_organ::stem &&
      d.age % BREAK_PERIOD == d.id % BREAK_PERIOD &&
      curve_length(p.organs[0].curve) > BREAK_LENGTH &&
      vegetation_.drifting_grass.size() + shed.size() < MAX_DRIFTING_GRASS) {
    const double t =
        std::clamp(BREAK_PIECE / curve_length(p.organs[0].curve), MIN_BREAK, MAX_BREAK);
    DriftingGrass lower;
    lower.id = vegetation_.next_surface_id++;
    lower.plant = p;
    lower.plant.organs.clear();
    lower.root_contact = -1;
    std::vector<PlantOrgan> upper_parts;
    std::vector<int> side(p.organs.size(), -1), mapped(p.organs.size(), -1);
    for (std::size_t i = 0; i < p.organs.size(); ++i) {
      auto o = p.organs[i];
      if (i == 0) {
        auto lo = o;
        lo.energy *= t;
        lo.curve = lower_curve(o.curve, t);
        lo.draw_curve = lo.curve;
        lo.loose_length = curve_length(lo.curve);
        lower.plant.organs.push_back(lo);
        o.energy *= 1 - t;
        o.curve = upper(o.curve, t);
        o.draw_curve = o.curve;
        o.loose_length = curve_length(o.curve);
        mapped[0] = 0;
        side[0] = 1;
        upper_parts.push_back(o);
        continue;
      }
      const bool belongs_lower =
          o.parent == 0 ? o.attach <= t : o.parent >= 0 && side[o.parent] == 0;
      side[i] = belongs_lower ? 0 : 1;
      if (o.parent == 0)
        o.attach = belongs_lower ? o.attach / t : (o.attach - t) / (1 - t);
      o.parent = o.parent == 0 ? 0 : o.parent < 0 ? -1 : mapped[o.parent];
      auto &parts = belongs_lower ? lower.plant.organs : upper_parts;
      mapped[i] = int(parts.size());
      parts.push_back(o);
    }
    p.organs = std::move(upper_parts);
    p.grass = mass(p);
    lower.plant.grass = mass(lower.plant);
    lower.plant.blade = lower.plant.organs[0].curve;
    lower.plant.blades.fill(lower.plant.blade);
    lower.x = wrap_x(lower.plant.blade.front().x);
    lower.y = lower.plant.blade.front().y;
    lower.vx = d.vx;
    lower.vy = d.vy;
    lower.plant.spin = BREAK_SPIN * p.spin;
    shed.push_back(std::move(lower));
    p.blade = p.organs[0].curve;
    p.blades.fill(p.blade);
    d.x = wrap_x(p.blade.front().x);
    d.y = p.blade.front().y;
  }
  if (p.vitality < SHED_VITALITY && d.age % SHED_PERIOD == 0 && p.organs.size() > 1 &&
      vegetation_.drifting_grass.size() + shed.size() < MAX_DRIFTING_GRASS) {
    for (auto &o : p.organs)
      if (o.kind >= plant_organ::leaf && o.parent >= 0 && o.energy > LIVING_ORGAN) {
        DriftingGrass f;
        f.id = vegetation_.next_surface_id++;
        f.root_contact = -1;
        f.plant = p;
        f.plant.organs = {o};
        f.plant.organs[0].parent = -1;
        release_organ(f.plant.organs[0]);
        f.plant.grass = o.energy;
        f.plant.spin = p.spin + DRIFT_SPIN * (noise(f.id) - .5);
        const auto &released = f.plant.organs[0].curve;
        f.x = wrap_x(released[0].x);
        f.y = std::clamp(released[0].y, DRIFT_EDGE, geometry_.height - DRIFT_EDGE);
        f.vx = d.vx;
        f.vy = d.vy - SHED_SINK;
        f.plant.blade = released;
        f.plant.blades.fill(released);
        o.energy = 0;
        p.grass = mass(p);
        shed.push_back(std::move(f));
        break;
      }
  }
}
void Field::replant_grass(DriftingGrass &d) {

  if (d.root_contact < 0 || d.plant.vitality < REPLANT_VITALITY)
    return;
  std::size_t support = vegetation_.surfaces.size();
  double best = std::numeric_limits<double>::infinity();
  vegetation_.surface_grid.nearby(
      d.x, d.y, sediment_.max_sediment_depth + REPLANT_SEARCH, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.stump || grass_capacity(s) < env_.seed_energy || !room_for_plant(s))
          return;
        double dx = delta_x(d.x - s.a.x), dy = d.y - s.a.y,
               t = (dx * (s.b.x - s.a.x) + dy * (s.b.y - s.a.y)) / (s.length * s.length),
               gap = dx * s.normal.x + dy * s.normal.y;
        auto edges = sediment_edges(i);
        double depth = edges[0] + (edges[1] - edges[0]) * std::clamp(t, 0., 1.);
        if (t >= 0 && t <= 1 && gap >= 0 && gap < depth - REPLANT_COVER && depth - gap < best) {
          best = depth - gap;
          support = i;
        }
      });
  if (support == vegetation_.surfaces.size() || std::hypot(d.vx, d.vy) > REPLANT_SPEED) {
    d.root_contact = std::max(0, d.root_contact - REPLANT_LOSS);
    return;
  }
  auto &soil = vegetation_.surfaces[support];
  if (d.contact_surface != soil.id) {
    d.contact_surface = soil.id;
    d.root_contact = 0;
  }
  if (++d.root_contact < REPLANT_STEPS)
    return;
  soil.stump = true;
  soil.grass_traits = grass_traits(d.plant);
  soil.grass = d.plant.grass;
  soil.organs = d.plant.organs;
  const auto c = character(soil.id);
  const double reach = plant_reach(soil) * c.stature;
  const auto soil_edges = sediment_edges(support);
  for (auto &o : soil.organs) {
    o.target = std::max(tolerance::precision, o.energy);
    const double physical_length = curve_length(o.curve),
                 leafness = o.kind >= plant_organ::leaf ? c.leafness : 1.;
    double cover = 0;
    if (o.parent < 0) {
      o.attach = std::clamp((delta_x(o.curve.front().x - soil.a.x) * (soil.b.x - soil.a.x) +
                             (o.curve.front().y - soil.a.y) * (soil.b.y - soil.a.y)) /
                                (soil.length * soil.length),
                            0., 1.);
      o.root = std::max(MIN_ROOT, delta_x(o.curve.front().x - soil.a.x) * soil.normal.x +
                                      (o.curve.front().y - soil.a.y) * soil.normal.y);
      cover = std::max(0., soil_edges[0] + (soil_edges[1] - soil_edges[0]) * o.attach - o.root);
    }
    o.length =
        std::max(MIN_LENGTH, (physical_length / leafness - cover) / std::max(MIN_LENGTH, reach));
    o.elongation = 1;
    o.loose_length = 0;
  }
  soil.vitality = d.plant.vitality;
  soil.spin = 0;
  soil.root_height = std::max(0., soil_depth(soil) - grass_root_depth(soil));
  auto root = d.plant.blade.front(), tip = d.plant.blade.back();
  soil.root_lean = std::remainder(std::atan2(tip.y - root.y, tip.x - root.x) + PI / 2, 2 * PI);
  soil.grass_spread = time;
  d.plant.grass = 0;
}
void Field::advance_grass() {
  advance_anchored_grass();
  std::vector<DriftingGrass> shed;
  for (auto &d : vegetation_.drifting_grass)
    advance_drifting_grass(d, shed);
  for (auto &d : vegetation_.drifting_grass)
    replant_grass(d);
  vegetation_.drifting_grass.erase(std::remove_if(vegetation_.drifting_grass.begin(),
                                                  vegetation_.drifting_grass.end(),
                                                  [&](const auto &d) {
                                                    if (d.plant.grass >= env_.crumb_min)
                                                      return false;
                                                    deposit_detritus(d.x, d.y, d.plant.grass);
                                                    return true;
                                                  }),
                                   vegetation_.drifting_grass.end());
  for (auto &d : shed)
    vegetation_.drifting_grass.push_back(std::move(d));
}
namespace {
constexpr double THIN_SEDIMENT = .25, EXPOSURE_TOLERANCE = .1, CONTACT_GAP = 5, CONTACT_SPACING = 2,
                 ALGAE_REACH = 16, BED_MARGIN = 1.5, ALGAE_LIFT = .03;
constexpr int MIN_CONTACT_PROBES = 3;
constexpr int PATCH_NEIGHBORS = 2;
constexpr double SHORT_SHOOT = 5.3, MAX_COVER = 3.5, SHOOT_SHOW = 1.8, MIN_TARGET_ENERGY = .001;
}
void Field::refresh_algae_exposure() {
  bool cleared = false;
  for (auto &s : vegetation_.surfaces)
    if (s.sediment > 0 && sediment_depth(s) < THIN_SEDIMENT) {
      s.sediment = 0;
      cleared = true;
    }
  if (cleared && reading_edges_) {
    reading_edges_ = false;
    for (std::size_t i = 0; i < read_edges_.size(); ++i)
      read_edges_[i] = sediment_edges(i);
    reading_edges_ = true;
  }
  auto &cache = vegetation_.algae_exposure_sediment;
  if (vegetation_.algae_exposure_geometry == environment_signature &&
      cache.size() == vegetation_.surfaces.size() &&
      std::equal(cache.begin(), cache.end(), vegetation_.surfaces.begin(),
                 [](double amount, const SurfacePatch &s) {
                   return (amount > tolerance::negligible) ==
                              (s.sediment > tolerance::negligible) &&
                          std::abs(sediment_depth(amount - s.sediment, s.length)) <
                              EXPOSURE_TOLERANCE;
                 }))
    return;
  cache.clear();
  cache.reserve(vegetation_.surfaces.size());
  for (const auto &s : vegetation_.surfaces)
    cache.push_back(s.sediment);
  vegetation_.algae_exposure_geometry = environment_signature;
  auto &contact = vegetation_.algae_contact;
  if (vegetation_.algae_contact_geometry != environment_signature ||
      contact.size() != vegetation_.surfaces.size()) {
    vegetation_.algae_contact_geometry = environment_signature;
    contact.assign(vegetation_.surfaces.size(), {0., 1.});
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
      const auto &s = vegetation_.surfaces[i];
      const int n = std::max(MIN_CONTACT_PROBES, int(std::ceil(s.length / CONTACT_SPACING)));
      int best = 0, best_start = 0, run = 0;
      for (int k = 0; k < n; ++k) {
        const double t = (k + .5) / n, lift = 1 + CONTACT_GAP / 2;
        const bool open = free(s.a.x + t * (s.b.x - s.a.x) + s.normal.x * lift,
                               s.a.y + t * (s.b.y - s.a.y) + s.normal.y * lift, CONTACT_GAP / 2);
        run = open ? run + 1 : 0;
        if (run > best) {
          best = run;
          best_start = k - run + 1;
        }
      }
      contact[i] =
          best == n  ? std::array<double, 2>{0., 1.}
          : best > 0 ? std::array<double, 2>{double(best_start) / n, double(best_start + best) / n}
                     : std::array<double, 2>{0., 0.};
    }
  }
  double reach = ALGAE_REACH;
  for (const auto &p : vegetation_.surfaces)
    reach = std::max(reach, ALGAE_REACH + sediment_depth(p) + BED_MARGIN);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    s.algae_open = contact[i];
    if (s.algae_open[1] <= s.algae_open[0]) {
      s.algae_open = {0, 0};
      continue;
    }
    // Clip against the actual bed profile, including this patch, so a tapered
    // layer can leave part of the rock exposed.
    const Point a{s.a.x + ALGAE_LIFT * s.normal.x, s.a.y + ALGAE_LIFT * s.normal.y};
    const double dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    vegetation_.surface_grid.nearby(
        surface_midpoint(s).x, surface_midpoint(s).y, reach + s.length / 2, [&](std::uint32_t j) {
          const auto &bed = vegetation_.surfaces[j];
          if (bed.normal.y > -seabed::floor_normal)
            return;
          const auto e = sediment_edges(j);
          if (e[0] <= 0 && e[1] <= 0)
            return;
          const double px = delta_x(a.x - bed.a.x), py = a.y - bed.a.y, sx = bed.b.x - bed.a.x,
                       sy = bed.b.y - bed.a.y, t = (px * sx + py * sy) / (bed.length * bed.length),
                       dt = (dx * sx + dy * sy) / (bed.length * bed.length),
                       gap = px * bed.normal.x + py * bed.normal.y,
                       dg = dx * bed.normal.x + dy * bed.normal.y, slope = e[1] - e[0];
          double lo = 0, hi = 1;
          auto clip = [&](double value, double rate) {
            if (std::abs(rate) < tolerance::rounding)
              return value >= 0;
            const double at = -value / rate;
            if (rate > 0)
              lo = std::max(lo, at);
            else
              hi = std::min(hi, at);
            return hi > lo;
          };
          if (!clip(t, dt) || !clip(1 - t, -dt) || !clip(gap, dg) ||
              !clip(e[0] + slope * t - gap, slope * dt - dg))
            return;
          lo = std::max(lo, s.algae_open[0]);
          hi = std::min(hi, s.algae_open[1]);
          if (hi <= lo)
            return;
          if (lo - s.algae_open[0] > s.algae_open[1] - hi)
            s.algae_open[1] = lo;
          else
            s.algae_open[0] = hi;
        });
    if (s.algae_open[1] - s.algae_open[0] < tolerance::negligible)
      s.algae_open = {0, 0};
  }
}
void Field::settle_plant_geometry(const std::vector<double> &bed_before, bool grazed) {
  refresh_algae_exposure();
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i)
    if (vegetation_.surfaces[i].sediment != bed_before[i]) {
      for (int offset = -PATCH_NEIGHBORS; offset <= PATCH_NEIGHBORS; ++offset) {
        auto j = std::ptrdiff_t(i) + offset;
        if (j < 0 || j >= std::ptrdiff_t(vegetation_.surfaces.size()))
          continue;
        const auto &p = vegetation_.surfaces[j];
        if (p.owner != vegetation_.surfaces[i].owner || p.edge != vegetation_.surfaces[i].edge)
          continue;
        if (p.algae > 0)
          grazed = true;
        const double reach = plant_reach(p);
        for (const auto &o : p.organs)
          if (o.parent < 0 && o.energy > 0) {
            const double base = organ_length(
                o, reach, std::clamp(o.energy / std::max(MIN_TARGET_ENERGY, o.target), 0., 1.));
            if (base >= SHORT_SHOOT)
              continue;
            const auto old = sediment_edges(j, &bed_before);
            const auto now = sediment_edges(j);
            auto exposed = [&](const auto &edges) {
              double cover = edges[0] + (edges[1] - edges[0]) * o.attach - o.root;
              return std::max(base, cover >= 0 && cover <= MAX_COVER ? cover + SHOOT_SHOW : 0.);
            };
            if (exposed(old) != exposed(now)) {
              grazed = true;
              if (std::size_t(j) < vegetation_.plant_geometry_cache.size())
                vegetation_.plant_geometry_cache[j].clear();
            }
          }
      }
    }
  if (grazed)
    index_plants(true, true);
  else {
    sediment_.max_sediment_depth = 0;
    for (const auto &p : vegetation_.surfaces)
      sediment_.max_sediment_depth = std::max(sediment_.max_sediment_depth, sediment_depth(p));
    update_sediment_light();
  }
}

void Field::consume_algae(std::size_t index, double amount) {
  auto &part = vegetation_.plants.at(index);
  auto &source = plant_source_mut(part.patch);
  if (part.kind != food_kind::algae || !std::isfinite(amount) || amount < 0 ||
      amount > std::min(part.energy, source.algae))
    throw std::invalid_argument("invalid algae portion");
  source.algae -= amount;
  source.algae_grazed += amount;
  part.energy -= amount;
}

}
