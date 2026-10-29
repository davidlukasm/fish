#pragma once
#include "hormone_state.hh"
#include "food_web_parameters.hh"
namespace fishsim {
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
  double organ_mass_ref = 1.56, undulation_loss = .5;
  double resting_spines = .3, resting_spines_half = 5, pigment_half = 10;
  double touch_rest = .1, stroke_threshold = .2;
  double drag_along = .028512, drag_across = .38016;
  double turn_cost = .00114, transfer_cost = .004, pigment_cost = .0002, bite_cost = .00633,
         defense_cost = .012;
  double spine_rate = .02, spine_max = .85, pigment_rate = .01;
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
  double sperm_capacity;
  double sperm_mixing;
  double sperm_dilution;
  double sperm_opaque;
  double impact_damage;
  double senescence_start;
  double senescence_rate;
  double basal_metabolism;
  PhysiologyParameters();
};
}
