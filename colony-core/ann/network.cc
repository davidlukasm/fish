#include "network.hh"
#include "connection.hh"
#include <algorithm>
#include <cmath>
#include <queue>
#include <stdexcept>
namespace ann {
struct Network::Impl {
  struct Control {
    std::size_t offset, count;
    int type;
    float bias;
  };
  std::vector<float> state, weights;
  std::vector<std::size_t> sources, order;
  std::vector<Control> controls;
};
void NodeCollection::add_node(const Node *n) {
  if (!n || indices.count(n))
    throw std::invalid_argument("missing or duplicate network node");
  indices[n] = nodes.size();
  nodes.push_back(n);
}
std::size_t NodeCollection::id_of(const Node *n) const {
  auto it = indices.find(n);
  if (it == indices.end())
    throw std::runtime_error("network connection has unknown source");
  return it->second;
}
Network::Network(std::size_t i, std::size_t b, std::size_t o, activation_function_t a,
                 const NodeCollection &nodes, Mode m)
    : impl(new Impl), activation(a), inputs(i), bias(b), outputs(o), mode(m) {
  if (!a || !o || i + b + o > nodes.size())
    throw std::invalid_argument("invalid network dimensions");
  impl->state.resize(nodes.size(), 0.f);
  std::vector<std::size_t> degree(nodes.size(), 0);
  std::vector<std::vector<std::size_t>> adjacency(nodes.size());
  for (std::size_t dst = 0; dst < nodes.size(); ++dst) {
    const Node *node = nodes.nodes[dst];
    auto offset = impl->weights.size();
    if (dst < inputs + bias && node->count_connections())
      throw std::runtime_error("network input has incoming edges");
    for (std::size_t c = 0; c < node->count_connections(); ++c) {
      const auto *edge = node->get_input(c);
      if (!edge || !std::isfinite(edge->get_weight()))
        throw std::runtime_error("invalid edge");
      auto src = nodes.id_of(edge->get_source());
      impl->sources.push_back(src);
      impl->weights.push_back(edge->get_weight());
      ++degree[dst];
      adjacency[src].push_back(dst);
    }
    if (!std::isfinite(node->get_bias()))
      throw std::runtime_error("nonfinite neuron parameter");
    impl->controls.push_back(
        {offset, node->count_connections(), node->get_type(), node->get_bias()});
  }
  if (mode == Mode::FeedForward) {
    std::priority_queue<std::size_t, std::vector<std::size_t>, std::greater<std::size_t>> q;
    for (std::size_t n = 0; n < nodes.size(); ++n)
      if (!degree[n])
        q.push(n);
    std::size_t visited = 0;
    while (!q.empty()) {
      auto n = q.top();
      q.pop();
      ++visited;
      if (n >= inputs + bias)
        impl->order.push_back(n);
      for (auto dst : adjacency[n])
        if (--degree[dst] == 0)
          q.push(dst);
    }
    if (visited != nodes.size())
      throw std::runtime_error("feedforward network contains a cycle");
  } else
    for (std::size_t n = inputs + bias; n < nodes.size(); ++n)
      impl->order.push_back(n);
  reset();
}
Network::Compiled Network::compiled() const {
  Compiled p;
  p.inputs = inputs;
  p.bias = bias;
  p.outputs = outputs;
  p.activation = activation;
  p.sources = impl->sources;
  p.order = impl->order;
  p.weights = impl->weights;
  p.tanh_outputs = tanh_outputs;
  for (const auto &c : impl->controls)
    p.controls.push_back({c.offset, c.count, c.type, c.bias});
  return p;
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
  std::vector<float> next;
  if (mode == Mode::Synchronous)
    next = impl->state;
  auto &target = mode == Mode::Synchronous ? next : impl->state;
  for (auto n : impl->order) {
    const auto &c = impl->controls[n];
    float sum = 0;
    for (std::size_t s = c.offset; s < c.offset + c.count; ++s)
      sum += impl->state[impl->sources[s]] * impl->weights[s];
    float out = activation(c.type, sum, c.bias);
    if (std::isnan(out))
      throw std::runtime_error("neuron produced NaN");
    const auto first = impl->state.size() - outputs;
    target[n] = n >= first && (tanh_outputs & (1u << (n - first)))
                    ? std::tanh(sum)
                    : std::max(-1.f, std::min(1.f, out));
  }
  if (mode == Mode::Synchronous)
    impl->state.swap(next);
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
