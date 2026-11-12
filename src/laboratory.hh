#pragma once
#include "ecology.hh"
#include "life_recorder.hh"
#include <map>
#include <optional>
#include <set>

namespace fishsim {
struct LaboratoryControl {
  std::optional<double> forward, turn, jaw, suction, energy;
  bool auto_forward = false, auto_turn = false, auto_mouth = false;
  bool leaves = false;
  std::set<int> muted;
  std::uint64_t egg_until = 0, sperm_until = 0;
};
struct LaboratoryTarget {
  double x = 0, y = 0, distance = 0, bearing = 0;
  bool found = false;
};
LaboratoryTarget laboratory_target(const Ecosystem &, const Body &, bool leaves);
void apply_laboratory_control(Individual &, const Ecosystem &, const LaboratoryControl &);

class LaboratoryRecording {
  LifeRecorder recorder;
  std::string channel;
  std::set<std::uint64_t> alive;
  std::map<std::uint64_t, int> lines;

public:
  explicit LaboratoryRecording(const std::string &);
  void begin(const Ecosystem &, int founders);
  void observe(const Ecosystem &);
};
void write_laboratory_population(std::ostream &, const Ecosystem &);
void write_laboratory_scene(std::ostream &, const Ecosystem &);
}
