#include "physiology_parameters.hh"
namespace fishsim {
PhysiologyParameters::PhysiologyParameters()
    : neural_cost(.5), stroke_turn(4.68), stroke_push(.0273), sinking(.0012),
      bladder_strength(.008), bladder_rate(.002), bladder_cost(.03), swimming_cost(.00128),
      suction_cost(.0002), suction_range(2), bite_wound(.25), wound_weakness(.5), size_physics(1),
      sperm_capacity(40), sperm_mixing(1. / 3.), sperm_dilution(.0015), sperm_opaque(.012),
      impact_damage(.05), senescence_start(1400), senescence_rate(.000001), basal_metabolism(1.2) {
  // Ageing: without repair health is gone sqrt(2 / senescence_rate) ~ 1400 steps after its start
  // (2800 after hatching); a well-fed fish repairs heal_rate per step and lives ~2400 steps past
  // it (3800). With the start's spread only a few well-fed fish pass 4000 steps.
  // Turnover: a bite takes a whole mouthful, so feeding fish take in several times their resting
  // cost; the resting cost is twice the former 0.6 so that a full adult reserve lasts about
  // 2000-3500 steps of fasting instead of 8000, shorter than a life.
}
}
