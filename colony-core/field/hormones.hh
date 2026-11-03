#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include "functions.hh"
namespace field {
constexpr int HORMONES = 4, REGULATORS = 5, HORMONE_EFFECTS = 7;
// Blood carries the hormones, then maturity and the energy reserve.
constexpr int MATURITY_SUBSTANCE = HORMONES, RESERVE_SUBSTANCE = HORMONES + 1,
              BLOOD_SUBSTANCES = HORMONES + 2;
// Stimulus of a blood receptor with the given substance weights.
template <class Weights, class Levels>
double blood_stimulus(const Weights &weights, const Levels &levels, double maturity,
                      double reserve) {
  double stimulus = weights[MATURITY_SUBSTANCE] * maturity + weights[RESERVE_SUBSTANCE] * reserve;
  for (int k = 0; k < HORMONES; ++k)
    stimulus += weights[k] * levels[k];
  return stimulus;
}
enum HormoneEffect { Excitation, Learning, Competition, Eligibility, Rhythm, Output, Death };
// These are the only receptor queries the developmental engine evaluates for each cell role.
inline bool receptor_effect_supported(Role role, int effect) {
  return effect == Output || effect == Death || role == Role::Nerve ||
         (role == Role::Effector && effect == Excitation);
}
// A receptor query carries its effect as a code in (0, 1]; cells carry 0.
inline float receptor_effect_code(int effect) {
  return float(1 + effect) / HORMONE_EFFECTS;
}
constexpr double HORMONE_SIGMA_MIN = .15, HORMONE_SIGMA_MAX = 2;
constexpr double HORMONE_HALF_MIN = .0003, HORMONE_HALF_MAX = 1;
using Hormones = std::array<double, HORMONES>;
template <std::size_t N = HORMONES>
inline std::array<float, N> hormone_affinity(float x, float y, float width) {
  std::array<float, N> a{};
  const double sigma = HORMONE_SIGMA_MIN +
                       (HORMONE_SIGMA_MAX - HORMONE_SIGMA_MIN) * std::clamp(double(width), 0., 1.);
  for (std::size_t k = 0; k < N; ++k) {
    const double angle = 2 * M_PI * double(k) / BLOOD_SUBSTANCES, dx = x - std::cos(angle),
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
