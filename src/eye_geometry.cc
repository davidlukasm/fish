#include "eye_geometry.hh"
#include <cmath>
namespace fishsim {
namespace {
using Form = BrainInterface::OrganForm;
using XY = std::array<double, 2>;
using Curve = std::array<XY, 4>;
using Plan = std::array<double, 5>;
Form compact(Form f) {
  if (f.weight <= 0)
    return {0, .5, .5, .5, .18, .18};
  for (double *v : {&f.x, &f.y, &f.z, &f.sy, &f.sz})
    *v = std::round(*v * 1000) / 1000;
  return f;
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
  return compact(b.forms[index < 2 ? 0 : 19 + (index - 2) / 2]);
}
Form section(const BrainInterface &b, bool rear) {
  auto c = region(b, 1);
  std::vector<std::pair<Form, double>> parts{{c, rear ? 1 - c.y : c.y}};
  for (int i : (rear ? std::vector<int>{9, 23, 25} : std::vector<int>{7, 11, 13, 15}))
    parts.push_back({combined(b, i), 1});
  for (int i : {5, 29, 31})
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
Plan plan(const std::array<Plan, 6> &p, const Form &f, int order) {
  double phase = 6 * (1.13 * f.z + .71 * f.y + .61 * f.sy + .39 * f.sz +
                      .085 * std::log2(1 + f.weight) + .137 * order);
  double q = std::fmod(std::fmod(phase, 6.) + 6., 6.);
  int i = int(q);
  double u = q - i;
  u = u * u * (3 - 2 * u);
  Plan result{};
  for (int k = 0; k < 5; ++k)
    result[k] = p[i][k] + (p[(i + 1) % 6][k] - p[i][k]) * u;
  return result;
}
XY bezier(const Curve &q, double t) {
  double u = 1 - t;
  return {u * u * u * q[0][0] + 3 * u * u * t * q[1][0] + 3 * u * t * t * q[2][0] +
              t * t * t * q[3][0],
          u * u * u * q[0][1] + 3 * u * u * t * q[1][1] + 3 * u * t * t * q[2][1] +
              t * t * t * q[3][1]};
}
double size(double x) {
  double v = std::sqrt(std::max(0., x));
  return v / (v + 3);
}
}
void prepare_body_geometry(BrainInterface &b) {
  const std::array<Plan, 6> heads{{{1, .76, .28, 1.10, 1.12},
                                   {.80, 1.05, .22, 1.10, 1.18},
                                   {1.48, .40, .42, .85, 1.05},
                                   {.78, 1.22, .15, 1.05, 1.10},
                                   {.90, .98, .45, .90, 1.25},
                                   {1.15, .68, .18, 1.12, 1.05}}};
  const std::array<Plan, 6> chests{{{1, 1.45, .32, 1.25, .95},
                                    {.72, 2.50, .38, .48, .48},
                                    {1.55, .52, .32, 1.10, .85},
                                    {1.12, 1.60, .25, 1.50, .85},
                                    {.90, 2.10, .48, 1.10, 1.30},
                                    {1.20, 1.60, .44, 2.30, 2.30}}};
  const std::array<Plan, 6> torsos{{{1, .78, .18, 1.10, .80},
                                    {.72, 1.45, .14, .55, .55},
                                    {1.75, .40, .18, 1.05, .75},
                                    {1.10, 1.15, .20, 1.40, .55},
                                    {.85, 1.45, .25, 1.30, 1.45},
                                    {1.05, 1.15, .35, 2.30, 2.30}}};
  const std::array<Plan, 6> faces{{{.82, .80, .55, .40, .08},
                                   {.52, 1.35, 1.05, .16, .48},
                                   {.68, .94, 1.15, .15, .24},
                                   {2.10, .34, .30, .68, .22},
                                   {1.45, .63, .75, .24, .14},
                                   {.95, 1.04, .20, .65, .04}}};
  auto h = plan(heads, region(b, 0), 0), c = plan(chests, section(b, false), 1),
       t = plan(torsos, section(b, true), 2), f = plan(faces, combined(b, 21), 3);
  auto cordForm = region(b, 1);
  const auto &org = b.anatomy;
  double brain = std::pow(std::max(0., double(org[34] - org[37])) / 8, .43),
         cord = std::sqrt(std::max(0., double(org[37]))), headBack = .18,
         headLength = (.24 + .68 * brain) * h[0], headFront = headBack + headLength,
         jaw = b.jaw_length, left = size(b.fins[1].strength), right = size(b.fins[2].strength),
         faceLength = (.14 + .40 * jaw) * f[0], snout = headFront + faceLength,
         shoulder = (.11 + .43 * brain) * h[1],
         faceWidth = std::max(.045, (.055 + .22 * jaw + .020 * size(org[21]) +
                                     .018 * std::sqrt(std::max(0., double(org[29])))) *
                                        f[1]),
         chestLength = (.20 + .12 * cord * (.65 + cordForm.y) + .18 * cordForm.sy) * c[0],
         hindLength = (.30 + .20 * cord * (1.25 - cordForm.y) + .14 * cordForm.sy) * t[0] *
                      (1 + .28 * b.gut_length),
         chestBack = headBack - chestLength, tailRoot = chestBack - hindLength,
         trunk = .15 + .11 * (size(org[26]) + size(org[27])) + .06 * size(org[28]) +
                 .035 * (left + right),
         chestWidth = std::max(trunk * c[1], shoulder * (.95 + .15 * c[2])) + .28,
         hindWidth = trunk * t[1] + .28,
         neckWidth = .76 * chestWidth + .24 * std::min(shoulder, chestWidth),
         joinWidth = .58 * chestWidth + .42 * hindWidth;
  std::vector<Curve> curves;
  Curve skull{{{headFront, faceWidth},
               {headFront - headLength * h[2], shoulder * h[3]},
               {headBack + headLength * .25, shoulder * h[4]},
               {headBack, neckWidth}}};
  curves.push_back({{{snout, faceWidth * f[4]},
                     {snout - f[3] * faceLength, faceWidth * f[2]},
                     {headFront + .25 * faceLength, faceWidth},
                     {headFront, faceWidth}}});
  curves.push_back(skull);
  auto append = [&](double front, double back, double fw, double bw, double width, const Plan &p,
                    double center) {
    double peak = front - (front - back) * center, reach = (front - back) * .20;
    curves.push_back({{{front, fw},
                       {front - reach * .65, fw},
                       {peak + std::min(reach * p[3], (front - peak) * .8), width},
                       {peak, width}}});
    curves.push_back({{{peak, width},
                       {peak - std::min(reach * p[4], (peak - back) * .8), width},
                       {back + reach * .65, bw},
                       {back, bw}}});
  };
  auto detail = [&](int side, double at) {
    double x = at * 7;
    int i = int(x);
    double v = b.contour[side * 8 + i] * (1 - (x - i)) +
               b.contour[side * 8 + std::min(7, i + 1)] * (x - i);
    return std::round(255 * v) / 255;
  };
  for (int side = 0; side < 2; ++side) {
    append(headBack, chestBack, neckWidth, joinWidth, chestWidth * (.97 + .06 * detail(side, .60)),
           c, .12 + .76 * c[2]);
    append(chestBack, tailRoot, joinWidth, .028 + .04 * size(b.fins[0].strength),
           hindWidth * (.97 + .06 * detail(side, .23)), t, .12 + .76 * t[2]);
  }
  double lo = snout, hi = tailRoot;
  for (const auto &q : curves)
    for (int k = 0; k < 9; ++k) {
      auto p = bezier(q, k / 8.);
      lo = std::min(lo, p[0]);
      hi = std::max(hi, p[0]);
    }
  double origin = (lo + hi) / 2, extent = 0;
  for (const auto &q : curves)
    for (int k = 0; k < 9; ++k) {
      auto p = bezier(q, k / 8.);
      extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
    }
  // The tail bridge has a quadratic control just behind the tail root.
  double tail = chestBack + (-.96 + .22) / .65 * hindLength,
         bw = .028 + .04 * size(b.fins[0].strength);
  Curve bridge{{{tailRoot, bw},
                {tailRoot + 2 * (tail - tailRoot) / 3, bw / 3},
                {tailRoot + 2 * (tail - tailRoot) / 3, -bw / 3},
                {tailRoot, -bw}}};
  for (int k = 0; k < 9; ++k) {
    auto p = bezier(bridge, k / 8.);
    extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
  }
  // The bridge also participates in the longitudinal reference origin.
  double bridgeLo = lo;
  for (int k = 0; k < 9; ++k)
    bridgeLo = std::min(bridgeLo, bezier(bridge, k / 8.)[0]);
  if (bridgeLo != lo) {
    origin = (bridgeLo + hi) / 2;
    extent = 0;
    for (const auto &q : curves)
      for (int k = 0; k < 9; ++k) {
        auto p = bezier(q, k / 8.);
        extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
      }
    for (int k = 0; k < 9; ++k) {
      auto p = bezier(bridge, k / 8.);
      extent = std::max(extent, std::hypot(p[0] - origin, p[1]));
    }
  }
  const auto chestForm = section(b, false);
  const double chestPhase =
      6 * (1.13 * chestForm.z + .71 * chestForm.y + .61 * chestForm.sy + .39 * chestForm.sz +
           .085 * std::log2(1 + chestForm.weight) + .137);
  b.body_plans = {h, c, t, f};
  b.body_geometry = {headBack,   headLength, faceLength, shoulder,   faceWidth, chestLength,
                     hindLength, trunk,      neckWidth,  chestPhase, origin,    extent};
  for (int k = 0; k < 7; ++k) {
    const double x = k < 5 ? tailRoot + (snout - tailRoot) * k / 4 : headBack - chestLength / 2;
    const double y = k < 5 ? 0 : (k == 5 ? -1 : 1) * chestWidth * .7;
    b.burial_points[k] = {(x - origin) / extent, y / extent};
  }
  for (int side = 0; side < 2; ++side) {
    auto form = compact(b.forms[side + 1]);
    // Place eyes continuously along the face and skull, from snout towards neck.
    const double along = .12 + 1.70 * (1 - std::clamp(double(form.y), 0., 1.));
    auto eye = along < 1 ? bezier(curves.front(), along) : bezier(skull, along - 1);
    b.eye_positions[side] = {(eye[0] - origin) / extent, (side ? 1 : -1) * eye[1] / extent};
  }
}
}
