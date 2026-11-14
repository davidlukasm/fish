#pragma once
#include "cppn/cppn.hh"
#include "mix.hh"
#include "hormones.hh"
#include <algorithm>
namespace field {
using TraitValues = std::array<float, cppn::OUTPUTS>;
struct CellTraits {
  TraitValues cell{}, learning{}, teaching{};
  TraitValues growth{};
  std::array<TraitValues, HORMONE_EFFECTS> receptors{};
};
inline constexpr std::uint64_t TRAIT_STREAM = 0x8d58ac26afe12e47ull;
inline std::size_t spread_family(int trait) {
  namespace O = cppn::output;
  if (trait <= int(O::capacity))
    return O::spread_development;
  return trait >= int(O::sender1) ? O::spread_contacts : O::spread_physiology;
}
inline TraitValues draw_traits(const TraitValues &mean, std::uint64_t seed, std::uint64_t identity,
                               bool receptor = false, bool contact = false) {
  auto drawn = mean;
  for (int k = 0; k < cppn::output::mean_count; ++k) {
    const auto family = receptor  ? cppn::output::spread_receptors
                        : contact ? cppn::output::spread_contacts
                                  : spread_family(k);
    const double width = 2 * std::clamp(mean[family], 0.f, 1.f);
    if (width == 0)
      continue;
    const auto key = splitmix(seed ^ splitmix(identity) ^ splitmix(TRAIT_STREAM + k));
    // Time constants are encoded in logarithmic coordinates before drawing.
    drawn[k] = float(std::clamp(mean[k] + width * (2 * unit_center(key) - 1), -1., 1.));
  }
  return drawn;
}
// The mode is read from the planned mean, so that receptor variation never switches it.
inline HormoneReceptor receptor_parameters(const TraitValues &v, const TraitValues &mean) {
  namespace O = cppn::output;
  HormoneReceptor r;
  r.cell_maturity = mean[O::sender1] > .5f;
  r.affinity = hormone_affinity<BLOOD_SUBSTANCES>(v[O::quality1], v[O::quality2],
                                                  (v[O::quality_width] + 1) * .5f);
  r.baseline = v[O::capacity];
  r.sensitivity = HORMONE_SENSITIVITY_SPAN * v[O::field_width];
  r.steepness = HORMONE_STEEPNESS_SPAN * std::clamp(v[O::time_constant], 0.f, 1.f);
  r.half = float(HORMONE_HALF_MIN *
                 std::pow(HORMONE_HALF_MAX / HORMONE_HALF_MIN, (v[O::threshold] + 1) * .5));
  return r;
}
}
