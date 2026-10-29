#pragma once
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <map>
#include <sstream>
#include <stdexcept>
namespace fishsim {
inline void validate_command_arguments(const std::string &op, std::istringstream &source) {
  // Required prefixes; command handlers validate ranges and variable-length tails.
  static const std::map<std::string, std::string> signatures{{"neural-cost", "n"},
                                                             {"parameter", "sn"},
                                                             {"burst", "s"},
                                                             {"feeding", "n"},
                                                             {"novelty", "n"},
                                                             {"turbo", "i"},
                                                             {"delay", "i"},
                                                             {"bottom-residence", "i"},
                                                             {"history-interval", "i"},
                                                             {"mutation", "n"},
                                                             {"density", "i"},
                                                             {"flow", "n"},
                                                             {"gravity", "n"},
                                                             {"food", "nn"},
                                                             {"spray", "nnin"},
                                                             {"remove-food", "nnn"},
                                                             {"wall", "nnnnn"},
                                                             {"move-obstacle", "nnnnn"},
                                                             {"current-source", "innnnn"},
                                                             {"feeder", "nnnn"},
                                                             {"remove-feeder", "nn"},
                                                             {"size", "nn"},
                                                             {"obstacle", "nnn"},
                                                             {"erase", "nn"},
                                                             {"polygon", "i"},
                                                             {"mussels", "nnni"},
                                                             {"worms", "nnni"},
                                                             {"crabs", "nnni"},
                                                             {"crush", "iui"},
                                                             {"grass", "nnn"},
                                                             {"algae", "nnn"},
                                                             {"remove-plants", "nnn"},
                                                             {"sediment", "nnn"},
                                                             {"remove-sediment", "nnn"},
                                                             {"evolution", "i"},
                                                             {"protect", "i"},
                                                             {"safety", "i"},
                                                             {"limit", "i"},
                                                             {"count", "i"},
                                                             {"group", "s"},
                                                             {"breeding-help", "i"},
                                                             {"select", "u"},
                                                             {"release-sperm", "u"},
                                                             {"pin", "u"},
                                                             {"rename-species", "u"},
                                                             {"neuron", "i"},
                                                             {"brain", "i"},
                                                             {"brain-mode", "i"},
                                                             {"reset-brain", "u"},
                                                             {"archive-eggs", "inni"},
                                                             {"experiment", "sii"},
                                                             {"mutant", "iin"},
                                                             {"export-genome", "uq"},
                                                             {"import-file", "qnni"},
                                                             {"saved-eggs", "qnni"},
                                                             {"import", "qnni"},
                                                             {"eggs", "nni"},
                                                             {"load-state", "q"}};
  const auto found = signatures.find(op);
  if (found == signatures.end())
    return;
  const auto position = source.tellg();
  std::istringstream input(
      position == std::streampos(-1) ? "" : source.str().substr(std::size_t(position)));
  for (char type : found->second) {
    std::string token;
    bool valid = type == 'q' ? bool(input >> std::quoted(token)) : bool(input >> token);
    if (valid && type != 's' && type != 'q') {
      std::istringstream number(token);
      if (type == 'i') {
        int value;
        valid = bool(number >> value);
      } else if (type == 'u') {
        std::uint64_t value;
        valid = token.front() != '-' && bool(number >> value);
      } else {
        double value;
        valid = bool(number >> value) && std::isfinite(value);
      }
      valid = valid && number.peek() == std::char_traits<char>::eof();
    }
    if (!valid)
      throw std::runtime_error("Fehlendes oder ungültiges Argument für " + op);
  }
}
}
