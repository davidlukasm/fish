// mix SEED STEPS POP FOOD THREADS GENOME... [key=value]: one aquarium with all founders mixed,
// report per line.
#include "founders.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include <chrono>
#include <cstdio>
#include <map>
#include <set>
using namespace fishsim;
int main(int argc, char **argv) {
  if (argc < 7) {
    std::fprintf(stderr, "Aufruf: tank SEED STEPS POP FOOD THREADS GENOME... [key=value]\n");
    return 2;
  }
  const std::uint64_t seed = std::stoull(argv[1]);
  const int steps = std::stoi(argv[2]), pop = std::stoi(argv[3]), food = std::stoi(argv[4]);
  if (argc > 6)
    Genome::adopt_run(Genome::load(argv[6]));
  Ecosystem world(seed);
  world.workers = std::stoi(argv[5]);
  std::vector<std::pair<std::string, double>> params;
  std::vector<std::string> paths, names;
  for (int a = 6; a < argc; ++a) {
    std::string kv = argv[a];
    auto e = kv.find('=');
    if (e == std::string::npos) {
      paths.push_back(kv);
      continue;
    }
    params.push_back({kv.substr(0, e), std::stod(kv.substr(e + 1))});
  }
  auto apply = [&] {
    for (auto &[k, v] : params)
      if (!world.set_parameter(k, v)) {
        std::fprintf(stderr, "?%s\n", k.c_str());
        std::exit(2);
      }
  };
  apply();
  std::vector<Genome> chosen;
  std::atomic<bool> stop{false};
  std::map<std::size_t, int> by_sig;
  auto sig = [](const Genome &g) -> std::size_t {
    if (!g.blueprint || !g.interface || !g.cppn)
      return 0;
    double w = 0;
    for (const auto &e : g.cppn->get_connection_genes())
      if (e.get_enabled())
        w += e.get_weight() * (1 + e.get_source() % 7) + e.get_target();
    return std::size_t(std::llround(std::abs(w) * 1000)) * 1000 +
           g.cppn->get_connection_genes().size();
  };
  for (const auto &path : paths) {
    auto g = Genome::load(path);
    develop_entrant(g, stop);
    std::string n = path.substr(path.rfind('/') + 1);
    n = n.substr(0, n.find('.'));
    if (!viable_entrant(g)) {
      std::printf("%s nicht lebensfähig\n", n.c_str());
      continue;
    }
    world.add_pool_founder(g);
    std::printf("%s signatur %zu\n", n.c_str(), sig(g));
    if (by_sig.count(sig(g)))
      std::printf("Signatur doppelt: %s\n", n.c_str());
    by_sig[sig(g)] = int(chosen.size());
    chosen.push_back(g);
    names.push_back(n);
  }
  const int L = int(chosen.size());
  world.starter_world();
  world.seed(chosen, pop, food, {}, {}, apply, true);
  std::map<std::uint64_t, int> line_of;
  struct Stat {
    long hatches = 0, deaths_hatched = 0;
    double life = 0;
  };
  std::vector<Stat> st(L + 1);
  std::map<std::uint64_t, long> hatch_at;
  std::set<std::uint64_t> alive_prev;
  auto line = [&](const Individual &p) {
    auto it = line_of.find(p.id);
    if (it != line_of.end())
      return it->second;
    int l = L;
    if (p.parent && line_of.count(p.parent))
      l = line_of[p.parent];
    else if (!p.genome.blueprint || !p.genome.interface)
      return L;
    else {
      auto c = by_sig.find(sig(p.genome));
      if (c != by_sig.end())
        l = c->second;
    }
    line_of[p.id] = l;
    return l;
  };
  for (auto &p : world.fish)
    line(p);
  auto t0 = std::chrono::steady_clock::now();
  for (int s = 1; s <= steps; ++s) {
    world.tick(true, false);
    std::set<std::uint64_t> now;
    for (auto &p : world.fish) {
      if (!p.body.alive)
        continue;
      int l = line(p);
      now.insert(p.id);
      if (p.body.hatched && !hatch_at.count(p.id)) {
        hatch_at[p.id] = s;
        ++st[l].hatches;
      }
    }
    for (auto id : alive_prev)
      if (!now.count(id) && hatch_at.count(id)) {
        int l = line_of[id];
        ++st[l].deaths_hatched;
        st[l].life += s - hatch_at[id];
        hatch_at.erase(id);
      }
    alive_prev.swap(now);
    if (s % 1000 == 0 || s == steps) {
      const auto &m = world.metrics();
      const double sec =
          std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      int total = 0;
      for (auto &p : world.fish)
        total += p.body.alive;
      std::printf("t %d fish %d rescues %llu eggs %llu nutrient %llu eaten %llu | %.0fs\n", s,
                  total, (unsigned long long)m.rescues, (unsigned long long)m.released_eggs,
                  (unsigned long long)m.nutrient_eggs, (unsigned long long)m.eggs_eaten, sec);
      for (int l = 0; l <= L; ++l) {
        int eggs = 0, hatched = 0, nat = 0;
        unsigned maxg = 0;
        double tissue = 0, dig = 0;
        std::array<double, 11> rd{};
        for (auto &p : world.fish) {
          if (!p.body.alive || line(p) != l)
            continue;
          if (!p.body.hatched) {
            ++eggs;
            continue;
          }
          ++hatched;
          tissue += p.body.tissue;
          dig += p.body.digested;
          for (int k = 0; k < 11; ++k)
            rd[k] += p.observations().raw_diet[k];
          if (p.origin == 1) {
            ++nat;
            maxg = std::max(maxg, p.g);
          }
        }
        if (l == L && !eggs && !hatched && !st[l].hatches)
          continue;
        {
          double dgs = 0, e = 0, mv = 0, br = 0, mu = 0, dg = 0, sp = 0, gut = 0, rad = 0;
          int n = 0;
          for (auto &p : world.fish)
            if (p.body.alive && p.body.hatched && line(p) == l) {
              ++n;
              e += p.body.energy;
              mv += p.body.ledger().movement_cost;
              br += p.body.ledger().brain_cost;
              mu += p.body.ledger().muscle_cost;
              dg += p.body.digestion;
              sp += p.body.motor().speed;
              gut += p.body.gut_fill;
              rad += body_radius(p.body);
              dgs += p.body.digested;
            }
          if (n)
            std::printf("      energie %.1f verdauung %.4f bewegung %.4f gehirn %.4f muskel %.4f "
                        "tempo %.2f darm %.2f radius %.2f verdaut %.1f\n",
                        e / n, dg / n, mv / n, br / n, mu / n, sp / n, gut / n, rad / n, dgs / n);
        }
        std::printf("  %-14s fische %3d (natürlich %3d, maxg %2u) eier %3d | gewebe %5.1f | "
                    "geschlüpft %4ld gestorben %4ld mittl. leben %5.0f\n",
                    l < L ? names[l].c_str() : "?", hatched, nat, maxg, eggs,
                    hatched ? tissue / hatched : 0., st[l].hatches, st[l].deaths_hatched,
                    st[l].deaths_hatched ? st[l].life / st[l].deaths_hatched : 0.);
        {
          double t = 0;
          for (double v : rd)
            t += v;
          if (t > 0) {
            const char *dn[11] = {"Fu", "Fi", "Ei", "Aa", "Al", "Bl", "Kr", "Wu", "Kb", "Mu", "Bo"};
            std::printf("      kost");
            for (int k = 0; k < 11; ++k)
              if (rd[k] > .005 * t)
                std::printf(" %s %.0f%%", dn[k], 100 * rd[k] / t);
            std::printf("\n");
          }
        }
      }
      const char *dn[11] = {"Futter",    "Fisch",   "Eier",    "Aas",      "Algen", "Blatt",
                            "Krebschen", "Wuermer", "Krabben", "Muscheln", "Boden"};
      double tot = 0;
      for (int k = 0; k < 11; ++k)
        tot += m.performance_total.diet[k];
      std::printf("  nahrung");
      for (int k = 0; k < 11; ++k)
        if (m.performance_total.diet[k] > 0)
          std::printf(" %s:%.0f%%", dn[k], 100 * m.performance_total.diet[k] / std::max(1e-9, tot));
      std::printf(" | ursachen");
      for (int c = 0; c < 8; ++c)
        std::printf(" %d:%llu", c, (unsigned long long)m.death_causes[c]);
      std::printf("\n");
      std::fflush(stdout);
    }
  }
  if (const char *dir = std::getenv("SAVE")) {
    for (int l = 0; l < L; ++l) {
      const Individual *best = nullptr;
      for (auto &p : world.fish)
        if (p.body.alive && p.body.hatched && p.origin == 1 && line(p) == l &&
            (!best || p.g > best->g || (p.g == best->g && p.body.tissue > best->body.tissue)))
          best = &p;
      if (best) {
        std::string path =
            std::string(dir) + "/" + names[l] + "-g" + std::to_string(best->g) + ".genome";
        best->genome.save(path);
        std::printf("gespeichert %s\n", path.c_str());
      }
    }
  }
}
