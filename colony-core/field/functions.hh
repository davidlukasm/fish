#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
namespace field {
// Measures of the body plan (body_geometry), in this order; head, chest, torso and face plans
// have PLAN_POINTS values each.
namespace body_metric {
constexpr std::size_t head_back = 0, head_length = 1, face_length = 2, rest_shoulder = 3,
                      face_width = 4, chest_length = 5, base_hind_length = 6, trunk = 7,
                      neck_width = 8, chest_phase = 9, center = 10, extent = 11, count = 12;
}
namespace body_plan_part {
constexpr std::size_t head = 0, chest = 1, torso = 2, face = 3, count = 4;
}
constexpr std::size_t PLAN_POINTS = 5;
constexpr int SENSE_COUNT = 11, MOTOR_COUNT = 10;
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
enum class Role { Sensor, Nerve, Effector };
enum Motor { Forward, Turn, Suction, Eggs, Sperm, Aggression, Defense, Pigment, Bladder, Gland };
inline float smooth(float x, float a, float b) {
  float t = std::clamp((x - a) / (b - a), 0.f, 1.f);
  return t * t * (3 - 2 * t);
}
struct Functions {
  float internal = 1, usable = 1;
  std::array<float, SENSE_COUNT> senses{};
  std::array<float, MOTOR_COUNT> motors{};
  float sensory() const {
    float s = 0;
    for (float v : senses)
      s += v;
    return s;
  }
  float motor() const {
    float s = 0;
    for (float v : motors)
      s += v;
    return s;
  }
  bool pure_sensor() const { return internal == 0 && motor() == 0 && sensory() > 0; }
};
}
