#include "protocol_schema.hh"
#include "body_plan.hh"
#include "retina.hh"
#include "eye_geometry.hh"
#include "physiology.hh"
#include <numeric>
namespace fishsim {
static void prepare_contacts(const Body &b, SensoryFrame &f) {
  for (int k = 0; k < 16; ++k)
    if (b.perception().touch_ring[k] > 0) {
      f.contact_ring = true;
      f.touch[k] = b.perception().touch_ring[k];
      f.impact_ring[k] = b.perception().impact_ring[k];
    }
}
bool has_required_organs(const field::Substrate &s) {
  const bool constructing = s.connections_pending();
  double senses = 0, forward = 0, mouth = 0;
  std::array<double, 2> eggs{}, sperm{};
  for (const auto &n : s.neurons)
    if (n.functional || constructing) {
      senses += n.strength * n.functions.usable * n.functions.sensory();
      const double strength = n.strength * n.parameters.capacity * n.functions.usable;
      forward += strength * n.functions.motors[field::Forward];
      mouth += strength * n.functions.motors[field::Suction];
      const float outside =
          field::smooth(std::sqrt((n.x * n.x + n.y * n.y + n.z * n.z) / 3), .25f, .75f);
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
    if (n.functional || constructing) {
      const int side = n.x < 0 ? 0 : 1;
      auto tissue = [&](double position, double amount, bool symmetric = false) {
        if (amount <= 0)
          return;
        position = std::clamp(position, 0., 1.) * 7;
        const int lo = int(position), hi = std::min(7, lo + 1);
        const double t = position - lo, lateral = .35 + .65 * std::abs(n.x);
        for (int k = 0; k < (symmetric ? 2 : 1); ++k) {
          const int at = 8 * (symmetric ? k : side);
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
      tissue(.79 + .13 * depth, n.strength * (dominant == 0   ? .20 * fn.senses[0]
                                              : dominant == 1 ? .12 * fn.senses[1]
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
      region(n.y >= .2 ? 0 : 1, n.strength * fn.internal);
      region(2 + 2 * side + (n.y < 0), capacity * fn.motors[field::Turn]);
      form(0, n.strength * n.parameters.capacity * n.functions.usable * fn.internal);
      result->organ_mass +=
          .001 * n.strength * n.parameters.capacity * n.functions.usable * fn.internal;
      for (int k = 0; k < field::SENSE_COUNT; ++k) {
        if (k == dominant)
          form((k == 10 ? 41
                : k < 8 ? 1 + 2 * k
                        : 33 + 2 * (k - 8)) +
                   side,
               n.strength * fn.senses[k]);
      }
      for (int k = 0; k < field::MOTOR_COUNT; ++k) {
        const double capacity =
            n.strength * n.parameters.capacity * n.functions.usable * fn.motors[k];
        form((k < 8 ? 17 + 2 * k : 37 + 2 * (k - 8)) + side, capacity);
      }
    }
    if (n.functional || constructing) {
      result->anatomy[anatomy_column::head] += n.strength * fn.internal;
      if (n.y < .2f)
        result->anatomy[anatomy_column::cord] += n.strength * fn.internal;
    }
  }
  void add_receptor(std::size_t i, const field::Neuron &n, float share) {
    const auto &fn = n.functions;
    if (share > 0) {
      const auto &p = n.parameters;
      const float angle =
          std::clamp(n.x * (.65f + .35f * (1 - n.y) * .5f), -1.f, 1.f) * float(GENERATED_HALF_VIEW);
      BrainInterface::Receptor r{
          std::uint32_t(i),          0,    angle, float((8 + 109 * p.field_width) * PI / 180),
          .03f + .94f * p.threshold, share};
      r.longitudinal = n.y;
      r.lateral = n.x;
      r.mechanical_angle = std::atan2(n.x, n.y);
      r.qualitative_width = p.quality_width;
      r.spatial_width = p.field_width;
      r.opponency = std::clamp((p.quality2 + 1) * .5f, 0.f, 1.f);
      r.response_threshold = float(.0003 * std::pow(333.333333, std::clamp(p.threshold, 0.f, 1.f)));
      for (int k = 0; k < field::SENSE_COUNT; ++k)
        r.senses[k] = fn.senses[k] / share;
      r.refresh_modality();
      r.time_steps = field::time_constant_steps(p);
      if (r.channel == 1 || r.channel == 2 || r.channel == 10)
        r.adaptation_rate = 1 / field::time_constant_steps(p);
      if (r.channel == 0)
        r.width = float(4 * std::pow(117. / 4, p.field_width) * PI / 180);
      r.hue = 180 * (std::clamp(p.quality1, -1.f, 1.f) + 1);
      const double width = std::clamp(double(p.quality_width), 0., 1.),
                   sigma = 12 + 168 * width * width, wide = std::pow(width, 4);
      auto affinity = [&](double dot) {
        const double alpha = std::acos(std::clamp(dot, -1., 1.)) * 180 / PI;
        return float(wide + (1 - wide) * std::exp(-alpha * alpha / (2 * sigma * sigma)));
      };
      double spectral = 0;
      for (int c = 0; c < 3; ++c) {
        double delta = std::remainder(double(r.hue) - 120 * c, 360.);
        r.spectrum[c] = float(wide + (1 - wide) * std::exp(-delta * delta / (2 * sigma * sigma)));
        spectral += r.spectrum[c];
      }
      for (auto &v : r.spectrum)
        v /= spectral;
      const double height = std::clamp(double(p.quality2), -1., 1.),
                   phi = PI * (std::clamp(p.quality1, -1.f, 1.f) + 1),
                   rad = std::sqrt(1 - height * height);
      const std::array<double, 3> preference{rad * std::cos(phi), rad * std::sin(phi), height};
      constexpr double lat[8] = {90, 35, 35, 35, 35, -10, -60, -60},
                       lon[8] = {0, -25, 25, 155, 205, 180, 90, 270};
      for (int c = 0; c < 8; ++c) {
        double latitude = lat[c] * PI / 180, longitude = lon[c] * PI / 180;
        double dot = preference[0] * std::cos(latitude) * std::cos(longitude) +
                     preference[1] * std::cos(latitude) * std::sin(longitude) +
                     height * std::sin(latitude);
        r.scents[c] = affinity(dot);
      }
      r.hormones = field::hormone_affinity(p.quality1, p.quality2, p.quality_width);
      // Touch and lateral-line cells keep their angular kernel; lateral cells use it while hatching.
      if (r.dominant_sense() == 3 || r.dominant_sense() == 2) {
        double total = 0;
        const double width = (22.5 + 157.5 * r.spatial_width) * PI / 180;
        for (int k = 0; k < 16; ++k) {
          double a = -PI + (k + .5) * 2 * PI / 16;
          r.contact_weights[k] = float(
              std::max(0., 1 - std::abs(std::remainder(a - r.mechanical_angle, 2 * PI)) / width));
          total += r.contact_weights[k];
        }
        if (total > 0)
          for (auto &v : r.contact_weights)
            v /= total;
        r.contact_kernel = r.dominant_sense() == 3;
      }
      result->sensory.push_back(r);
      if (r.dominant_sense() == 1)
        result->olfactory.push_back({0, std::uint32_t(result->sensory.size() - 1)});
      if (n.functional || constructing) {
        result->sensory_capacity += n.strength * fn.usable * share;
        result->organ_mass += .001 * n.strength * fn.usable * share;
        const int side = n.x < 0 ? 0 : 1;
        if (r.channel == 0)
          result->anatomy[1 + side] += fn.senses[0];
        for (int c = 0; c < 3; ++c)
          if (r.channel == 0)
            result->anatomy[15 + 3 * side + c] += fn.senses[0] * r.spectrum[c];
        for (int k = 1; k <= 3; ++k)
          if (r.channel == k)
            result->anatomy[9 + 2 * (k - 1) + side] += fn.senses[k];
        if (r.channel == 1 && fn.senses[3] > 0)
          result->anatomy[35 + side] += fn.senses[1];
      }
    }
  }
  void add_effectors(std::size_t i, const field::Neuron &n) {
    const auto &fn = n.functions;
    const float strength = n.strength * n.parameters.capacity * n.functions.usable;
    constexpr int ports[field::MOTOR_COUNT] = {1, 2, 6, 4, 5, 10, 11, 7, 12, 13};
    for (int j = 0; j < field::MOTOR_COUNT; ++j)
      if (fn.motors[j] > 0) {
        const int port = ports[j];
        const float capacity = strength * fn.motors[j];
        const auto &p = n.parameters;
        const double hue = 180 * (p.quality1 + 1),
                     sigma = 12 + 168 * p.quality_width * p.quality_width,
                     wide = std::pow(p.quality_width, 4);
        std::array<float, 3> absorb{};
        double total = 0;
        for (int c = 0; c < 3; ++c) {
          double delta = std::remainder(hue - 120 * c, 360.);
          absorb[c] = float(wide + (1 - wide) * std::exp(-delta * delta / (2 * sigma * sigma)));
          total += absorb[c];
        }
        std::array<float, 3> color{};
        for (int c = 0; c < 3; ++c)
          color[c] = 1 - absorb[c] / total;
        const float radius = std::sqrt((n.x * n.x + n.y * n.y + n.z * n.z) / 3),
                    outside = field::smooth(radius, .25f, .75f);
        result->effectors.push_back(
            {std::uint32_t(i), port, 0, capacity, n.x, color, outside, p.quality1});
        auto &effector = result->effectors.back();
        effector.hormones = field::hormone_affinity(p.quality1, p.quality2, p.quality_width);
        double total_h = 0;
        for (float a : effector.hormones)
          total_h += a;
        if (total_h > 0)
          for (auto &a : effector.hormones)
            a /= float(total_h);
        if (!n.functional && !constructing)
          continue;
        if (j == field::Suction) {
          traits[0].add(p.quality2, capacity);
          traits[1].add(p.quality1, capacity);
        }
        if (j == field::Aggression)
          traits[2].add(p.quality1, capacity);
        if (j == field::Forward)
          traits[3].add(p.quality1, capacity);
        result->motor_counts[port] += fn.motors[j];
        result->capacities[port] += capacity;
        result->organ_mass += .007 * capacity;
        result->muscle_maintenance += (j == field::Pigment ? .000004 : .0004) * capacity;
        if (j == field::Pigment)
          for (int c = 0; c < 3; ++c)
            result->resting_absorption[c] += capacity * (1 - color[c]);
        const int organ = j == field::Suction      ? 0
                          : j == field::Turn       ? (n.x < 0 ? 3 : 4)
                          : j == field::Eggs       ? 5
                          : j == field::Sperm      ? 6
                          : j == field::Defense    ? 7
                          : j == field::Aggression ? 8
                                                   : -1;
        if (organ >= 0) {
          result->anatomy[organ] += fn.motors[j];
          result->anatomy[21 + organ] += capacity;
        }
        if (j == field::Aggression) {
          result->anatomy[anatomy_column::attack_left] += .5 * capacity;
          result->anatomy[anatomy_column::attack_right] += .5 * capacity;
        } else if (j == field::Defense)
          result->anatomy[32 + (n.x < 0 ? 0 : 1)] += capacity;
        if (j == field::Suction)
          result->suction_sides[n.x < 0 ? 0 : 1] += capacity;
        if (j == field::Aggression)
          result->bite_sides[n.x < 0 ? 0 : 1] += capacity;
        if (j == field::Forward || j == field::Turn) {
          const int fin = j == field::Forward ? 0 : n.x < 0 ? 1 : 2;
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
    result->suction_strength = result->capacities[6];
    result->bite_strength = result->capacities[10];
    result->anatomy[anatomy_column::suction_strength] = float(result->suction_strength);
    for (const auto &e : result->effectors) {
      auto *parts = e.port == 4    ? &result->egg_parts
                    : e.port == 5  ? &result->sperm_parts
                    : e.port == 12 ? &result->bladder_parts
                                   : nullptr;
      if (parts) {
        (*parts)[0] += e.strength * (1 - e.outside);
        (*parts)[1] += e.strength * e.outside;
      }
    }
    result->anatomy[anatomy_column::bladder] = result->capacities[12];
    result->anatomy[anatomy_column::gland] = result->capacities[13];

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
      auto start = result->anatomy.begin() + 15 + 3 * side;
      float peak = *std::max_element(start, start + 3);
      if (peak > 0)
        for (int c = 0; c < 3; ++c)
          start[c] /= peak;
    }
  }
  void prepare_vision() {
    for (auto &r : result->sensory)
      if (r.dominant_sense() == 0) {
        for (int side = 0; side < 2; ++side)
          if (std::abs(r.angle) < .5 || (r.lateral >= 0) == (side == 1))
            result->eye_receptors[side].push_back(std::uint32_t(&r - result->sensory.data()));
        r.view_left = float(std::max(-GENERATED_HALF_VIEW, double(r.angle - r.width)));
        r.view_right = float(std::min(GENERATED_HALF_VIEW, double(r.angle + r.width)));
        for (int c = 0; c < 3; ++c)
          result->visual[c].push_back({r.angle, std::uint32_t(&r - result->sensory.data())});
      }
    for (int c = 0; c < 3; ++c) {
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
            weight = std::max(weight, double(r.spectrum[c] * r.senses[0]));
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
        if ((r.lateral >= 0) == (side == 1) || std::abs(r.angle) < .05)
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
                 threshold =
                     double((sense < 2 || sense == 10) ? r.response_threshold : r.threshold);
          result->sense_counts[sense] += weight;
          result->sense_thresholds[sense] += weight * threshold;
          result->sense_early[sense] += s.neurons[r.neuron].parameters.threshold <= .3 ? weight : 0;
          result->sense_late[sense] += s.neurons[r.neuron].parameters.threshold >= .7 ? weight : 0;
          if (weight >= .25) {
            low = std::min(low, threshold);
            high = std::max(high, threshold);
            if (sense <= 3)
              angles.push_back(sense == 2 || sense == 3 ? r.mechanical_angle : r.angle);
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
      double previous = -10;
      for (auto angle : angles)
        if (angle - previous >= .08) {
          ++result->sense_directions[sense];
          previous = angle;
        }
    }
    result->sense_directions[1] = 0;
    for (int scent = 0; scent < 8; ++scent) {
      for (const auto &r : result->sensory)
        if (s.neurons[r.neuron].functional && r.channel == 1) {
          double weight = r.gain * r.senses[1] * r.scents[scent];
          if (weight > 0) {
            result->scent_counts[scent] += weight;
            result->scent_thresholds[scent] +=
                weight *
                std::clamp(double(r.response_threshold) / (r.senses[1] * r.scents[scent]), 0., 1.);
          }
        }
      if (result->scent_counts[scent] > 0)
        result->scent_thresholds[scent] /= result->scent_counts[scent];
    }
    for (const auto &r : result->sensory)
      if (s.neurons[r.neuron].functional && r.channel == 8) {
        const double weight = r.gain * r.senses[8];
        for (int organ = 0; organ < 3; ++organ)
          result->filling_counts[organ] += weight * r.spectrum[organ];
        result->anatomy[anatomy_column::satiety] += weight * r.spectrum[0];
        result->anatomy[anatomy_column::gonad] += weight * r.spectrum[1];
      }
    result->anatomy[anatomy_column::pain] = result->sense_counts[9];
    std::sort(result->olfactory.begin(), result->olfactory.end());
  }

public:
  explicit AnatomyBuilder(const field::Substrate &source)
      : s(source), constructing(s.connections_pending()) {}
  std::shared_ptr<const BrainInterface> build() {
    for (std::size_t i = 0; i < s.neurons.size(); ++i) {
      const auto &n = s.neurons[i];
      const float share = n.functions.sensory();
      add_shape(n);
      add_receptor(i, n, share);
      add_effectors(i, n);
    }
    std::array<double, STROKE_COUNT> steps{}, weight{};
    std::array<double, field::HORMONES + 3> continuous_steps{}, continuous_weight{};
    for (const auto &e : result->effectors) {
      const double tau = field::time_constant_steps(s.neurons[e.neuron].parameters);
      for (int c = 0; c < field::HORMONES + 3; ++c) {
        const double share = c < field::HORMONES
                                 ? (e.port == 13 ? e.hormones[c] : 0)
                                 : (e.port == 7 ? 1 - e.color[c - field::HORMONES] : 0);
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
        result->stroke_timing[j].set(steps[j] / weight[j]);
    for (int c = 0; c < field::HORMONES + 3; ++c) {
      auto &timing = c < field::HORMONES ? result->hormone_timing[c]
                                         : result->pigment_timing[c - field::HORMONES];
      timing.set(continuous_weight[c] > 0 ? continuous_steps[c] / continuous_weight[c]
                                          : field::time_constant_steps(field::CellParameters{}));
    }
    normalize_body();
    prepare_vision();
    summarize_senses();
    prepare_body_geometry(*result);
    result->mobile_reproductive = result->sensory_capacity > 0 && result->capacities[1] > 0 &&
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
float sensory_response(double stimulus, double threshold) {
  return stimulus > 0 ? float(stimulus / (stimulus + std::max(1e-9, threshold))) : 0.f;
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
  int k = int(std::floor((angle + PI) * 16 / (2 * PI))) % 16;
  k = std::clamp(k, 0, 15);
  b.perception_.touch_ring[k] = 1;
  b.perception_.impact_ring[k] = std::max(b.perception_.impact_ring[k], std::max(0., impact));
}
Point olfactory_position(const Body &b, const BrainInterface &, int side) {
  const double r = body_radius(b), offset = (side ? 1 : -1) * 2 * std::max(3., .6 * r + .2),
               c = std::cos(b.angle), s = std::sin(b.angle);
  return {b.x + .8 * r * c - offset * s, b.y + .8 * r * s + offset * c};
}
static SensoryFrame internal_sensory_frame(const Body &b, double gonad) {
  SensoryFrame f;
  f.gonad = gonad;
  const auto &reproduction = b.reproduction();
  f.sperm = bounded_filling(reproduction.sperm_store, reproduction.sperm_limit);
  f.radius = body_radius(b);
  f.energy = std::clamp(b.energy / std::max(1e-9, reserve_capacity(b)), 0., 1.);
  f.nutrient = nutrient_signal(b);
  f.injury = 1 - b.health;
  f.satiety = gut_filling(b);
  f.pain = std::clamp(b.pain, 0., 1.);
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
  if (binding.sense_counts[2] <= 0 &&
      std::none_of(binding.sensory.begin(), binding.sensory.end(),
                   [](const auto &r) { return r.dominant_sense() == 2; }))
    return f;
  const double c = std::cos(b.angle), s = std::sin(b.angle);
  for (int k = 0; k < 4; ++k) {
    double along = (k & 1 ? 1 : -1) * .7 * f.radius, across = (k & 2 ? 1 : -1) * .5 * f.radius,
           dx = along * c - across * s, dy = along * s + across * c;
    f.positions[k] = {world.wrap_x(b.x + dx), b.y + dy};
    f.buried[k] = world.sediment_immersion(f.positions[k].x, f.positions[k].y, .5);
    auto water = world.water().velocity(f.positions[k].x, f.positions[k].y);
    f.relative[k] = {b.motor().vx - water.x - b.motor().turn * dy,
                     b.motor().vy - water.y + b.motor().turn * dx};
  }
  const auto wake = world.nearby_flow_samples(b, f.positions);
  for (int k = 0; k < 4; ++k) {
    f.relative[k].x -= wake[k].x;
    f.relative[k].y -= wake[k].y;
  }
  return f;
}
double anatomical_stimulus(const Body &b, const BrainInterface::Receptor &r, const SensoryFrame &f,
                           double sediment_contact, const PhysiologyParameters &p) {
  const int dominant = r.dominant_sense();
  if (dominant < 2 || dominant >= field::SENSE_COUNT || r.senses[dominant] <= 0 ||
      b.perception().disabled_senses[dominant])
    return 0;
  double lateral = 0, contact = 0;
  auto pressure = [&](double impact) {
    return p.touch_rest + (1 - p.touch_rest) * sensory_response(impact, r.response_threshold);
  };
  if (r.dominant_sense() == 2 || r.dominant_sense() == 3) {
    const double angle = b.angle + r.mechanical_angle, dx = std::cos(angle), dy = std::sin(angle);
    if (r.dominant_sense() == 2) {
      const double t = .5 * (std::clamp(double(r.longitudinal), -1., 1.) + 1),
                   side = .5 * (std::clamp(double(r.lateral), -1., 1.) + 1);
      for (int k = 0; k < 4; ++k) {
        double w = (k & 1 ? t : 1 - t) * (k & 2 ? side : 1 - side);
        w = (1 - r.spatial_width) * w + .25 * r.spatial_width;
        lateral +=
            w * std::max(0., f.relative[k].x * dx + f.relative[k].y * dy) * (1 - f.buried[k]);
      }
    }
    if (r.dominant_sense() == 3) {
      if (f.contact_ring) {
        if (r.contact_kernel) {
          for (int k = 0; k < 16; ++k)
            if (f.touch[k] != 0 && r.contact_weights[k] != 0)
              contact += r.contact_weights[k] * f.touch[k] * pressure(f.impact_ring[k]);
        } else {
          double weight = 0;
          const double width = (22.5 + 157.5 * r.spatial_width) * PI / 180;
          for (int k = 0; k < 16; ++k) {
            double a = -PI + (k + .5) * 2 * PI / 16,
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
  case 2:
    stimulus = lateral;
    break;
  case 3:
    stimulus = std::max(contact, sediment_contact);
    break;
  case 4:
    stimulus = f.energy;
    break;
  case 5:
    stimulus = f.nutrient;
    break;
  case 6:
    stimulus = f.injury;
    break;
  case 7:
    stimulus = f.depth;
    break;
  case 8:
    stimulus = r.spectrum[0] * f.satiety + r.spectrum[1] * f.gonad + r.spectrum[2] * f.sperm;
    break;
  case 9:
    stimulus = f.pain;
    break;
  case 10: {
    const auto &h = b.hormones().levels();
    for (int k = 0; k < field::HORMONES; ++k)
      stimulus += r.hormones[k] * h[k];
    break;
  }
  }
  const double exposure = birth_exposure(b, r.time_steps);
  if (exposure < 1 && (dominant == 2 || dominant == 3)) {
    double own = 0, weight = 0;
    const auto &inner = dominant == 2 ? b.embryo.flow : b.embryo.touch;
    for (int k = 0; k < 16; ++k) {
      own += r.contact_weights[k] * inner[k];
      weight += r.contact_weights[k];
    }
    if (weight <= 0) {
      const double width = (22.5 + 157.5 * r.spatial_width) * PI / 180;
      for (int k = 0; k < 16; ++k) {
        const double a = -PI + (k + .5) * 2 * PI / 16;
        const double w =
            std::max(0., 1 - std::abs(std::remainder(a - r.mechanical_angle, 2 * PI)) / width);
        own += w * inner[k];
        weight += w;
      }
    }
    stimulus = exposure * stimulus + (1 - exposure) * (weight > 0 ? own / weight : 0);
  }
  if (b.perception().probe.active() && b.perception().probe.kind == 2 &&
      b.perception().probe.sense == dominant)
    stimulus = b.perception().probe.value;
  return std::max(0., stimulus);
}
float receptor_response(const BrainInterface::Receptor &r, double stimulus, double mean) {
  const int sense = r.dominant_sense();
  const bool intensity = sense <= 2 || sense == 10;
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
  const double c = std::cos(b.angle), s = std::sin(b.angle);
  for (int k = 0; k < 4; ++k) {
    double along = (k & 1 ? 1 : -1) * .7 * f.radius, across = (k & 2 ? 1 : -1) * .5 * f.radius,
           dx = along * c - across * s, dy = along * s + across * c;
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
                 a = (e.port == 2 || e.port == 13) ? std::abs(signal) : std::max(0., signal),
                 amount = a * e.strength;
    sum[e.port] += amount;
    if (e.port == 2) {
      const double lever = signal < 0 ? -e.lever : e.lever;
      left += amount * (1 - lever) * .5;
      right += amount * (1 + lever) * .5;
    }
    if (e.port == 4 || e.port == 5) {
      auto &parts = e.port == 4 ? egg : sperm;
      parts[0] += amount * (1 - e.outside);
      parts[1] += amount * e.outside;
      auto &color = e.port == 4 ? activity.egg_color : activity.sperm_color;
      for (int c = 0; c < 3; ++c)
        color[c] += amount * (1 - e.outside) * e.color[c];
    }
    if (e.port == 12) {
      bladder[0] += amount * (1 - e.outside);
      bladder[1] += amount * e.outside;
    }
    if (e.port == 13) {
      auto &parts = signal >= 0 ? secretion : activity.binding;
      for (int k = 0; k < field::HORMONES; ++k)
        parts[k] += amount * e.hormones[k];
    }
    if (e.port == 7)
      for (int c = 0; c < 3; ++c)
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
  set(0, a.sum[1], 1);
  set(1, a.left, 2);
  set(2, a.right, 2);
  set(3, a.left - a.right, 2);
  set(4, a.sum[6], 6);
  set(5, a.sum[10], 10);
  set(6, a.sum[11], 11);
  set(7, a.sum[4], 4);
  set(8, a.sum[5], 5);
  for (int c = 0; c < 3; ++c)
    set(9 + c, a.pigment[c], 7);
  set(12, a.bladder[0], 12);
  set(13, a.bladder[1], 12);
  set(14, a.bladder[0] - a.bladder[1], 12);
  for (int c = 0; c < field::HORMONES; ++c) {
    set(15 + c, a.secretion[c], 13);
    set(15 + field::HORMONES + c, a.binding[c], 13);
  }
  return result;
}
void anatomical_action(Body &b, const BrainInterface &layout, const PhysiologyParameters &p,
                       bool protected_life) {
  b.motor_.motor_pulses.fill(0);
  auto activity = effector_activity(b.brain_->state(), layout);
  b.reproduction_.egg_signal_color = activity.egg_color;
  b.reproduction_.sperm_signal_color = activity.sperm_color;
  const auto &sum = activity.sum;
  const auto &egg = activity.egg;
  const auto &sperm = activity.sperm;
  const auto &bladder = activity.bladder;
  const auto &secretion = activity.secretion;
  const auto &pigment = activity.pigment;
  const double left = activity.left, right = activity.right;
  const std::array<double, STROKE_COUNT> drive{sum[1], left,     right,   sum[6],
                                               egg[1], sperm[1], sum[10], sum[11]};
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
  double muscle =
      p.swimming_cost * forward + p.turn_cost * turn + pump_work +
      p.transfer_cost * (b.reproduction_.egg_transfer + b.reproduction_.sperm_transfer) +
      p.pigment_cost * sum[7];
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
  b.ledger_.muscle_cost = (muscle + extra) * f;
  b.motor_.combat_cost = combat * f;
  b.motor_.motor_pulses[0] = work[StrokeTail] > 0 && f > 0;
  b.motor_.motor_pulses[1] = turn > 0 && f > 0;
  b.motor_.motor_pulses[3] = work[StrokeEgg] > 0 && f > 0;
  b.motor_.motor_pulses[4] = work[StrokeSperm] > 0 && f > 0;
  b.motor_.motor_pulses[6] = work[StrokeDefense] > 0 && f > 0;
  b.motor_.motor_pulses[7] = sum[7] > 0 && f > 0;
  b.motor_.motor_pulses[8] = sum[12] > 0 && f > 0;
  b.motor_.motor_pulses[9] = sum[13] > 0 && f > 0;
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
  b.motor_.motor_pulses[2] = b.mouth.flow > 0;
  b.motor_.motor_pulses[5] = b.mouth.closing;
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
  std::array<double, 3> absorption{};
  for (int c = 0; c < 3; ++c) {
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
    return std::clamp(strokes[j].power / std::max(1e-9, layout.capacities[STROKE_PORTS[j]]), 0.,
                      1.) *
           f;
  };
  const double relax =
      layout.stroke_timing[StrokeTail].keep * layout.stroke_timing[StrokeTail].keep;
  b.motor_.tail *= relax;
  for (auto &tension : b.motor_.fin_tension)
    tension *= relax;
  if (forward > 0) {
    b.motor_.tail = pose(StrokeTail);
    b.motor_.fin_tension[0] = pose(StrokeTail);
  }
  if (turn > 0) {
    b.motor_.fin_tension[1] = pose(StrokeTurnLeft);
    b.motor_.fin_tension[2] = pose(StrokeTurnRight);
  }
  if (forward > 0 && f > 0) {
    b.motor_.fin_stroke_age[0] = b.age;
    b.motor_.fin_stroke_side = !b.motor_.fin_stroke_side;
    b.motor_.fin_stroke_peak[0] = b.motor_.fin_tension[0] * (b.motor_.fin_stroke_side ? 1 : -1);
  }
  if (turn > 0 && f > 0) {
    b.motor_.fin_stroke_age[1] = b.age;
    b.motor_.fin_stroke_peak[1] = b.motor_.fin_tension[1];
    b.motor_.fin_stroke_peak[2] = b.motor_.fin_tension[2];
  }
  b.motor_.swimming_pending = true;
}
}
