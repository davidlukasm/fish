#include "test_support.hh"
#include "founder_pool.hh"
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
    FounderReproduction r;
    r.trials = 3;
    r.successes = 1;
    check(!r.passed(), "one successful seed cannot certify a founder");
    r.successes = 2;
    check(r.passed(), "two of three real lifecycle trials required");
    auto path = std::filesystem::temp_directory_path() /
                ("fish-founder-check-" + std::to_string(random.engine()));
    struct Cleanup {
      std::filesystem::path p;
      ~Cleanup() { std::filesystem::remove_all(p); }
    } cleanup{path};
    FounderPool pool(path);
    PoolFounder measured;
    measured.genome = g;
    check(!pool.offer(measured), "anatomy and hatching alone are not a lifecycle certificate");
    measured.hatching = {3, 3, 200};
    check(!pool.offer(measured), "hatch-only result rejected");
    measured.reproduction = r;
    measured.reproduction.funded = measured.reproduction.hatched = measured.reproduction.feeding =
        2;
    measured.reproduction.diet[6] = 25;
    measured.reproduction.raw_diet[6] = 40;
    check(pool.offer(measured), "complete assay record accepted");
    pool.save();
    FounderPool restored(path);
    restored.load(false);
    check(restored.ready() == 1 && restored.entries[0].reproduction.successes == 2 &&
              restored.entries[0].reproduction.diet == measured.reproduction.diet,
          "current assay and genotype persist together");
    check(restored.select(random, 5).size() == 1, "selection only returns admitted designs");
    std::atomic<bool> stop{true};
    check(founder_reproduction(g, stop).trials == 0, "cancelled assay cannot publish success");
    std::cout << "Founder: variety, identity, lifecycle admission and persistence: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
