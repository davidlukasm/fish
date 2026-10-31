// inspect GENOME: v019 anatomy by zone/role/function and the wiring between functions.
#include "founders.hh"
#include "ecology_internal.hh"
#include <cstdio>
#include <map>
using namespace fishsim;
int main(int argc, char **argv) {
  if (argc != 2) {
    std::fprintf(stderr, "Aufruf: inspect GENOME\n");
    return 2;
  }
  auto g = Genome::load(argv[1]);
  std::atomic<bool> stop{false};
  develop_entrant(g, stop);
  if (!g.blueprint) {
    std::printf("keine Entwicklung\n");
    return 1;
  }
  const auto &s = *g.blueprint;
  const char *sense[] = {"Licht",   "Duft",        "Strömung",     "Tast",       "Nähe", "Aufnahme",
                         "Schaden", "Blasendruck", "Gonadendruck", "Innendruck", "Blut"};
  const char *motor[] = {"Schwanz", "Flosse",   "Pumpe",   "Eier",  "Sperma",
                         "Kiefer",  "Stacheln", "Pigment", "Blase", "Drüse"};
  auto name = [&](const field::Neuron &n) -> std::string {
    if (n.role == field::Role::Nerve)
      return "Nerv";
    for (int k = 0; k < 11; ++k)
      if (n.functions.senses[k] > 0)
        return std::string("S:") + sense[k];
    for (int k = 0; k < 10; ++k)
      if (n.functions.motors[k] > 0)
        return std::string("O:") + motor[k];
    return "?";
  };
  std::map<std::string, int> count;
  std::map<std::string, double> strength;
  for (const auto &n : s.neurons) {
    auto key = std::string("Z") + char('0' + n.location.zone) + " " + name(n);
    ++count[key];
    strength[key] += n.strength;
  }
  std::printf("zellen %zu synapsen %zu viable %d\n", s.neurons.size(), s.edges.size(),
              viable_entrant(g));
  for (auto &[k, c] : count)
    std::printf("  %-24s %4d  stärke %.2f\n", k.c_str(), c, strength[k]);
  std::map<std::pair<std::string, std::string>, std::pair<int, double>> wires;
  for (const auto &e : s.edges) {
    auto a = name(s.neurons[e.source]), b = name(s.neurons[e.target]);
    auto &w = wires[{a, b}];
    ++w.first;
    w.second += e.weight;
  }
  std::printf("verdrahtung (quelle -> ziel: anzahl, gewichtssumme)\n");
  for (auto &[k, v] : wires)
    std::printf("  %-16s -> %-16s %5d %8.2f\n", k.first.c_str(), k.second.c_str(), v.first,
                v.second);
  if (g.interface) {
    std::printf("organe:");
    for (auto v : g.interface->capacities)
      std::printf(" %.1f", v);
    std::printf("\nsinne:");
    for (auto v : g.interface->sense_counts)
      std::printf(" %d", int(v));
    std::printf("\n");
  }
}
