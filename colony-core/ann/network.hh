#pragma once
#include "node.hh"
#include <vector>
#include <memory>
#include <initializer_list>
#include <unordered_map>
namespace ann {
using activation_function_t = float (*)(int, float, float);
enum class Mode { FeedForward, Synchronous };
class NodeCollection {
  friend class Network;
  std::vector<const Node *> nodes;
  std::unordered_map<const Node *, std::size_t> indices;
  std::size_t id_of(const Node *) const;

public:
  std::size_t size() const { return nodes.size(); }
  void add_node(const Node *n);
};
class Network {
  struct Impl;
  std::unique_ptr<Impl> impl;
  activation_function_t activation;
  std::size_t inputs, bias, outputs;
  Mode mode;
  unsigned tanh_outputs = 0;

public:
  struct Control {
    std::size_t offset, count;
    int type;
    float bias;
  };
  struct Compiled {
    std::size_t inputs, bias, outputs;
    activation_function_t activation;
    std::vector<Control> controls;
    std::vector<std::size_t> sources, order;
    std::vector<float> weights;
    unsigned tanh_outputs = 0;
  };
  Compiled compiled() const;
  Network(std::size_t inputs, std::size_t bias, std::size_t outputs,
          activation_function_t activation, const NodeCollection &, Mode mode = Mode::FeedForward);
  ~Network();
  Network(const Network &) = delete;
  Network &operator=(const Network &) = delete;
  void set_input(const std::vector<float> &);
  void set_input(std::initializer_list<float> v) { set_input(std::vector<float>(v)); }
  float get(std::size_t output) const;
  void step();
  void output_tanh(unsigned mask) { tanh_outputs = mask; }
  void reset();
};
}
