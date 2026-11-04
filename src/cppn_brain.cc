#include <cstdlib>
#include "plants.hh"
#include "opencl.hh"
#include "physiology.hh"
#include "maturation_cache.hh"
#include "genome.hh"
#include "body.hh"
#include "perception.hh"
#include "mutation_parameters.hh"
#include "body_plan.hh"
#include "eye_geometry.hh"
#include "sight.hh"
#include "retina.hh"
#include "evolution/mutations.hh"
#include <sstream>
#include <stdexcept>
#include <iomanip>
#include <mutex>
#include <map>
#include <unordered_map>
#include <limits>

namespace fishsim {
namespace {
// A brain develops on DEVELOPMENT_WORKERS threads.
constexpr int DEVELOPMENT_WORKERS = 2;
// Mutated gene weights stay within MAX_GENE_WEIGHT; gating doubles a boundary weight by GATE_GAIN.
constexpr double MAX_GENE_WEIGHT = 16, GATE_GAIN = 2;
}
std::size_t default_neural_budget = run_limit::default_neural_budget;
field::Options default_development_options = []() {
  field::Options o;
  o.workers = DEVELOPMENT_WORKERS;
  o.max_nodes = run_limit::default_brain_nodes;
  o.max_edges = run_limit::default_brain_edges;
  return o;
}();
namespace {
// Light passes each of the three foliage layers.
constexpr double FOLIAGE_LAYERS = 3;
// Sediment contact is probed with SEDIMENT_PROBE; the lateral line samples LATERAL_POINTS points.
constexpr double SEDIMENT_PROBE = .5;
constexpr int LATERAL_POINTS = 4;
// Development runs in steps of DEVELOPMENT_STEP queries.
constexpr std::size_t DEVELOPMENT_STEP = 8192;
// Mutation: step evolution switch, its spread, the chance of a large step and its size, the
// rate scale, rewiring trials, gate zones.
constexpr double STEP_SWITCH = .5, STEP_SPREAD = .1, LARGE_STEP_CHANCE = .1, LARGE_STEP = 10,
                 RATE_SCALE = .15, MIN_STEP = 1e-5;
constexpr int REWIRE_TRIALS = 24, GATE_ZONES = 4;
// The snout sits SNOUT_MOUTH of the mouth share ahead when the face is shorter.
constexpr double SNOUT_MOUTH = .8;
std::mutex genetics;
// Hidden node types a type change draws from.
constexpr std::array<evolution::NodeType, 6> HIDDEN_TYPES{
    evolution::NodeType::GAUSSIAN, evolution::NodeType::SINE,    evolution::NodeType::COSINE,
    evolution::NodeType::LINEAR,   evolution::NodeType::SIGMOID, evolution::NodeType::ABS};

}
std::shared_ptr<const BrainInterface> body_interface(const field::Substrate &s) {
  return anatomical_interface(s);
}
bool Genome::viable() const {
  return blueprint && interface &&
         maturation_template(*this, interface->mobile_reproductive).viable();
}
std::vector<VisualObject> visual_objects(const Body &b, const Genome &g, const Field &world,
                                         bool filtered, bool deferred,
                                         std::array<VisualEye, EYES> *origins) {
  std::vector<VisualObject> objects;
  const auto &rays = g.interface->visual[0];
  if (rays.empty())
    return objects;
  const auto eyes = visual_origins(b, *g.interface, world);
  if (origins)
    *origins = eyes;
  double reach = world.env().vision_range;
  for (const auto &eye : eyes)
    if (eye.present)
      reach = std::max(reach, world.env().vision_range +
                                  std::hypot(world.delta_x(eye.x - b.x), eye.y - b.y));
  thread_local std::array<SightFilter, EYES> tint;
  thread_local std::array<SightMedium, EYES> medium;
  std::array<bool, EYES> prepared{};
  using Intervals = std::vector<std::pair<double, double>>;
  thread_local std::array<Intervals, EYES> scratch_views;
  std::array<const Intervals *, EYES> views{};
  const bool paired = eyes[0].present && eyes[1].present;
  for (int side = 0; side < EYES; ++side)
    if (eyes[side].present) {
      const auto &cached =
          paired ? g.interface->eye_intervals[side] : g.interface->visual_intervals;
      if (!cached.empty() &&
          (!paired || world.env().vision_binocular_angle == DEFAULT_BINOCULAR_ANGLE)) {
        views[side] = &cached;
        continue;
      }
      auto &dynamic = scratch_views[side];
      dynamic.clear();
      for (const auto &ray : rays) {
        const auto &r = g.interface->sensory[ray.second];
        if (paired && std::abs(r.angle) >= world.env().vision_binocular_angle &&
            (r.lateral >= 0) != (side == 1))
          continue;
        dynamic.push_back({r.view_left, r.view_right});
      }
      std::sort(dynamic.begin(), dynamic.end());
      std::size_t count = 0;
      for (const auto &v : dynamic) {
        if (count && v.first <= dynamic[count - 1].second)
          dynamic[count - 1].second = std::max(dynamic[count - 1].second, v.second);
        else
          dynamic[count++] = v;
      }
      dynamic.resize(count);
      views[side] = &dynamic;
    }
  auto object = [&](double px, double py, double radius, Color color, int kind, std::uint64_t id,
                    bool transparent = false, const PlantPart *stroke = nullptr) {
    const double cx = world.delta_x(px - b.x), cy = py - b.y,
                 limit = reach + (stroke ? stroke->radius : 0);
    if (cx * cx + cy * cy >= limit * limit)
      return;
    const double ca = std::cos(b.angle), sa = std::sin(b.angle);
    for (int side = 0; side < EYES; ++side) {
      const auto &eye = eyes[side];
      if (!eye.present || eye.exposure <= 0)
        continue;
      const double dx = world.delta_x(px - eye.x), dy = py - eye.y;
      double distance = std::hypot(dx, dy), size = radius,
             angle = std::remainder(std::atan2(dy, dx) - b.angle, 2 * PI),
             half = distance <= radius ? PI : std::asin(radius / distance), far = -1, opacity = 1;
      VisualObject shape{};
      if (stroke) {
        // Strokes live in the body frame of the observer: centre, half vector and half-width.
        const double sx = ca * dx + sa * dy, sy = -sa * dx + ca * dy,
                     hx = ca * stroke->hx + sa * stroke->hy,
                     hy = -sa * stroke->hx + ca * stroke->hy, w = stroke_width(*stroke),
                     s = stroke_closest(hx, hy, -sx, -sy),
                     line = std::hypot(sx + s * hx, sy + s * hy), n1 = std::hypot(sx - hx, sy - hy),
                     n2 = std::hypot(sx + hx, sy + hy);
        size = w;
        distance = line;
        far = std::max(n1, n2) + w;
        if (line <= w) {
          angle = 0;
          half = PI;
        } else {
          const double bx = (sx - hx) / n1 + (sx + hx) / n2, by = (sy - hy) / n1 + (sy + hy) / n2,
                       span = std::atan2(std::abs((sx - hx) * (sy + hy) - (sy - hy) * (sx + hx)),
                                         (sx - hx) * (sx + hx) + (sy - hy) * (sy + hy));
          angle =
              std::hypot(bx, by) > tolerance::rounding ? std::atan2(by, bx) : std::atan2(sy, sx);
          half = std::min(PI, span / 2 + std::asin(std::min(1., w / line)));
        }
        // Light reflected by a translucent organ scales with how much of the view it covers.
        const double crossings =
            line <= w ? 1 : stroke_optical_depth(sx, sy, hx, hy, w, 1, 2 * sx, 2 * sy);
        const auto depth = world.foliage_depth(stroke->organ_kind);
        double passed = 0;
        for (double d : depth)
          passed += std::exp2(-crossings * d) / FOLIAGE_LAYERS;
        opacity = 1 - passed;
        shape.stroke = true;
        shape.sx = sx;
        shape.sy = sy;
        shape.hx = hx;
        shape.hy = hy;
        shape.far = far;
      }
      if (distance - (stroke ? size : 0) >= world.env().vision_range)
        continue;
      bool seen = false;
      for (const auto &span : *views[side])
        for (double shift : {-2 * PI, 0., 2 * PI})
          if (angle + shift + half > span.first && angle + shift - half < span.second)
            seen = true;
      if (!seen)
        continue;
      auto passed_color = color;
      for (auto &c : passed_color)
        c *= opacity;
      if (filtered && !deferred) {
        if (!prepared[side]) {
          tint[side].prepare(world, eye.x, eye.y);
          medium[side].prepare(world, eye.x, eye.y);
          prepared[side] = true;
        }
        const auto passed = medium[side].transmission(px, py);
        const double factor = (kind == PROBE_OBJECT ? 1 : world.light(px, py)) * passed[0];
        for (int c = 0; c < rgb::count; ++c)
          passed_color[c] *= factor * passed[1 + c];
        passed_color = tint[side].apply(px, py, passed_color);
      }
      shape.distance = distance;
      shape.radius = size;
      shape.angle = angle;
      shape.beta = half;
      shape.color = passed_color;
      shape.transparent = transparent;
      shape.x = px;
      shape.y = py;
      shape.kind = kind;
      shape.id = id;
      shape.attenuation = std::exp2(-distance / world.water_clarity);
      shape.pending_filter = filtered && deferred;
      shape.eye = side;
      objects.push_back(shape);
    }
  };
  if (b.perception().probe.active() && b.perception().probe.kind == probe_kind::sight)
    object(b.perception().probe.x, b.perception().probe.y, b.perception().probe.radius,
           b.perception().probe.color, PROBE_OBJECT, 0);
  auto food = [&](std::uint32_t i) {
    if (!world.indexed() || !world.feeding().consumed[i]) {
      const auto &p = world.feeding().pieces[i];
      object(p.x, p.y, food_radius(p), world.food_color(p), 0, p.render_id);
    }
  };
  auto body = [&](std::uint32_t i) {
    const auto &p = world.visible()[i];
    if (p.hidden)
      return;
    if ((b.identity && (p.kind == food_kind::fish || p.kind == food_kind::egg))
            ? p.id != b.identity
            : std::hypot(world.delta_x(p.x - b.x), p.y - b.y) > tolerance::precision)
      object(p.x, p.y, p.radius, p.color, p.kind, p.id);
  };
  auto plant = [&](std::uint32_t i) {
    const auto &p = world.vegetation().plants[i];
    object(p.x, p.y, p.kind == food_kind::plant ? stroke_width(p) : p.radius,
           p.kind == food_kind::algae ? ALGAE_COLOR
                                      : plant_organ_color(world.plant_source(p.patch), p.organ),
           p.kind, p.patch, p.kind == food_kind::plant, p.kind == food_kind::plant ? &p : nullptr);
  };
  if (world.indexed()) {
    world.feeding().grid.nearby(b.x, b.y, reach, food);
    world.body_grid().nearby(b.x, b.y, reach, body);
    world.vegetation().plant_grid.nearby(b.x, b.y, reach + world.vegetation().indexed_plant_radius,
                                         plant);
  } else {
    for (std::size_t i = 0; i < world.feeding().pieces.size(); ++i)
      food(i);
    for (std::size_t i = 0; i < world.visible().size(); ++i)
      body(i);
    for (std::size_t i = 0; i < world.vegetation().plants.size(); ++i)
      plant(i);
  }
  std::stable_sort(objects.begin(), objects.end(), [](const auto &a, const auto &c) {
    return a.distance - a.radius < c.distance - c.radius;
  });
  return objects;
}
float visual_stimulus(const Body &b, const BrainInterface::Receptor &r, const Field &world,
                      const std::vector<VisualObject> &objects) {
  BrainInterface binding;
  for (int side = 0; side < EYES; ++side)
    binding.forms[BrainInterface::sense_form(field::Light, side)].weight = 1;
  binding.sensory = {r};
  binding.visual[0] = {{r.angle, 0}};
  return retinal_vision(b, binding, world, objects)[0];
}
std::vector<float> visual_stimuli(const Body &b, const Genome &g, const Field &world,
                                  const std::vector<VisualObject> *prepared) {
  auto local = prepared ? std::vector<VisualObject>{} : visual_objects(b, g, world, true, true);
  return retinal_vision(b, *g.interface, world, prepared ? *prepared : local);
}
static float adapted_response(PerceptionState &state, std::size_t i,
                              const BrainInterface::Receptor &r, double concentration,
                              bool advance) {
  const int sense = r.dominant_sense();
  const bool adapting = adapting_sense(sense);
  const double mean = adapting && i < state.adapted.size() ? state.adapted[i] : 0;
  const float response = receptor_response(r, concentration, mean);
  if (adapting && advance && !state.disabled_senses[sense])
    state.adapted[i] = float(mean + (concentration - mean) * r.adaptation_rate);
  return response;
}
void sense_generated(Body &b, const Genome &g, const Field &world,
                     const std::vector<VisualObject> *objects, bool advance_adaptation,
                     const PhysiologyParameters &physiology) {
  const auto &binding = b.active_interface(g);
  b.perception_.visual_contributions.clear();
  b.perception_.visual_samples.clear();
  b.perception_.visual_image.clear();
  auto water = world.water().velocity(b.x, b.y);
  b.motor_.water_vx = water.x;
  b.motor_.water_vy = water.y;
  const double exposure = b.hatched ? 1 : 0;
  const double radius = body_radius(b),
               burial = exposure * world.sediment_immersion(b.x, b.y, radius + SEDIMENT_PROBE);
  auto sensory = prepare_sensory_frame(
      b, binding, world, binding.sense_counts[field::GonadPressure] > 0 ? gonad_filling(b) : 0);
  b.perception_.sensory_components.clear();
  if (b.perception_.inspect_vision) {
    b.perception_.sensory_components.resize(binding.sensory.size());
    for (int side = 0; side < LATERAL_POINTS; ++side) {
      namespace L = lateral_sample_column;
      auto &q = b.perception_.lateral_samples[side];
      q[L::x] = sensory.positions[side].x;
      q[L::y] = sensory.positions[side].y;
      q[L::flow_x] = sensory.relative[side].x;
      q[L::flow_y] = sensory.relative[side].y;
      q[L::buried] = sensory.buried[side];
    }
  }
  auto &signals = b.perception_.sensor_buffer;
  signals.assign(binding.sensory.size(), 0);
  auto &adapted = b.perception_.adapted;
  if (advance_adaptation && adapted.size() != signals.size())
    adapted.assign(signals.size(), 0.f);
  constexpr int NOSES = BrainInterface::SIDES;
  std::array<std::array<double, odor_kind::count>, NOSES> odors{};
  std::array<double, NOSES> nose_contact{};
  std::array<Point, NOSES> noses{};
  const bool smelling =
      (!b.perception_.disabled_senses[field::Odor] || b.perception_.inspect_vision) &&
      std::any_of(binding.sensory.begin(), binding.sensory.end(),
                  [](const auto &r) { return r.dominant_sense() == field::Odor; });
  if (smelling) {
    for (int side = 0; side < NOSES; ++side) {
      noses[side] = olfactory_position(b, binding, side);
      nose_contact[side] = world.sediment_immersion(noses[side].x, noses[side].y, SEDIMENT_PROBE);
    }
    for (int side = 0; side < NOSES; ++side)
      odors[side] = world.odor_field(noses[side].x, noses[side].y);
  }
  if (b.perception_.probe.active() && b.perception_.probe.kind == probe_kind::smell && smelling) {
    for (int c = 0; c < odor_kind::count; ++c) {
      if (b.perception_.probe.scents[c] <= 0)
        continue;
      const auto preview = world.odor_probe(b.perception_.probe, noses, c);
      for (int side = 0; side < NOSES; ++side)
        odors[side][c] += preview[side] * b.perception_.probe.scents[c];
    }
  }
  if (b.perception_.inspect_vision)
    for (int side = 0; side < NOSES; ++side) {
      auto &sample = b.perception_.nose_samples[side];
      sample = {};
      sample[nose_sample_column::x] = noses[side].x;
      sample[nose_sample_column::y] = noses[side].y;
      sample[nose_sample_column::contact] = nose_contact[side];
      for (int k = 0; k < odor_kind::count; ++k)
        sample[nose_sample_column::odor + k] = odors[side][k];
    }
  thread_local std::unordered_map<float, double> contacts;
  contacts.clear();
  for (std::size_t i = 0; i < signals.size(); ++i) {
    const auto &r = binding.sensory[i];
    if (r.shared_receptor < i && !r.visual()) {
      signals[i] = signals[r.shared_receptor];
      if (advance_adaptation)
        adapted[i] = adapted[r.shared_receptor];
      if (b.perception_.inspect_vision)
        b.perception_.sensory_components[i][r.channel] = signals[i];
      continue;
    }
    double contact = 0;
    if (burial > 0 && (r.dominant_sense() == field::Flow || r.dominant_sense() == field::Touch)) {
      auto at = contacts.find(r.mechanical_angle);
      if (at == contacts.end()) {
        double angle = b.angle + r.mechanical_angle;
        contact = world.sediment_immersion(b.x + radius * std::cos(angle),
                                           b.y + radius * std::sin(angle), SEDIMENT_PROBE);
        contacts.emplace(r.mechanical_angle, contact);
      } else
        contact = at->second;
    }
    const double exposure = birth_exposure(b, r.time_steps);
    const int sense = r.dominant_sense();
    double concentration = anatomical_stimulus(b, r, sensory, contact, physiology);
    if (r.dominant_sense() == field::Odor && r.senses[field::Odor] > 0 &&
        !b.perception_.disabled_senses[field::Odor]) {
      const double ca = std::cos(b.angle), sa = std::sin(b.angle);
      const Point at{world.wrap_x(b.x + radius * (r.longitudinal * ca - r.lateral * sa)),
                     b.y + radius * (r.longitudinal * sa + r.lateral * ca)};
      const auto local = world.odor_field(at.x, at.y);
      double odor = 0, uniform = 0;
      for (int k = 0; k < odor_kind::count; ++k) {
        odor += local[k] * r.scents[k];
        uniform += (odors[0][k] + odors[1][k]) / 2 * r.scents[k];
      }
      if (b.perception_.probe.active() && b.perception_.probe.kind == probe_kind::smell)
        for (int k = 0; k < odor_kind::count; ++k)
          if (b.perception_.probe.scents[k] > 0) {
            const auto added = world.odor_probe(b.perception_.probe, {at, at}, k);
            odor += added[0] * b.perception_.probe.scents[k] * r.scents[k];
          }
      concentration = exposure * odor * (1 - world.sediment_immersion(at.x, at.y, SEDIMENT_PROBE)) +
                      (1 - exposure) * uniform;
    }
    signals[i] = adapted_response(b.perception_, i, r, concentration, advance_adaptation);
    if (b.perception_.inspect_vision)
      b.perception_.sensory_components[i][sense] = signals[i];
  }
  std::vector<float> vision(signals.size(), 0);
  if (exposure > 0 && !binding.visual[0].empty() &&
      (!b.perception_.disabled_senses[field::Light] ||
       !b.perception_.disabled_senses[field::Proximity] || b.perception_.inspect_vision ||
       b.perception_.inspect_retina)) {
    std::array<VisualEye, EYES> eyes{};
    const auto local_objects =
        objects ? std::vector<VisualObject>{} : visual_objects(b, g, world, true, true, &eyes);
    if (objects)
      eyes = visual_origins(b, binding, world);
    for (int side = 0; side < EYES; ++side)
      b.perception_.eye_pull[side] = eyes[side].pull;
    vision = retinal_vision(
        b, binding, world, objects ? *objects : local_objects,
        (b.perception_.inspect_vision || b.perception_.inspect_retina) ? &b : nullptr,
        RETINAL_STRIDE, true, &eyes);
  }
  for (std::size_t i = 0; i < signals.size(); ++i) {
    const auto &r = binding.sensory[i];
    const double exposure = birth_exposure(b, r.time_steps);
    // The retina reports contrast; the uniform light inside the egg has none. After hatching the
    // seen contrast fades in over the receptor's time steps. A bright egg field would set the
    // nerves' input mean far above the outer world and leave the hatchling blind for 10 tau.
    if (exposure < 1 && r.visual() && !r.proximity)
      vision[i] = float(exposure * vision[i]);
    float visual =
        b.perception_.disabled_senses[r.channel] || !r.visual()
            ? 0
            : r.visual_gain() * (r.proximity ? bounded_response(vision[i], r.threshold)
                                             : sensory_response(vision[i], r.response_threshold));
    if (b.perception_.inspect_vision && r.visual())
      b.perception_.sensory_components[i][r.channel] = visual;
    signals[i] = std::clamp(signals[i] + visual, 0.f, 1.f);
  }
  if (b.perception_.inspect_vision)
    for (auto &sample : b.perception_.visual_samples) {
      const auto r = std::find_if(binding.sensory.begin(), binding.sensory.end(),
                                  [&](const auto &r) { return r.neuron == sample.neuron; });
      auto i = std::size_t(r - binding.sensory.begin());
      sample.stimulus = r->visual_gain() * vision[i];
      sample.response = signals[i];
    }
  b.perception_.perception_prepared = true;
}

EvolutionTransaction::EvolutionTransaction(const std::vector<Genome> &population) {
  std::lock_guard<std::mutex> guard(genetics);
  std::map<std::string, std::shared_ptr<evolution::History>> roots;
  for (const auto &g : population)
    if (g.cppn)
      roots.emplace(g.cppn->history()->lineage(), g.cppn->history());
  for (const auto &root : roots)
    saved.emplace_back(root.second, *root.second);
}
EvolutionTransaction::~EvolutionTransaction() {
  if (committed)
    return;
  std::lock_guard<std::mutex> guard(genetics);
  for (auto &root : saved)
    *root.first = root.second;
}
void Genome::begin_run(std::uint64_t seed) {
  Rng random(seed);
  std::lock_guard<std::mutex> guard(genetics);
  evolution::seed(std::uint32_t(random.engine()));
}
std::vector<Genome> Genome::immigrants(const std::vector<Genome> &source, Rng &r) {
  std::lock_guard<std::mutex> guard(genetics);
  evolution::seed(std::uint32_t(r.engine()));
  std::map<std::string, std::shared_ptr<evolution::History>> branches;
  std::vector<Genome> result;
  for (const auto &original : source) {
    Genome g = original;
    if (original.cppn) {
      auto &root = branches[original.cppn->history()->lineage()];
      // A fresh History draws a new lineage and could never take this genome; start the
      // shared branch from the immigrant's own history instead.
      if (!root)
        root = std::make_shared<evolution::History>(*original.cppn->history());
      auto genes = std::make_shared<evolution::Genome>(*original.cppn);
      genes->share_history(root);
      genes->validate();
      g.cppn = std::move(genes);
    }
    result.push_back(std::move(g));
  }
  return result;
}
void Genome::unite(std::vector<Genome> &population, Genome *champion) {
  std::lock_guard<std::mutex> guard(genetics);
  std::map<std::string, std::shared_ptr<evolution::History>> histories;
  for (auto &g : population)
    if (g.cppn) {
      auto h = g.cppn->history();
      auto &shared = histories[h->lineage()];
      if (!shared)
        shared = h;
      else
        g.cppn->share_history(shared);
    }
  if (champion && champion->cppn) {
    auto h = champion->cppn->history();
    auto it = histories.find(h->lineage());
    if (it != histories.end())
      champion->cppn->share_history(it->second);
  }
}
void Genome::compile(bool record_work) {
  growing.reset();
  growth_query.reset();
  cppn->validate();
  if (cppn->inputs() != cppn::INPUTS || cppn->outputs() != field::ANATOMICAL_OUTPUTS)
    throw std::runtime_error("Ungueltiges Fisch-CPPN");
  if (cppn->nodes() > MAX_GENOME_NODES ||
      cppn->get_connection_genes().size() > MAX_GENOME_CONNECTIONS)
    throw std::length_error("Technical CPPN genotype budget exceeded");
  blueprint.reset();
  interface.reset();
  while (!advance_development(DEVELOPMENT_STEP, 0, record_work)) {
  }
}
bool Genome::advance_development(std::size_t budget, int workers, bool record_work) {
  if (blueprint)
    return true;
  if (!growing) {
    cppn->validate();
    growth_query = std::make_shared<cppn::CPPN>(cppn);
    auto o = development_options;
    if (workers > 0)
      o.workers = workers;
    growing = std::make_shared<field::Substrate>(*growth_query, o);
    growing->development_seed = development_seed;
    growing->variation_seed = variation_seed;
    growing->geometry_builder = prepare_zonal_geometry;
  }
  bool complete = growing->advance_development(
      std::min(budget, BRAIN_QUERY_LIMIT - std::min(BRAIN_QUERY_LIMIT, growing->queries)),
      record_work);
  if (!complete && growing->queries >= BRAIN_QUERY_LIMIT) {
    growing->abort_development("CPPN query limit reached (" + std::to_string(BRAIN_QUERY_LIMIT) +
                               ")");
    complete = true;
  }
  if (!complete)
    return false;
  blueprint = growing;
  interface = anatomical_interface(*blueprint);
  growing.reset();
  growth_query.reset();
  return true;
}

bool Genome::same_genes(const Genome &other) const {
  if (mutation_step != other.mutation_step || bool(cppn) != bool(other.cppn) ||
      development_seed != other.development_seed)
    return false;
  if (cppn == other.cppn)
    return true;
  if (cppn->history()->lineage() != other.cppn->history()->lineage() ||
      cppn->nodes() != other.cppn->nodes() ||
      cppn->get_connection_genes().size() != other.cppn->get_connection_genes().size())
    return false;
  // Copies retain insertion order. Compare corresponding genes directly, while still
  // accepting an equivalent genotype whose nodes or connections were reordered.
  auto node = other.cppn->get_node_genes().begin();
  for (const auto &n : cppn->get_node_genes()) {
    auto p = node->get_id() == n.get_id() ? &*node : other.cppn->get_node(n.get_id());
    ++node;
    if (!p || p->get_weight() != n.get_weight() || p->get_type() != n.get_type())
      return false;
  }
  auto edge = other.cppn->get_connection_genes().begin();
  for (const auto &c : cppn->get_connection_genes()) {
    auto p = edge->get_innovation_number() == c.get_innovation_number()
                 ? &*edge
                 : other.cppn->get_gene(c.get_innovation_number());
    ++edge;
    if (!p || p->get_weight() != c.get_weight() || p->get_enabled() != c.get_enabled() ||
        p->get_source() != c.get_source() || p->get_target() != c.get_target() ||
        p->get_port() != c.get_port())
      return false;
  }
  return true;
}
void Genome::write(std::ostream &out, bool with_history, bool with_genes) const {
  if (with_genes && !cppn)
    throw std::logic_error("Genom ohne Gene");
  std::lock_guard<std::mutex> guard(genetics);
  const auto precision = out.precision();
  const auto &o = development_options;
  out << (with_genes ? "FISH_CPPN\n" : "FISH_CPPN_REFERENCE\n")
      << std::setprecision(std::numeric_limits<double>::max_digits10) << o.bias_scale << ' '
      << o.max_nodes << ' ' << o.max_edges << ' ' << mutation_step << '\n';
  if (with_genes)
    cppn->write(out, with_history);
  out << "SEEDS " << development_seed << ' ' << variation_seed << '\n';
  if (!name.empty())
    out << "~NAME " << std::quoted(name) << '\n';
  out.precision(precision);
}
Genome Genome::read(std::istream &in, bool develop,
                    std::shared_ptr<evolution::History> shared_history,
                    std::shared_ptr<evolution::Genome> shared_genes) {
  Genome g;
  std::string magic;
  auto &o = g.development_options;
  if (!(in >> magic) || magic != (shared_genes ? "FISH_CPPN_REFERENCE" : "FISH_CPPN"))
    throw std::runtime_error("Ungültiges Fischgenom.");
  if (!(in >> o.bias_scale >> o.max_nodes >> o.max_edges >> g.mutation_step))
    throw std::runtime_error("Ungültiger Bauplan");
  o.validate();
  if (!std::isfinite(g.mutation_step) || g.mutation_step < 0 || g.mutation_step > 1)
    throw std::runtime_error("Ungültige erbliche Mutationsschrittweite");
  if (shared_genes) {
    if (shared_genes->history() != shared_history)
      throw std::runtime_error("inconsistent shared genome history");
    g.cppn = std::move(shared_genes);
  } else {
    std::lock_guard<std::mutex> guard(genetics);
    g.cppn = std::make_shared<evolution::Genome>(cppn::INPUTS, field::ANATOMICAL_OUTPUTS);
    g.cppn->read(in, std::move(shared_history));
  }
  if (g.cppn->inputs() != cppn::INPUTS || g.cppn->outputs() != field::ANATOMICAL_OUTPUTS ||
      g.cppn->nodes() > MAX_GENOME_NODES ||
      g.cppn->get_connection_genes().size() > MAX_GENOME_CONNECTIONS)
    throw std::runtime_error("Ungültiges Fisch-CPPN");
  g.cppn->validate();
  std::string tag;
  if (!(in >> tag >> g.development_seed >> g.variation_seed) || tag != "SEEDS")
    throw std::runtime_error("Ungueltiger Genomblock SEEDS");
  // An optional line names the line; '~' starts no other token that may follow a genome.
  if ((in >> std::ws).peek() == '~') {
    std::string marker;
    if (!(in >> marker >> std::quoted(g.name)) || marker != "~NAME" ||
        g.name.size() > MAX_GENOME_NAME)
      throw std::runtime_error("Ungültiger Genomname");
  }
  if (develop)
    g.compile();
  return g;
}
namespace {
std::vector<int> predecessors(const evolution::Genome &g, int root) {
  std::vector<int> nodes{root};
  for (std::size_t k = 0; k < nodes.size(); ++k)
    for (const auto &e : g.get_connection_genes())
      if (e.get_enabled() && e.get_target() == nodes[k] &&
          g.get_node(e.get_source())->get_role() == evolution::NodeRole::Hidden &&
          std::find(nodes.begin(), nodes.end(), e.get_source()) == nodes.end())
        nodes.push_back(e.get_source());
  return nodes;
}
int next_node(const evolution::Genome &g) {
  int id = 0;
  for (const auto &n : g.get_node_genes())
    id = std::max(id, n.get_id() + 1);
  return id;
}
void gate_edge(evolution::Genome &g, int innovation, int source) {
  const auto edge = *g.get_gene(innovation);
  const int gate = next_node(g);
  g.add_node({gate, 1, evolution::NodeType::TOR});
  g.edit_connection(innovation, edge.get_weight(), false);
  g.connect(edge.get_source(), gate, 1);
  g.connect(source, gate, 1, 1);
  g.connect(gate, edge.get_target(), edge.get_weight(), edge.get_port());
}
}
void mutate_cppn(Genome &g, Rng &r, double scale, bool develop, const MutationRates &m) {
  if (scale <= 0)
    return;
  {
    std::lock_guard<std::mutex> guard(genetics);
    g.cppn = evolution::Genome::copy_genome(g.cppn);
    auto &net = *g.cppn;
    evolution::seed(std::uint32_t(r.engine()));
    if (m.step_evolution >= STEP_SWITCH && scale > 0 && g.mutation_step > 0)
      g.mutation_step =
          std::clamp(g.mutation_step * std::exp(r.normal() * STEP_SPREAD), MIN_STEP, 1.);
    const double delta =
        g.mutation_step * scale * (r.uniform() < LARGE_STEP_CHANCE ? LARGE_STEP : 1);
    std::vector<int> edges, hidden, targets, gates;
    for (const auto &n : net.get_node_genes()) {
      if (n.get_role() != evolution::NodeRole::Input)
        targets.push_back(n.get_id());
      if (n.get_role() == evolution::NodeRole::Hidden)
        hidden.push_back(n.get_id());
      if (n.get_type() == evolution::NodeType::TOR)
        gates.push_back(n.get_id());
    }
    for (const auto &e : net.get_connection_genes())
      if (e.get_enabled())
        edges.push_back(e.get_innovation_number());
    if (!edges.empty() && delta > 0 && m.weight_share > 0) {
      std::vector<int> selected;
      if (r.uniform() < m.subgraph_mutation) {
        const auto nodes = predecessors(net, targets[r.index(int(targets.size()))]);
        for (int id : edges)
          if (std::find(nodes.begin(), nodes.end(), net.get_gene(id)->get_target()) !=
                  nodes.end() &&
              r.uniform() < m.weight_share)
            selected.push_back(id);
      } else
        selected.push_back(edges[r.index(int(edges.size()))]);
      for (int id : selected) {
        const auto e = *net.get_gene(id);
        const double sigma =
            net.mutation_sigma(e.get_source(), e.get_target(), e.get_port(), delta) /
            std::sqrt(double(selected.size()));
        net.edit_connection(id,
                            float(std::clamp(e.get_weight() + sigma * r.normal(), -MAX_GENE_WEIGHT,
                                             MAX_GENE_WEIGHT)),
                            true);
      }
    }
    const double rate = std::min(1., scale / RATE_SCALE);
    if (!edges.empty() && net.nodes() < MAX_GROWING_NODES && r.uniform() < m.add_node * rate)
      net.split_connection(edges[r.index(int(edges.size()))]);
    if (!hidden.empty() && r.uniform() < m.duplicate * rate) {
      const int root = hidden[r.index(int(hidden.size()))];
      net.duplicate_subgraph(r.uniform() < .5 ? predecessors(net, root) : std::vector<int>{root},
                             nullptr, false);
    }
    auto add = [&](bool side) {
      std::vector<int> sources;
      for (const auto &n : net.get_node_genes())
        if (n.get_role() != evolution::NodeRole::Output &&
            ((n.get_id() == cppn::input::side) == side))
          sources.push_back(n.get_id());
      if (sources.empty() || targets.empty())
        return;
      for (int k = 0; k < REWIRE_TRIALS; ++k) {
        const int from = sources[r.index(int(sources.size()))],
                  to = targets[r.index(int(targets.size()))],
                  port = net.get_node(to)->get_type() == evolution::NodeType::TOR ? r.index(2) : 0;
        if (net.connect(from, to, float(r.normal() * net.mutation_sigma(from, to, port, delta)),
                        port))
          break;
      }
    };
    if (r.uniform() < m.add_connection * rate)
      add(false);
    if (r.uniform() < m.lateral_connection * rate)
      add(true);
    if (!edges.empty() && r.uniform() < m.disable * rate) {
      const int id = edges[r.index(int(edges.size()))];
      net.edit_connection(id, net.get_gene(id)->get_weight(), false);
    }
    if (!edges.empty() && net.nodes() < MAX_GROWING_NODES && r.uniform() < m.gate_insert * rate) {
      const int id = edges[r.index(int(edges.size()))];
      gate_edge(net, id, r.index(GATE_ZONES));
    }
    if (!gates.empty() && r.uniform() < m.gate_switch * rate) {
      const int id = gates[r.index(int(gates.size()))];
      if (r.uniform() < .5)
        for (const auto &e : net.get_connection_genes())
          if (e.get_target() == id && e.get_port())
            net.edit_connection(e.get_innovation_number(), e.get_weight(), false);
      std::vector<int> sources;
      for (const auto &n : net.get_node_genes())
        if (n.get_role() != evolution::NodeRole::Output && n.get_id() != cppn::input::side &&
            net.can_enable(n.get_id(), id))
          sources.push_back(n.get_id());
      if (!sources.empty())
        net.connect(sources[r.index(int(sources.size()))], id, 1, 1);
    }
    if (!gates.empty() && r.uniform() < m.gate_remove * rate) {
      const int id = gates[r.index(int(gates.size()))];
      for (const auto &e : net.get_connection_genes())
        if (e.get_target() == id && e.get_port())
          net.edit_connection(e.get_innovation_number(), e.get_weight(), false);
      net.edit_node(id, 1, evolution::NodeType::LINEAR);
    }
    if (!hidden.empty() && r.uniform() < m.transfer * rate) {
      const auto region = predecessors(net, hidden[r.index(int(hidden.size()))]);
      std::vector<int> twins;
      std::vector<std::pair<int, float>> outgoing;
      for (const auto &e : net.get_connection_genes())
        if (std::find(region.begin(), region.end(), e.get_source()) != region.end() &&
            std::find(region.begin(), region.end(), e.get_target()) == region.end())
          outgoing.push_back({e.get_innovation_number(), e.get_weight()});
      if (net.duplicate_subgraph(region, &twins, false)) {
        for (const auto &e : outgoing)
          net.edit_connection(e.first, e.second, net.get_gene(e.first)->get_enabled());
        std::vector<int> boundary;
        for (const auto &e : net.get_connection_genes())
          if (e.get_enabled() &&
              std::find(twins.begin(), twins.end(), e.get_source()) != twins.end() &&
              std::find(twins.begin(), twins.end(), e.get_target()) == twins.end())
            boundary.push_back(e.get_innovation_number());
        const int zone = r.index(cppn::input::zones);
        for (int id : boundary) {
          net.edit_connection(id, net.get_gene(id)->get_weight() * GATE_GAIN, true);
          gate_edge(net, id, zone);
        }
      }
    }
    if (!hidden.empty() && r.uniform() < m.node_edit * rate) {
      const int id = hidden[r.index(int(hidden.size()))];
      const auto n = *net.get_node(id);
      if (n.get_type() != evolution::NodeType::TOR) {
        const auto type = r.uniform() < m.type_change
                              ? HIDDEN_TYPES[r.index(int(HIDDEN_TYPES.size()))]
                              : n.get_type();
        const float value = type == evolution::NodeType::LINEAR
                                ? 1.f
                                : float(std::clamp(n.get_weight() + r.normal() * delta,
                                                   -MAX_GENE_WEIGHT, MAX_GENE_WEIGHT));
        net.edit_node(id, value, type);
      }
    }
    if (net.nodes() > MAX_GENOME_NODES ||
        net.get_connection_genes().size() > MAX_GENOME_CONNECTIONS)
      throw std::length_error("CPPN budget exceeded");
    net.validate();
  }
  g.discard_development();
  if (develop)
    g.compile();
}

Genome cross_cppn(const Genome &a, const Genome &b, Rng &r, double fa, double fb, bool develop) {
  if (!b.cppn || a.cppn->history()->lineage() != b.cppn->history()->lineage())
    throw std::invalid_argument("Incompatible reproductive lineages");
  Genome child;
  {
    std::lock_guard<std::mutex> guard(genetics);
    evolution::seed(std::uint32_t(r.engine()));
    child.cppn = evolution::Genome::crossover(*a.cppn, *b.cppn, float(fa), float(fb));
    child.development_options = a.development_options;
    child.mutation_step = r.uniform() < .5 ? a.mutation_step : b.mutation_step;
    // the structural seed is inherited like a gene; the variation is the newborn's own
    // (begin_individual)
    child.development_seed = r.uniform() < .5 ? a.development_seed : b.development_seed;
  }
  if (develop)
    child.compile();
  return child;
}
void Body::prepare(const Genome &g) {
  if (!g.cppn || brain_)
    return;
  hatched = false;
  if (!g.blueprint)
    return;
  embryo = {};
  perception_.adapted.clear();
  size_egg(*this);
  organ_mass = g.interface->organ_mass;
  jaw_length = g.interface->jaw_length;
  const auto &shape = g.interface->body_geometry;
  namespace M = field::body_metric;
  snout_position = shape[M::extent] > 0
                       ? (shape[M::head_back] + shape[M::head_length] +
                          std::max(shape[M::face_length], SNOUT_MOUTH * mouth_share(jaw_length)) -
                          shape[M::center]) /
                             shape[M::extent]
                       : 1;
  gut_length = g.interface->gut_length;
  blunt_teeth = g.interface->blunt_teeth;
  undulation = g.interface->undulation;

  bladder_capacity = g.interface->capacities[organ_port::bladder];
  suction_strength = g.interface->suction_strength;
  bite_strength = g.interface->bite_strength;
  if (!g.blueprint->resource_limited)
    brain_.emplace(g.blueprint);
  development_.emplace(*g.blueprint, field::DevelopmentCosts{}, g.interface->mobile_reproductive);
  development_->prepaid_construction(ledger_.construction_paid);
  hatched = false;
  motor_.speed = 0;
  motor_.turn = 0;
  eat_signal = 0;
  reproduction_.egg_role = g.interface->motor_counts[organ_port::eggs] > 0;
}
void cppn_action(Body &b, const Genome &g, const PhysiologyParameters &physiology,
                 bool protected_life) {
  if (!b.perception_.perception_prepared) {
    const auto &binding = b.active_interface(g);
    auto &state = b.perception_;
    state.sensor_buffer.resize(binding.sensory.size());
    if (state.adapted.size() != state.sensor_buffer.size())
      state.adapted.assign(state.sensor_buffer.size(), 0.f);
    const auto frame = prepare_sensory_frame(
        b, binding.sense_counts[field::GonadPressure] > 0 ? gonad_filling(b) : 0);
    for (std::size_t i = 0; i < binding.sensory.size(); ++i) {
      const auto &r = binding.sensory[i];
      state.sensor_buffer[i] =
          adapted_response(state, i, r, anatomical_stimulus(b, r, frame, 0, physiology), true);
    }
  }
  b.perception_.perception_prepared = false;
  b.brain_->set_maturity(body_maturity(b));
  b.brain_->step(b.perception_.sensor_buffer, b.hormones_.levels(), b.identity);
  b.refresh_organs(g);
  anatomical_action(b, b.active_interface(g), physiology, protected_life);
}
void Body::activate_brain(const Genome &g) {
  if (!g.blueprint)
    throw std::invalid_argument("brain plan missing");
  brain_.emplace(g.blueprint);
}
void Body::reset_brain() {
  if (brain_)
    brain_->reset();
}
void Body::mute_neuron(std::size_t id) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  brain_->mute(id);
}
void Body::stimulate_neuron(std::size_t id, float value, unsigned steps) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  brain_->stimulate(id, value, steps);
  brain_->refresh_observation();
}
void Body::stimulate_neurons(const std::vector<std::size_t> &ids, float value, unsigned steps) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  brain_->stimulate(ids, value, steps);
  brain_->refresh_observation();
}
void Body::advance_probe() {
  if (perception_.probe.remaining > 0)
    --perception_.probe.remaining;
}
void Body::reset_probe() {
  perception_.probe = {};
  if (brain_)
    brain_->clear_stimuli();
}
void Body::refresh_senses(const Genome &g, const Field &world, const PhysiologyParameters &p) {
  sense_generated(*this, g, world, nullptr, false, p);
  perception_.perception_prepared = false;
}
void Body::clear_probe(const Genome &g, const Field &world, const PhysiologyParameters &p) {
  const bool active = perception_.probe.active();
  reset_probe();
  if (active && hatched && brain_)
    refresh_senses(g, world, p);
}
void Body::disable_sense(int sense) {
  if (sense < 0 || sense >= field::SENSE_COUNT)
    throw std::invalid_argument("invalid sense");
  perception_.disabled_senses[sense] = true;
}
void Body::set_probe(SensoryProbe probe) {
  auto finite = [](double x) { return std::isfinite(x); };
  if (probe.kind < probe_kind::sight || probe.kind > probe_kind::sense || !finite(probe.x) ||
      !finite(probe.y) || !finite(probe.energy) || probe.energy < 0 ||
      probe.energy > PROBE_MAX_ENERGY || !finite(probe.radius) || probe.radius < PROBE_MIN_RADIUS ||
      probe.radius > PROBE_MAX_RADIUS || probe.sense < 0 || probe.sense >= field::SENSE_COUNT ||
      !finite(probe.value) || probe.value < 0 || probe.value > 1 ||
      !std::all_of(probe.color.begin(), probe.color.end(),
                   [&](double x) { return finite(x) && x >= 0 && x <= PROBE_MAX_COLOR; }) ||
      !std::all_of(probe.scents.begin(), probe.scents.end(),
                   [&](double x) { return finite(x) && x >= 0 && x <= 1; }) ||
      std::accumulate(probe.scents.begin(), probe.scents.end(), 0.) > 1 + tolerance::precision)
    throw std::invalid_argument("Sinnesreiz außerhalb des Bereichs.");
  perception_.probe = probe;
}

bool Body::set_inspection(bool vision, bool retina, int neuron) {
  const bool fresh =
      (vision && (!perception_.inspect_vision || perception_.inspection_neuron != neuron)) ||
      (retina && !perception_.inspect_retina);
  perception_.inspection_neuron = vision ? neuron : -1;
  perception_.inspect_retina = retina;
  perception_.inspect_vision = vision;
  if (!vision) {
    perception_.visual_contributions.clear();
    perception_.visual_samples.clear();
  }
  return fresh;
}
void Body::evaluate_brain(const std::vector<float> &input, bool learning) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  if (learning)
    brain_->step(input, hormones_.levels(), identity);
  else
    brain_->step(input);
}

}
