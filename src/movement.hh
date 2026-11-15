#pragma once
#include "body.hh"
#include "environment.hh"
#include "perception.hh"
#include "physiology_parameters.hh"
#include <optional>
namespace fishsim {
inline constexpr double MIN_THRUST_MASS = .5;

struct SwimmingGrip {
  double tail = 0, fins = 0;
};
SwimmingGrip swimming_grip(double speed);
double ground_grip(double immersion);

struct TwitchTurn {
  double during = 0;
  std::optional<double> settled;
};
// Estimate one fully paid twitch from rest in open water at its mean torque and fixed mass.
TwitchTurn isolated_twitch_turn(double torque, const StrokeTiming &, double mass,
                               const PhysiologyParameters &);
void move_body(Body &, const Field *, const PhysiologyParameters &, bool protected_life = false);
void limit_swimming(Body &, const Field &, const PhysiologyParameters &);
void advance_body(Body &, const Genome &, const Field *, const PhysiologyParameters &,
                  bool protected_life = false);
}
