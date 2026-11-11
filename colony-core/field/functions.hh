#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include "sense_schema.hh"
namespace field {
namespace body_metric {
constexpr std::size_t head_back = 0, head_length = 1, face_length = 2, rest_shoulder = 3,
                      face_width = 4, chest_length = 5, base_hind_length = 6, trunk = 7,
                      neck_width = 8, chest_phase = 9, center = 10, extent = 11, count = 12;
}
namespace body_plan_part {
constexpr std::size_t head = 0, chest = 1, torso = 2, face = 3, count = 4;
}
constexpr std::size_t PLAN_POINTS = 5;
enum class Role { Sensor, Nerve, Effector };
inline constexpr int ROLES = 3;
inline float smooth(float x, float a, float b) {
  float t = std::clamp((x - a) / (b - a), 0.f, 1.f);
  return t * t * (3 - 2 * t);
}
// Muscles pull the body or the mouth; the other motors release or secrete.
constexpr bool muscle_motor(int motor) {
  return motor == Forward || motor == Turn || motor == Suction || motor == Aggression;
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
  bool muscle() const {
    for (int k = 0; k < MOTOR_COUNT; ++k)
      if (motors[k] > 0 && muscle_motor(k))
        return true;
    return false;
  }
};
}
