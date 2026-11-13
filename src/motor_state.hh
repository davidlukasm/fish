#pragma once
#include "simulation_types.hh"
#include "field/functions.hh"
namespace fishsim {
enum StrokeIndex {
  StrokeTailLeft = stroke_kind::tail_left,
  StrokeTurnLeft = stroke_kind::turn_left,
  StrokeTurnRight = stroke_kind::turn_right,
  StrokeSuction = stroke_kind::suction,
  StrokeEgg = stroke_kind::egg,
  StrokeSperm = stroke_kind::sperm,
  StrokeBite = stroke_kind::bite,
  StrokeDefense = stroke_kind::defense,
  StrokeReverseLeft = stroke_kind::reverse_left,
  StrokeReverseRight = stroke_kind::reverse_right,
  StrokeGill = stroke_kind::gill,
  StrokeGut = stroke_kind::gut,
  StrokeTailRight = stroke_kind::tail_right,
  StrokePelvicLeft = stroke_kind::pelvic_left,
  StrokePelvicRight = stroke_kind::pelvic_right,
  StrokePelvicReverseLeft = stroke_kind::pelvic_reverse_left,
  StrokePelvicReverseRight = stroke_kind::pelvic_reverse_right,
  STROKE_COUNT = stroke_kind::count
};
inline constexpr int ORGAN_PORTS = organ_port::pelvic + 1;
constexpr std::array<int, STROKE_COUNT> STROKE_PORTS{
    organ_port::forward, organ_port::turn,   organ_port::turn,   organ_port::suction,
    organ_port::eggs,    organ_port::sperm,  organ_port::jaw,    organ_port::defense,
    organ_port::turn,    organ_port::turn,   organ_port::gills,  organ_port::gut,
    organ_port::forward, organ_port::pelvic, organ_port::pelvic, organ_port::pelvic,
    organ_port::pelvic};
// The tail's antagonists: the muscles of the left and of the right flank.
constexpr std::array<int, 2> TAIL_STROKES{StrokeTailLeft, StrokeTailRight};
// Each side has up to two fins, the pectoral fin in front and the pelvic fin behind it, each
// with its own muscles: the back stroke pushes the fish forward, the forward stroke of the
// antagonist muscles pushes it back.
inline constexpr int SIDE_FINS = 2;
constexpr std::array<int, SIDE_FINS> FIN_PORTS{organ_port::turn, organ_port::pelvic};
constexpr std::array<std::array<int, 2>, SIDE_FINS> BACK_STROKES{
    {{StrokeTurnLeft, StrokeTurnRight}, {StrokePelvicLeft, StrokePelvicRight}}},
    FRONT_STROKES{{{StrokeReverseLeft, StrokeReverseRight},
                   {StrokePelvicReverseLeft, StrokePelvicReverseRight}}};
// The drawn fin of a side fin: the pectoral pair first, then the pelvic pair.
constexpr int side_fin_index(int fin, int side) {
  return fin::left + 2 * fin + side;
}
// drive: what drives the muscle now; force: what it delivers this step, as paid; recovery: steps
// left of its twitch; span: the steps that twitch lasts in all.
struct StrokeState {
  double drive = 0, force = 0, recovery = 0, span = 0;
  // Glycogen of the muscle's fast fibres together: 1 rested, 0 exhausted.
  double reserve = 1;
};
inline constexpr double MIN_STROKE_STEPS = field::TIME_CONSTANT_MIN,
                        MAX_STROKE_STEPS = field::TIME_CONSTANT_MIN * field::TIME_CONSTANT_SPAN;
struct StrokeTiming {
  double steps = MIN_STROKE_STEPS, keep = std::exp(-1 / MIN_STROKE_STEPS);
  void set(double tau) {
    steps = std::clamp(tau, MIN_STROKE_STEPS, MAX_STROKE_STEPS);
    keep = std::exp(-1 / steps);
  }
  // The whole steps a twitch touches, for what happens step by step.
  int whole() const { return int(std::ceil(steps)); }
};
// A pair of antagonist muscles: which of the two pulled last (-1: neither, or the limb is back at
// rest) and how long both have rested.
struct AntagonistPair {
  int last = -1, rest = 0;
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
  double impulse_tail_left = 0;
  double impulse_tail_right = 0;
  // drive_left/right: the turning each side's strokes give (fins by their levers and angles, a
  // bending tail flank); drive_fins: the fins' signed push along the body; drive_across: their
  // push across it, to the right.
  double drive_forward = 0, drive_left = 0, drive_right = 0, drive_fins = 0, drive_across = 0;
  double motor_factor = 1;
  double mouth_pose = 0;
  double suction_pose = 0, gill_pose = 0;
  double bite_pose = 0;
  std::array<unsigned char, field::MOTOR_COUNT> motor_pulses{};
  std::array<StrokeState, STROKE_COUNT> strokes{};
  // Glycogen of every muscle cell's fast fibres, by the cell's neuron: 1 rested, 0 exhausted.
  std::vector<double> fibre_reserve;
  Color pigment{};
  std::array<double, fin::count> fin_tension{};
  // The antagonists of the tail (left and right flank) and of each side fin (back and forward
  // stroke), and how fully each running stroke sweeps its limb.
  AntagonistPair tail_pair;
  std::array<std::array<AntagonistPair, 2>, SIDE_FINS> fin_pairs{};
  std::array<double, STROKE_COUNT> sweep{};
  // How exhausted the fast fibres are, weighted by their force: 0 rested, 1 spent.
  double fatigue = 0;
  // How much the side fins hold the body up where they lie on the ground: 0 not at all, 1 fully.
  double fin_bearing = 0;
  // Presentation history of the tail and the side fins (fin_event); excluded from saved physics
  // and evolution.
  std::array<int, fin::count> fin_stroke_age = [] {
    std::array<int, fin::count> never{};
    never.fill(-1);
    return never;
  }();
  std::array<int, fin::count> fin_stroke_steps{};
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
