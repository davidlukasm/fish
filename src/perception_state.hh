#pragma once
#include "simulation_types.hh"
#include "field/functions.hh"
#include "small_animals.hh"
namespace fishsim {
struct VisualEye {
  double x = 0, y = 0, exposure = 1;
  bool present = false;
  double pull = 1;
};
inline constexpr int PROBE_OBJECT = sensory_probe::object_kind;
static_assert(PROBE_OBJECT == food_kind::plankton);
inline constexpr double PROBE_MAX_ENERGY = 20000, PROBE_MIN_RADIUS = .1, PROBE_MAX_RADIUS = 16,
                        PROBE_MAX_COLOR = 3;
struct SensoryProbe {
  int kind = -1, sense = 0, remaining = 0;
  double x = 0, y = 0, radius = sensory_probe::radius, energy = sensory_probe::energy, value = 0;
  Color color{{1, 0, 0}};
  std::array<double, odor_kind::count> scents{{1}};
  bool active() const { return kind >= 0 && remaining > 0; }
};
struct PerceptionState {
  struct VisualContribution {
    std::uint32_t neuron;
    int kind;
    std::uint64_t id;
    double x, y, radius, light;
    Color color;
  };
  struct VisualSample {
    std::uint32_t neuron;
    double light, stimulus, response;
    Color color;
  };
  struct ImageBand {
    double left, right;
    Color color;
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
  std::array<double, 2> eye_pull{{1, 1}};
  double visual_x = 0, visual_y = 0, visual_angle = 0, visual_range = 128;
  std::vector<std::array<float, field::SENSE_COUNT>> sensory_components;
  std::array<std::array<double, lateral_sample_column::count>, BODY_SECTORS> lateral_samples{};
  std::array<std::array<double, nose_sample_column::odor + odor_kind::count>, 2> nose_samples{};
  std::vector<VisualContribution> visual_contributions;
  std::vector<VisualSample> visual_samples;
  std::vector<ImageBand> visual_image;
  std::array<double, BODY_SECTORS> touch_ring{};
  std::array<double, BODY_SECTORS> impact_ring{};
  std::vector<float> sensor_buffer, adapted;
  bool perception_prepared = false;
  std::array<bool, field::SENSE_COUNT> disabled_senses{};
};
}
