#pragma once
#include "body.hh"
#include "physiology.hh"
#include "state_validation.hh"
namespace fishsim::state {
struct ScalarBounds {
  double low, high;
  const char *name = "state";
};
template <class T> void validate_scalar(T value, ScalarBounds bounds) {
  if (!std::isfinite(value) || value < bounds.low || value > bounds.high)
    throw std::runtime_error(std::string("Ungültiger Speicherwert ") + bounds.name + ": " +
                             std::to_string(value) + " außerhalb " + std::to_string(bounds.low) +
                             ".." + std::to_string(bounds.high));
}
template <class T> void body_scalar(std::istream &in, T &value, ScalarBounds bounds) {
  state::value(in, value);
  validate_scalar(value, bounds);
}
inline ScalarBounds body_limit_tissue(const Body &) {
  return {0, MAX_TISSUE, "tissue"};
}
inline ScalarBounds body_limit_health(const Body &) {
  return {0, 1, "health"};
}
inline ScalarBounds body_limit_motor_vx(const Body &) {
  return {-1024, 1024, "motor_vx"};
}
inline ScalarBounds body_limit_motor_vy(const Body &) {
  return {-1024, 1024, "motor_vy"};
}
inline ScalarBounds body_limit_motor_thrust(const Body &) {
  return {-1e12, 1e12, "motor_thrust"};
}
inline ScalarBounds body_limit_motor_torque(const Body &) {
  return {-1e12, 1e12, "motor_torque"};
}
inline ScalarBounds body_limit_motor_aggression(const Body &) {
  return {0, 1, "motor_aggression"};
}
inline ScalarBounds body_limit_motor_defense(const Body &) {
  return {0, .85, "motor_defense"};
}
inline ScalarBounds body_limit_motor_combat_cost(const Body &) {
  return {0, 1e6, "motor_combat_cost"};
}
inline ScalarBounds body_limit_motor_contact_x(const Body &) {
  return {-1, 1, "motor_contact_x"};
}
inline ScalarBounds body_limit_motor_contact_y(const Body &) {
  return {-1, 1, "motor_contact_y"};
}
inline ScalarBounds body_limit_motor_impact(const Body &) {
  return {0, 1e6, "motor_impact"};
}
inline ScalarBounds body_limit_nutrient_flow(const Body &) {
  return {0, ENERGY_MAX, "nutrient_flow"};
}
inline ScalarBounds body_limit_peak_tissue(const Body &b) {
  return {b.tissue, MAX_TISSUE, "peak_tissue"};
}
inline ScalarBounds body_limit_birth_tissue(const Body &) {
  return {0, MAX_TISSUE, "birth_tissue"};
}
inline ScalarBounds body_limit_bite_signal(const Body &) {
  return {0, 1, "bite_signal"};
}
inline ScalarBounds body_limit_egg_shell_radius(const Body &) {
  return {0, 1000, "egg_shell_radius"};
}
inline ScalarBounds body_limit_motor_suction_pose(const Body &) {
  return {0, 1, "motor_suction_pose"};
}
inline ScalarBounds body_limit_motor_bite_pose(const Body &) {
  return {0, 1, "motor_bite_pose"};
}
inline ScalarBounds body_limit_angle(const Body &) {
  return {-PI, PI, "angle"};
}
inline ScalarBounds body_limit_motor_speed(const Body &) {
  return {0, 2048, "motor_speed"};
}
inline ScalarBounds body_limit_motor_turn(const Body &) {
  return {-MAX_TURN, MAX_TURN, "motor_turn"};
}
inline ScalarBounds body_limit_motor_travel(const Body &) {
  return {0, 1e12, "motor_travel"};
}
inline ScalarBounds body_limit_reproduction_spawn_signal(const Body &) {
  return {-1, 65536, "reproduction_spawn_signal"};
}
inline ScalarBounds body_limit_reproduction_readiness(const Body &) {
  return {0, 1, "reproduction_readiness"};
}
inline ScalarBounds body_limit_reproduction_contact(const Body &) {
  return {0, 1, "reproduction_contact"};
}
inline ScalarBounds body_limit_ledger_movement_cost(const Body &) {
  return {0, 65536, "ledger_movement_cost"};
}
inline ScalarBounds body_limit_ledger_brain_cost(const Body &) {
  return {0, 1000, "ledger_brain_cost"};
}
inline ScalarBounds body_limit_ledger_development_cost(const Body &) {
  return {0, 1000000, "ledger_development_cost"};
}
inline ScalarBounds body_limit_ledger_construction_paid(const Body &) {
  return {0, 1e9, "ledger_construction_paid"};
}
inline ScalarBounds body_limit_reproduction_sperm_signal(const Body &) {
  return {0, 65536, "reproduction_sperm_signal"};
}
inline ScalarBounds body_limit_eat_signal(const Body &) {
  return {-1, 1, "eat_signal"};
}
inline ScalarBounds body_limit_reproduction_egg_readiness(const Body &) {
  return {0, 1, "reproduction_egg_readiness"};
}
inline ScalarBounds body_limit_reproduction_sperm_readiness(const Body &) {
  return {0, 1, "reproduction_sperm_readiness"};
}
inline ScalarBounds body_limit_nutrition(const Body &) {
  return {0, 1e12, "nutrition"};
}
inline ScalarBounds body_limit_motor_water_vx(const Body &) {
  return {-1024, 1024, "motor_water_vx"};
}
inline ScalarBounds body_limit_motor_water_vy(const Body &) {
  return {-1024, 1024, "motor_water_vy"};
}
inline ScalarBounds body_limit_motor_relative_speed(const Body &) {
  return {0, MAX_SPEED * std::sqrt(MAX_BODY_RADIUS / BODY_RADIUS), "motor_relative_speed"};
}
inline ScalarBounds body_limit_motor_impulse_left(const Body &) {
  return {0, 65536, "motor_impulse_left"};
}
inline ScalarBounds body_limit_motor_impulse_right(const Body &) {
  return {0, 65536, "motor_impulse_right"};
}
inline ScalarBounds body_limit_motor_tail(const Body &) {
  return {-1, 1, "motor_tail"};
}
inline ScalarBounds body_limit_motor_impulse_forward(const Body &) {
  return {0, 65536, "motor_impulse_forward"};
}
inline ScalarBounds body_limit_motor_motor_factor(const Body &) {
  return {0, 1, "motor_motor_factor"};
}
inline ScalarBounds body_limit_reproduction_egg_transfer(const Body &) {
  return {0, 4, "reproduction_egg_transfer"};
}
inline ScalarBounds body_limit_reproduction_sperm_transfer(const Body &) {
  return {0, 4, "reproduction_sperm_transfer"};
}
inline ScalarBounds body_limit_motor_mouth_pose(const Body &) {
  return {0, 1, "motor_mouth_pose"};
}
inline ScalarBounds body_limit_gut_fill(const Body &) {
  return {0, 1e12, "gut_fill"};
}
inline ScalarBounds body_limit_pain(const Body &) {
  return {0, 1, "pain"};
}
inline ScalarBounds body_limit_previous_health(const Body &) {
  return {0, 1, "previous_health"};
}
inline ScalarBounds body_limit_bladder_fill(const Body &) {
  return {0, 1, "bladder_fill"};
}
inline ScalarBounds body_limit_buoyancy_force(const Body &) {
  return {-1e6, 1e6, "buoyancy_force"};
}
inline void validate_body_state(const Body &b, double width, double height, double energy) {
  validate_scalar(b.tissue, body_limit_tissue(b));
  validate_scalar(b.health, body_limit_health(b));
  validate_scalar(b.motor().vx, body_limit_motor_vx(b));
  validate_scalar(b.motor().vy, body_limit_motor_vy(b));
  validate_scalar(b.motor().thrust, body_limit_motor_thrust(b));
  validate_scalar(b.motor().torque, body_limit_motor_torque(b));
  validate_scalar(b.motor().aggression, body_limit_motor_aggression(b));
  validate_scalar(b.motor().defense, body_limit_motor_defense(b));
  validate_scalar(b.motor().combat_cost, body_limit_motor_combat_cost(b));
  validate_scalar(b.motor().contact_x, body_limit_motor_contact_x(b));
  validate_scalar(b.motor().contact_y, body_limit_motor_contact_y(b));
  validate_scalar(b.motor().impact, body_limit_motor_impact(b));
  validate_scalar(b.nutrient_flow, body_limit_nutrient_flow(b));
  validate_scalar(std::max(b.peak_tissue, b.tissue), body_limit_peak_tissue(b));
  validate_scalar(b.birth_tissue, body_limit_birth_tissue(b));
  validate_scalar(b.bite_signal, body_limit_bite_signal(b));
  validate_scalar(b.egg_shell_radius, body_limit_egg_shell_radius(b));
  validate_scalar(b.motor().suction_pose, body_limit_motor_suction_pose(b));
  validate_scalar(b.motor().bite_pose, body_limit_motor_bite_pose(b));
  validate_scalar(b.angle, body_limit_angle(b));
  validate_scalar(b.motor().speed, body_limit_motor_speed(b));
  validate_scalar(b.motor().turn, body_limit_motor_turn(b));
  validate_scalar(b.motor().travel, body_limit_motor_travel(b));
  validate_scalar(b.reproduction().spawn_signal, body_limit_reproduction_spawn_signal(b));
  validate_scalar(b.reproduction().readiness, body_limit_reproduction_readiness(b));
  validate_scalar(b.reproduction().contact, body_limit_reproduction_contact(b));
  validate_scalar(b.ledger().movement_cost, body_limit_ledger_movement_cost(b));
  validate_scalar(b.ledger().brain_cost, body_limit_ledger_brain_cost(b));
  validate_scalar(b.ledger().development_cost, body_limit_ledger_development_cost(b));
  validate_scalar(b.ledger().construction_paid, body_limit_ledger_construction_paid(b));
  validate_scalar(b.reproduction().sperm_signal, body_limit_reproduction_sperm_signal(b));
  validate_scalar(b.eat_signal, body_limit_eat_signal(b));
  validate_scalar(b.reproduction().egg_readiness, body_limit_reproduction_egg_readiness(b));
  validate_scalar(b.reproduction().sperm_readiness, body_limit_reproduction_sperm_readiness(b));
  validate_scalar(b.nutrition, body_limit_nutrition(b));
  validate_scalar(b.motor().water_vx, body_limit_motor_water_vx(b));
  validate_scalar(b.motor().water_vy, body_limit_motor_water_vy(b));
  validate_scalar(b.motor().relative_speed, body_limit_motor_relative_speed(b));
  validate_scalar(b.motor().impulse_left, body_limit_motor_impulse_left(b));
  validate_scalar(b.motor().impulse_right, body_limit_motor_impulse_right(b));
  validate_scalar(b.motor().tail, body_limit_motor_tail(b));
  validate_scalar(b.motor().impulse_forward, body_limit_motor_impulse_forward(b));
  validate_scalar(b.motor().motor_factor, body_limit_motor_motor_factor(b));
  validate_scalar(b.reproduction().egg_transfer, body_limit_reproduction_egg_transfer(b));
  validate_scalar(b.reproduction().sperm_transfer, body_limit_reproduction_sperm_transfer(b));
  validate_scalar(b.motor().mouth_pose, body_limit_motor_mouth_pose(b));
  validate_scalar(b.gut_fill, body_limit_gut_fill(b));
  validate_scalar(b.gut_energy, {0, 1e12, "gut_energy"});
  validate_scalar(b.gut_digestible, {0, 1e12, "gut_digestible"});
  validate_scalar(b.digestion, {0, 1e12, "digestion"});
  validate_scalar(b.rest_cost, {0, 1e12, "rest_cost"});
  validate_scalar(b.digested, {0, 1e12, "digested"});
  validate_scalar(b.feces_pending, {0, 1e12, "feces_pending"});
  validate_scalar(b.organ_mass_ref, {0, 1e12, "organ_mass_ref"});

  validate_scalar(b.pain, body_limit_pain(b));
  validate_scalar(b.previous_health, body_limit_previous_health(b));
  validate_scalar(b.bladder_fill, body_limit_bladder_fill(b));
  validate_scalar(b.buoyancy_force, body_limit_buoyancy_force(b));
  validate_scalar(b.x, {0, width});
  validate_scalar(b.y, {0, height});
  validate_scalar(b.energy, {0, energy});
  validate_scalar(b.reproduction().egg_yolk, {0, energy});
  validate_scalar(b.reproduction().sperm_store, {0, energy});
}
}
