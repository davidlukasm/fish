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
  static constexpr double GENUS_SPAN = 3, TYPICAL_SHARE = .5;
  double genus_distance() const { return GENUS_SPAN * mating_distance; }
  double typical_distance() const { return TYPICAL_SHARE * mating_distance; }
  std::uint64_t next_species = 1;
  std::uint64_t hatches = 0;
  std::uint64_t reproductive_descendants = 0;
};
}
