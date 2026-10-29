#include "test_support.hh"
#include "cppn/program.hh"
#include "founder_pool.hh"
#include "retina.hh"
using namespace test;
namespace {
void organ_channels() {
  Body b;
  b.tissue = 40;
  StateAccess::motor(b).vx = .4 * MAX_SPEED;
  StateAccess::motor(b).turn = .3 * MAX_TURN;
  BrainInterface::Receptor r{};
  r.senses[2] = 1;
  r.refresh_modality();
  r.lateral = 1;
  r.threshold = .5;
  Field water(30, 0);
  water.flow = 0;
  b.x = b.y = 200;
  StateAccess::motor(b).turn = 0;
  BrainInterface binding;
  binding.sensory = {r};
  auto frame = prepare_sensory_frame(b, binding, water);
  const std::array<std::array<float, 3>, 4> spectra{
      {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}, {1.f / 3, 1.f / 3, 1.f / 3}}};
  for (const auto &spectrum : spectra) {
    r.spectrum = spectrum;
    check(near(anatomical_sensor(b, r, frame),
               sensory_response(.4 * MAX_SPEED, r.response_threshold)),
          "lateral skin receptors retain own motion independently of spectral genes");
  }
  StateAccess::motor(b).turn = .3 * MAX_TURN;
  frame = prepare_sensory_frame(b, binding, water);
  check(frame.relative[0].x > frame.relative[2].x && frame.relative[0].y < frame.relative[1].y,
        "turning moves each skin sample according to its body position");
  check(near(anatomical_sensor(b, r, frame), anatomical_sensor(b, r)),
        "world sampling and the direct sensory path agree on relative skin motion");
  StateAccess::motor(b).turn = 0;
  StateAccess::motor(b).water_vx = StateAccess::motor(b).vx;
  check(anatomical_sensor(b, r) == 0, "moving with the water produces no relative flow");
  StateAccess::motor(b).water_vx = 0;
  check(near(anatomical_sensor(b, r, 0, {.1 * MAX_SPEED, 0}),
             sensory_response(.3 * MAX_SPEED, r.response_threshold)),
        "nearby wake is subtracted from the skin's relative water motion");
  r.senses = {};
  r.refresh_modality();
  r.senses[3] = 1;
  r.refresh_modality();
  frame = {};
  frame.contact = .7;
  frame.impact = .2;
  r.response_threshold = 1;
  const double contact = .7 * (.1 + .9 * sensory_response(.2, 1));
  for (const auto &spectrum : spectra) {
    r.spectrum = spectrum;
    check(near(anatomical_sensor(b, r, frame, .6), .6) &&
              near(anatomical_sensor(b, r, frame, .1), contact),
          "touch reports the stronger local contact independently of spectral genes");
  }
  frame.contact = 0;
  frame.impact = 1;
  check(anatomical_sensor(b, r, frame) == 0, "impact alone is not an extra touch channel");
  auto g = Genome::load("genomes/cppn-start.genome");
  auto organs = std::make_shared<BrainInterface>(*g.interface);
  organs->motor_counts[6] = 2;
  organs->motor_counts[4] = 3;
  organs->motor_counts[5] = 4;
  g.interface = organs;
  b.tissue = 20;
  check(organ_capacity(b, g, 6, 100) == 10 && ovary_capacity(b, g, 160, 10) == 15 &&
            organ_capacity(b, g, 5, 40) == 20,
        "all filling capacities follow organ size and growth");
  b.gut_fill = 1.5 * gut_capacity(b);
  auto &stores = StateAccess::reproduction(b);
  stores.egg_limit = 15;
  stores.egg_yolk = 30;
  stores.sperm_limit = 20;
  stores.sperm_store = 40;
  Field world(30, 0);
  frame = prepare_sensory_frame(b, *organs, world, gonad_filling(b));
  check(frame.satiety == 1 && frame.gonad == 1 && frame.sperm == 1 &&
            b.gut_fill == 1.5 * gut_capacity(b) && stores.egg_yolk == 30 &&
            stores.sperm_store == 40,
        "overfull organs retain material while all three sensory signals cap at one");
}
}
int main() {
  try {
    organ_channels();
    std::cout << "Lokale Strömung, Berührung und Organfüllungen: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
