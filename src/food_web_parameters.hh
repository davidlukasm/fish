#pragma once
namespace fishsim {
// One declaration supplies defaults and the world-parameter registry.
#define FISH_FOOD_WEB_PARAMETERS(X)                                                                \
  X(crack_exponent, 4, 1, 12, "Härtekurve")                                                        \
  X(hardness_algae, .01, 0, 2, "Algenhärte")                                                       \
  X(hardness_leaf, .03, 0, 2, "Blatthärte")                                                        \
  X(hardness_leaf_fiber, .07, 0, 2, "Blattfasern")                                                 \
  X(hardness_stalk, .1, 0, 2, "Halmhärte")                                                         \
  X(hardness_stalk_fiber, .4, 0, 2, "Halmfasern")                                                  \
  X(hardness_crab, .2, 0, 2, "Krabbenpanzer")                                                      \
  X(hardness_crab_growth, .4, 0, 2, "Krabbenpanzer: Wachstum")                                     \
  X(hardness_mussel, .4, 0, 2, "Muschelschale")                                                    \
  X(hardness_mussel_growth, .8, 0, 2, "Muschelschale: Wachstum")                                   \
  X(drift_softening, .5, 0, 1, "Treibgut: Anfangshärte")                                           \
  X(drift_softening_half, 150, 1, 10000, "Treibgut: Erweichung")                                   \
  X(fiber_growth_cost, .1, 0, 1, "Faserkosten")                                                    \
  X(fragment_min, 3, 1, 30, "Stücke mindestens")                                                   \
  X(fragment_max, 30, 1, 100, "Stücke höchstens")                                                  \
  X(fragment_gain, 27, 0, 100, "Zertrümmerung")                                                    \
  X(crumb_min, 25, .001, 100, "Kleinste Stückenergie")                                             \
  X(rest_steps, 60, 1, 10000, "Futterruhe je Radius")                                              \
  X(rest_speed, .05, .001, 1, "Ruhegeschwindigkeit")                                               \
  X(decay_half_life, 300, 1, 100000, "Zerfall am Grund: Halbwertszeit")                             \
  X(food_half_life, 2000, 1, 100000, "Kunstfutter: Halbwertszeit")                                 \
  X(egg_half_life, 1200, 1, 100000, "Eireste: Halbwertszeit")                                      \
  X(cloud_density, 1. / 504166.6666666667, 0, .0001, "Futterquellen je Fläche")                    \
  X(energy_supply, 95. / 5933055.733418587, 0, .01, "Energie je Wasserfläche und Schritt")         \
  X(food_supply_share, .5, 0, 1, "Zufuhranteil Kunstfutter")                                       \
  X(plankton_supply_share, .12, 0, 1, "Zufuhranteil Plankton")                                     \
  X(benthic_supply_share, .18, 0, 1, "Zufuhranteil Bodentiere")                                    \
  X(plant_lifespan, 48000, 1000, 1000000, "Pflanzenlebensdauer")                                   \
  X(microfauna_lifespan, 12000, 1000, 1000000, "Plankton und Würmer: Lebensdauer")                 \
  X(nature_half_life, 2000, 1, 1000000, "Naturverzehr: Halbwertszeit")                            \
  X(nature_weight, 10, 0, 1000, "Naturverzehr: Gewicht")                                           \
  X(rescue_nature_reset, 0, 0, 1, "Rettung: Naturzähler zurücksetzen")                             \
  X(foliage_blade_transmission, .75, .001, 1, "Sicht: Durchlass Halm")                             \
  X(foliage_stem_transmission, .6, .001, 1, "Sicht: Durchlass Stängel")                            \
  X(foliage_leaf_transmission, .1, .001, 1, "Sicht: Durchlass Blatt")                              \
  X(foliage_green_bias, .5, 0, .95, "Sicht: Grünanteil im Pflanzendurchlass")                      \
  X(plant_notch_heal, 3000, 1, 1000000, "Pflanzen: Bisskerben heilen (Halbwertszeit)")             \
  X(foliage_drag, 1.5, 0, 20, "Pflanzen: Bremswirkung auf Fische")                                 \
  X(foliage_yield, .8, 0, 1, "Pflanzen: Ausweichen vor Fischen")                                   \
  X(foliage_food_drag, 2, 0, 50, "Pflanzen: Futter bleibt hängen")                                 \
  X(crab_flee_speed, 1, 0, 10, "Krabbenflucht")                                                    \
  X(crab_pinch, .05, 0, 1, "Krabben: Kneifschaden")                                                \
  X(mussel_close_time, 40, 1, 10000, "Muscheln: Schließdauer")                                     \
  X(corpse_sink_time, 300, 1, 100000, "Kadaver: Sinkübergang")                                     \
  X(bone_time, 1000, 1, 100000, "Skelettdauer")                                                    \
  X(plankton_limit, .0025, 0, 1, "Krebschenbudget je Fläche")                                      \
  X(fish_energy_density, .07, 0, 10, "Fischbudget je Fläche")                                      \
  X(seed_energy, 2, .01, 100, "Pflanzenkeim")                                                      \
  X(plankton_max_density, .16, .001, 10, "Krebschendichte")                                        \
  X(plankton_growth, .008, 0, 1, "Krebschen: Wachstum an Quellen")                                 \
  X(plankton_cohesion, .045, 0, 1, "Schwarmzusammenhalt")                                          \
  X(plankton_flee_gradient, .01, .00001, 1, "Plankton: Strömungsgefälle")                          \
  X(plankton_flee_share, .5, 0, 1, "Krebschen: Fluchtanteil")                                      \
  X(plankton_flee_pause, 20, 1, 1000, "Krebschen: Fluchtpause")                                    \
  X(prey_alert_speed, .3, .001, 10, "Würmer und Muscheln: Warnschwelle")                           \
  X(plankton_seed_period, 500, 1, 100000, "Planktonquellen: Nachschubintervall")                   \
  X(plankton_seed_area, 1000000, 100, 100000000, "Planktonquellen: Fläche je Quelle")              \
  X(plankton_seed_threshold, .3, 0, 1, "Planktonquellen: Nachschubgrenze")                         \
  X(plankton_seed_energy, 144, .01, 1000, "Planktonquellen: Nachschub je Quelle")                  \
  X(plankton_seed_clearance, 24, 0, 100, "Planktonquellen: Bodenabstand")                          \
  X(worm_max, 3, 0, 100, "Würmer je Sedimentlänge")                                                \
  X(worm_spread, .005, 0, .25, "Wurmwanderung")                                                    \
  X(detritus_uptake, .01, 0, 1, "Bodennahrungsaufnahme")                                           \
  X(burrow_depth, 1.5, .01, 100, "Grabtiefe")                                                      \
  X(burial_cover, .5, .101, 1, "Sedimentdeckung")                                                  \
  X(worm_head_rate, .002, 0, 1, "Wurmköpfe: Häufigkeit")                                           \
  X(worm_head_energy, 40, .01, 100, "Wurmköpfe: Energie")                                          \
  X(worm_head_time, 120, 1, 1000, "Wurmköpfe: Mindestdauer")                                       \
  X(worm_head_time_max, 300, 1, 1000, "Wurmköpfe: Höchstdauer")                                    \
  X(worm_retreat_radius, 8, 0, 100, "Würmer: Rückzugsradius")                                      \
  X(worm_retreat_body, 2, 0, 10, "Würmer: Körperabstand")                                          \
  X(buried_odor, .3, 0, 1, "Geruch unter Sediment")                                                \
  X(odor_rise, 60, 1, 10000, "Geruchsentwicklung")                                                 \
  X(odor_emission, .023, 0, 1, "Geruch: Abgaberate")                                               \
  X(odor_mixing, 30, 0, 200, "Geruch: Grunddurchmischung")                                         \
  X(waterborne_drift, 2, 0, 10, "Gerüche und Wolken: Mitnahme durch Strömung")                     \
  X(odor_lifetime_food, 120, 1, 100000, "Geruch Futter: Abklingzeit")                              \
  X(odor_lifetime_algae, 240, 1, 100000, "Geruch Algen: Abklingzeit")                              \
  X(odor_lifetime_plants, 200, 1, 100000, "Geruch Pflanzen: Abklingzeit")                          \
  X(odor_lifetime_worms, 160, 1, 100000, "Geruch Würmer / Muscheln: Abklingzeit")                  \
  X(odor_lifetime_plankton, 120, 1, 100000, "Geruch Plankton / Krebse: Abklingzeit")               \
  X(odor_lifetime_carrion, 80, 1, 100000, "Geruch Aas: Abklingzeit")                               \
  X(odor_lifetime_eggs, 120, 1, 100000, "Geruch Eier: Abklingzeit")                                \
  X(crab_spacing, 225, 1, 10000, "Krabbenabstand")                                                 \
  X(crab_energy, 1500, 10, 10000, "Krabbenenergie")                                                \
  X(crab_speed, .3, 0, 10, "Krabbenlauf")                                                          \
  X(crab_search_radius, 120, 1, 1000, "Krabbensuche")                                              \
  X(crab_move_interval, 150, 1, 100000, "Krabbenruhe mindestens")                                  \
  X(crab_move_interval_max, 450, 1, 100000, "Krabbenruhe höchstens")                               \
  X(crab_mature, 600, 1, 100000, "Krabbenreife")                                                   \
  X(crab_lifespan, 12000, 1, 1000000, "Krabbenlebensdauer")                                        \
  X(crab_leave, .5, 0, 100, "Krabben: Nahrung für Aufenthalt")                                     \
  X(crab_birth_energy, 10, .5, 100, "Jungkrabbenenergie")                                          \
  X(crab_burrow_time, 10, 1, 1000, "Krabben: Eingrabdauer")                                        \
  X(crab_edge_gap, 4, 0, 100, "Krabben: Kantenwechsel")                                            \
  X(mussel_spacing, 5, 1, 1000, "Muschelabstand")                                                  \
  X(mussel_energy, 400, 4, 10000, "Muschelenergie")                                                \
  X(mussel_filter_radius, 12, 1, 100, "Muschelfilterweite")                                        \
  X(mussel_filter_rate, .005, 0, 1, "Muschelfilterrate")                                           \
  X(mussel_mature, 2000, 1, 100000, "Muschelreife")                                                \
  X(mussel_spawn, 800, 1, 100000, "Muschelnachwuchs")                                              \
  X(mussel_spawn_filling, .9, 0, 1, "Muschelreife: Füllung")                                       \
  X(mussel_birth_energy, 20, .5, 100, "Jungmuschelenergie")                                        \
  X(mussel_spawn_radius, 40, 1, 1000, "Muschelausbreitung")                                        \
  X(mussel_seed_period, 2000, 1, 100000, "Muscheln: Wiederbesiedlung")                             \
  X(mussel_burial_death, 500, 1, 100000, "Muscheln: Zeit unter Sediment")                          \
  X(mussel_lifespan, 20000, 1, 1000000, "Muschellebensdauer")
struct FoodWebParameters {
#define FISH_DECLARE_FOOD_PARAMETER(name, value, lo, hi, label) double name = value;
  FISH_FOOD_WEB_PARAMETERS(FISH_DECLARE_FOOD_PARAMETER)
#undef FISH_DECLARE_FOOD_PARAMETER
};
inline constexpr double default_max_bite_force = 110;
}
