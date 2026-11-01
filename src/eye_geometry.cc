#include "eye_geometry.hh"
#include <cmath>
#include "body_plan.hh"
namespace fishsim {
namespace {
using Form = BrainInterface::OrganForm;
using XY = std::array<double, 2>;
using XYCurve = std::array<XY, CURVE_POINTS>;
using Plan = std::array<double, field::PLAN_POINTS>;
using Plans = std::array<Plan, body_plan::variants>;
namespace A = anatomy_column;
namespace M = field::body_metric;
namespace Q = field::plan_point;
namespace S = body_shape;
// Absent organs sit at a neutral place and spread; forms are rounded to FORM_PRECISION.
constexpr Form NEUTRAL_FORM{0, .5, .5, .5, .18, .18};
constexpr double FORM_PRECISION = 1000, CONTOUR_LEVELS = 255;
// Curves are sampled at CURVE_SAMPLES points; widths are found in WIDTH_BISECTIONS halvings.
constexpr int CURVE_SAMPLES = 9, WIDTH_BISECTIONS = 14;
// Head: brain size from the head organ (per BRAIN_UNIT, power BRAIN_POWER), skull length and
// shoulder by brain size.
constexpr double BRAIN_UNIT = 8, BRAIN_POWER = .43, HEAD_BACK = .18, HEAD_BASE = .24,
                 HEAD_BRAIN = .68, SHOULDER_BASE = .11, SHOULDER_BRAIN = .43;
// Face: length by jaw, width by jaw, suction and biting, at least FACE_MIN_WIDTH.
constexpr double FACE_BASE = .14, FACE_JAW = .40, FACE_MIN_WIDTH = .045, FACE_WIDTH_BASE = .055,
                 FACE_WIDTH_JAW = .22, FACE_WIDTH_SUCTION = .020, FACE_WIDTH_BITE = .018;
// Chest and hind length by cord size and placement; the gut stretches the hind.
constexpr double CHEST_BASE = .20, CHEST_CORD = .12, CHEST_CORD_PLACE = .65, CHEST_SPREAD = .18,
                 HIND_BASE = .30, HIND_CORD = .20, HIND_CORD_PLACE = 1.25, HIND_SPREAD = .14,
                 HIND_GUT = .28;
// Trunk width from gonads, defense and the rear fins.
constexpr double TRUNK_BASE = .15, TRUNK_GONADS = .11, TRUNK_DEFENSE = .06, TRUNK_FINS = .035;
// Organ size saturates at half for SIZE_HALF.
constexpr double SIZE_HALF = 3;
// The tail bridge's control point lies TAIL_CONTROL hind lengths behind the chest.
constexpr double TAIL_CONTROL = (-.96 + .22) / .65;
// Burial probes: BURIAL_AXIAL points along the body and two at the chest sides, BURIAL_SIDE
// of the chest width out.
constexpr int BURIAL_AXIAL = 5;
constexpr double BURIAL_SIDE = .7;
// Eyes lie EYE_FRONT along the face plus EYE_SPAN by their place; their radius grows from
// EYE_BASE by EYE_GAIN times the weight to EYE_POWER; their width follows spread and depth.
constexpr double EYE_FRONT = .12, EYE_SPAN = 1.70, EYE_BASE = .035, EYE_GAIN = .048,
                 EYE_POWER = .30, EYE_WIDTH = .8, EYE_WIDTH_SPREAD = 1.1, EYE_WIDTH_DEPTH = .5;
// Eye shapes take the plan order after all body plans.
constexpr int EYE_PLAN_ORDER = 8;
Form compact(Form f) {
  if (f.weight <= 0)
    return NEUTRAL_FORM;
  for (double *v : {&f.x, &f.y, &f.z, &f.sy, &f.sz})
    *v = std::round(*v * FORM_PRECISION) / FORM_PRECISION;
  return f;
}
// Phase of a plan variant from the organ's form; shared with the viewer.
double plan_phase(const Form &f, int order) {
  const auto &w = body_plan::phase_weights;
  return body_plan::variants *
         (w[0] * f.z + w[1] * f.y + w[2] * f.sy + w[3] * f.sz +
          body_plan::phase_volume * std::log2(1 + f.weight) + body_plan::phase_order * order);
}
double section_center(const Plan &p) {
  return S::peak_min + S::peak_span * p[Q::peak];
}
Form combined(const BrainInterface &b, int i) {
  auto a = compact(b.forms[i]), c = compact(b.forms[i + 1]);
  double w = a.weight + c.weight;
  if (!w)
    return compact({});
  return {w,
          (a.x * a.weight + c.x * c.weight) / w,
          (a.y * a.weight + c.y * c.weight) / w,
          (a.z * a.weight + c.z * c.weight) / w,
          (a.sy * a.weight + c.sy * c.weight) / w,
          (a.sz * a.weight + c.sz * c.weight) / w};
}
Form region(const BrainInterface &b, int index) {
  if (b.regions[index].weight > 0)
    return compact(b.regions[index]);
  return compact(b.forms[index < 2 ? BrainInterface::INTERNAL_FORM
                                   : BrainInterface::motor_form(field::Turn, (index - 2) / 2)]);
}
Form section(const BrainInterface &b, bool rear) {
  auto c = region(b, 1);
  std::vector<std::pair<Form, double>> parts{{c, rear ? 1 - c.y : c.y}};
  using I = BrainInterface;
  for (int i : (rear ? std::vector<int>{I::sense_form(field::Proximity), I::motor_form(field::Eggs),
                                        I::motor_form(field::Sperm)}
                     : std::vector<int>{I::sense_form(field::Touch), I::sense_form(field::Intake),
                                        I::sense_form(field::Damage),
                                        I::sense_form(field::BladderPressure)}))
    parts.push_back({combined(b, i), 1});
  // Organs reaching across both sections count half in each.
  for (int i :
       {I::sense_form(field::Flow), I::motor_form(field::Defense), I::motor_form(field::Pigment)})
    parts.push_back({combined(b, i), .5});
  for (int side = 0; side < 2; ++side)
    parts.push_back({region(b, 2 + 2 * side + int(rear)), 1});
  Form f{};
  double yy = 0, zz = 0;
  for (const auto &[q, s] : parts) {
    double w = q.weight * s;
    f.weight += w;
    f.x += w * q.x;
    f.y += w * q.y;
    f.z += w * q.z;
    yy += w * (q.sy * q.sy + q.y * q.y);
    zz += w * (q.sz * q.sz + q.z * q.z);
  }
  if (!f.weight)
    return c;
  f.x /= f.weight;
  f.y /= f.weight;
  f.z /= f.weight;
  f.sy = std::sqrt(std::max(0., yy / f.weight - f.y * f.y));
  f.sz = std::sqrt(std::max(0., zz / f.weight - f.z * f.z));
  return f;
}
Plan plan(const Plans &p, const Form &f, int order) {
  constexpr double n = body_plan::variants;
  double q = std::fmod(std::fmod(plan_phase(f, order), n) + n, n);
  int i = int(q);
  double u = q - i;
  u = u * u * (3 - 2 * u);
  Plan result{};
  for (std::size_t k = 0; k < result.size(); ++k)
    result[k] = p[i][k] + (p[(i + 1) % p.size()][k] - p[i][k]) * u;
  return result;
}
XY bezier(const XYCurve &q, double t) {
  double u = 1 - t;
  return {u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] +
              t * t * t * q[3][0],
          u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] +
              t * t * t * q[3][1]};
}
double size(double x) {
  double v = std::sqrt(std::max(0., x));
  return v / (v + SIZE_HALF);
}
}
double chest_width(double trunk, double shoulder,
                   const std::array<double, field::PLAN_POINTS> &chest) {
  return std::max(trunk * chest[Q::width],
                  shoulder * (S::shoulder_base + S::shoulder_plan * chest[Q::peak])) +
         S::reserve_width;
}
double hind_width(double trunk, const std::array<double, field::PLAN_POINTS> &torso) {
  return trunk * torso[Q::width] + S::reserve_width;
}
double join_width(double chest, double hind) {
  return S::join_chest * chest + (1 - S::join_chest) * hind;
}
void prepare_body_geometry(BrainInterface &b) {
  const Plans heads{{{1, .76, .28, 1.10, 1.12},
                     {.80, 1.05, .22, 1.10, 1.18},
                     {1.48, .40, .42, .85, 1.05},
                     {.78, 1.22, .15, 1.05, 1.10},
                     {.90, .98, .45, .90, 1.25},
                     {1.15, .68, .18, 1.12, 1.05}}};
  const Plans chests{{{1, 1.45, .32, 1.25, .95},
                      {.72, 2.50, .38, .48, .48},
                      {1.55, .52, .32, 1.10, .85},
                      {1.12, 1.60, .25, 1.50, .85},
                      {.90, 2.10, .48, 1.10, 1.30},
                      {1.20, 1.60, .44, 2.30, 2.30}}};
  const Plans torsos{{{1, .78, .18, 1.10, .80},
                      {.72, 1.45, .14, .55, .55},
                      {1.75, .40, .18, 1.05, .75},
                      {1.10, 1.15, .20, 1.40, .55},
                      {.85, 1.45, .25, 1.30, 1.45},
                      {1.05, 1.15, .35, 2.30, 2.30}}};
  const Plans faces{{{.82, .80, .55, .40, .08},
                     {.52, 1.35, 1.05, .16, .48},
                     {.68, .94, 1.15, .15, .24},
                     {2.10, .34, .30, .68, .22},
                     {1.45, .63, .75, .24, .14},
                     {.95, 1.04, .20, .65, .04}}};
  namespace P = field::body_plan_part;
  auto h = plan(heads, region(b, 0), P::head), c = plan(chests, section(b, false), P::chest),
       t = plan(torsos, section(b, true), P::torso),
       f = plan(faces, combined(b, BrainInterface::motor_form(field::Suction)), P::face);
  auto cordForm = region(b, 1);
  const auto &org = b.anatomy;
  double brain = std::pow(std::max(0., double(org[A::head])) / BRAIN_UNIT, BRAIN_POWER),
         cord = std::sqrt(std::max(0., double(org[A::cord]))), headBack = HEAD_BACK,
         headLength = (HEAD_BASE + HEAD_BRAIN * brain) * h[Q::length],
         headFront = headBack + headLength, jaw = b.jaw_length,
         left = size(b.fins[fin::left].strength), right = size(b.fins[fin::right].strength),
         faceLength = (FACE_BASE + FACE_JAW * jaw) * f[Q::length], snout = headFront + faceLength,
         shoulder = (SHOULDER_BASE + SHOULDER_BRAIN * brain) * h[Q::width],
         faceWidth = std::max(
             FACE_MIN_WIDTH,
             (FACE_WIDTH_BASE + FACE_WIDTH_JAW * jaw +
              FACE_WIDTH_SUCTION * size(org[A::suction_strength]) +
              FACE_WIDTH_BITE * std::sqrt(std::max(0., double(org[A::aggression_strength])))) *
                 f[Q::width]),
         chestLength = (CHEST_BASE + CHEST_CORD * cord * (CHEST_CORD_PLACE + cordForm.y) +
                        CHEST_SPREAD * cordForm.sy) *
                       c[Q::length],
         hindLength = (HIND_BASE + HIND_CORD * cord * (HIND_CORD_PLACE - cordForm.y) +
                       HIND_SPREAD * cordForm.sy) *
                      t[Q::length] * (1 + HIND_GUT * b.gut_length),
         chestBack = headBack - chestLength, tailRoot = chestBack - hindLength,
         trunk = TRUNK_BASE +
                 TRUNK_GONADS * (size(org[A::egg_strength]) + size(org[A::sperm_strength])) +
                 TRUNK_DEFENSE * size(org[A::defense_strength]) + TRUNK_FINS * (left + right),
         chestWidth = chest_width(trunk, shoulder, c), hindWidth = hind_width(trunk, t),
         neckWidth =
             S::neck_chest * chestWidth + (1 - S::neck_chest) * std::min(shoulder, chestWidth),
         joinWidth = join_width(chestWidth, hindWidth);
  std::vector<XYCurve> curves;
  XYCurve skull{{{headFront, faceWidth},
                 {headFront - headLength * h[Q::head_handle], shoulder * h[Q::head_front_lift]},
                 {headBack + headLength * S::skull_handle, shoulder * h[Q::head_back_lift]},
                 {headBack, neckWidth}}};
  curves.push_back({{{snout, faceWidth * f[Q::snout_width]},
                     {snout - f[Q::face_handle] * faceLength, faceWidth * f[Q::face_handle_width]},
                     {headFront + S::face_handle * faceLength, faceWidth},
                     {headFront, faceWidth}}});
  curves.push_back(skull);
  auto append = [&](double front, double back, double fw, double bw, double width, const Plan &p,
                    double center) {
    double peak = front - (front - back) * center, reach = (front - back) * S::reach;
    curves.push_back(
        {{{front, fw},
          {front - reach * S::handle, fw},
          {peak + std::min(reach * p[Q::front_reach], (front - peak) * S::limit), width},
          {peak, width}}});
    curves.push_back({{{peak, width},
                       {peak - std::min(reach * p[Q::back_reach], (peak - back) * S::limit), width},
                       {back + reach * S::handle, bw},
                       {back, bw}}});
  };
  auto detail = [&](int side, double at) {
    double x = at * (BrainInterface::CONTOUR_BINS - 1);
    int i = int(x);
    double v = b.contour[side * BrainInterface::CONTOUR_BINS + i] * (1 - (x - i)) +
               b.contour[side * BrainInterface::CONTOUR_BINS +
                         std::min(BrainInterface::CONTOUR_BINS - 1, i + 1)] *
                   (x - i);
    return std::round(CONTOUR_LEVELS * v) / CONTOUR_LEVELS;
  };
  for (int side = 0; side < 2; ++side) {
    append(headBack, chestBack, neckWidth, joinWidth,
           chestWidth * (S::detail_base + S::detail_gain * detail(side, S::detail_chest)), c,
           section_center(c));
    append(chestBack, tailRoot, joinWidth,
           S::tail_base + S::tail_fin * size(b.fins[fin::tail].strength),
           hindWidth * (S::detail_base + S::detail_gain * detail(side, S::detail_hind)), t,
           section_center(t));
  }
  double lo = snout, hi = tailRoot;
  for (const auto &q : curves)
    for (int k = 0; k < CURVE_SAMPLES; ++k) {
      auto p = bezier(q, double(k) / (CURVE_SAMPLES - 1));
      lo = std::min(lo, p[0]);
      hi = std::max(hi, p[0]);
    }
  double origin = (lo + hi) / 2, extent = 0;
  for (const auto &q : curves)
    for (int k = 0; k < CURVE_SAMPLES; ++k) {
      auto p = bezier(q, double(k) / (CURVE_SAMPLES - 1));
      extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
    }
  // The tail bridge has a quadratic control just behind the tail root.
  double tail = chestBack + TAIL_CONTROL * hindLength,
         bw = S::tail_base + S::tail_fin * size(b.fins[fin::tail].strength);
  XYCurve bridge{{{tailRoot, bw},
                  {tailRoot + 2 * (tail - tailRoot) / 3, bw / 3},
                  {tailRoot + 2 * (tail - tailRoot) / 3, -bw / 3},
                  {tailRoot, -bw}}};
  for (int k = 0; k < CURVE_SAMPLES; ++k) {
    auto p = bezier(bridge, double(k) / (CURVE_SAMPLES - 1));
    extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
  }
  // The bridge also participates in the longitudinal reference origin.
  double bridgeLo = lo;
  for (int k = 0; k < CURVE_SAMPLES; ++k)
    bridgeLo = std::min(bridgeLo, bezier(bridge, double(k) / (CURVE_SAMPLES - 1))[0]);
  if (bridgeLo != lo) {
    origin = (bridgeLo + hi) / 2;
    extent = 0;
    for (const auto &q : curves)
      for (int k = 0; k < CURVE_SAMPLES; ++k) {
        auto p = bezier(q, double(k) / (CURVE_SAMPLES - 1));
        extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
      }
    for (int k = 0; k < CURVE_SAMPLES; ++k) {
      auto p = bezier(bridge, double(k) / (CURVE_SAMPLES - 1));
      extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
    }
  }
  const auto chestForm = section(b, false);
  const double chestPhase = plan_phase(chestForm, field::body_plan_part::chest);
  b.body_plans = {h, c, t, f};
  b.body_geometry = {headBack,   headLength, faceLength, shoulder,   faceWidth, chestLength,
                     hindLength, trunk,      neckWidth,  chestPhase, origin,    extent};
  for (std::size_t k = 0; k < b.burial_points.size(); ++k) {
    const bool axial = k < BURIAL_AXIAL;
    const double x =
        axial ? tailRoot + (snout - tailRoot) * k / (BURIAL_AXIAL - 1) : headBack - chestLength / 2;
    const double y = axial ? 0 : (k == BURIAL_AXIAL ? -1 : 1) * chestWidth * BURIAL_SIDE;
    b.burial_points[k] = {(x - origin) / extent, y / extent};
  }
  for (int side = 0; side < 2; ++side) {
    auto form = compact(b.forms[side + 1]);
    // Place eyes continuously along the face and skull, from snout towards neck.
    const double along = EYE_FRONT + EYE_SPAN * (1 - std::clamp(double(form.y), 0., 1.));
    auto eye = along < 1 ? bezier(curves.front(), along) : bezier(skull, along - 1);
    b.eye_positions[side] = {(eye[0] - origin) / extent, (side ? 1 : -1) * eye[1] / extent};
  }
}
void prepare_eye_shape(BrainInterface &b) {
  const Plans eyes{{{.28, .94, 1, 1, .64},
                    {.12, .98, 1.35, .78, .58},
                    {.68, .90, .78, 1.15, .66},
                    {.43, .67, 1.05, .95, .55},
                    {.24, 1.02, 1.4, 1.3, .70},
                    {.82, .85, .92, .84, .62}}};
  for (int side = 0; side < EYES; ++side) {
    const auto f = compact(b.forms[BrainInterface::sense_form(field::Light, side)]);
    if (f.weight <= 0)
      continue;
    const auto q = plan(eyes, f, EYE_PLAN_ORDER);
    const double ry = (EYE_BASE + EYE_GAIN * std::pow(f.weight, EYE_POWER)) * q[Q::eye_size] /
                      b.body_geometry[M::extent],
                 rx = ry * (EYE_WIDTH + EYE_WIDTH_SPREAD * f.sz + EYE_WIDTH_DEPTH * f.z) *
                      q[Q::eye_width];
    b.eye_shape[side] = {rx, ry, q[Q::pupil]};
  }
  if (b.eye_shape[0][1] > 0 && b.eye_shape[1][1] > 0)
    b.eye_clearance =
        S::eye_clearance * (b.eye_shape[0][1] + b.eye_shape[1][1]) +
        std::max({b.eye_shape[0][0], b.eye_shape[0][1], b.eye_shape[1][0], b.eye_shape[1][1]});
}
void prepare_zonal_geometry(field::Substrate &s) {
  const auto a = anatomical_interface(s);
  s.body_geometry = a->body_geometry;
  s.body_plans = a->body_plans;
  s.burial_points = a->burial_points;
  const auto &g = s.body_geometry;
  namespace P = field::body_plan_part;
  const double origin = g[M::center], scale = g[M::extent];
  const std::array<double, 5> boundary{
      g[M::head_back] + g[M::head_length] + g[M::face_length], g[M::head_back] + g[M::head_length],
      g[M::head_back], g[M::head_back] - g[M::chest_length],
      g[M::head_back] - g[M::chest_length] - g[M::base_hind_length]};
  const double cw = chest_width(g[M::trunk], g[M::rest_shoulder], s.body_plans[P::chest]),
               hw = hind_width(g[M::trunk], s.body_plans[P::torso]);
  s.body_length = (boundary[0] - boundary[4]) / scale;
  std::array<double, 2> weight{};
  for (auto &n : s.neurons) {
    const auto &p = n.location;
    const int zone = p.zone;
    const double y = boundary[zone + 1] + p.u * (boundary[zone] - boundary[zone + 1]);
    double width = 0;
    if (zone == 0)
      width = g[M::face_width] * (1 - p.u + p.u * s.body_plans[P::face][Q::snout_width]);
    else if (zone == 1) {
      const auto &h = s.body_plans[P::head];
      XYCurve skull{{{boundary[1], g[M::face_width]},
                     {boundary[1] - g[M::head_length] * h[Q::head_handle],
                      g[M::rest_shoulder] * h[Q::head_front_lift]},
                     {boundary[2] + g[M::head_length] * S::skull_handle,
                      g[M::rest_shoulder] * h[Q::head_back_lift]},
                     {boundary[2], g[M::neck_width]}}};
      double lo = 0, hi = 1;
      for (int k = 0; k < WIDTH_BISECTIONS; ++k) {
        const double m = (lo + hi) / 2;
        if (bezier(skull, m)[0] > y)
          lo = m;
        else
          hi = m;
      }
      width = bezier(skull, (lo + hi) / 2)[1];
    } else {
      const auto &plan = s.body_plans[zone - 1];
      const double center = section_center(plan), front = boundary[zone], back = boundary[zone + 1],
                   peak = front - (front - back) * center, reach = (front - back) * S::reach,
                   fw = zone == 2 ? g[M::neck_width] : join_width(cw, hw),
                   bw = zone == 2 ? join_width(cw, hw)
                                  : S::tail_base + S::tail_fin * size(a->fins[fin::tail].strength),
                   wide = zone == 2 ? cw : hw;
      XYCurve curve =
          y >= peak
              ? XYCurve{{{front, fw},
                         {front - reach * S::handle, fw},
                         {peak + std::min(reach * plan[Q::front_reach], (front - peak) * S::limit),
                          wide},
                         {peak, wide}}}
              : XYCurve{
                    {{peak, wide},
                     {peak - std::min(reach * plan[Q::back_reach], (peak - back) * S::limit), wide},
                     {back + reach * S::handle, bw},
                     {back, bw}}};
      double lo = 0, hi = 1;
      for (int k = 0; k < WIDTH_BISECTIONS; ++k) {
        double m = (lo + hi) / 2;
        if (bezier(curve, m)[0] > y)
          lo = m;
        else
          hi = m;
      }
      width = bezier(curve, (lo + hi) / 2)[1];
    }
    n.x = float(p.side * p.w * width / scale);
    n.y = float((y - origin) / scale);
    n.z = float((2 * p.v - 1) * width / scale);
    if (n.functions.senses[field::Light] + n.functions.senses[field::Proximity] > 0) {
      const int side = p.side < 0 ? 0 : 1;
      weight[side] += n.strength;
      s.eye_positions[side][0] += n.strength * n.y;
      s.eye_positions[side][1] += n.strength * p.side * width / scale;
    }
  }
  for (int side = 0; side < 2; ++side)
    if (weight[side])
      for (auto &v : s.eye_positions[side])
        v /= weight[side];
  s.geometry_ready = true;
}

}
