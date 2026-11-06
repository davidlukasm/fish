#pragma once
#include <cstdint>
#include <limits>
namespace field {
// SplitMix64: its increment, its two finalising multipliers and its three shifts. Stable hashes
// for identities, names and geometry signatures; they never touch a random stream.
inline constexpr std::uint64_t SPLITMIX_GAMMA = 0x9E3779B97F4A7C15ULL,
                               SPLITMIX_MIX1 = 0xBF58476D1CE4E5B9ULL,
                               SPLITMIX_MIX2 = 0x94D049BB133111EBULL;
inline constexpr int SPLITMIX_SHIFT1 = 30, SPLITMIX_SHIFT2 = 27, SPLITMIX_SHIFT3 = 31;
inline constexpr std::uint64_t splitmix_finish(std::uint64_t z) {
  z = (z ^ (z >> SPLITMIX_SHIFT1)) * SPLITMIX_MIX1;
  z = (z ^ (z >> SPLITMIX_SHIFT2)) * SPLITMIX_MIX2;
  return z ^ (z >> SPLITMIX_SHIFT3);
}
inline constexpr std::uint64_t splitmix(std::uint64_t z) {
  return splitmix_finish(z + SPLITMIX_GAMMA);
}
inline constexpr int UNIT_BITS = std::numeric_limits<double>::digits;
inline constexpr int UNIT_SHIFT = std::numeric_limits<std::uint64_t>::digits - UNIT_BITS;
inline constexpr double UNIT_STEPS = double(1ULL << UNIT_BITS);
inline double unit_interval(std::uint64_t z) {
  return double(z >> UNIT_SHIFT) / UNIT_STEPS;
}
inline double unit_center(std::uint64_t z) {
  return (double(z >> UNIT_SHIFT) + .5) / UNIT_STEPS;
}
}
