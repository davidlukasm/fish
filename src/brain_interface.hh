#include "protocol_schema.hh"
#pragma once
#include "field/hormones.hh"
#include "simulation_types.hh"
#include "motor_state.hh"
#include "field/functions.hh"
#include <memory>
#include <algorithm>
namespace fishsim {
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
    std::array<float, field::HORMONES> hormones{};
    float view_left = 0, view_right = 0, response_threshold = .001f, longitudinal = 0, lateral = 0,
          qualitative_width = .25f, spatial_width = .3f, mechanical_angle = 0;
    std::array<float, 16> contact_weights{};
    bool contact_kernel = false;
    float opponency = .5f;
    double time_steps = 4;
    double adaptation_rate = 0; // Derived once from the cell time constant.
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
  std::array<std::array<std::vector<double>, 3>, 2> retinal_knots;
  std::array<float, 14> motor_counts{};
  std::array<double, 2> suction_sides{}, bite_sides{};
  std::array<double, 14> capacities{};
  std::array<StrokeTiming, STROKE_COUNT> stroke_timing{};
  std::array<StrokeTiming, field::HORMONES> hormone_timing{};
  std::array<StrokeTiming, 3> pigment_timing{};
  std::array<double, 3> resting_absorption{};
  double sensory_capacity = 0;
  double jaw_length = .5, gut_length = .5, blunt_teeth = .5, undulation = .5;
  std::array<float, 3> visual_coverage{};
  // Functional mouth, eyes L/R, thrust L/R, eggs, sperm, defense, attack;
  // smell L/R, lateral line L/R, touch L/R; normalized eye RGB L/R.
  // Slots 21..29: functional muscle strength for the same nine organ slots.
  static constexpr std::size_t ANATOMY_FIELDS = anatomy_column::count;
  std::array<float, ANATOMY_FIELDS> anatomy{};
  struct Fin {
    double cells = 0, strength = 0, x = 0, y = 0, spread = 0;
  };
  // Weighted location and spread per organ side: CNS, eight senses, eight motors.
  struct OrganForm {
    double weight = 0, x = 0, y = 0, z = 0, sy = 0, sz = 0;
  };
  static constexpr std::size_t FORM_COUNT = 43;
  std::array<OrganForm, FORM_COUNT> forms{};
  std::array<std::array<double, 2>, 2> eye_positions{};
  std::array<std::array<double, 5>, 4> body_plans{};
  // headBack, headLength, faceLength, shoulder, faceWidth, chestLength,
  // hindLength, trunk, neckWidth, chestPhase, origin, extent.
  std::array<double, 12> body_geometry{};
  std::array<std::array<double, 2>, 7> burial_points{};
  std::array<OrganForm, 6>
      regions{}; // Head, cord, then anterior/posterior turn-fin tissue on each side.
  std::array<float, 16> contour{}; // Eight axial tissue bins per side, tail to head.
  std::array<Fin, 3> fins{};       // central tail, rear left fin, rear right fin
  std::vector<std::pair<float, std::uint32_t>> olfactory;
  std::array<double, field::SENSE_COUNT> sense_counts{}, sense_thresholds{}, sense_early{},
      sense_late{}, sense_span{};
  std::array<unsigned, field::SENSE_COUNT> sense_directions{};
  std::array<double, 8> scent_counts{}, scent_thresholds{};
  std::array<double, 3> filling_counts{};
  std::array<double, 2> egg_parts{}, sperm_parts{}, bladder_parts{};
  double muscle_maintenance = 0, organ_mass = 0, suction_strength = 0, bite_strength = 0;
};

}
