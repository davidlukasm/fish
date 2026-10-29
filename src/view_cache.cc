#include "session_io.hh"
#include "view_cache.hh"
#include "observations.hh"
namespace fishsim {
ViewSchedule JsonViewCache::begin_frame(bool paused, bool done, std::uint64_t current_selected,
                                        std::uint64_t current_environment, bool current_inspection,
                                        bool drifting) {
  resetting = assets.empty();
  used.clear();
  added.clear();
  morphologies.clear();
  bool forced = paused || done || sections.empty() || selected != current_selected ||
                environment != current_environment || inspection != current_inspection;
  auto cadence = streamed ? stream.schedule(forced) : ViewSchedule{true, true, true, true, true};
  cadence.plants = cadence.statistics || (cadence.environment && drifting);
  selected = current_selected;
  environment = current_environment;
  inspection = current_inspection;
  return cadence;
}
void JsonViewCache::invalidate() {
  stream.invalidate();
  sections.clear();
  assets.clear();
  corpse_assets.clear();
}
std::uint64_t JsonViewCache::asset(std::string text) {
  auto [entry, created] = assets.try_emplace(std::move(text));
  if (created) {
    entry->second.id = next_asset++;
    added.emplace_back(entry->second.id, entry->first);
  }
  used.insert(entry->second.id);
  return entry->second.id;
}
std::uint64_t JsonViewCache::morphology(std::ostream &out, const Individual &p) {
  auto [entry, created] = morphologies.try_emplace(p.genome.interface.get());
  if (created)
    entry->second =
        asset(serialize(out, [&](auto &out) { write_morphology(out, p.genome.interface); }));
  return entry->second;
}
std::uint64_t JsonViewCache::corpse(std::ostream &out, const Corpse &c) {
  auto id = asset(serialize(out, [&](auto &out) { write_corpse_visual(out, c); }));
  corpse_assets.insert(id);
  return id;
}
std::uint64_t JsonViewCache::light_template(std::string text) {
  clear_asset = asset(std::move(text));
  return clear_asset;
}
void JsonViewCache::write_assets(std::ostream &out) {
  used.insert(corpse_assets.begin(), corpse_assets.end());
  used.insert(clear_asset);
  out << ",\"asset_reset\":" << (resetting ? "true" : "false") << ",\"retired_assets\":[";
  bool first = true;
  for (const auto &[text, entry] : assets)
    if (!used.count(entry.id)) {
      if (!first)
        out << ',';
      first = false;
      out << entry.id;
    }
  out << "],\"assets\":{";
  first = true;
  for (const auto &[id, text] : added) {
    if (!first)
      out << ',';
    first = false;
    out << json_quoted(std::to_string(id)) << ':' << text;
  }
  out << '}';
}
void JsonViewCache::finish_frame() {
  for (auto it = assets.begin(); it != assets.end();)
    if (!used.count(it->second.id))
      it = assets.erase(it);
    else
      ++it;
}
std::string JsonViewCache::encode(std::string frame, ViewSchedule cadence) {
  return streamed ? stream.encode(std::move(frame), cadence) : frame;
}
}
