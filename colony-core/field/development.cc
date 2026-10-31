#include "cppn/output_schema.hh"
#include "substrate.hh"
#include <algorithm>
#include <cmath>
#include <atomic>
#include <thread>
#include <mutex>
#include <exception>
#include <map>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <limits>
#include <cstring>
#include <stdexcept>
#include <numeric>
namespace field {
// Senses only send, effectors only receive: no sensory cell reaches an effector directly.
int connection_kind(const Neuron &a, const Neuron &b) {
  if (a.role == Role::Effector || b.role == Role::Sensor)
    return -1;
  if (a.role == Role::Sensor)
    return b.role == Role::Nerve ? 0 : -1;
  return b.role == Role::Nerve ? 1 : 2;
}
namespace {
// A possible synapse between two groups after the CPPN stages.
struct Candidate {
  std::uint32_t from, to;
  float p;
  float drive; // binding strength: how strongly the source group drives the target group
};
std::uint64_t splitmix(std::uint64_t z) {
  z += 0x9e3779b97f4a7c15ull;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ull;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebull;
  return z ^ (z >> 31);
}
double unit_of(std::uint64_t h) {
  return (double(h >> 11) + .5) / 9007199254740992.;
}
constexpr int MAX_COPIES = 16, EFFECTOR_SLOTS = 32;
constexpr float SLOTS_MIN = 4, SLOTS_RANGE = 128;
void grow_cells(Substrate &o, const std::vector<Candidate> &candidates) {
  const auto &old = o.neurons;
  auto draw = [](std::uint64_t seed, std::uint64_t a, std::uint64_t b, std::uint64_t c) {
    return splitmix(splitmix(seed ^ (a * 0x100000001b3ull)) ^ splitmix(b + 0x9e37ull * c));
  };
  auto hash = [&](std::uint64_t a, std::uint64_t b, std::uint64_t c = 0) {
    return draw(o.development_seed, a, b, c);
  };
  std::vector<int> counts(old.size(), 1);
  std::size_t total_cells = 0;
  for (std::size_t i = 0; i < old.size(); ++i) {
    if (old[i].role != Role::Effector)
      counts[i] = std::clamp(int(std::lround(16 * old[i].parameters.capacity * old[i].expression)),
                             1, MAX_COPIES);
    total_cells += std::size_t(counts[i]);
  }
  const std::size_t cell_limit = std::min<std::size_t>(o.options.max_nodes, 65535);
  if (total_cells > cell_limit) {
    o.resource_limited = true;
    o.diagnostic = "Technical cell limit";
    const double f = double(cell_limit) / double(total_cells);
    for (auto &c : counts)
      c = std::max(1, int(c * f));
  }
  std::vector<Neuron> cells;
  std::vector<std::vector<NeuronIndex>> copies(old.size());
  for (std::size_t i = 0; i < old.size(); ++i) {
    const auto &n = old[i];
    const int count = counts[i];
    for (int k = 0; k < count; ++k) {
      if (cells.size() >= cell_limit)
        break;
      Neuron c = n;
      const std::uint64_t group = n.id;
      c.strength = n.strength / float(count);
      c.id = group * MAX_COPIES + std::uint64_t(k); // stable: grid cell and copy number
      c.group = std::uint32_t(i);
      copies[i].push_back(NeuronIndex(cells.size()));
      cells.push_back(c);
    }
  }
  std::vector<int> slots(cells.size(), 0);
  for (std::size_t i = 0; i < cells.size(); ++i) {
    const auto &c = cells[i];
    slots[i] =
        c.role == Role::Effector ? EFFECTOR_SLOTS
        : c.role == Role::Nerve
            ? int(std::lround(SLOTS_MIN *
                              std::pow(SLOTS_RANGE, std::clamp(c.parameters.dendrites, 0.f, 1.f))))
            : 0;
  }
  for (std::size_t i = 0; i < cells.size(); ++i)
    cells[i].slots = std::uint16_t(std::min(slots[i], 65535));
  std::vector<CellClass> classes(cells.size());
  for (std::size_t i = 0; i < cells.size(); ++i)
    classes[i] = cell_class(cells[i]);
  // usable partner groups per target group (the same for all its copies: they share the genes)
  std::vector<std::vector<const Candidate *>> usable(old.size());
  for (const auto &c : candidates) {
    if (copies[c.from].empty() || copies[c.to].empty() || c.drive <= 0)
      continue;
    usable[c.to].push_back(&c);
  }
  o.partner_offset.assign(old.size() + 1, 0);
  o.partners.clear();
  for (std::size_t t = 0; t < old.size(); ++t) {
    for (const auto *c : usable[t])
      o.partners.push_back({c->from, c->p, c->drive});
    o.partner_offset[t + 1] = std::uint32_t(o.partners.size());
  }
  std::vector<Edge> edges;
  double length = 0;
  struct Option {
    double key;
    NeuronIndex source;
    float weight;
  };
  // Every target cell draws its inputs independently from seeded hashes, so the cells can be
  // drawn in parallel. The synapse limit and the edge order are applied afterwards in cell
  // order, exactly as a serial pass would.
  std::vector<std::vector<Option>> drawn(cells.size());
  auto draw_inputs = [&](std::size_t first, std::size_t last) {
    for (std::size_t t = first; t < last; ++t)
      for (auto target : copies[t]) {
        const auto &b = cells[target];
        auto &accepted = drawn[target];
        for (const auto *c : usable[t]) {
          // A draw in (0, 1) always passes p >= 1.
          const bool certain = c->p >= 1;
          for (auto source : copies[c->from]) {
            if (source == target || (!certain && unit_of(hash(cells[source].id, b.id, 7)) >= c->p))
              continue;
            accepted.push_back({0, source, classes[source].sign * c->drive});
          }
        }
        const auto keep = std::size_t(slots[target]);
        if (accepted.size() > keep) {
          // The selection key only matters when there are more inputs than slots.
          for (auto &a : accepted)
            a.key = unit_of(hash(b.id, cells[a.source].id, 8));
          std::nth_element(accepted.begin(), accepted.begin() + keep, accepted.end(),
                           [](const auto &a, const auto &b) { return a.key < b.key; });
          accepted.resize(keep);
        }
      }
  };
  const std::size_t workers =
      cells.size() >= 512 ? std::size_t(std::clamp(o.options.workers, 1, 64)) : 1;
  if (workers == 1)
    draw_inputs(0, old.size());
  else {
    // Contiguous ranges of groups with about the same number of cells.
    std::vector<std::size_t> bounds{0};
    const std::size_t share = (cells.size() + workers - 1) / workers;
    std::size_t counted = 0;
    for (std::size_t t = 0; t < old.size() && bounds.size() < workers; ++t) {
      counted += copies[t].size();
      if (counted >= share * bounds.size())
        bounds.push_back(t + 1);
    }
    while (bounds.size() <= workers)
      bounds.push_back(old.size());
    std::vector<std::thread> threads;
    std::exception_ptr failure;
    std::mutex failure_lock;
    for (std::size_t w = 1; w < workers; ++w)
      threads.emplace_back([&, w] {
        try {
          draw_inputs(bounds[w], bounds[w + 1]);
        } catch (...) {
          std::lock_guard<std::mutex> guard(failure_lock);
          failure = std::current_exception();
        }
      });
    draw_inputs(bounds[0], bounds[1]);
    for (auto &thread : threads)
      thread.join();
    if (failure)
      std::rethrow_exception(failure);
  }
  for (std::size_t t = 0; t < old.size(); ++t)
    for (auto target : copies[t]) {
      const auto &b = cells[target];
      auto &accepted = drawn[target];
      if (edges.size() + accepted.size() > o.options.max_edges) {
        o.resource_limited = true;
        o.diagnostic = "Technical synapse limit";
        accepted.resize(o.options.max_edges - edges.size());
      }
      for (const auto &a : accepted) {
        edges.push_back({a.source, target, a.weight});
        const auto &q = cells[a.source];
        length += std::sqrt((q.x - b.x) * (q.x - b.x) + (q.y - b.y) * (q.y - b.y) +
                            (q.z - b.z) * (q.z - b.z));
      }
      std::vector<Option>().swap(accepted);
    }
  o.neurons = std::move(cells);
  o.edges = std::move(edges);
  o.built_neurons = o.neurons.size();
  o.built_edges = o.edges.size();
  o.built_length = length;
}
}
// Fixed zonal sites. Missing groups never renumber their neighbours.
struct Substrate::GridState {
  enum Stage { Cells, Receptors, Links, Finalize, Done } stage = Cells;
  std::size_t cell = 0, receptor = 0, link = 0;
  std::vector<Candidate> candidates;
  std::vector<std::pair<std::size_t, int>> receptors;
};
namespace {
cppn::Point site(std::size_t index) {
  constexpr int sizes[4][3] = {{4, 3, 2}, {4, 4, 3}, {4, 4, 3}, {5, 4, 3}};
  for (int zone = 0; zone < 4; ++zone) {
    const auto &n = sizes[zone];
    const std::size_t count = 2 * n[0] * n[1] * n[2];
    if (index >= count) {
      index -= count;
      continue;
    }
    const float side = index % 2 ? 1 : -1;
    index /= 2;
    const float w = float(index % n[2]) / (n[2] - 1);
    index /= n[2];
    const float v = float(index % n[1]) / (n[1] - 1);
    index /= n[1];
    return {zone, float(index) / (n[0] - 1), v, w, side, 0};
  }
  throw std::out_of_range("cell site");
}
int function_at(const cppn::Point &p, Role role, int corner, int variant) {
  const bool surface = 1 - std::max(p.w, std::abs(2 * p.v - 1)) < .5f;
  if (role == Role::Nerve)
    return 0;
  if (role == Role::Sensor) {
    if (corner == 0)
      return p.zone == 1 ? (variant ? Proximity : Light) : -1;
    if (corner == 1)
      return surface ? 2 : -1;
    if (corner == 2)
      return surface ? 1 : p.zone == 0 ? -1 : p.zone == 1 ? 10 : 5;
    return variant ? 6 : surface ? 3 : 9;
  }
  if (corner == 0) {
    constexpr int muscle[4] = {Aggression, Suction, Turn, Forward};
    return muscle[p.zone];
  }
  if (corner == 1)
    return surface ? Defense : -1;
  if (corner == 3)
    return surface ? Pigment : -1;
  return p.zone == 0 ? -1 : p.zone == 1 ? Gland : p.zone == 2 ? Bladder : variant ? Sperm : Eggs;
}
}
struct Substrate::GridDevelopment {
  Substrate &owner;
  GridState &s;
  std::size_t budget;
  bool record_work;
  std::array<cppn::Point, 64> points{};
  std::array<std::array<float, cppn::OUTPUTS>, 64> values{};
  void evaluate(std::size_t n, unsigned mask = cppn::ALL_OUTPUTS) {
    if (owner.program->safe() && !owner.options.reference_development)
      owner.program->evaluate(points.data(), n, mask, values, record_work);
    else
      for (std::size_t i = 0; i < n; ++i) {
        const auto &v = owner.combined->query_view(points[i]);
        std::copy(v.begin(), v.end(), values[i].begin());
      }
    budget -= n;
    owner.queries += n;
  }
  void cell(const cppn::Point &p, const std::array<float, cppn::OUTPUTS> &v, std::size_t id) {
    if (v[cppn::output::expression] <= 0)
      return;
    Neuron n{};
    n.id = id + 1;
    n.location = p;
    for (int k = 0; k < 5; ++k)
      n.identity[k] = v[cppn::output::identity_role + k];
    n.role = n.identity[0] < -1.f / 3  ? Role::Sensor
             : n.identity[0] > 1.f / 3 ? Role::Effector
                                       : Role::Nerve;
    n.variant = n.identity[3] > 0;
    const float a = n.identity[1], b = n.identity[2];
    std::array<float, 4> corners{(1 - a) * (1 - b) / 4, (1 + a) * (1 - b) / 4,
                                 (1 - a) * (1 + b) / 4, (1 + a) * (1 + b) / 4};
    int corner = int(std::max_element(corners.begin(), corners.end()) - corners.begin());
    int function = function_at(p, n.role, corner, n.variant);
    if (function < 0) {
      float best = -1;
      for (int k = 0; k < 4; ++k)
        if (corners[k] >= .5f && corners[k] > best && function_at(p, n.role, k, n.variant) >= 0) {
          function = function_at(p, n.role, k, n.variant);
          best = corners[k];
        }
      if (function < 0)
        return;
    }
    n.functions = {};
    n.functions.internal = n.role == Role::Nerve;
    if (n.role == Role::Sensor)
      n.functions.senses[function] = 1;
    if (n.role == Role::Effector)
      n.functions.motors[function] = 1;
    auto unit = [&](std::size_t k) { return std::clamp((v[k] + 1) * .5f, 0.f, 1.f); };
    n.expression = n.strength = std::clamp(v[cppn::output::expression] / .05f, 0.f, 1.f);
    n.bias = -v[cppn::output::threshold] * owner.options.bias_scale;
    n.parameters.threshold = unit(cppn::output::threshold);
    n.parameters.capacity = unit(cppn::output::capacity);
    n.parameters.quality1 = v[cppn::output::quality1];
    n.parameters.quality2 = v[cppn::output::quality2];
    n.parameters.quality_width = unit(cppn::output::quality_width);
    n.parameters.field_width = n.parameters.dendrites = unit(cppn::output::field_width);
    n.parameters.plasticity = unit(cppn::output::quality_width);
    n.parameters.time_constant = unit(cppn::output::time_constant);
    n.sender = {v[cppn::output::sender1], v[cppn::output::sender2]};
    n.receiver = {v[cppn::output::receiver1], v[cppn::output::receiver2]};
    n.search_width = unit(cppn::output::search_width);
    n.crossing = v[cppn::output::crossing];
    n.range = unit(cppn::output::range);
    n.group = std::uint32_t(owner.neurons.size());
    owner.neurons.push_back(n);
    owner.built_neurons = owner.neurons.size();
  }
  void geometry() {
    std::array<double, 4> mass{};
    for (const auto &n : owner.neurons)
      mass[n.location.zone] += n.strength * (1 + n.parameters.capacity);
    // Geometric zone lengths follow their contents, with a finite anatomical scaffold.
    std::array<double, 4> length{};
    double total = 0;
    for (int z = 0; z < 4; ++z)
      total += (length[z] = std::cbrt(1 + mass[z]));
    double front = 1;
    for (int z = 0; z < 4; ++z) {
      const double extent = 2 * length[z] / total;
      for (auto &n : owner.neurons)
        if (n.location.zone == z) {
          const auto &p = n.location;
          n.x = p.side * p.w * .5f;
          n.y = float(front - extent * (1 - p.u));
          n.z = (2 * p.v - 1) * .5f;
        }
      front -= extent;
    }
  }
  bool run() {
    while (s.stage != GridState::Done) {
      if (s.stage == GridState::Cells) {
        if (s.cell == DEVELOPMENT_SITES) {
          geometry();
          if (owner.geometry_builder)
            owner.geometry_builder(owner);
          for (std::size_t i = 0; i < owner.neurons.size(); ++i)
            for (int effect = 0; effect < HORMONE_EFFECTS; ++effect) {
              const auto role = owner.neurons[i].role;
              if (effect == Output || effect == Death || role == Role::Nerve ||
                  (role == Role::Effector && effect == Excitation))
                s.receptors.push_back({i, effect});
            }
          s.stage = GridState::Receptors;
          continue;
        }
        if (!budget)
          return false;
        const auto n = std::min({std::size_t(64), budget, DEVELOPMENT_SITES - s.cell});
        for (std::size_t k = 0; k < n; ++k)
          points[k] = site(s.cell + k);
        evaluate(n);
        for (std::size_t k = 0; k < n; ++k)
          cell(points[k], values[k], s.cell + k);
        s.cell += n;
        continue;
      }
      if (s.stage == GridState::Receptors) {
        if (s.receptor == s.receptors.size()) {
          s.stage = GridState::Links;
          continue;
        }
        if (!budget)
          return false;
        const auto count = std::min({std::size_t(64), budget, s.receptors.size() - s.receptor});
        for (std::size_t j = 0; j < count; ++j) {
          points[j] = owner.neurons[s.receptors[s.receptor + j].first].location;
          points[j].effect = float(1 + s.receptors[s.receptor + j].second) / 7;
        }
        constexpr unsigned mask = cppn::output::receptor_mask;
        evaluate(count, mask);
        for (std::size_t j = 0; j < count; ++j) {
          const auto &v = values[j];
          auto &r = owner.neurons[s.receptors[s.receptor + j].first]
                        .hormone_receptors[s.receptors[s.receptor + j].second];
          r.affinity =
              hormone_affinity<REGULATORS>(v[cppn::output::quality1], v[cppn::output::quality2],
                                           (v[cppn::output::quality_width] + 1) * .5f);
          r.baseline = v[cppn::output::capacity];
          r.sensitivity = v[cppn::output::field_width];
          r.half = float(HORMONE_HALF_MIN * std::pow(HORMONE_HALF_MAX / HORMONE_HALF_MIN,
                                                     (v[cppn::output::threshold] + 1) * .5));
        }
        s.receptor += count;
        continue;
      }
      if (s.stage == GridState::Links) {
        const auto count = owner.neurons.size();
        while (s.link < count * count && budget) {
          const auto from = s.link / count, to = s.link % count;
          ++s.link;
          ++owner.pair_checks_;
          --budget;
          const auto &a = owner.neurons[from], &b = owner.neurons[to];
          if (connection_kind(a, b) < 0)
            continue;
          const double dx = a.sender[0] - b.receiver[0], dy = a.sender[1] - b.receiver[1],
                       sigma = .03 * std::pow(2 / .03, b.search_width),
                       mu = std::exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)),
                       distance = std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) +
                                            (a.z - b.z) * (a.z - b.z)) /
                                  owner.body_length,
                       side = a.x == 0 || b.x == 0
                                  ? 1
                                  : std::clamp(1 + (a.x * b.x < 0 ? 1 : -1) * double(a.crossing),
                                               0., 1.),
                       p = mu * side * std::exp(-distance / (.1 + .9 * a.range));
          if (p > 0)
            s.candidates.push_back({std::uint32_t(from), std::uint32_t(to), float(p), float(mu)});
        }
        if (s.link < count * count)
          return false;
        s.stage = GridState::Finalize;
        // Yield before the population scheduler grants this expensive finalization.
        return false;
      }
      if (!budget)
        return false;
      grow_cells(owner, s.candidates);
      owner.finish_development();
      s.candidates.clear();
      s.stage = GridState::Done;
    }
    return true;
  }
};
bool Substrate::advance_grid(std::size_t budget, bool record_work) {
  if (!grid_state) {
    grid_state = std::make_shared<GridState>();
    program = std::make_shared<cppn::Program>(*combined);
  }
  return GridDevelopment{*this, *grid_state, budget, record_work}.run();
}
bool Substrate::connections_pending() const {
  return grid_state && grid_state->stage == GridState::Links;
}
bool Substrate::cell_parameters_complete() const {
  return grid_state && grid_state->stage >= GridState::Receptors;
}
bool Substrate::anatomy_complete() const {
  return cell_parameters_complete();
}
bool Substrate::pending_finalization() const {
  return grid_state && grid_state->stage == GridState::Finalize;
}
std::size_t Substrate::remaining_queries(std::size_t estimate) const {
  if (!grid_state)
    return estimate;
  const auto &s = *grid_state;
  return s.stage == GridState::Cells       ? DEVELOPMENT_SITES - s.cell
         : s.stage == GridState::Receptors ? s.receptors.size() - s.receptor
                                           : 0;
}
void Substrate::abort_development(const std::string &reason) {
  resource_limited = true;
  diagnostic = reason;
  if (grid_state)
    grid_state->stage = GridState::Done;
}
bool Substrate::advance_development(std::size_t budget, bool record_work) {
  return advance_grid(budget, record_work);
}
}
