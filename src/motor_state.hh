#pragma once
#include "simulation_types.hh"
namespace fishsim {
enum StrokeIndex {
  StrokeTail,
  StrokeTurnLeft,
  StrokeTurnRight,
  StrokeSuction,
  StrokeEgg,
  StrokeSperm,
  StrokeBite,
  StrokeDefense,
  STROKE_COUNT
};
constexpr std::array<int, STROKE_COUNT> STROKE_PORTS{1, 2, 2, 6, 4, 5, 10, 11};
struct StrokeState {
  double mean = 0, power = 0;
  int recovery = 0;
};
struct StrokeTiming {
  double steps = 4, keep = std::exp(-.25);
  int recovery = 4;
  void set(double tau) {
    steps = std::clamp(tau, 4., 48.);
    keep = std::exp(-1 / steps);
    recovery = int(std::lround(steps));
  }
};
struct MotorState {
  double speed = 2;
  double turn = 0; // Actual angle change in the last step (senses and observation).
  double angular_velocity = 0;
  double travel = 0;
  double vx = 0;
  double vy = 0;
  double thrust = 0;
  double torque = 0;
  double aggression = 0;
  double defense = 0;
  double combat_cost = 0;
  double water_vx = 0;
  double water_vy = 0;
  double relative_speed = 0;
  double impulse_left = 0;
  double impulse_right = 0;
  double tail = 0;
  double impulse_forward = 0;
  double motor_factor = 1;
  double mouth_pose = 0;
  double suction_pose = 0;
  double bite_pose = 0;
  // Last paid motor events, for inspection only.
  std::array<unsigned char, 10> motor_pulses{};
  std::array<StrokeState, STROKE_COUNT> strokes{};
  std::array<double, 3> pigment{};
  std::array<double, 3> fin_tension{};
  // Presentation history; excluded from saved physics and evolution.
  bool fin_stroke_side = false;
  std::array<int, 2> fin_stroke_age{-1, -1};
  std::array<double, 3> fin_stroke_peak{};
  bool swimming_pending = false;
  double contact_x = 0;
  double contact_y = 0;
  double impact = 0;
  double impact_wound = 0;
  // Transient display evidence.
  double blood_loss = 0;
  double blood_x = 0;
  double blood_y = 0;
};
}
