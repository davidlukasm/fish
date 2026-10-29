#pragma once
#include "ecology.hh"
#include <ostream>
namespace fishsim {
void write_corpse_visual(std::ostream &, const Corpse &);
void write_body_profile(std::ostream &, const Individual &);
void write_morphology(std::ostream &, const std::shared_ptr<const BrainInterface> &);
void write_individual(std::ostream &, const Individual &, std::uint64_t morphology = 0,
                      double neural_cost = 1);
void accumulate_body_profile(const Individual &, SpeciesBodyProfile &);
void write_species(std::ostream &, const Ecosystem &, bool include_extinct = false,
                   std::uint64_t only_species = 0);
void write_ecological_milestones(std::ostream &, const Ecosystem &);
}
