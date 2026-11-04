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
// What a fish sees, as the Aquarium's vision overlay and eye readouts take it: where it looks
// from, its eyes and the light image per eye in vision::pixels bearings (JSON members).
void write_sight(std::ostream &, const PerceptionState &);
// What each light cell took of that image (rows of visual_sample_column).
void write_visual_samples(std::ostream &, const PerceptionState &);
// One receptor as the brain layout lists it, with its current reading.
void write_receptor(std::ostream &, const BrainInterface::Receptor &, const field::Neuron &,
                    double value);
void write_species(std::ostream &, const Ecosystem &, bool include_extinct = false,
                   std::uint64_t only_species = 0);
}
