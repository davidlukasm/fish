#include "genome.hh"
#include "cppn/cppn.hh"
#include "constants.hh"
#include "mutations.hh"
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <queue>
#include <sstream>
#include <iomanip>
#include <limits>
#include <stdexcept>
namespace evolution {
Genome::Genome(int i, int o, std::shared_ptr<History> h)
    : input_nodes(i), output_nodes(o), history_(h ? h : std::make_shared<History>()) {
  if (i < 1 || o < 1 || i > 100000 || o > 100000)
    throw std::invalid_argument("invalid input/output count");
}
const NodeGene *Genome::get_node(int id) const {
  for (const auto &n : node_genes)
    if (n.get_id() == id)
      return &n;
  return nullptr;
}
const ConnectionGene *Genome::get_gene(int i) const {
  for (const auto &c : connection_genes)
    if (c.get_innovation_number() == i)
      return &c;
  return nullptr;
}
std::pair<int, int> Genome::get_innovation_range() const {
  if (connection_genes.empty())
    return {-1, -1};
  int a = std::numeric_limits<int>::max(), b = -1;
  for (const auto &c : connection_genes) {
    a = std::min(a, c.get_innovation_number());
    b = std::max(b, c.get_innovation_number());
  }
  return {a, b};
}
bool Genome::is_in_range(int id) const {
  auto r = get_innovation_range();
  return r.first >= 0 && id >= r.first && id <= r.second;
}
void Genome::add_node(NodeGene n) {
  if (get_node(n.get_id()))
    throw std::invalid_argument("duplicate node id");
  n.set_role(n.get_id() < input_nodes                  ? NodeRole::Input
             : n.get_id() < input_nodes + output_nodes ? NodeRole::Output
                                                       : NodeRole::Hidden);
  if (n.get_role() == NodeRole::Input)
    n.set_branch(-1);
  else if (input_nodes == cppn::INPUTS && output_nodes == int(cppn::output::count) &&
           n.get_role() == NodeRole::Output)
    n.set_branch(cppn::output::branch(std::size_t(n.get_id() - input_nodes)));
  history_->observe_node(n.get_id());
  node_genes.push_back(n);
}
void Genome::add_connection(const ConnectionGene &c) {
  if (get_gene(c.get_innovation_number()))
    throw std::invalid_argument("duplicate innovation id");
  for (const auto &old : connection_genes)
    if (old.get_source() == c.get_source() && old.get_target() == c.get_target())
      throw std::invalid_argument("duplicate endpoints");
  if (!get_node(c.get_source()) || !get_node(c.get_target()))
    throw std::invalid_argument("missing connection endpoint");
  if (get_node(c.get_target())->get_role() == NodeRole::Input ||
      get_node(c.get_source())->get_role() == NodeRole::Output)
    throw std::invalid_argument("invalid CPPN connection direction");
  if (c.get_enabled() && !can_enable(c.get_source(), c.get_target()))
    throw std::invalid_argument("cyclic CPPN connection");
  history_->observe(c.get_innovation_number(), c.get_source(), c.get_target());
  connection_genes.push_back(c);
}
void Genome::share_history(std::shared_ptr<History> h) {
  if (!h)
    throw std::invalid_argument("missing evolutionary history");
  h->merge(*history_);
  history_ = h;
}
std::shared_ptr<Genome>
Genome::snapshot(std::map<const History *, std::shared_ptr<History>> &frozen_histories) const {
  auto &history = frozen_histories[history_.get()];
  if (!history)
    history = std::make_shared<History>(*history_);
  auto copy = std::make_shared<Genome>(*this);
  // The captured history already contains this genome's exact history. Merging
  // it again for each genome turns periodic saves into a long simulation pause.
  copy->history_ = history;
  return copy;
}
bool Genome::can_enable(int src, int dst) const {
  const auto *a = get_node(src);
  const auto *b = get_node(dst);
  if (!a || !b || src == dst || a->get_role() == NodeRole::Output ||
      b->get_role() == NodeRole::Input)
    return false;
  if (a->get_role() != NodeRole::Input && a->get_branch() != b->get_branch())
    return false;
  std::set<int> seen{dst};
  std::vector<int> queue{dst};
  for (std::size_t i = 0; i < queue.size(); ++i) {
    for (const auto &c : connection_genes)
      if (c.get_enabled() && c.get_source() == queue[i]) {
        if (c.get_target() == src)
          return false;
        if (seen.insert(c.get_target()).second)
          queue.push_back(c.get_target());
      }
  }
  return true;
}
void Genome::validate() const {
  std::set<int> ids, innovations;
  std::set<std::pair<int, int>> endpoints;
  std::map<int, int> degree;
  std::map<int, std::vector<int>> adjacency;
  int ni = 0, no = 0;
  for (const auto &n : node_genes) {
    if (!ids.insert(n.get_id()).second)
      throw std::runtime_error("duplicate node");
    NodeRole role = n.get_id() < input_nodes                  ? NodeRole::Input
                    : n.get_id() < input_nodes + output_nodes ? NodeRole::Output
                                                              : NodeRole::Hidden;
    if (n.get_role() != role || !std::isfinite(n.get_weight()) || int(n.get_type()) < 0 ||
        int(n.get_type()) >= NODE_TYPES)
      throw std::runtime_error("invalid node role or parameter");
    ni += role == NodeRole::Input;
    no += role == NodeRole::Output;
    degree[n.get_id()] = 0;
  }
  if (ni != input_nodes || no != output_nodes)
    throw std::runtime_error("missing input or output nodes");
  for (const auto &c : connection_genes) {
    if (!innovations.insert(c.get_innovation_number()).second ||
        !endpoints.emplace(c.get_source(), c.get_target()).second)
      throw std::runtime_error("duplicate connection identity");
    const auto *a = get_node(c.get_source());
    const auto *b = get_node(c.get_target());
    if (!a || !b || a->get_role() == NodeRole::Output || b->get_role() == NodeRole::Input ||
        !std::isfinite(c.get_weight()))
      throw std::runtime_error("invalid CPPN endpoints");
    if (a->get_role() != NodeRole::Input && a->get_branch() != b->get_branch())
      throw std::runtime_error("cross-branch CPPN connection");
    if (c.get_enabled()) {
      ++degree[c.get_target()];
      adjacency[c.get_source()].push_back(c.get_target());
    }
  }
  std::queue<int> q;
  for (const auto &d : degree)
    if (!d.second)
      q.push(d.first);
  std::size_t visited = 0;
  while (!q.empty()) {
    int id = q.front();
    q.pop();
    ++visited;
    for (int dst : adjacency[id])
      if (--degree[dst] == 0)
        q.push(dst);
  }
  if (visited != node_genes.size())
    throw std::runtime_error("cyclic CPPN");
}
bool Genome::connect(int src, int dst, float weight) {
  if (!can_enable(src, dst))
    return false;
  for (auto &c : connection_genes)
    if (c.get_source() == src && c.get_target() == dst) {
      if (c.get_enabled())
        return false;
      c.set_weight(weight);
      c.set_enabled(true);
      return true;
    }
  add_connection({history_->connection(src, dst), src, dst, weight, true});
  return true;
}
bool Genome::split_connection(int id) {
  auto p =
      std::find_if(connection_genes.begin(), connection_genes.end(), [id](const ConnectionGene &c) {
        return c.get_innovation_number() == id && c.get_enabled();
      });
  if (p == connection_genes.end())
    return false;
  const ConnectionGene old = *p;
  auto split = history_->split(id, old.get_source(), old.get_target());
  if (get_node(split.node))
    return false;
  p->set_enabled(false);
  NodeGene relay_node{split.node, 1.f, NodeType::LINEAR};
  relay_node.set_branch(get_node(old.get_target())->get_branch());
  add_node(relay_node);
  const float relay = old.get_source() == 4 ? 4.f
                      : (old.get_source() >= 7 && old.get_source() <= 9) || old.get_source() == 11
                          ? 2.f
                          : 1.f;
  add_connection({split.incoming, old.get_source(), split.node, 1.f / relay, true});
  add_connection({split.outgoing, split.node, old.get_target(), old.get_weight() * relay, true});
  return true;
}
bool Genome::duplicate_node(int id) {
  return duplicate_subgraph({id});
}
bool Genome::duplicate_subgraph(const std::vector<int> &selected, std::vector<int> *copies,
                                bool silent) {
  if (copies)
    copies->clear();
  const std::set<int> region(selected.begin(), selected.end());
  if (region.empty() || nodes() + region.size() > 1024)
    return false;
  for (int id : region) {
    const auto *node = get_node(id);
    if (!node || node->get_role() != NodeRole::Hidden)
      return false;
    const int twin = history_->existing_duplicate(id);
    if (twin >= 0 && get_node(twin))
      return false;
  }
  std::vector<ConnectionGene> links;
  bool boundary = false;
  for (const auto &c : connection_genes) {
    if (region.count(c.get_source()) || region.count(c.get_target()))
      links.push_back(c);
    boundary |= region.count(c.get_source()) && !region.count(c.get_target());
  }
  if (!boundary || connection_genes.size() + links.size() > 16384)
    return false;
  std::map<int, int> twins;
  for (int id : region) {
    int twin = history_->duplicate(id);
    twins[id] = twin;
  }
  for (const auto &pair : twins) {
    const auto *node = get_node(pair.first);
    NodeGene copy{pair.second, node->get_weight(), node->get_type()};
    copy.set_branch(node->get_branch());
    add_node(copy);
    if (copies)
      copies->push_back(pair.second);
  }
  // A copied region receives its inputs, but starts without an outgoing contribution.
  for (const auto &c : links) {
    const bool source = region.count(c.get_source()), target = region.count(c.get_target());
    int from = source ? twins.at(c.get_source()) : c.get_source();
    int to = target ? twins.at(c.get_target()) : c.get_target();
    float weight = c.get_weight();
    if (source && !target) {
      if (silent)
        weight = 0;
      else {
        weight *= .5f;
        edit_connection(c.get_innovation_number(), weight, c.get_enabled());
      }
    }
    add_connection({history_->connection(from, to), from, to, weight, c.get_enabled()});
  }
  return true;
}
void Genome::mutate_add_node() {
  if (!with_probability(MUTATION_ADD_NODE_PROBABILITY))
    return;
  std::vector<int> candidates;
  for (const auto &c : connection_genes)
    if (c.get_enabled())
      candidates.push_back(c.get_innovation_number());
  if (!candidates.empty())
    split_connection(candidates[random_index(candidates.size())]);
}
void Genome::mutate_add_connection() {
  if (!with_probability(MUTATION_ADD_CONNECTION_PROBABILITY))
    return;
  std::vector<int> src, dst;
  for (const auto &n : node_genes) {
    if (n.get_role() != NodeRole::Output)
      src.push_back(n.get_id());
    if (n.get_role() != NodeRole::Input)
      dst.push_back(n.get_id());
  }
  for (int i = 0; i < 32; ++i)
    if (connect(src[random_index(src.size())], dst[random_index(dst.size())],
                Gene::random_weight()))
      return;
}
void Genome::mutate_weights() {
  for (auto &n : node_genes) {
    if (n.get_role() == NodeRole::Input)
      continue;
    // The expression output remains a step function for new HyperNEAT-LEO genomes.
    if (output_nodes >= 2 && n.get_id() == input_nodes + 1 && n.get_type() == NodeType::SIGN)
      n.Gene::mutate();
    else
      n.mutate();
  }
  for (auto &c : connection_genes)
    c.mutate();
}
void Genome::randomize_weights() {
  for (auto &c : connection_genes)
    c.set_weight(Gene::random_weight());
}
void Genome::edit_node(int id, float parameter, NodeType type) {
  if (int(type) < 0 || int(type) >= NODE_TYPES || !std::isfinite(parameter))
    throw std::invalid_argument("invalid neuron parameters");
  for (auto &n : node_genes)
    if (n.get_id() == id) {
      if (n.get_role() == NodeRole::Input)
        throw std::invalid_argument("CPPN coordinate inputs are fixed");
      n.set_type(type);
      n.set_weight(parameter);
      return;
    }
  throw std::invalid_argument("unknown node id");
}
void Genome::edit_connection(int id, float weight, bool enabled) {
  if (!std::isfinite(weight))
    throw std::invalid_argument("nonfinite connection weight");
  for (auto &c : connection_genes)
    if (c.get_innovation_number() == id) {
      if (enabled && !c.get_enabled() && !can_enable(c.get_source(), c.get_target()))
        throw std::invalid_argument("connection would create a cycle");
      c.set_weight(weight);
      c.set_enabled(enabled);
      return;
    }
  throw std::invalid_argument("unknown innovation id");
}
void Genome::mutate() {
  mutate_add_node();
  mutate_add_connection();
  mutate_weights();
  for (auto &c : connection_genes)
    if (with_probability(MUTATION_CONNECTION_TOGGLE_PROBABILITY)) {
      if (c.get_enabled())
        c.set_enabled(false);
      else if (can_enable(c.get_source(), c.get_target()))
        c.set_enabled(true);
    }
}
std::shared_ptr<Genome> Genome::empty_genome(int total, int inputs, int outputs) {
  if (total < inputs + outputs)
    throw std::invalid_argument("too few initial nodes");
  auto g = std::make_shared<Genome>(inputs, outputs);
  for (int i = 0; i < total; ++i)
    g->add_node({i, 1.f, NodeType::LINEAR});
  if (outputs == 2)
    for (auto &n : g->node_genes)
      if (n.get_id() == inputs + 1) {
        n.set_type(NodeType::SIGN);
        n.set_weight(0.f);
      }
  return g;
}
std::shared_ptr<Genome> Genome::random_genome(int total, int inputs, int outputs) {
  auto g = empty_genome(total, inputs, outputs);
  for (int s = 0; s < inputs; ++s)
    for (int d = inputs; d < inputs + outputs; ++d)
      g->connect(s, d, Gene::random_weight());
  return g;
}
std::shared_ptr<Genome> Genome::copy_genome(const std::shared_ptr<Genome> &other) {
  return std::make_shared<Genome>(*other);
}
std::shared_ptr<Genome> Genome::clone_genome(const std::shared_ptr<Genome> &other) {
  auto g = copy_genome(other);
  g->mutate();
  return g;
}
const std::vector<std::size_t> &Genome::ordered_innovations() const {
  if (innovation_order.size() != connection_genes.size()) {
    innovation_order.resize(connection_genes.size());
    for (std::size_t i = 0; i < innovation_order.size(); ++i)
      innovation_order[i] = i;
    std::sort(innovation_order.begin(), innovation_order.end(), [&](auto a, auto b) {
      return connection_genes[a].get_innovation_number() <
             connection_genes[b].get_innovation_number();
    });
  }
  return innovation_order;
}
float Genome::compatibility_distance(const Genome &a, const Genome &b) {
  if (&a == &b)
    return 0;
  if (a.history_->lineage() != b.history_->lineage())
    throw std::invalid_argument("compatibility needs a shared evolutionary history");
  const auto &ga = a.ordered_innovations();
  const auto &gb = b.ordered_innovations();
  const int ma = ga.empty() ? -1 : a.connection_genes[ga.back()].get_innovation_number(),
            mb = gb.empty() ? -1 : b.connection_genes[gb.back()].get_innovation_number();
  int excess = 0, disjoint = 0, common = 0, enabled_changes = 0;
  float weights = 0;
  std::size_t i = 0, j = 0;
  while (i < ga.size() || j < gb.size()) {
    auto x = i < ga.size() ? &a.connection_genes[ga[i]] : nullptr,
         y = j < gb.size() ? &b.connection_genes[gb[j]] : nullptr;
    if (x && y && x->get_innovation_number() == y->get_innovation_number()) {
      if (x->get_source() != y->get_source() || x->get_target() != y->get_target())
        throw std::runtime_error("matching innovation has inconsistent endpoints");
      ++common;
      enabled_changes += x->get_enabled() != y->get_enabled();
      weights += std::abs(x->get_weight() - y->get_weight());
      ++i;
      ++j;
    } else if (x && (!y || x->get_innovation_number() < y->get_innovation_number())) {
      if (x->get_innovation_number() > mb)
        ++excess;
      else
        ++disjoint;
      ++i;
    } else {
      if (y->get_innovation_number() > ma)
        ++excess;
      else
        ++disjoint;
      ++j;
    }
  }
  const std::size_t size = std::max(ga.size(), gb.size());
  const float normalization = size < 20 ? 1.f : float(size);
  int functions = 0, nodes = 0;
  float parameters = 0;
  for (const auto &n : a.node_genes)
    if (n.get_role() != NodeRole::Input) {
      auto other = b.get_node(n.get_id());
      if (other) {
        ++nodes;
        functions += n.get_type() != other->get_type();
        parameters += std::abs(n.get_weight() - other->get_weight());
      }
    }
  return EXCESS_DISTANCE_FACTOR * excess / normalization +
         DISJOINT_DISTANCE_FACTOR * disjoint / normalization +
         WEIGHT_DISTANCE_FACTOR * (common ? weights / common : 0.f) +
         .75f * (nodes ? float(functions) / nodes : 0.f) +
         .4f * (nodes ? parameters / nodes : 0.f) +
         .5f * (common ? float(enabled_changes) / common : 0.f);
}
std::shared_ptr<Genome> Genome::crossover(const Genome &a, const Genome &b, float fa, float fb) {
  if (a.input_nodes != b.input_nodes || a.output_nodes != b.output_nodes ||
      a.history_->lineage() != b.history_->lineage())
    throw std::invalid_argument("incompatible parents");
  a.validate();
  b.validate();
  a.history_->merge(*b.history_);
  auto child = std::make_shared<Genome>(a.input_nodes, a.output_nodes, a.history_);
  std::map<int, const ConnectionGene *> ga, gb;
  std::set<int> all;
  for (const auto &c : a.connection_genes) {
    ga[c.get_innovation_number()] = &c;
    all.insert(c.get_innovation_number());
  }
  for (const auto &c : b.connection_genes) {
    gb[c.get_innovation_number()] = &c;
    all.insert(c.get_innovation_number());
  }
  std::vector<ConnectionGene> inherited;
  for (int id : all) {
    auto x = ga.find(id), y = gb.find(id);
    const ConnectionGene *pick = nullptr;
    if (x != ga.end() && y != gb.end()) {
      if (x->second->get_source() != y->second->get_source() ||
          x->second->get_target() != y->second->get_target())
        throw std::runtime_error("invalid homologous gene");
      pick = with_probability(.5f) ? x->second : y->second;
      ConnectionGene c = *pick;
      if (!x->second->get_enabled() || !y->second->get_enabled())
        c.set_enabled(!with_probability(.75f));
      inherited.push_back(c);
      continue;
    }
    if (x != ga.end() && (fa > fb || (fa == fb && with_probability(.5f))))
      pick = x->second;
    if (y != gb.end() && (fb > fa || (fa == fb && with_probability(.5f))))
      pick = y->second;
    if (pick)
      inherited.push_back(*pick);
  }
  std::set<int> nodes;
  for (int id = 0; id < a.input_nodes + a.output_nodes; ++id)
    nodes.insert(id);
  for (const auto &c : inherited) {
    nodes.insert(c.get_source());
    nodes.insert(c.get_target());
  }
  for (int id : nodes) {
    auto x = a.get_node(id), y = b.get_node(id);
    child->add_node(*(x && y ? (with_probability(.5f) ? x : y) : (x ? x : y)));
  }
  std::set<std::pair<int, int>> endpoints;
  for (auto c : inherited) {
    // Equal-fitness recombination can create a cycle, or duplicate endpoints with different
    // historical origins.
    if (!endpoints.emplace(c.get_source(), c.get_target()).second)
      continue;
    if (c.get_enabled() && !child->can_enable(c.get_source(), c.get_target()))
      c.set_enabled(false);
    child->add_connection(c);
  }
  child->validate();
  return child;
}
std::ostream &operator<<(std::ostream &out, const Genome &g) {
  return g.write(out);
}
std::ostream &Genome::write(std::ostream &out, bool with_history) const {
  const auto &g = *this;
  g.validate();
  out << std::setprecision(std::numeric_limits<float>::max_digits10);
  out << (with_history ? "Genome2 " : "Genome3 ") << g.input_nodes << ' ' << g.output_nodes << '\n';
  if (with_history)
    g.history_->write(out);
  for (const auto &n : g.node_genes)
    out << "Node " << n << '\n';
  for (const auto &c : g.connection_genes)
    out << "Conn " << c << '\n';
  return out << "End\n";
}
std::istream &operator>>(std::istream &in, Genome &destination) {
  return destination.read(in);
}
std::istream &Genome::read(std::istream &in, std::shared_ptr<History> shared_history) {
  auto &destination = *this;
  std::string word;
  if (!(in >> word))
    throw std::runtime_error("empty genome file");
  int ni, no;
  if ((word != "Genome2" && word != "Genome3") || !(in >> ni >> no))
    throw std::runtime_error("invalid current genome header");
  Genome result(ni, no);
  if (word == "Genome3") {
    if (!shared_history)
      throw std::runtime_error("shared genome has no history table");
    result.history_ = std::move(shared_history);
  } else
    result.history_ = std::make_shared<History>(History::read(in));
  std::vector<ConnectionGene> conns;
  bool ended = false;
  while (in >> word) {
    if (word == "End") {
      ended = true;
      break;
    }
    if (result.nodes() > 100000 || conns.size() > 1000000)
      throw std::runtime_error("genome file exceeds resource limits");
    if (word == "Node") {
      int id, type, role = -1, branch;
      float v;
      if (!(in >> id >> v >> type >> role >> branch))
        throw std::runtime_error("truncated node");
      NodeRole expected = id < ni        ? NodeRole::Input
                          : id < ni + no ? NodeRole::Output
                                         : NodeRole::Hidden;
      if (role != int(expected))
        throw std::runtime_error("invalid stored node role");
      NodeGene node{id, v, NodeType(type), expected};
      if (branch < -1 || branch >= cppn::output::branches ||
          (expected == NodeRole::Input) != (branch == -1))
        throw std::runtime_error("invalid CPPN branch");
      node.set_branch(branch);
      result.add_node(node);
    } else if (word == "Conn") {
      int enabled, src, dst, innov;
      float w;
      if (!(in >> enabled >> src >> dst >> w >> innov) || (enabled != 0 && enabled != 1))
        throw std::runtime_error("truncated or invalid connection");
      conns.emplace_back(innov, src, dst, w, enabled == 1);
    } else
      throw std::runtime_error("unknown genome record: " + word);
  }
  if (!ended)
    throw std::runtime_error("genome has no End marker");
  for (const auto &connection : conns)
    result.add_connection(connection);
  result.validate();
  destination = std::move(result);
  return in;
}
}
