#pragma once
#include <optional>
#include "body.hh"
#include "brain_interface.hh"
#include "environment_parameters.hh"
#include "perception.hh"
#include "opencl.hh"
namespace fishsim {
inline constexpr int RETINAL_STRIDE = 8;
void prepare_retinal_cache(BrainInterface &);
// What a light cell takes from light of these channel strengths: its spectrum's share, less its
// opponent share (opponent: the world's strength of colour opponency) of the light it is not
// tuned to; negative where that light inhibits more than it excites. The drive is its positive
// part. The retina and the Atelier's colour and sensitivity views use both.
double spectral_balance(const BrainInterface::Receptor &, const Color &light, double opponent);
double spectral_drive(const BrainInterface::Receptor &, const Color &light, double opponent);
// How deep a near-sense cell of this range (in [0, 1]) senses: an object this far counts half.
double proximity_depth(double range);
void inhibit_retinal_receptors(const BrainInterface &, std::vector<float> &, double strength,
                               double surround);
// Where a side's eye looks from, in body radii along the body and across it (right positive), or
// nothing for a side without light or near-sense cells: along the body at its seat amid its light
// cells, across as far out as their lateral centroid lies within the head's half width there (the
// environment's eye offset scales that share, up to EYE_OUTSET of the half width), but no nearer
// the axis than half the eyes' clearance. The Atelier reports it for the design view.
std::optional<std::array<double, 2>> eye_view_place(const BrainInterface &,
                                                    const EnvironmentParameters &, int side);
std::array<VisualEye, EYES> visual_origins(const Body &, const BrainInterface &, const Field &);
std::vector<float> retinal_vision(const Body &, const BrainInterface &, const Field &,
                                  const std::vector<VisualObject> &, Body *inspected = nullptr,
                                  int stride = RETINAL_STRIDE, bool diagnostic = true,
                                  const std::array<VisualEye, EYES> *origins = nullptr);
}
