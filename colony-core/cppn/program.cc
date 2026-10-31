#include "program.hh"
#include "node.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <atomic>
#include <set>
namespace cppn {

Program::Program(const CPPN &p) : code(p.compiled()), genes(p.genome()), aliases(p.aliases()) {
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
  plan(cppn::ALL_OUTPUTS);
  plan(output::receptor_mask);
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
  std::map<int, std::size_t> at;
  for (std::size_t i = 0; i < code.ids.size(); ++i)
    at[code.ids[i]] = i;
  std::map<int, std::vector<int>> incoming;
  for (const auto &e : genes->get_connection_genes())
    if (e.get_enabled() && e.get_weight() != 0)
      incoming[e.get_target()].push_back(e.get_source());
  std::set<int> used;
  std::vector<int> work;
  for (int i = 0; i < OUTPUTS; ++i)
    if (mask & (1u << i))
      work.push_back(INPUTS + i);
  for (std::size_t i = 0; i < work.size(); ++i)
    if (used.insert(work[i]).second)
      for (int source : incoming[work[i]])
        work.push_back(source);
  auto &observed = observations[mask];
  observed.clear();
  for (int id : used) {
    const auto &a = aliases.at(id);
    observed.push_back({id, at.at(a.source), a.multiplier, a.relay});
  }
  auto &selected = plans[mask];
  selected.clear();
  for (auto n : code.order)
    if (needed[n])
      selected.push_back(n);
}
void Program::evaluate(const Point *points, std::size_t count, unsigned mask,
                       std::array<std::array<float, cppn::OUTPUTS>, 64> &output,
                       bool record_work) const {
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
    std::vector<float> values, state, derivative, gate_derivative, ds, dg;
    std::array<float, INPUTS - 1> inputs{};
  };
  thread_local Cache cache;
  if (cache.id != cache_id) {
    cache.id = cache_id;
    cache.ready.assign(code.controls.size(), 0);
    cache.values.resize(code.controls.size());
    cache.derivative.resize(code.controls.size());
    cache.gate_derivative.resize(code.controls.size());
  }
  auto derivatives = [&](const auto &c, float sum, float gate) {
    std::array<float, 2> d{};
    if (c.type == int(evolution::NodeType::TOR)) {
      d[0] = std::abs(sum) < 1 ? std::clamp(gate, -1.f, 1.f) : 0;
      d[1] = std::abs(gate) < 1 ? std::clamp(sum, -1.f, 1.f) : 0;
      return d;
    }
    const float raw = Node::activation(c.type, sum, c.bias);
    if (std::abs(raw) >= 1)
      return d;
    using evolution::NodeType;
    switch (NodeType(c.type)) {
    case NodeType::LINEAR:
      d[0] = c.bias;
      break;
    case NodeType::SINE:
      d[0] = c.bias * std::cos(sum * c.bias);
      break;
    case NodeType::COSINE:
      d[0] = -c.bias * std::sin(sum * c.bias);
      break;
    case NodeType::GAUSSIAN: {
      const float b = c.bias == 0 ? 1 : c.bias;
      d[0] = -128 * sum / (b * b) * raw;
      break;
    }
    case NodeType::SIGMOID:
      d[0] = (1 - raw * raw) * .5f;
      break;
    case NodeType::ABS:
      d[0] = sum + c.bias < 0 ? -1 : 1;
      break;
    case NodeType::POW: {
      const float x = sum + c.bias / evolution::WEIGHT_RANGE;
      d[0] = 3 * x * x / std::pow(evolution::WEIGHT_RANGE, 3.f);
      break;
    }
    default:
      break;
    }
    return d;
  };
  // Replay of stored development must not count the same work twice.
  std::unique_lock<std::mutex> observation_lock;
  if (record_work)
    observation_lock = genes->lock_observations();
  auto observe = [&](std::size_t sample, const auto &value, const auto &d, const auto &dg) {
    if (!record_work)
      return;
    const double weight = points[sample].effect == 0 ? 1 : 1. / 7;
    for (const auto &o : observations.at(mask)) {
      const float v = value(o.at) * o.multiplier;
      const bool input = o.at < INPUTS;
      genes->observe_work(o.id, v,
                          o.relay ? (std::abs(v) < 1 ? 1 : 0)
                          : input ? 1
                                  : d(o.at),
                          o.relay || input ? 0 : dg(o.at), weight);
    }
  };
  if (count == 1) {
    const auto &q = points[0];
    const auto values = cell_inputs(q);
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
        float sum = 0, gate = 0;
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
          (code.ports[j] ? gate : sum) += cache.values[code.sources[j]] * code.weights[j];
        float out = c.type == int(evolution::NodeType::TOR)
                        ? std::clamp(sum, -1.f, 1.f) * std::clamp(gate, -1.f, 1.f)
                        : Node::activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        const auto d = derivatives(c, sum, gate);
        cache.derivative[n] = d[0];
        cache.gate_derivative[n] = d[1];
        cache.ready[n] = 1;
      }
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1u << i))
        output[0][i] = cache.values[code.controls.size() - code.outputs + i];
    observe(
        0, [&](auto n) { return cache.values[n]; }, [&](auto n) { return cache.derivative[n]; },
        [&](auto n) { return cache.gate_derivative[n]; });
    return;
  }
  auto &state = cache.state;
  state.resize(code.controls.size() * 64);
  cache.ds.resize(state.size());
  cache.dg.resize(state.size());
  unsigned changed = 0, vary = 0;
  for (std::size_t p = 0; p < count; ++p) {
    const auto &q = points[p];
    const auto values = cell_inputs(q);
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
        float sum = 0, gate = 0;
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
          (code.ports[j] ? gate : sum) += cache.values[code.sources[j]] * code.weights[j];
        float out = c.type == int(evolution::NodeType::TOR)
                        ? std::clamp(sum, -1.f, 1.f) * std::clamp(gate, -1.f, 1.f)
                        : Node::activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        const auto d = derivatives(c, sum, gate);
        cache.derivative[n] = d[0];
        cache.gate_derivative[n] = d[1];
        cache.ready[n] = 1;
      }
      std::fill_n(state.data() + n * 64, count, cache.values[n]);
      std::fill_n(cache.ds.data() + n * 64, count, cache.derivative[n]);
      std::fill_n(cache.dg.data() + n * 64, count, cache.gate_derivative[n]);
      continue;
    }
    std::array<float, 64> sum{}, gate{};
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j) {
      const auto *src = state.data() + code.sources[j] * 64;
      float weight = code.weights[j];
      for (std::size_t p = 0; p < count; ++p)
        (code.ports[j] ? gate[p] : sum[p]) += src[p] * weight;
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
    case NodeType::TOR:
      for (std::size_t p = 0; p < count; ++p)
        state[n * 64 + p] = std::clamp(sum[p], -1.f, 1.f) * std::clamp(gate[p], -1.f, 1.f);
      break;
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
    for (std::size_t p = 0; p < count; ++p) {
      const auto d = derivatives(c, sum[p], gate[p]);
      cache.ds[n * 64 + p] = d[0];
      cache.dg[n * 64 + p] = d[1];
    }
    cache.ready[n] = 0;
  }
  for (std::size_t p = 0; p < count; ++p)
    observe(
        p, [&](auto n) { return state[n * 64 + p]; }, [&](auto n) { return cache.ds[n * 64 + p]; },
        [&](auto n) { return cache.dg[n * 64 + p]; });
  for (std::size_t p = 0; p < count; ++p)
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1u << i))
        output[p][i] = state[(code.controls.size() - code.outputs + i) * 64 + p];
}

}
