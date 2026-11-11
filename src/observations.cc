#include "json_numbers.hh"
#include "session_io.hh"
#include "eye_geometry.hh"
#include "protocol_schema.hh"
#include "observations.hh"
#include "hormone_view.hh"
#include "physiology.hh"
#include <iomanip>
#include <limits>
#include <map>
#include <sstream>
#include <string_view>
namespace fishsim {
namespace {
constexpr unsigned CACHE_SWEEP = 128;
constexpr double COMPACT_SCALE = 1000;
double compact(double v) {
  return std::round(v * COMPACT_SCALE) / COMPACT_SCALE;
}
struct AnatomyText {
  std::weak_ptr<const BrainInterface> owner;
  std::streamsize precision = 0;
  std::ios_base::fmtflags flags{};
  std::locale locale;
  std::string organs, fins, forms, contour, regions, body;
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
  if (++misses % CACHE_SWEEP == 0) {
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
  for (std::size_t fin = 0; fin < std::tuple_size_v<decltype(BrainInterface::fins)>; ++fin) {
    if (fin)
      stream << ',';
    const auto shape = binding ? binding->fins[fin] : BrainInterface::Fin{};
    static_assert(fin_shape_column::count == 5);
    stream << '[' << shape.cells << ',' << shape.strength << ',' << shape.x << ',' << shape.y << ','
           << shape.spread << ']';
  }
  stream << ']';
  text.fins = stream.str();
  stream.str("");
  stream << '[';
  for (std::size_t i = 0; i < BrainInterface::FORM_COUNT; ++i) {
    if (i)
      stream << ',';
    stream << '[';
    if (binding) {
      const auto &q = binding->forms[i];
      static_assert(organ_form_column::weight == organ_form_column::sz + 1 &&
                    organ_form_column::count ==
                        organ_form_column::eye_along +
                            std::tuple_size_v<decltype(BrainInterface::eye_positions)::value_type> +
                            std::tuple_size_v<decltype(BrainInterface::eye_shape)::value_type>);
      if (q.weight > 0) {
        stream << compact(q.x) << ',' << compact(q.y) << ',' << compact(q.z) << ',' << compact(q.sy)
               << ',' << compact(q.sz) << ',' << q.weight;
        const int eye = int(i) - BrainInterface::sense_form(field::Light),
                  near = int(i) - BrainInterface::sense_form(field::Proximity);
        const auto *place = eye >= 0 && eye < EYES     ? &binding->eye_positions[eye]
                            : near >= 0 && near < EYES ? &binding->eye_positions[near]
                                                       : nullptr;
        const auto *shape = eye >= 0 && eye < EYES     ? &binding->eye_shape[eye]
                            : near >= 0 && near < EYES ? &binding->proximity_shape[near]
                                                       : nullptr;
        if (place) {
          for (double v : *place)
            stream << ',' << v;
          for (double v : *shape)
            stream << ',' << v;
        }
      }
    }
    stream << ']';
  }
  stream << ']';
  text.forms = stream.str();
  stream.str("");
  stream << '[';
  for (int i = 0; i < BrainInterface::CONTOUR_POINTS; ++i) {
    if (i)
      stream << ',';
    stream << (binding ? binding->contour[i] : 0);
  }
  stream << ']';
  text.contour = stream.str();
  stream.str("");
  stream << '[';
  for (std::size_t i = 0; i < std::tuple_size_v<decltype(BrainInterface::regions)>; ++i) {
    if (i)
      stream << ',';
    stream << '[';
    if (binding) {
      const auto &q = binding->regions[i];
      if (q.weight > 0) {
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
  const auto &body =
      binding && binding->body_geometry[field::body_metric::extent] > 0 ? *binding : emptyBody;
  stream.str("");
  stream << '{';
  const char *plans[] = {"headPlan", "chestPlan", "torsoPlan", "facePlan"};
  const char *metrics[] = {"headBack",  "headLength",  "faceLength",     "restShoulder",
                           "faceWidth", "chestLength", "baseHindLength", "trunk",
                           "neckWidth", "chestPhase",  "center",         "extent"};
  static_assert(std::size(plans) == field::body_plan_part::count);
  static_assert(std::size(metrics) == field::body_metric::count);
  for (std::size_t i = 0; i < field::body_plan_part::count; ++i) {
    if (i)
      stream << ',';
    stream << json_quoted(plans[i]) << ":[";
    for (std::size_t j = 0; j < field::PLAN_POINTS; ++j) {
      if (j)
        stream << ',';
      stream << body.body_plans[i][j];
    }
    stream << ']';
  }
  for (std::size_t i = 0; i < field::body_metric::count; ++i)
    stream << ',' << json_quoted(metrics[i]) << ':' << body.body_geometry[i];
  stream << '}';
  text.body = stream.str();

  return cache.insert_or_assign(binding.get(), std::move(text)).first->second;
}
}
void write_morphology(std::ostream &out, const std::shared_ptr<const BrainInterface> &binding) {
  const auto &s = anatomy_text(out, binding);
  out << '[' << s.organs << ',' << s.fins << ',' << s.forms << ',' << s.contour << ',' << s.regions
      << ',' << s.body << ']';
}
void write_individual(std::ostream &out, const Individual &p, std::uint64_t morphology,
                      double neural_cost) {
  namespace F = fish_column;
  const auto &b = p.body;
  const auto &motor = b.motor();
  const auto &reproduction = b.reproduction();
  static const AnatomyText empty = [] {
    AnatomyText text;
    text.organs = text.contour = text.regions = text.fins = text.forms = "[]";
    text.body = "null";
    return text;
  }();
  const auto &shape = morphology ? empty : anatomy_text(out, p.genome.interface);
  const auto anatomy = [&](const std::string &text) {
    return morphology ? std::string_view("null") : std::string_view(text);
  };
  const auto *q = p.genome.interface.get();
  const auto *blueprint = p.genome.blueprint.get();
  const auto &seen = p.observations();
  Record(out, F::count)(F::x, b.x)(F::y, b.y)(F::angle, b.angle)(F::eaten, b.eaten)(F::id, p.id)(
      F::energy, b.energy)(F::age, b.age)(F::niche, p.niche())(F::hatched, b.hatched ? 1 : 0)(
      F::development, embryo_development(b))(F::origin, p.origin)(F::offspring, p.offspring)(
      F::depth, p.depth)(F::fertilised, p.fertilised ? 1 : 0)(
      F::egg_role, reproduction.egg_role ? 1 : 0)(F::father, p.father)(F::red, b.color[0])(
      F::green, b.color[1])(F::blue, b.color[2])(F::mouth_pose, motor.mouth_pose)(
      F::egg_organs, q && q->anatomy[anatomy_column::eggs] > 0 ? 1 : 0)(
      F::sperm_organs, q && q->anatomy[anatomy_column::sperm] > 0 ? 1 : 0)(F::species, p.species)(
      F::health, b.health)(F::thrust, motor.thrust)(F::torque, motor.torque)(
      F::defense, b.defense())(F::aggression, motor.aggression)(F::window_corpses,
                                                                seen.window_corpses)(
      F::maternal_species, p.maternal_species)(F::paternal_species, p.paternal_species)(
      F::clonal, p.clonal ? 1 : 0)(F::organs, anatomy(shape.organs))(F::speed, motor.speed)(
      F::impact, motor.impact)(F::parent, p.parent)(F::nutrition, b.nutrition)(
      F::nutrition_steps, b.nutrition_steps)(F::nodes, blueprint ? blueprint->neurons.size() : 0)(
      F::edges, blueprint ? blueprint->edges.size() : 0)(F::born, p.born)(F::generation, p.g)(
      F::impulse_left, motor.impulse_left)(F::impulse_right, motor.impulse_right)(
      F::tail, motor.tail)(F::relative_speed, motor.relative_speed)(
      F::egg_yolk, reproduction.egg_yolk)(F::egg_laying, reproduction.egg_laying ? 1 : 0)(
      F::sperm_store, reproduction.sperm_store)(F::nutrient_egg, p.nutrient_egg ? 1 : 0)(
      F::mass, body_mass(b))(F::radius, collision_radius(b))(F::disease, b.disease)(
      F::reserve_capacity, reserve_capacity(b))(F::adult_age,
                                                b.hatched ? std::max(0, b.age - b.hatch_age) : 0)(
      F::impulse_forward, motor.impulse_forward)(F::motor_factor, motor.motor_factor)
      .with(F::fin_pose,
            [&](std::ostream &o) {
              static_assert(fin_event_column::age_tail == 0 &&
                            fin_event_column::peak_tail == fin_event_column::age_tail + 3 &&
                            fin_event_column::steps_tail == fin_event_column::peak_tail + 3);
              o << '[';
              write_values(o, motor.fin_tension);
              o << ",[";
              write_values(o, motor.fin_stroke_age);
              o << ',';
              write_values(o, motor.fin_stroke_peak);
              o << ',';
              write_values(o, motor.fin_stroke_steps);
              o << "]]";
            })(F::fins, anatomy(shape.fins))(F::forms, anatomy(shape.forms))(
          F::mean_aggression,
          seen.window_traits[window_trait::aggression] / std::max(1, seen.window_steps))(
          F::neuron_budget,
          std::min(field::DEVELOPMENT_SITES, p.genome.development_options.max_nodes))(
          F::eat_signal, b.eat_signal)(F::mouth_aperture, maximum_mouth_aperture(b))(
          F::bite_pose, motor.bite_pose)(F::suction_pose,
                                         motor.suction_pose)(F::contour, anatomy(shape.contour))(
          F::egg_capacity, reproduction.egg_limit)(F::sperm_capacity, reproduction.sperm_limit)(
          F::tissue, b.tissue)(F::regions, anatomy(shape.regions))(F::bladder_fill, b.bladder_fill)(
          F::satiety, gut_filling(b))(F::damage, 1 - b.health)
      .with(F::hatch_shape,
            [&](std::ostream &o) {
              o << '[' << predicted_hatch_radius(b, p.genome, neural_cost) << ',' << b.birth_tissue
                << ']';
            })(F::body_geometry, anatomy(shape.body))(F::morphology_asset, morphology)(
          F::gut_fill, b.gut_fill)(F::gut_energy, b.gut_energy)(
          F::gut_digestible, b.gut_digestible)(F::digestion, b.digestion)(F::digested, b.digested)(
          F::feeding_action, b.feeding_action)(F::feeding_action_age, b.feeding_action_age)(
          F::mouth_phase, b.mouth.phase)(F::mouth_budget, b.mouth.budget)(
          F::swallowed, b.mouth.swallowed)(F::mouth_offset, mouth_offset(b))(
          F::mouth_biting, b.mouth.biting)(F::filtered, b.mouth.filtered)(
          F::mouth_cycle, b.mouth.cycle)(F::eye_pull_left, b.perception().eye_pull[0])(
          F::eye_pull_right, b.perception().eye_pull[1])(F::immortal, b.immortal)(
          F::assisted, p.assisted)(F::remembered, p.remembered)(F::eggs_laid, p.eggs_laid)
      .finish();
}

void write_corpse_visual(std::ostream &out, const Corpse &c) {
  if (!c.visual) {
    out << "null";
    return;
  }
  const auto &shape = anatomy_text(out, c.visual);
  static_assert(corpse_visual_column::forms == corpse_visual_column::fins + 1 &&
                corpse_visual_column::count == 7);
  out << '[' << shape.organs << ',' << shape.fins << ',' << shape.forms << ',' << shape.contour
      << ",[";
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
      return r.channel == field::Odor && p.genome.blueprint &&
             p.genome.blueprint->neurons[r.neuron].functional && (r.angle < 0 ? 0 : 1) == side;
    });
  out << "{\"radius\":" << body_radius(b) << ",\"mass\":" << body_mass(b)
      << ",\"mouth\":" << b.suction_strength << ",\"aperture\":" << mouth_aperture(b)
      << ",\"jaw_length\":" << b.jaw_length << ",\"gut_length\":" << b.gut_length
      << ",\"blunt_teeth\":" << b.blunt_teeth << ",\"undulation\":" << b.undulation
      << ",\"bite\":" << b.bite_strength << ",\"barbels\":"
      << q->anatomy[anatomy_column::barbel_left] + q->anatomy[anatomy_column::barbel_right]
      << ",\"smell_sites\":" << sites << ",\"hermaphrodites\":"
      << (q->anatomy[anatomy_column::eggs] > 0 && q->anatomy[anatomy_column::sperm] > 0 ? 1 : 0)
      << ",\"head\":" << q->anatomy[anatomy_column::head]
      << ",\"cord\":" << q->anatomy[anatomy_column::cord] << ",\"internal\":" << internal
      << ",\"propulsion\":" << q->capacities[organ_port::forward]
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
      for (std::size_t k = 0; k < c.vision.size(); ++k)
        c.vision[k] += binding.visual_coverage[k];
      for (std::size_t k = 0; k < c.fillings.size(); ++k)
        c.fillings[k] += binding.filling_counts[k];
      for (int k = 0; k < field::SENSE_COUNT; ++k) {
        double n = binding.sense_counts[k];
        c.thresholds[k] += n * binding.sense_thresholds[k];
        c.early[k] += n * binding.sense_early[k];
        c.late[k] += n * binding.sense_late[k];
        c.span[k] += binding.sense_span[k];
        c.directions[k] += binding.sense_directions[k];
      }
      for (std::size_t k = 0; k < odor_kind::count; ++k)
        c.scent_thresholds[k] += binding.scent_counts[k] * binding.scent_thresholds[k];
      c.barbels += binding.anatomy[anatomy_column::barbel_left] +
                   binding.anatomy[anatomy_column::barbel_right];
      c.hermaphrodites +=
          binding.anatomy[anatomy_column::eggs] > 0 && binding.anatomy[anatomy_column::sperm] > 0;
      c.head += binding.anatomy[anatomy_column::head];
      c.cord += binding.anatomy[anatomy_column::cord];
      for (int side = 0; side < 2; ++side)
        c.smell_sites +=
            std::any_of(binding.sensory.begin(), binding.sensory.end(), [&](const auto &r) {
              return r.channel == field::Odor && p.genome.blueprint &&
                     p.genome.blueprint->neurons[r.neuron].functional &&
                     (r.angle < 0 ? 0 : 1) == side;
            });
      c.propulsion += binding.capacities[organ_port::forward];
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
  for (std::size_t k = 0; k < c.vision.size(); ++k) {
    if (k)
      out << ',';
    out << c.vision[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"fillings\":[";
  for (std::size_t k = 0; k < c.fillings.size(); ++k) {
    if (k)
      out << ',';
    out << c.fillings[k] / std::max<std::uint64_t>(1, c.samples);
  }
  out << "],\"scents\":[";
  for (std::size_t k = 0; k < c.scents.size(); ++k) {
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
  for (std::size_t k = 0; k < c.scents.size(); ++k) {
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
  double typical_distance = std::numeric_limits<double>::infinity();
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
    for (int k = 0; k < field::HORMONES; ++k) {
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
      const bool parent = p.offspring > 0 && distance <= w.taxonomy().typical_distance();
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
        << ",\"genus_distance\":" << w.taxonomy().genus_distance()
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

    write_values(out, s.lifetime_habitat);
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
        << rate_window::steps * c.nutrition / std::max<std::uint64_t>(1, c.nutrition_steps)
        << ",\"profile\":[";
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
void write_sight(std::ostream &out, const PerceptionState &state) {
  out << "\"x\":" << state.visual_x << ",\"y\":" << state.visual_y
      << ",\"heading\":" << state.visual_angle << ",\"range\":" << state.visual_range
      << ",\"eyes\":[";
  for (int side = 0; side < EYES; ++side) {
    if (side)
      out << ',';
    const auto &eye = state.visual_eyes[side];
    if (!eye.present || !std::isfinite(eye.left) || !std::isfinite(eye.right))
      out << "null";
    else
      Record(out, eye_view_column::count)(eye_view_column::x, eye.x)(eye_view_column::y, eye.y)(
          eye_view_column::exposure, eye.exposure)(eye_view_column::left,
                                                   eye.left)(eye_view_column::right, eye.right)
          .finish();
  }
  out << "],\"bands\":[";
  constexpr int count = vision::pixels;
  constexpr double step = 2 * PI / count;
  struct Pixel {
    Color color{};
    double width = 0, distance = 0;
  };
  std::array<std::array<Pixel, count>, EYES> raster{};
  for (const auto &band : state.visual_image) {
    if (band.eye < 0 || band.eye >= EYES || band.distance <= 0)
      continue;
    const double left = band.left + PI, right = band.right + PI;
    for (int k = int(std::floor(left / step)); k * step < right; ++k) {
      const double width = std::min(right, (k + 1) * step) - std::max(left, k * step);
      if (width <= 0)
        continue;
      auto &pixel = raster[band.eye][(k % count + count) % count];
      for (std::size_t c = 0; c < pixel.color.size(); ++c)
        pixel.color[c] += band.color[c] * width;
      pixel.width += width;
      pixel.distance = pixel.distance > 0 ? std::min(pixel.distance, band.distance) : band.distance;
    }
  }
  bool first = true;
  for (int side = 0; side < EYES; ++side)
    for (int k = 0; k < count; ++k) {
      const auto &pixel = raster[side][k];
      if (pixel.width <= 0)
        continue;
      if (!first)
        out << ',';
      first = false;
      namespace I = image_band_column;
      Record(out, I::count)(I::left, k * step - PI)(I::right, (k + 1) * step - PI)(
          I::red, pixel.color[rgb::red] / pixel.width)(I::green,
                                                       pixel.color[rgb::green] / pixel.width)(
          I::blue, pixel.color[rgb::blue] / pixel.width)(I::eye, side)(I::distance, pixel.distance)
          .finish();
    }
  out << ']';
}
void write_visual_samples(std::ostream &out, const PerceptionState &state) {
  for (std::size_t i = 0; i < state.visual_samples.size(); ++i) {
    if (i)
      out << ',';
    const auto &sample = state.visual_samples[i];
    namespace V = visual_sample_column;
    Record(out, V::count)(V::neuron, sample.neuron)(V::light, sample.light)(
        V::stimulus, sample.stimulus)(V::response, sample.response)(V::red, sample.color[rgb::red])(
        V::green, sample.color[rgb::green])(V::blue, sample.color[rgb::blue])
        .finish();
  }
}
void write_receptor(std::ostream &out, const BrainInterface::Receptor &r, const field::Neuron &n,
                    double value) {
  namespace R = receptor_column;
  Record(out, R::count)(R::neuron, r.neuron)(R::channel, r.channel)(R::angle, r.angle)(
      R::value, value)(R::threshold, r.threshold)(R::gain, r.gain)(R::width, r.width)(
      R::strength, r.senses[r.channel])(R::hue, r.hue)
      .list(R::senses, r.senses)
      .list(R::identity, n.identity)(R::view_left, r.view_left)(R::view_right, r.view_right)(
          R::response_threshold, r.response_threshold)
      .list(R::scents, r.scents)(R::quality2, n.parameters.quality2)(R::quality1,
                                                                     n.parameters.quality1)
      .list(R::spectrum, r.spectrum)(R::longitudinal, r.longitudinal)(R::lateral, r.lateral)(
          R::mechanical_angle, r.mechanical_angle)
      .list(R::hormones, r.hormones)(R::pressure_kind, r.pressure_kind)(
          R::pressure_target, r.pressure_target)(R::proximity, r.proximity ? 1 : 0)(
          R::intensity, r.intensity() ? 1 : 0)(R::dark_share, r.dark_share)(R::inner,
                                                                            r.inner ? 1 : 0)
      .finish();
}
}
