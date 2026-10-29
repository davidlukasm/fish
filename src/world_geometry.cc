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
void Field::finish_resize() {
  this->sync_environment();
  sync_food_web();
  refresh_niche_limits();
  for (auto &d : vegetation_.drifting_grass) {
    double x = this->wrap_x(d.x), y = std::clamp(d.y, .4, geometry_.height - .4), dx = x - d.x,
           dy = y - d.y;
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
    d.plant.a = {x - d.plant.length * .5, y};
    d.plant.b = {x + d.plant.length * .5, y};
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
  sync_sperm_geometry();
}
bool Ecosystem::polygon(const std::vector<Point> &points) {
  placement_notice.clear();
  if (points.size() < 3 || points.size() > 32 || field.geometry().obstacles.size() >= 64)
    return false;
  Obstacle o{0, 0, 0, points};
  for (const auto &p : points) {
    if (!std::isfinite(p.x) || !std::isfinite(p.y) || std::abs(p.x) > 1000000 ||
        std::abs(p.y) > 1000000)
      return false;
    o.x += p.x / points.size();
    o.y += p.y / points.size();
  }
  for (const auto &p : points)
    o.radius = std::max(o.radius, std::hypot(p.x - o.x, p.y - o.y));
  if (o.radius < 1 || o.radius > 10000)
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
  if (std::abs(area) < 1e-8)
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
  placement_notice = "Hindernis gesetzt.";
  bool first = true;
  auto describe = [&](std::size_t count, const char *one, const char *many) {
    if (!count)
      return;
    placement_notice += first ? " Entfernt: " : ", ";
    first = false;
    placement_notice += std::to_string(count) + " " + (count == 1 ? one : many);
  };
  describe(adults, "Fisch", "Fische");
  describe(eggs, "Ei", "Eier");
  describe(food, "Futterstück", "Futterstücke");
  describe(dead, "Kadaver", "Kadaver");
  describe(grass, "Grasbüschel", "Grasbüschel");
  if (!first)
    placement_notice += ".";
  return true;
}
bool Ecosystem::obstacle(double x, double y, double radius) {
  std::vector<Point> points;
  for (int i = 0; i < 9; ++i) {
    double a = 2 * PI * i / 9, r = radius * (.8 + .2 * std::sin(13 * i + int(x + y)));
    points.push_back({x + r * std::cos(a), y + r * std::sin(a)});
  }
  return polygon(points);
}
bool Ecosystem::wall(double x, double y, double tx, double ty, double width) {
  double length = std::hypot(tx - x, ty - y);
  if (length < 4) {
    if (length > 0) {
      tx = x + 4 * (tx - x) / length;
      ty = y + 4 * (ty - y) / length;
    } else
      tx = x + 4;
    length = 4;
  }
  double nx = -(ty - y) / length * width * .5, ny = (tx - x) / length * width * .5;
  return polygon({{x + nx, y + ny}, {tx + nx, ty + ny}, {tx - nx, ty - ny}, {x - nx, y - ny}});
}
void Ecosystem::erase_obstacle(double x, double y) {
  std::size_t best = field.geometry().obstacles.size();
  double distance = std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i < field.geometry().obstacles.size(); ++i) {
    const auto &o = field.geometry().obstacles[i];
    double d = std::hypot(field.delta_x(o.x - x), o.y - y);
    if (d < o.radius + 8 && d < distance) {
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
  auto it = std::find_if(field.geometry().obstacles.begin(), field.geometry().obstacles.end(),
                         [&](const Obstacle &o) {
                           return std::hypot(field.delta_x(o.x - x), o.y - y) <= o.radius + 8;
                         });
  if (it == field.geometry().obstacles.end())
    return false;
  auto saved = *it;
  auto attached = field.capture_edit();
  field.remove_obstacle(std::size_t(it - field.geometry().obstacles.begin()));
  auto p = saved.vertices;
  if (p.empty())
    for (int i = 0; i < 12; ++i)
      p.push_back({saved.x + saved.radius * std::cos(i * PI / 6),
                   saved.y + saved.radius * std::sin(i * PI / 6)});
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
  if (geometry_.obstacles.size() >= 64 || !std::isfinite(obstacle.radius) || obstacle.radius < 1 ||
      obstacle.radius > 10000)
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
