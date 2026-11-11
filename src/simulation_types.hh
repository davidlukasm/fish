#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <utility>
#include <vector>
#include "protocol_schema.hh"
namespace fishsim {
inline constexpr int EYES = eye::count;
using Color = std::array<double, rgb::count>;
inline constexpr double PLAUSIBLE_LOCAL = 1e6, PLAUSIBLE_AMOUNT = 1e9, PLAUSIBLE_RUNNING = 1e12,
                        PLAUSIBLE_TOTAL = 1e15, PLAUSIBLE_SUM = 1e24;
inline constexpr double PLAUSIBLE_EXTENT = 10000, MAX_DRIFT_SPEED = 16;
inline constexpr int PLAUSIBLE_GRID = 2000;
extern std::atomic<bool> cancelled;
extern std::size_t default_neural_budget;
inline constexpr std::size_t MAX_NEURAL_BUDGET = run_limit::max_neural_budget;
constexpr std::size_t DIET_COUNT = food_kind::count;
inline double half_life_loss(double half_lives) {
  return -std::expm1(-std::log(2.) * half_lives);
}

constexpr double PI = 3.14159265358979323846, HALF_TURN_DEGREES = 180;
constexpr double radians(double degrees) {
  return degrees * PI / HALF_TURN_DEGREES;
}
constexpr double degrees(double radians) {
  return radians * HALF_TURN_DEGREES / PI;
}
constexpr double SIZE = 615, RANGE = 128, GENERATED_HALF_VIEW = PI * vision::half_view,
                 MAX_SPEED = behavior_scale::speed,
                 MAX_TURN = radians(behavior_scale::turn_degrees), BODY_RADIUS = body_unit::radius,
                 MAX_BODY_RADIUS = body_unit::max_radius;
constexpr double RESERVE_ENERGY_PER_MASS = body_unit::reserve_energy_per_mass;
constexpr double QUERY_ENERGY_DIVISOR = 20000;
constexpr double MIN_SWIMMING_PULSE = .005;
constexpr double ENERGY_START = 120, ENERGY_MAX = 20000, FOOD_ENERGY = 20;
constexpr double TRAIT_MIDDLE = body_unit::trait_middle;
constexpr double MAX_SPINE_EXTENT = .85, SPINE_DRAG = 2;
constexpr std::size_t BODY_SECTORS = 16;
constexpr int SECTOR_COUNT = int(BODY_SECTORS);
inline double sector_angle(int k) {
  return -PI + (k + .5) * 2 * PI / SECTOR_COUNT;
}
// Position of a relative angle in sector units, 0 at the centre of sector 0.
inline double sector_position(double angle) {
  return (std::remainder(angle, 2 * PI) + PI) * SECTOR_COUNT / (2 * PI) - .5;
}
// A mouth muscle's usual stroke; at rest the jaw hangs a little open, and left alone it drifts
// back there over two strokes.
constexpr double MOUTH_CYCLE_STEPS = mouth_cycle::steps, MOUTH_HALF_CYCLE = MOUTH_CYCLE_STEPS / 2,
                 MOUTH_REST = mouth_cycle::rest, MOUTH_DRIFT = 1 / (2 * MOUTH_CYCLE_STEPS);
}
