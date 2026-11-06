#include "cppn/output_schema.hh"
#include "substrate.hh"
#include "development_sites.hh"
#include "contacts.hh"
#include "mix.hh"
#include <algorithm>
#include <cmath>
#include <map>
#include <limits>
#include <stdexcept>
#include <optional>
namespace field {
int connection_kind(const Neuron &a, const Neuron &b) {
  if (a.role == Role::Effector || b.role == Role::Sensor)
    return -1;
  if (a.role == Role::Sensor)
    return b.role == Role::Nerve ? 0 : -1;
  return b.role == Role::Nerve ? 1 : 2;
}
std::optional<Neuron> site_cell(const cppn::Point &p, const std::array<float, cppn::OUTPUTS> &v,
                                std::uint64_t id, float bias_scale) {
  if (v[cppn::output::expression] <= 0)
    return std::nullopt;
  Neuron n{};
  n.id = id;
  n.location = p;
  for (std::size_t k = 0; k < n.identity.size(); ++k)
    n.identity[k] = v[cppn::output::identity_role + k];
  n.role = n.identity[0] < -1.f / 3  ? Role::Sensor
           : n.identity[0] > 1.f / 3 ? Role::Effector
                                     : Role::Nerve;
  n.variant = n.identity[3] > 0;
  const float a = n.identity[1], b = n.identity[2];
  std::array<float, IDENTITY_CORNERS> corners{(1 - a) * (1 - b) / 4, (1 + a) * (1 - b) / 4,
                                              (1 - a) * (1 + b) / 4, (1 + a) * (1 + b) / 4};
  int corner = int(std::max_element(corners.begin(), corners.end()) - corners.begin());
  int function = development_function(p, n.role, corner, n.variant);
  if (function < 0) {
    float best = -1;
    for (int k = 0; k < IDENTITY_CORNERS; ++k)
      if (corners[k] >= .5f && corners[k] > best &&
          development_function(p, n.role, k, n.variant) >= 0) {
        function = development_function(p, n.role, k, n.variant);
        best = corners[k];
      }
    if (function < 0)
      return std::nullopt;
  }
  n.functions = {};
  n.functions.internal = n.role == Role::Nerve;
  if (n.role == Role::Sensor)
    n.functions.senses[function] = 1;
  if (n.role == Role::Effector)
    n.functions.motors[function] = 1;
  auto unit = [&](std::size_t k) { return std::clamp((v[k] + 1) * .5f, 0.f, 1.f); };
  n.expression = n.strength = std::clamp(v[cppn::output::expression] / .05f, 0.f, 1.f);
  n.bias = -v[cppn::output::threshold] * bias_scale;
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
  return n;
}
std::array<ZoneSpan, cppn::input::zones> zone_spans(const std::vector<Neuron> &neurons) {
  std::array<double, cppn::input::zones> mass{};
  for (const auto &n : neurons)
    mass[n.location.zone] += n.strength * (1 + n.parameters.capacity);
  std::array<double, cppn::input::zones> length{};
  double total = 0;
  for (int z = 0; z < cppn::input::zones; ++z)
    total += (length[z] = std::cbrt(1 + mass[z]));
  std::array<ZoneSpan, cppn::input::zones> spans{};
  double front = 1;
  for (int z = 0; z < cppn::input::zones; ++z) {
    spans[z] = {front, 2 * length[z] / total};
    front -= spans[z].extent;
  }
  return spans;
}
void lay_out_cells(std::vector<Neuron> &neurons) {
  const auto spans = zone_spans(neurons);
  for (auto &n : neurons) {
    const auto &p = n.location;
    const auto &span = spans[p.zone];
    n.x = p.side * p.w * .5f;
    n.y = float(span.front - span.extent * (1 - p.u));
    n.z = (2 * p.v - 1) * .5f;
  }
}
namespace {
class CellCopies {
  const std::vector<Neuron> &groups;
  std::size_t limit, total = 0, cursor = 0, copy = 0;
  enum Stage { Count, Scale, Copy, Done } stage = Count;
  std::vector<int> counts;
  std::vector<Neuron> cells;
  std::vector<std::vector<NeuronIndex>> indices;

public:
  CellCopies(const std::vector<Neuron> &g, std::size_t maximum)
      : groups(g), limit(maximum), counts(g.size(), 1), indices(g.size()) {}
  bool limited() const { return total > limit; }
  bool advance(std::size_t &budget) {
    while (budget && stage != Done) {
      --budget;
      switch (stage) {
      case Count:
        if (cursor < counts.size()) {
          const auto &n = groups[cursor];
          if (n.role != Role::Effector)
            counts[cursor] =
                std::clamp(int(std::lround(CELL_COPIES * n.parameters.capacity * n.expression)), 1,
                           CELL_COPY_LIMIT);
          total += std::size_t(counts[cursor++]);
        } else {
          cells.reserve(std::min(total, limit));
          cursor = 0;
          stage = limited() ? Scale : Copy;
        }
        break;
      case Scale:
        if (cursor < counts.size()) {
          auto &c = counts[cursor++];
          c = std::max(1, int(c * (double(limit) / double(total))));
        } else {
          cursor = 0;
          stage = Copy;
        }
        break;
      case Copy:
        if (cursor < counts.size() && cells.size() < limit) {
          Neuron c = groups[cursor];
          c.strength /= float(counts[cursor]);
          c.id = c.id * CELL_COPY_LIMIT + copy;
          c.group = std::uint32_t(cursor);
          indices[cursor].push_back(NeuronIndex(cells.size()));
          cells.push_back(c);
          if (++copy == std::size_t(counts[cursor])) {
            copy = 0;
            ++cursor;
          }
        } else
          stage = Done;
        break;
      case Done:
        break;
      }
    }
    return stage == Done;
  }
  std::vector<Neuron> take(std::vector<std::vector<NeuronIndex>> &copies) {
    if (stage != Done)
      throw std::logic_error("incomplete cell copies");
    copies = std::move(indices);
    return std::move(cells);
  }
};
}
std::vector<Neuron> cell_copies(const std::vector<Neuron> &groups, std::size_t limit,
                                std::vector<std::vector<NeuronIndex>> &copies, bool &limited) {
  CellCopies builder(groups, limit);
  auto budget = std::numeric_limits<std::size_t>::max();
  builder.advance(budget);
  limited = builder.limited();
  return builder.take(copies);
}
namespace {
struct Candidate {
  std::uint32_t from, to;
  float p;
  float drive;
};
// Connection draws and input selection retain independent, inherited hash streams.
constexpr std::uint64_t CONNECTION_STREAM = 7, SELECTION_STREAM = 8;
constexpr std::uint64_t CONNECTION_HASH_PRIME = 0x100000001b3ull, CONNECTION_HASH_SALT = 0x9e37ull;
class CellGrowth {
  Substrate &owner;
  const std::vector<Candidate> &candidates;
  enum Stage { Copies, Classes, Usable, Partners, Draw, Commit, Done } stage = Copies;
  std::size_t cursor = 0, copy = 0, partner = 0, source_copy = 0;
  CellCopies copier;
  std::vector<std::vector<NeuronIndex>> copies;
  std::vector<Neuron> cells;
  std::vector<CellClass> classes;
  std::vector<std::vector<const Candidate *>> usable;
  struct Option {
    double key;
    NeuronIndex source;
    float weight;
  };
  std::vector<Option> accepted;
  std::vector<Edge> edges;
  double length = 0;
  std::uint64_t hash(std::uint64_t a, std::uint64_t b, std::uint64_t stream) const {
    return splitmix(splitmix(owner.development_seed ^ (a * CONNECTION_HASH_PRIME)) ^
                    splitmix(b + CONNECTION_HASH_SALT * stream));
  }

public:
  CellGrowth(Substrate &o, const std::vector<Candidate> &c)
      : owner(o), candidates(c), copier(o.neurons, std::min(o.options.max_nodes, MAX_NODES)),
        usable(o.neurons.size()) {}
  bool advance(std::size_t &budget) {
    while (budget && stage != Done) {
      --budget;
      switch (stage) {
      case Copies:
        ++budget;
        if (!copier.advance(budget))
          return false;
        if (copier.limited()) {
          owner.resource_limited = true;
          owner.diagnostic = "Technical cell limit";
        }
        cells = copier.take(copies);
        classes.reserve(cells.size());
        stage = Classes;
        break;
      case Classes:
        if (cursor < cells.size()) {
          auto &c = cells[cursor++];
          c.slots = std::uint16_t(
              std::min(input_slots(c), int(std::numeric_limits<std::uint16_t>::max())));
          classes.push_back(cell_class(c));
        } else {
          cursor = 0;
          stage = Usable;
        }
        break;
      case Usable:
        if (cursor < candidates.size()) {
          const auto &c = candidates[cursor++];
          if (!copies[c.from].empty() && !copies[c.to].empty() && c.drive > 0)
            usable[c.to].push_back(&c);
        } else {
          owner.partner_offset.assign(copies.size() + 1, 0);
          owner.partners.clear();
          cursor = partner = 0;
          stage = Partners;
        }
        break;
      case Partners:
        if (cursor < usable.size()) {
          if (partner < usable[cursor].size()) {
            const auto &c = *usable[cursor][partner++];
            owner.partners.push_back({c.from, c.p, c.drive});
          } else {
            owner.partner_offset[++cursor] = std::uint32_t(owner.partners.size());
            partner = 0;
          }
        } else {
          cursor = partner = source_copy = 0;
          stage = Draw;
        }
        break;
      case Draw:
        if (cursor == cells.size()) {
          owner.neurons = std::move(cells);
          owner.edges = std::move(edges);
          owner.built_neurons = owner.neurons.size();
          owner.built_edges = owner.edges.size();
          owner.built_length = length;
          stage = Done;
          break;
        }
        {
          const auto &b = cells[cursor];
          const auto &partners = usable[b.group];
          if (partner < partners.size()) {
            const auto &c = *partners[partner];
            if (source_copy < copies[c.from].size()) {
              const auto source = copies[c.from][source_copy++];
              if (source != cursor &&
                  (c.p >= 1 || unit_center(hash(cells[source].id, b.id, CONNECTION_STREAM)) < c.p))
                accepted.push_back({0, source, classes[source].sign * c.drive});
            } else {
              ++partner;
              source_copy = 0;
            }
          } else {
            const auto keep = std::size_t(b.slots);
            if (accepted.size() > keep) {
              for (auto &a : accepted)
                a.key = unit_center(hash(b.id, cells[a.source].id, SELECTION_STREAM));
              std::nth_element(accepted.begin(), accepted.begin() + keep, accepted.end(),
                               [](const auto &a, const auto &b) { return a.key < b.key; });
              accepted.resize(keep);
            }
            if (edges.size() + accepted.size() > owner.options.max_edges) {
              owner.resource_limited = true;
              owner.diagnostic = "Technical synapse limit";
              accepted.resize(owner.options.max_edges - edges.size());
            }
            copy = 0;
            stage = Commit;
          }
        }
        break;
      case Commit:
        if (copy < accepted.size()) {
          const auto &a = accepted[copy++];
          const auto &b = cells[cursor], &q = cells[a.source];
          edges.push_back({a.source, NeuronIndex(cursor), a.weight});
          length += std::sqrt((q.x - b.x) * (q.x - b.x) + (q.y - b.y) * (q.y - b.y) +
                              (q.z - b.z) * (q.z - b.z));
        } else {
          ++cursor;
          partner = source_copy = 0;
          accepted.clear();
          stage = Draw;
        }
        break;
      case Done:
        break;
      }
    }
    return stage == Done;
  }
};
}
// Fixed zonal sites. Missing groups never renumber their neighbours.
struct Substrate::GridState {
  enum Stage { Prepare, Cells, Receptors, Index, Links, Finalize, Finish, Done } stage = Prepare;
  std::unique_ptr<CellGrowth> growth;
  std::size_t cell = 0, receptor = 0, link = 0, target = 0;
  ContactIndex index;
  std::vector<std::uint32_t> sources;
  bool target_ready = false;
  std::vector<Candidate> candidates;
  std::vector<ContactScale> scales;
  std::vector<std::pair<std::size_t, int>> receptors;
};
namespace {
constexpr std::size_t BODY = std::numeric_limits<std::size_t>::max();
}
struct Substrate::GridDevelopment {
  Substrate &owner;
  GridState &s;
  std::size_t budget;
  bool record_work;
  std::array<cppn::Point, cppn::BATCH> points{};
  std::array<std::array<float, cppn::OUTPUTS>, cppn::BATCH> values{};
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
    auto made = site_cell(p, v, id + 1, owner.options.bias_scale);
    if (!made)
      return;
    Neuron n = *made;
    n.group = std::uint32_t(owner.neurons.size());
    owner.neurons.push_back(n);
    owner.built_neurons = owner.neurons.size();
  }
  void geometry() { lay_out_cells(owner.neurons); }
  bool run() {
    while (s.stage != GridState::Done) {
      if (s.stage == GridState::Prepare) {
        if (!owner.combined->prepare(budget))
          return false;
        if (!owner.program)
          owner.program =
              std::make_shared<cppn::Program>(*owner.combined, cppn::Preparation::Deferred);
        if (!owner.program->prepare(budget))
          return false;
        s.stage = GridState::Cells;
        return false;
      }
      if (s.stage == GridState::Cells) {
        if (s.cell == DEVELOPMENT_SITES) {
          geometry();
          if (owner.geometry_builder)
            owner.geometry_builder(owner);
          for (std::size_t i = 0; i < owner.neurons.size(); ++i)
            for (int effect = 0; effect < HORMONE_EFFECTS; ++effect)
              if (hormone_effect_present(owner.neurons[i].role, effect))
                s.receptors.push_back({i, effect});
          s.receptors.push_back({BODY, GROWTH_RECEPTOR});
          s.stage = GridState::Receptors;
          continue;
        }
        if (!budget)
          return false;
        const auto n = std::min({cppn::BATCH, budget, DEVELOPMENT_SITES - s.cell});
        for (std::size_t k = 0; k < n; ++k)
          points[k] = development_site(s.cell + k);
        evaluate(n);
        for (std::size_t k = 0; k < n; ++k)
          cell(points[k], values[k], s.cell + k);
        s.cell += n;
        continue;
      }
      if (s.stage == GridState::Receptors) {
        if (s.receptor == s.receptors.size()) {
          s.scales.reserve(owner.neurons.size());
          s.stage = GridState::Index;
          continue;
        }
        if (!budget)
          return false;
        const auto count = std::min({cppn::BATCH, budget, s.receptors.size() - s.receptor});
        for (std::size_t j = 0; j < count; ++j) {
          const auto cell = s.receptors[s.receptor + j].first;
          points[j] = cell == BODY ? GROWTH_RECEPTOR_SITE : owner.neurons[cell].location;
          points[j].effect = receptor_effect_code(s.receptors[s.receptor + j].second);
        }
        constexpr unsigned mask = cppn::output::receptor_mask;
        evaluate(count, mask);
        for (std::size_t j = 0; j < count; ++j) {
          const auto &v = values[j];
          const auto [cell, query] = s.receptors[s.receptor + j];
          auto &r =
              cell == BODY ? owner.growth_receptor : owner.neurons[cell].hormone_receptors[query];
          r.affinity =
              hormone_affinity<REGULATORS>(v[cppn::output::quality1], v[cppn::output::quality2],
                                           (v[cppn::output::quality_width] + 1) * .5f);
          r.baseline = v[cppn::output::capacity];
          r.sensitivity = HORMONE_SENSITIVITY_SPAN * v[cppn::output::field_width];
          r.steepness = int(std::lround(HORMONE_STEEPNESS_STEPS *
                                        std::clamp(v[cppn::output::time_constant], 0.f, 1.f)));
          r.half = float(HORMONE_HALF_MIN * std::pow(HORMONE_HALF_MAX / HORMONE_HALF_MIN,
                                                     (v[cppn::output::threshold] + 1) * .5));
        }
        s.receptor += count;
        continue;
      }
      if (s.stage == GridState::Index) {
        while (s.scales.size() < owner.neurons.size() && budget) {
          const auto i = s.scales.size();
          const auto &cell = owner.neurons[i];
          s.scales.emplace_back(cell);
          s.index.add(cell, std::uint32_t(i));
          --budget;
        }
        if (s.scales.size() < owner.neurons.size())
          return false;
        s.stage = GridState::Links;
      }
      if (s.stage == GridState::Links) {
        const auto count = owner.neurons.size();
        while (s.target < count && budget) {
          const auto &b = owner.neurons[s.target];
          if (!s.target_ready) {
            s.index.candidates(b, s.scales[s.target], count, s.sources);
            s.link = 0;
            s.target_ready = true;
            --budget;
          }
          while (s.link < s.sources.size() && budget) {
            const auto from = s.sources[s.link++];
            --budget;
            ++owner.pair_checks_;
            const auto contact = contact_parameters(owner.neurons[from], b, owner.body_length,
                                                    s.scales[from], s.scales[s.target]);
            if (contact.probability > 0)
              s.candidates.push_back({from, std::uint32_t(s.target), float(contact.probability),
                                      float(contact.affinity)});
          }
          if (s.link == s.sources.size()) {
            ++s.target;
            s.target_ready = false;
          }
        }
        if (s.target < count)
          return false;
        s.stage = GridState::Finalize;
        // Yield before the population scheduler grants this expensive finalization.
        return false;
      }
      if (!budget)
        return false;
      if (s.stage == GridState::Finalize) {
        if (!s.growth)
          s.growth = std::make_unique<CellGrowth>(owner, s.candidates);
        if (!s.growth->advance(budget))
          return false;
        s.growth.reset();
        s.candidates.clear();
        s.stage = GridState::Finish;
      }
      if (!owner.finish_development(budget))
        return false;
      s.stage = GridState::Done;
    }
    return true;
  }
};
bool Substrate::advance_grid(std::size_t budget, bool record_work) {
  if (!grid_state) {
    grid_state = std::make_shared<GridState>();
  }
  GridDevelopment work{*this, *grid_state, budget, record_work};
  const auto queries_before = queries, pairs_before = pair_checks_;
  const bool done = work.run();
  overhead_work_ +=
      budget - work.budget - (queries - queries_before) - (pair_checks_ - pairs_before);
  return done;
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
bool Substrate::pending_preparation() const {
  return !grid_state || grid_state->stage == GridState::Prepare;
}
bool Substrate::pending_finalization() const {
  return grid_state &&
         (grid_state->stage == GridState::Finalize || grid_state->stage == GridState::Finish);
}
std::size_t Substrate::remaining_queries(std::size_t estimate) const {
  if (!grid_state)
    return estimate;
  const auto &s = *grid_state;
  if (s.stage == GridState::Prepare)
    return estimate;
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
  if (!combined)
    throw std::logic_error("planned cells do not develop");
  return advance_grid(budget, record_work);
}
}
