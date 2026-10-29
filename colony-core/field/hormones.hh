#pragma once
#include <array>
#include <algorithm>
#include <cmath>
namespace field {
constexpr int HORMONES = 4, HORMONE_EFFECTS = 6;
enum HormoneEffect { Excitation, Learning, Competition, Eligibility, Rhythm, SensoryPattern };
// Bounds of the inherited receptor mapping, shared by glands and sensory receptors.
constexpr double HORMONE_SIGMA_MIN = .15, HORMONE_SIGMA_MAX = 2;
constexpr double HORMONE_HALF_MIN = .0003, HORMONE_HALF_MAX = .1;
using Hormones = std::array<double, HORMONES>;
inline std::array<float, HORMONES> hormone_affinity(float x, float y, float width) {
  std::array<float, HORMONES> a{};
  const double sigma = HORMONE_SIGMA_MIN +
                       (HORMONE_SIGMA_MAX - HORMONE_SIGMA_MIN) * std::clamp(double(width), 0., 1.);
  for (int k = 0; k < HORMONES; ++k) {
    const double dx = x - (k & 1 ? 1 : -1), dy = y - (k & 2 ? 1 : -1);
    a[k] = float(std::exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  }
  return a;
}
struct HormoneReceptor {
  std::array<float, HORMONES> affinity{};
  float baseline = 0, sensitivity = 0, half = .05;
  float response(const Hormones &h) const {
    double c = 0;
    for (int k = 0; k < HORMONES; ++k)
      c += affinity[k] * h[k];
    return std::clamp(baseline + sensitivity * float(c / (c + half)), -1.f, 1.f);
  }
};
}
