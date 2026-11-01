#pragma once
#include "ecology_types.hh"
namespace fishsim {
struct PhysiologyParameters;
struct SpeciesRegistry;
// A species is protected once it fed for PROTECTED_GENERATIONS generations (counting stops
// there), at most MAX_PROTECTIONS times.
inline constexpr unsigned PROTECTED_GENERATIONS = 2;
inline constexpr int MAX_PROTECTIONS = 3;
struct SpeciesProtection {
  int eligible = 0, threatened = 0, missing = 0;
};
struct PopulationSupport {
  Genome founder;
  void remember_breeder(const Individual &, const PhysiologyParameters &, SpeciesRegistry &,
                        const EvolutionParameters &, std::uint64_t environment);
  std::vector<Genome> reserve;
  std::vector<ArchiveEntry> archive;
  std::vector<Breeder> breeders;
  std::uint64_t self_fertilisations = 0;
  std::uint64_t assistance_food = 0;
};
}
