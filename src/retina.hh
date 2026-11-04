#pragma once
#include "body.hh"
#include "brain_interface.hh"
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
void inhibit_retinal_receptors(const BrainInterface &, std::vector<float> &, double strength,
                               double surround);
std::array<VisualEye, EYES> visual_origins(const Body &, const BrainInterface &, const Field &);
std::vector<float> retinal_vision(const Body &, const BrainInterface &, const Field &,
                                  const std::vector<VisualObject> &, Body *inspected = nullptr,
                                  int stride = RETINAL_STRIDE, bool diagnostic = true,
                                  const std::array<VisualEye, EYES> *origins = nullptr);
}
