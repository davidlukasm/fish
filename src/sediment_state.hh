#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>
namespace fishsim {
struct SedimentState {
  int columns = 0;
  int rows = 0;
  std::vector<double> suspended;
  std::vector<unsigned char> sediment_open;
  std::vector<unsigned char> sediment_safe;
  std::vector<std::uint16_t> sediment_links;
  std::vector<std::size_t> sediment_floor;
  double max_sediment_depth = 0;
};
}
