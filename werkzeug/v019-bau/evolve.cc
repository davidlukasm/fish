// evolve BASE OUT GENERATIONS [SEED]: (mu+lambda)-Auslese auf Futteraufnahme in kleinen Arenen.
// Fitness = aufgenommene Nährwerte über mehrere Futterlagen; Tod oder Nichtschlüpfen = -1.
#include "founder_pool.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include <algorithm>
#include <cstdio>
#include <mutex>
#include <thread>
using namespace fishsim;
namespace {
double env(const char *n, double f) {
  const char *v = std::getenv(n);
  return v ? std::atof(v) : f;
}
struct Scored {
  Genome g;
  double fitness = -1, eaten = 0, bites = 0;
};
std::unique_ptr<Ecosystem> hatch(const Genome &genome) {
  auto arena = std::make_unique<Ecosystem>(187);
  arena->resize(615, 410);
  arena->safety = false;
  arena->field.flow = arena->field.gravity = 0;
  arena->field.set_energy_supply(0);
  arena->food_burst.strength = arena->mutation_burst.strength = 0;
  arena->evo.mutation = 0;
  const auto energy = funded_egg_energy(genome, arena->physiology().neural_cost, arena->evo.yolk);
  if (!energy || !arena->spawn(genome, 300, 205, 0, 0, 0, *energy)) {
    if (std::getenv("WHY")) std::printf("  kein ei\n");
    return {};
  }
  for (int t = 0; t < 4000 && !arena->fish.empty() && !arena->fish[0].body.hatched; ++t)
    arena->tick();
  if (arena->fish.empty() || !arena->fish[0].body.hatched) {
    if (std::getenv("WHY")) std::printf("  nicht geschlüpft: fische %zu lebt %d alter %d energie %.1f ei %.1f ursache %d\n", arena->fish.size(), arena->fish.empty() ? -1 : int(arena->fish[0].body.alive), arena->fish.empty() ? -1 : arena->fish[0].body.age, arena->fish.empty() ? 0. : arena->fish[0].body.energy, *energy, arena->fish.empty() ? -9 : arena->fish[0].body.fatal_cause);
    return {};
  }
  const double e0 = arena->fish[0].body.energy;
  // Eingewöhnung ohne Futter, damit die Anpassung der Zellen abklingt.
  for (int t = 0; t < 400 && !arena->fish.empty(); ++t)
    arena->tick();
  if (arena->fish.empty() || !arena->fish[0].body.alive) {
    if (std::getenv("WHY")) std::printf("  in der Eingewöhnung gestorben\n");
    return {};
  }
  if (std::getenv("WHY")) std::printf("  energie beim Schlupf %.1f nach Eingewöhnung %.1f (%.3f/Schritt) gewebe %.1f\n", e0, arena->fish[0].body.energy, (e0 - arena->fish[0].body.energy) / 400, arena->fish[0].body.tissue);
  return arena;
}
void evaluate(Scored &s, int layouts, int steps) {
  std::atomic<bool> stop{false};
  try {
    develop_entrant(s.g, stop);
    if (!viable_entrant(s.g)) {
      if (std::getenv("WHY")) std::printf("  nicht lebensfähig\n");
      s.fitness = -1;
      return;
    }
    auto base = hatch(s.g);
    if (!base) {
      s.fitness = -1;
      return;
    }
    double total = 0, bites = 0;
    for (int k = 0; k < layouts; ++k) {
      auto arena = base->fork();
      const auto id = arena.fish[0].id;
      {
        auto &b = arena.fish[0].body;
        b.x = 300;
        b.y = 205;
        b.angle = k * 2.4;
      }
      Rng r(1000 + k);
      for (int j = 0; j < 10; ++j) {
        const double a = r.uniform(-PI, PI), d = r.uniform(25, 140), e = 25 + 95 * r.uniform() * r.uniform();
        place_trial_food(arena, 300 + d * std::cos(a), 205 + d * std::sin(a) * .8, e);
      }
      const double before = arena.fish[0].body.nutrition;
      const int cycle0 = arena.fish[0].body.mouth.cycle;
      double gained = 0;
      for (int t = 0; t < steps; ++t) {
        arena.tick();
        auto p = std::find_if(arena.fish.begin(), arena.fish.end(),
                              [&](const auto &p) { return p.id == id; });
        if (p == arena.fish.end() || !p->body.alive)
          break;
        gained = p->body.nutrition - before;
        bites = std::max(bites, double(p->body.mouth.cycle - cycle0));
      }
      total += gained;
    }
    s.eaten = total / layouts;
    s.bites = bites;
    s.fitness = s.eaten;
  } catch (const std::exception &e) {
    if (std::getenv("WHY")) std::printf("  ausnahme %s\n", e.what());
    s.fitness = -1;
  }
}
}
int main(int argc, char **argv) {
  auto base = Genome::load(argv[1]);
  Genome::adopt_run(base);
  const std::string out = argv[2];
  const int generations = std::atoi(argv[3]);
  Rng rng(argc > 4 ? std::stoull(argv[4]) : 7);
  const int mu = int(env("MU", 3)), lambda = int(env("LAMBDA", 6)), layouts = int(env("LAYOUTS", 3)),
            steps = int(env("STEPS", 900)), threads = int(env("THREADS", 2));
  const double scale = env("SCALE", 1);
  std::vector<Scored> parents(1);
  parents[0].g = base;
  evaluate(parents[0], layouts, steps);
  std::printf("start fitness %.2f bisse %.0f\n", parents[0].fitness, parents[0].bites);
  std::fflush(stdout);
  for (int gen = 1; gen <= generations; ++gen) {
    std::vector<Scored> kids(lambda);
    for (int k = 0; k < lambda; ++k) {
      kids[k].g = parents[k % parents.size()].g;
      kids[k].g.discard_development();
      kids[k].g.mutate(rng, scale, false);
    }
    std::vector<std::thread> pool;
    std::mutex m;
    int next = 0;
    for (int t = 0; t < threads; ++t)
      pool.emplace_back([&] {
        for (;;) {
          int k;
          {
            std::lock_guard<std::mutex> l(m);
            k = next++;
          }
          if (k >= lambda)
            return;
          evaluate(kids[k], layouts, steps);
        }
      });
    for (auto &t : pool)
      t.join();
    for (auto &k : kids)
      parents.push_back(std::move(k));
    std::stable_sort(parents.begin(), parents.end(),
                     [](const Scored &a, const Scored &b) { return a.fitness > b.fitness; });
    parents.resize(std::min<std::size_t>(mu, parents.size()));
    std::printf("gen %d beste %.2f %.2f %.2f bisse %.0f\n", gen, parents[0].fitness,
                parents.size() > 1 ? parents[1].fitness : 0., parents.size() > 2 ? parents[2].fitness : 0.,
                parents[0].bites);
    std::fflush(stdout);
    parents[0].g.save(out);
  }
}
