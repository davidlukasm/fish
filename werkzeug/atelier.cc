#include "../src/genome.hh"
#include "../src/body_plan.hh"
#include "../src/simulation_types.hh"
#include "field/hormones.hh"
#include "field/functions.hh"
#include "field/development_sites.hh"
#include "atelier_plan_schema.hh"
#include "cppn/output_schema.hh"
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <tuple>
#include <vector>

// Converts a spatial cell-group plan into an ordinary v019 CPPN. It also exposes the
// developed anatomy and the actual CPPN for the browser's two editing views.
using evolution::NodeType;
using fishsim::Genome;
namespace out = cppn::output;
namespace {

struct Receptor {
  bool active = false;
  float baseline = 0, sensitivity = 0, half = .05f, width = 0;
  int substance = 0, steepness = 0;
};
struct Group {
  std::string name;
  int zone = 0, side = 0, role = 1, function = -1, copies = 1;
  float u0 = 0, u1 = 1, v0 = 0, v1 = 1, w0 = 0, w1 = 1;
  float threshold = 0, tau = .5f, field = .5f, q1 = 0, q2 = 0, qwidth = .5f;
  float sign = 1, mode = 0, pace = -1, modulator = -1;
  float sender1 = 1, sender2 = 1, receiver1 = -1, receiver2 = -1;
  float sigma = .03f, crossing = 0, range = 1;
  std::array<Receptor, field::HORMONE_EFFECTS> receptors{};
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
// A plan's receptor: the engine's sensitivity span and steepness steps, any substance a receptor
// binds (hormones and maturity).
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
  return r;
}

// A plan: its cell groups, then the body's growth receptor.
struct Plan {
  std::vector<Group> groups;
  Receptor growth;
};
Plan read_plan(std::istream &input, std::string &name) {
  int count = 0;
  ensure(bool(input >> std::quoted(name) >> count) && !name.empty() &&
             name.size() <= studio_plan::max_name && count > 0 && count <= studio_plan::max_groups,
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
    ensure(between(g.sigma, .03f, 2), "invalid contact width");
    for (auto &r : g.receptors)
      r = read_receptor(input);
    groups.push_back(std::move(g));
  }
  Plan plan{std::move(groups), read_receptor(input)};
  ensure(plan.growth.substance < field::HORMONES, "growth receptor binds hormones only");
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
  v[out::search_width] = raw(float(std::log(g.sigma / .03f) / std::log(2 / .03f)));
  v[out::crossing] = g.crossing;
  v[out::range] = raw(g.range);
  return v;
}

class Builder {
  std::shared_ptr<evolution::Genome> genes =
      std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
  std::array<float, cppn::OUTPUTS> base{};
  std::map<std::tuple<int, int, float>, int> tests;
  std::map<int, int> selectors;
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
  // +1 at the receptor query of an effect or of growth (field::receptor_effect_code), else -1.
  // Cell queries carry 0; the codes lie 1 / RECEPTOR_QUERIES apart.
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
  int indicator(const Group &g, int effect = -1) {
    std::vector<int> conditions{effect < 0
                                    ? test(cppn::input::effect, -1, .5f / field::RECEPTOR_QUERIES)
                                    : effect_selector(effect)};
    auto bounds = [&](int input, float lo, float hi) {
      if (lo > 0)
        conditions.push_back(test(input, 1, lo - .0001f));
      if (hi < 1)
        conditions.push_back(test(input, -1, hi + .0001f));
    };
    bounds(cppn::input::u, g.u0, g.u1);
    bounds(cppn::input::v, g.v0, g.v1);
    bounds(cppn::input::w, g.w0, g.w1);
    if (g.side)
      conditions.push_back(test(cppn::input::side, g.side, 0));
    // The four zones are one-hot inputs (0 or 1). An active zone contributes
    // twice as much as one signed condition, just as in v019's fischbau.
    const float n = float(conditions.size()) + 2;
    const int gate = node(NodeType::CUTOFF, (n - 1) / n);
    for (int condition : conditions)
      link(condition, gate, 1 / n);
    link(g.zone, gate, 2 / n);
    return gate;
  }
  void assign(int indicator, int output, float delta) {
    if (std::abs(delta) < 1e-7f)
      return;
    link(indicator, cppn::INPUTS + output, delta / 2);
    base[output] += delta / 2;
  }

public:
  Builder() {
    for (int i = 0; i < next; ++i)
      genes->add_node({i, 1, NodeType::LINEAR});
    base[out::expression] = -1;
  }
  // The receptor outputs at a query gate; baseline relative to the neutral baseline.
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
  }
  std::shared_ptr<evolution::Genome> build(const Plan &plan) {
    for (const auto &g : plan.groups) {
      const auto values = outputs(g);
      const int gate = indicator(g);
      for (int k = 0; k < cppn::OUTPUTS; ++k)
        assign(gate, k, values[k] - (k == out::expression ? -1.f : 0.f));
      for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
        if (g.receptors[effect].active)
          receptor(indicator(g, effect), g.receptors[effect], effect == field::Output ? 1.f : 0.f);
    }
    // The body's growth receptor sits on the head's midline (field::GROWTH_RECEPTOR_SITE).
    if (plan.growth.active) {
      const auto &at = field::GROWTH_RECEPTOR_SITE;
      Group body;
      body.zone = at.zone;
      body.u0 = body.u1 = at.u;
      body.v0 = body.v1 = at.v;
      body.w0 = body.w1 = at.w;
      receptor(indicator(body, field::GROWTH_RECEPTOR), plan.growth, 0);
    }
    // Every cell has an output receptor of baseline +1 until its genotype overrides it.
    assign(effect_selector(field::Output), out::capacity, 1);
    for (int k = 0; k < cppn::OUTPUTS; ++k)
      link(cppn::BIAS, cppn::INPUTS + k, base[k]);
    genes->validate();
    return genes;
  }
};

// What a substance does in the developed brain: the brain runs `steps` steps without sensory input
// and without learning, once with no hormone and once with `level` of the substance (or at
// maturity `level` instead of `maturity` for the maturity substance). Reported: per cell group the
// mean change of activity and its dead cells, per organ drive (organ_drive order) the change,
// and the change of the body's growth (occupancy of its growth receptor).
void measure(const Genome &g, const std::vector<Group> &groups, int substance, float level,
             float maturity, int steps) {
  ensure(substance >= 0 && substance <= field::HORMONES && between(level, 0, 1) &&
             between(maturity, 0, 1) && steps > 0 && steps <= studio_plan::max_measure_steps,
         "invalid measurement request");
  const auto &t = *g.blueprint;
  std::vector<int> assignment(t.neurons.size(), -1);
  std::size_t sensors = 0;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    sensors += t.neurons[i].functions.sensory() > 0;
    for (std::size_t k = 0; k < groups.size(); ++k)
      if (groups[k].contains(t.neurons[i].location)) {
        assignment[i] = int(k);
        break;
      }
  }
  field::Network base(g.blueprint), variant(g.blueprint);
  field::Hormones none{}, dosed{};
  const bool maturing = substance == field::HORMONES;
  if (!maturing)
    dosed[std::size_t(substance)] = level;
  base.set_maturity(maturity);
  variant.set_maturity(maturing ? level : maturity);
  const std::vector<float> inputs(sensors, 0.f);
  for (auto *n : {&base, &variant})
    n->set_plasticity(false);
  for (int step = 0; step < steps; ++step) {
    base.step(inputs, none, 1);
    variant.step(inputs, dosed, 1);
  }
  std::vector<double> change(groups.size()), members(groups.size());
  std::vector<int> dead(groups.size());
  for (std::size_t i = 0; i < assignment.size(); ++i)
    if (const int k = assignment[i]; k >= 0) {
      change[std::size_t(k)] += variant.state()[i] - base.state()[i];
      ++members[std::size_t(k)];
      dead[std::size_t(k)] += variant.dead(i) && !base.dead(i);
    }
  const auto before = fishsim::continuous_organs(base.state(), *g.interface),
             after = fishsim::continuous_organs(variant.state(), *g.interface);
  std::cout << std::setprecision(4) << "{\"groups\":[";
  for (std::size_t k = 0; k < groups.size(); ++k)
    std::cout << (k ? "," : "") << change[k] / std::max(1., members[k]);
  std::cout << "],\"dead\":[";
  for (std::size_t k = 0; k < groups.size(); ++k)
    std::cout << (k ? "," : "") << dead[k];
  std::cout << "],\"organs\":[";
  for (std::size_t o = 0; o < before.values.size(); ++o)
    std::cout << (o ? "," : "")
              << ((after.present >> o) & 1 ? after.values[o] - before.values[o] : 0.);
  const auto &growth = t.growth_receptor;
  std::cout << "],\"growth\":" << growth.occupancy(dosed) - growth.occupancy(none)
            << ",\"substance\":" << substance << ",\"level\":" << level << "}\n";
}
std::string json(const std::string &s) {
  std::ostringstream out;
  out << '"';
  for (unsigned char c : s) {
    if (c == '"' || c == '\\')
      out << '\\' << char(c);
    else if (c < 32)
      out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << unsigned(c) << std::dec;
    else
      out << char(c);
  }
  return out.str() + '"';
}
void probe(const Genome &g, const std::vector<Group> &groups, int requested, int steps) {
  ensure(requested >= 0 && requested < int(groups.size()) && steps > 0 &&
             steps <= studio_plan::max_probe_steps,
         "invalid stimulus request");
  const auto &t = *g.blueprint;
  std::vector<int> assignment(t.neurons.size(), -1);
  std::vector<std::size_t> stimulated;
  std::size_t sensorCount = 0;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &n = t.neurons[i];
    if (n.functions.sensory() > 0)
      ++sensorCount;
    for (std::size_t k = 0; k < groups.size(); ++k)
      if (groups[k].contains(n.location)) {
        assignment[i] = int(k);
        break;
      }
    if (assignment[i] == requested && n.functional)
      stimulated.push_back(i);
  }
  ensure(!stimulated.empty(), "selected organ has no developed active cells");
  field::Network network(g.blueprint), baseline(g.blueprint);
  network.stimulate(stimulated, 1.0f, 1);
  std::cout << std::setprecision(4) << "{\"frames\":[";
  const std::vector<float> inputs(sensorCount, 0.f);
  for (int frame = 0; frame <= steps; ++frame) {
    if (frame) {
      network.step(inputs);
      baseline.step(inputs);
    }
    if (frame)
      std::cout << ',';
    std::vector<float> strength(groups.size());
    const auto &activity = network.state();
    const auto &unperturbed = baseline.state();
    for (std::size_t i = 0; i < activity.size(); ++i) {
      const int group = assignment[i];
      if (group >= 0)
        strength[std::size_t(group)] =
            std::max(strength[std::size_t(group)], std::max(0.f, activity[i] - unperturbed[i]));
    }
    std::cout << '[';
    for (std::size_t j = 0; j < strength.size(); ++j) {
      if (j)
        std::cout << ',';
      std::cout << strength[j];
    }
    std::cout << ']';
  }
  std::cout << "],\"source\":" << requested << ",\"stimulated\":" << stimulated.size() << "}\n";
}
void report(const Genome &g, const std::vector<Group> &groups) {
  const auto &t = *g.blueprint;
  std::cout << std::setprecision(8) << "{\"viable\":" << (g.viable() ? "true" : "false")
            << ",\"neurons\":" << t.neurons.size() << ",\"synapses\":" << t.edges.size()
            << ",\"queries\":" << t.queries
            << ",\"limited\":" << (t.resource_limited ? "true" : "false")
            << ",\"diagnostic\":" << json(t.diagnostic);
  const auto &a = *g.interface;
  std::cout << ",\"checks\":{\"sense\":" << (a.sensory_capacity > 0 ? "true" : "false")
            << ",\"swim\":" << (a.capacities[fishsim::organ_port::forward] > 0 ? "true" : "false")
            << ",\"mouth\":" << (a.suction_strength > 0 ? "true" : "false")
            << ",\"eggs\":" << (a.egg_parts[0] > 0 && a.egg_parts[1] > 0 ? "true" : "false")
            << ",\"sperm\":" << (a.sperm_parts[0] > 0 && a.sperm_parts[1] > 0 ? "true" : "false")
            << ",\"connections\":" << (!t.edges.empty() ? "true" : "false")
            << ",\"resources\":" << (!t.resource_limited ? "true" : "false") << '}';
  std::cout << ",\"eyeIntervals\":[";
  for (std::size_t side = 0; side < a.eye_intervals.size(); ++side) {
    if (side)
      std::cout << ',';
    std::cout << '[';
    bool intervalFirst = true;
    for (const auto &interval : a.eye_intervals[side]) {
      if (!intervalFirst)
        std::cout << ',';
      intervalFirst = false;
      std::cout << '[' << interval.first << ',' << interval.second << ']';
    }
    std::cout << ']';
  }
  // Developed retinal receptors are attached to their own placed group. An eye with
  // several centers keeps one physical origin and unions exactly those visual rays.
  std::vector<std::vector<std::pair<float, float>>> eye_groups(groups.size());
  for (const auto &receptor : a.sensory) {
    if (!receptor.visual() || !t.neurons[receptor.neuron].functional)
      continue;
    const auto &location = t.neurons[receptor.neuron].location;
    for (std::size_t i = 0; i < groups.size(); ++i)
      if (groups[i].contains(location)) {
        eye_groups[i].push_back({receptor.view_left, receptor.view_right});
        break;
      }
  }
  std::cout << "],\"eyeGroups\":[";
  for (std::size_t i = 0; i < eye_groups.size(); ++i) {
    if (i)
      std::cout << ',';
    auto &intervals = eye_groups[i];
    std::sort(intervals.begin(), intervals.end());
    std::vector<std::pair<float, float>> merged;
    for (const auto &interval : intervals)
      if (!merged.empty() && interval.first <= merged.back().second)
        merged.back().second = std::max(merged.back().second, interval.second);
      else
        merged.push_back(interval);
    std::cout << '[';
    for (std::size_t j = 0; j < merged.size(); ++j) {
      if (j)
        std::cout << ',';
      std::cout << '[' << merged[j].first << ',' << merged[j].second << ']';
    }
    std::cout << ']';
  }
  std::cout << "],\"fins\":[";
  for (std::size_t i = 0; i < a.fins.size(); ++i) {
    if (i)
      std::cout << ',';
    const auto &fin = a.fins[i];
    std::cout << "{\"cells\":" << fin.cells << ",\"strength\":" << fin.strength
              << ",\"x\":" << fin.x << ",\"y\":" << fin.y << ",\"spread\":" << fin.spread << '}';
  }
  std::cout << "],\"anatomy\":[";
  for (std::size_t i = 0; i < a.anatomy.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << a.anatomy[i];
  }
  const auto &growth = t.growth_receptor;
  std::cout << "],\"growth\":{\"sensitivity\":" << growth.sensitivity << ",\"half\":" << growth.half
            << ",\"steepness\":" << growth.steepness << ",\"affinity\":[";
  for (int k = 0; k < field::HORMONES; ++k)
    std::cout << (k ? "," : "") << growth.affinity[k];
  std::cout << "]},\"restingAbsorption\":[";
  for (std::size_t i = 0; i < a.resting_absorption.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << a.resting_absorption[i];
  }
  std::cout << ']';
  std::vector<int> group(t.neurons.size(), -1), sites(groups.size()), cells(groups.size());
  using EffectSummary = std::array<std::array<double, 4>, field::HORMONE_EFFECTS>;
  std::vector<EffectSummary> receptor_sums(groups.size());
  std::vector<std::array<int, field::HORMONE_EFFECTS>> receptor_counts(groups.size());
  // The developed class of a group's nerve cells (field::cell_class): sign, learning mode,
  // rhythm and modulation, averaged over its cells.
  std::vector<std::array<double, 4>> class_sums(groups.size());
  std::vector<int> nerve_cells(groups.size());
  std::map<std::uint32_t, int> copies;
  for (const auto &n : t.neurons)
    ++copies[n.group];
  std::cout << ",\"sites\":[";
  std::map<std::uint32_t, bool> seen;
  bool first = true;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &n = t.neurons[i];
    for (std::size_t j = 0; j < groups.size(); ++j)
      if (groups[j].contains(n.location)) {
        group[i] = int(j);
        break;
      }
    if (group[i] >= 0) {
      ++cells[group[i]];
      if (n.role == field::Role::Nerve) {
        const auto c = field::cell_class(n);
        auto &sum = class_sums[group[i]];
        sum[0] += c.sign;
        sum[1] += c.mode;
        sum[2] += c.pace;
        sum[3] += c.modulator;
        ++nerve_cells[group[i]];
      }
      if (!seen[n.group])
        ++sites[group[i]];
      for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
        if (!field::hormone_effect_present(n.role, effect))
          continue;
        const auto &r = n.hormone_receptors[effect];
        auto &v = receptor_sums[group[i]][effect];
        ++receptor_counts[group[i]][effect];
        v[0] += r.baseline;
        v[1] += r.sensitivity;
        v[2] += r.half;
        v[3] += r.affinity[groups[group[i]].receptors[effect].substance];
      }
    }
    if (seen[n.group])
      continue;
    seen[n.group] = true;
    if (!first)
      std::cout << ',';
    first = false;
    int function = -1;
    for (int k = 0; k < field::SENSE_COUNT; ++k)
      if (n.functions.senses[k] > 0)
        function = k;
    for (int k = 0; k < field::MOTOR_COUNT; ++k)
      if (n.functions.motors[k] > 0)
        function = k;
    std::cout << "{\"id\":" << n.id << ",\"zone\":" << n.location.zone
              << ",\"side\":" << n.location.side << ",\"u\":" << n.location.u
              << ",\"v\":" << n.location.v << ",\"w\":" << n.location.w
              << ",\"role\":" << int(n.role) << ",\"function\":" << function
              << ",\"cells\":" << copies[n.group] << ",\"group\":" << group[i] << '}';
  }
  std::cout << "],\"groups\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << "{\"name\":" << json(groups[i].name) << ",\"sites\":" << sites[i]
              << ",\"cells\":" << cells[i] << ",\"receptors\":[";
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
      if (effect)
        std::cout << ',';
      const int count = receptor_counts[i][effect];
      if (!count) {
        std::cout << "null";
        continue;
      }
      std::cout << '[' << count;
      for (double v : receptor_sums[i][effect])
        std::cout << ',' << v / count;
      std::cout << ']';
    }
    std::cout << "],\"nerve\":";
    if (nerve_cells[i]) {
      std::cout << '[';
      for (int k = 0; k < 4; ++k)
        std::cout << (k ? "," : "") << class_sums[i][k] / nerve_cells[i];
      std::cout << ']';
    } else
      std::cout << "null";
    std::cout << '}';
  }
  std::cout << "],\"contacts\":[";
  std::map<std::pair<int, int>, std::pair<int, double>> contacts;
  for (const auto &e : t.edges)
    if (group[e.source] >= 0 && group[e.target] >= 0) {
      auto &v = contacts[{group[e.source], group[e.target]}];
      ++v.first;
      v.second += e.weight;
    }
  first = true;
  for (const auto &[key, v] : contacts) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << key.first << ',' << key.second << ',' << v.first << ','
              << v.second / v.first << ']';
  }
  std::cout << "],\"cppn\":{\"nodes\":[";
  first = true;
  for (const auto &n : g.cppn->get_node_genes()) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << n.get_id() << ',' << int(n.get_type()) << ',' << n.get_weight() << ','
              << int(n.get_role()) << ']';
  }
  std::cout << "],\"links\":[";
  first = true;
  for (const auto &e : g.cppn->get_connection_genes()) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << e.get_innovation_number() << ',' << e.get_source() << ',' << e.get_target()
              << ',' << e.get_weight() << ',' << (e.get_enabled() ? 1 : 0) << ',' << e.get_port()
              << ']';
  }
  std::cout << "]}}\n";
}
}

int main(int argc, char **argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "sites") {
      std::cout << "{\"sites\":[";
      for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
        const cppn::Point p = field::development_site(i);
        int sensors = 0, motors = 0;
        for (int corner = 0; corner < 4; ++corner)
          for (int variant = 0; variant < 2; ++variant) {
            const int sense = field::development_function(p, field::Role::Sensor, corner, variant);
            const int motor =
                field::development_function(p, field::Role::Effector, corner, variant);
            if (sense >= 0)
              sensors |= (1 << sense);
            if (motor >= 0)
              motors |= (1 << motor);
          }
        if (i)
          std::cout << ',';
        std::cout << "{\"id\":" << i << ",\"zone\":" << p.zone << ",\"side\":" << p.side
                  << ",\"u\":" << p.u << ",\"v\":" << p.v << ",\"w\":" << p.w
                  << ",\"outer\":" << (field::development_surface(p) ? "true" : "false")
                  << ",\"senses\":" << sensors << ",\"motors\":" << motors << '}';
      }
      std::cout << "],\"hormones\":" << field::HORMONES << ",\"regulators\":" << field::REGULATORS
                << ",\"bloodSubstances\":" << field::BLOOD_SUBSTANCES
                << ",\"effects\":" << field::HORMONE_EFFECTS
                << ",\"sensitivitySpan\":" << field::HORMONE_SENSITIVITY_SPAN
                << ",\"steepnessSteps\":" << field::HORMONE_STEEPNESS_STEPS << ",\"halfRange\":["
                << field::HORMONE_HALF_MIN << ',' << field::HORMONE_HALF_MAX << "],\"sigmaRange\":["
                << field::HORMONE_SIGMA_MIN << ',' << field::HORMONE_SIGMA_MAX
                << "],\"roleEffects\":[";
      for (int role = 0; role < 3; ++role) {
        std::cout << (role ? ",[" : "[");
        bool first = true;
        for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
          if (field::hormone_effect_present(field::Role(role), effect)) {
            std::cout << (first ? "" : ",") << effect;
            first = false;
          }
        std::cout << ']';
      }
      std::cout << "]}\n";
      return 0;
    }
    if (argc < 3)
      throw std::invalid_argument(
          "usage: atelier build|new output | inspect genome | edit source output");
    Genome::begin_run(42);
    const std::string operation = argv[1];
    Genome g;
    int probeGroup = -1, probeSteps = 12;
    struct {
      int substance = 0, steps = 1;
      float level = 0, maturity = 0;
    } measured;
    std::vector<Group> groups;
    if (operation == "build" && argc == 3) {
      std::string name;
      auto plan = read_plan(std::cin, name);
      g.cppn = Builder().build(plan);
      groups = std::move(plan.groups);
      g.development_seed = 1;
      g.variation_seed = 2;
      g.name = name;
    } else if (operation == "new" && argc == 3) {
      std::string example;
      ensure(bool(std::cin >> example) && (example == "blank" || example == "sum"),
             "unknown CPPN example");
      g.cppn = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
      for (int id = 0; id < cppn::INPUTS + cppn::OUTPUTS; ++id)
        g.cppn->add_node({id, 1, NodeType::LINEAR});
      if (example == "sum") {
        ensure(g.cppn->connect(cppn::input::u, cppn::INPUTS + out::expression, 1.f),
               "cannot connect addition input");
        ensure(g.cppn->connect(cppn::input::v, cppn::INPUTS + out::expression, 1.f),
               "cannot connect addition input");
      }
      g.development_seed = 1;
      g.variation_seed = 2;
      g.name = example == "sum" ? "Addition aus zwei Eingängen" : "Neues CPPN";
    } else if ((operation == "inspect" && argc == 3) || (operation == "edit" && argc == 4) ||
               (operation == "probe" && argc == 3) || (operation == "measure" && argc == 3)) {
      std::ifstream input(argv[2]);
      ensure(bool(input), "genome not found");
      g = Genome::read(input, false);
      if (operation == "probe") {
        ensure(bool(std::cin >> probeGroup >> probeSteps), "missing stimulus parameters");
        std::string ignoredName;
        groups = read_plan(std::cin, ignoredName).groups;
      }
      if (operation == "measure") {
        ensure(bool(std::cin >> measured.substance >> measured.level >> measured.maturity >>
                    measured.steps),
               "missing measurement parameters");
        std::string ignoredName;
        groups = read_plan(std::cin, ignoredName).groups;
      }
      if (operation == "edit") {
        std::string command;
        ensure(bool(std::cin >> command), "missing CPPN edit");
        if (command == "node") {
          int id, type;
          float param;
          ensure(bool(std::cin >> id >> type >> param) && type >= 0 && type <= 10 &&
                     between(param, -16, 16),
                 "invalid node edit");
          g.cppn->edit_node(id, param, NodeType(type));
        } else if (command == "link") {
          int innovation, enabled;
          float weight;
          ensure(bool(std::cin >> innovation >> weight >> enabled) && between(weight, -16, 16) &&
                     (enabled == 0 || enabled == 1),
                 "invalid link edit");
          g.cppn->edit_connection(innovation, weight, bool(enabled));
        } else if (command == "connect") {
          int from, to, port;
          float weight;
          ensure(bool(std::cin >> from >> to >> weight >> port) && between(weight, -16, 16) &&
                     (port == 0 || port == 1),
                 "invalid new link");
          ensure(g.cppn->connect(from, to, weight, port), "CPPN link refused");
        } else if (command == "split") {
          int innovation;
          ensure(bool(std::cin >> innovation) && g.cppn->split_connection(innovation),
                 "CPPN split refused");
        } else if (command == "add-node") {
          int type;
          float param;
          ensure(bool(std::cin >> type >> param) && type >= 0 && type <= 10 &&
                     between(param, -16, 16) && g.cppn->nodes() < 1024,
                 "invalid new CPPN node");
          int id = cppn::INPUTS + cppn::OUTPUTS;
          for (const auto &n : g.cppn->get_node_genes())
            id = std::max(id, n.get_id() + 1);
          g.cppn->add_node({id, param, NodeType(type)});
        } else
          throw std::invalid_argument("unknown CPPN edit");
      }
    } else
      throw std::invalid_argument("unknown atelier operation");
    g.compile(false);
    if (operation == "probe") {
      probe(g, groups, probeGroup, probeSteps);
      return 0;
    }
    if (operation == "measure") {
      measure(g, groups, measured.substance, measured.level, measured.maturity, measured.steps);
      return 0;
    }
    if (operation != "inspect")
      g.save(argv[operation == "edit" ? 3 : 2]);
    report(g, groups);
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
