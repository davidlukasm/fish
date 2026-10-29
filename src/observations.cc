#include "session_io.hh"
#include "eye_geometry.hh"
#include "protocol_schema.hh"
#include "observations.hh"
#include "hormone_view.hh"
#include "physiology.hh"
#include <iomanip>
#include <map>
#include <sstream>
namespace fishsim {
namespace {
struct AnatomyText {
  std::weak_ptr<const BrainInterface> owner;
  std::streamsize precision = 0;
  std::ios_base::fmtflags flags{};
  std::locale locale;
  std::string organs, fins_and_forms, contour, regions, body;
};
const AnatomyText &anatomy_text(std::ostream &out,
                                const std::shared_ptr<const BrainInterface> &binding) {
  // The anatomy is immutable. Weak ownership lets extinct plans leave the cache.
  static thread_local std::map<const BrainInterface *, AnatomyText> cache;
  static thread_local unsigned misses = 0;
  auto found = cache.find(binding.get());
  if (found != cache.end()) {
    const auto &text = found->second;
    if ((!binding || text.owner.lock() == binding) && text.precision == out.precision() &&
        text.flags == out.flags() && text.locale == out.getloc())
      return text;
  }
  if (++misses % 128 == 0) {
    for (auto it = cache.begin(); it != cache.end();) {
      if (it->first && it->second.owner.expired())
        it = cache.erase(it);
      else
        ++it;
    }
  }
  AnatomyText text;
  text.owner = binding;
  text.precision = out.precision();
  text.flags = out.flags();
  text.locale = out.getloc();
  std::ostringstream stream;
  stream.copyfmt(out);
  stream.width(0);
  stream << '[';
  for (std::size_t i = 0; i < BrainInterface::ANATOMY_FIELDS; ++i) {
    if (i)
      stream << ',';
    stream << (binding ? binding->anatomy[i] : 0);
  }
  stream << ']';
  text.organs = stream.str();
  stream.str("");
  stream << '[';
  for (int fin = 0; fin < 3; ++fin) {
    if (fin)
      stream << ',';
    const auto shape = binding ? binding->fins[fin] : BrainInterface::Fin{};
    stream << '[' << shape.cells << ',' << shape.strength << ',' << shape.x << ',' << shape.y << ','
           << shape.spread << ']';
  }
  stream << "],[";
  for (std::size_t i = 0; i < BrainInterface::FORM_COUNT; ++i) {
    if (i)
      stream << ',';
    stream << '[';
    if (binding) {
      const auto &q = binding->forms[i];
      if (q.weight > 0) {
        auto compact = [](double v) { return std::round(v * 1000) / 1000; };
        stream << compact(q.x) << ',' << compact(q.y) << ',' << compact(q.z) << ',' << compact(q.sy)
               << ',' << compact(q.sz) << ',' << q.weight;
        if (i == 1 || i == 2)
          stream << ',' << binding->eye_positions[i - 1][0] << ','
                 << binding->eye_positions[i - 1][1];
      }
    }
    stream << ']';
  }
  stream << ']';
  text.fins_and_forms = stream.str();
  stream.str("");
  stream << '[';
  for (int i = 0; i < 16; ++i) {
    if (i)
      stream << ',';
    stream << (binding ? binding->contour[i] : 0);
  }
  stream << ']';
  text.contour = stream.str();
  stream.str("");
  stream << '[';
  for (int i = 0; i < 6; ++i) {
    if (i)
      stream << ',';
    stream << '[';
    if (binding) {
      const auto &q = binding->regions[i];
      if (q.weight > 0) {
        auto compact = [](double v) { return std::round(v * 1000) / 1000; };
        stream << compact(q.x) << ',' << compact(q.y) << ',' << compact(q.z) << ',' << compact(q.sy)
               << ',' << compact(q.sz) << ',' << q.weight;
      }
    }
    stream << ']';
  }
  stream << ']';
  text.regions = stream.str();
  static const BrainInterface emptyBody = [] {
    BrainInterface b;
    prepare_body_geometry(b);
    return b;
  }();
  const auto &body = binding && binding->body_geometry[11] > 0 ? *binding : emptyBody;
  stream.str("");
  stream << '{';
  const char *plans[] = {"headPlan", "chestPlan", "torsoPlan", "facePlan"};
  const char *metrics[] = {"headBack",  "headLength",  "faceLength",     "restShoulder",
                           "faceWidth", "chestLength", "baseHindLength", "trunk",
                           "neckWidth", "chestPhase",  "center",         "extent"};
  for (int i = 0; i < 4; ++i) {
    if (i)
      stream << ',';
    stream << json_quoted(plans[i]) << ":[";
    for (int j = 0; j < 5; ++j) {
      if (j)
        stream << ',';
      stream << body.body_plans[i][j];
    }
    stream << ']';
  }
  for (int i = 0; i < 12; ++i)
    stream << ',' << json_quoted(metrics[i]) << ':' << body.body_geometry[i];
  stream << '}';
  text.body = stream.str();

  return cache.insert_or_assign(binding.get(), std::move(text)).first->second;
}
}
void write_morphology(std::ostream &out, const std::shared_ptr<const BrainInterface> &binding) {
  const auto &s = anatomy_text(out, binding);
  out << '[' << s.organs << ',' << s.fins_and_forms << ',' << s.contour << ',' << s.regions << ','
      << s.body << ']';
}
void write_individual(std::ostream &out, const Individual &p, std::uint64_t morphology,
                      double neural_cost) {
  const auto &b = p.body;
  static const AnatomyText empty = [] {
    AnatomyText text;
    text.organs = text.contour = text.regions = "[]";
    text.body = "null";
    text.fins_and_forms = "[],[]";
    return text;
  }();
  const auto &shape = morphology ? empty : anatomy_text(out, p.genome.interface);
  out << '[' << b.x << ',' << b.y << ',' << b.angle << ',' << b.eaten << ',' << p.id << ','
      << b.energy << ',' << b.age << ',' << p.niche() << ',' << (b.hatched ? 1 : 0) << ','
      << (b.development() ? b.development()->progress() : 1) << ',' << p.origin << ','
      << p.offspring << ',' << p.depth << ',' << (p.fertilised ? 1 : 0) << ','
      << (b.reproduction().egg_role ? 1 : 0) << ',' << p.father << ',' << b.color[0] << ','
      << b.color[1] << ',' << b.color[2] << ',' << b.motor().mouth_pose << ','
      << (p.genome.interface && p.genome.interface->anatomy[anatomy_column::eggs] > 0 ? 1 : 0)
      << ','
      << (p.genome.interface && p.genome.interface->anatomy[anatomy_column::sperm] > 0 ? 1 : 0)
      << ',' << p.species << ',' << b.health << ',' << b.motor().thrust << ',' << b.motor().torque
      << ',' << b.defense() << ',' << b.motor().aggression << ',' << p.observations().window_corpses
      << ',' << p.maternal_species << ',' << p.paternal_species << ',' << (p.clonal ? 1 : 0) << ','
      << (morphology ? "null" : shape.organs) << ',' << b.motor().speed << ',' << b.motor().impact
      << ',' << p.parent << ',' << b.nutrition << ',' << b.nutrition_steps << ','
      << (p.genome.blueprint ? p.genome.blueprint->neurons.size() : 0) << ','
      << (p.genome.blueprint ? p.genome.blueprint->edges.size() : 0) << ',' << p.born << ',' << p.g
      << ',' << b.motor().impulse_left << ',' << b.motor().impulse_right << ',' << b.motor().tail
      << ',' << b.motor().relative_speed << ',' << b.reproduction().egg_yolk << ','
      << (b.reproduction().egg_laying ? 1 : 0) << ',' << b.reproduction().sperm_store << ','
      << (p.nutrient_egg ? 1 : 0) << ',' << body_mass(b) << ',' << collision_radius(b) << ','
      << b.disease << ',' << reserve_capacity(b) << ','
      << (b.hatched ? std::max(0, b.age - b.hatch_age) : 0) << ',' << b.motor().impulse_forward
      << ',' << b.motor().motor_factor << ",[";
  for (int fin = 0; fin < 3; ++fin) {
    if (fin)
      out << ',';
    out << b.motor().fin_tension[fin];
  }
  out << ",[" << b.motor().fin_stroke_age[0] << ',' << b.motor().fin_stroke_age[1];
  for (double peak : b.motor().fin_stroke_peak)
    out << ',' << peak;
  out << "]]," << (morphology ? "null,null" : shape.fins_and_forms) << ','
      << p.observations().window_traits[3] / std::max(1, p.observations().window_steps) << ','
      << std::min(p.genome.development_options.neuron_budget,
                  p.genome.development_options.max_nodes)
      << ',' << b.eat_signal << ',' << maximum_mouth_aperture(b) << ',' << b.motor().bite_pose
      << ',' << b.motor().suction_pose << ',' << (morphology ? "null" : shape.contour) << ','
      << b.reproduction().egg_limit << ',' << b.reproduction().sperm_limit << ',' << b.tissue << ','
      << (morphology ? "null" : shape.regions) << ',' << b.bladder_fill << ',' << gut_filling(b)
      << ',' << b.pain << ",[" << predicted_hatch_radius(b, p.genome, neural_cost) << ','
      << b.birth_tissue << "]," << (morphology ? "null" : shape.body);
  out << ',' << morphology;
  out << ',' << b.gut_fill;
  out << ',' << b.gut_energy;
  out << ',' << b.gut_digestible;
  out << ',' << b.digestion;
  out << ',' << b.digested;
  out << ',' << b.feeding_action;
  out << ',' << b.feeding_action_age;
  out << ',' << b.mouth.phase << ',' << b.mouth.budget << ',' << b.mouth.swallowed << ','
      << mouth_offset(b) << ',' << b.mouth.biting << ',' << b.mouth.filtered << ','
      << b.mouth.cycle;

  out << ']';
}

void write_corpse_visual(std::ostream &out, const Corpse &c) {
  if (!c.visual) {
    out << "null";
    return;
  }
  const auto &shape = anatomy_text(out, c.visual);
  out << '[' << shape.organs << ',' << shape.fins_and_forms << ',' << shape.contour << ",[";
  for (std::size_t i = 0; i < c.visual_state.size(); ++i) {
    if (i)
      out << ',';
    out << c.visual_state[i];
  }
  out << "]," << shape.regions << ',' << shape.body << ']';
}

void write_body_profile(std::ostream &out, const Individual &p) {
  const auto &b = p.body;
  const auto *q = p.genome.interface.get();
  if (!q) {
    out << "{}";
    return;
  }
  double internal = 0;
  if (p.genome.blueprint)
    for (const auto &n : p.genome.blueprint->neurons)
      if (n.functional)
        internal += n.functions.internal;
  int sites = 0;
  for (int side = 0; side < 2; ++side)
    sites += std::any_of(q->sensory.begin(), q->sensory.end(), [&](const auto &r) {
      return r.channel == 1 && p.genome.blueprint &&
             p.genome.blueprint->neurons[r.neuron].functional && (r.angle < 0 ? 0 : 1) == side;
    });
  out << "{\"radius\":" << body_radius(b) << ",\"mass\":" << body_mass(b)
      << ",\"mouth\":" << b.suction_strength << ",\"aperture\":" << mouth_aperture(b)
      << ",\"jaw_length\":" << b.jaw_length << ",\"gut_length\":" << b.gut_length
      << ",\"blunt_teeth\":" << b.blunt_teeth << ",\"undulation\":" << b.undulation
      << ",\"bite\":" << b.bite_strength << ",\"barbels\":"
      << q->anatomy[anatomy_column::smell_outer_left] +
             q->anatomy[anatomy_column::smell_outer_right]
      << ",\"smell_sites\":" << sites << ",\"hermaphrodites\":"
      << (q->anatomy[anatomy_column::eggs] > 0 && q->anatomy[anatomy_column::sperm] > 0 ? 1 : 0)
      << ",\"head\":" << q->anatomy[anatomy_column::head] - q->anatomy[anatomy_column::cord]
      << ",\"cord\":" << q->anatomy[anatomy_column::cord] << ",\"internal\":" << internal
      << ",\"propulsion\":" << q->capacities[1]
      << ",\"armor\":" << q->anatomy[anatomy_column::defense_strength]
      << ",\"egg_organs\":" << (q->anatomy[anatomy_column::eggs] > 0 ? 1 : 0)
      << ",\"sperm_organs\":" << (q->anatomy[anatomy_column::sperm] > 0 ? 1 : 0);
  auto array = [&](const char *name, const auto &values) {
    out << ",\"" << name << "\":[";
    for (std::size_t i = 0; i < values.size(); ++i) {
      if (i)
        out << ',';
      out << values[i];
    }
    out << ']';
  };
  array("senses", q->sense_counts);
  array("vision", q->visual_coverage);
  array("fillings", q->filling_counts);
  array("scents", q->scent_counts);
  array("thresholds", q->sense_thresholds);
  array("early", q->sense_early);
  array("late", q->sense_late);
  array("span", q->sense_span);
  array("directions", q->sense_directions);
  array("scent_thresholds", q->scent_thresholds);
  out << '}';
}

void accumulate_body_profile(const Individual &p, SpeciesBodyProfile &c) {
  ++c.samples;
  c.radius += body_radius(p.body);
  c.mass += body_mass(p.body);
  c.mouth += p.body.suction_strength;
  c.bite += p.body.bite_strength;
  c.aperture += mouth_aperture(p.body);
  c.jaw_length += p.body.jaw_length;
  c.gut_length += p.body.gut_length;
  c.blunt_teeth += p.body.blunt_teeth;
  c.undulation += p.body.undulation;

  if (p.genome.blueprint) {
    for (const auto &n : p.genome.blueprint->neurons)
      if (n.functional && n.functions.internal > 0)
        c.internal += n.functions.internal;
    if (p.genome.interface) {
      const auto &binding = *p.genome.interface;
      for (int k = 0; k < 3; ++k)
        c.vision[k] += binding.visual_coverage[k];
      for (int k = 0; k < 3; ++k)
        c.fillings[k] += binding.filling_counts[k];
      for (int k = 0; k < field::SENSE_COUNT; ++k) {
        double n = binding.sense_counts[k];
        c.thresholds[k] += n * binding.sense_thresholds[k];
        c.early[k] += n * binding.sense_early[k];
        c.late[k] += n * binding.sense_late[k];
        c.span[k] += binding.sense_span[k];
        c.directions[k] += binding.sense_directions[k];
      }
      for (int k = 0; k < 8; ++k)
        c.scent_thresholds[k] += binding.scent_counts[k] * binding.scent_thresholds[k];
      c.barbels += binding.anatomy[anatomy_column::smell_outer_left] +
                   binding.anatomy[anatomy_column::smell_outer_right];
      c.hermaphrodites +=
          binding.anatomy[anatomy_column::eggs] > 0 && binding.anatomy[anatomy_column::sperm] > 0;
      c.head += binding.anatomy[anatomy_column::head] - binding.anatomy[anatomy_column::cord];
      c.cord += binding.anatomy[anatomy_column::cord];
      for (int side = 0; side < 2; ++side)
        c.smell_sites +=
            std::any_of(binding.sensory.begin(), binding.sensory.end(), [&](const auto &r) {
              return r.channel == 1 && p.genome.blueprint &&
                     p.genome.blueprint->neurons[r.neuron].functional &&
                     (r.angle < 0 ? 0 : 1) == side;
            });
      c.propulsion += binding.capacities[1];
      c.armor += binding.anatomy[anatomy_column::defense_strength];
      c.egg_organs += binding.anatomy[anatomy_column::eggs] > 0;
      c.sperm_organs += binding.anatomy[anatomy_column::sperm] > 0;
    }
    if (p.genome.interface) {
      const auto &binding = *p.genome.interface;
      for (int k = 0; k < field::SENSE_COUNT; ++k)
        c.senses[k] += binding.sense_counts[k];
      for (int k = 0; k < 8; ++k)
        c.scents[k] += binding.scent_counts[k];
    }
  }
}

namespace {
void write_species_body(std::ostream &out, const SpeciesBodyProfile &c) {
  out << "{\"radius\":" << c.radius / std::max<std::uint64_t>(1, c.samples)
      << ",\"mass\":" << c.mass / std::max<std::uint64_t>(1, c.samples)
      << ",\"mouth\":" << c.mouth / std::max<std::uint64_t>(1, c.samples)
      << ",\"bite\":" << c.bite / std::max<std::uint64_t>(1, c.samples)
      << ",\"aperture\":" << c.aperture / std::max<std::uint64_t>(1, c.samples)
      << ",\"jaw_length\":" << c.jaw_length / std::max<std::uint64_t>(1, c.samples)
      << ",\"gut_length\":" << c.gut_length / std::max<std::uint64_t>(1, c.samples)
      << ",\"blunt_teeth\":" << c.blunt_teeth / std::max<std::uint64_t>(1, c.samples)
      << ",\"undulation\":" << c.undulation / std::max<std::uint64_t>(1, c.samples)
      << ",\"barbels\":" << c.barbels / std::max<std::uint64_t>(1, c.samples)
      << ",\"smell_sites\":" << c.smell_sites / std::max<std::uint64_t>(1, c.samples)
      << ",\"hermaphrodites\":" << c.hermaphrodites / std::max<std::uint64_t>(1, c.samples)
      << ",\"head\":" << c.head / std::max<std::uint64_t>(1, c.samples)
      << ",\"cord\":" << c.cord / std::max<std::uint64_t>(1, c.samples) << ",\"senses\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << c.senses[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"vision\":[";
  for (int k = 0; k < 3; ++k) {
    if (k)
      out << ',';
    out << c.vision[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"fillings\":[";
  for (int k = 0; k < 3; ++k) {
    if (k)
      out << ',';
    out << c.fillings[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"scents\":[";
  for (int k = 0; k < 8; ++k) {
    if (k)
      out << ',';
    out << c.scents[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"thresholds\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << (c.senses[k] ? c.thresholds[k] / c.senses[k] : 1);
  }
  out << "],\"early\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << (c.senses[k] ? c.early[k] / c.senses[k] : 0);
  }
  out << "],\"late\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << (c.senses[k] ? c.late[k] / c.senses[k] : 0);
  }
  out << "],\"span\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << c.span[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"directions\":[";
  for (int k = 0; k < field::SENSE_COUNT; ++k) {
    if (k)
      out << ',';
    out << c.directions[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"scent_thresholds\":[";
  for (int k = 0; k < 8; ++k) {
    if (k)
      out << ',';
    out << (c.scents[k] ? c.scent_thresholds[k] / c.scents[k] : 1);
  }
  out << "],\"internal\":" << double(c.internal) / std::max<std::uint64_t>(1, c.samples)
      << ",\"propulsion\":" << c.propulsion / std::max<std::uint64_t>(1, c.samples)
      << ",\"armor\":" << c.armor / std::max<std::uint64_t>(1, c.samples)
      << ",\"egg_organs\":" << c.egg_organs / std::max<std::uint64_t>(1, c.samples)
      << ",\"sperm_organs\":" << c.sperm_organs / std::max<std::uint64_t>(1, c.samples) << '}';
}
}

namespace {
struct Counts : SpeciesBodyProfile {
  HormoneMoments hormones;
  std::uint64_t typical = 0;
  bool typical_parent = false;
  double typical_distance = 1e100;
  int alive = 0, adults = 0, eggs = 0, depth = 0, gametes = 0;
  unsigned g = 0;
  double nodes = 0, energy = 0, nutrition = 0, novelty = 0, spread = 0;
  std::uint64_t nutrition_steps = 0;
  std::map<int, int> behaviors;
};
void count_species_member(const Ecosystem &w, const Individual &p, Counts &c) {
  ++c.alive;
  c.adults += p.body.hatched;
  c.eggs += !p.body.hatched;
  c.depth = std::max(c.depth, p.depth);
  if (p.body.hatched) {
    ++c.hormones.steps;
    for (int k = 0; k < 2; ++k) {
      c.hormones.level[k] += p.body.hormones().levels()[k];
      c.hormones.secretion[k] += p.body.hormones().secretion()[k];
      c.hormones.binding[k] += p.body.hormones().binding()[k];
    }
    if (const auto *species = w.find_species(p.species);
        species && p.genome.cppn && species->representative.cppn &&
        p.genome.cppn->history()->lineage() == species->representative.cppn->history()->lineage()) {
      const double distance =
          evolution::Genome::compatibility_distance(*species->representative.cppn, *p.genome.cppn);
      c.spread = std::max(c.spread, distance);
      const bool parent = p.offspring > 0 && distance <= w.taxonomy().mating_distance * .5;
      if (!c.typical || parent > c.typical_parent ||
          (parent == c.typical_parent && (distance < c.typical_distance ||
                                          (distance == c.typical_distance && p.id < c.typical)))) {
        c.typical = p.id;
        c.typical_distance = distance;
        c.typical_parent = parent;
      }
    }

    c.g = std::max(c.g, p.g);
    c.nodes += p.genome.blueprint ? p.genome.blueprint->neurons.size() : 0;
    c.energy += p.body.energy;
    c.nutrition += p.body.nutrition;
    c.nutrition_steps += p.body.nutrition_steps;
    c.novelty += p.novelty;
    accumulate_body_profile(p, c);
  }
  ++c.behaviors[p.niche()];
}
}
void write_species(std::ostream &out, const Ecosystem &w, bool include_extinct,
                   std::uint64_t only_species) {
  std::map<std::uint64_t, Counts> counts;
  for (const auto &p : w.fish)
    if (p.body.alive && !p.nutrient_egg && (!only_species || p.species == only_species)) {
      auto &c = counts[p.species];
      count_species_member(w, p, c);
    }
  for (const auto &cloud : w.sperm)
    if (cloud.energy >= w.evo.sperm_portion && (!only_species || cloud.species == only_species))
      ++counts[cloud.species].gametes;
  out << '[';
  bool first = true;
  for (const auto &s : w.taxonomy().species) {
    if (only_species && s.id != only_species)
      continue;
    const auto *genus = w.find_species(s.genus ? s.genus : s.id);
    const auto *genus_mother = genus ? w.find_species(genus->mother_species) : nullptr;
    const auto parent_genus =
        genus_mother ? (genus_mother->genus ? genus_mother->genus : genus_mother->id) : 0;
    const auto &c = counts[s.id];
    if (!include_extinct && !c.alive && !c.gametes)
      continue;
    if (!first)
      out << ',';
    first = false;
    int behavior = -1, best = 0;
    for (auto [id, n] : c.behaviors)
      if (n > best) {
        behavior = id;
        best = n;
      }
    out << "{\"typical_fish\":" << c.typical
        << ",\"typical_distance\":" << (c.typical ? c.typical_distance : 0)
        << ",\"typical_parent\":" << (c.typical_parent ? "true" : "false")
        << ",\"genus\":" << (s.genus ? s.genus : s.id) << ",\"parent_genus\":" << parent_genus
        << ",\"genus_name\":" << json_quoted(s.name.substr(0, s.name.find(' ')))
        << ",\"epithet\":" << json_quoted(s.epithet)
        << ",\"name_reason\":" << json_quoted(s.name_reason)
        << ",\"max_founder_distance\":" << s.max_founder_distance
        << ",\"species_distance\":" << w.taxonomy().mating_distance
        << ",\"genus_distance\":" << 3 * w.taxonomy().mating_distance
        << ",\"mother\":" << s.mother_species << ",\"father\":" << s.father_species
        << ",\"extinct_at\":" << s.extinct_at << ",\"origin\":" << s.origin
        << ",\"feeding_generations\":" << s.feeding_generations
        << ",\"protection_used\":" << s.protection_used;
    out << ",\"hormones\":";
    write_hormone_profile(out, s.hormones, c.hormones);
    out << ",\"body_profile\":";
    write_species_body(out, c);
    out << ",\"lifetime_body\":";
    write_species_body(out, s.lifetime_body);
    out << ",\"body_samples\":" << s.lifetime_body.samples
        << ",\"profile_environment\":" << s.profile_environment
        << ",\"profile_samples\":" << s.profile_samples << ",\"lifetime_steps\":" << s.diet_steps
        << ",\"lifetime_drift\":" << s.lifetime_drift << ",\"lifetime_diet\":[";
    for (std::size_t kind = 0; kind < DIET_COUNT; ++kind) {
      if (kind)
        out << ',';
      out << s.lifetime_diet[kind];
    }
    out << "],\"lifetime_raw_diet\":[";
    for (std::size_t kind = 0; kind < DIET_COUNT; ++kind) {
      if (kind)
        out << ',';
      out << s.lifetime_raw_diet[kind];
    }
    out << "],\"lifetime_digested\":" << s.lifetime_digested;
    out << ",\"lifetime_ecology\":[";

    for (int k = 0; k < 5; ++k) {
      if (k)
        out << ',';
      out << s.lifetime_habitat[k];
    }
    out << ']' << ",\"lifetime_ecology_steps\":" << s.habitat_steps
        << ",\"lifetime_profile_samples\":" << s.lifetime_profile_samples
        << ",\"lifetime_profile\":[";
    for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k) {
      if (k)
        out << ',';
      out << s.lifetime_profile[k];
    }
    out << ']' << ",\"mean_novelty\":" << c.novelty / std::max(1, c.adults)
        << ",\"nutrition_per_1000\":"
        << 1000 * c.nutrition / std::max<std::uint64_t>(1, c.nutrition_steps) << ",\"profile\":[";
    for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k) {
      if (k)
        out << ',';
      out << s.profile[k];
    }
    out << "],\"first_profile_tick\":" << s.first_profile_tick
        << ",\"first_profile_samples\":" << s.first_profile_samples
        << ",\"comparison_parents\":" << s.comparison_parents << ",\"first_delta\":[";
    for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k) {
      if (k)
        out << ',';
      out << s.first_delta[k];
    }
    out << "],\"id\":" << s.id << ",\"genetic_spread\":" << c.spread
        << ",\"name\":" << json_quoted(s.name) << ",\"born\":" << s.born
        << ",\"last_seen\":" << s.last_seen << ",\"alive\":" << c.alive
        << ",\"adults\":" << c.adults << ",\"gametes\":" << c.gametes << ",\"eggs\":" << c.eggs
        << ",\"hatches\":" << s.hatches << ",\"successful_offspring\":" << s.successful_offspring
        << ",\"replacement_hatches\":"
        << (s.replacement_hatches - s.replacement_history.front().hatches)
        << ",\"replacement_deaths\":"
        << (s.replacement_deaths - s.replacement_history.front().deaths)
        << ",\"confirmed\":" << (s.confirmed ? "true" : "false")
        << ",\"mean_neurons\":" << c.nodes / std::max(1, c.adults)
        << ",\"mean_reserve\":" << c.energy / std::max(1, c.adults) << ",\"max_depth\":" << c.depth
        << ",\"max_g\":" << c.g << ",\"behavior\":" << behavior << '}';
  }
  out << ']';
}
void write_ecological_milestones(std::ostream &out, const Ecosystem &w) {
  out << '[';
  bool first = true;
  for (const auto &m : w.taxonomy().milestones) {
    if (!first)
      out << ',';
    first = false;
    out << "{\"key\":" << json_quoted(m.key) << ",\"title\":" << json_quoted(m.title)
        << ",\"evidence\":" << json_quoted(m.evidence) << ",\"tick\":" << m.tick
        << ",\"species\":" << m.species << '}';
  }
  out << ']';
}
}
