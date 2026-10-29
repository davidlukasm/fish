#include <cstdio>
#include <unordered_map>
#include <string>
#include <cstdlib>
#include "substrate.hh"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <queue>
#include <numeric>
#include <mutex>
#include <istream>
#include <ostream>
#include <cstring>
#include <limits>
#if defined(__AVX2__)
#include <immintrin.h>
#endif
namespace field {
namespace {
// Eight fixed lanes (GNU vector extension). The lanes and the order of the final sums are part of
// the code, so the result is the same with SSE, AVX2 or AVX-512.
typedef float F8 __attribute__((vector_size(32)));
typedef std::int32_t I8 __attribute__((vector_size(32)));
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
inline F8 abs8(F8 v) {
  return (F8)((I8)v & 0x7fffffff);
}
inline F8 clamp8(F8 v, float lo, float hi) {
  v = v < splat8(lo) ? splat8(lo) : v;
  return v > splat8(hi) ? splat8(hi) : v;
}
inline float sum8(const F8 &v) {
  return ((v[0] + v[1]) + (v[2] + v[3])) + ((v[4] + v[5]) + (v[6] + v[7]));
}
// Indices of 8 slots as a vector (16 or 32 bit storage).
template <class Index> inline I8 load_index8(const Index *p) {
  I8 v;
  for (int l = 0; l < 8; ++l)
    v[l] = std::int32_t(p[l]);
  return v;
}
// 8 scattered loads: hardware gather only on AVX-512 machines (on AMD Zen 2/3 the AVX2 gather is
// microcoded and slower than single loads).
inline F8 gather8(const float *base, const I8 &index) {
#if defined(__AVX512F__)
  __m256i i;
  std::memcpy(&i, &index, sizeof i);
  const __m256 r = _mm256_i32gather_ps(base, i, 4);
  F8 v;
  std::memcpy(&v, &r, sizeof v);
  return v;
#else
  F8 v;
  for (int l = 0; l < 8; ++l)
    v[l] = base[index[l]];
  return v;
#endif
}
// tanh8: a rational function (odd 13th / even 6th degree, the approximation Eigen uses),
// |error| < 4e-7, about 14 times faster than std::tanh.
inline F8 tanh8(F8 a) {
  const F8 x = clamp8(a, -7.99881172180175781f, 7.99881172180175781f), x2 = x * x;
  F8 p = x2 * -2.76076847742355e-16f + 2.00018790482477e-13f;
  p = x2 * p + -8.60467152213735e-11f;
  p = x2 * p + 5.12229709037114e-08f;
  p = x2 * p + 1.48572235717979e-05f;
  p = x2 * p + 6.37261928875436e-04f;
  p = x2 * p + 4.89352455891786e-03f;
  F8 q = x2 * 1.19825839466702e-06f + 1.18534705686654e-04f;
  q = x2 * q + 2.26843463243900e-03f;
  q = x2 * q + 4.89352518554385e-03f;
  return x * p / q;
}
constexpr double PI_F = 3.14159265358979323846;
// learning rates of ordering (competition) and cancelling; rebuilding: a synapse below PRUNE x the
// mean strength at birth of its cell vanishes, a new synapse starts at NEW_SYNAPSE x that mean
// strength; BASAL: share of the formation trials that form without the test of the learning rules
// (basal synapse formation, also for cells whose activity does not vary)
constexpr float COMPETITION = 1, CANCELLATION = .02f, PRUNE = .05f, NEW_SYNAPSE = .1f,
                BASAL = 1.f / 50;
}
const char *role_name(Role r) {
  return r == Role::Sensor ? "sensor" : r == Role::Effector ? "effector" : "nerve";
}
void Options::validate() const {
  if (depth < 1 || depth > 4 || !std::isfinite(scale) || scale <= 0 || scale > 16 ||
      !std::isfinite(bias_scale) || bias_scale < 0 || bias_scale > 2 ||
      !std::isfinite(role_transition) || role_transition < 0 || role_transition > 1 ||
      neuron_budget < 1 || neuron_budget > 65536 || max_nodes < 1 || max_nodes > 65535 ||
      max_edges < 1 || max_edges > 67108864 || workers < 1 || workers > 64)
    throw std::invalid_argument("invalid brain options");
}
Substrate::Substrate(cppn::CPPN &p, Options o) : combined(&p), options(o) {
  options.validate();
  if (p.outputs() != ANATOMICAL_OUTPUTS)
    throw std::invalid_argument("current fish CPPN required");
}
void Substrate::limit_development(const char *reason) {
  resource_limited = true;
  if (diagnostic.empty())
    diagnostic = reason;
}
void Substrate::prune_inert_neurons() {
  const auto previous_edges = edges.size();
  edges.erase(
      std::remove_if(edges.begin(), edges.end(),
                     [&](const Edge &e) { return neurons[e.target].functions.pure_sensor(); }),
      edges.end());
  if (edges.size() != previous_edges)
    network_layout.reset();
  // Keep effectors with input from other cells and their ancestors.
  std::vector<std::uint32_t> offset(neurons.size() + 1), sources(edges.size());
  for (const auto &e : edges)
    ++offset[e.target + 1];
  std::partial_sum(offset.begin(), offset.end(), offset.begin());
  auto cursor = offset;
  for (const auto &e : edges)
    sources[cursor[e.target]++] = e.source;
  std::vector<unsigned char> keep(neurons.size()), connected(neurons.size());
  std::vector<std::uint32_t> todo;
  for (const auto &e : edges)
    if (e.source != e.target)
      connected[e.target] = 1;
  for (std::size_t i = 0; i < neurons.size(); ++i)
    if (neurons[i].functions.motor() > 0 && connected[i]) {
      keep[i] = 1;
      todo.push_back(i);
    }
  for (std::size_t j = 0; j < todo.size(); ++j)
    for (auto k = offset[todo[j]]; k < offset[todo[j] + 1]; ++k) {
      auto i = sources[k];
      if (!keep[i]) {
        keep[i] = 1;
        todo.push_back(i);
      }
    }
  if (todo.size() == neurons.size())
    return;
  network_layout.reset();
  std::vector<NeuronIndex> remap(neurons.size());
  std::size_t size = 0;
  for (std::size_t i = 0; i < neurons.size(); ++i)
    if (keep[i]) {
      remap[i] = NeuronIndex(size);
      neurons[size++] = neurons[i];
    }
  neurons.resize(size);
  size = 0;
  for (auto e : edges)
    if (keep[e.source] && keep[e.target]) {
      e.source = remap[e.source];
      e.target = remap[e.target];
      edges[size++] = e;
    }
  edges.resize(size);
}
void Substrate::finish_development() {
  built_neurons = neurons.size();
  prune_inert_neurons();
  // Order by source, then target: a counting pass by source, then each (short) row by target.
  {
    std::vector<std::uint32_t> start(neurons.size() + 1, 0);
    bool bounded = true;
    for (const auto &e : edges) {
      if (e.source >= neurons.size()) {
        bounded = false;
        break;
      }
      ++start[e.source + 1];
    }
    if (bounded) {
      std::partial_sum(start.begin(), start.end(), start.begin());
      std::vector<Edge> sorted(edges.size());
      auto at = start;
      for (const auto &e : edges)
        sorted[at[e.source]++] = e;
      for (std::size_t i = 0; i < neurons.size(); ++i) {
        auto first = sorted.begin() + start[i], last = sorted.begin() + start[i + 1];
        if (!std::is_sorted(first, last,
                            [](const Edge &a, const Edge &b) { return a.target < b.target; }))
          std::sort(first, last, [](const Edge &a, const Edge &b) { return a.target < b.target; });
      }
      edges = std::move(sorted);
    } else
      std::sort(edges.begin(), edges.end(), [](const Edge &a, const Edge &b) {
        return a.source != b.source ? a.source < b.source : a.target < b.target;
      });
  }
  struct Adjacency {
    struct Row {
      std::vector<std::uint32_t>::const_iterator first, last;
      auto begin() const { return first; }
      auto end() const { return last; }
      std::size_t size() const { return last - first; }
      std::uint32_t operator[](std::size_t i) const { return first[i]; }
    };
    std::vector<std::uint32_t> offset, to;
    Adjacency(std::size_t n, const std::vector<Edge> &edges, bool reverse)
        : offset(n + 1), to(edges.size()) {
      for (const auto &e : edges)
        ++offset[(reverse ? e.target : e.source) + 1];
      std::partial_sum(offset.begin(), offset.end(), offset.begin());
      auto at = offset;
      for (const auto &e : edges)
        to[at[reverse ? e.target : e.source]++] = reverse ? e.source : e.target;
    }
    Row operator[](std::size_t i) const {
      return {to.begin() + offset[i], to.begin() + offset[i + 1]};
    }
  };
  Adjacency out(neurons.size(), edges, false), in(neurons.size(), edges, true);
  auto reach = [&](Role role, const auto &adjacency) {
    std::vector<bool> seen(neurons.size(), false);
    std::queue<std::size_t> q;
    for (std::size_t i = 0; i < neurons.size(); ++i)
      if (role == Role::Sensor ? neurons[i].functions.sensory() > 0
                               : neurons[i].functions.motor() > 0) {
        seen[i] = true;
        q.push(i);
      }
    while (!q.empty()) {
      auto i = q.front();
      q.pop();
      for (auto j : adjacency[i])
        if (!seen[j]) {
          seen[j] = true;
          q.push(j);
        }
    }
    return seen;
  };
  auto forward = reach(Role::Sensor, out), backward = reach(Role::Effector, in);
  for (std::size_t i = 0; i < neurons.size(); ++i)
    neurons[i].functional = !resource_limited && backward[i];
  // Iterative strongly connected components, including self-loops.
  std::vector<unsigned char> visited(neurons.size(), 0);
  std::vector<std::uint32_t> finished;
  for (std::uint32_t root = 0; root < neurons.size(); ++root)
    if (!visited[root]) {
      std::vector<std::pair<std::uint32_t, std::size_t>> stack{{root, 0}};
      visited[root] = 1;
      while (!stack.empty()) {
        auto &current = stack.back();
        auto node = current.first;
        if (current.second < out[node].size()) {
          auto target = out[node][current.second++];
          if (!visited[target]) {
            visited[target] = 1;
            stack.push_back({target, 0});
          }
        } else {
          finished.push_back(node);
          stack.pop_back();
        }
      }
    }
  std::vector<std::uint32_t> component(neurons.size(), UINT32_MAX);
  std::uint32_t group = 0;
  for (auto i = finished.rbegin(); i != finished.rend(); ++i)
    if (component[*i] == UINT32_MAX) {
      std::vector<std::uint32_t> stack{*i};
      component[*i] = group;
      while (!stack.empty()) {
        auto node = stack.back();
        stack.pop_back();
        for (auto target : in[node])
          if (component[target] == UINT32_MAX) {
            component[target] = group;
            stack.push_back(target);
          }
      }
      ++group;
    }
  recurrent_edges = 0;
  for (const auto &e : edges)
    recurrent_edges += component[e.source] == component[e.target];
  prepare_network();
}

// Layout of a developed brain for the kernel. Learning cells (functional nerve cells) are sorted
// by their input places and grouped in slices of 8 (one cell per lane); slot j of a slice holds
// input j of each of its 8 cells. Per cell the driving inputs (sensory and nerve sources) come
// first, up to its input places (free places read the zero signal with zero strength); pacemaker
// and modulatory inputs follow in a second section (pacemakers drive and are the cell's play,
// modulatory cells only teach; both are kept as born). Effectors have one section of driving
// inputs. The other cells (not functional) keep their synapses as born.
struct NetworkTopology {
  struct Slice {
    std::uint32_t offset = 0, length = 0, extra_offset = 0, extra_length = 0;
    int lanes = 0;
    bool rhythm = false;
    std::array<NeuronIndex, 8> cell{};
    F8 bias{}, gain{}, pace{}, comp{}, canc{}, innate{}, fast{}, unit{};
    I8 valid{}, work{}, both{}, modulator{}, nerve{};
    std::array<std::uint16_t, 8> capacity{}, born{};
    std::array<double, 8> phase{}, period{{1, 1, 1, 1, 1, 1, 1, 1}};
  };
  std::vector<NeuronIndex> sensors;
  std::vector<Slice> slices, effector_slices, other_slices;
  // slots as born
  std::vector<float> gene;
  std::vector<std::uint16_t> index;
  // per cell: learning gain of its synapses onto effectors (0 for pacemakers, modulators and cells
  // that do not learn), its trace constant, transmitter sign, 1 if it is a nerve cell (cancelling
  // acts only on synapses from nerve cells; with the zero signal at the end), whether it can be a
  // driving source, and its learning lane (-1: none)
  std::vector<float> cell_gain, cell_fast, cell_sign, nerve_source;
  std::vector<unsigned char> cell_driving;
  std::vector<std::int32_t> cell_lane;
  // cells of every group (for the formation of synapses)
  std::vector<std::uint32_t> group_offset, group_cells;
  std::uint32_t max_length = 0;
  std::size_t learning_cells = 0;
  // egg patterns: kind per sensory input (0 sight, 1 smell, 2 lateral line and touch, 3 other),
  // side, scent channel, viewing direction; trunk and fin muscles per side (twitch feedback)
  std::vector<unsigned char> egg_kind, egg_side, egg_channel;
  std::vector<float> egg_angle;
  std::array<std::vector<NeuronIndex>, 2> egg_motors;
  explicit NetworkTopology(const Substrate &s) {
    const std::size_t n = s.neurons.size();
    if (n > 65535)
      throw std::length_error("neuron budget exceeded");
    const auto zero = std::uint16_t(n);
    std::vector<std::uint32_t> offset(n + 1), order(s.edges.size());
    for (const auto &e : s.edges) {
      if (e.source >= n || e.target >= n)
        throw std::invalid_argument("invalid synapse");
      ++offset[e.target + 1];
    }
    std::partial_sum(offset.begin(), offset.end(), offset.begin());
    {
      auto cursor = offset;
      for (std::size_t i = 0; i < s.edges.size(); ++i)
        order[cursor[s.edges[i].target]++] = std::uint32_t(i);
    }
    std::vector<CellClass> classes(n);
    std::vector<unsigned char> group(n);
    for (std::size_t i = 0; i < n; ++i) {
      classes[i] = cell_class(s.neurons[i]);
      const bool pacer = classes[i].pace > .5f, mod = classes[i].modulator > .5f;
      group[i] = s.neurons[i].role != Role::Nerve ? 0 : pacer ? (mod ? 3 : 2) : mod ? 4 : 1;
    }
    for (std::size_t t = 0; t < n; ++t)
      std::stable_sort(
          order.begin() + offset[t], order.begin() + offset[t + 1],
          [&](auto a, auto b) { return group[s.edges[a].source] < group[s.edges[b].source]; });
    cell_gain.assign(n, 0.f);
    cell_fast.assign(n, 1.f);
    cell_sign.assign(n, 0.f);
    nerve_source.assign(n + 1, 0.f);
    cell_driving.assign(n, 0);
    cell_lane.assign(n, -1);
    std::vector<std::uint32_t> learners, effectors, others;
    for (std::size_t i = 0; i < n; ++i) {
      const auto &cell = s.neurons[i];
      cell_sign[i] = cell.role == Role::Sensor  ? 1.f
                     : cell.role == Role::Nerve ? classes[i].sign
                                                : 0.f;
      cell_driving[i] = cell.role == Role::Sensor || (cell.role == Role::Nerve && group[i] == 1);
      nerve_source[i] = cell.role == Role::Nerve ? 1.f : 0.f;
      if (cell.functions.sensory() > 0) {
        sensors.push_back(NeuronIndex(i));
        const auto &f = cell.functions.senses;
        const int dominant = int(std::max_element(f.begin(), f.end()) - f.begin());
        egg_kind.push_back(dominant == 0                      ? 0
                           : dominant == 1                    ? 1
                           : (dominant == 2 || dominant == 3) ? 2
                                                              : 3);
        egg_side.push_back(cell.x < 0 ? 0 : 1);
        // the receptor's viewing direction as the body plan computes it, normalised to -1..1
        egg_angle.push_back(std::clamp(cell.x * (.65f + .35f * (1 - cell.y) * .5f), -1.f, 1.f));
        // scent channel: the preference direction (quality1) in eight sectors
        egg_channel.push_back((unsigned char)std::clamp(
            int((std::clamp(cell.parameters.quality1, -1.f, 1.f) + 1) * 4), 0, 7));
        continue;
      }
      if (cell.role == Role::Effector && cell.functional &&
          (cell.functions.motors[Forward] > 0 || cell.functions.motors[Turn] > 0))
        egg_motors[cell.x < 0 ? 0 : 1].push_back(NeuronIndex(i));
      (cell.role == Role::Nerve && cell.functional      ? learners
       : cell.role == Role::Effector && cell.functional ? effectors
                                                        : others)
          .push_back(std::uint32_t(i));
    }
    std::uint32_t groups = 0;
    for (const auto &c : s.neurons)
      groups = std::max(groups, c.group + 1);
    group_offset.assign(groups + 1, 0);
    for (const auto &c : s.neurons)
      ++group_offset[c.group + 1];
    std::partial_sum(group_offset.begin(), group_offset.end(), group_offset.begin());
    group_cells.resize(n);
    {
      auto cursor = group_offset;
      for (std::size_t i = 0; i < n; ++i)
        group_cells[cursor[s.neurons[i].group]++] = std::uint32_t(i);
    }
    auto first = [&](std::uint32_t cell, int g) {
      auto k = offset[cell];
      while (k < offset[cell + 1] && group[s.edges[order[k]].source] < g)
        ++k;
      return k;
    };
    auto add_slot = [&](std::uint32_t k, bool valid) {
      if (valid) {
        gene.push_back(s.edges[order[k]].weight);
        index.push_back(s.edges[order[k]].source);
      } else {
        gene.push_back(0.f);
        index.push_back(zero);
      }
    };
    // input places for driving inputs: the cell's places less its pacemaker and modulatory inputs,
    // at least its driving inputs at birth
    auto places = [&](std::uint32_t c, std::uint32_t born, std::uint32_t extra) {
      const std::uint32_t total = s.neurons[c].slots;
      return std::uint16_t(
          std::min<std::uint32_t>(65535, std::max(born, total > extra ? total - extra : 0)));
    };
    auto driving = [&](std::uint32_t c) { return first(c, 2) - offset[c]; };
    auto capacity_of = [&](std::uint32_t c) {
      return places(c, driving(c), offset[c + 1] - first(c, 2));
    };
    std::stable_sort(learners.begin(), learners.end(),
                     [&](auto x, auto y) { return capacity_of(x) > capacity_of(y); });
    for (std::size_t start = 0; start < learners.size(); start += 8) {
      Slice sl;
      sl.lanes = int(std::min<std::size_t>(8, learners.size() - start));
      std::array<std::uint32_t, 8> cell{}, pacer{}, end{};
      for (int l = 0; l < sl.lanes; ++l) {
        const auto c = learners[start + std::size_t(l)];
        const auto &nc = s.neurons[c];
        const auto &k = classes[c];
        cell[l] = c;
        pacer[l] = first(c, 2);
        end[l] = offset[c + 1];
        sl.cell[l] = NeuronIndex(c);
        sl.valid[l] = -1;
        sl.nerve[l] = -1;
        sl.born[l] = std::uint16_t(pacer[l] - offset[c]);
        sl.capacity[l] = capacity_of(c);
        sl.work[l] = std::int32_t(2 * (sl.capacity[l] + end[l] - pacer[l]));
        sl.length = std::max<std::uint32_t>(sl.length, sl.capacity[l]);
        sl.extra_length = std::max(sl.extra_length, end[l] - pacer[l]);
        sl.both[l] = std::int32_t(first(c, 3) - pacer[l]);
        sl.modulator[l] = std::int32_t(first(c, 4) - pacer[l]);
        sl.bias[l] = nc.bias;
        const float gain = std::clamp(nc.parameters.plasticity, 0.f, 1.f);
        sl.gain[l] = gain;
        learning_cells += gain > 0;
        sl.pace[l] = k.pace;
        sl.rhythm = sl.rhythm || k.pace > 0;
        sl.comp[l] = COMPETITION * gain * std::max(0.f, k.mode);
        sl.canc[l] = CANCELLATION * gain * std::max(0.f, -k.mode);
        double innate = 0;
        for (auto e = offset[c]; e < pacer[l]; ++e)
          innate += std::abs(double(s.edges[order[e]].weight));
        sl.innate[l] = float(innate);
        sl.unit[l] = sl.born[l] ? float(innate / sl.born[l]) : 0.f;
        const double tau = time_constant_steps(nc.parameters);
        sl.fast[l] = float(std::exp(-2 / tau));
        sl.period[l] = std::max(8., tau);
        sl.phase[l] = (nc.x > 0 ? PI_F : 0.) +
                      2 * PI_F * std::fmod(std::abs(nc.x) * 7.31 + nc.y * 3.17 + nc.z * 1.93, 1.);
        cell_lane[c] = std::int32_t(8 * slices.size() + std::size_t(l));
        cell_fast[c] = sl.fast[l];
        cell_gain[c] = group[c] == 1 ? gain : 0.f;
      }
      sl.offset = std::uint32_t(gene.size());
      for (std::uint32_t j = 0; j < sl.length; ++j)
        for (int l = 0; l < 8; ++l)
          add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                   l < sl.lanes && offset[cell[l]] + j < pacer[l]);
      sl.extra_offset = std::uint32_t(gene.size());
      for (std::uint32_t j = 0; j < sl.extra_length; ++j)
        for (int l = 0; l < 8; ++l)
          add_slot(l < sl.lanes ? pacer[l] + j : 0, l < sl.lanes && pacer[l] + j < end[l]);
      max_length = std::max({max_length, sl.length, sl.extra_length});
      slices.push_back(sl);
    }
    auto effector_capacity = [&](std::uint32_t c) {
      return places(c, offset[c + 1] - offset[c], 0);
    };
    std::stable_sort(effectors.begin(), effectors.end(),
                     [&](auto x, auto y) { return effector_capacity(x) > effector_capacity(y); });
    for (std::size_t start = 0; start < effectors.size(); start += 8) {
      Slice sl;
      sl.lanes = int(std::min<std::size_t>(8, effectors.size() - start));
      std::array<std::uint32_t, 8> cell{};
      for (int l = 0; l < sl.lanes; ++l) {
        const auto c = effectors[start + std::size_t(l)];
        cell[l] = c;
        sl.cell[l] = NeuronIndex(c);
        sl.valid[l] = -1;
        sl.bias[l] = s.neurons[c].bias;
        sl.born[l] = std::uint16_t(offset[c + 1] - offset[c]);
        sl.capacity[l] = effector_capacity(c);
        sl.length = std::max<std::uint32_t>(sl.length, sl.capacity[l]);
        double innate = 0;
        for (auto e = offset[c]; e < offset[c + 1]; ++e)
          innate += std::abs(double(s.edges[order[e]].weight));
        sl.innate[l] = float(innate);
        sl.unit[l] = sl.born[l] ? float(innate / sl.born[l]) : 0.f;
      }
      sl.offset = std::uint32_t(gene.size());
      for (std::uint32_t j = 0; j < sl.length; ++j)
        for (int l = 0; l < 8; ++l)
          add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                   l < sl.lanes && offset[cell[l]] + j < offset[cell[l] + 1]);
      max_length = std::max(max_length, sl.length);
      effector_slices.push_back(sl);
    }
    std::stable_sort(others.begin(), others.end(), [&](auto x, auto y) {
      return offset[x + 1] - offset[x] > offset[y + 1] - offset[y];
    });
    for (std::size_t start = 0; start < others.size(); start += 8) {
      Slice sl;
      sl.lanes = int(std::min<std::size_t>(8, others.size() - start));
      std::array<std::uint32_t, 8> cell{};
      for (int l = 0; l < sl.lanes; ++l) {
        const auto c = others[start + std::size_t(l)];
        cell[l] = c;
        sl.cell[l] = NeuronIndex(c);
        sl.valid[l] = -1;
        sl.bias[l] = s.neurons[c].bias;
        sl.length = std::max(sl.length, offset[c + 1] - offset[c]);
      }
      sl.offset = std::uint32_t(gene.size());
      for (std::uint32_t j = 0; j < sl.length; ++j)
        for (int l = 0; l < 8; ++l)
          add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                   l < sl.lanes && offset[cell[l]] + j < offset[cell[l] + 1]);
      other_slices.push_back(sl);
    }
  }
};
void Substrate::prepare_network() {
  network_layout = std::make_shared<NetworkTopology>(*this);
}
Network::Network(std::shared_ptr<const Substrate> s) : tissue(std::move(s)) {
  const auto n = tissue->neurons.size();
  if (n > 65535)
    throw std::length_error("neuron budget exceeded");
  state_.assign(n, 0.f);
  next_ = state_;
  pulse_ = state_;
  signal_.assign(n + 1, 0.f);
  muted_.assign(n, 0);
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
  const auto &t = *topology;
  const std::size_t slots = t.gene.size(), lanes = 8 * t.slices.size(),
                    effector_lanes = 8 * t.effector_slices.size();
  settled_ready_ = false;
  index_ = t.index;
  gene_ = t.gene;
  learned_.assign(slots, 0.f);
  trace_.assign(slots, 0.f);
  predict_.assign(slots, 0.f);
  for (auto *v : {&lane_action_, &lane_teach_, &lane_own_, &lane_value_, &lane_contrast_,
                  &lane_ready_, &lane_step_, &lane_pending_})
    v->assign(lanes, 0.f);
  lane_innate_.assign(lanes, 0.f);
  lane_count_.assign(lanes + effector_lanes, 0);
  for (std::size_t s = 0; s < t.slices.size(); ++s)
    for (int l = 0; l < 8; ++l) {
      lane_innate_[8 * s + std::size_t(l)] = t.slices[s].innate[l];
      lane_count_[8 * s + std::size_t(l)] = t.slices[s].born[l];
    }
  effector_own_.assign(effector_lanes, 0.f);
  effector_innate_.assign(effector_lanes, 0.f);
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s)
    for (int l = 0; l < 8; ++l) {
      effector_innate_[8 * s + std::size_t(l)] = t.effector_slices[s].innate[l];
      lane_count_[lanes + 8 * s + std::size_t(l)] = t.effector_slices[s].born[l];
    }
  cell_surprise_.assign(cells() + 1, 0.f);
  usual_.assign(cells(), 0.f);
  deviation_.assign(cells() + 1, 0.f);
  gathered_.assign(8 * std::size_t(t.max_length), 0.f);
  revision_ = 0;
}
void Network::mute(std::size_t neuron, bool value) {
  muted_.at(neuron) = value;
  if (value)
    state_[neuron] = next_[neuron] = signal_[neuron] = pulse_[neuron] = 0;
}
void Network::stimulate(std::size_t i, float amount) {
  if (i >= cells() || !std::isfinite(amount) || amount < 0 || amount > 1)
    throw std::invalid_argument("invalid neural stimulus");
  const auto &n = tissue->neurons[i];
  if (muted_[i] || !n.functional)
    throw std::invalid_argument("only active cells can be stimulated");
  if (n.functions.sensory() > 0) {
    // a sensory cell: one pulse added to its next input; its current signal shows it at once
    pulse_[i] = std::clamp(pulse_[i] + amount, 0.f, 1.f);
    signal_[i] = std::clamp(signal_[i] + amount, 0.f, 1.f);
    return;
  }
  state_[i] = std::clamp(std::max(state_[i] + amount, amount), -1.f, 1.f);
  next_[i] = state_[i];
}
void Network::stimulate(const std::vector<std::size_t> &neurons, float amount) {
  if (neurons.empty() || !std::isfinite(amount) || amount < 0 || amount > 1)
    throw std::invalid_argument("invalid organ stimulus");
  auto ids = neurons;
  std::sort(ids.begin(), ids.end());
  ids.erase(std::unique(ids.begin(), ids.end()), ids.end());
  for (auto i : ids)
    if (i >= cells() || muted_[i] || !tissue->neurons[i].functional)
      throw std::invalid_argument("only active cells can be stimulated");
  for (auto i : ids)
    stimulate(i, amount);
}
void Network::refresh_observation() {
  if (!observe)
    return;
  materialize();
  const auto &w = settled();
  observed_contributions.assign(index_.size(), 0.f);
  const auto zero = std::uint16_t(cells());
  for (std::size_t k = 0; k < index_.size(); ++k)
    if (index_[k] != zero && !muted_[index_[k]])
      observed_contributions[k] = signal_[index_[k]] * (gene_[k] + w[k]);
}
void Network::reset() {
  active_hormones_ = {};
  materialize();
  settled_ready_ = false;
  for (auto *v : {&state_, &next_, &signal_, &pulse_, &trace_, &lane_teach_, &lane_value_,
                  &lane_contrast_, &lane_ready_, &lane_step_, &lane_pending_, &cell_surprise_})
    std::fill(v->begin(), v->end(), 0.f);
  observed_contributions.clear();
}
void Network::reset_learning() {
  materialize();
  reset();
  prepare_state();
  learning_ticks = learning_seed = 0;
  learning_summary_ = {};
}
// Local retinal waves persist across birth; inherited receptor responses control their strength.
const std::vector<float> &Network::sensory_patterns(const std::vector<float> &values) {
  const auto &t = *topology;
  if (!development_known_ || t.egg_kind.empty())
    return values;
  auto unit = [&]() {
    egg_rng_ = egg_rng_ * 6364136223846793005ull + 1442695040888963407ull + learning_seed;
    std::uint64_t z = egg_rng_ ^ (egg_rng_ >> 29);
    z *= 0xbf58476d1ce4e5b9ull;
    return (double(z >> 11) + .5) / 9007199254740992.;
  };
  constexpr float WAVE_WIDTH = .15f, WAVE_HEIGHT = .6f;
  double tau = 0;
  std::size_t eyes = 0;
  for (std::size_t j = 0; j < t.sensors.size(); ++j)
    if (t.egg_kind[j] == 0) {
      tau += time_constant_steps(tissue->neurons[t.sensors[j]].parameters);
      ++eyes;
    }
  const double period = eyes ? tau / eyes : pattern_period_;
  const float wave_speed = float(2.4 / period), wave_rate = float(1 / period);
  for (int side = 0; side < 2; ++side) {
    if (std::abs(wave_front_[side]) > 1.5f) {
      if ((in_egg_ && !wave_started_[side]) || unit() < wave_rate) {
        wave_dir_[side] = unit() < .5 ? 1.f : -1.f;
        wave_front_[side] = -1.2f * wave_dir_[side];
        wave_started_[side] = true;
      }
    } else
      wave_front_[side] += wave_dir_[side] * wave_speed;
  }
  patterned_ = values;
  for (std::size_t j = 0; j < values.size(); ++j) {
    const int side = t.egg_side[j];
    float add = 0;
    switch (t.egg_kind[j]) {
    case 0:
      if (std::abs(wave_front_[side]) <= 1.5f) {
        const float d = t.egg_angle[j] - wave_front_[side];
        const auto c = t.sensors[j];
        const float strength = .5f * (1 + hormone_effect_[SensoryPattern][c]);
        add = strength * WAVE_HEIGHT * std::exp(-d * d / (2 * WAVE_WIDTH * WAVE_WIDTH));
      }
      break;
    default:
      break;
    }
    patterned_[j] = std::clamp(values[j] + add, 0.f, 1.f);
  }
  return patterned_;
}
void Network::step(const std::vector<float> &values) {
  advance(values, nullptr, 0);
}
void Network::step(const std::vector<float> &values, const Hormones &modulators,
                   std::uint64_t individual) {
  for (double m : modulators)
    if (!std::isfinite(m) || m < 0 || m > 1)
      throw std::invalid_argument("invalid local modulation");
  advance(values, &modulators, individual);
}
double Network::turnover_unit() {
  turnover_rng_ = turnover_rng_ * 6364136223846793005ull + 1442695040888963407ull + learning_seed;
  std::uint64_t z = turnover_rng_ ^ (turnover_rng_ >> 29);
  z *= 0xbf58476d1ce4e5b9ull;
  z ^= z >> 32;
  return (double(z >> 11) + .5) / 9007199254740992.;
}
// Formation, the reverse of elimination: a cell with a free place examines one possible partner per
// step (a partner group of its group by binding strength, in it a random cell that can drive, taken
// with the binding probability; no second synapse from the same source). The partner is treated as
// a synapse of strength 0: if the cell's learning rules would strengthen it in the direction of the
// source's sign (would(source) x sign > 0), it forms with NEW_SYNAPSE x the cell's mean strength at
// birth; a share BASAL of the trials forms without this test (basal formation).
template <class Would>
bool Network::form_synapse(std::size_t lane, bool effector, const Would &would) {
  const auto &t = *topology;
  const auto &s = (effector ? t.effector_slices : t.slices)[lane / 8];
  const int l = int(lane % 8);
  const auto target = s.cell[l];
  const auto group = tissue->neurons[target].group;
  if (group + 1 >= tissue->partner_offset.size())
    return false;
  const auto first = tissue->partner_offset[group], last = tissue->partner_offset[group + 1];
  double total = 0;
  for (auto k = first; k < last; ++k)
    total += tissue->partners[k].strength;
  if (total <= 0)
    return false;
  double pick = turnover_unit() * total;
  auto k = first;
  for (; k + 1 < last && pick >= tissue->partners[k].strength; ++k)
    pick -= tissue->partners[k].strength;
  const auto &partner = tissue->partners[k];
  if (partner.source + 1 >= t.group_offset.size())
    return false;
  const auto members = t.group_offset[partner.source + 1] - t.group_offset[partner.source];
  if (!members || turnover_unit() >= partner.p)
    return false;
  const auto source = t.group_cells[t.group_offset[partner.source] +
                                    std::uint32_t(turnover_unit() * members) % members];
  if (source == target || !t.cell_driving[source] || muted_[source])
    return false;
  const auto zero = std::uint16_t(cells());
  std::uint32_t free = UINT32_MAX;
  for (std::uint32_t j = 0; j < s.capacity[l]; ++j) {
    const auto slot = s.offset + 8 * j + std::uint32_t(l);
    if (index_[slot] == source)
      return false;
    if (index_[slot] == zero && free == UINT32_MAX)
      free = slot;
  }
  if (free == UINT32_MAX || s.unit[l] <= 0)
    return false;
  if (turnover_unit() >= BASAL && would(source) * t.cell_sign[source] <= 0)
    return false;
  index_[free] = source;
  gene_[free] = t.cell_sign[source] * NEW_SYNAPSE * s.unit[l];
  learned_[free] = trace_[free] = predict_[free] = 0;
  ++lane_count_[effector ? 8 * t.slices.size() + lane : lane];
  ++revision_;
  return true;
}
// Synapses onto effectors learn by the valuation of their source: e = rho e + (1 - rho) x~ (y - y~)
// with rho of the source and y the effector's activity, dw = g delta e / (1 + sum e^2) with the
// gain and the surprise of the source; Dale; resource fixed; rebuilding as for nerve cells.
void Network::learn_effectors(float rm) {
  const auto &t = *topology;
  const auto zero = std::uint16_t(cells());
  const float prune_share = PRUNE;
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s) {
    const auto &sl = t.effector_slices[s];
    const std::uint32_t L = sl.length, base = sl.offset;
    for (int l = 0; l < sl.lanes; ++l) {
      const auto cell = sl.cell[l];
      const auto lane = 8 * s + std::size_t(l);
      if (muted_[cell])
        continue;
      const float own = next_[cell], usual = effector_own_[lane];
      const float dy = own - usual;
      effector_own_[lane] = rm * usual + (1 - rm) * own;
      double e2 = 0;
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + 8 * j + std::uint32_t(l);
        const auto src = index_[slot];
        if (src == zero)
          continue;
        const float fast = t.cell_fast[src];
        trace_[slot] = fast * trace_[slot] + (1 - fast) * deviation_[src] * dy;
        e2 += double(trace_[slot]) * trace_[slot];
      }
      double total = 0;
      bool changed = false;
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + 8 * j + std::uint32_t(l);
        const auto src = index_[slot];
        if (src == zero)
          continue;
        const float g = gene_[slot];
        float u = learned_[slot];
        const float gain = t.cell_gain[src] * (1 + hormone_effect_[Learning][src]);
        if (gain > 0) {
          u = float(u + gain * cell_surprise_[src] * trace_[slot] / (1 + e2));
          if (g * (g + u) < 0)
            u = -g;
          changed = changed || u != learned_[slot];
          learned_[slot] = u;
        }
        total += std::abs(double(g) + u);
      }
      const double innate = effector_innate_[lane];
      if (changed && total > 0 && innate > 0)
        for (std::uint32_t j = 0; j < L; ++j) {
          const auto slot = base + 8 * j + std::uint32_t(l);
          if (index_[slot] != zero)
            learned_[slot] =
                float((double(gene_[slot]) + learned_[slot]) * (innate / total) - gene_[slot]);
        }
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + 8 * j + std::uint32_t(l);
        if (index_[slot] != zero &&
            std::abs(gene_[slot] + learned_[slot]) < prune_share * sl.unit[l]) {
          index_[slot] = zero;
          gene_[slot] = learned_[slot] = trace_[slot] = predict_[slot] = 0;
          --lane_count_[8 * t.slices.size() + lane];
          ++revision_;
        }
      }
      if (lane_count_[8 * t.slices.size() + lane] < sl.capacity[l])
        form_synapse(lane, true, [&](std::uint32_t src) {
          return t.cell_gain[src] * (1 + hormone_effect_[Learning][src]) * cell_surprise_[src] *
                 (1 - t.cell_fast[src]) * deviation_[src] * dy / (1 + e2);
        });
    }
  }
}
// One step. Signals: the activity of the step before and this step's sensory input. Learning
// cells: two passes over their input slots. Pass A applies the weight step of the previous
// learning step (with Dale and the resource) and sums the input; the resource factor follows from
// the summed strength and scales the driving sum (the sum is linear in the weights). Pass B applies
// the resource factor to the weights, updates eligibility, prediction, ordering and cancelling, and
// removes synapses that fell below the prune level; the new weight step waits for the next pass A.
// Effectors: activity, then their learning and rebuilding. Other cells: as born.
void Network::advance(const std::vector<float> &values, const Hormones *modulation,
                      std::uint64_t individual) {
  materialize();
  const auto &t = *topology;
  const std::size_t n = cells();
  if (values.size() != t.sensors.size())
    throw std::invalid_argument("wrong sensor count");
  for (float v : values)
    if (!std::isfinite(v))
      throw std::invalid_argument("invalid stimulus");
  settled_ready_ = false;
  learning_summary_ = {};
  learning_summary_.work = (1 + HORMONE_EFFECTS * HORMONES) * n + gene_.size();
  const bool learning = modulation != nullptr;
  if (learning) {
    if (learning_ticks == 0) {
      learning_seed = individual;
      turnover_rng_ = individual ^ 0x5851f42d4c957f2dull;
    }
    ++learning_ticks;
  }
  if (modulation)
    active_hormones_ = *modulation;
  for (int k = 0; k < HORMONE_EFFECTS; ++k) {
    auto &effect = hormone_effect_[k];
    effect.resize(n);
    for (std::size_t i = 0; i < n; ++i)
      effect[i] = tissue->neurons[i].hormone_receptors[k].response(active_hormones_);
  }
  const auto &input = sensory_patterns(values);
  for (std::size_t i = 0; i < n; ++i)
    signal_[i] = state_[i];
  for (std::size_t j = 0; j < t.sensors.size(); ++j) {
    const auto i = t.sensors[j];
    signal_[i] = std::clamp(input[j] + pulse_[i], 0.f, 1.f);
    pulse_[i] = 0;
  }
  const bool any_muted = std::find(muted_.begin(), muted_.end(), (unsigned char)1) != muted_.end();
  if (any_muted)
    for (std::size_t i = 0; i < n; ++i)
      if (muted_[i])
        signal_[i] = 0;
  signal_[n] = 0;
  const bool adapt = learning && plasticity_enabled;
  static const float mean_decay = std::exp(-1 / 500.f);
  const float rm = std::min(mean_decay, float(learning_ticks) / float(learning_ticks + 1));
  if (adapt)
    for (std::size_t i = 0; i < n; ++i) {
      usual_[i] = rm * usual_[i] + (1 - rm) * signal_[i];
      deviation_[i] = signal_[i] - usual_[i];
    }

  const float *genes = gene_.data();
  const std::uint16_t *indices = index_.data();
  const auto zero = std::uint16_t(n);
  const float *emitted = signal_.data();
  float *xb = gathered_.data();
  for (std::size_t s = 0; s < t.slices.size(); ++s) {
    const auto &sl = t.slices[s];
    const std::uint32_t L = sl.length, base = sl.offset, lane0 = std::uint32_t(8 * s);
    const float *SG = genes + base;
    float *SW = learned_.data() + base, *ST = trace_.data() + base, *SV = predict_.data() + base;
    I8 live = sl.valid;
    bool muted_lane = false;
    if (any_muted)
      for (int l = 0; l < sl.lanes; ++l)
        if (muted_[sl.cell[l]]) {
          live[l] = 0;
          muted_lane = true;
        }
    const F8 cb = load8(lane_action_.data() + lane0), nz = load8(lane_teach_.data() + lane0),
             uo = load8(lane_own_.data() + lane0);
    F8 rs{}, drive{}, rhythm{}, eligibility{}, gain_factor{}, competition{};
    for (int l = 0; l < sl.lanes; ++l) {
      const auto c = sl.cell[l];
      drive[l] = hormone_effect_[Excitation][c];
      rhythm[l] = .5f * (1 + hormone_effect_[Rhythm][c]);
      eligibility[l] = .5f * (1 + hormone_effect_[Eligibility][c]);
      gain_factor[l] = 1 + hormone_effect_[Learning][c];
      competition[l] = .5f * (1 + hormone_effect_[Competition][c]);
      if (sl.pace[l] > 0)
        rs[l] = float(std::sin(sl.phase[l] + 2 * PI_F * double(learning_ticks) / sl.period[l]));
    }
    const F8 gain = sl.gain * gain_factor;
    const F8 step0 = load8(lane_step_.data() + lane0);
    const I8 pending = load8(lane_pending_.data() + lane0) > splat8(.5f);
    bool any_pending = false;
    for (int l = 0; l < 8; ++l)
      any_pending = any_pending || pending[l];
    F8 sum = sl.bias + drive + sl.pace * rhythm * rs, acc{}, total{}, change{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = 8 * j;
      const I8 index = load_index8(indices + base + slot);
      const F8 x = gather8(emitted, index), g = load8(SG + slot);
      store8(xb + slot, gather8(deviation_.data(), index));
      F8 w = load8(SW + slot);
      if (any_pending) {
        F8 u = w + step0 * load8(ST + slot);
        u = g * (g + u) < splat8(0) ? -g : u; // Dale
        change += abs8(u - w);
        total += abs8(g + u);
        store8(SW + slot, u);
        w = u;
      }
      acc += x * (g + w);
    }
    const F8 innate = load8(lane_innate_.data() + lane0);
    // resource: ordering and neutral cells redistribute a fixed resource; for cancelling cells it
    // is only an upper bound (unused strength may stay unused)
    const I8 scale = pending & (total > splat8(0)) & (innate > splat8(0)) &
                     ((sl.canc <= splat8(0)) | (total > innate));
    bool any_scale = false;
    for (int l = 0; l < 8; ++l)
      any_scale = any_scale || scale[l];
    const F8 f = scale ? innate / (scale ? total : splat8(1)) : splat8(1);
    sum += f * acc;
    F8 pace{}, modulating{};
    if (sl.extra_length) {
      const float *XG = genes + sl.extra_offset, *XW = learned_.data() + sl.extra_offset;
      for (std::uint32_t j = 0; j < sl.extra_length; ++j) {
        const auto slot = 8 * j;
        const F8 v = gather8(emitted, load_index8(indices + sl.extra_offset + slot)) *
                     (load8(XG + slot) + load8(XW + slot));
        const I8 at = I8{} + std::int32_t(j);
        pace += at < sl.modulator ? v : F8{};
        sum += at < sl.both ? v : F8{};
        modulating += at >= sl.both ? v : F8{};
      }
    }
    const F8 out = tanh8(sum);
    for (int l = 0; l < sl.lanes; ++l)
      next_[sl.cell[l]] = live[l] ? out[l] : 0.f;
    store8(lane_ready_.data() + lane0, live ? splat8(1) : F8{});
    if (muted_lane) // muted cells keep no eligibility
      for (std::uint32_t j = 0; j < L; ++j)
        store8(ST + 8 * j, live ? load8(ST + 8 * j) : F8{});
    const I8 learn = live & (gain > splat8(0));
    bool any = false;
    for (int l = 0; l < sl.lanes; ++l)
      any = any || learn[l];
    learning_summary_.change += sum8(change);
    store8(lane_step_.data() + lane0, F8{});
    store8(lane_pending_.data() + lane0, F8{});
    for (int l = 0; l < sl.lanes; ++l)
      cell_surprise_[sl.cell[l]] = 0;
    if (!adapt || !any) {
      if (any_scale) // the resource still applies to the last step
        for (std::uint32_t j = 0; j < L; ++j) {
          const auto slot = 8 * j;
          const F8 w = load8(SW + slot), g = load8(SG + slot);
          store8(SW + slot, scale ? (g + w) * f - g : w);
        }
      continue;
    }
    const F8 own = tanh8(sum - drive);
    const F8 action = (1 - eligibility) * pace + eligibility * own, teach = drive + modulating;
    const F8 cb2 = rm * cb + (1 - rm) * action, dpost = action - cb2, ddrive = teach - nz,
             nz2 = rm * nz + (1 - rm) * teach, y = own - uo, uo2 = rm * uo + (1 - rm) * own;
    // lanes that do not learn keep their traces and weights (fast 1, no deviation, no rates)
    const F8 fast = learn ? sl.fast : splat8(1), dp = learn ? dpost : F8{};
    const F8 cy = learn ? sl.comp * gain_factor * competition * y : F8{},
             ky = learn ? sl.canc * gain_factor * y : F8{};
    bool competes = false;
    for (int l = 0; l < sl.lanes; ++l)
      competes = competes || cy[l] != 0 || ky[l] != 0;
    F8 prediction{}, x2{}, e2{}, competed{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = 8 * j;
      const F8 xc = load8(xb + slot), g = load8(SG + slot);
      F8 w = load8(SW + slot);
      if (any_scale)
        w = scale ? (g + w) * f - g : w;
      const F8 tr = fast * load8(ST + slot) + (1 - fast) * xc * dp;
      store8(ST + slot, tr);
      prediction += load8(SV + slot) * xc;
      x2 += xc * xc;
      e2 += tr * tr;
      if (competes) {
        const F8 kv = ky * gather8(t.nerve_source.data(), load_index8(indices + base + slot));
        const F8 d = cy * (xc - (g + w) * y) - kv * xc;
        w = w + d;
        competed += abs8(d);
      }
      if (any_scale || competes)
        store8(SW + slot, w);
    }
    // valuation: the surprise of the teaching signal against the prediction from the inputs
    const F8 surprise = learn ? ddrive - prediction : F8{},
             vstep = learn ? gain * surprise / (1 + x2) : F8{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = 8 * j;
      store8(SV + slot, load8(SV + slot) + vstep * load8(xb + slot));
    }
    store8(lane_step_.data() + lane0, learn ? gain * surprise / (1 + e2) : F8{});
    store8(lane_pending_.data() + lane0, learn ? splat8(1) : F8{});
    store8(lane_action_.data() + lane0, learn ? cb2 : cb);
    store8(lane_teach_.data() + lane0, learn ? nz2 : nz);
    store8(lane_own_.data() + lane0, learn ? uo2 : uo);
    store8(lane_value_.data() + lane0, learn ? surprise : load8(lane_value_.data() + lane0));
    store8(lane_contrast_.data() + lane0, learn ? dpost : load8(lane_contrast_.data() + lane0));
    learning_summary_.surprise += sum8(learn ? abs8(surprise) : F8{});
    learning_summary_.change += sum8(competed);
    for (int l = 0; l < sl.lanes; ++l) {
      if (!learn[l])
        continue;
      cell_surprise_[sl.cell[l]] = surprise[l];
      ++learning_summary_.cells;
      learning_summary_.work += std::uint64_t(sl.work[l]);
      // rebuilding: synapses below the prune level vanish; a free place may be filled
      const auto lane = std::size_t(lane0) + std::size_t(l);
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + 8 * j + std::uint32_t(l);
        if (index_[slot] != zero && std::abs(gene_[slot] + learned_[slot]) < PRUNE * sl.unit[l]) {
          index_[slot] = zero;
          gene_[slot] = learned_[slot] = trace_[slot] = predict_[slot] = 0;
          --lane_count_[lane];
          ++revision_;
        }
      }
      if (lane_count_[lane] < sl.capacity[l])
        form_synapse(lane, false, [&](std::uint32_t src) {
          const double x = deviation_[src];
          return cy[l] * x - ky[l] * t.nerve_source[src] * x +
                 gain[l] * surprise[l] * (1 - fast[l]) * x * dp[l] / (1 + e2[l]);
        });
    }
  }
  for (const auto &sl : t.effector_slices) {
    const float *SG = genes + sl.offset, *SW = learned_.data() + sl.offset;
    F8 acc = sl.bias;
    for (std::uint32_t j = 0; j < sl.length; ++j)
      acc += gather8(emitted, load_index8(indices + sl.offset + 8 * j)) *
             (load8(SG + 8 * j) + load8(SW + 8 * j));
    const F8 out = tanh8(acc);
    for (int l = 0; l < sl.lanes; ++l) {
      const auto i = sl.cell[l];
      next_[i] = any_muted && muted_[i] ? 0.f : out[l];
    }
  }
  if (adapt)
    learn_effectors(rm);
  for (const auto &sl : t.other_slices) {
    const float *SG = genes + sl.offset;
    F8 acc = sl.bias;
    for (std::uint32_t j = 0; j < sl.length; ++j)
      acc += gather8(emitted, load_index8(indices + sl.offset + 8 * j)) * load8(SG + 8 * j);
    const F8 out = tanh8(acc);
    for (int l = 0; l < sl.lanes; ++l) {
      const auto i = sl.cell[l];
      next_[i] = any_muted && muted_[i] ? 0.f : out[l];
    }
  }
  for (const auto i : t.sensors)
    next_[i] = 0;
  state_.swap(next_);
  if (observe)
    refresh_observation();
}
std::uint64_t Network::work_bound() const {
  materialize();
  return (1 + HORMONE_EFFECTS * HORMONES) * cells() + 4 * gene_.size();
}
// Preview one complete learning step at absolute hormone concentrations, without changing this
// brain.
Network::ActorPreview Network::actor_preview(const std::vector<float> &values,
                                             const Hormones &h) const {
  Network probe = *this;
  probe.set_plasticity(true);
  const auto before = probe.synapses();
  probe.step(values, h, learning_seed);
  const auto after = probe.synapses();
  ActorPreview out;
  out.increments.assign(probe.slot_count(), 0);
  for (const auto &q : after)
    out.increments[q.slot] = q.weight;
  for (const auto &q : before)
    out.increments[q.slot] -= q.weight;
  out.work = probe.learning_summary().work;
  out.ready = true;
  return out;
}
const std::vector<float> &Network::settled() const {
  materialize();
  if (settled_ready_)
    return settled_;
  const auto &t = *topology;
  settled_ = learned_;
  for (std::size_t s = 0; s < t.slices.size(); ++s) {
    const auto &sl = t.slices[s];
    for (int l = 0; l < sl.lanes; ++l) {
      const auto lane = 8 * s + std::size_t(l);
      if (lane_pending_[lane] < .5f)
        continue;
      double total = 0;
      for (std::uint32_t j = 0; j < sl.length; ++j) {
        const auto slot = sl.offset + 8 * j + std::uint32_t(l);
        const float g = gene_[slot];
        float u = settled_[slot] + lane_step_[lane] * trace_[slot];
        if (g * (g + u) < 0)
          u = -g;
        settled_[slot] = u;
        total += std::abs(double(g) + u);
      }
      const double innate = lane_innate_[lane];
      if (total > 0 && innate > 0 && (sl.canc[l] <= 0 || total > innate))
        for (std::uint32_t j = 0; j < sl.length; ++j) {
          const auto slot = sl.offset + 8 * j + std::uint32_t(l);
          const float g = gene_[slot];
          settled_[slot] = float((double(g) + settled_[slot]) * (innate / total) - g);
        }
    }
  }
  settled_ready_ = true;
  return settled_;
}
std::vector<Network::Synapse> Network::synapses() const {
  materialize();
  const auto &t = *topology;
  const auto &w = settled();
  const auto zero = std::uint16_t(cells());
  std::vector<Synapse> result;
  auto add = [&](const NetworkTopology::Slice &sl, std::uint32_t base, std::uint32_t length) {
    for (std::uint32_t j = 0; j < length; ++j)
      for (int l = 0; l < sl.lanes; ++l) {
        const auto slot = base + 8 * j + std::uint32_t(l);
        if (index_[slot] != zero)
          result.push_back({slot, index_[slot], sl.cell[l], gene_[slot] + w[slot], gene_[slot]});
      }
  };
  for (const auto &sl : t.slices) {
    add(sl, sl.offset, sl.length);
    add(sl, sl.extra_offset, sl.extra_length);
  }
  for (const auto &sl : t.effector_slices)
    add(sl, sl.offset, sl.length);
  for (const auto &sl : t.other_slices)
    add(sl, sl.offset, sl.length);
  return result;
}
std::size_t Network::slot_count() const {
  materialize();
  return gene_.size();
}
std::size_t Network::synapse_count() const {
  materialize();
  const auto zero = std::uint16_t(cells());
  return std::size_t(
      std::count_if(index_.begin(), index_.end(), [&](std::uint16_t i) { return i != zero; }));
}
float Network::surprise(std::size_t cell) const {
  materialize();
  return cell_surprise_.at(cell);
}
float Network::learning_contrast(std::size_t cell) const {
  materialize();
  const auto lane = topology->cell_lane.at(cell);
  return lane < 0 ? 0.f : lane_contrast_[std::size_t(lane)];
}
float Network::contribution(std::size_t slot) const {
  return observed_contributions.empty() || slot >= observed_contributions.size()
             ? 0
             : observed_contributions[slot];
}
std::size_t Network::learning_neurons() const {
  materialize();
  return topology->learning_cells;
}
double Network::learned_change() const {
  double total = 0;
  for (float w : settled())
    total += std::abs(w);
  return total;
}
std::size_t Network::learned_connections() const {
  const auto &w = settled();
  return std::size_t(
      std::count_if(w.begin(), w.end(), [](float v) { return std::abs(v) >= .001f; }));
}
std::size_t Network::runtime_bytes() const {
  std::size_t floats = 0;
  for (const auto *v : {&state_,
                        &next_,
                        &signal_,
                        &pulse_,
                        &gene_,
                        &learned_,
                        &trace_,
                        &predict_,
                        &usual_,
                        &deviation_,
                        &gathered_,
                        &lane_action_,
                        &lane_teach_,
                        &lane_own_,
                        &lane_value_,
                        &lane_contrast_,
                        &lane_ready_,
                        &lane_step_,
                        &lane_pending_,
                        &lane_innate_,
                        &effector_own_,
                        &effector_innate_,
                        &cell_surprise_,
                        &patterned_,
                        &observed_contributions})
    floats += v->capacity();
  for (const auto &v : hormone_effect_)
    floats += v.capacity();
  return floats * sizeof(float) +
         (index_.capacity() + lane_count_.capacity()) * sizeof(std::uint16_t) + muted_.capacity();
}
namespace {
// IEEE-754 binary32 in little-endian order; no decimal conversion or precision loss.
static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559, "binary32 required");
void write_values(std::ostream &out, const std::vector<float> &v) {
  unsigned char buffer[16384];
  for (std::size_t start = 0; start < v.size();) {
    auto n = std::min<std::size_t>(sizeof(buffer) / 4, v.size() - start);
    for (std::size_t j = 0; j < n; ++j) {
      std::uint32_t bits;
      std::memcpy(&bits, &v[start + j], 4);
      for (unsigned k = 0; k < 4; ++k)
        buffer[4 * j + k] = static_cast<unsigned char>(bits >> (8 * k));
    }
    out.write(reinterpret_cast<const char *>(buffer), std::streamsize(n * 4));
    start += n;
  }
  out.put('\n');
}
void read_values(std::istream &in, std::vector<float> &v, float limit) {
  unsigned char buffer[16384];
  for (std::size_t start = 0; start < v.size();) {
    auto n = std::min<std::size_t>(sizeof(buffer) / 4, v.size() - start);
    if (!in.read(reinterpret_cast<char *>(buffer), std::streamsize(n * 4)))
      throw std::runtime_error("truncated brain state");
    for (std::size_t j = 0; j < n; ++j) {
      std::uint32_t bits = 0;
      for (unsigned k = 0; k < 4; ++k)
        bits |= std::uint32_t(buffer[4 * j + k]) << (8 * k);
      float x;
      std::memcpy(&x, &bits, 4);
      if (!std::isfinite(x) || std::abs(x) > limit)
        throw std::runtime_error("invalid brain value");
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
  materialize();
  const auto precision = out.precision(17);
  out << "BRAIN018B " << cells() << ' ' << learned_.size() << ' ' << lane_action_.size() << ' '
      << effector_own_.size() << ' ' << learning_seed << ' ' << learning_ticks << ' '
      << plasticity_enabled << ' ' << maturity_ << ' ' << pattern_period_ << ' ' << in_egg_ << ' '
      << development_known_ << ' ' << egg_rng_ << ' ' << turnover_rng_ << ' ' << revision_;
  for (int side = 0; side < 2; ++side)
    out << ' ' << wave_front_[side] << ' ' << wave_dir_[side] << ' ' << wave_started_[side];
  for (double v : active_hormones_)
    out << ' ' << v;
  out << '\n';
  out.precision(precision);
  write_values(out, std::vector<float>(index_.begin(), index_.end()));
  for (const auto *v :
       {&gene_,         &state_,       &signal_,        &pulse_,           &usual_,
        &learned_,      &trace_,       &predict_,       &lane_action_,     &lane_teach_,
        &lane_own_,     &lane_value_,  &lane_contrast_, &lane_ready_,      &lane_step_,
        &lane_pending_, &lane_innate_, &effector_own_,  &effector_innate_, &cell_surprise_})
    write_values(out, *v);
  write_values(out, as_floats(muted_));
}
void Network::read_runtime(std::istream &in) {
  Network candidate = *this;
  candidate.read_runtime_state(in);
  *this = std::move(candidate);
}
void Network::read_runtime_state(std::istream &in) {
  materialize();
  observed_contributions.clear();
  std::string tag;
  std::size_t neurons = 0, slots = 0, lanes = 0, effector_lanes = 0;
  if (!(in >> tag >> neurons >> slots >> lanes >> effector_lanes >> learning_seed >>
        learning_ticks >> plasticity_enabled >> maturity_ >> pattern_period_ >> in_egg_ >>
        development_known_ >> egg_rng_ >> turnover_rng_ >> revision_) ||
      tag != "BRAIN018B" || neurons != cells() || slots != learned_.size() ||
      lanes != lane_action_.size() || effector_lanes != effector_own_.size())
    throw std::runtime_error("invalid brain state");
  for (int side = 0; side < 2; ++side)
    if (!(in >> wave_front_[side] >> wave_dir_[side] >> wave_started_[side]))
      throw std::runtime_error("invalid brain state");
  for (auto &v : active_hormones_)
    if (!(in >> v) || !std::isfinite(v) || v < 0 || v > 1)
      throw std::runtime_error("invalid hormone state");
  if (in.get() != '\n' || !std::isfinite(maturity_) || maturity_ < 0 || maturity_ > 1 ||
      !std::isfinite(pattern_period_) || pattern_period_ < 1)
    throw std::runtime_error("invalid brain state");
  std::vector<float> sources(slots);
  read_values(in, sources, float(cells()));
  for (std::size_t k = 0; k < slots; ++k) {
    if (sources[k] < 0 || sources[k] != std::floor(sources[k]))
      throw std::runtime_error("invalid synapse source");
    index_[k] = std::uint16_t(sources[k]);
  }
  constexpr float LIMIT = 1e9f;
  for (auto *v :
       {&gene_,         &state_,       &signal_,        &pulse_,           &usual_,
        &learned_,      &trace_,       &predict_,       &lane_action_,     &lane_teach_,
        &lane_own_,     &lane_value_,  &lane_contrast_, &lane_ready_,      &lane_step_,
        &lane_pending_, &lane_innate_, &effector_own_,  &effector_innate_, &cell_surprise_})
    read_values(in, *v, LIMIT);
  // no separate weight limit: the resource normalisation of the next step bounds the weights as in
  // the running brain; a loaded state only has to be finite (read_values)
  std::vector<float> flags(cells());
  read_values(in, flags, 1);
  for (std::size_t i = 0; i < cells(); ++i) {
    if (flags[i] != 0 && flags[i] != 1)
      throw std::runtime_error("invalid neuron switch");
    muted_[i] = flags[i] != 0;
  }
  next_.assign(cells(), 0.f);
  settled_ready_ = false;
  // occupied places per lane
  const auto &t = *topology;
  const auto zero = std::uint16_t(cells());
  auto count = [&](const NetworkTopology::Slice &sl, std::size_t lane0) {
    for (int l = 0; l < sl.lanes; ++l) {
      std::uint16_t c = 0;
      for (std::uint32_t j = 0; j < sl.length; ++j)
        c += index_[sl.offset + 8 * j + std::uint32_t(l)] != zero;
      lane_count_[lane0 + std::size_t(l)] = c;
    }
  };
  for (std::size_t s = 0; s < t.slices.size(); ++s)
    count(t.slices[s], 8 * s);
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s)
    count(t.effector_slices[s], 8 * t.slices.size() + 8 * s);
  deviation_.assign(cells() + 1, 0.f);
  for (std::size_t i = 0; i < cells(); ++i)
    deviation_[i] = signal_[i] - usual_[i];
}
}
