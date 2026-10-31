#pragma once
#include "cppn.hh"
#include <array>
#include <map>
#include <cstdint>
namespace cppn {
class Program {
  ann::Network::Compiled code;
  std::shared_ptr<evolution::Genome> genes;
  std::map<unsigned, std::vector<std::size_t>> plans;
  std::vector<unsigned> dependencies;
  std::map<int, WorkAlias> aliases;
  struct Observation {
    int id;
    std::size_t at;
    float multiplier;
    bool relay;
  };
  std::map<unsigned, std::vector<Observation>> observations;
  std::uint64_t cache_id;
  bool safe_ = true;

public:
  explicit Program(const CPPN &);
  bool safe() const { return safe_; }
  void plan(unsigned mask);
  void evaluate(const Point *, std::size_t, unsigned,
                std::array<std::array<float, cppn::OUTPUTS>, 64> &, bool record_work = true) const;
};
}
