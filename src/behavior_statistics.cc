#include "behavior_statistics.hh"
#include "individual.hh"
#include <numeric>
namespace fishsim {
std::array<double, BEHAVIOR_FEATURES> BehaviorStatistics::descriptor() const {
  int cells = 0;
  for (auto v = visited; v; v &= v - 1)
    ++cells;
  double n = std::max(1, window_steps);
  std::array<double, BEHAVIOR_FEATURES> d{window_travel / n / MAX_SPEED,
                                          window_turn / n / MAX_TURN,
                                          window_pauses / n,
                                          cells / 64.,
                                          window_pulses / n,
                                          window_glides / n};
  const double food = std::accumulate(window_diet.begin(), window_diet.end(), 0.);
  if (food > 0)
    for (int i = 0; i < 4; ++i)
      d[6 + i] = window_diet[i] / food;
  if (food > 0) {
    d[20] = window_diet[4] / food;
    d[21] = window_diet[5] / food;
  }
  if (food > 0)
    for (std::size_t i = 6; i < DIET_COUNT; ++i)
      d[20 + i] = window_diet[i] / food;
  d[22] = window_surface / n;
  d[23] = window_grass / n;
  d[24] = window_turbidity / n;
  d[25] = window_current / n;
  d[10] = window_bottom / n;
  d[11] = window_top / n;
  d[12] = window_spawn / n;
  d[13] = window_sperm / n;
  d[14] = window_mouth / n;
  d[15] = window_traits[3] / n;
  d[16] = window_traits[4] / n;
  for (int c = 0; c < 3; ++c)
    d[17 + c] = window_traits[c] / n;
  for (auto &value : d)
    value = std::clamp(value, 0., 1.);
  return d;
}
double behavior_distance(const std::array<double, BEHAVIOR_FEATURES> &a,
                         const std::array<double, BEHAVIOR_FEATURES> &b) {
  double result = 0;
  constexpr int groups[4][6] = {{0, 1, 2, 3, 4, 5},
                                {10, 11, 22, 23, 24, 25},
                                {12, 13},
                                {14, 15, 16, 17, 18, 19}},
                sizes[4] = {6, 6, 2, 6};
  for (int g = 0; g < 4; ++g) {
    double squared = 0;
    for (int k = 0; k < sizes[g]; ++k) {
      int i = groups[g][k];
      double delta = a[i] - b[i];
      squared += delta * delta;
    }
    result += .2 * std::sqrt(squared / sizes[g]);
  }
  double diet = 0;
  for (int i : {6, 7, 8, 9, 20, 21, 26, 27, 28, 29, 30})
    diet += std::abs(a[i] - b[i]);
  return result + .2 * std::min(1., .5 * diet);
}

std::array<double, BEHAVIOR_FEATURES> Individual::behavior() const {
  return observations_.descriptor();
}
}
