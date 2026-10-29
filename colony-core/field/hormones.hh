#pragma once
#include <array>
#include <algorithm>
#include <cmath>
namespace field {
constexpr int HORMONES = 4, BLOOD_SUBSTANCES = 6, REGULATORS = 5, HORMONE_EFFECTS = 7;
enum HormoneEffect { Excitation, Learning, Competition, Eligibility, Rhythm, Output, Death };
constexpr double HORMONE_SIGMA_MIN = .15, HORMONE_SIGMA_MAX = 2;
constexpr double HORMONE_HALF_MIN = .0003, HORMONE_HALF_MAX = 1;
using Hormones = std::array<double, HORMONES>;
template <std::size_t N = HORMONES>
inline std::array<float, N> hormone_affinity(float x, float y, float width) {
  std::array<float, N> a{};
  const double sigma = HORMONE_SIGMA_MIN +
                       (HORMONE_SIGMA_MAX - HORMONE_SIGMA_MIN) * std::clamp(double(width), 0., 1.);
  for (std::size_t k = 0; k < N; ++k) {
    const double angle = 6.283185307179586 * double(k) / BLOOD_SUBSTANCES, dx = x - std::cos(angle),
                 dy = y - std::sin(angle);
    a[k] = float(std::exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  }
  return a;
}
struct HormoneReceptor {
  std::array<float, REGULATORS> affinity{};
  float baseline = 0, sensitivity = 0, half = .05;
  float response(const Hormones &h, double maturity = 0) const {
    double c = affinity[HORMONES] * maturity;
    for (int k = 0; k < HORMONES; ++k)
      c += affinity[k] * h[k];
    return std::clamp(baseline + sensitivity * float(c / (c + half)), -1.f, 1.f);
  }
};
}
