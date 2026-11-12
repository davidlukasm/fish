// Diagnose (Fable): hungrige Flockenfresser neben liegendem Futter. Je Fisch und Schritt Abstand
// und Richtung zur nächsten Futterflocke, Tempo, Maulbewegung und Aufnahme. Liest nur.
#include "ecology.hh"
#include "physiology.hh"
#include <iostream>
using namespace fishsim;
int main(int argc, char **argv) {
  if (argc < 7) {
    std::cerr << "flocken GENOM SEED ANZAHL VORLAUF SCHRITTE JEDER\n";
    return 2;
  }
  const auto seed = std::stoull(argv[2]);
  const int count = std::stoi(argv[3]), lead = std::stoi(argv[4]), steps = std::stoi(argv[5]),
            every = std::stoi(argv[6]);
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::cout << "t\tid\tg\tmaturity\tx\ty\tspeed\tflake\tbearing\tfx\tfy\tmouth\treach\tsuck\tbite\tflow\t"
               "intake\tenergy\tgut\tcovered\n";
  for (int t = 0; t < lead + steps && !w.fish.empty(); ++t) {
    w.tick();
    if (t < lead || t % every)
      continue;
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !b.hatched)
        continue;
      const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                   my = b.y + mouth_offset(b) * std::sin(b.angle);
      double best = 1e9, bearing = 0, fx = 0, fy = 0;
      for (const auto &q : w.field.feeding().pieces) {
        if (q.origin != food_kind::feed || q.energy <= 0)
          continue;
        const double dx = w.field.delta_x(q.x - mx), dy = q.y - my, d = std::hypot(dx, dy);
        if (d < best) {
          best = d;
          bearing = std::remainder(std::atan2(dy, dx) - b.angle, 2 * PI);
          fx = q.x;
          fy = q.y;
        }
      }
      double raw = 0;
      for (double v : p.observations().raw_diet)
        raw += v;
      std::cout << w.ticks << '\t' << p.id << '\t' << p.g << '\t' << body_maturity(b) << '\t' << b.x
                << '\t' << b.y << '\t' << b.motor().relative_speed << '\t' << best << '\t'
                << bearing << '\t' << fx << '\t' << fy << '\t' << mouth_aperture(b) << '\t'
                << mouth_reach(b) << '\t' << b.motor().motor_pulses[field::Suction] << '\t'
                << b.motor().motor_pulses[field::Aggression] << '\t' << b.mouth.flow << '\t' << raw
                << '\t' << b.energy << '\t' << gut_filling(b) << '\t' << b.sediment_coverage << '\n';
    }
  }
}
