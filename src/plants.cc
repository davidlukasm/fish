#include "body.hh"
#include "plants.hh"
#include <numeric>
namespace fishsim {
namespace {
std::array<double, 3> organ_tint(const SurfacePatch &p, int index) {
  auto traits = grass_traits(p);
  int form = grass_form(p);
  bool second = grass_type(p) % 2;
  const std::array<double, 3> palette[6] = {{{.40, .76, .12}}, {{.08, .46, .43}},
                                            {{.34, .48, .17}}, {{.12, .38, .20}},
                                            {{.38, .55, .23}}, {{.27, .66, .26}}};
  auto color = palette[2 * form + second];
  const double hard = traits[0], soft = 1 - hard;
  for (int k = 0; k < 3; ++k)
    color[k] *= (.75 + .45 * traits[1]) * (1 - .22 * hard);
  color[0] = color[0] * .45 + .34 * soft;
  color[1] = color[1] * (1 - .22 * hard);
  color[2] = color[2] * .5 + .34 * hard;
  color = green_tint(color);

  double phase = std::sin(p.id * 1.71 + index * 2.39),
         shade = .93 + .10 * std::sin(index * 2.1 + p.id * .73), dry = 1 - p.vitality;
  if (form <= 1 && index >= 0 && std::size_t(index) < p.organs.size() && p.organs[index].kind != 1)
    dry = std::max(dry, std::min(.82, p.organs[index].bare_steps / 4800.));
  const double delta[3] = {.025, .014, -.015}, stem[3] = {.62, .74, .55}, dead[3] = {.43, .32, .16};
  bool stalk = index >= 0 && std::size_t(index) < p.organs.size() && p.organs[index].kind == 1;
  if (form == 2 && !second && index > 0) {
    color[0] += .10 * index / std::max<std::size_t>(1, p.organs.size());
    color[1] -= .05 * index / std::max<std::size_t>(1, p.organs.size());
  }
  for (int k = 0; k < 3; ++k)
    color[k] = std::clamp(
        (color[k] * shade + phase * delta[k]) * (stalk ? stem[k] : 1.) * (1 - dry) + dead[k] * dry,
        0., 1.);
  return color;
}
}
std::array<double, 3> plant_organ_color(const SurfacePatch &p, int index) {
  return index >= 0 && std::size_t(index) < p.organs.size() ? p.organs[index].tint : grass_color(p);
}
namespace {
double noise(double k) {
  double v = std::sin(k * 12.9898 + 78.233) * 43758.5453;
  return v - std::floor(v);
}
double grass_blade_length(bool band, double variation) {
  return band ? .85 + .40 * variation : .40 + .25 * variation;
}
// A crown may sit anywhere in its support slot. Its leaves share that root neighbourhood.
double crown_anchor(const SurfacePatch &s) {
  return grass_anchor(s);
}
double root_attach(const SurfacePatch &s, double h, double spread) {
  return std::clamp(crown_anchor(s) + (h - .5) * spread * 5, .025, .975);
}
Point mix(Point a, Point b, double t) {
  return {a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t};
}
Point curve(const std::array<Point, 4> &q, double t) {
  auto a = mix(q[0], q[1], t), b = mix(q[1], q[2], t), c = mix(q[2], q[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
std::array<Point, 4> upper(const std::array<Point, 4> &q, double t) {
  auto a = mix(q[0], q[1], t), b = mix(q[1], q[2], t), c = mix(q[2], q[3], t), d = mix(a, b, t),
       e = mix(b, c, t);
  return {mix(d, e, t), e, c, q[3]};
}
double curve_length(const std::array<Point, 4> &q) {
  double length = 0;
  for (int k = 1; k < 4; ++k)
    length += std::hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
  return length;
}
double mass(const SurfacePatch &p) {
  double result = 0;
  for (const auto &o : p.organs)
    result += o.energy;
  return result;
}
bool passage(const Field &f, Point a, Point b, double margin = 0) {
  double dx = f.delta_x(b.x - a.x), dy = b.y - a.y, length = std::hypot(dx, dy);
  if (length < 1e-9)
    return true;
  return f.clear_line(a.x, a.y, b.x, b.y) ||
         f.ray(a.x, a.y, dx / length, dy / length, margin, length + .01) >= length - .01;
}
double profile(int kind, double t) {
  if (kind < 2)
    return (kind == 0 ? std::pow(std::max(0., 1 - std::pow(t, 5)), .45)
                      : (1 - .75 * t) * (1 + .5 * std::exp(-std::pow((t - .93) / .06, 2))));
  if (t < .12)
    return .08;
  double u = (t - .12) / .88, s = std::max(0., std::sin(PI * u));
  return kind == 2 ? std::pow(s, .9) * (1 + .06 * std::sin(10 * PI * u))
                   : std::pow(s, .65) * (1 - .27 * u);
}
const std::vector<double> &sampled_profile(int kind, int n, bool midpoint = true) {
  // Reuse both midpoint profiles for indexing and endpoint profiles for wall tests.
  thread_local std::array<std::vector<std::vector<double>>, 8> cache;
  auto &grids = cache[kind + (midpoint ? 0 : 4)];
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
         : o.kind < 2      ? o.width
                           : std::min(o.kind == 2 ? 5.7 : 6.9, std::max(.15, length * o.width));
}
bool empty_area(const Field &f, const std::array<Point, 4> &q, double girth) {
  double left = q[0].x, right = left, top = q[0].y, bottom = top;
  for (int k = 1; k < 4; ++k) {
    left = std::min(left, q[k].x);
    right = std::max(right, q[k].x);
    top = std::min(top, q[k].y);
    bottom = std::max(bottom, q[k].y);
  }
  double margin = 1.07 * girth + .08;
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
  std::array<bool, 64> seen{};
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
std::array<Point, 4> constrain(const Field &f, std::array<Point, 4> q, double girth, int kind) {
  if (empty_area(f, q, girth))
    return q;
  const double length = curve_length(q);
  int samples = std::clamp(int(std::ceil(length / 4)), 8, 40);
  Point last = q[0];
  double extent = 1;
  const auto &widths = sampled_profile(kind, samples, false);
  for (int k = 1; k <= samples; ++k) {
    double t = double(k) / samples;
    auto p = curve(q, t);
    double margin = std::min(.08 + girth * widths[k - 1], .08 + length * t * .45);
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
std::array<Point, 4> lower_curve(std::array<Point, 4> q, double t) {
  std::array<Point, 4> result{q[0], {}, {}, {}};
  for (int level = 3; level > 0; --level) {
    for (int i = 0; i < level; ++i)
      q[i] = mix(q[i], q[i + 1], t);
    result[4 - level] = q[0];
  }
  return result;
}
void release_organ(PlantOrgan &o, double cut) {
  // Detached material inherits the plant's actual geometry, including folding and wall contact.
  if (o.display_width > 0) {
    o.curve = o.draw_curve;
    o.loose_width = o.display_width;
  } else if (o.loose_width <= 0)
    o.loose_width =
        organ_width(o, std::hypot(o.curve[3].x - o.curve[0].x, o.curve[3].y - o.curve[0].y));
  o.elongation = 1;
  if (cut > 0)
    o.curve = upper(o.curve, cut);
  o.draw_curve = o.curve;
  o.loose_length = curve_length(o.curve);
}
void Field::seed_organs(SurfacePatch &s) {

  const auto traits = grass_traits(s);
  const int form = grass_form(s);
  auto edges = sediment_edges(&s - vegetation_.surfaces.data());
  auto add = [&](int kind, int parent, double at, double length, double width, double weight,
                 double hardness) {
    PlantOrgan o;
    o.kind = kind;
    o.parent = parent;
    o.attach = at;
    o.length = length * (kind == 1 ? (form == 1 ? .18 : .60 + .20 * traits[1]) : 1.);
    o.width = width;
    o.target = weight;
    o.hardness = hardness;
    if (parent < 0) {
      double depth = edges[0] + (edges[1] - edges[0]) * at;
      if (!bed_site_clear(s, at, depth - grass_root_depth(s, depth, at), 16)) {
        at = crown_anchor(s);
        depth = edges[0] + (edges[1] - edges[0]) * at;
        o.attach = at;
      }
      o.root = depth - grass_root_depth(s, depth, at);
    }
    s.organs.push_back(o);
    return int(s.organs.size() - 1);
  };
  const bool second = grass_type(s) % 2;
  if (form == 0) {
    int n = std::max(3, grass_stems(s) + (second ? -1 : 2));
    for (int k = 0; k < n; ++k) {
      double h = noise(s.id * 9.7 + k * 3.1),
             at = root_attach(s, (k + .2 + .6 * noise(s.id * 3.7 + k * 7.3)) / n,
                              (second ? .22 : .10) + .055 * traits[2]);
      add(0, -1, at, grass_blade_length(second, h),
          second ? 1.5 + 1.0 * traits[2] : .28 + .24 * traits[2], 1., 1.);
    }
  } else if (form == 1) {
    int leaves = 3 + int(3 * traits[2]);
    for (int k = 0; k < leaves; ++k) {
      double h = noise(s.id * 7.1 + k * 6.7),
             at = std::clamp(crown_anchor(s) + (double(k) / std::max(1, leaves - 1) - .5) * .12,
                             .025, .975);
      int stalk =
          add(1, -1, at, second ? .08 + .15 * traits[2] + .10 * h : .10 + .22 * traits[2] + .16 * h,
              .25 + .20 * traits[0], .35, 1.7 + traits[0]);
      add(second ? 3 : 2, stalk, 1,
          (second ? .10 : .18) + (second ? .09 : .16) * noise(s.id * 1.3 + k * 7.2),
          (second ? .16 + .18 * traits[0] : .055 + .095 * traits[0]) * 1.4, 1.,
          second ? 1.8 + .6 * traits[0] : .85 + .4 * traits[0]);
    }
  } else {
    int nodes = 2 + int(2 * traits[2]), parent = -1;
    for (int k = 0; k < nodes; ++k) {
      double h = noise(s.id * 4.1 + k * 9.2);
      parent = add(1, parent, parent < 0 ? crown_anchor(s) : 1, .10 + .065 * h,
                   .27 + .20 * traits[0], .65, 1.9 + traits[0]);
      for (int side = 0; side < (second ? 1 : 2); ++side)
        add(second ? 3 : 2, parent, side ? .88 : 1,
            (second ? .075 : .10) + .065 * noise(s.id * 1.7 + k * 3.2 + side),
            second ? .17 + .19 * traits[0] : .065 + .105 * traits[0], 1., .9 + .4 * traits[0]);
    }
  }
  if (form == 0) {
    const double center = crown_anchor(s);
    std::stable_sort(s.organs.begin(), s.organs.end(), [&](const auto &a, const auto &b) {
      return std::abs(a.attach - center) > std::abs(b.attach - center);
    });
    for (std::size_t k = 0; k < s.organs.size(); ++k)
      s.organs[k].ready = time + std::uint64_t(k * (900 + 700 * noise(s.id + k * 91)));
  }
  double weights = 0;
  for (const auto &o : s.organs)
    weights += o.target;
  for (auto &o : s.organs)
    o.target *= std::max(1., env_.grass_capacity) / weights;
  // A seedling first funds its stem and two leaves; additional buds open as it grows.
  const bool seedling = s.grass < env_.grass_capacity * .18;
  double weights_first = 0;
  int leaves = 0;
  for (auto &o : s.organs) {
    bool first = !seedling || (o.parent < 0 && leaves++ < (form == 0 ? 1 : 2)) ||
                 (o.parent >= 0 && o.parent < 3);
    if (first)
      weights_first += o.target;
  }
  leaves = 0;
  for (auto &o : s.organs) {
    bool first = !seedling || (o.parent < 0 && leaves++ < (form == 0 ? 1 : 2)) ||
                 (o.parent >= 0 && o.parent < 3);
    o.energy = first ? s.grass * o.target / std::max(1e-12, weights_first) : 0;
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
  const bool reserve = std::any_of(s.organs.begin(), s.organs.end(),
                                   [](const auto &o) { return o.energy > o.target + 1e-10; });
  auto can_grow = [&](const PlantOrgan &o) {
    if (o.ready > time && o.energy <= 0)
      return false;
    const auto k = &o - s.organs.data();
    if (o.kind == 0 && o.energy <= 0 && k > 0 && s.organs[k - 1].energy > 0 &&
        s.organs[k - 1].elongation < .22)
      return false;
    return o.parent < 0 ||
           s.organs[o.parent].energy > (o.kind == 1 ? .62 : .35) * s.organs[o.parent].target;
  };
  const bool bud = std::any_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
    return o.target - o.energy > 1e-10 && can_grow(o);
  });
  if (std::abs(total - s.grass) <= 1e-10 && (drifting || !reserve || !bud))
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
  for (std::size_t pass = 0; difference > 1e-10 && pass <= s.organs.size(); ++pass) {
    double wanted = 0;
    std::vector<unsigned char> eligible(s.organs.size());
    for (std::size_t k = 0; k < s.organs.size(); ++k) {
      const auto &o = s.organs[k];
      eligible[k] = can_grow(o);
      if (eligible[k])
        wanted += std::max(0., o.target - o.energy);
    }
    if (wanted <= 1e-12)
      break;
    const double scale = std::min(1., difference / wanted);
    for (std::size_t k = 0; k < s.organs.size(); ++k)
      if (eligible[k]) {
        auto &o = s.organs[k];
        o.energy += scale * std::max(0., o.target - o.energy);
      }
    difference = s.grass - mass(s);
  }
  if (difference > 1e-10 && !s.organs.empty())
    s.organs.front().energy += difference;
}
namespace {
void bud_organs(Field &f, SurfacePatch &s) {
  const auto &env = f.env();
  const auto time = f.time;
  if (!s.organs.empty() && s.organs.size() < 48 && s.vitality > .65) {
    const auto traits = grass_traits(s);
    const int type = grass_type(s), form = type / 2;
    int roots = 0, nodes = 0, tip = -1;
    double mature = 0;
    for (std::size_t k = 0; k < s.organs.size(); ++k) {
      const auto &o = s.organs[k];
      if (o.parent < 0)
        ++roots;
      if (o.kind == 1 && form == 2) {
        ++nodes;
        tip = int(k);
      }
      mature += o.energy;
    }
    const auto &last = s.organs.back();
    const bool ready = last.ready <= time && last.energy > .68 * last.target &&
                       (form != 0 || last.elongation > .35);
    auto add = [&](int kind, int parent, double at, double length, double width, double weight,
                   double hardness) {
      PlantOrgan o;
      o.kind = kind;
      o.parent = parent;
      o.attach = at;
      o.length = length * (kind == 1 ? (form == 1 ? .18 : .60 + .20 * traits[1]) : 1.);
      o.width = width;
      o.target = weight;
      o.hardness = hardness;
      o.ready = time;
      if (parent < 0) {
        auto edges = f.sediment_edges(&s - f.vegetation().surfaces.data());
        double depth = edges[0] + (edges[1] - edges[0]) * at;
        if (!f.bed_site_clear(s, at, depth - grass_root_depth(s, depth, at), 16)) {
          at = crown_anchor(s);
          depth = edges[0] + (edges[1] - edges[0]) * at;
          o.attach = at;
        }
        o.root = depth - grass_root_depth(s, depth, at);
      }
      s.organs.push_back(o);
      return int(s.organs.size() - 1);
    };
    if (ready && mature > .28 * env.grass_capacity) {
      const auto before = s.organs.size();
      const double h = noise(s.id * 19.1 + s.organs.size() * 3.7), unit = s.organs.front().target;
      if (form == 0 && roots < grass_stems(s) + 4)
        add(0, -1, root_attach(s, h, .035 + .05 * traits[2]), grass_blade_length(type == 1, h),
            s.organs.front().width, unit, 1.);
      else if (form == 1 && roots < 5 + int(2 * traits[2])) {
        int stalk =
            add(1, -1, std::clamp(crown_anchor(s) + (h - .5) * .12, .025, .975),
                type == 3 ? .08 + .15 * traits[2] + .10 * h : .10 + .22 * traits[2] + .16 * h,
                .25 + .20 * traits[0], unit, 1.7 + traits[0]);
        add(type == 3 ? 3 : 2, stalk, 1, s.organs[1].length, s.organs[1].width, unit / .35,
            type == 3 ? 1.8 + .6 * traits[0] : .85 + .4 * traits[0]);
      } else if (form == 2 && nodes < 16 && tip >= 0) {
        int stalk = add(1, tip, 1, .13 + .065 * h, .27 + .20 * traits[0], unit, 1.9 + traits[0]);
        for (int side = 0; side < (type == 4 ? 2 : 1); ++side)
          add(type == 5 ? 3 : 2, stalk, side ? .88 : 1, (type == 5 ? .075 : .10) + .065 * h,
              type == 5 ? .17 + .19 * traits[0] : .065 + .105 * traits[0], unit / .65,
              .9 + .4 * traits[0]);
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
            o.ready = time + (form == 0 ? 900 : 440);
        }
        // Root reserves fund buds only once their emergence time is reached.
        if (reserve > 0)
          s.organs.front().energy += reserve;
      }
    }
  }
}
}
double Field::plant_reach(const SurfacePatch &s) const {
  const auto traits = grass_traits(s);
  return (grass_form(s) == 0 ? 1.5 : 1.) * std::min(160., 4 + (env_.grass_length - 4) * 1.65) *
         (.64 + .62 * traits[2] + .22 * noise(s.id * 8.31));
}
bool Field::shape_organs(SurfacePatch &s) {
  bool bent = false;
  const auto traits = grass_traits(s);
  const double stature = .72 + .56 * (.5 + .5 * std::sin(s.id * 8.31)),
               fan = .7 + .6 * (.5 + .5 * std::sin(s.id * 5.17)),
               curvature = .65 + .7 * (.5 + .5 * std::sin(s.id * 3.73)),
               leafness = .75 + .5 * (.5 + .5 * std::sin(s.id * 9.23)),
               sway_rate = .65 + .7 * (.5 + .5 * std::sin(s.id * 2.47));
  double reach = plant_reach(s) * stature;
  const int form = grass_form(s);
  bool depth_updated = false;
  for (std::size_t i = 0; i < s.organs.size(); ++i) {
    auto &o = s.organs[i];
    if (o.energy <= 1e-9)
      continue;
    double grown = std::clamp(o.energy / std::max(.001, o.target), 0., 1.),
           h = noise(s.id * 1.7 + i * 3.19),
           length =
               std::max(.8, (o.kind >= 2 ? std::min(45., reach * o.length) : reach * o.length) *
                                (.035 + .965 * grown));
    double buried_stalk = 0;
    Point root;
    if (o.parent < 0) {
      root = {s.a.x + o.attach * (s.b.x - s.a.x) + s.normal.x * std::max(.12, o.root),
              s.a.y + o.attach * (s.b.y - s.a.y) + s.normal.y * std::max(.12, o.root)};
      auto bed = sediment_edges(&s - vegetation_.surfaces.data());
      double cover = bed[0] + (bed[1] - bed[0]) * o.attach - o.root;
      const double front = sediment_front(root.x, root.y, s.a.x, s.a.y, s.b.x, s.b.y, s.normal.x,
                                          s.normal.y, bed[0], bed[1]);
      if (!depth_updated) {
        if (s.visual_depth < 0)
          s.visual_depth = front;
        depth_updated = true;
      }
      buried_stalk = form == 1 && o.kind == 1 ? std::max(0., cover) : 0;
      length += std::max(0., cover);
    } else {
      const auto &parent = s.organs[o.parent];
      if (parent.energy <= 1e-9) {
        o.curve.fill(parent.curve[3]);
        continue;
      }
      root = curve(parent.curve, o.attach);
    }
    auto flow = water_.velocity(root.x, root.y - length * .5);
    double speed = std::hypot(flow.x, flow.y), angle = 0;
    const double leaf_maturity =
        form == 1 ? (o.kind >= 2 ? o.elongation
                                 : (i + 1 < s.organs.size() ? s.organs[i + 1].elongation : 0.))
                  : 0;
    if (o.kind == 0)
      angle = (h - .5) * (grass_type(s) == 0 ? .65 + .55 * traits[2] : .18 + .24 * traits[2]);
    else if (o.kind == 1)
      angle = o.parent < 0 ? (form == 1 ? ((i / 2) % 2 ? 1. : -1.) * (.35 + 1.25 * leaf_maturity) *
                                              std::min(1.1, fan)
                                        : (h - .5) * .5)
                           : (h - .5) * .34;
    else if (form == 1) {
      const double side = (o.parent / 2) % 2 ? 1. : -1.;
      angle = side * (.22 + 1.24 * leaf_maturity) + (h - .5) * .14;
      length *= leafness * (.20 + .80 * std::sqrt(leaf_maturity));
    } else {
      int side = 0, leaves = 0;
      for (std::size_t k = std::size_t(o.parent + 1); k < s.organs.size(); ++k)
        if (s.organs[k].parent == o.parent && s.organs[k].kind >= 2) {
          ++leaves;
          side += k < i;
        }
      const bool alternate = grass_type(s) == 5 && leaves == 1;
      int node = 0;
      if (alternate)
        for (int k = 0; k <= o.parent; ++k)
          node += s.organs[k].kind == 1;
      angle = ((alternate ? node : side) % 2 ? 1. : -1.) * (.9 + .35 * h);
    }
    const double wave = std::sin(time * .045 * sway_rate - root.x * .026 + root.y * .009 +
                                 (o.kind == 0 ? i * .83 : 0)) +
                        .35 * std::sin(time * .071 - root.x * .013 + i * 1.71);
    angle += std::clamp(flow.x * .22 / std::sqrt(grass_fiber(s)), -.48, .48) + s.root_lean +
             (o.kind == 0 ? .11 : .025) * std::min(2., speed) * wave / std::sqrt(o.hardness);
    const double wilt = 1 - s.vitality;
    angle += wilt * (o.kind >= 2 ? (angle < 0 ? -1. : 1.) * .95 : .35);
    double dx = std::sin(angle) * (length - buried_stalk) + s.normal.x * buried_stalk,
           dy = -std::cos(angle) * (length - buried_stalk) + s.normal.y * buried_stalk,
           flutter = .018 * std::min(2., speed) * length *
                     std::sin(time * .035 + s.id * .41 + i * 1.3) / std::sqrt(o.hardness);
    const double arc = o.kind == 0 && grass_type(s) == 1
                           ? (h < .5 ? -1 : 1) * length * (.18 + .16 * h)
                           : (h - .5) * length *
                                 (o.kind == 0   ? .12
                                  : o.kind >= 2 ? .12 * curvature
                                                : .08);
    Point tip{root.x + dx, root.y + dy};
    Point initial =
        o.parent < 0
            ? (o.kind == 0 ? Point{s.normal.x * .26,
                                   -std::sqrt(std::max(0., 1 - s.normal.x * s.normal.x * .0676))}
                           : s.normal)
            : Point{std::sin(angle * .55), -std::cos(angle * .55)};
    o.curve = {root, Point{root.x + length * .26 * initial.x, root.y + length * .26 * initial.y},
               Point{root.x + dx * (.60 + .20 * traits[1]) + flutter + arc,
                     root.y + dy * (.60 + .20 * traits[1]) + wilt * length * .16},
               tip};
    if (form == 1 && o.kind >= 2) {
      const double side = (o.parent / 2) % 2 ? 1. : -1.,
                   maturity = std::clamp(leaf_maturity, 0., 1.),
                   span = length * (.25 + .75 * maturity),
                   rise = length * (.65 * (1 - maturity) + .08), drop = length * .10 * maturity;
      o.curve = {root,
                 {root.x + side * span * .30, root.y - rise},
                 {root.x + side * span * .78, root.y - rise * .60},
                 {root.x + side * span, root.y + drop - rise * .25}};
    }
    // Fish bodies part the plant: a control point inside a body moves out of it, the more
    // freely the farther it lies from the organ's base. Children follow their parent's curve.
    if (env_.foliage_yield > 0) {
      const double width = organ_width(o, length);
      body_grid_.nearby(root.x, root.y, length + width + indexed_body_radius_,
                        [&](std::uint32_t index) {
                          const auto &p = visible_[index];
                          if (p.kind != 1 || p.hidden || !p.hatched)
                            return;
                          for (int k = 1; k < 4; ++k) {
                            auto &q = o.curve[k];
                            const double dx = delta_x(q.x - p.x), dy = q.y - p.y,
                                         d = std::hypot(dx, dy), reach = p.radius + width;
                            if (d >= reach || d < 1e-9)
                              continue;
                            const double move = (reach - d) * env_.foliage_yield * k / 3;
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
    if (o.parent < 0 && o.energy > 0 && roots < 8)
      s.blades[roots++] = o.curve;
  if (roots) {
    s.blade = s.blades[0];
    for (int k = roots; k < 8; ++k)
      s.blades[k] = s.blades[0];
  }
  return bent;
}
void Field::reserve_canopy(const SurfacePatch &s, PlantGeometryCache &cache) {
  if (!cache.canopy_ready) {
    cache.canopy.clear();
    const int nx = int(std::ceil(geometry_.width / 6)), ny = int(std::ceil(geometry_.height / 6));
    for (const auto &o : s.organs)
      if (o.kind >= 2 && o.energy > 1e-9 && o.display_width > .45) {
        const auto &widths = sampled_profile(o.kind, 12);
        std::vector<std::size_t> cells;
        for (int k = 0; k < 12; ++k) {
          double t = (k + .5) / 12;
          auto q = curve(o.draw_curve, t);
          double r = o.display_width * widths[k];
          for (int y = std::max(0, int(std::floor((q.y - r) / 6)));
               y <= std::min(ny - 1, int(std::floor((q.y + r) / 6))); ++y)
            for (int x = int(std::floor((q.x - r) / 6)); x <= int(std::floor((q.x + r) / 6)); ++x) {
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
    if (cell.organ < s.organs.size() && s.organs[cell.organ].energy > 1e-9)
      ++lighting_.canopy_counts[cell.index];
}

void Field::index_organs(SurfacePatch &s, std::size_t patch) {
  for (std::size_t j = 0; j < s.organs.size(); ++j) {
    auto &o = s.organs[j];
    if (o.energy <= 1e-9)
      continue;
    double length = std::hypot(o.curve[3].x - o.curve[0].x, o.curve[3].y - o.curve[0].y),
           girth = organ_width(o, length);
    auto qcurve =
        patch < vegetation_.surfaces.size() ? o.curve : constrain(*this, o.curve, girth, o.kind);
    if (o.kind == 0 && o.elongation < 1) {
      for (int k = 1; k < 4; ++k) {
        qcurve[k].x = qcurve[0].x + (qcurve[k].x - qcurve[0].x) * o.elongation;
        qcurve[k].y = qcurve[0].y + (qcurve[k].y - qcurve[0].y) * o.elongation;
      }
      length *= o.elongation;
      girth *= .15 + .85 * std::sqrt(o.elongation);
    }
    int n = plant_sample_count(length, girth);
    if (!empty_area(*this, qcurve, girth))
      for (int k = 1; k <= 16; ++k) {
        double t = (k - .5) / 16, shape = profile(o.kind, t);
        auto q = curve(qcurve, t);
        if (shape <= 0 || free(q.x, q.y, girth * shape))
          continue;
        double lo = 0, hi = girth;
        for (int trial = 0; trial < 7; ++trial) {
          double mid = .5 * (lo + hi);
          if (free(q.x, q.y, mid * shape))
            lo = mid;
          else
            hi = mid;
        }
        girth = lo;
      }
    girth = std::max(.01, girth);
    if (o.kind >= 2 && !lighting_.canopy_counts.empty()) {
      const int nx = int(std::ceil(geometry_.width / 6)), ny = int(std::ceil(geometry_.height / 6));
      std::vector<std::size_t> cells;
      static const auto profiles = []() {
        std::array<std::array<double, 12>, 2> v{};
        for (int kind = 2; kind <= 3; ++kind)
          for (int k = 0; k < 12; ++k)
            v[kind - 2][k] = profile(kind, (k + .5) / 12);
        return v;
      }();
      std::array<Point, 12> points;
      for (int k = 0; k < 12; ++k)
        points[k] = curve(qcurve, (k + .5) / 12);
      auto occupied = [&](double w) {
        cells.clear();
        for (int k = 0; k < 12; ++k) {
          auto q = points[k];
          double r = w * profiles[o.kind - 2][k];
          for (int y = std::max(0, int(std::floor((q.y - r) / 6)));
               y <= std::min(ny - 1, int(std::floor((q.y + r) / 6))); ++y)
            for (int x = int(std::floor((q.x - r) / 6)); x <= int(std::floor((q.x + r) / 6)); ++x) {
              auto at = std::size_t(y * nx + (x % nx + nx) % nx);
              if (lighting_.canopy_counts[at] >= 4)
                return true;
              if (std::find(cells.begin(), cells.end(), at) == cells.end())
                cells.push_back(at);
            }
        }
        return false;
      };
      if (girth > .45 && !occupied(girth))
        for (auto at : cells)
          ++lighting_.canopy_counts[at];
    }
    o.display_width = girth;
    o.draw_curve = qcurve;
    o.tint = organ_tint(s, int(j));
    // Each organ is a bent stroke: one straight segment per 12–24 px of its curve (long blades
    // get more), with the organ's own width profile. A leaf gets segments about as long as it
    // is wide, so a round leaf is a single round stroke and a long one follows its outline.
    if (o.kind >= 2)
      n = std::clamp(int(std::ceil(length / std::max(.5, 2.5 * girth))), 1, 6);
    const auto &widths = sampled_profile(o.kind, n);
    auto from = curve(qcurve, 0);
    for (int k = 0; k < n; ++k) {
      const double t = (k + .5) / n;
      const auto to = curve(qcurve, double(k + 1) / n);
      PlantPart part{};
      part.x = wrap_x((from.x + to.x) * .5);
      part.y = (from.y + to.y) * .5;
      part.hx = (to.x - from.x) * .5;
      part.hy = (to.y - from.y) * .5;
      part.width =
          std::max(.08, girth * widths[k] * notched_width(o, t, time, env_.plant_notch_heal));
      part.radius = stroke_half_length(part) + part.width;
      part.energy = o.energy / n;
      part.patch = patch;
      part.kind = 5;
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
    if (p.kind != 5 || p.radius < .1)
      continue;
    const auto &s = plant_source_mut(p.patch);
    if (p.organ < 0 || std::size_t(p.organ) >= s.organs.size())
      continue;
    const auto &o = s.organs[p.organ];
    if (o.kind == 1)
      continue;
    // Canopy shading keeps its calibrated footprint per unit length of organ.
    const double spacing = 2 * stroke_half_length(p),
                 footprint = std::max(.08, std::hypot(p.width, stroke_half_length(p)));
    const double optical = (o.kind == 0 ? .22 : .85) * 2 * spacing * footprint / area,
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
void Field::cut_organ(std::size_t patch, int index, double t) {
  if (vegetation_.drifting_grass.size() >= 20000 || index < 0)
    return;
  auto &s = plant_source_mut(patch);
  if (std::size_t(index) >= s.organs.size())
    return;
  auto &cut = s.organs[index];
  t = std::clamp(t, 0., .9);
  if (cut.energy < .05 && std::none_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
        return o.parent == index && o.energy > .05;
      }))
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
      // The energy beyond the cut follows the organ's width profile, not just its length.
      double total = 0, beyond = 0;
      for (int k = 0; k < 64; ++k) {
        const double u = (k + .5) / 64, w = profile(o.kind, u);
        total += w;
        beyond += u > t ? w : 0;
      }
      const double share = total > 0 ? beyond / total : 1 - t;
      copy.energy *= share;
      copy.parent = -1;
      o.energy *= 1 - share;
      o.ready = time + 600;
      if (t > 0)
        o.length *= t;
      // Bite marks stay where they were: on the stump or on the drifting piece.
      for (auto &n : o.notches)
        n = n.at < t && t > 0 ? PlantNotch{n.at / t, n.depth, n.width / t, n.time} : PlantNotch{};
      for (auto &n : copy.notches)
        n = n.at > t && t < 1 ? PlantNotch{(n.at - t) / (1 - t), n.depth, n.width / (1 - t), n.time}
                              : PlantNotch{};
    } else {
      copy.parent = mapped[o.parent];
      o.energy = 0;
      o.ready = time + 600;
    }
    release_organ(copy, int(i) == index ? t : 0);
    mapped[i] = int(d.plant.organs.size());
    d.plant.organs.push_back(copy);
  }
  if (patch < vegetation_.plant_geometry_cache.size())
    vegetation_.plant_geometry_cache[patch].clear();
  d.plant.grass = mass(d.plant);
  if (d.plant.grass < .02)
    return;
  const double remaining = mass(s);
  s.grass_grazed += std::max(0., s.grass - remaining);
  s.grass = remaining;
  s.curve_time = ~std::uint64_t(0);
  d.plant.vitality = std::min(.9, s.vitality);
  d.plant.spin = .012 * (noise(d.id) - .5);
  d.x = wrap_x(d.plant.organs[0].curve[0].x);
  d.y = std::clamp(d.plant.organs[0].curve[0].y, .01, geometry_.height - .01);
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
      const double lifespan = env_.plant_lifespan * (.45 + 1.3 * noise(s.id * 17.831 + 4.73));
      const bool old = s.plant_age > lifespan;
      if (!old)
        bud_organs(*this, s);
      thread_local std::vector<unsigned char> leafy, living_stem;
      leafy.assign(s.organs.size(), 0);
      living_stem.assign(s.organs.size(), 0);
      for (std::size_t k = s.organs.size(); k--;) {
        const auto &o = s.organs[k];
        leafy[k] |= o.kind >= 2 && o.energy > .05;
        if (o.parent >= 0) {
          leafy[o.parent] |= leafy[k];
          living_stem[o.parent] |= o.kind == 1 && o.energy > .05;
        }
      }
      for (std::size_t k = s.organs.size(); k--;) {
        auto &o = s.organs[k];
        if (o.kind != 1 || o.energy <= .05)
          continue;
        if (leafy[k] || living_stem[k])
          o.bare_steps = 0;
        else if (++o.bare_steps >= 600) {
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
        if (o.kind == 0 || (grass_form(s) == 1 && o.kind >= 2)) {
          const double growth_time =
              o.kind == 0 ? 3600 + 3600 * grass_traits(s)[1] + 1200 * noise(s.id + k * 7.13)
                          : 2800 + 4800 * noise(s.id * 2.91 + k * 7.13);
          o.elongation = std::min(1., o.elongation + 1. / growth_time);
          if (o.elongation >= 1 && ++o.bare_steps > 2400 + 4800 * noise(s.id * 3.17 + k * 8.31)) {
            shape_organs(s);
            cut_organ(&s - vegetation_.surfaces.data(), int(k), 0);
            if (o.parent >= 0)
              s.organs[o.parent].bare_steps = 600;
            o.ready = time + std::uint64_t(1200 + 2400 * noise(s.id + k));
            o.elongation = .04;
            o.bare_steps = 0;
          }
        }
      }
      s.root_lean *= .992;
      double anchored = 0, root_mass = 0;
      auto edges = sediment_edges(&s - vegetation_.surfaces.data());
      double root = 0;
      int roots = 0;
      for (auto &o : s.organs)
        if (o.parent < 0 && o.energy > 0) {
          double depth = edges[0] + (edges[1] - edges[0]) * o.attach;
          anchored += o.energy * std::clamp((depth - o.root) / .6, 0., 1.);
          root_mass += o.energy;
          auto p = mix(s.a, s.b, o.attach);
          if (plant_light(light(p.x + s.normal.x * (depth + 1), p.y + s.normal.y * (depth + 1))) >
              0)
            o.root = std::clamp(
                o.root +
                    std::clamp(depth - grass_root_depth(s, depth, o.attach) - o.root, -.015, .03),
                .2 * depth, .8 * depth);
          // Animation advances with plant time, never while rebuilding a view or loading.
          if (!roots && s.visual_depth >= 0 &&
              s.id % plant_shape_period == time % plant_shape_period) {
            const double front =
                depth > .01 ? std::clamp(1 - std::max(.12, o.root) / depth, 0., 1.) : .5;
            s.visual_depth += std::clamp(front - s.visual_depth, -.02, .02);
          }
          root += o.root;
          ++roots;
        }
      if (root_mass > 0 && anchored < .25 * root_mass) {
        shape_organs(s);
        uproot(s);
      } else {
        auto center = mix(s.a, s.b, .5);
        bool lit = plant_light(light(center.x + s.normal.x * (soil_depth(s) + 1),
                                     center.y + s.normal.y * (soil_depth(s) + 1))) > 0;
        s.vitality = old   ? s.vitality * std::exp2(-1. / 240.)
                     : lit ? std::min(1., s.vitality + .005)
                           : s.vitality * std::exp2(-1. / 240.);
        if (roots)
          s.root_height = root / roots;
        if (s.vitality < .5 && time % 20 == 0) {
          for (std::size_t k = 0; k < s.organs.size(); ++k)
            if (s.organs[k].kind != 1 && s.organs[k].energy > .05) {
              cut_organ(&s - vegetation_.surfaces.data(), int(k), 0);
              break;
            }
        }
        if (s.vitality < .08)
          uproot(s);
      }
    }
}
void Field::advance_drifting_grass(DriftingGrass &d, std::vector<DriftingGrass> &shed) {

  prepare_organs(d.plant, true);
  auto &p = d.plant;
  if (p.organs.empty())
    return;
  // Wrap the whole plant together. Wrapping each point distorts long organs at the seam.
  const double origin = p.organs[0].curve[0].x, wrap_shift = d.x + delta_x(origin - d.x) - origin;
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
  flow.x += wake.x * .35;
  flow.y += wake.y * .35;
  bool leaf = std::none_of(p.organs.begin(), p.organs.end(),
                           [](const auto &o) { return o.kind < 2 && o.energy > .05; });
  double material =
             leaf ? -2.5 + 4 * (1 - std::exp2(-double(d.age) / 350)) : 4 + 2 * (1 - p.vitality),
         drag = leaf ? .218592 : .123552;
  auto drift = drift_velocity({d.vx, d.vy}, flow, material, drag);
  d.vx = drift.x;
  d.vy = drift.y;
  // A fish swimming into drifting plant matter shoves it along and aside.
  if (env_.foliage_yield > 0) {
    const auto &axis = p.organs[0].curve;
    const double cx = d.x + delta_x(axis[3].x - axis[0].x) * .5,
                 cy = d.y + (axis[3].y - axis[0].y) * .5,
                 half = .5 * std::hypot(axis[3].x - axis[0].x, axis[3].y - axis[0].y);
    body_grid_.nearby(cx, cy, half + indexed_body_radius_, [&](std::uint32_t index) {
      const auto &q = visible_[index];
      if (q.kind != 1 || q.hidden || !q.hatched)
        return;
      const double dx = delta_x(cx - q.x), dy = cy - q.y, gap = std::hypot(dx, dy),
                   reach = q.radius + half;
      if (gap >= reach)
        return;
      const double share = env_.foliage_yield * (1 - gap / reach);
      d.vx += share * (q.flow_x - d.vx) + (gap > 1e-9 ? .05 * share * dx / gap : 0);
      d.vy += share * (q.flow_y - d.vy) + (gap > 1e-9 ? .05 * share * dy / gap : 0);
    });
  }
  auto slowed = sediment_velocity({d.vx, d.vy}, d.x, d.y, .4);
  d.vx = slowed.x;
  d.vy = slowed.y;
  const auto axis = p.organs[0].curve;
  double length = std::max(1., std::hypot(axis[3].x - axis[0].x, axis[3].y - axis[0].y)),
         ux = (axis[3].x - axis[0].x) / length, uy = (axis[3].y - axis[0].y) / length;
  auto tip_flow = water_.velocity(axis[3].x, axis[3].y);
  double torque = (ux * (tip_flow.y - flow.y) - uy * (tip_flow.x - flow.x)) / length +
                  .08 * (ux * (flow.y - d.vy) - uy * (flow.x - d.vx));
  p.spin = std::clamp(.95248 * p.spin + .0152064 * torque, -.03, .03);
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
        Point tangent{from.x + side * .35, from.y + .1};
        if (allowed(tangent))
          return tangent;
      }
    }
    return from;
  };
  auto root = slide({d.x, d.y}, {d.x + dx, d.y + dy}, .3);
  dx = delta_x(root.x - d.x);
  dy = root.y - d.y;
  d.vx = dx;
  d.vy = dy;
  for (std::size_t j = 0; j < p.organs.size(); ++j) {
    auto &o = p.organs[j];
    const auto previous = o.curve;
    double amplitude = std::min(
               1.8, (.008 + .018 * (1 - p.vitality)) *
                        std::hypot(o.curve[3].x - o.curve[0].x, o.curve[3].y - o.curve[0].y) *
                        std::min(2., std::hypot(flow.x, flow.y) + std::hypot(wake.x, wake.y))),
           flutter = (std::sin((d.age + 1) * .065 + j * 2.1 + d.id) -
                      std::sin(d.age * .065 + j * 2.1 + d.id)) *
                     amplitude;
    for (int k = 0; k < 4; ++k) {
      auto &q = o.curve[k];
      double x = q.x - d.x, y = q.y - d.y;
      Point next{d.x + dx + co * x - si * y, d.y + dy + si * x + co * y};
      if (o.kind >= 2 && (k == 1 || k == 2)) {
        next.x += uy * flutter * (k == 1 ? 1 : -1);
        next.y -= ux * flutter * (k == 1 ? 1 : -1);
      }
      auto v = sediment_velocity({delta_x(next.x - q.x) - dx, next.y - q.y - dy}, q.x, q.y, .1);
      q = slide(q, {q.x + dx + v.x, q.y + dy + v.y}, .08);
    }
    const double length = curve_length(o.curve);
    if (length > o.loose_length * 1.015) {
      const auto anchor = o.curve[0];
      const double scale = o.loose_length / length;
      for (int k = 1; k < 4; ++k) {
        o.curve[k].x = anchor.x + scale * (o.curve[k].x - anchor.x);
        o.curve[k].y = anchor.y + scale * (o.curve[k].y - anchor.y);
      }
      bool valid = true;
      for (int k = 0; k < 4; ++k)
        valid &= free(o.curve[k].x, o.curve[k].y, .08);
      if (!valid)
        o.curve = previous;
    }
    const double lost = o.energy * -std::expm1(-std::log(2.) / env_.decay_half_life);
    o.energy -= lost;
    deposit_detritus(o.curve[0].x, o.curve[0].y, lost);
  }
  p.vitality *= std::exp2(-1. / 110.);
  p.grass = mass(p);
  d.x = wrap_x(p.organs[0].curve[0].x);
  d.y = std::clamp(p.organs[0].curve[0].y, .01, geometry_.height - .01);
  double shift = d.x - p.organs[0].curve[0].x;
  for (auto &o : p.organs) {
    for (auto &q : o.curve)
      q.x += shift;
    // Keep the release geometry current when a leaf falls before the next indexing pass.
    o.draw_curve = o.curve;
  }
  p.blade = p.organs[0].curve;
  p.blades.fill(p.blade);
  p.a = {d.x - p.length * .5, d.y};
  p.b = {d.x + p.length * .5, d.y};
  ++d.age;
  if (!p.organs.empty() && p.organs[0].kind == 1 && d.age % 24 == d.id % 24 &&
      curve_length(p.organs[0].curve) > 28 &&
      vegetation_.drifting_grass.size() + shed.size() < 20000) {
    const double t = std::clamp(20. / curve_length(p.organs[0].curve), .2, .8);
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
    lower.x = wrap_x(lower.plant.blade[0].x);
    lower.y = lower.plant.blade[0].y;
    lower.vx = d.vx;
    lower.vy = d.vy;
    lower.plant.spin = -.6 * p.spin;
    shed.push_back(std::move(lower));
    p.blade = p.organs[0].curve;
    p.blades.fill(p.blade);
    d.x = wrap_x(p.blade[0].x);
    d.y = p.blade[0].y;
  }
  if (p.vitality < .68 && d.age % 12 == 0 && p.organs.size() > 1 &&
      vegetation_.drifting_grass.size() + shed.size() < 20000) {
    for (auto &o : p.organs)
      if (o.kind >= 2 && o.parent >= 0 && o.energy > .05) {
        DriftingGrass f;
        f.id = vegetation_.next_surface_id++;
        f.root_contact = -1;
        f.plant = p;
        f.plant.organs = {o};
        f.plant.organs[0].parent = -1;
        release_organ(f.plant.organs[0]);
        f.plant.grass = o.energy;
        f.plant.spin = p.spin + .012 * (noise(f.id) - .5);
        const auto &released = f.plant.organs[0].curve;
        f.x = wrap_x(released[0].x);
        f.y = std::clamp(released[0].y, .01, geometry_.height - .01);
        f.vx = d.vx;
        f.vy = d.vy - .02;
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

  if (d.root_contact < 0 || d.plant.vitality < .25)
    return;
  std::size_t support = vegetation_.surfaces.size();
  double best = 1e9;
  vegetation_.surface_grid.nearby(
      d.x, d.y, sediment_.max_sediment_depth + 20, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.stump || grass_capacity(s) < env_.seed_energy || !room_for_plant(s))
          return;
        double dx = delta_x(d.x - s.a.x), dy = d.y - s.a.y,
               t = (dx * (s.b.x - s.a.x) + dy * (s.b.y - s.a.y)) / (s.length * s.length),
               gap = dx * s.normal.x + dy * s.normal.y;
        auto edges = sediment_edges(i);
        double depth = edges[0] + (edges[1] - edges[0]) * std::clamp(t, 0., 1.);
        if (t >= 0 && t <= 1 && gap >= 0 && gap < depth - .1 && depth - gap < best) {
          best = depth - gap;
          support = i;
        }
      });
  if (support == vegetation_.surfaces.size() || std::hypot(d.vx, d.vy) > .35) {
    d.root_contact = std::max(0, d.root_contact - 2);
    return;
  }
  auto &soil = vegetation_.surfaces[support];
  if (d.contact_surface != soil.id) {
    d.contact_surface = soil.id;
    d.root_contact = 0;
  }
  if (++d.root_contact < 60)
    return;
  soil.stump = true;
  soil.grass_traits = grass_traits(d.plant);
  soil.grass = d.plant.grass;
  soil.organs = d.plant.organs;
  const double reach = plant_reach(soil) * (.72 + .56 * (.5 + .5 * std::sin(soil.id * 8.31)));
  const auto soil_edges = sediment_edges(support);
  for (auto &o : soil.organs) {
    o.target = std::max(.000001, o.energy);
    const double physical_length = curve_length(o.curve), grown = 1.,
                 leafness = o.kind >= 2 ? .75 + .5 * (.5 + .5 * std::sin(soil.id * 9.23)) : 1.;
    double cover = 0;
    if (o.parent < 0) {
      o.attach = std::clamp((delta_x(o.curve[0].x - soil.a.x) * (soil.b.x - soil.a.x) +
                             (o.curve[0].y - soil.a.y) * (soil.b.y - soil.a.y)) /
                                (soil.length * soil.length),
                            0., 1.);
      o.root = std::max(.12, delta_x(o.curve[0].x - soil.a.x) * soil.normal.x +
                                 (o.curve[0].y - soil.a.y) * soil.normal.y);
      cover = std::max(0., soil_edges[0] + (soil_edges[1] - soil_edges[0]) * o.attach - o.root);
    }
    o.length = std::max(.001, (physical_length / leafness - cover) / std::max(.001, reach * grown));
    o.elongation = 1;
    o.loose_length = 0;
    // loose_width is the inherited material width, also used by rooted rendering.
  }
  soil.vitality = d.plant.vitality;
  soil.spin = 0;
  soil.root_height = std::max(0., soil_depth(soil) - grass_root_depth(soil));
  auto root = d.plant.blade[0], tip = d.plant.blade[3];
  soil.root_lean = std::remainder(std::atan2(tip.y - root.y, tip.x - root.x) + PI * .5, 2 * PI);
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
void Field::refresh_algae_exposure() {
  bool cleared = false;
  for (auto &s : vegetation_.surfaces)
    if (s.sediment > 0 && sediment_depth(s) < .25) {
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
                   // Accumulate changes against the last rebuilt geometry, with a
                   // tenth-pixel tolerance. Covering/uncovering remains immediate.
                   return (amount > 1e-9) == (s.sediment > 1e-9) &&
                          std::abs(sediment_depth(amount - s.sediment, s.length)) < .1;
                 }))
    return;
  cache.clear();
  cache.reserve(vegetation_.surfaces.size());
  for (const auto &s : vegetation_.surfaces)
    cache.push_back(s.sediment);
  vegetation_.algae_exposure_geometry = environment_signature;
  double reach = 16;
  for (const auto &p : vegetation_.surfaces)
    reach = std::max(reach, 16 + sediment_depth(p) + 1.5);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    s.algae_open = {0, 1};
    // Clip against the actual bed profile, including this patch, so a tapered
    // layer can leave part of the rock exposed.
    const Point a{s.a.x + .03 * s.normal.x, s.a.y + .03 * s.normal.y};
    const double dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    vegetation_.surface_grid.nearby(
        (s.a.x + s.b.x) * .5, (s.a.y + s.b.y) * .5, reach + s.length * .5, [&](std::uint32_t j) {
          const auto &bed = vegetation_.surfaces[j];
          if (bed.normal.y > -.5)
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
            if (std::abs(rate) < 1e-12)
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
    if (s.algae_open[1] - s.algae_open[0] < 1e-9)
      s.algae_open = {0, 0};
  }
}
void Field::settle_plant_geometry(const std::vector<double> &bed_before, bool grazed) {
  refresh_algae_exposure();
  // Stirring changes cloud light even when no vegetation_ was bitten. Tiny shoots can also change
  // their exposed length.
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i)
    if (vegetation_.surfaces[i].sediment != bed_before[i]) {
      for (int offset = -2; offset <= 2; ++offset) {
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
            const double base = std::max(
                .8, (o.kind >= 2 ? std::min(45., reach * o.length) : reach * o.length) *
                        (.035 + .965 * std::clamp(o.energy / std::max(.001, o.target), 0., 1.)));
            if (base >= 5.3)
              continue;
            const auto old = sediment_edges(j, &bed_before);
            const auto now = sediment_edges(j);
            auto exposed = [&](const auto &edges) {
              double cover = edges[0] + (edges[1] - edges[0]) * o.attach - o.root;
              return std::max(base, cover >= 0 && cover <= 3.5 ? cover + 1.8 : 0.);
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
  if (part.kind != 4 || !std::isfinite(amount) || amount < 0 ||
      amount > std::min(part.energy, source.algae))
    throw std::invalid_argument("invalid algae portion");
  source.algae -= amount;
  source.algae_grazed += amount;
  part.energy -= amount;
}

}
