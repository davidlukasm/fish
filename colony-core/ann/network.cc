#include "network.hh"
#include "cppn/activation.hh"
#include "evolution/node_type.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace ann {
struct Network::Impl {
  std::vector<float> state;
  std::shared_ptr<const Compiled> code;
};
Network::Network(Compiled code)
    : impl(new Impl), activation(code.activation), inputs(code.inputs), bias(code.bias),
      outputs(code.outputs), tanh_outputs(code.tanh_outputs) {
  if (!activation || !outputs || inputs + bias + outputs > code.controls.size() ||
      code.ids.size() != code.controls.size() || code.sources.size() != code.weights.size() ||
      code.ports.size() != code.weights.size())
    throw std::invalid_argument("invalid compiled network");
  std::vector<bool> ready(code.controls.size());
  std::fill_n(ready.begin(), inputs + bias, true);
  for (auto n : code.order) {
    if (n >= ready.size() || ready[n])
      throw std::invalid_argument("invalid compiled order");
    const auto &c = code.controls[n];
    if (c.offset > code.weights.size() || c.count > code.weights.size() - c.offset)
      throw std::invalid_argument("invalid compiled row");
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
      if (code.sources[j] >= ready.size() || !ready[code.sources[j]])
        throw std::invalid_argument("cyclic compiled network");
    ready[n] = true;
  }
  if (std::find(ready.begin(), ready.end(), false) != ready.end())
    throw std::invalid_argument("incomplete compiled network");
  impl->state.resize(code.controls.size());
  impl->code = std::make_shared<Compiled>(std::move(code));
  reset();
}
std::shared_ptr<const Network::Compiled> Network::compiled() const {
  return impl->code;
}
Network::~Network() = default;
void Network::set_input(const std::vector<float> &v) {
  if (v.size() != inputs)
    throw std::invalid_argument("wrong input count");
  for (std::size_t n = 0; n < inputs; ++n) {
    if (!std::isfinite(v[n]))
      throw std::invalid_argument("nonfinite input");
    impl->state[n] = v[n];
  }
}
void Network::step() {
  for (auto n : impl->code->order) {
    const auto &c = impl->code->controls[n];
    float sum = 0, gate = 0;
    for (std::size_t s = c.offset; s < c.offset + c.count; ++s) {
      auto &accumulator = impl->code->ports[s] ? gate : sum;
      accumulator =
          std::fma(impl->state[impl->code->sources[s]], impl->code->weights[s], accumulator);
    }
    float out = c.type == int(evolution::NodeType::TOR) ? cppn::gated_activation(sum, gate)
                                                        : activation(c.type, sum, c.bias);
    if (std::isnan(out))
      throw std::runtime_error("neuron produced NaN");
    const auto first = impl->state.size() - outputs;
    impl->state[n] =
        cppn::output_value(sum, out, n >= first && (tanh_outputs & (1ull << (n - first))));
  }
}
void Network::reset() {
  std::fill(impl->state.begin(), impl->state.end(), 0.f);
  for (std::size_t b = inputs; b < inputs + bias; ++b)
    impl->state[b] = 1.f;
}
float Network::get(std::size_t output) const {
  if (output >= outputs)
    throw std::out_of_range("output index");
  return impl->state[impl->state.size() - outputs + output];
}
}
