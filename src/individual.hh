#pragma once
#include "body.hh"
#include "genome.hh"
#include "behavior_statistics.hh"
namespace fishsim {
struct IndividualState {
  Genome genome;
  std::uint64_t id = 0, parent = 0, born = 0, last_spawn = 0;
  std::uint64_t father = 0;
  std::uint64_t last_sperm = 0;
  std::uint64_t species = 0, maternal_species = 0, paternal_species = 0;
  unsigned g = 0, maternal_g = 0;
  // Consecutive naturally born, self-feeding generations in this species (capped at two).
  unsigned feeding_generations = 0;

  int maternal_depth = 0;
  int paternal_depth = 0;

  bool fertilised = true, clonal = false, nutrient_egg = false;
  bool maternal_natural = false, paternal_natural = false;
  int death_cause = -1;
  int depth = 0;
  int offspring = 0;
  int origin = 0;

  double novelty = 0;

protected:
  BehaviorStatistics observations_;
};
struct Individual : IndividualState {
  Body body;
  bool developing() const { return !nutrient_egg && (fertilised || clonal); }
  const BehaviorStatistics &observations() const { return observations_; }
  int niche() const;
  std::array<double, BEHAVIOR_FEATURES> behavior() const;
  Individual observation() const {
    Individual result;
    static_cast<IndividualState &>(result) = *this;
    result.body = body.observation();
    // Completed plans and genes are immutable. Planning jobs are only compared by identity.
    result.genome.growth_query.reset();
    return result;
  }

private:
  friend class Ecosystem;
  friend class PopulationCheckpoint;
  friend struct test::StateAccess;
};
struct FeedingResult {
  std::array<double, DIET_COUNT> nutrition{}, raw{};
  int eggs = 0, corpses = 0;
  bool plants = false;
};
}
