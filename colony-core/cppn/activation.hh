#pragma once
#include "evolution/constants.hh"
#include "evolution/node_type.hh"
#include <cmath>

namespace cppn {
inline float activation(int t, float state, float bias) {
  auto type = evolution::NodeType(t);
  using evolution::NodeType;

  switch (type) {
  case NodeType::GAUSSIAN:
    if (bias == 0)
      bias = 1.0f;
    return std::exp(-(state * state) / (bias * bias * (1.0f / evolution::GAUSSIAN_SHARPNESS)));

  case NodeType::SINE:
    return std::sin(state * bias);

  case NodeType::COSINE:
    return std::cos(state * bias);

  case NodeType::LINEAR:
    return state * bias;

  case NodeType::SIGMOID:
    return 2.0f / (1.0f + std::exp(-state + bias)) - 1.0f;

  case NodeType::POW:
    return std::pow(state + bias / (evolution::WEIGHT_RANGE), 3.0f) /
           std::pow(evolution::WEIGHT_RANGE, 3.0f);
  case NodeType::ABS:
    return std::abs(state + bias);

  case NodeType::SIGN:
    return state + bias > 0 ? 1 : -1;

  case NodeType::STAIR:
    return std::trunc(state * bias);

  case NodeType::CUTOFF:
  default:
    return state > bias ? 1.0f : -1.0f;
  }
}
}
