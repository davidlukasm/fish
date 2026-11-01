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
    wire_integer(out, index, render_wire::count_bytes);
    if constexpr (sizeof(T) == 1)
      wire_integer(out, value, sizeof(T));
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
  auto result = encode_frame(capture, width, height, step, epoch, paused, done, false);
  previous = std::move(capture);
  return result;
}
std::string RenderStream::repeat(double width, double height, std::uint64_t step,
                                 std::uint64_t epoch, bool paused, bool done) {
  if (!can_repeat())
    throw std::logic_error("Unchanged scene requires the current base and viewport");
  return encode_frame(previous, width, height, step, epoch, paused, done, true);
}
std::string RenderStream::encode_frame(const RenderCapture &capture, double width, double height,
                                       std::uint64_t step, std::uint64_t epoch, bool paused,
                                       bool done, bool unchanged) {
  bool delta = sequence && requested_base == sequence;
  if (capture.light_columns != previous.light_columns ||
      capture.light_rows != previous.light_rows ||
      capture.sediment_columns != previous.sediment_columns ||
      capture.sediment_rows != previous.sediment_rows ||
      capture.plankton_columns != previous.plankton_columns ||
      capture.plankton_rows != previous.plankton_rows)
    delta = false;
  std::array<RenderChanges, std::size_t(RenderKind::Count)> changes;
  std::string light, sediment, plankton;
  std::uint32_t light_count = 0, sediment_count = 0, plankton_count = 0;
  if (!unchanged) {
    for (std::size_t i = 0; i < changes.size(); ++i)
      changes[i] = render_changes(capture.rows[i], previous.rows[i], RenderKind(i), delta);
    light_count = tiles(light, capture.light, previous.light, delta);
    sediment_count = tiles(sediment, capture.sediment, previous.sediment, delta);
    plankton_count = tiles(plankton, capture.plankton, previous.plankton, delta);
  }
  namespace W = render_wire::scene_width;
  namespace S = render_wire::scene_flag;
  std::string result = render_wire::magic;
  wire_integer(result, render_wire::version, W::version);
  wire_integer(result, (delta ? S::delta : 0) | (paused ? S::paused : 0) | (done ? S::done : 0),
               W::flags);
  const auto base = sequence;
  ++sequence;
  wire_integer(result, sequence, W::sequence);
  wire_integer(result, delta ? base : 0, W::base);
  wire_integer(result, step, W::step);
  wire_float(result, float(width));
  wire_float(result, float(height));
  for (const auto &c : changes) {
    wire_integer(result, c.changed, render_wire::count_bytes);
    wire_integer(result, c.removed, render_wire::count_bytes);
  }
  wire_integer(result, capture.light_columns, W::light_columns);
  wire_integer(result, capture.light_rows, W::light_rows);
  wire_integer(result, capture.sediment_columns, W::sediment_columns);
  wire_integer(result, capture.sediment_rows, W::sediment_rows);
  wire_integer(result, capture.plankton_columns, W::plankton_columns);
  wire_integer(result, capture.plankton_rows, W::plankton_rows);
  wire_integer(result, light_count, W::light_changes);
  wire_integer(result, sediment_count, W::sediment_changes);
  wire_integer(result, plankton_count, W::plankton_changes);
  wire_integer(result, epoch, W::epoch);
  wire_integer(result, view_revision, W::view_revision);
  wire_integer(result, 0, W::reserved);
  if (result.size() != render_wire::header_bytes)
    throw std::logic_error("Scene header differs from schema");
  for (const auto &c : changes)
    result += c.bytes;
  result += light;
  result += sediment;
  result += plankton;
  encoded_view_revision = view_revision;
  requested = false;
  return result;
}
void RenderStream::publish(std::ostream &out, RenderCapture capture, double width, double height,
                           std::uint64_t step, std::uint64_t epoch, bool paused, bool done) {
  auto payload = encode(std::move(capture), width, height, step, epoch, paused, done);
  const bool delta = (static_cast<unsigned char>(payload[render_wire::scene_offset::flags]) &
                      render_wire::scene_flag::delta) != 0;
  out << "FSCENE " << payload.size() << ' ' << sequence << ' ' << (delta ? sequence - 1 : 0) << ' '
      << delta << '\n';
  out.write(payload.data(), std::streamsize(payload.size()));
  out.put('\n');
  out.flush();
}
}
