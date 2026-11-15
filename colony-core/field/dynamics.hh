#pragma once
#include <algorithm>
#include <cmath>
#include "sense_schema.hh"
namespace field {
inline constexpr float MIN_LEARNING_RATE = 1e-5f, MAX_LEARNING_GAIN = 2;
inline constexpr unsigned CELL_DEVELOPMENT_INTERVAL = 4;
inline constexpr double SYNAPTIC_ADAPTATION_SPAN = 10;
namespace plasticity {
inline constexpr float cancellation = .02f, prune_share = .05f;
inline constexpr float basal_formation = 1.f / 50;
inline constexpr float baseline_steps = 500;
inline constexpr float contact_trial_time_constants = 4;
inline constexpr float unused_decay_span = 4;
// A contact at least this far consolidated is kept even when small: a learned weak or inhibiting
// contact may be the lesson itself.
inline constexpr float kept_consolidation = .5f;
inline float learning_rate(float plasticity, float hormone) {
  return MIN_LEARNING_RATE + (MAX_LEARNING_GAIN - MIN_LEARNING_RATE) *
                                 std::clamp(plasticity, 0.f, 1.f) * (.5f * (1 + hormone));
}
inline float fast_keep(double time) { return float(std::exp(-2 / time)); }
inline float trace_keep(double time) { return float(std::exp(-1 / time)); }

template <class Value> inline Value usage_keep(Value time) {
  return 1 - 1 / (unused_decay_span * time);
}

template <class Value>
inline Value contrast_association(Value positive, Value comp, Value negative, Value post,
                                  Value pre, Value old, Value nerve) {
  return positive * comp * post * (pre - old * post) - cancellation * negative * post * pre * nerve;
}

template <class Value>
inline Value sustained_association(Value positive, Value comp, Value negative, Value pre,
                                   Value old, Value evoked, Value nerve) {
  return positive * comp * (pre - old * evoked) - cancellation * negative * pre * nerve;
}

template <class Value>
inline Value contact_retention(Value use, Value time, Value consolidated) {
  const Value d = (float(std::log(2.) / baseline_steps) +
                   (1 - use) / (unused_decay_span * time)) *
                  (1 - consolidated);
  return 1 - d + d * d * (.5f - d / 6);
}

template <class Value>
inline Value teaching_share(Value surprise, Value trace, Value denominator) {
  return surprise * trace / denominator;
}

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
