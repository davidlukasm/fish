#pragma once
#include <algorithm>
#include <cmath>
#include "sense_schema.hh"
namespace field {
inline constexpr float MIN_LEARNING_RATE = 1e-5f;
namespace plasticity {
inline constexpr float competition = 1, cancellation = .02f, prune_share = .05f;
inline constexpr float basal_formation = 1.f / 50, teacher_initial_use = .05f,
                       teacher_min_use = .002f, eligibility_limit = 1;
inline constexpr float baseline_steps = 500;
inline float initial_trace(bool teacher, float learning_steps) {
  return teacher ? -learning_steps : 0.f;
}
inline float teacher_use(float previous, float retention, float evidence) {
  if (previous < 0)
    return previous < -1 ? previous + 1 : teacher_initial_use;
  return retention * previous + (1 - retention) * evidence;
}
template <class Value> inline Value preserve_sign(Value gene, Value candidate, Value sign) {
  return sign * (gene + candidate) < Value{} ? -gene : candidate;
}
template <class Value>
inline Value pending_weight(Value gene, Value previous, Value step, Value trace, Value sign,
                            Value ordinary) {
  return preserve_sign(gene, previous + ordinary * step * trace, sign);
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
