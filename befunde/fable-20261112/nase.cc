// Diagnose (Fable): Duft an beiden Nasen (Rohwert, Gewöhnungsmittel, Antwort) und Sehantwort je Seite.
#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "perception.hh"
#include <iostream>
using namespace fishsim;
int main(int argc, char **argv) {
  const auto seed = std::stoull(argv[2]);
  const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]), every = std::stoi(argv[5]);
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  const auto &pl = w.field.food_web().plankton;
  std::cerr << "Duftraster " << pl.columns << "x" << pl.rows << " Zelle " << pl.width / pl.columns
            << " x " << pl.height / pl.rows << " px\n";
  std::cout << "t\tid\tradius\tleaf\tbearing\trawL\trawR\tmeanL\tmeanR\trespL\trespR\tthr\trate\t"
               "nL\tnR\tlatL\tlatR\tvisL\tvisR\tvisMaxL\tvisMaxR\tnVis\n";
  bool described = false;
  for (int t = 0; t < steps; ++t) {
    w.tick();
    if (w.ticks % every)
      continue;
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !b.hatched || p.g != 0)
        continue;
      const auto &binding = b.active_interface(p.genome);
      const auto &signals = b.perception().sensor_buffer;
      const auto &adapted = b.perception().adapted;
      const double radius = body_radius(b), ca = std::cos(b.angle), sa = std::sin(b.angle);
      double raw[2]{}, mean[2]{}, resp[2]{}, lat[2]{}, vis[2]{}, vmax[2]{}, thr = 0, rate = 0;
      int n[2]{}, nv[2]{};
      for (std::size_t i = 0; i < binding.sensory.size() && i < signals.size(); ++i) {
        const auto &r = binding.sensory[i];
        const int side = r.lateral >= 0;
        if (r.visual() && !r.proximity) {
          vis[side] += signals[i];
          vmax[side] = std::max(vmax[side], double(signals[i]));
          ++nv[side];
          continue;
        }
        if (r.dominant_sense() != field::Odor || r.senses[field::Odor] <= 0)
          continue;
        const Point at{w.field.wrap_x(b.x + radius * (r.longitudinal * ca - r.lateral * sa)),
                       b.y + radius * (r.longitudinal * sa + r.lateral * ca)};
        const auto local = w.field.odor_field(at.x, at.y);
        double odor = 0;
        for (int k = 0; k < odor_kind::count; ++k)
          odor += local[k] * r.scents[k];
        raw[side] += odor;
        mean[side] += i < adapted.size() ? adapted[i] : 0;
        resp[side] += signals[i];
        lat[side] += r.lateral * radius;
        thr = r.response_threshold;
        rate = r.adaptation_rate;
        ++n[side];
        if (!described) {
          std::cerr << "Duftrezeptor " << i << " lateral " << r.lateral << " longitudinal "
                    << r.longitudinal << " Schwelle " << r.response_threshold << " Rate "
                    << r.adaptation_rate << " Zeit " << r.time_steps << " Anteile";
          for (int k = 0; k < odor_kind::count; ++k)
            std::cerr << ' ' << r.scents[k];
          std::cerr << '\n';
        }
      }
      described = true;
      const double mx = w.field.wrap_x(b.x + mouth_offset(b) * ca), my = b.y + mouth_offset(b) * sa;
      double leaf = 1e9, bearing = 0;
      for (const auto &part : w.field.vegetation().plants)
        if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
            part.energy > 0) {
          const double d =
              std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx), part.y - my));
          if (d < leaf) {
            leaf = d;
            bearing = std::remainder(
                std::atan2(part.y - b.y, w.field.delta_x(part.x - b.x)) - b.angle, 2 * PI);
          }
        }
      std::cout << w.ticks << '\t' << p.id << '\t' << radius << '\t' << leaf << '\t' << bearing;
      for (auto *v : {raw, mean, resp})
        for (int s = 0; s < 2; ++s)
          std::cout << '\t' << (n[s] ? v[s] / n[s] : 0);
      std::cout << '\t' << thr << '\t' << rate << '\t' << n[0] << '\t' << n[1] << '\t'
                << (n[0] ? lat[0] / n[0] : 0) << '\t' << (n[1] ? lat[1] / n[1] : 0) << '\t'
                << (nv[0] ? vis[0] / nv[0] : 0) << '\t' << (nv[1] ? vis[1] / nv[1] : 0) << '\t'
                << vmax[0] << '\t' << vmax[1] << '\t' << nv[0] + nv[1] << '\n';
    }
  }
}
