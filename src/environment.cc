#include "environment.hh"
#include "plants.hh"
#include "physiology.hh"
#include <map>
#include <tuple>
#include <cstring>
#include <limits>
namespace fishsim {
namespace {
Point midpoint(const SurfacePatch &s) {
  return {(s.a.x + s.b.x) * .5, (s.a.y + s.b.y) * .5};
}
// Each surface has its own algal vigour (shade, water, chance): some patches carry thick mats,
// others only a thin film, and they grow back at different speeds.
double algae_vigor(std::uint64_t id, int salt) {
  std::uint64_t z = id * 0x9E3779B97F4A7C15ULL + std::uint64_t(salt) * 0xBF58476D1CE4E5B9ULL;
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
  return double((z ^ (z >> 31)) >> 11) / double(1ULL << 53);
}
double algae_max(const Field &f, const SurfacePatch &p) {
  return f.algae_capacity(p) * (.4 + 1.2 * algae_vigor(p.id, 1));
}
std::uint64_t geometry_hash(const Field &f) {
  std::uint64_t h = 1469598103934665603ULL;
  auto add = [&](double d) {
    std::uint64_t bits;
    std::memcpy(&bits, &d, 8);
    h = (h ^ bits) * 1099511628211ULL;
  };
  add(f.geometry().width);
  add(f.geometry().height);
  add(f.env().light_bottom);
  add(f.env().light_shadow);
  add(f.env().grass_length);
  add(f.env().algae_capacity);
  add(f.env().grass_capacity);
  for (const auto &o : f.geometry().obstacles) {
    add(double(o.id));
    add(o.x);
    add(o.y);
    add(o.radius);
    for (auto p : o.vertices) {
      add(p.x);
      add(p.y);
    }
  }
  return h;
}
std::size_t cell_at(const Field &f, double x, double y) {
  return std::size_t(
      std::clamp(int(y / f.geometry().height * f.sediment().rows), 0, f.sediment().rows - 1) *
          f.sediment().columns +
      std::clamp(int(f.wrap_x(x) / f.geometry().width * f.sediment().columns), 0,
                 f.sediment().columns - 1));
}

}
double Field::algae_energy() const {
  double total = 0;
  for (const auto &s : vegetation_.surfaces)
    total += s.algae;
  return total + loose_energy(4);
}
double Field::grass_energy() const {
  double total = 0;
  for (const auto &s : vegetation_.surfaces)
    total += s.grass;
  for (const auto &d : vegetation_.drifting_grass)
    total += d.plant.grass;
  return total + loose_energy(5);
}
double Field::sediment_cover(double x, double y) const {
  double result = 0;
  vegetation_.surface_grid.nearby(x, y, sediment_.max_sediment_depth + 16, [&](std::uint32_t i) {
    const auto &s = vegetation_.surfaces[i];
    if (s.normal.y > -.5)
      return;
    double px = delta_x(x - s.a.x), py = y - s.a.y,
           t = (px * (s.b.x - s.a.x) + py * (s.b.y - s.a.y)) / (s.length * s.length),
           gap = px * s.normal.x + py * s.normal.y;
    if (t < 0 || t > 1 || gap < 0)
      return;
    auto e = sediment_edges(i);
    result = std::max(result, e[0] + (e[1] - e[0]) * t - gap);
  });
  return result;
}
// The soil strip also encodes depth towards the viewer. Resting crumbs retain that depth.
bool Field::rests_on_sediment(Point point, double radius) const {
  bool supported = false;
  vegetation_.surface_grid.nearby(
      point.x, point.y, sediment_.max_sediment_depth + radius + 16, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -.5 || s.length <= 0)
          return;
        const double px = delta_x(point.x - s.a.x), py = point.y - s.a.y,
                     t = (px * (s.b.x - s.a.x) + py * (s.b.y - s.a.y)) / (s.length * s.length),
                     gap = px * s.normal.x + py * s.normal.y;
        if (t < 0 || t > 1 || gap < 0)
          return;
        const auto edges = sediment_edges(i);
        const double depth = edges[0] + (edges[1] - edges[0]) * t;
        supported |= depth > .05 && gap <= depth + radius * .55;
      });
  return supported;
}
double Field::plant_growth_rate() const {
  double total = 0;
  for (const auto &s : vegetation_.growth_history)
    total += s[0] + s[1];
  return total / std::max<std::size_t>(1, vegetation_.growth_history.size());
}
void Field::rebuild_clear_light() {
  // Broad light from the upper hemisphere. Oblique rays brighten the edge of a shadow.
  lighting_.columns = std::max(2, int(std::ceil(geometry_.width / 32)) + 1);
  lighting_.rows = std::max(2, int(std::ceil(geometry_.height / 32)) + 1);
  lighting_.illumination.resize(lighting_.columns * lighting_.rows);
  lighting_.canopy_density.clear();
  lighting_.shading_density.clear();
  lighting_.shading_factor.clear();
  constexpr double angles[9] = {-65, -48, -32, -16, 0, 16, 32, 48, 65},
                   weights[9] = {1, 1, 1, 1, 2, 1, 1, 1, 1};
  for (int j = 0; j < lighting_.rows; ++j)
    for (int i = 0; i < lighting_.columns; ++i) {
      double x = i * geometry_.width / (lighting_.columns - 1),
             y = std::clamp(j * geometry_.height / (lighting_.rows - 1), .001,
                            geometry_.height - .001),
             visible_ = 0;
      if (!free(x, y, 0)) {
        lighting_.illumination[j * lighting_.columns + i] = 1;
        continue;
      }
      for (int k = 0; k < 9; ++k) {
        double a = angles[k] * PI / 180, dx = std::sin(a), dy = -std::cos(a), reach = y / -dy;
        if (ray(x, y, dx, dy, 0, reach + .01) >= reach - .01)
          visible_ += weights[k];
      }
      lighting_.illumination[j * lighting_.columns + i] =
          env_.light_shadow + (1 - env_.light_shadow) * visible_ / 10;
    }
}
void Field::rebuild_sediment_masks(int nx, int ny) {
  // Static center and whole-cell clearance masks are rebuilt with the geometry_.
  sediment_.sediment_floor.assign(nx * ny, 0);
  sediment_.sediment_open.resize(nx * ny);
  sediment_.sediment_safe.resize(nx * ny);
  // A vertical column intersects the same support segments at every height.
  // Build those intersections once, rather than rescanning every surface per cell.
  for (int i = 0; i < nx; ++i) {
    const double x = (i + .5) * geometry_.width / nx;
    std::vector<std::pair<double, std::size_t>> supports;
    for (std::size_t k = 0; k < vegetation_.surfaces.size(); ++k) {
      const auto &s = vegetation_.surfaces[k];
      if (s.normal.y > -.5)
        continue;
      const double ax = x + delta_x(s.a.x - x), bx = ax + s.b.x - s.a.x;
      if (x < std::min(ax, bx) - .001 || x > std::max(ax, bx) + .001)
        continue;
      const double t = std::abs(bx - ax) > 1e-12 ? (x - ax) / (bx - ax) : .5,
                   sy = s.a.y + t * (s.b.y - s.a.y);
      if (sy < geometry_.height + 1)
        supports.emplace_back(sy, k);
    }
    std::sort(supports.begin(), supports.end());
    auto support = supports.begin();
    for (int j = 0; j < ny; ++j) {
      const double y = (j + .5) * geometry_.height / ny;
      while (support != supports.end() && support->first < y)
        ++support;
      const auto at = j * nx + i;
      sediment_.sediment_floor[at] = support == supports.end() ? 0 : support->second;
      sediment_.sediment_open[at] = free(x, y, 0);
      sediment_.sediment_safe[at] =
          free(x, y, .5 * std::hypot(geometry_.width / nx, geometry_.height / ny));
    }
  }
  sediment_.sediment_links.assign(nx * ny, 0);
  for (int j = 0; j < ny; ++j)
    for (int i = 0; i < nx; ++i) {
      const auto at = j * nx + i;
      if (!sediment_.sediment_open[at])
        continue;
      double x = (i + .5) * geometry_.width / nx, y = (j + .5) * geometry_.height / ny;
      for (int sy = -1; sy <= 1; ++sy)
        for (int sx = -1; sx <= 1; ++sx) {
          int yy = j + sy, xx = (i + sx + nx) % nx;
          if (yy < 0 || yy >= ny || !sediment_.sediment_open[yy * nx + xx])
            continue;
          double vx = sx * geometry_.width / nx, vy = sy * geometry_.height / ny,
                 d = std::hypot(vx, vy);
          if (d == 0 || clear_line(x, y, x + vx, y + vy) || ray(x, y, vx / d, vy / d, 0, d) >= d)
            sediment_.sediment_links[at] |= std::uint16_t(1 << ((sy + 1) * 3 + sx + 1));
        }
    }
}
void Field::sync_environment() {
  for (auto &o : geometry_.obstacles)
    if (!o.id)
      o.id = geometry_.next_obstacle_id++;
  auto signature = geometry_hash(*this);
  if (signature == environment_signature)
    return;
  index_geometry();
  auto old = std::move(vegetation_.surfaces);
  using Key = std::tuple<std::uint64_t, int, int>;
  std::map<Key, SurfacePatch> saved;
  for (auto s : old)
    saved[{s.owner, s.edge, s.slot}] = s;
  auto edge = [&](std::uint64_t owner, int index, Point a, Point b, Point normal, double hold = 0) {
    hold = normal.y <= -.5 ? hold : 0;
    double length = std::hypot(b.x - a.x, b.y - a.y);
    const double spacing = 6.4 + 4 * std::pow(std::sin(owner * 1.73 + index * 2.31), 2);
    int pieces = std::max(1, int(std::ceil(length / spacing)));
    for (int slot = 0; slot < pieces; ++slot) {
      double t = (slot + .5) / pieces;
      Point center{a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)};
      if (center.y < 0 || center.y > geometry_.height ||
          !free(center.x + normal.x * .6, center.y + normal.y * .6, 0))
        continue;
      SurfacePatch s;
      auto found = saved.find({owner, index, slot});
      if (found != saved.end()) {
        s = found->second;
        saved.erase(found);
      } else
        s.id = vegetation_.next_surface_id++;
      s.owner = owner;
      s.edge = index;
      s.slot = slot;
      s.a = {a.x + double(slot) / pieces * (b.x - a.x), a.y + double(slot) / pieces * (b.y - a.y)};
      s.b = {a.x + double(slot + 1) / pieces * (b.x - a.x),
             a.y + double(slot + 1) / pieces * (b.y - a.y)};
      s.normal = normal;
      s.sediment_hold = hold;
      for (int side = 0; side < 2; ++side) {
        const double along = double(slot + side) / pieces * length;
        s.sediment_rim[side] =
            hold > 0 ? std::pow(std::max(0., 1 - std::min(along, length - along) / 28), 2) : 0;
      }
      s.length = length / pieces;
      if (s.grass_traits[0] < 0)
        s.grass_traits = grass_traits(s);
      // Geometry reconstruction must preserve biomass. Growth uses the current capacity;
      // mussel loss explicitly releases excess coating as edible flakes.
      s.grass_max = 0;
      if (normal.y <= -.5) {
        double x = wrap_x(center.x + normal.x * .6), y = center.y + normal.y * .6;
        double maximum = 4 + 2 * (env_.grass_length - 4),
               clearance = std::min(maximum, ray(x, y, 0, -1, 0, maximum));
        if (clearance >= 16)
          s.grass_max = env_.grass_capacity * std::clamp((clearance - 4) / (maximum - 4), 0., 1.);
      }
      if (s.grass_max <= 0) {
        if (s.stump)
          uproot(s);
        s.grass = 0;
        s.stump = false;
      } else if (s.grass > s.grass_max + 1e-9)
        s.grass = s.grass_max;
      if (normal.y > -.5 && s.sediment > 0) {
        saved[{s.id, -1, -1}] = SurfacePatch{};
        saved[{s.id, -1, -1}].sediment = s.sediment;
        saved[{s.id, -1, -1}].a = center;
        saved[{s.id, -1, -1}].b = center;
        s.sediment = 0;
      }
      vegetation_.surfaces.push_back(s);
    }
  };
  edge(0, 0, {0, geometry_.height}, {geometry_.width, geometry_.height}, {0, -1});
  for (const auto &o : geometry_.obstacles) {
    auto vertices = o.vertices;
    if (vertices.empty()) {
      int count = std::max(32, int(std::ceil(2 * PI * o.radius / 16)));
      for (int i = 0; i < count; ++i)
        vertices.push_back({o.x + o.radius * std::cos(2 * PI * i / count),
                            o.y + o.radius * std::sin(2 * PI * i / count)});
    }
    double area = 0;
    for (std::size_t k = 0; k < vertices.size(); ++k) {
      auto a = vertices[k], b = vertices[(k + 1) % vertices.size()];
      area += a.x * b.y - b.x * a.y;
    }
    for (std::size_t k = 0; k < vertices.size(); ++k) {
      auto a = vertices[k], b = vertices[(k + 1) % vertices.size()];
      double l = std::hypot(b.x - a.x, b.y - a.y);
      if (l > 0) {
        const auto before = vertices[(k + vertices.size() - 1) % vertices.size()],
                   after = vertices[(k + 2) % vertices.size()];
        const double lip =
            std::abs(a.y - b.y) < .01 ? std::max(0., std::min(a.y - before.y, b.y - after.y)) : 0;
        edge(o.id, int(k), a, b,
             area > 0 ? Point{(b.y - a.y) / l, -(b.x - a.x) / l}
                      : Point{-(b.y - a.y) / l, (b.x - a.x) / l},
             std::min(6., lip * .45));
      }
    }
  }
  const double sediment_cell = std::max(16., std::sqrt(geometry_.width * geometry_.height / 16000));
  int nx = std::max(1, int(std::ceil(geometry_.width / sediment_cell))),
      ny = std::max(1, int(std::ceil(geometry_.height / sediment_cell)));
  if (nx != sediment_.columns || ny != sediment_.rows) {
    auto before = std::move(sediment_.suspended);
    int ox = sediment_.columns, oy = sediment_.rows;
    sediment_.columns = nx;
    sediment_.rows = ny;
    sediment_.suspended.assign(nx * ny, 0);
    if (ox && oy)
      for (int j = 0; j < oy; ++j)
        for (int i = 0; i < ox; ++i) {
          double left = double(i) * nx / ox, right = double(i + 1) * nx / ox,
                 top = double(j) * ny / oy, bottom = double(j + 1) * ny / oy;
          for (int yy = int(top); yy < std::min(ny, int(std::ceil(bottom))); ++yy)
            for (int xx = int(left); xx < std::min(nx, int(std::ceil(right))); ++xx)
              sediment_.suspended[yy * nx + xx] +=
                  before[j * ox + i] *
                  (std::min(right, double(xx + 1)) - std::max(left, double(xx))) *
                  (std::min(bottom, double(yy + 1)) - std::max(top, double(yy))) /
                  ((right - left) * (bottom - top));
        }
  }
  for (auto &item : saved) {
    auto &s = item.second;
    if (s.stump)
      uproot(s);
    if (s.sediment > 0) {
      auto p = midpoint(s);
      sediment_.suspended[cell_at(*this, p.x, p.y - .5)] += s.sediment;
    }
  }
  rebuild_clear_light();
  vegetation_.surface_grid.reset(geometry_.width, geometry_.height);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto p = midpoint(vegetation_.surfaces[i]);
    vegetation_.surface_grid.add(p.x, p.y, i);
  }
  rebuild_sediment_masks(nx, ny);
  lighting_.clear_illumination = lighting_.illumination;
  update_sediment_light();
  environment_signature = signature;
  index_plants();
  fit_food_clouds();
}
void Field::update_sediment_light() {
  if (lighting_.clear_illumination.size() != lighting_.illumination.size() ||
      lighting_.columns < 2 || lighting_.rows < 2)
    return;
  const bool cloudy = std::any_of(sediment_.suspended.begin(), sediment_.suspended.end(),
                                  [](double v) { return v > 0; });
  if (!cloudy && std::none_of(lighting_.canopy_density.begin(), lighting_.canopy_density.end(),
                              [](double v) { return v > 0; })) {
    lighting_.illumination = lighting_.clear_illumination;
    lighting_.shading_density.clear();
    lighting_.shading_factor.clear();
    return;
  }
  const int nx = lighting_.columns, ny = lighting_.rows, period = nx - 1;
  const double dx = geometry_.width / period, dy = geometry_.height / (ny - 1);
  struct Sample {
    std::size_t a, b, c, d;
    double fx, fy;
  };
  struct Scratch {
    int nx = 0, ny = 0, sx = 0, sy = 0;
    double width = 0, height = 0;
    std::vector<Sample> samples;
    std::vector<double> density, factor, above, next;
  };
  thread_local Scratch cache;
  if (cache.nx != nx || cache.ny != ny || cache.sx != sediment_.columns ||
      cache.sy != sediment_.rows || cache.width != geometry_.width ||
      cache.height != geometry_.height) {
    cache.nx = nx;
    cache.ny = ny;
    cache.sx = sediment_.columns;
    cache.sy = sediment_.rows;
    cache.width = geometry_.width;
    cache.height = geometry_.height;
    cache.samples.resize(nx * ny);
    if (sediment_.columns && sediment_.rows)
      for (int j = 0; j < ny; ++j)
        for (int i = 0; i < nx; ++i) {
          double gx = wrap_x(i * dx) / geometry_.width * sediment_.columns - .5,
                 gy = std::clamp(j * dy / geometry_.height * sediment_.rows - .5, 0.,
                                 double(sediment_.rows - 1));
          int x = int(std::floor(gx)), y = int(gy), a = (x + sediment_.columns) % sediment_.columns,
              b = (a + 1) % sediment_.columns, z = std::min(sediment_.rows - 1, y + 1);
          cache.samples[j * nx + i] = {std::size_t(y * sediment_.columns + a),
                                       std::size_t(y * sediment_.columns + b),
                                       std::size_t(z * sediment_.columns + a),
                                       std::size_t(z * sediment_.columns + b),
                                       gx - x,
                                       gy - y};
        }
    cache.density.resize(nx * ny);
    cache.factor.assign(nx * ny, 1.);
    cache.above.resize(nx);
    cache.next.resize(nx);
  }
  auto &density = cache.density;
  const double sediment_area =
      sediment_.columns && sediment_.rows
          ? geometry_.width / sediment_.columns * geometry_.height / sediment_.rows
          : 1;
  for (std::size_t i = 0; i < density.size(); ++i) {
    double dust = 0;
    if (cloudy) {
      const auto &q = cache.samples[i];
      dust =
          64 *
          ((1 - q.fy) * ((1 - q.fx) * sediment_.suspended[q.a] + q.fx * sediment_.suspended[q.b]) +
           q.fy * ((1 - q.fx) * sediment_.suspended[q.c] + q.fx * sediment_.suspended[q.d])) /
          sediment_area;
    }
    density[i] =
        dust / env_.sediment_path +
        (lighting_.canopy_density.size() == density.size() ? lighting_.canopy_density[i] / dy : 0);
  }
  if (density == lighting_.shading_density &&
      lighting_.shading_factor.size() == lighting_.illumination.size()) {
    for (std::size_t i = 0; i < lighting_.illumination.size(); ++i)
      lighting_.illumination[i] = lighting_.clear_illumination[i] * lighting_.shading_factor[i];
    return;
  }
  auto &above = cache.above;
  auto &next = cache.next;
  auto &factor = cache.factor;
  std::fill(above.begin(), above.end(), 0.);
  std::fill(factor.begin(), factor.end(), 1.);
  for (int j = 1; j < ny; ++j) {
    for (int i = 0; i < period; ++i) {
      const int l = (i + period - 1) % period, r = (i + 1) % period;
      const double incoming = .5 * above[i] + .25 * (above[l] + above[r]);
      next[i] =
          std::min(64., incoming + .5 * (density[j * nx + i] + density[(j - 1) * nx + i]) * dy);
      factor[j * nx + i] = std::exp2(-next[i]);
    }
    next[period] = next[0];
    factor[j * nx + period] = factor[j * nx];
    above.swap(next);
  }
  for (std::size_t i = 0; i < lighting_.illumination.size(); ++i)
    lighting_.illumination[i] = lighting_.clear_illumination[i] * factor[i];
  lighting_.shading_density = density;
  lighting_.shading_factor = factor;
}
Point Field::fish_disturbance(const VisibleBody &p, Point q) const {
  const double dx = delta_x(q.x - p.x), dy = q.y - p.y, distance2 = dx * dx + dy * dy,
               reach = std::min(80., 8 + 6 * p.radius);
  if (distance2 < 1e-12 || distance2 > reach * reach)
    return {};
  const double d = std::sqrt(distance2), weight = .65 * p.radius * p.radius /
                                                  std::max(p.radius * p.radius, distance2) *
                                                  (1 - d / reach) * (1 - d / reach);
  if (weight * std::hypot(p.flow_x, p.flow_y) < .001 ||
      (!clear_line(q.x, q.y, p.x, p.y) && ray(q.x, q.y, -dx / d, -dy / d, 0, d) < d - p.radius))
    return {};
  const double projection = (dx * p.flow_x + dy * p.flow_y) / distance2;
  return {weight * (2 * dx * projection - p.flow_x), weight * (2 * dy * projection - p.flow_y)};
}
std::array<Point, 4> Field::nearby_flow_samples(const Body &b,
                                                const std::array<Point, 4> &positions) const {
  std::array<Point, 4> result{};
  const double spread = std::max(std::hypot(delta_x(positions[0].x - b.x), positions[0].y - b.y),
                                 std::hypot(delta_x(positions[1].x - b.x), positions[1].y - b.y));
  std::array<int, 4> same{};
  for (int k = 0; k < 4; ++k) {
    same[k] = k;
    for (int j = 0; j < k; ++j)
      if (positions[k].x == positions[j].x && positions[k].y == positions[j].y) {
        same[k] = j;
        break;
      }
  }
  body_grid_.nearby(b.x, b.y, 80 + spread, [&](std::uint32_t i) {
    const auto &p = visible_[i];
    if (p.kind != 1 || p.hidden || !p.hatched || (b.identity && p.id == b.identity))
      return;
    const double speed = std::hypot(p.flow_x, p.flow_y);
    if (speed < .02)
      return;
    const int samples = 4;
    for (int k = 0; k < samples; ++k) {
      if (same[k] != k)
        continue;
      const auto q = positions[k];
      const auto v = fish_disturbance(p, q);
      result[k].x += v.x;
      result[k].y += v.y;
    }
  });
  for (int k = 0; k < 4; ++k)
    result[k] = result[same[k]];
  return result;
}
std::array<Point, 2> Field::nearby_flow_samples(const Body &b,
                                                const std::array<Point, 2> &p) const {
  auto a = nearby_flow_samples(b, std::array<Point, 4>{{p[0], p[1], p[0], p[1]}});
  return {{a[0], a[1]}};
}
Point Field::nearby_flow(const Body &b) const {
  return nearby_flow_samples(b, std::array<Point, 2>{{{b.x, b.y}, {b.x, b.y}}})[0];
}
std::array<double, 3> Field::surface_color(double x, double y) const {
  if (sediment_immersion(x, y, .15) > .05)
    return {.55, .48, .30};
  double best = 9, coverage = 0;
  vegetation_.surface_grid.nearby(x, y, 20, [&](std::uint32_t i) {
    const auto &s = vegetation_.surfaces[i];
    double ax = x + delta_x(s.a.x - x), dx = s.b.x - s.a.x, dy = s.b.y - s.a.y,
           l = dx * dx + dy * dy,
           t = l > 0 ? std::clamp(((x - ax) * dx + (y - s.a.y) * dy) / l, 0., 1.) : 0,
           d = std::hypot(x - ax - t * dx, y - s.a.y - t * dy);
    if (d < best) {
      best = d;
      coverage = std::clamp(s.algae / std::max(1e-12, algae_max(*this, s)), 0., 1.);
    }
  });
  return {.25 * coverage, .65 * coverage, 1 - .8 * coverage};
}
double Field::daylight() const {
  return env_.day_period > 0
             ? env_.night_light + (1 - env_.night_light) * .5 *
                                      (1 + std::cos(2 * PI * double(time) / env_.day_period))
             : 1;
}
double Field::light(double x, double y) const {
  const double depth =
      daylight() * (1 - (1 - env_.light_bottom) * std::clamp(y / geometry_.height, 0., 1.));
  if (lighting_.illumination.empty())
    return depth;
  double gx = wrap_x(x) / geometry_.width * (lighting_.columns - 1),
         gy = std::clamp(y / geometry_.height, 0., 1.) * (lighting_.rows - 1);
  int i = std::min(lighting_.columns - 2, int(gx)), j = std::min(lighting_.rows - 2, int(gy));
  double fx = gx - i, fy = gy - j;
  return depth * ((1 - fy) * ((1 - fx) * lighting_.illumination[j * lighting_.columns + i] +
                              fx * lighting_.illumination[j * lighting_.columns + i + 1]) +
                  fy * ((1 - fx) * lighting_.illumination[(j + 1) * lighting_.columns + i] +
                        fx * lighting_.illumination[(j + 1) * lighting_.columns + i + 1]));
}
double Field::soil_depth(const SurfacePatch &s) const {
  auto e = sediment_edges(&s - vegetation_.surfaces.data());
  return .5 * (e[0] + e[1]);
}
bool Field::room_for_plant(const SurfacePatch &s) const {
  const double t = grass_anchor(s);
  const auto edges = sediment_edges(&s - vegetation_.surfaces.data());
  const double depth = edges[0] + t * (edges[1] - edges[0]);
  if (!bed_site_clear(s, t, depth - grass_root_depth(s, depth, t), 16))
    return false;
  const Point root{s.a.x + t * (s.b.x - s.a.x), s.a.y + t * (s.b.y - s.a.y)};
  bool room = true;
  vegetation_.surface_grid.nearby(root.x, root.y, 40, [&](std::uint32_t i) {
    const auto &q = vegetation_.surfaces[i];
    if (!room || !q.stump || q.id == s.id || q.owner != s.owner || q.edge != s.edge)
      return;
    const double u = grass_anchor(q);
    const double distance = std::hypot(delta_x(q.a.x + u * (q.b.x - q.a.x) - root.x),
                                       q.a.y + u * (q.b.y - q.a.y) - root.y);
    room = distance >= .5 * (grass_root_spacing(s) + grass_root_spacing(q));
  });
  return room;
}
bool Field::bed_site_clear(const SurfacePatch &s, double along, double height,
                           double headroom) const {
  const auto edges = sediment_edges(&s - vegetation_.surfaces.data());
  const double depth = edges[0] + along * (edges[1] - edges[0]);
  const Point root{s.a.x + along * (s.b.x - s.a.x) + s.normal.x * height,
                   s.a.y + along * (s.b.y - s.a.y) + s.normal.y * height};
  const double reach = std::max(0., depth - height) / std::max(.5, -s.normal.y) + headroom;
  return free(root.x, root.y, .15) && ray(root.x, root.y, 0, -1, .15, reach) >= reach - .01;
}
double Field::grass_capacity(const SurfacePatch &s) const {
  double competition = 0;
  const auto at = &s - vegetation_.surfaces.data();
  for (int offset : {-2, -1, 1, 2}) {
    auto i = at + offset;
    if (i < 0 || i >= std::ptrdiff_t(vegetation_.surfaces.size()))
      continue;
    const auto &q = vegetation_.surfaces[i];
    if (q.stump && q.owner == s.owner && q.edge == s.edge)
      competition +=
          std::clamp(q.grass / std::max(1., env_.grass_capacity), 0., 1.) / std::abs(offset);
  }
  return s.grass_max * std::clamp(soil_depth(s) / 10, 0., 1.) * 1. /
         (1 + (grass_form(s) == 1 ? .65 : .35) * competition);
}
double Field::root_stability(std::size_t i) const {
  const auto &p = vegetation_.surfaces[i];
  double strength = 0;
  for (int offset = -2; offset <= 2; ++offset) {
    auto j = std::ptrdiff_t(i) + offset;
    if (j < 0 || j >= std::ptrdiff_t(vegetation_.surfaces.size()))
      continue;
    const auto &s = vegetation_.surfaces[j];
    if (!s.stump || s.owner != p.owner || s.edge != p.edge)
      continue;
    double cover = std::max(0., soil_depth(s) - std::max(0., s.root_height));
    strength += (.2 + .8 * std::clamp(s.grass / std::max(1., env_.grass_capacity), 0., 1.)) *
                (1 + .5 * soil_fertility(s)) * std::min(1., cover / 4) * (grass_stems(s)) /
                (2 * (1 + std::abs(offset)));
  }
  return 1 + 16 * strength;
}
void Field::uproot(SurfacePatch &s) {
  if (s.grass > 0) {
    DriftingGrass d;
    d.plant = s;
    int roots = 0;
    for (auto &o : d.plant.organs) {
      release_organ(o);
      if (o.parent < 0 && o.energy > 0 && roots < 8)
        d.plant.blades[roots++] = o.curve;
    }
    d.plant.blade = d.plant.blades[0];
    d.plant.grass_traits = grass_traits(s);
    d.id = vegetation_.next_surface_id++;
    d.x = d.plant.blade[0].x;
    d.y = d.plant.blade[0].y;
    auto v = water_.velocity(d.x, d.y);
    d.vx = v.x;
    d.vy = v.y;
    d.plant.sediment = d.plant.algae = 0;
    d.plant.spin = .008 * std::sin(d.id * 1.71);
    vegetation_.drifting_grass.push_back(d);
  }
  s.grass = 0;
  s.stump = false;
  s.root_height = -1;
  s.organs.clear();
}

void Field::seed_plants() {
  sync_environment();
  std::vector<double> desired(vegetation_.surfaces.size());
  double wanted = 0;
  // A new tank has its gravel on the floor and in planters. Stones keep only a thin layer on
  // their flat tops, where plants can root; their flanks start bare for algae.
  for (auto &s : vegetation_.surfaces)
    if (s.normal.y <= -.5) {
      const bool bed = s.owner == 0 || s.sediment_hold > 0;
      if (!bed && s.normal.y > -.9)
        continue;
      s.sediment = (bed ? 96 : 32) * s.length / 16 *
                   (.15 + .85 * (.5 + .5 * std::sin((s.a.x + s.b.x) / 142 + s.owner * .3)));
    }
  refresh_niche_limits();
  double algae_left = std::max(0., niche_limit(4) - algae_energy()),
         grass_left = std::min(energy_available, std::max(0., niche_limit(5) - grass_energy()));
  // Adjacent rooted patches form clumps; normalisation shares the budget across all platforms.
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    const auto &anchor = vegetation_.surfaces[i];
    if (anchor.grass_max <= 0 || rng.uniform() >= (grass_form(anchor) == 0 ? .22 : .12))
      continue;
    int span = (grass_form(anchor) == 0 ? 3 : 2) + int(rng.uniform() * 3);
    for (int k = 0; k < span && i + k < vegetation_.surfaces.size(); ++k) {
      auto j = i + k;
      const auto &q = vegetation_.surfaces[j];
      auto p = midpoint(q);
      if (q.owner != anchor.owner || q.edge != anchor.edge || q.grass_max <= 0 || q.sediment <= 0 ||
          plant_light(light(p.x + q.normal.x * (soil_depth(q) + 1),
                            p.y + q.normal.y * (soil_depth(q) + 1))) <= 0)
        break;
      desired[j] = std::max(0., std::min(grass_capacity(q) - q.grass, env_.seed_energy));
    }
  }
  for (double v : desired)
    wanted += v;
  double fraction = wanted > 0 ? std::min(1., grass_left / wanted) : 0;
  algae_left = std::min(algae_left, std::max(0., energy_available - wanted * fraction));
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    if (desired[i] > 0 && fraction > 0 && room_for_plant(s)) {
      s.stump = true;
      s.plant_age = 0;
      s.root_height = std::max(0., soil_depth(s) - grass_root_depth(s));
      s.grass += desired[i] * fraction;
      energy_available -= desired[i] * fraction;
    }
    auto p = midpoint(s);
    if (!s.stump && s.sediment <= 0 && algae_light(light(p.x + s.normal.x, p.y + s.normal.y)) > 0 &&
        rng.uniform() < .3 && algae_left > 0) {
      s.algae = std::min(algae_left, std::min(env_.seed_energy, algae_max(*this, s)));
      algae_left -= s.algae;
      energy_available -= s.algae;
    }
  }
  index_plants();
}
void Field::grow_plants(bool paced) {
  sync_environment();
  advance_grass();
  SedimentReadScope bed(*this);
  refresh_algae_exposure();
  vegetation_.algae_added = vegetation_.grass_added = 0;
  std::vector<double> algae(vegetation_.surfaces.size()), grass(vegetation_.surfaces.size());
  std::vector<bool> seedlings(vegetation_.surfaces.size());
  double want_a = 0, want_g = 0, weight_a = 0, weight_g = 0;
  std::vector<double> aw(algae.size()), gw(grass.size());
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    auto p = midpoint(s);
    const double depth = soil_depth(s);
    double illumination = light(p.x + s.normal.x * (depth + 1), p.y + s.normal.y * (depth + 1));
    const double exposed_at = .5 * (s.algae_open[0] + s.algae_open[1]),
                 algae_illumination =
                     s.algae_open[1] > s.algae_open[0]
                         ? light(s.a.x + exposed_at * (s.b.x - s.a.x) + s.normal.x * 2,
                                 s.a.y + exposed_at * (s.b.y - s.a.y) + s.normal.y * 2)
                         : 0;
    aw[i] = !s.stump && algae_capacity(s) > 0
                ? s.length * (s.algae_open[1] - s.algae_open[0]) * algae_light(algae_illumination)
                : 0;
    gw[i] = depth >= 1 && grass_capacity(s) >= env_.seed_energy
                ? s.length * plant_light(illumination) * (1 + 2 * soil_fertility(s))
                : 0;
    weight_a += aw[i];
    weight_g += gw[i];
    if (algae_light(algae_illumination) <= 0) {
      const double loss =
          s.algae * -std::expm1(-std::log(2.) * (1 - algae_illumination / algae_light_floor) /
                                env_.decay_half_life);
      s.algae -= loss;
      deposit_detritus(p.x, p.y, loss);
    }
    if (s.stump) {
      double capacity = grass_capacity(s), excess = std::max(0., s.grass - capacity),
             loss = excess * (-std::expm1(-std::log(2.) / env_.decay_half_life));
      s.grass -= loss;
      deposit_detritus(p.x, p.y, loss);
      const double missing = std::max(0., capacity - s.grass), fiber = grass_traits(s)[0];
      s.grass_grazed = std::min(s.grass_grazed, missing);
      grass[i] = s.grass_grazed > 0
                     ? s.grass_grazed
                     : s.vitality * (1 + 2 * soil_fertility(s)) * env_.grass_rate *
                           plant_light(illumination) * missing *
                           (1 - env_.fiber_growth_cost * fiber) * (time < s.boost_until ? 5 : 1);
      want_g += grass[i];
    } else {
      // Dormant seeds can establish away from living neighbours; photosynthesis
      // still pays for their biomass through the same source and total budgets.
      const double capacity = grass_capacity(s);
      if (depth >= 1 && capacity >= env_.seed_energy && room_for_plant(s) &&
          plant_light(illumination) > 0 &&
          rng.uniform() < (1 - plant_light_floor) * plant_light(illumination) *
                              (.5 + grass_traits(s)[2]) / 4000) {
        grass[i] = std::min(env_.seed_energy, capacity);
        seedlings[i] = true;
        want_g += grass[i];
      }
      if (s.algae_open[1] <= s.algae_open[0])
        continue;
      const double missing = std::max(0., algae_max(*this, s) - s.algae);
      s.algae_grazed = std::min(s.algae_grazed, missing);
      if (s.algae_grazed > 0)
        algae[i] = s.algae_grazed;
      else if (s.algae > 0)
        algae[i] = env_.algae_rate * algae_light(algae_illumination) * missing *
                   (.45 + 1.1 * algae_vigor(s.id, 2));
      else if (rng.uniform() < algae_light(algae_illumination) / 800)
        algae[i] = std::min(env_.seed_energy, missing);
      want_a += algae[i];
    }
  }
  const double weight = weight_a + weight_g, budget = producer_supply();
  feeding_.supply_algae = weight > 0 ? budget * weight_a / weight : 0;
  feeding_.supply_grass = weight > 0 ? budget * weight_g / weight : 0;
  want_a = want_g = 0;
  for (std::size_t i = 0; i < algae.size(); ++i) {
    if (vegetation_.surfaces[i].algae_grazed > 0)
      algae[i] = std::min(algae[i], weight > 0 ? budget * aw[i] / weight : 0);
    if (vegetation_.surfaces[i].grass_grazed > 0)
      grass[i] = std::min(grass[i], weight > 0 ? budget * gw[i] / weight : 0);
    want_a += algae[i];
    want_g += grass[i];
  }
  const double available_a = std::min(
                   {want_a, feeding_.supply_algae, std::max(0., niche_limit(4) - algae_energy())}),
               available_g = std::min(
                   {want_g, feeding_.supply_grass, std::max(0., niche_limit(5) - grass_energy())}),
               proposed = available_a + available_g;
  request_production(proposed, [this, algae = std::move(algae), grass = std::move(grass),
                                seedlings = std::move(seedlings), available_a, available_g, want_a,
                                want_g, proposed](double amount) mutable {
    const double share = amount / proposed, fa = want_a > 0 ? share * available_a / want_a : 0,
                 fg = want_g > 0 ? share * available_g / want_g : 0;
    double accepted = 0;
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
      if (seedlings[i] && !vegetation_.surfaces[i].stump &&
          !room_for_plant(vegetation_.surfaces[i])) {
        grass[i] = 0;
      }
      if (seedlings[i] && !vegetation_.surfaces[i].stump && grass[i] * fg > 0) {
        auto &s = vegetation_.surfaces[i];
        s.stump = true;
        s.plant_age = 0;
        s.organs.clear();
        s.vitality = 1;
        s.root_height = std::max(0., soil_depth(s) - grass_root_depth(s));
        s.grass_spread = time;
        seedlings[i] = false;
      } else if (seedlings[i] && !vegetation_.surfaces[i].stump) {
        grass[i] = 0;
      }
      vegetation_.surfaces[i].algae_grazed =
          std::max(0., vegetation_.surfaces[i].algae_grazed - algae[i] * fa);
      vegetation_.surfaces[i].grass_grazed =
          std::max(0., vegetation_.surfaces[i].grass_grazed - grass[i] * fg);
      vegetation_.surfaces[i].algae += algae[i] * fa;
      vegetation_.surfaces[i].grass += grass[i] * fg;
      accepted += algae[i] * fa + grass[i] * fg;
      vegetation_.algae_added += algae[i] * fa;
      vegetation_.grass_added += grass[i] * fg;
    }
    energy_available -= accepted;
    feeding_.food_allowance = std::max(0., feeding_.food_allowance - accepted);
    return accepted;
  });
  // Freeze only colonisation inputs. Capacity still observes earlier neighbours
  // in this step, so newly established colonies keep their existing influence.
  struct Colony {
    Point a, b, normal;
    double length, algae, grass, sediment;
    std::array<double, 4> traits;
    std::uint64_t owner, id, algae_spread, grass_spread;
    int edge, slot;
    bool stump;
  };
  std::vector<Colony> before;
  before.reserve(vegetation_.surfaces.size());
  for (const auto &s : vegetation_.surfaces)
    before.push_back({s.a, s.b, s.normal, s.length, s.algae, s.grass, s.sediment, s.grass_traits,
                      s.owner, s.id, s.algae_spread, s.grass_spread, s.edge, s.slot, s.stump});
  for (std::size_t i = 0; i < before.size(); ++i) {
    const auto &q = before[i];
    if (!q.stump && q.algae <= 0)
      continue;
    SurfacePatch s;
    s.a = q.a;
    s.b = q.b;
    s.normal = q.normal;
    s.length = q.length;
    s.owner = q.owner;
    s.edge = q.edge;
    s.slot = q.slot;
    s.id = q.id;
    s.stump = q.stump;
    s.algae = q.algae;
    s.grass = q.grass;
    s.sediment = q.sediment;
    s.grass_traits = q.traits;
    s.algae_open = vegetation_.surfaces[i].algae_open;
    s.algae_spread = q.algae_spread;
    s.grass_spread = q.grass_spread;
    auto p = midpoint(s);
    bool a = time - s.algae_spread >= 600 && s.algae_open[1] > s.algae_open[0] &&
             s.algae >= .5 * algae_max(*this, s),
         g = s.stump && s.sediment > 0 &&
             time - s.grass_spread >= (grass_form(s) == 0 ? 250 : 500) &&
             plant_light(light(p.x + s.normal.x * (soil_depth(vegetation_.surfaces[i]) + 1),
                               p.y + s.normal.y * (soil_depth(vegetation_.surfaces[i]) + 1))) > 0 &&
             s.grass >= .45 * grass_capacity(vegetation_.surfaces[i]);
    if (!a && !g)
      continue;
    std::vector<std::size_t> neighbors;
    vegetation_.surface_grid.nearby(p.x, p.y, 32, [&](std::uint32_t j) {
      if (j == i)
        return;
      const auto &q = vegetation_.surfaces[j];
      double gap = std::min({std::hypot(delta_x(s.a.x - q.a.x), s.a.y - q.a.y),
                             std::hypot(delta_x(s.a.x - q.b.x), s.a.y - q.b.y),
                             std::hypot(delta_x(s.b.x - q.a.x), s.b.y - q.a.y),
                             std::hypot(delta_x(s.b.x - q.b.x), s.b.y - q.b.y)});
      if (gap < .05 || (g && gap < 40 && q.owner == s.owner && q.edge == s.edge))
        neighbors.push_back(j);
    });
    std::sort(neighbors.begin(), neighbors.end(), [&](auto x, auto y) {
      return vegetation_.surfaces[x].id < vegetation_.surfaces[y].id;
    });
    for (auto j : neighbors) {
      auto &q = vegetation_.surfaces[j];
      if (g && !q.stump && grass_capacity(q) >= env_.seed_energy && q.sediment > 0 &&
          plant_light(light((q.a.x + q.b.x) * .5 + q.normal.x * (soil_depth(q) + 1),
                            (q.a.y + q.b.y) * .5 + q.normal.y * (soil_depth(q) + 1))) > 0 &&
          q.grass_max >= env_.seed_energy &&
          (q.algae <= 0 || q.algae < .25 * algae_max(*this, q)) &&
          vegetation_.surfaces[i].grass >= env_.seed_energy) {
        const auto old_traits = q.grass_traits;
        q.grass_traits = grass_offspring(s, q.id, time);
        if (!room_for_plant(q)) {
          q.grass_traits = old_traits;
          continue;
        }
        q.stump = true;
        q.plant_age = 0;
        q.organs.clear();
        q.vitality = 1;
        q.root_height = std::max(0., soil_depth(q) - grass_root_depth(q));
        q.grass = env_.seed_energy;
        q.grass_spread = time;
        vegetation_.surfaces[i].grass -= env_.seed_energy;
        vegetation_.surfaces[i].grass_spread = time;
        break;
      }
      if (a &&
          std::min(std::hypot(delta_x(s.a.x - q.b.x), s.a.y - q.b.y),
                   std::hypot(delta_x(s.b.x - q.a.x), s.b.y - q.a.y)) < .05 &&
          algae_light(light((q.a.x + q.b.x) * .5 + q.normal.x, (q.a.y + q.b.y) * .5 + q.normal.y)) >
              0 &&
          sediment_edges(j)[0] <= 1e-9 && sediment_edges(j)[1] <= 1e-9 && !q.stump &&
          q.algae == 0 && vegetation_.surfaces[i].algae >= env_.seed_energy) {
        q.algae = std::min(env_.seed_energy, algae_max(*this, q));
        vegetation_.surfaces[i].algae -= q.algae;
        q.algae_spread = time;
        vegetation_.surfaces[i].algae_spread = time;
        break;
      }
    }
  }
  vegetation_.growth_history.push_back({vegetation_.algae_added, vegetation_.grass_added});
  if (vegetation_.growth_history.size() > 200)
    vegetation_.growth_history.pop_front();
  if (!production_pending)
    index_plants(paced);
}
void Field::index_plants(bool paced, bool edited) {
  refresh_algae_exposure();
  vegetation_.plants.clear();
  vegetation_.plant_grid.reset(geometry_.width, geometry_.height);
  vegetation_.indexed_plant_radius = 8;
  lighting_.canopy_counts.assign(std::size_t(std::ceil(geometry_.width / 6)) *
                                     std::size_t(std::ceil(geometry_.height / 6)),
                                 0);
  if (!paced || vegetation_.plant_geometry_cache.size() != vegetation_.surfaces.size())
    vegetation_.plant_geometry_cache.assign(vegetation_.surfaces.size(), {});
  std::map<std::uint64_t, std::vector<const Mussel *>> shells;
  for (const auto &m : food_web_.mussels)
    if (m.energy > 0)
      shells[m.patch].push_back(&m);
  // Fund buds before deciding which cached shapes remain valid. A newly visible
  // organ must acquire geometry in this pass, not travel from (0, 0) on screen.
  for (auto &s : vegetation_.surfaces)
    if (s.stump)
      prepare_organs(s);
  // Edits follow the scheduled pass; only invalidated plants need shaping again.
  // A plant with a fish body near it (or one that was bent around a body) is shaped every pass.
  auto touched = [&](std::size_t i) {
    const auto &s = vegetation_.surfaces[i];
    const auto &cache = vegetation_.plant_geometry_cache[i];
    // Every third step, staggered between plants, is enough to follow a passing fish.
    if (paced && (s.id + time) % 3)
      return false;
    if (cache.bent)
      return true;
    if (env_.foliage_yield <= 0 || cache.parts.empty())
      return false;
    // Only a fish body reaching into the plant's current outline can bend it.
    double left = 1e30, right = -1e30, top = 1e30, bottom = -1e30;
    const double origin = cache.parts.front().x;
    for (const auto &q : cache.parts) {
      const double x = origin + delta_x(q.x - origin);
      left = std::min(left, x - q.radius);
      right = std::max(right, x + q.radius);
      top = std::min(top, q.y - q.radius);
      bottom = std::max(bottom, q.y + q.radius);
    }
    const double cx = (left + right) * .5, cy = (top + bottom) * .5;
    bool near = false;
    body_grid_.nearby(cx, cy, std::hypot(right - left, bottom - top) * .5 + indexed_body_radius_,
                      [&](std::uint32_t k) {
                        const auto &p = visible_[k];
                        if (near || p.kind != 1 || p.hidden || !p.hatched)
                          return;
                        const double dx = std::max(0., std::abs(delta_x(p.x - cx)) -
                                                           (right - left) * .5),
                                     dy = std::max(0., std::abs(p.y - cy) - (bottom - top) * .5);
                        near = dx * dx + dy * dy < p.radius * p.radius;
                      });
    return near;
  };
  auto fresh = [&](std::size_t i) {
    return !paced || vegetation_.plant_geometry_cache[i].empty() || touched(i) ||
           time < vegetation_.surfaces[i].boost_until ||
           (!edited &&
            vegetation_.surfaces[i].id % plant_shape_period == time % plant_shape_period) ||
           std::any_of(vegetation_.surfaces[i].organs.begin(), vegetation_.surfaces[i].organs.end(),
                       [](const auto &o) { return o.energy > 1e-9 && o.display_width <= 0; });
  };
  if (paced)
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i)
      if (vegetation_.surfaces[i].stump && !fresh(i))
        reserve_canopy(vegetation_.surfaces[i], vegetation_.plant_geometry_cache[i]);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    if (!s.stump)
      vegetation_.plant_geometry_cache[i].clear();
    if (s.algae > 0 && s.algae_open[1] > s.algae_open[0]) {
      const double thickness = algae_thickness(s);
      const auto over = shells.find(s.id);
      const double span = s.algae_open[1] - s.algae_open[0];
      int n = std::max(1, int(std::ceil(s.length * span / 8)));
      for (int k = 0; k < n; ++k) {
        const double t = s.algae_open[0] + span * (k + .5) / n;
        double height = thickness * .5;
        if (over != shells.end())
          for (const auto *m : over->second) {
            const double r = mussel_radius(m->energy, env_, m->morph),
                         d = (t - m->along) * s.length;
            if (std::abs(d) < r)
              height = std::max(height, 1.15 * r + thickness * .5);
          }
        vegetation_.plants.push_back({wrap_x(s.a.x + t * (s.b.x - s.a.x) + s.normal.x * height),
                                      s.a.y + t * (s.b.y - s.a.y) + s.normal.y * height,
                                      std::max(.1, thickness * .5), s.algae / n, i, 4});
      }
    }
    if (s.stump) {
      if (s.grass_traits[0] < 0)
        s.grass_traits = grass_traits(s);
      if (fresh(i)) {
        const bool bent = shape_organs(s);
        auto first = vegetation_.plants.size();
        index_organs(s, i);
        vegetation_.plant_geometry_cache[i].clear();
        vegetation_.plant_geometry_cache[i].bent = bent;
        vegetation_.plant_geometry_cache[i].parts.assign(vegetation_.plants.begin() + first,
                                                         vegetation_.plants.end());
      } else {
        std::array<int, 64> counts{};
        for (const auto &q : vegetation_.plant_geometry_cache[i].parts)
          if (q.organ >= 0 && std::size_t(q.organ) < s.organs.size())
            ++counts[q.organ];
        for (auto q : vegetation_.plant_geometry_cache[i].parts)
          if (q.organ >= 0 && std::size_t(q.organ) < s.organs.size() &&
              s.organs[q.organ].energy > 1e-9) {
            q.patch = i;
            q.energy = s.organs[q.organ].energy / counts[q.organ];
            vegetation_.plants.push_back(q);
          }
      }
    }
  }
  for (std::size_t i = 0; i < vegetation_.drifting_grass.size(); ++i) {
    auto &s = vegetation_.drifting_grass[i].plant;
    prepare_organs(s, true);
    index_organs(s, vegetation_.surfaces.size() + i);
  }

  sediment_.max_sediment_depth = 0;
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    const auto edges = sediment_edges(i);
    sediment_.max_sediment_depth = std::max({sediment_.max_sediment_depth, edges[0], edges[1]});
  }
  for (std::size_t i = 0; i < vegetation_.plants.size(); ++i) {
    vegetation_.indexed_plant_radius =
        std::max(vegetation_.indexed_plant_radius, vegetation_.plants[i].radius);
    vegetation_.plant_grid.add(vegetation_.plants[i].x, vegetation_.plants[i].y, i);
  }
  if (!paced || edited || time % 10 == 9)
    update_canopy_light();
}
double Field::surface_gap(double x, double y, double radius) const {
  double best = geometry_.height;
  vegetation_.surface_grid.nearby(x, y, radius + 40, [&](std::uint32_t i) {
    auto p = midpoint(vegetation_.surfaces[i]);
    best = std::min(best, std::max(0., std::hypot(delta_x(p.x - x), p.y - y) - radius));
  });
  return best;
}
bool Field::in_grass(double x, double y, double radius) const {
  bool found = false;
  vegetation_.plant_grid.nearby(
      x, y, radius + vegetation_.indexed_plant_radius, [&](std::uint32_t i) {
        const auto &p = vegetation_.plants[i];
        if (p.kind == 5 && stroke_distance(p, delta_x(x - p.x), y - p.y) <= radius)
          found = true;
      });
  return found;
}
Field::FoliageContact Field::foliage_contact(double x, double y, double radius) const {
  FoliageContact contact;
  if (radius <= 0)
    return contact;
  double tx = 0, ty = 0;
  vegetation_.plant_grid.nearby(
      x, y, radius + vegetation_.indexed_plant_radius, [&](std::uint32_t i) {
        const auto &p = vegetation_.plants[i];
        if (p.kind != 5)
          return;
        const double px = delta_x(x - p.x), py = y - p.y, w = stroke_width(p),
                     half = stroke_half_length(p), s = stroke_closest(p.hx, p.hy, px, py),
                     qx = px - s * p.hx, qy = py - s * p.hy, d = std::hypot(qx, qy);
        if (d >= radius + w)
          return;
        // The stroke's centre line inside the body, times its width.
        const double across =
            half > 1e-12 ? std::abs(p.hx * py - p.hy * px) / half : std::hypot(px, py);
        const double inside = std::min(
                         2 * std::sqrt(std::max(0., (radius + w) * (radius + w) - across * across)),
                         2 * (half + w)),
                     opacity =
                         [&] {
                           double passed = 0;
                           for (double depth : foliage_depth(p.organ_kind))
                             passed += std::exp2(-depth) / 3;
                           return 1 - passed;
                         }(),
                     share = opacity * inside * 2 * w / (PI * radius * radius);
        contact.cover += share;
        contact.stiffness += share * opacity;
        contact.blocked += opacity * inside / (2 * (radius + w));
        if (d > 1e-9) {
          tx -= share * qx / d;
          ty -= share * qy / d;
        }
      });
  const double norm = std::hypot(tx, ty);
  if (norm > 1e-12)
    contact.toward = {tx / norm, ty / norm};
  return contact;
}
std::array<double, 3> Field::grass_transmission(double x, double y, double tx, double ty) const {
  double dx = delta_x(tx - x), dy = ty - y, length = std::hypot(dx, dy);
  if (length < 1e-12)
    return {1, 1, 1};
  std::array<double, 3> depth{};
  vegetation_.plant_grid.nearby(
      x + dx * .5, (y + ty) * .5, length * .5 + vegetation_.indexed_plant_radius,
      [&](std::uint32_t i) {
        const auto &p = vegetation_.plants[i];
        if (p.kind != 5 || stroke_distance(p, delta_x(tx - p.x), ty - p.y) <= 0)
          return;
        const double crossing =
            stroke_optical_depth(delta_x(p.x - x), p.y - y, p.hx, p.hy, stroke_width(p), 1, dx, dy);
        if (crossing <= 0)
          return;
        const auto per = foliage_depth(p.organ_kind);
        for (int c = 0; c < 3; ++c)
          depth[c] += crossing * per[c];
      });
  return {std::exp2(-depth[0]), std::exp2(-depth[1]), std::exp2(-depth[2])};
}
double Field::view_ray(double x, double y, double ux, double uy, double reach) const {
  double best = std::min(reach, ray(x, y, ux, uy, 0, reach));
  if (sediment_.max_sediment_depth <= 0)
    return best;
  vegetation_.surface_grid.nearby(
      x + ux * best * .5, y + uy * best * .5, best * .5 + sediment_.max_sediment_depth + 16,
      [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -.5)
          return;
        auto e = sediment_edges(i);
        if (e[0] <= 0 && e[1] <= 0)
          return;
        double ax = delta_x(s.a.x + s.normal.x * e[0] - x), ay = s.a.y + s.normal.y * e[0] - y,
               dx = s.b.x - s.a.x + s.normal.x * (e[1] - e[0]),
               dy = s.b.y - s.a.y + s.normal.y * (e[1] - e[0]), det = ux * dy - uy * dx;
        if (std::abs(det) < 1e-12)
          return;
        double distance = (ax * dy - ay * dx) / det, t = (ax * uy - ay * ux) / det;
        if (distance >= 0 && distance < best && t >= 0 && t <= 1)
          best = distance;
      });
  return best;
}
Field::SedimentReadScope::SedimentReadScope(Field &f) : field(f) {
  if (f.reading_edges_)
    throw std::logic_error("Nested sediment read phase");
  f.read_edges_.resize(f.vegetation_.surfaces.size());
  for (std::size_t i = 0; i < f.read_edges_.size(); ++i)
    f.read_edges_[i] = f.sediment_edges(i);
  f.reading_edges_ = true;
}
std::array<double, 2> Field::sediment_edges(std::size_t i,
                                            const std::vector<double> *amounts) const {
  if (!amounts && reading_edges_)
    return read_edges_[i];
  const auto depth_at = [&](std::size_t k) {
    const auto &p = vegetation_.surfaces[k];
    return sediment_depth(amounts ? (*amounts)[k] : p.sediment, p.length);
  };
  const auto &s = vegetation_.surfaces[i];
  const double depth = depth_at(i);
  std::array<double, 2> edges{depth, depth};
  for (int side = 0; side < 2; ++side) {
    auto j = std::ptrdiff_t(i) + (side ? 1 : -1);
    bool adjacent = j >= 0 && j < std::ptrdiff_t(vegetation_.surfaces.size()) &&
                    vegetation_.surfaces[j].owner == s.owner &&
                    vegetation_.surfaces[j].edge == s.edge &&
                    vegetation_.surfaces[j].slot == s.slot + (side ? 1 : -1);
    if (adjacent) {
      auto sample = [&](std::ptrdiff_t k, std::ptrdiff_t fallback) {
        if (k < 0 || k >= std::ptrdiff_t(vegetation_.surfaces.size()))
          return depth_at(fallback);
        const auto &q = vegetation_.surfaces[k];
        return q.owner == s.owner && q.edge == s.edge && q.slot == s.slot + k - std::ptrdiff_t(i)
                   ? depth_at(k)
                   : depth_at(fallback);
      };
      const auto left = std::min(std::ptrdiff_t(i), j), right = left + 1;
      edges[side] = (sample(left - 1, left) + 3 * sample(left, left) + 3 * sample(right, right) +
                     sample(right + 1, right)) /
                    8;
    }
    edges[side] += std::min(1.5, .1 * edges[side]) * s.sediment_rim[side];
  }
  return edges;
}
double Field::sediment_immersion(double x, double y, double radius) const {
  if (sediment_.max_sediment_depth <= 0)
    return 0;
  double result = 0;
  vegetation_.surface_grid.nearby(
      x, y, sediment_.max_sediment_depth + radius + 16, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -.5)
          return;
        double px = delta_x(x - s.a.x), py = y - s.a.y, dx = s.b.x - s.a.x, dy = s.b.y - s.a.y,
               t = (px * dx + py * dy) / (s.length * s.length);
        if (t < -radius / s.length || t > 1 + radius / s.length)
          return;
        auto edges = sediment_edges(i);
        double depth = edges[0] + (edges[1] - edges[0]) * std::clamp(t, 0., 1.);
        if (depth <= 0)
          return;
        double gap = px * s.normal.x + py * s.normal.y;
        if (gap < -radius)
          return;
        double cover = radius > 0 ? std::clamp((depth - gap + radius) / (2 * radius), 0., 1.)
                                  : double(gap >= 0 && gap < depth);
        result = std::max(result, cover);
      });
  return result;
}
Point Field::sediment_velocity(Point v, double x, double y, double radius) const {
  const double immersion = sediment_immersion(x, y, radius),
               resistance = sediment_resistance(immersion),
               cloud = turbidity_resistance(turbidity(x, y));
  return {v.x / (resistance * cloud),
          v.y / (sediment_vertical_resistance(resistance, v.y) * cloud)};
}
double Field::sediment_transmission(double x, double y, double tx, double ty) const {
  double dx = delta_x(tx - x), dy = ty - y, d = std::hypot(dx, dy), integral = 0;
  int n = std::max(1, int(std::ceil(d / optical_sample_spacing)));
  for (int i = 0; i < n; ++i) {
    double t = (i + .5) / n;
    integral += optical_turbidity(x + t * dx, y + t * dy) * d / n;
  }
  if (sediment_.max_sediment_depth > 0)
    vegetation_.surface_grid.nearby(
        x + dx * .5, y + dy * .5, d * .5 + sediment_.max_sediment_depth + 16, [&](std::uint32_t i) {
          const auto &s = vegetation_.surfaces[i];
          if (s.normal.y > -.5)
            return;
          auto edges = sediment_edges(i);
          if (edges[0] <= 0 && edges[1] <= 0)
            return;
          double px = delta_x(x - s.a.x), py = y - s.a.y, sx = s.b.x - s.a.x, sy = s.b.y - s.a.y,
                 t = (px * sx + py * sy) / (s.length * s.length),
                 dt = (dx * sx + dy * sy) / (s.length * s.length),
                 gap = px * s.normal.x + py * s.normal.y, dg = dx * s.normal.x + dy * s.normal.y,
                 lo = 0, hi = 1;
          auto clip = [&](double a, double b) {
            if (std::abs(b) < 1e-12)
              return a >= 0;
            double crossing = -a / b;
            if (b > 0)
              lo = std::max(lo, crossing);
            else
              hi = std::min(hi, crossing);
            return hi > lo;
          };
          if (clip(t, dt) && clip(1 - t, -dt) && clip(gap, dg) &&
              clip(edges[0] + (edges[1] - edges[0]) * t - gap, (edges[1] - edges[0]) * dt - dg))
            integral += optical_density_scale * d * std::max(0., hi - lo);
        });
  return std::exp2(-integral / env_.sediment_path);
}
void Field::advance_sediment_bed(int period, double dx, double dy) {
  const int bed_period = period > 1 ? 10 : 1, bed_phase = period > 1 ? int(time % 10) : 0;
  std::vector<double> detritus_slide(vegetation_.surfaces.size()),
      worm_slide(vegetation_.surfaces.size());
  std::vector<double> sliding(vegetation_.surfaces.size()),
      stability(vegetation_.surfaces.size(), 1);
  for (std::size_t i = bed_phase; i < vegetation_.surfaces.size(); i += bed_period)
    if (vegetation_.surfaces[i].sediment > 0)
      stability[i] = root_stability(i);
  for (std::size_t i = bed_phase; i < vegetation_.surfaces.size(); i += bed_period) {
    const auto &s = vegetation_.surfaces[i];
    if (loose_sediment(s) <= 0 || s.normal.y > -.5)
      continue;
    auto p = midpoint(s);
    double depth = sediment_depth(s), top = p.y + s.normal.y * depth;
    // Subpixel films rest; a slide moves finite grains instead of an endless fractional trickle.
    if (depth <= .2)
      continue;
    double remaining = loose_sediment(s);
    for (int side : {-1, 1}) {
      auto j = std::ptrdiff_t(i) + side;
      double amount = 0;
      std::size_t material_target = i;
      if (j >= 0 && j < std::ptrdiff_t(vegetation_.surfaces.size()) &&
          vegetation_.surfaces[j].owner == s.owner && vegetation_.surfaces[j].edge == s.edge &&
          vegetation_.surfaces[j].slot == s.slot + side) {
        const auto &q = vegetation_.surfaces[j];
        auto m = midpoint(q);
        double drop = m.y + q.normal.y * sediment_depth(q) - top;
        amount =
            std::min(s.sediment * .1, .025 * std::max(0., drop - .25) /
                                          std::max(1., std::hypot(delta_x(m.x - p.x), m.y - p.y)) *
                                          s.sediment / std::min(3., stability[i]));
        if (amount > 0)
          amount = std::min(s.sediment * .4, std::max(.01 * s.length, bed_period * amount));
        const double equilibrium = std::max(0., drop) / (4 / s.length + 4 / q.length);
        amount = std::min({amount, remaining, .45 * equilibrium, .125 * s.length});
        sliding[j] += amount;
        material_target = std::size_t(j);
      } else {
        double overhang = std::max(0., side * (s.b.y - s.a.y) / s.length + depth / s.length);
        amount = std::min(
            s.sediment * .4,
            std::max(.01 * s.length,
                     bed_period * std::min(s.sediment * .15, .04 * overhang * s.sediment /
                                                                 std::min(3., stability[i]))));
        if (overhang <= 0)
          amount = 0;
        amount = std::min(amount, remaining);
        if (amount > 0) {
          auto edge = side > 0 ? s.b : s.a;
          // A lip blocks sideways creep below its rim.
          if (!free(edge.x + side * (s.b.x - s.a.x) / s.length * .6 + s.normal.x * depth,
                    edge.y + side * (s.b.y - s.a.y) / s.length * .6 + s.normal.y * depth, 0))
            continue;
          bool released = false;
          // Start beyond the unsupported lip, in an open cell that cannot settle straight back onto
          // it.
          for (int attempt = 1; attempt <= 4; ++attempt) {
            double distance = std::max(dx, dy) * attempt,
                   x = edge.x + side * (s.b.x - s.a.x) / s.length * distance + s.normal.x * .5,
                   y = edge.y + side * (s.b.y - s.a.y) / s.length * distance + s.normal.y * .5;
            auto target = cell_at(*this, x, y);
            const auto &support = vegetation_.surfaces[sediment_.sediment_floor[target]];
            if (sediment_.sediment_open[target] &&
                (support.owner != s.owner || support.edge != s.edge)) {
              sediment_.suspended[target] += amount;
              material_target = sediment_.sediment_floor[target];
              released = true;
              break;
            }
          }
          if (!released)
            amount = 0;
        }
      }
      const double fraction = amount / s.sediment;
      detritus_slide[i] -= fraction * s.detritus;
      worm_slide[i] -= fraction * s.worms;
      detritus_slide[material_target] += fraction * s.detritus;
      worm_slide[material_target] += fraction * s.worms;
      sliding[i] -= amount;
      remaining -= amount;
    }
  }
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    s.sediment = std::max(0., s.sediment + sliding[i]);
    s.detritus = std::max(0., s.detritus + detritus_slide[i]);
    s.worms = std::max(0., s.worms + worm_slide[i]);
  }
  for (std::size_t index = bed_phase; index < vegetation_.surfaces.size(); index += bed_period) {
    auto &s = vegetation_.surfaces[index];
    if (s.sediment <= 0)
      continue;
    auto p = midpoint(s);
    auto edges = sediment_edges(index);
    double lift = (edges[0] + edges[1]) * .5 + dy * .6;
    auto v = water_.velocity(p.x + s.normal.x * lift, p.y + s.normal.y * lift);
    double amount = std::min(loose_sediment(s),
                             bed_period * .05 * std::max(0., std::hypot(v.x, v.y) - .3) * s.length /
                                 16 / stability[&s - vegetation_.surfaces.data()]);
    s.sediment -= amount;
    sediment_.suspended[cell_at(*this, p.x + s.normal.x * lift, p.y + s.normal.y * lift)] += amount;
  }
}
void Field::advance_sediment(int phase, int period) {
  sync_environment();
  const int nx = sediment_.columns, ny = sediment_.rows;
  const double dx = geometry_.width / nx, dy = geometry_.height / ny;
  auto deposit = [&](std::size_t i, double amount) {
    const auto &s = vegetation_.surfaces[i];
    double own = amount;
    for (int offset : {-1, 1}) {
      const auto j = std::ptrdiff_t(i) + offset;
      if (j < 0 || j >= std::ptrdiff_t(vegetation_.surfaces.size()))
        continue;
      auto &q = vegetation_.surfaces[j];
      if (q.owner == s.owner && q.edge == s.edge && q.slot == s.slot + offset) {
        q.sediment += .25 * amount;
        own -= .25 * amount;
      }
    }
    vegetation_.surfaces[i].sediment += own;
  };
  std::vector<double> next =
      period == 1 ? std::vector<double>(sediment_.suspended.size()) : sediment_.suspended;
  for (int j = phase; j < ny; j += period)
    for (int i = 0; i < nx; ++i) {
      std::size_t at = j * nx + i;
      double m = sediment_.suspended[at];
      if (period > 1)
        next[at] -= m;
      if (m <= 0)
        continue;
      double x = (i + .5) * dx, y = (j + .5) * dy;
      auto v = water_.velocity(x, y);
      double tx = wrap_x(x + period * v.x),
             ty = std::clamp(y + period * (v.y + 20 * std::log(2.) / env_.sediment_half_life), .001,
                             geometry_.height - .001),
             distance = std::hypot(delta_x(tx - x), ty - y);
      const bool clear = sediment_.sediment_safe[at] && period * std::abs(v.x) <= dx * .5 &&
                         period * std::abs(v.y) <= dy * .5 && std::abs(ty - y) <= dy * .5;
      if (!clear && (!free(tx, ty, 0) ||
                     (distance > 0 && ray(x, y, delta_x(tx - x) / distance, (ty - y) / distance, 0,
                                          distance) < distance))) {
        tx = x;
        ty = y;
        double best = 0;
        for (int oy = 1; oy >= 0; --oy)
          for (int ox : {-1, 1}) {
            const int xx = (i + ox + nx) % nx, yy = std::min(ny - 1, j + oy);
            if (!(sediment_.sediment_links[at] & (1 << ((oy + 1) * 3 + ox + 1))))
              continue;
            const auto &support = vegetation_.surfaces[sediment_.sediment_floor[yy * nx + xx]];
            const double score =
                oy * 4 + (support.a.y + support.b.y) / geometry_.height + ox * v.x * .01;
            if (score > best) {
              best = score;
              // Slide a fraction of a cell per update; no instant sideways jumps.
              tx = wrap_x(x + ox * std::min(dx * .4, period * (.6 + std::abs(v.x))));
              ty = y + oy * std::min(dy * .4, period * .6);
            }
          }
      }
      double gx = tx / dx - .5, gy = std::clamp(ty / dy - .5, 0., double(ny - 1));
      int a = int(std::floor(gx)), b = int(std::floor(gy));
      double fx = gx - a, fy = gy - b;
      for (int sy = 0; sy < 2; ++sy)
        for (int sx = 0; sx < 2; ++sx) {
          int xx = (a + sx + nx) % nx, yy = std::min(ny - 1, b + sy);
          double weight = (sx ? fx : 1 - fx) * (sy ? fy : 1 - fy);
          auto dest = std::size_t(yy * nx + xx);
          if (!sediment_.sediment_open[dest])
            dest = at;
          else if (dest != at) {
            int sxcell = int(std::lround(delta_x((xx + .5) * dx - x) / dx)), sycell = yy - j;
            if (std::abs(sxcell) <= 1 && std::abs(sycell) <= 1) {
              if (!(sediment_.sediment_links[at] & (1 << ((sycell + 1) * 3 + sxcell + 1))))
                dest = at;
            } else {
              double vx = delta_x((xx + .5) * dx - x), vy = (yy + .5) * dy - y,
                     d = std::hypot(vx, vy);
              if (d > 0 && !clear_line(x, y, x + vx, y + vy) && ray(x, y, vx / d, vy / d, 0, d) < d)
                dest = at;
            }
          }
          next[dest] += m * weight;
        }
    }
  double fall = -std::expm1(-period * std::log(2.) / env_.sediment_half_life);
  for (std::size_t k = 0; k < next.size(); ++k) {
    if (int(k / nx) % period != phase)
      continue;
    if (next[k] <= 0)
      continue;
    const auto &support = vegetation_.surfaces[sediment_.sediment_floor[k]];
    double x = (k % nx + .5) * dx, y = (k / nx + .5) * dy,
           t = std::abs(support.b.x - support.a.x) > 1e-12
                   ? std::clamp(delta_x(x - support.a.x) / (support.b.x - support.a.x), 0., 1.)
                   : .5,
           sy = support.a.y + t * (support.b.y - support.a.y), depth = sediment_depth(support);
    // Invisible residual dust settles into its supporting bed, conserving mass.
    double amount = next[k] < 1e-4 ? next[k] : y + dy >= sy - depth ? next[k] * fall : 0;
    deposit(sediment_.sediment_floor[k], amount);
    next[k] -= amount;
  }
  sediment_.suspended = std::move(next);
  advance_sediment_bed(period, dx, dy);
  update_sediment_light();
}
void Field::stir_sediment(const Body &b) {
  if (!b.alive || !b.hatched || sediment_.suspended.empty())
    return;
  double radius = body_radius(b), best = env_.sediment_reach;
  std::size_t nearest = vegetation_.surfaces.size();
  vegetation_.surface_grid.nearby(
      b.x, b.y, radius + env_.sediment_reach + sediment_.max_sediment_depth + 16,
      [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.sediment <= 0)
          return;
        auto p = midpoint(s);
        double dx = delta_x(p.x - b.x), dy = p.y - b.y, d = std::hypot(dx, dy),
               gap = std::max(0., d - radius - sediment_depth(s));
        if (gap <= best && (d == 0 || ray(b.x, b.y, dx / d, dy / d, 0, d) >= d - .7)) {
          best = gap;
          nearest = i;
        }
      });
  if (nearest == vegetation_.surfaces.size())
    return;
  auto &s = vegetation_.surfaces[nearest];
  double m = body_mass(b),
         u = std::max(0., 1 - best / env_.sediment_reach) *
             (.02 * m * b.motor_.relative_speed * b.motor_.relative_speed +
              2 * m * std::max(0., b.motor_.thrust) + .1 * m * radius * std::abs(b.motor_.turn));
  double amount = std::min(loose_sediment(s), u / root_stability(nearest));
  s.sediment -= amount;
  auto p = midpoint(s);
  auto edges = sediment_edges(nearest);
  double lift = (edges[0] + edges[1]) * .5 + geometry_.height / sediment_.rows * .6;
  sediment_.suspended[cell_at(*this, p.x + s.normal.x * lift, p.y + s.normal.y * lift)] += amount;
}
bool Field::edit_environment(const std::string &mode, double x, double y, double radius,
                             int plant_type, double amount) {
  sync_environment();
  refresh_algae_exposure();
  bool changed = false;
  refresh_niche_limits();
  double remaining = std::min(energy_available, std::max(0., niche_limit(5) - grass_energy()));
  if (mode == "remove-plants") {
    auto before = vegetation_.drifting_grass.size();
    vegetation_.drifting_grass.erase(
        std::remove_if(
            vegetation_.drifting_grass.begin(), vegetation_.drifting_grass.end(),
            [&](const auto &d) { return std::hypot(delta_x(d.x - x), d.y - y) <= radius; }),
        vegetation_.drifting_grass.end());
    changed = before != vegetation_.drifting_grass.size();
  }
  vegetation_.surface_grid.nearby(x, y, radius + 16, [&](std::uint32_t i) {
    auto &s = vegetation_.surfaces[i];
    const bool exposed = mode == "algae";
    if (exposed && s.algae_open[1] <= s.algae_open[0])
      return;
    const double dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const double along = std::clamp((delta_x(x - s.a.x) * dx + (y - s.a.y) * dy) /
                                        std::max(1e-9, s.length * s.length),
                                    exposed ? s.algae_open[0] : 0., exposed ? s.algae_open[1] : 1.);
    const Point p{s.a.x + along * dx, s.a.y + along * dy};
    if (std::hypot(delta_x(p.x - x), p.y - y) > radius)
      return;
    if (mode == "grass" && !s.stump && grass_capacity(s) >= env_.seed_energy && s.sediment > 0 &&
        s.grass_max > 0 && (s.algae <= 0 || s.algae < .25 * algae_max(*this, s)) && remaining > 0) {
      auto local = grass_traits(s);
      s.grass_traits = {
          .6 * local[0] + .4 * rng.uniform(), .5 * local[1] + .5 * rng.uniform(), rng.uniform(),
          plant_type < 0 ? rng.uniform() : (std::clamp(plant_type, 0, 5) + rng.uniform()) / 6};
      if (!room_for_plant(s))
        return;
      s.stump = true;
      s.plant_age = 0;
      s.organs.clear();
      s.vitality = 1;
      s.root_height = std::max(0., soil_depth(s) - grass_root_depth(s));
      s.grass = std::min({remaining, grass_capacity(s), env_.seed_energy});
      remaining -= s.grass;
      energy_available -= s.grass;
      changed = true;
    }
    if (mode == "remove-plants") {
      changed = true;
      s.stump = false;
      s.root_height = -1;
      s.grass = s.algae = 0;
      s.organs.clear();
      s.vitality = 1;
    }
    if (mode == "algae" && !s.stump &&
        light(p.x + s.normal.x, p.y + s.normal.y) > algae_light_floor) {
      double add = std::min({energy_available, std::max(0., niche_limit(4) - algae_energy()),
                             std::max(0., algae_max(*this, s) - s.algae),
                             std::max(.1, .05 * algae_max(*this, s))});
      if (add > 0) {
        s.algae += add;
        energy_available -= add;
        changed = true;
      }
    }
    if (mode == "sediment" && s.normal.y <= -.5) {
      s.sediment += amount * s.length / 4;
      changed = true;
    }
    if (mode == "remove-sediment") {
      changed = true;
      s.sediment = 0;
      if (s.stump)
        uproot(s);
    }
  });
  index_plants();
  if (changed) {
    sync_food_web();
    refresh_niche_limits();
  }
  return changed;
}
void Field::set_suspended_sediment(std::size_t index, double amount) {
  if (!std::isfinite(amount) || amount < 0 || amount > 1e15)
    throw std::invalid_argument("invalid suspended sediment");
  sediment_.suspended.at(index) = amount;
}

}
