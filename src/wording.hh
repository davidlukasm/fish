#pragma once
#include <initializer_list>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
namespace fishsim {
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
std::string wording(std::string_view key, WordingValues values = {});
struct Refusal : std::runtime_error {
  explicit Refusal(std::string_view key, WordingValues values = {})
      : std::runtime_error(wording(key, values)) {}
  static Refusal worded(std::string text) { return Refusal(std::move(text), 0); }

private:
  Refusal(std::string text, int) : std::runtime_error(std::move(text)) {}
};
}
