#include "wording.hh"
#include "food_state.hh"
#include "random.hh"
#include "physiology.hh"
#include "environment.hh"
#include <stdexcept>
namespace fishsim {
namespace {
constexpr int START_FOOD_TRIALS = 64;
constexpr double START_FOOD_MIN = 12, START_FOOD_MAX = 42, FOOD_CLEARANCE = 1;
constexpr double CLOUD_CENTER = .5, CLOUD_SPAN = .38, CLOUD_TOP = .18, CLOUD_DEPTH = .42,
                 CLOUD_PHASE = 1.7, CLOUD_WAVE = 3;
constexpr int MAX_SPRAY_COUNT = edit_limit::max_spray_count;
constexpr double MAX_SPRAY_RADIUS = edit_limit::max_spray_radius, MAX_ENERGY_SUPPLY = .01;
constexpr double CLOUD_CLEARANCE = 2, CLOUD_SEARCH = 4, SOURCE_MOTION_UNIT = 1000;
constexpr int CLOUD_DIRECTIONS = 32;
constexpr std::uint64_t CLOUD_TURN_PERIOD = 4096, CLOUD_TURN_OFFSET = 431;
constexpr double SOURCE_CLEARANCE = 1;
constexpr int SETTLE_ROUNDS = 3;
}
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
  return std::count_if(pieces.begin(), pieces.end(),
                       [](const Food &f) { return f.origin == food_kind::feed; });
}
Color FoodState::color(const Food &f, double half_life) const {
  if (f.origin == food_kind::feed)
    return FEED_COLOR;
  if (f.origin <= food_kind::carrion || f.origin >= food_kind::plankton)
    return corpse_color(f.color, f.decay_age, f.energy, food_bright, half_life);
  return f.color;
}
double FoodState::draw_energy(Rng &rng) {
  if (food_max <= food_min)
    return food_min;
  double u = rng.uniform();
  return quadratic_draw(food_min, food_max, u);
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
    if (food.origin != food_kind::feed)
      continue;
    const auto egg = eggs[n++ % eggs.size()];
    for (int trial = 0; trial < START_FOOD_TRIALS; ++trial) {
      const double angle = rng.uniform(0, 2 * PI),
                   distance = rng.uniform(START_FOOD_MIN, START_FOOD_MAX);
      const Point p{wrap_x(egg.x + distance * std::cos(angle)), egg.y + distance * std::sin(angle)};
      const double radius = food_radius(food);
      if (!free(p.x, p.y, radius + FOOD_CLEARANCE) || sediment_immersion(p.x, p.y, radius) > 0)
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
  if (piece.energy <= tolerance::negligible && indexed_)
    feeding_.consumed.at(index) = 1;
}
void Field::consume_food(std::size_t index) {
  feeding_.pieces.at(index).energy = 0;
  if (indexed_)
    feeding_.consumed.at(index) = 1;
}
void Field::configure_seed_food(int count) {
  feeding_.density = std::clamp(count, 0, run_limit::max_food);
}
void Field::place_initial_food() {
  add(feeding_.density);
  feeding_.food_initial = feeding_.food_supplied;
  sync_food_web();
  prepare_plankton_sources();
  if (plankton_supply() > 0 && !food_web_.plankton.sources.empty()) {
    const double target = env_.plankton_seed_threshold * niche_limit(food_kind::plankton);
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
          {CLOUD_CENTER + CLOUD_SPAN * std::sin(i * 2 * PI / count),
           CLOUD_TOP + CLOUD_DEPTH * (1 + std::sin(CLOUD_PHASE + CLOUD_WAVE * i)) / 2},
          rng.uniform(-PI, PI),
          0};
    for (auto &piece : feeding_.pieces)
      if (piece.cloud >= count)
        piece.cloud = -1;
  }
  niche_limits_.fill(0);
  niche_limits_[food_kind::feed] = energy_supply() * env_.food_supply_share * env_.food_half_life;
  niche_limits_[food_kind::fish] = env_.fish_energy_density * area;
  niche_limits_[food_kind::plankton] =
      env_.plankton_limit *
      (food_web_.plankton.water_area > 0 ? food_web_.plankton.water_area : area);
  double sediment = 0, bare = 0;
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    const auto &s = vegetation_.surfaces[i];
    niche_limits_[food_kind::plant] += grass_capacity(s);
    const auto depth = sediment_edges(i);
    if (depth[0] <= tolerance::negligible && depth[1] <= tolerance::negligible) {
      niche_limits_[food_kind::algae] += algae_capacity(s);
      bare += s.length;
    }
    if (s.normal.y <= -seabed::floor_normal && sediment_depth(s) >= env_.burrow_depth)
      sediment += s.length;
  }
  niche_limits_[food_kind::worm] = env_.worm_max * sediment;
  niche_limits_[food_kind::crab] = std::floor(sediment / env_.crab_spacing) * env_.crab_energy;
  niche_limits_[food_kind::mussel] = std::floor(bare / env_.mussel_spacing) * env_.mussel_energy;
  feeding_.food_energy_limit = niche_limits_[food_kind::feed];
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
  feeding_.food_allowance =
      std::min(available, std::max(0., niche_limit(food_kind::feed) - food_energy()));
}
FoodSupply Field::food_supply() const {
  const double mean = quadratic_draw_mean(feeding_.food_min, feeding_.food_max);
  return {artificial_supply() / mean,
          feeding_.food_min,
          feeding_.food_max,
          feeding_.food_cluster,
          niche_limit(food_kind::feed) / feeding_.food_min,
          feeding_.feeding_factor};
}
std::size_t Field::manual_feed(double x, double y, int count, double radius) {
  const auto before = feeding_.pieces.size();
  const double supplied = feeding_.food_supplied;
  spray(x, y, std::clamp(count, 1, MAX_SPRAY_COUNT), std::clamp(radius, 1., MAX_SPRAY_RADIUS));
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
    env_.energy_supply = std::clamp(value, 0., MAX_ENERGY_SUPPLY);
    refresh_niche_limits();
  }
}
void Field::fit_food_clouds() {
  for (int i = 0; i < source_count(); ++i) {
    const auto p = food_cloud(i);
    auto water = [&](Point q) {
      return free(q.x, q.y, CLOUD_CLEARANCE) && sediment_immersion(q.x, q.y, CLOUD_CLEARANCE) == 0;
    };
    if (water(p))
      continue;
    bool found = false;
    for (double distance = CLOUD_SEARCH;
         distance < std::hypot(geometry_.width, geometry_.height) && !found;
         distance += CLOUD_SEARCH)
      for (int j = 0; j < CLOUD_DIRECTIONS; ++j) {
        const double a = j * 2 * PI / CLOUD_DIRECTIONS;
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
  const double speed = feeding_.source_motion / SOURCE_MOTION_UNIT;
  if (speed <= 0)
    return;
  for (int i = 0; i < source_count(); ++i) {
    auto &cloud = feeding_.clouds[i];
    if ((time + CLOUD_TURN_OFFSET * i) % CLOUD_TURN_PERIOD == 0)
      cloud.turn = rng.uniform(-MAX_CLOUD_TURN, MAX_CLOUD_TURN);
    cloud.angle = std::remainder(cloud.angle + cloud.turn, 2 * PI);
    const auto p = food_cloud(i);
    const Point q{wrap_x(p.x + speed * std::cos(cloud.angle)), p.y + speed * std::sin(cloud.angle)};
    if (free(q.x, q.y, CLOUD_CLEARANCE) && sediment_immersion(q.x, q.y, CLOUD_CLEARANCE) == 0)
      cloud.position = {q.x / geometry_.width, q.y / geometry_.height};
    else {
      cloud.angle = std::remainder(cloud.angle + PI + rng.uniform(-PI / 2, PI / 2), 2 * PI);
      cloud.turn = 0;
    }
  }
}
void Field::set_food_density(int value) {
  feeding_.density = std::clamp(value, 0, run_limit::max_food);
}
void Field::set_current_source(int index, double x, double y, double angle, double width,
                               double strength) {
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(angle) || !std::isfinite(width) ||
      !std::isfinite(strength) || !free(x, y, SOURCE_CLEARANCE) ||
      width < source_limits::min_width || width > source_limits::max_width || strength < 0 ||
      strength > source_limits::max_strength || index < -1 || index >= int(currents_.size()))
    throw Refusal("invalidCurrentSource");
  CurrentSource source{wrap_x(x), y, std::remainder(angle, 2 * PI), width, strength};
  if (index < 0) {
    if (currents_.size() >= source_limits::max_count)
      throw Refusal("sourceLimit");
    currents_.push_back(source);
  } else {
    source.noise = currents_[index].noise;
    currents_[index] = source;
  }
}
void Field::set_feeder(int index, double x, double y, double rate, double radius) {
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(rate) || !std::isfinite(radius) ||
      !free(x, y, SOURCE_CLEARANCE) || rate < 0 || rate > source_limits::max_feeder_rate ||
      radius < source_limits::min_feeder_radius || radius > source_limits::max_feeder_radius)
    throw Refusal("invalidFeeder");
  if (index < -1 || index >= int(feeding_.feeders.size()))
    throw Refusal("feederMissing");
  Feeder source{wrap_x(x), y, radius, rate};
  if (index < 0) {
    if (feeding_.feeders.size() >= source_limits::max_count)
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
                                                 q.radius + source_limits::erase_margin;
                                        }),
                         feeding_.feeders.end());
  return before - feeding_.feeders.size();
}
std::size_t Field::erase_current(double x, double y) {
  const auto before = currents_.size();
  currents_.erase(std::remove_if(currents_.begin(), currents_.end(),
                                 [&](const CurrentSource &q) {
                                   return std::hypot(delta_x(q.x - x), q.y - y) <
                                          q.width / 2 + source_limits::erase_margin;
                                 }),
                  currents_.end());
  return before - currents_.size();
}

}

namespace fishsim {
void Field::begin_production() {
  production.clear();
  leftover.clear();
  production_pending = true;
}
void Field::request_production(double amount, std::function<double(double)> apply) {
  if (amount <= 0)
    return;
  if (production_pending)
    production.push_back({amount, std::move(apply)});
  else
    apply(std::min(amount, energy_available));
}
void Field::request_leftover(double amount, std::function<double(double)> apply) {
  if (amount <= 0)
    return;
  if (production_pending)
    leftover.push_back({amount, std::move(apply)});
  else
    apply(std::min(amount, std::max(0., energy_available)));
}
void Field::finish_production() {
  production_pending = false;
  for (int round = 0; round < SETTLE_ROUNDS && energy_available > tolerance::negligible; ++round) {
    double total = 0;
    for (const auto &p : production)
      total += p.remaining;
    if (total <= tolerance::negligible)
      break;
    const double ratio = std::min(1., energy_available / total);
    double used = 0;
    for (auto &p : production) {
      if (p.remaining <= 0)
        continue;
      const double grant = std::min(energy_available, p.remaining * ratio);
      const double accepted = std::clamp(p.apply(grant), 0., grant);
      used += accepted;
      p.remaining -= accepted;
      if (accepted <= tolerance::negligible)
        p.remaining = 0;
    }
    if (used <= tolerance::negligible)
      break;
  }
  production.clear();
  for (auto &p : leftover)
    p.apply(std::min(p.remaining, std::max(0., energy_available)));
  leftover.clear();
  // grow_plants reserved this step's sample before the shared budget was settled.
  if (!vegetation_.growth_history.empty())
    vegetation_.growth_history.back() = {vegetation_.algae_added, vegetation_.grass_added};
  index_plants(true);
}
}
