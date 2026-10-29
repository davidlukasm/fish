#pragma once
#include "hormone_state.hh"
#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <iosfwd>
namespace fishsim {
inline constexpr std::size_t HORMONE_ORGANS = 23;
struct HormoneMoments {
  std::uint64_t steps = 0, learning_cells = 0;
  std::array<double, 4> level{}, square{}, secretion{}, binding{}, net{};
  double work = 0, learning_change = 0, surprise = 0;
  struct Context {
    std::array<std::uint64_t, 2> count{};
    std::array<std::array<double, 4>, 2> level{};
  };
  std::array<Context, 4> contexts{};
  void add(const HormoneMoments &);
  void write(std::ostream &) const;
  void read(std::istream &);
};
struct HormoneInvestigation {
  std::uint64_t individual = 0, species = 0, tick = 0, round = 0;
  std::uint32_t organs = 0;
  unsigned arms = 0, learning_arms = 0;
  std::array<std::array<double, HORMONE_ORGANS>, 8> effects{};
  std::array<double, 8> learning{}, turn_magnitude{};
  void write(std::ostream &) const;
  void read(std::istream &);
};
struct HormoneName {
  std::string stem, suffix, candidate;
  std::uint64_t origin = 0, paternal_origin = 0, changed = 0;
  unsigned candidate_rounds = 0;
  struct Change {
    std::uint64_t tick = 0;
    std::string suffix;
    std::uint64_t individuals = 0, start = 0, end = 0;
    std::array<std::array<double, HORMONE_ORGANS>, 8> effects{};
    std::array<std::array<std::uint64_t, HORMONE_ORGANS>, 8> counts{};
    std::array<double, 8> learning{};
    std::array<std::uint64_t, 8> learning_counts{};
    void write(std::ostream &) const;
    void read(std::istream &);
  };
  std::deque<Change> history;
};
struct HormoneProfile {
  HormoneMoments lifetime, window;
  std::array<HormoneName, 4> names;
  std::deque<HormoneInvestigation> samples;
  std::uint64_t completed_round = 0, cursor = 0, investigations = 0, pending_round = 0;
  std::array<std::array<double, HORMONE_ORGANS>, 8> lifetime_effects{};
  std::array<std::array<std::uint64_t, HORMONE_ORGANS>, 8> lifetime_effect_count{};
  std::array<double, 8> lifetime_learning{};
  std::array<std::uint64_t, 8> lifetime_learning_count{};
  void accept(const HormoneInvestigation &);
  void finish_round(std::uint64_t, std::uint64_t);
  void write(std::ostream &) const;
  void read(std::istream &);
};
std::string hormone_description(const std::string &suffix);
}
