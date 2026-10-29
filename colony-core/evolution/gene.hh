#pragma once
#include <iosfwd>
#include "node_type.hh"
namespace evolution {
enum class NodeRole { Input, Hidden, Output };
class Gene {
  float weight;

public:
  explicit Gene(float weight);
  float get_weight() const { return weight; }
  void set_weight(float value);
  static float random_weight();
  virtual bool mutate();
  virtual ~Gene() = default;
};
class NodeGene : public Gene {
  NodeType type;
  int id;
  NodeRole role;

public:
  NodeGene(int id, float parameter, NodeType type, NodeRole role = NodeRole::Hidden);
  NodeType get_type() const { return type; }
  void set_type(NodeType value) { type = value; }
  int get_id() const { return id; }
  NodeRole get_role() const { return role; }
  void set_role(NodeRole value) { role = value; }
  static NodeType random_type();
  bool mutate() override;
  friend std::ostream &operator<<(std::ostream &, const NodeGene &);
};
class ConnectionGene : public Gene {
  int innovation_number, source, target;
  bool enabled;
  int port = 0;

public:
  ConnectionGene(int innovation, int source, int target, float weight, bool enabled, int port = 0);
  int get_innovation_number() const { return innovation_number; }
  int get_source() const { return source; }
  int get_target() const { return target; }
  int get_port() const { return port; }
  void set_enabled(bool value) { enabled = value; }
  bool get_enabled() const { return enabled; }
  bool mutate() override;
  friend std::ostream &operator<<(std::ostream &, const ConnectionGene &);
};
}
