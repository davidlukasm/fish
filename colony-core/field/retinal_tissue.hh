#pragma once
#include "substrate.hh"
#include "development_sites.hh"
#include <map>
#include <numeric>
namespace field {
// Normalized optical bearings also locate colour layers in the retinal tissue.
inline std::vector<double> visual_bearings(const std::vector<Neuron> &cells) {
  constexpr double BEARING_PRECISION = 1e-6;
  std::vector<double> bearings;
  const auto &lattice = DEVELOPMENT_LATTICE[EYE_ZONE];
  for (int u = 0; u < lattice[0]; ++u)
    for (int w = 0; w < lattice[2]; ++w)
      bearings.push_back(.5 * (1 - double(u) / (lattice[0] - 1)) +
                         .5 * double(w) / (lattice[2] - 1));
  std::sort(bearings.begin(), bearings.end());
  bearings.erase(
      std::unique(bearings.begin(), bearings.end(),
                  [](double a, double b) { return std::abs(a - b) < BEARING_PRECISION; }),
      bearings.end());
  std::size_t groups = 0;
  for (const auto &n : cells)
    groups = std::max(groups, std::size_t(n.group) + 1);
  std::vector<int> copies(groups, 0), ordinal(groups, 0);
  for (const auto &n : cells)
    ++copies[n.group];
  std::vector<double> angles(cells.size(), 0);
  for (std::size_t c = 0; c < cells.size(); ++c) {
    const auto &n = cells[c];
    if (n.role != Role::Sensor || n.functions.senses[Light] + n.functions.senses[Proximity] <= 0)
      continue;
    const double base = .5 * (1 - n.location.u) + .5 * n.location.w;
    const auto i = std::size_t(std::min_element(bearings.begin(), bearings.end(),
                                                [&](double a, double b) {
                                                  return std::abs(a - base) < std::abs(b - base);
                                                }) -
                               bearings.begin());
    const double lo = i ? .5 * (bearings[i - 1] + bearings[i]) : 0,
                 hi = i + 1 < bearings.size() ? .5 * (bearings[i + 1] + bearings[i]) : 1;
    angles[c] = n.location.side * (lo + (hi - lo) * (ordinal[n.group]++ + .5) / copies[n.group]);
  }
  return angles;
}
inline std::vector<RetinalCell> retinal_tissue(const std::vector<Neuron> &cells,
                                               const std::vector<unsigned char> *active = nullptr) {
  const auto angles = visual_bearings(cells);
  std::vector<RetinalCell> retina;
  for (std::size_t i = 0; i < cells.size(); ++i)
    if ((!active || (*active)[i]) && cells[i].role == Role::Sensor &&
        cells[i].functions.senses[Light] > 0) {
      const auto &cell = cells[i];
      const double tau = time_constant_steps(cell.parameters);
      retina.push_back({NeuronIndex(i),
                        {},
                        0,
                        float(std::abs(angles[i])),
                        cell.location.v,
                        1 - cell.parameters.threshold,
                        std::exp(-retinal_dynamics::activity_decay / tau),
                        std::exp(-1 / (retinal_dynamics::recovery_span * tau))});
    }
  struct Column {
    float position;
    std::array<std::uint32_t, retinal_dynamics::neighbors + 1> cells{};
    unsigned count = 0;
  };
  using Row = std::vector<Column>;
  std::array<std::map<float, Row>, 2> rows;
  std::vector<std::uint32_t> order(retina.size());
  std::iota(order.begin(), order.end(), 0);
  std::sort(order.begin(), order.end(), [&](auto x, auto y) {
    const auto &a = retina[x], &b = retina[y];
    return a.position != b.position ? a.position < b.position
                                    : cells[a.neuron].id < cells[b.neuron].id;
  });
  for (auto i : order) {
    const auto &cell = retina[i];
    auto &row = rows[cells[cell.neuron].location.side > 0][cell.transverse];
    if (row.empty() || row.back().position != cell.position)
      row.push_back({cell.position});
    auto &column = row.back();
    // Six nearest neighbours need at most seven coincident cells, including self.
    if (column.count < column.cells.size())
      column.cells[column.count++] = i;
  }
  for (std::size_t i = 0; i < retina.size(); ++i) {
    auto &a = retina[i];
    using Candidate = std::pair<double, std::uint32_t>;
    std::array<Candidate, retinal_dynamics::neighbors> nearest{};
    auto less = [&](const auto &x, const auto &y) {
      return x.first != y.first
                 ? x.first < y.first
                 : cells[retina[x.second].neuron].id < cells[retina[y.second].neuron].id;
    };
    for (const auto &[transverse, row] : rows[cells[a.neuron].location.side > 0]) {
      const double dy = retinal_dynamics::transverse_scale * (a.transverse - transverse);
      if (std::abs(dy) > retinal_dynamics::radius)
        continue;
      const auto split =
          std::size_t(std::lower_bound(row.begin(), row.end(), a.position,
                                       [](const Column &c, float p) { return c.position < p; }) -
                      row.begin());
      for (int direction : {-1, 1}) {
        int at = int(split) - (direction < 0);
        unsigned visited = 0;
        while (at >= 0 && std::size_t(at) < row.size() && visited < retinal_dynamics::neighbors) {
          const auto &column = row[std::size_t(at)];
          const double dx = a.position - column.position, distance = dx * dx + dy * dy;
          if (distance > retinal_dynamics::radius * retinal_dynamics::radius)
            break;
          for (unsigned k = 0; k < column.count && visited < retinal_dynamics::neighbors; ++k) {
            const auto j = column.cells[k];
            if (j == i)
              continue;
            ++visited;
            const Candidate candidate{distance, j};
            const auto end = nearest.begin() + a.count;
            const auto place = std::lower_bound(nearest.begin(), end, candidate, less);
            if (place == nearest.end())
              continue;
            const auto tail = a.count < nearest.size() ? end : nearest.end() - 1;
            std::move_backward(place, tail, tail + 1);
            *place = candidate;
            a.count = std::min(unsigned(nearest.size()), a.count + 1);
          }
          at += direction;
        }
      }
    }
    for (unsigned j = 0; j < a.count; ++j)
      a.neighbors[j] = nearest[j].second;
  }
  return retina;
}
}
