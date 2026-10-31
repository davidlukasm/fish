#pragma once
#include <initializer_list>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
namespace fishsim {
// Messages to the interface name a wording and its values; the interface phrases them in its
// language. A value is a whole number or a short text such as a command name.
struct WordingValue {
  std::string json;
  WordingValue(long long number);
  WordingValue(std::string_view text);
  WordingValue(const char *text) : WordingValue(std::string_view(text)) {}
  WordingValue(const std::string &text) : WordingValue(std::string_view(text)) {}
  template <class Number, class = std::enable_if_t<std::is_integral_v<Number>>>
  WordingValue(Number number) : WordingValue(static_cast<long long>(number)) {}
};
using WordingValues = std::initializer_list<std::pair<std::string_view, WordingValue>>;
// {"key":…,"values":{…}} for the command reply.
std::string wording(std::string_view key, WordingValues values = {});
// A turned-down command; what() carries the wording.
struct Refusal : std::runtime_error {
  explicit Refusal(std::string_view key, WordingValues values = {})
      : std::runtime_error(wording(key, values)) {}
  // A wording built earlier, such as a placement notice.
  static Refusal worded(std::string text) { return Refusal(std::move(text), 0); }

private:
  Refusal(std::string text, int) : std::runtime_error(std::move(text)) {}
};
}
