#include "gene.hh"
#include "constants.hh"
#include "mutations.hh"
#include <cmath>
#include <ostream>
#include <stdexcept>
#include <algorithm>
namespace evolution {
Gene::Gene(float v) : weight(v) {
  if (!std::isfinite(v))
    throw std::invalid_argument("nonfinite gene parameter");
}
void Gene::set_weight(float v) {
  if (!std::isfinite(v))
    throw std::invalid_argument("nonfinite gene parameter");
  weight = v;
}
float Gene::random_weight() {
  return random_weight_distribution(generator);
}
bool Gene::mutate() {
  if (!with_probability(WEIGHT_MUTATION_PROBABILITY))
    return false;
  float value = with_probability(.1f)
                    ? random_weight()
                    : std::normal_distribution<float>(weight, WEIGHT_MUTATION_STDDEV)(generator);
  weight = std::max(WEIGHT_MIN, std::min(WEIGHT_MAX, value));
  return true;
}
NodeGene::NodeGene(int id, float v, NodeType t, NodeRole r) : Gene(v), type(t), id(id), role(r) {
  if (id < 0 || int(t) < 0 || int(t) >= NODE_TYPES)
    throw std::invalid_argument("invalid node gene");
}
NodeType NodeGene::random_type() {
  return NodeType(random_node_type_distribution(generator));
}
bool NodeGene::mutate() {
  if (role == NodeRole::Input)
    return false;
  bool changed = Gene::mutate();
  if (with_probability(MUTATION_NODE_TYPE_CHANGE_PROBABILITY)) {
    type = random_type();
    changed = true;
  }
  return changed;
}
ConnectionGene::ConnectionGene(int i, int s, int t, float w, bool e)
    : Gene(w), innovation_number(i), source(s), target(t), enabled(e) {
  if (i < 0 || s < 0 || t < 0)
    throw std::invalid_argument("invalid connection gene");
}
bool ConnectionGene::mutate() {
  return Gene::mutate();
} // Genome checks topology before toggling.
std::ostream &operator<<(std::ostream &o, const NodeGene &n) {
  return o << n.id << ' ' << n.get_weight() << ' ' << int(n.type) << ' ' << int(n.role) << ' '
           << n.branch;
}
std::ostream &operator<<(std::ostream &o, const ConnectionGene &c) {
  return o << c.enabled << ' ' << c.source << ' ' << c.target << ' ' << c.get_weight() << ' '
           << c.innovation_number;
}
}
