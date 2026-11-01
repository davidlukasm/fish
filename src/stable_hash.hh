#pragma once
#include <cstdint>
#include <cstring>
namespace fishsim {
// Stable hashes for identities, names and geometry signatures; they never touch the simulation's
// random stream.
inline constexpr std::uint64_t FNV_OFFSET = 14695981039346656037ULL, FNV_PRIME = 1099511628211ULL;
// SplitMix64: its increment and its two finalising multipliers.
inline constexpr std::uint64_t SPLITMIX_GAMMA = 0x9E3779B97F4A7C15ULL,
                               SPLITMIX_MIX1 = 0xBF58476D1CE4E5B9ULL,
                               SPLITMIX_MIX2 = 0x94D049BB133111EBULL;
// One FNV-1a step over a word.
inline std::uint64_t fnv_add(std::uint64_t h, std::uint64_t word) {
  return (h ^ word) * FNV_PRIME;
}
inline std::uint64_t fnv_add(std::uint64_t h, double value) {
  std::uint64_t bits;
  std::memcpy(&bits, &value, sizeof bits);
  return fnv_add(h, bits);
}
inline std::uint64_t splitmix_finish(std::uint64_t z) {
  z = (z ^ (z >> 30)) * SPLITMIX_MIX1;
  z = (z ^ (z >> 27)) * SPLITMIX_MIX2;
  return z ^ (z >> 31);
}
// A value in [0, 1) from the top 53 bits.
inline double unit_interval(std::uint64_t z) {
  return double(z >> 11) / double(1ULL << 53);
}
}
