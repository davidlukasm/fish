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
void write_sight(std::ostream &, const PerceptionState &);
void write_visual_samples(std::ostream &, const PerceptionState &);
void write_receptor(std::ostream &, const BrainInterface::Receptor &, const field::Neuron &,
                    double value);
void write_species(std::ostream &, const Ecosystem &, bool include_extinct = false,
                   std::uint64_t only_species = 0);
}
