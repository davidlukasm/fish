#pragma once
#include "ecology.hh"
namespace fishsim {
class Workers;
class RandomGenomeSearch {
  std::unique_ptr<Workers> pool;
  const MutationRates rates;
  std::vector<Genome> screen(std::vector<Genome>);

public:
  explicit RandomGenomeSearch(int workers, MutationRates rates = {});
  ~RandomGenomeSearch();
  std::vector<Genome> batch(const Genome &, Rng &, int candidates);
  std::vector<Genome> mutants(const Genome &, Rng &, int candidates, double strength);
  std::optional<Genome> first(const Genome &, Rng &,
                              const std::function<bool(const Genome &)> &accept =
                                  {}); // At most 256 candidates, in fixed order.
};
std::optional<Individual> fill_natural_egg(Ecosystem &, Individual &, std::size_t occupied);
void fill_sperm(Ecosystem &, Individual &);
double funding(const Genome &, double scale = 1, double yolk = 180);
bool viable_entrant(const Genome &);
void develop_entrant(Genome &, const std::atomic<bool> &stop);
std::optional<double> funded_egg_energy(const Genome &, double scale, double yolk);
std::size_t connection_storage(const Ecosystem &, const Genome *additional = nullptr);
int developing_eggs(const Ecosystem &);
int planning_brains(const Ecosystem &);
std::size_t planned_edges(const Genome &);
double mating_chance(double distance, double scale);
bool compatible(const Genome &, const Genome &, double scale, std::uint64_t egg_id,
                std::uint64_t cloud_id);
double behavior_distance(const std::array<double, BEHAVIOR_FEATURES> &,
                         const std::array<double, BEHAVIOR_FEATURES> &);
void write_population(std::ostream &, const std::vector<Genome> &);
std::vector<Genome> read_population(std::istream &);
}
