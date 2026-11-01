#pragma once
#include <array>
#include <cmath>
#include "food_web_parameters.hh"
#include "small_animals.hh"
namespace fishsim {
struct EnvironmentParameters : FoodWebParameters {
  // Odor of decaying remains fades at half the rate of their decay.
  double odor_freshness(double decay_age) const {
    return std::exp2(-decay_age / (2 * decay_half_life));
  }
  // In the order of odor_kind; mussels fade like the benthos.
  std::array<double, odor_channel_count> odor_lifetimes() const {
    return {odor_lifetime_food,  odor_lifetime_algae,    odor_lifetime_plants,
            odor_lifetime_worms, odor_lifetime_plankton, odor_lifetime_carrion,
            odor_lifetime_eggs,  odor_lifetime_worms};
  }
  double vision_range = 128;
  double vision_inhibition = 1;
  double vision_opponent = 1;
  double vision_ambient = .6, vision_adaptation = 1, vision_adaptation_angle = 15;
  double vision_water_red = .30, vision_water_green = .55, vision_water_blue = .60;
  double vision_eye_offset = 2.4, vision_binocular_angle = .05;
  double vision_ink_scatter = 1, vision_burial = 1;
  double day_period = 0, night_light = .1;
  double algae_rate = .0125, grass_rate = .01125, algae_capacity = 1024, grass_capacity = 2560;
  double algae_thickness = 4, grass_length = 96;
  double light_bottom = .35, light_shadow = .12, sediment_half_life = 35. / 3, sediment_path = 32,
         sediment_reach = 24;
};
}
