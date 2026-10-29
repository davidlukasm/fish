#include <cstdint>
#include <queue>
#include <sstream>
#include <cstring>
#include <unordered_map>
#include "cppn.hh"
#include "node.hh"
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
  std::vector<std::unique_ptr<Node>> owned;
  std::map<int, Node *> ids;
  ann::NodeCollection collection;
  auto add = [&](int id) {
    owned.emplace_back(new Node(*genome->get_node(id)));
    ids[id] = owned.back().get();
    collection.add_node(owned.back().get());
  };
  // Genotype copies remain independent; only identical computations are shared.
  struct Term {
    int source;
    float weight;
    int port;
  };
  std::map<int, std::vector<Term>> incoming;
  std::map<int, std::vector<int>> children;
  std::map<int, int> degree;
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
  std::map<int, int> representative;
  std::map<int, float> multiplier;
  std::map<int, bool> relays;
  std::map<int, std::vector<Term>> rows;
  std::map<std::string, int> expressions;
  std::vector<int> hidden;
  while (!ready.empty()) {
    int id = ready.top();
    ready.pop();
    const auto *n = genome->get_node(id);
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
  for (int id = 0; id < int(input_count); ++id)
    add(id);
  for (int id : hidden)
    add(id);
  for (int id = int(input_count); id < int(input_count) + genome->outputs(); ++id)
    add(id);
  for (auto &row : rows)
    for (auto &t : row.second)
      ids.at(t.source)->connect_to(ids.at(row.first), t.weight, t.port);
  net.reset(new ann::Network(input_count - 1, 1, output_count, &Node::activation, collection));
  net->output_tanh(0);
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
