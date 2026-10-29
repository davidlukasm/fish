#include "random.hh"
#pragma once
#include "simulation_types.hh"
#include "brain_interface.hh"
#include "mutation_parameters.hh"
#include "field/substrate.hh"
#include <string>
#include <iosfwd>
namespace fishsim {
extern field::Options default_development_options;
constexpr std::size_t BRAIN_QUERY_LIMIT = field::DEVELOPMENT_QUERY_LIMIT;
std::shared_ptr<const BrainInterface> body_interface(const field::Substrate &);
struct Genome {
  std::shared_ptr<evolution::Genome> cppn;
  std::shared_ptr<const field::Substrate> blueprint;
  std::shared_ptr<const BrainInterface> interface;
  std::shared_ptr<cppn::CPPN> growth_query;
  std::shared_ptr<field::Substrate> growing;
  double mutation_step = .03;
  // Random draws of development. The structural seed (partner choice, overabundance) is inherited
  // like a gene, so a mutation changes only what it changes. The variation seed (small position
  // jitter of the cell copies and their bias) is the individual's own: every newborn draws one.
  std::uint64_t development_seed = 0, variation_seed = 0;
  field::Options development_options = default_development_options;
  static void begin_run(std::uint64_t);
  static void adopt_run(const Genome &);
  static Genome run_founder();
  static std::vector<Genome> immigrants(const std::vector<Genome> &, Rng &);
  static void unite(std::vector<Genome> &, Genome *champion = nullptr);
  static Genome fresh(Rng &);
  static Genome randomized(const Genome &lineage, Rng &, bool develop = true,
                           const MutationRates &rates = {}); // all CPPN weights redrawn, plus
                                                             // structural mutations; same lineage
  static Genome pool_randomized(Rng &);
  void mutate(Rng &, double scale, bool develop = true, const MutationRates &rates = {});
  // a newborn: its own developmental variation (the developed brain is discarded)
  void begin_individual(Rng &);
  // forget the developed brain after a change of the genes or of the variation
  void discard_development();
  static Genome cross(const Genome &, const Genome &, Rng &, double fitness_a = 1,
                      double fitness_b = 1, bool develop = true);
  static Genome load(const std::string &);
  void save(const std::string &) const;
  void compile();
  bool viable() const;
  bool advance_development(std::size_t query_budget, int workers = 0);
  std::size_t pending_queries() const { return growing ? growing->queries : 0; }
  void write(std::ostream &, bool with_history = true) const;
  static Genome read(std::istream &, bool develop = true,
                     std::shared_ptr<evolution::History> shared_history = {});
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
