#pragma once
#include "genome.hh"
#include "hormone_observations.hh"
#include <deque>
#include <optional>
namespace fishsim {
struct Individual;
class HormoneAnalysis {
public:
  struct Round {
    std::uint64_t species = 0, number = 0;
    std::deque<std::uint64_t> individuals;
  };
  std::deque<Round> rounds;
  double credit = 0;
  std::uint64_t work = 0, regular_work = 0;
  std::uint64_t requested() const;
  bool active() const { return bool(snapshot_); }
  void capture(const Individual &, std::uint64_t tick);
  void fund(std::uint64_t regular, std::uint64_t maximum);
  std::optional<HormoneInvestigation> advance();
  void write(std::ostream &) const;
  void read(std::istream &);

private:
  Genome genome_;
  std::optional<field::Network> snapshot_, variant_;
  std::vector<float> inputs_, variant_inputs_, baseline_update_, adaptation_;
  field::Hormones levels_{};
  std::array<double, HORMONE_ORGANS> baseline_{}, sum_{};
  HormoneInvestigation result_;
  int arm_ = 0, step_ = 0;
  bool preview_done_ = false, baseline_ready_ = false, hormone_enabled_ = true;
  double change_ = 0, reserve_ = 0;
  void prepare_variant();
};
}
