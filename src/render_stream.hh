#pragma once
#include "render_capture.hh"
#include <iosfwd>
namespace fishsim {
class RenderStream {
  RenderCapture previous;
  RenderView viewport;
  std::uint32_t sequence = 0, requested_base = 0, view_revision = 0;
  bool requested = false;

public:
  bool request(std::uint32_t base, double x, double y, double width, double height, double scale);
  bool pending() const { return requested; }
  const RenderView &view() const { return viewport; }
  std::string encode(RenderCapture, double width, double height, std::uint64_t step,
                     std::uint64_t epoch, bool paused, bool done);
  void publish(std::ostream &, RenderCapture, double width, double height, std::uint64_t step,
               std::uint64_t epoch, bool paused, bool done);
};
}
