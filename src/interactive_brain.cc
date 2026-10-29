#include "interactive_session.hh"
#include "session_io.hh"
#include "plants.hh"
#include "checkpoint.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "json_numbers.hh"
#include "interactive.hh"
#include "opencl.hh"
#include "ecology.hh"
#include "founder_pool.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include "observations.hh"
#include "hormone_view.hh"
#include "ecology_internal.hh"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <thread>
#include <poll.h>
#include <unistd.h>
namespace fishsim {
void InteractiveSession::write_brain_neurons(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  bool first = true;
  if (g.blueprint)
    for (std::size_t i = 0; brain_detail && i < g.blueprint->neurons.size(); ++i) {
      if (!first)
        out << ',';
      first = false;
      const auto &n = g.blueprint->neurons[i];
      out << '[' << n.x << ',' << n.y << ',' << int(n.role) << ','
          << (b.brain() ? (n.functions.sensory() > 0 ? b.brain()->signal(i) : b.brain()->state()[i])
                        : 0)
          << ',' << (n.functional ? 1 : 0) << ',' << i << ',' << n.id << ','
          << (!b.development() || b.development()->neuron_ready(n.id) ? 1 : 0) << ',' << n.z << ','
          << (n.role == field::Role::Effector ? ([&]() {
               int port = -1;
               float weight = -1;
               for (const auto &e : g.interface->effectors)
                 if (e.neuron == i && e.strength > weight) {
                   weight = e.strength;
                   port = e.port;
                 }
               return port;
             }())
                                              : -1)
          << ',' << (b.brain() && b.brain()->muted(i) ? 1 : 0) << ',' << n.strength << ','
          << n.functions.internal << ",[";
      for (int k = 0; k < field::SENSE_COUNT; ++k) {
        if (k)
          out << ',';
        float sense = n.functions.senses[k];
        if (n.functions.senses[field::InnerPressure] > 0) {
          for (const auto &r : b.active_interface(g).sensory)
            if (r.neuron == i) {
              sense = r.senses[k];
              break;
            }
        }
        out << sense;
      }
      out << "],[";
      for (int k = 0; k < field::MOTOR_COUNT; ++k) {
        if (k)
          out << ',';
        out << n.functions.motors[k];
      }
      const bool stroking =
          n.role == field::Role::Effector &&
          std::any_of(g.interface->effectors.begin(), g.interface->effectors.end(),
                      [&](const auto &e) {
                        return e.neuron == i && (e.port == 7 || e.port == 13 ||
                                                 std::find(STROKE_PORTS.begin(), STROKE_PORTS.end(),
                                                           e.port) != STROKE_PORTS.end());
                      });
      const double tau = n.role == field::Role::Nerve || n.role == field::Role::Sensor || stroking
                             ? field::time_constant_steps(n.parameters)
                             : 0.;
      out << "]," << n.bias << ',' << tau << ",[";
      for (int k = 0; k < 5; ++k) {
        if (k)
          out << ',';
        out << n.identity[k];
      }
      out << "],0,0,[" << n.parameters.threshold << ',' << n.parameters.capacity << ','
          << n.parameters.quality1 << ',' << n.parameters.quality2 << ','
          << n.parameters.quality_width << ',' << n.parameters.field_width << ','
          << n.parameters.time_constant << ',' << n.parameters.dendrites << ','
          << n.parameters.plasticity << "]," << n.functions.usable << ',' << n.role_margin << ','
          << n.role_gain << ',' << n.location.zone << ",[" << n.sender[0] << ',' << n.sender[1]
          << "],[" << n.receiver[0] << ',' << n.receiver[1] << "],[";
      for (int k = 0; k < field::HORMONE_EFFECTS; ++k) {
        if (k)
          out << ',';
        out << n.hormone_receptors[k].response(b.hormones().levels(),
                                               b.tissue / std::max(1e-9, tissue_capacity(b)));
      }
      out << "],[" << n.location.u << ',' << n.location.v << ',' << n.location.w << ','
          << n.location.side << "]," << (b.brain() && b.brain()->dead(i) ? 1 : 0) << ','
          << (b.brain() ? b.brain()->synaptic_mean(i) : 0) << ',' << n.expression << ','
          << n.search_width << ',' << n.crossing << ',' << n.range << ']';
    }
}
void InteractiveSession::write_brain_receptors(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  if (brain_detail && g.interface)
    for (std::size_t i = 0; i < g.interface->sensory.size(); ++i) {
      if (i)
        out << ',';
      const auto &r = b.active_interface(g).sensory[i];
      const double width = r.width, left = r.view_left, right = r.view_right;
      out << '[' << r.neuron << ',' << r.channel << ',' << r.angle << ','
          << (i < b.perception().sensor_buffer.size() ? b.perception().sensor_buffer[i] : 0) << ','
          << r.threshold << ',' << r.gain << ',' << width << ',' << r.senses[r.channel] << ','
          << r.hue << ",[";
      for (int sense = 0; sense < field::SENSE_COUNT; ++sense) {
        if (sense)
          out << ',';
        out << r.senses[sense];
      }
      out << "],[";
      const auto &n = g.blueprint->neurons[r.neuron];
      for (int axis = 0; axis < 5; ++axis) {
        if (axis)
          out << ',';
        out << n.identity[axis];
      }
      out << "]," << left << ',' << right << ',' << r.response_threshold << ",[";
      for (int k = 0; k < 8; ++k) {
        if (k)
          out << ',';
        out << r.scents[k];
      }
      out << "]," << n.parameters.quality2 << ',' << n.parameters.quality1 << ",[" << r.spectrum[0]
          << ',' << r.spectrum[1] << ',' << r.spectrum[2] << "]," << r.longitudinal << ','
          << r.lateral << ',' << r.mechanical_angle << ",[";
      for (int k = 0; k < field::BLOOD_SUBSTANCES; ++k) {
        if (k)
          out << ',';
        out << r.hormones[k];
      }
      out << "]," << r.pressure_kind << "," << r.pressure_target << "," << (r.proximity ? 1 : 0)
          << "]";
    }
}
void InteractiveSession::write_brain_summary(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << "{\"id\":" << chosen->id << ",\"hatch_reserve\":";
  auto reserve = chosen->developing()
                     ? predicted_hatch_reserve(b, g, world.physiology().neural_cost)
                     : std::nullopt;
  if (reserve)
    out << *reserve;
  else
    out << "null";
  out << ",\"embryo\":{\"shell\":" << b.embryo.shell << ",\"pressure\":" << b.embryo.pressure
      << ",\"exposure\":" << ([&] {
           double progress = 0;
           if (!g.interface || g.interface->sensory.empty())
             return b.hatched ? 1. : 0.;
           for (const auto &r : g.interface->sensory)
             progress += birth_exposure(b, r.time_steps);
           return progress / g.interface->sensory.size();
         })()
      << ",\"reserve\":" << hatch_search_reserve(b) << ",\"secretion\":" << b.embryo.secretion
      << "}";
  out << ",\"bite_signal\":" << b.bite_signal << ",\"mouth_aperture\":" << mouth_aperture(b)
      << ",\"maximum_mouth_aperture\":" << maximum_mouth_aperture(b)
      << ",\"mouth_phase\":" << b.mouth.phase << ",\"mouth_opening\":" << b.mouth.opening
      << ",\"pump_flow\":" << b.mouth.flow << ",\"transport_budget\":" << b.mouth.budget
      << ",\"transport_credit\":" << b.mouth.credit
      << ",\"mouth_reach\":" << mouth_reach(b) * world.physiology().suction_range
      << ",\"bite_strength\":" << b.bite_strength << ",\"jaw_length\":" << b.jaw_length
      << ",\"gut_length\":" << b.gut_length << ",\"blunt_teeth\":" << b.blunt_teeth
      << ",\"undulation\":" << b.undulation << ",\"suction_strength\":" << b.suction_strength
      << ",\"soft_bite_force\":" << bite_force(b) << ",\"hard_bite_force\":" << bite_force(b, true)
      << ",\"scrape_force\":" << scrape_force(b) << ",\"end_tissue\":" << tissue_capacity(b)
      << ",\"gut_energy\":" << b.gut_energy << ",\"gut_digestible\":" << b.gut_digestible
      << ",\"digestion\":" << b.digestion << ",\"digested\":" << b.digested
      << ",\"digestion_net\":" << (1 - PhysiologyParameters::digestion_cost) * b.digestion
      << ",\"gut_transit\":" << gut_transit(b, world.physiology());
  out << ",\"model\":" << json_quoted("cppn") << ",\"hatched\":" << (b.hatched ? "true" : "false")
      << ",\"fertilised\":" << (chosen->fertilised ? "true" : "false")
      << ",\"clonal\":" << (chosen->clonal ? "true" : "false")
      << ",\"egg_role\":" << (b.reproduction().egg_role ? "true" : "false")
      << ",\"father\":" << chosen->father << ",\"spawn_signal\":" << b.reproduction().spawn_signal
      << ",\"sperm_signal\":" << b.reproduction().sperm_signal << ",\"eat_signal\":" << b.eat_signal
      << ",\"egg_readiness\":" << b.reproduction().egg_readiness
      << ",\"sperm_readiness\":" << b.reproduction().sperm_readiness
      << ",\"eggs_eaten\":" << b.eggs_eaten << ",\"health\":" << b.health
      << ",\"tissue\":" << b.tissue << ",\"peak_tissue\":" << std::max(b.peak_tissue, b.tissue)
      << ",\"tissue_floor\":" << tissue_floor(b) << ",\"aggression\":" << b.motor().aggression
      << ",\"active_defense\":" << b.motor().defense << ",\"defense\":" << b.defense()
      << ",\"combat_cost\":" << b.motor().combat_cost << ",\"color\":[" << b.color[0] << ','
      << b.color[1] << ',' << b.color[2] << "],\"readiness\":" << b.reproduction().readiness
      << ",\"novelty\":" << chosen->novelty
      << ",\"progress\":" << (b.development() ? b.development()->progress() : 0)
      << ",\"viable\":" << (!g.blueprint || g.viable() ? "true" : "false")
      << ",\"diagnostic\":" << json_quoted(g.blueprint ? g.blueprint->diagnostic : "")
      << ",\"maturation_ticks\":" << (b.development() ? b.development()->ticks() : 0)
      << ",\"hatch_age\":" << b.hatch_age << ",\"maintenance\":"
      << (b.development() ? b.development()->running_cost() * world.physiology().neural_cost : 0)
      << ",\"movement_cost\":" << b.ledger().movement_cost
      << ",\"development_cost\":" << b.ledger().development_cost << ",\"birth_cost\":"
      << (b.development() ? b.development()->birth_cost() * world.physiology().neural_cost : 0)
      << ",\"motor_factor\":" << b.motor().motor_factor << ",\"thrust\":" << b.motor().thrust
      << ",\"turn\":" << b.motor().turn << ",\"contact\":" << b.reproduction().contact
      << ",\"nutrient_flow\":" << b.nutrient_flow
      << ",\"runtime_bytes\":" << (b.brain() ? b.brain()->runtime_bytes() : 0)
      << ",\"innovation_period\":" << (g.cppn ? g.cppn->history()->generation() : 0)
      << ",\"cppn_nodes\":" << (g.cppn ? g.cppn->nodes() : 0)
      << ",\"planning\":" << (!g.blueprint ? "true" : "false")
      << ",\"planning_queries\":" << g.pending_queries()
      << ",\"neuron_count\":" << (g.blueprint ? g.blueprint->neurons.size() : 0)
      << ",\"edge_count\":"
      << (b.brain()     ? b.brain()->synapse_count()
          : g.blueprint ? g.blueprint->edges.size()
                        : 0)
      << ",\"recurrent_edges\":" << (g.blueprint ? g.blueprint->recurrent_edges : 0)
      << ",\"internal_neurons\":"
      << (g.blueprint ? std::count_if(g.blueprint->neurons.begin(), g.blueprint->neurons.end(),
                                      [](const auto &n) { return n.role == field::Role::Nerve; })
                      : 0)
      << ",\"built_neurons\":"
      << (g.blueprint ? std::count_if(g.blueprint->neurons.begin(), g.blueprint->neurons.end(),
                                      [&](const auto &n) {
                                        return b.development() &&
                                               b.development()->neuron_ready(n.id);
                                      })
                      : 0)
      << ",\"node_budget\":" << g.development_options.max_nodes
      << ",\"edge_budget\":" << g.development_options.max_edges
      << ",\"architecture\":{\"sites\":360" << ",\"mutation_step\":" << g.mutation_step << '}';
}
void InteractiveSession::write_brain_layout(std::ostream &out, const Individual *chosen) {
  const auto &g = chosen->genome;
  bool first = true;
  out << ",\"layout\":{\"receptors\":[";
  write_brain_receptors(out, chosen);

  out << "],\"effectors\":[";
  if (g.interface)
    for (std::size_t i = 0; i < g.interface->effectors.size(); ++i) {
      if (i)
        out << ',';
      const auto &e = g.interface->effectors[i];
      out << '[' << e.neuron << ',' << e.port << ',' << e.threshold << ',' << e.strength << ','
          << e.lever << ',' << (e.quality + 1) * 180 << ',' << e.outside << ']';
    }
  out << "],\"focus\":" << neuron_focus << ",\"motor_counts\":[";
  for (int port = 0; port < 14; ++port) {
    if (port)
      out << ',';
    out << (g.interface ? g.interface->motor_counts[port] : 0);
  }
  out << "],\"neurons\":[";
  first = true;
  write_brain_neurons(out, chosen);
  // synapses: [source, target, strength at formation, id]; with a brain its current synapses (id:
  // slot), before that the synapses of the blueprint (id: index)
  out << "],\"edges\":[";
  first = true;
  if (brain_detail && chosen->body.brain())
    for (const auto &e : chosen->body.brain()->synapses()) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << e.source << ',' << e.target << ',' << e.formed << ',' << e.slot << ']';
    }
  else if (brain_detail && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->edges.size(); ++i) {
      if (!first)
        out << ',';
      first = false;
      const auto &e = g.blueprint->edges[i];
      out << '[' << e.source << ',' << e.target << ',' << e.weight << ',' << i << ']';
    }
  out << "]}";
}
void InteractiveSession::write_brain_activity(std::ostream &out, const Individual *chosen) {
  const auto &g = chosen->genome;
  const auto &b = chosen->body;
  const auto &f = world.field;
  std::size_t nearby_eggs = 0;
  for (const auto &egg : world.fish)
    if (egg.body.alive && !egg.body.hatched && !egg.nutrient_egg &&
        (egg.species ? egg.species : egg.maternal_species) == chosen->species &&
        std::hypot(f.delta_x(egg.body.x - b.x), egg.body.y - b.y) <= world.evo.egg_crowding_radius)
      ++nearby_eggs;
  out << ",\"motor_pulses\":[";
  for (int j = 0; j < field::MOTOR_COUNT; ++j) {
    if (j)
      out << ',';
    out << int(b.motor().motor_pulses[j]);
  }
  out << ']';
  out << ",\"stroke_threshold\":" << world.physiology().stroke_threshold << ",\"strokes\":[";
  for (int j = 0; g.interface && j < STROKE_COUNT; ++j) {
    if (j)
      out << ',';
    const auto &stroke = b.motor().strokes[j];
    out << '[' << stroke.mean << ',' << stroke.recovery << ',' << stroke.power << ','
        << g.interface->stroke_timing[j].steps << ']';
  }
  out << "],\"velocity\":[" << b.motor().vx << ',' << b.motor().vy << "],\"water_velocity\":["
      << b.motor().water_vx << ',' << b.motor().water_vy << "],\"contact_vector\":["
      << b.motor().contact_x << ',' << b.motor().contact_y
      << "],\"sperm_laying\":" << (b.reproduction().sperm_laying ? "true" : "false");
  out << ",\"egg_laying\":" << (b.reproduction().egg_laying ? "true" : "false")
      << ",\"egg_nearby\":" << nearby_eggs << ",\"egg_nutrient\":"
      << (b.reproduction().egg_yolk > 0 &&
                  b.reproduction().egg_yolk <
                      world.evo.nutrient_egg_threshold *
                          funding(g, world.physiology().neural_cost, HATCH_TISSUE)
              ? "true"
              : "false");
  out << ",\"gonad_filling\":" << gonad_filling(b) << ",\"gut_fill\":" << b.gut_fill
      << ",\"gut_capacity\":" << gut_capacity(b) << ",\"satiety\":" << gut_filling(b)
      << ",\"damage\":" << (1 - b.health) << ",\"bladder_fill\":" << b.bladder_fill
      << ",\"bladder_capacity\":" << b.bladder_capacity
      << ",\"buoyancy_force\":" << b.buoyancy_force
      << ",\"egg_release\":" << (b.reproduction().egg_release ? "true" : "false")
      << ",\"sperm_release\":" << (b.reproduction().sperm_release ? "true" : "false");
  const auto now = Clock::now();
  if (hormone_fish != chosen->id || hormone_context != view_context ||
      now - hormone_sent >= std::chrono::milliseconds(200)) {
    hormone_fish = chosen->id;
    hormone_context = view_context;
    hormone_sent = now;
    out << ",\"hormones\":";
    const auto *species = world.find_species(chosen->species);
    write_hormone_state(out, b.hormones(), species ? &species->hormones : nullptr);
  }
}
void InteractiveSession::write_brain_learning(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << ",\"learning\":{\"steps\":" << (b.brain() ? b.brain()->learning_steps() : 0)
      << ",\"cells\":" << (b.brain() ? b.brain()->learning_neurons() : 0)
      << ",\"changed\":" << (b.brain() ? b.brain()->learned_connections() : 0) << ",\"weights\":[";
  // current strength per synapse [slot, weight]; contribution (signal x strength) per slot;
  // per cell [surprise of its last learning step, post deviation]
  if (brain_detail && b.brain()) {
    bool first = true;
    for (const auto &e : b.brain()->synapses()) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << e.slot << ',' << e.weight << ']';
    }
  }
  out << "],\"signals\":[";
  if (brain_detail && b.brain() && b.brain()->has_contributions())
    for (std::size_t i = 0; i < b.brain()->slot_count(); ++i) {
      if (i)
        out << ',';
      out << b.brain()->contribution(i);
    }
  out << "],\"surprise\":[";
  if (brain_detail && b.brain() && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->neurons.size(); ++i) {
      if (i)
        out << ',';
      out << '[' << b.brain()->surprise(i) << ',' << b.brain()->learning_contrast(i) << ']';
    }
  out << "]}";
}
void InteractiveSession::write_brain_senses(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << ",\"sensory_components\":[";
  if (g.interface)
    for (std::size_t i = 0; i < b.perception().sensory_components.size(); ++i) {
      if (i)
        out << ',';
      out << '[' << g.interface->sensory[i].neuron;
      for (auto v : b.perception().sensory_components[i])
        out << ',' << v;
      out << ']';
    }
  out << "],\"lateral_samples\":[";
  for (int k = 0; k < 4; ++k) {
    if (k)
      out << ',';
    out << '[';
    for (int j = 0; j < 5; ++j) {
      if (j)
        out << ',';
      out << b.perception().lateral_samples[k][j];
    }
    out << ']';
  }
  out << "],\"nose_samples\":[";
  for (int k = 0; k < 2; ++k) {
    if (k)
      out << ',';
    out << '[';
    for (int j = 0; j < 11; ++j) {
      if (j)
        out << ',';
      out << b.perception().nose_samples[k][j];
    }
    out << ']';
  }
  out << ']';
}
void InteractiveSession::write_brain_probe(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << ",\"layout_id\":" << json_quoted(render_epoch + ":" + std::to_string(layout_revision))
      << ",\"neuron_state\":[";
  if (brain_detail && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->neurons.size(); ++i) {
      if (i)
        out << ',';
      const auto &n = g.blueprint->neurons[i];
      out << '['
          << (b.brain() ? (n.functions.sensory() > 0 ? b.brain()->signal(i) : b.brain()->state()[i])
                        : 0)
          << ',' << (!b.development() || b.development()->neuron_ready(n.id) ? 1 : 0) << ','
          << (b.brain() && b.brain()->muted(i) ? 1 : 0) << ','
          << (b.brain() ? b.brain()->state()[i] : 0) << ','
          << (b.brain() ? b.brain()->signal(i) : 0) << ']';
    }
  out << "],\"stimulus_revision\":" << stimulus_revision
      << ",\"inspection\":" << (brain_mode ? "true" : "false")
      << ",\"probe\":{\"kind\":" << b.perception().probe.kind
      << ",\"sense\":" << b.perception().probe.sense
      << ",\"remaining\":" << b.perception().probe.remaining << ",\"x\":" << b.perception().probe.x
      << ",\"y\":" << b.perception().probe.y << ",\"radius\":" << b.perception().probe.radius
      << ",\"energy\":" << b.perception().probe.energy
      << ",\"value\":" << b.perception().probe.value << ",\"color\":["
      << b.perception().probe.color[0] << ',' << b.perception().probe.color[1] << ','
      << b.perception().probe.color[2] << "],\"scents\":[";
  for (int k = 0; k < 8; ++k) {
    if (k)
      out << ',';
    out << b.perception().probe.scents[k];
  }
  out << "]},\"sensor_state\":[";
  if (brain_detail && g.interface)
    for (std::size_t i = 0; i < g.interface->sensory.size(); ++i) {
      if (i)
        out << ',';
      out << (i < b.perception().sensor_buffer.size() ? b.perception().sensor_buffer[i] : 0);
    }
}
void InteractiveSession::write_eye_view(std::ostream &out, const Individual *chosen) {
  out << ",\"vision\":";
  if (!chosen || !chosen->body.hatched || !chosen->genome.interface) {
    out << "null";
    return;
  }
  const auto &state = chosen->body.perception();
  out << "{\"id\":" << chosen->id << ",\"x\":" << state.visual_x << ",\"y\":" << state.visual_y
      << ",\"heading\":" << state.visual_angle << ",\"range\":" << state.visual_range
      << ",\"enabled\":" << (state.disabled_senses[0] ? "false" : "true") << ",\"eyes\":[";
  for (int side = 0; side < 2; ++side) {
    if (side)
      out << ',';
    const auto &eye = state.visual_eyes[side];
    if (!eye.present || !std::isfinite(eye.left) || !std::isfinite(eye.right))
      out << "null";
    else
      out << '[' << eye.x << ',' << eye.y << ',' << eye.exposure << ',' << eye.left << ','
          << eye.right << ']';
  }
  out << "],\"bands\":[";
  // Match the angular resolution of the tank overlay before crossing the process boundary.
  constexpr int count = 128;
  constexpr double step = 2 * PI / count;
  struct Pixel {
    std::array<double, 3> color{};
    double width = 0, distance = 0;
  };
  std::array<std::array<Pixel, count>, 2> raster{};
  for (const auto &band : state.visual_image) {
    if (band.eye < 0 || band.eye > 1 || band.distance <= 0)
      continue;
    const double left = band.left + PI, right = band.right + PI;
    for (int k = int(std::floor(left / step)); k * step < right; ++k) {
      const double width = std::min(right, (k + 1) * step) - std::max(left, k * step);
      if (width <= 0)
        continue;
      auto &pixel = raster[band.eye][(k % count + count) % count];
      for (int c = 0; c < 3; ++c)
        pixel.color[c] += band.color[c] * width;
      pixel.width += width;
      pixel.distance = pixel.distance > 0 ? std::min(pixel.distance, band.distance) : band.distance;
    }
  }
  bool first = true;
  for (int side = 0; side < 2; ++side)
    for (int k = 0; k < count; ++k) {
      const auto &pixel = raster[side][k];
      if (pixel.width <= 0)
        continue;
      if (!first)
        out << ',';
      first = false;
      out << '[' << k * step - PI << ',' << (k + 1) * step - PI;
      for (auto c : pixel.color)
        out << ',' << c / pixel.width;
      out << ',' << side << ',' << pixel.distance << ']';
    }
  out << "]}";
}
void InteractiveSession::write_brain_vision(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  out << "],\"visual_contributions\":[";
  for (std::size_t i = 0; i < b.perception().visual_contributions.size(); ++i) {
    if (i)
      out << ',';
    const auto &h = b.perception().visual_contributions[i];
    out << '[' << h.neuron << ',' << h.kind << ',' << h.id << ',' << h.x << ',' << h.y << ','
        << h.radius << ',' << h.light;
    for (auto c : h.color)
      out << ',' << c;
    out << ']';
  }
  out << "],\"visual_samples\":[";
  for (std::size_t i = 0; i < b.perception().visual_samples.size(); ++i) {
    if (i)
      out << ',';
    const auto &sample = b.perception().visual_samples[i];
    out << '[' << sample.neuron << ',' << sample.light << ',' << sample.stimulus << ','
        << sample.response;
    for (auto c : sample.color)
      out << ',' << c;
    out << ']';
  }
  out << "]}";
}
void InteractiveSession::write_brain(std::ostream &out, const Individual *chosen,
                                     bool force_layout) {
  out << ",\"brain\":";
  if (!chosen || chosen->nutrient_egg)
    out << "null";
  else {
    const auto &g = chosen->genome;
    // the layout is sent again when the plan changes, and at most every two seconds when the
    // brain's synapses have changed (they vanish and form during life)
    const auto now = Clock::now();
    const std::uint64_t wiring =
        chosen->body.brain() ? chosen->body.brain()->wiring_revision() + 1 : 0;
    const bool plan_changed =
        !layout_revision || sent_fish != chosen->id || sent_plan != g.blueprint ||
        sent_detail != brain_detail ||
        (wiring != sent_wiring && now - wiring_sent >= std::chrono::seconds(2));
    if (plan_changed) {
      sent_fish = chosen->id;
      sent_plan = g.blueprint;
      sent_detail = brain_detail;
      sent_wiring = wiring;
      wiring_sent = now;
      ++layout_revision;
    }
    const bool layout_changed = plan_changed || force_layout;
    write_brain_summary(out, chosen);
    if (layout_changed) {
      write_brain_layout(out, chosen);
    }
    write_brain_activity(out, chosen);
    write_brain_learning(out, chosen);
    write_brain_senses(out, chosen);
    write_brain_probe(out, chosen);
    write_brain_vision(out, chosen);
  }
}
}
