#include <cstdint>
#include <queue>
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
CPPN::CPPN(std::shared_ptr<evolution::Genome> genome) : genes(genome) {
  if (!genome || genome->inputs() != INPUTS || genome->outputs() != OUTPUTS)
    throw std::invalid_argument("current CPPN needs ten inputs and twenty outputs");
  for (int k = 1; k < 6; ++k) {
    const auto *n = genome->get_node(INPUTS + k);
    if (!n || n->get_type() != evolution::NodeType::LINEAR || n->get_weight() != 1)
      throw std::invalid_argument("identity outputs require linear unit gain");
  }
  input_count = genome->inputs();
  output_count = genome->outputs();
  input_buffer.resize(input_count - 1);
  output_buffer.resize(output_count);
  genome->validate();
  std::unordered_map<int, const evolution::NodeGene *> nodes;
  nodes.reserve(genome->nodes());
  for (const auto &n : genome->get_node_genes())
    nodes.emplace(n.get_id(), &n);
  // Genotype copies remain independent; only identical computations are shared.
  struct Term {
    int source;
    float weight;
    int port;
  };
  std::unordered_map<int, std::vector<Term>> incoming;
  std::unordered_map<int, std::vector<int>> children;
  std::unordered_map<int, int> degree;
  for (auto &n : genome->get_node_genes())
    degree[n.get_id()] = 0;
  for (auto &c : genome->get_connection_genes())
    if (c.get_enabled()) {
      incoming[c.get_target()].push_back({c.get_source(), c.get_weight(), c.get_port()});
      children[c.get_source()].push_back(c.get_target());
      ++degree[c.get_target()];
    }
  std::priority_queue<int, std::vector<int>, std::greater<int>> ready;
  for (auto &n : degree)
    if (n.second == 0)
      ready.push(n.first);
  std::unordered_map<int, int> representative;
  std::unordered_map<int, float> multiplier;
  std::unordered_map<int, bool> relays;
  std::unordered_map<int, std::vector<Term>> rows;
  std::unordered_map<std::string, int> expressions;
  for (auto *table : {&incoming, &rows})
    table->reserve(nodes.size());
  representative.reserve(nodes.size());
  multiplier.reserve(nodes.size());
  relays.reserve(nodes.size());
  expressions.reserve(nodes.size());
  std::vector<int> hidden;
  while (!ready.empty()) {
    int id = ready.top();
    ready.pop();
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
  for (const auto &[id, source] : representative)
    work_aliases[id] = {source, multiplier[id], relays[id]};
  ann::Network::Compiled code;
  code.inputs = input_count - 1;
  code.bias = 1;
  code.outputs = output_count;
  code.activation = &activation;
  for (int id = 0; id < int(input_count); ++id)
    code.ids.push_back(id);
  code.ids.insert(code.ids.end(), hidden.begin(), hidden.end());
  for (int id = int(input_count); id < int(input_count + output_count); ++id)
    code.ids.push_back(id);
  std::unordered_map<int, std::size_t> indices;
  for (std::size_t i = 0; i < code.ids.size(); ++i)
    indices.emplace(code.ids[i], i);
  for (std::size_t i = 0; i < code.ids.size(); ++i) {
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
  net = std::make_unique<ann::Network>(std::move(code));
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
