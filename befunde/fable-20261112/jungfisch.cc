// Diagnose (Fable, 12.11.): Lebenslauf jedes Fisches vom Schlupf an – Abstand zum nächsten
// weichen Blatt, Kieferschlüsse, Bisskraft, Aufnahme, Wachstumserlaubnis. Liest nur, ändert nichts.
#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "perception.hh"
#include <iostream>
#include <map>
using namespace fishsim;
namespace {
struct Life {
  int generation = 0;
  std::uint64_t parent = 0;
  int hatch_t = -1, last_t = 0, steps = 0, closings = 0, closings_at_leaf = 0, plant_bites = 0,
      other_actions = 0, pumps = 0, first_leaf_t = -1, steps_near = 0, samples = 0;
  double hx = 0, hy = 0, hatch_radius = 0, hatch_tissue = 0, hatch_energy = 0, hatch_maturity = 0,
         hatch_leaf = -1, hatch_aperture = 0, hatch_rest = 0, hatch_capacity = 0;
  double path = 0, x = 0, y = 0, min_leaf = 1e9, leaf_sum = 0, grind_max = 0, grind_sum = 0,
         gape_sum = 0, eff_sum = 0, permission_sum = 0, energy = 0, energy_min = 1e9,
         maturity = 0, health = 0, tissue = 0, intake = 0, plant = 0, feed = 0, rest = 0,
         speed_sum = 0, gut = 0, signal_sum = 0;
  bool hatched = false, alive = true;
};
double nearest_leaf(const Ecosystem &w, double mx, double my) {
  double best = w.field.geometry().width;
  for (const auto &part : w.field.vegetation().plants)
    if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) && part.energy > 0)
      best = std::min(best, std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx),
                                                         part.y - my)));
  return best;
}
}
int main(int argc, char **argv) {
  if (argc < 5) {
    std::cerr << "jungfisch GENOM SEED SCHRITTE ANZAHL [mutate=0] [Parameter=Wert]\n";
    return 2;
  }
  const auto seed = std::stoull(argv[2]);
  const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]);
  Genome::begin_run(seed);
  Genome g = Genome::load(argv[1]);
  Ecosystem w(seed);
  w.safety = false;
  w.workers = 2;
  for (int i = 5; i < argc; ++i) {
    const std::string option = argv[i];
    const auto split = option.find('=');
    if (!w.set_parameter(option.substr(0, split), std::stod(option.substr(split + 1)))) {
      std::cerr << "Unbekannter Parameter " << option << '\n';
      return 2;
    }
  }
  w.starter_world();
  w.seed({g}, count, run_limit::default_food);
  std::map<std::uint64_t, Life> lives;
  const double leaf_hardness = w.field.env().hardness_leaf;
  for (int t = 0; t < steps && !w.fish.empty(); ++t) {
    w.tick();
    for (auto &[id, l] : lives)
      if (l.alive && l.last_t < int(w.ticks) - 1)
        l.alive = false;
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive || !p.developing())
        continue;
      auto &l = lives[p.id];
      l.generation = p.g;
      l.parent = p.parent;
      l.last_t = int(w.ticks);
      if (!b.hatched)
        continue;
      const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                   my = b.y + mouth_offset(b) * std::sin(b.angle);
      const bool sample = !l.hatched || w.ticks % 5 == 0 || b.motor().motor_pulses[field::Aggression];
      double leaf = -1;
      if (sample)
        leaf = nearest_leaf(w, mx, my);
      if (!l.hatched) {
        l.hatched = true;
        l.hatch_t = int(w.ticks);
        l.hx = l.x = b.x;
        l.hy = l.y = b.y;
        l.hatch_radius = body_radius(b);
        l.hatch_tissue = b.tissue;
        l.hatch_energy = b.energy;
        l.hatch_maturity = body_maturity(b);
        l.hatch_leaf = leaf;
        l.hatch_aperture = maximum_mouth_aperture(b);
        l.hatch_rest = b.rest_cost;
        l.hatch_capacity = tissue_capacity(b);
      }
      ++l.steps;
      const double step = std::hypot(w.field.delta_x(b.x - l.x), b.y - l.y);
      l.path += step;
      l.speed_sum += b.motor().relative_speed;
      l.x = b.x;
      l.y = b.y;
      if (leaf >= 0) {
        ++l.samples;
        l.leaf_sum += leaf;
        l.min_leaf = std::min(l.min_leaf, leaf);
        if (leaf <= mouth_reach(b) + body_radius(b)) {
          ++l.steps_near;
          if (l.first_leaf_t < 0)
            l.first_leaf_t = int(w.ticks);
        }
      }
      if (b.motor().motor_pulses[field::Aggression]) {
        ++l.closings;
        const double force = bite_force(b, BiteKind::grinding);
        l.grind_max = std::max(l.grind_max, force);
        l.grind_sum += force;
        l.signal_sum += b.bite_signal;
        l.gape_sum += b.mouth.gape;
        l.eff_sum += crack_success(force, leaf_hardness, w.field.env());
        if (leaf <= mouth_reach(b) + body_radius(b))
          ++l.closings_at_leaf;
      }
      if (b.motor().motor_pulses[field::Suction])
        ++l.pumps;
      if (b.feeding_action_age == feeding_effect_steps::full) {
        if (b.feeding_action == feeding_effect::bite || b.feeding_action == feeding_effect::crack)
          ++l.plant_bites;
        else
          ++l.other_actions;
      }
      l.permission_sum += growth_permission(b);
      l.energy = b.energy;
      l.energy_min = std::min(l.energy_min, b.energy);
      l.maturity = body_maturity(b);
      l.health = b.health;
      l.tissue = b.tissue;
      l.rest = b.rest_cost;
      l.gut = b.gut_fill;
      const auto &diet = p.observations().raw_diet;
      l.intake = 0;
      for (double v : diet)
        l.intake += v;
      l.plant = diet[food_kind::plant] + diet[food_kind::algae];
      l.feed = diet[food_kind::feed];
    }
    if (w.ticks % 100 == 0)
      for (const auto &p : w.fish) {
        const auto &b = p.body;
        if (!b.alive || !b.hatched || !p.developing())
          continue;
        const auto &l = lives[p.id];
        const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                     my = b.y + mouth_offset(b) * std::sin(b.angle);
        std::cerr << "S\t" << w.ticks << '\t' << p.id << '\t' << p.g << '\t' << b.energy << '\t'
                  << reserve_capacity(b) << '\t' << b.gut_fill << '\t' << gut_capacity(b) << '\t'
                  << b.gut_digestible << '\t' << b.tissue << '\t' << tissue_capacity(b) << '\t'
                  << b.rest_cost << '\t' << b.ledger().movement_cost << '\t'
                  << b.ledger().muscle_cost << '\t' << b.ledger().brain_cost << '\t' << b.digested
                  << '\t' << b.reproduction().egg_yolk << '\t' << b.reproduction().sperm_store
                  << '\t' << nearest_leaf(w, mx, my) << '\t' << l.closings << '\t'
                  << l.plant_bites << '\t' << l.intake << '\t' << b.health << '\t'
                  << growth_permission(b) << '\t' << l.path << '\t' << b.gut_length << '\t'
                  << b.y << '\n';
      }
    if (w.ticks % 1000 == 0)
      std::cerr << "t " << w.ticks << " n " << w.fish.size() << " hunger "
                << w.metrics().death_causes[death_reason::hunger] << '\n';
  }
  std::cout << "id\tgen\tparent\thatch_t\tlast_t\talive\tsteps\thx\thy\th_radius\th_tissue\th_energy\t"
               "h_maturity\th_capacity\th_leaf\th_aperture\th_rest\tpath\tnet\tmean_speed\tmin_leaf\t"
               "mean_leaf\tfirst_leaf_t\tnear_share\tclosings\tclosings_at_leaf\tplant_bites\t"
               "other_actions\tpumps\tsignal\tgape\tgrind_mean\tgrind_max\tleaf_eff\tpermission\t"
               "intake\tplant\tfeed\tenergy\tenergy_min\tmaturity\ttissue\thealth\trest\tgut\n";
  for (const auto &[id, l] : lives) {
    if (!l.hatched)
      continue;
    const double n = std::max(1, l.steps), c = std::max(1, l.closings);
    std::cout << id << '\t' << l.generation << '\t' << l.parent << '\t' << l.hatch_t << '\t'
              << l.last_t << '\t' << l.alive << '\t' << l.steps << '\t' << l.hx << '\t' << l.hy
              << '\t' << l.hatch_radius << '\t' << l.hatch_tissue << '\t' << l.hatch_energy << '\t'
              << l.hatch_maturity << '\t' << l.hatch_capacity << '\t' << l.hatch_leaf << '\t'
              << l.hatch_aperture << '\t' << l.hatch_rest << '\t' << l.path << '\t'
              << std::hypot(w.field.delta_x(l.x - l.hx), l.y - l.hy) << '\t' << l.speed_sum / n
              << '\t' << l.min_leaf << '\t' << l.leaf_sum / std::max(1, l.samples) << '\t'
              << l.first_leaf_t << '\t' << double(l.steps_near) / std::max(1, l.samples) << '\t'
              << l.closings << '\t' << l.closings_at_leaf << '\t' << l.plant_bites << '\t'
              << l.other_actions << '\t' << l.pumps << '\t' << l.signal_sum / c << '\t'
              << l.gape_sum / c << '\t' << l.grind_sum / c << '\t' << l.grind_max << '\t'
              << l.eff_sum / c << '\t' << l.permission_sum / n << '\t' << l.intake << '\t'
              << l.plant << '\t' << l.feed << '\t' << l.energy << '\t' << l.energy_min << '\t'
              << l.maturity << '\t' << l.tissue << '\t' << l.health << '\t' << l.rest << '\t'
              << l.gut << '\n';
  }
}
