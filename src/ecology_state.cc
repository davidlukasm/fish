#include "ecology.hh"
#include "state_validation.hh"
#include "body_state_limits.hh"
#include "state_population.hh"
#include "state_environment.hh"
#include "physiology.hh"
#include "eye_geometry.hh"
#include <istream>
#include <ostream>
#include <iomanip>
#include <stdexcept>
#include <set>
#include <map>
#include "ecology_internal.hh"
namespace fishsim {
using state::same_options;
using state::scalar;
using state::value;
void write_shared_genomes(std::ostream &out, const std::vector<const Genome *> &genes) {
  std::map<const evolution::History *, std::size_t> ids;
  std::vector<std::shared_ptr<evolution::History>> histories;
  for (const auto *g : genes) {
    auto h = g->cppn->history();
    if (!ids.count(h.get())) {
      ids[h.get()] = histories.size();
      histories.push_back(h);
    }
  }
  out << "SHARED_HISTORIES " << histories.size() << '\n';
  for (const auto &h : histories)
    h->write(out);
  std::map<const evolution::Genome *, std::size_t> shared;
  for (std::size_t i = 0; i < genes.size(); ++i) {
    const auto *g = genes[i];
    const auto [entry, first] = shared.emplace(g->cppn.get(), i);
    out << ids.at(g->cppn->history().get()) << ' ' << entry->second << '\n';
    g->write(out, false, first);
  }
}
std::vector<Genome> read_shared_genomes(std::istream &in, std::size_t size, bool develop) {
  std::string tag;
  std::size_t count;
  if (!(in >> tag >> count) || tag != "SHARED_HISTORIES" || count > size)
    throw std::runtime_error("invalid shared history table");
  std::vector<std::shared_ptr<evolution::History>> histories;
  for (std::size_t i = 0; i < count; ++i)
    histories.push_back(std::make_shared<evolution::History>(evolution::History::read(in)));
  std::vector<Genome> genes;
  for (std::size_t i = 0; i < size; ++i) {
    std::size_t id, shared;
    if (!(in >> id >> shared) || id >= histories.size() || shared > i)
      throw std::runtime_error("invalid shared history reference");
    genes.push_back(
        Genome::read(in, false, histories[id], shared < i ? genes[shared].cppn : nullptr));
  }
  if (develop)
    for (auto &g : genes)
      g.compile(false);
  return genes;
}
void write_population(std::ostream &out, const std::vector<Genome> &population) {
  out << "FISH_POPULATION " << population.size() << '\n';
  std::vector<const Genome *> genes;
  for (const auto &g : population)
    genes.push_back(&g);
  write_shared_genomes(out, genes);
}
std::vector<Genome> read_population(std::istream &in) {
  std::string tag;

  std::size_t size;
  if (!(in >> tag >> size) || tag != "FISH_POPULATION" || size > 2000)
    throw std::runtime_error("invalid population");
  return read_shared_genomes(in, size, true);
}

void Ecosystem::write_environment_cache_state(std::ostream &out) const {
  out << "PACED_ENV2 " << field.vegetation().plants.size() << '\n';
  auto part = [&](const PlantPart &q) {
    out << q.x << ' ' << q.y << ' ' << q.radius << ' ' << q.energy << ' ' << q.patch << ' '
        << q.kind << ' ' << q.along << ' ' << q.organ << ' ' << q.hardness << ' ' << q.hx << ' '
        << q.hy << ' ' << q.width << ' ' << q.along_from << ' ' << q.along_to << ' ' << q.organ_kind
        << '\n';
  };
  for (const auto &q : field.vegetation().plants)
    part(q);
  out << field.vegetation().plant_geometry_cache.size() << '\n';
  for (const auto &cache : field.vegetation().plant_geometry_cache) {
    out << cache.parts.size() << ' ' << (cache.bent ? 1 : 0) << '\n';
    for (const auto &q : cache.parts)
      part(q);
  }
  out << field.vegetation().surfaces.size() + field.vegetation().drifting_grass.size() << '\n';
  auto display = [&](const SurfacePatch &patch) {
    out << patch.organs.size();
    for (const auto &o : patch.organs) {
      out << ' ' << o.display_width;
      for (const auto *points : {&o.curve, &o.draw_curve})
        for (auto q : *points)
          out << ' ' << q.x << ' ' << q.y;
      for (double c : o.tint)
        out << ' ' << c;
    }
    out << '\n';
  };
  for (const auto &patch : field.vegetation().surfaces)
    display(patch);
  for (const auto &d : field.vegetation().drifting_grass)
    display(d.plant);
  out << field.lighting().canopy_density.size();
  for (double value : field.lighting().canopy_density)
    out << ' ' << value;
  out << '\n';
}
void Ecosystem::validate_checkpoint_entities() const {
  for (const auto *population : {&fish, &remembered_dead})
    for (const auto &p : *population)
      state::validate_body_state(p.body, field.geometry().width, field.geometry().height,
                                 energy_limit());
  for (const auto &food : field.feeding().pieces) {
    state::validate_scalar(food.x, {0, field.geometry().width});
    state::validate_scalar(food.y, {0, field.geometry().height});
    state::validate_scalar(food.energy, {0, energy_limit()});
  }
}
void Ecosystem::write(std::ostream &out) const {
  validate_checkpoint_entities();
  out << std::setprecision(17) << "FISH_ECOSYSTEM_019\n"
      << ticks << ' ' << next_id << ' ' << metrics_.births << ' ' << metrics_.deaths << ' '
      << metrics_.rescues << ' ' << metrics_.imports << ' ' << observation_interval << ' '
      << population_limit << ' ' << safety << '\n';
  out << metrics_.window_exposure << ' ' << metrics_.window_nutrition << ' '
      << metrics_.window_births << ' ' << metrics_.window_deaths << ' ' << metrics_.window_rescues
      << ' ' << metrics_.window_adult_deaths << ' ' << metrics_.window_food_nutrition << '\n'
      << rng.engine << '\n';
  out << support_.self_fertilisations << ' ' << support_.assistance_food << ' '
      << metrics_.fish_bites << ' ' << metrics_.predation_deaths << '\n';
  {
    auto table = const_cast<Ecosystem *>(this)->parameters();
    out << table.size();
    for (const auto &q : table)
      out << ' ' << q.name << ' ' << q.value;
    out << '\n';
  }
  auto sample = [&](const PerformanceSample &s) {
    out << s.tick << ' ' << s.exposure << ' ' << s.natural_deaths << ' ' << s.hatches << ' '
        << s.food << ' ' << s.nutrition << ' ' << s.drift << ' ' << s.support_deaths << ' '
        << s.support_hatches;
    for (double d : s.diet)
      out << ' ' << d;
    out << '\n';
  };
  sample(metrics_.performance_total);
  out << metrics_.performance_history.size() << '\n';
  for (const auto &s : metrics_.performance_history)
    sample(s);
  for (const auto *pulse : {&food_pulse, &mutation_pulse})
    out << pulse->next << ' ' << pulse->until << ' ' << pulse->size << ' ' << pulse->cluster << ' '
        << pulse->manual_strength << '\n';
  out << workers << ' ' << novelty_strength << ' ' << neural_budget << ' ' << metrics_.released_eggs
      << ' ' << metrics_.released_sperm << ' ' << metrics_.fertilisations << ' '
      << metrics_.expired_eggs << ' ' << metrics_.clonal_starts << ' ' << metrics_.clonal_hatches
      << ' ' << environment << ' ' << metrics_.budget_rejections << ' ' << metrics_.dead_window_best
      << ' ' << metrics_.eggs_eaten << ' ' << metrics_.nutrient_eggs << '\n';
  out << metrics_.corpses_eaten << ' ' << metrics_.collision_deaths << '\n';
  out << corpses.size() << '\n';
  for (const auto &c : corpses) {
    out << c.x << ' ' << c.y << ' ' << c.vx << ' ' << c.vy << ' ' << c.energy << ' '
        << c.initial_energy << ' ' << c.age;
    for (auto x : c.color)
      out << ' ' << x;
    out << ' ' << c.angle << ' ' << c.radius << ' ' << c.hatched << ' ' << c.bone_age;
    out << "\nCORPSE_DECAY " << corpse_decay_age(c) << ' ' << c.blood_id << ' ' << c.species << ' '
        << c.death_cause << ' ' << c.resting << '\n';
  }
  out << events.size() << '\n';
  for (const auto &e : events)
    out << e.tick << ' ' << std::quoted(e.command) << '\n';
  for (auto x : metrics_.death_causes)
    out << x << ' ';
  out << '\n';
  for (auto x : metrics_.disease_cases)
    out << x << ' ';
  out << '\n';
  EnvironmentCheckpoint::write(out, field, physiology_);

  std::vector<const Genome *> genes;
  auto gene_id = [&](const Genome &g) {
    for (std::size_t i = 0; i < genes.size(); ++i)
      if (g.cppn && state::same_development(*genes[i], g))
        return i;
    genes.push_back(&g);
    return genes.size() - 1;
  };
  for (const auto &g : support_.reserve)
    gene_id(g);
  for (const auto &g : support_.pool_founders)
    gene_id(g);
  for (const auto &p : fish)
    gene_id(p.genome);
  for (const auto &p : remembered_dead)
    gene_id(p.genome);
  for (const auto &s : sperm)
    gene_id(s.genome);
  for (const auto &a : support_.archive)
    gene_id(a.genome);
  for (const auto &b : support_.breeders)
    gene_id(b.genome);
  for (const auto &s : taxonomy_.species)
    gene_id(s.representative);
  out << genes.size() << '\n';
  write_shared_genomes(out, genes);
  out << taxonomy_.milestones.size() << '\n';
  for (const auto &m : taxonomy_.milestones)
    out << m.tick << ' ' << m.species << ' ' << std::quoted(m.key) << '\n';
  out << taxonomy_.next_species << ' ' << taxonomy_.hatches << ' '
      << taxonomy_.reproductive_descendants << ' ' << metrics_.environment_tick << ' '
      << metrics_.environment_births << ' ' << metrics_.environment_rescues << ' '
      << metrics_.environment_adults << '\n';
  out << "ENV_IMPORTS " << metrics_.environment_imports << '\n';
  out << taxonomy_.species.size() << '\n';
  for (const auto &s : taxonomy_.species) {
    s.hormones.write(out);
    out << s.id << ' ' << std::quoted(s.name) << ' ' << gene_id(s.representative) << ' ' << s.born
        << ' ' << s.last_seen << ' ' << s.hatches << ' ' << s.successful_offspring << ' '
        << s.feeding_generations << ' ' << s.protection_used << ' ' << s.last_protection << ' '
        << s.diet_steps << ' ' << s.lifetime_drift << ' ';
    out << s.lifetime_digested << ' ';
    for (double value : s.lifetime_raw_diet)
      out << value << ' ';
    for (double value : s.lifetime_diet)
      out << value << ' ';
    out << s.habitat_steps << ' ' << s.lifetime_profile_samples << ' ' << s.lifetime_body.samples
        << ' ';
    for (double v : s.lifetime_habitat)
      out << v << ' ';
    for (double v : s.lifetime_profile)
      out << v << ' ';
    s.lifetime_body.values([&](double v) { out << v << ' '; });
    out << s.best_nutrition_rate << ' ' << s.confirmed << ' ' << s.replacement_hatches << ' '
        << s.replacement_deaths << ' ' << s.replacement_history.size() << ' ';
    for (const auto &r : s.replacement_history)
      out << r.tick << ' ' << r.hatches << ' ' << r.deaths << ' ';
    out << s.mother_species << ' ' << s.father_species << ' ' << s.extinct_at << ' ' << s.origin
        << ' ' << s.profile_environment << ' ' << s.profile_samples;
    for (double d : s.profile)
      out << ' ' << d;
    out << ' ' << s.first_profile_tick << ' ' << s.first_profile_samples << ' '
        << s.comparison_parents;
    for (double d : s.first_delta)
      out << ' ' << d;
    out << '\n';
    out << "TAXONOMY " << s.genus << ' ' << std::quoted(s.epithet) << ' '
        << std::quoted(s.name_candidate) << ' ' << std::quoted(s.name_reason) << ' '
        << std::quoted(s.candidate_reason) << ' ' << s.name_since << ' ' << s.max_founder_distance
        << '\n';
  }
  out << support_.reserve.size() << ' ';
  for (const auto &g : support_.reserve)
    out << gene_id(g) << ' ';
  out << '\n';
  out << support_.pool_founders.size() << ' ';
  for (const auto &g : support_.pool_founders)
    out << gene_id(g) << ' ';
  out << '\n';
  out << next_sperm_id << ' ' << sperm.size() << '\n';
  for (const auto &s : sperm) {
    out << gene_id(s.genome) << ' ' << s.x << ' ' << s.y << ' ' << s.parent << ' ' << s.energy
        << ' ' << s.depth << ' ' << s.species << ' ' << s.natural << ' ' << s.novelty << ' ' << s.g
        << ' ' << s.color[0] << ' ' << s.color[1] << ' ' << s.color[2] << ' ' << s.release_radius
        << ' ' << s.render_id << ' ' << s.feeding_generations << ' ' << s.fertile << ' '
        << s.columns << ' ' << s.rows << ' ' << s.width << ' ' << s.height << ' ' << s.cells.size()
        << '\n';
    for (auto [at, mass] : s.cells)
      out << at << ' ' << mass << ' ';
    out << '\n';
  }
  out << support_.archive.size() << '\n';
  for (const auto &a : support_.archive) {
    out << gene_id(a.genome) << ' ' << a.quality << ' ' << a.novelty << ' ' << a.tick << ' '
        << a.egg_role << ' ' << a.environment << ' ' << a.species;
    for (double d : a.behavior)
      out << ' ' << d;
    out << ' ' << a.offspring << '\n';
  }
  out << support_.breeders.size() << '\n';
  for (const auto &b : support_.breeders)
    out << gene_id(b.genome) << ' ' << b.id << ' ' << b.species << ' ' << b.environment << ' '
        << b.food << ' ' << b.offspring << ' ' << b.depth << ' ' << b.food_rate << ' '
        << b.resting_cost << ' ' << b.observed_steps << '\n';
  write_population_state(out, fish, genes);
  out << "REMEMBERED " << revivals << '\n';
  write_population_state(out, remembered_dead, genes);
  hormone_analysis_.write(out);
  write_environment_cache_state(out);
  out << "ARCHIVE_SOURCES " << support_.archive.size();
  for (const auto &a : support_.archive)
    out << ' ' << a.source_id;
  out << '\n';
  out << "CORPSE_VISUALS " << corpses.size() << '\n';
  for (const auto &c : corpses) {
    out << bool(c.visual);
    if (c.visual) {
      const auto &q = *c.visual;
      for (auto v : q.anatomy)
        out << ' ' << v;
      for (const auto &f : q.fins)
        out << ' ' << f.cells << ' ' << f.strength << ' ' << f.x << ' ' << f.y << ' ' << f.spread;
      for (const auto &f : q.forms)
        out << ' ' << f.x << ' ' << f.y << ' ' << f.z << ' ' << f.sy << ' ' << f.sz << ' '
            << f.weight;
      for (auto v : q.contour)
        out << ' ' << v;
      for (auto v : c.visual_state)
        out << ' ' << v;
    }
    out << '\n';
  }

  out << "ENERGY_FLOW " << field.feeding().food_supplied << ' ' << field.feeding().food_decayed
      << ' ' << field.feeding().food_initial << ' ' << field.feeding().food_manual << ' '
      << field.feeding().food_support << '\n';
  out << "CORPSE_REGIONS " << corpses.size() << '\n';
  for (const auto &c : corpses) {
    if (c.visual)
      for (const auto &f : c.visual->regions)
        out << f.x << ' ' << f.y << ' ' << f.z << ' ' << f.sy << ' ' << f.sz << ' ' << f.weight
            << ' ';
    out << '\n';
  }
}
void Ecosystem::read(std::istream &in, const Ecosystem *blueprint_cache) {
  Ecosystem loaded(0);
  loaded.read_state(in, blueprint_cache);
  loaded.support_.founder = support_.founder;
  if (!loaded.support_.reserve.empty())
    loaded.support_.founder = loaded.support_.reserve.front();
  *this = std::move(loaded);
}
void EnvironmentCheckpoint::read_cache(std::istream &in, Field &field) {

  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  std::string tag;
  value(in, tag);
  // PACED_ENV caches hold round parts only; PACED_ENV2 adds the stroke geometry.
  if (tag != "PACED_ENV" && tag != "PACED_ENV2")
    throw std::runtime_error("missing paced environment");
  const bool strokes = tag == "PACED_ENV2";
  std::size_t total = 0;
  auto parts = [&](std::vector<PlantPart> &parts, bool *bent = nullptr) {
    auto n = count(2000000);
    if (bent && strokes) {
      int flag = 0;
      value(in, flag);
      *bent = flag != 0;
    }
    total += n;
    if (total > 4000000)
      throw std::runtime_error("plant cache budget exceeded");
    parts.clear();
    parts.reserve(n);
    for (std::size_t i = 0; i < n; ++i) {
      PlantPart q;
      scalar(in, q.x, 0, field.geometry_.width);
      scalar(in, q.y, -1e6, 1e6);
      scalar(in, q.radius, 0, 256);
      scalar(in, q.energy, 0, 1e9);
      value(in, q.patch);
      value(in, q.kind);
      scalar(in, q.along, 0, 1);
      value(in, q.organ);
      scalar(in, q.hardness, .1, 16);
      if (strokes) {
        scalar(in, q.hx, -256, 256);
        scalar(in, q.hy, -256, 256);
        scalar(in, q.width, 0, 256);
        scalar(in, q.along_from, 0, 1);
        scalar(in, q.along_to, 0, 1);
        value(in, q.organ_kind);
      } else
        q.along_from = q.along_to = q.along;
      if (q.patch >= field.vegetation_.surfaces.size() + field.vegetation_.drifting_grass.size() ||
          (q.kind != 4 && q.kind != 5) || q.organ < -1 || q.organ >= 64)
        throw std::runtime_error("invalid cached plant part");
      parts.push_back(q);
    }
  };
  parts(field.vegetation_.plants);
  auto caches = count(field.vegetation_.surfaces.size());
  if (caches && caches != field.vegetation_.surfaces.size())
    throw std::runtime_error("invalid geometry cache");
  field.vegetation_.plant_geometry_cache.resize(caches);
  for (auto &cache : field.vegetation_.plant_geometry_cache)
    parts(cache.parts, &cache.bent);
  if (count(220000) != field.vegetation_.surfaces.size() + field.vegetation_.drifting_grass.size())
    throw std::runtime_error("invalid displayed plants");
  auto display = [&](SurfacePatch &patch) {
    if (count(64) != patch.organs.size())
      throw std::runtime_error("invalid displayed organs");
    for (auto &o : patch.organs) {
      scalar(in, o.display_width, 0, 16);
      for (auto *points : {&o.curve, &o.draw_curve})
        for (auto &q : *points) {
          scalar(in, q.x, -1e6, 1e6);
          scalar(in, q.y, -1e6, 1e6);
        }
      for (auto &c : o.tint)
        scalar(in, c, 0, 1);
    }
  };
  for (auto &patch : field.vegetation_.surfaces)
    display(patch);
  for (auto &d : field.vegetation_.drifting_grass)
    display(d.plant);
  auto light = count(field.lighting_.illumination.size());
  if (light && light != field.lighting_.illumination.size())
    throw std::runtime_error("invalid paced light");
  field.lighting_.canopy_density.resize(light);
  for (auto &value : field.lighting_.canopy_density)
    scalar(in, value, 0, 1e9);
  field.vegetation_.plant_grid.reset(field.geometry_.width, field.geometry_.height);
  field.vegetation_.indexed_plant_radius = 8;
  for (std::size_t i = 0; i < field.vegetation_.plants.size(); ++i) {
    field.vegetation_.plant_grid.add(field.vegetation_.plants[i].x, field.vegetation_.plants[i].y,
                                     i);
    field.vegetation_.indexed_plant_radius =
        std::max(field.vegetation_.indexed_plant_radius, field.vegetation_.plants[i].radius);
  }
}
void EnvironmentCheckpoint::read_energy_flow(std::istream &in, Field &field) {

  std::string flow;
  value(in, flow);
  if (flow != "ENERGY_FLOW")
    throw std::runtime_error("missing energy flow");
  scalar(in, field.feeding_.food_supplied, 0, 1e15);
  scalar(in, field.feeding_.food_decayed, 0, 1e15);
  scalar(in, field.feeding_.food_initial, 0, 1e15);
  scalar(in, field.feeding_.food_manual, 0, 1e15);
  scalar(in, field.feeding_.food_support, 0, 1e15);
}
// Complexity exception: this transactional decoder follows the checkpoint field order.
// Publish only a fully read world.
void Ecosystem::read_state(std::istream &in, const Ecosystem *blueprint_cache) {
  std::string magic;
  value(in, magic);
  if (magic != "FISH_ECOSYSTEM_019")
    throw std::runtime_error("invalid aquarium checkpoint");
  fish.clear();
  remembered_dead.clear();
  revivals = 0;
  field = Field(0, 0);
  field.initialize_aquarium(field.geometry().width, field.geometry().height);
  corpses.clear();
  metrics_.corpses_eaten = metrics_.collision_deaths = 0;
  sperm.clear();
  recent_deaths.clear();
  support_.archive.clear();
  events.clear();
  metrics_.death_causes = {};
  metrics_.eggs_eaten = 0;
  value(in, ticks);
  value(in, next_id);
  value(in, metrics_.births);
  value(in, metrics_.deaths);
  value(in, metrics_.rescues);
  value(in, metrics_.imports);
  value(in, observation_interval);
  value(in, population_limit);
  value(in, safety);
  if (observation_interval < 1 || observation_interval > 1000000 || population_limit < 1 ||
      population_limit > 2000)
    throw std::runtime_error("invalid population limits");
  value(in, metrics_.window_exposure);
  scalar(in, metrics_.window_nutrition, 0, 1e12);
  value(in, metrics_.window_births);
  value(in, metrics_.window_deaths);
  value(in, metrics_.window_rescues);
  value(in, metrics_.window_adult_deaths);
  scalar(in, metrics_.window_food_nutrition, 0,
         metrics_.window_nutrition + 1e-9 + 1e-12 * metrics_.window_nutrition);
  value(in, rng.engine);
  support_.self_fertilisations = support_.assistance_food = metrics_.fish_bites =
      metrics_.predation_deaths = 0;
  support_.breeders.clear();
  {
    value(in, support_.self_fertilisations);
    value(in, support_.assistance_food);
    value(in, metrics_.fish_bites);
    value(in, metrics_.predation_deaths);
  }
  evo = EvolutionParameters{};
  disease = DiseaseParameters{};
  {
    std::size_t n;
    value(in, n);
    if (n > 512)
      throw std::runtime_error("invalid parameters");
    // Restore shares from an empty allocation so file order cannot reject a valid sum.
    set_parameter("food_supply_share", 0);
    set_parameter("plankton_supply_share", 0);
    set_parameter("benthic_supply_share", 0);
    for (std::size_t i = 0; i < n; ++i) {
      std::string name;
      double v;
      value(in, name);
      value(in, v);
      if (!set_parameter(name, v))
        throw std::runtime_error("unknown parameter " + name);
    }
  }
  // Physical darkness is independent of the observer exposure in the renderer.
  auto sample = [&](PerformanceSample &s) {
    value(in, s.tick);
    value(in, s.exposure);
    value(in, s.natural_deaths);
    value(in, s.hatches);
    scalar(in, s.food, 0, 1e15);
    scalar(in, s.nutrition, std::max(0., s.food - 1e-9 - 1e-12 * s.food), 1e15);
    scalar(in, s.drift, 0, 1e15);
    {
      value(in, s.support_deaths);
      value(in, s.support_hatches);
    }
    for (auto &d : s.diet)
      scalar(in, d, 0, 1e15);
    if (s.tick > ticks || s.hatches > metrics_.births)
      throw std::runtime_error("invalid performance sample");
  };
  sample(metrics_.performance_total);
  std::size_t history_size;
  value(in, history_size);
  if (!history_size || history_size > 8192)
    throw std::runtime_error("invalid performance window");
  metrics_.performance_history.clear();
  for (std::size_t i = 0; i < history_size; ++i) {
    PerformanceSample s;
    sample(s);
    if (!metrics_.performance_history.empty() &&
        (s.tick < metrics_.performance_history.back().tick ||
         s.exposure < metrics_.performance_history.back().exposure ||
         s.natural_deaths < metrics_.performance_history.back().natural_deaths))
      throw std::runtime_error("nonmonotonic performance window");
    metrics_.performance_history.push_back(s);
  }
  for (auto *pulse : {&food_pulse, &mutation_pulse}) {
    value(in, pulse->next);
    value(in, pulse->until);
    scalar(in, pulse->size, .1, 2);
    scalar(in, pulse->cluster, 1, 20);
    scalar(in, pulse->manual_strength, 0, 9);
  }
  value(in, workers);
  scalar(in, novelty_strength, 0, 1);
  value(in, neural_budget);
  if (workers < 1 || workers > 64 || neural_budget > 256000000)
    throw std::runtime_error("invalid runtime budgets");
  value(in, metrics_.released_eggs);
  value(in, metrics_.released_sperm);
  value(in, metrics_.fertilisations);
  value(in, metrics_.expired_eggs);
  value(in, metrics_.clonal_starts);
  value(in, metrics_.clonal_hatches);
  value(in, environment);
  value(in, metrics_.budget_rejections);
  scalar(in, metrics_.dead_window_best, 0, 1e9);
  value(in, metrics_.eggs_eaten);
  value(in, metrics_.nutrient_eggs);
  {
    field.refresh_niche_limits();
    value(in, metrics_.corpses_eaten);
    value(in, metrics_.collision_deaths);
    std::size_t count;
    value(in, count);
    if (count > 20000)
      throw std::runtime_error("invalid corpse count");
    for (std::size_t i = 0; i < count; ++i) {
      Corpse c;
      scalar(in, c.x, 0, 4920);
      scalar(in, c.y, 0, 3280);
      scalar(in, c.vx, -16, 16);
      scalar(in, c.vy, -16, 16);
      scalar(in, c.energy, 0, energy_limit());
      scalar(in, c.initial_energy, c.energy, energy_limit());
      value(in, c.age);
      for (auto &x : c.color)
        scalar(in, x, 0, 1);
      {
        scalar(in, c.angle, -PI, PI);
        scalar(in, c.radius, 0, 256);
        value(in, c.hatched);
        value(in, c.bone_age);
        if (c.bone_age > field.env().bone_time)
          throw std::runtime_error("invalid skeleton age");
      }
      {
        std::string tag;
        value(in, tag);
        if (tag != "CORPSE_DECAY")
          throw std::runtime_error("invalid corpse decay");
        scalar(in, c.decay_age, 0, 8. * c.age);
        value(in, c.blood_id);
        value(in, c.species);
        value(in, c.death_cause);
        value(in, c.resting);
        if (c.blood_id >= next_id || c.death_cause < 0 || c.death_cause > 7)
          throw std::runtime_error("invalid corpse identity");
      }
      corpses.push_back(c);
    }
  }
  std::size_t event_count;
  value(in, event_count);
  if (event_count > 64)
    throw std::runtime_error("invalid event journal");
  events.clear();
  for (std::size_t i = 0; i < event_count; ++i) {
    WorldEvent e;
    value(in, e.tick);
    if (!(in >> std::quoted(e.command)) || e.tick > ticks || e.command.size() > 4096)
      throw std::runtime_error("invalid world event");
    events.push_back(e);
  }
  for (auto &cause : metrics_.death_causes)
    value(in, cause);
  for (auto &cases : metrics_.disease_cases)
    value(in, cases);
  EnvironmentCheckpoint::read(in, field, physiology_);
  auto count = [&](std::size_t maximum) { return state::count(in, maximum); };
  auto genes = read_shared_genomes(in, count(16384), false);
  if (blueprint_cache) {
    std::vector<const Genome *> ready;
    auto add = [&](const Genome &g) {
      if (g.blueprint && std::none_of(ready.begin(), ready.end(), [&](const Genome *old) {
            return state::same_development(*old, g);
          }))
        ready.push_back(&g);
    };
    for (const auto &p : blueprint_cache->fish)
      add(p.genome);
    for (const auto &p : blueprint_cache->remembered_dead)
      add(p.genome);
    for (const auto &g : blueprint_cache->support_.reserve)
      add(g);
    for (const auto &g : blueprint_cache->support_.pool_founders)
      add(g);
    for (const auto &a : blueprint_cache->support_.archive)
      add(a.genome);
    for (const auto &b : blueprint_cache->support_.breeders)
      add(b.genome);
    for (auto &g : genes)
      for (const auto *source : ready)
        if (same_options(g.development_options, source->development_options) &&
            g.variation_seed == source->variation_seed && g.same_genes(*source)) {
          g.blueprint = source->blueprint;
          g.interface = source->interface;
          break;
        }
  }
  auto genome = [&](bool develop = true) { return state::genome(in, genes, develop); };
  taxonomy_.milestones.clear();
  for (auto n = count(20000); n; --n) {
    EcologicalMilestone m;
    value(in, m.tick);
    value(in, m.species);
    if (!(in >> std::quoted(m.key)) || m.tick > ticks || m.key.size() > 64)
      throw std::runtime_error("invalid ecological milestone");
    taxonomy_.milestones.push_back(std::move(m));
  }
  value(in, taxonomy_.next_species);
  value(in, taxonomy_.hatches);
  value(in, taxonomy_.reproductive_descendants);
  value(in, metrics_.environment_tick);
  value(in, metrics_.environment_births);
  value(in, metrics_.environment_rescues);
  value(in, metrics_.environment_adults);
  if (metrics_.environment_tick > ticks || metrics_.environment_adults < 0 ||
      metrics_.environment_adults > 2000)
    throw std::runtime_error("invalid environment baseline");
  metrics_.environment_imports = 0;
  {
    std::string tag;
    value(in, tag);
    value(in, metrics_.environment_imports);
    if (tag != "ENV_IMPORTS" || metrics_.environment_imports > metrics_.imports)
      throw std::runtime_error("invalid immigration baseline");
  }
  taxonomy_.species.clear();
  for (auto n = count(4096); n; --n) {
    GeneticSpecies s;
    s.hormones.read(in);
    value(in, s.id);
    if (!(in >> std::quoted(s.name)))
      throw std::runtime_error("invalid species name");
    auto id = count(genes.size());
    if (id >= genes.size())
      throw std::runtime_error("invalid representative");
    s.representative = genes[id];
    value(in, s.born);
    value(in, s.last_seen);
    value(in, s.hatches);
    value(in, s.successful_offspring);
    value(in, s.feeding_generations);

    value(in, s.protection_used);
    value(in, s.last_protection);
    if (s.feeding_generations > 2 || s.protection_used > 3 || s.last_protection > ticks)
      throw std::runtime_error("invalid species protection");
    value(in, s.diet_steps);
    scalar(in, s.lifetime_drift, 0, 1e18);
    scalar(in, s.lifetime_digested, 0, 1e18);
    for (double &v : s.lifetime_raw_diet)
      scalar(in, v, 0, 1e18);
    for (double &v : s.lifetime_diet)
      scalar(in, v, 0, 1e18);
    value(in, s.habitat_steps);
    value(in, s.lifetime_profile_samples);
    value(in, s.lifetime_body.samples);
    for (double &v : s.lifetime_habitat)
      scalar(in, v, 0, double(s.habitat_steps));
    for (double &v : s.lifetime_profile)
      scalar(in, v, 0, 1);
    s.lifetime_body.values([&](double &v) { scalar(in, v, 0, 1e24); });
    if (s.lifetime_drift > s.lifetime_diet[5] + 1e-6)
      throw std::runtime_error("invalid species drift food");
    scalar(in, s.best_nutrition_rate, 0, 1e6);
    value(in, s.confirmed);
    value(in, s.replacement_hatches);
    value(in, s.replacement_deaths);
    s.replacement_history.clear();
    for (auto n = count(8192); n; --n) {
      ReplacementSample r;
      value(in, r.tick);
      value(in, r.hatches);
      value(in, r.deaths);
      if (r.tick > ticks || r.hatches > s.replacement_hatches || r.deaths > s.replacement_deaths ||
          (!s.replacement_history.empty() && (r.tick < s.replacement_history.back().tick ||
                                              r.hatches < s.replacement_history.back().hatches ||
                                              r.deaths < s.replacement_history.back().deaths)))
        throw std::runtime_error("invalid species replacement window");
      s.replacement_history.push_back(r);
    }
    if (s.replacement_history.empty())
      throw std::runtime_error("empty species replacement window");
    value(in, s.mother_species);
    value(in, s.father_species);
    value(in, s.extinct_at);
    value(in, s.origin);
    value(in, s.profile_environment);
    value(in, s.profile_samples);
    for (std::size_t k = 0; k < (BEHAVIOR_FEATURES); ++k)
      scalar(in, s.profile[k], 0, 1);
    value(in, s.first_profile_tick);
    value(in, s.first_profile_samples);
    value(in, s.comparison_parents);
    for (std::size_t k = 0; k < (BEHAVIOR_FEATURES); ++k)
      scalar(in, s.first_delta[k], -1, 1);
    if (s.first_profile_tick > ticks || s.first_profile_samples > 2000 ||
        s.comparison_parents < 0 || s.comparison_parents > 2)
      throw std::runtime_error("invalid first species profile");
    if (s.mother_species >= s.id || s.father_species >= s.id || s.extinct_at > ticks ||
        s.origin < 0 || s.origin > 3 || s.profile_environment > environment ||
        s.profile_samples > 2000)
      throw std::runtime_error("invalid species observations");
    if ((!s.id || (!taxonomy_.species.empty() && s.id <= taxonomy_.species.back().id)) ||
        s.name.empty() || s.name.size() > 64 || s.born > ticks || s.last_seen > ticks)
      throw std::runtime_error("invalid species");
    {
      std::string tag;
      value(in, tag);
      value(in, s.genus);
      if (!(in >> std::quoted(s.epithet) >> std::quoted(s.name_candidate) >>
            std::quoted(s.name_reason) >> std::quoted(s.candidate_reason)))
        throw std::runtime_error("invalid taxonomy name");
      value(in, s.name_since);
      scalar(in, s.max_founder_distance, 0, 1000000);
      if (tag != "TAXONOMY" || s.genus > s.id || s.name_since > ticks || s.epithet.size() > 32 ||
          s.name_candidate.size() > 32 || s.name_reason.size() > 128 ||
          s.candidate_reason.size() > 128)
        throw std::runtime_error("invalid taxonomy");
    }
    s.representative.blueprint.reset();
    s.representative.interface.reset();
    s.representative.growing.reset();
    s.representative.growth_query.reset();
    taxonomy_.species.push_back(std::move(s));
  }
  for (const auto &s : taxonomy_.species)
    if (s.genus && !find_species(s.genus))
      throw std::runtime_error("missing genus founder");
  if (!taxonomy_.next_species ||
      (!taxonomy_.species.empty() && taxonomy_.next_species <= taxonomy_.species.back().id))
    throw std::runtime_error("invalid species counter");
  support_.reserve.clear();
  for (auto n = count(100); n; --n)
    support_.reserve.push_back(genome());
  support_.pool_founders.clear();
  for (auto n = count(100000); n; --n)
    support_.pool_founders.push_back(genome());
  value(in, next_sperm_id);
  if (!next_sperm_id)
    throw std::runtime_error("invalid sperm counter");
  sperm.clear();
  for (auto n = count(MAX_SPERM_RELEASES); n; --n) {
    Sperm s;
    s.genome = genome();
    scalar(in, s.x, 0, field.geometry().width);
    scalar(in, s.y, 0, field.geometry().height);
    value(in, s.parent);
    scalar(in, s.energy, 0, energy_limit());
    value(in, s.depth);
    value(in, s.species);
    value(in, s.natural);
    scalar(in, s.novelty, 0, 4);
    value(in, s.g);
    for (auto &c : s.color)
      scalar(in, c, 0, 1);
    scalar(in, s.release_radius, .001, 1000000);
    value(in, s.render_id);
    value(in, s.feeding_generations);
    value(in, s.fertile);
    value(in, s.columns);
    value(in, s.rows);
    if (s.columns < 0 || s.rows < 0 || s.columns > 2000 || s.rows > 2000)
      throw std::runtime_error("invalid sperm grid");
    scalar(in, s.width, 0, 10000);
    scalar(in, s.height, 0, 10000);
    if ((s.columns == 0) != (s.rows == 0) || (s.columns && (s.width <= 0 || s.height <= 0)))
      throw std::runtime_error("invalid sperm grid dimensions");
    double total = 0;
    for (auto left = count(4000000); left; --left) {
      std::uint32_t at;
      double mass;
      value(in, at);
      scalar(in, mass, 0, energy_limit());
      if (at >= std::size_t(s.columns) * s.rows || !s.cells.emplace(at, mass).second)
        throw std::runtime_error("invalid sperm cell");
      total += mass;
    }
    if (!s.columns || std::abs(total - s.energy) > 1e-6 * std::max(1., s.energy))
      throw std::runtime_error("invalid sperm mass");
    if (s.feeding_generations > 2)
      throw std::runtime_error("invalid gamete feeding ancestry");
    if (s.g > 2000000)
      throw std::runtime_error("invalid gamete generation");
    if ((s.species && !find_species(s.species)))
      throw std::runtime_error("invalid gamete species");
    if (s.parent == 0 || s.parent >= next_id || s.depth < 0)
      throw std::runtime_error("invalid gamete");
    sperm.push_back(s);
  }
  support_.archive.clear();
  for (auto n = count(128); n; --n) {
    ArchiveEntry a;
    a.genome = genome();
    scalar(in, a.quality, 0, 1e6);
    scalar(in, a.novelty, 0, 4);
    value(in, a.tick);
    value(in, a.egg_role);
    value(in, a.environment);
    value(in, a.species);
    if ((a.species && !find_species(a.species)))
      throw std::runtime_error("invalid archive species");
    if (a.environment > environment || a.tick > ticks)
      throw std::runtime_error("invalid behavior archive");
    for (std::size_t k = 0; k < (BEHAVIOR_FEATURES); ++k)
      scalar(in, a.behavior[k], 0, 1);
    value(in, a.offspring);
    if (a.offspring < 0)
      throw std::runtime_error("invalid archived offspring");
    support_.archive.push_back(a);
  }
  for (auto n = count(4096 + 64); n; --n) {
    Breeder b;
    b.genome = genome();
    value(in, b.id);
    value(in, b.species);
    value(in, b.environment);
    scalar(in, b.food, 0, 1e12);
    value(in, b.offspring);
    value(in, b.depth);

    scalar(in, b.food_rate, 0, 1e12);
    scalar(in, b.resting_cost, 0, 1e6);
    value(in, b.observed_steps);
    if (b.observed_steps < 0)
      throw std::runtime_error("invalid breeder exposure");
    if (!b.id || b.id >= next_id || !b.species || !find_species(b.species) ||
        b.environment > environment || b.food <= 0 || b.offspring < 0 || b.depth < 0)
      throw std::runtime_error("invalid breeder archive");
    support_.breeders.push_back(std::move(b));
  }
  read_population_state(in, fish, {field, taxonomy_, genes, ticks, next_id, energy_limit()});
  {
    std::string tag;
    value(in, tag);
    value(in, revivals);
    if (tag != "REMEMBERED")
      throw std::runtime_error("missing remembered fish");
    read_population_state(in, remembered_dead,
                          {field, taxonomy_, genes, ticks, next_id, energy_limit()});
    std::set<std::uint64_t> live_ids;
    for (const auto &p : fish)
      live_ids.insert(p.id);
    for (const auto &p : remembered_dead)
      if (p.body.alive || !p.remembered || live_ids.count(p.id))
        throw std::runtime_error("invalid remembered fish");
  }
  hormone_analysis_.read(in);
  EnvironmentCheckpoint::read_cache(in, field);
  {
    std::string tag;
    value(in, tag);
    if (tag != "ARCHIVE_SOURCES" || count(128) != support_.archive.size())
      throw std::runtime_error("invalid archive identities");
    for (auto &a : support_.archive) {
      value(in, a.source_id);
      if (a.source_id >= next_id)
        throw std::runtime_error("invalid archive parent");
    }
  }

  {
    std::string tag;
    value(in, tag);
    if (tag != "CORPSE_VISUALS" || count(20000) != corpses.size())
      throw std::runtime_error("invalid corpse anatomy count");
    for (auto &c : corpses) {
      bool present;
      value(in, present);
      if (!present)
        continue;
      auto q = std::make_shared<BrainInterface>();
      for (auto &v : q->anatomy)
        scalar(in, v, 0, 1e7);
      q->jaw_length = q->anatomy[anatomy_column::jaw_length];
      q->gut_length = q->anatomy[anatomy_column::gut_length];
      q->blunt_teeth = q->anatomy[anatomy_column::blunt_teeth];
      q->undulation = q->anatomy[anatomy_column::undulation];
      for (auto &f : q->fins) {
        scalar(in, f.cells, 0, 1e7);
        scalar(in, f.strength, 0, 1e7);
        scalar(in, f.x, -1, 1);
        scalar(in, f.y, 0, 1);
        scalar(in, f.spread, 0, 1);
      }
      for (auto &f : q->forms) {
        scalar(in, f.x, 0, 1);
        scalar(in, f.y, 0, 1);
        scalar(in, f.z, 0, 1);
        scalar(in, f.sy, 0, 1);
        scalar(in, f.sz, 0, 1);
        scalar(in, f.weight, 0, 1e7);
      }
      for (auto &v : q->contour)
        scalar(in, v, 0, 1);
      for (auto &v : c.visual_state)
        scalar(in, v, -1e7, 1e7);
      c.visual = q;
    }
  }
  EnvironmentCheckpoint::read_energy_flow(in, field);
  {
    std::string tag;
    value(in, tag);
    if (tag != "CORPSE_REGIONS" || count(20000) != corpses.size())
      throw std::runtime_error("invalid corpse regions");
    for (auto &c : corpses)
      if (c.visual) {
        auto q = std::make_shared<BrainInterface>(*c.visual);
        for (auto &f : q->regions) {
          scalar(in, f.x, 0, 1);
          scalar(in, f.y, 0, 1);
          scalar(in, f.z, 0, 1);
          scalar(in, f.sy, 0, 1);
          scalar(in, f.sz, 0, 1);
          scalar(in, f.weight, 0, 1e7);
        }
        prepare_body_geometry(*q);
        c.visual = q;
      }
  }

  for (auto &p : fish) {
    p.body.identity = p.id;
    p.body.reproduction_.egg_limit =
        ovary_capacity(p.body, p.genome, evo.egg_capacity, evo.egg_organ_capacity);
    p.body.reproduction_.sperm_limit =
        organ_capacity(p.body, p.genome, 5, physiology_.sperm_capacity);
    p.body.reproduction_.motor_reserve = maternal_reserve(p.body, evo.egg_reserve);
  }

  {
    // Geometry-dependent capacities may shrink below energy already present.
    // The import headroom stays zero until natural consumption releases it.
    refresh_food_allowance();
  }
  field.update_sediment_light();
  refresh_sperm_field();
}

}
