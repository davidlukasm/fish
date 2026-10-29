#include "test_support.hh"
#include "opencl.hh"
#include <cstdlib>
using namespace test;
int main() {
  try {
    Genome::begin_run(42);
    auto w = small_world(210);
    auto &f = w.field;
    w.wall(100, 230, 440, 160, 12);
    f.seed_plants();
    for (std::size_t i = 0; i < StateAccess::sediment(f).suspended.size(); ++i)
      if (i % 7 == 0)
        StateAccess::sediment(f).suspended[i] = .7;
    f.sync_food_web();
    auto &plankton = StateAccess::food_web(f).plankton;
    for (std::size_t i = 0; i < plankton.energy.size(); ++i)
      if (plankton.open[i] && i % 11 == 0)
        plankton.energy[i] = .5;
    f.update_sediment_light();
    f.index({});
    Rng random(211);
    std::vector<std::array<double, 4>> queries;
    for (int k = 0; k < 4096; ++k) {
      double x = random.uniform() * StateAccess::geometry(f).width,
             y = random.uniform() * StateAccess::geometry(f).height, a = random.uniform() * 2 * PI,
             r = random.uniform() * RANGE;
      queries.push_back(
          {x, y, f.wrap_x(x + r * std::cos(a)),
           std::clamp(y + r * std::sin(a), .01, StateAccess::geometry(f).height - .01)});
    }
    queries.push_back({2, 350, 610, 350});
    queries.push_back({100, 400, 100, 400});
    queries.push_back({100, 408, 105, 408});
    std::vector<float> factors;
    configure_compute("cpu");
    check(!opencl_attenuation(f, queries, factors), "CPU mode must not use an OpenCL device");
    configure_compute(std::getenv("FISH_TEST_OPENCL_CPU") ? "opencl-cpu-optics" : "opencl-optics");
    if (!opencl_attenuation(f, queries, factors)) {
      check(!compute_status().reason.empty(), "fallback explains why OpenCL is unavailable");
      check(!std::getenv("FISH_TEST_OPENCL_CPU"), "software OpenCL was explicitly required");
      std::cout << "OpenCL nicht verfügbar; CPU-Rückfall: OK\n";
      configure_compute("cpu");
      return 0;
    }
    double maximum = 0;
    for (std::size_t i = 0; i < queries.size(); ++i) {
      const auto q = queries[i];
      const double base = f.light(q[2], q[3]) * f.sediment_transmission(q[0], q[1], q[2], q[3]);
      const auto foliage = f.grass_transmission(q[0], q[1], q[2], q[3]);
      for (int c = 0; c < 3; ++c)
        maximum = std::max(maximum, std::abs(base * foliage[c] - factors[3 * i + c]));
    }
    check(maximum < 3.e-4,
          "OpenCL optics agrees with CPU across sediment, plankton, soil, grass and periodic seam");
    StateAccess::vegetation(f).plants.clear();
    StateAccess::vegetation(f).plant_grid.reset(StateAccess::geometry(f).width,
                                                StateAccess::geometry(f).height);
    for (int i = 0; i < 40; ++i) {
      StateAccess::vegetation(f).plants.push_back({150, 100, 1, 1, std::size_t(i), 5});
      StateAccess::vegetation(f).plant_grid.add(150, 100, i);
    }
    std::vector<std::array<double, 4>> crowded{{100, 100, 200, 100}};
    check(opencl_attenuation(f, crowded, factors) && compute_status().fallback_queries == 0,
          "dense foliage stays on the GPU without a fixed crossing limit");
    // Forty round parts across the sight line: one perpendicular crossing each.
    const auto crossing = f.foliage_depth(-1);
    double deviation = 0;
    for (int c = 0; c < 3; ++c)
      deviation = std::max(
          deviation, std::abs(factors[c] - f.light(200, 100) *
                                               f.sediment_transmission(100, 100, 200, 100) *
                                               std::exp2(-40 * crossing[c])));
    check(deviation < 3.e-4, "all foliage contributes to optical depth");
    f.index_plants();

    auto genome = Genome::load("genomes/cppn-start.genome");
    add_test_sperm(f, {205, 190, 10, {.2, .6, .8}, 30, .5});
    add_test_sperm(f, {612, 70, 10, {.8, .3, .1}, 28, .7});
    for (int k = 0; k < 32; ++k) {
      auto &p = adult(w, genome, 200, 190);
      p.body.x = k < 4 ? (k % 2 ? 613 : 2) : random.uniform() * StateAccess::geometry(f).width;
      p.body.y = k < 4 ? 70 + 90 * (k / 2) : random.uniform() * StateAccess::geometry(f).height;
      p.body.angle = random.uniform() * 2 * PI;
    }
    std::vector<std::vector<VisualObject>> optical;
    auto compare = [&](const char *message) {
      const bool ready = prepare_opencl_objects(w, optical);
      check(ready, compute_status().reason.c_str());
      double error = 0;
      for (std::size_t i = 0; i < w.fish.size(); ++i) {
        auto cpu = w.fish[i].body, gpu = cpu;
        const auto &g = w.fish[i].genome;
        sense_generated(cpu, g, f);
        sense_generated(gpu, g, f, &optical[i]);
        check(StateAccess::perception(cpu).sensor_buffer.size() ==
                  StateAccess::perception(gpu).sensor_buffer.size(),
              "sensor layout is unchanged");
        for (std::size_t j = 0; j < StateAccess::perception(cpu).sensor_buffer.size(); ++j)
          error = std::max(error, std::abs(double(StateAccess::perception(cpu).sensor_buffer[j] -
                                                  StateAccess::perception(gpu).sensor_buffer[j])));
      }
      if (error >= 3.e-4)
        std::cerr << message << ": " << error << '\n';
      check(error < 3.e-4, message);
    };
    f.index({});
    compare("CPU eye integration with GPU attenuation preserves occlusion, pigments, grass, "
            "sediment, background and ink");
    check(compute_status().mode == "opencl-optics" || compute_status().mode == "opencl-cpu-optics",
          "only optical attenuation runs on the GPU");
    compare("unchanged scene remains identical");
    check(compute_status().uploaded_bytes == 0 && compute_status().reused_bytes > 0,
          "unchanged optical inputs remain on the device");
    for (auto &light : StateAccess::lighting(f).illumination) {
      light *= .7;
    }
    StateAccess::sediment(f).suspended[0] += 5;
    StateAccess::env(f).light_bottom = .2;
    recolor_test_sperm(f, {.9, .1, .7});
    compare("light, dust, parameter and ink changes invalidate resident data");
    check(compute_status().uploaded_bytes > 0, "changed inputs are uploaded");
    StateAccess::geometry(f).obstacles.push_back({3, 85, 21});
    w.wall(570, 315, 650, 285, 10);
    f.index({});
    compare("circular and polygonal obstacles across the periodic seam agree");
    // A different world with the same grid dimensions must replace cached light and geometry.
    auto replacement = small_world(212);
    StateAccess::lighting(replacement.field)
        .illumination.assign(StateAccess::lighting(f).illumination.size(), .3);
    std::vector<std::array<double, 4>> one{{100, 100, 105, 100}};
    check(opencl_attenuation(replacement.field, one, factors), "world replacement is supported");
    compare("returning to the original world restores its resident inputs");
    StateAccess::vegetation(f).plants.clear();
    StateAccess::vegetation(f).plant_grid.reset(StateAccess::geometry(f).width,
                                                StateAccess::geometry(f).height);
    StateAccess::feeding(f).pieces.clear();
    f.index({}, false);
    compare("background-only eyes work without any object queries");
    // More than 32 disjoint occluders must fall back rather than truncate the free viewing
    // intervals.
    w.fish.resize(1);
    auto broad = std::make_shared<BrainInterface>(*genome.interface);
    broad->visual[0] = {{0, 0}, {float(PI), 1}};
    auto &receptor = broad->sensory[0];
    receptor.view_left = -1.5f;
    receptor.view_right = 1.5f;
    receptor.angle = 0;
    receptor.spectrum = {1, 0, 0};
    receptor.senses[0] = 1;
    receptor.refresh_modality();
    auto &clear = broad->sensory[1];
    clear.view_left = 2.6f;
    clear.view_right = 3.6f;
    clear.angle = float(PI);
    clear.spectrum = {1, 0, 0};
    clear.senses[0] = 1;
    clear.refresh_modality();
    w.fish[0].genome.interface = broad;
    auto &body = w.fish[0].body;
    body.x = 300;
    body.y = 120;
    body.angle = 0;
    std::vector<VisibleBody> specks;
    for (int k = 0; k < 80; ++k) {
      double a = -1.2 + 2.4 * k / 79;
      specks.push_back({body.x + 50 * std::cos(a),
                        body.y + 50 * std::sin(a),
                        0,
                        std::uint64_t(k + 100),
                        false,
                        true,
                        {1, 0, 0},
                        0,
                        .03});
    }
    f.index(specks, false);
    compare("interval overflow preserves every occluder through CPU fallback");
    check(compute_status().fallback_queries == 0,
          "the common image needs no per-receptor interval overflow fallback");
    broad->visual[0].clear();
    compare("fish without eyes preserve their other senses");

    const bool software = std::getenv("FISH_TEST_OPENCL_CPU");
    configure_compute(software ? "opencl-cpu-optics" : "opencl-optics");
    w.fish[0].genome = genome;
    f.index(specks);
    check(prepare_opencl_objects(w, optical),
          "hybrid mode keeps GPU attenuation and CPU eye integration");
    auto cpu = w.fish[0].body, hybrid = cpu;
    sense_generated(cpu, genome, f);
    sense_generated(hybrid, genome, f, &optical[0]);
    for (std::size_t k = 0; k < StateAccess::perception(cpu).sensor_buffer.size(); ++k)
      check(std::abs(StateAccess::perception(cpu).sensor_buffer[k] -
                     StateAccess::perception(hybrid).sensor_buffer[k]) < 3.e-4,
            "hybrid eye values agree with CPU");
    check(compute_status().active, "hybrid status distinguishes optics from GPU eye integration");

    std::cout << "OpenCL-Sichtdämpfung und CPU-Augenbilder: OK · maximaler Fehler " << maximum
              << " · " << compute_status().device << '\n';
    configure_compute("cpu");
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
