#pragma once
#include <algorithm>
#include <array>
#include <cmath>
namespace field {
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
