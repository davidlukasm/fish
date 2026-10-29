#pragma once
#include "simulation_types.hh"
#include "field/functions.hh"
namespace fishsim {
struct VisualEye {
  double x = 0, y = 0, exposure = 1;
  bool present = false;
};
// Temporary inspection input; belongs to the open instrument, not to the fish's genome.
struct SensoryProbe {
  int kind = -1, sense = 0, remaining = 0;
  double x = 0, y = 0, radius = 2, energy = 120, value = 0;
  std::array<double, 3> color{{1, 0, 0}};
  std::array<double, 8> scents{{1, 0, 0, 0, 0, 0, 0, 0}};
  bool active() const { return kind >= 0 && remaining > 0; }
};
struct PerceptionState {
  struct VisualContribution {
    std::uint32_t neuron;
    int kind;
    std::uint64_t id;
    double x, y, radius, light;
    std::array<double, 3> color;
  };
  struct VisualSample {
    std::uint32_t neuron;
    double light, stimulus, response;
    std::array<double, 3> color;
  };
  struct ImageBand {
    double left, right;
    std::array<double, 3> color;
    int eye = -1;
    double distance = 0;
  };

  SensoryProbe probe;
  bool inspect_vision = false, inspect_retina = false;
  int inspection_neuron = -1;
  struct EyeSample {
    double x = 0, y = 0, exposure = 0, left = 0, right = 0;
    bool present = false;
  };
  std::array<EyeSample, 2> visual_eyes{};
  double visual_x = 0, visual_y = 0, visual_angle = 0, visual_range = 128;
  std::vector<std::array<float, field::SENSE_COUNT>> sensory_components;
  std::array<std::array<double, 5>, 4> lateral_samples{};
  std::array<std::array<double, 11>, 2> nose_samples{};
  std::vector<VisualContribution> visual_contributions;
  std::vector<VisualSample> visual_samples;
  std::vector<ImageBand> visual_image;
  std::array<double, 16> touch_ring{};
  std::array<double, 16> impact_ring{};
  std::vector<float> sensor_buffer, adapted;
  bool perception_prepared = false;
  std::array<bool, field::SENSE_COUNT> disabled_senses{};
};
}
