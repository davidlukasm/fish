#pragma once
#include "genome.hh"
#include "field/maturation.hh"
#include <map>
namespace fishsim {
inline const field::Maturation &maturation_template(const Genome &g, bool capable = true) {
  struct Entry {
    std::weak_ptr<const field::Substrate> owner;
    field::Maturation value;
  };
  thread_local std::map<std::pair<const field::Substrate *, bool>, Entry> cache;
  auto key = std::make_pair(g.blueprint.get(), capable);
  auto found = cache.find(key);
  if (found != cache.end() && !found->second.owner.expired())
    return found->second.value;
  if (found != cache.end())
    cache.erase(found);
  // Keep all live immutable plans. Clearing a full cache makes larger
  // populations rebuild every plan on every pass through the fish.
  thread_local unsigned misses = 0;
  if (cache.size() >= 256 && ++misses % 128 == 0)
    for (auto i = cache.begin(); i != cache.end();) {
      if (i->second.owner.expired())
        i = cache.erase(i);
      else
        ++i;
    }
  field::Maturation value(*g.blueprint, {}, capable);
  auto inserted = cache.emplace(key, Entry{g.blueprint, std::move(value)});
  return inserted.first->second.value;
}
}
