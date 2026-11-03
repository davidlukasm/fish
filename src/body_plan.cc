#include "protocol_schema.hh"
#include "body_plan.hh"
#include "retina.hh"
#include "eye_geometry.hh"
#include "physiology.hh"
#include "receptor_tuning.hh"
#include "field/development_sites.hh"
#include <limits>
#include <numeric>
namespace fishsim {
namespace {
// Organ mass per unit of sensor and of muscle capacity.
constexpr double SENSOR_MASS = .001, MUSCLE_MASS = .007;
// Nostrils sit NOSE_AHEAD radii ahead, twice NOSE_OFFSET radii plus NOSE_GAP apart (at least
// NOSE_MIN_OFFSET); lateral samples are LATERAL_ALONG and LATERAL_ACROSS radii out and probe the
// sediment with LATERAL_PROBE.
constexpr double NOSE_AHEAD = .8, NOSE_OFFSET = .6, NOSE_GAP = .2, NOSE_MIN_OFFSET = 3,
                 LATERAL_ALONG = .7, LATERAL_ACROSS = .5, LATERAL_PROBE = .5;
// Receptors with thresholds up to EARLY_THRESHOLD respond early, from LATE_THRESHOLD late; only
// receptors of at least SPAN_WEIGHT span the threshold range; directions count apart from
// DIRECTION_GAP.
constexpr double EARLY_THRESHOLD = .3, LATE_THRESHOLD = .7, SPAN_WEIGHT = .25, DIRECTION_GAP = .08;
// The gut path runs from GUT_FRONT behind the head to GUT_BACK of the chest, at least
// GUT_MIN_HALF long, GUT_BREADTH of the narrower width (at least GUT_MIN_BREADTH) wide, offset by
// GUT_OFFSET and swinging GUT_SWING in GUT_LOOPS plus GUT_LOOPS_GAIN times the gut length loops.
constexpr double GUT_FRONT = .025, GUT_BACK = .93, GUT_MIN_HALF = .03, GUT_MIN_BREADTH = .035,
                 GUT_BREADTH = .72, GUT_OFFSET = .3, GUT_SWING = .48, GUT_LOOPS = .5,
                 GUT_LOOPS_GAIN = 2.5;
// Eye colour columns: red, green and blue of the left eye, then of the right.
constexpr std::size_t eye_color_column(int side) {
  return anatomy_column::red_left + 3 * std::size_t(side);
}
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
void assign_pressure(BrainInterface &, const field::Substrate &,
                     const field::Network *net = nullptr);
void effector_timings(BrainInterface &a, const field::Substrate &s) {
  a.stroke_timing = {};
  std::array<double, STROKE_COUNT> steps{}, weight{};
  std::array<double, field::HORMONES + 3> continuous_steps{}, continuous_weight{};
  for (const auto &e : a.effectors) {
    const double tau = field::time_constant_steps(s.neurons[e.neuron].parameters);
    for (int c = 0; c < field::HORMONES + 3; ++c) {
      const double share =
          c < field::HORMONES
              ? (e.port == organ_port::gland ? e.hormones[c] : 0)
              : (e.port == organ_port::pigment ? 1 - e.color[c - field::HORMONES] : 0);
      const double w = e.strength * share;
      continuous_steps[c] += w * tau;
      continuous_weight[c] += w;
    }
    for (int j = 0; j < STROKE_COUNT; ++j)
      if (e.port == STROKE_PORTS[j]) {
        // Only the releasing tissue sets the gonad's release rhythm.
        const double w = e.strength * ((j == StrokeEgg || j == StrokeSperm) ? e.outside : 1);
        steps[j] += w * tau;
        weight[j] += w;
      }
  }
  for (int j = 0; j < STROKE_COUNT; ++j)
    if (weight[j] > 0)
      a.stroke_timing[j].set(steps[j] / weight[j]);
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
      region(region_layout::turn_fin + region_layout::lobes * side + (n.y < 0),
             capacity * fn.motors[field::Turn]);
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
      r.proximity_range = (p.quality2 + 1) * .5f;
      r.shared_receptor = std::uint32_t(result->sensory.size());
      if (!result->sensory.empty() && s.neurons[result->sensory.back().neuron].group == n.group)
        r.shared_receptor = result->sensory.back().shared_receptor;
      r.lateral = n.x == 0 ? n.location.side * float(tolerance::negligible) : n.x;
      r.mechanical_angle = std::atan2(n.x, n.y);
      r.qualitative_width = p.quality_width;
      r.spatial_width = p.field_width;
      r.opponency = std::clamp((p.quality2 + 1) * .5f, 0.f, 1.f);
      r.response_threshold = float(response_threshold(p.threshold));
      for (int k = 0; k < field::SENSE_COUNT; ++k)
        r.senses[k] = fn.senses[k] / share;
      r.refresh_modality();
      r.time_steps = field::time_constant_steps(p);
      if (adapting_sense(r.channel))
        r.adaptation_rate = 1 / field::time_constant_steps(p);
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
      // Touch, injury and lateral-line cells keep their angular kernel; lateral cells use it
      // while hatching.
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
      result->sensory.push_back(r);
      if (r.dominant_sense() == field::Odor)
        result->olfactory.push_back({0, std::uint32_t(result->sensory.size() - 1)});
      {
        result->sensory_capacity += n.strength * fn.usable * share;
        result->organ_mass += SENSOR_MASS * n.strength * fn.usable * share;
        const int side = n.location.side < 0 ? 0 : 1;
        namespace A = anatomy_column;
        if (r.visual())
          result->anatomy[A::eye_left + side] +=
              fn.senses[field::Light] + fn.senses[field::Proximity];
        for (int c = 0; c < rgb::count; ++c)
          if (r.visual())
            result->anatomy[eye_color_column(side) + c] +=
                (fn.senses[field::Light] + fn.senses[field::Proximity]) * r.spectrum[c];
        // Smell, lateral line and touch fill their left/right pairs in sense order.
        for (int k = field::Odor; k <= field::Touch; ++k)
          if (r.channel == k)
            result->anatomy[A::smell_left + 2 * (k - field::Odor) + side] += fn.senses[k];
        if (r.channel == field::Odor && fn.senses[field::Touch] > 0)
          result->anatomy[A::smell_outer_left + side] += fn.senses[field::Odor];
      }
    }
  }
  void add_effectors(std::size_t i, const field::Neuron &n) {
    const auto &fn = n.functions;
    const float strength = n.strength * n.parameters.capacity * n.functions.usable;
    for (int j = 0; j < field::MOTOR_COUNT; ++j)
      if (fn.motors[j] > 0) {
        const int port = motor_ports[j];
        const float capacity = strength * fn.motors[j];
        const auto &p = n.parameters;
        const auto absorb = hue_affinities(tuning_hue(p.quality1), p.quality_width);
        const double total = absorb[0] + absorb[1] + absorb[2];
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
        effector.hormones = field::hormone_affinity(p.quality1, p.quality2, p.quality_width);
        double total_h = 0;
        for (float a : effector.hormones)
          total_h += a;
        if (total_h > 0)
          for (auto &a : effector.hormones)
            a /= float(total_h);
        if (j == field::Suction) {
          traits[1].add(p.quality1, capacity);
        }
        if (j == field::Aggression) {
          traits[2].add(p.quality1, capacity);
          traits[0].add(p.quality2, capacity);
        }
        if (j == field::Forward)
          traits[3].add(p.quality1, capacity);
        result->motor_counts[port] += fn.motors[j];
        result->capacities[port] += capacity;
        result->organ_mass += MUSCLE_MASS * capacity;
        result->muscle_maintenance +=
            (j == field::Pigment ? BrainInterface::pigment_upkeep_per_capacity
                                 : BrainInterface::muscle_upkeep_per_capacity) *
            capacity;
        if (j == field::Pigment)
          for (int c = 0; c < rgb::count; ++c)
            result->resting_absorption[c] += capacity * (1 - color[c]);
        namespace A = anatomy_column;
        const int organ = j == field::Suction ? int(A::mouth)
                          : j == field::Turn
                              ? int(n.location.side < 0 ? A::turn_left : A::turn_right)
                          : j == field::Eggs       ? int(A::eggs)
                          : j == field::Sperm      ? int(A::sperm)
                          : j == field::Defense    ? int(A::defense)
                          : j == field::Aggression ? int(A::aggression)
                                                   : -1;
        // Each organ's strength column follows its count column at a fixed distance.
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
        if (j == field::Forward || j == field::Turn) {
          const int fin = j == field::Forward ? 0 : n.location.side < 0 ? 1 : 2;
          auto &shape = result->fins[fin];
          shape.cells += fn.motors[j];
          shape.strength += capacity;
          shape.x += capacity * n.x;
          shape.y += capacity * (n.y + 1) * .5;
          shape.spread += capacity * n.x * n.x;
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
    // Direction bins belong to the fixed head lattice, even where neighbouring groups are absent.
    std::vector<double> bearings;
    for (int u = 0; u < 4; ++u)
      for (int w = 0; w < 3; ++w)
        bearings.push_back(GENERATED_HALF_VIEW * (.5 * (1 - u / 3.) + .5 * w / 2.));
    std::sort(bearings.begin(), bearings.end());
    bearings.erase(
        std::unique(bearings.begin(), bearings.end(),
                    [](double a, double b) { return std::abs(a - b) < tolerance::precision; }),
        bearings.end());
    std::size_t groups = 0;
    for (const auto &n : s.neurons)
      groups = std::max(groups, std::size_t(n.group) + 1);
    std::vector<int> copies(groups, 0), ordinal(groups, 0);
    for (const auto &n : s.neurons)
      ++copies[n.group];
    for (auto &r : result->sensory)
      if (r.visual()) {
        const auto &n = s.neurons[r.neuron];
        const double base = std::abs(r.angle);
        const auto i =
            std::size_t(std::min_element(bearings.begin(), bearings.end(),
                                         [&](double a, double b) {
                                           return std::abs(a - base) < std::abs(b - base);
                                         }) -
                        bearings.begin());
        const double lo = i ? (.5 * (bearings[i - 1] + bearings[i])) : 0,
                     hi = i + 1 < bearings.size() ? (.5 * (bearings[i + 1] + bearings[i]))
                                                  : GENERATED_HALF_VIEW;
        r.angle =
            float(n.location.side * (lo + (hi - lo) * (ordinal[n.group]++ + .5) / copies[n.group]));
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
      // Integrate spectral coverage once per angular segment, including overlapping mixed cells.
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
    // Compile the interval unions once, including each eye's default binocular overlap.
    auto unite = [](auto &views) {
      std::sort(views.begin(), views.end());
      std::size_t spans = 0;
      for (const auto &v : views) {
        if (spans && v.first <= views[spans - 1].second)
          views[spans - 1].second = std::max(views[spans - 1].second, v.second);
        else
          views[spans++] = v;
      }
      views.resize(spans);
    };
    for (const auto &ray : result->visual[0]) {
      const auto &r = result->sensory[ray.second];
      const std::pair<double, double> interval{r.view_left, r.view_right};
      result->visual_intervals.push_back(interval);
      for (int side = 0; side < 2; ++side)
        if ((r.lateral >= 0) == (side == 1) || std::abs(r.angle) < DEFAULT_BINOCULAR_ANGLE)
          result->eye_intervals[side].push_back(interval);
    }
    unite(result->visual_intervals);
    for (auto &views : result->eye_intervals)
      unite(views);
    prepare_retinal_cache(*result);
  }

  void summarize_senses() {
    // Effective thresholds describe each modality on its own; weak mixtures need stronger input.
    for (int sense = 0; sense < field::SENSE_COUNT; ++sense) {
      std::vector<float> angles;
      double low = 1, high = 0;
      for (const auto &r : result->sensory)
        if (s.neurons[r.neuron].functional && r.dominant_sense() == sense) {
          double weight = r.senses[sense] * r.gain,
                 threshold = double(intensity_sense(sense) ? r.response_threshold : r.threshold);
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
void assign_pressure(BrainInterface &a, const field::Substrate &s, const field::Network *net) {
  for (auto &r : a.sensory)
    if (r.channel == field::InnerPressure || r.channel == field::BladderPressure ||
        r.channel == field::GonadPressure) {
      if (net && (r.pressure_target < 0 || !net->dead(r.pressure_target)))
        continue;
      const auto &n = s.neurons[r.neuron];
      double nearest = std::numeric_limits<double>::infinity();
      r.pressure_target = -1;
      r.pressure_kind = PressureNone;
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
  return active_neural_maintenance_ >= 0 ? active_neural_maintenance_
                                         : development_->running_cost();
}
double Body::local_defense(double bearing) const {
  if (!std::isfinite(bearing))
    return defense();
  double total = 0;
  for (double v : spine_density)
    total += v;
  if (total <= 0)
    return 0;
  const double at = sector_position(bearing - angle);
  const int i = int(std::floor(at));
  const double f = at - i;
  return std::clamp(defense() * SECTOR_COUNT *
                        (spine_density[(i + SECTOR_COUNT) % SECTOR_COUNT] * (1 - f) +
                         spine_density[(i + SECTOR_COUNT + 1) % SECTOR_COUNT] * f) /
                        total,
                    0., 1.);
}
void Body::refresh_organs(const Genome &g) {
  if (!g.interface)
    return;
  const auto deaths = brain_ ? brain_->dead_count() : 0;
  if (deaths == known_deaths_ && organ_source_ == g.interface)
    return;
  organ_source_ = g.interface;
  known_deaths_ = deaths;
  active_anatomy_.reset();
  active_neural_maintenance_ = -1;
  if (deaths) {
    const auto &s = *g.blueprint;
    const auto costs = field::scaled_costs(s.options);
    active_neural_maintenance_ = 0;
    for (std::size_t i = 0; i < s.neurons.size(); ++i)
      if (!brain_->dead(i))
        active_neural_maintenance_ += costs.neuron_maintenance;
    for (const auto &e : s.edges)
      if (!brain_->dead(e.source) && !brain_->dead(e.target)) {
        const auto &q = s.neurons[e.source], &r = s.neurons[e.target];
        active_neural_maintenance_ +=
            costs.edge_maintenance +
            costs.edge_length_maintenance *
                std::sqrt((q.x - r.x) * (q.x - r.x) + (q.y - r.y) * (q.y - r.y) +
                          (q.z - r.z) * (q.z - r.z));
      }
    auto a = std::make_shared<BrainInterface>(*g.interface);
    a->effectors.erase(std::remove_if(a->effectors.begin(), a->effectors.end(),
                                      [&](const auto &e) { return brain_->dead(e.neuron); }),
                       a->effectors.end());
    a->capacities.fill(0);
    a->motor_counts.fill(0);
    a->egg_parts.fill(0);
    a->sperm_parts.fill(0);
    a->bladder_parts.fill(0);
    a->muscle_maintenance = 0;
    a->resting_absorption.fill(0);
    for (const auto &e : a->effectors) {
      a->capacities[e.port] += e.strength;
      if (e.port == organ_port::pigment)
        for (int c = 0; c < rgb::count; ++c)
          a->resting_absorption[c] += e.strength * (1 - e.color[c]);
      a->motor_counts[e.port] += 1;
      a->muscle_maintenance +=
          (e.port == organ_port::pigment ? BrainInterface::pigment_upkeep_per_capacity
                                         : BrainInterface::muscle_upkeep_per_capacity) *
          e.strength;
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
    assign_pressure(*a, *g.blueprint, &*brain_);
    active_anatomy_ = a;
  }
  const auto &a = active_interface(g);
  active_muscle_maintenance = a.muscle_maintenance;
  suction_strength = a.suction_strength;
  bite_strength = a.bite_strength;
  bladder_capacity = a.capacities[organ_port::bladder];
  spine_density.fill(0);
  for (const auto &e : a.effectors)
    if (e.port == organ_port::defense) {
      const auto &n = g.blueprint->neurons[e.neuron];
      const double direction = std::atan2(n.x, n.y),
                   width = contact_width(n.parameters.field_width);
      double total = 0;
      std::array<double, BODY_SECTORS> weights{};
      for (int k = 0; k < SECTOR_COUNT; ++k)
        total +=
            (weights[k] = std::max(
                 0., 1 - std::abs(std::remainder(sector_angle(k) - direction, 2 * PI)) / width));
      if (total > 0)
        for (int k = 0; k < SECTOR_COUNT; ++k)
          spine_density[k] += e.strength * weights[k] / total;
    }
}
float sensory_response(double stimulus, double threshold) {
  return stimulus > 0 ? float(stimulus / (stimulus + std::max(tolerance::negligible, threshold)))
                      : 0.f;
}
float bounded_response(double x, double t) {
  x = std::clamp(x, 0., 1.);
  t = std::clamp(t, .001, .999);
  return float(x * (1 - t) / (x * (1 - t) + (1 - x) * t));
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
Point olfactory_position(const Body &b, const BrainInterface &, int side) {
  const double r = body_radius(b),
               offset = (side ? 1 : -1) * 2 * std::max(NOSE_MIN_OFFSET, NOSE_OFFSET * r + NOSE_GAP),
               c = std::cos(b.angle), s = std::sin(b.angle);
  return {b.x + NOSE_AHEAD * r * c - offset * s, b.y + NOSE_AHEAD * r * s + offset * c};
}
// The lateral line samples the four corners LATERAL_ALONG radii ahead and behind and
// LATERAL_ACROSS radii to either side.
static Point lateral_offset(int k, double radius, double angle) {
  const double along = (k & 1 ? 1 : -1) * LATERAL_ALONG * radius,
               across = (k & 2 ? 1 : -1) * LATERAL_ACROSS * radius, c = std::cos(angle),
               s = std::sin(angle);
  return {along * c - across * s, along * s + across * c};
}
static SensoryFrame internal_sensory_frame(const Body &b, double gonad) {
  SensoryFrame f;
  f.gonad = gonad;
  const auto &reproduction = b.reproduction();
  f.sperm = bounded_filling(reproduction.sperm_store, reproduction.sperm_limit);
  f.radius = body_radius(b);
  f.energy = std::clamp(b.energy / std::max(tolerance::negligible, reserve_capacity(b)), 0., 1.);
  f.nutrient = nutrient_signal(b);
  f.injury = 1 - b.health;
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
  if (binding.sense_counts[field::Flow] <= 0 &&
      std::none_of(binding.sensory.begin(), binding.sensory.end(),
                   [](const auto &r) { return r.dominant_sense() == field::Flow; }))
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
  auto pressure = [&](double impact) {
    return p.touch_rest + (1 - p.touch_rest) * sensory_response(impact, r.response_threshold);
  };
  if (r.dominant_sense() == field::Flow || r.dominant_sense() == field::Touch) {
    const double angle = b.angle + r.mechanical_angle, dx = std::cos(angle), dy = std::sin(angle);
    if (r.dominant_sense() == field::Flow) {
      const double t = .5 * (std::clamp(double(r.longitudinal), -1., 1.) + 1),
                   side = .5 * (std::clamp(double(r.lateral), -1., 1.) + 1);
      for (int k = 0; k < 4; ++k) {
        double w = (k & 1 ? t : 1 - t) * (k & 2 ? side : 1 - side);
        w = (1 - r.spatial_width) * w + .25 * r.spatial_width;
        lateral +=
            w * std::max(0., f.relative[k].x * dx + f.relative[k].y * dy) * (1 - f.buried[k]);
      }
    }
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
      int stroke = n.location.zone == 0   ? StrokeBite
                   : n.location.zone == 1 ? StrokeSuction
                   : n.location.zone == 2 ? (n.location.side < 0 ? StrokeTurnLeft : StrokeTurnRight)
                                          : StrokeTail;
      stimulus = std::clamp(b.motor().strokes[stroke].mean / p.stroke_threshold, 0., 1.);
    } else
      stimulus = f.satiety;
    break;
  case field::Blood: {
    stimulus +=
        field::blood_stimulus(r.hormones, b.hormones().levels(), body_maturity(b), f.energy);
    break;
  }
  }
  const double exposure = birth_exposure(b, r.time_steps);
  if (exposure < 1 && (dominant == field::Flow || dominant == field::Touch)) {
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
  const bool intensity = intensity_sense(sense);
  return r.senses[sense] * (intensity ? sensory_response(stimulus, r.response_threshold + mean)
                                      : bounded_response(stimulus, r.threshold));
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
double stroke_step(StrokeState &stroke, double drive, const StrokeTiming &timing,
                   double threshold) {
  stroke.mean = timing.keep * stroke.mean + (1 - timing.keep) * std::max(0., drive);
  if (stroke.recovery > 0)
    --stroke.recovery;
  if (stroke.recovery > 0)
    return 0;
  stroke.power = 0;
  if (stroke.mean < threshold || stroke.mean <= 0)
    return 0;
  stroke.power = stroke.mean;
  const double work = stroke.mean * timing.steps;
  stroke.mean = 0;
  stroke.recovery = timing.recovery;
  return work;
}
// Delivery follows sin² over the stroke's steps, most in the middle as the fin sweeps; the shares
// sum to one for strokes of two or more steps.
double stroke_delivery(const StrokeState &stroke, const StrokeTiming &timing) {
  if (stroke.recovery <= 0 || timing.recovery <= 0)
    return 0;
  const int step = timing.recovery - stroke.recovery;
  const double s = std::sin(PI * (step + .5) / timing.recovery);
  return stroke.paid * 2 * s * s / timing.recovery;
}
EffectorActivity effector_activity(const std::vector<float> &state, const BrainInterface &layout) {
  EffectorActivity activity;
  auto &sum = activity.sum;
  auto &egg = activity.egg;
  auto &sperm = activity.sperm;
  auto &bladder = activity.bladder;
  auto &secretion = activity.secretion;
  auto &pigment = activity.pigment;
  auto &left = activity.left;
  auto &right = activity.right;
  for (const auto &e : layout.effectors) {
    const double signal = std::clamp(double(state[e.neuron]), -1., 1.),
                 a = (e.port == organ_port::bladder || e.port == organ_port::gland)
                         ? std::abs(signal)
                         : std::max(0., signal),
                 amount = a * e.strength;
    sum[e.port] += amount;
    if (e.port == organ_port::turn) {
      if (e.lever < 0)
        left += amount * std::abs(e.lever);
      else
        right += amount * std::abs(e.lever);
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
  set(D::turn_left, a.left, organ_port::turn);
  set(D::turn_right, a.right, organ_port::turn);
  set(D::turn, a.left - a.right, organ_port::turn);
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
  const auto *signals = &b.brain_->state();
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
  const double left = activity.left, right = activity.right;
  const std::array<double, STROKE_COUNT> drive{sum[organ_port::forward],
                                               left,
                                               right,
                                               sum[organ_port::suction],
                                               egg[1],
                                               sperm[1],
                                               sum[organ_port::jaw],
                                               sum[organ_port::defense]};
  std::array<double, STROKE_COUNT> work{};
  auto &strokes = b.motor_.strokes;
  for (int j = 0; j < STROKE_COUNT; ++j)
    work[j] = stroke_step(strokes[j], drive[j], layout.stroke_timing[j], p.stroke_threshold);
  const double forward = work[StrokeTail], turn = work[StrokeTurnLeft] + work[StrokeTurnRight];
  b.motor_.impulse_forward = forward;
  b.motor_.impulse_left = work[StrokeTurnLeft];
  b.motor_.impulse_right = work[StrokeTurnRight];
  b.reproduction_.egg_transfer =
      b.hatched && !b.reproduction_.egg_laying && b.energy > b.reproduction_.motor_reserve
          ? egg[0] / (1 + egg[0])
          : 0;
  b.reproduction_.sperm_transfer =
      !b.reproduction_.sperm_laying && b.energy > b.reproduction_.motor_reserve
          ? sperm[0] / (1 + sperm[0])
          : 0;
  b.reproduction_.egg_release = work[StrokeEgg] > 0;
  b.reproduction_.sperm_release = work[StrokeSperm] > 0;
  b.eat_signal = layout.suction_strength > 0
                     ? std::clamp(strokes[StrokeSuction].power / layout.suction_strength, 0., 1.)
                     : 0;
  b.bite_signal = layout.bite_strength > 0
                      ? std::clamp(strokes[StrokeBite].power / layout.bite_strength, 0., 1.)
                      : 0;
  b.bite_strength = layout.bite_strength;
  const double old_credit = b.mouth.credit;
  advance_mouth(b, work[StrokeSuction] > 0, work[StrokeBite] > 0,
                layout.stroke_timing[StrokeSuction].steps, layout.stroke_timing[StrokeBite].steps);
  const double pump_work = p.suction_cost * p.suction_range * p.suction_range *
                           strokes[StrokeSuction].power * (b.mouth.flow > 0 ? b.mouth.opening : 0);
  const double muscle =
      p.swimming_cost * forward + p.turn_cost * turn + pump_work +
      p.transfer_cost * (b.reproduction_.egg_transfer + b.reproduction_.sperm_transfer) +
      p.pigment_cost * sum[organ_port::pigment];
  // A bite is paid once at the start; its bounded activation lasts until that closure ends.
  const double combat =
      p.bite_cost * work[StrokeBite] + p.defense_cost * strokes[StrokeDefense].power;
  const double bladder_delta =
      std::clamp(b.bladder_fill + p.bladder_rate * (bladder[0] - bladder[1]), 0., 1.) -
      b.bladder_fill;
  const double extra = p.bladder_cost * std::abs(bladder_delta) +
                       HormoneState::work_cost(secretion, activity.binding, p.hormones);
  const double cost = muscle + combat + extra,
               f = cost <= 0 ? 1 : pay_activity(b, cost, protected_life) / cost;
  b.motor_.motor_factor = f;
  // Swimming strokes deliver their paid work over their own duration.
  constexpr std::array<int, fin::count> SWIMMING{StrokeTail, StrokeTurnLeft, StrokeTurnRight};
  for (int j : SWIMMING)
    if (work[j] > 0)
      strokes[j].paid = work[j] * f;
  b.motor_.drive_forward = stroke_delivery(strokes[StrokeTail], layout.stroke_timing[StrokeTail]);
  b.motor_.drive_left =
      stroke_delivery(strokes[StrokeTurnLeft], layout.stroke_timing[StrokeTurnLeft]);
  b.motor_.drive_right =
      stroke_delivery(strokes[StrokeTurnRight], layout.stroke_timing[StrokeTurnRight]);
  b.ledger_.muscle_cost = (muscle + extra) * f;
  b.motor_.combat_cost = combat * f;
  b.motor_.motor_pulses[field::Forward] = work[StrokeTail] > 0 && f > 0;
  b.motor_.motor_pulses[field::Turn] = turn > 0 && f > 0;
  b.motor_.motor_pulses[field::Eggs] = work[StrokeEgg] > 0 && f > 0;
  b.motor_.motor_pulses[field::Sperm] = work[StrokeSperm] > 0 && f > 0;
  b.motor_.motor_pulses[field::Defense] = work[StrokeDefense] > 0 && f > 0;
  b.motor_.motor_pulses[field::Pigment] = sum[organ_port::pigment] > 0 && f > 0;
  b.motor_.motor_pulses[field::Bladder] = sum[organ_port::bladder] > 0 && f > 0;
  b.motor_.motor_pulses[field::Gland] = sum[organ_port::gland] > 0 && f > 0;
  b.eat_signal *= f;
  if (work[StrokeBite] > 0) {
    strokes[StrokeBite].power *= f;
    b.bite_signal *= f;
  }
  b.mouth.flow *= f;
  // Already paid transport credit is retained; only this step's new transport is reduced.
  const double retained = work[StrokeSuction] > 0 ? 0 : std::min(old_credit, b.mouth.budget);
  b.mouth.credit = retained + (b.mouth.credit - retained) * f;
  b.mouth.closing &= b.bite_signal > 0;
  b.motor_.motor_pulses[field::Suction] = b.mouth.flow > 0;
  b.motor_.motor_pulses[field::Aggression] = b.mouth.closing;
  b.motor_.suction_pose = b.mouth.flow;
  b.motor_.bite_pose = b.mouth.biting ? b.mouth.opening : 0;
  b.motor_.mouth_pose = b.mouth.opening;
  b.reproduction_.spawn_signal = egg[0];
  b.reproduction_.sperm_signal = sperm[0];
  b.reproduction_.egg_transfer *= f;
  b.reproduction_.sperm_transfer *= f;
  b.reproduction_.egg_release &= f > 0;
  b.reproduction_.sperm_release &= f > 0;
  b.motor_.aggression = std::clamp(b.bite_signal, 0., 1.);
  b.motor_.defense = std::clamp(b.motor_.defense * layout.stroke_timing[StrokeDefense].keep +
                                    p.spine_rate * f * strokes[StrokeDefense].power,
                                0., p.spine_max);
  Color absorption{};
  for (int c = 0; c < rgb::count; ++c) {
    b.motor_.pigment[c] =
        layout.pigment_timing[c].keep * b.motor_.pigment[c] + p.pigment_rate * f * pigment[c];
    absorption[c] = layout.resting_absorption[c] + b.motor_.pigment[c];
  }
  b.color = pigment_color(absorption, p.pigment_half);
  b.bladder_fill = std::clamp(b.bladder_fill + f * bladder_delta, 0., 1.);
  field::Hormones tau{};
  for (int k = 0; k < field::HORMONES; ++k)
    tau[k] = layout.hormone_timing[k].steps;
  b.hormones_.advance(secretion, activity.binding, f, p.hormones, tau);
  const auto pose = [&](int j) {
    return std::clamp(strokes[j].power /
                          std::max(tolerance::negligible, layout.capacities[STROKE_PORTS[j]]),
                      0., 1.) *
           f;
  };
  const double relax =
      layout.stroke_timing[StrokeTail].keep * layout.stroke_timing[StrokeTail].keep;
  b.motor_.tail *= relax;
  for (auto &tension : b.motor_.fin_tension)
    tension *= relax;
  if (forward > 0) {
    b.motor_.tail = pose(StrokeTail);
    b.motor_.fin_tension[fin::tail] = pose(StrokeTail);
  }
  if (turn > 0) {
    b.motor_.fin_tension[fin::left] = pose(StrokeTurnLeft);
    b.motor_.fin_tension[fin::right] = pose(StrokeTurnRight);
  }
  // Each fin records its stroke: start, duration and strength; the tail alternates sides.
  if (forward > 0 && f > 0)
    b.motor_.fin_stroke_side = !b.motor_.fin_stroke_side;
  for (std::size_t fin = 0; fin < SWIMMING.size(); ++fin)
    if (work[SWIMMING[fin]] > 0 && f > 0) {
      b.motor_.fin_stroke_age[fin] = b.age;
      b.motor_.fin_stroke_steps[fin] = layout.stroke_timing[SWIMMING[fin]].recovery;
      b.motor_.fin_stroke_peak[fin] =
          b.motor_.fin_tension[fin] * (fin == fin::tail && !b.motor_.fin_stroke_side ? -1 : 1);
    }
  b.motor_.swimming_pending = true;
}
}
