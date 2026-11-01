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
// A fish sees with EYES eyes, left then right (eye).
inline constexpr int EYES = eye::count;
// A colour by its channels (rgb).
using Color = std::array<double, rgb::count>;
// Restored values beyond these magnitudes are corrupt: coordinates, rates and costs of one
// organism; amounts of one thing; running totals and forces; tank totals; accumulated sums.
inline constexpr double PLAUSIBLE_LOCAL = 1e6, PLAUSIBLE_AMOUNT = 1e9, PLAUSIBLE_RUNNING = 1e12,
                        PLAUSIBLE_TOTAL = 1e15, PLAUSIBLE_SUM = 1e24;
// Lengths and coordinates of grids and bodies stay within PLAUSIBLE_EXTENT, grids within
// PLAUSIBLE_GRID cells per side; water, food, drifting plants and corpses move at most
// MAX_DRIFT_SPEED per step.
inline constexpr double PLAUSIBLE_EXTENT = 10000, MAX_DRIFT_SPEED = 16;
inline constexpr int PLAUSIBLE_GRID = 2000;
extern std::atomic<bool> cancelled;
extern std::size_t default_neural_budget;
// The neural budget of a tank holds at most MAX_NEURAL_BUDGET connections.
inline constexpr std::size_t MAX_NEURAL_BUDGET = run_limit::max_neural_budget;
constexpr std::size_t DIET_COUNT = 11;
// Share lost after the given number of half-lives.
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
constexpr double SIZE = 615, RANGE = 128, GENERATED_HALF_VIEW = PI * .65,
                 MAX_SPEED = behavior_scale::speed,
                 MAX_TURN = radians(behavior_scale::turn_degrees), BODY_RADIUS = body_unit::radius,
                 MAX_BODY_RADIUS = body_unit::max_radius;
constexpr double RESERVE_ENERGY_PER_MASS = body_unit::reserve_energy_per_mass;
constexpr double QUERY_ENERGY_DIVISOR = 20000;
constexpr double MIN_SWIMMING_PULSE = .005;
constexpr double ENERGY_START = 120, ENERGY_MAX = 20000, FOOD_ENERGY = 20;
// Inherited traits run from 0 to 1; a body without the organ keeps the middle.
constexpr double TRAIT_MIDDLE = body_unit::trait_middle;
// Raised spines at most reach MAX_SPINE_EXTENT and multiply drag by 1 + SPINE_DRAG * extent.
constexpr double MAX_SPINE_EXTENT = .85, SPINE_DRAG = 2;
// Directions around the body for touch, flow, damage and spines.
constexpr std::size_t BODY_SECTORS = 16;
constexpr int SECTOR_COUNT = int(BODY_SECTORS);
// Centre angle of body sector k, counted from -PI.
inline double sector_angle(int k) {
  return -PI + (k + .5) * 2 * PI / SECTOR_COUNT;
}
// Position of a relative angle in sector units, 0 at the centre of sector 0.
inline double sector_position(double angle) {
  return (std::remainder(angle, 2 * PI) + PI) * SECTOR_COUNT / (2 * PI) - .5;
}
// A bite cycle lasts MOUTH_CYCLE_STEPS; the mouth closes at its half.
constexpr double MOUTH_CYCLE_STEPS = mouth_cycle::steps, MOUTH_HALF_CYCLE = MOUTH_CYCLE_STEPS / 2;
}
