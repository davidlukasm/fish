#include "movement.hh"
#include "body_plan.hh"
#include "ecology.hh"
#include "physiology.hh"
namespace fishsim {
void Field::collide_food(Body &b, double ox, double oy, const PhysiologyParameters &physiology) {
  if (!b.alive || !b.hatched || b.health <= 0)
    return;
  struct Moved {
    std::uint32_t index;
    double x, y;
  };
  std::vector<Moved> moved;
  feeding_.grid.nearby(
      ox + this->delta_x(b.x - ox) * .5, (oy + b.y) * .5,
      std::hypot(this->delta_x(b.x - ox), b.y - oy) * .5 + MAX_BODY_RADIUS +
          feeding_.indexed_food_radius + swimming_limit(b, physiology),
      [&](std::uint32_t i) {
        auto &p = feeding_.pieces[i];
        if (feeding_.consumed[i] || p.energy <= 0)
          return;
        double dx = this->delta_x(p.x - b.x), dy = p.y - b.y, d = std::hypot(dx, dy),
               radius = body_radius(b) + food_radius(p);
        if (d >= radius || d < 1e-9 || this->ray(b.x, b.y, dx / d, dy / d) < d - food_radius(p))
          return;
        double nx = dx / d, ny = dy / d,
               closing = (b.motor_.vx - p.vx) * nx + (b.motor_.vy - p.vy) * ny, ma = body_mass(b),
               mb = .03 + p.energy * .0008, inverse = 1 / ma + 1 / mb;
        if (closing > 0) {
          double kinetic = .5 / inverse * closing * closing;
          b.motor_.impact = std::max(b.motor_.impact, kinetic);
          double impulse = 1.45 * closing / inverse;
          b.motor_.vx -= impulse * nx / ma;
          b.motor_.vy -= impulse * ny / ma;
          p.vx += impulse * nx / mb;
          p.vy += impulse * ny / mb;
        }
        // Prefer moving the light piece. Correct the fish only when geometry blocks that motion.
        double push = radius - d + .001, px = p.x + nx * push, py = p.y + ny * push;
        if (this->free(px, py, food_radius(p))) {
          moved.push_back({i, p.x, p.y});
          p.x = this->wrap_x(px);
          p.y = py;
        } else {
          double x = b.x, y = b.y;
          b.x -= nx * push;
          b.y -= ny * push;
          this->collide(b, x, y);
        }
        b.reproduction_.contact = 1;
        b.motor_.contact_x = nx;
        b.motor_.contact_y = ny;
        record_touch(b, nx, ny, b.motor_.impact);
        limit_swimming(b, *this, physiology);
      });
  for (const auto &entry : moved) {
    const auto &p = feeding_.pieces[entry.index];
    feeding_.grid.relocate(entry.x, entry.y, p.x, p.y, entry.index);
  }
}
void Ecosystem::collide_food(Body &b, double ox, double oy) {
  field.collide_food(b, ox, oy, physiology_);
}
void Ecosystem::collide_fish(const std::vector<std::array<double, 2>> &old, bool protected_life) {
  double maximum_displacement = 0;
  for (std::size_t i = 0; i < fish.size(); ++i)
    maximum_displacement =
        std::max(maximum_displacement,
                 std::hypot(field.delta_x(fish[i].body.x - old[i][0]), fish[i].body.y - old[i][1]));
  thread_local SpatialGrid grid;
  grid.reset(field.geometry().width, field.geometry().height);
  for (std::size_t i = 0; i < fish.size(); ++i)
    if (fish[i].body.alive && fish[i].body.hatched)
      grid.add(fish[i].body.x, fish[i].body.y, std::uint32_t(i));
  for (std::size_t i = 0; i < fish.size(); ++i) {
    auto &a = fish[i].body;
    if (!a.alive || !a.hatched)
      continue;
    grid.nearby(a.x, a.y, 2 * MAX_BODY_RADIUS + 2 * maximum_displacement, [&](std::uint32_t j) {
      if (j <= i)
        return;
      auto &b = fish[j].body;
      if (!b.alive || !b.hatched)
        return;
      double sum_radius = body_radius(a) + body_radius(b);
      double dx = field.delta_x(b.x - a.x), dy = b.y - a.y, distance = std::hypot(dx, dy), nx = 0,
             ny = 0;
      double rx = field.delta_x(old[j][0] - old[i][0]), ry = old[j][1] - old[i][1], mx = dx - rx,
             my = dy - ry;
      double qa = mx * mx + my * my, qb = 2 * (rx * mx + ry * my),
             qc = rx * rx + ry * ry - sum_radius * sum_radius;
      if (distance >= sum_radius) {
        double disc = qb * qb - 4 * qa * qc;
        if (qa < 1e-12 || disc < 0)
          return;
        double t = (-qb - std::sqrt(disc)) / (2 * qa);
        if (t < 0 || t > 1)
          return;
        nx = (rx + t * mx) / (sum_radius);
        ny = (ry + t * my) / (sum_radius);
      } else if (distance > 1e-9) {
        nx = dx / distance;
        ny = dy / distance;
      } else {
        nx = (i + j) % 2 ? 1 : 0;
        ny = nx ? 0 : 1;
      }
      if (distance > 0 &&
          field.ray(a.x, a.y, dx / distance, dy / distance) < distance - body_radius(b))
        return;
      double ma = body_mass(a), mb = body_mass(b), inverse = 1 / ma + 1 / mb;
      double closing = (a.motor_.vx - b.motor_.vx) * nx + (a.motor_.vy - b.motor_.vy) * ny;
      if (closing > 0) {
        double impulse = 1.90 * closing / inverse, kinetic = .5 / inverse * closing * closing;
        a.motor_.vx -= impulse * nx / ma;
        a.motor_.vy -= impulse * ny / ma;
        b.motor_.vx += impulse * nx / mb;
        b.motor_.vy += impulse * ny / mb;
        const double damaging = .5 / inverse * std::max(0., closing * closing - .75 * .75);
        injure(a, physiology_.impact_damage * .5 * damaging / std::max(.2, ma), protected_life,
               {nx, ny});
        injure(b, physiology_.impact_damage * .5 * damaging / std::max(.2, mb), protected_life,
               {-nx, -ny});
        a.motor_.impact = std::max(a.motor_.impact, kinetic);
        b.motor_.impact = std::max(b.motor_.impact, kinetic);
      }
      if (distance < sum_radius) {
        double separation = sum_radius - distance + .001, ax = a.x, ay = a.y, bx = b.x, by = b.y;
        a.x -= nx * separation / (ma * inverse);
        a.y -= ny * separation / (ma * inverse);
        b.x += nx * separation / (mb * inverse);
        b.y += ny * separation / (mb * inverse);
        field.collide(a, ax, ay);
        field.collide(b, bx, by);
      }
      a.reproduction_.contact = b.reproduction_.contact = 1;
      a.motor_.contact_x = nx;
      a.motor_.contact_y = ny;
      b.motor_.contact_x = -nx;
      b.motor_.contact_y = -ny;
      record_touch(a, nx, ny, a.motor_.impact);
      record_touch(b, -nx, -ny, b.motor_.impact);
      for (auto *body : {&a, &b})
        limit_swimming(*body, field, physiology_);
    });
  }
}
}
