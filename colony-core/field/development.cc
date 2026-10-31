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
double normal_of(std::uint64_t h) {
  return std::sqrt(-2 * std::log(unit_of(h))) *
         std::cos(2 * 3.14159265358979323846 * unit_of(splitmix(h)));
}
// Connection expression alone determines affinity. Neighbouring groups share a region
// when all four markers differ by less than REGION_STEP.
constexpr float AFFINITY_WIDTH = .05f, REGION_STEP = .2f;
float affinity(float expression) {
  return std::clamp(expression / AFFINITY_WIDTH, 0.f, 1.f);
}
float vertex(float below, float middle, float above, float h) {
  const float curvature = below - 2 * middle + above;
  return std::abs(curvature) < 1e-9f ? 0.f
                                     : std::clamp(h * (below - above) / (2 * curvature), -h, h);
}
int side_of(const Neuron &n) {
  return n.x < 0 ? 0 : n.x > 0 ? 2 : 1;
}
// Cells of the groups and their synapses:
// - a sensory or nerve group becomes round(POPULATION x capacity) cells (1..MAX_COPIES); an
// effector
//   group stays one cell (its force is the group's; every copy would only cost synapses). All
//   copies share the expression strength of their group, so organ sizes and the brain's tissue stay
//   a property of the group (more cells = denser tissue, not a bigger head). Each copy gets its own
//   small jitter of position (side and depth sign kept), nerve cells also of bias (individual
//   variation). At most options.max_nodes cells (counts scaled down);
// - input slots as a cell-type property: a nerve cell takes up to round(4 x 128^d) inputs, d its
//   "dendrites" parameter, i.e. 4..512; an effector 32. All slots of a brain together at most
//   options.max_edges (scaled down);
// - per target cell its slots are shared among the partner groups in proportion to their binding
//   strength (largest remainders; equal remainders by the development seed); within a group every
//   cell is drawn with probability p (overabundant), from those the cell keeps the allotted number
//   at random (development seed);
// - strength = sign of the source cell (sensory +, nerve by its class) x resource of the target x
//   share of the partner group / number of synapses from that group. The resource of a cell is its
//   gain (the mean binding strength of its possible partner groups) x sqrt(number of its synapses);
// - modulatory cells connect only to plastic nerve cells (they teach, they do not drive);
// - the possible partner groups of every group are kept for the formation of new synapses.
// Random draws: structural ones from the inherited development seed, the individual variation from
// the newborn's variation seed, both with the stable cell identities.
constexpr float POPULATION = 8;
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
  auto vary = [&](std::uint64_t a, std::uint64_t b, std::uint64_t c) {
    return draw(o.variation_seed, a, b, c);
  };
  std::vector<int> counts(old.size(), 1);
  std::size_t total_cells = 0;
  for (std::size_t i = 0; i < old.size(); ++i) {
    if (old[i].role != Role::Effector)
      counts[i] =
          std::clamp(int(std::lround(old[i].parameters.capacity * POPULATION)), 1, MAX_COPIES);
    total_cells += std::size_t(counts[i]);
  }
  const std::size_t cell_limit = std::min<std::size_t>(o.options.max_nodes, 65535);
  if (total_cells > cell_limit) {
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
      const float half = .5f / float(1 << o.options.depth);
      const std::uint64_t group = n.id;
      const float x = n.x + half * float(normal_of(vary(group, k, 1))) * .5f;
      c.x = n.x < 0 ? std::clamp(x, -1.f, -1e-3f) : n.x > 0 ? std::clamp(x, 1e-3f, 1.f) : 0.f;
      c.y = std::clamp(n.y + half * float(normal_of(vary(group, k, 2))) * .5f, -1.f, 1.f);
      const float z = n.z + half * float(normal_of(vary(group, k, 3))) * .5f;
      c.z = n.z < 0 ? std::clamp(z, -1.f, -1e-3f) : std::clamp(z, 0.f, 1.f);
      if (n.role == Role::Nerve)
        c.bias = n.bias + .05f * float(normal_of(vary(group, k, 5)));
      c.strength = n.strength / float(count);
      c.id = group * MAX_COPIES + std::uint64_t(k); // stable: grid cell and copy number
      c.group = std::uint32_t(i);
      copies[i].push_back(NeuronIndex(cells.size()));
      cells.push_back(c);
    }
  }
  std::vector<int> slots(cells.size(), 0);
  double total_slots = 0;
  for (std::size_t i = 0; i < cells.size(); ++i) {
    const auto &c = cells[i];
    slots[i] =
        c.role == Role::Effector ? EFFECTOR_SLOTS
        : c.role == Role::Nerve
            ? int(std::lround(SLOTS_MIN *
                              std::pow(SLOTS_RANGE, std::clamp(c.parameters.dendrites, 0.f, 1.f))))
            : 0;
    total_slots += slots[i];
  }
  if (total_slots > double(o.options.max_edges)) {
    const double f = double(o.options.max_edges) / total_slots;
    for (auto &v : slots)
      if (v > 0)
        v = std::max(1, int(v * f));
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
    const bool plastic_target =
        old[c.to].role == Role::Nerve && old[c.to].parameters.plasticity > 0;
    if (classes[copies[c.from][0]].modulator > .5f && !plastic_target)
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
  struct Option {
    double key;
    NeuronIndex source;
  };
  // Scratch storage shared by all target cells; only sizes change between them.
  struct Remainder {
    double fraction;
    std::uint64_t tie;
    std::size_t group;
  };
  struct Chosen {
    std::size_t first, last;
    double drive;
  };
  // Every target group draws its synapses independently from seeded hashes, so ranges of
  // groups can grow in parallel; joining them in group order gives the serial result.
  auto grow_range = [&](std::size_t first_group, std::size_t last_group, std::vector<Edge> &edges,
                        std::vector<float> &distances) {
    std::vector<int> allot;
    std::vector<Remainder> remainders;
    std::vector<Option> pool;
    std::vector<NeuronIndex> sources;
    std::vector<Chosen> chosen;
    for (std::size_t t = first_group; t < last_group; ++t) {
      const auto &use = usable[t];
      double drive_sum = 0;
      for (const auto *c : use)
        drive_sum += c->drive;
      if (use.empty() || drive_sum <= 0)
        continue;
      // gain of a cell: the mean binding strength of its possible partner groups
      const double gain = drive_sum / double(use.size());
      for (auto target : copies[t]) {
        const auto &b = cells[target];
        const int total = slots[target];
        allot.assign(use.size(), 0);
        remainders.clear();
        int given = 0;
        for (std::size_t u = 0; u < use.size(); ++u) {
          const double exact = total * use[u]->drive / drive_sum;
          allot[u] = int(exact);
          given += allot[u];
          remainders.push_back({exact - allot[u], 0, u});
        }
        // The largest remainders get the missing slots. Equal remainders must not favour the order
        // of the groups in the grid (Astra): the development seed decides. Only the chosen set
        // matters, so a partial selection replaces the full sort.
        const std::size_t missing = std::size_t(std::max(0, total - given));
        if (missing > 0) {
          const std::size_t take = std::min(missing, remainders.size());
          if (take < remainders.size()) {
            // Select by remainder first; the seeded tie-break is only needed for the remainders
            // equal to the one at the boundary.
            auto larger = [](const Remainder &x, const Remainder &y) {
              return x.fraction > y.fraction;
            };
            std::nth_element(remainders.begin(), remainders.begin() + std::ptrdiff_t(take),
                             remainders.end(), larger);
            const double edge = remainders[take].fraction;
            bool tied = false;
            for (std::size_t r = 0; r < take && !tied; ++r)
              tied = remainders[r].fraction == edge;
            if (tied) {
              auto mid = std::partition(remainders.begin(), remainders.end(),
                                        [&](const Remainder &x) { return x.fraction > edge; });
              auto end = std::partition(mid, remainders.end(),
                                        [&](const Remainder &x) { return x.fraction == edge; });
              for (auto it = mid; it != end; ++it)
                it->tie = hash(old[use[it->group]->from].id, b.id, 11);
              const auto need = std::ptrdiff_t(take) - (mid - remainders.begin());
              std::nth_element(mid, mid + need, end, [](const Remainder &x, const Remainder &y) {
                return x.tie < y.tie;
              });
            }
          }
          for (std::size_t r = 0; r < take; ++r)
            ++allot[remainders[r].group];
        }
        sources.clear();
        chosen.clear();
        double connected = 0;
        for (std::size_t u = 0; u < use.size(); ++u) {
          if (allot[u] <= 0)
            continue;
          const auto *c = use[u];
          pool.clear();
          // A draw in (0, 1) always passes p >= 1; the selection key only matters when the pool
          // has more cells than slots, and the final edge order is set by sorting later.
          const bool certain = c->p >= 1;
          for (auto source : copies[c->from]) {
            if (source == target || (!certain && unit_of(hash(cells[source].id, b.id, 7)) >= c->p))
              continue;
            pool.push_back({0, source});
          }
          if (pool.empty())
            continue;
          if (pool.size() > std::size_t(allot[u])) {
            for (auto &opt : pool)
              opt.key = unit_of(hash(b.id, cells[opt.source].id, 8));
            std::nth_element(pool.begin(), pool.begin() + allot[u], pool.end(),
                             [](const Option &x, const Option &y) { return x.key < y.key; });
            pool.resize(std::size_t(allot[u]));
          }
          const std::size_t first = sources.size();
          for (const auto &opt : pool)
            sources.push_back(opt.source);
          connected += c->drive;
          chosen.push_back({first, sources.size(), c->drive});
        }
        if (connected <= 0)
          continue;
        // resource of the cell: gain x sqrt(number of its synapses), the scaling of balanced
        // networks (each synapse ~ gain / sqrt(n)): its input stays in the working range whatever
        // its number of inputs or of possible partners
        const double resource = gain * std::sqrt(double(sources.size()));
        for (const auto &ch : chosen)
          for (std::size_t k = ch.first; k < ch.last; ++k) {
            const auto source = sources[k];
            const auto &a = cells[source];
            const float sign = a.role == Role::Nerve ? classes[source].sign : 1.f;
            const float distance = std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) +
                                             (a.z - b.z) * (a.z - b.z));
            const float w = float(resource * ch.drive / connected / double(ch.last - ch.first));
            edges.push_back({source, target, sign * w});
            distances.push_back(distance);
          }
      }
    }
  };
  const std::size_t workers =
      cells.size() >= 512 ? std::size_t(std::clamp(o.options.workers, 1, 64)) : 1;
  std::vector<std::vector<Edge>> parts(workers);
  std::vector<std::vector<float>> spans(workers);
  if (workers == 1)
    grow_range(0, old.size(), parts[0], spans[0]);
  else {
    // Balance by cell count: each worker takes a contiguous range of groups.
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
          grow_range(bounds[w], bounds[w + 1], parts[w], spans[w]);
        } catch (...) {
          std::lock_guard<std::mutex> guard(failure_lock);
          failure = std::current_exception();
        }
      });
    grow_range(bounds[0], bounds[1], parts[0], spans[0]);
    for (auto &thread : threads)
      thread.join();
    if (failure)
      std::rethrow_exception(failure);
  }
  std::vector<Edge> edges;
  double length = 0;
  std::size_t count = 0;
  for (const auto &part : parts)
    count += part.size();
  edges.reserve(count);
  for (std::size_t w = 0; w < workers; ++w) {
    edges.insert(edges.end(), parts[w].begin(), parts[w].end());
    for (float d : spans[w])
      length += d;
  }
  o.neurons = std::move(cells);
  o.edges = std::move(edges);
  o.built_neurons = o.neurons.size();
  o.built_edges = o.edges.size();
  o.built_length = length;
}
}
// Sparse development: expression first, seven placement probes only for expressed groups,
// then properties at the vertex. Region-side summaries preselect group pairs per link kind.
struct Substrate::GridState {
  enum Stage { Cells, Receptors, Regions, Coarse, Links, Finalize, Done } stage = Cells;
  std::size_t cell = 0, sample = 0, link = 0, coarse_done = 0, receptor = 0;
  float strength = 0;
  std::array<float, 7> samples{};
  struct RegionPair {
    int kind;
    std::uint32_t a, b;
  };
  struct Summary {
    std::size_t count = 0;
    std::array<double, 3> at{};
    std::array<double, 2> sender{}, receiver{};
  };
  std::size_t units = 0;
  std::array<std::vector<Summary>, 3> summary; // per role: per region side
  std::vector<RegionPair> coarse;
  std::array<std::vector<unsigned char>, CONNECTION_KINDS>
      admitted; // per kind: region side a x region side b
  std::array<std::vector<std::pair<std::uint32_t, std::uint32_t>>, CONNECTION_KINDS> pairs;
  int kind = 0;
  std::vector<Candidate> candidates;
};
struct Substrate::GridDevelopment {
  Substrate &owner;
  GridState &s;
  std::size_t budget;
  std::array<cppn::Point, 64> points{};
  std::array<std::array<float, cppn::OUTPUTS>, 64> values{};
  void evaluate(std::size_t n, unsigned mask) {
    if (owner.program->safe() && !owner.options.reference_development)
      owner.program->evaluate(points.data(), n, mask, values);
    else
      for (std::size_t i = 0; i < n; ++i) {
        const auto &p = points[i];
        const auto &v =
            owner.combined->query_view(p.a, p.b, p.z, p.c, p.d, p.w, p.match1, p.match2);
        std::copy(v.begin(), v.end(), values[i].begin());
      }
    owner.queries += n;
    budget -= n;
  }
  void cell(const std::array<float, 3> &at, float expression) {
    const auto &v = values[0];
    Neuron n{};
    n.id = s.cell + 1;
    n.x = at[0];
    n.y = at[1];
    n.z = at[2];
    for (int i = 0; i < 5; ++i)
      n.identity[i] = v[cppn::output::identity_role + i];
    n.functions = cell_functions(n.identity);
    // The strongest of the three roles wins; a sensory cell keeps one sense, an effector cell its
    // shares of the organs.
    std::array<float, 3> roles{n.functions.sensory(), n.functions.internal, n.functions.motor()};
    const auto best = std::max_element(roles.begin(), roles.end());
    int winner = int(best - roles.begin());
    float first = *best;
    *best = 0;
    float second = *std::max_element(roles.begin(), roles.end());
    n.role_margin = (first - second) / std::max(1e-9f, first + second);
    n.role_gain = owner.options.role_transition > 0
                      ? smooth(n.role_margin, 0, owner.options.role_transition)
                      : 1;
    n.role = static_cast<Role>(winner);
    n.functions.internal = n.role == Role::Nerve;
    if (n.role == Role::Sensor) {
      // a sensory cell has exactly one sense: the corner of the identity cube with the largest
      // share
      auto &senses = n.functions.senses;
      const auto sense = std::max_element(senses.begin(), senses.end()) - senses.begin();
      senses.fill(0);
      senses[std::size_t(sense)] = 1;
    } else
      n.functions.senses.fill(0);
    if (n.role == Role::Effector)
      for (auto &share : n.functions.motors)
        share /= first;
    else
      n.functions.motors.fill(0);
    n.strength = std::clamp(expression / .05f, 0.f, 1.f) * n.role_gain;
    n.bias = -std::clamp(v[cppn::output::threshold], -1.f, 1.f) * owner.options.bias_scale;
    auto unit = [&](std::size_t output) { return (v[output] + 1) * .5f; };
    n.parameters.threshold = unit(cppn::output::threshold);
    n.parameters.capacity = 1.125f + .875f * v[cppn::output::capacity];
    n.parameters.quality1 = v[cppn::output::quality1];
    n.parameters.quality2 = v[cppn::output::quality2];
    n.parameters.quality_width = unit(cppn::output::quality_width);
    n.parameters.field_width = unit(cppn::output::field_width);
    n.parameters.time_constant = unit(cppn::output::time_constant);
    n.parameters.dendrites = unit(cppn::output::dendrites);
    n.parameters.plasticity = unit(cppn::output::plasticity);
    if (owner.neurons.size() >= std::min(owner.options.neuron_budget, owner.options.max_nodes)) {
      owner.limit_development("Technical neuron budget: expressed cell omitted");
      return;
    }
    n.sender = {v[cppn::output::sender1], v[cppn::output::sender2]};
    n.receiver = {v[cppn::output::receiver1], v[cppn::output::receiver2]};
    n.group = std::uint32_t(owner.neurons.size());
    owner.neurons.push_back(n);

    owner.built_neurons = owner.neurons.size();
  }
  // regions by union of neighbouring groups with similar markers; summaries per role and
  // region side; the list of region pairs per kind
  void regions() {
    auto &groups = owner.neurons;
    const std::size_t side = std::size_t(1) << owner.options.depth;
    std::unordered_map<std::size_t, std::uint32_t> at;
    for (std::uint32_t g = 0; g < groups.size(); ++g)
      at[std::size_t(groups[g].id - 1)] = g;
    std::vector<std::uint32_t> parent(groups.size());
    std::iota(parent.begin(), parent.end(), 0u);
    auto find = [&](std::uint32_t g) {
      while (parent[g] != g)
        g = parent[g] = parent[parent[g]];
      return g;
    };
    for (std::uint32_t g = 0; g < groups.size(); ++g) {
      const std::size_t c = std::size_t(groups[g].id - 1), ix = c / (side * side),
                        iy = c / side % side, iz = c % side;
      const std::array<std::size_t, 3> next{ix + 1 < side ? c + side * side : c,
                                            iy + 1 < side ? c + side : c,
                                            iz + 1 < side ? c + 1 : c};
      for (auto n : next) {
        if (n == c)
          continue;
        const auto h = at.find(n);
        if (h == at.end())
          continue;
        const auto &u = groups[g], &w = groups[h->second];
        bool similar = true;
        for (int k = 0; k < 2; ++k)
          similar = similar && std::abs(u.sender[k] - w.sender[k]) < REGION_STEP &&
                    std::abs(u.receiver[k] - w.receiver[k]) < REGION_STEP;
        if (similar)
          parent[find(g)] = find(h->second);
      }
    }
    std::unordered_map<std::uint32_t, std::uint16_t> index;
    for (std::uint32_t g = 0; g < groups.size(); ++g) {
      const auto root = find(g);
      auto it = index.find(root);
      if (it == index.end())
        it = index.emplace(root, std::uint16_t(index.size())).first;
      groups[g].region = it->second;
    }
    owner.regions = index.size();
    s.units = owner.regions * 3;
    for (auto &v : s.summary)
      v.assign(s.units, {});
    for (const auto &g : groups) {
      auto &m = s.summary[int(g.role)][unit(g)];
      ++m.count;
      m.at[0] += g.x;
      m.at[1] += g.y;
      m.at[2] += g.z;
      for (int k = 0; k < 2; ++k) {
        m.sender[k] += g.sender[k];
        m.receiver[k] += g.receiver[k];
      }
    }
    static constexpr std::array<Role, CONNECTION_KINDS> from{Role::Sensor, Role::Nerve,
                                                             Role::Nerve},
        to{Role::Nerve, Role::Nerve, Role::Effector};
    for (int k = 0; k < CONNECTION_KINDS; ++k) {
      s.admitted[k].assign(s.units * s.units, 0);
      for (std::uint32_t a = 0; a < s.units; ++a)
        for (std::uint32_t b = 0; b < s.units; ++b) {
          const auto na = s.summary[int(from[k])][a].count, nb = s.summary[int(to[k])][b].count;
          // within a region, or with one group on each side, the group query decides alone
          if (na && nb && (a / 3 == b / 3 || (na == 1 && nb == 1)))
            s.admitted[k][a * s.units + b] = 1;
          else if (na && nb)
            s.coarse.push_back({k, a, b});
        }
    }
  }
  // the group pairs of the admitted region pairs
  static std::size_t unit(const Neuron &g) { return std::size_t(g.region) * 3 + side_of(g); }
  void enumerate_pairs() {
    const auto &groups = owner.neurons;
    for (std::uint32_t a = 0; a < groups.size(); ++a)
      for (std::uint32_t b = 0; b < groups.size(); ++b) {
        const int k = a == b ? -1 : connection_kind(groups[a], groups[b]);
        if (k >= 0 && s.admitted[k][unit(groups[a]) * s.units + unit(groups[b])])
          s.pairs[k].push_back({a, b});
      }
  }
  bool run() {
    const int side = 1 << owner.options.depth;
    const std::size_t count = std::size_t(side) * side * side;
    const float half = 1.f / side;
    while (true) {
      if (s.stage == GridState::Done)
        return true;
      if (s.stage == GridState::Cells) {
        if (s.cell == count) {
          s.stage = GridState::Receptors;
          // Expose the complete cell plan before paying for receptor and link queries.
          return false;
        }
        if (!budget)
          return false;
        std::array<float, 3> center{-1 + half * (1 + 2 * int(s.cell / (side * side))),
                                    -1 + half * (1 + 2 * int(s.cell / side % side)),
                                    -1 + half * (1 + 2 * int(s.cell % side))};
        const float h = .5f * half;
        if (s.sample == 0) {
          points[0] = {center[0], center[1], center[2], center[0], center[1], center[2]};
          evaluate(1, 1u << cppn::output::expression);
          if (values[0][cppn::output::expression] <= 0) {
            ++s.cell;
            continue;
          }
          s.strength = values[0][cppn::output::expression];
          s.sample = 1;
          continue;
        }
        if (s.sample < 8) {
          auto n = std::min(budget, 8 - s.sample);
          for (std::size_t j = 0; j < n; ++j) {
            auto at = center;
            auto k = s.sample + j - 1;
            if (k)
              at[(k - 1) / 2] += (k - 1) % 2 ? h : -h;
            points[j] = {at[0], at[1], at[2], at[0], at[1], at[2]};
          }
          evaluate(n, 1u << cppn::output::placement);
          for (std::size_t j = 0; j < n; ++j)
            s.samples[s.sample + j - 1] = values[j][cppn::output::placement];
          s.sample += n;
          continue;
        }
        auto at = center;
        for (int axis = 0; axis < 3; ++axis)
          at[axis] += vertex(s.samples[1 + 2 * axis], s.samples[0], s.samples[2 + 2 * axis], h);
        points[0] = {at[0], at[1], at[2], at[0], at[1], at[2]};
        evaluate(1, cppn::output::cell_mask);
        cell(at, s.strength);
        ++s.cell;
        s.sample = 0;
        continue;
      }
      if (s.stage == GridState::Receptors) {
        const auto total = owner.neurons.size() * HORMONE_EFFECTS;
        if (s.receptor == total) {
          s.stage = GridState::Regions;
          continue;
        }
        if (!budget)
          return false;
        const auto count = std::min({std::size_t(64), budget, total - s.receptor});
        for (std::size_t j = 0; j < count; ++j) {
          const auto index = s.receptor + j;
          const auto &n = owner.neurons[index / HORMONE_EFFECTS];
          // Reserved target plane outside the body. No new CPPN outputs or inputs.
          const float d = 2.f + float(index % HORMONE_EFFECTS);
          points[j] = {n.x, n.y, n.z, n.x < 0 ? -d : d, 0, 0};
        }
        evaluate(count, cppn::output::cell_mask);
        for (std::size_t j = 0; j < count; ++j) {
          auto &r = owner.neurons[(s.receptor + j) / HORMONE_EFFECTS]
                        .hormone_receptors[(s.receptor + j) % HORMONE_EFFECTS];
          const auto &v = values[j];
          r.affinity = hormone_affinity(v[cppn::output::quality1], v[cppn::output::quality2],
                                        (v[cppn::output::quality_width] + 1) * .5f);
          r.baseline = v[cppn::output::capacity];
          r.sensitivity = v[cppn::output::plasticity];
          r.half = float(HORMONE_HALF_MIN * std::pow(HORMONE_HALF_MAX / HORMONE_HALF_MIN,
                                                     (v[cppn::output::threshold] + 1) * .5));
        }
        s.receptor += count;
        continue;
      }
      if (s.stage == GridState::Regions) {
        regions();
        s.stage = GridState::Coarse;
        continue;
      }
      if (s.stage == GridState::Coarse) {
        if (s.coarse_done == s.coarse.size()) {
          enumerate_pairs();
          s.coarse = {};
          s.coarse_done = 0;
          s.stage = GridState::Links;
          continue;
        }
        if (!budget)
          return false;
        const int kind = s.coarse[s.coarse_done].kind;
        std::size_t n = 0;
        static constexpr std::array<Role, CONNECTION_KINDS> from{Role::Sensor, Role::Nerve,
                                                                 Role::Nerve},
            to{Role::Nerve, Role::Nerve, Role::Effector};
        auto centre = [&](const GridState::Summary &m) {
          return std::array<float, 3>{float(m.at[0] / m.count), float(m.at[1] / m.count),
                                      float(m.at[2] / m.count)};
        };
        while (n < 64 && n < budget && s.coarse_done + n < s.coarse.size() &&
               s.coarse[s.coarse_done + n].kind == kind) {
          const auto &q = s.coarse[s.coarse_done + n];
          const auto x = centre(s.summary[int(from[kind])][q.a]),
                     y = centre(s.summary[int(to[kind])][q.b]);
          const auto &ma = s.summary[int(from[kind])][q.a], &mb = s.summary[int(to[kind])][q.b];
          points[n] = {x[0],
                       x[1],
                       x[2],
                       y[0],
                       y[1],
                       y[2],
                       float(ma.sender[0] / ma.count * mb.receiver[0] / mb.count),
                       float(ma.sender[1] / ma.count * mb.receiver[1] / mb.count)};
          ++n;
        }
        evaluate(n, cppn::output::link_mask(kind));
        for (std::size_t j = 0; j < n; ++j) {
          const auto &q = s.coarse[s.coarse_done + j];
          if (affinity(values[j][cppn::output::link_expression(kind)]) > 0)
            s.admitted[kind][q.a * s.units + q.b] = 1;
        }
        s.coarse_done += n;
        continue;
      }
      if (s.stage == GridState::Links) {
        if (s.kind == CONNECTION_KINDS) {
          s.stage = GridState::Finalize;
          // Let the population scheduler grant a finalization before allocating synapses.
          return false;
        }
        const auto &pairs = s.pairs[s.kind];
        if (s.link == pairs.size()) {
          ++s.kind;
          s.link = 0;
          continue;
        }
        if (!budget)
          return false;
        auto n = std::min({std::size_t(64), budget, pairs.size() - s.link});
        for (std::size_t j = 0; j < n; ++j) {
          const auto [a, b] = pairs[s.link + j];
          const auto &x = owner.neurons[a], &y = owner.neurons[b];
          points[j] = {x.x,
                       x.y,
                       x.z,
                       y.x,
                       y.y,
                       y.z,
                       x.sender[0] * y.receiver[0],
                       x.sender[1] * y.receiver[1]};
        }
        evaluate(n, cppn::output::link_mask(s.kind));
        for (std::size_t j = 0; j < n; ++j) {
          auto [from, to] = pairs[s.link + j];
          const float p = affinity(values[j][cppn::output::link_expression(s.kind)]);
          if (p > 0)
            s.candidates.push_back(
                {from, to, p,
                 std::abs(values[j][cppn::output::link_weight(s.kind)]) * owner.options.scale * p});
        }
        s.link += n;
        continue;
      }
      if (!budget)
        return false;
      grow_cells(owner, s.candidates);
      owner.finish_development();
      s.pairs = {};
      s.candidates = {};
      s.stage = GridState::Done;
    }
  }
};
bool Substrate::advance_grid(std::size_t budget) {
  if (!grid_state) {
    grid_state = std::make_shared<GridState>();
    network_layout.reset();
    neurons.clear();
    edges.clear();
    partners.clear();
    partner_offset.clear();
    queries = built_neurons = built_edges = recurrent_edges = regions = 0;
    built_length = 0;
    resource_limited = false;
    diagnostic.clear();
    program = std::make_shared<cppn::Program>(*combined);
  }
  return GridDevelopment{*this, *grid_state, budget}.run();
}
bool Substrate::connections_pending() const {
  return grid_state &&
         (grid_state->stage == GridState::Coarse || grid_state->stage == GridState::Links);
}
bool Substrate::cell_parameters_complete() const {
  return grid_state && grid_state->stage >= GridState::Receptors;
}
bool Substrate::anatomy_complete() const {
  return grid_state && grid_state->stage >= GridState::Coarse;
}
bool Substrate::pending_finalization() const {
  return grid_state && grid_state->stage == GridState::Finalize;
}
std::size_t Substrate::remaining_queries(std::size_t estimate) const {
  if (!grid_state)
    return estimate;
  const auto &s = *grid_state;
  if (s.stage == GridState::Done || s.stage == GridState::Finalize)
    return 0;
  if (s.stage == GridState::Cells)
    return ((std::size_t(1) << (3 * options.depth)) - s.cell) * 9 - s.sample;
  if (s.stage == GridState::Receptors)
    return neurons.size() * HORMONE_EFFECTS - s.receptor;
  std::size_t left = s.coarse.size() - s.coarse_done;
  for (int k = s.kind; k < CONNECTION_KINDS; ++k)
    left += s.pairs[k].size();
  return left - (s.stage == GridState::Links ? s.link : 0);
}
void Substrate::abort_development(const std::string &reason) {
  resource_limited = true;
  diagnostic = reason;
  if (grid_state) {
    grid_state->stage = GridState::Done;
    grid_state->pairs = {};
  }
}
bool Substrate::advance_development(std::size_t budget) {
  return advance_grid(budget);
}
}
