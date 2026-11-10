#pragma once
#include <cstddef>
namespace field {
enum Sense {
  Light,
  Odor,
  Flow,
  Touch,
  Proximity,
  Intake,
  Damage,
  BladderPressure,
  GonadPressure,
  InnerPressure,
  Blood
};
constexpr int SENSE_COUNT = 11;
enum Motor { Forward, Turn, Suction, Eggs, Sperm, Aggression, Defense, Pigment, Bladder, Gland };
constexpr int MOTOR_COUNT = 10;
namespace plan_point {
constexpr std::size_t length = 0;
constexpr std::size_t width = 1;
constexpr std::size_t head_handle = 2;
constexpr std::size_t head_front_lift = 3;
constexpr std::size_t head_back_lift = 4;
constexpr std::size_t peak = 2;
constexpr std::size_t front_reach = 3;
constexpr std::size_t back_reach = 4;
constexpr std::size_t face_handle_width = 2;
constexpr std::size_t face_handle = 3;
constexpr std::size_t snout_width = 4;
constexpr std::size_t eye_width = 2;
constexpr std::size_t eye_size = 3;
constexpr std::size_t pupil = 4;
}
constexpr std::size_t DEVELOPMENT_SITES = 720;
constexpr double TIME_CONSTANT_MIN = 4.0, TIME_CONSTANT_SPAN = 12.0;
constexpr double LEARNING_TIME_MIN = 4.0, LEARNING_TIME_SPAN = 128.0;
constexpr double TIME_CONSTANT_PACE_MIN = 8.0;
constexpr int MAX_WORKERS = 64;
}
