#include "small_animals.hh"
#include "material.hh"
#include "state_validation.hh"
#include <ostream>
#include <set>
namespace fishsim {
void FoodWebState::write(std::ostream &out) const {
  out << "FOOD_WEB " << next_id << ' ' << introduced << ' ' << released << ' ' << food_eaten << ' '
      << initial << '\n';
  out << plankton.columns << ' ' << plankton.rows << ' ' << plankton.width << ' ' << plankton.height
      << '\n';
  for (double value : plankton.energy)
    out << value << ' ';
  out << '\n' << plankton.odor.size() << '\n';
  for (auto v : plankton.odor)
    out << v << ' ';
  out << '\n';
  for (auto value : plankton.cooldown)
    out << value << ' ';
  out << '\n' << plankton.sources.size() << '\n';
  for (const auto &p : plankton.sources)
    out << p.x << ' ' << p.y << '\n';
  out << heads.size() << '\n';
  for (const auto &v : heads)
    out << v.id << ' ' << v.patch << ' ' << v.age << ' ' << v.duration << ' ' << v.x << ' ' << v.y
        << ' ' << v.energy << ' ' << v.along << ' ' << v.base_x << ' ' << v.base_y << ' '
        << v.extension << ' ' << v.withdrawing << ' ' << v.morph << ' ' << v.ground << ' '
        << v.filter_rate << '\n';
  out << crabs.size() << '\n';
  for (const auto &v : crabs) {
    out << v.id << ' ' << v.patch << ' ' << v.target << ' ' << v.age << ' ' << v.next_move << ' '
        << v.exposed_age << ' ' << v.x << ' ' << v.y << ' ' << v.energy << ' ' << v.along << ' '
        << v.morph << ' ' << v.state << ' ' << v.digging << ' ' << v.direction << ' '
        << v.destination << ' ' << v.exposure << ' ' << v.stride << ' ' << v.crossing << ' '
        << v.crossing_x << ' ' << v.crossing_y << ' ' << v.crossing_angle << ' ' << v.depth << ' '
        << v.feeding.rate << ' ' << v.feeding.x << ' ' << v.feeding.y << ' ' << v.feeding.kind
        << ' ' << v.feeding.remaining << ' ' << v.path.size();
    for (auto id : v.path)
      out << ' ' << id;
    out << '\n';
  }
  out << mussels.size() << '\n';
  for (const auto &v : mussels)
    out << v.id << ' ' << v.patch << ' ' << v.age << ' ' << v.buried << ' ' << v.along << ' ' << v.x
        << ' ' << v.y << ' ' << v.energy << ' ' << v.morph << ' ' << v.closed << ' ' << v.filtered
        << ' ' << v.filter_rate << '\n';
  out << shells.size() << '\n';
  for (const auto &s : shells)
    out << s.id << ' ' << s.x << ' ' << s.y << ' ' << s.radius << ' ' << s.morph << ' ' << s.angle
        << ' ' << s.age << '\n';
}
void FoodWebState::read(std::istream &in) {
  using state::scalar;
  using state::value;
  FoodWebState candidate;
  std::string tag;
  value(in, tag);
  if (tag != "FOOD_WEB")
    throw std::runtime_error("missing food web");
  value(in, candidate.next_id);
  scalar(in, candidate.introduced, 0, 1e18);
  scalar(in, candidate.released, 0, 1e18);
  scalar(in, candidate.food_eaten, 0, 1e18);
  scalar(in, candidate.initial, 0, 1e18);
  auto &p = candidate.plankton;
  value(in, p.columns);
  value(in, p.rows);
  scalar(in, p.width, 0, 10000);
  scalar(in, p.height, 0, 10000);
  if (p.columns < 0 || p.rows < 0 || p.columns > 2000 || p.rows > 2000 ||
      (p.columns == 0) != (p.rows == 0))
    throw std::runtime_error("invalid plankton grid");
  p.energy.resize(std::size_t(p.columns) * p.rows);
  p.cooldown.resize(p.energy.size());
  for (auto &v : p.energy) {
    scalar(in, v, 0, 1e9);
    p.nonempty |= v > 0;
  }
  auto odors = state::count(in, 28000000);
  if (odors && odors != p.energy.size() * 7)
    throw std::runtime_error("invalid odor grid");
  p.odor.resize(odors);
  for (auto &v : p.odor)
    scalar(in, v, 0, 1e15);
  for (auto &v : p.cooldown)
    value(in, v);
  for (auto n = state::count(in, 256); n; --n) {
    Point source;
    scalar(in, source.x, 0, 1);
    scalar(in, source.y, 0, 1);
    p.sources.push_back(source);
  }
  std::set<std::uint64_t> ids;
  auto identity = [&](std::uint64_t &id) {
    value(in, id);
    if (!id || id >= candidate.next_id || !ids.insert(id).second)
      throw std::runtime_error("invalid animal identity");
  };
  for (auto n = state::count(in, 100000); n; --n) {
    WormHead v;
    identity(v.id);
    value(in, v.patch);
    value(in, v.age);
    value(in, v.duration);
    scalar(in, v.x, -10000, 10000);
    scalar(in, v.y, -10000, 10000);
    scalar(in, v.energy, 0, 1e9);
    scalar(in, v.along, 0, 1);
    scalar(in, v.base_x, -10000, 10000);
    scalar(in, v.base_y, -10000, 10000);
    scalar(in, v.extension, 0, 1);
    value(in, v.withdrawing);
    scalar(in, v.morph, 0, 3.999999);
    scalar(in, v.ground, -1, 1);
    scalar(in, v.filter_rate, 0, 1e9);
    candidate.heads.push_back(v);
  }
  for (auto n = state::count(in, 100000); n; --n) {
    Crab v;
    identity(v.id);
    value(in, v.patch);
    value(in, v.target);
    value(in, v.age);
    value(in, v.next_move);
    value(in, v.exposed_age);
    scalar(in, v.x, -10000, 10000);
    scalar(in, v.y, -10000, 10000);
    scalar(in, v.energy, 0, 1e9);
    scalar(in, v.along, 0, 1);
    scalar(in, v.morph, 0, 3.999999);
    value(in, v.state);
    value(in, v.digging);
    scalar(in, v.direction, -1, 1);
    scalar(in, v.destination, 0, 1);
    scalar(in, v.exposure, 0, 1);
    scalar(in, v.stride, 0, 1e15);
    scalar(in, v.crossing, 0, 1);
    scalar(in, v.crossing_x, -10000, 10000);
    scalar(in, v.crossing_y, -10000, 10000);
    scalar(in, v.crossing_angle, -100, 100);
    scalar(in, v.depth, .2, .8);
    scalar(in, v.feeding.rate, 0, 1e9);
    scalar(in, v.feeding.x, -10000, 10000);
    scalar(in, v.feeding.y, -10000, 10000);
    value(in, v.feeding.kind);
    value(in, v.feeding.remaining);
    if (v.feeding.kind < 0 || v.feeding.kind > 10 || v.feeding.remaining < 0 ||
        v.feeding.remaining > 22)
      throw std::runtime_error("invalid crab feeding state");
    if (v.state < 0 || v.state > 3 || v.digging < 0)
      throw std::runtime_error("invalid crab state");
    for (auto k = state::count(in, 100000); k; --k) {
      std::uint64_t id;
      value(in, id);
      v.path.push_back(id);
    }
    candidate.crabs.push_back(v);
  }
  for (auto n = state::count(in, 100000); n; --n) {
    Mussel v;
    identity(v.id);
    value(in, v.patch);
    value(in, v.age);
    value(in, v.buried);
    scalar(in, v.along, 0, 1);
    scalar(in, v.x, -10000, 10000);
    scalar(in, v.y, -10000, 10000);
    scalar(in, v.energy, 0, 1e9);
    scalar(in, v.morph, 0, mussel_families - 1e-6);
    value(in, v.closed);
    if (v.closed < 0 || v.closed > 10000)
      throw std::runtime_error("invalid mussel closure");
    scalar(in, v.filtered, 0, 1e18);
    scalar(in, v.filter_rate, 0, 1e9);
    candidate.mussels.push_back(v);
  }
  for (auto n = state::count(in, 128); n; --n) {
    EmptyShell s;
    identity(s.id);
    scalar(in, s.x, -10000, 10000);
    scalar(in, s.y, -10000, 10000);
    scalar(in, s.radius, 0, 1000);
    // Muschelschalen 0–7, Krabbenpanzerstücke 8–12.
    scalar(in, s.morph, 0, 11.999999);
    scalar(in, s.angle, -1e12, 1e12);
    value(in, s.age);
    if (s.age < 0 || s.age > 1600)
      throw std::runtime_error("invalid shell age");
    candidate.shells.push_back(s);
  }
  *this = std::move(candidate);
}
}
