#include "test_support.hh"
#include "cppn/program.hh"
#include "founders.hh"
#include "retina.hh"
using namespace test;
namespace {
void geometry_features() {
  auto genes =
      evolution::Genome::empty_genome(cppn::INPUTS + cppn::OUTPUTS, cppn::INPUTS, cppn::OUTPUTS);
  genes->connect(10, cppn::INPUTS, 1);
  genes->connect(11, cppn::INPUTS + 14, 1);
  cppn::CPPN q(genes);
  const auto values = q.query_view(-.2f, 0, 0, .3f, 0, 0);
  check(std::abs(values[0] + .06f) < 1e-7 && std::abs(values[14] - .5f) < 1e-7,
        "bilateral features express opposite sides and distance from the midline");
  check(q.query_view(.2f, 0, 0, -.3f, 0, 0) == values,
        "bilateral features are unchanged by reflecting both endpoints");
  for (int input : {8, 9}) {
    auto direction =
        evolution::Genome::empty_genome(cppn::INPUTS + cppn::OUTPUTS, cppn::INPUTS, cppn::OUTPUTS);
    direction->connect(input, cppn::INPUTS, .25f);
    cppn::CPPN retained(direction);
    check(retained.query_view(0, -.4f, -.2f, 0, .4f, .2f)[0] > 0,
          "dy and dz remain usable CPPN inputs");
  }
}
void initial_patterns() {
  Rng random(1957);
  for (int n = 0; n < 32; ++n) {
    auto g = Genome::pool_randomized(random);
    for (const auto &edge : g.cppn->get_connection_genes())
      check(edge.get_source() != 0 && edge.get_source() != 2 && edge.get_source() != 7,
            "initial genomes use reflection-even lateral inputs");
    cppn::CPPN pattern(g.cppn);
    const auto normal = pattern.query_view(.25f, .1f, -.2f, -.4f, .6f, .3f);
    check(normal == pattern.query_view(-.25f, .1f, -.2f, .4f, .6f, .3f),
          "shared developmental patterns begin reflection-even");
    auto lateral_genes =
        evolution::Genome::empty_genome(cppn::INPUTS + cppn::OUTPUTS, cppn::INPUTS, cppn::OUTPUTS);
    lateral_genes->edit_node(cppn::INPUTS + cppn::output::expression, 1,
                             evolution::NodeType::LINEAR);
    check(lateral_genes->connect(0, cppn::INPUTS + cppn::output::expression, .2f),
          "a new structural connection can introduce lateral input");
    cppn::CPPN lateral(lateral_genes);
    const auto left = lateral.query_view(.25f, .1f, -.2f, -.4f, .6f, .3f);
    check(left != lateral.query_view(-.25f, .1f, -.2f, .4f, .6f, .3f),
          "later lateralization remains expressible without a projection constraint");
  }
}
void smell_and_modalities() {
  Genome g;
  auto binding = std::make_shared<BrainInterface>();
  binding->forms[1].weight = binding->forms[2].weight = 1;
  for (float side : {-1.f, 1.f, 0.f}) {
    BrainInterface::Receptor r{};
    r.neuron = binding->sensory.size();
    r.lateral = side;
    r.senses[1] = 1;
    r.refresh_modality();
    r.scents[0] = 1;
    r.response_threshold = .03f;
    binding->sensory.push_back(r);
  }
  g.interface = binding;
  Field world(1939, 0);
  world.resize(768, 480);
  world.sync_environment();
  world.sync_food_web();
  world.flow = world.gravity = 0;
  Body b;
  b.x = b.y = 204;
  b.tissue = 40;
  b.energy = reserve_capacity(b) * .3;
  auto &p = StateAccess::perception(b);
  p.inspect_vision = true;
  auto sample = [&]() {
    sense_generated(b, g, world, nullptr, false);
    return p.sensor_buffer;
  };
  check(sample() == std::vector<float>({0, 0, 0}), "an empty field creates no odor");
  const auto left = olfactory_position(b, *binding, 0), right = olfactory_position(b, *binding, 1);
  check(near(right.y - left.y, 4 * std::max(3., .6 * body_radius(b) + .2)),
        "physical sampling uses doubled nose separation");
  p.probe.kind = 1;
  p.probe.remaining = 100;
  p.probe.x = b.x + 30;
  p.probe.y = b.y;
  p.probe.energy = 600;
  p.probe.scents[0] = 1;
  auto front = sample();
  check(front[0] > 0 && std::abs(front[0] - front[1]) < 1e-7 &&
            std::abs(front[0] - front[2]) < 1e-7,
        "equal odor produces the same response on both sides and in the centre");
  p.probe.y = b.y - 20;
  const auto toward_left = sample();
  p.probe.y = b.y + 20;
  const auto toward_right = sample();
  check(toward_left[0] > toward_left[1] && toward_right[1] > toward_right[0] &&
            std::abs(toward_left[0] - toward_right[1]) < 1e-7 &&
            std::abs(toward_left[1] - toward_right[0]) < 1e-7,
        "moving a scent across the fish reverses its lateral sensory cue");
  p.probe.energy = 1e-12;
  const auto faint = sample();
  check(faint[0] < 1e-10 && faint[1] < 1e-10,
        "negligible odor remains below the response threshold");
  auto &r = binding->sensory[0];
  r.senses[1] = .7f;
  r.refresh_modality();
  r.senses[4] = .3f;
  r.refresh_modality();
  p.probe.energy = 600;
  const auto hungry = sample();
  b.energy = reserve_capacity(b) * .9;
  const auto fed = sample();
  check(hungry[0] == fed[0] && p.sensory_components[0][4] == 0,
        "the dominant odor signal is independent of the mixed reserve modality");
  p.disabled_senses[1] = true;
  check(sample()[0] == 0,
        "disabling the dominant modality does not silently select another modality");
  check(r.senses[1] == .7f && r.senses[4] == .3f,
        "signal selection retains the receptor's anatomical mixture");
  r.refresh_modality();
  p.disabled_senses[1] = false;
  p.probe = {};
  const std::vector<VisualObject> light{{30, 2, 0, .1, {1, 0, 0}}};
  r.senses = {};
  r.refresh_modality();
  r.senses[0] = .3f;
  r.refresh_modality();
  r.senses[1] = .7f;
  r.refresh_modality();
  r.spectrum[0] = 1;
  r.view_left = -.3f;
  r.view_right = .3f;
  binding->visual[0] = {{0, 0}};
  sense_generated(b, g, world, &light);
  check(p.sensor_buffer[0] == 0,
        "a non-dominant vision gene cannot overwrite the physical olfactory signal");
}
void stretch_feedback() {
  static_assert(field::SENSE_COUNT == 11 && BrainInterface::FORM_COUNT == 43);
  const auto identity = field::cell_functions({-1, -1, -1, 1, -1});
  check(identity.senses[0] == 1 && identity.motor() == 0,
        "the restored 0010 corner belongs to vision");
  Genome g;
  auto binding = std::make_shared<BrainInterface>();
  binding->forms[1].weight = binding->forms[2].weight = 1;
  BrainInterface::Receptor r{};
  r.senses[8] = 1;
  r.refresh_modality();
  r.spectrum = {0, 1, 0};
  r.threshold = .5f;
  binding->sensory.push_back(r);
  binding->sense_counts[8] = 1;
  g.interface = binding;
  auto w = small_world(1952);
  Body b;
  b.x = 300;
  b.y = 200;
  b.tissue = b.birth_tissue = b.peak_tissue = HATCH_TISSUE;
  b.energy = 100;
  binding->motor_counts[6] = 2;
  b.gut_fill = .3 * gut_capacity(b);
  const double need = 20;
  StateAccess::reproduction(b).egg_limit = 40;
  auto sample = [&]() {
    sense_generated(b, g, w.field);
    return b.perception().sensor_buffer[0];
  };
  check(sample() == 0, "an empty egg has zero filling despite gut fullness");
  StateAccess::reproduction(b).egg_yolk = need;
  check(near(sample(), .5), "own minimum development funding gives half egg filling");
  b.energy = 1;
  check(near(sample(), .5), "egg filling is distinct from free reserve energy");
  StateAccess::reproduction(b).egg_yolk = 1.5 * need;
  check(near(sample(), .75), "fraction follows current organ capacity");
  binding->sensory[0].threshold = .75f;
  check(near(sample(), .5), "the inherited threshold controls filling sensitivity");
  binding->sensory[0].threshold = .5f;
  binding->sensory[0].spectrum = {1, 0, 0};
  check(near(sample(), .3), "gut tuning reads physical filling including ballast");
  binding->sensory[0].spectrum = {0, 0, 1};
  auto &reproduction = StateAccess::reproduction(b);
  reproduction.sperm_limit = 20;
  reproduction.sperm_store = 5;
  check(near(sample(), .25), "sperm tuning uses the body's actual sperm limit");
  reproduction.sperm_limit = 10;
  check(near(sample(), .5), "a changed physiological limit changes sperm filling");
  reproduction.sperm_store = 100;
  check(near(sample(), 1), "overfilled sperm stores clamp to one");
  reproduction.sperm_limit = 0;
  check(sample() == 1, "material retained above a zero capacity has a saturated finite signal");
  reproduction.sperm_limit = 20;
  reproduction.sperm_store = 5;
  binding->sensory[0].spectrum = {1.f / 3, 1.f / 3, 1.f / 3};
  check(near(sample(), (.3 + .75 + .25) / 3), "broad tuning averages the three organ fillings");
  b.disable_sense(8);
  check(sample() == 0, "the entire stretch sense can be causally disabled");
  auto genes =
      evolution::Genome::empty_genome(cppn::INPUTS + cppn::OUTPUTS, cppn::INPUTS, cppn::OUTPUTS);
  cppn::CPPN query(genes);
  auto tissue = std::make_shared<field::Substrate>(query);
  auto gut = sensor(1, -.8f, 0, 0, 8), egg = sensor(2, .8f, 0, 0, 8);
  gut.parameters.quality1 = -1;
  egg.parameters.quality1 = -1.f / 3;
  gut.parameters.quality_width = egg.parameters.quality_width = 0;
  tissue->neurons = {gut, egg};
  const auto anatomy = body_interface(*tissue);
  check(near(anatomy->anatomy[anatomy_column::satiety], 1) &&
            near(anatomy->anatomy[anatomy_column::gonad], 1),
        "gut and gonad anatomy share stretch receptors weighted by spectrum");
  check(anatomy->forms[33].weight > 0 && anatomy->forms[34].weight > 0 &&
            anatomy->forms[37].weight == 0 && anatomy->forms[39].weight == 0,
        "stretch forms retain their slots without adding a sensor class");
}
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
    geometry_features();
    initial_patterns();
    smell_and_modalities();
    stretch_feedback();
    organ_channels();
    std::cout << "Bilaterale CPPN-Eingänge, Geruch und Sinnestrennung: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
