#pragma once
#include <istream>
#include <ostream>
namespace studio_plan {
inline constexpr int max_name = 40;
inline constexpr int max_groups = 360;
inline constexpr int max_group_name = 60;
inline constexpr int receptors = 8;
inline constexpr int max_probe_steps = 32;
inline constexpr int max_measure_steps = 64;
inline constexpr int max_copies = 16;
inline constexpr int contact_values = 29;
template <typename Group>
bool read_group(std::istream &input, Group &g) {
  return bool(input >> g.zone >> g.side >> g.u0 >> g.u1 >> g.v0 >> g.v1 >> g.w0 >> g.w1 >> g.role >> g.function >> g.copies >> g.threshold >> g.tau >> g.field >> g.q1 >> g.q2 >> g.qwidth >> g.sign >> g.mode >> g.pace >> g.modulator >> g.crossing >> g.range >> g.organ >> g.open >> g.initial_strength >> g.spread_expression >> g.spread_identity_role >> g.spread_identity1 >> g.spread_identity2 >> g.spread_identity3 >> g.spread_identity4 >> g.spread_capacity >> g.spread_threshold >> g.spread_time_constant >> g.spread_field_width >> g.spread_quality1 >> g.spread_quality2 >> g.spread_quality_width >> g.spread_sender1 >> g.spread_sender2 >> g.spread_receiver1 >> g.spread_receiver2 >> g.spread_search_width >> g.spread_crossing >> g.spread_range >> g.spread_synapse_strength);
}
template <typename Receptor>
bool read_receptor(std::istream &input, Receptor &r, int &active) {
  return bool(input >> active >> r.baseline >> r.sensitivity >> r.half >> r.substance >> r.width >> r.steepness >> r.spread_capacity >> r.spread_field_width >> r.spread_threshold >> r.spread_time_constant >> r.spread_quality1 >> r.spread_quality2 >> r.spread_quality_width);
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
  out << ",\"initial_strength\":" << value.initial_strength;
  out << ",\"spread_expression\":" << value.spread_expression;
  out << ",\"spread_identity_role\":" << value.spread_identity_role;
  out << ",\"spread_identity1\":" << value.spread_identity1;
  out << ",\"spread_identity2\":" << value.spread_identity2;
  out << ",\"spread_identity3\":" << value.spread_identity3;
  out << ",\"spread_identity4\":" << value.spread_identity4;
  out << ",\"spread_capacity\":" << value.spread_capacity;
  out << ",\"spread_threshold\":" << value.spread_threshold;
  out << ",\"spread_time_constant\":" << value.spread_time_constant;
  out << ",\"spread_field_width\":" << value.spread_field_width;
  out << ",\"spread_quality1\":" << value.spread_quality1;
  out << ",\"spread_quality2\":" << value.spread_quality2;
  out << ",\"spread_quality_width\":" << value.spread_quality_width;
  out << ",\"spread_sender1\":" << value.spread_sender1;
  out << ",\"spread_sender2\":" << value.spread_sender2;
  out << ",\"spread_receiver1\":" << value.spread_receiver1;
  out << ",\"spread_receiver2\":" << value.spread_receiver2;
  out << ",\"spread_search_width\":" << value.spread_search_width;
  out << ",\"spread_crossing\":" << value.spread_crossing;
  out << ",\"spread_range\":" << value.spread_range;
  out << ",\"spread_synapse_strength\":" << value.spread_synapse_strength;
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
  out << ",\"spread_capacity\":" << value.spread_capacity;
  out << ",\"spread_field_width\":" << value.spread_field_width;
  out << ",\"spread_threshold\":" << value.spread_threshold;
  out << ",\"spread_time_constant\":" << value.spread_time_constant;
  out << ",\"spread_quality1\":" << value.spread_quality1;
  out << ",\"spread_quality2\":" << value.spread_quality2;
  out << ",\"spread_quality_width\":" << value.spread_quality_width;
  out << "}";
}
}
