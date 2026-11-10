#pragma once
#include <array>
#include <cmath>
#include "food_web_parameters.hh"
#include "protocol_schema.hh"
#include "small_animals.hh"
namespace fishsim {
inline constexpr double DEFAULT_BINOCULAR_ANGLE = .05, DEFAULT_ADAPTATION_ANGLE = 15,
                        DEFAULT_EYE_OFFSET = eye_place::default_offset;
struct EnvironmentParameters : FoodWebParameters {
  double odor_freshness(double decay_age) const {
    return std::exp2(-decay_age / (2 * decay_half_life));
  }
  std::array<double, odor_kind::count> odor_lifetimes() const {
    return {odor_lifetime_food,  odor_lifetime_algae,    odor_lifetime_plants,
            odor_lifetime_worms, odor_lifetime_plankton, odor_lifetime_carrion,
            odor_lifetime_eggs,  odor_lifetime_worms};
  }
  double vision_range = 128;
  double vision_inhibition = 1;
  double vision_opponent = 1;
  double vision_ambient = .6, vision_adaptation = 1,
         vision_adaptation_angle = DEFAULT_ADAPTATION_ANGLE;
  // Neutral water leaves colour-opponent cells silent on open water, so plants and food keep their
  // hue into the distance; a tinted veil would drive the cells tuned to its colour instead.
  double vision_water_red = .30, vision_water_green = .30, vision_water_blue = .30;
  double vision_eye_offset = DEFAULT_EYE_OFFSET, vision_binocular_angle = DEFAULT_BINOCULAR_ANGLE;
  double vision_ink_scatter = 1, vision_burial = 1;
  double day_period = 0, night_light = .1;
  double algae_rate = .0125, grass_rate = .01125, algae_capacity = 1024, grass_capacity = 2560;
  double algae_thickness = 4, grass_length = 96;
  double light_bottom = .35, light_shadow = .12, sediment_half_life = 35. / 3, sediment_path = 32,
         sediment_reach = 24;
};
}
