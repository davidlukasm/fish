#include "physiology_parameters.hh"
namespace fishsim {
PhysiologyParameters::PhysiologyParameters()
    : neural_cost(.5), stroke_turn(4.68), stroke_push(.0273), sinking(.0012),
      bladder_strength(.008), bladder_rate(.002), bladder_cost(.03), swimming_cost(.00016),
      suction_cost(.0002), suction_range(2), bite_wound(.25), wound_weakness(.5), size_physics(1),
      sperm_capacity(40), sperm_mixing(1. / 3.), sperm_dilution(.0015), sperm_opaque(.012),
      impact_damage(.05), senescence_start(2000), senescence_rate(.000001), basal_metabolism(.6) {
}
}
