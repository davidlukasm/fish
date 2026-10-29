#ifndef CPPN_NEURON_HH
#define CPPN_NEURON_HH

#include <functional>
#include <cmath>
#include "evolution/constants.hh"
#include <vector>
#include <utility>

#include "evolution/gene.hh"
#include "ann/node.hh"
#include "ann/connection.hh"

namespace cppn {
class Node;

class Connection final : public ann::Connection {
  Node const *src;
  const float weight;
  int port;

public:
  Connection(Node const *src, float weight, int port) : src(src), weight(weight), port(port) {}

  ann::Node const *get_source() const override;
  float get_weight() const override { return weight; }
  int get_port() const override { return port; }
};

class Node final : public ann::Node {
  int id;
  evolution::NodeType type;

  float bias;
  std::vector<Connection> inputs;

public:
  Node(evolution::NodeGene const &gene);

  ann::Connection const *get_input(size_t i) const override { return &inputs[i]; }
  size_t count_connections() const override { return inputs.size(); }
  int get_type() const override { return int(type); }
  float get_bias() const override { return bias; }

  int get_id() const { return id; }

  void connect_from(Node *src, float weight, int port = 0);
  void connect_to(Node *dst, float weight, int port = 0);

  // std::vector<std::pair<Node*, float>> get_inputs() const { return inputs; }
  static float activation(int t, float state, float bias) {
    auto type = evolution::NodeType(t);
    using evolution::NodeType;

    switch (type) {
    case NodeType::GAUSSIAN:
      if (bias == 0)
        bias = 1.0f;
      return std::exp(-(state * state) / (bias * bias * (1.0f / 64.0f)));

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
};

}

#endif
