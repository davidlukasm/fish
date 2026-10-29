#include "world_statistics.hh"
namespace fishsim {
void WorldStatistics::record(std::uint64_t ticks, std::uint64_t window) {
  performance_total.tick = ticks;
  if (ticks % 100 == 0)
    performance_history.push_back(performance_total);
  auto cut = ticks > window ? ticks - window : 0;
  while (performance_history.size() > 1 && performance_history[1].tick <= cut)
    performance_history.pop_front();
  while (performance_history.size() > 8192)
    performance_history.pop_front();
}
PerformanceSample WorldStatistics::performance(std::uint64_t ticks) const {
  auto result = performance_total;
  const auto &baseline = performance_history.front();
  result.tick = ticks - baseline.tick;
  result.hatches -= baseline.hatches;
  result.exposure -= baseline.exposure;
  result.natural_deaths -= baseline.natural_deaths;
  result.support_deaths -= baseline.support_deaths;
  result.support_hatches -= baseline.support_hatches;
  result.drift = std::max(0., result.drift - baseline.drift);
  result.food = std::max(0., result.food - baseline.food);
  result.nutrition = std::max(0., result.nutrition - baseline.nutrition);
  for (std::size_t i = 0; i < DIET_COUNT; ++i)
    result.diet[i] = std::max(0., result.diet[i] - baseline.diet[i]);
  return result;
}
}
