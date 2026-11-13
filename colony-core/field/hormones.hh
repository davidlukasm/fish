#pragma once
#include <array>
#include <algorithm>
#include <cmath>
namespace field {
enum HormoneEffect {
  Excitation,
  Learning,
  Competition,
  Eligibility,
  Rhythm,
  Output,
  Death,
  Teaching,
  // Turns what a contact has just learned into a lasting state that resists competition and
  // forgetting; a negative level makes consolidated contacts pliable again.
  Consolidation,
  HORMONE_EFFECTS
};
constexpr int HORMONES = 6, REGULATORS = HORMONES + 1;
// Besides the hormones the blood carries what the body reports of itself: its maturity, its
// energy reserve and the exhaustion of its fast muscle fibres.
constexpr int MATURITY_SUBSTANCE = HORMONES, RESERVE_SUBSTANCE = HORMONES + 1,
              FATIGUE_SUBSTANCE = HORMONES + 2, BLOOD_SUBSTANCES = HORMONES + 3;
// Each substance's place on the wheel, in turns from the right, counterclockwise. Blueprints
// compile their receptors to these places and genomes carry them, so a place moves only with every
// shipped genome rebuilt. The hormones share three quarters of the wheel evenly, from the right
// round to the bottom; the body's own three signals share the last quarter, lower right, as evenly,
// so that quarter is narrower but even.
constexpr double HORMONE_ARC = .75, BODY_ARC = 1 - HORMONE_ARC;
constexpr double HORMONE_STEP = HORMONE_ARC / (HORMONES - 1),
                 BODY_STEP = BODY_ARC / (BLOOD_SUBSTANCES - HORMONES + 1);
constexpr std::array<double, BLOOD_SUBSTANCES> SUBSTANCE_TURNS{0 * HORMONE_STEP,
                                                               1 * HORMONE_STEP,
                                                               2 * HORMONE_STEP,
                                                               3 * HORMONE_STEP,
                                                               4 * HORMONE_STEP,
                                                               5 * HORMONE_STEP,
                                                               HORMONE_ARC + 1 * BODY_STEP,
                                                               HORMONE_ARC + 2 * BODY_STEP,
                                                               HORMONE_ARC + 3 * BODY_STEP};
inline double substance_angle(int k) {
  return 2 * M_PI * SUBSTANCE_TURNS[std::size_t(k)];
}
constexpr int GROWTH_RECEPTOR = HORMONE_EFFECTS, RECEPTOR_QUERIES = HORMONE_EFFECTS + 1;
template <class Weights, class Levels>
double blood_stimulus(const Weights &weights, const Levels &levels, double maturity, double reserve,
                      double fatigue) {
  double stimulus = weights[MATURITY_SUBSTANCE] * maturity + weights[RESERVE_SUBSTANCE] * reserve +
                    weights[FATIGUE_SUBSTANCE] * fatigue;
  for (int k = 0; k < HORMONES; ++k)
    stimulus += weights[k] * levels[k];
  return stimulus;
}
inline float receptor_effect_code(int query) {
  return float(1 + query) / RECEPTOR_QUERIES;
}
constexpr double HORMONE_SIGMA_MIN = .15, HORMONE_SIGMA_MAX = 2;
constexpr double HORMONE_HALF_MIN = .0003, HORMONE_HALF_MAX = 1;
// A receptor's sensitivity spans HORMONE_SENSITIVITY_SPAN times its CPPN output (-1..1), so that
// one receptor can turn an effect fully off and on: R from -1 to +1.
constexpr float HORMONE_SENSITIVITY_SPAN = 2;
constexpr float HORMONE_STEEPNESS_SPAN = 3;
using Hormones = std::array<double, HORMONES>;
template <std::size_t N = HORMONES>
inline std::array<float, N> hormone_affinity(float x, float y, float width) {
  std::array<float, N> a{};
  const double sigma = HORMONE_SIGMA_MIN +
                       (HORMONE_SIGMA_MAX - HORMONE_SIGMA_MIN) * std::clamp(double(width), 0., 1.);
  for (std::size_t k = 0; k < N; ++k) {
    const double angle = substance_angle(int(k)), dx = x - std::cos(angle),
                 dy = y - std::sin(angle);
    a[k] = float(std::exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  }
  return a;
}
struct HormoneReceptor {
  std::array<float, REGULATORS> affinity{};
  float baseline = 0, sensitivity = 0, half = .05;
  // The answer rises with the concentration to the power 2^steepness.
  float steepness = 0;
  float bound(double c) const {
    const double x = std::pow(c / half, std::exp2(steepness));
    return float(x / (1 + x));
  }
  float response(const Hormones &h, double maturity = 0) const {
    double c = affinity[MATURITY_SUBSTANCE] * maturity;
    for (int k = 0; k < HORMONES; ++k)
      c += affinity[k] * h[k];
    return std::clamp(baseline + sensitivity * bound(c), -1.f, 1.f);
  }
  float occupancy(const Hormones &h) const {
    double c = 0;
    for (int k = 0; k < HORMONES; ++k)
      c += affinity[k] * h[k];
    return std::clamp(sensitivity * bound(c), 0.f, 1.f);
  }
};
}
