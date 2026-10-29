#include "environment.hh"
#include "physiology.hh"
#include "sight.hh"
#include "parallel.hh"
#include <limits>
#include <numeric>
#include <cstring>
namespace fishsim {
namespace {
constexpr double INF = std::numeric_limits<double>::infinity();
double segment_distance(double x, double y, Point a, Point b) {
  double dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy,
         t = l > 0 ? std::clamp(((x - a.x) * dx + (y - a.y) * dy) / l, 0., 1.) : 0;
  return std::hypot(x - a.x - t * dx, y - a.y - t * dy);
}
bool inside(double x, double y, const std::vector<Point> &p) {
  bool c = false;
  for (std::size_t i = 0, j = p.size() - 1; i < p.size(); j = i++)
    if ((p[i].y > y) != (p[j].y > y) &&
        x < (p[j].x - p[i].x) * (y - p[i].y) / (p[j].y - p[i].y) + p[i].x)
      c = !c;
  return c;
}
std::array<double, 4> bounds(const Obstacle &o) {
  std::array<double, 4> b{o.x - o.radius, o.x + o.radius, o.y - o.radius, o.y + o.radius};
  if (!o.vertices.empty()) {
    b = {o.vertices[0].x, o.vertices[0].x, o.vertices[0].y, o.vertices[0].y};
    for (auto p : o.vertices) {
      b[0] = std::min(b[0], p.x);
      b[1] = std::max(b[1], p.x);
      b[2] = std::min(b[2], p.y);
      b[3] = std::max(b[3], p.y);
    }
  }
  return b;
}
double ray_circle(double x, double y, double ux, double uy, double cx, double cy, double radius) {
  double dx = cx - x, dy = cy - y, along = dx * ux + dy * uy,
         disc = radius * radius - (dx * dx + dy * dy - along * along);
  if (dx * dx + dy * dy <= radius * radius)
    return 0;
  if (disc < 0)
    return INF;
  double t = along - std::sqrt(disc);
  return t >= 0 ? t : INF;
}
double ray_edge(double x, double y, double ux, double uy, Point a, Point b, double margin,
                const Segment *cached = nullptr) {
  double dx = b.x - a.x, dy = b.y - a.y, l = cached ? cached->length : std::hypot(dx, dy);
  if (l == 0)
    return ray_circle(x, y, ux, uy, a.x, a.y, margin);
  double result = INF;
  double tx = cached ? cached->tx : dx / l, ty = cached ? cached->ty : dy / l, nx = -ty, ny = tx,
         dot = ux * nx + uy * ny;
  if (std::abs(dot) > 1e-12)
    for (double sign : {-1., 1.}) {
      double t = ((a.x - x) * nx + (a.y - y) * ny + sign * margin) / dot,
             along = (x + t * ux - a.x) * tx + (y + t * uy - a.y) * ty;
      if (t >= 0 && along >= 0 && along <= l)
        result = std::min(result, t);
    }
  if (margin > 0) {
    result = std::min(result, ray_circle(x, y, ux, uy, a.x, a.y, margin));
    result = std::min(result, ray_circle(x, y, ux, uy, b.x, b.y, margin));
  }
  return result;
}
}
void SightMedium::prepare(const Field &field, double px, double py) {
  world = &field;
  x = px;
  y = py;
  beds.clear();
  plants.clear();
  for (auto &ray : dust_integrals)
    ray.clear();
  for (auto &bin : plant_angles)
    bin.clear();
  // Bilinear samples can only use these cells inside the observation radius.
  dusty = false;
  auto check_grid = [&](const auto &energy, int nx, int ny) {
    if (dusty || energy.empty())
      return;
    const double dx = field.geometry().width / nx, dy = field.geometry().height / ny;
    // Omitting both very dilute fields changes transmission by at most 0.1%.
    // Tiny advected tails otherwise make an almost clear tank pay for every ray.
    const double negligible = -std::log2(.999) * .5 * field.env().sediment_path * dx * dy /
                              (optical_density_scale * field.env().vision_range);
    const int left = int(std::floor((x - field.env().vision_range) / dx - .5)) - 1,
              right = int(std::floor((x + field.env().vision_range) / dx - .5)) + 2,
              top = std::clamp(int(std::floor((y - field.env().vision_range) / dy - .5)) - 1, 0,
                               ny - 1),
              bottom = std::clamp(int(std::floor((y + field.env().vision_range) / dy - .5)) + 2, 0,
                                  ny - 1);
    for (int j = top; j <= bottom && !dusty; ++j)
      for (int i = left; i <= right; ++i)
        if (energy[j * nx + (i % nx + nx) % nx] > negligible) {
          dusty = true;
          break;
        }
  };
  check_grid(field.sediment().suspended, field.sediment().columns, field.sediment().rows);
  if (field.food_web().plankton.nonempty)
    check_grid(field.food_web().plankton.energy, field.food_web().plankton.columns,
               field.food_web().plankton.rows);
  if (field.sediment().max_sediment_depth > 0)
    field.vegetation().surface_grid.nearby(
        x, y, field.env().vision_range + field.sediment().max_sediment_depth + 16,
        [&](std::uint32_t i) {
          const auto &s = field.vegetation().surfaces[i];
          if (s.normal.y > -.5)
            return;
          auto e = field.sediment_edges(i);
          if (e[0] <= 0 && e[1] <= 0)
            return;
          const double px = field.delta_x(x - s.a.x), py = y - s.a.y, sx = s.b.x - s.a.x,
                       sy = s.b.y - s.a.y, length2 = s.length * s.length,
                       t = (px * sx + py * sy) / length2, gap = px * s.normal.x + py * s.normal.y;
          beds.push_back({sx, sy, length2, s.normal.x, s.normal.y, t, gap,
                          e[0] + (e[1] - e[0]) * t - gap, e[1] - e[0]});
        });
  field.vegetation().plant_grid.nearby(
      x, y, field.env().vision_range + field.vegetation().indexed_plant_radius,
      [&](std::uint32_t i) {
        const auto &p = field.vegetation().plants[i];
        if (p.kind == 5) {
          const double dx = field.delta_x(p.x - x), dy = p.y - y,
                       reach = field.env().vision_range + p.radius;
          if (dx * dx + dy * dy <= reach * reach)
            plants.push_back(
                {dx, dy, p.hx, p.hy, stroke_width(p), p.radius, field.foliage_depth(p.organ_kind)});
        }
      });
  // Group nearby foliage by bearing once for the observer.
  const int bins = int(plant_angles.size());
  const double scale = bins / (2 * PI);
  for (std::size_t i = 0; i < plants.size(); ++i) {
    const auto &p = plants[i];
    const double distance = std::hypot(p.x, p.y), radius = p.radius + 1e-8;
    int first = 0, last = bins - 1;
    if (distance > radius) {
      const double angle = std::atan2(p.y, p.x), half = std::asin(radius / distance);
      first = int(std::floor((angle - half + PI) * scale)) - 1;
      last = int(std::floor((angle + half + PI) * scale)) + 1;
      if (last - first >= bins) {
        first = 0;
        last = bins - 1;
      }
    }
    for (int bin = first; bin <= last; ++bin)
      plant_angles[(bin % bins + bins) % bins].push_back(i);
  }
}
std::array<double, 4> SightMedium::transmission(double tx, double ty) const {
  const double dx = world->delta_x(tx - x), dy = ty - y, d = std::hypot(dx, dy);
  if (d < 1e-12)
    return {1, 1, 1, 1};
  double integral = 0;
  if (dusty || d > world->env().vision_range) {
    const double bearing = (std::atan2(dy, dx) + PI) * dust_integrals.size() / (2 * PI),
                 radial = d / optical_sample_spacing;
    const int first = int(std::floor(bearing)), at = int(std::floor(radial));
    static const auto directions = [] {
      std::array<Point, 64> result{};
      for (std::size_t k = 0; k < result.size(); ++k) {
        const double a = k * 2 * PI / result.size() - PI;
        result[k] = {std::cos(a), std::sin(a)};
      }
      return result;
    }();
    auto integrate = [&](int direction) {
      const auto k = std::size_t(direction) % dust_integrals.size();
      auto &values = dust_integrals[k];
      if (values.empty())
        values.push_back(0);
      while (values.size() <= std::size_t(at + 1)) {
        const double radius = (values.size() - .5) * optical_sample_spacing;
        values.push_back(values.back() +
                         optical_sample_spacing *
                             world->optical_turbidity(x + directions[k].x * radius,
                                                      y + directions[k].y * radius));
      }
      return values[at] + (radial - at) * (values[at + 1] - values[at]);
    };
    const double a = integrate(first), b = integrate(first + 1);
    integral = a + (bearing - first) * (b - a);
  }
  for (const auto &b : beds) {
    double dt = (dx * b.sx + dy * b.sy) / b.length2, dg = dx * b.nx + dy * b.ny, lo = 0, hi = 1;
    auto clip = [&](double a, double v) {
      if (std::abs(v) < 1e-12)
        return a >= 0;
      double crossing = -a / v;
      if (v > 0)
        lo = std::max(lo, crossing);
      else
        hi = std::min(hi, crossing);
      return hi > lo;
    };
    if (clip(b.t, dt) && clip(1 - b.t, -dt) && clip(b.gap, dg) && clip(b.cover, b.slope * dt - dg))
      integral += optical_density_scale * d * std::max(0., hi - lo);
  }
  std::array<double, 3> foliage{};
  const int bin = std::clamp(int((std::atan2(dy, dx) + PI) * plant_angles.size() / (2 * PI)), 0,
                             int(plant_angles.size()) - 1);
  for (auto i : plant_angles[bin]) {
    const auto &p = plants[i];
    // A stroke containing the target point is the target itself; its own opacity is its colour.
    if (stroke_distance(p.hx, p.hy, p.width, dx - p.x, dy - p.y) <= 0)
      continue;
    const double crossing = stroke_optical_depth(p.x, p.y, p.hx, p.hy, p.width, 1, dx, dy);
    for (int c = 0; c < 3 && crossing > 0; ++c)
      foliage[c] += crossing * p.depth[c];
  }
  return {std::exp2(-integral / world->env().sediment_path), std::exp2(-foliage[0]),
          std::exp2(-foliage[1]), std::exp2(-foliage[2])};
}
void SightFilter::prepare(const Field &field, double px, double py) {
  world = &field;
  x = px;
  y = py;
  last_x = last_y = INF;
}
const Field::SpermOptics &SightFilter::optics(double tx, double ty) const {
  if (tx != last_x || ty != last_y) {
    last_optics = world->sperm_optics(x, y, tx, ty);
    last_x = tx;
    last_y = ty;
  }
  return last_optics;
}
std::array<double, 3> SightFilter::apply(double tx, double ty, std::array<double, 3> color) const {
  const auto &q = optics(tx, ty);
  for (int c = 0; c < 3; ++c)
    color[c] *= q.transmission[c];
  return color;
}
std::array<double, 3> SightFilter::scatter(double tx, double ty, double strength) const {
  if (strength <= 0)
    return {};
  auto out = optics(tx, ty).scattering;
  for (auto &c : out)
    c *= strength;
  return out;
}
void SightRays::prepare(const Field &world, double x, double py, bool sediment) {
  reach = world.env().vision_range;
  x = world.wrap_x(x);
  y = py;
  height = world.geometry().height;
  inside = false;
  edges.clear();
  circles.clear();
  for (const auto &o : world.geometry().obstacles) {
    double left = o.x - o.radius, right = o.x + o.radius, top = o.y - o.radius,
           bottom = o.y + o.radius;
    if (!o.vertices.empty()) {
      left = right = o.vertices[0].x;
      top = bottom = o.vertices[0].y;
      for (const auto &p : o.vertices) {
        left = std::min(left, p.x);
        right = std::max(right, p.x);
        top = std::min(top, p.y);
        bottom = std::max(bottom, p.y);
      }
    }
    if (py + reach < top || py - reach > bottom)
      continue;
    const int first = int(std::ceil((x - reach - right) / world.geometry().width)),
              last = int(std::floor((x + reach - left) / world.geometry().width));
    for (int image = first; image <= last; ++image) {
      const double px = x - image * world.geometry().width;
      if (o.vertices.empty()) {
        circles.push_back({o.x - px, o.y - py, o.radius});
        if (std::hypot(px - o.x, py - o.y) <= o.radius)
          inside = true;
      } else {
        if (fishsim::inside(px, py, o.vertices))
          inside = true;
        for (std::size_t i = 0; i < o.vertices.size(); ++i) {
          auto a = o.vertices[i], b = o.vertices[(i + 1) % o.vertices.size()];
          if (segment_distance(px, py, a, b) > reach)
            continue;
          double dx = b.x - a.x, dy = b.y - a.y, length = std::hypot(dx, dy);
          edges.push_back(
              {px, py, {a, b, length, length ? dx / length : 0, length ? dy / length : 0}});
        }
      }
    }
  }
  if (sediment && world.sediment().max_sediment_depth > 0)
    world.vegetation().surface_grid.nearby(
        x, py, reach + world.sediment().max_sediment_depth + 16, [&](std::uint32_t i) {
          const auto &s = world.vegetation().surfaces[i];
          if (s.normal.y > -.5)
            return;
          auto depth = world.sediment_edges(i);
          if (depth[0] <= 0 && depth[1] <= 0)
            return;
          Point a{s.a.x + s.normal.x * depth[0], s.a.y + s.normal.y * depth[0]},
              b{s.b.x + s.normal.x * depth[1], s.b.y + s.normal.y * depth[1]};
          double px = a.x + world.delta_x(x - a.x), dx = b.x - a.x, dy = b.y - a.y,
                 length = std::hypot(dx, dy);
          if (segment_distance(px, py, a, b) <= reach)
            edges.push_back(
                {px, py, {a, b, length, length ? dx / length : 0, length ? dy / length : 0}});
        });
}
double SightRays::cast(double ux, double uy) const {
  double vertical = uy > 1e-12 ? (height - y) / uy : uy < -1e-12 ? -y / uy : INF;
  vertical = std::max(0., vertical);
  if (inside)
    return 0;
  double hit = std::min(vertical, reach);
  for (const auto &c : circles)
    hit = std::min(hit, ray_circle(0, 0, ux, uy, c.x, c.y, c.radius));
  for (const auto &e : edges) {
    const auto &s = e.segment;
    if (s.length == 0)
      continue;
    const double ca = (s.a.x - e.x) * uy - (s.a.y - e.y) * ux,
                 cb = (s.b.x - e.x) * uy - (s.b.y - e.y) * ux;
    if ((ca > 0 && cb > 0) || (ca < 0 && cb < 0))
      continue;
    double dot = -ux * s.ty + uy * s.tx;
    if (std::abs(dot) <= 1e-12)
      continue;
    double t = ((s.a.x - e.x) * -s.ty + (s.a.y - e.y) * s.tx) / dot;
    if (t >= 0 && t < hit) {
      double along = (e.x + t * ux - s.a.x) * s.tx + (e.y + t * uy - s.a.y) * s.ty;
      if (along >= 0 && along <= s.length)
        hit = t;
    }
  }
  return hit < std::min(vertical, reach) ? hit : vertical;
}
void SpatialGrid::reset(double w, double h) {
  width = w;
  columns = int(std::ceil(w / cell));
  rows = int(std::ceil(h / cell));
  bins.resize(columns * rows);
  for (auto &bin : bins)
    bin.clear();
}
void SpatialGrid::add(double x, double y, std::uint32_t id) {
  x -= width * std::floor(x / width);
  int i = std::clamp(int(x / cell), 0, columns - 1), j = std::clamp(int(y / cell), 0, rows - 1);
  bins[j * columns + i].push_back(id);
}
void SpatialGrid::relocate(double ox, double oy, double x, double y, std::uint32_t index) {
  if (columns == 0)
    return;
  auto cell_at = [&](double px, double py) {
    px -= width * std::floor(px / width);
    return std::clamp(int(py / cell), 0, rows - 1) * columns +
           std::clamp(int(px / cell), 0, columns - 1);
  };
  int before = cell_at(ox, oy), after = cell_at(x, y);
  if (before == after)
    return;
  auto &bin = bins[before];
  auto at = std::find(bin.begin(), bin.end(), index);
  if (at != bin.end()) {
    *at = bin.back();
    bin.pop_back();
  }
  bins[after].push_back(index);
}
void Field::index(const std::vector<VisibleBody> &bodies, bool rebuild_plants) {
  if (rebuild_plants)
    index_plants();
  index_geometry();
  feeding_.grid.reset(geometry_.width, geometry_.height);
  body_grid_.reset(geometry_.width, geometry_.height);
  visible_ = bodies;
  indexed_body_radius_ = MAX_BODY_RADIUS;
  for (const auto &p : visible_)
    indexed_body_radius_ = std::max(indexed_body_radius_, p.radius);
  feeding_.consumed.assign(feeding_.pieces.size(), 0);
  feeding_.indexed_food_radius = 0;
  for (std::size_t i = 0; i < feeding_.pieces.size(); ++i) {
    feeding_.grid.add(feeding_.pieces[i].x, feeding_.pieces[i].y, std::uint32_t(i));
    feeding_.indexed_food_radius =
        std::max(feeding_.indexed_food_radius, food_radius(feeding_.pieces[i]));
  }
  for (std::size_t i = 0; i < visible_.size(); ++i)
    body_grid_.add(visible_[i].x, visible_[i].y, std::uint32_t(i));
  indexed_ = true;
}
void Field::compact_food() {
  if (indexed_) {
    std::size_t dst = 0;
    for (std::size_t i = 0; i < feeding_.pieces.size(); ++i)
      if (!feeding_.consumed[i])
        feeding_.pieces[dst++] = feeding_.pieces[i];
    feeding_.pieces.resize(dst);
  }
  indexed_ = false;
}
void Field::index_geometry() {
  if (geometry_.shape_grid.columns > 0 && geometry_.shape_grid.width == geometry_.width &&
      geometry_.indexed_shapes == geometry_.obstacles.size())
    return;
  geometry_.shape_grid.reset(geometry_.width, geometry_.height);
  geometry_.indexed_shapes = geometry_.obstacles.size();
  for (std::size_t id = 0; id < geometry_.obstacles.size(); ++id) {
    const auto &o = geometry_.obstacles[id];
    o.segments.clear();
    for (std::size_t i = 0; i < o.vertices.size(); ++i) {
      auto a = o.vertices[i], b = o.vertices[(i + 1) % o.vertices.size()];
      double dx = b.x - a.x, dy = b.y - a.y, length = std::hypot(dx, dy);
      o.segments.push_back({a, b, length, length ? dx / length : 0, length ? dy / length : 0});
    }
    double left = o.x - o.radius - 8, right = o.x + o.radius + 8, top = o.y - o.radius - 8,
           bottom = o.y + o.radius + 8;
    if (!o.vertices.empty()) {
      left = right = o.vertices[0].x;
      top = bottom = o.vertices[0].y;
      for (const auto &p : o.vertices) {
        left = std::min(left, p.x);
        right = std::max(right, p.x);
        top = std::min(top, p.y);
        bottom = std::max(bottom, p.y);
      }
      left -= 8;
      right += 8;
      top -= 8;
      bottom += 8;
    }
    if (bottom < 0 || top > geometry_.height)
      continue;
    for (int shift = int(std::ceil(-right / geometry_.width));
         shift <= int(std::floor((geometry_.width - left) / geometry_.width)); ++shift) {
      double l = left + shift * geometry_.width, r = right + shift * geometry_.width;
      for (int j = std::max(0, int(std::floor(top / geometry_.shape_grid.cell)));
           j <= std::min(geometry_.shape_grid.rows - 1,
                         int(std::floor(bottom / geometry_.shape_grid.cell)));
           ++j)
        for (int i = std::max(0, int(std::floor(l / geometry_.shape_grid.cell)));
             i <= std::min(geometry_.shape_grid.columns - 1,
                           int(std::floor(r / geometry_.shape_grid.cell)));
             ++i)
          geometry_.shape_grid.bins[j * geometry_.shape_grid.columns + i].push_back(
              std::uint32_t(id));
    }
  }
}
bool Field::overlaps(const Obstacle &o, double x, double y, double margin) const {
  const auto box = bounds(o);
  const double padding = std::max(0., margin) + 1e-9;
  if (y < box[2] - padding || y > box[3] + padding)
    return false;
  x = o.x + delta_x(x - o.x);
  for (double px : {x - geometry_.width, x, x + geometry_.width}) {
    if (px < box[0] - padding || px > box[1] + padding)
      continue;
    if (o.vertices.empty()) {
      if (std::hypot(px - o.x, y - o.y) <= o.radius + margin)
        return true;
    } else {
      if (inside(px, y, o.vertices))
        return true;
      for (std::size_t j = 0; j < o.vertices.size(); ++j)
        if (segment_distance(px, y, o.vertices[j], o.vertices[(j + 1) % o.vertices.size()]) <=
            margin)
          return true;
    }
  }
  return false;
}
bool Field::free(double x, double y, double margin) const {
  x = wrap_x(x);
  if (y < margin || y > geometry_.height - margin)
    return false;
  bool result = true;
  auto test = [&](std::uint32_t i) {
    if (result && overlaps(geometry_.obstacles[i], x, y, margin))
      result = false;
  };
  if (geometry_.shape_grid.columns > 0 && geometry_.indexed_shapes == geometry_.obstacles.size()) {
    std::array<bool, 64> seen{};
    geometry_.shape_grid.nearby(x, y, margin, [&](std::uint32_t i) {
      if (!seen[i]) {
        seen[i] = true;
        test(i);
      }
    });
  } else
    for (std::size_t i = 0; i < geometry_.obstacles.size(); ++i)
      test(std::uint32_t(i));
  return result;
}
bool Field::position(Rng &r, double &x, double &y, double radius) const {
  for (int i = 0; i < 300; ++i) {
    x = r.uniform(radius, geometry_.width - radius);
    y = r.uniform(radius, geometry_.height - radius);
    if (free(x, y, radius))
      return true;
  }
  return false;
}
double Field::ray(double x, double y, double ux, double uy, double margin, double reach) const {
  x = wrap_x(x);
  double vertical = INF;
  if (uy > 1e-12)
    vertical = (geometry_.height - margin - y) / uy;
  else if (uy < -1e-12)
    vertical = (margin - y) / uy;
  vertical = std::max(0., vertical);
  double travel = 0, limit = std::min(vertical, std::max(reach, 2 * margin + 16));
  while (travel < limit) {
    double seam = ux > 1e-12 ? (geometry_.width - x) / ux : ux < -1e-12 ? -x / ux : INF;
    double span = std::min(seam, limit - travel), hit = ray_local(x, y, ux, uy, margin, span);
    if (hit < span)
      return travel + hit;
    travel += span;
    if (travel >= limit)
      break;
    x = ux > 0 ? 0 : geometry_.width;
    y += uy * span;
  }
  return vertical;
}
double Field::ray_local(double x, double y, double ux, double uy, double margin,
                        double limit) const {
  double d = limit;
  if (geometry_.obstacles.empty())
    return std::max(0., d);
  auto test = [&](std::uint32_t id) {
    const auto &o = geometry_.obstacles[id];
    const auto box = bounds(o);
    const double padding = std::max(0., margin) + 1e-9;
    double image = o.x + delta_x(x - o.x);
    for (double px : {image - geometry_.width, image, image + geometry_.width}) {
      const double ex = px + ux * d, ey = y + uy * d;
      if (std::max(px, ex) < box[0] - padding || std::min(px, ex) > box[1] + padding ||
          std::max(y, ey) < box[2] - padding || std::min(y, ey) > box[3] + padding)
        continue;
      if (o.vertices.empty())
        d = std::min(d, ray_circle(px, y, ux, uy, o.x, o.y, o.radius + margin));
      else {
        if (inside(px, y, o.vertices)) {
          d = 0;
          return;
        }
        for (std::size_t i = 0; i < o.vertices.size(); ++i)
          d = std::min(d,
                       ray_edge(px, y, ux, uy, o.vertices[i],
                                o.vertices[(i + 1) % o.vertices.size()], margin,
                                o.segments.size() == o.vertices.size() ? &o.segments[i] : nullptr));
      }
    }
  };
  if (margin > 0 && (x < margin || x > geometry_.width - margin || x + ux * limit < margin ||
                     x + ux * limit > geometry_.width - margin))
    for (std::size_t i = 0; i < geometry_.obstacles.size(); ++i)
      test(std::uint32_t(i));
  if (geometry_.shape_grid.columns > 0 && geometry_.indexed_shapes == geometry_.obstacles.size() &&
      x >= 0 && y >= 0 && x < geometry_.width && y < geometry_.height) {
    std::array<bool, 64> seen{};
    double cell = geometry_.shape_grid.cell;
    int i = int(x / cell), j = int(y / cell), sx = ux >= 0 ? 1 : -1, sy = uy >= 0 ? 1 : -1;
    double tx = std::abs(ux) > 1e-12 ? ((sx > 0 ? (i + 1) * cell : i * cell) - x) / ux : INF,
           ty = std::abs(uy) > 1e-12 ? ((sy > 0 ? (j + 1) * cell : j * cell) - y) / uy : INF;
    for (double travel = 0; travel <= d && i >= 0 && j >= 0 && i < geometry_.shape_grid.columns &&
                            j < geometry_.shape_grid.rows;) {
      for (auto id : geometry_.shape_grid.bins[j * geometry_.shape_grid.columns + i])
        if (!seen[id]) {
          seen[id] = true;
          test(id);
        }
      if (tx < ty) {
        travel = tx;
        i += sx;
        tx += cell / std::abs(ux);
      } else {
        travel = ty;
        j += sy;
        ty += cell / std::abs(uy);
      }
    }
  } else
    for (std::size_t i = 0; i < geometry_.obstacles.size(); ++i)
      test(std::uint32_t(i));
  return std::max(0., d);
}
bool Field::clear_line(double x, double y, double tx, double ty) const {
  x = wrap_x(x);
  tx = x + delta_x(tx - x);
  if (y < 0 || ty < 0 || y >= geometry_.height || ty >= geometry_.height || tx < 0 ||
      tx >= geometry_.width)
    return false;
  if (geometry_.obstacles.empty())
    return true;
  if (geometry_.shape_grid.columns == 0 || geometry_.indexed_shapes != geometry_.obstacles.size())
    return false;
  double cell = geometry_.shape_grid.cell;
  int left = std::max(0, int(std::min(x, tx) / cell)),
      right = std::min(geometry_.shape_grid.columns - 1, int(std::max(x, tx) / cell)),
      top = std::max(0, int(std::min(y, ty) / cell)),
      bottom = std::min(geometry_.shape_grid.rows - 1, int(std::max(y, ty) / cell));
  for (int j = top; j <= bottom; ++j)
    for (int i = left; i <= right; ++i)
      if (!geometry_.shape_grid.bins[j * geometry_.shape_grid.columns + i].empty())
        return false;
  return true;
}
std::array<double, 3> Field::filter_color(double x, double y, double tx, double ty,
                                          std::array<double, 3> color) const {
  const double attenuation = light(tx, ty) * sediment_transmission(x, y, tx, ty);
  const auto foliage = grass_transmission(x, y, tx, ty);
  for (int c = 0; c < 3; ++c)
    color[c] *= attenuation * foliage[c];
  return filter_sperm(x, y, tx, ty, color);
}
void Field::collide(Body &b, double ox, double oy, double radius) const {
  if (radius < 0)
    radius = collision_radius(b);
  // A larger body can overlap geometry_ before moving (feeding_, growth or hatching).
  bool expanded = !free(ox, oy, radius);
  if (expanded) {
    double start_x = ox, start_y = oy;
    for (int pass = 0; pass < 4 && !free(ox, oy, radius); ++pass) {
      ox = wrap_x(ox);
      oy = std::clamp(oy, radius + .001, geometry_.height - radius - .001);
      for (const auto &original : geometry_.obstacles) {
        auto o = original;
        double shift = ox + delta_x(o.x - ox) - o.x;
        o.x += shift;
        for (auto &vertex : o.vertices)
          vertex.x += shift;
        if (std::hypot(ox - o.x, oy - o.y) > o.radius + radius)
          continue;
        if (o.vertices.empty()) {
          double dx = ox - o.x, dy = oy - o.y, d = std::hypot(dx, dy);
          if (d < o.radius + radius) {
            double nx = d > 1e-12 ? dx / d : 1, ny = d > 1e-12 ? dy / d : 0,
                   push = o.radius + radius - d + .001;
            ox += nx * push;
            oy += ny * push;
          }
          continue;
        }
        bool contained = inside(ox, oy, o.vertices);
        double best = INF, qx = ox, qy = oy;
        for (std::size_t i = 0; i < o.vertices.size(); ++i) {
          auto a = o.vertices[i], c = o.vertices[(i + 1) % o.vertices.size()];
          double dx = c.x - a.x, dy = c.y - a.y, length = dx * dx + dy * dy,
                 t = length > 0 ? std::clamp(((ox - a.x) * dx + (oy - a.y) * dy) / length, 0., 1.)
                                : 0,
                 x = a.x + t * dx, y = a.y + t * dy, d = std::hypot(ox - x, oy - y);
          if (d < best) {
            best = d;
            qx = x;
            qy = y;
          }
        }
        if (contained || best < radius) {
          double nx = contained ? qx - ox : ox - qx, ny = contained ? qy - oy : oy - qy,
                 d = std::hypot(nx, ny);
          if (d < 1e-12) {
            nx = ox - o.x;
            ny = oy - o.y;
            d = std::hypot(nx, ny);
          }
          if (d < 1e-12) {
            nx = 1;
            ny = 0;
            d = 1;
          }
          double push = radius + (contained ? best : -best) + .001;
          ox += nx / d * push;
          oy += ny / d * push;
        }
      }
    }
    b.x += ox - start_x;
    b.y += oy - start_y;
  }
  double dx = b.x - ox, dy = b.y - oy, len = std::hypot(dx, dy), fraction = 1;
  if (len > 0)
    fraction =
        std::clamp((ray(ox, oy, dx / len, dy / len, radius, len + .001) - .001) / len, 0., 1.);
  b.x = ox + dx * fraction;
  b.y = std::clamp(oy + dy * fraction, radius, geometry_.height - radius);
  b.reproduction_.contact = expanded || fraction < 1 ? 1 : 0;
  if (!b.reproduction_.contact) {
    b.x = wrap_x(b.x);
    return;
  }
  double gap = INF, nx = 0, ny = 0;
  auto normal = [&](double distance, double x, double y) {
    if (distance < gap) {
      gap = distance;
      nx = x;
      ny = y;
    }
  };
  normal(std::abs(b.y - radius), 0, -1);
  normal(std::abs(geometry_.height - radius - b.y), 0, 1);
  auto test = [&](std::uint32_t i) {
    auto o = geometry_.obstacles[i];
    double shift = b.x + delta_x(o.x - b.x) - o.x;
    o.x += shift;
    for (auto &vertex : o.vertices)
      vertex.x += shift;
    if (o.vertices.empty()) {
      double x = o.x - b.x, y = o.y - b.y, d = std::hypot(x, y);
      if (d > 1e-12)
        normal(std::abs(d - o.radius - radius), x / d, y / d);
    } else
      for (std::size_t k = 0; k < o.vertices.size(); ++k) {
        auto a = o.vertices[k], c = o.vertices[(k + 1) % o.vertices.size()];
        double x = c.x - a.x, y = c.y - a.y, l = x * x + y * y,
               t = l > 0 ? std::clamp(((b.x - a.x) * x + (b.y - a.y) * y) / l, 0., 1.) : 0;
        x = a.x + t * x - b.x;
        y = a.y + t * y - b.y;
        double d = std::hypot(x, y);
        if (d > 1e-12)
          normal(std::abs(d - radius), x / d, y / d);
      }
  };
  if (geometry_.shape_grid.columns > 0 && geometry_.indexed_shapes == geometry_.obstacles.size()) {
    std::array<bool, 64> seen{};
    geometry_.shape_grid.nearby(b.x, b.y, radius + .01, [&](std::uint32_t i) {
      if (!seen[i]) {
        seen[i] = true;
        test(i);
      }
    });
  } else
    for (std::size_t i = 0; i < geometry_.obstacles.size(); ++i)
      test(std::uint32_t(i));
  b.motor_.contact_x = nx;
  b.motor_.contact_y = ny;
  double tx = dx * (1 - fraction), ty = dy * (1 - fraction), normal_part = tx * nx + ty * ny;
  tx -= normal_part * nx;
  ty -= normal_part * ny;
  double tangent = std::hypot(tx, ty);
  if (tangent > 1e-12 && free(b.x + tx, b.y + ty, radius) &&
      ray(b.x, b.y, tx / tangent, ty / tangent, radius, tangent + .001) >= tangent) {
    b.x += tx;
    b.y += ty;
  }
  b.x = wrap_x(b.x);
}
double Field::loose_energy(int origin) const {
  return feeding_.energy_from(origin);
}
double Field::food_energy() const {
  return feeding_.energy();
}
std::size_t Field::food_count() const {
  return feeding_.count();
}
std::array<double, 3> Field::food_color(const Food &f) const {
  return feeding_.color(f, f.origin == 2 ? env_.egg_half_life : env_.decay_half_life);
}
int Field::remove_deepest(double energy) {
  int removed = 0;
  while (energy > 1e-9 && !feeding_.pieces.empty()) {
    auto bottom = feeding_.pieces.end();
    for (auto i = feeding_.pieces.begin(); i != feeding_.pieces.end(); ++i)
      if (i->origin == 0 && (bottom == feeding_.pieces.end() || i->y > bottom->y))
        bottom = i;
    if (bottom == feeding_.pieces.end())
      break;
    double amount = std::min(energy, bottom->energy);
    bottom->energy -= amount;
    energy -= amount;
    if (bottom->energy <= 1e-9) {
      *bottom = feeding_.pieces.back();
      feeding_.pieces.pop_back();
      ++removed;
    }
  }
  indexed_ = false;
  return removed;
}
void Field::spray(double x, double y, int count, double radius) {
  indexed_ = false;
  for (int i = 0; i < count && food_count() < std::size_t(niche_limit(0) / feeding_.food_min) &&
                  feeding_.food_allowance >= feeding_.food_min;
       ++i) {
    double a = rng.uniform(-PI, PI), d = radius * std::sqrt(rng.uniform()),
           px = wrap_x(x + d * std::cos(a)), py = y + d * std::sin(a);
    if (free(px, py, 1)) {
      double vx = rng.uniform(-.12, .12), vy = rng.uniform(-.12, .12), e = draw_food_energy();
      if (e > feeding_.food_allowance)
        e = feeding_.food_allowance;
      place_food(px, py, vx, vy, e);
    }
  }
}
namespace {
Point sample_water(const std::vector<double> &u, const std::vector<double> &v, int nx, int ny,
                   double width, double height, double x, double y) {
  const double dx = width / nx, dy = height / ny;
  x -= width * std::floor(x / width);
  auto sample = [&](const std::vector<double> &values, int stride, int last_row, double gx,
                    double gy) {
    gy = std::clamp(gy, 0., double(last_row));
    int i = int(std::floor(gx)), j = int(gy), jj = std::min(last_row, j + 1);
    double fx = gx - i, fy = gy - j;
    int a = (i % nx + nx) % nx, b = (a + 1) % nx;
    return (1 - fy) * ((1 - fx) * values[j * stride + a] + fx * values[j * stride + b]) +
           fy * ((1 - fx) * values[jj * stride + a] + fx * values[jj * stride + b]);
  };
  return {sample(u, nx + 1, ny - 1, x / dx, y / dy - .5), sample(v, nx, ny, x / dx - .5, y / dy)};
}
}
Point Water::velocity(double x, double y) const {
  if (columns == 0 || width <= 0 || height <= 0)
    return {};
  return sample_water(u, v, columns, rows, width, height, x, y);
}
void Water::update(const Field &f, int iterations, bool adaptive) {
  pressure_iterations = 0;
  width = f.geometry().width;
  height = f.geometry().height;
  int nx = int(std::ceil(width / cell)), ny = int(std::ceil(height / cell));
  if (nx != columns || ny != rows) {
    columns = nx;
    rows = ny;
    u.assign((nx + 1) * ny, 0);
    v.assign(nx * (ny + 1), 0);
    solid.resize(nx * ny);
  }
  // Quiescent water is an exact fixed point, including after an editor change.
  if (f.flow == 0 &&
      std::none_of(f.currents().begin(), f.currents().end(),
                   [](const CurrentSource &s) { return s.strength * (1 + s.noise) > 0; }) &&
      std::all_of(u.begin(), u.end(), [](double v) { return v == 0; }) &&
      std::all_of(v.begin(), v.end(), [](double v) { return v == 0; }))
    return;
  const double dx = width / nx, dy = height / ny, wx = 1 / (dx * dx), wy = 1 / (dy * dy);
  const auto signature = refresh_geometry(f, nx, ny, dx, dy);
  advect_velocity(f, nx, ny, dx, dy);
  pressure.assign(nx * ny, 0);
  divergence.assign(nx * ny, 0);
  refresh_pressure_stencil(nx, ny, wx, wy, signature);
  project_velocity(nx, ny, dx, dy, wx, wy, iterations, adaptive);
}
bool Water::fluid(int i, int j) const {
  i = (i % columns + columns) % columns;
  return j >= 0 && j < rows && !solid[j * columns + i];
}
std::uint64_t Water::refresh_geometry(const Field &f, int nx, int ny, double dx, double dy) {
  std::uint64_t signature = 1469598103934665603ULL;
  auto hash = [&](double d) {
    std::uint64_t bits;
    std::memcpy(&bits, &d, sizeof bits);
    signature = (signature ^ bits) * 1099511628211ULL;
  };
  hash(width);
  hash(height);
  for (const auto &o : f.geometry().obstacles) {
    hash(o.x);
    hash(o.y);
    hash(o.radius);
    hash(double(o.vertices.size()));
    for (const auto &p : o.vertices) {
      hash(p.x);
      hash(p.y);
    }
  }
  if (signature != geometry_signature || u_open.size() != u.size()) {
    for (int j = 0; j < ny; ++j)
      for (int i = 0; i < nx; ++i)
        solid[j * nx + i] = !f.free((i + .5) * dx, (j + .5) * dy, 0);
    u_open.assign(u.size(), 0);
    v_open.assign(v.size(), 0);
    for (int j = 0; j < ny; ++j)
      for (int i = 0; i < nx; ++i)
        u_open[j * (nx + 1) + i] =
            fluid(i - 1, j) && fluid(i, j) && f.ray((i - .5) * dx, (j + .5) * dy, 1, 0) >= dx;
    for (int j = 0; j < ny; ++j)
      u_open[j * (nx + 1) + nx] = u_open[j * (nx + 1)];
    for (int j = 1; j < ny; ++j)
      for (int i = 0; i < nx; ++i)
        v_open[j * nx + i] =
            fluid(i, j - 1) && fluid(i, j) && f.ray((i + .5) * dx, (j - .5) * dy, 0, 1) >= dy;
    geometry_signature = signature;
  }
  return signature;
}
void Water::advect_velocity(const Field &f, int nx, int ny, double dx, double dy) {
  previous_u.swap(u);
  previous_v.swap(v);
  u.resize(previous_u.size());
  v.resize(previous_v.size());
  const auto &old_u = previous_u;
  const auto &old_v = previous_v;
  auto old_velocity = [&](double x, double y) {
    return sample_water(old_u, old_v, nx, ny, width, height, x, y);
  };
  for (int j = 0; j < ny; ++j) {
    const double background = .002 * f.flow * std::sin((j + .5) * dy * .012 + f.time * .001);
    for (int i = 0; i < nx; ++i) {
      double x = i * dx, y = (j + .5) * dy;
      auto vel = old_velocity(x, y);
      u[j * (nx + 1) + i] = .996 * old_velocity(x - vel.x, y - vel.y).x + background;
    }
  }
  std::vector<double> background_v(nx);
  for (int i = 0; i < nx; ++i)
    background_v[i] = .002 * f.flow * std::sin(2 * PI * ((i + .5) * dx) / width + f.time * .001);
  for (int j = 0; j <= ny; ++j)
    for (int i = 0; i < nx; ++i) {
      double x = (i + .5) * dx, y = j * dy;
      auto vel = old_velocity(x, y);
      v[j * nx + i] = .996 * old_velocity(x - vel.x, y - vel.y).y - background_v[i];
    }
  // Sources, advection and pressure all share the horizontal seam.
  for (const auto &source : f.currents()) {
    double strength = std::clamp(source.strength * (1 + source.noise), 0., 6.),
           radius = source.width * .5;
    int top = std::max(0, int((source.y - radius) / dy) - 1),
        bottom = std::min(ny, int((source.y + radius) / dy) + 1);
    double target_u = strength * std::cos(source.angle),
           target_v = strength * std::sin(source.angle);
    for (int j = top; j < std::min(ny, bottom + 1); ++j)
      for (int i = 0; i < nx; ++i)
        if (u_open[j * (nx + 1) + i] &&
            std::hypot(f.delta_x(i * dx - source.x), (j + .5) * dy - source.y) <= radius) {
          auto &speed = u[j * (nx + 1) + i];
          speed += .2 * (target_u - speed);
        }
    for (int j = top; j <= bottom; ++j)
      for (int i = 0; i < nx; ++i)
        if (v_open[j * nx + i] &&
            std::hypot(f.delta_x((i + .5) * dx - source.x), j * dy - source.y) <= radius) {
          auto &speed = v[j * nx + i];
          speed += .2 * (target_v - speed);
        }
  }
  for (int j = 0; j < ny; ++j) {
    for (int i = 0; i < nx; ++i)
      if (!u_open[j * (nx + 1) + i])
        u[j * (nx + 1) + i] = 0;
    u[j * (nx + 1) + nx] = u[j * (nx + 1)];
  }
  for (int j = 0; j <= ny; ++j)
    for (int i = 0; i < nx; ++i)
      if (!v_open[j * nx + i])
        v[j * nx + i] = 0;
}
void Water::refresh_pressure_stencil(int nx, int ny, double wx, double wy,
                                     std::uint64_t signature) {
  if (neighbors.size() != std::size_t(nx * ny) || stencil_signature != signature) {
    auto connected = [&](int i, int j, int sx, int sy) {
      return fluid(i + sx, j + sy) && (sx != 0 ? u_open[j * (nx + 1) + i + (sx > 0 ? 1 : 0)]
                                               : v_open[(j + (sy > 0 ? 1 : 0)) * nx + i]);
    };
    neighbors.resize(nx * ny);
    for (int j = 0; j < ny; ++j)
      for (int i = 0; i < nx; ++i) {
        int k = 0;
        for (auto d : std::array<std::array<int, 2>, 4>{{{{-1, 0}}, {{1, 0}}, {{0, -1}}, {{0, 1}}}})
          neighbors[j * nx + i][k++] =
              connected(i, j, d[0], d[1]) ? (j + d[1]) * nx + (i + d[0] + nx) % nx : -1;
      }
    neighbor_weight.assign(neighbors.size(), 0);
    pressure_runs.clear();
    pressure_boundary.clear();
    for (std::size_t c = 0; c < neighbors.size(); ++c)
      if (!solid[c])
        for (int k = 0; k < 4; ++k)
          if (neighbors[c][k] >= 0)
            neighbor_weight[c] += k < 2 ? wx : wy;
    for (int j = 0; j < ny; ++j) {
      int begin = -1;
      for (int i = 0; i <= nx; ++i) {
        int c = j * nx + i;
        bool fast =
            i > 0 && i < nx - 1 && j > 0 && j < ny - 1 && !solid[c] &&
            std::all_of(neighbors[c].begin(), neighbors[c].end(), [](int n) { return n >= 0; });
        if (fast && begin < 0)
          begin = c;
        if (!fast && begin >= 0) {
          pressure_runs.emplace_back(begin, c);
          begin = -1;
        }
        if (i < nx && !solid[c] && !fast)
          pressure_boundary.push_back(c);
      }
    }
    stencil_signature = signature;
  }
}
void Water::project_velocity(int nx, int ny, double dx, double dy, double wx, double wy,
                             int iterations, bool adaptive) {
  for (int j = 0; j < ny; ++j)
    for (int i = 0; i < nx; ++i)
      if (fluid(i, j))
        divergence[j * nx + i] = (u[j * (nx + 1) + i + 1] - u[j * (nx + 1) + i]) / dx +
                                 (v[(j + 1) * nx + i] - v[j * nx + i]) / dy;
  // Jacobi also works for odd periodic column counts, unlike checkerboard relaxation.
  pressure_next.assign(pressure.size(), 0);
  auto &next = pressure_next;
  double velocity_scale = 0;
  for (double speed : u)
    velocity_scale = std::max(velocity_scale, std::abs(speed));
  for (double speed : v)
    velocity_scale = std::max(velocity_scale, std::abs(speed));
  for (int iteration = 0; iteration < iterations; ++iteration) {
    const float *__restrict previous = pressure.data();
    float *__restrict following = next.data();
    const float *__restrict div = divergence.data();
    const double *__restrict weight = neighbor_weight.data();
    const float sx = float(wx), sy = float(wy), scale = .8f / float(wx + wx + wy + wy);
    for (auto run : pressure_runs)
      for (int c = run.first; c < run.second; ++c) {
        float sum = 0;
        sum += sx * previous[c - 1];
        sum += sx * previous[c + 1];
        sum += sy * previous[c - nx];
        sum += sy * previous[c + nx];
        following[c] = .2f * previous[c] + scale * (sum - div[c]);
      }
    for (int c : pressure_boundary) {
      float sum = 0;
      for (int k = 0; k < 4; ++k) {
        int neighbor = neighbors[c][k];
        if (neighbor >= 0)
          sum += (k < 2 ? sx : sy) * previous[neighbor];
      }
      if (weight[c])
        following[c] = .2f * previous[c] + .8f * (sum - div[c]) / float(weight[c]);
    }
    pressure.swap(next);
    pressure_iterations = iteration + 1;
    if (adaptive && (iteration + 1) % 8 == 0) {
      float even = 0, odd = 0;
      std::size_t c = 0;
      for (; c + 1 < pressure.size(); c += 2) {
        even = std::max(even, std::abs(pressure[c] - next[c]));
        odd = std::max(odd, std::abs(pressure[c + 1] - next[c + 1]));
      }
      if (c < pressure.size())
        even = std::max(even, std::abs(pressure[c] - next[c]));
      if (2 * std::max(even, odd) / std::min(dx, dy) <= std::max(.00001, .001 * velocity_scale))
        break;
    }
  }
  for (int j = 0; j < ny; ++j) {
    for (int i = 0; i < nx; ++i)
      if (u_open[j * (nx + 1) + i])
        u[j * (nx + 1) + i] -= (pressure[j * nx + i] - pressure[j * nx + (i + nx - 1) % nx]) / dx;
    u[j * (nx + 1) + nx] = u[j * (nx + 1)];
  }
  for (int j = 1; j < ny; ++j)
    for (int i = 0; i < nx; ++i)
      if (v_open[j * nx + i])
        v[j * nx + i] -= (pressure[j * nx + i] - pressure[(j - 1) * nx + i]) / dy;
}
void Field::motion(const Water *replay_water) {
  const double food_before = food_energy();
  indexed_ = false;
  index_geometry();
  ++time;
  advance_food_clouds();
  for (auto &source : currents_)
    source.noise = .999 * source.noise + .013 * rng.normal();
  if (replay_water) {
    water_.width = replay_water->width;
    water_.height = replay_water->height;
    water_.columns = replay_water->columns;
    water_.rows = replay_water->rows;
    water_.cell = replay_water->cell;
    water_.u = replay_water->u;
    water_.v = replay_water->v;
  } else
    water_.update(*this, 30);

  // Share conservative free-space tests for grains in the same small region.
  // Every grain keeps its position, velocity, energy, radius and identity.
  struct Batch {
    double step = 0, radius = 0;
    bool active = false, clear = false, dry = false;
  };
  const double cell = 32;
  const int nx = int(std::ceil(geometry_.width / cell)),
            ny = int(std::ceil(geometry_.height / cell));
  std::vector<Batch> batches(feeding_.batch_food ? nx * ny : 0);
  auto batch_at = [&](double x, double y) {
    return std::clamp(int(y / cell), 0, ny - 1) * nx + std::clamp(int(wrap_x(x) / cell), 0, nx - 1);
  };
  if (feeding_.batch_food) {
    double wx = 0, wy = 0;
    for (double v : water_.u)
      wx = std::max(wx, std::abs(v));
    for (double v : water_.v)
      wy = std::max(wy, std::abs(v));
    for (const auto &p : feeding_.pieces) {
      auto &b = batches[batch_at(p.x, p.y)];
      double sink = settling_speed(6 * feeding_.food_sink * p.buoyancy);
      b.active = true;
      b.radius = std::max(b.radius, food_radius(p));
      b.step = std::max({b.step, std::abs(p.vx), std::abs(p.vy), wx, wy + std::abs(sink)});
    }
    for (int j = 0; j < ny; ++j)
      for (int i = 0; i < nx; ++i) {
        auto &b = batches[j * nx + i];
        if (!b.active)
          continue;
        double pad = b.radius + b.step + 2, left = i * cell - pad,
               right = std::min(geometry_.width, (i + 1) * cell) + pad, top = j * cell - pad,
               bottom = std::min(geometry_.height, (j + 1) * cell) + pad;
        b.clear = left >= 0 && right < geometry_.width && right - left < geometry_.width * .5 &&
                  clear_line(left, top, right, bottom);
        if (b.clear)
          b.dry = sediment_immersion((left + right) * .5, (top + bottom) * .5,
                                     std::hypot(right - left, bottom - top) * .5) == 0;
      }
  }
  const double food_decay = std::exp2(-1 / env_.food_half_life),
               decay = std::exp2(-1 / env_.decay_half_life),
               harvested_decay = std::exp2(-.25 / env_.decay_half_life),
               egg_decay = std::exp2(-1 / env_.egg_half_life);
  std::vector<double> decayed(feeding_.pieces.size());
  parallel(
      feeding_.pieces.size(), motion_workers,
      [&](std::size_t index) {
        auto &p = feeding_.pieces[index];
        if (p.origin == 0 && p.initial_energy <= 0)
          p.initial_energy = p.energy;
        ++p.age;
        const bool harvested = p.origin >= 6 && p.origin <= 9;
        p.decay_age += harvested       ? .25
                       : p.origin == 2 ? .5
                                       : (p.origin > 0 && p.origin < 4 ? 2 : 1);
        const double before = p.energy, old_radius = food_radius(p);
        p.energy *= harvested       ? harvested_decay
                    : p.origin == 0 ? food_decay
                    : p.origin == 2 ? egg_decay
                                    : decay;
        decayed[index] = before - p.energy;
        p.radius = before > 0 ? old_radius * std::sqrt(p.energy / before) : 0;
        const double old_x = p.x, old_y = p.y, radius = food_radius(p);
        const auto batch = feeding_.batch_food ? batches[batch_at(p.x, p.y)] : Batch{};
        if (!batch.dry && rests_on_sediment({p.x, p.y}, radius)) {
          p.vx = p.vy = 0;
          if (p.bottom_steps < env_.rest_steps * std::max(1., radius))
            ++p.bottom_steps;
          return;
        }
        auto clear_sweep = [&](double dx, double dy, double padding) {
          const double left = p.x + std::min(0., dx) - padding,
                       right = p.x + std::max(0., dx) + padding;
          return left >= 0 && right < geometry_.width && right - left < geometry_.width * .5 &&
                 clear_line(left, p.y + std::min(0., dy) - padding, right,
                            p.y + std::max(0., dy) + padding);
        };
        Point velocity = water_.velocity(p.x, p.y);
        if (!batch.clear && !clear_sweep(0, .2, radius) &&
            sediment_immersion(p.x, p.y, radius) <= 0 && ray(p.x, p.y, 0, 1, radius, .2) < .2) {
          const auto above = water_.velocity(p.x, p.y - std::max(2., radius));
          const double speed = std::max(std::abs(velocity.x), std::abs(above.x)),
                       lift = std::min(2., speed);
          if (speed > .3 && free(p.x, p.y - lift, radius)) {
            p.y -= lift;
            p.vy = -speed * .2;
            velocity = water_.velocity(p.x, p.y);
          }
        }
        auto drift =
            drift_velocity({p.vx, p.vy}, velocity, 6 * feeding_.food_sink * p.buoyancy, .09504);
        p.vx = drift.x;
        p.vy = drift.y;
        Point slowed;
        if (batch.dry) {
          double cloud = turbidity_resistance(turbidity(p.x, p.y));
          slowed = {p.vx / cloud, p.vy / cloud};
        } else
          slowed = sediment_velocity({p.vx, p.vy}, p.x, p.y, radius);
        p.vx = slowed.x;
        p.vy = slowed.y;
        // Foliage catches food: large pieces hang in leaves and dense blades, crumbs slip
        // through between them.
        if (!batch.dry && env_.foliage_food_drag > 0 && vegetation_.indexed_plant_radius > 0) {
          const double blocked = foliage_contact(p.x, p.y, radius).blocked;
          if (blocked > 0) {
            const double brake = 1 + env_.foliage_food_drag * blocked * radius / 4;
            p.vx /= brake;
            p.vy /= brake;
          }
        }
        double len = std::hypot(p.vx, p.vy),
               fraction =
                   !batch.clear && len > 0 &&
                           !clear_sweep(p.vx * (1 + .001 / len), p.vy * (1 + .001 / len), radius)
                       ? std::clamp(
                             (ray(p.x, p.y, p.vx / len, p.vy / len, radius, len + .001) - .001) /
                                 len,
                             0., 1.)
                       : 1;
        double margin = std::max(1., radius);
        p.x = wrap_x(p.x + p.vx * fraction);
        p.y = std::clamp(p.y + p.vy * fraction, margin, geometry_.height - margin);
        if (fraction < 1) {
          p.vx *= .2;
          p.vy *= .2;
        }
        const bool on_soil = !batch.dry && p.vy >= 0 && rests_on_sediment({p.x, p.y}, radius);
        if (on_soil) {
          p.vx = p.vy = 0;
        }
        // Residence requires physical contact; suspended food can be motionless.
        bool resting =
            std::hypot(delta_x(p.x - old_x), p.y - old_y) < env_.rest_speed &&
            (on_soil || !free(p.x, p.y, radius + .1) || sediment_immersion(p.x, p.y, radius) > 0);
        if (on_soil)
          resting = true;
        if (resting) {
          if (p.bottom_steps < env_.rest_steps * std::max(1., radius))
            ++p.bottom_steps;
        } else
          p.bottom_steps = 0;
      },
      0, 8);
  for (std::size_t i = 0; i < feeding_.pieces.size(); ++i) {
    const auto &f = feeding_.pieces[i];
    deposit_detritus(f.x, f.y, decayed[i], food_radius(f));
  }
  {
    auto old = feeding_.pieces.size();
    feeding_.pieces.erase(std::remove_if(feeding_.pieces.begin(), feeding_.pieces.end(),
                                         [&](const Food &p) {
                                           const bool gone =
                                               p.energy < crumb_limit(p) ||
                                               (p.origin == 0 &&
                                                p.bottom_steps >=
                                                    env_.rest_steps * std::max(1., food_radius(p)));
                                           if (gone)
                                             deposit_detritus(p.x, p.y, p.energy, food_radius(p));
                                           return gone;
                                         }),
                          feeding_.pieces.end());
    feeding_.drained_food += old - feeding_.pieces.size();
  }
  feeding_.food_decayed += std::max(0., food_before - food_energy());
}
void Field::resize(double w, double h) {
  geometry_.width = w;
  geometry_.height = h;
  indexed_ = false;
  geometry_.shape_grid = SpatialGrid{};
  water_ = Water{};
  for (auto &p : feeding_.pieces)
    p.x = wrap_x(p.x);
  for (auto &p : feeding_.feeders)
    p.x = wrap_x(p.x);
  for (auto &p : currents_)
    p.x = wrap_x(p.x);
  feeding_.pieces.erase(std::remove_if(feeding_.pieces.begin(), feeding_.pieces.end(),
                                       [&](const Food &p) { return !free(p.x, p.y, 1); }),
                        feeding_.pieces.end());
  geometry_.obstacles.erase(
      std::remove_if(geometry_.obstacles.begin(), geometry_.obstacles.end(),
                     [&](const Obstacle &o) {
                       if (o.vertices.empty())
                         return o.x + o.radius > w || o.y + o.radius > h;
                       return std::any_of(o.vertices.begin(), o.vertices.end(),
                                          [&](const Point &p) { return p.x > w || p.y > h; });
                     }),
      geometry_.obstacles.end());
  feeding_.feeders.erase(std::remove_if(feeding_.feeders.begin(), feeding_.feeders.end(),
                                        [&](const Feeder &p) { return !free(p.x, p.y, 1); }),
                         feeding_.feeders.end());
  currents_.erase(std::remove_if(currents_.begin(), currents_.end(),
                                 [&](const CurrentSource &p) { return !free(p.x, p.y, 1); }),
                  currents_.end());
}
}
