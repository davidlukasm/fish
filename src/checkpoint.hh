#pragma once
#include "ecology.hh"
#include <future>

namespace fishsim {
// Private mutable state and genetic histories are frozen before the writer starts.
struct Checkpoint {
  Ecosystem world;
  Genome founder;
  std::uint64_t selected, last_observation, seen;
  bool evolving, protected_life;
  int completed;
};
Checkpoint capture_checkpoint(const Ecosystem &, const Genome &, std::uint64_t, bool, bool, int,
                              std::uint64_t, std::uint64_t);
std::string serialize_checkpoint(const Checkpoint &);
Checkpoint read_checkpoint(std::istream &, int workers);
class CheckpointWriter {
  std::future<void> pending;

public:
  bool busy();
  void finish();
  void save(std::string path, Checkpoint);
};
}
