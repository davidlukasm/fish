#include "metadata_output.hh"
#include <cerrno>
#include <system_error>
#include <unistd.h>
namespace fishsim {
MetadataOutput::~MetadataOutput() {
  try {
    finish();
  } catch (...) {
  }
  if (fd >= 0)
    close(fd);
}
bool MetadataOutput::ready() {
  if (pending.valid() && pending.wait_for(std::chrono::seconds(0)) != std::future_status::ready)
    return false;
  finish();
  return true;
}
void MetadataOutput::finish() {
  if (pending.valid())
    pending.get();
}
void MetadataOutput::send(std::function<Frame()> build) {
  if (!ready())
    throw std::logic_error("Statistikausgabe noch beschäftigt");
  const bool restart = reset;
  reset = false;
  pending = std::async(std::launch::async, [this, build = std::move(build), restart]() mutable {
    auto [frame, cadence] = build();
    if (restart)
      stream.invalidate();
    auto bytes = stream.encode(std::move(frame), cadence) + '\n';
    std::size_t at = 0;
    while (at < bytes.size()) {
      const auto count = ::write(fd, bytes.data() + at, bytes.size() - at);
      if (count < 0 && errno == EINTR)
        continue;
      if (count <= 0)
        throw std::system_error(errno, std::generic_category(), "Statistikausgabe");
      at += std::size_t(count);
    }
  });
}
}
