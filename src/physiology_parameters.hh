#pragma once
#include "hormone_state.hh"
#include "simulation_types.hh"
#include "food_web_parameters.hh"
namespace fishsim {
// Organ mass of a standard body; tissue capacity and growth refer to it.
inline constexpr double DEFAULT_ORGAN_MASS_REF = 1.56;
// The neural cost factor stays within NEURAL_COST_MIN and NEURAL_COST_MAX.
inline constexpr double NEURAL_COST_MIN = .01, NEURAL_COST_MAX = 100;
struct PhysiologyParameters {
  double embryo_fold = 0.55;
  double embryo_crowding = 0.65;
  double embryo_flow_decay = 0.6;
  double embryo_flow_gain = 0.1;
  double embryo_touch_gain = 0.1;
  double embryo_pressure_damage = 0.002;
  double embryo_reserve_damage = 0.004;
  double embryo_damage_power = 4;
  double embryo_defense_damage = 0.002;
  double hatch_shell_limit = 0.95;
  double hatch_force_base = 0.2;
  double hatch_force_shell = 4;
  double hatch_mass_floor = 0.2;
  double embryo_nutrient_gain = 0.2;
  double max_bite_force = default_max_bite_force;
  double gut_time = 400, fill_plant = 2, fill_sediment = 3;
  static constexpr double digestion_cost = .12;
  // Biosynthesis: each unit of new tissue costs 1 + growth_cost from the digested surplus.
  static constexpr double growth_cost = .3;
  // Basal cost per step: basal_rate * basal_metabolism() * (basal_fixed + (1 - basal_fixed) *
  // tissue / BODY_TISSUE); the fixed share does not shrink with the body.
  static constexpr double basal_rate = .06, basal_fixed = .35;
  // Growth only above growth_reserve of the reserve capacity, at most growth_rate *
  // sqrt(tissue / BODY_TISSUE) per step.
  static constexpr double growth_reserve = .10, growth_rate = .16;
  // Healing above heal_reserve of the reserve capacity: heal_rate health for heal_cost energy.
  // A starving fish does not repair wounds, disease and ageing damage, so it dies earlier. (A
  // higher limit fails: eggs take everything above the spawning reserve, about 40 %.)
  static constexpr double heal_reserve = .15, heal_rate = .001, heal_cost = .03;
  // Starvation breaks tissue down to tissue_floor_share of the peak; each unit yields
  // catabolism_yield energy.
  static constexpr double catabolism_yield = .8, tissue_floor_share = .5;
  // Utilisation: artificial and sediment food fixed_utilisation; animal food
  // 1 - gut_linear * L - gut_square * L^2 for gut length L, plant food the same with 1 - L.
  // Gut volume and transit scale with (1 + L) / (1 + TRAIT_MIDDLE).
  static constexpr double fixed_utilisation = .8, gut_linear = .5, gut_square = .4;
  // Nutrient signal: share of swallowed usable energy, kept per step.
  static constexpr double nutrient_share = .2, nutrient_keep = .8;
  // Spines that block an impact cost spine_block_cost * BODY_TISSUE per blocked damage.
  static constexpr double spine_block_cost = .5;
  // Senescence starts at senescence_start() * (1 +- senescence_spread / 2), fixed per individual.
  static constexpr double senescence_spread = .4;
  // The pace of life follows the lifespan of a well-fed fish (steps after hatching): ageing starts
  // after senescence_share of it and runs so fast that a fish repairing heal_rate per step dies at
  // the lifespan; a full adult reserve carries the basal cost alone for fasting_share of it.
  static constexpr double senescence_share = .37, fasting_share = 1.5;
  double organ_mass_ref = DEFAULT_ORGAN_MASS_REF, undulation_loss = .5;
  double resting_spines = .3, resting_spines_half = 5, pigment_half = 1.5;
  double touch_rest = .1, stroke_threshold = .2;
  double drag_along = .028512, drag_across = .38016;
  double turn_cost = .00912, transfer_cost = .004, pigment_cost = .0002, bite_cost = .00633,
         defense_cost = .012;
  double spine_rate = .02, spine_max = MAX_SPINE_EXTENT, pigment_rate = .01;
  double wall_restitution = .65, spine_abrasion = .003;
  double neural_cost;
  HormoneParameters hormones;
  double stroke_turn;
  double stroke_push;
  double sinking;
  double bladder_strength;
  double bladder_rate;
  double bladder_cost;
  double swimming_cost;
  double suction_cost;
  double suction_range;
  double bite_wound;
  double wound_weakness;
  double size_physics;
  // size_physics is a switch: bodies move by their size when it is on.
  bool scaled_by_size() const { return size_physics >= .5; }
  double sperm_capacity;
  double sperm_mixing;
  double sperm_dilution;
  double sperm_opaque;
  double impact_damage;
  double lifespan;
  double senescence_start() const { return senescence_share * lifespan; }
  double senescence_rate() const;
  double basal_metabolism() const;
  PhysiologyParameters();
};
}
