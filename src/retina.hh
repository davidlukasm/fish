#pragma once
#include "body.hh"
#include "brain_interface.hh"
#include "perception.hh"
#include "opencl.hh"
namespace fishsim {
inline constexpr int RETINAL_STRIDE = 8;
void prepare_retinal_cache(BrainInterface &);
void inhibit_retinal_receptors(const BrainInterface &, std::vector<float> &, double strength,
                               double surround);
std::array<VisualEye, 2> visual_origins(const Body &, const BrainInterface &, const Field &);
std::vector<float> retinal_vision(const Body &, const BrainInterface &, const Field &,
                                  const std::vector<VisualObject> &, Body *inspected = nullptr,
                                  int stride = RETINAL_STRIDE, bool diagnostic = true,
                                  const std::array<VisualEye, 2> *origins = nullptr);
}
