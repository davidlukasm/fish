// probe GENOME ANGLE DISTANCE STEPS: one hatched fish, one food piece at ANGLE (deg, + = links?)
// and DISTANCE ahead; logs approach, turning, pump and intake.
#include "founders.hh"
#include "ecology_internal.hh"
#include <cmath>
#include <cstdio>
#include "body_plan.hh"
#include "physiology.hh"
#include <map>
#include <string>
using namespace fishsim;
int main(int argc, char **argv) {
  if (argc != 5) {
    std::fprintf(stderr, "Aufruf: probe GENOME ANGLE DISTANCE STEPS\n");
    return 2;
  }
  auto g = Genome::load(argv[1]);
  Genome::adopt_run(g);
  const double angle = std::atof(argv[2]) * PI / 180, distance = std::atof(argv[3]);
  const int steps = std::atoi(argv[4]);
  std::atomic<bool> stop{false};
  develop_entrant(g, stop);
  Ecosystem w(7);
  w.workers = 1;
  w.starter_world();
  w.seed(
      std::vector<Genome>{g}, 1, 0, {}, {},
      [&] {
        w.set_parameter("food_supply_share", 0);
        w.set_parameter("plankton_supply_share", 0);
        w.set_parameter("benthic_supply_share", 0);
        if (const char *list = std::getenv("PARAM")) {
          std::string all = list;
          std::size_t pos = 0;
          while (pos < all.size()) {
            auto end = all.find(',', pos);
            if (end == std::string::npos)
              end = all.size();
            auto item = all.substr(pos, end - pos);
            auto eq = item.find('=');
            w.set_parameter(item.substr(0, eq), std::atof(item.c_str() + eq + 1));
            pos = end + 1;
          }
        }
      },
      true);
  for (int s = 0;
       s < 3000 && !(w.fish[0].body.hatched && w.fish[0].body.age > w.fish[0].body.hatch_age + 50);
       ++s)
    w.tick(false, true);
  auto &b = w.fish[0].body;
  std::printf("geschlüpft %d alter %d gewebe %.1f\n", b.hatched, b.age, b.tissue);
  w.field.clear_food();
  if (std::getenv("EYES")) {
    const auto &layout = *w.fish[0].genome.interface;
    for (const auto &r : layout.sensory)
      std::printf("rez ch %d n %u winkel %.1f breite %.1f sinn %.3f spek %.2f %.2f %.2f rthr %.4f "
                  "gain %.2f lat %.2f\n",
                  r.channel, r.neuron, r.angle * 180 / PI, r.width * 180 / PI, r.senses[r.channel],
                  r.spectrum[0], r.spectrum[1], r.spectrum[2], r.response_threshold, r.gain,
                  r.lateral);
  }
  // Fish to the middle of open water, food ahead at the given bearing.
  b.x = 300;
  b.y = 200;
  b.angle = 0;
  for (int s = 0; s < std::atoi(std::getenv("SETTLE") ? std::getenv("SETTLE") : "300"); ++s) {
    w.tick(false, true);
    if (b.y < 120 || b.y > 330)
      b.y = 200; // offenes Wasser halten
  }
  std::printf("nach Eingewöhnung: x %.0f y %.0f kurs %.0f tempo %.2f\n", b.x, b.y,
              b.angle * 180 / PI, b.motor().speed);
  const double fx = b.x + distance * std::cos(b.angle + angle),
               fy = b.y + distance * std::sin(b.angle + angle);
  {
    Food piece{fx, fy, 0, 0, 0, std::getenv("FOODE") ? std::atof(std::getenv("FOODE")) : 50.};
    piece.radius = food_radius(piece.energy);
    piece.initial_energy = piece.energy;
    w.field.append_fragment(piece);
  }
  const double before = b.nutrition;
  std::printf("futterradius %.2f farbe %.2f %.2f %.2f\n", food_radius(w.field.feeding().pieces[0]),
              w.field.food_color(w.field.feeding().pieces[0])[0],
              w.field.food_color(w.field.feeding().pieces[0])[1],
              w.field.food_color(w.field.feeding().pieces[0])[2]);
  for (int s = 1; s <= steps; ++s) {
    w.tick(false, true);
    if (std::getenv("NEAR")) {
      const double dx = w.field.delta_x(fx - b.x), dy = fy - b.y;
      if (std::hypot(dx, dy) < 9) {
        const double mo = mouth_offset(b), mxx = b.x + mo * std::cos(b.angle),
                     myy = b.y + mo * std::sin(b.angle);
        std::printf(
            "  s %d mitte %.1f maul-futter %.1f phase %.1f beißt %d bsig %.2f bkraft %.2f offen "
            "%.2f e %.1f darm %.2f\n",
            s, std::hypot(dx, dy), std::hypot(w.field.delta_x(fx - mxx), fy - myy), b.mouth.phase,
            int(b.mouth.biting), b.bite_signal, b.bite_strength, b.mouth.opening,
            w.field.feeding().pieces.empty() ? 0. : w.field.feeding().pieces[0].energy, b.gut_fill);
        if (!w.field.feeding().pieces.empty())
          std::printf(
              "     kraft %.3f schnitt %.2f portion %.2f härte %.2f knack %.2f stumpf %.2f hebel "
              "%.2f skala %.2f\n",
              bite_force(b), bite_radius(b), bite_portion(b), w.field.feeding().pieces[0].hardness,
              crack_success(bite_force(b), w.field.feeding().pieces[0].hardness, w.field.env()),
              b.blunt_teeth, jaw_leverage(b), b.force_scale);
      }
    }
    if (s % 10 == 0 || s == 1) {
      const double dx = w.field.delta_x(fx - b.x), dy = fy - b.y;
      const double bearing = std::remainder(std::atan2(dy, dx) - b.angle, 2 * PI) * 180 / PI;
      std::printf("t %3d  abstand %6.1f  peilung %7.1f°  kurs %7.1f°  tempo %.2f  maul %.2f  saug "
                  "%.2f  aufnahme %.2f  ruhe %.3f muskel %.3f kampf %.3f energie %.1f futter %zu e "
                  "%.1f biss %d schluck %.2f gape %.2f |",
                  s, std::hypot(dx, dy), bearing, b.angle * 180 / PI, b.motor().speed,
                  b.mouth.opening, b.mouth.flow, b.nutrition - before, b.rest_cost,
                  b.ledger().muscle_cost, b.motor().combat_cost, b.energy,
                  w.field.feeding().pieces.size(),
                  w.field.feeding().pieces.empty() ? 0. : w.field.feeding().pieces[0].energy,
                  int(b.mouth.cycle), b.gut_fill, maximum_mouth_aperture(b));
      if (b.brain()) {
        const auto &state = b.brain()->state();
        const auto &layout = *w.fish[0].genome.interface;
        auto drive = continuous_organs(state, layout);
        const char *names[] = {"schw", "flL",   "flR",  "dreh", "pump",
                               "kief", "stach", "eier", "sperm"};
        for (int k = 0; k < 9; ++k)
          if (drive.present & (1u << k))
            std::printf(" %s %.2f", names[k], drive.values[k]);
        double eye[2] = {0, 0};
        int n[2] = {0, 0};
        for (const auto &r : layout.sensory)
          if (r.dominant_sense() == 0) {
            int side = r.lateral < 0 ? 0 : 1;
            eye[side] += b.brain()->signal(r.neuron);
            ++n[side];
          }
        std::printf(" | augeL %.2f augeR %.2f", n[0] ? eye[0] / n[0] : 0, n[1] ? eye[1] / n[1] : 0);
        if (std::getenv("CELLS") && (s == 1 || s == 50)) {
          const auto &bp = *w.fish[0].genome.blueprint;
          std::map<std::string, std::pair<double, int>> mean;
          for (std::size_t i = 0; i < bp.neurons.size() && i < state.size(); ++i) {
            const auto &c = bp.neurons[i];
            std::string key = "Z" + std::to_string(c.location.zone) +
                              (c.role == field::Role::Nerve    ? " nerv"
                               : c.role == field::Role::Sensor ? " sinn"
                                                               : " organ") +
                              (c.location.side < 0 ? "L" : "R") + " bias " +
                              std::to_string(c.bias).substr(0, 5);
            mean[key].first += state[i];
            ++mean[key].second;
          }
          std::printf("\n");
          if (std::getenv("DETAIL")) {
            std::map<std::string, int> shown;
            for (std::size_t i = 0; i < bp.neurons.size(); ++i) {
              const auto &c = bp.neurons[i];
              std::string key = "Z" + std::to_string(c.location.zone) +
                                std::to_string(int(c.role)) +
                                std::to_string(c.location.u).substr(0, 4);
              if (shown[key]++)
                continue;
              std::printf("    Z%d role %d u%.2f v%.2f w%.2f s%+.0f st %.3f sig %.3f bias %.3f thr "
                          "%.2f cap %.2f fw %.2f tc %.2f sm %.3f rec",
                          c.location.zone, int(c.role), c.location.u, c.location.v, c.location.w,
                          c.location.side, state[i], b.brain()->signal(i), c.bias,
                          c.parameters.threshold, c.parameters.capacity, c.parameters.field_width,
                          c.parameters.time_constant, b.brain()->synaptic_mean(i));
              for (int k = 0; k < field::HORMONE_EFFECTS; ++k)
                std::printf(" %.2f", c.hormone_receptors[k].response(b.hormones().levels(), 1));
              std::printf("\n");
            }
          }
          for (auto &[k, v] : mean)
            std::printf("    %-30s n %3d mittel %.3f\n", k.c_str(), v.second, v.first / v.second);
        }
      }
      std::printf("\n");
    }
  }
}
