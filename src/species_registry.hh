#pragma once
#include "ecology_types.hh"
namespace fishsim {
struct SpeciesRegistry {
  void name_hormones(GeneticSpecies &);
  GeneticSpecies *find(std::uint64_t);
  const GeneticSpecies *find(std::uint64_t) const;
  std::uint64_t classify(const Genome &, std::uint64_t maternal_species, std::uint64_t step);
  std::vector<GeneticSpecies> species;
  std::vector<EcologicalMilestone> milestones;
  double mating_distance = .1125;
  std::uint64_t next_species = 1;
  std::uint64_t hatches = 0;
  std::uint64_t reproductive_descendants = 0;
};
}
