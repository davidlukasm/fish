#include "ecology_internal.hh"
#include "waterborne.hh"
#include <numeric>
namespace fishsim {
void Ecosystem::refresh_sperm_field() {
  const auto &p = field.food_web().plankton;
  if (sperm.empty()) {
    field.set_sperm_field({}, physiology_.sperm_opaque);
    return;
  }
  std::vector<Field::SpermCell> total(p.energy.size());
  const double area = p.columns && p.rows ? p.width / p.columns * p.height / p.rows : 1;
  for (const auto &s : sperm)
    for (auto [at, mass] : s.cells)
      if (at < total.size()) {
        auto &q = total[at];
        q.density += mass / area;
        for (int c = 0; c < 3; ++c)
          q.color[c] += mass / area * s.color[c];
      }
  for (auto &q : total)
    if (q.density > 0)
      for (auto &c : q.color)
        c /= q.density;
  field.set_sperm_field(std::move(total), physiology_.sperm_opaque);
}
double Ecosystem::local_sperm(const Sperm &s, double x, double y) const {
  const auto &p = field.food_web().plankton;
  const auto sample = waterborne_sample(field, x, y);
  double out = 0;
  for (int k = 0; k < 4; ++k) {
    auto it = s.cells.find(std::uint32_t(sample.index[k]));
    if (it != s.cells.end())
      out += sample.weight[k] * it->second;
  }
  return p.columns && p.rows ? out / (p.width / p.columns * p.height / p.rows) : 0;
}
void Ecosystem::seed_sperm(Sperm &s) {
  field.sync_food_web();
  const auto &p = field.food_web().plankton;
  if (s.columns || !p.columns || !p.rows || s.energy <= 0)
    return;
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  const double radius = std::max(s.release_radius, .5 * std::hypot(dx, dy));
  std::map<std::uint32_t, double> weights;
  double total = 0;
  for (int j = std::max(0, int((s.y - radius) / dy));
       j <= std::min(p.rows - 1, int((s.y + radius) / dy)); ++j) {
    for (int i = int(std::floor((s.x - radius) / dx)); i <= int((s.x + radius) / dx); ++i) {
      const double x = (i + .5) * dx, y = (j + .5) * dy;
      const double distance = std::hypot(field.delta_x(x - s.x), y - s.y);
      const auto at = std::uint32_t(j * p.columns + (i % p.columns + p.columns) % p.columns);
      if (distance > radius || !field.plankton_water_cell(at) ||
          !waterborne_path(field, s.x, s.y, x, y))
        continue;
      const double weight = std::exp(-2 * distance * distance / (radius * radius));
      weights[at] += weight;
      total += weight;
    }
  }
  if (total <= 0) {
    const auto q = waterborne_sample(field, s.x, s.y);
    for (int k = 0; k < 4; ++k)
      if (q.weight[k] > 0) {
        weights[std::uint32_t(q.index[k])] += q.weight[k];
        total += q.weight[k];
      }
  }
  if (total <= 0)
    return;
  for (auto [at, weight] : weights)
    s.cells[at] = s.energy * weight / total;
  s.columns = p.columns;
  s.rows = p.rows;
  s.width = p.width;
  s.height = p.height;
}
void Ecosystem::sync_sperm_geometry() {
  field.sync_food_web();
  const auto &p = field.food_web().plankton;
  if (!p.columns || !p.rows)
    return;
  double before = 0;
  for (const auto &s : sperm)
    before += s.energy;
  WaterborneTransport transport(field, physiology_.sperm_mixing);
  for (auto &s : sperm) {
    s.x = field.wrap_x(s.x);
    s.y = std::clamp(s.y, 0., p.height);
    if (s.columns && s.rows &&
        (s.columns != p.columns || s.rows != p.rows || s.width != p.width ||
         s.height != p.height)) {
      std::map<std::uint32_t, double> moved;
      for (auto [at, mass] : s.cells) {
        double x = (at % s.columns + .5) * p.width / s.columns,
               y = (at / s.columns + .5) * p.height / s.rows;
        const auto q = waterborne_sample(field, x, y);
        for (int k = 0; k < 4; ++k)
          if (q.weight[k] > 0)
            moved[std::uint32_t(q.index[k])] += mass * q.weight[k];
      }
      s.cells = std::move(moved);
    } else if (!s.columns)
      seed_sperm(s);
    for (auto it = s.cells.begin(); it != s.cells.end();) {
      if (it->first >= p.energy.size() || !transport.wet(it->first))
        it = s.cells.erase(it);
      else
        ++it;
    }
    s.columns = p.columns;
    s.rows = p.rows;
    s.width = p.width;
    s.height = p.height;
    s.energy = std::accumulate(s.cells.begin(), s.cells.end(), 0.,
                               [](double sum, const auto &cell) { return sum + cell.second; });
  }
  sperm.erase(
      std::remove_if(sperm.begin(), sperm.end(), [](const Sperm &s) { return s.cells.empty(); }),
      sperm.end());
  double after = 0;
  for (const auto &s : sperm)
    after += s.energy;
  field.release_waterborne(before - after);
  refresh_sperm_field();
}
void Ecosystem::drift_sperm() {
  field.sync_food_web();
  const auto &p = field.food_web().plankton;
  if (!p.columns || !p.rows)
    return;
  if (sperm.empty()) {
    refresh_sperm_field();
    return;
  }
  WaterborneTransport transport(field, physiology_.sperm_mixing);
  sync_sperm_geometry();
  double initial = 0;
  for (const auto &s : sperm)
    initial += s.energy;
  for (auto &s : sperm)
    s.cells = transport.advance(s.cells);
  refresh_sperm_field();
  const auto &total = field.sperm_field();
  for (auto &s : sperm) {
    s.energy = 0;
    for (auto it = s.cells.begin(); it != s.cells.end();) {
      if (total[it->first].density < physiology_.sperm_dilution || it->second < 1e-12)
        it = s.cells.erase(it);
      else {
        s.energy += it->second;
        ++it;
      }
    }
  }
  sperm.erase(
      std::remove_if(sperm.begin(), sperm.end(), [&](const Sperm &s) { return s.cells.empty(); }),
      sperm.end());
  refresh_sperm_field();
  double remaining = 0;
  for (const auto &s : sperm)
    remaining += s.energy;
  field.release_waterborne(initial - remaining);
}
void Field::set_sperm_field(std::vector<SpermCell> cells, double opaque) {
  sperm_field_ = std::move(cells);
  sperm_opaque_ = opaque;
  has_sperm_ = std::any_of(sperm_field_.begin(), sperm_field_.end(),
                           [](const SpermCell &c) { return c.density > 0; });
  const auto &p = food_web_.plankton;
  sperm_occupied_.clear();
  if (!has_sperm_ || !p.columns || !p.rows)
    return;
  const auto stride = p.columns + 1;
  sperm_occupied_.assign(std::size_t(stride) * (p.rows + 1), 0);
  for (int y = 0; y < p.rows; ++y) {
    unsigned row = 0;
    for (int x = 0; x < p.columns; ++x) {
      row += sperm_field_[y * p.columns + x].density > 0;
      sperm_occupied_[(y + 1) * stride + x + 1] = row + sperm_occupied_[y * stride + x + 1];
    }
  }
}
bool Field::sperm_on_path(double x, double y, double tx, double ty) const {
  const auto &p = food_web_.plankton;
  if (!has_sperm_ || sperm_occupied_.empty())
    return false;
  // Reject empty rectangles before optical integration. Include the bilinear halo.
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  x = wrap_x(x);
  tx = x + delta_x(tx - x);
  int left = int(std::floor(std::min(x, tx) / dx - .5)),
      right = int(std::floor(std::max(x, tx) / dx - .5)) + 2,
      top = std::clamp(int(std::floor(std::min(y, ty) / dy - .5)), 0, p.rows),
      bottom = std::clamp(int(std::floor(std::max(y, ty) / dy - .5)) + 2, 0, p.rows);
  auto occupied = [&](int l, int r) {
    const auto stride = p.columns + 1;
    return l < r && sperm_occupied_[bottom * stride + r] + sperm_occupied_[top * stride + l] >
                        sperm_occupied_[top * stride + r] + sperm_occupied_[bottom * stride + l];
  };
  if (right - left >= p.columns)
    return occupied(0, p.columns);
  if (left < 0)
    return occupied(0, right) || occupied(left + p.columns, p.columns);
  if (right > p.columns)
    return occupied(left, p.columns) || occupied(0, right - p.columns);
  return occupied(left, right);
}
double Field::sperm_density(double x, double y) const {
  if (!has_sperm_)
    return 0;
  auto q = waterborne_sample(*this, x, y);
  double out = 0;
  for (int k = 0; k < 4; ++k)
    if (q.index[k] < sperm_field_.size())
      out += q.weight[k] * sperm_field_[q.index[k]].density;
  return out;
}
Field::SpermOptics Field::sperm_optics(double x, double y, double tx, double ty) const {
  SpermOptics out;
  const auto &p = food_web_.plankton;
  if (ink_density <= 0 || !sperm_on_path(x, y, tx, ty))
    return out;
  double dx = delta_x(tx - x), dy = ty - y, length = std::hypot(dx, dy);
  if (length <= 0)
    return out;
  // One sample per grid cell, interpolated straight from the open cells of the grid. Walls are
  // not traced for every sample: the cloud already stays in water, and the eye only sees it.
  const double cell_x = p.width / p.columns, cell_y = p.height / p.rows,
               spacing = std::min(cell_x, cell_y);
  int n = std::max(1, int(std::ceil(length / spacing)));
  double step = length / n;
  // Density is measured per pixel squared; optical coefficients refer to a 16 px path.
  double strength = std::clamp(ink_density, 0., .999999), scatterTransmission = 1;
  for (int k = 0; k < n; ++k) {
    double t = (k + .5) / n, px = x + t * dx, py = y + t * dy;
    if (py < 0 || py > p.height)
      continue;
    const double gx = wrap_x(px) / cell_x - .5,
                 gy = std::clamp(py / cell_y - .5, 0., double(p.rows - 1));
    const int i = int(std::floor(gx)), j = int(gy), a = (i + p.columns) % p.columns,
              b = (a + 1) % p.columns, below = std::min(j + 1, p.rows - 1);
    const std::size_t index[4] = {std::size_t(j * p.columns + a), std::size_t(j * p.columns + b),
                                  std::size_t(below * p.columns + a),
                                  std::size_t(below * p.columns + b)};
    const double fx = gx - i, fy = gy - j,
                 weight[4] = {(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy};
    double density = 0, total = 0;
    std::array<double, 3> pigment{};
    for (int c = 0; c < 4; ++c) {
      const auto at = index[c];
      if (at >= sperm_field_.size() || (at < p.open.size() && !p.open[at]))
        continue;
      total += weight[c];
      const auto &v = sperm_field_[at];
      if (v.density <= 0)
        continue;
      const double w = weight[c] * v.density;
      density += w;
      for (int h = 0; h < 3; ++h)
        pigment[h] += w * v.color[h];
    }
    if (density <= 0 || total <= 0)
      continue;
    density /= total;
    for (auto &h : pigment)
      h /= total;
    const double scatterTr =
        std::exp(std::log1p(-strength) * density / std::max(1e-12, sperm_opaque_) * step / 16);
    for (int c = 0; c < 3; ++c) {
      double color = pigment[c] / density,
             tr = std::exp(std::log1p(-strength * (1 - color)) * density /
                           std::max(1e-12, sperm_opaque_) * step / 16);
      out.scattering[c] += scatterTransmission * (1 - scatterTr) * light(px, py) * color;
      out.transmission[c] *= tr;
    }
    scatterTransmission *= scatterTr;
  }
  return out;
}
std::array<double, 3> Field::filter_sperm(double x, double y, double tx, double ty,
                                          std::array<double, 3> color) const {
  const auto q = sperm_optics(x, y, tx, ty);
  for (int c = 0; c < 3; ++c)
    color[c] *= q.transmission[c];
  return color;
}
}
