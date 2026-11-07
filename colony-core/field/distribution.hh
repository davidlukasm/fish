#pragma once
#include "cppn/cppn.hh"
#include "mix.hh"
#include <algorithm>
namespace field {
using TraitValues = std::array<float, cppn::OUTPUTS>;
inline constexpr std::uint64_t TRAIT_STREAM = 0x8d58ac26afe12e47ull;
inline TraitValues draw_traits(const TraitValues &mean, std::uint64_t seed,
                               std::uint64_t identity) {
  auto drawn = mean;
  for (int k = 0; k < cppn::output::mean_count; ++k) {
    const double width = 2 * std::clamp(mean[cppn::output::mean_count + k], 0.f, 1.f);
    if (width == 0)
      continue;
    const auto key = splitmix(seed ^ splitmix(identity) ^ splitmix(TRAIT_STREAM + k));
    drawn[k] = float(std::clamp(mean[k] + width * (2 * unit_center(key) - 1), -1., 1.));
  }
  return drawn;
}
}
