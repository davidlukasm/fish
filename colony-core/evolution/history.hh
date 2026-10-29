#pragma once
#include <map>
#include <tuple>
#include <string>
#include <utility>
#include <iosfwd>

namespace evolution {
// One history per evolutionary run. Structural events are shared within a generation.
struct Endpoint {
  int first, second, port = 0;
  bool operator<(const Endpoint &b) const {
    return std::tie(first, second, port) < std::tie(b.first, b.second, b.port);
  }
  bool operator==(const Endpoint &b) const {
    return first == b.first && second == b.second && port == b.port;
  }
  bool operator!=(const Endpoint &b) const { return !(*this == b); }
};
class History {
public:
  struct Split {
    int node, incoming, outgoing;
  };
  History();
  const std::string &lineage() const { return lineage_; }
  int connection(int source, int target, int port = 0);
  Split split(int old_innovation, int source, int target, int port = 0);
  int duplicate(int node);
  int existing_duplicate(int node) const;
  void observe(int innovation, int source, int target, int port = 0);
  void observe_node(int id);
  void next_generation();
  void merge(const History &other);
  int generation() const { return generation_; }
  void write(std::ostream &) const;
  static History read(std::istream &);

private:
  std::string lineage_;
  int next_innovation_ = 0, next_node_ = 0, generation_ = 0;
  std::map<int, Endpoint> bindings_;
  std::map<Endpoint, int> connections_;
  std::map<int, Split> splits_;
  std::map<int, int> duplicates_;
};
}
