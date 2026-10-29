#pragma once
#include "cppn.hh"
#include <array>
#include <map>
#include <cstdint>
namespace cppn {
struct Point {
  float a, b, z, c, d, w, match1 = 0, match2 = 0;
};
class Program {
  ann::Network::Compiled code;
  std::map<unsigned, std::vector<std::size_t>> plans;
  std::vector<unsigned> dependencies;
  std::uint64_t cache_id;
  bool safe_ = true;

public:
  explicit Program(const CPPN &);
  bool safe() const { return safe_; }
  void plan(unsigned mask);
  void evaluate(const Point *, std::size_t, unsigned,
                std::array<std::array<float, cppn::OUTPUTS>, 64> &) const;
};
}
