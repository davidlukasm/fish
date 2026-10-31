#include "render_stream.hh"
#include "metadata_output.hh"
#include <thread>
#include <unistd.h>
#include "test_support.hh"
#include "ecology.hh"
#include "observations.hh"
#include "eye_geometry.hh"
#include "physiology.hh"
#include "world_view.hh"
#include "view_cache.hh"
#include <cassert>
#include <cstring>
#include <iostream>
#include <iomanip>
#include <sstream>
using namespace fishsim;
using test::StateAccess;
namespace {
std::string state(const Ecosystem &world) {
  std::ostringstream out;
  world.write(out);
  return out.str();
}
void fixture(std::ostream &out, const Ecosystem &world, const std::string &scene) {
  std::ostringstream expected;
  expected << "{\"step\":" << world.ticks
           << ",\"width\":" << StateAccess::geometry(world.field).width
           << ",\"height\":" << StateAccess::geometry(world.field).height << ",\"fish\":[";
  bool first = true;
  for (const auto &p : world.fish) {
    if (!first)
      expected << ',';
    first = false;
    write_individual(expected, p);
  }
  expected << "],\"food\":[";
  first = true;
  for (const auto &p : StateAccess::feeding(world.field).pieces) {
    if (!first)
      expected << ',';
    first = false;
    expected << '[' << p.x << ',' << p.y << ',' << p.energy << ',' << p.render_id << ']';
  }
  expected << "],\"view\":";
  JsonViewCache cache(false);
  SessionView status;
  auto cadence = cache.begin_frame(false, false, 0, world.environment, false, false);
  WorldViewWriter writer(expected, world, status, cache);
  writer.write(cadence, world.parameters(), {});
  cache.write_assets(expected);
  expected << "}}";
  std::string sizes;
  wire_integer(sizes, expected.str().size(), 4);
  wire_integer(sizes, scene.size(), 4);
  out.write(sizes.data(), std::streamsize(sizes.size()));
  out << expected.str();
  out.write(scene.data(), std::streamsize(scene.size()));
}
}
void asynchronous_metadata() {
  int descriptors[2];
  assert(pipe(descriptors) == 0);
  MetadataOutput output(descriptors[1]);
  std::promise<void> started, release;
  auto proceed = release.get_future();
  const auto simulation_thread = std::this_thread::get_id();
  output.send([&]() {
    assert(std::this_thread::get_id() != simulation_thread);
    started.set_value();
    proceed.wait();
    return MetadataOutput::Frame{"{\"step\":7}", {}};
  });
  started.get_future().wait();
  assert(!output.ready());
  release.set_value();
  output.finish();
  char data[256];
  assert(read(descriptors[0], data, sizeof(data)) > 0);
  close(descriptors[0]);
}
void plant_metadata() {
  auto frame = [](double stationary_x, double drifting_x, int age) {
    std::ostringstream out;
    out << "{\"paused\":false,\"selected\":0,\"plants\":[";
    for (int i = 0; i < 2; ++i) {
      if (i)
        out << ',';
      out << '[' << i + 1 << ',' << (i ? drifting_x : stationary_x)
          << ",20,30,40,0,-1,1,2,1,100,0,20,1,1,0,0,[-1,0," << (i ? age : 0)
          << ",1],[0.2,0.5,0.1],0,[[0,0,-1,[11.26,20,30,40,50,60,70,80],1,1,2,1,0,"
             "[0.2,0.5,0.1]]],0.5]";
    }
    return out.str() + "]}";
  };
  ViewStream stream;
  auto initial = stream.encode(frame(10, 20, 1), {true, true, true, true, true});
  // Moving plants update between statistics frames, while rooted plants keep their last row.
  auto moving = stream.encode(frame(1234.123, 4321.123, 2), {true, true, false, false, true});
  assert(moving.find("4321") != std::string::npos);
  assert(moving.find("1234") == std::string::npos);
  assert(initial.find("11.26") == std::string::npos);
  assert(initial.find("11.5") != std::string::npos);
  auto statistics = stream.encode(frame(1234.123, 4321.123, 2), {true, true, true, true, true});
  assert(statistics.find("1234") != std::string::npos);
}
void morphology_metadata() {
  Individual p;
  p.id = 7;
  p.genome = Genome::load("genomes/cppn-start.genome");
  auto frame = [&](std::uint64_t morphology) {
    std::ostringstream out;
    out << "{\"paused\":false,\"selected\":0,\"fish\":[";
    write_individual(out, p, morphology);
    return out.str() + "]}";
  };
  ViewStream stream;
  stream.encode(frame(88123), {true, true, true, true, true});
  auto growing = stream.encode(frame(88124), {false, false, false, false, false});
  assert(growing.find("88124") != std::string::npos &&
         "A growing fish must immediately reference its new body geometry");
}
void unchanged_scenes() {
  auto world = test::small_world(17023);
  StateAccess::feeding(world.field).pieces.push_back({100, 100});
  RenderStream ordinary, reused;
  auto request = [&](std::uint32_t base, double x = 300) {
    ordinary.request(base, x, 200, 600, 400, 1);
    reused.request(base, x, 200, 600, 400, 1);
  };
  auto encode = [&](RenderStream &stream) {
    return stream.encode(capture_render(world, stream.view(), 0, {}), 600, 400, world.ticks, 12345,
                         true, false);
  };
  request(0);
  assert(!reused.can_repeat());
  assert(encode(ordinary) == encode(reused));
  for (std::uint32_t base = 1; base < 4; ++base) {
    request(base);
    assert(reused.can_repeat());
    auto repeated = reused.repeat(600, 400, world.ticks, 12345, true, false);
    assert(repeated.size() == render_wire::header_bytes);
    assert(encode(ordinary) == repeated);
    assert(!reused.pending());
  }
  StateAccess::feeding(world.field).pieces.clear();
  ++world.ticks;
  request(4);
  assert(encode(ordinary) == encode(reused) && "A change after reuse loses the delta base");
  request(0);
  assert(!reused.can_repeat());
  assert(encode(ordinary) == encode(reused));
  request(6, 200);
  assert(!reused.can_repeat() && "A changed viewport must capture newly visible objects");
  request(6);
  assert(!reused.can_repeat() && "Returning to the previous viewport still needs a capture");
  assert(encode(ordinary) == encode(reused));
}
int main(int argc, char **argv) {
  asynchronous_metadata();
  plant_metadata();
  morphology_metadata();
  unchanged_scenes();
  const bool emit = argc == 2 && std::string(argv[1]) == "--fixtures";
  Ecosystem world(42);
  StateAccess::geometry(world.field).width = 1230;
  StateAccess::geometry(world.field).height = 820;
  world.field.sync_environment();
  world.field.sync_food_web();
  auto &web = StateAccess::food_web(world.field);
  web.plankton.energy[web.plankton.energy.size() / 2] = 10;
  Mussel mussel;
  mussel.id = web.next_id++;
  mussel.patch = world.field.vegetation().surfaces[0].id;
  mussel.x = 300;
  mussel.y = 400;
  mussel.energy = 8;
  mussel.closed = 2;
  mussel.filter_rate = .125;
  mussel.filtered = 23.75;
  web.mussels.push_back(mussel);
  WormHead worm;
  worm.id = web.next_id++;
  worm.patch = mussel.patch;
  worm.x = 350.123;
  worm.y = 390.456;
  worm.base_x = 345;
  worm.base_y = 400;
  worm.energy = 3.25;
  worm.morph = .625;
  worm.ground = .75;
  worm.filter_rate = .3125;
  web.heads.push_back(worm);
  Crab crab;
  crab.id = web.next_id++;
  crab.patch = mussel.patch;
  crab.x = 450.321;
  crab.y = 400.654;
  crab.energy = 12.5;
  crab.morph = .375;
  crab.direction = -1;
  crab.exposure = .625;
  crab.stride = .25;
  crab.feeding = {.5, 455.125, 401.375, 7, 4};
  web.crabs.push_back(crab);
  web.shells.push_back({9007199254740991ULL, 500.234, 401.789, 3.125, 2.75, -.375, 4});
  web.grazing.push_back({550.345, 400.987, 2.25, .875});
  Individual p;
  p.genome = Genome::load("genomes/cppn-start.genome");
  p.id = 7;
  p.species = 3;
  p.body.x = 400;
  p.body.y = 400;
  p.body.age = 12;
  p.body.energy = 120;
  p.body.tissue = p.body.peak_tissue = p.body.birth_tissue = 40;
  p.body.hatch_age = 0;
  StateAccess::motor(p.body).fin_stroke_age = {10, 11};
  StateAccess::motor(p.body).fin_stroke_peak = {.5, .7, .9};
  StateAccess::motor(p.body).relative_speed = MAX_SPEED * std::sqrt(MAX_BODY_RADIUS / BODY_RADIUS);
  StateAccess::reproduction(p.body).egg_yolk = 20;
  world.fish.push_back(p);
  StateAccess::feeding(world.field).pieces.push_back({405, 400});
  StateAccess::feeding(world.field).pieces.back().initial_energy = 20;
  RenderStream stream;
  auto publish = [&](std::uint32_t base, double x = 615, double width = 1230) {
    stream.request(base, x, 410, width, 820, 1);
    const auto before = state(world);
    auto capture = capture_render(world, stream.view(), 7, {});
    assert(before == state(world) && "Drawing mutates the saved simulation or its random state");
    auto bytes = stream.encode(std::move(capture), 1230, 820, world.ticks, 987654321, false, false);
    if (emit)
      fixture(std::cout, world, bytes);
    return bytes;
  };
  auto full = publish(0);
  assert(full.size() > render_wire::header_bytes);
  ++world.ticks;
  ++world.fish[0].body.age;
  world.fish[0].body.x += .5;
  StateAccess::motor(world.fish[0].body).relative_speed = MAX_SPEED;
  web.mussels[0].closed = 0;
  web.mussels[0].filtered += .5;
  web.crabs[0].crossing = .25;
  web.crabs[0].crossing_angle = .75;
  web.crabs[0].direction = 1;
  web.heads[0].x += .25;
  web.heads[0].filter_rate = .0625;
  auto delta = publish(1);
  assert(delta.size() < full.size());
  StateAccess::feeding(world.field).pieces.clear();
  web.mussels.clear();
  web.heads.clear();
  web.crabs.clear();
  web.shells.clear();
  web.grazing.clear();
  web.plankton.energy.assign(web.plankton.energy.size(), 0);
  ++world.ticks;
  ++world.fish[0].body.age;
  publish(2);
  auto recovery = publish(0);
  assert((static_cast<unsigned char>(recovery[6]) & 1) == 0);
  world.fish.clear();
  publish(4);
  // The seam belongs to both sides of a narrow viewport.
  RenderView view;
  view.update(5, 100, 20, 20, 20);
  assert(view.includes(1228, 100, 0, 1230));
  assert(!view.includes(615, 100, 0, 1230));
  assert(!view.includes(5, 300, 0, 1230));
  {
    auto coarseWorld = test::small_world(17022);
    for (int i = 0; i < 1000; ++i) {
      Food p{100 + (i % 20) * .08, 100 + (i / 20) * .08};
      p.energy = 30; // Above the smallest piece energy (crumb_min), so every piece stays food.
      p.radius = food_radius(p.energy);
      p.origin = i % 2;
      coarseWorld.field.append_fragment(p);
    }
    const auto unchanged = state(coarseWorld);
    RenderView overview;
    overview.update(300, 200, 615, 410, .3);
    const auto coarse = capture_render(coarseWorld, overview, 0, {});
    const auto &grains = coarse.rows[std::size_t(RenderKind::Food)];
    assert(grains.size() < 20);
    double total = 0;
    const auto field = render_wire::food::fields[render_wire::food::energy];
    for (const auto &[id, bytes] : grains) {
      float energy;
      std::memcpy(&energy, bytes.data() + field.offset, 4);
      total += energy;
      assert(id >= (1ULL << 48));
    }
    assert(std::abs(total - 30000) < .01 && state(coarseWorld) == unchanged);
    overview.update(100, 100, 20, 20, 10);
    const auto detail = capture_render(coarseWorld, overview, 0, {});
    assert(detail.rows[std::size_t(RenderKind::Food)].size() == 1000);
  }
  if (!emit)
    std::cout
        << "Typed scene: direct capture, deterministic state, deltas, removal and recovery: OK\n";
}
