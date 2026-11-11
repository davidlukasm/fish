#include "physiology_parameters.hh"
#include <cmath>
namespace fishsim {
PhysiologyParameters::PhysiologyParameters()
    : neural_cost(.5), stroke_turn(4.68), stroke_push(.0273), sinking(.012), bladder_strength(.03),
      bladder_rate(.002), bladder_cost(.03), muscle_cost(.00128), suction_range(2), bite_wound(.25),
      wound_weakness(.5), size_physics(1), sperm_capacity(40), sperm_mixing(1. / 3.),
      sperm_dilution(.0015), sperm_opaque(.012), impact_damage(.05), lifespan(8000) {
}
// Health falls by rate * t per step, t steps after the start. Repair cancels it until
// t0 = heal_rate / rate; from there the loss rate / 2 * (t - t0)^2 reaches 1 after sqrt(2 / rate).
// So the time from the start to death is heal_rate / rate + sqrt(2 / rate), and without repair
// sqrt(2 / rate): a poorly fed fish dies well before the lifespan.
double PhysiologyParameters::senescence_rate() const {
  const double rest = (1 - senescence_share) * lifespan,
               x = (std::sqrt(2 + 4 * heal_rate * rest) - std::sqrt(2.)) / (2 * heal_rate);
  return 1 / (x * x);
}
double PhysiologyParameters::basal_metabolism() const {
  return body_unit::adult_reserve / (basal_rate * fasting_share * lifespan);
}
}
