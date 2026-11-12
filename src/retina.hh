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
double spectral_balance(const BrainInterface::Receptor &, const Color &light, double opponent);
double spectral_drive(const BrainInterface::Receptor &, const Color &light, double opponent);
double proximity_depth(double range);
void inhibit_retinal_receptors(const BrainInterface &, std::vector<float> &, double strength);
std::optional<std::array<double, 2>> eye_view_place(const BrainInterface &,
                                                    const EnvironmentParameters &, int side);
std::array<VisualEye, EYES> visual_origins(const Body &, const BrainInterface &, const Field &);
std::vector<float> retinal_vision(const Body &, const BrainInterface &, const Field &,
                                  const std::vector<VisualObject> &, Body *inspected = nullptr,
                                  int stride = RETINAL_STRIDE, bool diagnostic = true,
                                  const std::array<VisualEye, EYES> *origins = nullptr);
}
