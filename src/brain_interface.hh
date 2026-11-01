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
// What an inner pressure cell measures: gonad filling, sperm store, bladder or a body shape.
enum PressureSource { PressureNone, PressureEggs, PressureSperm, PressureBladder, PressureShape };
// Chemistry, flow, intake, damage and blood adapt to their own running mean.
inline bool adapting_sense(int s) {
  return s == field::Odor || s == field::Flow || s == field::Intake || s == field::Damage ||
         s == field::Blood;
}
// Light, chemistry, flow, intake, damage and blood report an open intensity; the others a
// bounded state.
inline bool intensity_sense(int s) {
  return s <= field::Flow || s == field::Intake || s == field::Damage || s == field::Blood;
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
    std::array<float, 8> scents{};
    std::array<float, field::BLOOD_SUBSTANCES> hormones{};
    float view_left = 0, view_right = 0, response_threshold = .001f, longitudinal = 0, lateral = 0,
          qualitative_width = .25f, spatial_width = .3f, mechanical_angle = 0;
    std::array<float, BODY_SECTORS> contact_weights{};
    bool contact_kernel = false;
    float opponency = .5f, proximity_range = .5f;
    bool proximity = false;
    std::uint32_t shared_receptor = 0;
    int pressure_target = -1, pressure_kind = -1;
    double time_steps = 4;
    double adaptation_rate = 0; // Derived once from the cell time constant.
    bool visual() const { return channel == field::Light || channel == field::Proximity; }
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
    std::array<float, field::HORMONES> hormones{};
  };
  bool mobile_reproductive = true;
  std::vector<Effector> effectors;
  std::vector<Receptor> sensory;
  std::array<std::vector<std::pair<float, std::uint32_t>>, 3> visual;
  std::vector<std::pair<double, double>> visual_intervals;
  std::array<std::vector<std::pair<double, double>>, 2> eye_intervals;
  std::array<std::vector<std::uint32_t>, 2> eye_receptors;
  std::array<std::vector<std::pair<double, std::uint32_t>>, 2> retinal_neighbors;
  // Precomputed angles per adaptation (off, on) and per view (left eye, right eye, single eye).
  static constexpr int EYE_VIEWS = 3, SINGLE_EYE = 2;
  std::array<std::array<std::vector<double>, EYE_VIEWS>, 2> retinal_knots;
  std::array<float, 14> motor_counts{};
  std::array<double, 2> suction_sides{}, bite_sides{};
  std::array<double, 14> capacities{};
  std::array<StrokeTiming, STROKE_COUNT> stroke_timing{};
  std::array<StrokeTiming, field::HORMONES> hormone_timing{};
  std::array<StrokeTiming, 3> pigment_timing{};
  std::array<double, 3> resting_absorption{};
  double sensory_capacity = 0;
  double jaw_length = TRAIT_MIDDLE, gut_length = TRAIT_MIDDLE, blunt_teeth = TRAIT_MIDDLE,
         undulation = TRAIT_MIDDLE;
  std::array<float, 3> visual_coverage{};
  // Functional mouth, eyes L/R, thrust L/R, eggs, sperm, defense, attack;
  // smell L/R, lateral line L/R, touch L/R; normalized eye RGB L/R.
  // Slots 21..29: functional muscle strength for the same nine organ slots.
  static constexpr std::size_t ANATOMY_FIELDS = anatomy_column::count;
  std::array<float, ANATOMY_FIELDS> anatomy{};
  struct Fin {
    double cells = 0, strength = 0, x = 0, y = 0, spread = 0;
  };
  // Weighted location and spread per organ side: the CNS, then a left/right pair for each of the
  // first EARLY_ORGANS senses, the first EARLY_ORGANS motors, the remaining senses but blood,
  // the remaining motors, and blood. Proximity shares the eyes' forms.
  struct OrganForm {
    double weight = 0, x = 0, y = 0, z = 0, sy = 0, sz = 0;
  };
  static constexpr int INTERNAL_FORM = 0, EARLY_ORGANS = 8, FIRST_SENSE_FORM = 1,
                       FIRST_MOTOR_FORM = FIRST_SENSE_FORM + 2 * EARLY_ORGANS,
                       LATE_SENSE_FORM = FIRST_MOTOR_FORM + 2 * EARLY_ORGANS,
                       LATE_MOTOR_FORM = LATE_SENSE_FORM + 2 * (field::Blood - EARLY_ORGANS),
                       BLOOD_FORM = LATE_MOTOR_FORM + 2 * (field::MOTOR_COUNT - EARLY_ORGANS);
  static constexpr std::size_t FORM_COUNT = BLOOD_FORM + 2;
  static constexpr int sense_form(int sense, int side = 0) {
    return (sense == field::Proximity ? sense_form(field::Light)
            : sense == field::Blood   ? BLOOD_FORM
            : sense < EARLY_ORGANS    ? FIRST_SENSE_FORM + 2 * sense
                                      : LATE_SENSE_FORM + 2 * (sense - EARLY_ORGANS)) +
           side;
  }
  static constexpr int motor_form(int motor, int side = 0) {
    return (motor < EARLY_ORGANS ? FIRST_MOTOR_FORM + 2 * motor
                                 : LATE_MOTOR_FORM + 2 * (motor - EARLY_ORGANS)) +
           side;
  }
  std::array<OrganForm, FORM_COUNT> forms{};
  std::array<std::array<double, 2>, 2> eye_positions{};
  std::array<std::array<double, 3>, 2> eye_shape{}; // radii in body radii, pupil
  double eye_clearance = 0;
  std::array<std::array<double, field::PLAN_POINTS>, field::body_plan_part::count> body_plans{};
  // headBack, headLength, faceLength, shoulder, faceWidth, chestLength,
  // hindLength, trunk, neckWidth, chestPhase, origin, extent.
  std::array<double, field::body_metric::count> body_geometry{};
  std::array<std::array<double, 2>, 7> burial_points{};
  std::array<OrganForm, 6>
      regions{}; // Head, cord, then anterior/posterior turn-fin tissue on each side.
  // Eight axial tissue bins per side, tail to head.
  static constexpr int CONTOUR_BINS = 8, CONTOUR_POINTS = 2 * CONTOUR_BINS;
  std::array<float, CONTOUR_POINTS> contour{};
  std::array<Fin, 3> fins{}; // central tail, rear left fin, rear right fin
  std::vector<std::pair<float, std::uint32_t>> olfactory;
  std::array<double, field::SENSE_COUNT> sense_counts{}, sense_thresholds{}, sense_early{},
      sense_late{}, sense_span{};
  std::array<unsigned, field::SENSE_COUNT> sense_directions{};
  std::array<double, odor_channel_count> scent_counts{}, scent_thresholds{};
  std::array<double, 3> filling_counts{};
  std::array<double, 2> egg_parts{}, sperm_parts{}, bladder_parts{};
  static constexpr std::size_t GUT_PATH_POINTS = 33;
  std::array<std::array<double, 3>, GUT_PATH_POINTS> gut_path{};
  static constexpr double muscle_upkeep_per_capacity = .0004, pigment_upkeep_per_capacity = .000004;
  double muscle_maintenance = 0, organ_mass = 0, suction_strength = 0, bite_strength = 0;
};

}
