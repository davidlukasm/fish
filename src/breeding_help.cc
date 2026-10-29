#include "ecology.hh"
#include <cmath>
namespace fishsim {
void Ecosystem::update_breeding_help(double nutrition, std::uint64_t exposure) {
  auto &s = support_.breeding_help;
  if (!s.enabled || !exposure)
    return;
  s.nutrition += std::max(0., nutrition);
  s.exposure += exposure;
  if (++s.steps < 200)
    return;
  const double sample = s.nutrition / s.exposure;
  s.current = s.target > 0 ? .5 * s.current + .5 * sample : sample;
  if (s.target > 0) {
    const double ratio = s.current / s.target;
    if (ratio < .95)
      s.scale = std::min(100., s.scale * std::exp(.35 * (1 - ratio)));
    else if (ratio > 1.05)
      s.scale = std::max(1., s.scale * .97);
  }
  s.target = std::max(s.target, s.current);
  s.nutrition = 0;
  s.exposure = s.steps = 0;
}
BreedingFood Ecosystem::breeding_food() const {
  const auto &f = field;
  BreedingFood result{f.food_supply().rate, f.food_supply().limit, f.feeding().food_min,
                      f.feeding().food_max};
  if (!support_.breeding_help.enabled)
    return result;
  const double scale = std::clamp(support_.breeding_help.scale, 1., 100.);
  result.limit =
      std::clamp(std::floor(f.food_supply().limit * scale), 1., 100 * f.food_supply().limit);
  result.rate = std::min(100 * std::max(1., f.food_supply().rate),
                         std::max(.01, f.food_supply().rate) * scale);
  // Share the available tank energy among the desired pieces; keep old food intact.
  const double budget = f.feeding().food_energy_limit;
  const double mean = f.feeding().food_min + (f.feeding().food_max - f.feeding().food_min) / 3;
  const double factor = std::min(1., budget / std::max(1., result.limit) / mean);
  // Preserve a useful range of grain sizes while sharing the food budget.
  result.minimum =
      std::clamp(f.feeding().food_min * factor, f.env().crumb_min, 100 * f.feeding().food_min);
  result.maximum =
      std::clamp(f.feeding().food_max * factor, result.minimum, 100 * f.feeding().food_max);
  return result;
}
}
