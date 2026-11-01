#pragma once
#include "hormone_state.hh"
#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <iosfwd>
namespace fishsim {
// Organ drives in the order of hormones.organNames: swimming, turning, mouth, defence, gonads,
// pigment channels, bladder, then the gland's secretion and binding per hormone.
namespace organ_drive {
inline constexpr std::size_t forward = 0, turn_left = 1, turn_right = 2, turn = 3, suction = 4,
                             jaw = 5, defense = 6, eggs = 7, sperm = 8, pigment = 9,
                             bladder_fill = pigment + 3, bladder_empty = bladder_fill + 1,
                             bladder = bladder_empty + 1, secretion = bladder + 1,
                             binding = secretion + field::HORMONES,
                             count = binding + field::HORMONES;
}
inline constexpr std::size_t HORMONE_ORGANS = organ_drive::count;
// The analysis raises and lowers each hormone in turn: one arm per sign and hormone, the arm
// of a hormone and sign at hormone * HORMONE_SIGNS + sign.
inline constexpr std::size_t HORMONE_SIGNS = 2, HORMONE_ARMS = HORMONE_SIGNS * field::HORMONES;
// Hormone levels are also kept by context, each either off or on: fed, injured, fast and ready
// to spawn.
namespace hormone_context {
inline constexpr std::size_t fed = 0, injured = 1, fast = 2, spawning = 3, count = 4;
}
inline constexpr std::size_t CONTEXT_STATES = 2;
// A profile keeps the last SAMPLE_MEMORY investigations and NAME_HISTORY name changes per hormone.
inline constexpr std::size_t SAMPLE_MEMORY = 32, NAME_HISTORY = 8;
struct HormoneMoments {
  std::uint64_t steps = 0, learning_cells = 0;
  std::array<double, field::HORMONES> level{}, square{}, secretion{}, binding{}, net{};
  double work = 0, learning_change = 0, surprise = 0;
  struct Context {
    std::array<std::uint64_t, CONTEXT_STATES> count{};
    std::array<std::array<double, field::HORMONES>, CONTEXT_STATES> level{};
  };
  std::array<Context, hormone_context::count> contexts{};
  void add(const HormoneMoments &);
  void write(std::ostream &) const;
  void read(std::istream &);
};
struct HormoneInvestigation {
  std::uint64_t individual = 0, species = 0, tick = 0, round = 0;
  std::uint32_t organs = 0;
  unsigned arms = 0, learning_arms = 0;
  std::array<std::array<double, HORMONE_ORGANS>, HORMONE_ARMS> effects{};
  std::array<double, HORMONE_ARMS> learning{}, turn_magnitude{};
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
    std::array<std::array<double, HORMONE_ORGANS>, HORMONE_ARMS> effects{};
    std::array<std::array<std::uint64_t, HORMONE_ORGANS>, HORMONE_ARMS> counts{};
    std::array<double, HORMONE_ARMS> learning{};
    std::array<std::uint64_t, HORMONE_ARMS> learning_counts{};
    void write(std::ostream &) const;
    void read(std::istream &);
  };
  std::deque<Change> history;
};
struct HormoneProfile {
  HormoneMoments lifetime, window;
  std::array<HormoneName, field::HORMONES> names;
  std::deque<HormoneInvestigation> samples;
  std::uint64_t completed_round = 0, cursor = 0, investigations = 0, pending_round = 0;
  std::array<std::array<double, HORMONE_ORGANS>, HORMONE_ARMS> lifetime_effects{};
  std::array<std::array<std::uint64_t, HORMONE_ORGANS>, HORMONE_ARMS> lifetime_effect_count{};
  std::array<double, HORMONE_ARMS> lifetime_learning{};
  std::array<std::uint64_t, HORMONE_ARMS> lifetime_learning_count{};
  void accept(const HormoneInvestigation &);
  void finish_round(std::uint64_t, std::uint64_t);
  void write(std::ostream &) const;
  void read(std::istream &);
};
}
