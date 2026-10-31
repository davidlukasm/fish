#include "wording.hh"
#include "food_state.hh"
#include "random.hh"
#include "physiology.hh"
#include "environment.hh"
#include <stdexcept>
namespace fishsim {
double FoodState::energy_from(int origin) const {
  double total = 0;
  for (const auto &f : pieces)
    if (f.origin == origin)
      total += f.energy;
  return total;
}
double FoodState::energy() const {
  return energy_from(0);
}
std::size_t FoodState::count() const {
  return std::count_if(pieces.begin(), pieces.end(), [](const Food &f) { return f.origin == 0; });
}
std::array<double, 3> FoodState::color(const Food &f, double half_life) const {
  if (f.origin == 0)
    return {1, .2, .1};
  if (f.origin <= 3 || f.origin >= 6)
    return corpse_color(f.color, f.decay_age, f.energy, food_bright, half_life);
  return f.color;
}
double FoodState::draw_energy(Rng &rng) {
  if (food_max <= food_min)
    return food_min;
  double u = rng.uniform();
  return food_min + (food_max - food_min) * u * u;
}
bool Field::draw_food(std::size_t index, double x, double y, double travel, double arrival) {
  auto &piece = feeding_.pieces.at(index);
  const double dx = delta_x(x - piece.x), dy = y - piece.y, distance = std::hypot(dx, dy);
  if (distance <= arrival)
    return true;
  travel = std::min(distance, travel);
  if (ray(piece.x, piece.y, dx / distance, dy / distance) < travel - food_radius(piece))
    return false;
  piece.x = wrap_x(piece.x + dx / distance * travel);
  piece.y += dy / distance * travel;
  return distance - travel <= arrival;
}
void Field::distribute_start_food(const std::vector<Point> &eggs) {
  if (eggs.empty())
    return;
  std::size_t n = 0;
  for (auto &food : feeding_.pieces) {
    if (food.origin != 0)
      continue;
    const auto egg = eggs[n++ % eggs.size()];
    for (int trial = 0; trial < 64; ++trial) {
      const double angle = rng.uniform(0, 2 * PI), distance = rng.uniform(12, 42);
      const Point p{wrap_x(egg.x + distance * std::cos(angle)), egg.y + distance * std::sin(angle)};
      const double radius = food_radius(food);
      if (!free(p.x, p.y, radius + 1) || sediment_immersion(p.x, p.y, radius) > 0)
        continue;
      food.x = p.x;
      food.y = p.y;
      food.vx = food.vy = 0;
      food.bottom_steps = 0;
      break;
    }
  }
  indexed_ = false;
}
void Field::append_fragment(const Food &piece) {
  if (!std::isfinite(piece.energy) || piece.energy <= 0 || !std::isfinite(piece.radius) ||
      piece.radius <= 0)
    throw std::invalid_argument("invalid food fragment");
  if (piece.energy < crumb_limit(piece)) {
    deposit_detritus(piece.x, piece.y, piece.energy, piece.radius);
    return;
  }
  const auto id = std::uint32_t(feeding_.pieces.size());
  feeding_.pieces.push_back(piece);
  auto &added = feeding_.pieces.back();
  if (rests_on_sediment({added.x, added.y}, added.radius)) {
    added.vx = added.vy = 0;
    added.bottom_steps = 1;
  }
  if (indexed_) {
    feeding_.consumed.push_back(0);
    feeding_.grid.add(piece.x, piece.y, id);
    feeding_.indexed_food_radius = std::max(feeding_.indexed_food_radius, piece.radius);
  }
}
void Field::bite_food(std::size_t index, double amount, bool fish_bite) {
  auto &piece = feeding_.pieces.at(index);
  if (!std::isfinite(amount) || amount < 0 || amount > piece.energy)
    throw std::invalid_argument("invalid food bite");
  const double energy = piece.energy, radius = food_radius(piece);
  if (amount <= 0)
    return;
  piece.bitten = piece.bitten || fish_bite;
  piece.energy -= amount;
  piece.radius = energy > 0 ? radius * std::sqrt(std::max(0., 1 - amount / energy)) : 0;
  if (piece.energy < crumb_limit(piece)) {
    deposit_detritus(piece.x, piece.y, piece.energy, piece.radius);
    piece.energy = 0;
    piece.radius = 0;
  }
  if (piece.energy <= 1e-9 && indexed_)
    feeding_.consumed.at(index) = 1;
}
void Field::consume_food(std::size_t index) {
  feeding_.pieces.at(index).energy = 0;
  if (indexed_)
    feeding_.consumed.at(index) = 1;
}
void Field::configure_seed_food(int count) {
  feeding_.density = std::clamp(count, 0, 20000);
}
void Field::place_initial_food() {
  add(feeding_.density);
  feeding_.food_initial = feeding_.food_supplied;
  sync_food_web();
  prepare_plankton_sources();
  if (plankton_supply() > 0 && !food_web_.plankton.sources.empty()) {
    const double target = env_.plankton_seed_threshold * niche_limit(6);
    food_web_.initial += supply_plankton(target, target / food_web_.plankton.sources.size());
  }
}
void Field::refresh_niche_limits() {
  sync_food_web();
  refresh_algae_exposure();
  const double area = geometry_.width * geometry_.height;
  const int count = std::max(1, int(std::round(area * env_.cloud_density)));
  if (source_count() != count) {
    const int old = source_count();
    feeding_.clouds.resize(count);
    for (int i = old; i < count; ++i)
      feeding_.clouds[i] = {
          {.5 + .38 * std::sin(i * 2 * PI / count), .18 + .42 * (.5 + .5 * std::sin(1.7 + 3 * i))},
          rng.uniform(-PI, PI),
          0};
    for (auto &piece : feeding_.pieces)
      if (piece.cloud >= count)
        piece.cloud = -1;
  }
  niche_limits_.fill(0);
  niche_limits_[0] = energy_supply() * env_.food_supply_share * env_.food_half_life;
  niche_limits_[1] = env_.fish_energy_density * area;
  niche_limits_[6] = env_.plankton_limit *
                     (food_web_.plankton.water_area > 0 ? food_web_.plankton.water_area : area);
  double sediment = 0, bare = 0;
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    const auto &s = vegetation_.surfaces[i];
    niche_limits_[5] += grass_capacity(s);
    const auto depth = sediment_edges(i);
    if (depth[0] <= 1e-9 && depth[1] <= 1e-9) {
      niche_limits_[4] += algae_capacity(s);
      bare += s.length;
    }
    if (s.normal.y <= -.5 && sediment_depth(s) >= env_.burrow_depth)
      sediment += s.length;
  }
  niche_limits_[7] = env_.worm_max * sediment;
  niche_limits_[8] = std::floor(sediment / env_.crab_spacing) * env_.crab_energy;
  niche_limits_[9] = std::floor(bare / env_.mussel_spacing) * env_.mussel_energy;
  feeding_.food_energy_limit = niche_limits_[0];
}
double Field::energy_limit() const {
  double sum = 0;
  for (double value : niche_limits_)
    sum += value;
  return sum;
}
void Field::set_energy_headroom(double available) {
  if (!std::isfinite(available) || available < 0)
    throw std::invalid_argument("invalid energy headroom");
  energy_available = available;
  supply_scale_ = energy_supply() > 0 ? std::min(1., available / energy_supply()) : 0;
  feeding_.food_allowance = std::min(available, std::max(0., niche_limit(0) - food_energy()));
}
FoodSupply Field::food_supply() const {
  const double mean = feeding_.food_min + (feeding_.food_max - feeding_.food_min) / 3;
  return {artificial_supply() / mean,
          feeding_.food_min,
          feeding_.food_max,
          feeding_.food_cluster,
          niche_limit(0) / feeding_.food_min,
          feeding_.feeding_factor};
}
std::size_t Field::manual_feed(double x, double y, int count, double radius) {
  const auto before = feeding_.pieces.size();
  const double supplied = feeding_.food_supplied;
  spray(x, y, std::clamp(count, 1, 100), std::clamp(radius, 1., 100.));
  feeding_.food_manual += feeding_.food_supplied - supplied;
  return feeding_.pieces.size() - before;
}
std::size_t Field::clear_food() {
  const auto count = feeding_.pieces.size();
  feeding_.pieces.clear();
  indexed_ = false;
  return count;
}
std::size_t Field::erase_food(double x, double y, double radius) {
  const auto count = feeding_.pieces.size();
  feeding_.pieces.erase(std::remove_if(feeding_.pieces.begin(), feeding_.pieces.end(),
                                       [&](const Food &p) {
                                         return std::hypot(delta_x(p.x - x), p.y - y) <= radius;
                                       }),
                        feeding_.pieces.end());
  indexed_ = false;
  return count - feeding_.pieces.size();
}
void Field::set_energy_supply(double value) {
  if (std::isfinite(value)) {
    env_.energy_supply = std::clamp(value, 0., .01);
    refresh_niche_limits();
  }
}
void Field::fit_food_clouds() {
  for (int i = 0; i < source_count(); ++i) {
    const auto p = food_cloud(i);
    auto water = [&](Point q) { return free(q.x, q.y, 2) && sediment_immersion(q.x, q.y, 2) == 0; };
    if (water(p))
      continue;
    bool found = false;
    for (double distance = 4; distance < std::hypot(geometry_.width, geometry_.height) && !found;
         distance += 4)
      for (int j = 0; j < 32; ++j) {
        const double a = j * 2 * PI / 32;
        const Point q{wrap_x(p.x + distance * std::cos(a)), p.y + distance * std::sin(a)};
        if (water(q)) {
          feeding_.clouds[i].position = {q.x / geometry_.width, q.y / geometry_.height};
          found = true;
          break;
        }
      }
  }
}
void Field::advance_food_clouds() {
  const double speed = feeding_.source_motion / 1000;
  if (speed <= 0)
    return;
  for (int i = 0; i < source_count(); ++i) {
    auto &cloud = feeding_.clouds[i];
    if ((time + 431 * i) % 4096 == 0)
      cloud.turn = rng.uniform(-.00003, .00003);
    cloud.angle = std::remainder(cloud.angle + cloud.turn, 2 * PI);
    const auto p = food_cloud(i);
    const Point q{wrap_x(p.x + speed * std::cos(cloud.angle)), p.y + speed * std::sin(cloud.angle)};
    if (free(q.x, q.y, 2) && sediment_immersion(q.x, q.y, 2) == 0)
      cloud.position = {q.x / geometry_.width, q.y / geometry_.height};
    else {
      cloud.angle = std::remainder(cloud.angle + PI + rng.uniform(-PI / 2, PI / 2), 2 * PI);
      cloud.turn = 0;
    }
  }
}
void Field::set_food_density(int value) {
  feeding_.density = std::clamp(value, 0, 10000);
}
void Field::set_current_source(int index, double x, double y, double angle, double width,
                               double strength) {
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(angle) || !std::isfinite(width) ||
      !std::isfinite(strength) || !free(x, y, 1) || width < 32 || width > 600 || strength < 0 ||
      strength > 6 || index < -1 || index >= int(currents_.size()))
    throw Refusal("invalidCurrentSource");
  CurrentSource source{wrap_x(x), y, std::remainder(angle, 2 * PI), width, strength};
  if (index < 0) {
    if (currents_.size() >= 64)
      throw Refusal("sourceLimit");
    currents_.push_back(source);
  } else {
    source.noise = currents_[index].noise;
    currents_[index] = source;
  }
}
void Field::set_feeder(int index, double x, double y, double rate, double radius) {
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(rate) || !std::isfinite(radius) ||
      !free(x, y, 1) || rate < 0 || rate > 100 || radius < 1 || radius > 120)
    throw Refusal("invalidFeeder");
  if (index < -1 || index >= int(feeding_.feeders.size()))
    throw Refusal("feederMissing");
  Feeder source{wrap_x(x), y, radius, rate};
  if (index < 0) {
    if (feeding_.feeders.size() >= 64)
      throw Refusal("sourceLimit");
    feeding_.feeders.push_back(source);
  } else
    feeding_.feeders[index] = source;
}
std::size_t Field::erase_feeder(double x, double y) {
  const auto before = feeding_.feeders.size();
  feeding_.feeders.erase(std::remove_if(feeding_.feeders.begin(), feeding_.feeders.end(),
                                        [&](const Feeder &q) {
                                          return std::hypot(delta_x(q.x - x), q.y - y) <
                                                 q.radius + 10;
                                        }),
                         feeding_.feeders.end());
  return before - feeding_.feeders.size();
}
std::size_t Field::erase_current(double x, double y) {
  const auto before = currents_.size();
  currents_.erase(std::remove_if(currents_.begin(), currents_.end(),
                                 [&](const CurrentSource &q) {
                                   return std::hypot(delta_x(q.x - x), q.y - y) < q.width * .5 + 10;
                                 }),
                  currents_.end());
  return before - currents_.size();
}

}
