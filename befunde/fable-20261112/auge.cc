// Diagnose (Fable): Sehreiz roh (vor der Kennlinie) und Antwort je Auge gegen Blattpeilung.
#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "perception.hh"
#include "body_plan.hh"
#include "opencl.hh"
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
  for (int i = 6; i < argc; ++i) {
    const std::string option = argv[i];
    const auto split = option.find('=');
    if (!w.set_parameter(option.substr(0, split), std::stod(option.substr(split + 1))))
      return 2;
  }
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::cout << "t\tid\tleaf\tbearing\trawL\trawR\trawMaxL\trawMaxR\trespL\trespR\trespMaxL\trespMaxR\t"
               "objects\tplants\n";
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
      const auto seen = visual_stimuli(b, p.genome, w.field);
      const auto &signals = b.perception().sensor_buffer;
      double raw[2]{}, rmax[2]{}, resp[2]{}, pmax[2]{};
      int n[2]{};
      for (std::size_t i = 0; i < binding.sensory.size() && i < seen.size(); ++i) {
        const auto &r = binding.sensory[i];
        if (!r.visual() || r.proximity)
          continue;
        const int side = r.lateral >= 0;
        raw[side] += seen[i];
        rmax[side] = std::max(rmax[side], double(seen[i]));
        resp[side] += signals[i];
        pmax[side] = std::max(pmax[side], double(signals[i]));
        ++n[side];
        if (!described)
          std::cerr << "Sehrezeptor " << i << " Winkel " << r.angle << " Feld " << r.view_left
                    << ".." << r.view_right << " Schwelle " << r.response_threshold << " Gain "
                    << r.visual_gain() << " Spektrum " << r.spectrum[0] << ' ' << r.spectrum[1]
                    << ' ' << r.spectrum[2] << " Gegenfarbe " << r.opponency << " Dunkelanteil "
                    << r.dark_share << " lateral " << r.lateral << '\n';
      }
      described = true;
      const auto objects = visual_objects(b, p.genome, w.field, true, true);
      int plants = 0;
      for (const auto &o : objects)
        plants += o.kind == food_kind::plant;
      const double ca = std::cos(b.angle), sa = std::sin(b.angle);
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
      std::cout << w.ticks << '\t' << p.id << '\t' << leaf << '\t' << bearing << '\t'
                << raw[0] / std::max(1, n[0]) << '\t' << raw[1] / std::max(1, n[1]) << '\t'
                << rmax[0] << '\t' << rmax[1] << '\t' << resp[0] / std::max(1, n[0]) << '\t'
                << resp[1] / std::max(1, n[1]) << '\t' << pmax[0] << '\t' << pmax[1] << '\t'
                << objects.size() << '\t' << plants << '\n';
    }
  }
}
