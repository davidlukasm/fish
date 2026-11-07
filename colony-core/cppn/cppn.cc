#include <cstdint>
#include <queue>
#include <limits>
#include <sstream>
#include <cstring>
#include <unordered_map>
#include "cppn.hh"
#include "activation.hh"
#include <vector>
#include <map>
#include <cmath>
#include <stdexcept>
#include <ostream>
namespace cppn {
struct CPPN::PreparationState {
  enum Stage {
    Validate,
    Nodes,
    Edges,
    Roots,
    Canonical,
    Aliases,
    Indices,
    Rows,
    Network,
    Done
  } stage = Validate;
  struct Term {
    int source;
    float weight;
    int port;
  };
  std::unordered_map<int, const evolution::NodeGene *> nodes;
  std::unordered_map<int, std::vector<Term>> incoming, rows;
  std::unordered_map<int, std::vector<int>> children;
  std::unordered_map<int, int> degree, representative;
  std::unordered_map<int, float> multiplier;
  std::unordered_map<int, bool> relays;
  std::unordered_map<std::string, int> expressions;
  std::priority_queue<int, std::vector<int>, std::greater<int>> ready;
  std::vector<int> hidden;
  std::unordered_map<int, std::size_t> indices;
  std::list<evolution::NodeGene>::const_iterator node;
  std::size_t cursor = 0;
  ann::Network::Compiled code;
  explicit PreparationState(const evolution::Genome &g) : node(g.get_node_genes().begin()) {
    nodes.reserve(g.nodes());
    incoming.reserve(g.nodes());
    rows.reserve(g.nodes());
    representative.reserve(g.nodes());
    multiplier.reserve(g.nodes());
    relays.reserve(g.nodes());
    expressions.reserve(g.nodes());
  }
  void canonicalize(int id) {
    const auto *n = nodes.at(id);
    if (n->get_role() == evolution::NodeRole::Input) {
      representative[id] = id;
      multiplier[id] = 1;
    } else {
      std::map<std::pair<int, int>, double> sums;
      for (auto &t : incoming[id])
        sums[{representative.at(t.source), t.port}] += double(t.weight) * multiplier.at(t.source);
      std::vector<Term> terms;
      for (auto &t : sums)
        if (float(t.second) != 0)
          terms.push_back({t.first.first, float(t.second), t.first.second});
      bool relay = false;
      if (n->get_role() == evolution::NodeRole::Hidden &&
          n->get_type() == evolution::NodeType::LINEAR && n->get_weight() == 1 &&
          terms.size() == 1) {
        auto &t = terms[0];
        int exponent = 0;
        float mantissa = std::frexp(std::abs(t.weight), &exponent);
        const float bound = 1;
        relay = mantissa == .5f && std::abs(t.weight) * bound <= 1;
        if (relay) {
          representative[id] = t.source;
          multiplier[id] = t.weight;
        }
      }
      relays[id] = relay;
      if (!relay) {
        std::string key;
        auto append = [&](std::uint32_t value) {
          key.append(reinterpret_cast<const char *>(&value), sizeof(value));
        };
        append(std::uint32_t(n->get_type()));
        std::uint32_t bits;
        float parameter = n->get_weight();
        std::memcpy(&bits, &parameter, sizeof(bits));
        append(bits);
        for (auto &t : terms) {
          append(std::uint32_t(t.source));
          append(std::uint32_t(t.port));
          std::memcpy(&bits, &t.weight, sizeof(bits));
          append(bits);
        }
        auto found = expressions.find(key);
        if (n->get_role() == evolution::NodeRole::Hidden && found != expressions.end()) {
          representative[id] = found->second;
          multiplier[id] = 1;
        } else {
          representative[id] = id;
          multiplier[id] = 1;
          rows[id] = std::move(terms);
          if (n->get_role() == evolution::NodeRole::Hidden) {
            hidden.push_back(id);
            expressions.emplace(std::move(key), id);
          }
        }
      }
    }
    for (int child : children[id])
      if (--degree[child] == 0)
        ready.push(child);
  }
  void emit(std::size_t i, std::size_t input_count) {
    const int id = code.ids[i];
    const auto *node = nodes.at(id);
    const auto offset = code.weights.size();
    for (const auto &term : rows[id]) {
      code.sources.push_back(indices.at(term.source));
      code.weights.push_back(term.weight);
      code.ports.push_back(term.port);
    }
    code.controls.push_back(
        {offset, code.weights.size() - offset, int(node->get_type()), node->get_weight()});
    if (i >= input_count)
      code.order.push_back(i);
  }
};
CPPN::CPPN(std::shared_ptr<evolution::Genome> genome, Preparation mode) : genes(genome) {
  if (!genome || genome->inputs() != INPUTS || genome->outputs() != OUTPUTS)
    throw std::invalid_argument("current CPPN interface required");
  for (int k = int(output::identity_role); k <= int(output::identity4); ++k) {
    const auto *n = genome->get_node(INPUTS + k);
    if (!n || n->get_type() != evolution::NodeType::LINEAR || n->get_weight() != 1)
      throw std::invalid_argument("identity outputs require linear unit gain");
  }
  input_count = genome->inputs();
  output_count = genome->outputs();
  input_buffer.resize(input_count - 1);
  output_buffer.resize(output_count);
  preparation = std::make_unique<PreparationState>(*genome);
  if (mode == Preparation::Immediate) {
    auto budget = std::numeric_limits<std::size_t>::max();
    prepare(budget);
  }
}
bool CPPN::prepare(std::size_t &budget) {
  if (net)
    return true;
  auto &s = *preparation;
  while (budget && s.stage != PreparationState::Done) {
    --budget;
    switch (s.stage) {
    case PreparationState::Validate:
      genes->validate();
      s.stage = PreparationState::Nodes;
      break;
    case PreparationState::Nodes:
      if (s.node != genes->get_node_genes().end()) {
        const auto &n = *s.node++;
        s.nodes.emplace(n.get_id(), &n);
        s.degree[n.get_id()] = 0;
      } else {
        s.stage = PreparationState::Edges;
        s.cursor = 0;
      }
      break;
    case PreparationState::Edges:
      if (s.cursor < genes->get_connection_genes().size()) {
        const auto &c = genes->get_connection_genes()[s.cursor++];
        if (c.get_enabled()) {
          s.incoming[c.get_target()].push_back({c.get_source(), c.get_weight(), c.get_port()});
          s.children[c.get_source()].push_back(c.get_target());
          ++s.degree[c.get_target()];
        }
      } else {
        s.stage = PreparationState::Roots;
        s.node = genes->get_node_genes().begin();
      }
      break;
    case PreparationState::Roots:
      if (s.node != genes->get_node_genes().end()) {
        const auto id = (s.node++)->get_id();
        if (!s.degree[id])
          s.ready.push(id);
      } else
        s.stage = PreparationState::Canonical;
      break;
    case PreparationState::Canonical:
      if (!s.ready.empty()) {
        const auto id = s.ready.top();
        s.ready.pop();
        s.canonicalize(id);
      } else {
        s.stage = PreparationState::Aliases;
        s.node = genes->get_node_genes().begin();
      }
      break;
    case PreparationState::Aliases:
      if (s.node != genes->get_node_genes().end()) {
        const auto id = (s.node++)->get_id();
        work_aliases[id] = {s.representative.at(id), s.multiplier.at(id), s.relays[id]};
      } else {
        auto &code = s.code;
        code.inputs = input_count - 1;
        code.bias = 1;
        code.outputs = output_count;
        code.activation = &activation;
        for (int id = 0; id < int(input_count); ++id)
          code.ids.push_back(id);
        code.ids.insert(code.ids.end(), s.hidden.begin(), s.hidden.end());
        for (int id = int(input_count); id < int(input_count + output_count); ++id)
          code.ids.push_back(id);
        s.stage = PreparationState::Indices;
        s.cursor = 0;
      }
      break;
    case PreparationState::Indices:
      if (s.cursor < s.code.ids.size()) {
        s.indices.emplace(s.code.ids[s.cursor], s.cursor);
        ++s.cursor;
      } else {
        s.stage = PreparationState::Rows;
        s.cursor = 0;
      }
      break;
    case PreparationState::Rows:
      if (s.cursor < s.code.ids.size())
        s.emit(s.cursor++, input_count);
      else
        s.stage = PreparationState::Network;
      break;
    case PreparationState::Network:
      net = std::make_unique<ann::Network>(std::move(s.code));
      s.stage = PreparationState::Done;
      break;
    case PreparationState::Done:
      break;
    }
  }
  if (net)
    preparation.reset();
  return bool(net);
}
CPPN::~CPPN() = default;
const std::vector<float> &CPPN::query_view(const Point &p) {
  reset();
  const auto values = cell_inputs(p);
  std::copy(values.begin(), values.end(), input_buffer.begin());
  net->set_input(input_buffer);
  net->step();
  for (std::size_t i = 0; i < output_count; ++i)
    output_buffer[i] = net->get(i);
  return output_buffer;
}
void CPPN::reset() {
  net->reset();
}
}
