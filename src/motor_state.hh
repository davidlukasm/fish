#pragma once
#include "simulation_types.hh"
#include "field/functions.hh"
namespace fishsim {
enum StrokeIndex {
  StrokeTail = stroke_kind::tail,
  StrokeTurnLeft = stroke_kind::turn_left,
  StrokeTurnRight = stroke_kind::turn_right,
  StrokeSuction = stroke_kind::suction,
  StrokeEgg = stroke_kind::egg,
  StrokeSperm = stroke_kind::sperm,
  StrokeBite = stroke_kind::bite,
  StrokeDefense = stroke_kind::defense,
  StrokeReverseLeft = stroke_kind::reverse_left,
  StrokeReverseRight = stroke_kind::reverse_right,
  STROKE_COUNT = stroke_kind::count
};
inline constexpr int ORGAN_PORTS = organ_port::gland + 1;
constexpr std::array<int, STROKE_COUNT> STROKE_PORTS{
    organ_port::forward, organ_port::turn,  organ_port::turn, organ_port::suction,
    organ_port::eggs,    organ_port::sperm, organ_port::jaw,  organ_port::defense,
    organ_port::turn,    organ_port::turn};
// The strokes of each pectoral fin: the back stroke pushes the fish forward, the forward stroke
// of the antagonist muscles pushes it back.
constexpr std::array<int, 2> BACK_STROKES{StrokeTurnLeft, StrokeTurnRight},
    FRONT_STROKES{StrokeReverseLeft, StrokeReverseRight};
struct StrokeState {
  double mean = 0, power = 0, paid = 0;
  int recovery = 0;
};
inline constexpr double MIN_STROKE_STEPS = field::TIME_CONSTANT_MIN,
                        MAX_STROKE_STEPS = field::TIME_CONSTANT_MIN * field::TIME_CONSTANT_SPAN;
struct StrokeTiming {
  double steps = MIN_STROKE_STEPS, keep = std::exp(-1 / MIN_STROKE_STEPS);
  int recovery = int(MIN_STROKE_STEPS);
  void set(double tau) {
    steps = std::clamp(tau, MIN_STROKE_STEPS, MAX_STROKE_STEPS);
    keep = std::exp(-1 / steps);
    recovery = int(std::lround(steps));
  }
};
struct MotorState {
  double speed = 2;
  double turn = 0;
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
  // drive_left/right: signed fin force times its lever (turning); drive_fins: the fins' signed
  // push along the body.
  double drive_forward = 0, drive_left = 0, drive_right = 0, drive_fins = 0;
  double motor_factor = 1;
  double mouth_pose = 0;
  double suction_pose = 0;
  double bite_pose = 0;
  std::array<unsigned char, field::MOTOR_COUNT> motor_pulses{};
  std::array<StrokeState, STROKE_COUNT> strokes{};
  Color pigment{};
  std::array<double, fin::count> fin_tension{};
  // Presentation history of the tail and the two side fins (fin_event); excluded from saved
  // physics and evolution.
  bool fin_stroke_side = false;
  std::array<int, fin::count> fin_stroke_age{-1, -1, -1}, fin_stroke_steps{};
  std::array<double, fin::count> fin_stroke_peak{};
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
