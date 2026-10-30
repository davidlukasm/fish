#include "test_support.hh"
#include "founders.hh"
#include <filesystem>
#include <set>
using namespace test;
int main() {
  try {
    Rng random(1919);
    std::set<int> widths;
    int asymmetric = 0;
    for (int i = 0; i < 32; ++i) {
      auto g = Genome::pool_randomized(random);
      g.cppn->validate();
      widths.insert(g.cppn->nodes());
      int sides = 0;
      for (const auto &e : g.cppn->get_connection_genes())
        sides += e.get_enabled() && e.get_source() == 7;
      check(sides <= 1, "a fresh design has at most one lateral edge, on either port");
      asymmetric += sides > 0;
    }
    check(widths.size() > 4 && asymmetric > 0 && asymmetric < 32,
          "random pool spans sizes and lateral symmetry");
    auto g = Genome::load("genomes/cppn-start.genome");
    auto variant = g;
    variant.begin_individual(random);
    check(same_founder_design(g, variant), "individual variation does not alter inherited design");
    variant.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    variant.cppn->observe_work(4, 1, .2, 0, 1);
    check(same_founder_design(g, variant), "mutation statistics do not alter founder identity");
    ++variant.development_seed;
    check(!same_founder_design(g, variant), "development seed belongs to design");
    // Shipped v019 example classes, once present, grow viable, hatchable bodies.
    if (std::filesystem::is_directory("genomes/futtersammler"))
      for (const auto &entry : std::filesystem::directory_iterator("genomes/futtersammler"))
        if (entry.path().extension() == ".genome") {
          auto example = Genome::load(entry.path().string());
          check(viable_entrant(example) && hatch_candidate(example),
                "every example class is viable");
        }
    std::cout << "Startgenome: Vielfalt, Identität und Beispielklassen: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
