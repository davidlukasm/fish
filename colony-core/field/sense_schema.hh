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
// A brain develops at most DEVELOPMENT_SITES cells.
constexpr std::size_t DEVELOPMENT_SITES = 360;
// Cell time constants run from TIME_CONSTANT_MIN steps over TIME_CONSTANT_SPAN times that.
constexpr double TIME_CONSTANT_MIN = 4.0, TIME_CONSTANT_SPAN = 12.0;
// Pacemakers beat at least every TIME_CONSTANT_PACE_MIN steps.
constexpr double TIME_CONSTANT_PACE_MIN = 8.0;
// A tank runs on at most MAX_WORKERS threads.
constexpr int MAX_WORKERS = 64;
}
