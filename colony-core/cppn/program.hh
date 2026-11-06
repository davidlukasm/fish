#pragma once
#include "cppn.hh"
#include <array>
#include <map>
#include <cstdint>
namespace cppn {
class Program {
  std::shared_ptr<const ann::Network::Compiled> storage;
  const ann::Network::Compiled &code;
  std::shared_ptr<evolution::Genome> genes;
  std::map<unsigned, std::vector<std::size_t>> plans;
  std::vector<unsigned> dependencies;
  std::map<int, WorkAlias> aliases;
  std::map<int, std::size_t> indices;
  std::map<int, std::vector<int>> incoming;
  struct Observation {
    int id;
    std::size_t at;
    float multiplier;
    bool relay;
  };
  std::map<unsigned, std::vector<Observation>> observations;
  std::uint64_t cache_id;
  bool safe_ = true;
  struct PreparationState;
  std::unique_ptr<PreparationState> preparation;

public:
  explicit Program(const CPPN &, Preparation = Preparation::Immediate);
  ~Program();
  bool prepare(std::size_t &budget);
  bool safe() const { return safe_; }
  void evaluate(const Point *, std::size_t, unsigned,
                std::array<std::array<float, cppn::OUTPUTS>, BATCH> &,
                bool record_work = true) const;
};
}
