#pragma once
#include <array>
#include "field/hormones.hh"
#include "field/maturation.hh"
#include "field/substrate.hh"
#include <iosfwd>
namespace fishsim {
// A gland holds its substance at `height` times what it pours; binding takes `binding_rate` of the
// level per unit bound and step. The height is the level glands of the default cell time held
// before rise and residence were separated (0.01 per step times 13.9 steps), so every receptor's
// half value keeps its meaning.
struct HormoneParameters {
  double height = .01 * field::time_constant_steps(field::CellParameters{}), binding_rate = 1. / 32,
         work_cost = field::DevelopmentCosts{}.neuron_maintenance;
  void validate() const;
};
class HormoneState {
  field::Hormones levels_{};
  field::Hormones secretion_{}, binding_{}, integrated_{};
  double work_ = 0;

public:
  const auto &levels() const { return levels_; }
  const auto &secretion() const { return secretion_; }
  const auto &binding() const { return binding_; }
  const auto &integrated() const { return integrated_; }
  double work() const { return work_; }
  void set_levels(field::Hormones);
  static double work_cost(const field::Hormones &, const field::Hormones &,
                          const HormoneParameters &);
  void advance(const field::Hormones &, const field::Hormones &, double paid,
               const HormoneParameters &, const field::Hormones &rise_steps,
               const field::Hormones &residence_steps);
  void write(std::ostream &) const;
  void read(std::istream &);
};
}
