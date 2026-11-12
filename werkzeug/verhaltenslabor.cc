#include "ecology.hh"
#include "physiology.hh"
#include "perception.hh"
#include "body_plan.hh"
#include "field/development_sites.hh"
#include <algorithm>
#include <array>
#include <iostream>
#include <limits>
#include <map>

// Behaviour trials for one fish in a calm, empty tank: after hatching, a cluster of feed pieces
// appears at set bearings and distances; each trial reports whether and how the fish reached the
// food and, with stay=1, how much it ate and whether it moved on once the patch was empty.
// raised=1 grows the fish up in the aquarium before trials there without further food, supply=0
// stops the aquarium's supply once the trials begin; hold=1
// keeps it in place during the trials, so its senses see a still scene.
// path=N adds to every trial the fish's course every N steps and the target, both in the
// trial's start frame (forward along the start heading, side towards its right).
// LABTRACE=N adds the fish's course every N steps (in shell trials its approach), LABLINKS=1 its
// learned contacts and LABBITE=1 (on stderr) the gap between mouth and nearest piece at every
// bite, LABEYE=1 (with LABTRACE, also in shell trials) the bearing, stimulus and signal of every
// retinal cell.
// mussel=1 grows the fish up in the aquarium and sets it, facing the shell, at distance from one
// open mussel after another; each trial reports when the mouth reached the shell, whether the
// shell closed first, how often the jaw bit and when its bite cracked the shell, or when the
// shell vanished for another reason.
// crab=1 does the same with crabs walking in the open: when the mouth reached the crab, when the
// crab fled or buried itself, how much the fish lost to pinches and when the shell cracked or
// the crab vanished.
using namespace fishsim;
namespace {
// Sites and roles share one key: site * ROLES + role.
constexpr int ROLES = 4, WORKERS = 2;
constexpr double TANK_WIDTH = 1600, TANK_HEIGHT = 1000;
// Fish closer than WALL_MARGIN to the surface or floor are moved back to mid-depth between
// trials; food keeps FOOD_MARGIN from them.
constexpr double WALL_MARGIN = 150, FOOD_MARGIN = 30;
constexpr int MUSSEL_TRIALS = 6, HATCH_LIMIT = 2000, EARLY_TURN_STEP = 30, LINK_STEP = 1;
constexpr std::array<int, 2> SENSE_STEPS{1, 10};
// A patch is used up once nothing is left within PATCH_REACH spreads of where it was laid out;
// the fish has moved on once it is LEAVING spreads beyond its starting distance.
constexpr double PATCH_REACH = 3, LEAVING = 6, NEAR_BODIES = 2, NEAR_VIEW = 80, PATH_PRECISION = 10;
double PIECE_ENERGY = 40;
void optional_number(double value) {
  if (std::isfinite(value))
    std::cout << value;
  else
    std::cout << "null";
}
int site_of(const cppn::Point &p) {
  for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
    const auto s = field::development_site(i);
    if (s.zone == p.zone && s.u == p.u && s.v == p.v && s.w == p.w && s.side == p.side)
      return int(i);
  }
  return -1;
}
// Mean signal of the cells at each site and role (site * 4 + role); effectors report their
// organ drive.
std::map<int, double> sensed(const Body &b) {
  std::map<int, double> sum, cells;
  const auto &brain = *b.brain();
  const auto &neurons = brain.blueprint().neurons;
  for (std::size_t i = 0; i < neurons.size(); ++i)
    if (!brain.muted(i)) {
      const int key = site_of(neurons[i].location) * ROLES + int(neurons[i].role);
      sum[key] +=
          neurons[i].role == field::Role::Effector ? brain.organ_output()[i] : brain.signal(i);
      cells[key] += 1;
    }
  for (auto &[key, value] : sum)
    value /= cells[key];
  return sum;
}
std::map<std::pair<int, int>, std::array<double, 2>> links(const Body &b) {
  std::map<std::pair<int, int>, std::array<double, 2>> out;
  const auto &brain = *b.brain();
  const auto &neurons = brain.blueprint().neurons;
  for (const auto &s : brain.synapses()) {
    auto &l = out[{site_of(neurons[s.source].location) * ROLES + int(neurons[s.source].role),
                   site_of(neurons[s.target].location) * ROLES + int(neurons[s.target].role)}];
    l[0] += 1;
    l[1] += s.weight;
  }
  return out;
}
double bearing_to(const Ecosystem &w, const Body &b, double x, double y) {
  return std::remainder(std::atan2(y - b.y, w.field.delta_x(x - b.x)) - b.angle, 2 * PI);
}
// The egg or fish died: that ends the trials with a result, not with an error.
struct Death {
  bool egg;
  double health, age;
};
// Positions in a trial's start frame, recorded every few steps.
struct Course {
  const Ecosystem &world;
  double x0, y0, angle;
  int every;
  std::vector<std::array<double, 2>> points{};
  std::array<double, 2> local(double x, double y) const {
    const double dx = world.field.delta_x(x - x0), dy = y - y0;
    return {dx * std::cos(angle) + dy * std::sin(angle),
            dy * std::cos(angle) - dx * std::sin(angle)};
  }
  void record(int step, const Body &b) {
    if (every > 0 && step % every == 0)
      points.push_back(local(b.x, b.y));
  }
  void print(double target_x, double target_y) const {
    if (every <= 0)
      return;
    const auto point = [](const std::array<double, 2> &p) {
      std::cout << '[' << std::round(p[0] * PATH_PRECISION) / PATH_PRECISION << ','
                << std::round(p[1] * PATH_PRECISION) / PATH_PRECISION << ']';
    };
    std::cout << ",\"target\":";
    point(local(target_x, target_y));
    std::cout << ",\"path\":[";
    for (std::size_t k = 0; k < points.size(); ++k) {
      std::cout << (k ? "," : "");
      point(points[k]);
    }
    std::cout << ']';
  }
};
// Bearing, lateral position, stimulus and signal of every retinal cell, as a JSON array.
void eye_cells(const Individual &p) {
  const auto &binding = p.body.active_interface(p.genome);
  const auto &input = p.body.perception().sensor_buffer;
  std::cout << '[';
  bool first = true;
  for (std::size_t i = 0; i < binding.sensory.size() && i < input.size(); ++i)
    if (binding.sensory[i].visual() && !binding.sensory[i].proximity) {
      std::cout << (first ? "" : ",") << '[' << binding.sensory[i].angle * 180 / PI << ','
                << binding.sensory[i].lateral << ',' << input[i] << ','
                << p.body.brain()->signal(binding.sensory[i].neuron) << ']';
      first = false;
    }
  std::cout << ']';
}
}

int main(int argc, char **argv) {
  try {
    if (argc < 3)
      throw std::invalid_argument(
          "Aufruf: verhaltenslabor GENOM SEED [settle=N] [trial=N] [distance=D] [rounds=N] "
          "[cluster=N] [spread=D] [piece=E] [prewait=N] [stay=1] [hungry=1] [plant=1] [aquarium=1] "
          "[raised=1] [hold=1] [mussel=1] [crab=1] [path=N] [supply=0] "
          "[Parameter=Wert ...]");
    const auto seed = std::stoull(argv[2]);
    const int trace_every =
        std::getenv("LABTRACE") ? std::max(1, std::atoi(std::getenv("LABTRACE"))) : 0;
    int settle = 300, trial = 300, rounds = 2, cluster = 1, aquarium = 0, prewait = 0, stay = 0,
        hungry = 0, plant = 0, raised = 0, hold = 0, mussel = 0, crab = 0, path = 0, supply = 1;
    double distance = 80, spread = 15;
    Genome::begin_run(seed);
    const auto g = Genome::load(argv[1]);
    Ecosystem w(seed);
    w.safety = false;
    w.workers = WORKERS;
    for (int i = 3; i < argc; ++i) {
      const std::string option = argv[i];
      const auto split = option.find('=');
      const auto key = option.substr(0, split);
      const double value = std::stod(option.substr(split + 1));
      if (key == "settle")
        settle = int(value);
      else if (key == "trial")
        trial = int(value);
      else if (key == "distance")
        distance = value;
      else if (key == "rounds")
        rounds = int(value);
      else if (key == "prewait")
        prewait = int(value);
      else if (key == "piece")
        PIECE_ENERGY = value;
      else if (key == "aquarium")
        aquarium = int(value);
      else if (key == "cluster")
        cluster = int(value);
      else if (key == "spread")
        spread = value;
      else if (key == "stay")
        stay = int(value);
      else if (key == "hungry")
        hungry = int(value);
      else if (key == "raised")
        raised = int(value);
      else if (key == "hold")
        hold = int(value);
      else if (key == "plant")
        plant = int(value);
      else if (key == "mussel")
        mussel = int(value);
      else if (key == "crab")
        crab = int(value);
      else if (key == "path")
        path = int(value);
      else if (key == "supply")
        supply = int(value);
      else if (!w.set_parameter(key, value))
        throw std::invalid_argument("Unbekannter Parameter: " + key);
    }
    const int food_type = plant ? food_kind::plant : food_kind::feed,
              odor_type = plant ? odor_kind::plants : odor_kind::food;
    if (cluster < 1 || !std::isfinite(PIECE_ENERGY) || PIECE_ENERGY < w.field.env().crumb_min)
      throw std::invalid_argument("Futterstücke müssen die Zerfallsgrenze erreichen");
    const auto stop_supply = [&]() {
      for (const char *share :
           {"food_supply_share", "plankton_supply_share", "benthic_supply_share"})
        w.set_parameter(share, 0);
    };
    if (mussel || crab)
      raised = 1;
    if (aquarium || raised) {
      w.starter_world();
      w.seed({g}, 1, run_limit::default_food);
    } else {
      stop_supply();
      w.resize(TANK_WIDTH, TANK_HEIGHT);
      w.field.flow = 0;
      w.seed({g}, 1, 0);
    }
    w.field.clear_food();
    if (w.fish.empty())
      throw std::runtime_error("Kein Fisch gesetzt");
    auto *p = &w.fish.front();
    const double reserve = p->body.energy;
    int t = 0;
    while (!p->body.hatched && t < HATCH_LIMIT) {
      w.tick(false);
      if (w.fish.empty())
        throw Death{true, 0, double(t)};
      p = &w.fish.front();
      ++t;
    }
    std::cout << "{\"event\":\"hatch\",\"t\":" << t << "}\n";
    double last_health = 0, last_age = 0;
    auto keep = [&]() {
      if (w.fish.empty())
        throw Death{false, last_health, last_age};
      p = &w.fish.front();
      last_health = p->body.health;
      last_age = p->body.age;
      p->body.energy = std::max(p->body.energy, reserve);
    };
    for (int k = 0; k < settle; ++k) {
      w.tick(false);
      keep();
    }
    // A fish raised in the aquarium grows up and learns to see; its trials then run without
    // other food, as do those with supply=0.
    if (raised || !supply)
      stop_supply();
    // Every LABTRACE steps of a shell trial: gap to the target, motion, bite, whether the target
    // shut or hid itself, its bearing, the smell of its kind, the signals by site and, with
    // LABEYE, every retinal cell and what lies in view (kind, feed pieces as -1).
    const auto approach = [&](int step, double gap, double x, double y, bool shut, int scent) {
      std::cout << "{\"event\":\"approach\",\"step\":" << step << ",\"gap\":" << gap
                << ",\"speed\":" << std::hypot(p->body.motor().vx, p->body.motor().vy)
                << ",\"forward\":" << p->body.motor().drive_forward
                << ",\"bite\":" << p->body.bite_signal << ",\"shut\":" << shut
                << ",\"angle\":" << bearing_to(w, p->body, x, y) * 180 / PI
                << ",\"odor\":" << w.field.odor_field(p->body.x, p->body.y)[scent]
                << ",\"sites\":{";
      bool first = true;
      for (const auto &[site, value] : sensed(p->body)) {
        std::cout << (first ? "" : ",") << '"' << site << "\":" << value;
        first = false;
      }
      std::cout << '}';
      if (std::getenv("LABEYE")) {
        std::cout << ",\"cells\":";
        eye_cells(*p);
        std::cout << ",\"near\":[";
        bool any = false;
        const auto near = [&](int kind, double nx, double ny, double radius) {
          const double d = std::hypot(w.field.delta_x(nx - p->body.x), ny - p->body.y);
          if (d > NEAR_VIEW)
            return;
          std::cout << (any ? "," : "") << '[' << kind << ','
                    << bearing_to(w, p->body, nx, ny) * 180 / PI << ',' << d << ',' << radius
                    << ']';
          any = true;
        };
        for (const auto &v : w.field.visible())
          if (v.x != p->body.x || v.y != p->body.y)
            near(v.kind, v.x, v.y, v.radius);
        for (const auto &f : w.field.feeding().pieces)
          if (f.energy > 0)
            near(-1, f.x, f.y, food_radius(f));
        std::cout << ']';
      }
      std::cout << "}\n";
    };
    // A target counts as cracked only when this fish's bite broke it where it last was; shells
    // also vanish when their time is up, their ground is gone or mud buries them.
    std::uint64_t seen_effect = w.next_combat_effect;
    const auto newly_cracked = [&](double x, double y, double radius) {
      bool hit = false;
      for (const auto &e : w.combat_effects)
        if (e.id >= seen_effect && e.kind == feeding_effect::crack && e.source == p->id &&
            std::hypot(w.field.delta_x(e.x - x), e.y - y) <= radius)
          hit = true;
      seen_effect = w.next_combat_effect;
      return hit;
    };
    if (mussel) {
      const auto &web = w.field.food_web();
      const auto find = [&](std::uint64_t id) -> const Mussel * {
        for (const auto &m : web.mussels)
          if (m.id == id && m.energy > 0)
            return &m;
        return nullptr;
      };
      std::vector<std::uint64_t> tried;
      for (int round = 0; round < rounds * MUSSEL_TRIALS; ++round) {
        keep();
        const Mussel *target = nullptr;
        for (const auto &m : web.mussels)
          if (m.energy > 0 && !m.closed && !m.buried &&
              std::find(tried.begin(), tried.end(), m.id) == tried.end()) {
            target = &m;
            break;
          }
        if (!target)
          break;
        tried.push_back(target->id);
        const auto found = web.patches.find(target->patch);
        if (found == web.patches.end())
          continue;
        const auto &surface = w.field.vegetation().surfaces[found->second];
        const std::uint64_t id = target->id;
        const int family = mussel_family(target->morph);
        // The surface just beside the shell is what the eye sees around it.
        const auto ground =
            w.field.surface_color(target->x - surface.normal.x, target->y - surface.normal.y);
        const double energy = target->energy,
                     hardness = w.field.env().hardness_mussel +
                                w.field.env().hardness_mussel_growth * energy /
                                    mussel_capacity(target->morph, w.field.env());
        auto &b = p->body;
        if (hungry)
          b.gut_fill = b.gut_energy = b.gut_digestible = 0;
        b.x = w.field.wrap_x(target->x + surface.normal.x * distance);
        b.y = target->y + surface.normal.y * distance;
        b.angle = std::atan2(-surface.normal.y, -surface.normal.x);
        const double eaten_before = p->observations().raw_diet[food_kind::mussel];
        const auto cycles = b.mouth.cycle;
        int reached = -1, closed = -1, cracked = -1, vanished = -1, step = 0;
        double nearest = distance;
        Course course{w, b.x, b.y, b.angle, path};
        const double shell_x = target->x, shell_y = target->y;
        double shell_radius = mussel_radius(target->energy, w.field.env(), target->morph);
        seen_effect = w.next_combat_effect;
        for (; step < trial; ++step) {
          w.tick(false);
          keep();
          course.record(step, p->body);
          const bool broken = newly_cracked(shell_x, shell_y, shell_radius);
          const Mussel *m = find(id);
          if (!m) {
            (broken ? cracked : vanished) = step;
            break;
          }
          shell_radius = mussel_radius(m->energy, w.field.env(), m->morph);
          const double mx = w.field.wrap_x(p->body.x +
                                           mouth_offset(p->body) * std::cos(p->body.angle)),
                       my = p->body.y + mouth_offset(p->body) * std::sin(p->body.angle),
                       gap = std::hypot(w.field.delta_x(m->x - mx), m->y - my) -
                             mussel_radius(m->energy, w.field.env(), m->morph);
          nearest = std::min(nearest, gap);
          if (reached < 0 && gap <= mouth_reach(p->body))
            reached = step;
          if (closed < 0 && m->closed)
            closed = step;
          if (trace_every && step % trace_every == 0)
            approach(step, gap, m->x, m->y, m->closed, odor_kind::mussels);
        }
        std::cout << "{\"event\":\"mussel\",\"family\":" << family << ",\"ground\":[" << ground[0]
                  << ',' << ground[1] << ',' << ground[2] << "],\"energy\":" << energy
                  << ",\"hardness\":" << hardness
                  << ",\"grind\":" << bite_force(p->body, BiteKind::grinding)
                  << ",\"reached\":" << reached << ",\"nearest\":" << nearest
                  << ",\"closed\":" << closed << ",\"cracked\":" << cracked
                  << ",\"vanished\":" << vanished << ",\"bites\":" << p->body.mouth.cycle - cycles
                  << ",\"eaten\":" << p->observations().raw_diet[food_kind::mussel] - eaten_before
                  << ",\"steps\":" << step;
        course.print(shell_x, shell_y);
        std::cout << "}\n";
      }
      return 0;
    }
    if (crab) {
      const auto &web = w.field.food_web();
      const auto find = [&](std::uint64_t id) -> const Crab * {
        for (const auto &c : web.crabs)
          if (c.id == id && c.energy > 0)
            return &c;
        return nullptr;
      };
      std::vector<std::uint64_t> tried;
      for (int round = 0; round < rounds * MUSSEL_TRIALS; ++round) {
        keep();
        const Crab *target = nullptr;
        for (const auto &c : web.crabs)
          if (c.energy > 0 && c.state == crab_state::foraging && c.crossing <= 0 &&
              std::find(tried.begin(), tried.end(), c.id) == tried.end()) {
            target = &c;
            break;
          }
        if (!target)
          break;
        tried.push_back(target->id);
        const auto found = web.patches.find(target->patch);
        if (found == web.patches.end())
          continue;
        const auto &surface = w.field.vegetation().surfaces[found->second];
        const std::uint64_t id = target->id;
        const double energy = target->energy,
                     hardness = w.field.env().hardness_crab +
                                w.field.env().hardness_crab_growth * energy /
                                    crab_capacity(target->morph, w.field.env());
        auto &b = p->body;
        if (hungry)
          b.gut_fill = b.gut_energy = b.gut_digestible = 0;
        b.x = w.field.wrap_x(target->x + surface.normal.x * distance);
        b.y = target->y + surface.normal.y * distance;
        b.angle = std::atan2(-surface.normal.y, -surface.normal.x);
        const double eaten_before = p->observations().raw_diet[food_kind::crab];
        const auto cycles = b.mouth.cycle;
        int reached = -1, fled = -1, buried = -1, cracked = -1, vanished = -1, step = 0;
        double nearest = distance, pinched = 0, health = b.health;
        Course course{w, b.x, b.y, b.angle, path};
        const double crab_x = target->x, crab_y = target->y;
        double last_x = crab_x, last_y = crab_y,
               last_radius = crab_radius(target->energy, w.field.env(), target->morph);
        seen_effect = w.next_combat_effect;
        for (; step < trial; ++step) {
          w.tick(false);
          keep();
          course.record(step, p->body);
          pinched += std::max(0., health - p->body.health);
          health = p->body.health;
          const bool broken = newly_cracked(last_x, last_y, last_radius);
          const Crab *c = find(id);
          if (!c) {
            (broken ? cracked : vanished) = step;
            break;
          }
          last_x = c->x;
          last_y = c->y;
          last_radius = crab_radius(c->energy, w.field.env(), c->morph);
          const double mx = w.field.wrap_x(p->body.x +
                                           mouth_offset(p->body) * std::cos(p->body.angle)),
                       my = p->body.y + mouth_offset(p->body) * std::sin(p->body.angle),
                       gap = std::hypot(w.field.delta_x(c->x - mx), c->y - my) -
                             crab_radius(c->energy, w.field.env(), c->morph);
          nearest = std::min(nearest, gap);
          if (reached < 0 && gap <= mouth_reach(p->body))
            reached = step;
          if (fled < 0 && c->state == crab_state::fleeing)
            fled = step;
          if (buried < 0 && crab_hidden(*c))
            buried = step;
          if (trace_every && step % trace_every == 0)
            approach(step, gap, c->x, c->y, crab_hidden(*c), odor_kind::benthos);
        }
        std::cout << "{\"event\":\"crab\",\"energy\":" << energy << ",\"hardness\":" << hardness
                  << ",\"grind\":" << bite_force(p->body, BiteKind::grinding)
                  << ",\"reached\":" << reached << ",\"nearest\":" << nearest
                  << ",\"fled\":" << fled << ",\"buried\":" << buried << ",\"cracked\":" << cracked
                  << ",\"vanished\":" << vanished << ",\"pinched\":" << pinched
                  << ",\"bites\":" << p->body.mouth.cycle - cycles
                  << ",\"eaten\":" << p->observations().raw_diet[food_kind::crab] - eaten_before
                  << ",\"steps\":" << step;
        course.print(crab_x, crab_y);
        std::cout << "}\n";
      }
      return 0;
    }
    const std::vector<double> bearings{0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180};
    for (int round = 0; round < rounds; ++round)
      for (double bearing : bearings) {
        keep();
        w.field.clear_food();
        auto &b = p->body;
        // A hungry fish starts each trial with an empty gut, as after a long search.
        if (hungry)
          b.gut_fill = b.gut_energy = b.gut_digestible = 0;
        const double a = b.angle + bearing * PI / 180;
        double x = w.field.wrap_x(b.x + distance * std::cos(a)),
               y = std::clamp(b.y + distance * std::sin(a), FOOD_MARGIN, TANK_HEIGHT - FOOD_MARGIN);
        // Keep the fish away from the walls between trials.
        if (b.y < WALL_MARGIN || b.y > TANK_HEIGHT - WALL_MARGIN) {
          b.y = TANK_HEIGHT / 2;
          y = std::clamp(b.y + distance * std::sin(a), FOOD_MARGIN, TANK_HEIGHT - FOOD_MARGIN);
        }
        for (int k = 0; k < cluster; ++k) {
          const double r = k ? spread * std::sqrt(w.rng.uniform()) : 0,
                       phi = 2 * PI * w.rng.uniform();
          Food piece{
              w.field.wrap_x(x + r * std::cos(phi)), y + r * std::sin(phi), 0, 0, 0, PIECE_ENERGY};
          piece.initial_energy = PIECE_ENERGY;
          piece.radius = food_radius(PIECE_ENERGY);
          if (plant) {
            piece.origin = food_type;
            piece.color = ALGAE_COLOR;
            piece.buoyancy = PLANT_BUOYANCY;
            piece.radius = tissue_radius(PIECE_ENERGY, PLANT_TISSUE_DENSITY);
          }
          w.field.append_fragment(piece);
        }
        {
          const double hx = p->body.x, hy = p->body.y, ha = p->body.angle;
          for (int k = 0; k < prewait; ++k) {
            w.tick(false);
            keep();
            p->body.x = hx;
            p->body.y = hy;
            p->body.angle = ha;
          }
        }
        const double eaten_before = p->observations().raw_diet[food_type];
        const double start_angle = b.angle;
        Course course{w, b.x, b.y, b.angle, path};
        double closest = distance, travelled = 0, turned_early = 0, forward = 0, turning = 0,
               pumping = 0, biting = 0;
        int steps = 0, reached = -1, near = 0, depleted = -1, left = -1;
        const double patch_x = x, patch_y = y;
        const auto bites_before = p->body.mouth.cycle;
        const double hold_x = p->body.x, hold_y = p->body.y, hold_angle = p->body.angle;
        for (; steps < trial; ++steps) {
          const double ox = p->body.x, oy = p->body.y;
          w.tick(false);
          keep();
          course.record(steps, p->body);
          if (hold) {
            p->body.x = hold_x;
            p->body.y = hold_y;
            p->body.angle = hold_angle;
          }
          if (trace_every && steps % trace_every == 0) {
            double nd = 1e9, nb = 0;
            for (const auto &f : w.field.feeding().pieces)
              if (f.energy > 0) {
                const double d = std::hypot(w.field.delta_x(f.x - p->body.x), f.y - p->body.y);
                if (d < nd) {
                  nd = d;
                  nb = bearing_to(w, p->body, f.x, f.y) * 180 / PI;
                }
              }
            // Gap between mouth and the nearest soft leaf, as a bite measures it.
            const double mx = w.field.wrap_x(p->body.x +
                                             mouth_offset(p->body) * std::cos(p->body.angle)),
                         my = p->body.y + mouth_offset(p->body) * std::sin(p->body.angle);
            double leaf = std::numeric_limits<double>::infinity();
            for (const auto &part : w.field.vegetation().plants)
              if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
                  part.energy > 0)
                leaf = std::min(
                    leaf,
                    std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx), part.y - my)));
            std::cout << "{\"event\":\"trace\",\"bearing\":" << bearing << ",\"step\":" << steps
                      << ",\"distance\":" << nd << ",\"to\":" << nb << ",\"leaf\":";
            optional_number(leaf);
            std::cout << ",\"reach\":" << mouth_reach(p->body)
                      << ",\"biteSignal\":" << p->body.bite_signal
                      << ",\"grind\":" << bite_force(p->body, BiteKind::grinding)
                      << ",\"plant\":" << p->observations().raw_diet[food_kind::plant]
                      << ",\"cycle\":" << p->body.mouth.cycle << ",\"gut\":" << gut_filling(p->body)
                      << ",\"turn\":" << p->body.motor().turn * 180 / PI << ",\"y\":" << p->body.y
                      << ",\"sediment\":" << p->body.sediment_coverage
                      << ",\"bladder\":" << p->body.bladder_fill << ",\"vy\":" << p->body.motor().vy
                      << ",\"angle\":" << p->body.angle * 180 / PI
                      << ",\"buoyancy\":" << p->body.buoyancy_force << ",\"sites\":{";
            bool first = true;
            for (const auto &[site, value] : sensed(p->body)) {
              std::cout << (first ? "" : ",") << '"' << site << "\":" << value;
              first = false;
            }
            std::cout << "}}\n";
          }
          if (std::getenv("LABEYE") && trace_every && steps % trace_every == 0) {
            double nd = std::numeric_limits<double>::infinity(), nb = 0;
            for (const auto &f : w.field.feeding().pieces)
              if (f.energy > 0) {
                const double d = std::hypot(w.field.delta_x(f.x - p->body.x), f.y - p->body.y);
                if (d < nd) {
                  nd = d;
                  nb = bearing_to(w, p->body, f.x, f.y) * 180 / PI;
                }
              }
            std::cout << "{\"event\":\"eye\",\"bearing\":" << bearing << ",\"step\":" << steps
                      << ",\"distance\":";
            optional_number(nd);
            std::cout << ",\"to\":" << nb << ",\"turn\":" << p->body.motor().turn * 180 / PI
                      << ",\"cells\":";
            eye_cells(*p);
            std::cout << "}\n";
          }
          // The jaw snaps shut in the step its strike begins.
          const bool closed = p->body.mouth.closing;
          if (std::getenv("LABBITE") && closed) {
            const auto &bb = p->body;
            const double mx = w.field.wrap_x(bb.x + mouth_offset(bb) * std::cos(bb.angle)),
                         my = bb.y + mouth_offset(bb) * std::sin(bb.angle);
            double nd = 1e9, nr = 0, ne = 0;
            for (const auto &f : w.field.feeding().pieces)
              if (f.energy > 0 &&
                  std::hypot(w.field.delta_x(f.x - mx), f.y - my) - food_radius(f) < nd) {
                nd = std::hypot(w.field.delta_x(f.x - mx), f.y - my) - food_radius(f);
                nr = food_radius(f);
                ne = f.energy;
              }
            std::cerr << "bite step " << steps << " gap " << nd << " pieceRadius " << nr
                      << " energy " << ne << " reach " << mouth_reach(bb) << " aperture "
                      << maximum_mouth_aperture(bb) << " cutForce " << bite_force(bb)
                      << " grindForce " << bite_force(bb, BiteKind::grinding) << " signal "
                      << bb.bite_signal << " eaten "
                      << p->observations().raw_diet[food_type] - eaten_before << " speed "
                      << std::hypot(bb.motor().vx, bb.motor().vy) << "\n";
          }
          forward += p->body.motor().drive_forward;
          turning += p->body.motor().drive_left - p->body.motor().drive_right;
          pumping += p->body.eat_signal;
          biting += p->body.bite_signal;
          travelled += std::hypot(w.field.delta_x(p->body.x - ox), p->body.y - oy);
          if (steps == SENSE_STEPS[0] || steps == SENSE_STEPS[1]) {
            const auto &binding = p->body.active_interface(p->genome);
            const auto seen = visual_stimuli(p->body, p->genome, w.field);
            std::array<double, 2> sum{}, peak{};
            std::array<int, 2> cells{};
            for (std::size_t i = 0; i < binding.sensory.size() && i < seen.size(); ++i)
              if (binding.sensory[i].visual() && !binding.sensory[i].proximity) {
                const int side = binding.sensory[i].lateral >= 0;
                sum[side] += seen[i];
                peak[side] = std::max(peak[side], double(seen[i]));
                ++cells[side];
              }
            {
              // Where each nostril draws its water from, as the fish's own smell cells do.
              const auto nose = nose_position(p->body),
                         flow = nose_flow(p->body, nose, w.field.water().velocity(nose.x, nose.y));
              const auto left = nostril_source(p->body, nose, flow, 0),
                         right = nostril_source(p->body, nose, flow, 1);
              std::cout << "{\"event\":\"smell\",\"step\":" << steps << ",\"bearing\":" << bearing
                        << ",\"left\":" << w.field.odor_field(left.x, left.y)[odor_type]
                        << ",\"right\":" << w.field.odor_field(right.x, right.y)[odor_type]
                        << ",\"nostrils\":" << std::hypot(left.x - right.x, left.y - right.y)
                        << ",\"profile\":[";
              for (double r : {0., 10., 20., 40., 80., 160.})
                std::cout << (r > 0 ? "," : "")
                          << w.field.odor_field(w.field.wrap_x(x + r), y)[odor_type];
              std::cout << "]}\n";
            }
            std::cout << "{\"event\":\"vision\",\"bearing\":" << bearing
                      << ",\"left\":" << (cells[0] ? sum[0] / cells[0] : 0)
                      << ",\"right\":" << (cells[1] ? sum[1] / cells[1] : 0)
                      << ",\"leftPeak\":" << peak[0] << ",\"rightPeak\":" << peak[1] << "}\n";
            std::cout << "{\"event\":\"sense\",\"step\":" << steps << ",\"bearing\":" << bearing
                      << ",\"sites\":{";
            bool first = true;
            for (const auto &[site, value] : sensed(p->body)) {
              std::cout << (first ? "" : ",") << '"' << site << "\":" << value;
              first = false;
            }
            std::cout << "}}\n";
          }
          if (steps == LINK_STEP && std::getenv("LABLINKS")) {
            std::cout << "{\"event\":\"links\",\"bearing\":" << bearing << ",\"links\":[";
            bool first = true;
            for (const auto &[key, l] : links(p->body)) {
              std::cout << (first ? "" : ",") << '[' << key.first << ',' << key.second << ','
                        << l[0] << ',' << l[1] << ']';
              first = false;
            }
            std::cout << "]}\n";
          }
          if (steps == EARLY_TURN_STEP)
            turned_early = std::remainder(p->body.angle - start_angle, 2 * PI) * 180 / PI;
          if (reached < 0 && p->observations().raw_diet[food_type] > eaten_before) {
            reached = steps;
            if (!stay)
              break;
          }
          double nearest = std::numeric_limits<double>::infinity();
          for (const auto &f : w.field.feeding().pieces)
            if (f.energy > 0)
              nearest =
                  std::min(nearest, std::hypot(w.field.delta_x(f.x - p->body.x), f.y - p->body.y));
          closest = std::min(closest, nearest);
          // A patch counts as used up once no piece remains near where it was laid out; the fish
          // has moved on once it is well beyond the patch after that.
          bool remaining = false;
          for (const auto &f : w.field.feeding().pieces)
            remaining |= f.energy > 0 && std::hypot(w.field.delta_x(f.x - patch_x), f.y - patch_y) <
                                             PATCH_REACH * spread;
          if (depleted < 0 && !remaining)
            depleted = steps;
          if (depleted >= 0 && left < 0 &&
              std::hypot(w.field.delta_x(p->body.x - patch_x), p->body.y - patch_y) >
                  distance + LEAVING * spread)
            left = steps;
          near += nearest < spread + NEAR_BODIES * body_radius(p->body);
        }
        double final_bearing = 0;
        for (const auto &f : w.field.feeding().pieces)
          if (f.energy > 0)
            final_bearing = bearing_to(w, p->body, f.x, f.y) * 180 / PI;
        std::cout << "{\"event\":\"trial\",\"round\":" << round << ",\"bearing\":" << bearing
                  << ",\"reached\":" << reached << ",\"closest\":" << closest
                  << ",\"turnedAt30\":" << turned_early << ",\"travelled\":" << travelled
                  << ",\"finalBearing\":" << final_bearing
                  << ",\"forward\":" << forward / (steps + 1)
                  << ",\"turning\":" << turning / (steps + 1)
                  << ",\"pumping\":" << pumping / (steps + 1)
                  << ",\"biting\":" << biting / (steps + 1)
                  << ",\"eaten\":" << p->observations().raw_diet[food_type] - eaten_before
                  << ",\"bites\":" << p->body.mouth.cycle - bites_before << ",\"near\":" << near
                  << ",\"maturity\":" << body_maturity(p->body) << ",\"depleted\":" << depleted
                  << ",\"left\":" << left << ",\"capacity\":["
                  << p->body.active_interface(p->genome).capacities[organ_port::forward] << ','
                  << p->body.active_interface(p->genome).capacities[organ_port::turn] << ','
                  << p->body.active_interface(p->genome).capacities[organ_port::suction] << ','
                  << p->body.active_interface(p->genome).capacities[organ_port::jaw] << ']';
        course.print(patch_x, patch_y);
        std::cout << "}\n";
      }
  } catch (const Death &death) {
    std::cout << "{\"event\":\"death\",\"egg\":" << death.egg << ",\"health\":" << death.health
              << ",\"age\":" << death.age << "}\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
