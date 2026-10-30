#pragma once
#include "ecology_types.hh"
namespace fishsim {
struct PhysiologyParameters;
struct SpeciesRegistry;
struct SpeciesProtection {
  int eligible = 0, threatened = 0, missing = 0;
};
struct PopulationSupport {
  Genome founder = Genome::run_founder();
  void remember_breeder(const Individual &, const PhysiologyParameters &, SpeciesRegistry &,
                        const EvolutionParameters &, std::uint64_t environment);
  std::vector<Genome> reserve;
  std::vector<Genome> pool_founders;
  std::vector<ArchiveEntry> archive;
  std::vector<Breeder> breeders;
  std::uint64_t self_fertilisations = 0;
  std::uint64_t assistance_food = 0;
};
}
