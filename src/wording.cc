#include "wording.hh"
#include "session_io.hh"
#include <sstream>
namespace fishsim {
WordingValue::WordingValue(long long number) : json(std::to_string(number)) {
}
WordingValue::WordingValue(std::string_view text) {
  std::ostringstream out;
  json_string(out, text);
  json = out.str();
}
std::string wording(std::string_view key, WordingValues values) {
  std::ostringstream out;
  out << "{\"key\":";
  json_string(out, key);
  out << ",\"values\":{";
  bool first = true;
  for (const auto &[name, value] : values) {
    if (!first)
      out << ',';
    first = false;
    json_string(out, name);
    out << ':' << value.json;
  }
  out << "}}";
  return out.str();
}
}
