#include "interactive_session.hh"
#include "observations.hh"
#include "physiology.hh"
#include "retina.hh"
#include "session_io.hh"
#include <iomanip>
#include <iostream>
namespace fishsim {
void InteractiveSession::emit_scene(std::istringstream &line) {
  std::uint64_t base;
  double x, y, width, height, scale;
  std::string brain_key, inspection_key, extra;
  int focus;
  if (!(line >> base >> x >> y >> width >> height >> scale >> std::quoted(brain_key) >>
        std::quoted(inspection_key) >> focus) ||
      base > UINT32_MAX || (line >> extra))
    throw std::invalid_argument("Ungültige Bildanforderung");
  scene_stream.request(std::uint32_t(base), x, y, width, height, scale);
  retinal_focus = focus;
  auto *chosen = prepare_inspection();
  const std::string key = render_epoch + ":" + std::to_string(world.ticks) + ":" +
                          std::to_string(view_context) + ":" + std::to_string(state_request) + ":" +
                          std::to_string(selected) + ":" + std::to_string(brain_detail) + ":" +
                          std::to_string(brain_mode) + ":" + std::to_string(focus) + ":" +
                          brain_key;
  if (inspection_cache_key != key) {
    if (chosen && chosen->body.hatched && chosen->genome.interface) {
      const auto objects = visual_objects(chosen->body, chosen->genome, world.field);
      retinal_vision(chosen->body, *chosen->genome.interface, world.field, objects, &chosen->body,
                     RETINAL_STRIDE, false);
    }
  }
  auto lookup = scene_assets.begin(world);
  auto capture = capture_render(world, scene_stream.view(), selected, lookup);
  auto bytes = scene_stream.encode(std::move(capture), world.field.geometry().width,
                                   world.field.geometry().height, world.ticks,
                                   std::stoull(render_epoch), paused, false);
  auto assets = scene_assets.encode(!(static_cast<unsigned char>(bytes[6]) & 1));
  if (inspection_cache_key != key) {
    std::ostringstream inspection;
    inspection << std::setprecision(8) << "{\"context\":" << view_context
               << ",\"selected\":" << selected << ",\"inspection_id\":" << json_quoted(key)
               << ",\"fish\":";
    if (chosen)
      write_individual(inspection, *chosen, lookup.fish(*chosen), world.physiology().neural_cost);
    else
      inspection << "null";
    write_eye_view(inspection, chosen);
    if (brain_mode || brain_detail)
      write_brain(inspection, chosen,
                  brain_key != render_epoch + ":" + std::to_string(layout_revision));
    else {
      inspection << ",\"brain\":";
      if (chosen && !chosen->nutrient_egg) {
        write_brain_summary(inspection, chosen);
        write_brain_activity(inspection, chosen);
        inspection << '}';
      } else
        inspection << "null";
    }
    inspection << '}';
    inspection_cache = inspection.str();
    inspection_cache_key = key;
  }
  std::ostringstream unchanged;
  unchanged << "{\"context\":" << view_context << ",\"inspection_id\":" << json_quoted(key) << "}";
  const std::string inspection = inspection_key == key ? unchanged.str() : inspection_cache;
  std::string bundle = "FSV1";
  wire_integer(bundle, bytes.size(), 4);
  wire_integer(bundle, assets.size(), 4);
  wire_integer(bundle, inspection.size(), 4);
  bundle += bytes;
  bundle += assets;
  bundle += inspection;
  std::cout << "FSCENE " << bundle.size() << '\n';
  std::cout.write(bundle.data(), std::streamsize(bundle.size()));
  std::cout.put('\n');
  std::cout.flush();
}
}
