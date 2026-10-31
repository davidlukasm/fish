#include "interactive_session.hh"
#include "observations.hh"
#include "physiology.hh"
#include "retina.hh"
#include "session_io.hh"
#include <cerrno>
#include <cstring>
#include <iomanip>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
namespace fishsim {
void InteractiveSession::connect_scenes() {
  if (o.render_socket.empty())
    return;
  sockaddr_un address{};
  address.sun_family = AF_UNIX;
  if (o.render_socket.size() >= sizeof address.sun_path)
    throw std::runtime_error("Bildkanal: Pfad zu lang");
  std::memcpy(address.sun_path, o.render_socket.c_str(), o.render_socket.size() + 1);
  render_fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (render_fd < 0 ||
      connect(render_fd, reinterpret_cast<const sockaddr *>(&address), sizeof address) != 0)
    throw std::runtime_error(std::string("Bildkanal: ") + std::strerror(errno));
}
static bool send_all(int fd, const std::string &bytes) {
  std::size_t at = 0;
  while (at < bytes.size()) {
    const auto count = ::send(fd, bytes.data() + at, bytes.size() - at, MSG_NOSIGNAL);
    if (count < 0 && errno == EINTR)
      continue;
    if (count <= 0)
      return false;
    at += std::size_t(count);
  }
  return true;
}
// Replies: "FSCENE <request> <bytes>\n<bundle>" or "FERROR <request> <JSON string>\n".
void InteractiveSession::serve_scenes() {
  if (render_fd < 0)
    return;
  pollfd fd{render_fd, POLLIN, 0};
  while (poll(&fd, 1, 0) > 0 && (fd.revents & (POLLIN | POLLHUP | POLLERR))) {
    char bytes[4096];
    const auto n = ::read(render_fd, bytes, sizeof bytes);
    if (n <= 0) {
      close(render_fd);
      render_fd = -1;
      return;
    }
    render_input.append(std::string_view(bytes, std::size_t(n)));
  }
  for (const auto &command : render_input.take()) {
    std::istringstream line(command.text);
    std::string op;
    std::uint64_t request = 0;
    line >> op >> request >> op;
    std::string reply;
    try {
      if (command.too_long || op != "render" || !o.render_stream)
        throw std::runtime_error("Darstellungsstrom nicht verfügbar");
      auto bundle = encode_scene(line);
      reply = "FSCENE " + std::to_string(request) + ' ' + std::to_string(bundle.size()) + '\n';
      reply += bundle;
    } catch (const std::exception &error) {
      std::ostringstream value;
      json_string(value, error.what());
      reply = "FERROR " + std::to_string(request) + ' ' + value.str() + '\n';
    }
    if (!send_all(render_fd, reply)) {
      close(render_fd);
      render_fd = -1;
      return;
    }
  }
}
std::string InteractiveSession::encode_scene(std::istringstream &line) {
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
                          std::to_string(view_context) + ":" + std::to_string(scene_revision) +
                          ":" + std::to_string(selected) + ":" + std::to_string(brain_detail) +
                          ":" + std::to_string(brain_mode) + ":" + std::to_string(focus) + ":" +
                          brain_key;
  if (inspection_cache_key != key) {
    if (chosen && chosen->body.hatched && chosen->genome.interface) {
      const auto objects = visual_objects(chosen->body, chosen->genome, world.field);
      retinal_vision(chosen->body, *chosen->genome.interface, world.field, objects, &chosen->body,
                     RETINAL_STRIDE, false);
    }
  }
  RenderAssetLookup lookup;
  std::string bytes;
  if (scene_cache_key == key && inspection_cache_key == key && scene_stream.can_repeat()) {
    bytes = scene_stream.repeat(world.field.geometry().width, world.field.geometry().height,
                                world.ticks, std::stoull(render_epoch), paused, false);
  } else {
    lookup = scene_assets.begin(world);
    auto capture = capture_render(world, scene_stream.view(), selected, lookup);
    bytes = scene_stream.encode(std::move(capture), world.field.geometry().width,
                                world.field.geometry().height, world.ticks,
                                std::stoull(render_epoch), paused, false);
    scene_cache_key = key;
  }
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
  return bundle;
}
}
