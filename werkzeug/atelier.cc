#include "../src/genome.hh"
#include "../src/ecology.hh"
#include "../src/retina.hh"
#include "../src/receptor_tuning.hh"
#include "../src/eye_geometry.hh"
#include "../src/observations.hh"
#include "../src/body_plan.hh"
#include "../src/simulation_types.hh"
#include "../src/physiology_parameters.hh"
#include "../src/physiology.hh"
#include "field/hormones.hh"
#include "field/functions.hh"
#include "field/development_sites.hh"
#include "atelier_import.hh"
#include "cppn/output_schema.hh"
#include "evolution/constants.hh"
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <tuple>
#include <vector>

// Converts a spatial cell-group plan into an ordinary v019 CPPN. It also exposes the
// developed anatomy and the actual CPPN for the browser's two editing views.
using evolution::NodeType;
using fishsim::Genome;
namespace out = cppn::output;
namespace {
using namespace atelier;

// Numbers in the Atelier's answers carry this many significant digits: the measurements and
// stimulus frames few, the design and the developed fish's report enough to redraw them, the
// diet's curves in between.
constexpr int MEASURE_DIGITS = 4, REPORT_DIGITS = 8, DIET_DIGITS = 6;
// A brain on trial runs as this individual, with its body clock going as in the tank: the clock
// beats its pacemakers, and it runs only while the brain steps with hormone levels.
constexpr std::uint64_t TRIAL_INDIVIDUAL = 1;
// What a substance does in the developed brain: the brain runs `steps` steps without sensory input
// and without learning, once with no hormone and once with `level` of the substance (or at
// maturity `level` instead of `maturity` for the maturity substance). Reported: per cell group the
// mean change of activity and its dead cells, per organ drive (organ_drive order) the change,
// and the change of the body's growth (occupancy of its growth receptor).
void measure(const Genome &g, const std::vector<Group> &groups, int substance, float level,
             float maturity, int steps) {
  ensure(substance >= 0 && substance <= field::HORMONES && between(level, 0, 1) &&
             between(maturity, 0, 1) && steps > 0 && steps <= studio_plan::max_measure_steps,
         "invalid measurement request");
  const auto &t = *g.blueprint;
  std::vector<int> assignment(t.neurons.size(), -1);
  std::size_t sensors = 0;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    sensors += t.neurons[i].functions.sensory() > 0;
    for (std::size_t k = 0; k < groups.size(); ++k)
      if (groups[k].contains(t.neurons[i].location)) {
        assignment[i] = int(k);
        break;
      }
  }
  field::Network base(g.blueprint), variant(g.blueprint);
  field::Hormones none{}, dosed{};
  const bool maturing = substance == field::HORMONES;
  if (!maturing)
    dosed[std::size_t(substance)] = level;
  base.set_maturity(maturity);
  variant.set_maturity(maturing ? level : maturity);
  const std::vector<float> inputs(sensors, 0.f);
  for (auto *n : {&base, &variant})
    n->set_plasticity(false);
  for (int step = 0; step < steps; ++step) {
    base.step(inputs, none, TRIAL_INDIVIDUAL);
    variant.step(inputs, dosed, TRIAL_INDIVIDUAL);
  }
  std::vector<double> change(groups.size()), members(groups.size());
  std::vector<int> dead(groups.size());
  for (std::size_t i = 0; i < assignment.size(); ++i)
    if (const int k = assignment[i]; k >= 0) {
      change[std::size_t(k)] += variant.state()[i] - base.state()[i];
      ++members[std::size_t(k)];
      dead[std::size_t(k)] += variant.dead(i) && !base.dead(i);
    }
  const auto before = fishsim::continuous_organs(base.state(), *g.interface),
             after = fishsim::continuous_organs(variant.state(), *g.interface);
  std::cout << std::setprecision(MEASURE_DIGITS) << "{\"groups\":[";
  for (std::size_t k = 0; k < groups.size(); ++k)
    std::cout << (k ? "," : "") << change[k] / std::max(1., members[k]);
  std::cout << "],\"dead\":[";
  for (std::size_t k = 0; k < groups.size(); ++k)
    std::cout << (k ? "," : "") << dead[k];
  std::cout << "],\"organs\":[";
  for (std::size_t o = 0; o < before.values.size(); ++o)
    std::cout << (o ? "," : "")
              << ((after.present >> o) & 1 ? after.values[o] - before.values[o] : 0.);
  const auto &growth = t.growth_receptor;
  std::cout << "],\"growth\":" << growth.occupancy(dosed) - growth.occupancy(none)
            << ",\"substance\":" << substance << ",\"level\":" << level << "}\n";
}
std::string json(const std::string &s) {
  std::ostringstream out;
  out << '"';
  for (unsigned char c : s) {
    if (c == '"' || c == '\\')
      out << '\\' << char(c);
    else if (c < 32)
      out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << unsigned(c) << std::dec;
    else
      out << char(c);
  }
  return out.str() + '"';
}
void probe(const Genome &g, const std::vector<Group> &groups, const std::vector<int> &requested,
           int steps) {
  ensure(!requested.empty() && requested.size() <= groups.size() && steps > 0 &&
             steps <= studio_plan::max_probe_steps,
         "invalid stimulus request");
  std::vector<char> selected(groups.size(), 0);
  for (int group : requested) {
    ensure(group >= 0 && group < int(groups.size()) && !selected[std::size_t(group)],
           "invalid stimulus group");
    selected[std::size_t(group)] = 1;
  }
  const auto &t = *g.blueprint;
  std::vector<int> assignment(t.neurons.size(), -1);
  std::vector<std::size_t> stimulated;
  std::size_t sensorCount = 0;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &n = t.neurons[i];
    if (n.functions.sensory() > 0)
      ++sensorCount;
    for (std::size_t k = 0; k < groups.size(); ++k)
      if (groups[k].contains(n.location)) {
        assignment[i] = int(k);
        break;
      }
    if (assignment[i] >= 0 && selected[std::size_t(assignment[i])] && n.functional)
      stimulated.push_back(i);
  }
  ensure(!stimulated.empty(), "selected organ has no developed active cells");
  // Both brains run as in the tank, with the body clock going but no hormone and no learning, so
  // the stimulus teaches nothing and the pacemakers beat in both alike.
  field::Network network(g.blueprint), baseline(g.blueprint);
  for (auto *n : {&network, &baseline})
    n->set_plasticity(false);
  const field::Hormones calm{};
  network.stimulate(stimulated, 1.0f, 1);
  std::cout << std::setprecision(MEASURE_DIGITS) << "{\"frames\":[";
  const std::vector<float> inputs(sensorCount, 0.f);
  for (int frame = 0; frame <= steps; ++frame) {
    if (frame) {
      network.step(inputs, calm, TRIAL_INDIVIDUAL);
      baseline.step(inputs, calm, TRIAL_INDIVIDUAL);
    }
    if (frame)
      std::cout << ',';
    std::vector<float> strength(groups.size());
    const auto &activity = network.state();
    const auto &unperturbed = baseline.state();
    for (std::size_t i = 0; i < activity.size(); ++i) {
      const int group = assignment[i];
      if (group < 0)
        continue;
      const float delta = activity[i] - unperturbed[i];
      float &strongest = strength[std::size_t(group)];
      if (std::abs(delta) > std::abs(strongest))
        strongest = delta;
    }
    std::cout << '[';
    for (std::size_t j = 0; j < strength.size(); ++j) {
      if (j)
        std::cout << ',';
      std::cout << strength[j];
    }
    std::cout << ']';
  }
  std::cout << "],\"sources\":[";
  for (std::size_t i = 0; i < requested.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << requested[i];
  }
  std::cout << "],\"stimulated\":" << stimulated.size() << "}\n";
}
// The Atelier's look through the eyes: the grown fish alone in open water, the Aquarium's sight
// probe at a bearing (degrees, right positive) and distance (world units) from the view origin of
// one side, in a fully saturated light of a hue on the interface's hue circle, and what the eyes
// take of it, sensed and written exactly as the Aquarium does for an inspected fish. No brain is
// involved.
struct SightScene {
  int side = 0;
  double bearing = 0, distance = 0, radius = fishsim::sensory_probe::radius, hue = 0;
};
// The example a new genome may also be: the Aquarium's hand-built start fish, as its runs begin.
constexpr const char *START_FISH = "start";
// The innovation draws of the Atelier's genomes start alike in every run.
constexpr std::uint64_t ATELIER_RUN_SEED = 42;
// A CPPN edit keeps weights and parameters within ±CPPN_EDIT_LIMIT and the network below
// CPPN_MOST_NODES nodes.
constexpr float CPPN_EDIT_LIMIT = 16;
constexpr int CPPN_MOST_NODES = 1024;
// The sight tank's seed: any open water serves.
constexpr std::uint64_t SIGHT_TANK_SEED = 719;
SightScene read_sight(std::istream &in) {
  SightScene scene;
  const double half_turn = fishsim::degrees(fishsim::PI);
  ensure(bool(in >> scene.side >> scene.bearing >> scene.distance >> scene.radius >> scene.hue) &&
             (scene.side == 0 || scene.side == 1) &&
             between(scene.bearing, -half_turn, half_turn) &&
             between(scene.distance, 0, fishsim::EnvironmentParameters{}.vision_range) &&
             between(scene.radius, fishsim::PROBE_MIN_RADIUS, fishsim::PROBE_MAX_RADIUS) &&
             between(scene.hue, 0, 2 * fishsim::tuning::hue_half_circle),
         "invalid sight scene");
  return scene;
}
// The Atelier's probes of the other senses, without a brain: the grown fish resting in open water,
// as for sight, given one stimulus at a bearing (degrees, towards side +1 positive) from its
// heading. A scent source of one odor kind (`scent`) `distance` body radii away; a touch of
// `strength` against the skin; water streaming against the side of the body facing that bearing
// at `strength` world units a step; or a wound there taking `strength` of the fish's health. Each
// group's sensory cells answer as the engine senses them.
struct SenseScene {
  int kind = 0, scent = 0;
  double bearing = 0, distance = 0, strength = 0;
};
namespace sense_scene {
constexpr int smell = 1, touch = 2, flow = 3, wound = 4;
}
// Probes reach at most SENSE_SCENE_REACH body radii and SENSE_SCENE_STRENGTH strong.
constexpr double SENSE_SCENE_REACH = 40, SENSE_SCENE_STRENGTH = 20;
SenseScene read_sense_scene(std::istream &in) {
  SenseScene scene;
  const double half_turn = fishsim::degrees(fishsim::PI);
  ensure(
      bool(in >> scene.kind >> scene.bearing >> scene.distance >> scene.strength >> scene.scent) &&
          scene.kind >= sense_scene::smell && scene.kind <= sense_scene::wound &&
          between(scene.bearing, -half_turn, half_turn) &&
          between(scene.distance, 0, SENSE_SCENE_REACH) &&
          between(scene.strength, 0, SENSE_SCENE_STRENGTH) && scene.scent >= 0 &&
          scene.scent < fishsim::odor_kind::count,
      "invalid sense scene");
  return scene;
}
void sense_report(const field::Substrate &t,
                  const std::shared_ptr<const fishsim::BrainInterface> &interface,
                  const std::vector<Group> &groups, const SenseScene &scene) {
  fishsim::Ecosystem tank(SIGHT_TANK_SEED);
  fishsim::Body body;
  body.x = body.y = fishsim::SIZE / 2;
  body.organ_mass = interface->organ_mass;
  body.tissue = fishsim::BODY_TISSUE;
  const double bearing = fishsim::radians(scene.bearing), radius = fishsim::body_radius(body);
  const fishsim::PhysiologyParameters physiology{};
  std::vector<float> answers(interface->sensory.size(), 0);
  if (scene.kind == sense_scene::flow) {
    // The lateral line's frame with the water streaming from the bearing against the corners
    // that face it, the more the more they face it and not at all behind the body from it: a
    // cell sampling the facing corners alone feels it fully, one sampling all four less, one on
    // the far side not at all.
    fishsim::SensoryFrame frame;
    fishsim::LateralSamples<double> facing{};
    double most = 0;
    for (int k = 0; k < fishsim::LATERAL_CORNERS; ++k) {
      const double along = k & 1 ? fishsim::LATERAL_ALONG : -fishsim::LATERAL_ALONG,
                   across = k & 2 ? fishsim::LATERAL_ACROSS : -fishsim::LATERAL_ACROSS;
      facing[k] = std::max(0., std::cos(std::atan2(across, along) - bearing));
      most = std::max(most, facing[k]);
    }
    for (int k = 0; k < fishsim::LATERAL_CORNERS; ++k)
      frame.relative[k] = {scene.strength * std::cos(bearing) * facing[k] / most,
                           scene.strength * std::sin(bearing) * facing[k] / most};
    for (std::size_t i = 0; i < answers.size(); ++i) {
      const auto &r = interface->sensory[i];
      if (r.dominant_sense() == field::Flow)
        answers[i] = fishsim::receptor_response(
            r, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
    }
  } else {
    if (scene.kind == sense_scene::smell) {
      fishsim::SensoryProbe probe;
      probe.kind = fishsim::probe_kind::smell;
      probe.remaining = 1;
      probe.x = body.x + scene.distance * radius * std::cos(bearing);
      probe.y = body.y + scene.distance * radius * std::sin(bearing);
      probe.scents.fill(0);
      probe.scents[scene.scent] = 1;
      body.set_probe(probe);
    } else if (scene.kind == sense_scene::touch)
      fishsim::record_touch(body, std::cos(bearing), std::sin(bearing), scene.strength);
    else
      fishsim::harm_body(body, scene.strength, fishsim::death_reason::injury, bearing);
    fishsim::Genome g;
    g.interface = interface;
    fishsim::sense_generated(body, g, tank.field, nullptr, false, physiology);
    const auto &buffer = body.perception().sensor_buffer;
    for (std::size_t i = 0; i < answers.size() && i < buffer.size(); ++i)
      answers[i] = buffer[i];
  }
  // Each group's answer: the mean over its cells of the senses the probe stirs.
  const auto stirred = [&](int sense) {
    return scene.kind == sense_scene::smell   ? sense == field::Odor
           : scene.kind == sense_scene::flow  ? sense == field::Flow
           : scene.kind == sense_scene::touch ? sense == field::Touch
                                              : sense == field::Damage;
  };
  std::cout << ",\"senseProbe\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    double sum = 0;
    int count = 0;
    for (std::size_t k = 0; k < answers.size(); ++k) {
      const auto &r = interface->sensory[k];
      if (!stirred(r.dominant_sense()) || !groups[i].contains(t.neurons[r.neuron].location))
        continue;
      sum += answers[k] / std::max(1e-9f, r.senses[r.dominant_sense()]);
      ++count;
    }
    std::cout << (i ? "," : "");
    if (count)
      std::cout << sum / count;
    else
      std::cout << "null";
  }
  std::cout << ']';
}
void sight_report(const field::Substrate &t,
                  const std::shared_ptr<const fishsim::BrainInterface> &interface,
                  const std::vector<Group> &groups, const SightScene &scene) {
  fishsim::Ecosystem tank(SIGHT_TANK_SEED);
  fishsim::Body body;
  body.x = body.y = fishsim::SIZE / 2;
  body.organ_mass = interface->organ_mass;
  body.tissue = fishsim::BODY_TISSUE;
  const auto eye = fishsim::visual_origins(body, *interface, tank.field)[scene.side];
  const double bearing = fishsim::radians(scene.bearing);
  fishsim::SensoryProbe probe;
  probe.kind = fishsim::probe_kind::sight;
  probe.remaining = 1;
  probe.x = (eye.present ? eye.x : body.x) + scene.distance * std::cos(bearing);
  probe.y = (eye.present ? eye.y : body.y) + scene.distance * std::sin(bearing);
  probe.radius = scene.radius;
  probe.color = fishsim::hue_light(scene.hue);
  body.set_probe(probe);
  body.set_inspection(true, true, -1);
  fishsim::Genome g;
  g.interface = interface;
  fishsim::sense_generated(body, g, tank.field, nullptr, false, tank.physiology());
  const auto &state = body.perception();
  std::cout << ",\"sight\":{";
  fishsim::write_sight(std::cout, state);
  std::cout << ",\"samples\":[";
  fishsim::write_visual_samples(std::cout, state);
  // The light and near-sense cells as the brain layout lists them, and the design group of each.
  std::vector<int> owners;
  std::cout << "],\"receptors\":[";
  for (std::size_t i = 0; i < interface->sensory.size(); ++i) {
    const auto &r = interface->sensory[i];
    if (!r.visual())
      continue;
    std::cout << (owners.empty() ? "" : ",");
    fishsim::write_receptor(std::cout, r, t.neurons[r.neuron], state.sensor_buffer[i]);
    const auto &location = t.neurons[r.neuron].location;
    const auto owner = std::find_if(groups.begin(), groups.end(),
                                    [&](const Group &g) { return g.contains(location); });
    owners.push_back(owner == groups.end() ? -1 : int(owner - groups.begin()));
  }
  std::cout << "],\"groups\":[";
  for (std::size_t i = 0; i < owners.size(); ++i)
    std::cout << (i ? "," : "") << owners[i];
  std::cout << "]}";
}
// Light cells show what the engine makes of their tuning: for a full light of each of LIGHT_HUES
// hues their excitation and opponent inhibition, and for their best hue the response at
// LIGHT_LEVELS brightnesses, log-spaced from LIGHT_DIMMEST to full light.
constexpr int LIGHT_HUES = 72, LIGHT_LEVELS = 48;
constexpr double LIGHT_DIMMEST = 1e-4;
// Other senses: SENSE_LEVELS stimuli; adaptation to a stimulus ADAPT_HELD times the half answer
// shown over ADAPT_SPAN time constants.
constexpr int SENSE_LEVELS = 48;
// Directions around the body at which the design view gives how the spines shield it.
constexpr int SPINE_DIRECTIONS = 64;
// Directions water may stream from against the lateral line.
constexpr int LATERAL_DIRECTIONS = 48;
// The fish's colour range is reported at COLOUR_STEPS dispersions of its pigment.
constexpr int COLOUR_STEPS = 9;
constexpr double ADAPT_HELD = 4, ADAPT_SPAN = 4;
// What the engine makes of a substrate's body and where its cells and groups lie. The
// developed fish and the design view share it; developed adds what only development makes
// (hormone receptors, nerve classes). Gives each cell's group, -1 outside every group.
std::vector<int> anatomy_report(const field::Substrate &t,
                                const std::shared_ptr<const fishsim::BrainInterface> &interface,
                                const std::vector<Group> &groups, bool developed) {
  const auto &a = *interface;
  // What each light group answers to, with the same spectrum, opponency and threshold as in
  // the retina; null for other groups. half: the brightness of half response.
  std::cout << ",\"light\":[";
  const double opponent = fishsim::EnvironmentParameters{}.vision_opponent;
  for (std::size_t i = 0; i < groups.size(); ++i) {
    const fishsim::BrainInterface::Receptor *cell = nullptr;
    for (const auto &r : a.sensory)
      if (r.channel == field::Light && groups[i].contains(t.neurons[r.neuron].location)) {
        cell = &r;
        break;
      }
    std::cout << (i ? "," : "");
    if (!cell) {
      std::cout << "null";
      continue;
    }
    // Excitation, and inhibition at full opponency: the balance at the cell's opponency lies
    // in between, linearly.
    auto opponent_cell = *cell;
    opponent_cell.opponency = 1;
    std::array<double, LIGHT_HUES> excitation{}, inhibition{}, balance{};
    for (int k = 0; k < LIGHT_HUES; ++k) {
      const auto light = fishsim::hue_light(2. * fishsim::tuning::hue_half_circle * k / LIGHT_HUES);
      excitation[k] = fishsim::spectral_balance(*cell, light, 0);
      inhibition[k] = excitation[k] - fishsim::spectral_balance(opponent_cell, light, opponent);
      balance[k] = fishsim::spectral_balance(*cell, light, opponent);
    }
    const auto best = std::max_element(balance.begin(), balance.end()) - balance.begin();
    const auto best_light =
        fishsim::hue_light(2. * fishsim::tuning::hue_half_circle * best / LIGHT_HUES);
    std::cout << "{\"excitation\":[";
    for (int k = 0; k < LIGHT_HUES; ++k)
      std::cout << (k ? "," : "") << excitation[k];
    std::cout << "],\"inhibition\":[";
    for (int k = 0; k < LIGHT_HUES; ++k)
      std::cout << (k ? "," : "") << inhibition[k];
    std::cout << "],\"response\":[";
    for (int k = 0; k < LIGHT_LEVELS; ++k) {
      auto light = best_light;
      for (auto &c : light)
        c *= std::pow(LIGHT_DIMMEST, 1 - double(k) / (LIGHT_LEVELS - 1));
      std::cout << (k ? "," : "")
                << fishsim::sensory_response(fishsim::spectral_drive(*cell, light, opponent),
                                             cell->response_threshold);
    }
    const double drive = fishsim::spectral_drive(*cell, best_light, opponent);
    std::cout << "],\"half\":";
    if (drive > 0)
      std::cout << cell->response_threshold / drive;
    else
      std::cout << "null";
    std::cout << '}';
  }
  std::cout << "],\"lightDimmest\":" << LIGHT_DIMMEST;
  // What each other sensory group answers, as receptor_response computes it: over the stimulus
  // (intensity senses on a log axis from LIGHT_DIMMEST, bounded ones from 0 to 1) with the
  // stimulus of half the answer; for adapting senses also the answer to a stimulus held at
  // ADAPT_HELD times that half, step by step over ADAPT_SPAN time constants. Null for light cells
  // and for groups without sensory cells.
  std::cout << ",\"senses\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    const fishsim::BrainInterface::Receptor *cell = nullptr;
    for (const auto &r : a.sensory)
      if (!r.visual() && groups[i].contains(t.neurons[r.neuron].location)) {
        cell = &r;
        break;
      }
    std::cout << (i ? "," : "");
    if (!cell) {
      std::cout << "null";
      continue;
    }
    const int sense = cell->dominant_sense();
    const bool intensity = fishsim::intensity_sense(sense);
    const auto stimulus = [&](int k) {
      const double f = double(k) / (SENSE_LEVELS - 1);
      return intensity ? std::pow(LIGHT_DIMMEST, 1 - f) : f;
    };
    const double half = intensity ? cell->response_threshold : cell->threshold;
    std::cout << "{\"intensity\":" << (intensity ? "true" : "false") << ",\"response\":[";
    for (int k = 0; k < SENSE_LEVELS; ++k)
      std::cout << (k ? "," : "")
                << fishsim::receptor_response(*cell, stimulus(k)) / cell->senses[sense];
    std::cout << "],\"half\":" << half << ",\"adapt\":";
    if (fishsim::adapting_sense(sense) && cell->adaptation_rate > 0) {
      const double held = ADAPT_HELD * half, steps = 1 / cell->adaptation_rate;
      const int count = int(std::ceil(ADAPT_SPAN * steps));
      double mean = 0;
      std::cout << "{\"steps\":" << steps << ",\"held\":" << held << ",\"response\":[";
      for (int k = 0; k <= count; ++k) {
        std::cout << (k ? "," : "")
                  << fishsim::receptor_response(*cell, held, mean) / cell->senses[sense];
        mean += (held - mean) * cell->adaptation_rate;
      }
      std::cout << "]}";
    } else
      std::cout << "null";
    std::cout << '}';
  }
  std::cout << ']';
  // What each group's pressure cells measure, as the engine binds them to the nearest organ
  // (fishsim::PressureSource: the gut, the eggs, the sperm, the bladder or the body's shape); -1
  // for groups without pressure cells.
  std::cout << ",\"pressure\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    int kind = -1;
    for (const auto &r : a.sensory)
      if (r.pressure_kind >= 0 && groups[i].contains(t.neurons[r.neuron].location)) {
        kind = r.pressure_kind;
        break;
      }
    std::cout << (i ? "," : "") << kind;
  }
  std::cout << ']';
  // Where each touch, injury and lateral-line cell feels, per group: for each cell its direction
  // around the body (radians, 0 ahead, positive towards side +1) and the half width of its
  // angular kernel. Touch and injury cells weigh the body's sectors by the kernel; lateral-line
  // cells answer to water passing them along their direction.
  std::cout << ",\"felt\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    std::cout << (i ? "," : "") << '[';
    bool first = true;
    for (const auto &r : a.sensory) {
      const int sense = r.dominant_sense();
      if ((sense != field::Touch && sense != field::Damage && sense != field::Flow) ||
          !groups[i].contains(t.neurons[r.neuron].location))
        continue;
      std::cout << (first ? "" : ",") << '[' << r.mechanical_angle << ','
                << fishsim::contact_width(r.spatial_width) << ']';
      first = false;
    }
    std::cout << ']';
  }
  std::cout << ']';
  // Where the engine lays each zone along the body ([front, extent], the body running from 1 at
  // the snout to -1), so the Atelier can find the engine's directions on its frame.
  std::cout << ",\"zones\":[";
  {
    const auto spans = field::zone_spans(t.neurons);
    for (std::size_t z = 0; z < spans.size(); ++z)
      std::cout << (z ? "," : "") << '[' << spans[z].front << ',' << spans[z].extent << ']';
  }
  std::cout << ']';
  // How well the spines shield the body at SPINE_DIRECTIONS directions around it (the middles of
  // equal arcs from straight behind, 0 ahead, positive towards side +1), as the engine's local
  // defence finds it with the spines at rest (as high as the defence capacity holds them) and
  // fully raised; whose spines stand there: the group spreading the most into the body sector of
  // each direction, -1 where none does; and the direction each group's spines centre on, null
  // for groups without spines.
  {
    const auto density = fishsim::spine_density(a, t);
    std::vector<std::array<double, fishsim::BODY_SECTORS>> spread(groups.size());
    std::vector<std::optional<double>> aims(groups.size());
    for (const auto &e : a.effectors)
      if (e.port == fishsim::organ_port::defense)
        for (std::size_t i = 0; i < groups.size(); ++i)
          if (groups[i].contains(t.neurons[e.neuron].location)) {
            fishsim::spread_spines(spread[i], e, t);
            if (!aims[i])
              aims[i] = fishsim::spine_aim(e, t);
          }
    std::cout << ",\"spineAims\":[";
    for (std::size_t i = 0; i < groups.size(); ++i) {
      std::cout << (i ? "," : "");
      if (aims[i])
        std::cout << *aims[i];
      else
        std::cout << "null";
    }
    std::cout << ']';
    const fishsim::PhysiologyParameters physiology{};
    const double rest = fishsim::resting_spine_height(a.capacities[fishsim::organ_port::defense],
                                                      physiology.resting_spines,
                                                      physiology.resting_spines_half),
                 raised = std::max(rest, physiology.spine_max);
    const auto direction = [](int k) {
      return -fishsim::PI + (k + .5) * 2 * fishsim::PI / SPINE_DIRECTIONS;
    };
    for (const auto &[name, defense] : {std::pair{"spinesRest", rest}, {"spinesRaised", raised}}) {
      std::cout << ",\"" << name << "\":[";
      for (int k = 0; k < SPINE_DIRECTIONS; ++k)
        std::cout << (k ? "," : "") << fishsim::local_defense(defense, density, direction(k));
      std::cout << ']';
    }
    std::cout << ",\"spineGroups\":[";
    for (int k = 0; k < SPINE_DIRECTIONS; ++k) {
      const int sector =
          int(std::lround(fishsim::sector_position(direction(k)))) % fishsim::SECTOR_COUNT;
      int owner = -1;
      for (std::size_t i = 0; i < groups.size(); ++i)
        if (spread[i][sector] > 0 && (owner < 0 || spread[i][sector] > spread[owner][sector]))
          owner = int(i);
      std::cout << (k ? "," : "") << owner;
    }
    std::cout << ']';
  }
  // What each lateral-line group feels, null for other groups: how much its cells weigh the
  // water at the lateral line's four corners (ahead and behind, towards side -1 and +1, in the
  // engine's order) and how strongly water streaming against the resting fish from each of
  // LATERAL_DIRECTIONS directions (the middles of equal arcs from straight behind, 0 ahead,
  // positive towards side +1) stirs them, as the engine's lateral line reckons it, against
  // the direction that stirs them most.
  std::cout << ",\"lateral\":[";
  {
    const fishsim::Body still;
    const fishsim::PhysiologyParameters physiology{};
    for (std::size_t i = 0; i < groups.size(); ++i) {
      fishsim::LateralSamples<double> weights{};
      std::array<double, LATERAL_DIRECTIONS> tuning{};
      int count = 0;
      for (const auto &r : a.sensory) {
        if (r.dominant_sense() != field::Flow || !groups[i].contains(t.neurons[r.neuron].location))
          continue;
        ++count;
        const auto w = fishsim::lateral_weights(r);
        for (int k = 0; k < fishsim::LATERAL_CORNERS; ++k)
          weights[k] += w[k];
        std::array<double, LATERAL_DIRECTIONS> stirred{};
        for (int d = 0; d < LATERAL_DIRECTIONS; ++d) {
          const double from = -fishsim::PI + (d + .5) * 2 * fishsim::PI / LATERAL_DIRECTIONS;
          fishsim::SensoryFrame frame;
          for (auto &flow : frame.relative)
            flow = {std::cos(from), std::sin(from)};
          stirred[d] = fishsim::anatomical_stimulus(still, r, frame, 0, physiology);
        }
        const double most = *std::max_element(stirred.begin(), stirred.end());
        for (int d = 0; d < LATERAL_DIRECTIONS; ++d)
          tuning[d] += most > 0 ? stirred[d] / most : 0;
      }
      std::cout << (i ? "," : "");
      if (!count) {
        std::cout << "null";
        continue;
      }
      std::cout << "{\"weights\":[";
      for (int k = 0; k < fishsim::LATERAL_CORNERS; ++k)
        std::cout << (k ? "," : "") << weights[k] / count;
      std::cout << "],\"tuning\":[";
      for (int d = 0; d < LATERAL_DIRECTIONS; ++d)
        std::cout << (d ? "," : "") << tuning[d] / count;
      std::cout << "]}";
    }
  }
  std::cout << ']';
  // The grown fish's radius in world units, and how far it sees in body radii: the Atelier
  // draws its fields that deep and its sight probe at that scale.
  const double radius = fishsim::structural_radius(fishsim::BODY_TISSUE, a.organ_mass);
  std::cout << ",\"bodyRadius\":" << radius
            << ",\"visionDepth\":" << fishsim::EnvironmentParameters{}.vision_range / radius;
  // Where each eye looks from, in body radii along the body and across it (null without one):
  // the design view's fields and its sight probe start there.
  std::cout << ",\"eyePlaces\":[";
  for (int side = 0; side < fishsim::EYES; ++side) {
    const auto place = fishsim::eye_view_place(a, fishsim::EnvironmentParameters{}, side);
    std::cout << (side ? "," : "");
    if (place)
      std::cout << '[' << (*place)[0] << ',' << (*place)[1] << ']';
    else
      std::cout << "null";
  }
  std::cout << ']';
  std::cout << ",\"eyeIntervals\":[";
  for (std::size_t side = 0; side < a.eye_intervals.size(); ++side) {
    if (side)
      std::cout << ',';
    std::cout << '[';
    bool intervalFirst = true;
    for (const auto &interval : a.eye_intervals[side]) {
      if (!intervalFirst)
        std::cout << ',';
      intervalFirst = false;
      std::cout << '[' << interval.first << ',' << interval.second << ']';
    }
    std::cout << ']';
  }
  // Developed retinal receptors are attached to their own placed group. An eye with
  // several centers keeps one physical origin and unions exactly those visual rays.
  std::vector<std::vector<std::pair<float, float>>> eye_groups(groups.size());
  for (const auto &receptor : a.sensory) {
    if (!receptor.visual() || !t.neurons[receptor.neuron].functional)
      continue;
    const auto &location = t.neurons[receptor.neuron].location;
    for (std::size_t i = 0; i < groups.size(); ++i)
      if (groups[i].contains(location)) {
        eye_groups[i].push_back({receptor.view_left, receptor.view_right});
        break;
      }
  }
  std::cout << "],\"eyeGroups\":[";
  for (std::size_t i = 0; i < eye_groups.size(); ++i) {
    if (i)
      std::cout << ',';
    auto &intervals = eye_groups[i];
    std::sort(intervals.begin(), intervals.end());
    std::vector<std::pair<float, float>> merged;
    for (const auto &interval : intervals)
      if (!merged.empty() && interval.first <= merged.back().second)
        merged.back().second = std::max(merged.back().second, interval.second);
      else
        merged.push_back(interval);
    std::cout << '[';
    for (std::size_t j = 0; j < merged.size(); ++j) {
      if (j)
        std::cout << ',';
      std::cout << '[' << merged[j].first << ',' << merged[j].second << ']';
    }
    std::cout << ']';
  }
  std::cout << "],\"fins\":[";
  for (std::size_t i = 0; i < a.fins.size(); ++i) {
    if (i)
      std::cout << ',';
    const auto &fin = a.fins[i];
    std::cout << "{\"cells\":" << fin.cells << ",\"strength\":" << fin.strength
              << ",\"x\":" << fin.x << ",\"y\":" << fin.y << ",\"spread\":" << fin.spread << '}';
  }
  std::cout << "],\"anatomy\":[";
  for (std::size_t i = 0; i < a.anatomy.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << a.anatomy[i];
  }
  const auto &growth = t.growth_receptor;
  std::cout << "],\"growth\":{\"sensitivity\":" << growth.sensitivity << ",\"half\":" << growth.half
            << ",\"steepness\":" << growth.steepness << ",\"affinity\":[";
  for (int k = 0; k < field::HORMONES; ++k)
    std::cout << (k ? "," : "") << growth.affinity[k];
  // The fish's colour as the engine paints it: its skin without pigment; its colours from the
  // pigment gathered to spread fully, at COLOUR_STEPS dispersions alike in all channels; its
  // ground colour, with the pigment as dispersed as its cells' resting activity leaves it, and how
  // far along that range it lies (weighed by what each channel absorbs).
  std::cout << "]},\"colour\":{";
  {
    const fishsim::PhysiologyParameters physiology{};
    const auto rgb = [](const fishsim::Color &c) {
      std::cout << '[' << c[0] << ',' << c[1] << ',' << c[2] << ']';
    };
    const auto painted = [&](const fishsim::Color &dispersion) {
      return fishsim::pigment_color(fishsim::visible_absorption(a, dispersion, physiology),
                                    physiology.pigment_half);
    };
    std::cout << "\"skin\":";
    rgb(fishsim::SKIN_REFLECTANCE);
    std::cout << ",\"range\":[";
    for (int k = 0; k < COLOUR_STEPS; ++k) {
      const double d = double(k) / (COLOUR_STEPS - 1);
      std::cout << (k ? "," : "");
      rgb(painted({d, d, d}));
    }
    const auto rest = fishsim::resting_dispersion(a, t);
    double weight = 0, sum = 0;
    for (int c = 0; c < fishsim::rgb::count; ++c) {
      weight += a.pigment_absorption[c];
      sum += a.pigment_absorption[c] * rest[c];
    }
    std::cout << "],\"rest\":";
    rgb(painted(rest));
    std::cout << ",\"restShare\":" << (weight > 0 ? sum / weight : 0);
  }
  std::cout << '}';
  std::vector<int> group(t.neurons.size(), -1), sites(groups.size()), cells(groups.size());
  // A group's hormone receptors of each effect, summed over its cells: their baseline,
  // sensitivity, half and affinity to the group's substance.
  struct ReceptorSum {
    double baseline = 0, sensitivity = 0, half = 0, affinity = 0;
  };
  using EffectSummary = std::array<ReceptorSum, field::HORMONE_EFFECTS>;
  std::vector<EffectSummary> receptor_sums(groups.size());
  std::vector<std::array<int, field::HORMONE_EFFECTS>> receptor_counts(groups.size());
  // The developed class of a group's nerve cells (field::cell_class): sign, learning mode,
  // rhythm and modulation, summed over its cells.
  struct ClassSum {
    double sign = 0, mode = 0, pace = 0, modulator = 0;
  };
  std::vector<ClassSum> class_sums(groups.size());
  std::vector<int> nerve_cells(groups.size());
  std::map<std::uint32_t, int> copies;
  for (const auto &n : t.neurons)
    ++copies[n.group];
  std::cout << ",\"sites\":[";
  std::map<std::uint32_t, bool> seen;
  bool first = true;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &n = t.neurons[i];
    for (std::size_t j = 0; j < groups.size(); ++j)
      if (groups[j].contains(n.location)) {
        group[i] = int(j);
        break;
      }
    if (group[i] >= 0) {
      ++cells[group[i]];
      if (n.role == field::Role::Nerve) {
        const auto c = field::cell_class(n);
        auto &sum = class_sums[group[i]];
        sum.sign += c.sign;
        sum.mode += c.mode;
        sum.pace += c.pace;
        sum.modulator += c.modulator;
        ++nerve_cells[group[i]];
      }
      if (!seen[n.group])
        ++sites[group[i]];
      for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
        if (!field::hormone_effect_present(n.role, effect))
          continue;
        const auto &r = n.hormone_receptors[effect];
        auto &v = receptor_sums[group[i]][effect];
        ++receptor_counts[group[i]][effect];
        v.baseline += r.baseline;
        v.sensitivity += r.sensitivity;
        v.half += r.half;
        v.affinity += r.affinity[groups[group[i]].receptors[effect].substance];
      }
    }
    if (seen[n.group])
      continue;
    seen[n.group] = true;
    if (!first)
      std::cout << ',';
    first = false;
    int function = -1;
    for (int k = 0; k < field::SENSE_COUNT; ++k)
      if (n.functions.senses[k] > 0)
        function = k;
    for (int k = 0; k < field::MOTOR_COUNT; ++k)
      if (n.functions.motors[k] > 0)
        function = k;
    std::cout << "{\"id\":" << n.id << ",\"zone\":" << n.location.zone
              << ",\"side\":" << n.location.side << ",\"u\":" << n.location.u
              << ",\"v\":" << n.location.v << ",\"w\":" << n.location.w << ",\"x\":" << n.x
              << ",\"y\":" << n.y << ",\"z\":" << n.z << ",\"role\":" << int(n.role)
              << ",\"function\":" << function << ",\"cells\":" << copies[n.group]
              << ",\"group\":" << group[i] << '}';
  }
  std::cout << "],\"groups\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    if (i)
      std::cout << ',';
    std::cout << "{\"name\":" << json(groups[i].name) << ",\"sites\":" << sites[i]
              << ",\"cells\":" << cells[i] << ",\"receptors\":[";
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
      if (effect)
        std::cout << ',';
      const int count = developed ? receptor_counts[i][effect] : 0;
      if (!count) {
        std::cout << "null";
        continue;
      }
      const auto &v = receptor_sums[i][effect];
      std::cout << '[' << count;
      for (double part : {v.baseline, v.sensitivity, v.half, v.affinity})
        std::cout << ',' << part / count;
      std::cout << ']';
    }
    std::cout << "],\"nerve\":";
    if (developed && nerve_cells[i]) {
      const auto &c = class_sums[i];
      std::cout << '[' << c.sign / nerve_cells[i] << ',' << c.mode / nerve_cells[i] << ','
                << c.pace / nerve_cells[i] << ',' << c.modulator / nerve_cells[i] << ']';
    } else
      std::cout << "null";
    std::cout << '}';
  }
  std::cout << ']';
  return group;
}
void design_report(const std::vector<Group> &groups, const std::optional<SightScene> &sight,
                   const std::optional<SenseScene> &sense) {
  const auto t = planned_substrate(groups);
  const auto interface = fishsim::body_interface(t);
  std::cout << std::setprecision(REPORT_DIGITS) << '{';
  std::cout << "\"neurons\":" << t.neurons.size()
            << ",\"limited\":" << (t.resource_limited ? "true" : "false");
  anatomy_report(t, interface, groups, false);
  if (sight)
    sight_report(t, interface, groups, *sight);
  if (sense)
    sense_report(t, interface, groups, *sense);
  std::cout << '}';
}
void report(const Genome &g, const std::vector<Group> &groups, const Plan *plan = nullptr,
            const AddressFit &fit = {}, bool import = false) {
  const auto &t = *g.blueprint;
  std::cout << std::setprecision(REPORT_DIGITS) << '{';
  std::cout << "\"viable\":" << (g.viable() ? "true" : "false")
            << ",\"neurons\":" << t.neurons.size() << ",\"synapses\":" << t.edges.size()
            << ",\"queries\":" << t.queries
            << ",\"limited\":" << (t.resource_limited ? "true" : "false")
            << ",\"diagnostic\":" << json(t.diagnostic);
  if (plan) {
    const auto checked = assess(*plan, g);
    std::cout << ",\"compiler\":{\"ok\":" << (checked.ok() ? "true" : "false")
              << ",\"nodes\":" << g.cppn->nodes()
              << ",\"reserve\":" << fishsim::MAX_GROWING_NODES - g.cppn->nodes()
              << ",\"milliseconds\":" << fit.milliseconds << ",\"evaluations\":" << fit.evaluations
              << ",\"additional\":" << checked.additional << ",\"leakage\":" << checked.leakage
              << ",\"issues\":[";
    bool first = true;
    for (const auto &i : checked.issues) {
      std::cout << (first ? "" : ",") << "{\"code\":" << json(i.code) << ",\"from\":" << i.from
                << ",\"to\":" << i.to << ",\"value\":" << i.value << '}';
      first = false;
    }
    std::cout << "]}";
  }
  const auto &a = *g.interface;
  std::cout << ",\"checks\":{\"sense\":" << (a.sensory_capacity > 0 ? "true" : "false")
            << ",\"swim\":" << (a.capacities[fishsim::organ_port::forward] > 0 ? "true" : "false")
            << ",\"mouth\":" << (a.suction_strength > 0 ? "true" : "false")
            << ",\"eggs\":" << (a.egg_parts[0] > 0 && a.egg_parts[1] > 0 ? "true" : "false")
            << ",\"sperm\":" << (a.sperm_parts[0] > 0 && a.sperm_parts[1] > 0 ? "true" : "false")
            << ",\"connections\":" << (!t.edges.empty() ? "true" : "false")
            << ",\"resources\":" << (!t.resource_limited ? "true" : "false") << '}';
  // The least yolk an egg needs to hatch; an egg laid with less is food.
  std::cout << ",\"eggMinimum\":"
            << fishsim::minimum_egg_energy(g, fishsim::PhysiologyParameters{});
  const auto group = anatomy_report(t, g.interface, groups, true);
  std::cout << ",\"contacts\":[";
  struct ContactBundle {
    int count = 0, positive = 0, negative = 0;
    double weight = 0, positive_weight = 0, negative_weight = 0;
  };
  std::map<std::pair<int, int>, ContactBundle> contacts;
  for (const auto &e : t.edges)
    if (group[e.source] >= 0 && group[e.target] >= 0) {
      auto &v = contacts[{group[e.source], group[e.target]}];
      ++v.count;
      v.weight += e.weight;
      if (e.weight > 0) {
        ++v.positive;
        v.positive_weight += e.weight;
      } else if (e.weight < 0) {
        ++v.negative;
        v.negative_weight += e.weight;
      }
    }
  bool first = true;
  for (const auto &[key, v] : contacts) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << key.first << ',' << key.second << ',' << v.count << ','
              << v.weight / v.count << ',' << v.positive << ',' << v.negative << ','
              << (v.positive ? v.positive_weight / v.positive : 0) << ','
              << (v.negative ? v.negative_weight / v.negative : 0) << ']';
  }
  std::cout << "],\"cppn\":{\"nodes\":[";
  first = true;
  for (const auto &n : g.cppn->get_node_genes()) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << n.get_id() << ',' << int(n.get_type()) << ',' << n.get_weight() << ','
              << int(n.get_role()) << ']';
  }
  std::cout << "],\"links\":[";
  first = true;
  for (const auto &e : g.cppn->get_connection_genes()) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << '[' << e.get_innovation_number() << ',' << e.get_source() << ',' << e.get_target()
              << ',' << e.get_weight() << ',' << (e.get_enabled() ? 1 : 0) << ',' << e.get_port()
              << ']';
  }
  std::cout << "]}";
  if (import) {
    std::cout << ",\"sourcePlan\":";
    write_import(std::cout, import_plan(g));
  }
  std::cout << "}\n";
}
}
// What the gonads hold and how they fill and spawn, with the engine's usual parameters: room per
// motor cell (perCell) up to a ceiling (most), the energy a step moves in at full transfer (fill;
// a gonad's growth cells transfer as their drive A does, A / (1 + A)), when it spawns (eggs at a
// share of their room, sperm from a portion on) and the drive its release cells need (release).
std::string gonad_report() {
  const fishsim::EvolutionParameters evolution{};
  const fishsim::PhysiologyParameters physiology{};
  std::ostringstream out;
  out << "{\"eggs\":{\"perCell\":" << evolution.egg_organ_capacity
      << ",\"most\":" << evolution.egg_capacity << ",\"fill\":" << evolution.egg_fill_rate
      << ",\"spawnShare\":" << fishsim::EGG_FULL_SHARE
      << "},\"sperm\":{\"perCell\":" << fishsim::ORGAN_CELL_CAPACITY
      << ",\"most\":" << physiology.sperm_capacity << ",\"fill\":" << evolution.sperm_fill_rate
      << ",\"spawnLeast\":" << evolution.sperm_portion
      << "},\"release\":" << physiology.stroke_threshold << '}';
  return out.str();
}

// How the traits the muscles shape serve each kind of food, sampled at DIET_SAMPLES values from
// 0 to 1 (suction strength from 0 to DIET_SUCTION): the share of plants, of animal food and of
// sediment a gut of each length takes in and how much longer it holds food than a middle one;
// how much of a bite teeth of each bluntness bring to hard and to soft prey; how wide a jaw of
// each length opens against a middle one and how hard it presses; and how much a gulp draws in
// with suction of each strength against suction of strength 1, one node at full strength (at the
// standard body size and force scale).
constexpr int DIET_SAMPLES = 41;
constexpr double DIET_SUCTION = 4;
std::string diet_report() {
  std::ostringstream out;
  out << std::setprecision(DIET_DIGITS);
  const auto row = [&](const char *name, auto value, bool first = false) {
    out << (first ? "" : ",") << '"' << name << "\":[";
    for (int k = 0; k < DIET_SAMPLES; ++k)
      out << (k ? "," : "") << value(double(k) / (DIET_SAMPLES - 1));
    out << ']';
  };
  using namespace fishsim;
  out << "{\"gut\":{";
  row("plant", [](double l) { return gut_utilisation(l, food_kind::plant); }, true);
  row("meat", [](double l) { return gut_utilisation(l, food_kind::worm); });
  row("sediment", [](double l) { return gut_utilisation(l, food_kind::benthic); });
  row("size", [](double l) { return gut_size(l); });
  out << "},\"teeth\":{";
  row("hard", [](double b) { return tooth_grip(b, true); }, true);
  row("soft", [](double b) { return tooth_grip(b, false); });
  out << "},\"jaw\":{";
  row("aperture", [](double j) { return mouth_share(j) / mouth_share(TRAIT_MIDDLE); }, true);
  row("lever", [](double j) { return jaw_lever(j); });
  out << "},\"suction\":{\"most\":" << DIET_SUCTION << ',';
  row(
      "gulp",
      [](double s) {
        return suction_share(s * DIET_SUCTION, default_max_bite_force) /
               suction_share(1, default_max_bite_force);
      },
      true);
  out << "}}";
  return out.str();
}

int main(int argc, char **argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "sites") {
      std::cout << "{\"sites\":[";
      for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
        const cppn::Point p = field::development_site(i);
        int sensors = 0, motors = 0;
        for (int corner = 0; corner < field::IDENTITY_CORNERS; ++corner)
          for (int variant = 0; variant < field::IDENTITY_VARIANTS; ++variant) {
            const int sense = field::development_function(p, field::Role::Sensor, corner, variant);
            const int motor =
                field::development_function(p, field::Role::Effector, corner, variant);
            if (sense >= 0)
              sensors |= (1 << sense);
            if (motor >= 0)
              motors |= (1 << motor);
          }
        if (i)
          std::cout << ',';
        std::cout << "{\"id\":" << i << ",\"zone\":" << p.zone << ",\"side\":" << p.side
                  << ",\"u\":" << p.u << ",\"v\":" << p.v << ",\"w\":" << p.w
                  << ",\"outer\":" << (field::development_surface(p) ? "true" : "false")
                  << ",\"senses\":" << sensors << ",\"motors\":" << motors << '}';
      }
      std::cout << "],\"cppnInputs\":" << cppn::INPUTS << ",\"cppnOutputs\":" << cppn::OUTPUTS
                << ",\"cppnFunctions\":" << evolution::NODE_TYPES
                << ",\"cppnLimit\":" << CPPN_EDIT_LIMIT << ",\"hormones\":" << field::HORMONES
                << ",\"regulators\":" << field::REGULATORS
                << ",\"bloodSubstances\":" << field::BLOOD_SUBSTANCES
                << ",\"visionRange\":" << fishsim::EnvironmentParameters{}.vision_range
                << ",\"sightRadius\":[" << fishsim::PROBE_MIN_RADIUS << ','
                << fishsim::PROBE_MAX_RADIUS << ']' << ",\"nearDepth\":["
                << fishsim::proximity_depth(0) << ',' << fishsim::proximity_depth(1)
                << ']'

                // How the gut, the teeth, the jaw and suction serve each kind of food, as the
                // engine reckons it (diet_report).
                << ",\"diet\":"
                << diet_report()
                // Where the lateral line samples the water, in body radii along and across.
                << ",\"lateralCorners\":[" << fishsim::LATERAL_ALONG << ','
                << fishsim::LATERAL_ACROSS
                << ']'
                // What the gonads hold and how they fill and spawn (gonad_report).
                << ",\"gonads\":"
                << gonad_report()
                // A planned cell's bias is its threshold times -biasScale; at rest, without
                // input, it is as active as the tanh of its bias.
                << ",\"biasScale\":" << field::Options{}.bias_scale
                << ",\"effects\":" << field::HORMONE_EFFECTS
                << ",\"sensitivitySpan\":" << field::HORMONE_SENSITIVITY_SPAN
                << ",\"steepnessSteps\":" << field::HORMONE_STEEPNESS_STEPS << ",\"halfRange\":["
                << field::HORMONE_HALF_MIN << ',' << field::HORMONE_HALF_MAX << "],\"sigmaRange\":["
                << field::HORMONE_SIGMA_MIN << ',' << field::HORMONE_SIGMA_MAX
                << "],\"reachLeast\":" << field::MIN_RANGE << ",\"roleEffects\":[";
      for (int role = 0; role < field::ROLES; ++role) {
        std::cout << (role ? ",[" : "[");
        bool first = true;
        for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
          if (field::hormone_effect_present(field::Role(role), effect)) {
            std::cout << (first ? "" : ",") << effect;
            first = false;
          }
        std::cout << ']';
      }
      std::cout << "]}\n";
      return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "design") {
      // A sight scene (flag 1 and its values) or none (0), a sense scene alike, then the plan.
      int seen = 0;
      ensure(bool(std::cin >> seen) && (seen == 0 || seen == 1), "invalid sight flag");
      std::optional<SightScene> sight;
      if (seen)
        sight = read_sight(std::cin);
      ensure(bool(std::cin >> seen) && (seen == 0 || seen == 1), "invalid sense flag");
      std::optional<SenseScene> sense;
      if (seen)
        sense = read_sense_scene(std::cin);
      std::string name;
      design_report(read_plan(std::cin, name, true).groups, sight, sense);
      std::cout << '\n';
      return 0;
    }
    if (argc < 3)
      throw std::invalid_argument(
          "usage: atelier design | build|new output | inspect genome | edit source output");
    Genome::begin_run(ATELIER_RUN_SEED);
    const std::string operation = argv[1];
    Genome g;
    int probeSteps = 0;
    std::vector<int> probeGroups;
    struct {
      int substance = 0, steps = 1;
      float level = 0, maturity = 0;
    } measured;
    std::vector<Group> groups;
    std::optional<Plan> compiledPlan;
    bool import = false;
    AddressFit addressFit;
    if (operation == "build" && argc == 3) {
      std::string name;
      auto plan = read_plan(std::cin, name);
      auto progress = [](const char *phase, const AddressFit &fit) {
        std::cerr << "{\"phase\":\"" << phase << "\",\"milliseconds\":" << fit.milliseconds
                  << ",\"attempts\":" << fit.attempts << "}\n"
                  << std::flush;
      };
      progress("search", addressFit);
      if (!plan.fixed_contacts)
        addressFit = plan_addresses(plan, progress);
      progress("encode", addressFit);
      g.cppn = Builder().build(plan);
      groups = plan.groups;
      g.development_seed = plan.development_seed;
      g.variation_seed = plan.variation_seed;
      compiledPlan = std::move(plan);
      g.name = name;
    } else if (operation == "new" && argc == 3) {
      std::string example;
      ensure(bool(std::cin >> example) &&
                 (example == "blank" || example == "sum" || example == START_FISH),
             "unknown CPPN example");
      if (example == START_FISH) {
        import = true;
        std::ifstream input(fishsim::HAND_BUILT_GENOME);
        ensure(bool(input), "start fish not found");
        g = Genome::read(input, false);
      } else {
        g.cppn = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
        for (int id = 0; id < cppn::INPUTS + cppn::OUTPUTS; ++id)
          g.cppn->add_node({id, 1, NodeType::LINEAR});
        if (example == "sum") {
          ensure(g.cppn->connect(cppn::input::u, cppn::INPUTS + out::expression, 1.f),
                 "cannot connect addition input");
          ensure(g.cppn->connect(cppn::input::v, cppn::INPUTS + out::expression, 1.f),
                 "cannot connect addition input");
        }
        g.development_seed = 1;
        g.variation_seed = 2;
        g.name = example == "sum" ? "Addition aus zwei Eingängen" : "Neues CPPN";
      }
    } else if ((operation == "inspect" && argc == 3) || (operation == "edit" && argc == 4) ||
               (operation == "probe" && argc == 3) || (operation == "measure" && argc == 3) ||
               (operation == "check" && argc == 3)) {
      std::ifstream input(argv[2]);
      ensure(bool(input), "genome not found");
      g = Genome::read(input, false);
      if (operation == "check") {
        std::string ignoredName;
        compiledPlan = read_plan(std::cin, ignoredName);
        groups = compiledPlan->groups;
      }
      if (operation == "probe") {
        int count = 0;
        ensure(bool(std::cin >> count) && count > 0 && count <= studio_plan::max_groups,
               "invalid stimulus count");
        probeGroups.resize(std::size_t(count));
        for (int &group : probeGroups)
          ensure(bool(std::cin >> group), "missing stimulus source");
        ensure(bool(std::cin >> probeSteps), "missing stimulus steps");
        std::string ignoredName;
        groups = read_plan(std::cin, ignoredName).groups;
      }
      if (operation == "measure") {
        ensure(bool(std::cin >> measured.substance >> measured.level >> measured.maturity >>
                    measured.steps),
               "missing measurement parameters");
        std::string ignoredName;
        groups = read_plan(std::cin, ignoredName).groups;
      }
      if (operation == "edit") {
        std::string command;
        ensure(bool(std::cin >> command), "missing CPPN edit");
        if (command == "node") {
          int id, type;
          float param;
          ensure(bool(std::cin >> id >> type >> param) && type >= 0 &&
                     type < evolution::NODE_TYPES &&
                     between(param, -CPPN_EDIT_LIMIT, CPPN_EDIT_LIMIT),
                 "invalid node edit");
          g.cppn->edit_node(id, param, NodeType(type));
        } else if (command == "link") {
          int innovation, enabled;
          float weight;
          ensure(bool(std::cin >> innovation >> weight >> enabled) &&
                     between(weight, -CPPN_EDIT_LIMIT, CPPN_EDIT_LIMIT) &&
                     (enabled == 0 || enabled == 1),
                 "invalid link edit");
          g.cppn->edit_connection(innovation, weight, bool(enabled));
        } else if (command == "connect") {
          int from, to, port;
          float weight;
          ensure(bool(std::cin >> from >> to >> weight >> port) &&
                     between(weight, -CPPN_EDIT_LIMIT, CPPN_EDIT_LIMIT) && (port == 0 || port == 1),
                 "invalid new link");
          ensure(g.cppn->connect(from, to, weight, port), "CPPN link refused");
        } else if (command == "split") {
          int innovation;
          ensure(bool(std::cin >> innovation) && g.cppn->split_connection(innovation),
                 "CPPN split refused");
        } else if (command == "add-node") {
          int type;
          float param;
          ensure(bool(std::cin >> type >> param) && type >= 0 && type < evolution::NODE_TYPES &&
                     between(param, -CPPN_EDIT_LIMIT, CPPN_EDIT_LIMIT) &&
                     g.cppn->nodes() < CPPN_MOST_NODES,
                 "invalid new CPPN node");
          int id = cppn::INPUTS + cppn::OUTPUTS;
          for (const auto &n : g.cppn->get_node_genes())
            id = std::max(id, n.get_id() + 1);
          g.cppn->add_node({id, param, NodeType(type)});
        } else
          throw std::invalid_argument("unknown CPPN edit");
        int hasPlan = 0;
        ensure(bool(std::cin >> hasPlan) && (hasPlan == 0 || hasPlan == 1),
               "missing edit plan flag");
        if (hasPlan) {
          std::string ignoredName;
          compiledPlan = read_plan(std::cin, ignoredName);
          groups = compiledPlan->groups;
        }
      }
    } else
      throw std::invalid_argument("unknown atelier operation");
    if (operation == "build")
      std::cerr << "{\"phase\":\"validate\",\"milliseconds\":" << addressFit.milliseconds << "}\n"
                << std::flush;
    g.compile(false);
    if (operation == "check") {
      const auto started = std::chrono::steady_clock::now();
      std::cout << "{\"development\":[";
      fishsim::Rng random(819271);
      bool first = true;
      for (int trial = 0; trial < 12; ++trial) {
        if (trial == 4) {
          std::cout << "],\"mutations\":[";
          first = true;
        }
        if (trial > 4 &&
            std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count() > 3)
          break;
        auto child = g;
        if (trial < 4) {
          child.development_seed = field::splitmix(1729 + trial);
          child.variation_seed = field::splitmix(431 + trial);
        } else
          child.mutate(random, 1, false);
        try {
          child.compile(false);
          const auto check = assess(*compiledPlan, child);
          std::cout << (first ? "" : ",") << "{\"ok\":" << (check.ok() ? "true" : "false")
                    << ",\"cells\":" << child.blueprint->neurons.size()
                    << ",\"missing\":" << check.missing << ",\"additional\":" << check.additional
                    << ",\"viable\":" << (child.viable() ? "true" : "false") << '}';
        } catch (const std::exception &) {
          std::cout << (first ? "" : ",") << "{\"ok\":false,\"error\":true}";
        }
        first = false;
      }
      std::cout << "],\"milliseconds\":"
                << std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() -
                                                             started)
                       .count()
                << '}';
      return 0;
    }
    if (operation == "probe") {
      probe(g, groups, probeGroups, probeSteps);
      return 0;
    }
    if (operation == "measure") {
      measure(g, groups, measured.substance, measured.level, measured.maturity, measured.steps);
      return 0;
    }
    if (operation != "inspect")
      g.save(argv[operation == "edit" ? 3 : 2]);
    report(g, groups, compiledPlan ? &*compiledPlan : nullptr, addressFit, import);
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
