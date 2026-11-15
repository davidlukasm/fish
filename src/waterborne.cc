#include "waterborne.hh"
#include "perception_state.hh"
namespace fishsim {
bool waterborne_path(const Field &f, double x, double y, double tx, double ty) {
  if (f.clear_line(x, y, tx, ty))
    return true;
  const double dx = f.delta_x(tx - x), dy = ty - y, distance = std::hypot(dx, dy);
  return distance <= tolerance::negligible ||
         f.ray(x, y, dx / distance, dy / distance, 0, distance) >= distance - tolerance::negligible;
}
namespace {
enum : unsigned char { UNKNOWN = 0, YES = 1, NO = 2 };
enum : unsigned char { MOVED = 1, DIFFUSED = 2 };
WaterborneSample sample_waterborne(const Field &f, double x, double y, WaterborneTransport *cache) {
  WaterborneSample out;
  const auto &p = f.food_web().plankton;
  if (!p.columns || !p.rows || y < 0 || y > p.height)
    return out;
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  double gx = f.wrap_x(x) / dx - .5, gy = std::clamp(y / dy - .5, 0., double(p.rows - 1));
  int i = int(std::floor(gx)), j = int(gy), a = (i + p.columns) % p.columns,
      b = (a + 1) % p.columns, k = std::min(j + 1, p.rows - 1);
  bool clear = false;
  if (cache) {
    auto &saved = cache->clear_samples[j * p.columns + a];
    if (!saved)
      saved = a != b && f.clear_line((i + .5) * dx, j ? (j + .5) * dy : 0, (i + 1.5) * dx,
                                     std::min(p.height - tolerance::negligible, (j + 1.5) * dy))
                  ? YES
                  : NO;
    clear = saved == YES;
  }
  if (!clear && !f.free(x, y, 0))
    return out;
  double fx = gx - i, fy = gy - j, sum = 0;
  out.index = {std::size_t(j * p.columns + a), std::size_t(j * p.columns + b),
               std::size_t(k * p.columns + a), std::size_t(k * p.columns + b)};
  out.weight = {(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy};
  for (int n = 0; n < SAMPLE_CORNERS; ++n) {
    const auto at = out.index[n];
    const double tx = x + f.delta_x((at % p.columns + .5) * dx - x),
                 ty = (at / p.columns + .5) * dy;
    if (!(cache ? cache->wet(at) : f.plankton_water_cell(at)) ||
        (!clear && !waterborne_path(f, x, y, tx, ty)))
      out.weight[n] = 0;
    sum += out.weight[n];
  }
  if (sum > 0)
    for (auto &w : out.weight)
      w /= sum;
  return out;
}
}
WaterborneSample waterborne_sample(const Field &f, double x, double y) {
  return sample_waterborne(f, x, y, nullptr);
}
std::array<int, 2> waterborne_grid_shape(double width, double height) {
  constexpr double min_cell = 24, cells = 12000;
  const double cell = std::max(min_cell, std::sqrt(width * height / cells));
  return {int(std::ceil(width / cell)), int(std::ceil(height / cell))};
}
double estimate_open_water_odor(Point offset, Point current, Point cell, double source_energy,
                                int channel, const EnvironmentParameters &p) {
  const Point drift{std::clamp(current.x * p.waterborne_drift, -cell.x, cell.x),
                    std::clamp(current.y * p.waterborne_drift, -cell.y, cell.y)};
  const double mixing = std::min(p.odor_mixing, MAX_DIFFUSION_SHARE * cell.x * cell.y),
               lifetime = p.odor_lifetimes().at(channel);
  // A fixed quadrature over ages of the continuous source. Each contribution spreads from the
  // place that the uniform stream has carried it to, with the variance of the grid's transport.
  const double half_offset = std::sqrt(3. / 5.) / 2;
  const std::array<double, 3> ages{.5 - half_offset, .5, .5 + half_offset};
  constexpr std::array<double, 3> weights{5. / 18, 4. / 9, 5. / 18};
  const auto variance = [mixing](double age, double step, double travel) {
    const double v = std::abs(travel);
    // Linear interpolation at both the source and the nose contributes step^2 / 3.
    return step * step / 3 + age * (2 * mixing + v * (step - v));
  };
  double sum = 0;
  for (std::size_t i = 0; i < ages.size(); ++i) {
    const double age = .5 + ages[i] * ODOR_PREVIEW_STEPS,
                 vx = variance(age, cell.x, drift.x), vy = variance(age, cell.y, drift.y),
                 x = offset.x - age * drift.x, y = offset.y - age * drift.y;
    sum += weights[i] * std::exp(-age / lifetime - .5 * (x * x / vx + y * y / vy)) /
           (2 * PI * std::sqrt(vx * vy));
  }
  return source_energy * p.odor_emission * ODOR_PREVIEW_STEPS * sum;
}
std::array<double, 2> Field::odor_probe(const SensoryProbe &probe,
                                        const std::array<Point, 2> &points, int channel) const {
  std::array<double, 2> result{};
  const auto &p = food_web_.plankton;
  if (!p.columns || !p.rows || probe.energy <= 0)
    return result;
  const double area = p.width / p.columns * p.height / p.rows;
  const auto source = waterborne_sample(*this, probe.x, probe.y);
  std::map<std::uint32_t, double> preview;
  WaterborneTransport transport(*this, env_.odor_mixing);
  for (int step = 0; step < ODOR_PREVIEW_STEPS; ++step) {
    for (int k = 0; k < SAMPLE_CORNERS; ++k)
      if (source.weight[k] > 0)
        preview[std::uint32_t(source.index[k])] +=
            env_.odor_emission * probe.energy / area * source.weight[k];
    preview = transport.advance(preview);
    for (auto &entry : preview)
      entry.second *= std::exp(-1. / env_.odor_lifetimes().at(channel));
  }
  for (std::size_t side = 0; side < points.size(); ++side) {
    const auto sample = waterborne_sample(*this, points[side].x, points[side].y);
    for (int k = 0; k < SAMPLE_CORNERS; ++k) {
      const auto it = preview.find(std::uint32_t(sample.index[k]));
      if (it != preview.end())
        result[side] += sample.weight[k] * it->second;
    }
  }
  return result;
}
WaterborneTransport::WaterborneTransport(const Field &f, double d)
    : field(f), velocity(f.food_web().plankton.energy.size()), sampled(velocity.size()),
      water(velocity.size()), clear_samples(velocity.size()),
      diffusion_rate(f.food_web().plankton.columns && f.food_web().plankton.rows
                         ? d * f.food_web().plankton.columns * f.food_web().plankton.rows /
                               (f.food_web().plankton.width * f.food_web().plankton.height)
                         : 0) {
}
WaterborneSample WaterborneTransport::sample(double x, double y) {
  return sample_waterborne(field, x, y, this);
}
Point WaterborneTransport::flow(std::size_t at) {
  if (!sampled[at]) {
    const auto &p = field.food_web().plankton;
    velocity[at] = field.water().velocity((at % p.columns + .5) * p.width / p.columns,
                                          (at / p.columns + .5) * p.height / p.rows);
    velocity[at] = {velocity[at].x * field.env().waterborne_drift,
                    velocity[at].y * field.env().waterborne_drift};
    sampled[at] = 1;
  }
  return velocity[at];
}
int WaterborneTransport::neighbor(int at, int d) const {
  return cell_neighbor(at, d, field.food_web().plankton.columns);
}
bool WaterborneTransport::wet(std::size_t at) {
  if (!water[at])
    water[at] = field.plankton_water_cell(at) ? YES : NO;
  return water[at] == YES;
}
bool WaterborneTransport::linked(std::size_t at, int d) {
  return side_linked(field.food_web().plankton.links[at], d) && wet(at) &&
         wet(std::size_t(neighbor(int(at), d)));
}
std::array<std::pair<std::size_t, double>, SAMPLE_CORNERS>
WaterborneTransport::destinations(std::size_t at) {
  const auto &p = field.food_web().plankton;
  auto w = flow(at);
  double fx = std::min(1., std::abs(w.x) / (p.width / p.columns)),
         fy = std::min(1., std::abs(w.y) / (p.height / p.rows));
  const int hd = w.x >= 0 ? cell_side::right : cell_side::left,
            vd = w.y >= 0 ? cell_side::down : cell_side::up, a = int(at);
  const int h = linked(at, hd) ? neighbor(a, hd) : a;
  const int v = linked(at, vd) ? neighbor(a, vd) : a;
  if (h == a)
    fx = 0;
  if (v == a)
    fy = 0;
  const int diagonal = h != a && v != a && linked(h, vd) && linked(v, hd) ? neighbor(h, vd) : a;
  return {{{at, (1 - fx) * (1 - fy)},
           {std::size_t(h), fx * (1 - fy)},
           {std::size_t(v), (1 - fx) * fy},
           {std::size_t(diagonal), fx * fy}}};
}
std::map<std::uint32_t, double>
WaterborneTransport::advance(const std::map<std::uint32_t, double> &source) {
  if (source.empty())
    return {};
  struct Scratch {
    std::vector<double> moved, next;
    std::vector<unsigned char> seen;
    std::vector<std::uint32_t> active, halo;
  };
  thread_local Scratch storage;
  auto &s = storage;
  const auto count = field.food_web().plankton.energy.size();
  s.moved.assign(count, 0.);
  s.next.assign(count, 0.);
  s.seen.assign(count, 0);
  s.active.clear();
  s.halo.clear();
  for (auto [at, mass] : source)
    for (auto [to, w] : destinations(at))
      if (w > 0) {
        if (!(s.seen[to] & MOVED)) {
          s.seen[to] |= MOVED;
          s.active.push_back(std::uint32_t(to));
        }
        s.moved[to] += mass * w;
      }
  std::sort(s.active.begin(), s.active.end());
  if (diffusion_rate > 0) {
    auto add = [&](std::uint32_t at, double amount) {
      if (!(s.seen[at] & DIFFUSED)) {
        s.seen[at] |= DIFFUSED;
        s.halo.push_back(at);
      }
      s.next[at] += amount;
    };
    for (auto at : s.active) {
      const double mass = s.moved[at];
      double retained = 1;
      for (int d = 0; d < cell_side::count; ++d)
        if (linked(at, d)) {
          auto n = std::uint32_t(neighbor(int(at), d));
          const double fraction = std::min(MAX_DIFFUSION_SHARE, diffusion_rate);
          add(n, mass * fraction);
          retained -= fraction;
        }
      add(at, mass * retained);
    }
    std::sort(s.halo.begin(), s.halo.end());
  }
  std::map<std::uint32_t, double> result;
  const auto &active = diffusion_rate > 0 ? s.halo : s.active;
  const auto &values = diffusion_rate > 0 ? s.next : s.moved;
  for (auto at : active)
    result.emplace_hint(result.end(), at, values[at]);
  return result;
}
}
