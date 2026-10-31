#pragma once
namespace fishsim {
// One declaration supplies defaults and the world-parameter registry; the interface names them.
#define FISH_FOOD_WEB_PARAMETERS(X)                                                                \
  X(crack_exponent, 4, 1, 12)                                                                      \
  X(hardness_algae, .01, 0, 2)                                                                     \
  X(hardness_leaf, .03, 0, 2)                                                                      \
  X(hardness_leaf_fiber, .07, 0, 2)                                                                \
  X(hardness_stalk, .1, 0, 2)                                                                      \
  X(hardness_stalk_fiber, .4, 0, 2)                                                                \
  X(hardness_crab, .2, 0, 2)                                                                       \
  X(hardness_crab_growth, .4, 0, 2)                                                                \
  X(hardness_mussel, .4, 0, 2)                                                                     \
  X(hardness_mussel_growth, .8, 0, 2)                                                              \
  X(drift_softening, .5, 0, 1)                                                                     \
  X(drift_softening_half, 150, 1, 10000)                                                           \
  X(fiber_growth_cost, .1, 0, 1)                                                                   \
  X(fragment_min, 3, 1, 30)                                                                        \
  X(fragment_max, 30, 1, 100)                                                                      \
  X(fragment_gain, 27, 0, 100)                                                                     \
  X(crumb_min, 25, .001, 100)                                                                      \
  X(rest_steps, 60, 1, 10000)                                                                      \
  X(rest_speed, .05, .001, 1)                                                                      \
  X(decay_half_life, 300, 1, 100000)                                                               \
  X(food_half_life, 2000, 1, 100000)                                                               \
  X(egg_half_life, 1200, 1, 100000)                                                                \
  X(cloud_density, 1. / 504166.6666666667, 0, .0001)                                               \
  X(energy_supply, 95. / 5933055.733418587, 0, .01)                                                \
  X(food_supply_share, .5, 0, 1)                                                                   \
  X(plankton_supply_share, .12, 0, 1)                                                              \
  X(benthic_supply_share, .18, 0, 1)                                                               \
  X(plant_lifespan, 48000, 1000, 1000000)                                                          \
  X(microfauna_lifespan, 12000, 1000, 1000000)                                                     \
  X(nature_half_life, 10000, 1, 1000000)                                                           \
  X(nature_weight, 1, 0, 1000)                                                                     \
  X(rescue_nature_reset, 1, 0, 1)                                                                  \
  X(foliage_blade_transmission, .75, .001, 1)                                                      \
  X(foliage_stem_transmission, .6, .001, 1)                                                        \
  X(foliage_leaf_transmission, .1, .001, 1)                                                        \
  X(foliage_green_bias, .5, 0, .95)                                                                \
  X(plant_notch_heal, 3000, 1, 1000000)                                                            \
  X(foliage_drag, 1.5, 0, 20)                                                                      \
  X(foliage_yield, .8, 0, 1)                                                                       \
  X(foliage_food_drag, 2, 0, 50)                                                                   \
  X(crab_flee_speed, 1, 0, 10)                                                                     \
  X(crab_pinch, .05, 0, 1)                                                                         \
  X(mussel_close_time, 40, 1, 10000)                                                               \
  X(corpse_sink_time, 300, 1, 100000)                                                              \
  X(bone_time, 1000, 1, 100000)                                                                    \
  X(plankton_limit, .0025, 0, 1)                                                                   \
  X(fish_energy_density, .07, 0, 10)                                                               \
  X(seed_energy, 2, .01, 100)                                                                      \
  X(plankton_max_density, .16, .001, 10)                                                           \
  X(plankton_growth, .008, 0, 1)                                                                   \
  X(plankton_cohesion, .045, 0, 1)                                                                 \
  X(plankton_flee_gradient, .01, .00001, 1)                                                        \
  X(plankton_flee_share, .5, 0, 1)                                                                 \
  X(plankton_flee_pause, 20, 1, 1000)                                                              \
  X(prey_alert_speed, .3, .001, 10)                                                                \
  X(plankton_seed_period, 500, 1, 100000)                                                          \
  X(plankton_seed_area, 1000000, 100, 100000000)                                                   \
  X(plankton_seed_threshold, .3, 0, 1)                                                             \
  X(plankton_seed_energy, 144, .01, 1000)                                                          \
  X(plankton_seed_clearance, 24, 0, 100)                                                           \
  X(worm_max, 3, 0, 100)                                                                           \
  X(worm_spread, .005, 0, .25)                                                                     \
  X(detritus_uptake, .01, 0, 1)                                                                    \
  X(burrow_depth, 1.5, .01, 100)                                                                   \
  X(burial_cover, .5, .101, 1)                                                                     \
  X(worm_head_rate, .002, 0, 1)                                                                    \
  X(worm_head_energy, 40, .01, 100)                                                                \
  X(worm_head_time, 120, 1, 1000)                                                                  \
  X(worm_head_time_max, 300, 1, 1000)                                                              \
  X(worm_retreat_radius, 8, 0, 100)                                                                \
  X(worm_retreat_body, 2, 0, 10)                                                                   \
  X(buried_odor, .3, 0, 1)                                                                         \
  X(odor_rise, 60, 1, 10000)                                                                       \
  X(odor_emission, .023, 0, 1)                                                                     \
  X(odor_mixing, 30, 0, 200)                                                                       \
  X(waterborne_drift, 2, 0, 10)                                                                    \
  X(odor_lifetime_food, 60, 1, 100000)                                                             \
  X(odor_lifetime_algae, 120, 1, 100000)                                                           \
  X(odor_lifetime_plants, 100, 1, 100000)                                                          \
  X(odor_lifetime_worms, 80, 1, 100000)                                                            \
  X(odor_lifetime_plankton, 60, 1, 100000)                                                         \
  X(odor_lifetime_carrion, 80, 1, 100000)                                                          \
  X(odor_lifetime_eggs, 120, 1, 100000)                                                            \
  X(odor_strength_carrion, 3, 0, 100)                                                              \
  X(odor_strength_eggs, 3, 0, 100)                                                                 \
  X(crab_spacing, 225, 1, 10000)                                                                   \
  X(crab_energy, 1500, 10, 10000)                                                                  \
  X(crab_speed, .3, 0, 10)                                                                         \
  X(crab_search_radius, 120, 1, 1000)                                                              \
  X(crab_move_interval, 150, 1, 100000)                                                            \
  X(crab_move_interval_max, 450, 1, 100000)                                                        \
  X(crab_mature, 600, 1, 100000)                                                                   \
  X(crab_lifespan, 12000, 1, 1000000)                                                              \
  X(crab_leave, .5, 0, 100)                                                                        \
  X(crab_birth_energy, 10, .5, 100)                                                                \
  X(crab_burrow_time, 10, 1, 1000)                                                                 \
  X(crab_edge_gap, 4, 0, 100)                                                                      \
  X(mussel_spacing, 5, 1, 1000)                                                                    \
  X(mussel_energy, 400, 4, 10000)                                                                  \
  X(mussel_filter_radius, 12, 1, 100)                                                              \
  X(mussel_filter_rate, .005, 0, 1)                                                                \
  X(mussel_mature, 2000, 1, 100000)                                                                \
  X(mussel_spawn, 1600, 1, 100000)                                                                 \
  X(mussel_spawn_filling, .9, 0, 1)                                                                \
  X(mussel_birth_energy, 20, .5, 100)                                                              \
  X(mussel_spawn_radius, 32, 1, 1000)                                                              \
  X(mussel_far_settling, .04, 0, 1)                                                                \
  X(mussel_algae_limit, .35, 0, 1)                                                                 \
  X(mussel_seed_period, 2000, 1, 100000)                                                           \
  X(mussel_burial_death, 500, 1, 100000)                                                           \
  X(mussel_lifespan, 20000, 1, 1000000)
struct FoodWebParameters {
#define FISH_DECLARE_FOOD_PARAMETER(name, value, lo, hi) double name = value;
  FISH_FOOD_WEB_PARAMETERS(FISH_DECLARE_FOOD_PARAMETER)
#undef FISH_DECLARE_FOOD_PARAMETER
};
inline constexpr double default_max_bite_force = 110;
}
