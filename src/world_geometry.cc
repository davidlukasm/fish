#include "wording.hh"
#include "maturation_cache.hh"
#include "ecology.hh"
#include "physiology.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "ecology_internal.hh"
#include <istream>
#include <ostream>
#include <iomanip>
#include <stdexcept>
#include <set>
#include <map>
#include <sstream>
#include <numeric>
#include <limits>
#include <chrono>
namespace fishsim {
namespace {
// Obstacles: radius bounds, coordinate bound, pick margin for erasing and moving.
constexpr double MIN_OBSTACLE_RADIUS = 1, MAX_OBSTACLE_RADIUS = 10000, MAX_COORDINATE = 1000000,
                 PICK_MARGIN = 8;
// Drifting grass keeps DRIFT_EDGE from the top and bottom after a resize.
constexpr double DRIFT_EDGE = .4;
// A placed rock has ROCK_POINTS points with a radius varying by ROCK_ROUGHNESS; a round obstacle
// becomes a polygon of ROUND_POINTS points when moved; walls are at least MIN_WALL_LENGTH long.
constexpr int ROCK_POINTS = 9, ROUND_POINTS = 12;
constexpr double ROCK_ROUGHNESS = .2, ROCK_ROUGHNESS_PHASE = 13, MIN_WALL_LENGTH = 4;
bool valid_radius(double radius) {
  return std::isfinite(radius) && radius >= MIN_OBSTACLE_RADIUS && radius <= MAX_OBSTACLE_RADIUS;
}
}
void Field::finish_resize() {
  this->sync_environment();
  sync_food_web();
  refresh_niche_limits();
  for (auto &d : vegetation_.drifting_grass) {
    double x = this->wrap_x(d.x), y = std::clamp(d.y, DRIFT_EDGE, geometry_.height - DRIFT_EDGE),
           dx = x - d.x, dy = y - d.y;
    for (auto &c : d.plant.blades)
      for (auto &p : c) {
        p.x += dx;
        p.y += dy;
      }
    for (auto &o : d.plant.organs)
      for (auto &p : o.curve) {
        p.x += dx;
        p.y += dy;
      }
    d.x = x;
    d.y = y;
    d.plant.blade = d.plant.blades[0];
    d.plant.a = {x - d.plant.length / 2, y};
    d.plant.b = {x + d.plant.length / 2, y};
  }
}
void Ecosystem::resize(double w, double h) {
  field.resize(w, h);
  field.finish_resize();
  for (auto &p : fish) {
    p.body.x = field.wrap_x(p.body.x);
    if (!field.free(p.body.x, p.body.y, collision_radius(p.body)))
      field.position(rng, p.body.x, p.body.y, collision_radius(p.body));
  }
  for (auto &c : corpses) {
    c.x = field.wrap_x(c.x);
    c.y = std::clamp(c.y, 0., h);
  }
  // An archive stores the last position as the revival starting point. Keep it valid
  // after a resize; revival itself will find a free location for the full body.
  for (auto &p : remembered_dead) {
    p.body.x = field.wrap_x(p.body.x);
    p.body.y = std::clamp(p.body.y, 0., h);
  }
  sync_sperm_geometry();
}
bool Ecosystem::polygon(const std::vector<Point> &points) {
  placement_notice.clear();
  if (points.size() < MIN_POLYGON_POINTS || points.size() > MAX_POLYGON_POINTS ||
      field.geometry().obstacles.size() >= MAX_OBSTACLES)
    return false;
  Obstacle o{0, 0, 0, points};
  for (const auto &p : points) {
    if (!std::isfinite(p.x) || !std::isfinite(p.y) || std::abs(p.x) > MAX_COORDINATE ||
        std::abs(p.y) > MAX_COORDINATE)
      return false;
    o.x += p.x / points.size();
    o.y += p.y / points.size();
  }
  for (const auto &p : points)
    o.radius = std::max(o.radius, std::hypot(p.x - o.x, p.y - o.y));
  if (!valid_radius(o.radius))
    return false;
  // The editor can be on any horizontal copy of the periodic tank.
  double shift = field.wrap_x(o.x) - o.x;
  o.x += shift;
  for (auto &p : o.vertices)
    p.x += shift;
  // Clip only for intersection; retain the full shape across the seam and floor.
  auto clipped = o.vertices;
  for (int side = 0; side < 4 && !clipped.empty(); ++side) {
    auto distance = [&](Point p) {
      return side == 0   ? p.x
             : side == 1 ? field.geometry().width - p.x
             : side == 2 ? p.y
                         : field.geometry().height - p.y;
    };
    std::vector<Point> next;
    auto a = clipped.back();
    double da = distance(a);
    for (auto b : clipped) {
      double db = distance(b);
      if ((da >= 0) != (db >= 0)) {
        double t = da / (da - db);
        next.push_back({a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)});
      }
      if (db >= 0)
        next.push_back(b);
      a = b;
      da = db;
    }
    clipped = std::move(next);
  }
  double area = 0;
  for (std::size_t i = 0; i < clipped.size(); ++i) {
    auto a = clipped[i], b = clipped[(i + 1) % clipped.size()];
    area += a.x * b.y - a.y * b.x;
  }
  if (std::abs(area) < tolerance::negligible)
    return false;
  // Editing a stone must not silently discard a named or protected individual.
  for (const auto &p : fish)
    if ((p.remembered || p.body.immortal) &&
        field.overlaps(o, p.body.x, p.body.y, collision_radius(p.body)))
      return false;
  field.insert_obstacle(std::move(o));
  const auto &placed = field.geometry().obstacles.back();
  int adults = 0, eggs = 0;
  fish.erase(
      std::remove_if(fish.begin(), fish.end(),
                     [&](const Individual &p) {
                       if (!field.overlaps(placed, p.body.x, p.body.y, collision_radius(p.body)))
                         return false;
                       if (p.body.hatched)
                         ++adults;
                       else
                         ++eggs;
                       if (watched_id == p.id) {
                         watched_id = watched_death = 0;
                       }
                       return true;
                     }),
      fish.end());
  auto remove = [&](auto &items) {
    auto before = items.size();
    items.erase(std::remove_if(items.begin(), items.end(),
                               [&](const auto &p) { return field.overlaps(placed, p.x, p.y); }),
                items.end());
    return before - items.size();
  };
  const auto material = field.remove_covered_material(placed);
  auto food = material[0], dead = remove(corpses), grass = material[1];
  field.invalidate_index();
  refresh_food_allowance();
  field.sync_environment();
  sync_sperm_geometry();
  placement_notice = wording(
      "obstaclePlaced",
      {{"fish", adults}, {"eggs", eggs}, {"food", food}, {"corpses", dead}, {"grass", grass}});
  return true;
}
bool Ecosystem::obstacle(double x, double y, double radius) {
  std::vector<Point> points;
  for (int i = 0; i < ROCK_POINTS; ++i) {
    double a = 2 * PI * i / ROCK_POINTS,
           r = radius * (1 - ROCK_ROUGHNESS +
                         ROCK_ROUGHNESS * std::sin(ROCK_ROUGHNESS_PHASE * i + int(x + y)));
    points.push_back({x + r * std::cos(a), y + r * std::sin(a)});
  }
  return polygon(points);
}
bool Ecosystem::wall(double x, double y, double tx, double ty, double width) {
  double length = std::hypot(tx - x, ty - y);
  if (length < MIN_WALL_LENGTH) {
    if (length > 0) {
      tx = x + MIN_WALL_LENGTH * (tx - x) / length;
      ty = y + MIN_WALL_LENGTH * (ty - y) / length;
    } else
      tx = x + MIN_WALL_LENGTH;
    length = MIN_WALL_LENGTH;
  }
  double nx = -(ty - y) / length * width / 2, ny = (tx - x) / length * width / 2;
  return polygon({{x + nx, y + ny}, {tx + nx, ty + ny}, {tx - nx, ty - ny}, {x - nx, y - ny}});
}
void Ecosystem::erase_obstacle(double x, double y) {
  std::size_t best = field.geometry().obstacles.size();
  double distance = std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i < field.geometry().obstacles.size(); ++i) {
    const auto &o = field.geometry().obstacles[i];
    double d = std::hypot(field.delta_x(o.x - x), o.y - y);
    if (d < o.radius + PICK_MARGIN && d < distance) {
      best = i;
      distance = d;
    }
  }
  if (best < field.geometry().obstacles.size()) {
    field.remove_obstacle(best);
    field.sync_environment();
  }
}
bool Ecosystem::move_obstacle(double x, double y, double tx, double ty, double angle) {
  auto it = std::find_if(
      field.geometry().obstacles.begin(), field.geometry().obstacles.end(), [&](const Obstacle &o) {
        return std::hypot(field.delta_x(o.x - x), o.y - y) <= o.radius + PICK_MARGIN;
      });
  if (it == field.geometry().obstacles.end())
    return false;
  auto saved = *it;
  auto attached = field.capture_edit();
  field.remove_obstacle(std::size_t(it - field.geometry().obstacles.begin()));
  auto p = saved.vertices;
  if (p.empty())
    for (int i = 0; i < ROUND_POINTS; ++i)
      p.push_back({saved.x + saved.radius * std::cos(i * 2 * PI / ROUND_POINTS),
                   saved.y + saved.radius * std::sin(i * 2 * PI / ROUND_POINTS)});
  for (auto &v : p) {
    double dx = v.x - saved.x, dy = v.y - saved.y;
    v = {tx + dx * std::cos(angle) - dy * std::sin(angle),
         ty + dx * std::sin(angle) + dy * std::cos(angle)};
  }
  if (polygon(p)) {
    field.restore_moved_material(std::move(attached), saved.id);
    return true;
  }
  field.insert_obstacle(saved);
  field.sync_environment();
  return false;
}
void Field::insert_obstacle(Obstacle obstacle) {
  if (geometry_.obstacles.size() >= MAX_OBSTACLES || !valid_radius(obstacle.radius))
    throw std::invalid_argument("invalid obstacle");
  geometry_.obstacles.push_back(std::move(obstacle));
  geometry_.shape_grid = SpatialGrid{};
}
void Field::remove_obstacle(std::size_t index) {
  if (index >= geometry_.obstacles.size())
    throw std::out_of_range("obstacle index");
  geometry_.obstacles.erase(geometry_.obstacles.begin() + index);
  geometry_.shape_grid = SpatialGrid{};
}
std::array<std::size_t, 2> Field::remove_covered_material(const Obstacle &placed) {
  auto remove = [&](auto &items) {
    const auto before = items.size();
    items.erase(std::remove_if(items.begin(), items.end(),
                               [&](const auto &p) { return overlaps(placed, p.x, p.y); }),
                items.end());
    return before - items.size();
  };
  const auto food = remove(feeding_.pieces), grass = remove(vegetation_.drifting_grass);
  return {food, grass};
}
Field::EditSnapshot Field::capture_edit() const {
  EditSnapshot saved;
  saved.obstacles = geometry_.obstacles;
  saved.feeders = feeding_.feeders;
  saved.clouds = feeding_.clouds;
  saved.currents = currents_;
  saved.surfaces = vegetation_.surfaces;
  saved.drifting = vegetation_.drifting_grass;
  saved.suspended = sediment_.suspended;
  saved.food_web = food_web_;
  saved.next_surface = vegetation_.next_surface_id;
  saved.next_obstacle = geometry_.next_obstacle_id;
  return saved;
}
std::array<double, 2> Field::EditSnapshot::plant_energies() const {
  double algae = 0, grass = 0;
  for (const auto &s : surfaces) {
    algae += s.algae;
    grass += s.grass;
  }
  for (const auto &d : drifting)
    grass += d.plant.grass;
  return {algae, grass};
}
void Field::restore_edit(EditSnapshot saved) {
  geometry_.obstacles = std::move(saved.obstacles);
  feeding_.feeders = std::move(saved.feeders);
  currents_ = std::move(saved.currents);
  vegetation_.surfaces = std::move(saved.surfaces);
  vegetation_.drifting_grass = std::move(saved.drifting);
  sediment_.suspended = std::move(saved.suspended);
  food_web_ = std::move(saved.food_web);
  vegetation_.next_surface_id = saved.next_surface;
  geometry_.next_obstacle_id = saved.next_obstacle;
  indexed_ = false;
  geometry_.shape_grid = SpatialGrid{};
  environment_signature = 0;
  sync_environment();
  feeding_.clouds = saved.clouds;
}
void Field::restore_moved_material(EditSnapshot saved, std::uint64_t obstacle_id) {
  geometry_.obstacles.back().id = obstacle_id;
  vegetation_.surfaces = std::move(saved.surfaces);
  sediment_.suspended = std::move(saved.suspended);
  food_web_ = std::move(saved.food_web);
  vegetation_.drifting_grass = std::move(saved.drifting);
  environment_signature = 0;
  sync_environment();
}

}
