#pragma once
#include "view_stream.hh"
#include <cstdint>
#include <iomanip>
#include <map>
#include <set>
#include <sstream>
#include <vector>
namespace fishsim {
struct Individual;
struct Corpse;
struct BrainInterface;
class JsonViewCache {
  struct Asset {
    std::uint64_t id = 0;
  };
  bool streamed, resetting = false, inspection = false;
  std::uint64_t selected = 0, environment = 0, clear_asset = 0, next_asset = 1, revision = 0;
  ViewStream stream;
  std::map<std::string, Asset> assets;
  std::map<std::string, std::string> sections;
  std::map<const BrainInterface *, std::uint64_t> morphologies;
  std::set<std::uint64_t> used, corpse_assets;
  std::vector<std::pair<std::uint64_t, std::string>> added;
  std::uint64_t asset(std::string);

public:
  explicit JsonViewCache(bool streamed) : streamed(streamed) {}
  ViewSchedule begin_frame(bool paused, bool done, std::uint64_t selected,
                           std::uint64_t environment, bool inspection, bool drifting);
  std::uint64_t next_revision() { return ++revision; }
  void invalidate();
  std::uint64_t morphology(std::ostream &, const Individual &);
  void begin_corpses() { corpse_assets.clear(); }
  std::uint64_t corpse(std::ostream &, const Corpse &);
  std::uint64_t light_template(std::string);
  void write_assets(std::ostream &);
  void finish_frame();
  std::string encode(std::string frame, ViewSchedule cadence);
  template <class Write> static std::string serialize(std::ostream &prototype, Write write) {
    std::ostringstream encoded;
    encoded.imbue(prototype.getloc());
    encoded << std::setprecision(7);
    write(encoded);
    return encoded.str();
  }
  template <class Write>
  void section(std::ostream &out, const char *name, bool changed, Write write) {
    if (!streamed) {
      write(out);
      return;
    }
    auto [entry, created] = sections.try_emplace(name);
    if (changed || created)
      entry->second = serialize(out, write);
    out << entry->second;
  }
};
}
