#pragma once
#include "substrate.hh"
#include <numeric>
namespace field {
// Normalized optical bearings also locate colour layers in the retinal tissue.
inline std::vector<double> visual_bearings(const std::vector<Neuron> &cells) {
  std::vector<double> bearings;
  for (int u = 0; u < 4; ++u)
    for (int w = 0; w < 3; ++w)
      bearings.push_back(.5 * (1 - u / 3.) + .5 * w / 2.);
  std::sort(bearings.begin(), bearings.end());
  bearings.erase(std::unique(bearings.begin(), bearings.end(),
                             [](double a, double b) { return std::abs(a - b) < 1e-6; }),
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
struct RetinalCell {
  NeuronIndex neuron;
  std::array<std::uint32_t, 6> neighbors{};
  unsigned count = 0;
  float position = 0, transverse = 0;
};
inline std::vector<RetinalCell> retinal_tissue(const std::vector<Neuron> &cells) {
  const auto angles = visual_bearings(cells);
  std::vector<RetinalCell> retina;
  for (std::size_t i = 0; i < cells.size(); ++i)
    if (cells[i].role == Role::Sensor && cells[i].functions.senses[Light] > 0)
      retina.push_back({NeuronIndex(i), {}, 0, float(std::abs(angles[i])), cells[i].location.v});
  for (std::size_t i = 0; i < retina.size(); ++i) {
    auto &a = retina[i];
    std::vector<std::pair<double, std::uint32_t>> nearest;
    for (std::size_t j = 0; j < retina.size(); ++j) {
      const auto &b = retina[j];
      if (i == j || cells[a.neuron].location.side != cells[b.neuron].location.side)
        continue;
      const double dx = a.position - b.position, dy = .25 * (a.transverse - b.transverse);
      const double distance = dx * dx + dy * dy;
      if (distance <= .3 * .3)
        nearest.push_back({distance, std::uint32_t(j)});
    }
    const auto less = [&](const auto &x, const auto &y) {
      return x.first != y.first
                 ? x.first < y.first
                 : cells[retina[x.second].neuron].id < cells[retina[y.second].neuron].id;
    };
    const auto count = std::min(nearest.size(), a.neighbors.size());
    std::partial_sort(nearest.begin(), nearest.begin() + count, nearest.end(), less);
    a.count = unsigned(count);
    for (std::size_t j = 0; j < count; ++j)
      a.neighbors[j] = nearest[j].second;
  }
  return retina;
}
}
