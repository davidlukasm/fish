#pragma once
#include <list>
#include <vector>
#include <memory>
#include <utility>
#include <string>
#include <mutex>
#include <array>
#include "gene.hh"
#include "history.hh"
namespace evolution {
class Genome {
  std::list<NodeGene> node_genes;
  std::vector<ConnectionGene> connection_genes;
  struct Sensitivity {
    double amplitude = 0, derivative[2]{}, weight = 0;
  };
  mutable std::map<int, Sensitivity> sensitivity;
  // Edge-local work points until the child is evaluated in its own development.
  mutable std::map<int, std::array<double, 3>> inherited_work;
  mutable std::mutex observation_mutex;
  mutable std::vector<std::size_t> innovation_order;
  const std::vector<std::size_t> &ordered_innovations() const;
  int input_nodes, output_nodes;
  std::shared_ptr<History> history_;

public:
  explicit Genome(int inputs, int outputs = 2, std::shared_ptr<History> history = {});
  Genome(const Genome &);
  Genome &operator=(const Genome &);
  std::unique_lock<std::mutex> lock_observations() const {
    return std::unique_lock<std::mutex>(observation_mutex);
  }
  void add_node(NodeGene node);
  void add_connection(const ConnectionGene &conn);
  int nodes() const { return int(node_genes.size()); }
  int inputs() const { return input_nodes; }
  int outputs() const { return output_nodes; }
  const std::list<NodeGene> &get_node_genes() const { return node_genes; }
  const std::vector<ConnectionGene> &get_connection_genes() const { return connection_genes; }
  const NodeGene *get_node(int id) const;
  const ConnectionGene *get_gene(int innovation) const;
  std::pair<int, int> get_innovation_range() const;
  bool has_gene(int innovation) const { return get_gene(innovation) != nullptr; }
  bool is_in_range(int innovation) const;
  std::shared_ptr<History> history() const { return history_; }
  void share_history(std::shared_ptr<History>);
  std::shared_ptr<Genome>
  snapshot(std::map<const History *, std::shared_ptr<History>> &frozen_histories) const;
  void validate() const;
  void observe_work(int id, double amplitude, double derivative, double switch_derivative,
                    double weight) const;
  double mutation_sigma(int source, int target, int port, double delta) const;
  bool can_enable(int source, int target) const;
  bool connect(int source, int target, float weight, int port = 0);
  bool split_connection(int innovation);
  bool duplicate_node(int node);
  bool duplicate_subgraph(const std::vector<int> &nodes, std::vector<int> *copies = nullptr,
                          bool silent = true);
  void randomize_weights();
  void edit_node(int id, float parameter, NodeType type);
  void edit_connection(int innovation, float weight, bool enabled);
  void mutate();
  void mutate_add_node();
  void mutate_add_connection();
  void mutate_weights();
  static std::shared_ptr<Genome> empty_genome(int total, int inputs, int outputs = 2);
  static std::shared_ptr<Genome> random_genome(int total, int inputs, int outputs = 2);
  static std::shared_ptr<Genome> clone_genome(const std::shared_ptr<Genome> &);
  static std::shared_ptr<Genome> copy_genome(const std::shared_ptr<Genome> &);
  static std::shared_ptr<Genome> crossover(const Genome &, const Genome &, float fitness_a,
                                           float fitness_b);
  static float compatibility_distance(const Genome &, const Genome &);
  std::ostream &write(std::ostream &, bool with_history = true) const;
  std::istream &read(std::istream &, std::shared_ptr<History> shared_history = {});
  friend std::ostream &operator<<(std::ostream &, const Genome &);
  friend std::istream &operator>>(std::istream &, Genome &);
};
}
