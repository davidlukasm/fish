#include "test_support.hh"
#include "founders.hh"
#include <filesystem>
#include <set>
using namespace test;
void genotype_comparison(const Genome &g) {
  check(g.same_genes(g), "a shared genotype compares equal");
  for (bool reverse : {false, true}) {
    auto copy = g;
    copy.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    if (reverse) {
      copy.cppn = std::make_shared<evolution::Genome>(g.cppn->inputs(), g.cppn->outputs(),
                                                      g.cppn->history());
      const auto &nodes = g.cppn->get_node_genes();
      const auto &edges = g.cppn->get_connection_genes();
      for (auto i = nodes.rbegin(); i != nodes.rend(); ++i)
        copy.cppn->add_node(*i);
      for (auto i = edges.rbegin(); i != edges.rend(); ++i)
        copy.cppn->add_connection(*i);
    }
    check(g.same_genes(copy) && copy.same_genes(g),
          "equivalent copied or reordered genes compare equal in both directions");
    const auto n = g.cppn->get_node_genes().back();
    copy.cppn->edit_node(n.get_id(), n.get_weight() + .25f, n.get_type());
    check(!g.same_genes(copy) && !copy.same_genes(g),
          "changed node parameters differ even after reordering");
    copy.cppn->edit_node(n.get_id(), n.get_weight(), n.get_type());
    const auto e = g.cppn->get_connection_genes().back();
    copy.cppn->edit_connection(e.get_innovation_number(), e.get_weight() + .25f, e.get_enabled());
    check(!g.same_genes(copy) && !copy.same_genes(g),
          "changed connection parameters differ even after reordering");
    copy.cppn->edit_connection(e.get_innovation_number(), e.get_weight(), e.get_enabled());
    ++copy.variation_seed;
    check(g.same_genes(copy), "individual variation is separate from inherited genes");
    ++copy.development_seed;
    check(!g.same_genes(copy), "development seed belongs to genotype identity");
  }
}
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
    genotype_comparison(g);
    auto variant = g;
    variant.begin_individual(random);
    check(same_founder_design(g, variant), "individual variation does not alter inherited design");
    variant.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    variant.cppn->observe_work(4, 1, .2, 0, 1);
    check(same_founder_design(g, variant), "mutation statistics do not alter founder identity");
    auto changed = g;
    changed.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    const auto &edge = changed.cppn->get_connection_genes().front();
    changed.cppn->edit_connection(edge.get_innovation_number(),
                                  std::nextafter(edge.get_weight(), INFINITY), edge.get_enabled());
    check(!same_founder_design(g, changed), "even one float step changes inherited design");
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
