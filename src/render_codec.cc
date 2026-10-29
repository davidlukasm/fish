#include "render_codec.hh"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace fishsim {
namespace {
template <std::size_t N>
RenderLayout layout(const std::array<render_wire::Field, N> &fields, std::size_t bytes) {
  return {fields.data(), N, bytes};
}
template <class T> std::uint64_t bounded(double value) {
  auto number = T(std::clamp(std::round(value), double(std::numeric_limits<T>::lowest()),
                             double(std::numeric_limits<T>::max())));
  return std::uint64_t(number);
}
}
RenderLayout render_layout(RenderKind kind) {
  switch (kind) {
  case RenderKind::Fish:
    return layout(render_wire::fish::fields, render_wire::fish::bytes);
  case RenderKind::Food:
    return layout(render_wire::food::fields, render_wire::food::bytes);
  case RenderKind::Corpse:
    return layout(render_wire::corpse::fields, render_wire::corpse::bytes);
  case RenderKind::Gamete:
    return layout(render_wire::gamete::fields, render_wire::gamete::bytes);
  case RenderKind::Invertebrate:
    return layout(render_wire::invertebrate::fields, render_wire::invertebrate::bytes);
  case RenderKind::Wound:
    return layout(render_wire::wound::fields, render_wire::wound::bytes);
  default:
    throw std::logic_error("Unknown render record");
  }
}
void wire_integer(std::string &out, std::uint64_t value, unsigned bytes) {
  for (unsigned i = 0; i < bytes; ++i)
    out += char(value >> (8 * i));
}
void wire_float(std::string &out, float value) {
  std::uint32_t bits;
  static_assert(sizeof value == sizeof bits);
  std::memcpy(&bits, &value, sizeof bits);
  wire_integer(out, bits, 4);
}
RenderRow::RenderRow(RenderKind kind) : layout(render_layout(kind)), bytes(layout.bytes, '\0') {
}
void RenderRow::set(std::size_t index, double value) {
  if (index >= layout.count)
    throw std::logic_error("Render column outside schema");
  const auto &field = layout.fields[index];
  value = std::isfinite(value) ? value * field.scale : 0;
  std::uint64_t bits = 0;
  switch (field.type) {
  case render_wire::Type::u8:
    bits = bounded<std::uint8_t>(value);
    break;
  case render_wire::Type::i8:
    bits = bounded<std::int8_t>(value);
    break;
  case render_wire::Type::u16:
    bits = bounded<std::uint16_t>(value);
    break;
  case render_wire::Type::i16:
    bits = bounded<std::int16_t>(value);
    break;
  case render_wire::Type::u32:
    bits = bounded<std::uint32_t>(value);
    break;
  case render_wire::Type::i32:
    bits = bounded<std::int32_t>(value);
    break;
  case render_wire::Type::i64:
    // Simulation clocks and identities are bounded by the exact integer range of the browser.
    bits = std::uint64_t(
        std::int64_t(std::clamp(std::round(value), -9007199254740991., 9007199254740991.)));
    break;
  case render_wire::Type::f32: {
    float f = float(std::clamp(value, -double(std::numeric_limits<float>::max()),
                               double(std::numeric_limits<float>::max())));
    std::uint32_t u;
    std::memcpy(&u, &f, 4);
    bits = u;
    break;
  }
  }
  for (std::size_t i = 0; i < field.size; ++i)
    bytes[field.offset + i] = char(bits >> (8 * i));
}
RenderChanges render_changes(const RenderRows &current, const RenderRows &previous, RenderKind kind,
                             bool delta) {
  const auto layout = render_layout(kind);
  RenderChanges result;
  for (const auto &[id, row] : current) {
    auto found = previous.find(id);
    const std::string *old = delta && found != previous.end() ? &found->second : nullptr;
    std::uint64_t mask = 0;
    for (std::size_t i = 0; i < layout.count; ++i) {
      const auto &f = layout.fields[i];
      if (!old || row.compare(f.offset, f.size, *old, f.offset, f.size))
        mask |= std::uint64_t(1) << i;
    }
    if (!mask)
      continue;
    ++result.changed;
    wire_integer(result.bytes, id, 8);
    wire_integer(result.bytes, mask, 8);
    for (std::size_t i = 0; i < layout.count; ++i)
      if (mask & (std::uint64_t(1) << i)) {
        const auto &f = layout.fields[i];
        result.bytes.append(row, f.offset, f.size);
      }
  }
  if (delta)
    for (const auto &[id, row] : previous)
      if (!current.count(id)) {
        ++result.removed;
        wire_integer(result.bytes, id, 8);
      }
  return result;
}
}
