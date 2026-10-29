#include "history.hh"
#include "mutations.hh"
#include <algorithm>
#include <sstream>
#include <stdexcept>
#include <limits>

namespace evolution {
History::History() {
  std::ostringstream name;
  name << std::hex << generator() << '-' << generator() << '-' << generator() << '-' << generator();
  lineage_ = name.str();
}
void History::observe_node(int id) {
  if (id < 0 || id == std::numeric_limits<int>::max())
    throw std::runtime_error("invalid node id");
  next_node_ = std::max(next_node_, id + 1);
}
void History::observe(int id, int src, int dst) {
  if (id < 0 || id == std::numeric_limits<int>::max())
    throw std::runtime_error("invalid innovation id");
  auto p = bindings_.emplace(id, std::make_pair(src, dst));
  if (!p.second && p.first->second != std::make_pair(src, dst))
    throw std::runtime_error("innovation identifies different connections");
  next_innovation_ = std::max(next_innovation_, id + 1);
  observe_node(src);
  observe_node(dst);
}
int History::connection(int src, int dst) {
  auto key = std::make_pair(src, dst);
  auto it = connections_.find(key);
  if (it != connections_.end())
    return it->second;
  int id = next_innovation_;
  observe(id, src, dst);
  connections_[key] = id;
  return id;
}
History::Split History::split(int old, int src, int dst) {
  auto binding = bindings_.find(old);
  if (binding == bindings_.end() || binding->second != std::make_pair(src, dst))
    throw std::runtime_error("split has unknown historical ancestor");
  auto it = splits_.find(old);
  if (it != splits_.end())
    return it->second;
  if (next_node_ == std::numeric_limits<int>::max())
    throw std::runtime_error("node ids exhausted");
  int node = next_node_++;
  Split result{node, connection(src, node), connection(node, dst)};
  splits_[old] = result;
  return result;
}
int History::existing_duplicate(int original) const {
  const auto old = duplicates_.find(original);
  return old == duplicates_.end() ? -1 : old->second;
}
int History::duplicate(int original) {
  auto old = duplicates_.find(original);
  if (old != duplicates_.end())
    return old->second;
  if (original < 0 || original >= next_node_ || next_node_ == std::numeric_limits<int>::max())
    throw std::runtime_error("invalid duplication ancestor");
  int twin = next_node_++;
  duplicates_[original] = twin;
  return twin;
}
void History::next_generation() {
  if (generation_ == std::numeric_limits<int>::max())
    throw std::runtime_error("generation counter exhausted");
  ++generation_;
  connections_.clear();
  splits_.clear();
  duplicates_.clear();
}
void History::merge(const History &other) {
  if (lineage_ != other.lineage_)
    throw std::runtime_error("independent evolutionary histories cannot be merged");
  if (generation_ != other.generation_)
    throw std::runtime_error("histories are from different generations");
  for (const auto &b : other.bindings_)
    observe(b.first, b.second.first, b.second.second);
  next_node_ = std::max(next_node_, other.next_node_);
  for (const auto &e : other.connections_) {
    auto p = connections_.emplace(e);
    if (!p.second && p.first->second != e.second)
      throw std::runtime_error("conflicting generation history");
  }
  for (const auto &e : other.duplicates_) {
    auto p = duplicates_.emplace(e);
    if (!p.second && p.first->second != e.second)
      throw std::runtime_error("conflicting duplication history");
  }
  for (const auto &e : other.splits_) {
    auto p = splits_.emplace(e);
    if (!p.second &&
        (p.first->second.node != e.second.node || p.first->second.incoming != e.second.incoming ||
         p.first->second.outgoing != e.second.outgoing))
      throw std::runtime_error("conflicting split history");
  }
}
void History::write(std::ostream &out) const {
  out << "History " << lineage_ << ' ' << generation_ << ' ' << next_innovation_ << ' '
      << next_node_ << '\n';
  for (const auto &e : bindings_)
    out << "Binding " << e.first << ' ' << e.second.first << ' ' << e.second.second << '\n';
  for (const auto &e : connections_)
    out << "Event " << e.first.first << ' ' << e.first.second << ' ' << e.second << '\n';
  for (const auto &e : splits_)
    out << "Split " << e.first << ' ' << e.second.node << ' ' << e.second.incoming << ' '
        << e.second.outgoing << '\n';
  for (const auto &e : duplicates_)
    out << "Duplicate " << e.first << ' ' << e.second << '\n';
  out << "HistoryEnd\n";
}
History History::read(std::istream &in) {
  History h;
  std::string word;
  int innovation_counter, node_counter;
  if (!(in >> word >> h.lineage_ >> h.generation_ >> innovation_counter >> node_counter) ||
      word != "History" || h.generation_ < 0 || innovation_counter < 0 || node_counter < 0)
    throw std::runtime_error("invalid history header");
  bool ended = false;
  while (in >> word) {
    if (word == "HistoryEnd") {
      ended = true;
      break;
    }
    int a, b, c, d;
    if (word == "Binding") {
      if (!(in >> a >> b >> c))
        break;
      h.observe(a, b, c);
    } else if (word == "Event") {
      if (!(in >> a >> b >> c))
        break;
      auto i = h.bindings_.find(c);
      if (i == h.bindings_.end() || i->second != std::make_pair(a, b) ||
          !h.connections_.emplace(std::make_pair(a, b), c).second)
        throw std::runtime_error("invalid connection event");
    } else if (word == "Split") {
      if (!(in >> a >> b >> c >> d))
        break;
      auto old = h.bindings_.find(a), x = h.bindings_.find(c), y = h.bindings_.find(d);
      if (old == h.bindings_.end() || x == h.bindings_.end() || y == h.bindings_.end() ||
          x->second != std::make_pair(old->second.first, b) ||
          y->second != std::make_pair(b, old->second.second) ||
          !h.splits_.emplace(a, Split{b, c, d}).second)
        throw std::runtime_error("invalid split event");
      h.observe_node(b);
    } else if (word == "Duplicate") {
      if (!(in >> a >> b))
        break;
      if (a < 0 || b <= a || !h.duplicates_.emplace(a, b).second)
        throw std::runtime_error("invalid duplication event");
      h.observe_node(b);
    } else
      throw std::runtime_error("unknown history record: " + word);
  }
  if (!ended || innovation_counter < h.next_innovation_ || node_counter < h.next_node_)
    throw std::runtime_error("truncated or inconsistent history");
  h.next_innovation_ = innovation_counter;
  h.next_node_ = node_counter;
  return h;
}
}
