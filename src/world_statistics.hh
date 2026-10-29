#pragma once
#include "ecology_types.hh"
namespace fishsim {
struct WorldStatistics {
  void record(std::uint64_t step, std::uint64_t window);
  PerformanceSample performance(std::uint64_t step) const;
  std::uint64_t corpses_eaten = 0;
  std::uint64_t collision_deaths = 0;
  std::array<std::uint64_t, 4> disease_cases{};
  std::uint64_t window_adult_deaths = 0;
  double window_food_nutrition = 0;
  PerformanceSample performance_total;
  std::deque<PerformanceSample> performance_history{{}};
  std::uint64_t fish_bites = 0;
  std::uint64_t predation_deaths = 0;
  std::uint64_t environment_tick = 0;
  std::uint64_t environment_births = 0;
  std::uint64_t environment_rescues = 0;
  std::uint64_t environment_imports = 0;
  int environment_adults = 0;
  std::uint64_t budget_rejections = 0;
  double dead_window_best = 0;
  std::uint64_t released_eggs = 0;
  std::uint64_t released_sperm = 0;
  std::uint64_t fertilisations = 0;
  std::uint64_t expired_eggs = 0;
  std::uint64_t clonal_starts = 0;
  std::uint64_t clonal_hatches = 0;
  std::uint64_t eggs_eaten = 0;
  std::uint64_t nutrient_eggs = 0;
  std::array<std::uint64_t, 8> death_causes{};
  std::uint64_t births = 0;
  std::uint64_t deaths = 0;
  std::uint64_t rescues = 0;
  std::uint64_t imports = 0;
  std::uint64_t window_exposure = 0;
  std::uint64_t window_births = 0;
  std::uint64_t window_deaths = 0;
  std::uint64_t window_rescues = 0;
  double window_nutrition = 0;
};
}
