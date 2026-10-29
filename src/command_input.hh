#pragma once
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace fishsim {
struct CommandLine {
  std::string text;
  bool too_long = false;
};
class CommandInput {
  // 65,536 neuron IDs plus their separators fit into one group stimulus.
  static constexpr std::size_t limit = 512 * 1024;
  std::string partial;
  bool discarding = false;
  std::vector<CommandLine> ready;

public:
  void append(std::string_view bytes) {
    for (char c : bytes) {
      if (discarding) {
        if (c == '\n')
          discarding = false;
      } else if (c == '\n') {
        ready.push_back({std::move(partial), false});
        partial.clear();
      } else if (partial.size() < limit)
        partial += c;
      else {
        ready.push_back({partial.substr(0, 1024), true});
        partial.clear();
        discarding = true;
      }
    }
  }
  std::vector<CommandLine> take() { return std::exchange(ready, {}); }
};
}
