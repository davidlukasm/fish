// Diagnose (Fable): Signale der Hirnregionen, Darm, Blattangebot im Umkreis rund ums Wegschwimmen.
#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "perception.hh"
#include "field/development_sites.hh"
#include <fstream>
#include <iostream>
#include <map>
using namespace fishsim;
int site_of(const cppn::Point &p) {
  for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
    const auto s = field::development_site(i);
    if (s.zone == p.zone && s.u == p.u && s.v == p.v && s.w == p.w && s.side == p.side)
      return int(i);
  }
  return -1;
}
int main(int argc, char **argv) {
  const auto seed = std::stoull(argv[2]);
  const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]), from = std::stoi(argv[5]),
            every = std::stoi(argv[6]);
  std::map<int, std::string> names;
  {
    std::ifstream in(argv[7]);
    int site;
    std::string name;
    while (in >> site >> name)
      names[site] = name.substr(0, name.size() - 2); // Seiten zusammenfassen.
  }
  const std::vector<std::string> shown{"state.intake", "state.satiety", "state.pause",
                                       "state.deficit", "state.reserve", "state.investment",
                                       "choice.search", "choice.roam", "choice.seen",
                                       "choice.pause", "choice.target", "choice.advance",
                                       "choice.alarm", "value.feature1", "value.feature2",
                                       "olfaction.presence", "olfaction.target", "tectum.onward",
                                       "motor.urge", "motor.brake", "motor.full", "motor.toward",
                                       "motor.near", "motor.grip", "motor.bite", "motor.mouth",
                                       "motor.fins", "motor.tail"};
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::map<std::uint64_t, std::vector<int>> label; // per fish: neuron -> shown index
  std::map<std::uint64_t, int> closings, bites;
  std::cout << "t\tid\tenergy\tgut\tgutcap\tleaf\tleaf64\tleaf200\tspeed\tclos\tbites\tyolk\ty\tdepth";
  for (const auto &s : shown)
    std::cout << '\t' << s;
  for (int k = 0; k < 4; ++k)
    std::cout << "\th" << k;
  std::cout << '\n';
  for (int t = 0; t < steps; ++t) {
    w.tick();
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !b.hatched || p.g != 0 || !b.brain())
        continue;
      if (b.motor().motor_pulses[field::Aggression])
        ++closings[p.id];
      if (b.feeding_action_age == feeding_effect_steps::full &&
          (b.feeding_action == feeding_effect::bite || b.feeding_action == feeding_effect::crack))
        ++bites[p.id];
      if (int(w.ticks) < from || w.ticks % every)
        continue;
      const auto &brain = *b.brain();
      auto &l = label[p.id];
      if (l.size() != brain.blueprint().neurons.size()) {
        l.clear();
        for (const auto &n : brain.blueprint().neurons) {
          const auto found = names.find(site_of(n.location));
          int k = -1;
          if (found != names.end())
            for (std::size_t i = 0; i < shown.size(); ++i)
              if (shown[i] == found->second)
                k = int(i);
          l.push_back(k);
        }
      }
      std::vector<double> sum(shown.size()), n(shown.size());
      for (std::size_t i = 0; i < l.size(); ++i)
        if (l[i] >= 0 && !brain.muted(i)) {
          sum[l[i]] += brain.signal(i);
          n[l[i]] += 1;
        }
      const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                   my = b.y + mouth_offset(b) * std::sin(b.angle);
      double leaf = 1e9, near = 0, wide = 0;
      for (const auto &part : w.field.vegetation().plants)
        if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
            part.energy > 0) {
          const double d =
              std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx), part.y - my));
          leaf = std::min(leaf, d);
          if (d < 64)
            near += part.energy;
          if (d < 200)
            wide += part.energy;
        }
      std::cout << w.ticks << '\t' << p.id << '\t' << b.energy << '\t' << b.gut_fill << '\t'
                << gut_capacity(b) << '\t' << leaf << '\t' << near << '\t' << wide << '\t'
                << b.motor().relative_speed << '\t' << closings[p.id] << '\t' << bites[p.id]
                << '\t' << b.reproduction().egg_yolk << '\t' << b.y << '\t'
                << w.field.geometry().height - b.y;
      for (std::size_t i = 0; i < shown.size(); ++i)
        std::cout << '\t' << (n[i] > 0 ? sum[i] / n[i] : -9);
      for (int k = 0; k < 4; ++k)
        std::cout << '\t' << b.hormones().levels()[k];
      std::cout << '\n';
    }
  }
}
