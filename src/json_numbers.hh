#pragma once
#include <algorithm>
#include <charconv>
#include <locale>
#include <cmath>
#include <ostream>
#include <stdexcept>
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
// Writes the values of a container separated by commas, as the body of a JSON list.
template <class Values> void write_values(std::ostream &out, const Values &values) {
  bool first = true;
  for (const auto &value : values) {
    if (!first)
      out << ',';
    first = false;
    out << value;
  }
}
// Writes one record as a JSON list, field by field in the order of its schema columns.
class Record {
  std::ostream &out;
  std::size_t next = 0, count;
  void start(std::size_t column) {
    if (column != next)
      throw std::logic_error("record column out of order");
    if (next++)
      out << ',';
  }

public:
  Record(std::ostream &o, std::size_t columns) : out(o), count(columns) { out << '['; }
  Record(const Record &) = delete;
  template <class T> Record &operator()(std::size_t column, const T &value) {
    start(column);
    out << value;
    return *this;
  }
  template <class Values> Record &list(std::size_t column, const Values &values) {
    start(column);
    out << '[';
    write_values(out, values);
    out << ']';
    return *this;
  }
  // A field written by `write(out)`, for nested records.
  template <class Write> Record &with(std::size_t column, Write write) {
    start(column);
    write(out);
    return *this;
  }
  void finish() {
    if (next != count)
      throw std::logic_error("incomplete record");
    out << ']';
  }
};
}
