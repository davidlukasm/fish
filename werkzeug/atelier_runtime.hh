#pragma once
#include "atelier_compiler.hh"
#include "field/dynamics.hh"
#include <map>

namespace atelier {
struct NeuralContext {
  int development_steps = 256;
  float maturity = 0;
  field::Hormones hormones{};
};
inline NeuralContext read_neural_context(std::istream &in) {
  NeuralContext context;
  ensure(bool(in >> context.development_steps >> context.maturity) &&
             context.development_steps >= 0 &&
             context.development_steps <= studio_plan::max_development_steps &&
             between(context.maturity, 0, 1),
         "invalid neural context");
  for (auto &level : context.hormones)
    ensure(bool(in >> level) && between(float(level), 0, 1), "invalid neural hormone level");
  return context;
}
inline field::Network prepare_neural_preview(const fishsim::Genome &g, const NeuralContext &context,
                                             std::uint64_t identity) {
  field::Network network(g.blueprint, true);
  const std::vector<float> input(g.interface->sensory.size(), 0);
  for (int tick = 0; tick < context.development_steps; ++tick) {
    network.grow(context.hormones, context.maturity, 1e6);
    network.step(input, context.hormones, identity);
  }
  network.set_maturity(context.maturity);
  return network;
}
inline std::vector<int> neural_assignment(const field::Substrate &t,
                                          const std::vector<Group> &groups) {
  std::vector<int> assignment(t.neurons.size(), -1);
  for (std::size_t i = 0; i < t.neurons.size(); ++i)
    for (std::size_t k = 0; k < groups.size(); ++k)
      if (groups[k].contains(t.neurons[i].location)) {
        assignment[i] = int(k);
        break;
      }
  return assignment;
}
inline float neural_value(const field::Network &network, std::size_t i) {
  if (network.life(i) != field::Network::CellLife::Active)
    return 0;
  switch (network.blueprint().neurons[i].role) {
  case field::Role::Sensor:
    return network.signal(i);
  case field::Role::Effector:
    return network.organ_output()[i];
  default:
    return network.state()[i];
  }
}
inline void write_neural_runtime(std::ostream &out, const field::Network &network,
                                 const std::vector<int> &assignment, std::size_t groups,
                                 const NeuralContext &context, int elapsed) {
  std::vector<std::array<int, 3>> life(groups);
  std::vector<double> progress(groups), signal(groups), command(groups), cells(groups);
  for (std::size_t i = 0; i < assignment.size(); ++i)
    if (const int group = assignment[i]; group >= 0) {
      ++life[group][int(network.life(i))];
      progress[group] += network.development_progress(i);
      signal[group] += neural_value(network, i);
      command[group] += network.organ_output()[i];
      ++cells[group];
    }
  out << "{\"context\":{\"steps\":" << context.development_steps + elapsed
      << ",\"maturity\":" << context.maturity << ",\"hormones\":[";
  for (std::size_t i = 0; i < context.hormones.size(); ++i)
    out << (i ? "," : "") << context.hormones[i];
  out << "]},\"groups\":[";
  for (std::size_t i = 0; i < groups; ++i) {
    const double count = std::max(1., cells[i]);
    out << (i ? "," : "") << "{\"life\":[" << life[i][0] << ',' << life[i][1] << ',' << life[i][2]
        << "],\"development\":" << progress[i] / count << ",\"signal\":" << signal[i] / count
        << ",\"command\":" << command[i] / count << '}';
  }
  struct Bundle {
    int count = 0, positive = 0, negative = 0;
    double weight = 0, positive_weight = 0, negative_weight = 0;
  };
  std::map<std::pair<int, int>, Bundle> contacts;
  for (const auto &edge : network.synapses()) {
    const int from = assignment[edge.source], to = assignment[edge.target];
    if (from < 0 || to < 0)
      continue;
    auto &bundle = contacts[{from, to}];
    ++bundle.count;
    bundle.weight += edge.weight;
    if (edge.limit >= 0) {
      ++bundle.positive;
      bundle.positive_weight += edge.weight;
    } else {
      ++bundle.negative;
      bundle.negative_weight += edge.weight;
    }
  }
  out << "],\"contacts\":[";
  bool first = true;
  for (const auto &[key, b] : contacts) {
    out << (first ? "" : ",") << '[' << key.first << ',' << key.second << ',' << b.count << ','
        << b.weight / b.count << ',' << b.positive << ',' << b.negative << ','
        << (b.positive ? b.positive_weight / b.positive : 0) << ','
        << (b.negative ? b.negative_weight / b.negative : 0) << ']';
    first = false;
  }
  out << "],\"active\":" << network.active_count() << ",\"dead\":" << network.dead_count()
      << ",\"weightChange\":" << network.learning_summary().change
      << ",\"decay\":" << network.learning_summary().decay << '}';
}
}
