#include "random.hh"
#pragma once
#include "simulation_types.hh"
#include "brain_interface.hh"
#include "mutation_parameters.hh"
#include "evolution/constants.hh"
#include "field/substrate.hh"
#include <string>
#include <iosfwd>
namespace fishsim {
inline constexpr const char *HAND_BUILT_GENOME = "genomes/handbau/handfisch.genome";
extern field::Options default_development_options;
constexpr std::size_t BRAIN_QUERY_LIMIT = field::DEVELOPMENT_QUERY_LIMIT;
inline constexpr double MAX_GENE_WEIGHT = 16;
using evolution::MAX_GENOME_CONNECTIONS;
using evolution::MAX_GENOME_NODES;
using evolution::MAX_GROWING_NODES;
constexpr std::size_t MAX_GENOME_NAME = 40;
std::shared_ptr<const BrainInterface> body_interface(const field::Substrate &);
struct Genome {
  std::shared_ptr<evolution::Genome> cppn;
  std::shared_ptr<const field::Substrate> blueprint;
  std::shared_ptr<const BrainInterface> interface;
  std::shared_ptr<cppn::CPPN> growth_query;
  std::shared_ptr<field::Substrate> growing;
  double mutation_step = .03;
  std::uint64_t development_seed = 0, variation_seed = 0;
  std::string name;
  field::Options development_options = default_development_options;
  static void begin_run(std::uint64_t);
  static std::vector<Genome> immigrants(const std::vector<Genome> &, Rng &);
  static void unite(std::vector<Genome> &, Genome *champion = nullptr);
  void mutate(Rng &, double scale, bool develop = true, const MutationRates &rates = {});
  void begin_individual(Rng &);
  void discard_development();
  static Genome cross(const Genome &, const Genome &, Rng &, double fitness_a = 1,
                      double fitness_b = 1, bool develop = true);
  static Genome load(const std::string &);
  void save(const std::string &) const;
  void compile(bool record_work = true);
  bool viable() const;
  bool advance_development(std::size_t work_budget, bool record_work = true);
  std::size_t pending_queries() const { return growing ? growing->queries : 0; }
  std::size_t pending_work() const { return growing ? growing->development_work() : 0; }
  void write(std::ostream &, bool with_history = true, bool with_genes = true) const;
  static Genome read(std::istream &, bool develop = true,
                     std::shared_ptr<evolution::History> shared_history = {},
                     std::shared_ptr<evolution::Genome> shared_genes = {});
  bool same_genes(const Genome &) const;
};
class EvolutionTransaction {
  std::vector<std::pair<std::shared_ptr<evolution::History>, evolution::History>> saved;
  bool committed = false;

public:
  explicit EvolutionTransaction(const std::vector<Genome> &);
  ~EvolutionTransaction();
  void commit() { committed = true; }
};
}
