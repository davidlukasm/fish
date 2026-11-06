#pragma once
#include <cstdint>
#include <chrono>
#include <string>
#include <string_view>

namespace fishsim {
std::string view_patch(std::string_view previous, std::string_view current);
struct ViewSchedule {
  bool environment, particles, light, statistics, plants;
};
class ViewStream {
  std::string previous;
  std::uint64_t sequence = 0;
  std::chrono::steady_clock::time_point environment_time{}, statistics_time{}, particles_time{},
      light_time{};

public:
  void invalidate() { previous.clear(); }
  ViewSchedule schedule(bool forced);
  std::string encode(std::string frame, ViewSchedule cadence);
};
}
