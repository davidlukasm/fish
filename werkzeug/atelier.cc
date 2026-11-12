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
#include "atelier_connections.hh"
#include "field/dynamics.hh"
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

using evolution::NodeType;
using fishsim::Genome;
namespace out = cppn::output;
namespace {
using namespace atelier;

constexpr int REPORT_DIGITS = 8, DIET_DIGITS = 6;
constexpr int INCUBATION_PROBE_STEPS = 1024;
constexpr std::uint64_t SIGHT_TANK_SEED = 719;
struct Incubation {
  int steps;
  double energy;
};
std::optional<Incubation> incubation_probe(const Genome &g) {
  if (!g.viable())
    return std::nullopt;
  fishsim::Ecosystem tank(SIGHT_TANK_SEED);
  tank.safety = false;
  tank.workers = 1;
  tank.evo.assist_min_population = tank.evo.assist_species_minimum = 0;
  tank.evo.mutation = 0;
  tank.food_burst.strength = 0;
  tank.set_parameter("energy_supply", 0);
  const double yolk = fishsim::development_energy(g, tank.physiology().neural_cost, tank.evo.yolk);
  if (!tank.spawn(g, fishsim::SIZE / 2, fishsim::SIZE / 2, fishsim::fish_origin::founder, 0, 0,
                  yolk))
    return std::nullopt;
  tank.fish.back().genome = g;
  tank.fish.back().body.prepare(g);
  for (int tick = 0; tick < INCUBATION_PROBE_STEPS && !tank.fish.empty(); ++tick) {
    tank.tick();
    if (!tank.fish.empty() && tank.fish.front().body.hatched) {
      const auto &body = tank.fish.front().body;
      // The probe includes muscular and hormonal work; an unfertilised egg also pays for waiting.
      return Incubation{body.hatch_age,
                        yolk - body.energy + fishsim::hatch_search_reserve(body) +
                            tank.evo.fertilisation_wait * field::DevelopmentCosts{}.egg_basal};
    }
  }
  return std::nullopt;
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
struct SightScene {
  int side = 0;
  double bearing = 0, distance = 0, radius = fishsim::sensory_probe::radius, hue = 0;
};
constexpr std::uint64_t ATELIER_RUN_SEED = 42;
constexpr float CPPN_EDIT_LIMIT = fishsim::MAX_GENE_WEIGHT;
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
struct SenseScene {
  int kind = 0, scent = 0;
  double bearing = 0, distance = 0, strength = 0, nutrient = 0;
};
namespace sense_scene {
constexpr int smell = 1, touch = 2, flow = 3, wound = 4, gut = 5;
}
constexpr double SENSE_SCENE_REACH = 40, SENSE_SCENE_STRENGTH = 20;
SenseScene read_sense_scene(std::istream &in) {
  SenseScene scene;
  const double half_turn = fishsim::degrees(fishsim::PI);
  ensure(
      bool(in >> scene.kind >> scene.bearing >> scene.distance >> scene.strength >> scene.scent >>
           scene.nutrient) &&
          scene.kind >= sense_scene::smell && scene.kind <= sense_scene::gut &&
          between(scene.bearing, -half_turn, half_turn) &&
          between(scene.distance, 0, SENSE_SCENE_REACH) &&
          between(scene.strength, 0, scene.kind == sense_scene::gut ? 1 : SENSE_SCENE_STRENGTH) &&
          between(scene.nutrient, 0, SENSE_SCENE_STRENGTH) && scene.scent >= 0 &&
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
  if (scene.kind == sense_scene::gut) {
    fishsim::SensoryFrame frame;
    frame.satiety = scene.strength;
    frame.nutrient = scene.nutrient;
    for (std::size_t i = 0; i < answers.size(); ++i) {
      const auto &r = interface->sensory[i];
      if (r.dominant_sense() == field::Intake || r.dominant_sense() == field::InnerPressure)
        answers[i] = fishsim::receptor_response(
            r, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
    }
  } else if (scene.kind == sense_scene::flow) {
    fishsim::SensoryFrame frame;
    for (int k = 0; k < fishsim::SECTOR_COUNT; ++k) {
      const double facing = std::max(0., std::cos(fishsim::sector_angle(k) - bearing));
      frame.relative[k] = {scene.strength * std::cos(bearing) * facing,
                           scene.strength * std::sin(bearing) * facing};
    }
    for (std::size_t i = 0; i < answers.size(); ++i) {
      const auto &r = interface->sensory[i];
      if (r.dominant_sense() == field::Flow && !r.inner)
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
  const auto stirred = [&](int sense) {
    return scene.kind == sense_scene::gut ? sense == field::Intake || sense == field::InnerPressure
           : scene.kind == sense_scene::smell ? sense == field::Odor
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
constexpr int LIGHT_HUES = 72, LIGHT_LEVELS = 48;
constexpr double LIGHT_DIMMEST = 1e-4;
constexpr int SENSE_LEVELS = 48;
constexpr int SPINE_DIRECTIONS = 64;
constexpr int LATERAL_DIRECTIONS = 48;
constexpr int COLOUR_STEPS = 9;
constexpr double ADAPT_HELD = 4, ADAPT_SPAN = 4;
std::vector<int> anatomy_report(const field::Substrate &t,
                                const std::shared_ptr<const fishsim::BrainInterface> &interface,
                                const std::vector<Group> &groups, bool developed) {
  const auto &a = *interface;
  std::cout << ",\"hormoneTimes\":[";
  for (int k = 0; k < field::HORMONES; ++k)
    std::cout << (k ? "," : "") << a.hormone_timing[k].steps;
  std::cout << "],\"pigmentTimes\":[";
  for (int k = 0; k < fishsim::rgb::count; ++k)
    std::cout << (k ? "," : "") << a.pigment_timing[k].steps;
  std::cout << "],\"motorTiming\":[";
  for (int k = 0; k < fishsim::STROKE_COUNT; ++k)
    std::cout << (k ? "," : "") << '[' << fishsim::STROKE_PORTS[k] << ','
              << a.stroke_timing[k].steps << ',' << a.stroke_timing[k].recovery << ']';
  std::cout << ']';
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
    const bool intensity = cell->intensity();
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
  std::cout << ",\"zones\":[";
  {
    const auto spans = field::zone_spans(t.neurons);
    for (std::size_t z = 0; z < spans.size(); ++z)
      std::cout << (z ? "," : "") << '[' << spans[z].front << ',' << spans[z].extent << ']';
  }
  std::cout << ']';
  // Where a cell of every development site would lie in this body, and the gut, as pressure
  // cells measure them.
  std::cout << ",\"gutPath\":[";
  for (std::size_t k = 0; k < a.gut_path.size(); ++k)
    std::cout << (k ? "," : "") << '[' << a.gut_path[k][0] << ',' << a.gut_path[k][1] << ','
              << a.gut_path[k][2] << ']';
  std::cout << "],\"sitePlaces\":[";
  {
    const fishsim::ZonalFrame frame(a);
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
      const auto at = frame.place(field::development_site(i));
      std::cout << (i ? "," : "") << '[' << float(at.x) << ',' << float(at.y) << ',' << float(at.z)
                << ']';
    }
  }
  std::cout << ']';
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
  std::cout << ",\"lateral\":[";
  {
    const fishsim::Body still;
    const fishsim::PhysiologyParameters physiology{};
    for (std::size_t i = 0; i < groups.size(); ++i) {
      fishsim::LateralSamples<double> weights{};
      std::array<double, LATERAL_DIRECTIONS> tuning{};
      int count = 0;
      for (const auto &r : a.sensory) {
        if (r.dominant_sense() != field::Flow || r.inner ||
            !groups[i].contains(t.neurons[r.neuron].location))
          continue;
        ++count;
        for (int k = 0; k < fishsim::SECTOR_COUNT; ++k)
          weights[k] += r.contact_weights[k];
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
      for (int k = 0; k < fishsim::SECTOR_COUNT; ++k)
        std::cout << (k ? "," : "") << weights[k] / count;
      std::cout << "],\"tuning\":[";
      for (int d = 0; d < LATERAL_DIRECTIONS; ++d)
        std::cout << (d ? "," : "") << tuning[d] / count;
      std::cout << "]}";
    }
  }
  std::cout << ']';
  const double radius = fishsim::structural_radius(fishsim::BODY_TISSUE, a.organ_mass);
  std::cout << ",\"bodyRadius\":" << radius
            << ",\"visionDepth\":" << fishsim::EnvironmentParameters{}.vision_range / radius;
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
  std::cout << "],\"bladder\":" << a.capacities[fishsim::organ_port::bladder];
  std::cout << ",\"fins\":[";
  for (std::size_t i = 0; i < a.fins.size(); ++i) {
    if (i)
      std::cout << ',';
    const auto &fin = a.fins[i];
    std::cout << "{\"cells\":" << fin.cells << ",\"strength\":" << fin.strength
              << ",\"x\":" << fin.x << ",\"y\":" << fin.y << ",\"spread\":" << fin.spread << '}';
  }
  std::cout << "],\"forms\":[";
  for (std::size_t i = 0; i < a.forms.size(); ++i) {
    if (i)
      std::cout << ',';
    const auto &f = a.forms[i];
    std::cout << '[' << f.x << ',' << f.y << ',' << f.z << ',' << f.sy << ',' << f.sz << ','
              << f.weight << ']';
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
    std::cout << ']';
  }
  std::cout << '}';
  std::vector<int> group(t.neurons.size(), -1), sites(groups.size()), cells(groups.size());
  struct ReceptorSum {
    double baseline = 0, sensitivity = 0, half = 0, affinity = 0;
  };
  using EffectSummary = std::array<ReceptorSum, field::HORMONE_EFFECTS>;
  std::vector<EffectSummary> receptor_sums(groups.size());
  std::vector<std::array<int, field::HORMONE_EFFECTS>> receptor_counts(groups.size());
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
        if (!field::hormone_effect_present(n, effect))
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
            const AddressFit &fit = {}) {
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
  const auto incubation = incubation_probe(g);
  std::cout << ",\"eggIncubation\":";
  if (incubation)
    std::cout << incubation->steps;
  else
    std::cout << "null";
  std::cout << ",\"eggMinimum\":";
  if (incubation)
    std::cout << incubation->energy;
  else
    std::cout << "null";
  fishsim::Body adult;
  adult.organ_mass = a.organ_mass;
  adult.tissue = fishsim::tissue_capacity(adult);
  std::cout << ",\"adultScale\":" << fishsim::growth_fraction(adult);
  auto group = anatomy_report(t, g.interface, groups, true);
  std::map<std::uint32_t, int> extra;
  std::map<std::uint32_t, int> members;
  for (const auto &cell : t.neurons)
    ++members[cell.group];
  std::cout << ",\"extraNodes\":[";
  bool first_extra = true;
  for (std::size_t i = 0; i < t.neurons.size(); ++i)
    if (group[i] < 0) {
      const auto &cell = t.neurons[i];
      const auto [it, fresh] = extra.emplace(cell.group, int(groups.size() + extra.size()));
      group[i] = it->second;
      if (!fresh)
        continue;
      const auto cl = field::cell_class(cell);
      const auto &p = cell.location;
      std::cout << (first_extra ? "" : ",") << "{\"index\":" << it->second << ",\"zone\":" << p.zone
                << ",\"side\":" << p.side << ",\"u\":" << p.u << ",\"v\":" << p.v
                << ",\"w\":" << p.w << ",\"role\":" << int(cell.role)
                << ",\"copies\":" << members[cell.group] << ",\"nativeClass\":{\"sign\":" << cl.sign
                << ",\"mode\":" << cl.mode << ",\"pace\":" << cl.pace
                << ",\"modulator\":" << cl.modulator << "}}";
      first_extra = false;
    }
  std::cout << ']';
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
      const auto &source = t.neurons[e.source], &target = t.neurons[e.target];
      const auto cl = field::cell_class(source);
      const float limit = field::contact_limit(source, target);
      v.weight += limit;
      if (cl.sign > 0) {
        ++v.positive;
        v.positive_weight += limit;
      } else {
        ++v.negative;
        v.negative_weight += limit;
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
  std::cout << "}\n";
}
}
// The swim bladder's lift at full fill per share of capacity, and the sinking it works against
// (movement.cc): lift = strength * capacity / (1 + capacity) * fill.
std::string buoyancy_report() {
  const fishsim::PhysiologyParameters physiology{};
  std::ostringstream out;
  out << "{\"sinking\":" << physiology.sinking << ",\"strength\":" << physiology.bladder_strength
      << '}';
  return out.str();
}
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

constexpr int DIET_SAMPLES = 41;
constexpr double DIET_SUCTION = 4;
// Where the lateral line samples the water, in body radii: forward, then to the right.
std::string lateral_ring_report() {
  std::ostringstream out;
  out << '[';
  for (int k = 0; k < fishsim::SECTOR_COUNT; ++k) {
    const auto p = fishsim::lateral_point(k, 1);
    out << (k ? "," : "") << '[' << p.x << ',' << p.y << ']';
  }
  out << ']';
  return out.str();
}
std::string substance_turns_report() {
  std::ostringstream out;
  out << '[';
  for (std::size_t k = 0; k < field::SUBSTANCE_TURNS.size(); ++k)
    out << (k ? "," : "") << field::SUBSTANCE_TURNS[k];
  out << ']';
  return out.str();
}
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
  row("grind", [](double b) { return tooth_grip(b, BiteKind::grinding); }, true);
  row("cut", [](double b) { return tooth_grip(b, BiteKind::cutting); });
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
                << ",\"cppnLimit\":" << CPPN_EDIT_LIMIT
                << ",\"cppnSharpness\":" << evolution::GAUSSIAN_SHARPNESS
                << ",\"cppnRange\":" << evolution::WEIGHT_RANGE
                << ",\"hormones\":" << field::HORMONES << ",\"regulators\":" << field::REGULATORS
                << ",\"bloodSubstances\":" << field::BLOOD_SUBSTANCES
                << ",\"substanceTurns\":" << substance_turns_report()
                << ",\"visionRange\":" << fishsim::EnvironmentParameters{}.vision_range
                << ",\"sightRadius\":[" << fishsim::PROBE_MIN_RADIUS << ','
                << fishsim::PROBE_MAX_RADIUS << ']' << ",\"nearDepth\":["
                << fishsim::proximity_depth(0) << ',' << fishsim::proximity_depth(1) << ']'

                << ",\"diet\":" << diet_report() << ",\"lateralRing\":" << lateral_ring_report()
                << ",\"gonads\":" << gonad_report() << ",\"buoyancy\":" << buoyancy_report()
                << ",\"biasScale\":" << field::Options{}.bias_scale
                << ",\"hormoneRate\":" << fishsim::PhysiologyParameters{}.hormones.rate
                << ",\"neural\":{\"learningFloor\":" << field::MIN_LEARNING_RATE
                << ",\"learningGainMax\":" << field::MAX_LEARNING_GAIN
                << ",\"unusedDecaySpan\":" << field::plasticity::unused_decay_span
                << ",\"baselineSteps\":" << field::plasticity::baseline_steps
                << ",\"cancellation\":" << field::plasticity::cancellation
                << ",\"contactTrial\":" << field::plasticity::contact_trial_time_constants
                << ",\"prune\":" << field::plasticity::prune_share * field::SYNAPSE_UNIT
                << ",\"developmentInterval\":" << field::CELL_DEVELOPMENT_INTERVAL
                << ",\"slotMin\":" << field::SLOTS_MIN << ",\"slotSpan\":" << field::SLOTS_RANGE
                << ",\"contactFields\":" << field::CONTACT_FIELDS
                << ",\"effectorSlots\":" << field::EFFECTOR_SLOTS
                << ",\"adaptationSpan\":" << field::SYNAPTIC_ADAPTATION_SPAN << '}'
                << ",\"lightEffects\":[" << field::Excitation << "]"
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
    std::vector<Group> groups;
    std::optional<Plan> compiledPlan;
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
      ensure(bool(std::cin >> example) && (example == "blank" || example == "sum"),
             "unknown CPPN example");
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
    } else if ((operation == "inspect" && argc == 3) || (operation == "edit" && argc == 4) ||
               (operation == "check" && argc == 3)) {
      std::ifstream input(argv[2]);
      ensure(bool(input), "genome not found");
      g = Genome::read(input, false);
      if (operation == "check") {
        std::string ignoredName;
        compiledPlan = read_plan(std::cin, ignoredName);
        groups = compiledPlan->groups;
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
                     g.cppn->nodes() < fishsim::MAX_GENOME_NODES,
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
    if (operation != "inspect")
      g.save(argv[operation == "edit" ? 3 : 2]);
    report(g, groups, compiledPlan ? &*compiledPlan : nullptr, addressFit);
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
