#include "durable_file.hh"
#include "body.hh"
#include "environment.hh"
#include "genome.hh"
#include "perception.hh"
#include "mutation_parameters.hh"
#include "physiology.hh"
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <thread>
#include <atomic>
#include <mutex>
#include <map>

namespace fishsim {
std::atomic<bool> cancelled{false};
std::uint64_t next_render_id() {
  static std::atomic<std::uint64_t> counter{0};
  return counter.fetch_add(1, std::memory_order_relaxed) + 1;
}
static_assert(std::atomic<bool>::is_always_lock_free, "Signal cancellation must be lock-free");
void mutate_cppn(Genome &, Rng &, double, bool, const MutationRates &);
Genome cross_cppn(const Genome &, const Genome &, Rng &, double, double, bool);
void Genome::mutate(Rng &r, double scale, bool develop, const MutationRates &rates) {
  if (scale > 0) {
    mutate_cppn(*this, r, scale, develop, rates);
    return;
  }
  if (develop && !blueprint)
    compile();
}
void Genome::discard_development() {
  blueprint.reset();
  interface.reset();
  growing.reset();
  growth_query.reset();
}
void Genome::begin_individual(Rng &r) {
  variation_seed = std::uint64_t(r.engine()) | 1;
  discard_development();
}
Genome Genome::cross(const Genome &a, const Genome &b, Rng &r, double fa, double fb, bool develop) {
  return cross_cppn(a, b, r, fa, fb, develop);
}
Genome Genome::load(const std::string &file) {
  std::ifstream in(file);
  if (!in)
    throw std::runtime_error("Genomdatei fehlt: " + file);
  Genome g = read(in);
  std::string extra;
  if (in >> extra)
    throw std::runtime_error("Unerwartete Daten im Genom");
  return g;
}
void Genome::save(const std::string &file) const {
  namespace fs = std::filesystem;
  fs::path target(file);
  if (!target.parent_path().empty())
    fs::create_directories(target.parent_path());
  const auto tmp = file + ".tmp";
  std::ofstream out(tmp);
  if (!out)
    throw std::runtime_error("Speichern fehlgeschlagen: " + file);
  write(out);
  out.close();
  if (!out)
    throw std::runtime_error("Schreibfehler: " + file);
  commit_file(tmp, target);
}
Point Field::food_cloud(int index) const {
  const int patch = (index % source_count() + source_count()) % source_count();
  const auto &p = feeding_.clouds[patch].position;
  return {p.x * geometry_.width, p.y * geometry_.height};
}
Field::Field(std::uint64_t seed, int count) : rng(seed) {
  refresh_niche_limits();
  feeding_.density = count;
  set_energy_headroom(energy_limit());
  add(count);
}
void Field::supply_food(Point center, double spread, int count, const FoodSupply &supply) {
  count = std::min(count, std::max(0, int(supply.limit) - int(food_count())));
  for (int i = 0; i < count && feeding_.food_allowance >= supply.minimum; ++i) {
    for (int attempt = 0; attempt < 30; ++attempt) {
      const double x = wrap_x(center.x + rng.uniform(-spread, spread)),
                   y = std::clamp(center.y + rng.uniform(-spread, spread), 2.,
                                  geometry_.height - 2),
                   u = rng.uniform(),
                   energy = std::min(supply.minimum + (supply.maximum - supply.minimum) * u * u,
                                     feeding_.food_allowance);
      if (free(x, y, food_radius(energy))) {
        place_food(x, y, 0, 0, energy);
        break;
      }
    }
  }
}
void Field::add(int count) {
  add(count, food_supply());
}
void Field::add(int count, const FoodSupply &supply) {
  count = std::min(count,
                   int(std::min(20000., std::max(0., feeding_.food_allowance) / supply.minimum)));
  while (count > 0 && feeding_.food_allowance >= supply.minimum &&
         food_count() < std::size_t(supply.limit)) {
    const int cluster = std::min(count, std::max(1, int(supply.cluster))),
              first = rng.index(source_count());
    const auto before = food_count();
    for (int k = 0; k < source_count() && food_count() == before; ++k) {
      const int source = (first + k) % source_count();
      double content = 0;
      for (const auto &piece : feeding_.pieces)
        if (piece.origin == 0 && piece.cloud == source)
          content += piece.energy;
      const double allowance = feeding_.food_allowance, supplied = feeding_.food_supplied;
      feeding_.food_allowance =
          std::min(allowance, std::max(0., niche_limit(0) / source_count() - content));
      const auto start = feeding_.pieces.size();
      supply_food(food_cloud(source), feeding_.food_spread, cluster, supply);
      for (std::size_t at = start; at < feeding_.pieces.size(); ++at)
        feeding_.pieces[at].cloud = source;
      feeding_.food_allowance = allowance - (feeding_.food_supplied - supplied);
    }
    count -= cluster;
    if (food_count() == before)
      break;
  }
}
double Field::draw_food_energy() {
  return feeding_.draw_energy(rng);
}
void Field::place_food(double x, double y, double vx, double vy, double e) {
  const double r = food_radius(e);
  x = wrap_x(x);
  y = std::clamp(y, r, geometry_.height - r);
  if (e < env_.crumb_min || e > feeding_.food_allowance || !free(x, y, r))
    return;
  feeding_.pieces.push_back({x, y, vx, vy, 0, e});
  feeding_.pieces.back().initial_energy = e;
  feeding_.pieces.back().radius = r;
  feeding_.food_allowance -= e;
  energy_available = std::max(0., energy_available - e);
  feeding_.food_supplied += e;
}
void Field::top_up() {
  top_up(food_supply());
}
void Field::top_up(FoodSupply supply) {
  for (double value :
       {supply.rate, supply.minimum, supply.maximum, supply.cluster, supply.limit, supply.factor})
    if (!std::isfinite(value) || value < 0)
      throw std::invalid_argument("invalid food supply");
  if (supply.minimum <= 0 || supply.minimum > supply.maximum)
    throw std::invalid_argument("invalid food range");
  const double mean = supply.minimum + (supply.maximum - supply.minimum) / 3;
  double feeder_weight = 0;
  for (const auto &f : feeding_.feeders)
    feeder_weight += f.rate;
  if (source_count() + feeder_weight <= 0)
    return;
  // Whole grains are sampled at their expected rate; never trim them to a small step budget.
  const auto cluster = std::max<std::size_t>(1, std::lround(supply.cluster));
  const double expected = supply.rate / cluster;
  const std::size_t events =
      std::size_t(expected) + (rng.uniform() < expected - std::floor(expected));
  std::size_t remaining = std::size_t(std::max(0., supply.limit - food_count()));
  for (std::size_t event = 0; event < events && remaining; ++event) {
    const double pick = rng.uniform() * (source_count() + feeder_weight);
    Point center{};
    double spread = feeding_.food_spread;
    int cloud = -1;
    if (pick < source_count()) {
      cloud = int(pick);
      center = food_cloud(cloud);
    } else {
      double sum = source_count();
      for (const auto &f : feeding_.feeders) {
        sum += f.rate;
        if (pick < sum) {
          center = {f.x, f.y};
          spread = f.radius;
          break;
        }
      }
    }
    const auto count = std::min(cluster, remaining);
    remaining -= count;
    for (std::size_t k = 0; k < count; ++k) {
      const double u = rng.uniform(),
                   amount = supply.minimum + (supply.maximum - supply.minimum) * u * u;
      FoodSupply portion = supply;
      portion.minimum = portion.maximum = amount;
      const double assisted =
          supply.rate * mean > 0
              ? std::clamp(1 - artificial_supply() / (supply.rate * mean), 0., 1.)
              : 0;
      request_production(
          amount, [this, center, spread, cloud, portion, amount, assisted](double grant) {
            if (grant + 1e-9 < amount || feeding_.food_allowance + 1e-9 < amount)
              return 0.;
            const double before = feeding_.food_supplied, allowance = feeding_.food_allowance;
            const auto first = feeding_.pieces.size();
            feeding_.food_allowance = amount;
            supply_food(center, spread, 1, portion);
            const double spent = feeding_.food_supplied - before;
            feeding_.food_allowance = std::max(0., allowance - spent);
            if (feeding_.pieces.size() > first)
              feeding_.pieces.back().cloud = cloud;
            feeding_.food_assisted += assisted * spent;
            return spent;
          });
    }
  }
}

bool bite_reaches(const Body &b, const Field &f, double x, double y, double tx, double ty,
                  double radius, double allowed_reach) {
  const double mouth = mouth_offset(b);
  x += mouth * std::cos(b.angle);
  y += mouth * std::sin(b.angle);
  double endx = b.x + mouth * std::cos(b.angle), endy = b.y + mouth * std::sin(b.angle);
  double dx = f.delta_x(endx - x), dy = endy - y;
  double fx = f.delta_x(tx - x), fy = ty - y,
         reach = (allowed_reach < 0 ? mouth_reach(b) : allowed_reach) + radius;
  if (fx < std::min(0., dx) - reach || fx > std::max(0., dx) + reach ||
      fy < std::min(0., dy) - reach || fy > std::max(0., dy) + reach)
    return false;
  double length = dx * dx + dy * dy,
         t = length ? std::clamp((fx * dx + fy * dy) / length, 0., 1.) : 0, ex = fx - t * dx,
         ey = fy - t * dy;
  if (ex * ex + ey * ey > reach * reach)
    return false;
  {
    double distance = std::hypot(ex, ey);
    if (distance > 0 &&
        f.ray(x + t * dx, y + t * dy, ex / distance, ey / distance) < distance - radius)
      return false;
  }
  return true;
}
int behavior_niche(double speed, double turn, double pauses) {
  int s = speed < 1.3 ? 0 : (speed < 2.6 ? 1 : 2),
      curve = turn < .01 ? 0 : (turn < .035 ? 1 : (turn < .08 ? 2 : 3));
  return s * 8 + curve * 2 + (pauses >= .25 ? 1 : 0);
}
}
