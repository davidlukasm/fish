#include "physiology.hh"
#include "brain_interface.hh"
namespace fishsim {
void advance_embryo(Body &b, const Genome &g, const PhysiologyParameters &p, bool protected_life) {
  auto &e = b.embryo;
  auto &m = b.motor_;
  const double progress = b.development_ ? b.development_->work_fraction() : 0;
  const double radius = std::max(.001, b.egg_shell_radius);
  const double occupied = p.embryo_fold * body_radius(b) / radius;
  e.pressure = std::max(0., occupied - p.embryo_crowding);
  // A twitch can lose its drive after any step; only force already delivered presses the shell.
  const auto force = [&](int stroke) { return m.strokes[stroke].force * progress; };
  const double tail_left = force(StrokeTailLeft), tail_right = force(StrokeTailRight),
               left = force(StrokeTurnLeft) + force(StrokeReverseLeft),
               right = force(StrokeTurnRight) + force(StrokeReverseRight);
  const double mouth = (b.mouth.flow + (b.mouth.closing ? b.bite_signal : 0)) * progress;
  for (int k = 0; k < SECTOR_COUNT; ++k) {
    const double a = sector_angle(k);
    const double front = std::max(0., std::cos(a)), back = std::max(0., -std::cos(a));
    const double side = std::sin(a);
    const double tail = back * (std::max(0., -side) * tail_left + std::max(0., side) * tail_right);
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
  const double impulse =
      (tail_left + tail_right + left + right) / std::max(p.hatch_mass_floor, body_mass(b));
  if (e.shell < p.hatch_shell_limit && impulse > p.hatch_force_base + p.hatch_force_shell * e.shell)
    mature_body(b);
  m.swimming_pending = false;
  m.relative_speed = 0;
  m.thrust = m.torque = 0;
  (void)g;
}
}
