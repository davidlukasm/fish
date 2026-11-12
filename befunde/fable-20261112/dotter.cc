// Diagnose (Fable): je Fisch alle 50 Schritte Reserve, Dotter, Einlagerung. Liest nur.
#include "ecology.hh"
#include "physiology.hh"
#include <iostream>
#include <map>
using namespace fishsim;
int main(int argc, char **argv) {
  const auto seed = std::stoull(argv[2]);
  const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]);
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::map<std::uint64_t, double> yolk, moved;
  std::cout << "t\tid\tg\tmaturity\tenergy\tcapacity\tyolk\tlimit\tmoved50\tgut\thealth\n";
  for (int t = 0; t < steps && !w.fish.empty(); ++t) {
    w.tick();
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !b.hatched)
        continue;
      const double y = b.reproduction().egg_yolk;
      if (y > yolk[p.id])
        moved[p.id] += y - yolk[p.id];
      yolk[p.id] = y;
      if (w.ticks % 50 == 0) {
        std::cout << w.ticks << '\t' << p.id << '\t' << p.g << '\t' << body_maturity(b) << '\t'
                  << b.energy << '\t' << reserve_capacity(b) << '\t' << y << '\t'
                  << b.reproduction().egg_limit << '\t' << moved[p.id] << '\t' << gut_filling(b)
                  << '\t' << b.health << '\n';
        moved[p.id] = 0;
      }
    }
  }
}
