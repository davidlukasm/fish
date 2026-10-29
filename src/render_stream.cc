#include "render_stream.hh"
#include <ostream>
#include <stdexcept>
namespace fishsim {
namespace {
template <class T>
std::uint32_t tiles(std::string &out, const std::map<std::uint32_t, T> &current,
                    const std::map<std::uint32_t, T> &previous, bool delta) {
  std::uint32_t count = 0;
  for (const auto &[index, value] : current) {
    auto old = previous.find(index);
    if (delta && old != previous.end() && old->second == value)
      continue;
    ++count;
    wire_integer(out, index, 4);
    if constexpr (sizeof(T) == 1)
      wire_integer(out, value, 1);
    else
      wire_float(out, value);
  }
  return count;
}
}
bool RenderStream::request(std::uint32_t base, double x, double y, double width, double height,
                           double scale) {
  bool changed = viewport.update(x, y, width, height, scale);
  if (changed)
    ++view_revision;
  requested_base = base;
  requested = true;
  return changed;
}
std::string RenderStream::encode(RenderCapture capture, double width, double height,
                                 std::uint64_t step, std::uint64_t epoch, bool paused, bool done) {
  bool delta = sequence && requested_base == sequence;
  if (capture.light_columns != previous.light_columns ||
      capture.light_rows != previous.light_rows ||
      capture.sediment_columns != previous.sediment_columns ||
      capture.sediment_rows != previous.sediment_rows ||
      capture.plankton_columns != previous.plankton_columns ||
      capture.plankton_rows != previous.plankton_rows)
    delta = false;
  std::array<RenderChanges, std::size_t(RenderKind::Count)> changes;
  for (std::size_t i = 0; i < changes.size(); ++i)
    changes[i] = render_changes(capture.rows[i], previous.rows[i], RenderKind(i), delta);
  std::string light, sediment, plankton;
  auto light_count = tiles(light, capture.light, previous.light, delta);
  auto sediment_count = tiles(sediment, capture.sediment, previous.sediment, delta);
  auto plankton_count = tiles(plankton, capture.plankton, previous.plankton, delta);
  std::string result = "FSC1";
  wire_integer(result, render_wire::version, 2);
  wire_integer(result, unsigned(delta) | (unsigned(paused) << 1) | (unsigned(done) << 2), 2);
  const auto base = sequence;
  ++sequence;
  wire_integer(result, sequence, 4);
  wire_integer(result, delta ? base : 0, 4);
  wire_integer(result, step, 8);
  wire_float(result, float(width));
  wire_float(result, float(height));
  for (const auto &c : changes) {
    wire_integer(result, c.changed, 4);
    wire_integer(result, c.removed, 4);
  }
  wire_integer(result, capture.light_columns, 2);
  wire_integer(result, capture.light_rows, 2);
  wire_integer(result, capture.sediment_columns, 2);
  wire_integer(result, capture.sediment_rows, 2);
  wire_integer(result, capture.plankton_columns, 2);
  wire_integer(result, capture.plankton_rows, 2);
  wire_integer(result, light_count, 4);
  wire_integer(result, sediment_count, 4);
  wire_integer(result, plankton_count, 4);
  wire_integer(result, epoch, 8);
  wire_integer(result, view_revision, 4);
  wire_integer(result, 0, 4);
  if (result.size() != render_wire::header_bytes)
    throw std::logic_error("Scene header differs from schema");
  for (const auto &c : changes)
    result += c.bytes;
  result += light;
  result += sediment;
  result += plankton;
  previous = std::move(capture);
  requested = false;
  return result;
}
void RenderStream::publish(std::ostream &out, RenderCapture capture, double width, double height,
                           std::uint64_t step, std::uint64_t epoch, bool paused, bool done) {
  auto payload = encode(std::move(capture), width, height, step, epoch, paused, done);
  const bool delta = (static_cast<unsigned char>(payload[6]) & 1) != 0;
  out << "FSCENE " << payload.size() << ' ' << sequence << ' ' << (delta ? sequence - 1 : 0) << ' '
      << delta << '\n';
  out.write(payload.data(), std::streamsize(payload.size()));
  out.put('\n');
  out.flush();
}
}
