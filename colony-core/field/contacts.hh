#pragma once
#include "substrate.hh"
#include "development_sites.hh"
#include <algorithm>
#include <cmath>

namespace field {
inline constexpr double MIN_SEARCH = .03, MAX_SEARCH = 2;
struct ContactParameters {
  double probability = 0, affinity = 0;
};
// Shared by development and the Atelier's address planner. Body geometry, side preference and
// role restrictions retain exactly the same meaning in both.
inline ContactParameters contact_parameters(const Neuron &a, const Neuron &b, double body_length) {
  if (connection_kind(a, b) < 0)
    return {};
  const double dx = a.sender[0] - b.receiver[0], dy = a.sender[1] - b.receiver[1],
               sigma = MIN_SEARCH * std::pow(MAX_SEARCH / MIN_SEARCH, b.search_width),
               mu = std::exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)),
               distance = std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) +
                                    (a.z - b.z) * (a.z - b.z)) /
                          body_length,
               side = a.x == 0 || b.x == 0
                          ? 1
                          : std::clamp(1 + (a.x * b.x < 0 ? 1 : -1) * double(a.crossing), 0., 1.);
  return {mu * side * std::exp(-distance / (MIN_RANGE + (1 - MIN_RANGE) * a.range)), mu};
}
}
