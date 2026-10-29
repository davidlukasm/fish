#pragma once
#include <cstdint>
#include <chrono>
#include <string>
#include <string_view>

namespace fishsim {
// Patches preserve every JSON value. Containers are copied only along changed paths.
// [0,value]: replace; [1,length,[[index,patch],...]]: array;
// [2,{key:patch,...},[removed_key,...]]: object.
// [3,id_column,order_or_null,[[id,patch],...]]: entity rows, stable across deaths/births.
// [6,hex_changed_mask,[value,...]]: changed cells of a same-length array.
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
