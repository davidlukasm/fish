#pragma once
#include "simulation_types.hh"
#include "hormone_observations.hh"
namespace fishsim {
constexpr std::size_t BEHAVIOR_FEATURES = 31;
struct BehaviorStatistics {
  HormoneMoments hormones, window_hormones;
  bool hormone_release_pending = false;
  double hormone_nutrition_sample = 0;
  bool neural_sampled = false; // transient: the current step executed the brain
  std::array<double, BEHAVIOR_FEATURES> descriptor() const;
  std::uint64_t visited = 0;
  std::uint64_t ecology_steps = 0;
  double drift_nutrition = 0;
  bool habitat_sampled = false;
  std::array<double, 5> habitat_totals{}, habitat_sample{}; // sample is transient
  std::array<double, DIET_COUNT> diet{}, raw_diet{};
  std::uint64_t habitat_steps = 0;
  std::uint64_t bottom_steps = 0;
  std::uint64_t top_steps = 0;
  std::array<double, DIET_COUNT> window_diet{};
  double window_surface = 0;
  double window_grass = 0;
  double window_turbidity = 0;
  double window_current = 0;
  std::uint64_t window_bottom = 0;
  std::uint64_t window_top = 0;
  std::uint64_t window_pulses = 0;
  std::uint64_t window_glides = 0;
  int window_corpses = 0;
  double window_mouth = 0;
  int window_food = 0;
  int window_steps = 0;
  int window_eggs = 0;
  double window_turn = 0;
  double window_travel = 0;
  int window_pauses = 0;
  double window_nutrition = 0;
  double window_prey_nutrition = 0;
  double window_spawn = 0;
  double window_sperm = 0;
  std::array<double, 5> window_traits{};
};
}
