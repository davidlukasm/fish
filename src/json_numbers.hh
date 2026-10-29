#pragma once
#include <algorithm>
#include <charconv>
#include <locale>
#include <cmath>
namespace fishsim {
// Keep the stream's significant digits; accelerate only ordinary JSON numbers.
class JsonNumbers final : public std::num_put<char> {
  iter_type do_put(iter_type out, std::ios_base &stream, char_type fill,
                   double value) const override {
    if (!std::isfinite(value)) {
      const char text[] = "null";
      return std::copy(text, text + 4, out);
    }
    const auto flags = stream.flags();
    if (!(flags & (std::ios_base::floatfield | std::ios_base::showpos | std::ios_base::showpoint |
                   std::ios_base::uppercase)) &&
        stream.width() == 0 && stream.precision() > 0 && stream.precision() <= 17) {
      char buffer[128];
      auto result = std::to_chars(buffer, buffer + sizeof(buffer), value,
                                  std::chars_format::general, int(stream.precision()));
      if (result.ec == std::errc{})
        return std::copy(buffer, result.ptr, out);
    }
    return std::num_put<char>::do_put(out, stream, fill, value);
  }
};
}
