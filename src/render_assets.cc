#include "session_io.hh"
#include "render_assets.hh"
#include "ecology.hh"
#include "observations.hh"
#include <iomanip>
#include <sstream>
#include <stdexcept>
namespace fishsim {
RenderAssetLookup RenderAssets::begin(const Ecosystem &world) {
  used.clear();
  std::set<const BrainInterface *> living;
  std::set<std::uint64_t> remains;
  for (const auto &p : world.fish)
    living.insert(p.genome.interface.get());
  for (const auto &c : world.corpses)
    remains.insert(c.render_id);
  for (auto it = fish.begin(); it != fish.end();)
    if (!living.count(it->first))
      it = fish.erase(it);
    else
      ++it;
  for (auto it = corpses.begin(); it != corpses.end();)
    if (!remains.count(it->first))
      it = corpses.erase(it);
    else
      ++it;
  auto intern = [this](Entry &entry, const auto &owner, auto write) {
    if (!entry.id || entry.owner.lock() != owner) {
      if (!next)
        throw std::overflow_error("Darstellungskennungen erschöpft");
      std::ostringstream out;
      out << std::setprecision(7);
      write(out);
      entry = {owner, next++, out.str()};
    }
    used.emplace(entry.id, &entry.text);
    return entry.id;
  };
  return {[this, intern](const Individual &p) {
            return intern(fish[p.genome.interface.get()], p.genome.interface,
                          [&](auto &out) { write_morphology(out, p.genome.interface); });
          },
          [this, intern](const Corpse &c) {
            return intern(corpses[c.render_id], c.visual,
                          [&](auto &out) { write_corpse_visual(out, c); });
          }};
}
std::string RenderAssets::encode(bool full) {
  std::ostringstream out;
  out << "{\"values\":{";
  bool first = true;
  for (const auto &[id, text] : used) {
    if (!full && previous.count(id))
      continue;
    if (!first)
      out << ',';
    first = false;
    out << json_quoted(std::to_string(id)) << ':' << *text;
  }
  out << "},\"ids\":[";
  first = true;
  previous.clear();
  for (const auto &[id, text] : used) {
    if (!first)
      out << ',';
    first = false;
    out << id;
    previous.insert(id);
  }
  out << "]}";
  return out.str();
}
}
