#pragma once
#include <vector>
#include <memory>
#include <initializer_list>
namespace ann {
using activation_function_t = float (*)(int, float, float);
class Network {
  struct Impl;
  std::unique_ptr<Impl> impl;
  activation_function_t activation;
  std::size_t inputs, bias, outputs;
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
    std::vector<unsigned char> ports;
    std::vector<int> ids;
    unsigned tanh_outputs = 0;
  };
  Compiled compiled() const;
  explicit Network(Compiled);
  ~Network();
  Network(const Network &) = delete;
  Network &operator=(const Network &) = delete;
  void set_input(const std::vector<float> &);
  void set_input(std::initializer_list<float> v) { set_input(std::vector<float>(v)); }
  float get(std::size_t output) const;
  void step();
  void reset();
};
}
