#include "movement.hh"
#include "physiology.hh"
#include "body_plan.hh"
namespace fishsim {
void limit_swimming(Body &b, const Field &field, const PhysiologyParameters &physiology) {
  auto water = field.water().velocity(b.x, b.y);
  const double immersion = field.sediment_immersion(b.x, b.y, body_radius(b)),
               resistance = sediment_resistance(immersion, b.defense(), b.undulation);
  water.x /= resistance;
  water.y /= sediment_vertical_resistance(resistance, water.y);
  b.motor_.water_vx = water.x;
  b.motor_.water_vy = water.y;
  double ux = b.motor_.vx - water.x, uy = b.motor_.vy - water.y, speed = std::hypot(ux, uy),
         limit = swimming_limit(b, physiology);
  if (speed > limit) {
    ux *= limit / speed;
    uy *= limit / speed;
  }
  b.motor_.vx = water.x + ux;
  b.motor_.vy = water.y + uy;
  b.motor_.relative_speed = std::min(speed, limit);
  b.motor_.speed = std::hypot(b.motor_.vx, b.motor_.vy);
}
void advance_body(Body &b, const Genome &g, const Field *world,
                  const PhysiologyParameters &physiology, bool protected_life) {
  if (!b.prepare_step(g, physiology, protected_life))
    return;
  const bool egg = !b.hatched;
  if (world && !b.perception_.perception_prepared)
    sense_generated(b, g, *world, nullptr, true, physiology);
  b.act(g, physiology, protected_life);
  if (egg)
    advance_embryo(b, g, physiology, protected_life);
  else
    move_body(b, world, physiology, protected_life);
  b.finish_step();
}
void move_body(Body &b, const Field *world, const PhysiologyParameters &physiology,
               bool protected_life) {
  double old_x = b.x, old_y = b.y, mass = body_mass(b),
         weakness = 1 - (world ? physiology.wound_weakness : .5) * (1 - b.health),
         inertia = world && physiology.size_physics >= .5 ? mass : 1.,
         drag = world && physiology.size_physics >= .5 ? 1 / std::sqrt(mass) : 1.,
         radius = body_radius(b);
  Point water = world ? world->water().velocity(b.x, b.y) : Point{};
  b.motor_.thrust = b.motor_.torque = 0;
  if (b.motor_.swimming_pending) {
    const double push_left = b.motor_.impulse_left, push_right = b.motor_.impulse_right;
    b.motor_.torque = push_left - push_right;
    b.motor_.angular_velocity =
        std::clamp(b.motor_.angular_velocity + b.motor_.torque * physiology.stroke_turn * PI / 180 *
                                                   weakness / inertia * b.motor_.motor_factor,
                   -MAX_TURN, MAX_TURN);
    b.motor_.thrust = physiology.stroke_push * b.motor_.impulse_forward * b.motor_.motor_factor *
                      weakness / std::max(.5, mass);
  }
  b.motor_.swimming_pending = false;
  const double immersion = world ? world->sediment_immersion(b.x, b.y, radius) : 0,
               defense = b.defense(), spines = 1 + 2 * b.motor_.defense,
               resistance = sediment_resistance(immersion, defense, b.undulation);
  b.motor_.thrust *= 1 - physiology.undulation_loss * b.undulation * (1 - immersion);
  b.sediment_coverage = immersion;
  const double across_drag = physiology.drag_across * drag * spines;
  b.motor_.angular_velocity /= resistance;
  b.motor_.turn = std::clamp(b.motor_.angular_velocity, -MAX_TURN, MAX_TURN);
  b.motor_.angular_velocity *= std::max(0., 1 - across_drag);
  b.angle = std::remainder(b.angle + b.motor_.turn, 2 * PI);
  b.motor_.water_vx = water.x;
  b.motor_.water_vy = water.y;
  double hx = std::cos(b.angle), hy = std::sin(b.angle), ux = b.motor_.vx - water.x,
         uy = b.motor_.vy - water.y;
  double along = ux * hx + uy * hy, across = -ux * hy + uy * hx;
  const double mouth_drag = std::pow(mouth_aperture(b) / std::max(.001, radius), 2);
  along *= std::max(0., 1 - physiology.drag_along * (1 + std::abs(along)) * drag *
                                (spines + mouth_drag));
  across *= std::max(0., 1 - across_drag);
  const double cloud = world ? turbidity_resistance(world->turbidity(b.x, b.y)) : 1,
               // Saturating: even a dense thicket only slows a fish, it never holds it fast.
      brush = world ? [&] {
        const double s = world->foliage_contact(b.x, b.y, radius).stiffness;
        return 1 + world->env().foliage_drag * s / (1 + s);
      }()
                    : 1;
  ux = (along + b.motor_.thrust) * hx - across * hy;
  uy = (along + b.motor_.thrust) * hy + across * hx;
  const double bladder_capacity = b.bladder_capacity,
               up = (world ? physiology.bladder_strength : 0) * growth_fraction(b) *
                    bladder_capacity / (1 + bladder_capacity) * b.bladder_fill;
  b.buoyancy_force = (world ? physiology.sinking : 0) * mass - up;
  uy += b.buoyancy_force / mass;
  const double upward = sediment_vertical_resistance(resistance, uy);
  ux /= resistance * cloud * brush;
  uy /= upward * cloud * brush;
  along = ux * hx + uy * hy;
  across = -ux * hy + uy * hx;
  water.x /= resistance;
  water.y /= sediment_vertical_resistance(resistance, water.y);
  b.motor_.water_vx = water.x;
  b.motor_.water_vy = water.y;
  ux = along * hx - across * hy;
  uy = along * hy + across * hx;
  double speed = std::hypot(ux, uy), limit = world ? swimming_limit(b, physiology) : MAX_SPEED;
  if (speed > limit) {
    ux *= limit / speed;
    uy *= limit / speed;
  }
  b.motor_.vx = water.x + ux;
  b.motor_.vy = water.y + uy;
  b.x += b.motor_.vx;
  b.y += b.motor_.vy;
  if (world) {
    world->collide(b, old_x, old_y);
    if (b.reproduction_.contact) {
      double closing = b.motor_.vx * b.motor_.contact_x + b.motor_.vy * b.motor_.contact_y;
      if (closing > 0) {
        double kinetic = .5 * mass * closing * closing;
        b.motor_.impact = std::max(b.motor_.impact, kinetic);
        injure(b, physiology.impact_damage * kinetic / std::max(.2, mass), protected_life,
               {b.motor_.contact_x, b.motor_.contact_y});
        double unused =
            std::max(0., (b.motor_.vx - (world->delta_x(b.x - old_x))) * b.motor_.contact_x +
                             (b.motor_.vy - (b.y - old_y)) * b.motor_.contact_y);
        b.motor_.vx -= (1 + physiology.wall_restitution) * closing * b.motor_.contact_x;
        b.motor_.vy -= (1 + physiology.wall_restitution) * closing * b.motor_.contact_y;
        double dx = -physiology.wall_restitution * unused * b.motor_.contact_x,
               dy = -physiology.wall_restitution * unused * b.motor_.contact_y,
               d = std::hypot(dx, dy);
        if (d > 0 && world->free(b.x + dx, b.y + dy, radius) &&
            world->ray(b.x, b.y, dx / d, dy / d, radius) >= d) {
          b.x += dx;
          b.y += dy;
        }
      }
      record_touch(b, b.motor_.contact_x, b.motor_.contact_y, b.motor_.impact);
    }
  }
  // Only actual displacement through the bed abrades raised spines.
  if (world && !protected_life && immersion > 0 && defense > 0) {
    double dx = world->delta_x(b.x - old_x), dy = b.y - old_y;
    harm_body(b, physiology.spine_abrasion * defense * immersion * std::min(1., dx * dx + dy * dy),
              1);
  }
  b.motor_.speed = std::hypot(b.motor_.vx, b.motor_.vy);
  b.motor_.relative_speed = std::hypot(b.motor_.vx - water.x, b.motor_.vy - water.y);
  if (world)
    b.x = world->wrap_x(b.x);
  b.motor_.travel += std::hypot(world ? world->delta_x(b.x - old_x) : b.x - old_x, b.y - old_y);
}
}
