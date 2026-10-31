#include "retina.hh"
#include "sight.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include <numeric>
#include <limits>
namespace fishsim {
std::array<VisualEye, 2> visual_origins(const Body &b, const BrainInterface &binding,
                                        const Field &world) {
  std::array<VisualEye, 2> eyes{};
  if (binding.visual[0].empty())
    return eyes;
  {
    const double radius = body_radius(b), ca = std::cos(b.angle), sa = std::sin(b.angle);
    for (int side = 0; side < 2; ++side) {
      const auto &form = binding.forms[1 + side];
      if (form.weight <= 0)
        continue;
      const double axial = radius * binding.eye_positions[side][0],
                   lateral = radius * binding.eye_positions[side][1] *
                             std::clamp(world.env().vision_eye_offset * form.x / 2.4, 0., .88),
                   dx = axial * ca - lateral * sa, dy = axial * sa + lateral * ca,
                   length = std::hypot(dx, dy);
      // Stop at the first obstacle even when the nominal point lies beyond a thin wall.
      double fraction =
          length > 1e-9
              ? std::clamp((world.ray(b.x, b.y, dx / length, dy / length, 0, length) - 1e-4) /
                               length,
                           0., 1.)
              : 0;
      auto free = [&](double t) {
        const double x = world.wrap_x(b.x + t * dx), y = b.y + t * dy;
        return world.free(x, y, 1e-5) && world.sediment_immersion(x, y, .01) <= 0;
      };
      if (!free(fraction)) {
        const int steps = std::max(1, int(std::ceil(length)));
        double blocked = fraction;
        bool found = false;
        for (int k = 1; k <= steps; ++k) {
          const double t = std::max(0., fraction - double(k) / steps);
          if (free(t)) {
            double available = t;
            for (int j = 0; j < 8; ++j) {
              const double mid = (available + blocked) * .5;
              if (free(mid))
                available = mid;
              else
                blocked = mid;
            }
            fraction = available;
            found = true;
            break;
          }
          blocked = t;
        }
        if (!found)
          fraction = 0;
      }
      eyes[side] = {world.wrap_x(b.x + fraction * dx), b.y + fraction * dy, 1, true};
    }
  }
  for (auto &eye : eyes)
    if (eye.present) {
      if (!world.free(eye.x, eye.y, 0))
        eye.exposure = 0;
      else if (world.env().vision_burial >= .5)
        eye.exposure = 1 - world.sediment_immersion(eye.x, eye.y, .1);
    }
  return eyes;
}
namespace {
struct RetinalField {
  std::uint32_t index;
  double left, angle, right, mix;
};
double retinal_area(const RetinalField &r, double left, double right) {
  left = std::max(left, r.left);
  right = std::min(right, r.right);
  if (right <= left)
    return 0;
  auto primitive = [&](double x) {
    if (x <= r.angle) {
      const double d = x - r.left;
      return r.angle > r.left ? d * d / (2 * (r.angle - r.left)) : 0.;
    }
    const double d = r.right - x;
    return (r.right - r.left) * .5 - (r.right > r.angle ? d * d / (2 * (r.right - r.angle)) : 0.);
  };
  return primitive(right) - primitive(left);
}
void fill_retinal_angles(const std::vector<RetinalField> &fields,
                         const std::vector<VisualObject> &objects, int side,
                         double adaptation_angle, std::vector<double> &angles) {
  angles.clear();
  double left = 0, right = 0;
  for (const auto &r : fields) {
    left = std::min(left, r.left);
    right = std::max(right, r.right);
    angles.insert(angles.end(), {r.left, r.angle, r.right});
  }
  if (angles.empty())
    return;
  if (adaptation_angle > 0) {
    const double surround = adaptation_angle * PI / 180;
    for (const auto &r : fields)
      angles.insert(angles.end(),
                    {std::max(left, r.angle - surround), std::min(right, r.angle + surround)});
  }
  const int n = std::max(1, int(std::ceil((right - left) / (PI / 18))));
  for (int i = 0; i <= n; ++i)
    angles.push_back(left + (right - left) * i / n);
  for (const auto &o : objects)
    if (o.eye < 0 || o.eye == side)
      for (double shift : {-2 * PI, 0., 2 * PI})
        for (double edge : {o.angle + shift - o.beta, o.angle + shift + o.beta})
          if (edge > left && edge < right)
            angles.push_back(edge);
  std::sort(angles.begin(), angles.end());
  angles.erase(std::unique(angles.begin(), angles.end()), angles.end());
}
template <class Scratch>
void integrate_retinal_receptors(const BrainInterface &binding,
                                 const std::vector<VisualObject> &objects, const Field &world,
                                 const Scratch &cache, std::vector<float> &values,
                                 PerceptionState *inspected) {
  const auto &knots = cache.knots;
  const auto &sum = cache.sum;
  const auto &moment = cache.moment;
  auto object_color = [&](std::size_t k) -> const std::array<double, 3> & {
    return objects[k].pending_filter ? cache.colors[k] : objects[k].color;
  };
  for (const auto &field : cache.fields) {
    const auto &r = binding.sensory[field.index];
    const double width = retinal_area(field, field.left, field.right);
    if (width <= 0)
      continue;
    const auto at = [&](double angle) {
      return std::size_t(std::lower_bound(knots.begin(), knots.end(), angle) - knots.begin());
    };
    const auto left = at(field.left), middle = at(field.angle), right = at(field.right);
    const double surround = world.env().vision_adaptation_angle * PI / 180;
    const auto sl = at(std::max(knots.front(), field.angle - surround)),
               sr = at(std::min(knots.back(), field.angle + surround));
    std::array<double, 3> channels{}, received{};
    double excitation = 0, inhibition = 0, untuned = 0;
    const double peak = *std::max_element(r.spectrum.begin(), r.spectrum.end());
    for (int c = 0; c < 3; ++c) {
      double integrated = 0;
      if (field.angle > field.left)
        integrated +=
            (moment[middle][c] - moment[left][c] - field.left * (sum[middle][c] - sum[left][c])) /
            (field.angle - field.left);
      if (field.right > field.angle)
        integrated += (field.right * (sum[right][c] - sum[middle][c]) -
                       (moment[right][c] - moment[middle][c])) /
                      (field.right - field.angle);
      double m = std::max(0., integrated / width);
      if (world.env().vision_adaptation > 0 && sr > sl) {
        const double baseline = (sum[sr][c] - sum[sl][c]) / (knots[sr] - knots[sl]),
                     adapted = r.response_threshold * std::max(0., m - baseline) /
                               (baseline + r.response_threshold),
                     blend = world.env().vision_adaptation;
        m = (1 - blend) * m + blend * adapted;
      }
      channels[c] = m;
      excitation += r.spectrum[c] * m;
      const double complement = peak > 0 ? 1 - r.spectrum[c] / peak : 0;
      untuned += complement;
      inhibition += complement * m;
    }
    const double k = world.env().vision_opponent * r.opponency,
                 total = std::max(0., excitation - (untuned > 0 ? k * inhibition / untuned : 0.));
    values[field.index] += float(total * field.mix);
    if (inspected) {
      const double retained = excitation > 0 ? total / excitation : 0;
      for (int c = 0; c < 3; ++c)
        received[c] = field.mix * r.senses[0] * r.spectrum[c] * channels[c] * retained;
      inspected->visual_samples.push_back(
          {r.neuron, field.mix * r.senses[0] * total, 0, 0, received});
      if (int(r.neuron) != inspected->inspection_neuron)
        continue;
      std::vector<double> light(objects.size());
      for (const auto &v : cache.visible) {
        const double area = retinal_area(field, knots[v.band], knots[v.band + 1]) / width;
        if (area <= 0)
          continue;
        const auto &o = objects[v.object];
        double spectral = 0;
        for (int c = 0; c < 3; ++c)
          spectral += r.spectrum[c] * object_color(v.object)[c];
        light[v.object] +=
            field.mix * area * spectral *
            (o.attenuation >= 0 ? o.attenuation : std::exp2(-o.distance / world.water_clarity)) *
            r.senses[0];
      }
      std::vector<std::size_t> order(objects.size());
      std::iota(order.begin(), order.end(), 0);
      const auto limit = std::min<std::size_t>(3, order.size());
      std::partial_sort(order.begin(), order.begin() + limit, order.end(),
                        [&](auto a, auto c) { return light[a] > light[c]; });
      for (std::size_t k = 0; k < limit && light[order[k]] > 0; ++k) {
        const auto j = order[k];
        const auto &o = objects[j];
        inspected->visual_contributions.push_back(
            {r.neuron, o.kind, o.id, o.x, o.y, o.radius, light[j], object_color(j)});
      }
    }
  }
}

}
// Lateral inhibition within each eye: every receptor of sight loses strength x the mean stimulus
// of the receptors of the same eye within +-surround degrees of its bearing (itself included);
// the two eyes do not inhibit each other.
void inhibit_retinal_receptors(const BrainInterface &binding, std::vector<float> &values,
                               double strength, double surround) {
  if (strength <= 0)
    return;
  thread_local std::vector<double> prefix;
  thread_local std::vector<float> original;
  const double radius = std::max(0., surround) * PI / 180;
  for (int side = 0; side < 2; ++side) {
    const auto &cells = binding.retinal_neighbors[side];
    if (cells.empty())
      continue;
    prefix.assign(1, 0);
    original.clear();
    for (const auto &c : cells) {
      original.push_back(values[c.second]);
      prefix.push_back(prefix.back() + values[c.second]);
    }
    std::size_t left = 0, right = 0;
    for (std::size_t k = 0; k < cells.size(); ++k) {
      const double bearing = cells[k].first;
      while (left < cells.size() && cells[left].first < bearing - radius)
        ++left;
      while (right < cells.size() && cells[right].first <= bearing + radius)
        ++right;
      const double mean = (prefix[right] - prefix[left]) / double(right - left);
      values[cells[k].second] = float(std::max(0., original[k] - strength * mean));
    }
  }
}
void prepare_retinal_cache(BrainInterface &binding) {
  for (auto &cells : binding.retinal_neighbors)
    cells.clear();
  for (const auto &ray : binding.visual[0]) {
    const auto &r = binding.sensory[ray.second];
    binding.retinal_neighbors[r.lateral >= 0].push_back({r.angle, ray.second});
  }
  for (auto &cells : binding.retinal_neighbors)
    std::sort(cells.begin(), cells.end());
  for (int adapted = 0; adapted < 2; ++adapted)
    for (int eye = 0; eye < 3; ++eye) {
      std::vector<RetinalField> fields;
      for (const auto &ray : binding.visual[0]) {
        const auto &r = binding.sensory[ray.second];
        if (eye < 2 && std::abs(r.angle) >= .05 && (r.lateral >= 0) != (eye == 1))
          continue;
        fields.push_back({ray.second, r.view_left, r.angle, r.view_right, 1});
      }
      fill_retinal_angles(fields, {}, eye, adapted ? 15 : 0, binding.retinal_knots[adapted][eye]);
    }
}

std::vector<float> retinal_vision(const Body &b, const BrainInterface &binding, const Field &world,
                                  const std::vector<VisualObject> &objects, Body *inspected,
                                  int stride, bool diagnostic,
                                  const std::array<VisualEye, 2> *origins) {
  // Workers reuse storage; every observed value is overwritten before it is read.
  struct Contribution {
    std::size_t band, object;
  };
  struct Scratch {
    std::vector<RetinalField> fields;
    std::vector<double> knots, wall, object_edges;
    std::vector<std::array<double, 3>> image, sum, moment, colors, background, changes;
    std::vector<unsigned char> covered, ready;
    std::vector<Contribution> visible;
    std::vector<std::size_t> nearest;
    std::vector<double> depths, minimum_depth;
    std::vector<Point> angular, centers;
  };
  thread_local Scratch cache;
  std::vector<float> values(binding.sensory.size());
  if (inspected)
    inspected->perception_.visual_image.clear();
  const auto eyes = origins ? *origins : visual_origins(b, binding, world);
  const bool paired = eyes[0].present && eyes[1].present;
  if (inspected) {
    auto &state = inspected->perception_;
    state.visual_x = b.x;
    state.visual_y = b.y;
    state.visual_angle = b.angle;
    state.visual_range = world.env().vision_range;
    for (int side = 0; side < 2; ++side)
      state.visual_eyes[side] = {eyes[side].x,
                                 eyes[side].y,
                                 eyes[side].exposure,
                                 std::numeric_limits<double>::infinity(),
                                 -std::numeric_limits<double>::infinity(),
                                 eyes[side].present};
  }
  for (int side = 0; side < 2; ++side) {
    const auto &eye = eyes[side];
    if (!eye.present)
      continue;
    auto &fields = cache.fields;
    fields.clear();
    auto add_field = [&](std::uint32_t index) {
      const auto &r = binding.sensory[index];
      const bool binocular = paired && std::abs(r.angle) < world.env().vision_binocular_angle;
      if (paired && !binocular && (r.lateral >= 0) != (side == 1))
        return;
      const double left = r.view_left, right = r.view_right;
      fields.push_back({index, left, r.angle, right, eye.exposure * (binocular ? .5 : 1)});
    };
    if (paired && !binding.eye_receptors[side].empty())
      for (auto index : binding.eye_receptors[side])
        add_field(index);
    else
      for (const auto &ray : binding.visual[0])
        add_field(ray.second);
    if (inspected)
      for (const auto &r : fields) {
        auto &sample = inspected->perception_.visual_eyes[side];
        sample.left = std::min(sample.left, r.left);
        sample.right = std::max(sample.right, r.right);
      }
    if (eye.exposure <= 0)
      continue;
    auto &knots = cache.knots;
    const auto &fixed = binding.retinal_knots[world.env().vision_adaptation > 0][paired ? side : 2];
    if (!fixed.empty() && world.env().vision_binocular_angle == .05 &&
        world.env().vision_adaptation_angle == 15) {
      auto &edges = cache.object_edges;
      edges.clear();
      for (const auto &o : objects)
        if (o.eye < 0 || o.eye == side)
          for (double shift : {-2 * PI, 0., 2 * PI})
            for (double edge : {o.angle + shift - o.beta, o.angle + shift + o.beta})
              if (edge > fixed.front() && edge < fixed.back())
                edges.push_back(edge);
      std::sort(edges.begin(), edges.end());
      edges.erase(std::unique(edges.begin(), edges.end()), edges.end());
      knots.clear();
      knots.reserve(fixed.size() + edges.size());
      std::merge(fixed.begin(), fixed.end(), edges.begin(), edges.end(), std::back_inserter(knots));
      knots.erase(std::unique(knots.begin(), knots.end()), knots.end());
    } else {
      fill_retinal_angles(
          fields, objects, side,
          world.env().vision_adaptation > 0 ? world.env().vision_adaptation_angle : 0, knots);
    }
    if (knots.size() < 2)
      continue;
    const auto n = knots.size() - 1;
    auto &image = cache.image;
    auto &sum = cache.sum;
    auto &moment = cache.moment;
    auto &covered = cache.covered;
    auto &wall = cache.wall;
    image.assign(n, {});
    sum.resize(n + 1);
    moment.resize(n + 1);
    sum[0] = moment[0] = {};
    covered.assign(n, 0);
    wall.resize(n);
    thread_local SightRays walls;
    thread_local SightMedium medium;
    thread_local SightFilter tint;
    walls.prepare(world, eye.x, eye.y, true);
    const bool obstructed = walls.obstructed();
    const double eye_light = world.light(eye.x, eye.y), ca = std::cos(b.angle),
                 sa = std::sin(b.angle);
    bool optics_ready = false;
    auto prepare_optics = [&]() {
      if (!optics_ready) {
        medium.prepare(world, eye.x, eye.y);
        tint.prepare(world, eye.x, eye.y);
        optics_ready = true;
      }
    };
    auto &colors = cache.colors;
    if (std::any_of(objects.begin(), objects.end(), [](const auto &o) { return o.pending_filter; }))
      colors.resize(objects.size());
    auto object_color = [&](std::size_t k) -> const std::array<double, 3> & {
      return objects[k].pending_filter ? colors[k] : objects[k].color;
    };
    stride = std::max(1, stride);
    auto &background = cache.background;
    auto &ready = cache.ready;
    background.resize(n);
    ready.assign(n, 0);
    auto shared = [&](std::size_t j) {
      auto first = j / std::size_t(stride) * stride;
      return stride > 1 && knots[std::min(n, first + stride)] - knots[first] <= PI / 18;
    };
    auto block_at = [&](std::size_t j) { return shared(j) ? j / std::size_t(stride) * stride : j; };
    auto bearing = [&](std::size_t j) {
      auto first = block_at(j);
      return b.angle + (knots[first] + knots[std::min(n, first + (shared(j) ? stride : 1))]) * .5;
    };
    for (std::size_t j = 0; j < n; ++j) {
      auto block = block_at(j);
      if (block < j) {
        wall[j] = wall[block];
        continue;
      }
      double angle = bearing(j);
      wall[j] = obstructed ? std::min(world.env().vision_range,
                                      walls.cast(std::cos(angle), std::sin(angle)))
                           : world.env().vision_range;
    }
    auto &visible = cache.visible;
    visible.clear();
    auto &nearest = cache.nearest;
    auto &depths = cache.depths;
    nearest.assign(n, objects.size());
    depths = wall;
    auto &angular = cache.angular;
    auto &centers = cache.centers;
    angular.resize(n);
    centers.resize(objects.size());
    for (std::size_t j = 0; j < n; ++j) {
      double a = (knots[j] + knots[j + 1]) * .5;
      angular[j] = {std::cos(a), std::sin(a)};
    }
    for (std::size_t k = 0; k < objects.size(); ++k) {
      auto &o = objects[k];
      centers[k] = {o.distance * std::cos(o.angle), o.distance * std::sin(o.angle)};
    }
    auto circle_depth = [&](const VisualObject &o, std::size_t j) {
      if (o.distance <= o.radius)
        return 0.;
      if (o.stroke) {
        double enter, leave;
        if (!stroke_interval(o.sx, o.sy, o.hx, o.hy, o.radius, angular[j].x, angular[j].y, enter,
                             leave) ||
            leave < 0)
          return std::numeric_limits<double>::infinity();
        return std::max(0., enter);
      }
      auto center = centers[std::size_t(&o - objects.data())];
      double across = center.y * angular[j].x - center.x * angular[j].y,
             along = center.x * angular[j].x + center.y * angular[j].y;
      double square = o.radius * o.radius - across * across;
      return along - std::sqrt(std::max(0., square));
    };
    for (std::size_t k = 0; k < objects.size(); ++k) {
      const auto &o = objects[k];
      if (o.eye >= 0 && o.eye != side)
        continue;
      if (o.transparent)
        continue;
      for (double shift : {-2 * PI, 0., 2 * PI}) {
        double lo = std::max(knots.front(), o.angle + shift - o.beta),
               hi = std::min(knots.back(), o.angle + shift + o.beta);
        if (hi <= lo)
          continue;
        auto first = std::size_t(std::lower_bound(knots.begin(), knots.end(), lo) - knots.begin()),
             end = std::size_t(std::lower_bound(knots.begin(), knots.end(), hi) - knots.begin());
        for (auto j = first; j < end && j < n; ++j) {
          double depth = circle_depth(o, j);
          if (depth < depths[j]) {
            depths[j] = depth;
            nearest[j] = k;
          }
        }
      }
    }
    for (std::size_t j = 0; j < n; ++j)
      covered[j] = nearest[j] != objects.size();
    // Unoccluded translucent objects add the same light to an entire interval.
    // A depth minimum proves visibility before replacing that band's repeated
    // circle intersections and additions with two range events.
    auto &changes = cache.changes;
    auto &minimum_depth = cache.minimum_depth;
    changes.assign(n + 1, {});
    std::size_t depth_base = 1;
    while (depth_base < n)
      depth_base *= 2;
    if (!inspected) {
      minimum_depth.assign(2 * depth_base, std::numeric_limits<double>::infinity());
      std::copy(depths.begin(), depths.end(), minimum_depth.begin() + depth_base);
      for (auto j = depth_base; --j;)
        minimum_depth[j] = std::min(minimum_depth[2 * j], minimum_depth[2 * j + 1]);
    }
    auto nearest_depth = [&](std::size_t first, std::size_t end) {
      double result = std::numeric_limits<double>::infinity();
      for (first += depth_base, end += depth_base; first < end; first /= 2, end /= 2) {
        if (first & 1)
          result = std::min(result, minimum_depth[first++]);
        if (end & 1)
          result = std::min(result, minimum_depth[--end]);
      }
      return result;
    };
    for (std::size_t k = 0; k < objects.size(); ++k) {
      const auto &o = objects[k];
      if (o.eye >= 0 && o.eye != side)
        continue;
      bool color_ready = false;
      auto prepare_color = [&]() {
        if (!color_ready && o.pending_filter) {
          auto color = o.color;
          prepare_optics();
          const auto passed = medium.transmission(o.x, o.y);
          const double factor = (o.kind == 6 ? 1 : world.light(o.x, o.y)) * passed[0];
          for (int c = 0; c < 3; ++c)
            color[c] *= factor * passed[1 + c];
          colors[k] = tint.apply(o.x, o.y, color);
          color_ready = true;
        }
      };
      const double attenuation =
          o.attenuation >= 0 ? o.attenuation : std::exp2(-o.distance / world.water_clarity);
      for (double shift : {-2 * PI, 0., 2 * PI}) {
        const double lo = std::max(knots.front(), o.angle + shift - o.beta),
                     hi = std::min(knots.back(), o.angle + shift + o.beta);
        if (hi <= lo)
          continue;
        const auto first = std::size_t(std::lower_bound(knots.begin(), knots.end(), lo) -
                                       knots.begin()),
                   end = std::size_t(std::lower_bound(knots.begin(), knots.end(), hi) -
                                     knots.begin());
        if (!inspected && o.transparent && first < end &&
            (o.distance <= o.radius ? 0
             : o.far >= 0
                 ? o.far
                 : o.distance + o.radius) <= nearest_depth(first, std::min(end, n)) + 1e-8) {
          prepare_color();
          for (int c = 0; c < 3; ++c) {
            const double light = object_color(k)[c] * attenuation;
            changes[first][c] += light;
            changes[std::min(end, n)][c] -= light;
          }
          continue;
        }
        for (auto j = first; j < end && j < n; ++j)
          if ((o.transparent && circle_depth(o, j) <= depths[j] + 1e-8) ||
              (!o.transparent && nearest[j] == k)) {
            prepare_color();
            for (int c = 0; c < 3; ++c)
              image[j][c] += object_color(k)[c] * attenuation;
            if (inspected)
              visible.push_back({j, k});
          }
      }
    }
    std::array<double, 3> added{};
    for (std::size_t j = 0; j < n; ++j) {
      for (int c = 0; c < 3; ++c) {
        added[c] += changes[j][c];
        image[j][c] += added[c];
      }
      if (!covered[j] && wall[j] < world.env().vision_range) {
        const auto block = block_at(j);
        if (!ready[block]) {
          const double angle = bearing(j), x = eye.x + wall[j] * std::cos(angle),
                       y = eye.y + wall[j] * std::sin(angle);
          auto color = world.surface_color(x, y);
          prepare_optics();
          const auto passed = medium.transmission(x, y);
          const double factor =
              world.light(x, y) * passed[0] * std::exp2(-wall[j] / world.water_clarity);
          for (int c = 0; c < 3; ++c)
            color[c] *= factor * passed[1 + c];
          background[block] = tint.apply(x, y, color);
          ready[block] = 1;
        }
        for (int c = 0; c < 3; ++c)
          image[j][c] += background[block][c];
      }
      if (world.env().vision_ambient > 0) {
        prepare_optics();
        const double a = world.env().vision_ambient, depth = depths[j],
                     transmission = depth < world.env().vision_range
                                        ? std::exp2(-depth / world.water_clarity)
                                        : 0,
                     strength = a * eye_light * (1 - transmission),
                     x = eye.x + depth * (ca * angular[j].x - sa * angular[j].y),
                     y = eye.y + depth * (sa * angular[j].x + ca * angular[j].y);
        auto ambient = tint.apply(x, y,
                                  {strength * world.env().vision_water_red,
                                   strength * world.env().vision_water_green,
                                   strength * world.env().vision_water_blue});
        const auto scatter = tint.scatter(x, y, a * world.env().vision_ink_scatter);
        for (int c = 0; c < 3; ++c)
          image[j][c] += ambient[c] + scatter[c];
      }
      const double width = knots[j + 1] - knots[j], mid = (knots[j + 1] + knots[j]) * .5;
      for (int c = 0; c < 3; ++c) {
        sum[j + 1][c] = sum[j][c] + image[j][c] * width;
        moment[j + 1][c] = moment[j][c] + image[j][c] * width * mid;
      }
    }
    if (inspected) {
      for (std::size_t j = 0; j < n; ++j) {
        const double middle = (knots[j] + knots[j + 1]) * .5;
        if (std::any_of(fields.begin(), fields.end(),
                        [&](const auto &r) { return middle >= r.left && middle <= r.right; }))
          inspected->perception_.visual_image.push_back(
              {knots[j], knots[j + 1], image[j], side, depths[j]});
      }
    }
    integrate_retinal_receptors(binding, objects, world, cache, values,
                                inspected && diagnostic && inspected->perception_.inspect_vision
                                    ? &inspected->perception_
                                    : nullptr);
  }
  inhibit_retinal_receptors(binding, values, world.env().vision_inhibition,
                            world.env().vision_adaptation_angle);
  if (inspected && diagnostic) {
    auto &samples = inspected->perception_.visual_samples;
    std::sort(samples.begin(), samples.end(),
              [](const auto &a, const auto &c) { return a.neuron < c.neuron; });
    std::size_t count = 0;
    for (const auto &sample : samples) {
      if (count && samples[count - 1].neuron == sample.neuron) {
        samples[count - 1].light += sample.light;
        for (int c = 0; c < 3; ++c)
          samples[count - 1].color[c] += sample.color[c];
      } else
        samples[count++] = sample;
    }
    samples.resize(count);
  }
  return values;
}
}
