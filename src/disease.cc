#include "ecology_internal.hh"
#include "physiology.hh"
namespace fishsim {
bool Ecosystem::infect(Body &b, unsigned source) {
  if (b.immortal || !b.alive || !b.hatched || b.disease || source >= metrics_.disease_cases.size())
    return false;
  b.disease = int(disease.duration);
  ++metrics_.disease_cases[source];
  return true;
}
namespace {
// A disease passes only between fish of one line of descent.
bool related(const Genome &a, const Genome &b) {
  return a.cppn && b.cppn && a.cppn->history()->lineage() == b.cppn->history()->lineage();
}
}
double Ecosystem::disease_contact_chance(const Genome &source, const Genome &target) const {
  if (!related(source, target))
    return 0;
  return disease.spread *
         mating_chance(evolution::Genome::compatibility_distance(*source.cppn, *target.cppn),
                       taxonomy_.mating_distance);
}
double Ecosystem::disease_carrion_chance(double age) const {
  return disease.carrion * (1 - std::exp2(-std::max(0., age) / field.env().decay_half_life));
}
double Ecosystem::disease_food_chance(double age) const {
  return disease.food * (1 - std::exp2(-std::max(0., age) / field.env().food_half_life));
}

void Ecosystem::advance_diseases(bool protected_life) {
  std::vector<std::size_t> carriers;
  for (std::size_t i = 0; i < fish.size(); ++i) {
    auto &p = fish[i];
    auto &b = p.body;
    if (!b.alive || !b.hatched)
      continue;
    if (b.disease > 0) {
      carriers.push_back(i);
      if (!protected_life) {
        harm_body(b, disease.harm, death_reason::disease);
      }
      --b.disease;
    } else if (!protected_life && b.health > 0 && disease.rate > 0 && rng.uniform() < disease.rate)
      infect(b, infection_source::spontaneous);
  }
  if (protected_life || disease.spread <= 0 || carriers.empty())
    return;
  thread_local SpatialGrid grid;
  grid.reset(field.geometry().width, field.geometry().height);
  for (std::size_t i = 0; i < fish.size(); ++i) {
    const auto &b = fish[i].body;
    if (b.alive && b.hatched && b.health > 0)
      grid.add(b.x, b.y, std::uint32_t(i));
  }
  for (auto i : carriers) {
    const auto &p = fish[i];
    const auto &source = p.body;
    grid.nearby(source.x, source.y, body_radius(source) + MAX_BODY_RADIUS + disease.reach,
                [&](std::uint32_t j) {
                  auto &target = fish[j].body;
                  if (j == i || target.disease || target.health <= 0)
                    return;
                  double gap = std::hypot(field.delta_x(target.x - source.x), target.y - source.y) -
                               body_radius(source) - body_radius(target);
                  if (gap >= disease.reach)
                    return;
                  if (!related(p.genome, fish[j].genome))
                    return;
                  // No chance exceeds the spread: only a draw below it needs the genomes compared,
                  // which is costly and was most of a busy tank's resolve phase.
                  const double draw = rng.uniform();
                  if (draw < disease.spread &&
                      draw < disease_contact_chance(p.genome, fish[j].genome))
                    infect(target, infection_source::contact);
                });
  }
}
}
