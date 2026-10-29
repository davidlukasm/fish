#pragma once
#include <algorithm>
#include <array>
#include <cmath>
namespace field {
constexpr int SENSE_COUNT = 11, MOTOR_COUNT = 10;
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
inline Functions cell_functions(const std::array<float, 5> &u) {
  Functions f;
  float r = 0;
  for (float v : u)
    r = std::max(r, std::abs(v));
  if (r == 0)
    return f;
  const float g = smooth(r, .25f, .75f) * smooth(std::abs(u[0] / r), .10f, .40f);
  f.internal = 1 - g;
  float q[4];
  for (int j = 0; j < 4; ++j)
    q[j] = std::clamp((u[j + 1] / r + 1) * .5f, 0.f, 1.f);
  if (u[0] < 0) {
    constexpr int sense[16] = {0, 0, 0, 7, 2, 2, 2, 9, 10, 1, 1, 3, 8, 5, 4, 6};
    for (int c = 0; c < 16; ++c) {
      float w = g;
      for (int j = 0; j < 4; ++j)
        w *= c & (1 << (3 - j)) ? q[j] : 1 - q[j];
      f.senses[sense[c]] += w;
    }
  } else if (u[0] > 0) {
    const float a = std::max(0.f, 1 - q[0] - q[1]), b = std::max(0.f, q[0] + q[1] - 1),
                c = std::min(q[1], 1 - q[0]), d = std::min(q[0], 1 - q[1]), z = q[2], w = q[3];
    f.motors = {g * a * (1 - z),     g * b * (1 - z), g * (c + d) * (1 - z) * (1 - w),
                g * c * z * (1 - w), g * c * z * w,   g * a * z,
                g * b * z,           g * d * z,       g * c * (1 - z) * w,
                g * d * (1 - z) * w};
  }
  auto clean = [](float p) { return p * smooth(p, .10f, .15f); };
  float total = f.internal = clean(f.internal);
  for (auto &p : f.senses)
    total += (p = clean(p));
  for (auto &p : f.motors)
    total += (p = clean(p));
  f.usable = total;
  f.internal /= total;
  for (auto &p : f.senses)
    p /= total;
  for (auto &p : f.motors)
    p /= total;
  return f;
}
}
