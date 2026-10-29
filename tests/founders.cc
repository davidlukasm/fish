#include "test_support.hh"
#include "founder_pool.hh"
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
    FounderPool pool;
    pool.load(true);
    check(!pool.entries.empty(), "experimental fork retains comparison genotypes");
    for (const auto &entry : pool.entries) {
      check(viable_entrant(entry.genome) && (!entry.measured || entry.hatching.passed()),
            "admitted founders carry an actual hatch measurement");
    }
    Rng random(18019);
    check(pool.select(random, 1000).size() == std::size_t(pool.ready()),
          "only measured hatching genomes can seed the tank");
    auto unmeasured = std::find_if(pool.entries.begin(), pool.entries.end(),
                                   [](const auto &e) { return !e.measured; });
    check(unmeasured != pool.entries.end(), "comparison archive remains available");
    const std::vector<Genome> selected{unmeasured->genome};
    auto variant = selected.front();
    variant.begin_individual(random);
    check(same_founder_design(selected.front(), variant),
          "individual variation does not create a new inherited design");
    ++variant.development_seed;
    check(!same_founder_design(selected.front(), variant),
          "inherited development seed is part of the design");
    FounderPool offered;
    check(!offered.offer({selected.front(), 0, "unmeasured", ""}),
          "anatomy alone cannot admit a founder without a measured hatch");
    check(!offered.offer(*unmeasured),
          "unmeasured comparison genotype cannot be admitted as tested");
    auto eligible = std::find_if(pool.entries.begin(), pool.entries.end(),
                                 [](const auto &e) { return hatch_candidate(e.genome); });
    check(eligible != pool.entries.end(), "pool contains a body with secretion and movement");
    auto hatch_only = *eligible;
    hatch_only.hatching = {3, 1, 300};
    check(!offered.offer(hatch_only), "a hatch alone cannot certify a sustainable founder");
    hatch_only.reproduction.funded = hatch_only.reproduction.hatched =
        hatch_only.reproduction.feeding = hatch_only.reproduction.parents_feeding = 1;
    hatch_only.reproduction.digested = 1;
    check(offered.offer(hatch_only), "complete lifecycle measurements admit a founder");
    check(offered.select(random, 4).size() == 1, "only admitted hatching lines seed tanks");
    auto measured = *unmeasured;
    std::atomic<bool> stop{false};
    const bool completed = assess_founder_foraging(measured, stop);
    auto repeated = *unmeasured;
    check(assess_founder_foraging(repeated, stop) == completed &&
              std::abs(measured.foraging.score - repeated.foraging.score) < 1e-6 &&
              measured.foraging.eaten == repeated.foraging.eaten,
          "current model evaluations reproduce independently");
    stop = true;
    const auto interrupted = founder_foraging(selected.front(), -1, stop);
    check(interrupted.score == 0 && interrupted.samples == 0,
          "cancelled evaluation cannot publish a score");

    const auto path = std::filesystem::temp_directory_path() /
                      ("fish-model19-pool-" +
                       std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    struct Cleanup {
      std::filesystem::path path;
      ~Cleanup() { std::filesystem::remove_all(path); }
    } cleanup{path};
    FounderPool saved(path);
    saved.entries = pool.entries;
    saved.save();
    FounderPool restored(path);
    restored.load(false);
    check(restored.entries.size() == pool.entries.size(), "pool roundtrip preserves all entries");
    for (std::size_t i = 0; i < pool.entries.size(); ++i) {
      const auto &a = pool.entries[i], &b = restored.entries[i];
      check(same_founder_design(a.genome, b.genome) && a.foraging.score == b.foraging.score &&
                a.foraging.speed == b.foraging.speed && a.foraging.turn == b.foraging.turn &&
                a.foraging.eaten == b.foraging.eaten && a.foraging.samples == b.foraging.samples &&
                a.sense_foraging == b.sense_foraging && a.structure == b.structure &&
                a.reproduction.diet == b.reproduction.diet &&
                a.reproduction.raw_diet == b.reproduction.raw_diet &&
                a.reproduction.feeding == b.reproduction.feeding &&
                a.hatching.attempted == b.hatching.attempted &&
                a.hatching.hatched == b.hatching.hatched && a.hatching.steps == b.hatching.steps &&
                a.hatching.built == b.hatching.built &&
                a.hatching.secreted == b.hatching.secreted &&
                a.hatching.contracted == b.hatching.contracted &&
                a.hatching.dead == b.hatching.dead &&
                a.hatching.min_energy == b.hatching.min_energy &&
                a.hatching.min_health == b.hatching.min_health,
            "genes and measured movement, diet and offspring survive pool persistence");
    }
    // Fixed candidate stream makes the interruption check independent of machine entropy.
    {
      std::ofstream checkpoint(path / "search.state");
      checkpoint << "FISH_FOUNDER_SEARCH 0 0 0 0\n" << Rng(18029).engine << '\n';
    }
    restored.restore_search();
    stop = false;
    const int before = restored.searched();
    restored.search(
        1, stop,
        [&](int checked, int) {
          if (checked > before)
            stop = true;
        },
        0, 2);
    check(restored.searched() == before + 1, "interruption keeps completed candidate progress");
    FounderPool resumed(path);
    resumed.load(false);
    resumed.restore_search();
    check(resumed.searched() == restored.searched() &&
              resumed.entries.size() == restored.entries.size(),
          "completed results survive interruption and reopening");
    std::cout << "Founder-Pool: aktuelle Modelle, Aufnahme, Auswahl, Abbruch und Speicherung: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
