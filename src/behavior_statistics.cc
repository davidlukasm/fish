#include "behavior_statistics.hh"
#include "individual.hh"
#include <numeric>
namespace fishsim {
namespace {
namespace F = behavior_feature_column;
namespace S = behavior_feature_set;
}
std::array<double, BEHAVIOR_FEATURES> BehaviorStatistics::descriptor() const {
  int cells = 0;
  for (auto v = visited; v; v &= v - 1)
    ++cells;
  double n = std::max(1, window_steps);
  std::array<double, BEHAVIOR_FEATURES> d{};
  d[F::travel] = window_travel / n / MAX_SPEED;
  d[F::turn] = window_turn / n / MAX_TURN;
  d[F::pauses] = window_pauses / n;
  d[F::range] = double(cells) / (VISIT_GRID * VISIT_GRID);
  d[F::pulses] = window_pulses / n;
  d[F::glides] = window_glides / n;
  const double food = std::accumulate(window_diet.begin(), window_diet.end(), 0.);
  if (food > 0)
    for (std::size_t i = 0; i < DIET_COUNT; ++i)
      d[S::diet[i]] = window_diet[i] / food;
  d[F::surface] = window_surface / n;
  d[F::grass] = window_grass / n;
  d[F::turbidity] = window_turbidity / n;
  d[F::current] = window_current / n;
  d[F::bottom] = window_bottom / n;
  d[F::top] = window_top / n;
  d[F::spawn] = window_spawn / n;
  d[F::sperm] = window_sperm / n;
  d[F::mouth] = window_mouth / n;
  d[F::aggression] = window_traits[window_trait::aggression] / n;
  d[F::defense] = window_traits[window_trait::defense] / n;
  for (std::size_t c = 0; c < window_trait::aggression; ++c)
    d[F::red + c] = window_traits[window_trait::color + c] / n;
  for (auto &value : d)
    value = std::clamp(value, 0., 1.);
  return d;
}
double behavior_distance(const std::array<double, BEHAVIOR_FEATURES> &a,
                         const std::array<double, BEHAVIOR_FEATURES> &b) {
  double result = 0;
  auto group = [&](const auto &members) {
    double squared = 0;
    for (std::size_t i : members) {
      double delta = a[i] - b[i];
      squared += delta * delta;
    }
    result += behavior::group_weight * std::sqrt(squared / members.size());
  };
  group(S::movement);
  group(S::habitat);
  group(S::reproduction);
  group(S::signals);
  double diet = 0;
  for (std::size_t i : S::diet)
    diet += std::abs(a[i] - b[i]);
  return result + behavior::group_weight * std::min(1., behavior::diet_scale * diet);
}

std::array<double, BEHAVIOR_FEATURES> Individual::behavior() const {
  return observations_.descriptor();
}
}
