#pragma once
#include <algorithm>
#include <cmath>
#include "sense_schema.hh"
namespace field {
inline constexpr float MIN_LEARNING_RATE = 1e-5f;
inline constexpr unsigned CELL_DEVELOPMENT_INTERVAL = 4;
inline constexpr double SYNAPTIC_ADAPTATION_SPAN = 10;
namespace plasticity {
inline constexpr float competition = 1, cancellation = .02f, prune_share = .05f;
inline constexpr float basal_formation = 1.f / 50;
inline constexpr float baseline_steps = 500;
inline constexpr float contact_trial_time_constants = 4;
template <class Value>
inline Value trace_update(Value retention, Value previous, Value fast, Value pre, Value post) {
  return retention * previous + (1 - fast) * pre * post;
}
}
namespace retinal_dynamics {
inline constexpr unsigned neighbors = 6;
inline constexpr double spontaneous_rate = .004, coupling = .9, threshold = .22,
                        refractory_gain = .75, activity_decay = 2, recovery_span = 4,
                        transverse_scale = .25, radius = .3;
}
inline float encode_learning_steps(double steps) {
  return float(
      std::clamp(std::log(steps / LEARNING_TIME_MIN) / std::log(LEARNING_TIME_SPAN), 0., 1.));
}
}
