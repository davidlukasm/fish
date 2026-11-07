#include "program.hh"
#include "activation.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <atomic>
#include <set>
#include <limits>
namespace cppn {
namespace {
constexpr float MAX_SAFE_WEIGHT = 64, MIN_GAUSSIAN_BIAS = 1e-12f;
constexpr std::size_t MAX_SAFE_INPUTS = 16384;
constexpr double EFFECT_QUERY_WEIGHT = 1. / 7;
}

struct Program::PreparationState {
  enum Stage {
    Dependencies,
    Controls,
    Weights,
    Indices,
    Incoming,
    Needed,
    Used,
    Observed,
    Selected,
    Done
  } stage = Dependencies;
  std::size_t cursor = 0, mask_index = 0;
  std::vector<unsigned char> needed;
  std::vector<std::size_t> stack;
  std::set<int> used;
  std::vector<int> work;
  std::set<int>::const_iterator observed;
  static constexpr std::array<OutputMask, 4> masks{ALL_OUTPUTS, output::receptor_mask,
                                                   output::contact_mask, output::property_mask};
  void begin_mask(const ann::Network::Compiled &code) {
    cursor = 0;
    needed.assign(code.controls.size(), 0);
    stack.clear();
    used.clear();
    work.clear();
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (masks[mask_index] & (1ull << i)) {
        stack.push_back(code.controls.size() - code.outputs + i);
        work.push_back(INPUTS + int(i));
      }
    stage = Needed;
  }
};
Program::Program(const CPPN &p, Preparation mode)
    : storage(p.compiled()), code(*storage), genes(p.genome()), aliases(p.aliases()) {
  static std::atomic<std::uint64_t> serial{0};
  cache_id = ++serial;
  if (code.inputs != INPUTS - 1 || code.bias != 1 || code.outputs != OUTPUTS) {
    safe_ = false;
    return;
  }
  dependencies.assign(code.controls.size(), 0);
  for (std::size_t i = 0; i < code.inputs; ++i)
    dependencies[i] = 1u << i;
  preparation = std::make_unique<PreparationState>();
  if (mode == Preparation::Immediate) {
    auto budget = std::numeric_limits<std::size_t>::max();
    prepare(budget);
  }
}
Program::~Program() = default;
bool Program::prepare(std::size_t &budget) {
  if (!preparation)
    return true;
  auto &s = *preparation;
  while (budget && s.stage != PreparationState::Done) {
    --budget;
    switch (s.stage) {
    case PreparationState::Dependencies:
      if (s.cursor < code.order.size()) {
        const auto n = code.order[s.cursor++];
        const auto &c = code.controls[n];
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
          dependencies[n] |= dependencies[code.sources[j]];
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Controls;
      }
      break;
    case PreparationState::Controls:
      if (s.cursor < code.controls.size()) {
        const auto &c = code.controls[s.cursor++];
        if (std::abs(c.bias) > MAX_SAFE_WEIGHT || c.count > MAX_SAFE_INPUTS ||
            (c.type == int(evolution::NodeType::GAUSSIAN) && c.bias != 0 &&
             std::abs(c.bias) < MIN_GAUSSIAN_BIAS))
          safe_ = false;
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Weights;
      }
      break;
    case PreparationState::Weights:
      if (s.cursor < code.weights.size()) {
        if (std::abs(code.weights[s.cursor++]) > MAX_SAFE_WEIGHT)
          safe_ = false;
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Indices;
      }
      break;
    case PreparationState::Indices:
      if (s.cursor < code.ids.size()) {
        indices[code.ids[s.cursor]] = s.cursor;
        ++s.cursor;
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Incoming;
      }
      break;
    case PreparationState::Incoming:
      if (s.cursor < genes->get_connection_genes().size()) {
        const auto &e = genes->get_connection_genes()[s.cursor++];
        if (e.get_enabled() && e.get_weight() != 0)
          incoming[e.get_target()].push_back(e.get_source());
      } else
        s.begin_mask(code);
      break;
    case PreparationState::Needed:
      if (!s.stack.empty()) {
        const auto n = s.stack.back();
        s.stack.pop_back();
        if (!s.needed[n]) {
          s.needed[n] = 1;
          const auto &c = code.controls[n];
          for (std::size_t j = c.offset; j < c.offset + c.count; ++j)
            s.stack.push_back(code.sources[j]);
        }
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Used;
      }
      break;
    case PreparationState::Used:
      if (s.cursor < s.work.size()) {
        const auto id = s.work[s.cursor++];
        if (s.used.insert(id).second)
          for (int source : incoming[id])
            s.work.push_back(source);
      } else {
        s.observed = s.used.begin();
        s.stage = PreparationState::Observed;
      }
      break;
    case PreparationState::Observed:
      if (s.observed != s.used.end()) {
        const auto id = *s.observed++;
        const auto &a = aliases.at(id);
        observations[s.masks[s.mask_index]].push_back(
            {id, indices.at(a.source), a.multiplier, a.relay});
      } else {
        s.cursor = 0;
        s.stage = PreparationState::Selected;
      }
      break;
    case PreparationState::Selected:
      if (s.cursor < code.order.size()) {
        const auto n = code.order[s.cursor++];
        if (s.needed[n])
          plans[s.masks[s.mask_index]].push_back(n);
      } else if (++s.mask_index < s.masks.size())
        s.begin_mask(code);
      else
        s.stage = PreparationState::Done;
      break;
    case PreparationState::Done:
      break;
    }
  }
  if (s.stage != PreparationState::Done)
    return false;
  constexpr std::size_t OPERATIONS_PER_WORK = 256;
  for (const auto &[mask, plan] : plans) {
    std::size_t operations = 0;
    for (auto n : plan)
      operations += 1 + code.controls[n].count;
    costs[mask] =
        std::max<std::size_t>(1, (operations + OPERATIONS_PER_WORK - 1) / OPERATIONS_PER_WORK);
  }
  preparation.reset();
  aliases.clear();
  incoming.clear();
  indices.clear();
  return true;
}
std::size_t Program::query_cost(OutputMask mask) const {
  return costs.at(mask);
}
void Program::evaluate(const Point *points, std::size_t count, OutputMask mask,
                       std::array<std::array<float, cppn::OUTPUTS>, BATCH> &output,
                       bool record_work) const {
  if (count > BATCH)
    throw std::invalid_argument("CPPN batch too large");
  if (!count)
    return;
  auto normalize = [&](std::size_t n, float sum, float out) {
    auto first = code.controls.size() - code.outputs;
    return n >= first && (code.tanh_outputs & (1ull << (n - first)))
               ? std::tanh(sum)
               : std::max(-1.f, std::min(1.f, out));
  };
  struct Cache {
    std::uint64_t id = 0;
    bool with_work = false;
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
  // Values cached during a replay have no derivatives. Recompute on the first observed query.
  if (record_work && !cache.with_work)
    std::fill(cache.ready.begin(), cache.ready.end(), 0);
  cache.with_work = record_work;
  auto derivatives = [&](const auto &c, float sum, float gate, float raw) {
    std::array<float, 2> d{};
    if (c.type == int(evolution::NodeType::TOR)) {
      d[0] = std::abs(sum) < 1 ? std::clamp(gate, -1.f, 1.f) : 0;
      d[1] = std::abs(gate) < 1 ? std::clamp(sum, -1.f, 1.f) : 0;
      return d;
    }
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
      d[0] = -2 * evolution::GAUSSIAN_SHARPNESS * sum / (b * b) * raw;
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
  auto observe = [&](const auto &value, const auto &d, const auto &dg) {
    if (!record_work)
      return;
    std::array<evolution::Genome::WorkSample, BATCH> samples;
    for (const auto &o : observations.at(mask)) {
      const bool input = o.at < INPUTS;
      for (std::size_t sample = 0; sample < count; ++sample) {
        const float v = value(o.at, sample) * o.multiplier;
        samples[sample] = {v,
                           o.relay ? (std::abs(v) < 1 ? 1 : 0)
                           : input ? 1
                                   : d(o.at, sample),
                           o.relay || input ? 0 : dg(o.at, sample),
                           points[sample].effect == 0 ? 1 : EFFECT_QUERY_WEIGHT};
      }
      genes->observe_work(o.id, samples.data(), count);
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
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j) {
          auto &accumulator = code.ports[j] ? gate : sum;
          accumulator = std::fma(cache.values[code.sources[j]], code.weights[j], accumulator);
        }
        float out = c.type == int(evolution::NodeType::TOR)
                        ? std::clamp(sum, -1.f, 1.f) * std::clamp(gate, -1.f, 1.f)
                        : activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        if (record_work) {
          const auto d = derivatives(c, sum, gate, out);
          cache.derivative[n] = d[0];
          cache.gate_derivative[n] = d[1];
        }
        cache.ready[n] = 1;
      }
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1ull << i))
        output[0][i] = cache.values[code.controls.size() - code.outputs + i];
    observe([&](auto n, auto) { return cache.values[n]; },
            [&](auto n, auto) { return cache.derivative[n]; },
            [&](auto n, auto) { return cache.gate_derivative[n]; });
    return;
  }
  auto &state = cache.state;
  state.resize(code.controls.size() * BATCH);
  if (record_work) {
    cache.ds.resize(state.size());
    cache.dg.resize(state.size());
  }
  unsigned changed = 0, vary = 0;
  for (std::size_t p = 0; p < count; ++p) {
    const auto &q = points[p];
    const auto values = cell_inputs(q);
    for (std::size_t i = 0; i < INPUTS - 1; ++i) {
      if (!std::isfinite(values[i]))
        throw std::invalid_argument("nonfinite input");
      state[i * BATCH + p] = values[i];
    }
    for (std::size_t i = code.inputs; i < code.inputs + code.bias; ++i) {
      state[i * BATCH + p] = 1;
      cache.values[i] = 1;
    }
  }
  for (std::size_t i = 0; i < INPUTS - 1; ++i) {
    float first = state[i * BATCH];
    if (first != cache.inputs[i])
      changed |= 1u << i;
    cache.inputs[i] = cache.values[i] = first;
    for (std::size_t j = 1; j < count; ++j)
      if (state[i * BATCH + j] != first) {
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
        for (std::size_t j = c.offset; j < c.offset + c.count; ++j) {
          auto &accumulator = code.ports[j] ? gate : sum;
          accumulator = std::fma(cache.values[code.sources[j]], code.weights[j], accumulator);
        }
        float out = c.type == int(evolution::NodeType::TOR)
                        ? std::clamp(sum, -1.f, 1.f) * std::clamp(gate, -1.f, 1.f)
                        : activation(c.type, sum, c.bias);
        if (std::isnan(out))
          throw std::runtime_error("neuron produced NaN");
        cache.values[n] = normalize(n, sum, out);
        if (record_work) {
          const auto d = derivatives(c, sum, gate, out);
          cache.derivative[n] = d[0];
          cache.gate_derivative[n] = d[1];
        }
        cache.ready[n] = 1;
      }
      std::fill_n(state.data() + n * BATCH, count, cache.values[n]);
      if (record_work) {
        std::fill_n(cache.ds.data() + n * BATCH, count, cache.derivative[n]);
        std::fill_n(cache.dg.data() + n * BATCH, count, cache.gate_derivative[n]);
      }
      continue;
    }
    std::array<float, BATCH> sum{}, gate{}, raw{};
    for (std::size_t j = c.offset; j < c.offset + c.count; ++j) {
      const auto *src = state.data() + code.sources[j] * BATCH;
      float weight = code.weights[j];
      auto *accumulator = code.ports[j] ? gate.data() : sum.data();
#pragma omp simd
      for (std::size_t p = 0; p < count; ++p)
        accumulator[p] = std::fma(src[p], weight, accumulator[p]);
    }
    // Dispatch once for the whole point batch; simple activations can then
    // run over consecutive values without a type switch for every sample.
    const auto first = code.controls.size() - code.outputs;
    const bool squash = n >= first && (code.tanh_outputs & (1ull << (n - first)));
    auto activate = [&](auto function) {
      bool invalid = false;
      if (squash)
        for (std::size_t p = 0; p < count; ++p) {
          const float out = function(sum[p]);
          if (record_work)
            raw[p] = out;
          invalid |= std::isnan(out);
          state[n * BATCH + p] = std::tanh(sum[p]);
        }
      else
        for (std::size_t p = 0; p < count; ++p) {
          const float out = function(sum[p]);
          if (record_work)
            raw[p] = out;
          invalid |= std::isnan(out);
          state[n * BATCH + p] = std::max(-1.f, std::min(1.f, out));
        }
      if (invalid)
        throw std::runtime_error("neuron produced NaN");
    };
    using evolution::NodeType;
    switch (NodeType(c.type)) {
    case NodeType::TOR:
      for (std::size_t p = 0; p < count; ++p)
        state[n * BATCH + p] = std::clamp(sum[p], -1.f, 1.f) * std::clamp(gate[p], -1.f, 1.f);
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
      const float b = c.bias == 0 ? 1.f : c.bias,
                  denominator = b * b * (1.f / evolution::GAUSSIAN_SHARPNESS);
      activate([&](float u) { return std::exp(-(u * u) / denominator); });
      break;
    }
    default:
      activate([&](float u) { return activation(c.type, u, c.bias); });
      break;
    }
    if (record_work) {
      auto *ds = cache.ds.data() + n * BATCH, *dg = cache.dg.data() + n * BATCH;
      switch (NodeType(c.type)) {
      case NodeType::CUTOFF:
      case NodeType::SIGN:
      case NodeType::STAIR:
        std::fill_n(ds, count, 0.f);
        std::fill_n(dg, count, 0.f);
        break;
      case NodeType::LINEAR:
#pragma omp simd
        for (std::size_t p = 0; p < count; ++p)
          ds[p] = std::abs(raw[p]) >= 1 ? 0 : c.bias;
        std::fill_n(dg, count, 0.f);
        break;
      default:
        for (std::size_t p = 0; p < count; ++p) {
          const auto d = derivatives(c, sum[p], gate[p], raw[p]);
          ds[p] = d[0];
          dg[p] = d[1];
        }
        break;
      }
    }
    cache.ready[n] = 0;
  }
  observe([&](auto n, auto p) { return state[n * BATCH + p]; },
          [&](auto n, auto p) { return cache.ds[n * BATCH + p]; },
          [&](auto n, auto p) { return cache.dg[n * BATCH + p]; });
  for (std::size_t p = 0; p < count; ++p)
    for (std::size_t i = 0; i < code.outputs; ++i)
      if (mask & (1ull << i))
        output[p][i] = state[(code.controls.size() - code.outputs + i) * BATCH + p];
}

}
