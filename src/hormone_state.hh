#pragma once
#include <array>
#include "field/hormones.hh"
#include <iosfwd>
namespace fishsim {
struct HormoneParameters {
  double rate = .01, work_cost = .004;
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
               const HormoneParameters &, const field::Hormones &time_steps);
  void write(std::ostream &) const;
  void read(std::istream &);
};
}
