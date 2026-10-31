// Baukasten für v019-Zell-CPPNs: Anlagen = Bereiche fester Plätze mit festen Ausgabewerten.
#pragma once
#include "founders.hh"
#include "ecology_internal.hh"
#include "cppn/cppn.hh"
#include <cmath>
#include <cstdio>
#include <functional>
#include <map>
#include <string>
#include <vector>
namespace bau {
using namespace fishsim;
using evolution::NodeType;
namespace out = cppn::output;
// Eingänge des Zell-CPPN.
enum Input { Z0 = 0, Z1, Z2, Z3, U, V, W, SIDE, EFFECT, BIAS };
// Rollen, Ecken und Werte einer Anlage.
struct Range {
  double lo = -1e9, hi = 1e9;
};
struct Anlage {
  std::string name;
  int zone = 0;
  Range u, v, w;
  int side = 0;                         // 0 beide, -1 links, +1 rechts
  std::map<std::size_t, double> values; // Ausgang -> Wert
  // Hormonrezeptoren: Wirkung (0..6) -> {Grundwert, Empfindlichkeit, q1, q2, Breite, Schwelle}
  std::map<int, std::array<double, 6>> receptors;
};
inline Range any() {
  return {};
}
inline Range at(double x) {
  return {x - .01, x + .01};
}
inline Range from(double x) {
  return {x - .01, 1e9};
}
inline Range upto(double x) {
  return {-1e9, x + .01};
}
inline Range between(double a, double b) {
  return {a - .01, b + .01};
}
// Rollenwerte
constexpr double SENSOR = -1, NERVE = 0, EFFECTOR = 1;
// Ecke 0..3 -> identity1/identity2
inline std::pair<double, double> corner(int k) {
  return {k & 1 ? 1. : -1., k & 2 ? 1. : -1.};
}
struct Builder {
  std::shared_ptr<evolution::History> history;
  std::shared_ptr<evolution::Genome> g;
  int next = cppn::INPUTS + cppn::OUTPUTS;
  std::map<std::pair<int, int>, double> edges; // (from, to) -> weight, port 0
  std::vector<std::tuple<int, int, double, int>> ported;
  std::map<std::tuple<int, double, bool>, int> conditions;
  explicit Builder(std::shared_ptr<evolution::History> h) : history(h) {
    g = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS, history);
    for (int i = 0; i < next; ++i)
      g->add_node({i, 1, NodeType::LINEAR});
  }
  int node(NodeType type, float parameter) {
    const int id = next++;
    g->add_node({id, parameter, type});
    return id;
  }
  void link(int from, int to, double w) { edges[{from, to}] += w; }
  int output(std::size_t k) const { return cppn::INPUTS + int(k); }
  // SIGN(x - t) für x > t (greater) bzw. SIGN(t - x): +1 erfüllt, -1 sonst.
  int condition(int input, double t, bool greater) {
    auto key = std::make_tuple(input, t, greater);
    auto it = conditions.find(key);
    if (it != conditions.end())
      return it->second;
    const int n = node(NodeType::SIGN, float(greater ? -t : t));
    link(input, n, greater ? 1 : -1);
    return conditions[key] = n;
  }
  // Bereichsanzeiger: +1 innerhalb, -1 außerhalb.
  int region(const Anlage &a) {
    std::vector<int> parts;
    auto range = [&](int input, Range r) {
      if (r.lo > -1e8)
        parts.push_back(condition(input, r.lo, true));
      if (r.hi < 1e8)
        parts.push_back(condition(input, r.hi, false));
    };
    range(U, a.u);
    range(V, a.v);
    range(W, a.w);
    if (a.side)
      parts.push_back(condition(SIDE, 0, a.side > 0));
    const int n = node(NodeType::SIGN, float(-(double(parts.size()) + 1.5)));
    for (int p : parts)
      link(p, n, 1);
    link(Z0 + a.zone, n, 2);
    return n;
  }
  // Abfrageart: 1 bei der Zellabfrage, 0 bei Rezeptorabfragen; Rezeptor e: 1 genau für Wirkung e.
  int is_cell = -1;
  int cell_query() {
    if (is_cell >= 0)
      return is_cell;
    const int sign = node(NodeType::SIGN, 1.f / 14);
    link(EFFECT, sign, -1);
    is_cell = node(NodeType::LINEAR, 1);
    link(sign, is_cell, .5);
    link(BIAS, is_cell, .5);
    return is_cell;
  }
  std::map<int, int> effect_nodes;
  int effect_query(int effect) {
    auto it = effect_nodes.find(effect);
    if (it != effect_nodes.end())
      return it->second;
    const int distance = node(NodeType::ABS, -float(1 + effect) / 7),
              selection = node(NodeType::SIGN, 1.f / 28), enabled = node(NodeType::LINEAR, 1);
    link(EFFECT, distance, 1);
    link(distance, selection, -1);
    link(selection, enabled, .5);
    link(BIAS, enabled, .5);
    return effect_nodes[effect] = enabled;
  }
  // Ausgabe = Summe über Anlagen (nicht überlappend) plus Grundwert.
  std::map<std::size_t, std::vector<std::pair<int, double>>> terms; // Ausgang -> (Anzeiger, Wert)
  std::map<std::size_t, double> base;
  void add(const Anlage &a) {
    const int r = region(a);
    for (auto [k, v] : a.values)
      terms[k].push_back({r, v});
    for (auto &[effect, rec] : a.receptors) {
      // Rezeptorwerte nur bei der Abfrage dieser Wirkung und nur an diesen Plätzen.
      const int sel = effect_query(effect);
      const int inside = node(NodeType::LINEAR, 1);
      link(r, inside, .5);
      link(BIAS, inside, .5);
      const std::size_t outs[6] = {out::capacity, out::field_width,   out::quality1,
                                   out::quality2, out::quality_width, out::threshold};
      for (int j = 0; j < 6; ++j) {
        if (rec[j] == 0)
          continue;
        const int gate = node(NodeType::TOR, 1);
        ported.push_back({inside, gate, rec[j], 0});
        ported.push_back({sel, gate, 1, 1});
        receptor_terms[outs[j]].push_back(gate);
      }
    }
  }
  std::map<std::size_t, std::vector<int>> receptor_terms;
  void finish() {
    const int cell = cell_query(), output_receptor = effect_query(5);
    for (std::size_t k = 0; k < std::size_t(cppn::OUTPUTS); ++k) {
      const double b = base.count(k) ? base[k] : (k == out::expression ? -1 : 0);
      // Rezeptorabfragen lesen diese Ausgänge; dort zählen nur die Rezeptorwerte.
      const bool gated = k == out::capacity || k == out::field_width || k == out::quality1 ||
                         k == out::quality2 || k == out::quality_width || k == out::threshold;
      int target = output(k);
      int raw = target;
      if (gated) {
        raw = node(NodeType::LINEAR, 1);
        const int gate = node(NodeType::TOR, 1);
        ported.push_back({raw, gate, 1, 0});
        ported.push_back({cell, gate, 1, 1});
        link(gate, target, 1);
      }
      double constant = b;
      for (auto [r, v] : terms[k]) {
        // (r + 1) / 2 * (v - b)
        link(r, raw, (v - b) / 2);
        constant += (v - b) / 2;
      }
      link(BIAS, raw, constant);
      for (int gate : receptor_terms[k])
        link(gate, target, 1);
    }
    // Ausgaberezeptoren: Grundwert 1 überall (neutral).
    link(output_receptor, output(out::capacity), 1);
    for (auto &[e, w] : edges)
      if (w != 0)
        g->connect(e.first, e.second, float(w));
    for (auto &[from, to, w, port] : ported)
      g->connect(from, to, float(w), port);
    g->validate();
  }
};
// Fertiges Genom.
inline Genome genome(Builder &b, std::uint64_t seed) {
  Genome result;
  result.cppn = b.g;
  result.development_seed = seed;
  result.variation_seed = seed * 7 + 1;
  return result;
}
}
