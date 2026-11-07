#pragma once
#include "evolution/constants.hh"
#include "evolution/node_type.hh"
#include <algorithm>
#include <cmath>
namespace cppn {
template <evolution::NodeType Type> inline float activation_value(float state, float bias) {
  using evolution::NodeType;
  if constexpr (Type == NodeType::GAUSSIAN) {
    const float b = bias == 0 ? 1.f : bias;
    return std::exp(-(state * state) / (b * b * (1.f / evolution::GAUSSIAN_SHARPNESS)));
  } else if constexpr (Type == NodeType::SINE)
    return std::sin(state * bias);
  else if constexpr (Type == NodeType::COSINE)
    return std::cos(state * bias);
  else if constexpr (Type == NodeType::LINEAR)
    return state * bias;
  else if constexpr (Type == NodeType::SIGMOID)
    return 2.f / (1.f + std::exp(-state + bias)) - 1.f;
  else if constexpr (Type == NodeType::POW)
    return std::pow(state + bias / evolution::WEIGHT_RANGE, 3.f) /
           std::pow(evolution::WEIGHT_RANGE, 3.f);
  else if constexpr (Type == NodeType::ABS)
    return std::abs(state + bias);
  else if constexpr (Type == NodeType::SIGN)
    return state + bias > 0 ? 1.f : -1.f;
  else if constexpr (Type == NodeType::STAIR)
    return std::trunc(state * bias);
  else
    return state > bias ? 1.f : -1.f;
}
inline float activation(int type, float state, float bias) {
  using evolution::NodeType;
  switch (NodeType(type)) {
  case NodeType::GAUSSIAN:
    return activation_value<NodeType::GAUSSIAN>(state, bias);
  case NodeType::SINE:
    return activation_value<NodeType::SINE>(state, bias);
  case NodeType::COSINE:
    return activation_value<NodeType::COSINE>(state, bias);
  case NodeType::LINEAR:
    return activation_value<NodeType::LINEAR>(state, bias);
  case NodeType::SIGMOID:
    return activation_value<NodeType::SIGMOID>(state, bias);
  case NodeType::POW:
    return activation_value<NodeType::POW>(state, bias);
  case NodeType::ABS:
    return activation_value<NodeType::ABS>(state, bias);
  case NodeType::SIGN:
    return activation_value<NodeType::SIGN>(state, bias);
  case NodeType::STAIR:
    return activation_value<NodeType::STAIR>(state, bias);
  default:
    return activation_value<NodeType::CUTOFF>(state, bias);
  }
}
inline float gated_activation(float sum, float gate) {
  return std::clamp(sum, -1.f, 1.f) * std::clamp(gate, -1.f, 1.f);
}
inline float output_value(float sum, float raw, bool squash) {
  return squash ? std::tanh(sum) : std::max(-1.f, std::min(1.f, raw));
}
}
