#pragma once
#include "genome.hh"
#include <ostream>
#include <string_view>
namespace fishsim {
void atomic_text(const std::string &, const std::string &);
std::vector<Genome> population(const std::string &);
void json_string(std::ostream &, std::string_view);
struct JsonString {
  std::string_view value;
};
inline JsonString json_quoted(std::string_view value) {
  return {value};
}
std::ostream &operator<<(std::ostream &, JsonString);
}
