#pragma once
#include "render_schema.hh"
#include <cstdint>
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace fishsim {
using RenderKind = render_wire::Kind;
struct RenderLayout {
  const render_wire::Field *fields;
  std::size_t count, bytes;
};
RenderLayout render_layout(RenderKind);
class RenderRow {
  RenderLayout layout;
  std::string bytes;

public:
  explicit RenderRow(RenderKind kind);
  void set(std::size_t field, double value);
  std::string finish() && { return std::move(bytes); }
};
using RenderRows = std::map<std::uint64_t, std::string>;
struct RenderChanges {
  std::uint32_t changed = 0, removed = 0;
  std::string bytes;
};
RenderChanges render_changes(const RenderRows &, const RenderRows &, RenderKind, bool delta);
void wire_integer(std::string &, std::uint64_t, unsigned bytes);
void wire_float(std::string &, float);
}
