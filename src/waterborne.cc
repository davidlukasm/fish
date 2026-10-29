#include "waterborne.hh"
#include "perception_state.hh"
namespace fishsim {
bool waterborne_path(const Field &f, double x, double y, double tx, double ty) {
  if (f.clear_line(x, y, tx, ty))
    return true;
  const double dx = f.delta_x(tx - x), dy = ty - y, distance = std::hypot(dx, dy);
  return distance <= 1e-9 ||
         f.ray(x, y, dx / distance, dy / distance, 0, distance) >= distance - 1e-9;
}
namespace {
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
                                     std::min(p.height - 1e-9, (j + 1.5) * dy))
                  ? 1
                  : 2;
    clear = saved == 1;
  }
  // Empty geometry bins prove every segment in this stencil is clear. Near walls
  // retain the point and ray checks; the cache lasts only for this transport step.
  if (!clear && !f.free(x, y, 0))
    return out;
  double fx = gx - i, fy = gy - j, sum = 0;
  out.index = {std::size_t(j * p.columns + a), std::size_t(j * p.columns + b),
               std::size_t(k * p.columns + a), std::size_t(k * p.columns + b)};
  out.weight = {(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy};
  for (int n = 0; n < 4; ++n) {
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
  for (int step = 0; step < 12; ++step) {
    for (int k = 0; k < 4; ++k)
      if (source.weight[k] > 0)
        preview[std::uint32_t(source.index[k])] +=
            env_.odor_emission * probe.energy / area * source.weight[k];
    preview = transport.advance(preview);
    for (auto &entry : preview)
      entry.second *= (channel < 7 ? std::exp(-1. / env_.odor_lifetimes().at(channel)) : 1.);
  }
  for (int side = 0; side < 2; ++side) {
    const auto sample = waterborne_sample(*this, points[side].x, points[side].y);
    for (int k = 0; k < 4; ++k) {
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
    sampled[at] = 1;
  }
  return velocity[at];
}
int WaterborneTransport::neighbor(int at, int d) const {
  int nx = field.food_web().plankton.columns, x = at % nx, y = at / nx;
  return d == 0   ? y * nx + (x + nx - 1) % nx
         : d == 1 ? y * nx + (x + 1) % nx
         : d == 2 ? at - nx
                  : at + nx;
}
bool WaterborneTransport::wet(std::size_t at) {
  if (!water[at])
    water[at] = field.plankton_water_cell(at) ? 1 : 2;
  return water[at] == 1;
}
bool WaterborneTransport::linked(std::size_t at, int d) {
  return (field.food_web().plankton.links[at] & (1 << d)) && wet(at) &&
         wet(std::size_t(neighbor(int(at), d)));
}
std::array<std::pair<std::size_t, double>, 4> WaterborneTransport::destinations(std::size_t at) {
  const auto &p = field.food_web().plankton;
  auto w = flow(at);
  double fx = std::min(1., std::abs(w.x) / (p.width / p.columns)),
         fy = std::min(1., std::abs(w.y) / (p.height / p.rows));
  const int hd = w.x >= 0 ? 1 : 0, vd = w.y >= 0 ? 3 : 2, a = int(at);
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
  std::map<std::uint32_t, double> moved, next;
  for (auto [at, mass] : source)
    for (auto [to, w] : destinations(at))
      if (w > 0)
        moved[std::uint32_t(to)] += mass * w;
  if (diffusion_rate <= 0)
    return moved;
  // Scatter diffusion from every transported destination, including its full halo.
  for (auto [at, mass] : moved) {
    double retained = 1;
    for (int d = 0; d < 4; ++d)
      if (linked(at, d)) {
        auto n = std::uint32_t(neighbor(int(at), d));
        double fraction = std::min(.2, diffusion_rate);
        next[n] += mass * fraction;
        retained -= fraction;
      }
    next[at] += mass * retained;
  }
  return next;
}
}
