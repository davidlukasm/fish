#include "physiology.hh"
#include "brain_interface.hh"
namespace fishsim {
void advance_embryo(Body &b, const Genome &g, const PhysiologyParameters &p, bool protected_life) {
  auto &e = b.embryo;
  auto &m = b.motor_;
  const double progress = b.development_ ? b.development_->progress() : 0;
  const double radius = std::max(.001, b.egg_shell_radius);
  // The radius already includes tissue growth; folding determines shell occupancy.
  const double occupied = p.embryo_fold * body_radius(b) / radius;
  e.pressure = std::max(0., occupied - p.embryo_crowding);
  const double force = progress * m.motor_factor;
  const double forward = m.impulse_forward * force, left = m.impulse_left * force,
               right = m.impulse_right * force;
  // Mouth flow and bite strength already include the paid motor factor.
  const double mouth = (b.mouth.flow + (b.mouth.closing ? b.bite_signal : 0)) * progress;
  for (int k = 0; k < 16; ++k) {
    const double a = -PI + (k + .5) * 2 * PI / 16;
    const double front = std::max(0., std::cos(a)), back = std::max(0., -std::cos(a));
    const double side = std::sin(a);
    const double tail = back * forward * std::max(0., side * (m.fin_stroke_side ? 1 : -1));
    const double impulse =
        tail + std::max(0., -side) * left + std::max(0., side) * right + front * mouth;
    e.flow[k] = p.embryo_flow_decay * e.flow[k] + p.embryo_flow_gain * impulse;
    e.touch[k] = std::clamp(e.pressure + p.embryo_touch_gain * impulse, 0., 1.);
  }
  const double starvation =
      std::clamp(hatch_search_reserve(b) > 0 ? (2 * hatch_search_reserve(b) - b.energy) /
                                                   std::max(1., hatch_search_reserve(b))
                                             : 0.,
                 0., 1.);
  if (!protected_life)
    harm_body(b,
              p.embryo_pressure_damage * std::pow(e.pressure, p.embryo_damage_power) +
                  p.embryo_reserve_damage * std::pow(starvation, p.embryo_damage_power) +
                  p.embryo_defense_damage * e.pressure * m.defense,
              0);
  // Only a paid contraction against a weakened shell can open it.
  const double impulse = (forward + left + right) / std::max(p.hatch_mass_floor, body_mass(b));
  if (e.shell < p.hatch_shell_limit && impulse > p.hatch_force_base + p.hatch_force_shell * e.shell)
    mature_body(b);
  m.swimming_pending = false;
  m.relative_speed = 0;
  m.thrust = m.torque = 0;
  (void)g;
}
}
