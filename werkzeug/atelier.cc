#include "../src/genome.hh"
#include "field/hormones.hh"
#include "field/functions.hh"
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
using fishsim::Genome;
using evolution::NodeType;
namespace out = cppn::output;
namespace {
constexpr double PI = 3.14159265358979323846;

struct Receptor {
  bool active = false;
  float baseline = 0, sensitivity = 0, half = .05f, width = 0;
  int substance = 0;
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
    return p.zone == zone && (!side || p.side == side) &&
           p.u >= u0-eps && p.u <= u1+eps && p.v >= v0-eps && p.v <= v1+eps &&
           p.w >= w0-eps && p.w <= w1+eps;
  }
};

void ensure(bool valid, const char *why) {
  if (!valid) throw std::invalid_argument(why);
}
bool between(float x, float a, float b) { return std::isfinite(x) && x >= a && x <= b; }

std::vector<Group> read_plan(std::istream &input, std::string &name) {
  int count = 0;
  ensure(bool(input >> std::quoted(name) >> count) && !name.empty() && name.size() <= 40 &&
         count > 0 && count <= 80, "invalid plan header");
  std::vector<Group> groups;
  for (int i = 0; i < count; ++i) {
    Group g;
    ensure(bool(input >> std::quoted(g.name) >> g.zone >> g.side >> g.u0 >> g.u1 >> g.v0 >>
                g.v1 >> g.w0 >> g.w1 >> g.role >> g.function >> g.copies >> g.threshold >>
                g.tau >> g.field >> g.q1 >> g.q2 >> g.qwidth >> g.sign >> g.mode >> g.pace >>
                g.modulator >> g.sender1 >> g.sender2 >> g.receiver1 >> g.receiver2 >>
                g.sigma >> g.crossing >> g.range), "invalid cell group");
    ensure(!g.name.empty() && g.name.size() <= 60 && g.zone >= 0 && g.zone < 4 &&
           g.side >= -1 && g.side <= 1 && g.role >= 0 && g.role <= 2 &&
           g.function >= -1 && g.function <= 10 && g.copies >= 1 && g.copies <= 16 &&
           between(g.u0, 0, 1) && between(g.u1, g.u0, 1) &&
           between(g.v0, 0, 1) && between(g.v1, g.v0, 1) &&
           between(g.w0, 0, 1) && between(g.w1, g.w0, 1), "invalid cell coordinates");
    for (float x : {g.threshold, g.q1, g.q2, g.sign, g.mode, g.pace, g.modulator,
                    g.sender1, g.sender2, g.receiver1, g.receiver2, g.crossing})
      ensure(between(x, -1, 1), "cell property outside -1..1");
    for (float x : {g.tau, g.field, g.qwidth, g.range})
      ensure(between(x, 0, 1), "cell property outside 0..1");
    ensure(between(g.sigma, .03f, 2), "invalid contact width");
    for (auto &r : g.receptors) {
      int active = 0;
      ensure(bool(input >> active >> r.baseline >> r.sensitivity >> r.half >> r.substance >>
                  r.width), "invalid receptor");
      ensure((active == 0 || active == 1) && between(r.baseline, -1, 1) &&
             between(r.sensitivity, -1, 1) && between(r.half, .0003f, 1) &&
             r.substance >= 0 && r.substance < field::REGULATORS &&
             between(r.width, 0, 1), "invalid receptor properties");
      r.active = active != 0;
    }
    groups.push_back(std::move(g));
  }
  return groups;
}

std::pair<int, int> corner(int role, int function) {
  if (role == 0) {
    switch (function) {
    case field::Light: return {0, 0};
    case field::Proximity: return {0, 1};
    case field::Flow: return {1, 0};
    case field::Odor: case field::Blood: case field::Intake: return {2, 0};
    case field::Damage: return {3, 1};
    default: return {3, 0};
    }
  }
  switch (function) {
  case field::Defense: return {1, 0};
  case field::Pigment: return {3, 0};
  case field::Gland: case field::Bladder: case field::Eggs: return {2, 0};
  case field::Sperm: return {2, 1};
  default: return {0, 0};
  }
}

std::array<float, cppn::OUTPUTS> outputs(const Group &g) {
  std::array<float, cppn::OUTPUTS> v{};
  auto raw = [](float x) { return 2*x - 1; };
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
  v[out::search_width] = raw(float(std::log(g.sigma/.03f)/std::log(2/.03f)));
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
    if (old != tests.end()) return old->second;
    const int id = node(NodeType::CUTOFF, sign*limit);
    link(input, id, float(sign));
    return tests[key] = id;
  }
  int effect_selector(int effect) {
    const auto old = selectors.find(effect);
    if (old != selectors.end()) return old->second;
    const int delta = node(NodeType::ABS, -float(1+effect)/field::HORMONE_EFFECTS);
    const int selected = node(NodeType::SIGN, 1.f/(4*field::HORMONE_EFFECTS));
    link(cppn::input::effect, delta, 1);
    link(delta, selected, -1);
    return selectors[effect] = selected;
  }
  int indicator(const Group &g, int effect = -1) {
    std::vector<int> conditions{effect < 0
        ? test(cppn::input::effect, -1, 1.f/(2*field::HORMONE_EFFECTS))
        : effect_selector(effect)};
    auto bounds = [&](int input, float lo, float hi) {
      if (lo > 0) conditions.push_back(test(input, 1, lo-.0001f));
      if (hi < 1) conditions.push_back(test(input, -1, hi+.0001f));
    };
    bounds(cppn::input::u, g.u0, g.u1);
    bounds(cppn::input::v, g.v0, g.v1);
    bounds(cppn::input::w, g.w0, g.w1);
    if (g.side) conditions.push_back(test(cppn::input::side, g.side, 0));
    // The four zones are one-hot inputs (0 or 1). An active zone contributes
    // twice as much as one signed condition, just as in v019's fischbau.
    const float n = float(conditions.size()) + 2;
    const int gate = node(NodeType::CUTOFF, (n-1)/n);
    for (int condition : conditions) link(condition, gate, 1/n);
    link(g.zone, gate, 2/n);
    return gate;
  }
  void assign(int indicator, int output, float delta) {
    if (std::abs(delta) < 1e-7f) return;
    link(indicator, cppn::INPUTS+output, delta/2);
    base[output] += delta/2;
  }
public:
  Builder() {
    for (int i = 0; i < next; ++i)
      genes->add_node({i, 1, NodeType::LINEAR});
    base[out::expression] = -1;
  }
  std::shared_ptr<evolution::Genome> build(const std::vector<Group> &groups) {
    for (const auto &g : groups) {
      const auto values = outputs(g);
      const int gate = indicator(g);
      for (int k = 0; k < cppn::OUTPUTS; ++k)
        assign(gate, k, values[k] - (k == out::expression ? -1.f : 0.f));
      for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
        const auto &r = g.receptors[effect];
        if (!r.active) continue;
        const int receptor = indicator(g, effect);
        const float a = float(2*PI*r.substance/field::BLOOD_SUBSTANCES);
        const float half = float(2*std::log(r.half/field::HORMONE_HALF_MIN) /
            std::log(field::HORMONE_HALF_MAX/field::HORMONE_HALF_MIN)-1);
        assign(receptor, out::capacity, r.baseline - (effect == field::Output ? 1.f : 0.f));
        assign(receptor, out::field_width, r.sensitivity);
        assign(receptor, out::threshold, half);
        assign(receptor, out::quality1, std::cos(a));
        assign(receptor, out::quality2, std::sin(a));
        assign(receptor, out::quality_width, 2*r.width-1);
      }
    }
    // Every cell has an output receptor of baseline +1 until its genotype overrides it.
    assign(effect_selector(field::Output), out::capacity, 1);
    for (int k = 0; k < cppn::OUTPUTS; ++k)
      link(cppn::BIAS, cppn::INPUTS+k, base[k]);
    genes->validate();
    return genes;
  }
};

std::string json(const std::string &s) {
  std::ostringstream out;
  out << '"';
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') out << '\\' << char(c);
    else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                          << unsigned(c) << std::dec;
    else out << char(c);
  }
  return out.str() + '"';
}
void report(const Genome &g, const std::vector<Group> &groups) {
  const auto &t = *g.blueprint;
  std::cout << std::setprecision(8) << "{\"viable\":" << (g.viable()?"true":"false")
            << ",\"neurons\":" << t.neurons.size() << ",\"synapses\":" << t.edges.size()
            << ",\"queries\":" << t.queries << ",\"limited\":"
            << (t.resource_limited?"true":"false") << ",\"diagnostic\":" << json(t.diagnostic);
  const auto &a = *g.interface;
  std::cout << ",\"checks\":{\"sense\":" << (a.sensory_capacity > 0 ? "true":"false")
            << ",\"swim\":" << (a.capacities[fishsim::organ_port::forward] > 0 ? "true":"false")
            << ",\"mouth\":" << (a.suction_strength > 0 ? "true":"false")
            << ",\"eggs\":" << (a.egg_parts[0] > 0 && a.egg_parts[1] > 0 ? "true":"false")
            << ",\"sperm\":" << (a.sperm_parts[0] > 0 && a.sperm_parts[1] > 0 ? "true":"false")
            << ",\"connections\":" << (!t.edges.empty()?"true":"false")
            << ",\"resources\":" << (!t.resource_limited?"true":"false") << '}';
  std::vector<int> group(t.neurons.size(), -1), sites(groups.size()), cells(groups.size());
  using EffectSummary = std::array<std::array<double, 4>, field::HORMONE_EFFECTS>;
  std::vector<EffectSummary> receptor_sums(groups.size());
  std::vector<std::array<int, field::HORMONE_EFFECTS>> receptor_counts(groups.size());
  std::map<std::uint32_t, int> copies;
  for (const auto &n : t.neurons) ++copies[n.group];
  std::cout << ",\"sites\":[";
  std::map<std::uint32_t, bool> seen;
  bool first = true;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &n = t.neurons[i];
    for (std::size_t j = 0; j < groups.size(); ++j)
      if (groups[j].contains(n.location)) { group[i] = int(j); break; }
    if (group[i] >= 0) {
      ++cells[group[i]];
      if (!seen[n.group]) ++sites[group[i]];
      for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
        if (!(effect == field::Output || effect == field::Death || n.role == field::Role::Nerve ||
              (n.role == field::Role::Effector && effect == field::Excitation))) continue;
        const auto &r = n.hormone_receptors[effect];
        auto &v = receptor_sums[group[i]][effect];
        ++receptor_counts[group[i]][effect];
        v[0] += r.baseline;
        v[1] += r.sensitivity;
        v[2] += r.half;
        v[3] += r.affinity[groups[group[i]].receptors[effect].substance];
      }
    }
    if (seen[n.group]) continue;
    seen[n.group] = true;
    if (!first) std::cout << ',';
    first = false;
    int function = -1;
    for (int k = 0; k < field::SENSE_COUNT; ++k)
      if (n.functions.senses[k] > 0) function = k;
    for (int k = 0; k < field::MOTOR_COUNT; ++k)
      if (n.functions.motors[k] > 0) function = k;
    std::cout << "{\"id\":" << n.id << ",\"zone\":" << n.location.zone
              << ",\"side\":" << n.location.side << ",\"u\":" << n.location.u
              << ",\"v\":" << n.location.v << ",\"w\":" << n.location.w
              << ",\"role\":" << int(n.role) << ",\"function\":" << function
              << ",\"cells\":" << copies[n.group] << ",\"group\":" << group[i] << '}';
  }
  std::cout << "],\"groups\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    if (i) std::cout << ',';
    std::cout << "{\"name\":" << json(groups[i].name) << ",\"sites\":" << sites[i]
              << ",\"cells\":" << cells[i] << ",\"receptors\":[";
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
      if (effect) std::cout << ',';
      const int count = receptor_counts[i][effect];
      if (!count) { std::cout << "null"; continue; }
      std::cout << '[' << count;
      for (double v : receptor_sums[i][effect]) std::cout << ',' << v/count;
      std::cout << ']';
    }
    std::cout << "]}";
  }
  std::cout << "],\"contacts\":[";
  std::map<std::pair<int,int>, std::pair<int,double>> contacts;
  for (const auto &e : t.edges)
    if (group[e.source] >= 0 && group[e.target] >= 0) {
      auto &v = contacts[{group[e.source], group[e.target]}];
      ++v.first;
      v.second += e.weight;
    }
  first = true;
  for (const auto &[key,v] : contacts) {
    if (!first) std::cout << ',';
    first = false;
    std::cout << '[' << key.first << ',' << key.second << ',' << v.first << ','
              << v.second/v.first << ']';
  }
  std::cout << "],\"cppn\":{\"nodes\":[";
  first = true;
  for (const auto &n : g.cppn->get_node_genes()) {
    if (!first) std::cout << ',';
    first = false;
    std::cout << '[' << n.get_id() << ',' << int(n.get_type()) << ',' << n.get_weight()
              << ',' << int(n.get_role()) << ']';
  }
  std::cout << "],\"links\":[";
  first = true;
  for (const auto &e : g.cppn->get_connection_genes()) {
    if (!first) std::cout << ',';
    first = false;
    std::cout << '[' << e.get_innovation_number() << ',' << e.get_source() << ','
              << e.get_target() << ',' << e.get_weight() << ',' << (e.get_enabled()?1:0)
              << ',' << e.get_port() << ']';
  }
  std::cout << "]}}\n";
}
}

int main(int argc, char **argv) {
  try {
    if (argc < 3) throw std::invalid_argument("usage: atelier build|new output | inspect genome | edit source output");
    Genome::begin_run(42);
    const std::string operation = argv[1];
    Genome g;
    std::vector<Group> groups;
    if (operation == "build" && argc == 3) {
      std::string name;
      groups = read_plan(std::cin, name);
      g.cppn = Builder().build(groups);
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
    } else if ((operation == "inspect" && argc == 3) ||
               (operation == "edit" && argc == 4)) {
      std::ifstream input(argv[2]);
      ensure(bool(input), "genome not found");
      g = Genome::read(input, false);
      if (operation == "edit") {
        std::string command;
        ensure(bool(std::cin >> command), "missing CPPN edit");
        if (command == "node") {
          int id, type;
          float param;
          ensure(bool(std::cin >> id >> type >> param) && type >= 0 && type <= 10 &&
                 between(param, -16, 16), "invalid node edit");
          g.cppn->edit_node(id, param, NodeType(type));
        } else if (command == "link") {
          int innovation, enabled;
          float weight;
          ensure(bool(std::cin >> innovation >> weight >> enabled) && between(weight, -16, 16)
                 && (enabled == 0 || enabled == 1), "invalid link edit");
          g.cppn->edit_connection(innovation, weight, bool(enabled));
        } else if (command == "connect") {
          int from, to, port;
          float weight;
          ensure(bool(std::cin >> from >> to >> weight >> port) && between(weight, -16, 16)
                 && (port == 0 || port == 1), "invalid new link");
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
        } else throw std::invalid_argument("unknown CPPN edit");
      }
    } else throw std::invalid_argument("unknown atelier operation");
    g.compile(false);
    if (operation != "inspect") g.save(argv[operation == "edit" ? 3 : 2]);
    report(g, groups);
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
