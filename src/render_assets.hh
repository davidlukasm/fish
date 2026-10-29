#pragma once
#include "brain_interface.hh"
#include "render_capture.hh"
#include <map>
#include <set>
namespace fishsim {
class RenderAssets {
  struct Entry {
    std::weak_ptr<const BrainInterface> owner;
    std::uint32_t id = 0;
    std::string text;
  };
  std::map<const BrainInterface *, Entry> fish;
  std::map<std::uint64_t, Entry> corpses;
  std::map<std::uint32_t, const std::string *> used;
  std::set<std::uint32_t> previous;
  std::uint32_t next = 1;

public:
  RenderAssetLookup begin(const Ecosystem &);
  std::string encode(bool full);
};
}
