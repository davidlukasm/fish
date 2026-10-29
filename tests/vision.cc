#include "test_support.hh"
#include "retina.hh"
#include "sight.hh"

using namespace test;
namespace {
BrainInterface eyes() {
  BrainInterface binding;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  for (int side = 0; side < 2; ++side) {
    BrainInterface::Receptor r{};
    r.neuron = side;
    r.senses[0] = 1;
    r.refresh_modality();
    r.spectrum = {1, 0, 0};
    r.lateral = side ? 1 : -1;
    r.angle = side ? .5f : -.5f;
    r.width = .3;
    r.view_left = r.angle - r.width;
    r.view_right = r.angle + r.width;
    binding.sensory.push_back(r);
    binding.visual[0].push_back({r.angle, std::uint32_t(side)});
    binding.forms[1 + side] = {1, 1, .5, 0, 0, 0};
    binding.eye_positions[side] = {1, side ? 2.4 : -2.4};
  }
  return binding;
}

void blocked_eyes() {
  Field field(9001, 0);
  StateAccess::geometry(field).obstacles.clear();
  StateAccess::geometry(field).obstacles.push_back(
      {220, 204.5, 50, {{180, 204}, {260, 204}, {260, 205}, {180, 205}}});
  field.sync_environment();
  auto binding = eyes();
  Body body;
  body.x = body.y = 200;
  body.tissue = 40;
  auto origins = visual_origins(body, binding, field);
  check(origins[0].present && origins[1].present && origins[0].y < 200,
        "two anatomical eyes occupy opposite body sides");
  check(origins[1].y < 204 && origins[1].y > 203.99 && field.free(origins[1].x, origins[1].y, 0),
        "an eye beyond a thin wall is pulled to its near free surface");
  StateAccess::geometry(field).obstacles[0].vertices = {
      {180, 204}, {260, 204}, {260, 215}, {180, 215}};
  field.sync_environment();
  origins = visual_origins(body, binding, field);
  check(origins[1].y < 204 && origins[1].y > 203.99,
        "an eye inside a wall is pulled toward the body centre");
  body.angle = PI / 2;
  origins = visual_origins(body, binding, field);
  check(origins[0].x > body.x && origins[1].x < body.x, "eye offsets rotate with the body");
  binding.forms[2].weight = 0;
  check(!visual_origins(body, binding, field)[1].present,
        "a side without visual anatomy has no eye");
}

void buried_eyes() {
  Field field(9002, 0);
  field.resize(615, 410);
  StateAccess::geometry(field).obstacles.clear();
  field.sync_environment();
  for (auto &patch : StateAccess::vegetation(field).surfaces)
    if (patch.normal.y < -.5)
      StateAccess::sediment(patch) = patch.length * 10;
  field.index_plants();
  auto binding = eyes();
  Body body;
  body.x = 200;
  body.y = 368;
  body.tissue = 40;
  auto origins = visual_origins(body, binding, field);
  check(origins[1].y > 369 && origins[1].y < 370 &&
            field.sediment_immersion(origins[1].x, origins[1].y) == 0,
        "an eye inside the bed moves to the nearest free point toward the centre");
  body.y = 375;
  origins = visual_origins(body, binding, field);
  check(origins[0].y < 370 && origins[0].exposure == 1 && origins[1].exposure == 0,
        "an exposed eye can see while its body and other eye are buried");
  body.y = 390;
  origins = visual_origins(body, binding, field);
  check(origins[0].exposure == 0 && origins[1].exposure == 0,
        "an entirely buried centre-to-eye segment stays occluded");
}

void sediment_drag() {
  Field field(9004, 0);
  field.resize(615, 410);
  StateAccess::geometry(field).obstacles.clear();
  field.sync_environment();
  for (auto &patch : StateAccess::vegetation(field).surfaces)
    if (patch.normal.y < -.5)
      StateAccess::sediment(patch) = patch.length * 40;
  field.index_plants();
  Body wet;
  wet.x = 200;
  wet.y = 200;
  wet.tissue = 40;
  auto &motor = StateAccess::motor(wet);
  motor.swimming_pending = true;
  motor.impulse_left = .3;
  motor.impulse_forward = .2;
  motor.motor_factor = 1;
  Body buried = wet;
  buried.y = 375;
  check(field.sediment_immersion(buried.x, buried.y, body_radius(buried)) > .9,
        "drag fixture places the complete body in the bed");
  PhysiologyParameters physiology;
  physiology.sinking = physiology.bladder_strength = 0;
  move_body(wet, &field, physiology, true);
  move_body(buried, &field, physiology, true);
  check(near(10 * buried.angle, wet.angle) &&
            std::abs(buried.x - 200) < .25 * std::abs(wet.x - 200),
        "the median undulating fish keeps reduced turning and propulsion in sediment");
  std::fill(StateAccess::water(field).u.begin(), StateAccess::water(field).u.end(), 5);
  StateAccess::motor(buried).vx = StateAccess::motor(buried).vy = 0;
  limit_swimming(buried, field, physiology);
  check(std::abs(StateAccess::motor(buried).vx) < 1e-12 &&
            std::abs(StateAccess::motor(buried).water_vx) < .5,
        "the collision speed limit cannot restore the full water current inside sediment");
}

void contrast() {
  Field field(9003, 0);
  auto &env = StateAccess::env(field);
  env.vision_ambient = env.vision_adaptation = env.vision_inhibition = 0;
  BrainInterface binding;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  BrainInterface::Receptor r{};
  r.senses[0] = 1;
  r.refresh_modality();
  r.spectrum = {1, 0, 0};
  r.opponency = 1;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  r.view_left = -.1f;
  r.view_right = .1f;
  binding.sensory.push_back(r);
  binding.visual[0] = {{0, 0}};
  Body body;
  body.x = body.y = 200;
  std::vector<VisualObject> objects{{20, 5, 0, .3, {1, 1, 1}}};
  check(retinal_vision(body, binding, field, objects)[0] == 0,
        "a selective opponent receptor rejects achromatic illumination");
  objects[0].color = {1, 0, 0};
  check(retinal_vision(body, binding, field, objects)[0] > .5,
        "the same receptor retains its preferred colour");
  binding.sensory[0].spectrum = {1.f / 3, 1.f / 3, 1.f / 3};
  const auto wide = retinal_vision(body, binding, field, objects);
  env.vision_opponent = 0;
  check(wide == retinal_vision(body, binding, field, objects),
        "broad spectral tuning retains its luminance signal");
  env.vision_adaptation = 1;
  check(std::abs(retinal_vision(body, binding, field, objects)[0]) < 1e-6,
        "local adaptation removes spatially uniform illumination");
}

void finite_background() {
  Field field(9010, 0);
  field.resize(615, 410);
  StateAccess::geometry(field).obstacles.clear();
  field.sync_environment();
  BrainInterface binding;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  BrainInterface::Receptor receptor{};
  receptor.senses[0] = 1;
  receptor.refresh_modality();
  receptor.spectrum = {1, 0, 0};
  receptor.view_left = -.1f;
  receptor.view_right = .1f;
  binding.sensory = {receptor};
  binding.visual[0] = {{0, 0}};
  Body body;
  body.x = 200;
  body.y = 10;
  retinal_vision(body, binding, field, {}, &body);
  check(!body.perception().visual_image.empty(), "the near-surface fixture has a visual field");
  for (const auto &band : body.perception().visual_image)
    check(std::isfinite(band.distance) && band.distance <= field.env().vision_range,
          "background rays stop at the visual range even near a distant wall");
}

void tiny_food_coverage() {
  auto w = small_world(9017);
  auto &world = w.field;
  auto &env = StateAccess::env(world);
  env.vision_ambient = env.vision_adaptation = env.vision_inhibition = env.vision_opponent = 0;
  BrainInterface binding;
  binding.forms[1].weight = 1;
  for (int i = 0; i < 100; ++i) {
    BrainInterface::Receptor r{};
    r.senses[0] = 1;
    r.refresh_modality();
    r.spectrum = {1, 0, 0};
    r.angle = -.8f + .0161f * i;
    r.width = .071f + .0037f * i;
    r.view_left = r.angle - r.width;
    r.view_right = r.angle + r.width;
    binding.sensory.push_back(r);
    binding.visual[0].push_back({r.angle, std::uint32_t(i)});
  }
  prepare_retinal_cache(binding);
  Body body;
  body.x = 300;
  body.y = 160;
  for (double angle = -.75; angle < .75; angle += .1037) {
    const double half = std::asin(.1 / 120);
    const std::vector<VisualObject> food{{120, .1, angle, half, {1, 0, 0}}};
    const auto values = retinal_vision(body, binding, world, food);
    for (std::size_t i = 0; i < values.size(); ++i) {
      const auto &r = binding.sensory[i];
      const double width = (r.view_right - r.view_left) * .5;
      auto integral = [&](double x) {
        x = std::clamp(x, double(r.view_left), double(r.view_right));
        if (x < r.angle)
          return (x - r.view_left) * (x - r.view_left) / (2 * (r.angle - r.view_left));
        return width - (r.view_right - x) * (r.view_right - x) / (2 * (r.view_right - r.angle));
      };
      const double expected = (integral(angle + half) - integral(angle - half)) / width *
                              std::exp2(-120 / world.water_clarity);
      check(std::abs(values[i] - expected) < 1e-7,
            "sub-pixel food retains exact triangular receptor coverage across raster boundaries");
    }
  }
}

void translucent_ranges() {
  Field world(9011, 0);
  world.resize(615, 410);
  BrainInterface binding;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  for (int i = 0; i < 16; ++i) {
    BrainInterface::Receptor r{};
    r.senses[0] = 1;
    r.refresh_modality();
    r.spectrum = {.6f, .3f, .1f};
    r.angle = -2.4f + .32f * i;
    r.view_left = r.angle - .4f;
    r.view_right = r.angle + .4f;
    r.lateral = i < 8 ? -1 : 1;
    binding.sensory.push_back(r);
    binding.visual[0].push_back({r.angle, std::uint32_t(i)});
  }
  Body body;
  body.x = 300;
  body.y = 200;
  Rng random(9011);
  for (int scene = 0; scene < 4; ++scene) {
    std::vector<VisualObject> objects;
    for (int i = 0; i < 240; ++i) {
      const double distance = random.uniform(2, 120), radius = random.uniform(.5, 8),
                   angle = random.uniform(-PI, PI);
      objects.push_back({distance,
                         radius,
                         angle,
                         distance <= radius ? PI : std::asin(radius / distance),
                         {random.uniform(0, 1), random.uniform(0, 1), random.uniform(0, 1)},
                         i % 7 != 0});
    }
    const auto fast = retinal_vision(body, binding, world, objects);
    const auto direct = retinal_vision(body, binding, world, objects, &body, RETINAL_STRIDE, false);
    for (std::size_t i = 0; i < fast.size(); ++i)
      check(std::abs(fast[i] - direct[i]) < 1e-6,
            "translucent range sums preserve explicit band shading and occlusion");
  }
}

void suspended_optics() {
  auto w = small_world(9014);
  auto &f = w.field;
  auto &dust = StateAccess::sediment(f);
  for (auto &s : StateAccess::vegetation(f).surfaces)
    s.sediment = 0;
  f.index_plants();
  const double area = f.geometry().width / dust.columns * f.geometry().height / dust.rows;
  SightMedium medium;
  for (int mode = 0; mode < 2; ++mode) {
    for (int y = 0; y < dust.rows; ++y)
      for (int x = 0; x < dust.columns; ++x)
        dust.suspended[y * dust.columns + x] =
            area / 64 * (mode ? .18 + .08 * std::sin(x * .2) * std::cos(y * .2) : .18);
    medium.prepare(f, 300, 200);
    for (double angle = -PI; angle < PI; angle += .37)
      for (double length : {16., 55., 95., 128.}) {
        double integral = 0;
        for (int k = 0; k < 256; ++k) {
          const double r = (k + .5) * length / 256;
          integral += f.optical_turbidity(300 + std::cos(angle) * r, 200 + std::sin(angle) * r) *
                      length / 256;
        }
        const double exact = std::exp2(-integral / f.env().sediment_path);
        const auto sampled =
            medium.transmission(300 + std::cos(angle) * length, 200 + std::sin(angle) * length);
        check(std::abs(sampled[0] - exact) < (mode ? .006 : 1e-10),
              "shared optical samples retain uniform and smooth suspended attenuation");
      }
  }
  std::fill(dust.suspended.begin(), dust.suspended.end(), area / 64 * .00001);
  medium.prepare(f, 300, 200);
  check(std::abs(medium.transmission(428, 200)[0] -
                 std::exp2(-.00001 * 128 / f.env().sediment_path)) < .001,
        "negligible suspended tails have a bounded transmission error");
  std::fill(dust.suspended.begin(), dust.suspended.end(), 0.);
  medium.prepare(f, 400, 100);
  check(medium.transmission(440, 100)[0] == 1,
        "moving the eye clears its previous suspended-light integrals");
}

void retinal_inhibition() {
  BrainInterface eyes;
  eyes.forms[1].weight = eyes.forms[2].weight = 1;
  for (float angle : {-1.1f, -1.f, 1.f, 1.1f}) {
    BrainInterface::Receptor r{};
    r.senses[0] = 1;
    r.refresh_modality();
    r.angle = angle;
    r.lateral = angle < 0 ? -1 : 1;
    eyes.visual[0].push_back({angle, std::uint32_t(eyes.sensory.size())});
    eyes.sensory.push_back(r);
  }
  prepare_retinal_cache(eyes);
  const std::vector<float> original{2, 2, 6, 2};
  auto value = original;
  inhibit_retinal_receptors(eyes, value, 0, 360);
  check(value == original, "zero inhibition preserves every raw stimulus exactly");
  inhibit_retinal_receptors(eyes, value, 1, 360);
  check(value == std::vector<float>({0, 0, 2, 0}),
        "inhibition uses each eye separately and includes each receptor itself");
  value = {2, 0, 8, 6};
  inhibit_retinal_receptors(eyes, value, 1, 15);
  check(value == std::vector<float>({1, 0, 1, 0}),
        "local inhibition uses unchanged neighbours inside the adaptation surround");
  value = original;
  inhibit_retinal_receptors(eyes, value, 1, 1);
  check(value == std::vector<float>(4, 0), "distant receptors fall outside the local surround");
  value.assign(4, .03f);
  inhibit_retinal_receptors(eyes, value, 1, 360);
  check(value == std::vector<float>(4, 0), "uniform illumination is removed before saturation");
}

void source_lighting(const Genome &base) {
  auto g = base;
  auto binding = std::make_shared<BrainInterface>();
  binding->forms[1].weight = binding->forms[2].weight = 1;
  BrainInterface::Receptor r{};
  r.senses[0] = 1;
  r.refresh_modality();
  r.spectrum = {1, 1, 1};
  r.view_left = -.2f;
  r.view_right = .2f;
  binding->sensory = {r};
  binding->visual[0] = {{0, 0}};
  g.interface = binding;
  Field field(1301, 0);
  StateAccess::env(field).light_bottom = 1;
  StateAccess::lighting(field).columns = StateAccess::lighting(field).rows = 2;
  StateAccess::lighting(field).illumination.assign(4, .2);
  StateAccess::vegetation(field).plants.push_back({240, 200, 2, 20, 0, 4});
  Body b;
  b.x = b.y = 200;
  StateAccess::perception(b).probe.kind = 0;
  StateAccess::perception(b).probe.remaining = 4;
  StateAccess::perception(b).probe.x = 260;
  StateAccess::perception(b).probe.y = 200;
  StateAccess::perception(b).probe.radius = 2;
  StateAccess::perception(b).probe.color = {1, .5, .25};
  const auto objects = visual_objects(b, g, field);
  auto algae =
           std::find_if(objects.begin(), objects.end(), [](const auto &p) { return p.kind == 4; }),
       probe =
           std::find_if(objects.begin(), objects.end(), [](const auto &p) { return p.kind == 6; });
  check(algae != objects.end() && probe != objects.end(),
        "algae and light probes have distinct optical identities");
  check(std::abs(algae->color[1] - .65 * .2) < 1e-7,
        "algae reflect actual environmental illumination");
  check(probe->color == StateAccess::perception(b).probe.color,
        "a manually emitted light pulse keeps its own intensity");
}

void deferred_vision(const Genome &base) {
  auto g = base;
  auto binding = std::make_shared<BrainInterface>();
  binding->forms[1].weight = binding->forms[2].weight = 1;
  BrainInterface::Receptor r{};
  r.senses[0] = 1;
  r.refresh_modality();
  r.spectrum = {1, .7f, .3f};
  r.view_left = -.6f;
  r.view_right = .6f;
  binding->sensory = {r};
  binding->visual[0] = {{0, 0}};
  g.interface = binding;
  Field field(1307, 0);
  field.sync_environment();
  Body b;
  b.x = 200;
  b.y = 200;
  b.angle = 0;
  VisibleBody front;
  front.x = 220;
  front.y = 200;
  front.radius = 8;
  front.color = {.6, .3, .2};
  front.id = 77;
  VisibleBody behind = front;
  behind.x = 240;
  behind.radius = 2;
  behind.color = {.2, .9, .4};
  behind.id = 78;
  StateAccess::visible(field) = {front, behind};
  StateAccess::perception(b).probe.kind = 0;
  StateAccess::perception(b).probe.remaining = 4;
  StateAccess::perception(b).probe.x = 245;
  StateAccess::perception(b).probe.y = 215;
  StateAccess::perception(b).probe.radius = 2;
  StateAccess::perception(b).probe.color = {1, .5, .25};
  for (double angle : {0., .3, -.4}) {
    b.angle = angle;
    auto eager = visual_objects(b, g, field), lazy = visual_objects(b, g, field, true, true);
    Body a = b, c = b;
    check(retinal_vision(b, *binding, field, eager, &a) ==
              retinal_vision(b, *binding, field, lazy, &c),
          "deferred filtering preserves exact retinal signals behind occluders");
    check(StateAccess::perception(a).visual_image.size() ==
                  StateAccess::perception(c).visual_image.size() &&
              StateAccess::perception(a).visual_contributions.size() ==
                  StateAccess::perception(c).visual_contributions.size(),
          "deferred inspection keeps all bands and contributions");
    for (std::size_t i = 0; i < StateAccess::perception(a).visual_contributions.size(); ++i) {
      const auto &x = StateAccess::perception(a).visual_contributions[i];
      const auto &y = StateAccess::perception(c).visual_contributions[i];
      check(x.color == y.color, "inspection reports filtered object colors");
    }
  }
}

void shared_retina() {
  Field world(1205, 0);
  StateAccess::env(world).vision_ambient = StateAccess::env(world).vision_adaptation =
      StateAccess::env(world).vision_opponent = 0;
  world.flow = world.gravity = 0;
  Body b;
  b.x = b.y = 200;
  BrainInterface binding;
  binding.forms[1].weight = binding.forms[2].weight = 1;
  for (float center : {-.15f, 0.f, .15f}) {
    BrainInterface::Receptor r{};
    r.neuron = binding.sensory.size();
    r.angle = center;
    r.view_left = center - .1f;
    r.view_right = center + .1f;
    r.senses[0] = 1;
    r.refresh_modality();
    r.spectrum = {1, 0, 0};
    binding.visual[0].push_back({r.angle, r.neuron});
    binding.sensory.push_back(r);
  }
  std::vector<VisualObject> objects;
  for (int i = 0; i < 8; ++i)
    objects.push_back(
        {100, 1, -.07 + .02 * i, .009, {1, 0, 0}, false, 300, 200, 0, std::uint64_t(i), -1});
  auto many = retinal_vision(b, binding, world, objects, &b);
  check(!StateAccess::perception(b).visual_image.empty(),
        "inspection exposes the exact common RGB image");
  auto plain = retinal_vision(b, binding, world, objects);
  check(plain == many, "inspection changes no receptor input");
  objects.resize(1);
  auto one = retinal_vision(b, binding, world, objects);
  check(many[1] > one[1], "several separate pieces add more light than a single piece");
  objects = {{80, 1, 0, .02, {1, 0, 0}, false, 280, 200, 0, 1, -1},
             {100, 1, 0, .01, {1, 0, 0}, false, 300, 200, 0, 2, -1}};
  auto hidden = retinal_vision(b, binding, world, objects);
  objects.resize(1);
  check(hidden == retinal_vision(b, binding, world, objects),
        "near opaque material hides a farther object");
  objects[0].beta = 1e-6;
  check(retinal_vision(b, binding, world, objects)[1] > 0,
        "subpixel angular objects keep their exact nonzero coverage");
}
}
int main() {
  try {
    Genome::begin_run(42);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN query(base.cppn);
    auto g = quiet(base, query);
    blocked_eyes();
    buried_eyes();
    sediment_drag();
    contrast();
    finite_background();
    tiny_food_coverage();
    translucent_ranges();
    suspended_optics();
    retinal_inhibition();
    shared_retina();
    source_lighting(base);
    deferred_vision(base);
    std::cout << "vision: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
