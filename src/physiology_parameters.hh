#pragma once
#include "hormone_state.hh"
#include "simulation_types.hh"
#include "food_web_parameters.hh"
namespace fishsim {
inline constexpr double DEFAULT_ORGAN_MASS_REF = 1.56;
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
  static constexpr double growth_cost = .3;
  static constexpr double basal_rate = .06, basal_fixed = .35;
  static constexpr double growth_reserve = .10, growth_rate = .16;
  static constexpr double heal_reserve = .15, heal_rate = .001, heal_cost = .03;
  static constexpr double catabolism_yield = .8, tissue_floor_share = .5;
  static constexpr double fixed_utilisation = .8, gut_linear = .5, gut_square = .4;
  static constexpr double nutrient_share = .2, nutrient_keep = .8;
  static constexpr double spine_block_cost = .5;
  static constexpr double senescence_spread = .4;
  static constexpr double senescence_share = .37, fasting_share = 1.5;
  double organ_mass_ref = DEFAULT_ORGAN_MASS_REF, undulation_loss = .5;
  double resting_spines = .3, resting_spines_half = 5, pigment_half = .5, pigment_rest = .2;
  double touch_rest = .1, stroke_threshold = .2;
  double drag_along = .028512, drag_across = .38016;
  double transfer_cost = .004, pigment_cost = .0002;
  double spine_rate = .02, spine_max = MAX_SPINE_EXTENT;
  double wall_restitution = .65, spine_abrasion = .003;
  double neural_cost;
  HormoneParameters hormones;
  double stroke_turn;
  double stroke_push;
  double sinking;
  double bladder_strength;
  double bladder_rate;
  double bladder_cost;
  // Energy per unit of muscle work, the same for every contraction; fibres scale it.
  double muscle_cost;
  double suction_range;
  double bite_wound;
  double wound_weakness;
  double size_physics;
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
