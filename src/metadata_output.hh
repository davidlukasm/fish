#pragma once
#include "view_stream.hh"
#include <future>
#include <functional>
namespace fishsim {
// Owns the statistics channel. Jobs receive completed snapshots, never live world state.
class MetadataOutput {
  int fd;
  ViewStream stream;
  std::future<void> pending;
  bool reset = false;

public:
  explicit MetadataOutput(int descriptor) : fd(descriptor) {}
  ~MetadataOutput();
  bool enabled() const { return fd >= 0; }
  bool ready();
  void finish();
  void invalidate() { reset = true; }
  using Frame = std::pair<std::string, ViewSchedule>;
  void send(std::function<Frame()>);
};
}
