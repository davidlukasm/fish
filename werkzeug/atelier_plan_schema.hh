#pragma once
#include <istream>
namespace studio_plan {
inline constexpr int max_name = 40;
inline constexpr int max_groups = 80;
inline constexpr int max_group_name = 60;
inline constexpr int receptors = 7;
inline constexpr int max_probe_steps = 32;
inline constexpr int max_measure_steps = 64;
inline constexpr int max_copies = 16;
template <typename Group>
bool read_group(std::istream &input, Group &g) {
  return bool(input >> g.zone >> g.side >> g.u0 >> g.u1 >> g.v0 >> g.v1 >> g.w0 >> g.w1 >> g.role >> g.function >> g.copies >> g.threshold >> g.tau >> g.field >> g.q1 >> g.q2 >> g.qwidth >> g.sign >> g.mode >> g.pace >> g.modulator >> g.sender1 >> g.sender2 >> g.receiver1 >> g.receiver2 >> g.sigma >> g.crossing >> g.range);
}
template <typename Receptor>
bool read_receptor(std::istream &input, Receptor &r, int &active) {
  return bool(input >> active >> r.baseline >> r.sensitivity >> r.half >> r.substance >> r.width >> r.steepness);
}
}
