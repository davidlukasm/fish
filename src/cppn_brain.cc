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
#include "sight.hh"
#include "retina.hh"
#include "evolution/mutations.hh"
#include <sstream>
#include <stdexcept>
#include <iomanip>
#include <mutex>
#include <map>
#include <unordered_map>

namespace fishsim {
std::size_t default_neural_budget = 64000000;
field::Options default_development_options = []() {
  field::Options o;
  o.workers = 2;
  o.depth = 3;
  o.scale = 1.4f;
  o.max_nodes = 8192;
  o.max_edges = 65536;
  return o;
}();
namespace {
std::shared_ptr<evolution::Genome> founder;
std::mutex genetics;
constexpr std::array<evolution::NodeType, 6> founder_types{
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
                                         std::array<VisualEye, 2> *origins) {
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
  std::array<SightFilter, 2> tint;
  std::array<SightMedium, 2> medium;
  std::array<bool, 2> prepared{};
  using Intervals = std::vector<std::pair<double, double>>;
  thread_local std::array<Intervals, 2> scratch_views;
  std::array<const Intervals *, 2> views{};
  const bool paired = eyes[0].present && eyes[1].present;
  for (int side = 0; side < 2; ++side)
    if (eyes[side].present) {
      const auto &cached =
          paired ? g.interface->eye_intervals[side] : g.interface->visual_intervals;
      if (!cached.empty() && (!paired || world.env().vision_binocular_angle == .05)) {
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
  auto object = [&](double px, double py, double radius, std::array<double, 3> color, int kind,
                    std::uint64_t id, bool transparent = false,
                    const PlantPart *stroke = nullptr) {
    const double cx = world.delta_x(px - b.x), cy = py - b.y,
                 limit = reach + (stroke ? stroke->radius : 0);
    if (cx * cx + cy * cy >= limit * limit)
      return;
    const double ca = std::cos(b.angle), sa = std::sin(b.angle);
    for (int side = 0; side < 2; ++side) {
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
                     hx = ca * stroke->hx + sa * stroke->hy, hy = -sa * stroke->hx + ca * stroke->hy,
                     w = stroke_width(*stroke), s = stroke_closest(hx, hy, -sx, -sy),
                     line = std::hypot(sx + s * hx, sy + s * hy),
                     n1 = std::hypot(sx - hx, sy - hy), n2 = std::hypot(sx + hx, sy + hy);
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
          angle = std::hypot(bx, by) > 1e-12 ? std::atan2(by, bx) : std::atan2(sy, sx);
          half = std::min(PI, span * .5 + std::asin(std::min(1., w / line)));
        }
        // Light reflected by a translucent organ scales with how much of the view it covers.
        const double crossings =
            line <= w ? 1 : stroke_optical_depth(sx, sy, hx, hy, w, 1, 2 * sx, 2 * sy);
        const auto depth = world.foliage_depth(stroke->organ_kind);
        double passed = 0;
        for (double d : depth)
          passed += std::exp2(-crossings * d) / 3;
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
        const double factor = (kind == 6 ? 1 : world.light(px, py)) * passed[0];
        for (int c = 0; c < 3; ++c)
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
  if (b.perception().probe.active() && b.perception().probe.kind == 0)
    object(b.perception().probe.x, b.perception().probe.y, b.perception().probe.radius,
           b.perception().probe.color, 6, 0);
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
    if ((b.identity && (p.kind == 1 || p.kind == 2))
            ? p.id != b.identity
            : std::hypot(world.delta_x(p.x - b.x), p.y - b.y) > 1e-6)
      object(p.x, p.y, p.radius, p.color, p.kind, p.id);
  };
  auto plant = [&](std::uint32_t i) {
    const auto &p = world.vegetation().plants[i];
    object(p.x, p.y, p.kind == 5 ? stroke_width(p) : p.radius,
           p.kind == 4 ? std::array<double, 3>{.25, .65, .20}
                       : plant_organ_color(world.plant_source(p.patch), p.organ),
           p.kind, p.patch, p.kind == 5, p.kind == 5 ? &p : nullptr);
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
  binding.forms[1].weight = binding.forms[2].weight = 1;
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
  const bool adapting = sense == 1 || sense == 2 || sense == 10;
  const double mean = adapting && i < state.adapted.size() ? state.adapted[i] : 0;
  const float response = receptor_response(r, concentration, mean);
  if (adapting && advance && !state.disabled_senses[sense])
    state.adapted[i] = float(mean + (concentration - mean) * r.adaptation_rate);
  return response;
}
void sense_generated(Body &b, const Genome &g, const Field &world,
                     const std::vector<VisualObject> *objects, bool advance_adaptation,
                     const PhysiologyParameters &physiology) {
  const auto &binding = *g.interface;
  b.perception_.visual_contributions.clear();
  b.perception_.visual_samples.clear();
  b.perception_.visual_image.clear();
  auto water = world.water().velocity(b.x, b.y);
  b.motor_.water_vx = water.x;
  b.motor_.water_vy = water.y;
  const double exposure = b.hatched ? 1 : 0;
  const double radius = body_radius(b),
               burial = exposure * world.sediment_immersion(b.x, b.y, radius + .5);
  auto sensory =
      prepare_sensory_frame(b, binding, world, binding.sense_counts[8] > 0 ? gonad_filling(b) : 0);
  b.perception_.sensory_components.clear();
  if (b.perception_.inspect_vision) {
    b.perception_.sensory_components.resize(binding.sensory.size());
    for (int side = 0; side < 4; ++side)
      b.perception_.lateral_samples[side] = {sensory.positions[side].x, sensory.positions[side].y,
                                             sensory.relative[side].x, sensory.relative[side].y,
                                             sensory.buried[side]};
  }
  auto &signals = b.perception_.sensor_buffer;
  signals.assign(binding.sensory.size(), 0);
  auto &adapted = b.perception_.adapted;
  if (advance_adaptation && adapted.size() != signals.size())
    adapted.assign(signals.size(), 0.f);
  std::array<std::array<double, 8>, 2> odors{};
  std::array<double, 2> nose_contact{};
  std::array<Point, 2> noses{};
  const bool smelling = (!b.perception_.disabled_senses[1] || b.perception_.inspect_vision) &&
                        std::any_of(binding.sensory.begin(), binding.sensory.end(),
                                    [](const auto &r) { return r.dominant_sense() == 1; });
  if (smelling) {
    for (int side = 0; side < 2; ++side) {
      noses[side] = olfactory_position(b, binding, side);
      nose_contact[side] = world.sediment_immersion(noses[side].x, noses[side].y, .5);
    }
    for (int side = 0; side < 2; ++side)
      odors[side] = world.odor_field(noses[side].x, noses[side].y);
  }
  if (b.perception_.probe.active() && b.perception_.probe.kind == 1 && smelling) {
    for (int c = 0; c < 8; ++c) {
      if (b.perception_.probe.scents[c] <= 0)
        continue;
      const auto preview = world.odor_probe(b.perception_.probe, noses, c);
      for (int side = 0; side < 2; ++side)
        odors[side][c] += preview[side] * b.perception_.probe.scents[c];
    }
  }
  if (b.perception_.inspect_vision)
    for (int side = 0; side < 2; ++side) {
      auto &sample = b.perception_.nose_samples[side];
      sample = {};
      sample[0] = noses[side].x;
      sample[1] = noses[side].y;
      sample[2] = nose_contact[side];
      for (int k = 0; k < 8; ++k)
        sample[k + 3] = odors[side][k];
    }
  thread_local std::unordered_map<float, double> contacts;
  contacts.clear();
  for (std::size_t i = 0; i < signals.size(); ++i) {
    const auto &r = binding.sensory[i];
    double contact = 0;
    if (burial > 0 && (r.dominant_sense() == 2 || r.dominant_sense() == 3)) {
      auto at = contacts.find(r.mechanical_angle);
      if (at == contacts.end()) {
        double angle = b.angle + r.mechanical_angle;
        contact = world.sediment_immersion(b.x + radius * std::cos(angle),
                                           b.y + radius * std::sin(angle), .5);
        contacts.emplace(r.mechanical_angle, contact);
      } else
        contact = at->second;
    }
    const double exposure = birth_exposure(b, r.time_steps);
    const int sense = r.dominant_sense();
    double concentration = anatomical_stimulus(b, r, sensory, contact, physiology);
    if (r.dominant_sense() == 1 && r.senses[1] > 0 && !b.perception_.disabled_senses[1]) {
      const bool sided = std::abs(r.lateral) > .05;
      const int own = r.lateral > 0 ? 1 : 0;
      const double mix = sided ? own : .5 * (r.lateral + 1);
      std::array<double, 2> intensity{};
      for (int side = 0; side < 2; ++side)
        for (int k = 0; k < 8; ++k)
          intensity[side] += odors[side][k] * r.scents[k];
      const double odor = (1 - mix) * intensity[0] + mix * intensity[1];
      const double buried = (1 - mix) * nose_contact[0] + mix * nose_contact[1];
      double uniform = 0;
      for (int k = 0; k < 8; ++k)
        uniform += .5 * (odors[0][k] + odors[1][k]) * r.scents[k];
      concentration = exposure * std::max(0., odor * (1 - buried)) + (1 - exposure) * uniform;
    }
    signals[i] = adapted_response(b.perception_, i, r, concentration, advance_adaptation);
    if (b.perception_.inspect_vision)
      b.perception_.sensory_components[i][sense] = signals[i];
  }
  std::vector<float> vision(signals.size(), 0);
  if (exposure > 0 && !binding.visual[0].empty() &&
      (!b.perception_.disabled_senses[0] || b.perception_.inspect_vision ||
       b.perception_.inspect_retina)) {
    std::array<VisualEye, 2> eyes{};
    const auto local_objects =
        objects ? std::vector<VisualObject>{} : visual_objects(b, g, world, true, true, &eyes);
    vision = retinal_vision(
        b, binding, world, objects ? *objects : local_objects,
        (b.perception_.inspect_vision || b.perception_.inspect_retina) ? &b : nullptr,
        RETINAL_STRIDE, true, objects ? nullptr : &eyes);
  }
  for (std::size_t i = 0; i < signals.size(); ++i) {
    const auto &r = binding.sensory[i];
    const double exposure = birth_exposure(b, r.time_steps);
    if (exposure < 1 && r.dominant_sense() == 0) {
      double ambient = 0;
      for (int c = 0; c < 3; ++c)
        ambient += r.spectrum[c] * b.color[c] * world.env().vision_ambient * world.light(b.x, b.y);
      vision[i] = float(exposure * vision[i] + (1 - exposure) * ambient);
    }
    float visual = b.perception_.disabled_senses[0] || r.dominant_sense() != 0
                       ? 0
                       : r.senses[0] * sensory_response(vision[i], r.response_threshold);
    if (b.perception_.inspect_vision)
      b.perception_.sensory_components[i][0] = visual;
    signals[i] = std::clamp(signals[i] + visual, 0.f, 1.f);
  }
  if (b.perception_.inspect_vision)
    for (auto &sample : b.perception_.visual_samples) {
      const auto r = std::find_if(binding.sensory.begin(), binding.sensory.end(),
                                  [&](const auto &r) { return r.neuron == sample.neuron; });
      auto i = std::size_t(r - binding.sensory.begin());
      sample.stimulus = r->senses[0] * vision[i];
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
  auto start = pool_randomized(random);
  std::lock_guard<std::mutex> guard(genetics);
  founder = std::move(start.cppn);
}
void Genome::adopt_run(const Genome &g) {
  if (g.cppn) {
    std::lock_guard<std::mutex> guard(genetics);
    founder = evolution::Genome::copy_genome(g.cppn);
  }
}
Genome Genome::run_founder() {
  std::lock_guard<std::mutex> guard(genetics);
  Genome g;
  g.cppn = founder;
  return g;
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
      if (!root)
        root = std::make_shared<evolution::History>();
      auto genes = std::make_shared<evolution::Genome>(original.cppn->inputs(),
                                                       original.cppn->outputs(), root);
      for (const auto &n : original.cppn->get_node_genes())
        genes->add_node(n);
      for (const auto &c : original.cppn->get_connection_genes())
        genes->add_connection(c);
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
void Genome::compile() {
  growing.reset();
  growth_query.reset();
  cppn->validate();
  if (cppn->inputs() != cppn::INPUTS || cppn->outputs() != field::ANATOMICAL_OUTPUTS)
    throw std::runtime_error("Ungueltiges Fisch-CPPN");
  if (cppn->nodes() > 1024 || cppn->get_connection_genes().size() > 16384)
    throw std::length_error("Technical CPPN genotype budget exceeded");
  blueprint.reset();
  interface.reset();
  while (!advance_development(8192)) {
  }
}
bool Genome::advance_development(std::size_t budget, int workers) {
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
  }
  bool complete = growing->advance_development(
      std::min(budget, BRAIN_QUERY_LIMIT - std::min(BRAIN_QUERY_LIMIT, growing->queries)));
  if (!complete && growing->queries >= BRAIN_QUERY_LIMIT) {
    growing->abort_development("CPPN query limit reached (300000)");
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

Genome Genome::fresh(Rng &r) {
  auto g = pool_randomized(r);
  g.compile();
  return g;
}
Genome Genome::randomized(const Genome &base, Rng &r, bool develop, const MutationRates &rates) {
  Genome g = base;
  g.development_seed = std::uint64_t(r.engine());
  g.begin_individual(r);
  g.development_options.stop_at_resource_limit = true;
  {
    std::lock_guard<std::mutex> guard(genetics);
    g.cppn = evolution::Genome::copy_genome(base.cppn);
    for (const auto &c : g.cppn->get_connection_genes())
      g.cppn->edit_connection(c.get_innovation_number(),
                              float(std::clamp(.3 * r.normal(), -4., 4.)), c.get_enabled());
    for (const auto &n : g.cppn->get_node_genes())
      if (n.get_role() == evolution::NodeRole::Hidden) {
        auto type = n.get_type() == evolution::NodeType::ABS
                        ? evolution::NodeType::ABS
                        : std::array<evolution::NodeType, 5>{
                              evolution::NodeType::SINE, evolution::NodeType::COSINE,
                              evolution::NodeType::GAUSSIAN, evolution::NodeType::ABS,
                              evolution::NodeType::LINEAR}[r.index(5)];
        float parameter =
            type == evolution::NodeType::ABS
                ? 0.f
                : float(type == evolution::NodeType::GAUSSIAN ? r.uniform(.2, 4) : r.uniform(1, 8));
        g.cppn->edit_node(n.get_id(), parameter, type);
      }
  }
  for (int i = 0; i < 3; ++i)
    g.mutate(r, 1., false, rates);
  if (develop)
    g.compile();
  g.development_options.stop_at_resource_limit = false;
  return g;
}
Genome Genome::pool_randomized(Rng &random) {
  Genome g;
  g.development_seed = random.engine();
  g.variation_seed = random.engine();
  std::lock_guard<std::mutex> guard(genetics);
  evolution::seed(std::uint32_t(random.engine()));
  using evolution::NodeType;
  constexpr int inputs = cppn::INPUTS, ports = inputs + cppn::OUTPUTS;
  g.cppn = std::make_shared<evolution::Genome>(inputs, cppn::OUTPUTS);
  for (int id = 0; id < ports; ++id) {
    evolution::NodeGene node{id, 1, NodeType::LINEAR};
    node.set_branch(id < inputs ? -1 : cppn::output::branch(id - inputs));
    g.cppn->add_node(node);
  }
  int next = ports;
  auto hidden = [&](int branch) {
    const auto type = founder_types[random.index(int(founder_types.size()))];
    const float parameter = type == NodeType::GAUSSIAN ? float(random.uniform(4, 12))
                            : type == NodeType::SINE || type == NodeType::COSINE
                                ? float(random.uniform(1, 5))
                            : type == NodeType::LINEAR ? 1.f
                                                       : 0.f;
    evolution::NodeGene node{next++, parameter, type};
    node.set_branch(branch);
    g.cppn->add_node(node);
    return node.get_id();
  };
  // Cell queries repeat both positions: use only independent, reflection-even inputs.
  // Link queries additionally use distance, differences and both directed marker products.
  // Asymmetry can subsequently evolve through the ordinary connection mutation.
  const bool unrestricted = random.uniform() < .25;
  for (int branch = 0; branch < cppn::output::branches; ++branch) {
    const std::vector<int> geometry = branch < 2
                                          ? std::vector<int>{1, 5, 10, 11}
                                          : std::vector<int>{1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13};
    const int depth = random.index(unrestricted ? 5 : 4);
    const double spread = random.uniform(.5, unrestricted ? 1.8 : 1.2);
    std::vector<int> previous;
    for (int layer = 0; layer <= depth; ++layer) {
      std::vector<int> targets;
      if (layer == depth) {
        for (int port = 0; port < cppn::OUTPUTS; ++port)
          if (cppn::output::branch(port) == branch)
            targets.push_back(inputs + port);
      } else {
        const int width = 1 + random.index(unrestricted ? 10 : 6);
        for (int j = 0; j < width; ++j)
          targets.push_back(hidden(branch));
      }
      auto available = geometry;
      available.insert(available.end(), previous.begin(), previous.end());
      for (std::size_t j = 0; j < targets.size(); ++j) {
        auto shuffled = available;
        std::shuffle(shuffled.begin(), shuffled.end(), random.engine);
        shuffled.resize(1 + random.index(std::min(6, int(shuffled.size()))));
        // Every hidden node reaches the next layer or an output, even in narrowing branches.
        for (std::size_t k = j; k < previous.size(); k += targets.size())
          if (std::find(shuffled.begin(), shuffled.end(), previous[k]) == shuffled.end())
            shuffled.push_back(previous[k]);
        const double sigma = spread / std::sqrt(double(shuffled.size()));
        for (int source : shuffled) {
          const double scale = source == 4 ? 1 / std::sqrt(12.) : source == 11 ? .5 : 1.;
          g.cppn->connect(source, targets[j],
                          float(std::clamp(sigma * scale * random.normal(), -4., 4.)));
        }
        g.cppn->connect(cppn::BIAS, targets[j], float(random.uniform(-.6, .6)));
      }
      previous = std::move(targets);
    }
    if (branch < 2 || unrestricted)
      continue;
    // Diverse mutable link rules supplement the random branch; no cell types or behaviour
    // are assigned. A quarter of genomes keeps entirely unseeded connection expressions.
    const int kind = branch - 2, mode = random.index(4);
    const int output = inputs + int(cppn::output::link_expression(kind));
    auto add = [&](int source, float weight) {
      for (const auto &edge : g.cppn->get_connection_genes())
        if (edge.get_source() == source && edge.get_target() == output) {
          g.cppn->edit_connection(edge.get_innovation_number(), edge.get_weight() + weight, true);
          return;
        }
      g.cppn->connect(source, output, weight);
    };
    if (mode == 1 || mode == 3) {
      const float width = float(random.uniform(.2, 1.5));
      evolution::NodeGene node{next++, 8 * width, NodeType::GAUSSIAN};
      node.set_branch(branch);
      g.cppn->add_node(node);
      g.cppn->connect(4, node.get_id(), 1);
      const float sign = random.uniform() < .75 ? 1.f : -1.f;
      add(node.get_id(), sign * float(random.uniform(.4, 1.2)));
      add(cppn::BIAS, -sign * float(random.uniform(.2, .6)));
    }
    if (mode == 2 || mode == 3)
      for (int input : {cppn::MATCH, cppn::MATCH + 1})
        add(input, float(random.uniform(.4, 1.5) * (random.index(2) ? 1 : -1)));
    if (mode && random.uniform() < .7)
      add(10, float(random.uniform(-1, 1)));
  }
  return g;
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
  for (const auto &n : cppn->get_node_genes()) {
    auto p = other.cppn->get_node(n.get_id());
    if (!p || p->get_weight() != n.get_weight() || p->get_type() != n.get_type() ||
        p->get_branch() != n.get_branch())
      return false;
  }
  for (const auto &c : cppn->get_connection_genes()) {
    auto p = other.cppn->get_gene(c.get_innovation_number());
    if (!p || p->get_weight() != c.get_weight() || p->get_enabled() != c.get_enabled() ||
        p->get_source() != c.get_source() || p->get_target() != c.get_target())
      return false;
  }
  return true;
}
void Genome::write(std::ostream &out, bool with_history) const {
  std::lock_guard<std::mutex> guard(genetics);
  const auto precision = out.precision();
  const auto &o = development_options;
  out << "FISH_CPPN\n"
      << std::setprecision(17) << o.depth << ' ' << o.scale << ' ' << o.bias_scale << ' '
      << o.max_nodes << ' ' << o.max_edges << ' ' << o.neuron_budget << ' ' << o.role_transition
      << ' ' << mutation_step << '\n';
  cppn->write(out, with_history);
  out << "SEEDS " << development_seed << ' ' << variation_seed << '\n';
  out.precision(precision);
}
Genome Genome::read(std::istream &in, bool develop,
                    std::shared_ptr<evolution::History> shared_history) {
  Genome g;
  std::string magic;
  auto &o = g.development_options;
  if (!(in >> magic) || magic != "FISH_CPPN")
    throw std::runtime_error("Ungültiges Fischgenom.");
  if (!(in >> o.depth >> o.scale >> o.bias_scale >> o.max_nodes >> o.max_edges >> o.neuron_budget >>
        o.role_transition >> g.mutation_step))
    throw std::runtime_error("Ungültiger Bauplan");
  o.validate();
  if (!std::isfinite(g.mutation_step) || g.mutation_step < .5 || g.mutation_step > 2)
    throw std::runtime_error("Ungültige erbliche Mutationsschrittweite");
  {
    std::lock_guard<std::mutex> guard(genetics);
    g.cppn = std::make_shared<evolution::Genome>(cppn::INPUTS, field::ANATOMICAL_OUTPUTS);
    g.cppn->read(in, std::move(shared_history));
  }
  if (g.cppn->inputs() != cppn::INPUTS || g.cppn->outputs() != field::ANATOMICAL_OUTPUTS ||
      g.cppn->nodes() > 1024 || g.cppn->get_connection_genes().size() > 16384)
    throw std::runtime_error("Ungültiges Fisch-CPPN");
  g.cppn->validate();
  std::string tag;
  if (!(in >> tag >> g.development_seed >> g.variation_seed) || tag != "SEEDS")
    throw std::runtime_error("Ungueltiger Genomblock SEEDS");
  if (develop)
    g.compile();
  return g;
}
namespace {
std::vector<int> duplicate_region(const evolution::Genome &g, int root, Rng &random) {
  std::vector<int> selected{root};
  const int wanted = random.uniform() < .85 ? 2 + random.index(3) : 5 + random.index(4);
  const bool path = random.uniform() < .5;
  while (int(selected.size()) < wanted) {
    std::vector<int> adjacent;
    auto contains = [&](int id) {
      return std::find(selected.begin(), selected.end(), id) != selected.end();
    };
    for (const auto &c : g.get_connection_genes())
      if (c.get_enabled()) {
        int other = -1;
        if (path) {
          if (c.get_source() == selected.back())
            other = c.get_target();
        } else if (contains(c.get_source()))
          other = c.get_target();
        else if (contains(c.get_target()))
          other = c.get_source();
        const auto *node = other < 0 ? nullptr : g.get_node(other);
        if (node && node->get_role() == evolution::NodeRole::Hidden && !contains(other))
          adjacent.push_back(other);
      }
    if (adjacent.empty())
      break;
    std::sort(adjacent.begin(), adjacent.end());
    adjacent.erase(std::unique(adjacent.begin(), adjacent.end()), adjacent.end());
    selected.push_back(adjacent[random.index(int(adjacent.size()))]);
  }
  return selected;
}
}
namespace {
// Weight perturbations share a branch-local budget, normalized by active connection count.
void mutate_cppn_weights(Genome &g, Rng &r, double scale, const MutationRates &m, int branch) {
  const auto chosen = [&](const auto &c) {
    return branch < 0 || g.cppn->get_node(c.get_target())->get_branch() == branch;
  };
  const auto active =
      std::count_if(g.cppn->get_connection_genes().begin(), g.cppn->get_connection_genes().end(),
                    [&](const auto &c) { return c.get_enabled() && chosen(c); });
  const double sigma = g.mutation_step * scale / std::sqrt(std::max<std::ptrdiff_t>(1, active));
  for (const auto &c : g.cppn->get_connection_genes())
    if (c.get_enabled() && chosen(c) && r.uniform() < m.weight_share) {
      double limit = 4;
      while (limit < std::abs(c.get_weight()))
        limit *= 2;
      g.cppn->edit_connection(c.get_innovation_number(),
                              float(std::clamp(c.get_weight() + r.normal() * sigma, -limit, limit)),
                              true);
    }
  if (r.uniform() < m.gain_rate) {
    std::vector<int> adjustable;
    for (const auto &n : g.cppn->get_node_genes())
      if ((branch < 0 || n.get_branch() == branch) && n.get_role() != evolution::NodeRole::Input &&
          !(n.get_id() >= g.cppn->inputs() + 1 && n.get_id() <= g.cppn->inputs() + 6) &&
          (n.get_type() == evolution::NodeType::SINE ||
           n.get_type() == evolution::NodeType::COSINE ||
           n.get_type() == evolution::NodeType::GAUSSIAN ||
           n.get_type() == evolution::NodeType::LINEAR ||
           n.get_type() == evolution::NodeType::SIGMOID ||
           n.get_type() == evolution::NodeType::ABS))
        adjustable.push_back(n.get_id());
    if (!adjustable.empty()) {
      int id = adjustable[r.index(int(adjustable.size()))];
      const auto *n = g.cppn->get_node(id);
      const bool offset = n->get_type() == evolution::NodeType::ABS ||
                          n->get_type() == evolution::NodeType::SIGMOID;
      float changed = offset ? float(std::clamp(n->get_weight() + r.normal() * scale, -16., 16.))
                             : float(std::clamp(std::max(.01, std::abs(double(n->get_weight()))) *
                                                    std::exp(r.normal() * m.gain_step),
                                                .01, 16.));
      if (!offset && n->get_weight() < 0)
        changed = -changed;
      g.cppn->edit_node(id, changed, n->get_type());
    }
  }
}
}
// forced: -1 all branches, 0 body plan, 1 cell properties, 2..4 connections; -2 draws here.
void mutate_cppn(Genome &g, Rng &r, double scale, bool develop, const MutationRates &m,
                 int forced) {
  {
    std::lock_guard<std::mutex> guard(genetics);
    g.cppn = evolution::Genome::copy_genome(g.cppn);
    evolution::seed(std::uint32_t(r.engine()));
    if (m.step_evolution >= .5 && scale > 0)
      g.mutation_step = std::clamp(g.mutation_step * std::exp(r.normal() * .1), .5, 2.);
    const int branch = forced >= -1 ? forced
                       : m.branch_mutation < .5 || r.uniform() < m.broad_mutation
                           ? -1
                           : r.index(cppn::output::branches);
    mutate_cppn_weights(g, r, scale, m, branch);
    std::vector<int> candidates;
    for (const auto &c : g.cppn->get_connection_genes())
      if (c.get_enabled() &&
          (branch < 0 || g.cppn->get_node(c.get_target())->get_branch() == branch))
        candidates.push_back(c.get_innovation_number());
    const double k = std::min(1., scale / .15);
    if (r.uniform() < m.add_node * k && !candidates.empty() && g.cppn->nodes() < 1024 &&
        g.cppn->get_connection_genes().size() < 16382)
      g.cppn->split_connection(candidates[r.index(int(candidates.size()))]);
    if (r.uniform() < m.duplicate * k && g.cppn->nodes() < 1024) {
      std::vector<int> nodes;
      for (const auto &n : g.cppn->get_node_genes())
        if (n.get_role() == evolution::NodeRole::Hidden &&
            (branch < 0 || n.get_branch() == branch)) {
          std::size_t links = 0, outgoing = 0;
          for (const auto &c : g.cppn->get_connection_genes()) {
            links += c.get_target() == n.get_id() || c.get_source() == n.get_id();
            outgoing += c.get_source() == n.get_id();
          }
          if (outgoing && g.cppn->get_connection_genes().size() + links <= 16384)
            nodes.push_back(n.get_id());
        }
      if (!nodes.empty()) {
        const int root = nodes[r.index(int(nodes.size()))];
        const auto selected =
            r.uniform() < .5 ? duplicate_region(*g.cppn, root, r) : std::vector<int>{root};
        g.cppn->duplicate_subgraph(selected, nullptr, m.neutral_structure >= .5);
      }
    }
    auto add_connection = [&](bool lateral) {
      std::vector<int> sources, targets;
      for (const auto &n : g.cppn->get_node_genes()) {
        const bool odd = n.get_id() == 0 || n.get_id() == 2 || n.get_id() == 7;
        if (n.get_role() != evolution::NodeRole::Output && (odd == lateral))
          sources.push_back(n.get_id());
        if (n.get_role() != evolution::NodeRole::Input && (branch < 0 || n.get_branch() == branch))
          targets.push_back(n.get_id());
      }
      if (sources.empty() || targets.empty())
        return;
      for (int i = 0; i < 24; ++i)
        if (g.cppn->connect(sources[r.index(int(sources.size()))],
                            targets[r.index(int(targets.size()))],
                            m.neutral_structure >= .5 ? 0.f : float(r.normal() * .3)))
          break;
    };
    if (r.uniform() < m.add_connection * k && g.cppn->get_connection_genes().size() < 16384)
      add_connection(false);
    if (r.uniform() < m.lateral_connection && g.cppn->get_connection_genes().size() < 16384)
      add_connection(true);
    if (r.uniform() < m.disable * k && !candidates.empty()) {
      int id = candidates[r.index(int(candidates.size()))];
      g.cppn->edit_connection(id, g.cppn->get_gene(id)->get_weight(), false);
    }
    if (r.uniform() < m.node_edit * k) {
      std::vector<int> nodes;
      for (const auto &n : g.cppn->get_node_genes())
        if ((branch < 0 || n.get_branch() == branch) &&
            n.get_role() != evolution::NodeRole::Input && n.get_id() != g.cppn->inputs() + 1 &&
            !(n.get_id() >= g.cppn->inputs() + 2 && n.get_id() <= g.cppn->inputs() + 6))
          nodes.push_back(n.get_id());
      if (!nodes.empty()) {
        int id = nodes[r.index(int(nodes.size()))];
        auto n = g.cppn->get_node(id);
        g.cppn->edit_node(
            id, float([&] {
              double changed = std::clamp(n->get_weight() + r.normal() * scale, -16., 16.);
              if (n->get_type() == evolution::NodeType::GAUSSIAN && std::abs(changed) < .01)
                changed = std::copysign(.01, changed == 0 ? 1 : changed);
              return changed;
            }()),
            r.uniform() < m.type_change ? founder_types[r.index(int(founder_types.size()))]
                                        : n->get_type());
      }
    }
    if (g.cppn->nodes() > 1024 || g.cppn->get_connection_genes().size() > 16384)
      throw std::length_error("Technical CPPN genotype budget exceeded");
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
  snout_position =
      shape[11] > 0
          ? (shape[0] + shape[1] + std::max(shape[2], .8 * (.28 + .44 * jaw_length)) - shape[10]) /
                shape[11]
          : 1;
  gut_length = g.interface->gut_length;
  blunt_teeth = g.interface->blunt_teeth;
  undulation = g.interface->undulation;

  bladder_capacity = g.interface->capacities[12];
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
  reproduction_.egg_role = g.interface->motor_counts[4] > 0;
}
void cppn_action(Body &b, const Genome &g, const PhysiologyParameters &physiology,
                 bool protected_life) {
  if (!b.perception_.perception_prepared) {
    const auto &binding = *g.interface;
    auto &state = b.perception_;
    state.sensor_buffer.resize(binding.sensory.size());
    if (state.adapted.size() != state.sensor_buffer.size())
      state.adapted.assign(state.sensor_buffer.size(), 0.f);
    const auto frame = prepare_sensory_frame(b, binding.sense_counts[8] > 0 ? gonad_filling(b) : 0);
    for (std::size_t i = 0; i < binding.sensory.size(); ++i) {
      const auto &r = binding.sensory[i];
      state.sensor_buffer[i] =
          adapted_response(state, i, r, anatomical_stimulus(b, r, frame, 0, physiology), true);
    }
  }
  b.perception_.perception_prepared = false;
  b.brain_->set_development(b.hatched ? 1 : 0, !b.hatched);
  b.brain_->step(b.perception_.sensor_buffer, b.hormones_.levels(), b.identity);
  anatomical_action(b, *g.interface, physiology, protected_life);
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
void Body::stimulate_neuron(std::size_t id, float value) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  brain_->stimulate(id, value);
  brain_->refresh_observation();
}
void Body::stimulate_neurons(const std::vector<std::size_t> &ids, float value) {
  if (!brain_)
    throw std::logic_error("brain inactive");
  brain_->stimulate(ids, value);
  brain_->refresh_observation();
}
void Body::advance_probe() {
  if (perception_.probe.remaining > 0)
    --perception_.probe.remaining;
}
void Body::reset_probe() {
  perception_.probe = {};
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
  if (probe.kind < 0 || probe.kind > 2 || !finite(probe.x) || !finite(probe.y) ||
      !finite(probe.energy) || probe.energy < 0 || probe.energy > 1800 || !finite(probe.radius) ||
      probe.radius < .1 || probe.radius > 16 || probe.sense < 0 ||
      probe.sense >= field::SENSE_COUNT || !finite(probe.value) || probe.value < 0 ||
      probe.value > 1 ||
      !std::all_of(probe.color.begin(), probe.color.end(),
                   [&](double x) { return finite(x) && x >= 0 && x <= 3; }) ||
      !std::all_of(probe.scents.begin(), probe.scents.end(),
                   [&](double x) { return finite(x) && x >= 0 && x <= 1; }) ||
      std::accumulate(probe.scents.begin(), probe.scents.end(), 0.) > 1.000001)
    throw std::invalid_argument("Sinnesreiz außerhalb des Bereichs.");
  perception_.probe = probe;
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
