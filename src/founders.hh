#pragma once
#include "genome.hh"
#include "physiology_parameters.hh"
namespace fishsim {
struct Ecosystem;
// Food for trials and probes, placed only where the tank has room and energy.
bool place_trial_food(Ecosystem &, double x, double y, double energy, int origin = 0);
// Two genomes with the same development seed and pattern grow the same body.
bool same_founder_design(const Genome &, const Genome &);
bool hatch_capable_anatomy(const BrainInterface &);
bool founder_cell_plan_possible(const field::Substrate &);
bool founder_actuation_possible(const BrainInterface &, const PhysiologyParameters &);
bool hatch_candidate(const Genome &);
void develop_hatch_candidate(Genome &, const std::atomic<bool> &);
}
