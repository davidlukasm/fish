#pragma once
#include "individual.hh"
#include <iosfwd>
#include <map>
#include <set>
namespace fishsim {
struct Field;
struct SpeciesRegistry;
struct PopulationStateContext {
  const Field &field;
  const SpeciesRegistry &taxonomy;
  std::vector<Genome> &genes;
  std::uint64_t ticks, next_id;
  double energy_limit;
};
class PopulationCheckpoint {
public:
  static void read(std::istream &in, std::vector<Individual> &fish,
                   const PopulationStateContext &context);

private:
  static void read_identity(std::istream &in, Individual &p, const PopulationStateContext &context,
                            std::set<std::uint64_t> &ids);
  static void restore_development(std::istream &in, Individual &p, std::vector<Genome> &genes,
                                  std::map<std::size_t, Genome> &plans);
  static void read_injuries(std::istream &in, Body &b);
  static void read_mouth(std::istream &in, Body &b);
  static void read_body(std::istream &in, Individual &p, const PopulationStateContext &context);
  static void read_measurements(std::istream &in, Individual &p);
  static void read_swimming(std::istream &in, Body &b);
  static void read_gametes(std::istream &in, Body &b, double energy_limit);
  static void read_motors(std::istream &in, Body &b);
  static void read_organs(std::istream &in, Body &b);
  static void read_senses(std::istream &in, Body &b);
  static void read_habitat(std::istream &in, Individual &p);
  static void read_runtime(std::istream &in, Body &b);
};
void read_population_state(std::istream &, std::vector<Individual> &,
                           const PopulationStateContext &);
void write_population_state(std::ostream &, const std::vector<Individual> &,
                            const std::vector<const Genome *> &);
}
