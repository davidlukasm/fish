#pragma once
#include "view_stream.hh"
#include <cstdint>
#include <iosfwd>
#include <set>
#include <string>
#include <vector>
namespace fishsim {
class Ecosystem;
struct Field;
struct Individual;
struct ParameterInfo;
class JsonViewCache;
struct SessionView {
  std::string epoch, group;
  std::set<std::uint64_t> pins;
  const Individual *chosen = nullptr;
  std::uint64_t revision = 0, selected = 0, command_request = 0, context = 0;
  int completed = 0, delay = 0, count = 0;
  bool brain_detail = false, brain_mode = false;
  double tick_ms = 0;
  bool binary = false, paused = false, evolving = false, historical = false, protected_life = false,
       done = false, turbo = false, can_undo = false;
};
struct ExperimentView {
  const Ecosystem *reference = nullptr;
  std::string kind;
  std::uint64_t fish = 0, start = 0;
  int affected_neurons = 0;
};
class WorldViewWriter {
  std::ostream &out;
  const Ecosystem &world;
  const Field &f;
  const SessionView &status;
  JsonViewCache &cache;
  void performance();
  void support();
  void energy();
  void counters();
  void parameters(const std::vector<ParameterInfo> &);
  void health();
  void sources();
  void plants(ViewSchedule);
  void fields(ViewSchedule);
  void header();
  void population(ViewSchedule);
  void geometry();
  void particles(ViewSchedule);
  void statistics(const std::vector<ParameterInfo> &);
  void profiles(ViewSchedule);
  void environment(ViewSchedule);
  void experiment(const ExperimentView &);

public:
  WorldViewWriter(std::ostream &, const Ecosystem &, const SessionView &, JsonViewCache &);
  void write(ViewSchedule, const std::vector<ParameterInfo> &, const ExperimentView &);
};
}
