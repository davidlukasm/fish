#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include "sense_schema.hh"
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
// The points of a plan: length and width scales for every part; the head then sets its front
// handle and the lift of its front and back handles; chest and torso set their peak and the
// reach of their front and back handles; the face sets its handle width, handle reach and snout
// width; an eye sets its width, size and pupil.
namespace plan_point {
constexpr std::size_t length = 0, width = 1, head_handle = 2, head_front_lift = 3,
                      head_back_lift = 4, peak = 2, front_reach = 3, back_reach = 4,
                      face_handle_width = 2, face_handle = 3, snout_width = 4, eye_width = 2,
                      eye_size = 3, pupil = 4;
}
enum class Role { Sensor, Nerve, Effector };
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
