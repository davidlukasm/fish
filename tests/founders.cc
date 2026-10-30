#include "test_support.hh"
#include "founders.hh"
#include "ecology_internal.hh"
#include <chrono>
#include <filesystem>
#include <set>
#include <map>
#include <fstream>
using namespace test;
namespace {
void generated_designs() {
  Rng random(18029);
  std::set<std::array<int, cppn::output::branches>> shapes;
  bool marker_rules = false;
  for (int sample = 0; sample < 32; ++sample) {
    auto g = Genome::pool_randomized(random);
    g.cppn->validate();
    std::array<int, cppn::output::branches> widths{};
    std::map<int, std::vector<int>> upstream;
    std::set<int> live;
    for (const auto &n : g.cppn->get_node_genes()) {
      if (n.get_role() == evolution::NodeRole::Hidden)
        ++widths[n.get_branch()];
      if (n.get_role() == evolution::NodeRole::Output)
        live.insert(n.get_id());
    }
    for (const auto &edge : g.cppn->get_connection_genes()) {
      check(edge.get_enabled() && edge.get_weight() != 0, "initial edges carry an actual signal");
      const int source = edge.get_source();
      const auto *target = g.cppn->get_node(edge.get_target());
      if (source < cppn::INPUTS && target->get_branch() < 2)
        check(source == 1 || source == 5 || source == 10 || source == 11 || source == cppn::BIAS,
              "cell branches use distinct nonzero geometric inputs");
      if (source < cppn::INPUTS)
        check(source != 0 && source != 2 && source != 7,
              "initial symmetry is constructed without deleting paths");
      marker_rules |= source == cppn::MATCH || source == cppn::MATCH + 1;
      upstream[edge.get_target()].push_back(source);
    }
    std::vector<int> queue(live.begin(), live.end());
    for (std::size_t i = 0; i < queue.size(); ++i)
      for (int source : upstream[queue[i]])
        if (live.insert(source).second)
          queue.push_back(source);
    for (const auto &n : g.cppn->get_node_genes())
      if (n.get_role() == evolution::NodeRole::Hidden)
        check(live.count(n.get_id()), "every hidden node can affect an output");
    shapes.insert(widths);
  }
  check(shapes.size() > 16 && marker_rules,
        "initial population spans branch structures and directed marker rules");
}
}
int main() {
  try {
    generated_designs();
    BrainInterface anatomy;
    anatomy.mobile_reproductive = true;
    anatomy.capacities[4] = 1;
    check(!hatch_capable_anatomy(anatomy), "an egg organ cannot soften the embryo shell");
    anatomy.capacities[5] = 1;
    check(hatch_capable_anatomy(anatomy),
          "egg and secretion organs retain a possible reproductive body");
    anatomy.capacities[1] = anatomy.capacities[6] = 1;
    PhysiologyParameters physiology;
    check(founder_actuation_possible(anatomy, physiology),
          "possible actuation proceeds to real tests");
    anatomy.capacities[5] = .01;
    check(!founder_actuation_possible(anatomy, physiology),
          "even full secretion activation cannot reach its stroke threshold");
    physiology.stroke_threshold = .001;
    check(founder_actuation_possible(anatomy, physiology),
          "bounds use the trial's configured physiology");
    physiology.hatch_force_base = 10000;
    check(!founder_actuation_possible(anatomy, physiology),
          "even full force cannot overcome the weakest shell");
    // The shipped example classes grow viable, hatchable bodies.
    int examples = 0;
    for (const auto &entry : std::filesystem::directory_iterator("genomes/futtersammler"))
      if (entry.path().extension() == ".genome") {
        auto g = Genome::load(entry.path().string());
        check(viable_entrant(g) && hatch_candidate(g), "every example class is viable");
        ++examples;
      }
    check(examples == 7, "seven example classes are shipped");
    std::cout << "Startgenome: Zufallsentwürfe, Schlupfanlagen und Beispielklassen: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
