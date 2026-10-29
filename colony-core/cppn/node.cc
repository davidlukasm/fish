#include "node.hh"
#include "evolution/constants.hh"
#include <cassert>
#include <cmath>
using namespace std;

namespace cppn {
using evolution::NodeGene;
using evolution::NodeType;

Node::Node(NodeGene const &gene)
    : id(gene.get_id()), type(gene.get_type()), bias(gene.get_weight()) {
}

void Node::connect_from(Node *src, float weight) {
  inputs.push_back({src, weight});
}

void Node::connect_to(Node *dst, float weight) {
  dst->connect_from(this, weight);
}

ann::Node const *Connection::get_source() const {
  return src;
}
}
