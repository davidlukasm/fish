#include <cstdio>
#include <unordered_map>
#include <string>
#include <cstdlib>
#include "substrate.hh"
#include "mix.hh"
#include "contacts.hh"
#include "maturation.hh"
#include "retinal_tissue.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <queue>
#include <numeric>
#include <climits>
#include <mutex>
#include <istream>
#include <ostream>
#include <cstring>
#include <limits>
#if defined(__AVX2__)
#include <immintrin.h>
#endif
// All eight-lane helper arguments and results stay inside this translation unit.
// Without AVX, GCC splits them into the available machine vectors; there is no external
// vector ABI to match. Keep the portable build while silencing that inapplicable warning.
// Do not restore this diagnostic at EOF: GCC can emit it during deferred code generation.
#if defined(__GNUC__) && !defined(__clang__) && !defined(__AVX__)
#pragma GCC diagnostic ignored "-Wpsabi"
#endif
namespace field {
namespace {
// LANES fixed lanes (GNU vector extension). The lanes and the order of the final sums are part
// of the code, so the result is the same with SSE, AVX2 or AVX-512.
constexpr int LANES = CONTACT_LANES;
typedef float F8 __attribute__((vector_size(LANES * sizeof(float))));
typedef std::int32_t I8 __attribute__((vector_size(LANES * sizeof(std::int32_t))));
inline F8 load8(const float *p) {
  F8 v;
  std::memcpy(&v, p, sizeof v);
  return v;
}
inline void store8(float *p, const F8 &v) {
  std::memcpy(p, &v, sizeof v);
}
inline F8 splat8(float a) {
  return F8{} + a;
}
// Keep these vector operations in their caller; GCC LTO clones can lose diagnostic settings.
inline __attribute__((always_inline)) F8 abs8(const F8 &v) {
  return (F8)((I8)v & 0x7fffffff);
}
inline __attribute__((always_inline)) F8 clamp8(const F8 &input, float lo, float hi) {
  F8 v = input;
  v = v < splat8(lo) ? splat8(lo) : v;
  return v > splat8(hi) ? splat8(hi) : v;
}
inline float sum8(const F8 &v) {
  return ((v[0] + v[1]) + (v[2] + v[3])) + ((v[4] + v[5]) + (v[6] + v[7]));
}
template <class Index> inline I8 load_index8(const Index *p) {
  I8 v;
  for (int l = 0; l < LANES; ++l)
    v[l] = std::int32_t(p[l]);
  return v;
}
// 8 scattered loads: hardware gather only on AVX-512 machines (on AMD Zen 2/3 the AVX2 gather is
// microcoded and slower than single loads).
inline F8 gather8(const float *base, const I8 &index) {
#if defined(__AVX512F__)
  __m256i i;
  std::memcpy(&i, &index, sizeof i);
  const __m256 r = _mm256_i32gather_ps(base, i, sizeof(float));
  F8 v;
  std::memcpy(&v, &r, sizeof v);
  return v;
#else
  F8 v;
  for (int l = 0; l < LANES; ++l)
    v[l] = base[index[l]];
  return v;
#endif
}
constexpr double PI_F = 3.14159265358979323846;
constexpr double MIN_PACE_PERIOD = TIME_CONSTANT_PACE_MIN;
// A muscle cell with a high threshold is a large motor unit: it joins only once the command is
// as strong as this, so a weak drive moves only the small units.
constexpr float MUSCLE_RECRUITMENT = 1;
constexpr std::array<double, 3> PHASE_SALT{7.31, 3.17, 1.93};
// A cell's own beat: its phase from where it grew (each side half a turn apart), its period its
// cell time. Pacemaker nerves swing with it; sense cells that answer a rhythm fire on its crests.
double own_beat(const Neuron &c, std::uint64_t ticks, double tau) {
  const double phase =
      (c.x > 0 ? PI_F : 0.) +
      2 * PI_F *
          std::fmod(std::abs(c.x) * PHASE_SALT[0] + c.y * PHASE_SALT[1] + c.z * PHASE_SALT[2], 1.);
  return std::sin(phase + 2 * PI_F * double(ticks) / std::max(MIN_PACE_PERIOD, tau));
}
constexpr std::uint64_t PCG_MULTIPLIER = 6364136223846793005ull,
                        PCG_INCREMENT = 1442695040888963407ull;

}
const char *role_name(Role r) {
  return r == Role::Sensor ? "sensor" : r == Role::Effector ? "effector" : "nerve";
}
void Options::validate() const {
  if (!std::isfinite(bias_scale) || bias_scale < 0 || bias_scale > MAX_BIAS_SCALE ||
      max_nodes < 1 || max_nodes > MAX_NODES || max_edges < 1 || max_edges > MAX_EDGES)
    throw std::invalid_argument("invalid brain options");
}
Substrate::Substrate(cppn::CPPN &p, Options o) : combined(&p), options(o) {
  options.validate();
  if (p.outputs() != ANATOMICAL_OUTPUTS)
    throw std::invalid_argument("current fish CPPN required");
}
Substrate::Substrate(std::vector<Neuron> planned, Options o)
    : combined(nullptr), options(o), neurons(std::move(planned)) {
  options.validate();
}
struct Substrate::FinishState {
  enum Stage {
    Count,
    Prefix,
    Scatter,
    Mark,
    Outward,
    Inward,
    Recurrent,
    Layout,
    Done
  } stage = Count;
  std::size_t cursor = 0, root = 0;
  std::uint32_t group = 0;
  std::vector<std::uint32_t> out_offset, in_offset, out_at, in_at, in_to, finished, component;
  std::vector<unsigned char> visited;
  std::vector<std::pair<std::uint32_t, std::size_t>> stack;
  std::vector<Edge> sorted;
  std::shared_ptr<NetworkTopology> layout;
  explicit FinishState(const Substrate &s)
      : out_offset(s.neurons.size() + 1), in_offset(s.neurons.size() + 1), in_to(s.edges.size()),
        component(s.neurons.size(), UINT32_MAX), visited(s.neurons.size()), sorted(s.edges.size()) {
  }
  bool advance(Substrate &s, std::size_t &budget);
};

struct NetworkTopology {
  std::vector<NeuronIndex> sensors;
  std::vector<std::uint32_t> sensor_slot;
  std::vector<CellClass> classes;
  std::vector<float> fast, retention, learning, sign, nerve, modulator, level;
  std::vector<double> tau;
  std::vector<std::vector<NeuronIndex>> groups;
  std::vector<std::vector<std::uint32_t>> proposals;
  std::size_t cursor = 0, edge_cursor = 0, reserved = 0;
  bool ready = false, has_level = false;
  bool advance(const Substrate &s, std::size_t &budget) {
    if (ready)
      return true;
    const auto n = s.neurons.size();
    if (sensor_slot.empty()) {
      sensor_slot.assign(n, UINT32_MAX);
      classes.resize(n);
      fast.resize(n + 1);
      retention.resize(n + 1, 1);
      learning.resize(n + 1, 4);
      tau.resize(n + 1, 4);
      sign.resize(n + 1);
      nerve.resize(n + 1);
      modulator.resize(n + 1);
      level.resize(n + 1);
      proposals.resize(n);
    }
    while (budget && cursor < n) {
      --budget;
      const auto i = cursor++;
      const auto &c = s.neurons[i];
      classes[i] = cell_class(c);
      tau[i] = time_constant_steps(c.parameters);
      const auto lt = learning_time_steps(c.parameters);
      learning[i] = float(lt);
      fast[i] = float(std::exp(-2 / tau[i]));
      retention[i] = float(std::exp(-1 / lt));
      sign[i] = c.role == Role::Sensor ? 1 : classes[i].sign;
      nerve[i] = c.role == Role::Nerve;
      modulator[i] = teaching_source(c);
      level[i] = nerve[i] * std::clamp(2 * c.parameters.quality2, 0.f, 1.f);
      has_level |= level[i] > 0;
      if (c.role == Role::Sensor) {
        sensor_slot[i] = std::uint32_t(sensors.size());
        sensors.push_back(NeuronIndex(i));
      }
      if (groups.size() <= c.group)
        groups.resize(c.group + 1);
      groups[c.group].push_back(NeuronIndex(i));
      reserved += contact_storage(contact_capacity(c));
    }
    while (budget && cursor == n && edge_cursor < s.edges.size()) {
      --budget;
      const auto i = edge_cursor++;
      const auto &e = s.edges[i];
      proposals[e.source].push_back(std::uint32_t(i));
      proposals[e.target].push_back(std::uint32_t(i));
    }
    return ready = cursor == n && edge_cursor == s.edges.size();
  }
  explicit NetworkTopology(const Substrate &s) {
    auto budget = std::numeric_limits<std::size_t>::max();
    advance(s, budget);
  }
  NetworkTopology() = default;
};
bool Substrate::FinishState::advance(Substrate &s, std::size_t &budget) {
  while (budget && stage != Done) {
    --budget;
    switch (stage) {
    case Count:
      if (cursor < s.edges.size()) {
        const auto &e = s.edges[cursor++];
        if (e.source >= s.neurons.size() || e.target >= s.neurons.size())
          throw std::invalid_argument("invalid synapse");
        ++out_offset[e.source + 1];
        ++in_offset[e.target + 1];
      } else {
        cursor = 1;
        stage = Prefix;
      }
      break;
    case Prefix:
      if (cursor < out_offset.size()) {
        out_offset[cursor] += out_offset[cursor - 1];
        in_offset[cursor] += in_offset[cursor - 1];
        ++cursor;
      } else {
        out_at = out_offset;
        in_at = in_offset;
        cursor = 0;
        stage = Scatter;
      }
      break;
    case Scatter:
      if (cursor < s.edges.size()) {
        const auto &e = s.edges[cursor++];
        sorted[out_at[e.source]++] = e;
      } else {
        // CellGrowth emits targets in ascending order. Counting by source preserves that order
        // inside each row, so the resulting edges already have the canonical (source, target)
        // order.
        s.edges = std::move(sorted);
        cursor = 0;
        stage = Mark;
      }
      break;
    case Mark:
      if (cursor < s.edges.size()) {
        const auto &e = s.edges[cursor++];
        in_to[in_at[e.target]++] = e.source;
      } else {
        cursor = 0;
        stage = Outward;
      }
      break;
    case Outward:
      if (!stack.empty()) {
        auto &frame = stack.back();
        const auto node = frame.first;
        if (frame.second < out_offset[node + 1]) {
          const auto target = s.edges[frame.second++].target;
          if (!visited[target]) {
            visited[target] = 1;
            stack.push_back({target, out_offset[target]});
          }
        } else {
          finished.push_back(node);
          stack.pop_back();
        }
      } else if (root < s.neurons.size()) {
        const auto node = std::uint32_t(root++);
        s.neurons[node].functional = !s.resource_limited;
        if (!visited[node]) {
          visited[node] = 1;
          stack.push_back({node, out_offset[node]});
        }
      } else {
        cursor = finished.size();
        stage = Inward;
      }
      break;
    case Inward:
      if (!stack.empty()) {
        auto &frame = stack.back();
        const auto node = frame.first;
        if (frame.second < in_offset[node + 1]) {
          const auto target = in_to[frame.second++];
          if (component[target] == UINT32_MAX) {
            component[target] = group;
            stack.push_back({target, in_offset[target]});
          }
        } else {
          stack.pop_back();
          if (stack.empty())
            ++group;
        }
      } else if (cursor) {
        const auto node = finished[--cursor];
        if (component[node] == UINT32_MAX) {
          component[node] = group;
          stack.push_back({node, in_offset[node]});
        }
      } else {
        cursor = 0;
        s.recurrent_edges = 0;
        stage = Recurrent;
      }
      break;
    case Recurrent:
      if (cursor < s.edges.size()) {
        const auto &e = s.edges[cursor++];
        s.recurrent_edges += component[e.source] == component[e.target];
      } else {
        layout = std::make_shared<NetworkTopology>();
        stage = Layout;
      }
      break;
    case Layout:
      ++budget;
      if (!layout->advance(s, budget))
        return false;
      s.network_layout = std::move(layout);
      stage = Done;
      break;
    case Done:
      break;
    }
  }
  return stage == Done;
}
bool Substrate::finish_development(std::size_t &budget) {
  if (!finish_state)
    finish_state = std::make_shared<FinishState>(*this);
  if (!finish_state->advance(*this, budget))
    return false;
  finish_state.reset();
  return true;
}
namespace {
constexpr float PRUNE = plasticity::prune_share * SYNAPSE_UNIT;
float learning_rate(const Neuron &n, float hormone) {
  return MIN_LEARNING_RATE + (MAX_LEARNING_GAIN - MIN_LEARNING_RATE) *
                                 std::clamp(n.parameters.plasticity, 0.f, 1.f) *
                                 (.5f * (1 + hormone));
}
F8 decay8(F8 use, F8 time, F8 consolidated) {
  const F8 d = (splat8(float(std::log(2.) / plasticity::baseline_steps)) +
                (1 - use) / (plasticity::unused_decay_span * time)) *
               (1 - consolidated);
  return 1 - d + d * d * (.5f - d / 6);
}
}
Network::Network(std::shared_ptr<const Substrate> s, bool developing)
    : tissue(std::move(s)), developing_(developing) {
  if (tissue->neurons.size() > MAX_NODES)
    throw std::length_error("neuron budget exceeded");
  materialize();
}
void Network::materialize() const {
  if (topology)
    return;
  static std::mutex mutex;
  std::lock_guard<std::mutex> lock(mutex);
  if (!tissue->network_layout)
    tissue->network_layout = std::make_shared<NetworkTopology>(*tissue);
  auto &self = const_cast<Network &>(*this);
  self.topology = tissue->network_layout;
  self.prepare_state();
}
void Network::prepare_state() {
  const auto n = tissue->neurons.size();
  for (auto *v : {&state_, &next_, &pulse_, &organ_output_, &retinal_activity_, &retinal_recovery_,
                  &retinal_next_, &synaptic_mean_, &usual_, &own_mean_, &action_mean_, &teach_mean_,
                  &contrast_, &progress_})
    v->assign(n, 0);
  signal_.assign(n + 1, 0);
  deviation_ = cell_surprise_ = signal_;
  rows_.assign(n, {});
  muted_.assign(n, 0);
  dead_ = born_ = muted_;
  age_.assign(n, 0);
  for (auto &v : hormone_effect_)
    v.assign(n, 0);
  for (auto *v : {&weight_, &trace_, &predict_, &usage_, &consolidation_})
    v->clear();
  index_.clear();
  owner_.clear();
  trial_steps_left_.clear();
  free_rows_.clear();
  proposal_queue_.clear();
  proposal_cursor_ = 0;
  active_.clear();
  active_nerves_.clear();
  active_effectors_.clear();
  active_sensors_.clear();
  retina_.clear();
  dead_count_ = 0;
  wiring_ = formed_ = {};
  revision_ = tissue_revision_ = organ_revision_ = 0;
  if (!developing_) {
    for (std::size_t i = 0; i < n; ++i)
      activate(i);
    for (auto e : proposal_queue_) {
      const auto &p = tissue->edges[e];
      insert_contact(p.source, p.target);
    }
    proposal_queue_.clear();
    proposal_cursor_ = 0;
    formed_ = {};
    refresh_active();
  }
}
void Network::activate(std::size_t i) {
  if (born_[i] || dead_[i])
    return;
  const auto &c = tissue->neurons[i];
  born_[i] = 1;
  organ_revision_ += c.role != Role::Nerve;
  progress_[i] = 1;
  active_.push_back(NeuronIndex(i));
  if (c.role == Role::Nerve)
    active_nerves_.push_back(NeuronIndex(i));
  else if (c.role == Role::Effector)
    active_effectors_.push_back(NeuronIndex(i));
  else
    active_sensors_.push_back(NeuronIndex(i));
  const auto capacity = contact_capacity(c);
  auto &r = rows_[i];
  r.capacity = std::uint16_t(capacity);
  const auto storage = contact_storage(capacity);
  if (storage) {
    auto &free = free_rows_[storage];
    if (!free.empty()) {
      r.offset = free.back();
      free.pop_back();
    } else {
      r.offset = std::uint32_t(index_.size());
      index_.resize(index_.size() + storage, std::uint16_t(tissue->neurons.size()));
      owner_.resize(index_.size());
      trial_steps_left_.resize(index_.size());
      for (auto *v : {&weight_, &trace_, &predict_, &usage_, &consolidation_})
        v->resize(index_.size(), 0);
    }
    std::fill(owner_.begin() + r.offset, owner_.begin() + r.offset + storage, NeuronIndex(i));
  }
  for (auto e : topology->proposals[i]) {
    const auto &p = tissue->edges[e];
    if (born_[p.source] && born_[p.target] && !dead_[p.source] && !dead_[p.target])
      proposal_queue_.push_back(e);
  }
  ++revision_;
  ++tissue_revision_;
}
double Network::contact_length(NeuronIndex s, NeuronIndex t) const {
  return connection_length(tissue->neurons[s], tissue->neurons[t]);
}
void Network::erase_contact(std::size_t k) {
  if (index_[k] == tissue->neurons.size())
    return;
  const auto t = owner_[k];
  wiring_.length = std::max(0., wiring_.length - contact_length(index_[k], t));
  --wiring_.contacts;
  auto &row = rows_[t];
  --row.count;
  index_[k] = NeuronIndex(tissue->neurons.size());
  weight_[k] = trace_[k] = predict_[k] = usage_[k] = consolidation_[k] = 0;
  trial_steps_left_[k] = 0;
  while (row.extent && index_[row.offset + row.extent - 1] == tissue->neurons.size())
    --row.extent;
  ++revision_;
}
void Network::die(std::size_t i) {
  if (dead_[i])
    return;
  dead_[i] = 1;
  organ_revision_ += tissue->neurons[i].role != Role::Nerve;
  ++dead_count_;
  ++tissue_revision_;
  ++revision_;
  state_[i] = next_[i] = signal_[i] = pulse_[i] = organ_output_[i] = 0;
  auto &r = rows_[i];
  for (std::size_t j = 0; j < r.capacity; ++j)
    erase_contact(r.offset + j);
  if (r.capacity)
    free_rows_[contact_storage(r.capacity)].push_back(r.offset);
  r = {};
}
void Network::refresh_active() {
  for (auto *v : {&active_, &active_nerves_, &active_effectors_, &active_sensors_})
    v->erase(std::remove_if(v->begin(), v->end(), [&](auto i) { return dead_[i]; }), v->end());
  const auto light = [&](auto i) { return tissue->neurons[i].functions.senses[Light] > 0; };
  if (std::count_if(active_sensors_.begin(), active_sensors_.end(), light) !=
          std::ptrdiff_t(retina_.size()) ||
      std::any_of(retina_.begin(), retina_.end(),
                  [&](const auto &r) { return inactive(r.neuron); })) {
    auto mask = born_;
    for (std::size_t i = 0; i < mask.size(); ++i)
      mask[i] = mask[i] && !dead_[i];
    retina_ = retinal_tissue(tissue->neurons, &mask);
  }
  stimuli_.erase(std::remove_if(stimuli_.begin(), stimuli_.end(),
                                [&](const auto &s) { return inactive(s.neuron); }),
                 stimuli_.end());
}
void Network::apply_hormones(const Hormones &h) {
  for (double v : h)
    if (!std::isfinite(v) || v < 0 || v > 1)
      throw std::invalid_argument("invalid local modulation");
  active_hormones_ = h;
  bool died = false;
  for (auto i : active_) {
    const auto &c = tissue->neurons[i];
    for (int e = 0; e < HORMONE_EFFECTS; ++e)
      hormone_effect_[e][i] = c.hormone_receptors[e].response(h, maturity_, reserve_, fatigue_);
    if (plasticity_enabled && hormone_effect_[Death][i] > .5f) {
      die(i);
      died = true;
    }
  }
  if (died)
    refresh_active();
}
bool Network::insert_contact(NeuronIndex s, NeuronIndex t) {
  if (inactive(s) || inactive(t) || s == t ||
      connection_kind(tissue->neurons[s], tissue->neurons[t]) < 0 ||
      wiring_.contacts >= tissue->options.max_edges)
    return false;
  const auto limit = std::abs(contact_limit(tissue->neurons[s], tissue->neurons[t]));
  if (limit == 0)
    return false;
  auto &r = rows_[t];
  std::size_t free = index_.size();
  for (std::size_t j = 0; j < r.extent; ++j) {
    const auto k = r.offset + j;
    if (index_[k] == s)
      return false;
    if (index_[k] == tissue->neurons.size() && free == index_.size())
      free = k;
  }
  if (free == index_.size() && r.extent < r.capacity)
    free = r.offset + r.extent;
  if (free == index_.size())
    return false;
  const double length = contact_length(s, t);
  const auto costs = scaled_costs(tissue->options);
  const double cost = (costs.edge_build + length * costs.edge_length_build) * build_scale_;
  if (cost > build_budget_)
    return false;
  build_budget_ -= cost;
  index_[free] = s;
  weight_[free] = trace_[free] = predict_[free] = usage_[free] = consolidation_[free] = 0;
  const auto learner = tissue->neurons[t].role == Role::Effector ? s : t;
  trial_steps_left_[free] = std::uint16_t(
      std::ceil(plasticity::contact_trial_time_constants * topology->learning[learner]));
  ++r.count;
  r.extent = std::max(r.extent, std::uint16_t(free - r.offset + 1));
  ++wiring_.contacts;
  wiring_.length += length;
  ++formed_.contacts;
  formed_.length += length;
  ++revision_;
  return true;
}
void Network::set_body_levels(double maturity, double reserve, double fatigue) {
  for (double value : {maturity, reserve, fatigue})
    if (!std::isfinite(value) || value < 0 || value > 1)
      throw std::invalid_argument("invalid body blood level");
  maturity_ = maturity;
  reserve_ = reserve;
  fatigue_ = fatigue;
}
double Network::grow(const Hormones &h, double maturity, double reserve, double fatigue,
                     double available, double scale) {
  set_body_levels(maturity, reserve, fatigue);
  for (double v : h)
    if (!std::isfinite(v) || v < 0 || v > 1)
      throw std::invalid_argument("invalid local modulation");
  active_hormones_ = h;
  if (!plasticity_enabled)
    return 0;
  bool died = false;
  for (auto i : active_)
    if (tissue->neurons[i].hormone_receptors[Death].response(h, maturity_, reserve_, fatigue_) >
        .5f) {
      die(i);
      died = true;
    }
  if (died)
    refresh_active();
  if (!developing_)
    return 0;
  construction_budget(available, scale);
  const auto n = tissue->neurons.size();
  const auto costs = scaled_costs(tissue->options);
  const double work = costs.work_per_tick;
  growth_credit_ = std::min(development_credit_limit(costs), growth_credit_ + work);
  ++development_ticks_;
  if (development_ticks_ % CELL_DEVELOPMENT_INTERVAL)
    return 0;
  ready_.clear();
  bool changed = false;
  for (std::size_t i = 0; i < n; ++i)
    if (!born_[i] && !dead_[i]) {
      const auto &c = tissue->neurons[i];
      if (c.hormone_receptors[Death].response(h, maturity_, reserve_, fatigue_) > .5f) {
        die(i);
        changed = true;
        continue;
      }
      const double response = std::clamp(
          double(c.development_receptor.response(h, maturity_, reserve_, fatigue_)), 0., 1.);
      progress_[i] = float(
          std::min(1., progress_[i] + CELL_DEVELOPMENT_INTERVAL * response / topology->tau[i]));
      if (progress_[i] >= 1 && response > 0)
        ready_.push_back(i);
    }
  const auto order = [&](std::size_t i) {
    return splitmix(tissue->neurons[i].id ^ tissue->variation_seed ^
                    (development_ticks_ / CELL_DEVELOPMENT_INTERVAL * SPLITMIX_GAMMA));
  };
  std::sort(ready_.begin(), ready_.end(), [&](auto a, auto b) { return order(a) < order(b); });
  double cost = 0;
  for (auto i : ready_) {
    if (growth_credit_ < costs.neuron_work || build_budget_ < costs.neuron_build * scale)
      break;
    growth_credit_ -= costs.neuron_work;
    const double paid = costs.neuron_build * scale;
    build_budget_ -= paid;
    cost += paid;
    activate(i);
    changed = true;
  }
  while (proposal_cursor_ < proposal_queue_.size() && growth_credit_ >= costs.edge_work) {
    const auto &p = tissue->edges[proposal_queue_[proposal_cursor_]];
    const double needed =
        (costs.edge_build + costs.edge_length_build * contact_length(p.source, p.target)) * scale;
    if (build_budget_ < needed)
      break;
    const double before = build_budget_;
    insert_contact(p.source, p.target);
    cost += before - build_budget_;
    growth_credit_ -= costs.edge_work;
    ++proposal_cursor_;
  }
  if (proposal_cursor_ == proposal_queue_.size()) {
    proposal_queue_.clear();
    proposal_cursor_ = 0;
  }
  if (changed)
    refresh_active();
  formed_ = {};
  return cost;
}
double Network::turnover_unit() {
  turnover_rng_ = turnover_rng_ * PCG_MULTIPLIER + PCG_INCREMENT + learning_seed;
  return unit_center(splitmix(turnover_rng_));
}
void Network::form_synapse(NeuronIndex t) {
  if (inactive(t) || rows_[t].count >= rows_[t].capacity)
    return;
  const auto g = tissue->neurons[t].group;
  if (g + 1 >= tissue->partner_offset.size())
    return;
  const auto first = tissue->partner_offset[g], last = tissue->partner_offset[g + 1];
  if (last == first)
    return;
  const auto &p =
      tissue->partners[first + std::size_t(turnover_unit() * (last - first)) % (last - first)];
  if (p.source >= topology->groups.size() || turnover_unit() >= p.p)
    return;
  const auto &members = topology->groups[p.source];
  if (members.empty())
    return;
  const auto s = members[std::size_t(turnover_unit() * members.size()) % members.size()];
  if (inactive(s))
    return;
  const bool teacher =
      contact_effect(tissue->neurons[s], tissue->neurons[t]) == ContactEffect::Teaching;
  float evidence = std::abs(contrast_[t]);
  const auto &r = rows_[t];
  for (std::size_t j = 0; teacher && j < r.extent; ++j)
    evidence = std::max(evidence, std::abs(trace_[r.offset + j]));
  const auto learner = tissue->neurons[t].role == Role::Effector ? s : t;
  const auto mode = topology->classes[learner].mode;
  const float would =
      std::max(0.f, mode) * deviation_[s] * contrast_[t] -
      plasticity::cancellation * std::max(0.f, -mode) * deviation_[s] * contrast_[t] +
      cell_surprise_[learner] * deviation_[s] * contrast_[t];
  if (teacher) {
    if (turnover_unit() >= plasticity::basal_formation + (1 - plasticity::basal_formation) *
                                                             std::abs(signal_[s]) *
                                                             std::min(1.f, evidence))
      return;
  } else if (turnover_unit() >= plasticity::basal_formation && would * topology->sign[s] <= 0)
    return;
  insert_contact(s, t);
}
void Network::advance_retina(std::uint64_t individual) {
  if (!retinal_seeded_) {
    retinal_rng_ = splitmix(individual ^ tissue->development_seed ^ tissue->variation_seed ^
                            0x2bf736ca93d1b185ull);
    retinal_seeded_ = true;
  }
  for (const auto &r : retina_) {
    const auto i = r.neuron;
    retinal_rng_ = splitmix(retinal_rng_);
    if (inactive(i)) {
      retinal_next_[i] = retinal_recovery_[i] = 0;
      continue;
    }
    const auto excitability = std::clamp(r.excitability + hormone_effect_[Excitation][i], 0.f, 1.f);
    float neighbors = 0;
    for (unsigned k = 0; k < r.count; ++k)
      if (!inactive(retina_[r.neighbors[k]].neuron))
        neighbors = std::max(neighbors, retinal_activity_[retina_[r.neighbors[k]].neuron]);
    const double spontaneous = unit_center(retinal_rng_) <
                               retinal_dynamics::spontaneous_rate * excitability * excitability;
    const double drive = excitability * (retinal_dynamics::coupling * neighbors + spontaneous);
    const bool fires = drive > retinal_dynamics::threshold +
                                   retinal_dynamics::refractory_gain * retinal_recovery_[i];
    retinal_next_[i] = fires ? 1 : float(retinal_activity_[i] * r.activity_decay);
    retinal_recovery_[i] = fires ? 1 : float(retinal_recovery_[i] * r.recovery_decay);
  }
  retinal_activity_.swap(retinal_next_);
}
void Network::advance(const std::vector<float> &values, const Hormones &h,
                      std::uint64_t individual) {
  if (values.size() != topology->sensors.size())
    throw std::invalid_argument("wrong sensor count");
  for (float v : values)
    if (!std::isfinite(v))
      throw std::invalid_argument("invalid stimulus");
  if (!neural_ticks_) {
    learning_seed = individual;
    turnover_rng_ = individual ^ 0x5851f42d4c957f2dull;
  }
  apply_hormones(h);
  ++neural_ticks_;
  formed_ = {};
  learning_summary_ = {};
  advance_retina(individual);
  for (auto i : active_)
    signal_[i] = inactive(i) ? 0 : state_[i];
  for (auto i : active_sensors_) {
    const float x = std::clamp(values[topology->sensor_slot[i]], 0.f, 1.f);
    const float output = .5f * (1 + hormone_effect_[Output][i]);
    signal_[i] = inactive(i) ? 0 : x * output;
  }
  for (const auto &r : retina_)
    if (!inactive(r.neuron))
      signal_[r.neuron] += (1 - signal_[r.neuron]) * retinal_activity_[r.neuron] *
                           (.5f * (1 + hormone_effect_[Output][r.neuron]));
  // Spontaneous activity of a sense cell, as far as its rhythm answer is positive: bursts on the
  // crests of its own beat. Cells of one kind share the beat's period (their cell time) but not
  // its timing (their place). Without an answer the cell only reports its stimulus; the organ
  // decides when its cells fire on their own, e.g. inside the egg to grow their wiring.
  for (auto i : active_sensors_) {
    const float drive = hormone_effect_[Rhythm][i];
    if (drive <= 0 || inactive(i))
      continue;
    const double burst =
        drive * std::max(0., own_beat(tissue->neurons[i], neural_ticks_, topology->tau[i]));
    signal_[i] += float((1 - signal_[i]) * burst * .5 * (1 + hormone_effect_[Output][i]));
  }
  for (const auto &s : stimuli_)
    signal_[s.neuron] = std::max(signal_[s.neuron], pulse_[s.neuron]);
  const auto n = tissue->neurons.size();
  signal_[n] = deviation_[n] = 0;
  const float mean_decay = float(std::exp(-1 / plasticity::baseline_steps));
  for (auto i : active_) {
    const float rm = std::min(mean_decay, float(age_[i] + 1) / float(age_[i] + 2));
    usual_[i] = rm * usual_[i] + (1 - rm) * signal_[i];
    deviation_[i] = signal_[i] - usual_[i];
    cell_surprise_[i] = 0;
    ++age_[i];
  }
  const auto evaluate = [&](NeuronIndex i, bool effector) {
    const auto &c = tissue->neurons[i];
    const auto &cl = topology->classes[i];
    const auto &r = rows_[i];
    if (inactive(i)) {
      next_[i] = organ_output_[i] = 0;
      return;
    }
    const auto storage = contact_storage(r.extent);
    for (std::size_t j = 0; plasticity_enabled && j < r.extent; ++j)
      if (index_[r.offset + j] != n && inactive(index_[r.offset + j]))
        erase_contact(r.offset + j);
    F8 electrical{}, modulation{}, old_trace{};
    for (std::size_t j = 0; j < storage; j += LANES) {
      const auto k = r.offset + j;
      const I8 ix = load_index8(index_.data() + k);
      const F8 x = gather8(signal_.data(), ix), w = load8(weight_.data() + k);
      const F8 mod = effector ? F8{} : gather8(topology->modulator.data(), ix);
      electrical += (1 - mod) * x * w;
      modulation += mod * x * w;
      const F8 e = (1 - mod) * abs8(load8(trace_.data() + k));
      old_trace = e > old_trace ? e : old_trace;
    }
    const float input = sum8(electrical), mod = sum8(modulation);
    const float rm = std::min(mean_decay, float(age_[i]) / float(age_[i] + 1));
    synaptic_mean_[i] +=
        float((input - synaptic_mean_[i]) / (SYNAPTIC_ADAPTATION_SPAN * topology->tau[i]));
    const double rhythm = effector ? 0
                                   : cl.pace * .5 * (1 + hormone_effect_[Rhythm][i]) *
                                         own_beat(c, neural_ticks_, topology->tau[i]);
    const float response = effector ? 0 : std::clamp(c.parameters.quality2, 0.f, 1.f);
    const float level = std::min(1.f, 2 * response), memory = std::max(0.f, 2 * response - 1);
    const float drive = (1 - memory) * input + (memory + level - 1) * synaptic_mean_[i];
    const float activation =
        float(std::tanh(c.bias + hormone_effect_[Excitation][i] + rhythm + drive));
    const float rectification = effector ? 0 : std::clamp(c.parameters.quality1, 0.f, 1.f);
    const float self = (activation + rectification * (std::max(0.f, activation) - activation)) *
                       (.5f * (1 + hormone_effect_[Output][i]));
    const float own = pulse_[i] > 0 ? std::max(pulse_[i], self) : self;
    const bool level_learning = effector ? topology->has_level : level > 0;
    float evoked = 0;
    if (level_learning) {
      const float resting = float(std::tanh(c.bias + hormone_effect_[Excitation][i] + rhythm));
      const float intrinsic = (resting + rectification * (std::max(0.f, resting) - resting)) *
                              (.5f * (1 + hormone_effect_[Output][i]));
      // Spontaneous activity can consolidate a coincident input; it must not displace every
      // silent afferent merely because the postsynaptic cell has a resting bias or pacemaker.
      evoked = std::max(0.f, own - intrinsic);
    }
    next_[i] = own;
    if (effector) {
      const float dead = c.functions.muscle()
                             ? MUSCLE_RECRUITMENT * std::max(0.f, 2 * c.parameters.threshold - 1)
                             : std::max(0.f, -c.bias);
      const float drive =
          std::copysign(std::max(0.f, std::abs(input + pulse_[i]) - dead), input + pulse_[i]);
      organ_output_[i] = float(std::tanh((1 + hormone_effect_[Excitation][i]) * drive)) *
                         (.5f * (1 + hormone_effect_[Output][i]));
    }
    const float y = own - own_mean_[i];
    own_mean_[i] = rm * own_mean_[i] + (1 - rm) * own;
    const float action = effector ? own : .5f * (1 + hormone_effect_[Eligibility][i]) * own;
    action_mean_[i] = rm * action_mean_[i] + (1 - rm) * action;
    const float dpost = effector ? y : action - action_mean_[i];
    contrast_[i] = dpost;
    const float teach = std::clamp(hormone_effect_[Teaching][i] + mod, -1.f, 1.f);
    const float dteach = teach - teach_mean_[i];
    teach_mean_[i] = rm * teach_mean_[i] + (1 - rm) * teach;
    F8 prediction{}, x2{}, e2{};
    float evidence = std::abs(dpost);
    for (int k = 0; k < LANES; ++k)
      evidence = std::max(evidence, old_trace[k]);
    const float target_gain = learning_rate(c, hormone_effect_[Learning][i]);
    for (std::size_t j = 0; j < storage; j += LANES) {
      const auto k = r.offset + j;
      const I8 ix = load_index8(index_.data() + k);
      const F8 ordinary = effector ? splat8(1) : 1 - gather8(topology->modulator.data(), ix);
      const F8 xc = ordinary * gather8(deviation_.data(), ix);
      const F8 time =
          effector ? gather8(topology->learning.data(), ix) : splat8(topology->learning[i]);
      const F8 retain =
          effector ? gather8(topology->retention.data(), ix) : splat8(topology->retention[i]);
      const F8 fast = effector ? gather8(topology->fast.data(), ix) : splat8(topology->fast[i]);
      F8 e = clamp8(plasticity::trace_update(retain, load8(trace_.data() + k), fast, xc,
                                             splat8(dpost)),
                    -1, 1) *
             ordinary;
      F8 use = abs8(e);
      if (level_learning) {
        const F8 level =
            effector ? gather8(topology->level.data(), ix) : splat8(topology->level[i]);
        const F8 coactivity = clamp8(gather8(signal_.data(), ix), 0, 1) * std::max(0.f, own);
        use = (1 - level) * use + level * coactivity;
      }
      if (!effector)
        use = ordinary * use +
              (1 - ordinary) * clamp8(abs8(gather8(signal_.data(), ix)) * evidence, 0, 1);
      const F8 uret = 1 - 1 / (plasticity::unused_decay_span * time);
      const F8 u = clamp8(uret * load8(usage_.data() + k) + (1 - uret) * use, 0, 1);
      if (plasticity_enabled) {
        store8(trace_.data() + k, e);
        store8(usage_.data() + k, u);
      } else
        e = load8(trace_.data() + k);
      prediction += load8(predict_.data() + k) * xc;
      x2 += xc * xc;
      e2 += e * e;
    }
    const float surprise = plasticity_enabled && !effector ? dteach - sum8(prediction) : 0;
    cell_surprise_[i] = surprise;
    learning_summary_.surprise += std::abs(surprise);
    const float denominator = 1 + sum8(e2), pred_denominator = 1 + sum8(x2);
    for (std::size_t j = 0; j < storage; j += LANES) {
      const auto k = r.offset + j;
      const I8 ix = load_index8(index_.data() + k);
      const F8 ordinary = effector ? splat8(1) : 1 - gather8(topology->modulator.data(), ix);
      const F8 xc = ordinary * gather8(deviation_.data(), ix), old = load8(weight_.data() + k),
               e = load8(trace_.data() + k), u = load8(usage_.data() + k);
      F8 gain = splat8(target_gain), mode = splat8(cl.mode),
         comp = splat8(.5f * (1 + hormone_effect_[Competition][i])),
         consolidating = splat8(hormone_effect_[Consolidation][i]);
      F8 surprise_value = splat8(surprise);
      if (effector) {
        for (int l = 0; l < LANES; ++l) {
          const auto src = index_[k + l];
          if (src == n) {
            gain[l] = mode[l] = comp[l] = surprise_value[l] = consolidating[l] = 0;
            continue;
          }
          gain[l] = learning_rate(tissue->neurons[src], hormone_effect_[Learning][src]);
          mode[l] = topology->classes[src].mode;
          comp[l] = .5f * (1 + hormone_effect_[Competition][src]);
          surprise_value[l] = cell_surprise_[src];
          consolidating[l] = hormone_effect_[Consolidation][src];
        }
      }
      F8 positive = mode > splat8(0) ? mode : F8{}, negative = mode < splat8(0) ? -mode : F8{};
      F8 delta =
          ordinary * gain *
          (positive * comp * y * (xc - old * y) -
           plasticity::cancellation * negative * y * xc * gather8(topology->nerve.data(), ix) +
           surprise_value * e / denominator);
      // The competing share of the change: an active cell pushes out its silent inputs.
      F8 competition = -(ordinary * gain * positive * comp * y * y * old);
      const F8 limit = ordinary * c.electrical_limit + (1 - ordinary) * c.teaching_limit;
      const F8 sign = gather8(topology->sign.data(), ix);
      if (level_learning) {
        const F8 level =
            effector ? gather8(topology->level.data(), ix) : splat8(topology->level[i]);
        const F8 pre = clamp8(gather8(signal_.data(), ix), 0, 1);
        const float post = std::max(0.f, own);
        const F8 sustained =
            ordinary * gain * sign * post *
            (positive * comp * (pre - abs8(old) * evoked) -
             plasticity::cancellation * negative * pre * gather8(topology->nerve.data(), ix));
        const F8 teaching = ordinary * gain * surprise_value * e / denominator;
        delta = (1 - level) * delta + level * (sustained + teaching);
        competition = (1 - level) * competition -
                      level * ordinary * gain * sign * post * positive * comp * abs8(old) * evoked;
      }
      delta += (1 - ordinary) * sign * target_gain * u * (limit - abs8(old));
      // What the contact learned itself marks it for consolidation; competition and forgetting do
      // not. A consolidated contact keeps learning but resists being pushed out.
      const F8 consolidated = load8(consolidation_.data() + k), learned = delta - competition;
      delta -= consolidated * competition;
      F8 updated = old;
      if (plasticity_enabled) {
        updated = sign * clamp8(sign * (old + delta), 0, 1);
        updated = sign * (abs8(updated) > limit ? limit : abs8(updated));
        store8(predict_.data() + k, load8(predict_.data() + k) +
                                        ordinary * target_gain * surprise * xc / pred_denominator);
      }
      learning_summary_.change += sum8(abs8(updated - old));
      const F8 time =
          effector ? gather8(topology->learning.data(), ix) : splat8(topology->learning[i]);
      F8 lasting = consolidated;
      if (plasticity_enabled) {
        // Captured: the share of full strength the contact learned, while the cell consolidates.
        // Released: learning against the contact's strength, or a cell made pliable again.
        const F8 share = limit > F8{} ? abs8(learned) / limit : F8{},
                 against = limit > F8{} && sign * learned < F8{} ? -sign * learned / limit : F8{},
                 capture = consolidating > F8{} ? consolidating : F8{},
                 pliable = consolidating < F8{} ? -consolidating / time : F8{};
        lasting = clamp8(consolidated + capture * share * (1 - consolidated) -
                             (against + pliable) * consolidated,
                         0, 1);
        store8(consolidation_.data() + k, lasting);
      }
      const F8 decayed = plasticity_enabled ? updated * decay8(u, time, lasting) : old;
      learning_summary_.decay += sum8(abs8(updated - decayed));
      store8(weight_.data() + k, decayed);
    }
    for (std::size_t j = 0; plasticity_enabled && j < r.extent; ++j) {
      const auto k = r.offset + j;
      if (index_[k] == n)
        continue;
      auto &left = trial_steps_left_[k];
      if (left)
        --left;
      if (!left && std::abs(weight_[k]) < PRUNE &&
          consolidation_[k] < plasticity::kept_consolidation)
        erase_contact(k);
    }
    if (plasticity_enabled)
      ++learning_summary_.cells;
    learning_summary_.work += storage * 4 + HORMONE_EFFECTS * HORMONES;
    if (plasticity_enabled)
      form_synapse(i);
  };
  for (auto i : active_nerves_)
    evaluate(i, false);
  for (auto i : active_effectors_)
    evaluate(i, true);
  for (auto i : active_sensors_)
    next_[i] = 0;
  for (auto &s : stimuli_) {
    next_[s.neuron] = std::max(next_[s.neuron], pulse_[s.neuron]);
    if (--s.remaining == 0)
      pulse_[s.neuron] = 0;
  }
  stimuli_.erase(std::remove_if(stimuli_.begin(), stimuli_.end(),
                                [](const auto &s) { return s.remaining == 0; }),
                 stimuli_.end());
  state_.swap(next_);
  if (observe)
    refresh_observation();
}
void Network::set_plasticity(bool on) {
  if (!on && developing_ && !diagnostic_)
    throw std::logic_error("living development cannot disable learning");
  plasticity_enabled = on;
}
Network Network::frozen_probe() const {
  Network copy = *this;
  copy.diagnostic_ = true;
  copy.plasticity_enabled = false;
  return copy;
}
Network Network::ablated_probe() const {
  auto copy = frozen_probe();
  std::fill(copy.weight_.begin(), copy.weight_.end(), 0);
  std::fill(copy.organ_output_.begin(), copy.organ_output_.end(), 0);
  return copy;
}
void Network::reset() {
  clear_stimuli();
  for (auto *v : {&state_, &next_, &signal_, &organ_output_, &synaptic_mean_, &trace_, &usual_,
                  &deviation_, &own_mean_, &action_mean_, &teach_mean_, &contrast_, &cell_surprise_,
                  &retinal_activity_, &retinal_recovery_, &retinal_next_})
    std::fill(v->begin(), v->end(), 0);
  retinal_seeded_ = false;
  retinal_rng_ = 0;
}
void Network::reset_learning() {
  reset();
  for (auto *v : {&weight_, &predict_, &usage_, &consolidation_})
    std::fill(v->begin(), v->end(), 0);
  for (std::size_t k = 0; k < index_.size(); ++k)
    if (index_[k] != tissue->neurons.size()) {
      const auto i = tissue->neurons[owner_[k]].role == Role::Effector ? index_[k] : owner_[k];
      trial_steps_left_[k] = std::uint16_t(
          std::ceil(plasticity::contact_trial_time_constants * topology->learning[i]));
    }
}
void Network::mute(std::size_t i, bool value) {
  muted_.at(i) = value;
  if (value) {
    state_[i] = next_[i] = signal_[i] = pulse_[i] = organ_output_[i] = 0;
    stimuli_.erase(std::remove_if(stimuli_.begin(), stimuli_.end(),
                                  [&](const auto &s) { return s.neuron == i; }),
                   stimuli_.end());
  }
}
void Network::stimulate(std::size_t i, float value, unsigned steps) {
  if (i >= state_.size() || inactive(i) || !std::isfinite(value) || value < 0 || value > 1 ||
      !steps || steps > max_stimulus_steps)
    throw std::invalid_argument("only active cells can be stimulated");
  auto it = std::lower_bound(stimuli_.begin(), stimuli_.end(), i,
                             [](const auto &s, auto id) { return s.neuron < id; });
  if (value == 0) {
    if (it != stimuli_.end() && it->neuron == i)
      stimuli_.erase(it);
    pulse_[i] = 0;
    return;
  }
  if (it != stimuli_.end() && it->neuron == i)
    it->remaining = steps;
  else
    stimuli_.insert(it, {i, steps});
  pulse_[i] = value;
  state_[i] = next_[i] = signal_[i] = std::max(state_[i], value);
}
void Network::stimulate(const std::vector<std::size_t> &ids, float value, unsigned steps) {
  if (ids.empty())
    throw std::invalid_argument("empty organ stimulus");
  for (auto i : ids)
    if (i >= state_.size() || inactive(i))
      throw std::invalid_argument("only active cells can be stimulated");
  for (auto i : ids)
    stimulate(i, value, steps);
}
void Network::clear_stimuli() {
  for (const auto &s : stimuli_)
    pulse_[s.neuron] = 0;
  stimuli_.clear();
}
void Network::refresh_observation() {
  if (!observe)
    return;
  observed_contributions.assign(index_.size(), 0);
  for (std::size_t k = 0; k < index_.size(); ++k)
    if (index_[k] != tissue->neurons.size() && !inactive(index_[k]))
      observed_contributions[k] = weight_[k] * signal_[index_[k]];
}
std::vector<Network::Synapse> Network::synapses() const {
  std::vector<Synapse> out;
  out.reserve(wiring_.contacts);
  for (std::size_t k = 0; k < index_.size(); ++k)
    if (index_[k] != tissue->neurons.size())
      out.push_back({std::uint32_t(k), index_[k], owner_[k], weight_[k],
                     contact_limit(tissue->neurons[index_[k]], tissue->neurons[owner_[k]]),
                     consolidation_[k]});
  return out;
}
std::vector<Network::RetinalState> Network::retinal_state() const {
  std::vector<RetinalState> out;
  for (const auto &r : retina_)
    out.push_back({r.neuron, r.position, r.transverse, retinal_activity_[r.neuron],
                   retinal_recovery_[r.neuron]});
  return out;
}
std::size_t Network::learning_neurons() const {
  return active_nerves_.size();
}
std::size_t Network::reserved_slots() const {
  return topology->reserved;
}
std::size_t Network::learned_connections() const {
  return std::count_if(weight_.begin(), weight_.end(),
                       [](float w) { return std::abs(w) >= .001f; });
}
double Network::learned_change() const {
  double sum = 0;
  for (float w : weight_)
    sum += std::abs(w);
  return sum;
}
std::size_t Network::runtime_bytes() const {
  std::size_t floats = 0;
  for (const auto *v : {&state_,
                        &next_,
                        &signal_,
                        &pulse_,
                        &organ_output_,
                        &retinal_activity_,
                        &retinal_recovery_,
                        &retinal_next_,
                        &synaptic_mean_,
                        &usual_,
                        &deviation_,
                        &own_mean_,
                        &action_mean_,
                        &teach_mean_,
                        &contrast_,
                        &cell_surprise_,
                        &progress_,
                        &weight_,
                        &trace_,
                        &predict_,
                        &usage_,
                        &consolidation_,
                        &observed_contributions})
    floats += v->capacity();
  for (const auto &v : hormone_effect_)
    floats += v.capacity();
  return floats * sizeof(float) +
         (index_.capacity() + owner_.capacity() + trial_steps_left_.capacity()) *
             sizeof(std::uint16_t) +
         (age_.capacity() + proposal_queue_.capacity()) * sizeof(std::uint32_t) +
         rows_.capacity() * sizeof(Row) + born_.capacity() + dead_.capacity() + muted_.capacity() +
         retina_.capacity() * sizeof(RetinalCell) +
         (active_.capacity() + active_sensors_.capacity() + active_nerves_.capacity() +
          active_effectors_.capacity()) *
             sizeof(NeuronIndex) +
         stimuli_.capacity() * sizeof(Stimulus);
}
std::uint64_t Network::work_bound() const {
  return active_.size() * (1 + HORMONE_EFFECTS * HORMONES) + 8 * index_.size();
}
Network::ActorPreview Network::actor_preview(const std::vector<float> &values,
                                             const Hormones &h) const {
  Network copy = *this;
  copy.diagnostic_ = true;
  copy.plasticity_enabled = true;
  const auto before = copy.weight_;
  copy.step(values, h, learning_seed);
  ActorPreview out;
  out.increments = copy.weight_;
  for (std::size_t k = 0; k < before.size(); ++k)
    out.increments[k] -= before[k];
  out.work = copy.learning_summary_.work;
  out.ready = true;
  return out;
}
namespace {
// IEEE-754 binary32 in little-endian order; no decimal conversion or precision loss.
constexpr std::size_t WORD = sizeof(std::uint32_t), state_block = 128, BUFFER_BYTES = 16384;
static_assert(sizeof(float) == WORD && std::numeric_limits<float>::is_iec559, "binary32 required");
void write_values(std::ostream &out, const std::vector<float> &v) {
  unsigned char buffer[BUFFER_BYTES];
  std::size_t used = 0;
  for (std::size_t start = 0; start < v.size();) {
    const auto n = std::min(state_block, v.size() - start);
    std::array<std::uint32_t, state_block> words;
    std::memcpy(words.data(), v.data() + start, WORD * n);
    const bool repeated = std::all_of(words.begin() + 1, words.begin() + n,
                                      [&](auto word) { return word == words[0]; });
    const auto count = repeated ? 1 : n;
    if (used + 1 + WORD * count > sizeof(buffer)) {
      out.write(reinterpret_cast<const char *>(buffer), std::streamsize(used));
      used = 0;
    }
    buffer[used++] = repeated ? 1 : 0;
    for (std::size_t j = 0; j < count; ++j)
      for (unsigned k = 0; k < WORD; ++k)
        buffer[used++] = static_cast<unsigned char>(words[j] >> (CHAR_BIT * k));
    start += n;
  }
  out.write(reinterpret_cast<const char *>(buffer), std::streamsize(used));
  out.put('\n');
}
void read_values(std::istream &in, std::vector<float> &v, float limit) {
  unsigned char buffer[state_block * WORD];
  for (std::size_t start = 0; start < v.size();) {
    const auto n = std::min(state_block, v.size() - start);
    const int marker = in.get();
    if (marker != 0 && marker != 1)
      throw std::runtime_error("invalid brain block encoding");
    const auto count = marker ? 1 : n;
    if (!in.read(reinterpret_cast<char *>(buffer), std::streamsize(count * WORD)))
      throw std::runtime_error("truncated brain state");
    for (std::size_t j = 0; j < count; ++j) {
      std::uint32_t bits = 0;
      for (unsigned k = 0; k < WORD; ++k)
        bits |= std::uint32_t(buffer[WORD * j + k]) << (CHAR_BIT * k);
      float x;
      std::memcpy(&x, &bits, WORD);
      if (!std::isfinite(x) || std::abs(x) > limit)
        throw std::runtime_error("invalid brain value");
      if (marker)
        std::fill(v.begin() + start, v.begin() + start + n, x);
      else
        v[start + j] = x;
    }
    start += n;
  }
  if (in.get() != '\n')
    throw std::runtime_error("invalid brain block separator");
}
std::vector<float> as_floats(const std::vector<unsigned char> &v) {
  return std::vector<float>(v.begin(), v.end());
}
}
void Network::write_runtime(std::ostream &out) const {
  const auto precision = out.precision(std::numeric_limits<double>::max_digits10);
  out << "BRAINDEV_WORK " << state_.size() << ' ' << index_.size() << ' ' << learning_seed << ' '
      << neural_ticks_ << ' ' << retinal_rng_ << ' ' << turnover_rng_ << ' ' << revision_ << ' '
      << tissue_revision_ << ' ' << development_ticks_ << ' ' << retinal_seeded_ << ' '
      << developing_ << ' ' << diagnostic_ << ' ' << plasticity_enabled << ' ' << maturity_ << ' '
      << reserve_ << ' ' << fatigue_ << ' ' << growth_credit_ << ' '
      << (std::isfinite(build_budget_) ? build_budget_ : -1) << ' ' << build_scale_ << ' '
      << wiring_.length << ' ' << formed_.contacts << ' ' << formed_.length;
  for (double v : active_hormones_)
    out << ' ' << v;
  out << '\n';
  out.precision(precision);
  for (std::size_t i = 0; i < rows_.size(); ++i) {
    if (i)
      out << ' ';
    const auto &r = rows_[i];
    out << r.offset << ' ' << r.capacity;
  }
  out << '\n';
  for (const auto *v : {&state_,
                        &signal_,
                        &pulse_,
                        &organ_output_,
                        &retinal_activity_,
                        &retinal_recovery_,
                        &synaptic_mean_,
                        &usual_,
                        &deviation_,
                        &own_mean_,
                        &action_mean_,
                        &teach_mean_,
                        &contrast_,
                        &cell_surprise_,
                        &progress_,
                        &weight_,
                        &trace_,
                        &predict_,
                        &usage_,
                        &consolidation_})
    write_values(out, *v);
  for (const auto *v : {&index_, &owner_, &trial_steps_left_})
    write_values(out, std::vector<float>(v->begin(), v->end()));
  for (const auto *v : {&muted_, &dead_, &born_})
    write_values(out, as_floats(*v));
  for (auto age : age_)
    out << age << ' ';
  out << '\n';
  out << active_.size();
  for (auto i : active_)
    out << ' ' << i;
  out << '\n';
  out << free_rows_.size();
  for (const auto &r : free_rows_) {
    out << ' ' << r.first << ' ' << r.second.size();
    for (auto x : r.second)
      out << ' ' << x;
  }
  out << '\n' << proposal_queue_.size() - proposal_cursor_;
  for (auto k = proposal_cursor_; k < proposal_queue_.size(); ++k)
    out << ' ' << proposal_queue_[k];
  out << '\n' << "STIMULI " << stimuli_.size();
  for (const auto &s : stimuli_)
    out << ' ' << s.neuron << ' ' << s.remaining;
  out << '\n';
}
void Network::read_runtime(std::istream &in) {
  Network candidate = *this;
  candidate.read_runtime_state(in);
  *this = std::move(candidate);
}
void Network::read_runtime_state(std::istream &in) {
  std::string tag;
  std::size_t cells = 0, slots = 0;
  if (!(in >> tag >> cells >> slots >> learning_seed >> neural_ticks_ >> retinal_rng_ >>
        turnover_rng_ >> revision_ >> tissue_revision_ >> development_ticks_ >> retinal_seeded_ >>
        developing_ >> diagnostic_ >> plasticity_enabled >> maturity_ >> reserve_ >> fatigue_ >>
        growth_credit_ >> build_budget_ >> build_scale_ >> wiring_.length >> formed_.contacts >>
        formed_.length) ||
      tag != "BRAINDEV_WORK" || cells != state_.size() || slots > reserved_slots() ||
      slots % LANES || !std::isfinite(maturity_) || maturity_ < 0 || maturity_ > 1 ||
      !std::isfinite(reserve_) || reserve_ < 0 || reserve_ > 1 || !std::isfinite(fatigue_) ||
      fatigue_ < 0 || fatigue_ > 1 || !std::isfinite(growth_credit_) || growth_credit_ < 0 ||
      growth_credit_ > development_credit_limit(scaled_costs(tissue->options)) ||
      !std::isfinite(build_budget_) || build_budget_ < -1 || !std::isfinite(build_scale_) ||
      build_scale_ < 0 || !std::isfinite(wiring_.length) || wiring_.length < 0 ||
      !std::isfinite(formed_.length) || formed_.length < 0 || formed_.contacts > slots ||
      (developing_ && !diagnostic_ && !plasticity_enabled))
    throw std::runtime_error("invalid brain state");
  if (build_budget_ == -1)
    build_budget_ = std::numeric_limits<double>::infinity();
  for (auto &h : active_hormones_)
    if (!(in >> h) || !std::isfinite(h) || h < 0 || h > 1)
      throw std::runtime_error("invalid hormone state");
  for (auto &r : rows_) {
    unsigned capacity;
    if (!(in >> r.offset >> capacity) || capacity > MAX_INPUT_SLOTS || r.offset % LANES ||
        r.offset + contact_storage(capacity) > slots)
      throw std::runtime_error("invalid neuron row");
    r.capacity = std::uint16_t(capacity);
    r.count = r.extent = 0;
  }
  if (in.get() != '\n')
    throw std::runtime_error("invalid brain separator");
  for (auto *v : {&weight_, &trace_, &predict_, &usage_, &consolidation_})
    v->resize(slots);
  for (auto *v : {&index_, &owner_, &trial_steps_left_})
    v->resize(slots);
  for (auto *v : {&state_,
                  &signal_,
                  &pulse_,
                  &organ_output_,
                  &retinal_activity_,
                  &retinal_recovery_,
                  &synaptic_mean_,
                  &usual_,
                  &deviation_,
                  &own_mean_,
                  &action_mean_,
                  &teach_mean_,
                  &contrast_,
                  &cell_surprise_,
                  &progress_,
                  &weight_,
                  &trace_,
                  &predict_,
                  &usage_,
                  &consolidation_})
    read_values(in, *v, 1e9f);
  std::vector<float> integers(slots);
  for (auto *v : {&index_, &owner_, &trial_steps_left_}) {
    read_values(in, integers, 65535);
    for (std::size_t k = 0; k < slots; ++k) {
      if (integers[k] < 0 || integers[k] != std::floor(integers[k]))
        throw std::runtime_error("invalid contact index");
      (*v)[k] = std::uint16_t(integers[k]);
    }
  }
  integers.resize(cells);
  for (auto *v : {&muted_, &dead_, &born_}) {
    read_values(in, integers, 1);
    for (std::size_t i = 0; i < cells; ++i) {
      if (integers[i] != 0 && integers[i] != 1)
        throw std::runtime_error("invalid cell lifecycle");
      (*v)[i] = integers[i] != 0;
    }
  }
  for (auto &age : age_)
    if (!(in >> age))
      throw std::runtime_error("invalid cell age");
  active_.clear();
  active_nerves_.clear();
  active_effectors_.clear();
  active_sensors_.clear();
  std::size_t count;
  if (!(in >> count) || count > cells)
    throw std::runtime_error("invalid active cells");
  std::vector<bool> seen(cells), occupied(slots);
  for (std::size_t k = 0; k < count; ++k) {
    std::size_t i;
    if (!(in >> i) || i >= cells || seen[i] || !born_[i] || dead_[i])
      throw std::runtime_error("invalid active cell");
    seen[i] = true;
    active_.push_back(NeuronIndex(i));
    const auto role = tissue->neurons[i].role;
    (role == Role::Nerve      ? active_nerves_
     : role == Role::Effector ? active_effectors_
                              : active_sensors_)
        .push_back(NeuronIndex(i));
    const auto &r = rows_[i];
    if (r.capacity != contact_capacity(tissue->neurons[i]))
      throw std::runtime_error("invalid row capacity");
    for (std::size_t j = 0; j < contact_storage(r.capacity); ++j) {
      auto pos = r.offset + j;
      if (occupied[pos] || owner_[pos] != i || (j >= r.capacity && index_[pos] != cells))
        throw std::runtime_error("overlapping neuron rows");
      occupied[pos] = true;
    }
  }
  free_rows_.clear();
  if (!(in >> count) || count > contact_storage(MAX_INPUT_SLOTS) / CONTACT_LANES)
    throw std::runtime_error("invalid free rows");
  for (std::size_t k = 0; k < count; ++k) {
    std::size_t size, n;
    if (!(in >> size >> n) || !size || size > contact_storage(MAX_INPUT_SLOTS) || size % LANES ||
        n > cells || free_rows_.count(size))
      throw std::runtime_error("invalid free row");
    auto &free = free_rows_[size];
    for (std::size_t j = 0; j < n; ++j) {
      std::uint32_t offset;
      if (!(in >> offset) || offset % LANES || offset + size > slots)
        throw std::runtime_error("invalid free row offset");
      for (auto p = offset; p < offset + size; ++p) {
        if (occupied[p] || index_[p] != cells)
          throw std::runtime_error("occupied free row");
        occupied[p] = true;
      }
      free.push_back(offset);
    }
  }
  if (std::find(occupied.begin(), occupied.end(), false) != occupied.end())
    throw std::runtime_error("unowned connection storage");
  proposal_cursor_ = 0;
  proposal_queue_.clear();
  if (!(in >> count) || count > tissue->edges.size())
    throw std::runtime_error("invalid contact proposals");
  for (std::size_t k = 0; k < count; ++k) {
    std::uint32_t e;
    if (!(in >> e) || e >= tissue->edges.size())
      throw std::runtime_error("invalid contact proposal");
    proposal_queue_.push_back(e);
  }
  wiring_.contacts = 0;
  for (std::size_t i = 0; i < cells; ++i) {
    if (seen[i] != bool(born_[i] && !dead_[i]) || ((!born_[i] || dead_[i]) && rows_[i].capacity) ||
        progress_[i] < 0 || progress_[i] > 1 || retinal_activity_[i] < 0 ||
        retinal_activity_[i] > 1 || retinal_recovery_[i] < 0 || retinal_recovery_[i] > 1)
      throw std::runtime_error("invalid cell state");
    std::vector<NeuronIndex> sources;
    auto &r = rows_[i];
    for (std::size_t j = 0; j < r.capacity; ++j) {
      const auto k = r.offset + j;
      const auto s = index_[k];
      if (s == cells)
        continue;
      if (s >= cells || !born_[s] || connection_kind(tissue->neurons[s], tissue->neurons[i]) < 0 ||
          usage_[k] < 0 || usage_[k] > 1 || consolidation_[k] < 0 || consolidation_[k] > 1 ||
          trial_steps_left_[k] >
              std::ceil(plasticity::contact_trial_time_constants *
                        topology->learning[tissue->neurons[i].role == Role::Effector ? s : i]) ||
          std::abs(weight_[k]) >
              std::abs(contact_limit(tissue->neurons[s], tissue->neurons[i])) + 1e-6 ||
          topology->sign[s] * weight_[k] < 0 ||
          std::find(sources.begin(), sources.end(), s) != sources.end())
        throw std::runtime_error("invalid runtime contact");
      sources.push_back(s);
      ++r.count;
      r.extent = std::uint16_t(j + 1);
      ++wiring_.contacts;
    }
  }
  dead_count_ = std::count(dead_.begin(), dead_.end(), 1);
  organ_revision_ = 0;
  for (std::size_t i = 0; i < cells; ++i)
    if (tissue->neurons[i].role != Role::Nerve)
      organ_revision_ += born_[i] + dead_[i];
  if (!(in >> tag >> count) || tag != "STIMULI" || count > cells)
    throw std::runtime_error("invalid stimuli");
  stimuli_.clear();
  std::vector<bool> stimulated(cells);
  for (std::size_t k = 0; k < count; ++k) {
    Stimulus s;
    if (!(in >> s.neuron >> s.remaining) || s.neuron >= cells || !s.remaining ||
        s.remaining > max_stimulus_steps || inactive(s.neuron) || stimulated[s.neuron] ||
        (!stimuli_.empty() && s.neuron <= stimuli_.back().neuron) || pulse_[s.neuron] <= 0 ||
        pulse_[s.neuron] > 1)
      throw std::runtime_error("invalid stimulus");
    stimulated[s.neuron] = true;
    stimuli_.push_back(s);
  }
  if (in.get() != '\n')
    throw std::runtime_error("invalid stimulus separator");
  for (std::size_t i = 0; i < cells; ++i)
    if (!stimulated[i] && pulse_[i] != 0)
      throw std::runtime_error("untracked stimulus");
  next_.assign(cells, 0);
  retinal_next_.assign(cells, 0);
  observed_contributions.clear();
  learning_summary_ = {};
  refresh_active();
  for (auto i : active_)
    for (int e = 0; e < HORMONE_EFFECTS; ++e)
      hormone_effect_[e][i] = tissue->neurons[i].hormone_receptors[e].response(
          active_hormones_, maturity_, reserve_, fatigue_);
}
}
