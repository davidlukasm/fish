// Diagnose (Fable): Fischwege, Blattlagen, Futter und Fressaktionen für ein Wegediagramm.
#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include <iostream>
using namespace fishsim;
int main(int argc, char **argv) {
  const auto seed = std::stoull(argv[2]);
  const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]), snap = std::stoi(argv[5]);
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::cout << "W\t" << w.field.geometry().width << '\t' << w.field.geometry().height << '\n';
  for (const auto &ob : w.field.geometry().obstacles) {
    std::cout << "O";
    for (const auto &v : ob.vertices)
      std::cout << '\t' << v.x << '\t' << v.y;
    if (ob.vertices.empty())
      std::cout << "\tC\t" << ob.x << '\t' << ob.y << '\t' << ob.radius;
    std::cout << '\n';
  }
  for (int t = 0; t <= steps; ++t) {
    if (t % snap == 0) {
      for (const auto &part : w.field.vegetation().plants)
        if (part.kind == food_kind::plant && part.energy > 0)
          std::cout << "L\t" << w.ticks << '\t' << part.x << '\t' << part.y << '\t' << part.hx
                    << '\t' << part.hy << '\t' << part.energy << '\t'
                    << int(plant_bite_is_hard(part.organ_kind)) << '\n';
      for (const auto &f : w.field.feeding().pieces)
        if (f.energy > 0)
          std::cout << "F\t" << w.ticks << '\t' << f.x << '\t' << f.y << '\t' << f.energy << '\t'
                    << f.origin << '\n';
    }
    w.tick();
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !p.developing())
        continue;
      if (!b.hatched) {
        if (w.ticks % 200 == 0)
          std::cout << "E\t" << w.ticks << '\t' << p.id << '\t' << b.x << '\t' << b.y << '\n';
        continue;
      }
      if (w.ticks % 5 == 0)
        std::cout << "P\t" << w.ticks << '\t' << p.id << '\t' << p.g << '\t' << b.x << '\t' << b.y
                  << '\t' << b.energy << '\t' << b.gut_fill / gut_capacity(b) << '\n';
      const bool acted = b.feeding_action_age == feeding_effect_steps::full;
      if (acted || b.motor().motor_pulses[field::Aggression])
        std::cout << "A\t" << w.ticks << '\t' << p.id << '\t' << b.x << '\t' << b.y << '\t'
                  << (acted ? b.feeding_action : -1) << '\n';
    }
  }
}
