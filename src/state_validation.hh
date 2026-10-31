#pragma once
#include "genome.hh"
#include <istream>
#include <stdexcept>
namespace fishsim::state {
template <class T> void value(std::istream &in, T &v) {
  if (!(in >> v))
    throw std::runtime_error("incomplete aquarium state");
}
inline void scalar(std::istream &in, double &v, double lo, double hi) {
  value(in, v);
  if (!std::isfinite(v) || v < lo || v > hi)
    throw std::runtime_error("invalid aquarium value " + std::to_string(v) + " outside " +
                             std::to_string(lo) + ".." + std::to_string(hi));
}
inline void scalar(std::istream &in, float &v, double lo, double hi) {
  double number;
  scalar(in, number, lo, hi);
  v = float(number);
}
inline bool same_options(const field::Options &a, const field::Options &b) {
  return a.bias_scale == b.bias_scale && a.max_nodes == b.max_nodes && a.max_edges == b.max_edges;
}
inline bool same_development(const Genome &a, const Genome &b) {
  return a.cppn == b.cppn && a.development_seed == b.development_seed &&
         a.variation_seed == b.variation_seed && a.mutation_step == b.mutation_step &&
         same_options(a.development_options, b.development_options);
}
inline std::size_t count(std::istream &in, std::size_t maximum) {
  std::size_t size;
  value(in, size);
  if (size > maximum)
    throw std::runtime_error("aquarium count exceeds resource budget");
  return size;
}
inline Genome genome(std::istream &in, std::vector<Genome> &genes, bool develop) {
  auto id = count(in, genes.size());
  if (id >= genes.size())
    throw std::runtime_error("invalid genome reference");
  if (develop && !genes[id].blueprint)
    genes[id].compile(false);
  return genes[id];
}
}
