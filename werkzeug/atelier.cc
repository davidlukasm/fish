#include "../src/genome.hh"
#include "../src/ecology.hh"
#include "../src/retina.hh"
#include "../src/waterborne.hh"
#include "../src/receptor_tuning.hh"
#include "../src/eye_geometry.hh"
#include "../src/observations.hh"
#include "../src/json_numbers.hh"
#include "../src/protocol_schema.hh"
#include "../src/body_plan.hh"
#include "../src/movement.hh"
#include "../src/simulation_types.hh"
#include "../src/physiology_parameters.hh"
#include "../src/physiology.hh"
#include "field/hormones.hh"
#include "field/functions.hh"
#include "field/development_sites.hh"
#include "atelier_connections.hh"
#include "atelier_learning.hh"
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
struct GillScene {
  bool feeding = false;
  double opening = 0, pump = 0, speed = 0, suction = 0, fullness = 0;
};
struct SenseScene {
  int kind = 0, scent = 0;
  double bearing = 0, distance = 0, strength = 0, nutrient = 0;
  double flow_bearing = 0, flow_strength = 0;
  int bite_delay = 0;
  bool pump_gills = false;
  GillScene gills;
};
namespace sense_scene {
constexpr int smell = 1, touch = 2, flow = 3, wound = 4, gut = 5, taste = 6, balance = 7;
constexpr int attack = 8, mouth = 10, gills = 11;
}
constexpr double SENSE_SCENE_REACH = 40, SENSE_SCENE_STRENGTH = 20;
SenseScene read_sense_scene(std::istream &in) {
  SenseScene scene;
  ensure(bool(in >> scene.kind), "invalid sense scene");
  if (scene.kind == sense_scene::mouth) {
    ensure(bool(in >> scene.bite_delay >> scene.pump_gills) &&
               between(scene.bite_delay, -fishsim::MAX_STROKE_STEPS, fishsim::MAX_STROKE_STEPS),
           "invalid mouth course");
    return scene;
  }
  if (scene.kind == sense_scene::gills) {
    auto &g = scene.gills;
    ensure(bool(in >> g.feeding >> g.opening >> g.pump >> g.speed >> g.suction >> g.fullness) &&
               between(g.opening, 0, 1) && between(g.pump, 0, 1) &&
               between(g.speed, 0, fishsim::MAX_SPEED) && between(g.suction, 0, 1) &&
               between(g.fullness, 0, 1),
           "invalid gill scene");
    return scene;
  }
  const double half_turn = fishsim::degrees(fishsim::PI);
  ensure(
      bool(in >> scene.bearing >> scene.distance >> scene.strength >> scene.scent >>
           scene.nutrient) &&
          scene.kind >= sense_scene::smell && scene.kind <= sense_scene::attack &&
          between(scene.bearing, -half_turn, half_turn) &&
          between(scene.distance, 0, SENSE_SCENE_REACH) &&
          between(scene.strength, 0, scene.kind == sense_scene::gut ? 1 : SENSE_SCENE_STRENGTH) &&
          between(scene.nutrient, 0, SENSE_SCENE_STRENGTH) &&
          (scene.scent >= 0 || (scene.kind == sense_scene::taste && scene.scent == -1)) &&
          scene.scent < fishsim::odor_kind::count &&
          (scene.kind != sense_scene::taste || scene.scent != fishsim::odor_kind::plankton),
      "invalid sense scene");
  if (scene.kind == sense_scene::smell)
    ensure(bool(in >> scene.flow_bearing >> scene.flow_strength) &&
               between(scene.flow_bearing, -half_turn, half_turn) &&
               between(scene.flow_strength, 0, SENSE_SCENE_STRENGTH),
           "invalid smell flow");
  return scene;
}
fishsim::Body adult_actuation_probe(const Genome &g) {
  namespace fs = fishsim;
  const auto &layout = *g.interface;
  fs::Body body;
  body.hatched = true;
  body.tissue = fs::BODY_TISSUE;
  body.organ_mass = layout.organ_mass;
  body.jaw_length = layout.jaw_length;
  body.gut_length = layout.gut_length;
  body.blunt_teeth = layout.blunt_teeth;
  body.undulation = layout.undulation;
  body.energy = fs::reserve_capacity(body);
  body.mouth.opening = fs::MOUTH_REST;
  body.activate_brain(g, false);
  body.refresh_organs(g);
  return body;
}
void fin_twitch_report(const fishsim::BrainInterface &layout, double mass,
                       const fishsim::PhysiologyParameters &physiology) {
  namespace fs = fishsim;
  std::cout << ",\"finTwitch\":[";
  for (int pair = 0; pair < fs::SIDE_FINS; ++pair)
    for (int side = 0; side < 2; ++side) {
      if (pair || side)
        std::cout << ',';
      std::cout << '[';
      for (const bool front : {false, true}) {
        if (front)
          std::cout << ',';
        const auto &strokes = front ? fs::FRONT_STROKES : fs::BACK_STROKES;
        const int stroke = strokes[pair][side];
        const double drive = layout.stroke_capacity[stroke];
        if (drive <= 0 || drive < physiology.stroke_threshold) {
          std::cout << "null";
          continue;
        }
        const auto &timing = layout.stroke_timing[stroke];
        const double torque = (bool(side) != front ? -1 : 1) * drive * layout.fin_turn[stroke];
        const auto angle = fs::isolated_twitch_turn(torque, timing, mass, physiology);
        std::cout << "{\"duration\":" << timing.steps
                  << ",\"during\":" << fs::degrees(angle.during) << ",\"settled\":";
        if (angle.settled)
          std::cout << fs::degrees(*angle.settled);
        else
          std::cout << "null";
        std::cout << '}';
      }
      std::cout << ']';
    }
  std::cout << ']';
}
void mouth_course_report(const Genome &g, const SenseScene &scene) {
  namespace fs = fishsim;
  const auto &layout = *g.interface;
  auto body = adult_actuation_probe(g);
  const fs::PhysiologyParameters physiology;
  const int opens = std::max(0, -scene.bite_delay), closes = opens + scene.bite_delay;
  const int opener_steps = layout.stroke_timing[fs::StrokeSuction].whole(),
            closer_steps = layout.stroke_timing[fs::StrokeBite].whole(),
            gill_steps = layout.stroke_timing[fs::StrokeGill].whole();
  const int pumping_until = opens + std::max(opener_steps, gill_steps),
            last_command = std::max(pumping_until, closes + closer_steps),
            rest_steps = int(std::ceil(1 / fs::MOUTH_DRIFT));
  std::vector<int> port(g.blueprint->neurons.size(), -1);
  for (const auto &effector : layout.effectors)
    port[effector.neuron] = effector.port;
  body.set_actuation_probe([&](std::uint32_t i, float) {
    switch (port[i]) {
    case fs::organ_port::suction:
      return body.age >= opens && body.age < opens + opener_steps ? 1.f : 0.f;
    case fs::organ_port::jaw:
      return body.age >= closes && body.age < closes + closer_steps ? 1.f : 0.f;
    case fs::organ_port::gills:
      return scene.pump_gills && body.age >= opens && body.age < opens + gill_steps ? 1.f : 0.f;
    default:
      return 0.f;
    }
  });
  body.mouth.opening = body.gill_signal = 1;
  const double gill_reference = fs::gill_water(body);
  body.mouth.opening = fs::MOUTH_REST;
  body.gill_signal = 0;
  const double credit_reference = fs::swallow_area(body) * fs::raker_passage(body) *
                                  layout.stroke_timing[fs::StrokeSuction].steps *
                                  fs::MOUTH_TRANSPORT_RATE;
  std::cout << ",\"mouthCourse\":{\"firstStep\":" << -opens
            << ",\"rakerRetention\":" << fs::raker_retention(body.raker_density)
            << ",\"gillWaterReference\":" << gill_reference
            << ",\"creditReference\":" << credit_reference
            << ",\"samples\":[";
  for (int step = 0; step <= last_command + rest_steps; ++step) {
    body.age = step;
    fs::anatomical_action(body, layout, physiology);
    const auto &mouth = body.mouth;
    std::cout << (step ? ",[" : "[") << mouth.opening << ',' << mouth.flow << ','
              << fs::gill_water(body) << ',' << (mouth.closing ? "true" : "false") << ','
              << mouth.gape << ',' << mouth.credit << ']';
  }
  std::cout << "]}";
}
// The probe's report on the senses it stirs, and what each group's stirred cells meet of it on
// average, in their sense's units (NaN for a group with none): what the sense courses scale by.
std::vector<double> sense_report(const field::Substrate &t,
                                 const std::shared_ptr<const fishsim::BrainInterface> &interface,
                                 const std::vector<Group> &groups, const SenseScene &scene) {
  fishsim::Body body;
  body.x = body.y = fishsim::SIZE / 2;
  body.organ_mass = interface->organ_mass;
  body.tissue = fishsim::BODY_TISSUE;
  const double bearing = fishsim::radians(scene.bearing), radius = fishsim::body_radius(body);
  const fishsim::PhysiologyParameters physiology{};
  std::vector<float> answers(interface->sensory.size(), 0);
  std::vector<double> met(interface->sensory.size(), 0);
  // A cell's answer to what it meets of the probe.
  const auto answer = [&](std::size_t i, double stimulus) {
    met[i] = stimulus;
    answers[i] = std::clamp(fishsim::receptor_response(interface->sensory[i], stimulus), 0.f, 1.f);
  };
  const auto stirred = [&](const fishsim::BrainInterface::Receptor &r) {
    const int sense = r.dominant_sense();
    return scene.kind == sense_scene::gut ? sense == field::Intake || sense == field::InnerPressure
           : scene.kind == sense_scene::smell   ? sense == field::Odor
           : scene.kind == sense_scene::taste   ? sense == field::Taste
           : scene.kind == sense_scene::flow    ? sense == field::Flow && !r.inner
           : scene.kind == sense_scene::balance ? sense == field::Flow && r.inner
           : scene.kind == sense_scene::touch   ? sense == field::Touch
                                                : sense == field::Damage;
  };
  if (scene.kind == sense_scene::gut) {
    fishsim::SensoryFrame frame;
    frame.satiety = scene.strength;
    frame.nutrient = scene.nutrient;
    for (std::size_t i = 0; i < answers.size(); ++i) {
      const auto &r = interface->sensory[i];
      if (r.dominant_sense() == field::Intake || r.dominant_sense() == field::InnerPressure)
        answer(i, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
    }
  } else if (scene.kind == sense_scene::balance) {
    // The probe gives the direction of world-down in the fish's frame.
    body.angle = fishsim::PI / 2 - bearing;
    const fishsim::SensoryFrame frame;
    for (std::size_t i = 0; i < answers.size(); ++i) {
      const auto &r = interface->sensory[i];
      if (r.dominant_sense() == field::Flow && r.inner)
        answer(i, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
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
        answer(i, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
    }
  } else if (scene.kind == sense_scene::touch || scene.kind == sense_scene::wound) {
    if (scene.kind == sense_scene::touch)
      fishsim::record_touch(body, std::cos(bearing), std::sin(bearing), scene.strength);
    else
      fishsim::harm_body(body, scene.strength, fishsim::death_reason::injury, bearing);
    const auto frame = fishsim::prepare_sensory_frame(body);
    for (auto i : interface->active_sensory) {
      const auto &r = interface->sensory[i];
      if (stirred(r))
        answer(i, fishsim::anatomical_stimulus(body, r, frame, 0, physiology));
    }
  } else if (scene.kind == sense_scene::taste) {
    const double x = body.x + scene.distance * radius * std::cos(bearing),
                 y = body.y + scene.distance * radius * std::sin(bearing);
    std::array<fishsim::Field::TipContact, fishsim::BrainInterface::SIDES> tips{};
    std::cout << ",\"barbelProbe\":[";
    for (std::size_t side = 0; side < tips.size(); ++side) {
      const auto tip = fishsim::barbel_tip(body, *interface, int(side));
      auto &contact = tips[side];
      if (fishsim::barbel_reaches({x - tip.x, y - tip.y}, fishsim::sensory_probe::radius,
                                  fishsim::barbel::reach)) {
        contact.felt = 1;
        if (scene.scent >= 0)
          contact.taste[scene.scent] = 1;
      }
      std::cout << (side ? "," : "");
      if (interface->anatomy[fishsim::anatomy_column::barbel_left + side] <= 0) {
        std::cout << "null";
        continue;
      }
      std::cout << "{\"felt\":" << contact.felt << ",\"taste\":[";
      for (std::size_t k = 0; k < contact.taste.size(); ++k)
        std::cout << (k ? "," : "") << contact.taste[k];
      std::cout << "]}";
    }
    std::cout << ']';
    for (auto i : interface->active_sensory) {
      const auto &r = interface->sensory[i];
      if (stirred(r)) {
        const auto exposure = fishsim::birth_exposure(body, r.time_steps);
        answer(i, fishsim::barbel_stimulus(r, tips[r.lateral >= 0], exposure));
      }
    }
  } else {
    namespace fs = fishsim;
    const double from = fs::radians(scene.flow_bearing);
    const fs::Point stream{-scene.flow_strength * std::cos(from),
                           -scene.flow_strength * std::sin(from)};
    const fs::Point source{body.x + scene.distance * radius * std::cos(bearing),
                           body.y + scene.distance * radius * std::sin(bearing)};
    const auto [columns, rows] = fs::waterborne_grid_shape(fs::SIZE, fs::SIZE);
    const fs::Point cell{fs::SIZE / columns, fs::SIZE / rows};
    const auto nose = fs::nose_position(body), flow = fs::nose_flow(body, nose, stream);
    std::array<double, fs::BrainInterface::SIDES> sampled{};
    if (!interface->olfactory.empty())
      for (std::size_t side = 0; side < sampled.size(); ++side) {
        const auto at = fs::nostril_source(body, nose, flow, int(side));
        sampled[side] = fs::estimate_open_water_odor({at.x - source.x, at.y - source.y}, stream,
                                                     cell, fs::sensory_probe::energy,
                                                     scene.scent, {});
      }
    std::cout << ",\"noseProbe\":[";
    for (std::size_t side = 0; side < sampled.size(); ++side) {
      std::cout << (side ? ",[" : "[");
      for (int c = 0; c < fs::odor_kind::count; ++c)
        std::cout << (c ? "," : "") << (c == scene.scent ? sampled[side] : 0);
      std::cout << ']';
    }
    std::cout << ']';
    for (auto i : interface->active_sensory) {
      const auto &r = interface->sensory[i];
      if (stirred(r)) {
        answer(i, sampled[r.lateral >= 0] * r.scents[scene.scent]);
      }
    }
  }
  std::vector<double> stimuli(groups.size(), std::numeric_limits<double>::quiet_NaN());
  std::cout << ",\"senseProbe\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    double sum = 0, meets = 0;
    int count = 0;
    for (std::size_t k = 0; k < answers.size(); ++k) {
      const auto &r = interface->sensory[k];
      if (!stirred(r) || !groups[i].contains(t.neurons[r.neuron].location))
        continue;
      sum += answers[k] / std::max(1e-9f, r.senses[r.dominant_sense()]);
      meets += met[k];
      ++count;
    }
    std::cout << (i ? "," : "");
    if (count) {
      std::cout << sum / count;
      stimuli[i] = meets / count;
    } else
      std::cout << "null";
  }
  std::cout << ']';
  return stimuli;
}
enum class SightDetail { full, studio, answers };

void write_studio_receptor(const fishsim::BrainInterface::Receptor &r, const field::Neuron &n) {
  namespace R = fishsim::receptor_column;
  std::size_t next = 0;
  const auto column = [&](std::size_t index) -> std::ostream & {
    for (; next < index; ++next)
      std::cout << (next ? "," : "") << "null";
    if (next++)
      std::cout << ',';
    return std::cout;
  };
  std::cout << '[';
  column(R::neuron) << r.neuron;
  column(R::angle) << r.angle;
  column(R::hue) << r.hue;
  column(R::view_left) << r.view_left;
  column(R::view_right) << r.view_right;
  column(R::response_threshold) << r.response_threshold;
  column(R::quality2) << n.parameters.quality2;
  column(R::spectrum) << '[';
  fishsim::write_values(std::cout, r.spectrum);
  std::cout << ']';
  column(R::lateral) << r.lateral;
  column(R::proximity) << (r.proximity ? 1 : 0) << ']';
}

void sight_report(const field::Substrate &t,
                  const std::shared_ptr<const fishsim::BrainInterface> &interface,
                  const std::vector<Group> &groups, const SightScene &scene,
                  const fishsim::Field &water, SightDetail detail) {
  fishsim::Body body;
  body.x = body.y = fishsim::SIZE / 2;
  body.organ_mass = interface->organ_mass;
  body.tissue = fishsim::BODY_TISSUE;
  const auto eye = fishsim::visual_origins(body, *interface, water)[scene.side];
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
  fishsim::sense_generated(body, g, water, nullptr, false, fishsim::PhysiologyParameters{});
  const auto &state = body.perception();
  std::cout << ",\"sight\":{";
  fishsim::write_sight(std::cout, state);
  std::cout << ",\"samples\":[";
  if (detail != SightDetail::full) {
    // The Atelier needs only the response column. The other readings feed the aquarium.
    bool first = true;
    for (const auto &sample : state.visual_samples) {
      std::cout << (first ? "" : ",") << '[' << sample.neuron << ',' << sample.response << ']';
      first = false;
    }
    if (detail == SightDetail::answers) {
      std::cout << "]}";
      return;
    }
  } else
    fishsim::write_visual_samples(std::cout, state);
  std::vector<int> owners;
  std::cout << "],\"receptors\":[";
  for (std::size_t i = 0; i < interface->sensory.size(); ++i) {
    const auto &r = interface->sensory[i];
    if (!r.visual())
      continue;
    std::cout << (owners.empty() ? "" : ",");
    if (detail == SightDetail::studio)
      write_studio_receptor(r, t.neurons[r.neuron]);
    else
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
constexpr int LIGHT_HUES = 72;
constexpr double LIGHT_DIMMEST = 1e-4;
constexpr int SENSE_LEVELS = 48;
constexpr int SPINE_DIRECTIONS = 64;
// Six recovery times cover the transients in the continuous-command preview, including white
// fibres. The other motors stay idle and the fish can pay for all the work.
constexpr int SPINE_PREVIEW_STEPS = 6 * fishsim::muscle_fibre::recovery_fast;
constexpr int LATERAL_DIRECTIONS = 48;
constexpr int COLOUR_STEPS = 9;
constexpr double ADAPT_HELD = 4, ADAPT_SPAN = 4;
constexpr int ADAPT_SAMPLES = 96;
double raised_spine_height(const fishsim::BrainInterface &plan,
                           const fishsim::PhysiologyParameters &physiology, float command = 1) {
  namespace fs = fishsim;
  constexpr auto channel = fs::StrokeDefense;
  if (plan.stroke_capacity[channel] < physiology.stroke_threshold)
    return 0;
  // Only the spine erectors are driven. Other muscles neither change the command nor spend
  // energy in this preview.
  fs::BrainInterface muscle;
  for (const auto &pull : plan.pulls) {
    if (pull.stroke != channel)
      continue;
    const auto index = muscle.effectors.size();
    muscle.effectors.push_back(plan.effectors[pull.effector]);
    muscle.effectors.back().neuron = index;
    muscle.pulls.push_back({std::uint32_t(index), channel, pull.share});
  }
  const auto count = muscle.effectors.size();
  const auto drive = fs::effector_activity(std::vector<float>(count, command), muscle);
  std::vector<double> reserve(count, 1);
  const auto &hold = plan.stroke_timing[channel];
  fs::StrokeState stroke;
  double extension = 0, highest = 0;
  for (int step = 0; step < SPINE_PREVIEW_STEPS; ++step) {
    const auto demand = fs::muscle_demand(muscle, drive.cells, reserve);
    fs::StrokeTiming twitch = hold;
    if (demand.drive[channel] > 0)
      twitch.set(demand.steps[channel] / demand.drive[channel]);
    fs::stroke_step(stroke, demand.drive[channel], twitch, physiology.stroke_threshold);
    std::array<double, fs::STROKE_COUNT> work{};
    work[channel] = stroke.drive * fs::stroke_shape(stroke);
    extension = fs::spine_extension(extension, work[channel], hold, physiology);
    highest = std::max(highest, extension);
    if (highest >= physiology.spine_max)
      break;
    fs::tire_fibres(muscle, demand, work, reserve);
  }
  return highest;
}
std::optional<fishsim::BrainInterface::Receptor> nominal_light(const Group &group) {
  if (group.role != 0 || group.function != field::Light)
    return std::nullopt;
  fishsim::BrainInterface::Receptor r{};
  r.response_threshold = float(fishsim::response_threshold((group.threshold + 1) * .5));
  r.opponency = std::clamp((group.q2 + 1) * .5f, 0.f, 1.f);
  const auto spectrum = fishsim::hue_affinities(fishsim::tuning_hue(group.q1), group.qwidth);
  const double total = spectrum[0] + spectrum[1] + spectrum[2];
  for (int c = 0; c < fishsim::rgb::count; ++c)
    r.spectrum[c] = float(spectrum[c] / total);
  return r;
}
void light_spread_report(const field::Substrate &t, const fishsim::BrainInterface &binding,
                         const std::vector<Group> &groups, bool example) {
  const double opponent = fishsim::EnvironmentParameters{}.vision_opponent;
  std::array<fishsim::Color, LIGHT_HUES> lights;
  for (int k = 0; k < LIGHT_HUES; ++k)
    lights[k] = fishsim::hue_light(2. * fishsim::tuning::hue_half_circle * k / LIGHT_HUES);
  std::cout << ",\"lightSpread\":{\"source\":" << json(example ? "example" : "developed")
            << ",\"groups\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    std::array<double, LIGHT_HUES> sum{}, low{}, high{};
    std::size_t count = 0;
    double half_sum = 0, half_low = 0, half_high = 0;
    for (const auto &r : binding.sensory) {
      if (r.channel != field::Light || !groups[i].contains(t.neurons[r.neuron].location))
        continue;
      const double half = fishsim::half_contrast(r.response_threshold);
      half_sum += half;
      half_low = count ? std::min(half_low, half) : half;
      half_high = count ? std::max(half_high, half) : half;
      for (int k = 0; k < LIGHT_HUES; ++k) {
        const double value = fishsim::spectral_balance(r, lights[k], opponent);
        sum[k] += value;
        low[k] = count ? std::min(low[k], value) : value;
        high[k] = count ? std::max(high[k], value) : value;
      }
      ++count;
    }
    std::cout << (i ? "," : "");
    if (!count) {
      std::cout << "null";
      continue;
    }
    const auto curve = [&](const char *name, const auto &values, double scale) {
      std::cout << ",\"" << name << "\":[";
      for (int k = 0; k < LIGHT_HUES; ++k)
        std::cout << (k ? "," : "") << values[k] * scale;
      std::cout << ']';
    };
    std::cout << "{\"count\":" << count;
    curve("mean", sum, 1. / count);
    curve("min", low, 1);
    curve("max", high, 1);
    std::cout << ",\"half\":{\"mean\":" << half_sum / count << ",\"min\":" << half_low
              << ",\"max\":" << half_high << "}}";
  }
  std::cout << "]}";
}
// A course an inspector tries on a sense's cells: the group they belong to and the stimulus they
// meet, step by step, in the sense's own units; with `probe`, step by step as a share of what they
// meet of the fish panel's probe.
struct SenseCourse {
  int group = 0;
  bool probe = false;
  std::vector<double> stimulus;
};
constexpr int MOST_SENSE_COURSES = 12, LONGEST_SENSE_COURSE = 4000, SENSE_COURSE_DIGITS = 4,
              SILENCE_PACES = 33;
std::vector<SenseCourse> read_sense_courses(std::istream &in) {
  int count = 0;
  ensure(bool(in >> count) && count >= 0 && count <= MOST_SENSE_COURSES, "invalid sense courses");
  std::vector<SenseCourse> courses(static_cast<std::size_t>(count));
  for (auto &course : courses) {
    int steps = 0, probe = 0;
    ensure(bool(in >> course.group >> probe >> steps) && (probe == 0 || probe == 1) && steps > 0 &&
               steps <= LONGEST_SENSE_COURSE,
           "invalid sense course");
    course.probe = probe;
    course.stimulus.resize(static_cast<std::size_t>(steps));
    for (auto &value : course.stimulus)
      ensure(bool(in >> value) && std::isfinite(value) && value >= 0,
             "invalid sense course stimulus");
  }
  return courses;
}
// What a group's sense cells send over a course of their stimulus, as the cells of the drawn
// example have them (light_example, as lightSpread): each cell answers with receptor_response
// against what it is used to, and a cell of a tiring sense then gets used to the stimulus by
// adapted_level, as the fish does each step (cppn_brain.cc, adapted_response); a near cell answers
// what it sees with visual_response. The eye's cells have no course. `sent`: the cells' mean
// answer as a share of what they can send (as `senses`); `used`: what they are used to on
// average, in the stimulus's units; `probe`: for a course given as shares of the probe, what the
// cells meet of it; `cells`: their thresholds; `silence`: for cells that get
// used, [pace, step at which they fall silent] over the paces a cell can have. The cells are
// those that sense what the group's planned cell senses (the nominal plan, as in the sense
// report): a site's copies share the sense its centre drew, so a whole group can turn into
// another sense; then it has no course (null), never the other sense's.
void sense_course_report(const Plan &plan, const field::Substrate &planned,
                         const fishsim::BrainInterface &nominal,
                         const std::vector<SenseCourse> &courses,
                         const std::vector<double> &probed) {
  const auto &groups = plan.groups;
  const auto sample = light_example(plan);
  const auto binding = fishsim::body_interface(sample);
  const auto precision = std::cout.precision(SENSE_COURSE_DIGITS);
  const auto list = [](const std::vector<double> &values) {
    for (std::size_t k = 0; k < values.size(); ++k)
      std::cout << (k ? "," : "") << values[k];
  };
  std::cout << ",\"senseCourses\":[";
  for (std::size_t i = 0; i < courses.size(); ++i) {
    const auto &[group, probe, shape] = courses[i];
    ensure(std::size_t(group) < groups.size(), "unknown sense course group");
    std::cout << (i ? "," : "");
    // What the cells meet of the probe: nothing without one, or where it does not stir them.
    const double met = !probe ? 1
                       : std::size_t(group) < probed.size() && std::isfinite(probed[group])
                           ? probed[group]
                           : 0;
    std::vector<double> stimulus(shape.size());
    std::transform(shape.begin(), shape.end(), stimulus.begin(),
                   [met](double share) { return share * met; });
    int sense = -1;
    for (const auto &r : nominal.sensory)
      if (r.channel != field::Light && groups[group].contains(planned.neurons[r.neuron].location)) {
        sense = r.dominant_sense();
        break;
      }
    std::vector<const fishsim::BrainInterface::Receptor *> cells;
    if (sense >= 0)
      for (const auto &r : binding->sensory)
        if (r.dominant_sense() == sense && r.senses[sense] > 0 &&
            groups[group].contains(sample.neurons[r.neuron].location))
          cells.push_back(&r);
    if (cells.empty()) {
      std::cout << "null";
      continue;
    }
    const bool tiring = fishsim::adapting_sense(sense);
    const double count = double(cells.size());
    // The course with every cell getting used `slower` times as slowly as it was drawn to.
    const auto run = [&](double slower, std::vector<double> &sent, std::vector<double> *used) {
      std::vector<double> mean(cells.size());
      sent.clear();
      for (const double s : stimulus) {
        double answer = 0, accustomed = 0;
        for (std::size_t c = 0; c < cells.size(); ++c) {
          const auto &r = *cells[c];
          answer += r.visual() ? fishsim::visual_response(r, s)
                               : fishsim::receptor_response(r, s, mean[c]) / r.senses[sense];
          accustomed += mean[c];
          if (tiring)
            mean[c] = fishsim::adapted_level(mean[c], s, r.adaptation_rate / slower);
        }
        sent.push_back(answer / count);
        if (used)
          used->push_back(accustomed / count);
      }
    };
    std::vector<double> sent, used;
    run(1, sent, &used);
    std::cout << '{';
    if (probe)
      std::cout << "\"probe\":" << met << ',';
    std::cout << "\"sent\":[";
    list(sent);
    std::cout << "],\"used\":[";
    list(used);
    std::cout << "],\"cells\":[";
    std::cout.precision(REPORT_DIGITS);
    for (std::size_t c = 0; c < cells.size(); ++c)
      std::cout << (c ? "," : "")
                << (cells[c]->intensity() ? cells[c]->response_threshold : cells[c]->threshold);
    std::cout.precision(SENSE_COURSE_DIGITS);
    std::cout << ']';
    // For cells that get used: at which step the last falls silent (past the course if never, 0
    // if none ever sends), for paces of getting used from the quickest to the slowest a cell can
    // have. A pace is the cells' steps of getting used on the geometric mean; moving the plan's
    // pace moves every drawn cell's by the same factor (substrate.hh, adaptation_steps).
    double drawn = 0;
    for (const auto *r : cells)
      drawn += r->adaptation_rate > 0 ? std::log(1 / r->adaptation_rate) : 0;
    if (tiring && std::all_of(cells.begin(), cells.end(),
                              [](const auto *r) { return r->adaptation_rate > 0; })) {
      drawn = std::exp(drawn / count);
      std::cout << ",\"silence\":[";
      for (int k = 0; k < SILENCE_PACES; ++k) {
        const double steps =
            field::ADAPTATION_MIN * std::pow(field::ADAPTATION_SPAN, k / (SILENCE_PACES - 1.));
        run(steps / drawn, sent, nullptr);
        const auto first = std::find_if(sent.begin(), sent.end(), [](double v) { return v > 0; });
        const auto quiet = first == sent.end()
                               ? sent.begin()
                               : std::find_if(first, sent.end(), [](double v) { return v <= 0; });
        std::cout << (k ? "," : "") << '[' << steps << ',' << quiet - sent.begin() << ']';
      }
      std::cout << ']';
    }
    std::cout << '}';
  }
  std::cout << ']';
  std::cout.precision(precision);
}
// The swim bladder as the atelier estimates it, over the fish's maturity with the rest of the
// blood from the life band: its capacity from the cells that are there (group_life), the lift of a
// full bladder (bladder_lift, as the fish moves), and how far one step at full command fills or
// empties it (bladder_fill_after, as the fish's step).
void bladder_estimate_report(const fishsim::BrainInterface &a, const field::Substrate &t,
                             const std::vector<Group> &groups,
                             const std::vector<const field::Neuron *> &cells,
                             const LearningContext &context,
                             const fishsim::PhysiologyParameters &physiology) {
  constexpr int SAMPLES = 32;
  std::vector<double> capacity_by_group(groups.size());
  double unassigned = 0;
  for (const auto &e : a.effectors) {
    if (e.port != fishsim::organ_port::bladder)
      continue;
    const auto &place = t.neurons[e.neuron].location;
    const auto found = std::find_if(groups.begin(), groups.end(),
                                    [&](const auto &g) { return g.contains(place); });
    if (found == groups.end())
      unassigned += e.strength;
    else
      capacity_by_group[found - groups.begin()] += e.strength;
  }
  const auto write_at = [&](double maturity) {
    auto blood = context;
    blood.maturity = maturity;
    double capacity = unassigned;
    for (std::size_t i = 0; i < capacity_by_group.size(); ++i)
      if (capacity_by_group[i] > 0 &&
          (!cells[i] || group_life(groups[i], *cells[i], blood).allowed()))
        capacity += capacity_by_group[i];
    const double lift = fishsim::bladder_lift(capacity, 1, physiology);
    std::cout << "{\"capacity\":" << capacity << ",\"liftFull\":" << lift << ",\"hover\":";
    if (lift > 0)
      std::cout << physiology.sinking / lift;
    else
      std::cout << "null";
    std::cout << ",\"fillStep\":" << fishsim::bladder_fill_after(0, capacity, 0, physiology)
              << ",\"emptyStep\":" << 1 - fishsim::bladder_fill_after(1, 0, capacity, physiology)
              << '}';
  };
  std::cout << ",\"bladderEstimate\":{\"sinking\":" << physiology.sinking << ",\"now\":";
  write_at(context.maturity);
  std::cout << ",\"life\":[";
  for (int i = 0; i <= SAMPLES; ++i) {
    if (i)
      std::cout << ',';
    write_at(double(i) / SAMPLES);
  }
  std::cout << "]}";
}
void gill_food_report(fishsim::Body body, const fishsim::BrainInterface &plan,
                      const GillScene &scene, const fishsim::PhysiologyParameters &physiology) {
  namespace fs = fishsim;
  body.mouth.opening = scene.opening;
  body.gill_signal = scene.pump;
  body.suction_strength = plan.capacities[fs::organ_port::suction];
  body.raker_density = plan.raker_density;
  body.gut_fill = scene.fullness * fs::gut_capacity(body);
  const bool opener = body.suction_strength > 0 &&
                      scene.suction * plan.stroke_capacity[fs::StrokeSuction] >=
                          physiology.stroke_threshold;
  const double water = fs::gill_water_at(body, scene.speed);
  // One mouth cycle in water at the reference plankton density and, for the sand probe,
  // one unobstructed stroke over sediment with one unit of food energy per unit of area.
  const double plankton = scene.feeding
                              ? water * fs::MOUTH_CYCLE_STEPS *
                                    fs::EnvironmentParameters{}.plankton_max_density
                              : 0,
               sediment = scene.feeding && opener && scene.opening > 0
                              ? fs::swallow_area_at(body, scene.speed) * fs::raker_passage(body) *
                                    scene.suction * plan.stroke_timing[fs::StrokeSuction].steps *
                                    fs::MOUTH_TRANSPORT_RATE
                              : 0;
  const auto plankton_food = fs::fodder(fs::food_kind::plankton, physiology);
  const auto sediment_food = fs::fodder(fs::food_kind::benthic, physiology);
  const double kept_plankton =
      std::min(plankton * fs::raker_retention(body), fs::gut_room(body, plankton_food));
  body.gut_fill += kept_plankton * plankton_food.fill;
  const double kept_sediment =
      std::min(sediment * fs::raker_sifting(body.raker_density), fs::gut_room(body, sediment_food));
  std::cout << ",\"gillFood\":{\"water\":" << water
            << ",\"plankton\":[" << plankton << ',' << kept_plankton << ']'
            << ",\"sediment\":[" << sediment << ',' << kept_sediment << "]}";
}
std::array<double, 2> spine_heights(const fishsim::BrainInterface &a,
                                    const fishsim::PhysiologyParameters &physiology) {
  const double rest =
      fishsim::resting_spine_height(a.capacities[fishsim::organ_port::defense],
                                    physiology.resting_spines, physiology.resting_spines_half);
  return {rest, std::max(rest, raised_spine_height(a, physiology))};
}

double spine_direction(int k) {
  return -fishsim::PI + (k + .5) * 2 * fishsim::PI / SPINE_DIRECTIONS;
}

void attack_probe_report(const fishsim::BrainInterface &a, const field::Substrate &t,
                         const SenseScene &attack) {
  const fishsim::PhysiologyParameters physiology{};
  const auto [rest, raised] = spine_heights(a, physiology);
  const auto density = fishsim::spine_density(a, t);
  // The mouth aperture is in units of the prey's collision radius. Absolute cost also
  // requires the unblocked damage of the bite, which this probe leaves unspecified.
  const double bearing = fishsim::radians(attack.bearing), gape = attack.distance;
  const float command = float(std::clamp(attack.strength, 0., 1.));
  const double active = command <= 0 ? rest
                        : command >= 1
                            ? raised
                            : std::max(rest, raised_spine_height(a, physiology, command));
  const auto report = [&](const char *name, double height) {
    const double held = fishsim::local_defense(height, density, bearing);
    const double cost = physiology.spine_block_cost * fishsim::BODY_TISSUE * held;
    std::cout << '"' << name << "\":{\"held\":" << held << ",\"height\":" << height
              << ",\"reservePerDamage\":" << cost
              << ",\"fits\":" << (gape >= 1 + height ? "true" : "false") << '}';
  };
  std::cout << ",\"attackProbe\":{";
  report("rest", rest);
  std::cout << ',';
  report("raised", raised);
  std::cout << ',';
  report("active", active);
  std::cout << ",\"spines\":[";
  for (int k = 0; k < SPINE_DIRECTIONS; ++k)
    std::cout << (k ? "," : "") << fishsim::local_defense(active, density, spine_direction(k));
  std::cout << ']';
  std::cout << '}';
}

fishsim::Body design_adult(const fishsim::BrainInterface &a) {
  fishsim::Body adult;
  adult.organ_mass = a.organ_mass;
  adult.tissue = fishsim::BODY_TISSUE;
  adult.gut_strength = a.capacities[fishsim::organ_port::gut];
  adult.gut_length = a.gut_length;
  adult.gill_strength = a.capacities[fishsim::organ_port::gills];
  adult.jaw_length = a.jaw_length;
  return adult;
}

std::vector<int> anatomy_report(const Genome &g, const std::vector<Group> &groups, bool developed,
                                const LearningContext *learning = nullptr,
                                const Receptor *body_growth = nullptr) {
  const auto &t = *g.blueprint;
  const auto &a = *g.interface;
  std::cout << ",\"hormoneTimes\":[";
  for (int k = 0; k < field::HORMONES; ++k)
    std::cout << (k ? "," : "") << a.hormone_timing[k].steps;
  std::cout << "],\"hormoneResidence\":[";
  for (int k = 0; k < field::HORMONES; ++k)
    std::cout << (k ? "," : "") << a.hormone_residence[k];
  std::cout << "],\"hormoneSources\":[";
  std::vector<field::Hormones> hormone_sources(groups.size());
  for (const auto &e : a.effectors) {
    if (e.port != fishsim::organ_port::gland)
      continue;
    const auto &place = t.neurons[e.neuron].location;
    const auto group = std::find_if(groups.begin(), groups.end(),
                                    [&](const auto &g) { return g.contains(place); });
    if (group == groups.end())
      continue;
    auto &source = hormone_sources[group - groups.begin()];
    for (int k = 0; k < field::HORMONES; ++k)
      source[k] += e.strength * e.hormones[k];
  }
  bool source_written = false;
  for (std::size_t i = 0; i < hormone_sources.size(); ++i) {
    const auto &source = hormone_sources[i];
    if (std::none_of(source.begin(), source.end(), [](double v) { return v > 0; }))
      continue;
    std::cout << (source_written ? ",[" : "[") << i;
    for (double share : source)
      std::cout << ',' << share;
    std::cout << ']';
    source_written = true;
  }
  // The estimate of each substance's level when all its glands pour at full drive from an empty
  // blood, then stop: it rises with the glands' cell time and falls with their residence, three
  // time constants each. Binding and a partial drive are left out.
  std::cout << "],\"hormoneCourse\":[";
  // How far each substance's level is worth showing: a little beyond what its glands reach, all
  // of it when nothing pours it. The receptor curves are drawn over the same span.
  std::array<double, field::HORMONES> hormone_span{};
  {
    constexpr int SAMPLES = 32;
    const double height = fishsim::PhysiologyParameters{}.hormones.height;
    for (int k = 0; k < field::HORMONES; ++k) {
      double drive = 0;
      for (const auto &source : hormone_sources)
        drive += source[k];
      const double rise = a.hormone_timing[k].steps, stay = a.hormone_residence[k],
                   target = std::min(1., height * drive), on = std::ceil(3 * rise),
                   off = std::ceil(3 * stay);
      std::cout << (k ? "," : "") << "{\"on\":" << on << ",\"off\":" << off << ",\"rise\":[";
      for (int i = 0; i <= SAMPLES; ++i)
        std::cout << (i ? "," : "")
                  << fishsim::HormoneState::approach(0, target, rise, on * i / SAMPLES);
      const double top = fishsim::HormoneState::approach(0, target, rise, on);
      // The span also reaches the level the life band sets, so its mark is never cut off.
      const double set = learning ? learning->levels[k] : 0.;
      hormone_span[k] = top > 0 || set > 0 ? std::clamp(1.25 * std::max(top, set), .02, 1.) : 1.;
      std::cout << "],\"fall\":[";
      for (int i = 0; i <= SAMPLES; ++i)
        std::cout << (i ? "," : "")
                  << fishsim::HormoneState::approach(top, 0, stay, off * i / SAMPLES);
      std::cout << "],\"span\":" << hormone_span[k] << '}';
    }
  }
  std::cout << ']';
  if (learning && body_growth)
    growth_curve(*body_growth, *learning, hormone_span);
  std::cout << ",\"pigmentTimes\":[";
  for (int k = 0; k < fishsim::rgb::count; ++k)
    std::cout << (k ? "," : "") << a.pigment_timing[k].steps;
  std::cout << "],\"motorTiming\":[";
  for (int k = 0; k < fishsim::STROKE_COUNT; ++k)
    std::cout << (k ? "," : "") << '[' << fishsim::STROKE_PORTS[k] << ','
              << a.stroke_timing[k].steps << ']';
  std::cout << ']';
  std::cout << ",\"light\":[";
  const double opponent = fishsim::EnvironmentParameters{}.vision_opponent;
  for (std::size_t i = 0; i < groups.size(); ++i) {
    const auto cell = nominal_light(groups[i]);
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
    // How much brighter (or darker) than its surround a thing must be for half an answer.
    std::cout << "],\"half\":";
    if (fishsim::spectral_drive(*cell, best_light, opponent) > 0)
      std::cout << fishsim::half_contrast(cell->response_threshold);
    else
      std::cout << "null";
    std::cout << '}';
  }
  std::cout << "],\"lightDimmest\":" << LIGHT_DIMMEST
            << ",\"contrastLeast\":" << fishsim::half_contrast(fishsim::tuning::threshold_min);
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
    const double threshold = intensity ? cell->response_threshold : cell->threshold;
    std::cout << "{\"intensity\":" << (intensity ? "true" : "false") << ",\"response\":[";
    for (int k = 0; k < SENSE_LEVELS; ++k)
      std::cout << (k ? "," : "")
                << fishsim::receptor_response(*cell, stimulus(k)) / cell->senses[sense];
    std::cout << "],\"begins\":" << threshold << ",\"adapt\":";
    if (fishsim::adapting_sense(sense) && cell->adaptation_rate > 0) {
      const double held = intensity ? ADAPT_HELD * threshold : 1, steps = 1 / cell->adaptation_rate,
                   every = ADAPT_SPAN * steps / ADAPT_SAMPLES;
      // The mean after `k` samples of a stimulus held from nothing.
      std::cout << "{\"steps\":" << steps << ",\"held\":" << held << ",\"every\":" << every
                << ",\"response\":[";
      for (int k = 0; k <= ADAPT_SAMPLES; ++k)
        std::cout << (k ? "," : "")
                  << fishsim::receptor_response(
                         *cell, held, held * (1 - std::pow(1 - cell->adaptation_rate, k * every))) /
                         cell->senses[sense];
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
                << fishsim::contact_width(r.spatial_width);
      if (sense != field::Flow) {
        std::cout << ",[";
        for (std::size_t sector = 0; sector < r.contact_weights.size(); ++sector)
          std::cout << (sector ? "," : "") << r.contact_weights[sector];
        std::cout << ']';
      }
      std::cout << ']';
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
  std::cout << ",\"finArms\":[";
  std::vector<std::array<bool, fishsim::fin::count>> fin_channels(groups.size());
  for (std::size_t i = 0; i < groups.size(); ++i) {
    double force = 0, lever = 0, arm = 0;
    for (const auto &e : a.effectors) {
      if ((e.port != fishsim::organ_port::turn && e.port != fishsim::organ_port::pelvic) ||
          !groups[i].contains(t.neurons[e.neuron].location))
        continue;
      force += e.strength;
      lever += e.strength * std::abs(e.lever);
      arm += e.strength * e.arm;
      fin_channels[i][fishsim::side_fin_index(e.port == fishsim::organ_port::pelvic,
                                               e.lever < 0 ? 0 : 1)] = true;
    }
    std::cout << (i ? "," : "");
    if (force > 0)
      std::cout << '[' << force << ',' << lever / force << ',' << arm / force << ']';
    else
      std::cout << "null";
  }
  std::cout << "],\"finChannels\":[";
  for (std::size_t i = 0; i < fin_channels.size(); ++i) {
    std::cout << (i ? ",[" : "[");
    bool first = true;
    for (int channel = fishsim::fin::left; channel < fishsim::fin::count; ++channel)
      if (fin_channels[i][channel]) {
        std::cout << (first ? "" : ",") << channel;
        first = false;
      }
    std::cout << ']';
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
    const auto [rest, raised] = spine_heights(a, physiology);
    std::cout << ",\"spineHeights\":[" << rest << ',' << raised << ']';
    for (const auto &[name, defense] : {std::pair{"spinesRest", rest}, {"spinesRaised", raised}}) {
      std::cout << ",\"" << name << "\":[";
      for (int k = 0; k < SPINE_DIRECTIONS; ++k)
        std::cout << (k ? "," : "") << fishsim::local_defense(defense, density, spine_direction(k));
      std::cout << ']';
    }
    std::cout << ",\"spineGroups\":[";
    for (int k = 0; k < SPINE_DIRECTIONS; ++k) {
      const int sector =
          int(std::lround(fishsim::sector_position(spine_direction(k)))) % fishsim::SECTOR_COUNT;
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
  fishsim::Body preview;
  preview.organ_mass = a.organ_mass;
  preview.tissue = fishsim::BODY_TISSUE;
  preview.suction_strength = a.suction_strength;
  preview.bite_strength = a.bite_strength;
  preview.jaw_length = a.jaw_length;
  preview.blunt_teeth = a.blunt_teeth;
  // Compare the reference food at a full opening stroke or bite and a fully paid command.
  preview.bite_signal = preview.mouth.flow = 1;
  std::cout << ",\"mouthForces\":[" << fishsim::bite_force(preview, fishsim::BiteKind::cutting)
            << ',' << fishsim::bite_force(preview, fishsim::BiteKind::grinding) << ','
            << fishsim::bite_force(preview, fishsim::BiteKind::loose) << ','
            << fishsim::scrape_force(preview) << ']';
  std::cout << ",\"barbelPlaces\":[";
  for (int side = 0; side < 2; ++side) {
    std::cout << (side ? "," : "");
    if (a.anatomy[fishsim::anatomy_column::barbel_left + side] > 0) {
      const auto tip = fishsim::barbel_tip(preview, a, side);
      std::cout << '[' << (tip.x - preview.x) / radius << ',' << (tip.y - preview.y) / radius
                << ']';
    } else
      std::cout << "null";
  }
  std::cout << ']';
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
  std::cout << ']';
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
  // The design as a young adult: how fast its gut muscle moves the gut's content, and what the
  // body costs at rest, weighs and can store as yolk, each split into what it comes from. The
  // nerve cells count as planned; their contacts exist only once the fish has developed.
  auto adult = design_adult(a);
  fishsim::Body hatchling;
  hatchling.organ_mass = a.organ_mass;
  hatchling.tissue = fishsim::HATCH_TISSUE;
  std::cout << "],\"hatchMaturity\":" << fishsim::body_maturity(hatchling);
  const fishsim::PhysiologyParameters physiology;
  const fishsim::EvolutionParameters evolution;
  const double basal = fishsim::basal_cost(adult.tissue, physiology),
               gut_size = fishsim::gut_size_factor(adult),
               gut_upkeep = fishsim::digestion::upkeep * gut_size * basal,
               muscle_upkeep =
                   fishsim::muscle_upkeep(a.muscle_maintenance, adult.tissue, physiology),
               one_cell_upkeep =
                   field::scaled_costs(t.options).neuron_maintenance * physiology.neural_cost,
               cell_upkeep = t.neurons.size() * one_cell_upkeep,
               yolk =
                   std::min(evolution.egg_capacity, evolution.egg_organ_capacity *
                                                        a.motor_counts[fishsim::organ_port::eggs]);
  double tail_maintenance = 0, bladder_maintenance = 0, gill_maintenance = 0;
  for (const auto &effector : a.effectors) {
    if (effector.port == fishsim::organ_port::forward)
      tail_maintenance += fishsim::effector_upkeep(effector);
    if (effector.port == fishsim::organ_port::bladder)
      bladder_maintenance += fishsim::effector_upkeep(effector);
    if (effector.port == fishsim::organ_port::gills)
      gill_maintenance += fishsim::effector_upkeep(effector);
  }
  const double rest = basal + gut_upkeep + muscle_upkeep + cell_upkeep,
               tail_upkeep = fishsim::muscle_upkeep(tail_maintenance, adult.tissue, physiology),
               bladder_upkeep =
                   fishsim::muscle_upkeep(bladder_maintenance, adult.tissue, physiology),
               gill_upkeep = fishsim::muscle_upkeep(gill_maintenance, adult.tissue, physiology);
  std::cout << ",\"budget\":{\"rest\":{\"basal\":" << basal << ",\"gut\":" << gut_upkeep
            << ",\"muscles\":" << muscle_upkeep << ",\"cells\":" << cell_upkeep
            << "},\"mass\":{\"tissue\":" << adult.tissue / fishsim::BODY_TISSUE
            << ",\"gut\":" << fishsim::digestion::wall_mass * gut_size
            << ",\"organs\":" << a.organ_mass << "},\"yolk\":{\"organ\":" << yolk
            << ",\"store\":" << fishsim::belly_room(adult) * yolk << ",\"minimum\":";
  // On a plan this includes its laid-out cells; contacts, CPPN work and the mother's incubation
  // are only known from a developed fish.
  if (g.viable())
    std::cout << fishsim::minimum_egg_energy(g, physiology, 0);
  else
    std::cout << "null";
  std::cout << "}}"
            << ",\"tail\":{\"restShare\":" << tail_upkeep / rest << '}'
            << ",\"bladder\":{\"restShare\":" << bladder_upkeep / rest << '}'
            << ",\"gills\":{\"restShare\":" << gill_upkeep / rest
            << ",\"pumpArea\":" << fishsim::gill_area(adult)
            << ",\"mouthAperture\":" << fishsim::maximum_mouth_aperture(adult) << ",\"forceScale\":"
            << adult.force_scale / (fishsim::body_scale(adult) * fishsim::MUSCLE_CELL_FORCE)
            << ",\"hasOpener\":"
            << (a.stroke_capacity[fishsim::StrokeSuction] >= physiology.stroke_threshold ? "true"
                                                                                        : "false")
            << '}';
  std::cout << ",\"gonads\":{\"eggs\":{\"fillDrive\":" << a.egg_parts[0]
            << ",\"releaseDrive\":" << a.egg_parts[1]
            << "},\"sperm\":{\"fillDrive\":" << a.sperm_parts[0]
            << ",\"releaseDrive\":" << a.sperm_parts[1] << ",\"store\":"
            << fishsim::organ_capacity(adult, g, fishsim::organ_port::sperm,
                                       physiology.sperm_capacity)
            << "}}";
  const auto &growth = t.growth_receptor;
  std::cout << ",\"gutSpeed\":" << fishsim::gut_speed(adult, physiology)
            << ",\"growth\":{\"sensitivity\":" << growth.sensitivity << ",\"half\":" << growth.half
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
  std::vector<const field::Neuron *> reference_cells(learning ? groups.size() : 0, nullptr);
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
      if (learning && !reference_cells[group[i]])
        reference_cells[group[i]] = &n;
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
        const int substance = groups[group[i]].receptors[effect].substance;
        if (substance == field::CELL_MATURITY)
          v.affinity += r.cell_maturity;
        else if (!r.cell_maturity)
          v.affinity += r.affinity[substance];
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
  std::vector<double> group_maintenance(groups.size());
  for (const auto &effector : a.effectors)
    if (group[effector.neuron] >= 0)
      group_maintenance[group[effector.neuron]] += fishsim::effector_upkeep(effector);
  std::cout << "],\"groups\":[";
  for (std::size_t i = 0; i < groups.size(); ++i) {
    if (i)
      std::cout << ',';
    const double upkeep = one_cell_upkeep * cells[i] +
                          fishsim::muscle_upkeep(group_maintenance[i], adult.tissue, physiology);
    std::cout << "{\"name\":" << json(groups[i].name) << ",\"sites\":" << sites[i]
              << ",\"cells\":" << cells[i] << ",\"restShare\":" << upkeep / rest
              << ",\"receptors\":[";
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
    if (learning)
      learning_group_report(groups[i], reference_cells[i], *learning, int(i), hormone_span);
    std::cout << '}';
  }
  std::cout << ']';
  adult.energy = fishsim::reserve_capacity(adult);
  fin_twitch_report(a, fishsim::body_mass(adult), physiology);
  if (learning)
    bladder_estimate_report(a, t, groups, reference_cells, *learning, physiology);
  return group;
}
void readiness_report(const fishsim::BrainInterface &a, const field::Substrate &t, bool developed) {
  std::cout << ",\"checks\":{\"sense\":" << (a.sensory_capacity > 0 ? "true" : "false")
            << ",\"swim\":" << (a.capacities[fishsim::organ_port::forward] > 0 ? "true" : "false")
            << ",\"mouth\":" << (a.suction_strength > 0 ? "true" : "false")
            << ",\"eggs\":" << (a.egg_parts[0] > 0 && a.egg_parts[1] > 0 ? "true" : "false")
            << ",\"sperm\":" << (a.sperm_parts[0] > 0 && a.sperm_parts[1] > 0 ? "true" : "false");
  if (developed)
    std::cout << ",\"connections\":" << (!t.edges.empty() ? "true" : "false");
  std::cout << ",\"resources\":" << (!t.resource_limited ? "true" : "false") << '}';
}
struct PreparedDesign {
  Plan plan;
  Genome g;

  explicit PreparedDesign(Plan source) : plan(std::move(source)) {
    g.blueprint = std::make_shared<const field::Substrate>(planned_substrate(plan.groups));
    g.interface = fishsim::body_interface(*g.blueprint);
  }
};

struct DesignQuery {
  std::optional<SightScene> sight;
  std::optional<SenseScene> sense;
  LearningContext learning;
  bool light_spread;
  std::vector<SenseCourse> courses;
};

DesignQuery read_design_query(std::istream &in) {
  auto flag = [&](const char *error) {
    int value = 0;
    ensure(bool(in >> value) && (value == 0 || value == 1), error);
    return value != 0;
  };
  const bool spread = flag("invalid light spread flag");
  std::optional<SightScene> sight;
  if (flag("invalid sight flag"))
    sight = read_sight(in);
  std::optional<SenseScene> sense;
  if (flag("invalid sense flag"))
    sense = read_sense_scene(in);
  auto learning = read_learning_context(in);
  return {sight, sense, std::move(learning), spread, read_sense_courses(in)};
}

void design_report(const PreparedDesign &design, const DesignQuery &query, bool probe_only,
                   SightDetail detail = SightDetail::full) {
  const auto &[sight, sense, learning, light_spread, courses] = query;
  const auto &[plan, g] = design;
  const auto &groups = plan.groups;
  ensure(!learning.probe || std::size_t(learning.probe->group) < groups.size(),
         "unknown learning probe group");
  const auto &t = *g.blueprint;
  std::cout << std::setprecision(REPORT_DIGITS) << '{';
  const auto *attack = sense && sense->kind == sense_scene::attack ? &*sense : nullptr;
  const auto *mouth = sense && sense->kind == sense_scene::mouth ? &*sense : nullptr;
  const auto *gills = sense && sense->kind == sense_scene::gills ? &sense->gills : nullptr;
  if (probe_only) {
    ensure(!light_spread, "spread requires an anatomy report");
    std::cout << "\"probeOnly\":true";
  } else {
    std::cout << "\"neurons\":" << t.neurons.size()
              << ",\"limited\":" << (t.resource_limited ? "true" : "false");
    readiness_report(*g.interface, t, false);
    anatomy_report(g, groups, false, &learning, &plan.growth);
  }
  if (light_spread) {
    const auto sample = light_example(plan);
    const auto binding = fishsim::body_interface(sample);
    light_spread_report(sample, *binding, groups, true);
  }
  if (sight) {
    // The illuminated probe sits in open water, beyond the range of the tank's boundaries.
    // This report describes the eyes separately. The aquarium can combine their frontal signals.
    fishsim::EnvironmentParameters optics;
    optics.vision_binocular_angle = 0;
    fishsim::Field water(SIGHT_TANK_SEED, 0, optics);
    water.initialize_aquarium(fishsim::tank::standard_width, fishsim::tank::standard_height);
    sight_report(t, g.interface, groups, *sight, water, detail);
  }
  std::vector<double> probed;
  if (mouth)
    mouth_course_report(g, *mouth);
  else if (attack)
    attack_probe_report(*g.interface, t, *attack);
  else if (gills)
    gill_food_report(design_adult(*g.interface), *g.interface, *gills, {});
  else if (sense)
    probed = sense_report(t, g.interface, groups, *sense);
  if (!courses.empty())
    sense_course_report(plan, t, *g.interface, courses, probed);
  std::cout << '}';
}

void serve_designs() {
  std::unique_ptr<PreparedDesign> design;
  std::string prepared_key, header;
  while (std::getline(std::cin, header)) {
    std::istringstream frame(header);
    std::string key, mode;
    std::streamsize bytes = 0;
    ensure(bool(frame >> mode >> key >> bytes) && bytes > 0, "invalid design frame");
    std::string body(std::size_t(bytes), '\0');
    ensure(bool(std::cin.read(body.data(), bytes)), "incomplete design request");
    std::istringstream in(std::move(body));
    std::ostringstream report;
    auto *output = std::cout.rdbuf(report.rdbuf());
    try {
      if (mode == "prepare") {
        const auto query = read_design_query(in);
        std::string name;
        auto next = std::make_unique<PreparedDesign>(read_plan(in, name, true));
        design_report(*next, query, false, SightDetail::studio);
        prepared_key = std::move(key);
        design = std::move(next);
      } else if (!design || key != prepared_key) {
        std::cout << "{\"planExpired\":true}";
      } else {
        ensure(mode == "probe" || mode == "sight" || mode == "report", "invalid design mode");
        const auto detail = mode == "sight"    ? SightDetail::answers
                            : mode == "report" ? SightDetail::studio
                                               : SightDetail::full;
        design_report(*design, read_design_query(in), mode != "report", detail);
      }
      std::cout.rdbuf(output);
      std::cout << report.str() << '\n' << std::flush;
    } catch (const std::exception &error) {
      std::cout.rdbuf(output);
      std::cout << "{\"designError\":" << json(error.what()) << "}\n" << std::flush;
    }
  }
}
void report(const Genome &g, const std::vector<Group> &groups, const Plan *plan,
            const AddressFit &fit, bool check_incubation) {
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
  readiness_report(a, t, true);
  if (check_incubation) {
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
  }
  fishsim::Body adult;
  adult.organ_mass = a.organ_mass;
  adult.tissue = fishsim::tissue_capacity(adult);
  std::cout << ",\"adultScale\":" << fishsim::growth_fraction(adult);
  auto group = anatomy_report(g, groups, true);
  light_spread_report(t, *g.interface, groups, false);
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
      << ",\"rate\":" << physiology.bladder_rate << '}';
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
  out << "{\"nutrientShare\":" << PhysiologyParameters::nutrient_share
      << ",\"nutrientKeep\":" << PhysiologyParameters::nutrient_keep << ",\"gut\":{";
  const PhysiologyParameters physiology;
  // What a resting gut of each length takes up of leaves and of flesh.
  const auto yield = [&](int food) {
    return [&physiology, food](double l) {
      return gut_yield(gut_stay(l, 1, physiology), fodder(food, physiology));
    };
  };
  row("plant", yield(food_kind::plant), true);
  row("meat", yield(food_kind::worm));
  row("size", [](double l) { return gut_size(l); });
  Body reference;
  reference.tissue = BODY_TISSUE;
  row("speed", [&](double share) {
    reference.gut_strength = share * physiology.gut_force;
    return gut_speed(reference, physiology);
  });
  out << ",\"speedMaxStrength\":" << physiology.gut_force
      << ",\"muscleCellForce\":" << MUSCLE_CELL_FORCE;
  out << "},\"foods\":{";
  // What each food is made of: its shares of the six stuffs, the rest being ballast.
  const std::pair<const char *, int> foods[] = {{"plant", food_kind::plant},
                                                {"algae", food_kind::algae},
                                                {"flock", food_kind::feed},
                                                {"plankton", food_kind::plankton},
                                                {"meat", food_kind::worm}};
  for (const auto &[name, food] : foods) {
    const auto f = fodder(food, physiology);
    out << (food == food_kind::plant ? "" : ",") << '"' << name
        << "\":{\"flesh\":" << f.stuff[digestion::flesh] << ",\"pulp\":" << f.stuff[digestion::pulp]
        << ",\"fibre\":" << f.stuff[digestion::fibre] << ",\"shell\":" << f.stuff[digestion::shell]
        << ",\"soft\":" << f.stuff[digestion::soft] << ",\"sap\":" << f.stuff[digestion::sap]
        << '}';
  }
  out << "},\"teeth\":{";
  row("grind", [](double b) { return tooth_grip(b, BiteKind::grinding); }, true);
  row("cut", [](double b) { return tooth_grip(b, BiteKind::cutting); });
  out << "},\"jaw\":{";
  row("aperture", [](double j) { return mouth_share(j) / mouth_share(TRAIT_MIDDLE); }, true);
  row("lever", [](double j) { return jaw_lever(j); });
  out << "}}";
  return out.str();
}

int main(int argc, char **argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "design-server") {
      std::ios::sync_with_stdio(false);
      serve_designs();
      return 0;
    }
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
                << ",\"hormones\":" << field::HORMONES
                << ",\"regulators\":" << field::BLOOD_SUBSTANCES
                << ",\"bloodSubstances\":" << field::BLOOD_SUBSTANCES
                << ",\"substanceTurns\":" << substance_turns_report()
                << ",\"visionRange\":" << fishsim::EnvironmentParameters{}.vision_range
                << ",\"visionSpectrum\":{\"samples\":" << LIGHT_HUES
                << ",\"opponent\":" << fishsim::EnvironmentParameters{}.vision_opponent << '}'
                << ",\"sightRadius\":[" << fishsim::PROBE_MIN_RADIUS << ','
                << fishsim::PROBE_MAX_RADIUS << ']' << ",\"nearDepth\":["
                << fishsim::proximity_depth(0) << ',' << fishsim::proximity_depth(1) << ']'

                << ",\"diet\":" << diet_report() << ",\"lateralRing\":" << lateral_ring_report()
                << ",\"gonads\":" << gonad_report() << ",\"buoyancy\":" << buoyancy_report()
                << ",\"tail\":{\"thrustFloor\":" << fishsim::MIN_THRUST_MASS
                << ",\"undulationLoss\":" << fishsim::PhysiologyParameters{}.undulation_loss
                << ",\"sedimentDrag\":{\"stiff\":" << fishsim::SEDIMENT_DRAG_STIFF
                << ",\"wriggling\":" << fishsim::SEDIMENT_DRAG_WRIGGLING << "}}"
                << ",\"biasScale\":" << field::Options{}.bias_scale
                << ",\"hormoneHeight\":" << fishsim::PhysiologyParameters{}.hormones.height
                << ",\"hormoneBinding\":" << fishsim::PhysiologyParameters{}.hormones.binding_rate
                << ",\"gutTime\":" << fishsim::PhysiologyParameters{}.gut_time
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
                << ",\"steepnessSpan\":" << field::HORMONE_STEEPNESS_SPAN << ",\"halfRange\":["
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
    const bool probe_only = argc == 3 && std::string(argv[2]) == "--probe-only";
    if ((argc == 2 || probe_only) && std::string(argv[1]) == "design") {
      const auto query = read_design_query(std::cin);
      std::string name;
      design_report(PreparedDesign(read_plan(std::cin, name, true)), query, probe_only);
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
    const bool check_incubation =
        operation == "build" && argc == 4 && std::string(argv[3]) == "--incubation";
    if (operation == "build" && (argc == 3 || check_incubation)) {
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
    report(g, groups, compiledPlan ? &*compiledPlan : nullptr, addressFit, check_incubation);
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
