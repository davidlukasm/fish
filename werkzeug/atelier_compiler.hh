#pragma once
#include "../src/genome.hh"
#include "../src/body_plan.hh"
#include "../src/eye_geometry.hh"
#include "field/development_sites.hh"
#include "field/contacts.hh"
#include "cppn/program.hh"
#include "atelier_plan_schema.hh"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <map>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>
#include <tuple>
#include <vector>

namespace atelier {
static_assert(studio_plan::receptors == field::HORMONE_EFFECTS);
using evolution::NodeType;
namespace out = cppn::output;
struct Receptor {
  bool active = false;
  float baseline = 0, sensitivity = 0, half = .05f, width = 0;
  int substance = 0, steepness = 0;
  float spread_receptors = 0;
};
struct Group {
  float electrical_limit = .5f;
  float learning_tau = .5f, teaching_limit = .5f;
  float spread_physiology = 0;
  float spread_receptors = 0;
  float spread_development = 0;
  float spread_contacts = 0;
  std::array<field::ReceptionField, field::CONTACT_FIELDS - 1> reception{};
  std::array<std::array<float, 1>, field::CONTACT_FIELDS - 1> reception_spread{};
  Group() {
    for (auto &r : reception)
      r.expression = -1;
  }
  std::string name;
  int organ = 0, open = 0;
  int zone = 0, side = 0, role = 1, function = -1, copies = 1;
  float u0 = 0, u1 = 1, v0 = 0, v1 = 1, w0 = 0, w1 = 1;
  float threshold = 0, tau = .5f, field = .5f, q1 = 0, q2 = 0, qwidth = .5f;
  float sign = 1, mode = 0, pace = -1, modulator = -1;
  float sender1 = 1, sender2 = 1, receiver1 = -1, receiver2 = -1;
  float sigma = float(field::MIN_SEARCH), crossing = 0, range = 1;
  std::array<Receptor, field::HORMONE_EFFECTS> receptors{};
  Receptor growth{false, 1, 0};
  bool contains(const cppn::Point &p) const {
    constexpr float eps = .0001f;
    return p.zone == zone && (!side || p.side == side) && p.u >= u0 - eps && p.u <= u1 + eps &&
           p.v >= v0 - eps && p.v <= v1 + eps && p.w >= w0 - eps && p.w <= w1 + eps;
  }
};

void ensure(bool valid, const char *why) {
  if (!valid)
    throw std::invalid_argument(why);
}
bool between(float x, float a, float b) {
  return std::isfinite(x) && x >= a && x <= b;
}
Receptor read_receptor(std::istream &input) {
  Receptor r;
  int active = 0;
  ensure(studio_plan::read_receptor(input, r, active), "invalid receptor");
  ensure((active == 0 || active == 1) && between(r.baseline, -1, 1) &&
             between(r.sensitivity, -field::HORMONE_SENSITIVITY_SPAN,
                     field::HORMONE_SENSITIVITY_SPAN) &&
             between(r.half, float(field::HORMONE_HALF_MIN), float(field::HORMONE_HALF_MAX)) &&
             r.substance >= 0 && r.substance < field::REGULATORS && between(r.width, 0, 1) &&
             r.steepness >= 0 && r.steepness <= field::HORMONE_STEEPNESS_STEPS,
         "invalid receptor properties");
  r.active = active != 0;
  ensure(between(r.spread_receptors, 0, 1), "invalid receptor spread");
  return r;
}

struct Connection {
  int from = 0, to = 0, bundle = 0;
  float spread = 0;
};
struct CompileOptions {
  float capacityTolerance = 0, traitTolerance = 0;
  int extraCells = 0, reserve = 64;
};
struct Plan {
  std::vector<Group> groups;
  Receptor growth;
  CompileOptions options;
  std::vector<Connection> connections;
  bool fixed_contacts = false;
  std::uint64_t development_seed = 1, variation_seed = 2;
};
// A design may still be empty (allow_empty): its view shows the body without cells.
Plan read_plan(std::istream &input, std::string &name, bool allow_empty = false) {
  int count = 0;
  ensure(bool(input >> std::quoted(name) >> count) && !name.empty() &&
             name.size() <= studio_plan::max_name && count >= (allow_empty ? 0 : 1) &&
             count <= studio_plan::max_groups,
         "invalid plan header");
  std::vector<Group> groups;
  for (int i = 0; i < count; ++i) {
    Group g;
    ensure(bool(input >> std::quoted(g.name)) && studio_plan::read_group(input, g),
           "invalid cell group");
    ensure(!g.name.empty() && g.name.size() <= studio_plan::max_group_name && g.zone >= 0 &&
               g.zone < 4 && g.side >= -1 && g.side <= 1 && g.role >= 0 && g.role <= 2 &&
               g.function >= -1 && g.function <= 10 && g.copies >= 1 &&
               g.copies <= studio_plan::max_copies && between(g.u0, 0, 1) &&
               between(g.u1, g.u0, 1) && between(g.v0, 0, 1) && between(g.v1, g.v0, 1) &&
               between(g.w0, 0, 1) && between(g.w1, g.w0, 1),
           "invalid cell coordinates");
    for (float x : {g.threshold, g.q1, g.q2, g.sign, g.mode, g.pace, g.modulator, g.sender1,
                    g.sender2, g.receiver1, g.receiver2, g.crossing})
      ensure(between(x, -1, 1), "cell property outside -1..1");
    for (float x : {g.tau, g.field, g.qwidth, g.range})
      ensure(between(x, 0, 1), "cell property outside 0..1");
    ensure(between(g.sigma, float(field::MIN_SEARCH), float(field::MAX_SEARCH)),
           "invalid contact width");
    ensure(g.organ >= 0 && g.organ < 1000 && (g.open == 0 || g.open == 1), "invalid group owner");
    for (auto &r : g.receptors)
      r = read_receptor(input);
    g.growth = read_receptor(input);
    ensure(between(g.electrical_limit, 0, 1), "invalid electrical limit");
    ensure(between(g.spread_physiology, 0, 1), "invalid trait spread");
    ensure(between(g.spread_receptors, 0, 1), "invalid trait spread");
    ensure(between(g.spread_development, 0, 1), "invalid trait spread");
    ensure(between(g.spread_contacts, 0, 1), "invalid trait spread");
    ensure(between(g.learning_tau, 0, 1) && between(g.teaching_limit, 0, 1),
           "invalid property context");
    groups.push_back(std::move(g));
  }
  std::vector<int> owners(field::DEVELOPMENT_SITES, -1);
  for (int j = 0; j < count; ++j) {
    int sites = 0;
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i)
      if (groups[j].contains(field::development_site(i))) {
        ensure(owners[i] < 0, "overlapping cell groups");
        owners[i] = j;
        ++sites;
      }
    ensure(sites > 0, "cell group contains no development site");
  }
  Plan plan{std::move(groups), read_receptor(input), {}, {}};
  ensure(plan.growth.substance < field::HORMONES, "growth receptor binds hormones only");
  auto &o = plan.options;
  ensure(bool(input >> o.capacityTolerance >> o.traitTolerance >> o.extraCells >> o.reserve) &&
             between(o.capacityTolerance, 0, .5f) && between(o.traitTolerance, 0, .5f) &&
             o.extraCells >= 0 && o.extraCells <= 64 && o.reserve >= 0 && o.reserve <= 256,
         "invalid compiler options");
  int edges = 0;
  ensure(bool(input >> edges) && edges >= 0 &&
             edges <= studio_plan::max_groups * studio_plan::max_groups,
         "invalid connection count");
  std::map<int, int> bundleTargets;
  std::set<std::pair<int, int>> pairs;
  for (int i = 0; i < edges; ++i) {
    Connection c;
    ensure(bool(input >> c.from >> c.to >> c.spread >> c.bundle) && c.from >= 0 && c.from < count &&
               c.to >= 0 && c.to < count && between(c.spread, 0, 1) && c.bundle >= 0 &&
               c.bundle < edges,
           "invalid planned connection");
    ensure(plan.groups[c.from].role != 2 && plan.groups[c.to].role != 0 &&
               !(plan.groups[c.from].role == 0 && plan.groups[c.to].role == 2),
           "invalid connection roles");
    ensure(pairs.emplace(c.from, c.to).second, "duplicate planned connection");
    auto [it, fresh] = bundleTargets.emplace(c.bundle, c.to);
    ensure(fresh || it->second == c.to, "connection bundle has different targets");
    plan.connections.push_back(c);
  }
  int fixed = 0;
  ensure(bool(input >> fixed) && (fixed == 0 || fixed == 1), "invalid contact map flag");
  plan.fixed_contacts = fixed;
  if (fixed) {
    ensure(bool(input >> plan.development_seed >> plan.variation_seed),
           "invalid development seeds");
    for (auto &g : plan.groups) {
      ensure(bool(input >> g.sender1 >> g.sender2 >> g.receiver1 >> g.receiver2 >> g.sigma),
             "invalid contact map");
      for (int f = 0; f < field::CONTACT_FIELDS - 1; ++f) {
        auto &r = g.reception[f];
        ensure(bool(input >> r.expression >> r.address[0] >> r.address[1] >> r.width) &&
                   between(r.expression, -1, 1) && between(r.address[0], -1, 1) &&
                   between(r.address[1], -1, 1) && between(r.width, 0, 1),
               "invalid reception field");
        for (auto &spread : g.reception_spread[f])
          ensure(bool(input >> spread) && between(spread, 0, 1), "invalid reception spread");
      }
      for (float address : {g.sender1, g.sender2, g.receiver1, g.receiver2})
        ensure(between(address, -1, 1), "invalid contact address");
      ensure(between(g.sigma, float(field::MIN_SEARCH), float(field::MAX_SEARCH)),
             "invalid contact radius");
    }
  }
  return plan;
}

std::pair<int, int> corner(int role, int function) {
  if (role == 0) {
    switch (function) {
    case field::Light:
      return {0, 0};
    case field::Proximity:
      return {0, 1};
    case field::Flow:
      return {1, 0};
    case field::Odor:
    case field::Blood:
    case field::Intake:
      return {2, 0};
    case field::Damage:
      return {3, 1};
    default:
      return {3, 0};
    }
  }
  switch (function) {
  case field::Defense:
    return {1, 0};
  case field::Pigment:
    return {3, 0};
  case field::Gland:
  case field::Bladder:
  case field::Eggs:
    return {2, 0};
  case field::Sperm:
    return {2, 1};
  default:
    return {0, 0};
  }
}

std::array<float, cppn::OUTPUTS> outputs(const Group &g) {
  std::array<float, cppn::OUTPUTS> v{};
  auto raw = [](float x) { return 2 * x - 1; };
  v[out::expression] = 1;
  v[out::identity_role] = g.role == 0 ? -1 : g.role == 2 ? 1 : 0;
  if (g.role == 1) {
    v[out::identity1] = g.sign;
    v[out::identity2] = g.mode;
    v[out::identity3] = g.pace;
    v[out::identity4] = g.modulator;
  } else {
    const auto [c, variant] = corner(g.role, g.function);
    v[out::identity1] = c % 2 ? 1 : -1;
    v[out::identity2] = c / 2 ? 1 : -1;
    v[out::identity3] = variant ? 1 : -1;
  }
  v[out::capacity] = raw(g.copies / 16.f);
  v[out::threshold] = g.threshold;
  v[out::time_constant] = raw(g.tau);
  v[out::field_width] = raw(g.field);
  v[out::quality1] = g.q1;
  v[out::quality2] = g.q2;
  v[out::quality_width] = raw(g.qwidth);
  v[out::sender1] = g.sender1;
  v[out::sender2] = g.sender2;
  v[out::receiver1] = g.receiver1;
  v[out::receiver2] = g.receiver2;
  v[out::search_width] = raw(float(field::search_width(g.sigma)));
  v[out::crossing] = g.crossing;
  v[out::range] = raw(g.range);
  v[out::synapse_strength] = 2 * g.electrical_limit - 1;
  v[out::spread_physiology] = g.spread_physiology;
  v[out::spread_receptors] = g.spread_receptors;
  v[out::spread_development] = g.spread_development;
  v[out::spread_contacts] = g.spread_contacts;
  return v;
}

field::Substrate planned_substrate(const std::vector<Group> &groups) {
  std::vector<field::Neuron> cells;
  const float bias_scale = field::Options{}.bias_scale;
  for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
    const cppn::Point p = field::development_site(i);
    const auto g =
        std::find_if(groups.begin(), groups.end(), [&](const Group &g) { return g.contains(p); });
    if (g == groups.end())
      continue;
    auto cell = field::site_cell(p, outputs(*g), i + 1, bias_scale);
    if (!cell)
      continue;
    cell->parameters.learning_time = g->learning_tau;
    cell->teaching_limit = g->teaching_limit;
    cell->group = std::uint32_t(cells.size());
    cells.push_back(*cell);
  }
  field::lay_out_cells(cells);
  field::Substrate s(std::move(cells));
  fishsim::prepare_zonal_geometry(s);
  std::vector<std::vector<field::NeuronIndex>> copies;
  bool limited = false;
  s.neurons = field::cell_copies(s.neurons, std::min(s.options.max_nodes, field::MAX_NODES), copies,
                                 limited);
  s.resource_limited = limited;
  for (auto &n : s.neurons)
    n.functional = !limited;
  return s;
}

inline std::vector<Group> compact_groups(std::vector<Group> groups) {
  constexpr float TRAIT_EPSILON = 1e-5f;
  auto same = [&](const Group &a, const Group &b) {
    if (a.organ != b.organ || a.zone != b.zone || a.side != b.side || a.role != b.role ||
        a.function != b.function || a.copies != b.copies || a.learning_tau != b.learning_tau ||
        a.teaching_limit != b.teaching_limit)
      return false;
    if (a.reception != b.reception || a.reception_spread != b.reception_spread)
      return false;
    const auto av = outputs(a), bv = outputs(b);
    for (std::size_t i = 0; i < av.size(); ++i)
      if (std::abs(av[i] - bv[i]) > TRAIT_EPSILON)
        return false;
    for (int i = 0; i <= field::HORMONE_EFFECTS; ++i) {
      const auto &x = i == field::HORMONE_EFFECTS ? a.growth : a.receptors[i],
                 &y = i == field::HORMONE_EFFECTS ? b.growth : b.receptors[i];
      if (x.active != y.active || x.substance != y.substance || x.steepness != y.steepness)
        return false;
      if (x.spread_receptors != y.spread_receptors)
        return false;
      for (auto pair : {std::pair{x.baseline, y.baseline},
                        {x.sensitivity, y.sensitivity},
                        {x.half, y.half},
                        {x.width, y.width}})
        if (std::abs(pair.first - pair.second) > TRAIT_EPSILON)
          return false;
    }
    return true;
  };
  bool changed = true;
  while (changed) {
    changed = false;
    for (std::size_t i = 0; i < groups.size(); ++i)
      for (std::size_t j = i + 1; j < groups.size(); ++j) {
        const auto &a = groups[i], &b = groups[j];
        if (!same(a, b))
          continue;
        Group merged = a;
        merged.u0 = std::min(a.u0, b.u0);
        merged.u1 = std::max(a.u1, b.u1);
        merged.v0 = std::min(a.v0, b.v0);
        merged.v1 = std::max(a.v1, b.v1);
        merged.w0 = std::min(a.w0, b.w0);
        merged.w1 = std::max(a.w1, b.w1);
        bool covered = true;
        for (std::size_t k = 0; k < field::DEVELOPMENT_SITES && covered; ++k) {
          const auto site = field::development_site(k);
          covered = !merged.contains(site) || a.contains(site) || b.contains(site);
        }
        if (covered) {
          groups[i] = merged;
          groups.erase(groups.begin() + j);
          changed = true;
          break;
        }
      }
  }
  return groups;
}

class Builder {
  std::shared_ptr<evolution::Genome> genes =
      std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
  std::array<float, cppn::OUTPUTS> base{};
  std::map<std::tuple<int, int, float>, int> tests;
  std::map<int, int> selectors;
  std::map<int, int> masks;
  int next = cppn::INPUTS + cppn::OUTPUTS;

  int node(NodeType type, float param) {
    genes->add_node({next, param, type});
    return next++;
  }
  void link(int from, int to, float weight) {
    if (weight != 0 && !genes->connect(from, to, weight))
      throw std::runtime_error("CPPN connection refused");
  }
  int test(int input, int sign, float limit) {
    const auto key = std::make_tuple(input, sign, limit);
    const auto old = tests.find(key);
    if (old != tests.end())
      return old->second;
    const int id = node(NodeType::CUTOFF, sign * limit);
    link(input, id, float(sign));
    return tests[key] = id;
  }
  int effect_selector(int query) {
    const auto old = selectors.find(query);
    if (old != selectors.end())
      return old->second;
    const int delta = node(NodeType::ABS, -field::receptor_effect_code(query));
    const int selected = node(NodeType::SIGN, .25f / field::RECEPTOR_QUERIES);
    link(cppn::input::effect, delta, 1);
    link(delta, selected, -1);
    return selectors[query] = selected;
  }
  int mask(int signed_gate) {
    const auto old = masks.find(signed_gate);
    if (old != masks.end())
      return old->second;
    const int id = node(NodeType::LINEAR, 1);
    link(signed_gate, id, .5f);
    link(cppn::BIAS, id, .5f);
    return masks[signed_gate] = id;
  }
  int indicator(const Group &g, int effect = -1, int contact_field = 0, float property = -1,
                bool body = false) {
    std::vector<int> conditions{effect < 0
                                    ? test(cppn::input::effect, -1, .5f / field::RECEPTOR_QUERIES)
                                    : effect_selector(effect)};
    if (effect < 0) {
      const float value = float(contact_field) / (field::CONTACT_FIELDS - 1);
      constexpr float half = .5f / (field::CONTACT_FIELDS - 1);
      conditions.push_back(test(cppn::input::field, -1, value + half));
      if (contact_field)
        conditions.push_back(test(cppn::input::field, 1, value - half));
    }
    if (property >= 0) {
      conditions.push_back(test(cppn::input::property, -1, property + .2f));
      conditions.push_back(test(cppn::input::property, 1, property - .2f));
    }
    // Boundaries halfway to the nearest excluded site preserve the exact selected grid cells.
    auto bounds = [&](int input, float lo, float hi) {
      float below = -1, above = 2, first = 2, last = -1;
      bool includes = false;
      for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
        const auto p = field::development_site(i);
        if (p.zone != g.zone)
          continue;
        const float x = input == cppn::input::u ? p.u : input == cppn::input::v ? p.v : p.w;
        if (x < lo - .0001f)
          below = std::max(below, x);
        else if (x > hi + .0001f)
          above = std::min(above, x);
        else {
          includes = true;
          first = std::min(first, x);
          last = std::max(last, x);
        }
      }
      ensure(includes, "cell interval contains no development site");
      if (below >= 0)
        conditions.push_back(test(input, 1, (below + first) / 2));
      if (above <= 1)
        conditions.push_back(test(input, -1, (above + last) / 2));
    };
    if (body) {
      conditions.push_back(test(cppn::input::side, 1, -.5f));
      conditions.push_back(test(cppn::input::side, -1, .5f));
    } else {
      bounds(cppn::input::u, g.u0, g.u1);
      bounds(cppn::input::v, g.v0, g.v1);
      bounds(cppn::input::w, g.w0, g.w1);
      if (g.side)
        conditions.push_back(test(cppn::input::side, g.side, 0));
      else if (effect == field::GROWTH_RECEPTOR) {
        const int magnitude = node(NodeType::ABS, 0);
        link(cppn::input::side, magnitude, 1);
        conditions.push_back(test(magnitude, 1, .5f));
      }
    }
    const float n = float(conditions.size()) + 2;
    const int gate = node(NodeType::CUTOFF, (n - 1) / n);
    for (int condition : conditions)
      link(condition, gate, 1 / n);
    link(g.zone, gate, 2 / n);
    return mask(gate);
  }
  void assign(int indicator, int output, float delta) {
    if (std::abs(delta) < 1e-7f)
      return;
    link(indicator, cppn::INPUTS + output, delta);
  }

public:
  Builder() {
    for (int i = 0; i < next; ++i)
      genes->add_node({i, 1, NodeType::LINEAR});
    base[out::expression] = -1;
  }
  void receptor(int gate, const Receptor &r, float neutral) {
    const float a = float(2 * fishsim::PI * r.substance / field::BLOOD_SUBSTANCES);
    const float half = float(2 * std::log(r.half / field::HORMONE_HALF_MIN) /
                                 std::log(field::HORMONE_HALF_MAX / field::HORMONE_HALF_MIN) -
                             1);
    assign(gate, out::capacity, r.baseline - neutral);
    assign(gate, out::field_width, r.sensitivity / field::HORMONE_SENSITIVITY_SPAN);
    assign(gate, out::threshold, half);
    assign(gate, out::time_constant, float(r.steepness) / field::HORMONE_STEEPNESS_STEPS);
    assign(gate, out::quality1, std::cos(a));
    assign(gate, out::quality2, std::sin(a));
    assign(gate, out::quality_width, 2 * r.width - 1);
    assign(gate, out::spread_receptors, r.spread_receptors);
  }
  std::shared_ptr<evolution::Genome> build(const Plan &plan) {
    const auto compact = compact_groups(plan.groups);
    std::map<int, std::vector<const Group *>> organs;
    for (const auto &g : compact)
      organs[g.organ].push_back(&g);
    for (const auto &[organ, groups] : organs) {
      tests.clear();
      std::array<std::map<float, std::vector<int>>, cppn::OUTPUTS> traits;
      for (const auto *group : groups) {
        const auto &g = *group;
        const auto values = outputs(g);
        const int gate = indicator(g);
        for (int k = 0; k < cppn::OUTPUTS; ++k) {
          const float delta = values[k] - (k == out::expression ? -1.f : 0.f);
          if (std::abs(delta) >= 1e-7f)
            traits[k][delta].push_back(gate);
        }
        assign(indicator(g, -1, 0, cppn::property::learning), out::time_constant,
               2 * (g.learning_tau - g.tau));
        assign(indicator(g, -1, 0, cppn::property::teaching), out::synapse_strength,
               2 * (g.teaching_limit - g.electrical_limit));
        for (int f = 1; f < field::CONTACT_FIELDS; ++f) {
          const auto &r = g.reception[f - 1];
          if (r.expression <= -1 && g.reception_spread[f - 1][0] == 0)
            continue;
          const int gate = indicator(g, -1, f);
          assign(gate, out::expression, 1 + r.expression);
          assign(gate, out::receiver1, r.address[0]);
          assign(gate, out::receiver2, r.address[1]);
          assign(gate, out::search_width, 2 * r.width - 1);
          assign(gate, out::spread_contacts, g.reception_spread[f - 1][0]);
        }
        if (g.growth.active)
          receptor(indicator(g, field::GROWTH_RECEPTOR), g.growth, 1.f);
        for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
          if (g.receptors[effect].active)
            receptor(indicator(g, effect), g.receptors[effect],
                     effect == field::Output ? 1.f : 0.f);
      }
      std::map<std::vector<int>, int> unions;
      for (int k = 0; k < cppn::OUTPUTS; ++k)
        for (const auto &[delta, gates] : traits[k]) {
          int gate = gates.front();
          if (gates.size() > 1) {
            auto [it, fresh] = unions.emplace(gates, 0);
            if (fresh) {
              it->second = node(NodeType::LINEAR, 1);
              for (int member : gates)
                link(member, it->second, 1);
            }
            gate = it->second;
          }
          assign(gate, k, delta);
        }
    }
    {
      const auto &at = field::GROWTH_RECEPTOR_SITE;
      Group body;
      body.zone = at.zone;
      body.u0 = body.u1 = at.u;
      body.v0 = body.v1 = at.v;
      body.w0 = body.w1 = at.w;
      receptor(indicator(body, field::GROWTH_RECEPTOR, 0, -1, true), plan.growth, 1);
    }
    assign(mask(effect_selector(field::Output)), out::capacity, 1);
    assign(mask(effect_selector(field::GROWTH_RECEPTOR)), out::capacity, 1);
    for (int k = 0; k < cppn::OUTPUTS; ++k)
      link(cppn::BIAS, cppn::INPUTS + k, base[k]);
    // Ordinary weight mutations can activate variance before any structure mutation is needed.
    for (int k = out::mean_count; k < cppn::OUTPUTS; ++k)
      ensure(genes->connect(cppn::BIAS, cppn::INPUTS + k, 0), "cannot seed variance coefficient");
    genes->validate();
    ensure(genes->nodes() <= fishsim::MAX_GENOME_NODES &&
               genes->get_connection_genes().size() <= fishsim::MAX_GENOME_CONNECTIONS,
           "CPPN budget exceeded");
    for (const auto &e : genes->get_connection_genes())
      ensure(std::abs(e.get_weight()) <= fishsim::MAX_GENE_WEIGHT,
             "compiler weight exceeds mutation range");
    if (genes->nodes() + plan.options.reserve > fishsim::MAX_GROWING_NODES)
      throw std::runtime_error("CPPN: " + std::to_string(genes->nodes()) +
                               " Knoten; mit der gewählten Reserve sind höchstens " +
                               std::to_string(fishsim::MAX_GROWING_NODES - plan.options.reserve) +
                               " möglich.");
    cppn::CPPN compiled(genes);
    ensure(cppn::Program(compiled).safe(), "compiler exceeds fast CPPN evaluation limits");
    return genes;
  }
};

}
