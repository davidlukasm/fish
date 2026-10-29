#pragma once
#include "render_codec.hh"
#include "render_view.hh"
#include <array>
#include <functional>
namespace fishsim {
class Ecosystem;
struct Individual;
struct Corpse;
struct RenderCapture {
  std::array<RenderRows, std::size_t(RenderKind::Count)> rows;
  std::map<std::uint32_t, std::uint8_t> light;
  std::map<std::uint32_t, float> sediment, plankton;
  unsigned light_columns = 0, light_rows = 0, sediment_columns = 0, sediment_rows = 0,
           plankton_columns = 0, plankton_rows = 0;
};
struct RenderAssetLookup {
  std::function<std::uint32_t(const Individual &)> fish;
  std::function<std::uint32_t(const Corpse &)> corpse;
};
RenderCapture capture_render(const Ecosystem &, const RenderView &, std::uint64_t selected,
                             const RenderAssetLookup &);
}
