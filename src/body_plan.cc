#include "protocol_schema.hh"
#include "body_plan.hh"
#include "retina.hh"
#include "eye_geometry.hh"
#include "physiology.hh"
#include "receptor_tuning.hh"
#include "muscle_fibre.hh"
#include "field/development_sites.hh"
#include "field/retinal_tissue.hh"
#include <limits>
#include <map>
#include <numeric>
namespace fishsim {
namespace {
constexpr double SENSOR_MASS = .001, MUSCLE_MASS = .007;
// A muscle cell stands for a whole muscle segment: it pulls four times as hard as one fibre, and
// its mass, upkeep and work grow with it.
constexpr float MUSCLE_CELL_FORCE = 4;
constexpr double NOSE_AHEAD = .8, LATERAL_PROBE = .5;
// Steps the water at a nostril has taken to reach it: it carries the scent of the place it left
// that long ago.
constexpr double NOSTRIL_FLUSH_STEPS = 8;
constexpr double EARLY_THRESHOLD = .3, LATE_THRESHOLD = .7, SPAN_WEIGHT = .25, DIRECTION_GAP = .08;
constexpr double GUT_FRONT = .025, GUT_BACK = .93, GUT_MIN_HALF = .03, GUT_MIN_BREADTH = .035,
                 GUT_BREADTH = .72, GUT_OFFSET = .3, GUT_SWING = .48, GUT_LOOPS = .5,
                 GUT_LOOPS_GAIN = 2.5;
constexpr std::size_t eye_color_column(int side) {
  return anatomy_column::red_left + 3 * std::size_t(side);
}
// Muscles that do work by contracting, spine erectors included, follow the fibre rules.
constexpr bool contractile(int motor) {
  return field::muscle_motor(motor) || motor == field::Defense;
}
constexpr bool contractile_port(int port) {
  return port == organ_port::forward || port == organ_port::turn || port == organ_port::pelvic ||
         port == organ_port::suction || port == organ_port::jaw || port == organ_port::defense ||
         port == organ_port::gills || port == organ_port::gut;
}
// Pumping cells on the flanks of the head move the gill covers; inside and below they open the
// mouth.
bool gill_cell(int motor, const cppn::Point &p) {
  return motor == field::Suction && field::development_surface(p) && p.w > gill_filter::flank;
}
// Fin cells on the midline inside the trunk lie on the gut: they move its contents along.
bool gut_cell(int motor, const cppn::Point &p) {
  return motor == field::Turn && !field::development_surface(p) && p.zone == digestion::zone &&
         p.w < digestion::wall;
}
// Muscle tissue weighs and costs its upkeep by its cells, whatever force their fibres give.
double effector_tissue(const BrainInterface::Effector &e) {
  return contractile_port(e.port) ? e.strength / fibre::force(e.fibre) : e.strength;
}
}
double effector_upkeep(const BrainInterface::Effector &e) {
  if (e.port == organ_port::pigment)
    return BrainInterface::pigment_upkeep_per_capacity * e.strength;
  return BrainInterface::muscle_upkeep_per_capacity *
         (contractile_port(e.port) ? fibre::upkeep(e.fibre) : 1.) * effector_tissue(e);
}
static void prepare_contacts(const Body &b, SensoryFrame &f) {
  for (int k = 0; k < SECTOR_COUNT; ++k)
    if (b.perception().touch_ring[k] > 0) {
      f.contact_ring = true;
      f.touch[k] = b.perception().touch_ring[k];
      f.impact_ring[k] = b.perception().impact_ring[k];
    }
}
bool has_required_organs(const field::Substrate &s) {
  double senses = 0, forward = 0, mouth = 0;
  std::array<double, 2> eggs{}, sperm{};
  for (const auto &n : s.neurons) {
    senses += n.strength * n.functions.usable * n.functions.sensory();
    const double strength = n.strength * n.parameters.capacity * n.functions.usable;
    forward += strength * n.functions.motors[field::Forward];
    mouth += strength * n.functions.motors[field::Suction];
    const float outside = field::development_surface(n.location) ? 1.f : 0.f;
    for (int j = 0; j < 2; ++j) {
      const double share = j ? outside : 1 - outside;
      eggs[j] += share * strength * n.functions.motors[field::Eggs];
      sperm[j] += share * strength * n.functions.motors[field::Sperm];
    }
  }
  return senses > 0 && forward > 0 && mouth > 0 &&
         ((eggs[0] > 0 && eggs[1] > 0) || (sperm[0] > 0 && sperm[1] > 0));
}
namespace {
// A tail cell on the midline pulls on both flanks alike.
double flank_share(const BrainInterface::Effector &e, int side) {
  return e.lever == 0 ? .5 : (e.lever < 0 ? 0 : 1) == side ? 1 : 0;
}
}
// A side fin cell beats at its angle (its first quality: straight back at 0, outward up to the
// full angle at 1, inward at -1). Along the body its force pushes the fish and turns it with the
// cell's lever, as an oar does; across the body it pushes the fish away from the fin's side and
// turns it with the cell's arm ahead of or behind the body's middle. A tail flank bends the body
// with the lever of its cells.
void fin_mechanics(BrainInterface &a) {
  std::array<double, STROKE_COUNT> force{}, along{}, across{}, turn{};
  std::array<double, 2> flank{}, bent{};
  for (const auto &e : a.effectors) {
    if (e.port == organ_port::forward)
      for (int side = 0; side < 2; ++side) {
        flank[side] += e.strength * flank_share(e, side);
        bent[side] += e.strength * flank_share(e, side) * std::abs(e.lever);
      }
    for (int f = 0; f < SIDE_FINS; ++f)
      if (e.port == FIN_PORTS[f]) {
        const int side = e.lever < 0 ? 0 : 1;
        const double angle = radians(side_fin::angle) * std::clamp(double(e.quality), -1., 1.),
                     push = std::cos(angle), sideways = std::sin(angle);
        const std::array<std::pair<int, float>, 2> shares{
            std::pair{BACK_STROKES[f][side], 1 - e.protraction},
            std::pair{FRONT_STROKES[f][side], e.protraction}};
        for (const auto &[stroke, share] : shares) {
          const double w = e.strength * share;
          force[stroke] += w;
          along[stroke] += w * push;
          across[stroke] += w * sideways;
          turn[stroke] += w * (push * std::abs(e.lever) + sideways * e.arm);
        }
      }
  }
  for (int j = 0; j < STROKE_COUNT; ++j)
    if (force[j] > 0) {
      a.fin_push[j] = along[j] / force[j];
      a.fin_across[j] = across[j] / force[j];
      a.fin_turn[j] = turn[j] / force[j];
    }
  for (int side = 0; side < 2; ++side)
    a.tail_lever[side] = flank[side] > 0 ? bent[side] / flank[side] : 0;
}
namespace {
// The share of a cell's force that works a stroke: a side fin cell works the back or front stroke
// of its own fin, a gonad's outer cells release.
double stroke_share(const BrainInterface::Effector &e, int stroke) {
  if (e.port != STROKE_PORTS[stroke])
    return 0;
  for (int side = 0; side < 2; ++side) {
    if (stroke == TAIL_STROKES[side])
      return flank_share(e, side);
    const bool own = (e.lever < 0 ? 0 : 1) == side;
    for (int f = 0; f < SIDE_FINS; ++f) {
      if (stroke == BACK_STROKES[f][side])
        return own ? 1 - e.protraction : 0;
      if (stroke == FRONT_STROKES[f][side])
        return own ? e.protraction : 0;
    }
  }
  return stroke == StrokeEgg || stroke == StrokeSperm ? e.outside : 1;
}
void assign_pressure(BrainInterface &, const field::Substrate &);
void effector_timings(BrainInterface &a, const field::Substrate &s) {
  a.stroke_timing = {};
  std::array<double, STROKE_COUNT> steps{}, weight{}, fast{};
  std::array<double, field::HORMONES + 3> continuous_steps{}, continuous_weight{};
  a.pulls.clear();
  for (std::size_t i = 0; i < a.effectors.size(); ++i) {
    auto &e = a.effectors[i];
    const double tau = field::time_constant_steps(s.neurons[e.neuron].parameters);
    e.steps = float(tau);
    for (int c = 0; c < field::HORMONES + 3; ++c) {
      const double share =
          c < field::HORMONES
              ? (e.port == organ_port::gland ? e.hormones[c] : 0)
              : (e.port == organ_port::pigment ? 1 - e.color[c - field::HORMONES] : 0);
      const double w = e.strength * share;
      continuous_steps[c] += w * tau;
      continuous_weight[c] += w;
    }
    for (int j = 0; j < STROKE_COUNT; ++j) {
      const double share = stroke_share(e, j), w = e.strength * share;
      if (share > 0)
        a.pulls.push_back({std::uint32_t(i), j, float(share)});
      steps[j] += w * tau;
      fast[j] += w * e.fibre;
      weight[j] += w;
    }
  }
  for (int j = 0; j < STROKE_COUNT; ++j) {
    a.stroke_capacity[j] = weight[j];
    a.fibre[j] = weight[j] > 0 ? fast[j] / weight[j] : 0;
    if (weight[j] > 0)
      a.stroke_timing[j].set(steps[j] / weight[j]);
  }
  fin_mechanics(a);
  a.fins[fin::tail].steps =
      std::max(a.stroke_timing[StrokeTailLeft].whole(), a.stroke_timing[StrokeTailRight].whole());
  for (int f = 0; f < SIDE_FINS; ++f)
    for (int side = 0; side < 2; ++side)
      a.fins[side_fin_index(f, side)].steps = a.stroke_timing[BACK_STROKES[f][side]].whole();
  for (int c = 0; c < field::HORMONES + 3; ++c) {
    auto &timing =
        c < field::HORMONES ? a.hormone_timing[c] : a.pigment_timing[c - field::HORMONES];
    timing.set(continuous_weight[c] > 0 ? continuous_steps[c] / continuous_weight[c]
                                        : field::time_constant_steps(field::CellParameters{}));
  }
}
class AnatomyBuilder {
  const field::Substrate &s;
  const bool constructing;
  struct Mean {
    double sum = 0, weight = 0;
    void add(double q, double w) {
      sum += w * (1 + std::clamp(q, -1., 1.)) / 2;
      weight += w;
    }
    double value() const { return weight > 0 ? sum / weight : .5; }
  };
  std::array<Mean, 4> traits;
  Mean rakers;
  std::array<double, 2> taste{};
  // A side fin cell: its effector, its zone and how far back it sits along the body (in zones),
  // its place in the drawn body, and what it adds to its fin and the fin's drawn region.
  struct FinCell {
    std::size_t effector;
    int side, zone;
    double along, x, y, z, cells, region;
  };
  std::vector<FinCell> fin_cells;

  std::shared_ptr<BrainInterface> result = std::make_shared<BrainInterface>();
  void add_shape(const field::Neuron &n) {
    const auto &fn = n.functions;
    const int dominant =
        int(std::max_element(fn.senses.begin(), fn.senses.end()) - fn.senses.begin());
    {
      const int side = n.location.side < 0 ? 0 : 1;
      auto tissue = [&](double position, double amount, bool symmetric = false) {
        if (amount <= 0)
          return;
        position = std::clamp(position, 0., 1.) * (BrainInterface::CONTOUR_BINS - 1);
        const int lo = int(position), hi = std::min(BrainInterface::CONTOUR_BINS - 1, lo + 1);
        const double t = position - lo, lateral = .35 + .65 * std::abs(n.x);
        for (int k = 0; k < (symmetric ? 2 : 1); ++k) {
          const int at = BrainInterface::CONTOUR_BINS * (symmetric ? k : side);
          result->contour[at + lo] += float(amount * lateral * (symmetric ? .5 : 1) * (1 - t));
          result->contour[at + hi] += float(amount * lateral * (symmetric ? .5 : 1) * t);
        }
      };
      const double depth = .5 * (n.y + 1), z = .5 * (n.z + 1),
                   capacity = n.strength * (.5 + .5 * depth);
      tissue(n.y >= .2 ? .73 + .24 * (n.y - .2) / .8 : .10 + .50 * (n.y + 1) / 1.2,
             n.strength * fn.internal, true);
      tissue(.10 + .14 * depth, .55 * capacity * fn.motors[0], true);
      tissue(.36 + .19 * depth, capacity * fn.motors[1]);
      tissue(.83 + .12 * z, capacity * (fn.motors[2] + fn.motors[5]));
      tissue(.30 + .24 * z, .65 * capacity * fn.motors[3], true);
      tissue(.18 + .16 * z, .4 * capacity * fn.motors[4]);
      tissue(.21 + .40 * depth, .18 * capacity * fn.motors[6]);
      tissue(.79 + .13 * depth,
             n.strength * (dominant == field::Light  ? .20 * fn.senses[field::Light]
                           : dominant == field::Odor ? .12 * fn.senses[field::Odor]
                                                     : 0));
      auto form = [&](int index, double weight) {
        if (weight <= 0)
          return;
        auto &f = result->forms[index];
        const double y = (n.y + 1) * .5, z = (n.z + 1) * .5;
        f.weight += weight;
        f.x += weight * std::abs(n.x);
        f.y += weight * y;
        f.z += weight * z;
        f.sy += weight * y * y;
        f.sz += weight * z * z;
      };
      auto region = [&](int index, double weight) {
        if (weight <= 0)
          return;
        auto &f = result->regions[index];
        const double y = .5 * (n.y + 1), z = .5 * (n.z + 1);
        f.weight += weight;
        f.x += weight * std::abs(n.x);
        f.y += weight * y;
        f.z += weight * z;
        f.sy += weight * y * y;
        f.sz += weight * z * z;
      };
      region(n.location.zone <= 1 ? region_layout::head : region_layout::cord,
             n.strength * fn.internal);
      form(BrainInterface::INTERNAL_FORM,
           n.strength * n.parameters.capacity * n.functions.usable * fn.internal);
      result->organ_mass +=
          .001 * n.strength * n.parameters.capacity * n.functions.usable * fn.internal;
      for (int k = 0; k < field::SENSE_COUNT; ++k) {
        if (k == dominant)
          form(BrainInterface::sense_form(k, side), n.strength * fn.senses[k]);
      }
      for (int k = 0; k < field::MOTOR_COUNT; ++k) {
        const double capacity =
            n.strength * n.parameters.capacity * n.functions.usable * fn.motors[k];
        form(BrainInterface::motor_form(k, side), capacity);
      }
    }
    {
      result->anatomy[n.location.zone <= 1 ? anatomy_column::head : anatomy_column::cord] +=
          n.strength * fn.internal;
    }
  }
  void add_receptor(std::size_t i, const field::Neuron &n, float share) {
    const auto &fn = n.functions;
    if (share > 0) {
      const auto &p = n.parameters;
      const float angle = n.location.side * float(GENERATED_HALF_VIEW) *
                          (.5f * (1 - n.location.u) + .5f * n.location.w);
      BrainInterface::Receptor r{std::uint32_t(i),
                                 0,
                                 angle,
                                 float(receptor_width(p.field_width)),
                                 float(activation_level(p.threshold)),
                                 share};
      r.longitudinal = n.y;
      r.proximity = fn.senses[field::Proximity] > 0;
      r.inner = !field::development_surface(n.location);
      r.proximity_range = (p.quality2 + 1) * .5f;
      r.lateral = n.x == 0 ? n.location.side * float(tolerance::negligible) : n.x;
      r.mechanical_angle = std::atan2(n.x, n.y);
      r.qualitative_width = p.quality_width;
      r.spatial_width = p.field_width;
      r.opponency = std::clamp((p.quality2 + 1) * .5f, 0.f, 1.f);
      // Only nerve cells read identity4 otherwise; for a sensory cell it picks ON or OFF cells.
      r.dark_share =
          std::clamp(n.identity[cppn::output::identity4 - cppn::output::identity_role], 0.f, 1.f);
      r.response_threshold = float(response_threshold(p.threshold));
      for (int k = 0; k < field::SENSE_COUNT; ++k)
        r.senses[k] = fn.senses[k] / share;
      r.refresh_modality();
      if (r.inner && r.channel == field::Flow)
        r.mechanical_angle = hair_direction(p.quality1, r.lateral);
      r.time_steps = field::time_constant_steps(p);
      // Gravity does not fade: a fish lying still must still know which way is down.
      if (adapting_sense(r.channel) && !(r.inner && r.channel == field::Flow))
        r.adaptation_rate = 1 / field::adaptation_steps(p);
      if (r.visual())
        r.width = float(visual_width(p.field_width));
      r.hue = float(tuning_hue(p.quality1));
      const auto spectrum = hue_affinities(r.hue, p.quality_width);
      const double spectral = spectrum[0] + spectrum[1] + spectrum[2];
      for (int c = 0; c < rgb::count; ++c)
        r.spectrum[c] = float(spectrum[c] / spectral);
      const auto scents = scent_affinities(p.quality1, p.quality2, p.quality_width);
      std::copy(scents.begin(), scents.end(), r.scents.begin());
      r.hormones =
          field::hormone_affinity<field::BLOOD_SUBSTANCES>(p.quality1, p.quality2, p.quality_width);
      if (r.dominant_sense() == field::Touch || r.dominant_sense() == field::Damage ||
          r.dominant_sense() == field::Flow) {
        double total = 0;
        const double width = contact_width(r.spatial_width);
        for (int k = 0; k < SECTOR_COUNT; ++k) {
          double a = sector_angle(k);
          r.contact_weights[k] = float(
              std::max(0., 1 - std::abs(std::remainder(a - r.mechanical_angle, 2 * PI)) / width));
          total += r.contact_weights[k];
        }
        if (total > 0)
          for (auto &v : r.contact_weights)
            v /= total;
        r.contact_kernel = r.dominant_sense() != field::Flow;
      }
      // The gut's own cells carry its length: a long gut with many turns digests plant tissue.
      if (r.dominant_sense() == field::Intake)
        traits[1].add(p.quality1, n.strength * share);
      result->sensory.push_back(r);
      if (r.dominant_sense() == field::Odor)
        result->olfactory.push_back({0, std::uint32_t(result->sensory.size() - 1)});
      {
        result->sensory_capacity += n.strength * fn.usable * share;
        result->organ_mass += SENSOR_MASS * n.strength * fn.usable * share;
        const int side = n.location.side < 0 ? 0 : 1;
        namespace A = anatomy_column;
        result->anatomy[A::eye_left + side] += fn.senses[field::Light];
        for (int c = 0; c < rgb::count; ++c)
          result->anatomy[eye_color_column(side) + c] += fn.senses[field::Light] * r.spectrum[c];
        // Gravity cells lie inside; the drawn lateral line shows only the skin's flow cells.
        for (int k = field::Odor; k <= field::Touch; ++k)
          if (r.channel == k && !(k == field::Flow && r.inner))
            result->anatomy[A::smell_left + 2 * (k - field::Odor) + side] += fn.senses[k];
        taste[side] += r.channel == field::Taste ? fn.senses[field::Taste] : 0;
      }
    }
  }
  void add_effectors(std::size_t i, const field::Neuron &n) {
    const auto &fn = n.functions;
    const float strength = n.strength * n.parameters.capacity * n.functions.usable;
    const double fast = fibre::fast_share(n.parameters);
    for (int j = 0; j < field::MOTOR_COUNT; ++j)
      if (fn.motors[j] > 0) {
        const bool gill = gill_cell(j, n.location), gut = gut_cell(j, n.location);
        const int port = gill  ? int(organ_port::gills)
                         : gut ? int(organ_port::gut)
                               : motor_ports[j];
        const bool fibrous = contractile(j);
        const float capacity =
            float(strength * fn.motors[j] * (field::muscle_motor(j) ? MUSCLE_CELL_FORCE : 1.f) *
                  (fibrous ? fibre::force(fast) : 1.));
        const auto &p = n.parameters;
        const auto absorb = hue_affinities(tuning_hue(p.quality1), p.quality_width);
        const double total = j == field::Pigment ? 1 : absorb[0] + absorb[1] + absorb[2];
        std::array<float, 3> color{};
        for (int c = 0; c < rgb::count; ++c)
          color[c] = float(1 - absorb[c] / total);
        const float outside = field::development_surface(n.location) ? 1.f : 0.f;
        const float lever =
            n.location.side *
            (.25f + .75f * (.5f * n.location.u + .5f * std::abs(2 * n.location.v - 1)));
        result->effectors.push_back(
            {std::uint32_t(i), port, 0, capacity, lever, color, outside, p.quality1});
        auto &effector = result->effectors.back();
        effector.fibre = fibrous ? float(fast) : 0.f;
        if (port == organ_port::turn) {
          effector.protraction = std::clamp(
              n.identity[cppn::output::identity4 - cppn::output::identity_role], 0.f, 1.f);
          // A zone's cells run from its front (u = 1) to its back.
          const double along = n.location.zone + 1 - n.location.u;
          effector.arm = n.y;
          fin_cells.push_back({result->effectors.size() - 1, n.location.side < 0 ? 0 : 1,
                               n.location.zone, along, n.x, n.y, n.z, fn.motors[j],
                               n.strength * (.5 + .25 * (n.y + 1)) * fn.motors[j]});
        }
        effector.hormones = field::hormone_affinity(p.quality1, p.quality2, p.quality_width);
        double total_h = 0;
        for (float a : effector.hormones)
          total_h += a;
        if (total_h > 0)
          for (auto &a : effector.hormones)
            a /= float(total_h);
        if (j == field::Aggression) {
          traits[2].add(p.quality1, capacity);
          traits[0].add(p.quality2, capacity);
        }
        if (j == field::Forward)
          traits[3].add(p.quality1, capacity);
        result->motor_counts[port] += fn.motors[j];
        result->capacities[port] += capacity;
        result->organ_mass += MUSCLE_MASS * effector_tissue(effector);
        result->muscle_maintenance += effector_upkeep(effector);
        if (j == field::Pigment)
          for (int c = 0; c < rgb::count; ++c)
            result->pigment_absorption[c] += capacity * (1 - color[c]);
        namespace A = anatomy_column;
        if (gill) {
          rakers.add(p.quality1, capacity);
          result->anatomy[A::gills] += fn.motors[j];
          result->anatomy[A::gill_strength] += capacity;
          continue;
        }
        if (gut) {
          result->anatomy[A::gut_muscle] += capacity;
          continue;
        }
        const int organ = j == field::Suction ? int(A::mouth)
                          : j == field::Turn
                              ? int(n.location.side < 0 ? A::turn_left : A::turn_right)
                          : j == field::Eggs       ? int(A::eggs)
                          : j == field::Sperm      ? int(A::sperm)
                          : j == field::Defense    ? int(A::defense)
                          : j == field::Aggression ? int(A::aggression)
                                                   : -1;
        if (organ >= 0) {
          result->anatomy[organ] += fn.motors[j];
          result->anatomy[organ + A::suction_strength - A::mouth] += capacity;
        }
        if (j == field::Aggression) {
          result->anatomy[anatomy_column::attack_left] += capacity / 2;
          result->anatomy[anatomy_column::attack_right] += capacity / 2;
        } else if (j == field::Defense)
          result->anatomy[anatomy_column::armor_left + (n.location.side < 0 ? 0 : 1)] += capacity;
        if (j == field::Suction)
          result->suction_sides[n.location.side < 0 ? 0 : 1] += capacity;
        if (j == field::Aggression)
          result->bite_sides[n.location.side < 0 ? 0 : 1] += capacity;
        if (j == field::Forward)
          add_fin(fin::tail, fn.motors[j], capacity, n.x, n.y);
      }
  }
  void add_fin(int index, double cells, double capacity, double x, double y) {
    auto &shape = result->fins[index];
    shape.cells += cells;
    shape.strength += capacity;
    shape.x += capacity * x;
    shape.y += capacity * (y + 1) * .5;
    shape.spread += capacity * x * x;
  }
  // The side fin cells of each side make up to two fins: cells of one zone that lie closer along
  // the body than a gap belong to one fin; more groups merge where they lie closest. The front
  // fin is the pectoral fin, the one behind it the pelvic fin, which works its own muscles.
  void group_side_fins() {
    for (int side = 0; side < 2; ++side) {
      std::vector<std::size_t> cells;
      for (std::size_t k = 0; k < fin_cells.size(); ++k)
        if (fin_cells[k].side == side)
          cells.push_back(k);
      std::vector<std::size_t> group(cells.size());
      std::iota(group.begin(), group.end(), 0);
      const auto root = [&](std::size_t k) {
        while (group[k] != k)
          k = group[k] = group[group[k]];
        return k;
      };
      for (std::size_t a = 0; a < cells.size(); ++a)
        for (std::size_t b = a + 1; b < cells.size(); ++b) {
          const auto &p = fin_cells[cells[a]], &q = fin_cells[cells[b]];
          if (p.zone == q.zone && std::abs(p.along - q.along) < side_fin::gap)
            group[root(a)] = root(b);
        }
      std::map<std::size_t, std::pair<double, double>> centre;
      for (std::size_t a = 0; a < cells.size(); ++a) {
        auto &c = centre[root(a)];
        c.first += fin_cells[cells[a]].cells * fin_cells[cells[a]].along;
        c.second += fin_cells[cells[a]].cells;
      }
      std::vector<std::pair<double, std::size_t>> fins;
      for (const auto &[g, c] : centre)
        fins.push_back({c.second > 0 ? c.first / c.second : 0, g});
      std::sort(fins.begin(), fins.end());
      while (fins.size() > std::size_t(SIDE_FINS)) {
        std::size_t closest = 0;
        for (std::size_t k = 1; k + 1 < fins.size(); ++k)
          if (fins[k + 1].first - fins[k].first < fins[closest + 1].first - fins[closest].first)
            closest = k;
        for (std::size_t a = 0; a < cells.size(); ++a)
          if (root(a) == fins[closest + 1].second)
            group[root(a)] = fins[closest].second;
        fins.erase(fins.begin() + std::ptrdiff_t(closest) + 1);
      }
      for (std::size_t a = 0; a < cells.size(); ++a) {
        const auto &c = fin_cells[cells[a]];
        const int f = root(a) == fins.front().second ? 0 : 1;
        auto &e = result->effectors[c.effector];
        if (f) {
          result->capacities[organ_port::turn] -= e.strength;
          result->motor_counts[organ_port::turn] -= c.cells;
          e.port = organ_port::pelvic;
          result->capacities[organ_port::pelvic] += e.strength;
          result->motor_counts[organ_port::pelvic] += c.cells;
        }
        add_fin(side_fin_index(f, side), c.cells, e.strength, c.x, c.y);
        auto &r = result->regions[region_layout::turn_fin + region_layout::lobes * side + f];
        const double y = .5 * (c.y + 1), z = .5 * (c.z + 1);
        r.weight += c.region;
        r.x += c.region * std::abs(c.x);
        r.y += c.region * y;
        r.z += c.region * z;
        r.sy += c.region * y * y;
        r.sz += c.region * z * z;
      }
    }
  }
  void normalize_body() {
    result->jaw_length = traits[0].value();
    result->anatomy[anatomy_column::jaw_length] = result->jaw_length;
    result->gut_length = traits[1].value();
    result->anatomy[anatomy_column::gut_length] = result->gut_length;
    result->blunt_teeth = traits[2].value();
    result->anatomy[anatomy_column::blunt_teeth] = result->blunt_teeth;
    result->undulation = traits[3].value();
    result->anatomy[anatomy_column::undulation] = result->undulation;
    result->raker_density = rakers.weight > 0 ? rakers.value() : 0;
    result->anatomy[anatomy_column::gill_rakers] = result->raker_density;

    for (auto &v : result->contour)
      v = float(std::round(1000 * (1 - std::exp(-v / 8))) / 1000);
    result->suction_strength = result->capacities[organ_port::suction];
    result->bite_strength = result->capacities[organ_port::jaw];
    result->anatomy[anatomy_column::suction_strength] = float(result->suction_strength);
    for (const auto &e : result->effectors) {
      auto *parts = e.port == organ_port::eggs      ? &result->egg_parts
                    : e.port == organ_port::sperm   ? &result->sperm_parts
                    : e.port == organ_port::bladder ? &result->bladder_parts
                                                    : nullptr;
      if (parts) {
        (*parts)[0] += e.strength * (1 - e.outside);
        (*parts)[1] += e.strength * e.outside;
      }
    }
    result->anatomy[anatomy_column::bladder] = result->capacities[organ_port::bladder];
    result->anatomy[anatomy_column::gland] = result->capacities[organ_port::gland];

    for (auto &f : result->forms)
      if (f.weight > 0) {
        f.x /= f.weight;
        f.y /= f.weight;
        f.z /= f.weight;
        f.sy = std::sqrt(std::max(0., f.sy / f.weight - f.y * f.y));
        f.sz = std::sqrt(std::max(0., f.sz / f.weight - f.z * f.z));
      }
    for (auto &f : result->regions)
      if (f.weight > 0) {
        f.x /= f.weight;
        f.y /= f.weight;
        f.z /= f.weight;
        f.sy = std::sqrt(std::max(0., f.sy / f.weight - f.y * f.y));
        f.sz = std::sqrt(std::max(0., f.sz / f.weight - f.z * f.z));
      }
    for (auto &fin : result->fins)
      if (fin.strength > 0) {
        fin.x /= fin.strength;
        fin.y /= fin.strength;
        fin.spread = std::sqrt(std::max(0., fin.spread / fin.strength - fin.x * fin.x));
      }
    for (int side = 0; side < 2; ++side) {
      auto start = result->anatomy.begin() + eye_color_column(side);
      float peak = *std::max_element(start, start + 3);
      if (peak > 0)
        for (int c = 0; c < rgb::count; ++c)
          start[c] /= peak;
    }
  }
  void prepare_vision() {
    const auto angles = field::visual_bearings(s.neurons);
    for (auto &r : result->sensory)
      if (r.visual()) {
        r.angle = float(GENERATED_HALF_VIEW * angles[r.neuron]);
        for (int side = 0; side < 2; ++side)
          if (std::abs(r.angle) < DEFAULT_BINOCULAR_ANGLE || (r.lateral >= 0) == (side == 1))
            result->eye_receptors[side].push_back(std::uint32_t(&r - result->sensory.data()));
        r.view_left = float(std::max(-GENERATED_HALF_VIEW, double(r.angle - r.width)));
        r.view_right = float(std::min(GENERATED_HALF_VIEW, double(r.angle + r.width)));
        for (int c = 0; c < rgb::count; ++c)
          result->visual[c].push_back({r.angle, std::uint32_t(&r - result->sensory.data())});
      }
    for (int c = 0; c < rgb::count; ++c) {
      auto &rays = result->visual[c];
      std::sort(rays.begin(), rays.end());
      std::vector<double> edges{-GENERATED_HALF_VIEW, GENERATED_HALF_VIEW};
      for (const auto &ray : rays) {
        const auto &r = result->sensory[ray.second];
        if (s.neurons[r.neuron].functional) {
          edges.push_back(r.view_left);
          edges.push_back(r.view_right);
        }
      }
      std::sort(edges.begin(), edges.end());
      double coverage = 0;
      for (std::size_t j = 1; j < edges.size(); ++j) {
        double middle = (edges[j - 1] + edges[j]) * .5, weight = 0;
        for (const auto &ray : rays) {
          const auto &r = result->sensory[ray.second];
          if (s.neurons[r.neuron].functional && middle >= r.view_left && middle <= r.view_right)
            weight = std::max(weight, double(r.spectrum[c] * r.visual_gain()));
        }
        coverage += (edges[j] - edges[j - 1]) * weight;
      }
      result->visual_coverage[c] = float(std::clamp(coverage / (2 * GENERATED_HALF_VIEW), 0., 1.));
    }
    prepare_retinal_cache(*result);
  }

  void summarize_senses() {
    for (int side = 0; side < 2; ++side)
      result->anatomy[anatomy_column::barbel_left + side] = float(taste[side]);
    for (int sense = 0; sense < field::SENSE_COUNT; ++sense) {
      std::vector<float> angles;
      double low = 1, high = 0;
      for (const auto &r : result->sensory)
        if (s.neurons[r.neuron].functional && r.dominant_sense() == sense) {
          // One sense may mix open intensity curves and bounded level curves (balance and lateral
          // line); the summary therefore averages each cell's threshold position from 0 to 1.
          const double weight = r.senses[sense] * r.gain,
                       threshold = std::clamp(r.intensity()
                                                  ? response_threshold_quality(r.response_threshold)
                                                  : activation_level_quality(r.threshold),
                                              0., 1.);
          result->sense_counts[sense] += weight;
          result->sense_thresholds[sense] += weight * threshold;
          result->sense_early[sense] +=
              s.neurons[r.neuron].parameters.threshold <= EARLY_THRESHOLD ? weight : 0;
          result->sense_late[sense] +=
              s.neurons[r.neuron].parameters.threshold >= LATE_THRESHOLD ? weight : 0;
          if (weight >= SPAN_WEIGHT) {
            low = std::min(low, threshold);
            high = std::max(high, threshold);
            if (sense <= field::Touch)
              angles.push_back(sense == field::Flow || sense == field::Touch ? r.mechanical_angle
                                                                             : r.angle);
          }
        }
      auto count = result->sense_counts[sense];
      if (count > 0) {
        result->sense_thresholds[sense] /= count;
        result->sense_early[sense] /= count;
        result->sense_late[sense] /= count;
      }
      result->sense_span[sense] = std::max(0., high - low);
      std::sort(angles.begin(), angles.end());
      double previous = -std::numeric_limits<double>::infinity();
      for (auto angle : angles)
        if (angle - previous >= DIRECTION_GAP) {
          ++result->sense_directions[sense];
          previous = angle;
        }
    }
    result->sense_directions[field::Odor] = 0;
    for (int scent = 0; scent < odor_kind::count; ++scent) {
      for (const auto &r : result->sensory)
        if (s.neurons[r.neuron].functional && r.channel == field::Odor) {
          double weight = r.gain * r.senses[field::Odor] * r.scents[scent];
          if (weight > 0) {
            result->scent_counts[scent] += weight;
            result->scent_thresholds[scent] +=
                weight *
                std::clamp(double(r.response_threshold) / (r.senses[field::Odor] * r.scents[scent]),
                           0., 1.);
          }
        }
      if (result->scent_counts[scent] > 0)
        result->scent_thresholds[scent] /= result->scent_counts[scent];
    }
    for (const auto &r : result->sensory)
      if (s.neurons[r.neuron].functional && r.pressure_kind >= 0 &&
          r.pressure_kind < int(result->filling_counts.size())) {
        const double weight = r.gain;
        result->filling_counts[r.pressure_kind] += weight;
        if (r.pressure_kind == PressureNone)
          result->anatomy[anatomy_column::satiety] += weight;
        else
          result->anatomy[anatomy_column::gonad] += weight;
      }
    result->anatomy[anatomy_column::damage] = result->sense_counts[field::Damage];
    std::sort(result->olfactory.begin(), result->olfactory.end());
  }

public:
  explicit AnatomyBuilder(const field::Substrate &source)
      : s(source), constructing(!s.geometry_ready) {}
  std::shared_ptr<const BrainInterface> build() {
    for (std::size_t i = 0; i < s.neurons.size(); ++i) {
      const auto &n = s.neurons[i];
      const float share = n.functions.sensory();
      add_shape(n);
      add_receptor(i, n, share);
      add_effectors(i, n);
    }
    group_side_fins();
    effector_timings(*result, s);
    normalize_body();
    if (s.geometry_ready) {
      result->body_plans = s.body_plans;
      result->body_geometry = s.body_geometry;
      result->burial_points = s.burial_points;
      result->eye_positions = s.eye_positions;
    } else
      prepare_body_geometry(*result);
    prepare_eye_shape(*result);
    const auto &g = result->body_geometry;
    namespace M = field::body_metric;
    namespace P = field::body_plan_part;
    const double front = g[M::head_back] - GUT_FRONT,
                 back = g[M::head_back] - GUT_BACK * g[M::chest_length],
                 center = (front + back) / 2, half = std::max(GUT_MIN_HALF, (front - back) / 2),
                 cw = chest_width(g[M::trunk], g[M::rest_shoulder], result->body_plans[P::chest]),
                 hw = hind_width(g[M::trunk], result->body_plans[P::torso]),
                 breadth =
                     std::max(GUT_MIN_BREADTH,
                              std::min(g[M::rest_shoulder], join_width(cw, hw)) * GUT_BREADTH);
    for (std::size_t k = 0; k < result->gut_path.size(); ++k) {
      const double t = double(k) / (result->gut_path.size() - 1);
      result->gut_path[k] = {
          (breadth * GUT_OFFSET +
           breadth * GUT_SWING *
               std::sin(2 * PI * (GUT_LOOPS + GUT_LOOPS_GAIN * result->gut_length) * t)) /
              g[M::extent],
          (center + half * (1 - 2 * t) - g[M::center]) / g[M::extent], 0};
    }
    assign_pressure(*result, s);
    result->active_sensory.resize(result->sensory.size());
    std::iota(result->active_sensory.begin(), result->active_sensory.end(), 0);
    prepare_vision();
    summarize_senses();
    result->mobile_reproductive = result->sensory_capacity > 0 &&
                                  result->capacities[organ_port::forward] > 0 &&
                                  result->suction_strength > 0 &&
                                  ((result->egg_parts[0] > 0 && result->egg_parts[1] > 0) ||
                                   (result->sperm_parts[0] > 0 && result->sperm_parts[1] > 0));
    return result;
  }
};
}
std::shared_ptr<const BrainInterface> anatomical_interface(const field::Substrate &s) {
  return AnatomyBuilder(s).build();
}
namespace {
void assign_pressure(BrainInterface &a, const field::Substrate &s) {
  for (auto &r : a.sensory)
    if (r.channel == field::InnerPressure || r.channel == field::BladderPressure ||
        r.channel == field::GonadPressure) {
      const auto &n = s.neurons[r.neuron];
      double nearest = std::numeric_limits<double>::infinity();
      r.pressure_target = -1;
      r.pressure_kind = PressureNone;
      r.pressure_port = -1;
      for (const auto &q : a.gut_path)
        nearest = std::min(nearest, (n.x - q[0]) * (n.x - q[0]) + (n.y - q[1]) * (n.y - q[1]) +
                                        (n.z - q[2]) * (n.z - q[2]));
      for (const auto &e : a.effectors) {
        if (e.port == organ_port::pigment || e.port == organ_port::gland ||
            e.port == organ_port::defense ||
            ((e.port == organ_port::eggs || e.port == organ_port::sperm) && e.outside > 0))
          continue;
        const auto &q = s.neurons[e.neuron];
        const double d =
            (n.x - q.x) * (n.x - q.x) + (n.y - q.y) * (n.y - q.y) + (n.z - q.z) * (n.z - q.z);
        if (d >= nearest)
          continue;
        nearest = d;
        r.pressure_target = int(e.neuron);
        r.pressure_port = e.port;
        r.pressure_kind = e.port == organ_port::eggs      ? PressureEggs
                          : e.port == organ_port::sperm   ? PressureSperm
                          : e.port == organ_port::bladder ? PressureBladder
                                                          : PressureShape;
      }
      r.senses.fill(0);
      r.channel = r.pressure_kind == PressureBladder ? field::BladderPressure
                  : r.pressure_kind == PressureEggs || r.pressure_kind == PressureSperm
                      ? field::GonadPressure
                      : field::InnerPressure;
      r.senses[r.channel] = 1;
    }
}
}
const BrainInterface &Body::active_interface(const Genome &g) const {
  return active_anatomy_ ? *active_anatomy_ : *g.interface;
}
double Body::neural_upkeep() const {
  if (!development_)
    return 0;
  if (!brain_)
    return 0;
  const auto c = field::scaled_costs(brain_->blueprint().options);
  const auto &w = brain_->wiring();
  return brain_->active_count() * c.neuron_maintenance + w.contacts * c.edge_maintenance +
         w.length * c.edge_length_maintenance;
}
double local_defense(double defense, const std::array<double, BODY_SECTORS> &density,
                     double relative) {
  double total = 0;
  for (double v : density)
    total += v;
  if (total <= 0)
    return 0;
  const double at = sector_position(relative);
  const int i = int(std::floor(at));
  const double f = at - i;
  return std::clamp(defense * SECTOR_COUNT *
                        (density[(i + SECTOR_COUNT) % SECTOR_COUNT] * (1 - f) +
                         density[(i + SECTOR_COUNT + 1) % SECTOR_COUNT] * f) /
                        total,
                    0., 1.);
}
double spine_aim(const BrainInterface::Effector &e, const field::Substrate &s) {
  const auto &n = s.neurons[e.neuron];
  return std::atan2(n.x, n.y);
}
void spread_spines(std::array<double, BODY_SECTORS> &density, const BrainInterface::Effector &e,
                   const field::Substrate &s) {
  const double direction = spine_aim(e, s),
               width = contact_width(s.neurons[e.neuron].parameters.field_width);
  double total = 0;
  std::array<double, BODY_SECTORS> weights{};
  for (int k = 0; k < SECTOR_COUNT; ++k)
    total += (weights[k] = std::max(
                  0., 1 - std::abs(std::remainder(sector_angle(k) - direction, 2 * PI)) / width));
  if (total > 0)
    for (int k = 0; k < SECTOR_COUNT; ++k)
      density[k] += e.strength * weights[k] / total;
}
std::array<double, BODY_SECTORS> spine_density(const BrainInterface &a, const field::Substrate &s) {
  std::array<double, BODY_SECTORS> density{};
  for (const auto &e : a.effectors)
    if (e.port == organ_port::defense)
      spread_spines(density, e, s);
  return density;
}
Color visible_absorption(const BrainInterface &a, const Color &dispersion,
                         const PhysiologyParameters &p) {
  Color absorption{};
  for (int c = 0; c < rgb::count; ++c)
    absorption[c] = a.pigment_absorption[c] *
                    (p.pigment_rest + (1 - p.pigment_rest) * std::clamp(dispersion[c], 0., 1.));
  return absorption;
}
double Body::local_defense(double bearing) const {
  if (!std::isfinite(bearing))
    return defense();
  return fishsim::local_defense(defense(), spine_density, bearing - angle);
}
void Body::refresh_organs(const Genome &g) {
  if (!g.interface)
    return;
  const auto revision = brain_ ? brain_->organ_revision() : 0;
  if (revision == known_cells_ && organ_source_ == g.interface)
    return;
  organ_source_ = g.interface;
  known_cells_ = revision;
  active_anatomy_.reset();
  if (brain_ && brain_->active_count() != g.blueprint->neurons.size()) {
    auto a = std::make_shared<BrainInterface>(*g.interface);
    a->effectors.erase(std::remove_if(a->effectors.begin(), a->effectors.end(),
                                      [&](const auto &e) {
                                        return brain_->life(e.neuron) !=
                                               field::Network::CellLife::Active;
                                      }),
                       a->effectors.end());
    a->active_sensory.clear();
    a->sensory_capacity = 0;
    for (std::size_t i = 0; i < a->sensory.size(); ++i)
      if (brain_->life(a->sensory[i].neuron) == field::Network::CellLife::Active) {
        a->active_sensory.push_back(std::uint32_t(i));
        a->sensory_capacity += a->sensory[i].gain;
      }
    auto inactive = [&](const auto &entry) {
      return brain_->life(a->sensory[entry.second].neuron) != field::Network::CellLife::Active;
    };
    for (auto &v : a->visual)
      v.erase(std::remove_if(v.begin(), v.end(), inactive), v.end());
    a->olfactory.erase(std::remove_if(a->olfactory.begin(), a->olfactory.end(), inactive),
                       a->olfactory.end());
    for (auto &v : a->eye_receptors)
      v.erase(std::remove_if(v.begin(), v.end(),
                             [&](auto i) {
                               return brain_->life(a->sensory[i].neuron) !=
                                      field::Network::CellLife::Active;
                             }),
              v.end());
    prepare_retinal_cache(*a);
    a->capacities.fill(0);
    a->motor_counts.fill(0);
    a->egg_parts.fill(0);
    a->sperm_parts.fill(0);
    a->bladder_parts.fill(0);
    a->muscle_maintenance = 0;
    a->pigment_absorption.fill(0);
    for (const auto &e : a->effectors) {
      a->capacities[e.port] += e.strength;
      if (e.port == organ_port::pigment)
        for (int c = 0; c < rgb::count; ++c)
          a->pigment_absorption[c] += e.strength * (1 - e.color[c]);
      a->motor_counts[e.port] += 1;
      a->muscle_maintenance += effector_upkeep(e);
      auto *parts = e.port == organ_port::eggs      ? &a->egg_parts
                    : e.port == organ_port::sperm   ? &a->sperm_parts
                    : e.port == organ_port::bladder ? &a->bladder_parts
                                                    : nullptr;
      if (parts) {
        (*parts)[0] += e.strength * (1 - e.outside);
        (*parts)[1] += e.strength * e.outside;
      }
    }
    effector_timings(*a, *g.blueprint);
    a->suction_strength = a->capacities[organ_port::suction];
    a->bite_strength = a->capacities[organ_port::jaw];
    assign_pressure(*a, *g.blueprint);
    a->sense_counts.fill(0);
    for (auto i : a->active_sensory)
      for (int k = 0; k < field::SENSE_COUNT; ++k)
        a->sense_counts[k] += a->sensory[i].gain * a->sensory[i].senses[k];
    active_anatomy_ = a;
  }
  const auto &a = active_interface(g);
  active_muscle_maintenance = a.muscle_maintenance;
  suction_strength = a.suction_strength;
  gill_strength = a.capacities[organ_port::gills];
  gut_strength = a.capacities[organ_port::gut];
  raker_density = a.raker_density;
  bite_strength = a.bite_strength;
  bladder_capacity = a.capacities[organ_port::bladder];
  spine_density = fishsim::spine_density(a, *g.blueprint);
}
float sensory_response(double stimulus, double threshold) {
  return stimulus > 0 ? float(stimulus / (stimulus + std::max(tolerance::negligible, threshold)))
                      : 0.f;
}
// What a sense cell reports of a stimulus without upper bound: nothing up to its threshold, half
// of what it can at twice the threshold. What it is used to (`mean`) raises the threshold by as
// much, so a stimulus that lasts fades to nothing and only what exceeds the accustomed level is
// reported, measured against that level.
float excess_response(double stimulus, double threshold, double mean) {
  threshold = std::max(tolerance::negligible, threshold) + mean;
  const double excess = stimulus - threshold;
  return excess > 0 ? float(excess / (excess + threshold)) : 0.f;
}
// The same for a stimulus between nothing and all: nothing up to the threshold, all at the full
// stimulus. Only what exceeds the accustomed level counts.
float bounded_response(double x, double threshold, double mean) {
  threshold = std::clamp(threshold, .001, .999);
  const double excess = (std::clamp(x, 0., 1.) - mean - threshold) / (1 - threshold);
  return excess > 0 ? float(excess / (excess + threshold * (1 - excess))) : 0.f;
}
void record_touch(Body &b, double nx, double ny, double impact) {
  if (nx == 0 && ny == 0)
    return;
  double angle = std::remainder(std::atan2(ny, nx) - b.angle, 2 * PI);
  int k = int(std::floor((angle + PI) * SECTOR_COUNT / (2 * PI))) % SECTOR_COUNT;
  k = std::clamp(k, 0, SECTOR_COUNT - 1);
  b.perception_.touch_ring[k] = 1;
  b.perception_.impact_ring[k] = std::max(b.perception_.impact_ring[k], std::max(0., impact));
}
Point barbel_tip(const Body &b, const BrainInterface &binding, int side) {
  const double r = body_radius(b), cells = binding.anatomy[anatomy_column::barbel_left + side],
               grown = std::sqrt(std::max(0., cells)),
               length = r * (barbel::length +
                             barbel::length_per_size * grown / (grown + barbel::organ_half)),
               a = b.angle + (side ? 1 : -1) * barbel::spread, snout = mouth_offset(b);
  return {b.x + snout * std::cos(b.angle) + length * std::cos(a),
          b.y + snout * std::sin(b.angle) + length * std::sin(a)};
}
Point nose_position(const Body &b) {
  const double reach = NOSE_AHEAD * body_radius(b);
  return {b.x + reach * std::cos(b.angle), b.y + reach * std::sin(b.angle)};
}
// The water as the nose meets it: the stream there less the nose's own motion, which moves with
// the body and swings with its turning.
Point nose_flow(const Body &b, Point nose, Point stream) {
  return {stream.x - b.motor().vx + b.motor().turn * (nose.y - b.y),
          stream.y - b.motor().vy - b.motor().turn * (nose.x - b.x)};
}
// A fish smells at one point. Its two nostrils differ only in the water that reaches them: the
// one facing the oncoming water draws it from upstream, the one in its lee smells the water at the
// nose itself, and water from straight ahead reaches both alike. A nostril washed from where the
// scent grows therefore answers more strongly than the other; in still water both smell the same.
Point nostril_source(const Body &b, Point nose, Point flow, int side) {
  const double speed = std::hypot(flow.x, flow.y);
  if (speed <= 0)
    return nose;
  const double outward = side ? 1 : -1,
               across = outward * (-std::sin(b.angle) * flow.x + std::cos(b.angle) * flow.y),
               washed = (1 - across / speed) / 2;
  return {nose.x - washed * NOSTRIL_FLUSH_STEPS * flow.x,
          nose.y - washed * NOSTRIL_FLUSH_STEPS * flow.y};
}
Point lateral_point(int k, double radius) {
  const double a = sector_angle(k), c = std::cos(a), s = std::sin(a),
               r = radius / std::hypot(c / LATERAL_ALONG, s / LATERAL_ACROSS);
  return {r * c, r * s};
}
static Point lateral_offset(int k, double radius, double angle) {
  const auto p = lateral_point(k, radius);
  const double c = std::cos(angle), s = std::sin(angle);
  return {p.x * c - p.y * s, p.x * s + p.y * c};
}
static SensoryFrame internal_sensory_frame(const Body &b, double gonad) {
  SensoryFrame f;
  f.gonad = gonad;
  const auto &reproduction = b.reproduction();
  f.sperm = bounded_filling(reproduction.sperm_store, reproduction.sperm_limit);
  f.radius = body_radius(b);
  f.energy = std::clamp(b.energy / std::max(tolerance::negligible, reserve_capacity(b)), 0., 1.);
  f.nutrient = nutrient_signal(b);
  f.satiety = gut_filling(b);
  f.impact = std::max(0., b.motor().impact);
  f.contact = b.reproduction().contact;
  f.normal = {b.motor().contact_x, b.motor().contact_y};
  prepare_contacts(b, f);
  return f;
}
SensoryFrame prepare_sensory_frame(const Body &b, const BrainInterface &binding, const Field &world,
                                   double gonad) {
  auto f = internal_sensory_frame(b, gonad);
  f.depth = std::clamp(b.y / world.geometry().height, 0., 1.);
  if (!b.hatched)
    return f;
  if (std::none_of(binding.sensory.begin(), binding.sensory.end(),
                   [](const auto &r) { return r.dominant_sense() == field::Flow && !r.inner; }))
    return f;
  for (std::size_t k = 0; k < f.positions.size(); ++k) {
    const auto offset = lateral_offset(int(k), f.radius, b.angle);
    const double dx = offset.x, dy = offset.y;
    f.positions[k] = {world.wrap_x(b.x + dx), b.y + dy};
    f.buried[k] = world.sediment_immersion(f.positions[k].x, f.positions[k].y, LATERAL_PROBE);
    auto water = world.water().velocity(f.positions[k].x, f.positions[k].y);
    f.relative[k] = {b.motor().vx - water.x - b.motor().turn * dy,
                     b.motor().vy - water.y + b.motor().turn * dx};
  }
  const auto wake = world.nearby_flow_samples(b, f.positions);
  for (std::size_t k = 0; k < f.relative.size(); ++k) {
    f.relative[k].x -= wake[k].x;
    f.relative[k].y -= wake[k].y;
  }
  return f;
}
double anatomical_stimulus(const Body &b, const BrainInterface::Receptor &r, const SensoryFrame &f,
                           double sediment_contact, const PhysiologyParameters &p) {
  const int dominant = r.dominant_sense();
  if (dominant < field::Flow || dominant >= field::SENSE_COUNT || r.senses[dominant] <= 0 ||
      b.perception().disabled_senses[dominant])
    return 0;
  double lateral = 0, contact = 0;
  // What a touch presses: a little without any blow, all with the hardest. How much of it a
  // cell reports is left to the cell's threshold alone.
  auto pressure = [&](double impact) {
    return p.touch_rest + (1 - p.touch_rest) * sensory_response(impact, p.touch_impact);
  };
  if (r.dominant_sense() == field::Flow || r.dominant_sense() == field::Touch) {
    const double angle = b.angle + r.mechanical_angle, dx = std::cos(angle), dy = std::sin(angle);
    // Depth grows with y: an inner hair cell is weighed down as far as it points along +y.
    if (r.dominant_sense() == field::Flow && r.inner)
      lateral = std::max(0., dy);
    else if (r.dominant_sense() == field::Flow)
      for (int k = 0; k < SECTOR_COUNT; ++k)
        lateral += r.contact_weights[k] *
                   std::max(0., f.relative[k].x * dx + f.relative[k].y * dy) * (1 - f.buried[k]);
    if (r.dominant_sense() == field::Touch) {
      if (f.contact_ring) {
        if (r.contact_kernel) {
          for (int k = 0; k < SECTOR_COUNT; ++k)
            if (f.touch[k] != 0 && r.contact_weights[k] != 0)
              contact += r.contact_weights[k] * f.touch[k] * pressure(f.impact_ring[k]);
        } else {
          double weight = 0;
          const double width = contact_width(r.spatial_width);
          for (int k = 0; k < SECTOR_COUNT; ++k) {
            double a = sector_angle(k),
                   w = std::max(0., 1 - std::abs(std::remainder(a - r.mechanical_angle, 2 * PI)) /
                                            width);
            if (w != 0 && f.touch[k] != 0)
              contact += w * f.touch[k] * pressure(f.impact_ring[k]);
            weight += w;
          }
          if (weight > 0)
            contact /= weight;
        }
      } else if (f.contact > 0) {
        double direction = f.normal.x * dx + f.normal.y * dy;
        if (f.normal.x == 0 && f.normal.y == 0)
          direction = f.contact;
        contact = std::max(0., direction) * pressure(f.impact);
      }
    }
  }
  double stimulus = 0;
  switch (dominant) {
  case field::Flow:
    stimulus = lateral;
    break;
  case field::Touch:
    stimulus = std::max(contact, sediment_contact);
    break;

  case field::Intake:
    stimulus = f.nutrient;
    break;
  case field::Damage:
    // Pain cells in the skin feel their wounds, those inside the body the aching gut.
    if (r.inner)
      stimulus = b.gut_irritation;
    else
      for (int k = 0; k < SECTOR_COUNT; ++k)
        stimulus += SECTOR_COUNT * r.contact_weights[k] * b.damage_sectors[k];
    stimulus = std::clamp(stimulus, 0., 1.);
    break;
  case field::BladderPressure:
  case field::GonadPressure:
  case field::InnerPressure:
    if (r.pressure_kind == PressureEggs)
      stimulus = f.gonad;
    else if (r.pressure_kind == PressureSperm)
      stimulus = f.sperm;
    else if (r.pressure_kind == PressureBladder)
      stimulus = f.depth;
    else if (r.pressure_kind == PressureShape && b.brain() && r.pressure_target >= 0 &&
             !b.brain()->dead(r.pressure_target)) {
      const auto &n = b.brain()->blueprint().neurons[r.pressure_target];
      const int side = n.location.side < 0 ? 0 : 1, port = r.pressure_port;
      // A stretch receptor feels the muscle it lies in; in a fin, both of the fin's muscles.
      const auto &strokes = b.motor().strokes;
      double force = 0;
      for (int fin = 0; fin < SIDE_FINS; ++fin)
        if (port == FIN_PORTS[fin])
          force = strokes[BACK_STROKES[fin][side]].force + strokes[FRONT_STROKES[fin][side]].force;
      for (int j = 0; j < STROKE_COUNT; ++j)
        if (port == STROKE_PORTS[j] && port != FIN_PORTS[0] && port != FIN_PORTS[1] &&
            (port != organ_port::forward || j == TAIL_STROKES[side]))
          force += strokes[j].force;
      stimulus = std::clamp(force / p.stroke_threshold, 0., 1.);
    } else
      stimulus = f.satiety;
    break;
  case field::Blood: {
    stimulus += field::blood_stimulus(r.hormones, b.hormones().levels(), body_maturity(b), f.energy,
                                      b.motor().fatigue);
    break;
  }
  }
  const double exposure = birth_exposure(b, r.time_steps);
  if (exposure < 1 && (dominant == field::Flow || dominant == field::Touch) && !r.inner) {
    double own = 0, weight = 0;
    const auto &inner = dominant == field::Flow ? b.embryo.flow : b.embryo.touch;
    for (int k = 0; k < SECTOR_COUNT; ++k) {
      own += r.contact_weights[k] * inner[k];
      weight += r.contact_weights[k];
    }
    if (weight <= 0) {
      const double width = contact_width(r.spatial_width);
      for (int k = 0; k < SECTOR_COUNT; ++k) {
        const double a = sector_angle(k);
        const double w =
            std::max(0., 1 - std::abs(std::remainder(a - r.mechanical_angle, 2 * PI)) / width);
        own += w * inner[k];
        weight += w;
      }
    }
    stimulus = exposure * stimulus + (1 - exposure) * (weight > 0 ? own / weight : 0);
  }
  if (b.perception().probe.active() && b.perception().probe.kind == probe_kind::sense &&
      b.perception().probe.sense == dominant)
    stimulus = b.perception().probe.value;
  return std::max(0., stimulus);
}
float receptor_response(const BrainInterface::Receptor &r, double stimulus, double mean) {
  const int sense = r.dominant_sense();
  const bool intensity = r.intensity();
  return r.senses[sense] * (intensity ? excess_response(stimulus, r.response_threshold, mean)
                                      : bounded_response(stimulus, r.threshold, mean));
}
float anatomical_sensor(const Body &b, const BrainInterface::Receptor &r, const SensoryFrame &f,
                        double sediment_contact, std::array<float, field::SENSE_COUNT> *components,
                        const PhysiologyParameters &p) {
  const float response = receptor_response(r, anatomical_stimulus(b, r, f, sediment_contact, p));
  if (components) {
    components->fill(0);
    (*components)[r.dominant_sense()] = response;
  }
  return response;
}
SensoryFrame prepare_sensory_frame(const Body &b, double gonad, double sediment_contact,
                                   Point disturbance) {
  auto f = internal_sensory_frame(b, gonad);
  f.buried.fill(sediment_contact);
  for (std::size_t k = 0; k < f.relative.size(); ++k) {
    const auto offset = lateral_offset(int(k), f.radius, b.angle);
    const double dx = offset.x, dy = offset.y;
    f.relative[k] = {b.motor().vx - b.motor().water_vx - disturbance.x - b.motor().turn * dy,
                     b.motor().vy - b.motor().water_vy - disturbance.y + b.motor().turn * dx};
  }
  return f;
}
float anatomical_sensor(const Body &b, const BrainInterface::Receptor &r, double sediment_contact,
                        Point disturbance, double gonad) {
  return anatomical_sensor(b, r, prepare_sensory_frame(b, gonad, sediment_contact, disturbance),
                           sediment_contact);
}
// A muscle twitches when it is rested and its drive reaches the threshold. While the twitch lasts
// its force follows the drive under the twitch's rise and fall, so a muscle pulls only while it is
// driven: when a rhythm hands over to the antagonist, the muscle goes slack with its drive. A
// twitch lasts as long as its fibres make it, not a whole number of steps: one that ends within
// a step leaves the rest of that step to the twitch that follows at once, so a driven muscle
// twitches every `steps` on average. Returns the twitch's impulse when it begins, the work it
// does if its drive holds.
double stroke_step(StrokeState &stroke, double drive, const StrokeTiming &timing,
                   double threshold) {
  stroke.drive = std::max(0., drive);
  if (stroke.recovery > 0)
    --stroke.recovery;
  if (stroke.recovery > 0)
    return 0;
  if (stroke.drive < threshold || stroke.drive <= 0) {
    stroke.recovery = 0;
    return 0;
  }
  stroke.span = timing.steps;
  stroke.recovery += timing.steps;
  return stroke.drive * timing.steps;
}
// The twitch's share of the drive at its present step: it rises to 2 and falls, one on average.
double stroke_shape(const StrokeState &stroke) {
  if (stroke.recovery <= 0 || stroke.span <= 0)
    return 0;
  const double middle = std::min(stroke.span, stroke.span - stroke.recovery + .5),
               s = std::sin(PI * middle / stroke.span);
  return 2 * s * s;
}
MuscleDemand muscle_demand(const BrainInterface &layout, const std::vector<double> &amounts,
                           const std::vector<double> &reserve) {
  MuscleDemand demand;
  demand.weights.reserve(layout.pulls.size());
  for (const auto &pull : layout.pulls) {
    const auto &e = layout.effectors[pull.effector];
    const double w =
        amounts[pull.effector] * fibre::available(e.fibre, reserve[e.neuron]) * pull.share;
    demand.weights.push_back(w);
    demand.drive[pull.stroke] += w;
    demand.steps[pull.stroke] += w * e.steps;
    demand.price[pull.stroke] += w * fibre::cost(e.fibre);
  }
  return demand;
}
void tire_fibres(const BrainInterface &layout, const MuscleDemand &demand,
                 const std::array<double, STROKE_COUNT> &work, std::vector<double> &reserve) {
  for (const auto &e : layout.effectors)
    reserve[e.neuron] += fibre::refilled(e.fibre, reserve[e.neuron]);
  for (std::size_t k = 0; k < layout.pulls.size(); ++k) {
    const auto &pull = layout.pulls[k];
    const auto &e = layout.effectors[pull.effector];
    if (demand.drive[pull.stroke] > 0)
      reserve[e.neuron] -= fibre::drained(
          e.fibre, work[pull.stroke] * demand.weights[k] / demand.drive[pull.stroke], e.strength);
  }
  for (const auto &e : layout.effectors)
    reserve[e.neuron] = std::clamp(reserve[e.neuron], 0., 1.);
}
EffectorActivity effector_activity(const std::vector<float> &state, const BrainInterface &layout) {
  EffectorActivity activity;
  auto &sum = activity.sum;
  auto &egg = activity.egg;
  auto &sperm = activity.sperm;
  auto &bladder = activity.bladder;
  auto &secretion = activity.secretion;
  auto &pigment = activity.pigment;
  activity.cells.reserve(layout.effectors.size());
  for (const auto &e : layout.effectors) {
    const double signal = std::clamp(double(state[e.neuron]), -1., 1.),
                 a = (e.port == organ_port::bladder || e.port == organ_port::gland)
                         ? std::abs(signal)
                         : std::max(0., signal),
                 amount = a * e.strength;
    activity.cells.push_back(amount);
    sum[e.port] += amount;
    for (int f = 0; f < SIDE_FINS; ++f)
      if (e.port == FIN_PORTS[f]) {
        const int side = e.lever < 0 ? 0 : 1;
        activity.back[f][side] += amount * (1 - e.protraction);
        activity.front[f][side] += amount * e.protraction;
      }
    if (e.port == organ_port::eggs || e.port == organ_port::sperm) {
      auto &parts = e.port == organ_port::eggs ? egg : sperm;
      parts[0] += amount * (1 - e.outside);
      parts[1] += amount * e.outside;
      auto &color = e.port == organ_port::eggs ? activity.egg_color : activity.sperm_color;
      for (int c = 0; c < rgb::count; ++c)
        color[c] += amount * (1 - e.outside) * e.color[c];
    }
    if (e.port == organ_port::bladder) {
      bladder[signal >= 0 ? 0 : 1] += amount;
    }
    if (e.port == organ_port::gland) {
      auto &parts = signal >= 0 ? secretion : activity.binding;
      for (int k = 0; k < field::HORMONES; ++k)
        parts[k] += amount * e.hormones[k];
    }
    if (e.port == organ_port::pigment)
      for (int c = 0; c < rgb::count; ++c)
        pigment[c] += amount * (1 - e.color[c]);
  }
  for (int k = 0; k < 2; ++k) {
    const auto &parts = k ? sperm : egg;
    auto &color = k ? activity.sperm_color : activity.egg_color;
    if (parts[0] > 0)
      for (auto &c : color)
        c /= parts[0];
  }
  return activity;
}
OrganDrive continuous_organs(const std::vector<float> &state, const BrainInterface &layout) {
  const auto a = effector_activity(state, layout);
  OrganDrive result;
  auto set = [&](int index, double value, int port) {
    const double capacity = layout.capacities[port];
    if (capacity > 0) {
      result.present |= 1u << index;
      result.values[index] = value / capacity;
    }
  };
  namespace D = organ_drive;
  set(D::forward, a.sum[organ_port::forward], organ_port::forward);
  // The side fins of a side together.
  std::array<double, 2> fins{};
  for (int f = 0; f < SIDE_FINS; ++f)
    for (int side = 0; side < 2; ++side)
      fins[side] += a.back[f][side] - a.front[f][side];
  const double fin_capacity =
      layout.capacities[organ_port::turn] + layout.capacities[organ_port::pelvic];
  if (fin_capacity > 0)
    for (const auto &[index, value] : std::array<std::pair<int, double>, 3>{
             {{D::turn_left, fins[0]}, {D::turn_right, fins[1]}, {D::turn, fins[0] - fins[1]}}}) {
      result.present |= 1u << index;
      result.values[index] = value / fin_capacity;
    }
  set(D::suction, a.sum[organ_port::suction], organ_port::suction);
  set(D::jaw, a.sum[organ_port::jaw], organ_port::jaw);
  set(D::defense, a.sum[organ_port::defense], organ_port::defense);
  set(D::eggs, a.sum[organ_port::eggs], organ_port::eggs);
  set(D::sperm, a.sum[organ_port::sperm], organ_port::sperm);
  for (int c = 0; c < rgb::count; ++c)
    set(D::pigment + c, a.pigment[c], organ_port::pigment);
  set(D::bladder_fill, a.bladder[0], organ_port::bladder);
  set(D::bladder_empty, a.bladder[1], organ_port::bladder);
  set(D::bladder, a.bladder[0] - a.bladder[1], organ_port::bladder);
  for (int c = 0; c < field::HORMONES; ++c) {
    set(D::secretion + c, a.secretion[c], organ_port::gland);
    set(D::binding + c, a.binding[c], organ_port::gland);
  }
  return result;
}
void anatomical_action(Body &b, const BrainInterface &layout, const PhysiologyParameters &p,
                       bool protected_life) {
  b.motor_.motor_pulses.fill(0);
  const auto *signals = &b.brain_->organ_output();
  std::vector<float> overridden;
  if (b.hatched && b.actuation_probe_) {
    overridden = *signals;
    for (const auto &e : layout.effectors) {
      if (b.brain_->dead(e.neuron))
        continue;
      const float value = b.actuation_probe_(e.neuron, overridden[e.neuron]);
      if (!std::isfinite(value))
        throw std::invalid_argument("nonfinite organ intervention");
      overridden[e.neuron] = std::clamp(value, -1.f, 1.f);
    }
    signals = &overridden;
  }
  auto activity = effector_activity(*signals, layout);
  b.reproduction_.egg_signal_color = activity.egg_color;
  b.reproduction_.sperm_signal_color = activity.sperm_color;
  const auto &sum = activity.sum;
  const auto &egg = activity.egg;
  const auto &sperm = activity.sperm;
  const auto &bladder = activity.bladder;
  const auto &secretion = activity.secretion;
  const auto &pigment = activity.pigment;
  // Every muscle cell pulls on its own: with its drive, as far as its fast fibres are rested.
  // The muscle twitches as one, as long as the cells that pull now make it.
  auto &reserve = b.motor_.fibre_reserve;
  if (reserve.size() < signals->size())
    reserve.resize(signals->size(), 1.);
  const auto demand = muscle_demand(layout, activity.cells, reserve);
  // impulse: what a twitch beginning now does at its drive; work: what each muscle does this step.
  std::array<double, STROKE_COUNT> impulse{}, work{};
  auto &strokes = b.motor_.strokes;
  for (int j = 0; j < STROKE_COUNT; ++j) {
    StrokeTiming timing = layout.stroke_timing[j];
    if (demand.drive[j] > 0)
      timing.set(demand.steps[j] / demand.drive[j]);
    impulse[j] = stroke_step(strokes[j], demand.drive[j], timing, p.stroke_threshold);
    work[j] = strokes[j].drive * stroke_shape(strokes[j]);
  }
  // The side fins' strokes beginning now, per side.
  std::array<double, 2> fin_impulse{};
  for (int fin = 0; fin < SIDE_FINS; ++fin)
    for (int side = 0; side < 2; ++side)
      fin_impulse[side] += impulse[BACK_STROKES[fin][side]] + impulse[FRONT_STROKES[fin][side]];
  const double forward = impulse[StrokeTailLeft] + impulse[StrokeTailRight],
               turn = fin_impulse[0] + fin_impulse[1];
  b.motor_.impulse_tail_left = impulse[StrokeTailLeft];
  b.motor_.impulse_tail_right = impulse[StrokeTailRight];
  b.motor_.impulse_left = fin_impulse[0];
  b.motor_.impulse_right = fin_impulse[1];
  b.reproduction_.egg_transfer =
      b.hatched && !b.reproduction_.egg_laying && b.energy > b.reproduction_.motor_reserve
          ? egg[0] / (1 + egg[0])
          : 0;
  b.reproduction_.sperm_transfer =
      !b.reproduction_.sperm_laying &&
              b.energy > (b.hatched ? b.reproduction_.motor_reserve : hatch_search_reserve(b))
          ? sperm[0] / (1 + sperm[0])
          : 0;
  b.reproduction_.egg_release = impulse[StrokeEgg] > 0;
  b.reproduction_.sperm_release = impulse[StrokeSperm] > 0;
  // The jaw muscles act with their present drive while they twitch; the jaw shapes their twitch
  // itself (advance_mouth).
  const auto share = [&](int j, double capacity) {
    return capacity > 0 ? std::clamp(stroke_drive(strokes[j]) / capacity, 0., 1.) : 0.;
  };
  // Gill covers and gut wall take the pose their twitch gives them: it rises to their drive and
  // falls, so what they move per step, twice their pose, averages their drive like every force.
  const auto taken = [&](int j, double capacity) {
    return capacity > 0 ? std::clamp(work[j] / (2 * capacity), 0., 1.) : 0.;
  };
  b.eat_signal = share(StrokeSuction, layout.suction_strength);
  b.bite_signal = share(StrokeBite, layout.bite_strength);
  b.bite_strength = layout.bite_strength;
  b.gill_signal = taken(StrokeGill, layout.capacities[organ_port::gills]);
  b.gut_motility = taken(StrokeGut, layout.capacities[organ_port::gut]);
  const double old_credit = b.mouth.credit;
  // The jaw moves with the twitch that runs, or would with the muscle's cells all pulling.
  const auto lasting = [&](int j) {
    return strokes[j].recovery > 0 ? strokes[j].span : layout.stroke_timing[j].steps;
  };
  advance_mouth(b, impulse[StrokeSuction] > 0, impulse[StrokeBite] > 0, lasting(StrokeSuction),
                lasting(StrokeBite));
  // Every contraction costs the same per unit of work; only the fibres of the cells that pull set
  // the price. It moves the whole body, so it costs with the body's tissue like the muscles'
  // upkeep: a fish of any size searches about as long on a full reserve.
  const auto contraction = [&](int j) {
    const double price =
        demand.drive[j] > 0 ? demand.price[j] / demand.drive[j] : fibre::cost(layout.fibre[j]);
    return p.muscle_cost * price * work[j] * growth_fraction(b);
  };
  // Gametes are released, not pulled; bites and spines are combat.
  double moving = 0;
  for (int j = 0; j < STROKE_COUNT; ++j)
    if (j != StrokeEgg && j != StrokeSperm && j != StrokeBite && j != StrokeDefense)
      moving += contraction(j);
  const double muscle =
      moving + p.transfer_cost * (b.reproduction_.egg_transfer + b.reproduction_.sperm_transfer) +
      p.pigment_cost * sum[organ_port::pigment];
  const double combat = contraction(StrokeBite) + contraction(StrokeDefense);
  const double bladder_delta =
      std::clamp(b.bladder_fill + p.bladder_rate * (bladder[0] - bladder[1]), 0., 1.) -
      b.bladder_fill;
  const double extra = p.bladder_cost * std::abs(bladder_delta) +
                       HormoneState::work_cost(secretion, activity.binding, p.hormones);
  const double cost = muscle + combat + extra,
               f = cost <= 0 ? 1 : pay_activity(b, cost, protected_life) / cost;
  b.motor_.motor_factor = f;
  for (int j = 0; j < STROKE_COUNT; ++j)
    strokes[j].force = work[j] * f;
  auto paid = work;
  for (auto &done : paid)
    done *= f;
  tire_fibres(layout, demand, paid, reserve);
  static_assert(field::MATURITY_SUBSTANCE == blood_substance::maturity &&
                    field::RESERVE_SUBSTANCE == blood_substance::reserve &&
                    field::FATIGUE_SUBSTANCE == blood_substance::fatigue,
                "the blood substances of the Atelier wheel");
  // What the fast fibres have left, per muscle and in the whole body.
  std::array<double, STROKE_COUNT> fast_force{}, rested{};
  double fast = 0, spent = 0;
  for (const auto &pull : layout.pulls) {
    const auto &e = layout.effectors[pull.effector];
    const double w = e.strength * pull.share * e.fibre;
    fast_force[pull.stroke] += w;
    rested[pull.stroke] += w * reserve[e.neuron];
    fast += w;
    spent += w * (1 - reserve[e.neuron]);
  }
  for (int j = 0; j < STROKE_COUNT; ++j)
    strokes[j].reserve = fast_force[j] > 0 ? rested[j] / fast_force[j] : 1;
  b.motor_.fatigue = fast > 0 ? spent / fast : 0;
  // Spread on the ground, the side fins carry the body like snowshoes: the larger they are for
  // its weight, the more of it.
  double spread = 0;
  for (int fin = 0; fin < SIDE_FINS; ++fin)
    for (int side = 0; side < 2; ++side)
      spread += layout.fins[side_fin_index(fin, side)].strength;
  b.motor_.fin_bearing = spread / (spread + side_fin::bearing_half * body_mass(b));
  const auto delivered = [&](int j) { return strokes[j].force; };
  // Every pair of antagonists follows one rule. A stroke that answers the other muscle sweeps the
  // limb through and works with all its force; the same muscle striking again before the limb is
  // back sweeps it only partly. Where both pull at once their forces cancel and only stiffen the
  // limb: the muscles pay, but the shared part does nothing. A limb that rests as long as its
  // last stroke lasted is back at rest, without pushing on the way: a slack fin turns edge-on and
  // drifts back as the jaw springs back, so from rest either of its muscles sweeps it fully. The
  // tail rests straight in the middle of its sweep: one flank from there sweeps it half way.
  // A tail flank that answers more strongly than the other flank's last stroke is in part a lone
  // stroke: its excess bends the body and steers, the rest sweeps. Answering with nothing before
  // it, it would be a lone stroke; equally strong strokes only push.
  const auto antagonists = [&](AntagonistPair &pair, int first, int second, double from_rest,
                               std::array<double, 2> *started_with = nullptr) {
    const std::array<int, 2> muscles{first, second};
    int started = 0;
    for (int k = 0; k < 2; ++k) {
      const int j = muscles[k];
      if (impulse[j] <= 0 || f <= 0)
        continue;
      b.motor_.sweep[j] = pair.last == 1 - k ? 1
                          : pair.last < 0    ? from_rest
                                             : antagonist::lone_sweep;
      if (started_with) {
        const double own = strokes[j].drive, other = (*started_with)[1 - k];
        if (pair.last == 1 - k && own > other)
          b.motor_.sweep[j] = 1 - (1 - antagonist::lone_sweep) * (1 - other / own);
        (*started_with)[k] = own;
      }
      started += k + 1;
    }
    if (started)
      pair.last = started == 3 ? -1 : started - 1;
    const bool resting = strokes[first].recovery <= 0 && strokes[second].recovery <= 0;
    pair.rest = resting ? pair.rest + 1 : 0;
    if (pair.last >= 0 && pair.rest >= layout.stroke_timing[muscles[pair.last]].steps)
      pair.last = -1;
  };
  antagonists(b.motor_.tail_pair, StrokeTailLeft, StrokeTailRight, antagonist::tail_rest_sweep,
              &b.motor_.tail_drive);
  for (int fin = 0; fin < SIDE_FINS; ++fin)
    for (int side = 0; side < 2; ++side)
      antagonists(b.motor_.fin_pairs[fin][side], BACK_STROKES[fin][side], FRONT_STROKES[fin][side],
                  1);
  // What a stroke works with: its force beyond what its antagonist cancels, as far as it sweeps.
  const auto effective = [&](int j, int antagonist) {
    return (delivered(j) - std::min(delivered(j), delivered(antagonist))) * b.motor_.sweep[j];
  };
  std::array<double, 2> fin_drive{};
  b.motor_.drive_forward = b.motor_.drive_fins = b.motor_.drive_across = 0;
  for (int side = 0; side < 2; ++side) {
    // The tail sweeps the water with its swept force; the unswept rest of a lone stroke bends
    // the body toward its flank, which turns it like the back stroke of the opposite fin.
    const int flank = TAIL_STROKES[side], other = TAIL_STROKES[1 - side];
    const double held = delivered(flank) - std::min(delivered(flank), delivered(other));
    b.motor_.drive_forward += held * b.motor_.sweep[flank];
    fin_drive[1 - side] += held * (1 - b.motor_.sweep[flank]) * layout.tail_lever[side];
    // A fin's strokes each work with their own angle.
    for (int fin = 0; fin < SIDE_FINS; ++fin) {
      const int back = BACK_STROKES[fin][side], front = FRONT_STROKES[fin][side];
      const auto net = [&](const std::array<double, STROKE_COUNT> &per_unit) {
        return per_unit[back] * effective(back, front) - per_unit[front] * effective(front, back);
      };
      fin_drive[side] += net(layout.fin_turn);
      b.motor_.drive_fins += net(layout.fin_push);
      b.motor_.drive_across += (side ? -1 : 1) * net(layout.fin_across);
    }
  }
  b.motor_.drive_left = fin_drive[0];
  b.motor_.drive_right = fin_drive[1];
  b.ledger_.muscle_cost = (muscle + extra) * f;
  b.motor_.combat_cost = combat * f;
  b.motor_.motor_pulses[field::Forward] = forward > 0 && f > 0;
  b.motor_.motor_pulses[field::Turn] = turn > 0 && f > 0;
  b.motor_.motor_pulses[field::Eggs] = impulse[StrokeEgg] > 0 && f > 0;
  b.motor_.motor_pulses[field::Sperm] = impulse[StrokeSperm] > 0 && f > 0;
  b.motor_.motor_pulses[field::Defense] = impulse[StrokeDefense] > 0 && f > 0;
  b.motor_.motor_pulses[field::Pigment] = sum[organ_port::pigment] > 0 && f > 0;
  b.motor_.motor_pulses[field::Bladder] = sum[organ_port::bladder] > 0 && f > 0;
  b.motor_.motor_pulses[field::Gland] = sum[organ_port::gland] > 0 && f > 0;
  b.eat_signal *= f;
  b.gill_signal *= f;
  b.gut_motility *= f;
  b.bite_signal *= f;
  b.mouth.flow *= f;
  const double retained = impulse[StrokeSuction] > 0 ? 0 : old_credit;
  b.mouth.credit = retained + (b.mouth.credit - retained) * f;
  b.mouth.closing &= b.bite_signal > 0;
  b.motor_.motor_pulses[field::Suction] = b.mouth.flow > 0;
  b.motor_.motor_pulses[field::Aggression] = b.mouth.closing;
  b.motor_.suction_pose = b.mouth.flow;
  b.motor_.gill_pose = b.gill_signal;
  b.motor_.bite_pose = jaw_shutting(b.mouth) ? b.mouth.opening : 0;
  b.motor_.mouth_pose = b.mouth.opening;
  b.reproduction_.spawn_signal = egg[0];
  b.reproduction_.sperm_signal = sperm[0];
  b.reproduction_.egg_transfer *= f;
  b.reproduction_.sperm_transfer *= f;
  b.reproduction_.egg_release &= f > 0;
  b.reproduction_.sperm_release &= f > 0;
  b.motor_.aggression = std::clamp(b.bite_signal, 0., 1.);
  b.motor_.defense = std::clamp(b.motor_.defense * layout.stroke_timing[StrokeDefense].keep +
                                    p.spine_rate * strokes[StrokeDefense].force,
                                0., p.spine_max);
  for (int c = 0; c < rgb::count; ++c) {
    const double full = layout.pigment_absorption[c],
                 active = full > 0 ? std::clamp(pigment[c] / full, 0., 1.) : 0.;
    auto &dispersion = b.motor_.pigment[c];
    dispersion = std::clamp(
        dispersion + (1 - layout.pigment_timing[c].keep) * f * (active - dispersion), 0., 1.);
  }
  b.color = pigment_color(visible_absorption(layout, b.motor_.pigment, p), p.pigment_half);
  b.bladder_fill = std::clamp(b.bladder_fill + f * bladder_delta, 0., 1.);
  field::Hormones tau{};
  for (int k = 0; k < field::HORMONES; ++k)
    tau[k] = layout.hormone_timing[k].steps;
  b.hormones_.advance(secretion, activity.binding, f, p.hormones, tau);
  // A stroke's pose: its power against the muscles it moves (each tail flank on its own).
  const auto pose = [&](int j) {
    return std::clamp(strokes[j].drive / std::max(tolerance::negligible, layout.stroke_capacity[j]),
                      0., 1.) *
           f;
  };
  const double relax =
      layout.stroke_timing[StrokeTailLeft].keep * layout.stroke_timing[StrokeTailRight].keep;
  b.motor_.tail *= relax;
  for (auto &tension : b.motor_.fin_tension)
    tension *= relax;
  const int tail_side = b.motor_.tail_pair.last;
  if (forward > 0 && tail_side >= 0) {
    b.motor_.tail = pose(TAIL_STROKES[tail_side]);
    b.motor_.fin_tension[fin::tail] = b.motor_.tail;
  }
  for (int fin = 0; fin < SIDE_FINS; ++fin)
    for (int side = 0; side < 2; ++side) {
      const int back = BACK_STROKES[fin][side], front = FRONT_STROKES[fin][side];
      if (impulse[back] > 0 || impulse[front] > 0)
        b.motor_.fin_tension[side_fin_index(fin, side)] = pose(back) - pose(front);
    }
  // The tail sweeps toward the flank that pulled last.
  if (forward > 0 && f > 0 && tail_side >= 0) {
    const int j = TAIL_STROKES[tail_side];
    b.motor_.fin_stroke_age[fin::tail] = b.age;
    b.motor_.fin_stroke_steps[fin::tail] = layout.stroke_timing[j].whole();
    b.motor_.fin_stroke_peak[fin::tail] =
        b.motor_.fin_tension[fin::tail] * (tail_side == 0 ? -1 : 1);
  }
  for (int fin = 0; fin < SIDE_FINS; ++fin)
    for (int side = 0; side < 2; ++side) {
      const int drawn = side_fin_index(fin, side), back = BACK_STROKES[fin][side];
      if ((impulse[back] > 0 || impulse[FRONT_STROKES[fin][side]] > 0) && f > 0) {
        b.motor_.fin_stroke_age[drawn] = b.age;
        b.motor_.fin_stroke_steps[drawn] = layout.stroke_timing[back].whole();
        b.motor_.fin_stroke_peak[drawn] = b.motor_.fin_tension[drawn];
      }
    }
  b.motor_.swimming_pending = true;
}
}
