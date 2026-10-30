// Short isolated-prey diagnostic. Origin 3 is edible carrion, not poison.
// Escape speed is imposed radially below distance 30; normal field motion follows.
#include "test_support.hh"
#include "founders.hh"
using namespace test;
int main(int argc, char **argv) {
  if (argc < 2) {
    std::cerr << "Usage: hunter_probe-tests GENOME [escape-speed=0] [food-origin=0] "
                 "[disabled-sense=-1]\n";
    return 2;
  }
  auto g = Genome::load(argv[1]);
  double speed = argc > 2 ? std::stod(argv[2]) : 0;
  int origin = argc > 3 ? std::stoi(argv[3]) : 0;
  int disabled = argc > 4 ? std::stoi(argv[4]) : -1;
  std::cout << "seed,angle,speed,origin,disabled,aligned,caught,digested,energy,alive\n";
  for (int seed : {187, 188, 189}) {
    Ecosystem base(seed);
    base.resize(615, 410);
    base.safety = false;
    base.field.flow = .3;
    base.field.gravity = 0;
    base.field.set_energy_supply(0);
    base.food_burst.strength = base.mutation_burst.strength = 0;
    auto energy = funded_egg_energy(g, base.physiology().neural_cost, base.evo.yolk);
    if (!energy)
      throw std::runtime_error("egg funding failed");
    base.spawn(g, 300, 205, 0, 0, 0, *energy);
    for (int t = 0; t < 1000 && !base.fish.empty() && !base.fish[0].body.hatched; ++t)
      base.tick();
    if (base.fish.empty() || !base.fish[0].body.hatched) {
      std::cerr << "no hatch " << seed << '\n';
      return 1;
    }
    for (int angle : {-60, -35, 35, 60}) {
      auto w = base.fork();
      auto &b = w.fish[0].body;
      b.x = 300;
      b.y = 205;
      b.angle = 0;
      if (disabled >= 0)
        b.disable_sense(disabled);
      double tx = 300 + 40 * std::cos(angle * PI / 180), ty = 205 + 40 * std::sin(angle * PI / 180);
      place_trial_food(w, tx, ty, 120, origin);
      auto &food = StateAccess::feeding(w.field).pieces.back();
      food.color = {1, .2, .1};
      food.buoyancy = 0;
      auto id = food.render_id;
      int aligned = -1, caught = -1;
      double nutrition = b.nutrition;
      for (int step = 0; step < 500 && !w.fish.empty(); ++step) {
        auto &q = w.fish[0].body;
        for (auto &f : StateAccess::feeding(w.field).pieces)
          if (f.render_id == id) {
            tx = f.x;
            ty = f.y;
            double dx = w.field.delta_x(f.x - q.x), dy = f.y - q.y, d = std::hypot(dx, dy);
            if (speed > 0 && d < 30 && d > 0) {
              f.vx = speed * dx / d;
              f.vy = speed * dy / d;
            }
          }
        w.tick();
        if (w.fish.empty())
          break;
        auto &a = w.fish[0].body;
        double error =
            std::remainder(std::atan2(ty - a.y, w.field.delta_x(tx - a.x)) - a.angle, 2 * PI);
        if (aligned < 0 && std::abs(error) < 15 * PI / 180)
          aligned = step + 1;
        bool exists = false;
        for (auto &f : w.field.feeding().pieces)
          if (f.render_id == id && f.energy > 0)
            exists = true;
        if (caught < 0 && !exists && a.nutrition > nutrition)
          caught = step + 1;
        if (caught >= 0 && step >= caught + 100)
          break;
      }
      bool alive = !w.fish.empty() && w.fish[0].body.alive;
      std::cout << seed << ',' << angle << ',' << speed << ',' << origin << ',' << disabled << ','
                << aligned << ',' << caught << ',' << (alive ? w.fish[0].body.digested : 0) << ','
                << (alive ? w.fish[0].body.energy : 0) << ',' << alive << std::endl;
    }
  }
}
