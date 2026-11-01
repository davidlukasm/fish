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
extern std::atomic<bool> cancelled;
extern std::size_t default_neural_budget;
constexpr std::size_t DIET_COUNT = 11;

constexpr double PI = 3.14159265358979323846;
constexpr double SIZE = 615, RANGE = 128, GENERATED_HALF_VIEW = PI * .65,
                 MAX_SPEED = behavior_scale::speed,
                 MAX_TURN = behavior_scale::turn_degrees * PI / 180, BODY_RADIUS = 4,
                 MAX_BODY_RADIUS = 32;
constexpr double RESERVE_ENERGY_PER_MASS = 300;
constexpr double QUERY_ENERGY_DIVISOR = 20000;
constexpr double MIN_SWIMMING_PULSE = .005;
constexpr double ENERGY_START = 120, ENERGY_MAX = 20000, FOOD_ENERGY = 20;
// Inherited traits run from 0 to 1; a body without the organ keeps the middle.
constexpr double TRAIT_MIDDLE = .5;
// Directions around the body for touch, flow, damage and spines.
constexpr std::size_t BODY_SECTORS = 16;
// A bite cycle lasts MOUTH_CYCLE_STEPS; the mouth closes at its half.
constexpr double MOUTH_CYCLE_STEPS = 8, MOUTH_HALF_CYCLE = MOUTH_CYCLE_STEPS / 2;
}
