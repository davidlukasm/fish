#include "program.hh"
#include "node.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <atomic>
namespace cppn {

Program::Program(const CPPN &p) : code(p.compiled()) {
  static std::atomic<std::uint64_t> serial{0};
  cache_id = ++serial;
  if (code.inputs != INPUTS - 1 || code.bias != 1 || code.outputs != OUTPUTS) {
    safe_ = false;
    return;
  }
  dependencies.assign(code.controls.size(), 0);
  for (std::size_t i = 0; i < code.inputs; ++i)
    dependencies[i] = 1u << i;
  for (auto n : code.order) {
    const auto &c = code.controls[n];
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
      dependencies[n] |= dependencies[code.sources[j]];
  }
  for (const auto &c : code.controls)
    if (std::abs(c.bias) > 64 || c.count > 16384 ||
        (c.type == int(evolution::NodeType::GAUSSIAN) && c.bias != 0 && std::abs(c.bias) < 1e-12f))
      safe_ = false;
  for (float w : code.weights)
    if (std::abs(w) > 64)
      safe_ = false;
  plan(1u);
  plan(2u);
  plan(3u);
  plan(0x7cu);
  plan(cppn::ALL_OUTPUTS);
  plan(output::cell_mask);
  for (int k = 0; k < output::link_kinds; ++k)
    plan(output::link_mask(k));
}
void Program::plan(unsigned mask) {
  std::vector<unsigned char> needed(code.controls.size());
  std::vector<std::size_t> stack;
  for (std::size_t i = 0; i < code.outputs; ++i)
    if (mask & (1u << i))
      stack.push_back(code.controls.size() - code.outputs + i);
  while (!stack.empty()) {
    auto n = stack.back();
    stack.pop_back();
    if (needed[n])
      continue;
    needed[n] = 1;
    const auto &c = code.controls[n];
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
      stack.push_back(code.sources[j]);
  }
  auto &selected = plans[mask];
  selected.clear();
  for (auto n : code.order)
    if (needed[n])
      selected.push_back(n);
}
void Program::evaluate(const Point *points, std::size_t count, unsigned mask,
                       std::array<std::array<float, cppn::OUTPUTS>, 64> &output) const {
  if (count > 64)
    throw std::invalid_argument("CPPN batch too large");
  if (!count)
    return;
  auto normalize = [&](std::size_t n, float sum, float out) {
    auto first = code.controls.size() - code.outputs;
    return n >= first && (code.tanh_outputs & (1u << (n - first)))
               ? std::tanh(sum)
               : std::max(-1.f, std::min(1.f, out));
  };
  struct Cache {
    std::uint64_t id = 0;
    std::vector<unsigned char> ready;
    std::vector<float> values, state;
    std::array<float, INPUTS - 1> inputs{};
  };
  thread_local Cache cache;
  if (cache.id != cache_id) {
    cache.id = cache_id;
    cache.ready.assign(code.controls.size(), 0);
    cache.values.resize(code.controls.size());
  }
  if (count == 1) {
    const auto &q = points[0];
    const auto values = geometry_inputs(q.a, q.b, q.z, q.c, q.d, q.w, q.match1, q.match2);
    unsigned changed = 0;
    for (float v : values)
      if (!std::isfinite(v))
        throw std::invalid_argument("nonfinite input");
    for (std::size_t i = 0; i < INPUTS - 1; ++i) {
      if (values[i] != cache.inputs[i])
        changed |= 1u << i;
      cache.inputs[i] = cache.values[i] = values[i];
    }
    cache.values[BIAS] = 1;
    for (std::size_t i = 0; i < cache.ready.size(); ++i)
      if (dependencies[i] & changed)
        cache.ready[i] = 0;
    for (auto n : plans.at(mask))
      if (!cache.ready[n]) {
        const auto &c = code.controls[n];
        float sum = 0;
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
          sum += cache.values[code.sources[j]] * code.weights[j];
        float out = Node::activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        cache.ready[n] = 1;
      }
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1u << i))
        output[0][i] = cache.values[code.controls.size() - code.outputs + i];
    return;
  }
  auto &state = cache.state;
  state.resize(code.controls.size() * 64);
  unsigned changed = 0, vary = 0;
  for (std::size_t p = 0; p < count; ++p) {
    const auto &q = points[p];
    const auto values = geometry_inputs(q.a, q.b, q.z, q.c, q.d, q.w, q.match1, q.match2);
    for (std::size_t i = 0; i < INPUTS - 1; ++i) {
      if (!std::isfinite(values[i]))
        throw std::invalid_argument("nonfinite input");
      state[i * 64 + p] = values[i];
    }
    for (std::size_t i = code.inputs; i < code.inputs + code.bias; ++i) {
      state[i * 64 + p] = 1;
      cache.values[i] = 1;
    }
  }
  for (std::size_t i = 0; i < INPUTS - 1; ++i) {
    float first = state[i * 64];
    if (first != cache.inputs[i])
      changed |= 1u << i;
    cache.inputs[i] = cache.values[i] = first;
    for (std::size_t j = 1; j < count; ++j)
      if (state[i * 64 + j] != first) {
        vary |= 1u << i;
        break;
      }
  }
  for (std::size_t i = 0; i < cache.ready.size(); ++i)
    if (dependencies[i] & changed)
      cache.ready[i] = 0;
  for (auto n : plans.at(mask)) {
    const auto &c = code.controls[n];
    if (!(dependencies[n] & vary)) {
      if (!cache.ready[n]) {
        float sum = 0;
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
          sum += cache.values[code.sources[j]] * code.weights[j];
        float out = Node::activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        cache.ready[n] = 1;
      }
      std::fill_n(state.data() + n * 64, count, cache.values[n]);
      continue;
    }
    std::array<float, 64> sum{};
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j) {
      const auto *src = state.data() + code.sources[j] * 64;
      float weight = code.weights[j];
      for (std::size_t p = 0; p < count; ++p)
        sum[p] += src[p] * weight;
    }
    // Dispatch once for the whole point batch; simple activations can then
    // run over consecutive values without a type switch for every sample.
    const auto first = code.controls.size() - code.outputs;
    const bool squash = n >= first && (code.tanh_outputs & (1u << (n - first)));
    auto activate = [&](auto function) {
      bool invalid = false;
      if (squash)
        for (std::size_t p = 0; p < count; ++p) {
          const float out = function(sum[p]);
          invalid |= std::isnan(out);
          state[n * 64 + p] = std::tanh(sum[p]);
        }
      else
        for (std::size_t p = 0; p < count; ++p) {
          const float out = function(sum[p]);
          invalid |= std::isnan(out);
          state[n * 64 + p] = std::max(-1.f, std::min(1.f, out));
        }
      if (invalid)
        throw std::runtime_error("neuron produced NaN");
    };
    using evolution::NodeType;
    switch (NodeType(c.type)) {
    case NodeType::LINEAR:
      activate([&](float u) { return u * c.bias; });
      break;
    case NodeType::ABS:
      activate([&](float u) { return std::abs(u + c.bias); });
      break;
    case NodeType::SINE:
      activate([&](float u) { return std::sin(u * c.bias); });
      break;
    case NodeType::COSINE:
      activate([&](float u) { return std::cos(u * c.bias); });
      break;
    case NodeType::GAUSSIAN: {
      const float b = c.bias == 0 ? 1.f : c.bias, denominator = b * b * (1.f / 64.f);
      activate([&](float u) { return std::exp(-(u * u) / denominator); });
      break;
    }
    default:
      activate([&](float u) { return Node::activation(c.type, u, c.bias); });
      break;
    }
    cache.ready[n] = 0;
  }
  for (std::size_t p = 0; p < count; ++p)
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1u << i))
        output[p][i] = state[(code.controls.size() - code.outputs + i) * 64 + p];
}

}
