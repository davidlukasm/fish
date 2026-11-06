#pragma once
#include <istream>
#include <ostream>
namespace studio_plan {
inline constexpr int max_name = 40;
inline constexpr int max_groups = 360;
inline constexpr int max_group_name = 60;
inline constexpr int receptors = 7;
inline constexpr int max_probe_steps = 32;
inline constexpr int max_measure_steps = 64;
inline constexpr int max_copies = 16;
template <typename Group>
bool read_group(std::istream &input, Group &g) {
  return bool(input >> g.zone >> g.side >> g.u0 >> g.u1 >> g.v0 >> g.v1 >> g.w0 >> g.w1 >> g.role >> g.function >> g.copies >> g.threshold >> g.tau >> g.field >> g.q1 >> g.q2 >> g.qwidth >> g.sign >> g.mode >> g.pace >> g.modulator >> g.crossing >> g.range >> g.organ >> g.open);
}
template <typename Receptor>
bool read_receptor(std::istream &input, Receptor &r, int &active) {
  return bool(input >> active >> r.baseline >> r.sensitivity >> r.half >> r.substance >> r.width >> r.steepness);
}
template <typename Value>
void write_group(std::ostream &out, const Value &value) {
  out << "{";
  out << "\"zone\":" << value.zone;
  out << ",\"side\":" << value.side;
  out << ",\"u0\":" << value.u0;
  out << ",\"u1\":" << value.u1;
  out << ",\"v0\":" << value.v0;
  out << ",\"v1\":" << value.v1;
  out << ",\"w0\":" << value.w0;
  out << ",\"w1\":" << value.w1;
  out << ",\"role\":" << value.role;
  out << ",\"function\":" << value.function;
  out << ",\"copies\":" << value.copies;
  out << ",\"threshold\":" << value.threshold;
  out << ",\"tau\":" << value.tau;
  out << ",\"field\":" << value.field;
  out << ",\"q1\":" << value.q1;
  out << ",\"q2\":" << value.q2;
  out << ",\"qwidth\":" << value.qwidth;
  out << ",\"sign\":" << value.sign;
  out << ",\"mode\":" << value.mode;
  out << ",\"pace\":" << value.pace;
  out << ",\"modulator\":" << value.modulator;
  out << ",\"crossing\":" << value.crossing;
  out << ",\"range\":" << value.range;
  out << ",\"organ\":" << value.organ;
  out << ",\"open\":" << value.open;
  out << "}";
}
template <typename Value>
void write_receptor(std::ostream &out, const Value &value) {
  out << "{";
  out << "\"active\":" << int(value.active);
  out << ",\"baseline\":" << value.baseline;
  out << ",\"sensitivity\":" << value.sensitivity;
  out << ",\"half\":" << value.half;
  out << ",\"substance\":" << value.substance;
  out << ",\"width\":" << value.width;
  out << ",\"steepness\":" << value.steepness;
  out << "}";
}
}
