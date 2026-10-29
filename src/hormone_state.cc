#include "hormone_state.hh"
#include <algorithm>
#include <cmath>
#include <istream>
#include <ostream>
#include <stdexcept>
namespace fishsim {
namespace {
void finite_range(double v, double lo, double hi) {
  if (!std::isfinite(v) || v < lo || v > hi)
    throw std::invalid_argument("invalid hormone state");
}
}
void HormoneParameters::validate() const {
  finite_range(rate, 0, 1e9);
  finite_range(work_cost, 0, 1e9);
}
void HormoneState::set_levels(field::Hormones values) {
  for (double v : values)
    finite_range(v, 0, 1);
  levels_ = values;
}
double HormoneState::work_cost(const field::Hormones &p, const field::Hormones &b,
                               const HormoneParameters &parameters) {
  parameters.validate();
  double sum = 0;
  for (int k = 0; k < field::HORMONES; ++k) {
    finite_range(p[k], 0, 1e12);
    finite_range(b[k], 0, 1e12);
    sum += p[k] + b[k];
  }
  return parameters.work_cost * sum;
}
void HormoneState::advance(const field::Hormones &p, const field::Hormones &b, double paid,
                           const HormoneParameters &parameters, const field::Hormones &time_steps) {
  finite_range(paid, 0, 1);
  for (double tau : time_steps)
    finite_range(tau, 1e-9, 1e9);
  work_ = paid * work_cost(p, b, parameters);
  for (int k = 0; k < field::HORMONES; ++k) {
    secretion_[k] = paid * p[k];
    binding_[k] = paid * b[k];
    const double source = parameters.rate * secretion_[k],
                 sink = 1 / time_steps[k] + parameters.rate * binding_[k],
                 equilibrium = source / sink, ordinary = levels_[k] * std::exp(-1 / time_steps[k]),
                 next = std::clamp(levels_[k] + (equilibrium - levels_[k]) * -std::expm1(-sink), 0.,
                                   1.);
    integrated_[k] = next - ordinary;
    levels_[k] = next;
  }
}
void HormoneState::write(std::ostream &out) const {
  for (const auto *values : {&levels_, &secretion_, &binding_, &integrated_})
    for (double v : *values)
      out << v << ' ';
  out << work_ << ' ';
}
void HormoneState::read(std::istream &in) {
  HormoneState next;
  for (auto *values : {&next.levels_, &next.secretion_, &next.binding_, &next.integrated_})
    for (double &v : *values)
      if (!(in >> v) || !std::isfinite(v))
        throw std::runtime_error("invalid hormone state");
  next.set_levels(next.levels_);
  for (int k = 0; k < field::HORMONES; ++k) {
    finite_range(next.secretion_[k], 0, 1e12);
    finite_range(next.binding_[k], 0, 1e12);
    finite_range(next.integrated_[k], -1, 1);
  }
  if (!(in >> next.work_))
    throw std::runtime_error("missing gland work");
  finite_range(next.work_, 0, 1e12);
  *this = next;
}
}
