#include <cstdio>
#include <unordered_map>
#include <string>
#include <cstdlib>
#include "substrate.hh"
#include "mix.hh"
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
constexpr int LANES = 8;
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
// The approximation Eigen uses.
inline __attribute__((always_inline)) F8 tanh8(const F8 &a) {
  constexpr float TANH_LIMIT = 7.99881172180175781f;
  constexpr float NUMERATOR[] = {
      -2.76076847742355e-16f, 2.00018790482477e-13f, -8.60467152213735e-11f, 5.12229709037114e-08f,
      1.48572235717979e-05f,  6.37261928875436e-04f, 4.89352455891786e-03f};
  constexpr float DENOMINATOR[] = {1.19825839466702e-06f, 1.18534705686654e-04f,
                                   2.26843463243900e-03f, 4.89352518554385e-03f};
  const F8 x = clamp8(a, -TANH_LIMIT, TANH_LIMIT), x2 = x * x;
  F8 p = x2 * NUMERATOR[0] + NUMERATOR[1];
  for (std::size_t k = 2; k < std::size(NUMERATOR); ++k)
    p = x2 * p + NUMERATOR[k];
  F8 q = x2 * DENOMINATOR[0] + DENOMINATOR[1];
  for (std::size_t k = 2; k < std::size(DENOMINATOR); ++k)
    q = x2 * q + DENOMINATOR[k];
  return x * p / q;
}
constexpr double PI_F = 3.14159265358979323846;
namespace source_group {
constexpr unsigned char outer = 0, nerve = 1, pacer = 2, modulating_pacer = 3, modulator = 4;
}
constexpr double MIN_PACE_PERIOD = TIME_CONSTANT_PACE_MIN, ADAPTATION_SPAN = 10;
constexpr std::array<double, 3> PHASE_SALT{7.31, 3.17, 1.93};
constexpr std::uint64_t GENE_WORK = 4;
constexpr std::uint64_t PCG_MULTIPLIER = 6364136223846793005ull,
                        PCG_INCREMENT = 1442695040888963407ull;
constexpr int MIX_SHIFT1 = 29, MIX_SHIFT2 = 32;
constexpr float COMPETITION = 1, CANCELLATION = .02f, PRUNE = .05f, NEW_SYNAPSE = .1f,
                BASAL = 1.f / 50;
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
void Substrate::limit_development(const char *reason) {
  resource_limited = true;
  if (diagnostic.empty())
    diagnostic = reason;
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
  struct Slice {
    std::uint32_t offset = 0, length = 0, extra_offset = 0, extra_length = 0;
    int lanes = 0;
    bool rhythm = false;
    std::array<NeuronIndex, LANES> cell{};
    F8 bias{}, gain{}, pace{}, comp{}, canc{}, innate{}, fast{}, unit{};
    I8 valid{}, work{}, both{}, modulator{}, nerve{};
    std::array<std::uint16_t, LANES> capacity{}, born{};
    std::array<double, LANES> phase{}, period{{1, 1, 1, 1, 1, 1, 1, 1}};
    // Empty tail rows have no weights or traces. Keep their capacity for formation and
    // inspect the current indices so growth, pruning, death and loading need no cache updates.
    std::uint32_t occupied_length(const std::vector<std::uint16_t> &indices,
                                  std::uint16_t zero) const {
      auto used = length;
      while (used) {
        const auto begin = indices.begin() + offset + LANES * (used - 1);
        if (std::any_of(begin, begin + LANES, [zero](auto i) { return i != zero; }))
          break;
        --used;
      }
      return used;
    }
  };
  std::vector<NeuronIndex> sensors;
  std::vector<Slice> slices, effector_slices, other_slices;
  std::vector<float> gene;
  std::vector<std::uint16_t> index;
  std::vector<float> cell_gain, cell_fast, cell_sign, nerve_source;
  std::vector<unsigned char> cell_driving;
  std::vector<std::int32_t> cell_lane;
  std::vector<std::uint32_t> group_offset, group_cells;
  std::uint32_t max_length = 0;
  std::size_t learning_cells = 0;
  struct BuildState {
    enum Stage {
      Counts,
      Prefix,
      Edges,
      Classes,
      SortInputs,
      Traits,
      GroupCounts,
      GroupPrefix,
      GroupCells,
      SortCells,
      Learners,
      Effectors,
      Others,
      Done
    } stage = Counts;
    std::size_t cursor = 0;
    std::uint32_t groups = 0;
    std::vector<std::uint32_t> offset, order, at, learners, effectors, others;
    std::vector<CellClass> classes;
    std::vector<unsigned char> group;
    explicit BuildState(const Substrate &s)
        : offset(s.neurons.size() + 1), order(s.edges.size()), classes(s.neurons.size()),
          group(s.neurons.size()) {}
  };
  std::unique_ptr<BuildState> building;
  bool ready = false;
  NetworkTopology() = default;
  explicit NetworkTopology(const Substrate &s) {
    auto budget = std::numeric_limits<std::size_t>::max();
    advance(s, budget);
  }
  bool advance(const Substrate &s, std::size_t &budget) {
    if (ready)
      return true;
    const std::size_t n = s.neurons.size();
    if (n > MAX_NODES)
      throw std::length_error("neuron budget exceeded");
    const auto zero = std::uint16_t(n);
    if (!building)
      building = std::make_unique<BuildState>(s);
    auto &b = *building;
    auto &offset = b.offset, &order = b.order, &learners = b.learners, &effectors = b.effectors,
         &others = b.others;
    auto &classes = b.classes;
    auto &group = b.group;
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
    auto places = [&](std::uint32_t c, std::uint32_t born, std::uint32_t extra) {
      const std::uint32_t total = s.neurons[c].slots;
      return std::uint16_t(
          std::min<std::uint32_t>(std::numeric_limits<std::uint16_t>::max(),
                                  std::max(born, total > extra ? total - extra : 0)));
    };
    auto driving = [&](std::uint32_t c) { return first(c, source_group::pacer) - offset[c]; };
    auto capacity_of = [&](std::uint32_t c) {
      return places(c, driving(c), offset[c + 1] - first(c, source_group::pacer));
    };
    auto effector_capacity = [&](std::uint32_t c) {
      return places(c, offset[c + 1] - offset[c], 0);
    };

    while (budget && b.stage != BuildState::Done) {
      --budget;
      switch (b.stage) {
      case BuildState::Counts:
        if (b.cursor < s.edges.size()) {
          const auto &e = s.edges[b.cursor++];
          if (e.source >= n || e.target >= n)
            throw std::invalid_argument("invalid synapse");
          ++offset[e.target + 1];
        } else {
          b.cursor = 1;
          b.stage = BuildState::Prefix;
        }
        break;
      case BuildState::Prefix:
        if (b.cursor < offset.size()) {
          offset[b.cursor] += offset[b.cursor - 1];
          ++b.cursor;
        } else {
          b.at = offset;
          b.cursor = 0;
          b.stage = BuildState::Edges;
        }
        break;
      case BuildState::Edges:
        if (b.cursor < s.edges.size()) {
          const auto i = b.cursor++;
          order[b.at[s.edges[i].target]++] = std::uint32_t(i);
        } else {
          b.cursor = 0;
          b.stage = BuildState::Classes;
        }
        break;
      case BuildState::Classes:
        if (b.cursor < n) {
          const auto i = b.cursor++;

          classes[i] = cell_class(s.neurons[i]);
          const bool pacer = classes[i].pace > .5f, mod = classes[i].modulator > .5f;
          namespace G = source_group;
          group[i] = s.neurons[i].role != Role::Nerve ? G::outer
                     : pacer                          ? (mod ? G::modulating_pacer : G::pacer)
                     : mod                            ? G::modulator
                                                      : G::nerve;

        } else {
          b.cursor = 0;
          b.stage = BuildState::SortInputs;
        }
        break;
      case BuildState::SortInputs:
        if (b.cursor < n) {
          const auto t = b.cursor++;
          std::stable_sort(
              order.begin() + offset[t], order.begin() + offset[t + 1],
              [&](auto a, auto z) { return group[s.edges[a].source] < group[s.edges[z].source]; });
        } else {
          cell_gain.assign(n, 0.f);
          cell_fast.assign(n, 1.f);
          cell_sign.assign(n, 0.f);
          nerve_source.assign(n + 1, 0.f);
          cell_driving.assign(n, 0);
          cell_lane.assign(n, -1);
          b.cursor = 0;
          b.stage = BuildState::Traits;
        }
        break;
      case BuildState::Traits:
        if (b.cursor < n) {
          const auto i = b.cursor++;
          b.groups = std::max(b.groups, s.neurons[i].group + 1);

          const auto &cell = s.neurons[i];
          cell_sign[i] = cell.role == Role::Sensor  ? 1.f
                         : cell.role == Role::Nerve ? classes[i].sign
                                                    : 0.f;
          cell_driving[i] = cell.role == Role::Sensor ||
                            (cell.role == Role::Nerve && group[i] == source_group::nerve);
          nerve_source[i] = cell.role == Role::Nerve ? 1.f : 0.f;
          if (cell.functions.sensory() > 0) {
            sensors.push_back(NeuronIndex(i));
            continue;
          }
          (cell.role == Role::Nerve && cell.functional      ? learners
           : cell.role == Role::Effector && cell.functional ? effectors
                                                            : others)
              .push_back(std::uint32_t(i));

        } else {
          group_offset.assign(b.groups + 1, 0);
          b.cursor = 0;
          b.stage = BuildState::GroupCounts;
        }
        break;
      case BuildState::GroupCounts:
        if (b.cursor < n)
          ++group_offset[s.neurons[b.cursor++].group + 1];
        else {
          b.cursor = 1;
          b.stage = BuildState::GroupPrefix;
        }
        break;
      case BuildState::GroupPrefix:
        if (b.cursor < group_offset.size()) {
          group_offset[b.cursor] += group_offset[b.cursor - 1];
          ++b.cursor;
        } else {
          group_cells.resize(n);
          b.at = group_offset;
          b.cursor = 0;
          b.stage = BuildState::GroupCells;
        }
        break;
      case BuildState::GroupCells:
        if (b.cursor < n) {
          const auto i = b.cursor++;
          group_cells[b.at[s.neurons[i].group]++] = std::uint32_t(i);
        } else
          b.stage = BuildState::SortCells;
        break;
      case BuildState::SortCells:
        std::stable_sort(learners.begin(), learners.end(),
                         [&](auto x, auto y) { return capacity_of(x) > capacity_of(y); });
        std::stable_sort(effectors.begin(), effectors.end(), [&](auto x, auto y) {
          return effector_capacity(x) > effector_capacity(y);
        });
        std::stable_sort(others.begin(), others.end(), [&](auto x, auto y) {
          return offset[x + 1] - offset[x] > offset[y + 1] - offset[y];
        });
        b.cursor = 0;
        b.stage = BuildState::Learners;
        break;
      case BuildState::Learners:
        if (b.cursor < learners.size()) {
          const auto start = b.cursor;
          b.cursor += LANES;

          Slice sl;
          sl.lanes = int(std::min<std::size_t>(LANES, learners.size() - start));
          std::array<std::uint32_t, LANES> cell{}, pacer{}, end{};
          for (int l = 0; l < sl.lanes; ++l) {
            const auto c = learners[start + std::size_t(l)];
            const auto &nc = s.neurons[c];
            const auto &k = classes[c];
            cell[l] = c;
            pacer[l] = first(c, source_group::pacer);
            end[l] = offset[c + 1];
            sl.cell[l] = NeuronIndex(c);
            sl.valid[l] = -1;
            sl.nerve[l] = -1;
            sl.born[l] = std::uint16_t(pacer[l] - offset[c]);
            sl.capacity[l] = capacity_of(c);
            sl.work[l] = std::int32_t(2 * (sl.capacity[l] + end[l] - pacer[l]));
            sl.length = std::max<std::uint32_t>(sl.length, sl.capacity[l]);
            sl.extra_length = std::max(sl.extra_length, end[l] - pacer[l]);
            sl.both[l] = std::int32_t(first(c, source_group::modulating_pacer) - pacer[l]);
            sl.modulator[l] = std::int32_t(first(c, source_group::modulator) - pacer[l]);
            sl.bias[l] = nc.bias;
            const float gain = nc.parameters.plasticity < MIN_LEARNING_RATE
                                   ? 0.f
                                   : std::clamp(nc.parameters.plasticity, 0.f, 1.f);
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
            sl.period[l] = std::max(MIN_PACE_PERIOD, tau);
            sl.phase[l] = (nc.x > 0 ? PI_F : 0.) +
                          2 * PI_F *
                              std::fmod(std::abs(nc.x) * PHASE_SALT[0] + nc.y * PHASE_SALT[1] +
                                            nc.z * PHASE_SALT[2],
                                        1.);
            cell_lane[c] = std::int32_t(LANES * slices.size() + std::size_t(l));
            cell_fast[c] = sl.fast[l];
            cell_gain[c] = group[c] == source_group::nerve ? gain : 0.f;
          }
          sl.offset = std::uint32_t(gene.size());
          for (std::uint32_t j = 0; j < sl.length; ++j)
            for (int l = 0; l < LANES; ++l)
              add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                       l < sl.lanes && offset[cell[l]] + j < pacer[l]);
          sl.extra_offset = std::uint32_t(gene.size());
          for (std::uint32_t j = 0; j < sl.extra_length; ++j)
            for (int l = 0; l < LANES; ++l)
              add_slot(l < sl.lanes ? pacer[l] + j : 0, l < sl.lanes && pacer[l] + j < end[l]);
          max_length = std::max({max_length, sl.length, sl.extra_length});
          slices.push_back(sl);

        } else {
          b.cursor = 0;
          b.stage = BuildState::Effectors;
        }
        break;
      case BuildState::Effectors:
        if (b.cursor < effectors.size()) {
          const auto start = b.cursor;
          b.cursor += LANES;

          Slice sl;
          sl.lanes = int(std::min<std::size_t>(LANES, effectors.size() - start));
          std::array<std::uint32_t, LANES> cell{};
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
            for (int l = 0; l < LANES; ++l)
              add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                       l < sl.lanes && offset[cell[l]] + j < offset[cell[l] + 1]);
          max_length = std::max(max_length, sl.length);
          effector_slices.push_back(sl);

        } else {
          b.cursor = 0;
          b.stage = BuildState::Others;
        }
        break;
      case BuildState::Others:
        if (b.cursor < others.size()) {
          const auto start = b.cursor;
          b.cursor += LANES;

          Slice sl;
          sl.lanes = int(std::min<std::size_t>(LANES, others.size() - start));
          std::array<std::uint32_t, LANES> cell{};
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
            for (int l = 0; l < LANES; ++l)
              add_slot(l < sl.lanes ? offset[cell[l]] + j : 0,
                       l < sl.lanes && offset[cell[l]] + j < offset[cell[l] + 1]);
          other_slices.push_back(sl);

        } else
          b.stage = BuildState::Done;
        break;
      case BuildState::Done:
        break;
      }
    }
    if (b.stage != BuildState::Done)
      return false;
    building.reset();
    ready = true;
    return true;
  }
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
Network::Network(std::shared_ptr<const Substrate> s) : tissue(std::move(s)) {
  const auto n = tissue->neurons.size();
  if (n > MAX_NODES)
    throw std::length_error("neuron budget exceeded");
  state_.assign(n, 0.f);
  next_ = state_;
  pulse_ = state_;
  signal_.assign(n + 1, 0.f);
  muted_.assign(n, 0);
  dead_.assign(n, 0);
  synaptic_mean_.assign(n, 0);
  adaptation_rate_.resize(n);
  for (std::size_t i = 0; i < n; ++i)
    adaptation_rate_[i] =
        float(1 / (ADAPTATION_SPAN * time_constant_steps(tissue->neurons[i].parameters)));
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
  const std::size_t slots = t.gene.size(), lanes = LANES * t.slices.size(),
                    effector_lanes = LANES * t.effector_slices.size();
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
    for (int l = 0; l < LANES; ++l) {
      lane_innate_[LANES * s + std::size_t(l)] = t.slices[s].innate[l];
      lane_count_[LANES * s + std::size_t(l)] = t.slices[s].born[l];
    }
  effector_own_.assign(effector_lanes, 0.f);
  effector_innate_.assign(effector_lanes, 0.f);
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s)
    for (int l = 0; l < LANES; ++l) {
      effector_innate_[LANES * s + std::size_t(l)] = t.effector_slices[s].innate[l];
      lane_count_[lanes + LANES * s + std::size_t(l)] = t.effector_slices[s].born[l];
    }
  cell_surprise_.assign(cells() + 1, 0.f);
  usual_.assign(cells(), 0.f);
  deviation_.assign(cells() + 1, 0.f);
  gathered_.assign(LANES * std::size_t(t.max_length), 0.f);
  revision_ = 0;
}
void Network::mute(std::size_t neuron, bool value) {
  muted_.at(neuron) = value;
  if (value) {
    state_[neuron] = next_[neuron] = signal_[neuron] = pulse_[neuron] = 0;
    stimuli_.erase(std::remove_if(stimuli_.begin(), stimuli_.end(),
                                  [&](const auto &s) { return s.neuron == neuron; }),
                   stimuli_.end());
  }
}
void Network::stimulate(std::size_t i, float amount, unsigned steps) {
  if (i >= cells() || !std::isfinite(amount) || amount < 0 || amount > 1 || !steps ||
      steps > max_stimulus_steps)
    throw std::invalid_argument("invalid neural stimulus");
  const auto &n = tissue->neurons[i];
  if (inactive(i) || !n.functional)
    throw std::invalid_argument("only active cells can be stimulated");
  auto it = std::lower_bound(stimuli_.begin(), stimuli_.end(), i,
                             [](const auto &s, auto id) { return s.neuron < id; });
  const bool present = it != stimuli_.end() && it->neuron == i;
  if (amount == 0) {
    if (present)
      stimuli_.erase(it);
    pulse_[i] = 0;
    return;
  } else if (present) {
    it->remaining = steps;
  } else {
    stimuli_.insert(it, {i, steps});
  }
  pulse_[i] = amount;
  signal_[i] = std::max(signal_[i], amount);
  state_[i] = std::max(state_[i], amount);
  next_[i] = state_[i];
}
void Network::stimulate(const std::vector<std::size_t> &neurons, float amount, unsigned steps) {
  if (neurons.empty() || !std::isfinite(amount) || amount < 0 || amount > 1 || !steps ||
      steps > max_stimulus_steps)
    throw std::invalid_argument("invalid organ stimulus");
  auto ids = neurons;
  std::sort(ids.begin(), ids.end());
  ids.erase(std::unique(ids.begin(), ids.end()), ids.end());
  for (auto i : ids)
    if (i >= cells() || inactive(i) || !tissue->neurons[i].functional)
      throw std::invalid_argument("only active cells can be stimulated");
  for (auto i : ids)
    stimulate(i, amount, steps);
}
void Network::clear_stimuli() {
  for (const auto &s : stimuli_)
    pulse_[s.neuron] = 0;
  stimuli_.clear();
}
void Network::refresh_observation() {
  if (!observe)
    return;
  materialize();
  const auto &w = settled();
  observed_contributions.assign(index_.size(), 0.f);
  const auto zero = std::uint16_t(cells());
  for (std::size_t k = 0; k < index_.size(); ++k)
    if (index_[k] != zero && !inactive(index_[k]))
      observed_contributions[k] = signal_[index_[k]] * (gene_[k] + w[k]);
}
void Network::reset() {
  clear_stimuli();
  active_hormones_ = {};
  materialize();
  settled_ready_ = false;
  for (auto *v :
       {&synaptic_mean_, &state_, &next_, &signal_, &pulse_, &trace_, &lane_teach_, &lane_value_,
        &lane_contrast_, &lane_ready_, &lane_step_, &lane_pending_, &cell_surprise_})
    std::fill(v->begin(), v->end(), 0.f);
  observed_contributions.clear();
}
void Network::remove_dead_connections() {
  const auto &t = *topology;
  const auto zero = std::uint16_t(cells());
  auto clear = [&](const NetworkTopology::Slice &sl, std::size_t lane0, bool counted) {
    for (int l = 0; l < sl.lanes; ++l) {
      std::uint16_t count = 0;
      auto block = [&](std::uint32_t base, std::uint32_t length, bool main) {
        for (std::uint32_t j = 0; j < length; ++j) {
          const auto k = base + LANES * j + l;
          const auto src = index_[k];
          if (src != zero && (dead_[sl.cell[l]] || dead_[src])) {
            index_[k] = zero;
            gene_[k] = learned_[k] = trace_[k] = predict_[k] = 0;
          }
          if (main)
            count += index_[k] != zero;
        }
      };
      block(sl.offset, sl.length, true);
      block(sl.extra_offset, sl.extra_length, false);
      if (counted)
        lane_count_[lane0 + l] = count;
    }
  };
  for (std::size_t s = 0; s < t.slices.size(); ++s)
    clear(t.slices[s], LANES * s, true);
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s)
    clear(t.effector_slices[s], LANES * (t.slices.size() + s), true);
  for (const auto &sl : t.other_slices)
    clear(sl, 0, false);
  ++revision_;
  settled_ready_ = false;
}
void Network::reset_learning() {
  materialize();
  reset();
  prepare_state();
  remove_dead_connections();
  learning_ticks = learning_seed = 0;
  learning_summary_ = {};
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
  turnover_rng_ = turnover_rng_ * PCG_MULTIPLIER + PCG_INCREMENT + learning_seed;
  std::uint64_t z = turnover_rng_ ^ (turnover_rng_ >> MIX_SHIFT1);
  z *= SPLITMIX_MIX1;
  z ^= z >> MIX_SHIFT2;
  return unit_center(z);
}
template <class Would>
bool Network::form_synapse(std::size_t lane, bool effector, const Would &would) {
  const auto &t = *topology;
  const auto &s = (effector ? t.effector_slices : t.slices)[lane / LANES];
  const int l = int(lane % LANES);
  const auto target = s.cell[l];
  const auto group = tissue->neurons[target].group;
  if (group + 1 >= tissue->partner_offset.size())
    return false;
  const auto first = tissue->partner_offset[group], last = tissue->partner_offset[group + 1];
  if (first == last || inactive(target))
    return false;
  const auto k = first + std::uint32_t(turnover_unit() * (last - first)) % (last - first);
  const auto &partner = tissue->partners[k];
  if (partner.source + 1 >= t.group_offset.size())
    return false;
  const auto members = t.group_offset[partner.source + 1] - t.group_offset[partner.source];
  if (!members || turnover_unit() >= partner.p)
    return false;
  const auto source = t.group_cells[t.group_offset[partner.source] +
                                    std::uint32_t(turnover_unit() * members) % members];
  if (source == target || !t.cell_driving[source] || inactive(source) || inactive(target))
    return false;
  if (effector && effector_learning_rate(source) == 0)
    return false;
  const auto zero = std::uint16_t(cells());
  std::uint32_t free = UINT32_MAX;
  for (std::uint32_t j = 0; j < s.capacity[l]; ++j) {
    const auto slot = s.offset + LANES * j + std::uint32_t(l);
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
  ++lane_count_[effector ? LANES * t.slices.size() + lane : lane];
  ++revision_;
  return true;
}
float Network::effector_learning_rate(std::size_t source) const {
  if (inactive(source))
    return 0;
  const float gain = topology->cell_gain[source] * (1 + hormone_effect_[Learning][source]);
  return gain >= MIN_LEARNING_RATE ? gain : 0.f;
}
void Network::learn_effectors(float rm) {
  const auto &t = *topology;
  const auto zero = std::uint16_t(cells());
  const float prune_share = PRUNE;
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s) {
    const auto &sl = t.effector_slices[s];
    const std::uint32_t L = sl.occupied_length(index_, zero), base = sl.offset;
    for (int l = 0; l < sl.lanes; ++l) {
      const auto cell = sl.cell[l];
      const auto lane = LANES * s + std::size_t(l);
      if (inactive(cell))
        continue;
      const float own = next_[cell], usual = effector_own_[lane];
      const float dy = own - usual;
      effector_own_[lane] = rm * usual + (1 - rm) * own;
      double e2 = 0, held = 0;
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + LANES * j + std::uint32_t(l);
        const auto src = index_[slot];
        if (src == zero)
          continue;
        if (effector_learning_rate(src) == 0) {
          held += std::abs(double(gene_[slot]) + learned_[slot]);
          continue;
        }
        const float fast = t.cell_fast[src];
        trace_[slot] = fast * trace_[slot] + (1 - fast) * deviation_[src] * dy;
        e2 += double(trace_[slot]) * trace_[slot];
      }
      double total = 0;
      bool changed = false;
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + LANES * j + std::uint32_t(l);
        const auto src = index_[slot];
        if (src == zero || effector_learning_rate(src) == 0)
          continue;
        const float g = gene_[slot];
        float u = learned_[slot];
        const float gain = effector_learning_rate(src);
        u = float(u + gain * cell_surprise_[src] * trace_[slot] / (1 + e2));
        if (g * (g + u) < 0)
          u = -g;
        changed = changed || u != learned_[slot];
        learned_[slot] = u;
        total += std::abs(double(g) + u);
      }
      // The inherited total survives turnover. Paused inputs retain their current share.
      const double available = std::max(0., double(effector_innate_[lane]) - held);
      const auto normalize = [&](double total) {
        if (total <= 0)
          return;
        const double factor = available / total;
        const auto length = sl.occupied_length(index_, zero);
        for (std::uint32_t j = 0; j < length; ++j) {
          const auto slot = base + LANES * j + std::uint32_t(l);
          if (index_[slot] != zero && effector_learning_rate(index_[slot]) > 0)
            learned_[slot] = float((double(gene_[slot]) + learned_[slot]) * factor - gene_[slot]);
        }
      };
      if (changed || total > available)
        normalize(total);
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + LANES * j + std::uint32_t(l);
        if (index_[slot] != zero && effector_learning_rate(index_[slot]) > 0 &&
            std::abs(gene_[slot] + learned_[slot]) < prune_share * sl.unit[l]) {
          index_[slot] = zero;
          gene_[slot] = learned_[slot] = trace_[slot] = predict_[slot] = 0;
          --lane_count_[LANES * t.slices.size() + lane];
          ++revision_;
        }
      }
      if (available > 0 && lane_count_[LANES * t.slices.size() + lane] < sl.capacity[l] &&
          form_synapse(lane, true, [&](std::uint32_t src) {
            return effector_learning_rate(src) * cell_surprise_[src] * (1 - t.cell_fast[src]) *
                   deviation_[src] * dy / (1 + e2);
          })) {
        total = 0;
        const auto length = sl.occupied_length(index_, zero);
        for (std::uint32_t j = 0; j < length; ++j) {
          const auto slot = base + LANES * j + std::uint32_t(l);
          if (index_[slot] != zero && effector_learning_rate(index_[slot]) > 0)
            total += std::abs(double(gene_[slot]) + learned_[slot]);
        }
        normalize(total);
      }
    }
  }
}
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
  for (auto &effect : hormone_effect_)
    effect.resize(n);
  for (std::size_t i = 0; i < n; ++i)
    for (int k = 0; k < HORMONE_EFFECTS; ++k)
      hormone_effect_[k][i] =
          tissue->neurons[i].hormone_receptors[k].response(active_hormones_, maturity_);
  bool died = false;
  for (std::size_t i = 0; i < n; ++i)
    if (!dead_[i] && hormone_effect_[Death][i] > .5f) {
      dead_[i] = 1;
      ++dead_count_;
      state_[i] = next_[i] = pulse_[i] = 0;
      died = true;
    }
  if (died) {
    remove_dead_connections();
    stimuli_.erase(std::remove_if(stimuli_.begin(), stimuli_.end(),
                                  [&](const auto &s) { return inactive(s.neuron); }),
                   stimuli_.end());
  }
  const auto &input = values;
  for (std::size_t i = 0; i < n; ++i)
    signal_[i] = state_[i];
  for (std::size_t j = 0; j < t.sensors.size(); ++j) {
    const auto i = t.sensors[j];
    signal_[i] = std::clamp(input[j], 0.f, 1.f) * (.5f * (1 + hormone_effect_[Output][i]));
  }
  for (const auto &s : stimuli_)
    signal_[s.neuron] = std::max(signal_[s.neuron], pulse_[s.neuron]);
  const bool any_muted =
      std::find(muted_.begin(), muted_.end(), (unsigned char)1) != muted_.end() ||
      std::find(dead_.begin(), dead_.end(), (unsigned char)1) != dead_.end();
  if (any_muted)
    for (std::size_t i = 0; i < n; ++i)
      if (inactive(i))
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
    const std::uint32_t L = sl.occupied_length(index_, zero), base = sl.offset,
                        lane0 = std::uint32_t(LANES * s);
    const float *SG = genes + base;
    float *SW = learned_.data() + base, *ST = trace_.data() + base, *SV = predict_.data() + base;
    I8 live = sl.valid;
    bool muted_lane = false;
    if (any_muted)
      for (int l = 0; l < sl.lanes; ++l)
        if (inactive(sl.cell[l])) {
          live[l] = 0;
          muted_lane = true;
        }
    const F8 cb = load8(lane_action_.data() + lane0), nz = load8(lane_teach_.data() + lane0),
             uo = load8(lane_own_.data() + lane0);
    F8 rs{}, drive{}, teaching{}, rhythm{}, eligibility{}, gain_factor{}, competition{};
    for (int l = 0; l < sl.lanes; ++l) {
      const auto c = sl.cell[l];
      drive[l] = hormone_effect_[Excitation][c];
      teaching[l] = hormone_effect_[Teaching][c];
      rhythm[l] = .5f * (1 + hormone_effect_[Rhythm][c]);
      eligibility[l] = .5f * (1 + hormone_effect_[Eligibility][c]);
      gain_factor[l] = 1 + hormone_effect_[Learning][c];
      competition[l] = .5f * (1 + hormone_effect_[Competition][c]);
      if (sl.pace[l] > 0)
        rs[l] = float(std::sin(sl.phase[l] + 2 * PI_F * double(learning_ticks) / sl.period[l]));
    }
    const F8 modulated_gain = sl.gain * gain_factor;
    const F8 gain = modulated_gain >= splat8(MIN_LEARNING_RATE) ? modulated_gain : F8{};
    const F8 step0 = load8(lane_step_.data() + lane0);
    const I8 pending = load8(lane_pending_.data() + lane0) > splat8(.5f);
    bool any_pending = false;
    for (int l = 0; l < LANES; ++l)
      any_pending = any_pending || pending[l];
    F8 sum = sl.bias + drive + sl.pace * rhythm * rs, acc{}, total{}, change{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = LANES * j;
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
    const I8 scale = pending & (total > splat8(0)) & (innate > splat8(0)) &
                     ((sl.canc <= splat8(0)) | (total > innate));
    bool any_scale = false;
    for (int l = 0; l < LANES; ++l)
      any_scale = any_scale || scale[l];
    const F8 f = scale ? innate / (scale ? total : splat8(1)) : splat8(1);
    F8 synaptic = f * acc;
    sum += synaptic;
    F8 pace{}, modulating{};
    if (sl.extra_length) {
      const float *XG = genes + sl.extra_offset, *XW = learned_.data() + sl.extra_offset;
      for (std::uint32_t j = 0; j < sl.extra_length; ++j) {
        const auto slot = LANES * j;
        const F8 v = gather8(emitted, load_index8(indices + sl.extra_offset + slot)) *
                     (load8(XG + slot) + load8(XW + slot));
        const I8 at = I8{} + std::int32_t(j);
        pace += at < sl.modulator ? v : F8{};
        sum += at < sl.both ? v : F8{};
        synaptic += at < sl.both ? v : F8{};
        modulating += at >= sl.both ? v : F8{};
      }
    }
    F8 output_factor{};
    for (int l = 0; l < sl.lanes; ++l) {
      const auto c = sl.cell[l];
      synaptic_mean_[c] += (synaptic[l] - synaptic_mean_[c]) * adaptation_rate_[c];
      sum[l] -= synaptic_mean_[c];
      output_factor[l] = .5f * (1 + hormone_effect_[Output][c]);
    }
    const F8 out = tanh8(sum) * output_factor;
    for (int l = 0; l < sl.lanes; ++l)
      next_[sl.cell[l]] = live[l] ? out[l] : 0.f;
    store8(lane_ready_.data() + lane0, live ? splat8(1) : F8{});
    if (muted_lane)
      for (std::uint32_t j = 0; j < L; ++j)
        store8(ST + LANES * j, live ? load8(ST + LANES * j) : F8{});
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
          const auto slot = LANES * j;
          const F8 w = load8(SW + slot), g = load8(SG + slot);
          store8(SW + slot, scale ? (g + w) * f - g : w);
        }
      continue;
    }
    const F8 own = out;
    const F8 action = (1 - eligibility) * pace + eligibility * own, teach = teaching + modulating;
    const F8 cb2 = rm * cb + (1 - rm) * action, dpost = action - cb2, ddrive = teach - nz,
             nz2 = rm * nz + (1 - rm) * teach, y = own - uo, uo2 = rm * uo + (1 - rm) * own;
    const F8 fast = learn ? sl.fast : splat8(1), dp = learn ? dpost : F8{};
    const F8 cy = learn ? sl.comp * gain_factor * competition * y : F8{},
             ky = learn ? sl.canc * gain_factor * y : F8{};
    bool competes = false;
    for (int l = 0; l < sl.lanes; ++l)
      competes = competes || cy[l] != 0 || ky[l] != 0;
    F8 prediction{}, x2{}, e2{}, competed{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = LANES * j;
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
    const F8 surprise = learn ? ddrive - prediction : F8{},
             vstep = learn ? gain * surprise / (1 + x2) : F8{};
    for (std::uint32_t j = 0; j < L; ++j) {
      const auto slot = LANES * j;
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
      const auto lane = std::size_t(lane0) + std::size_t(l);
      for (std::uint32_t j = 0; j < L; ++j) {
        const auto slot = base + LANES * j + std::uint32_t(l);
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
    const auto length = sl.occupied_length(index_, zero);
    for (std::uint32_t j = 0; j < length; ++j)
      acc += gather8(emitted, load_index8(indices + sl.offset + LANES * j)) *
             (load8(SG + LANES * j) + load8(SW + LANES * j));
    F8 output_factor{};
    for (int l = 0; l < sl.lanes; ++l) {
      const auto c = sl.cell[l];
      synaptic_mean_[c] += (acc[l] - sl.bias[l] - synaptic_mean_[c]) * adaptation_rate_[c];
      acc[l] += hormone_effect_[Excitation][c] - synaptic_mean_[c];
      output_factor[l] = .5f * (1 + hormone_effect_[Output][c]);
    }
    const F8 out = tanh8(acc) * output_factor;
    for (int l = 0; l < sl.lanes; ++l) {
      const auto i = sl.cell[l];
      next_[i] = any_muted && inactive(i) ? 0.f : out[l];
    }
  }
  if (adapt)
    learn_effectors(rm);
  for (const auto &sl : t.other_slices) {
    const float *SG = genes + sl.offset;
    F8 acc = sl.bias;
    for (std::uint32_t j = 0; j < sl.length; ++j)
      acc += gather8(emitted, load_index8(indices + sl.offset + LANES * j)) * load8(SG + LANES * j);
    F8 output_factor{};
    for (int l = 0; l < sl.lanes; ++l) {
      const auto c = sl.cell[l];
      synaptic_mean_[c] += (acc[l] - sl.bias[l] - synaptic_mean_[c]) * adaptation_rate_[c];
      acc[l] += hormone_effect_[Excitation][c] - synaptic_mean_[c];
      output_factor[l] = .5f * (1 + hormone_effect_[Output][c]);
    }
    const F8 out = tanh8(acc) * output_factor;
    for (int l = 0; l < sl.lanes; ++l) {
      const auto i = sl.cell[l];
      next_[i] = any_muted && inactive(i) ? 0.f : out[l];
    }
  }
  for (const auto i : t.sensors)
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
std::uint64_t Network::work_bound() const {
  materialize();
  return (1 + HORMONE_EFFECTS * HORMONES) * cells() + GENE_WORK * gene_.size();
}
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
      const auto lane = LANES * s + std::size_t(l);
      if (lane_pending_[lane] < .5f)
        continue;
      double total = 0;
      for (std::uint32_t j = 0; j < sl.length; ++j) {
        const auto slot = sl.offset + LANES * j + std::uint32_t(l);
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
          const auto slot = sl.offset + LANES * j + std::uint32_t(l);
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
        const auto slot = base + LANES * j + std::uint32_t(l);
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
                        &synaptic_mean_,
                        &adaptation_rate_,
                        &observed_contributions})
    floats += v->capacity();
  for (const auto &v : hormone_effect_)
    floats += v.capacity();
  return floats * sizeof(float) + stimuli_.capacity() * sizeof(Stimulus) +
         (index_.capacity() + lane_count_.capacity()) * sizeof(std::uint16_t) + muted_.capacity();
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
  materialize();
  const auto precision = out.precision(std::numeric_limits<double>::max_digits10);
  out << "BRAIN019_PACKED " << cells() << ' ' << learned_.size() << ' ' << lane_action_.size()
      << ' ' << effector_own_.size() << ' ' << learning_seed << ' ' << learning_ticks << ' '
      << plasticity_enabled << ' ' << maturity_ << ' ' << turnover_rng_ << ' ' << revision_;
  for (double v : active_hormones_)
    out << ' ' << v;
  out << '\n';
  out.precision(precision);
  write_values(out, std::vector<float>(index_.begin(), index_.end()));
  for (const auto *v :
       {&synaptic_mean_, &gene_,         &state_,       &signal_,        &pulse_,
        &usual_,         &learned_,      &trace_,       &predict_,       &lane_action_,
        &lane_teach_,    &lane_own_,     &lane_value_,  &lane_contrast_, &lane_ready_,
        &lane_step_,     &lane_pending_, &lane_innate_, &effector_own_,  &effector_innate_,
        &cell_surprise_})
    write_values(out, *v);
  write_values(out, as_floats(muted_));
  write_values(out, as_floats(dead_));
  out << "STIMULI " << stimuli_.size();
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
  materialize();
  observed_contributions.clear();
  std::string tag;
  std::size_t neurons = 0, slots = 0, lanes = 0, effector_lanes = 0;
  if (!(in >> tag >> neurons >> slots >> lanes >> effector_lanes >> learning_seed >>
        learning_ticks >> plasticity_enabled >> maturity_ >> turnover_rng_ >> revision_) ||
      tag != "BRAIN019_PACKED" || neurons != cells() || slots != learned_.size() ||
      lanes != lane_action_.size() || effector_lanes != effector_own_.size())
    throw std::runtime_error("invalid brain state");
  for (auto &v : active_hormones_)
    if (!(in >> v) || !std::isfinite(v) || v < 0 || v > 1)
      throw std::runtime_error("invalid hormone state");
  if (in.get() != '\n' || !std::isfinite(maturity_) || maturity_ < 0 || maturity_ > 1)
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
       {&synaptic_mean_, &gene_,         &state_,       &signal_,        &pulse_,
        &usual_,         &learned_,      &trace_,       &predict_,       &lane_action_,
        &lane_teach_,    &lane_own_,     &lane_value_,  &lane_contrast_, &lane_ready_,
        &lane_step_,     &lane_pending_, &lane_innate_, &effector_own_,  &effector_innate_,
        &cell_surprise_})
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
  read_values(in, flags, 1);
  for (std::size_t i = 0; i < cells(); ++i) {
    if (flags[i] != 0 && flags[i] != 1)
      throw std::runtime_error("invalid cell viability");
    dead_[i] = flags[i] != 0;
  }
  dead_count_ = std::count(dead_.begin(), dead_.end(), 1);
  std::size_t count_stimuli;
  if (!(in >> tag >> count_stimuli) || tag != "STIMULI" || count_stimuli > cells())
    throw std::runtime_error("invalid neural stimuli");
  stimuli_.clear();
  std::vector<bool> stimulated(cells(), false);
  for (std::size_t j = 0; j < count_stimuli; ++j) {
    Stimulus s;
    if (!(in >> s.neuron >> s.remaining) || s.neuron >= cells() || !s.remaining ||
        s.remaining > max_stimulus_steps || stimulated[s.neuron] || inactive(s.neuron) ||
        (!stimuli_.empty() && s.neuron <= stimuli_.back().neuron) ||
        !tissue->neurons[s.neuron].functional || pulse_[s.neuron] <= 0 || pulse_[s.neuron] > 1)
      throw std::runtime_error("invalid neural stimulus");
    stimulated[s.neuron] = true;
    stimuli_.push_back(s);
  }
  for (std::size_t i = 0; i < cells(); ++i)
    if (!stimulated[i] && pulse_[i] != 0)
      throw std::runtime_error("untracked neural stimulus");
  if (in.get() != '\n')
    throw std::runtime_error("invalid neural stimuli terminator");
  next_.assign(cells(), 0.f);
  settled_ready_ = false;
  const auto &t = *topology;
  const auto zero = std::uint16_t(cells());
  auto count = [&](const NetworkTopology::Slice &sl, std::size_t lane0) {
    for (int l = 0; l < sl.lanes; ++l) {
      std::uint16_t c = 0;
      for (std::uint32_t j = 0; j < sl.length; ++j)
        c += index_[sl.offset + LANES * j + std::uint32_t(l)] != zero;
      lane_count_[lane0 + std::size_t(l)] = c;
    }
  };
  for (std::size_t s = 0; s < t.slices.size(); ++s)
    count(t.slices[s], LANES * s);
  for (std::size_t s = 0; s < t.effector_slices.size(); ++s)
    count(t.effector_slices[s], LANES * t.slices.size() + LANES * s);
  deviation_.assign(cells() + 1, 0.f);
  for (std::size_t i = 0; i < cells(); ++i)
    deviation_[i] = signal_[i] - usual_[i];
}
}
