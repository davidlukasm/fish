#include "protocol_schema.hh"
#pragma once
#include "field/hormones.hh"
#include "simulation_types.hh"
#include "small_animals.hh"
#include "motor_state.hh"
#include "field/functions.hh"
#include <memory>
#include <algorithm>
namespace fishsim {
enum PressureSource {
  PressureNone = pressure_source::none,
  PressureEggs = pressure_source::eggs,
  PressureSperm = pressure_source::sperm,
  PressureBladder = pressure_source::bladder,
  PressureShape = pressure_source::shape
};
inline bool adapting_sense(int s) {
  return s == field::Odor || s == field::Flow || s == field::Intake || s == field::Damage;
}
inline bool intensity_sense(int s) {
  // Blood carries bounded internal levels. Dividing by their recent mean would hide a
  // sustained shortage of energy or hormones from the brain.
  return s <= field::Flow || s == field::Intake || s == field::Damage;
}
struct BrainInterface {
  struct Receptor {
    std::uint32_t neuron;
    int channel;
    float angle, width;
    float threshold = .5f, gain = 1;
    std::array<float, field::SENSE_COUNT> senses{};
    std::array<float, 3> spectrum{};
    float hue = 0;
    std::array<float, odor_kind::count> scents{};
    std::array<float, field::BLOOD_SUBSTANCES> hormones{};
    float view_left = 0, view_right = 0, response_threshold = .001f, longitudinal = 0, lateral = 0,
          qualitative_width = .25f, spatial_width = .3f, mechanical_angle = 0;
    std::array<float, BODY_SECTORS> contact_weights{};
    bool contact_kernel = false;
    // dark_share: the part of a light cell's response that reports darkening against its
    // surround; the rest reports brightening.
    float opponency = .5f, proximity_range = .5f, dark_share = 0;
    bool proximity = false, inner = false;
    std::uint32_t shared_receptor = 0;
    // The effector a pressure cell lies nearest to, what kind of pressure it feels and, for a
    // stretch receptor, the port of the muscle it lies in.
    int pressure_target = -1, pressure_kind = -1, pressure_port = -1;
    double time_steps = 4;
    double adaptation_rate = 0;
    bool visual() const { return channel == field::Light || channel == field::Proximity; }
    bool intensity() const {
      return intensity_sense(channel) && !(channel == field::Flow && inner);
    }
    float visual_gain() const { return senses[field::Light] + senses[field::Proximity]; }
    int dominant_sense() const { return channel; }
    void refresh_modality() {
      channel = int(std::max_element(senses.begin(), senses.end()) - senses.begin());
    }
  };
  struct Effector {
    std::uint32_t neuron;
    int port;
    float threshold, strength, lever;
    std::array<float, 3> color{};
    float outside = 0, quality = 0;
    // Share of a side fin cell that pulls the fin forward: the antagonist of the back stroke.
    float protraction = 0;
    // Where a side fin cell sits along the body, ahead of the body's middle (+) or behind it (-),
    // in half body lengths: the arm with which a push across the body turns it.
    float arm = 0;
    // Fast share of a muscle cell's fibres (muscle_fibre.hh).
    float fibre = 0;
    std::array<float, field::HORMONES> hormones{};
  };
  bool mobile_reproductive = true;
  std::vector<Effector> effectors;
  std::vector<Receptor> sensory;
  std::vector<std::uint32_t> active_sensory;
  std::array<std::vector<std::pair<float, std::uint32_t>>, 3> visual;
  std::vector<std::pair<double, double>> visual_intervals;
  std::array<std::vector<std::pair<double, double>>, 2> eye_intervals;
  std::array<std::vector<std::uint32_t>, 2> eye_receptors;
  std::array<std::vector<std::pair<double, std::uint32_t>>, EYES> retinal_neighbors;
  static constexpr int EYE_VIEWS = 3, SINGLE_EYE = 2;
  std::array<std::array<std::vector<double>, EYE_VIEWS>, EYES> retinal_knots;
  std::array<float, ORGAN_PORTS> motor_counts{};
  std::array<double, 2> suction_sides{}, bite_sides{};
  std::array<double, ORGAN_PORTS> capacities{};
  std::array<StrokeTiming, STROKE_COUNT> stroke_timing{};
  // Force-weighted fast fibre share and summed force of the cells behind each stroke.
  std::array<double, STROKE_COUNT> fibre{}, stroke_capacity{};
  // Per unit of force of each side fin stroke: its push along the body, its push across the body
  // (away from its side) and the turning it gives (toward the other side); the lever with which
  // each tail flank bends the body.
  std::array<double, STROKE_COUNT> fin_push{}, fin_across{}, fin_turn{};
  std::array<double, 2> tail_lever{};
  std::array<StrokeTiming, field::HORMONES> hormone_timing{};
  std::array<StrokeTiming, 3> pigment_timing{};
  std::array<double, 3> pigment_absorption{};
  double sensory_capacity = 0;
  // How closely the gill rakers stand: dense ones hold plankton, open ones pass more water.
  double raker_density = 0;
  double jaw_length = TRAIT_MIDDLE, gut_length = TRAIT_MIDDLE, blunt_teeth = TRAIT_MIDDLE,
         undulation = TRAIT_MIDDLE;
  std::array<float, 3> visual_coverage{};
  static constexpr std::size_t ANATOMY_FIELDS = anatomy_column::count;
  std::array<float, ANATOMY_FIELDS> anatomy{};
  // A drawn fin: its cells and force, where they sit, and how long its stroke lasts.
  struct Fin {
    double cells = 0, strength = 0, x = 0, y = 0, spread = 0, steps = 0;
  };
  struct OrganForm {
    double weight = 0, x = 0, y = 0, z = 0, sy = 0, sz = 0;
  };
  static constexpr int SIDES = 2, INTERNAL_FORM = form_layout::internal,
                       EARLY_ORGANS = form_layout::early_organs,
                       FIRST_SENSE_FORM = form_layout::first_sense,
                       FIRST_MOTOR_FORM = FIRST_SENSE_FORM + SIDES * EARLY_ORGANS,
                       LATE_SENSE_FORM = FIRST_MOTOR_FORM + SIDES * EARLY_ORGANS,
                       LATE_MOTOR_FORM = LATE_SENSE_FORM + SIDES * (field::Blood - EARLY_ORGANS),
                       BLOOD_FORM = LATE_MOTOR_FORM + SIDES * (field::MOTOR_COUNT - EARLY_ORGANS);
  static constexpr std::size_t FORM_COUNT = BLOOD_FORM + SIDES;
  static constexpr int sense_form(int sense, int side = 0) {
    return (sense == field::Blood  ? BLOOD_FORM
            : sense < EARLY_ORGANS ? FIRST_SENSE_FORM + SIDES * sense
                                   : LATE_SENSE_FORM + SIDES * (sense - EARLY_ORGANS)) +
           side;
  }
  static constexpr int motor_form(int motor, int side = 0) {
    return (motor < EARLY_ORGANS ? FIRST_MOTOR_FORM + SIDES * motor
                                 : LATE_MOTOR_FORM + SIDES * (motor - EARLY_ORGANS)) +
           side;
  }
  std::array<OrganForm, FORM_COUNT> forms{};
  std::array<std::array<double, 2>, EYES> eye_positions{};
  std::array<std::array<double, 3>, 2> eye_shape{}; // radii in body radii, pupil
  std::array<std::array<double, 3>, 2> proximity_shape{};
  double eye_clearance = 0;
  std::array<std::array<double, field::PLAN_POINTS>, field::body_plan_part::count> body_plans{};
  std::array<double, field::body_metric::count> body_geometry{};
  std::array<std::array<double, 2>, 7> burial_points{};
  std::array<OrganForm, region_layout::turn_fin + SIDES * region_layout::lobes> regions{};
  static constexpr int CONTOUR_BINS = contour::bins, CONTOUR_POINTS = SIDES * CONTOUR_BINS;
  std::array<float, CONTOUR_POINTS> contour{};
  std::array<Fin, fin::count> fins{};
  std::vector<std::pair<float, std::uint32_t>> olfactory;
  std::array<double, field::SENSE_COUNT> sense_counts{}, sense_thresholds{}, sense_early{},
      sense_late{}, sense_span{};
  std::array<unsigned, field::SENSE_COUNT> sense_directions{};
  std::array<double, odor_kind::count> scent_counts{}, scent_thresholds{};
  std::array<double, 3> filling_counts{};
  std::array<double, 2> egg_parts{}, sperm_parts{}, bladder_parts{};
  static constexpr std::size_t GUT_PATH_POINTS = 33;
  std::array<std::array<double, 3>, GUT_PATH_POINTS> gut_path{};
  static constexpr double muscle_upkeep_per_capacity = .0004, pigment_upkeep_per_capacity = .000004;
  double muscle_maintenance = 0, organ_mass = 0, suction_strength = 0, bite_strength = 0;
};

}
