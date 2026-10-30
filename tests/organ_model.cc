#include "protocol_schema.hh"
#include "test_support.hh"
#include "founders.hh"
using namespace test;
namespace {
std::shared_ptr<field::Substrate> cells(cppn::CPPN &q, std::vector<field::Neuron> neurons) {
  auto s = std::make_shared<field::Substrate>(q);
  s->neurons = std::move(neurons);
  return s;
}
void independent_parameters(cppn::CPPN &q) {
  auto n = sensor(1, .4f, .2f, .6f);
  n.parameters.threshold = .2f;
  n.parameters.quality1 = -1;
  n.parameters.quality_width = .1f;
  n.parameters.field_width = .2f;
  auto s = cells(q, {n});
  auto a = body_interface(*s);
  s->neurons[0].z = -.9f;
  auto b = body_interface(*s);
  check(a->sensory[0].angle == b->sensory[0].angle &&
            a->sensory[0].spectrum == b->sensory[0].spectrum &&
            a->sensory[0].response_threshold == b->sensory[0].response_threshold,
        "spatial depth never changes colour, sensitivity or direction");
  s->neurons[0].x = -.4f;
  s->neurons[0].location.side = -1;
  b = body_interface(*s);
  check(a->sensory[0].angle == -b->sensory[0].angle &&
            a->sensory[0].spectrum == b->sensory[0].spectrum,
        "left and right alter direction independently of tuning");
  s->neurons[0].parameters.quality_width = 1;
  b = body_interface(*s);
  for (float v : b->sensory[0].spectrum)
    check(std::abs(v - 1.f / 3) < 1e-6,
          "a fully broad colour receptor responds equally to all channels");
  const auto old = a->sensory[0];
  s->neurons = {n, n};
  s->neurons[1].x = -.8;
  s->neurons[1].id = 2;
  s->neurons[1].group = 2;
  b = body_interface(*s);
  check(b->sensory[0].view_left == old.view_left && b->sensory[0].view_right == old.view_right,
        "adding a retina cell preserves existing receptive windows");
  for (double threshold : {.001, .1, .8}) {
    check(std::abs(sensory_response(threshold, threshold) - .5) < 1e-6,
          "open sensory quantities have a half-response threshold");
    check(std::abs(bounded_response(threshold, threshold) - .5) < 1e-6,
          "bounded quantities share the same threshold meaning");
    check(bounded_response(0, threshold) == 0 && bounded_response(1, threshold) == 1,
          "bounded coding preserves both endpoints");
  }
}
void construction_payment(cppn::CPPN &q) {
  for (float capacity : {.25f, 1.f, 2.f}) {
    auto s = cells(q, {sensor(1, 0, 0), motor(2, 0, 0, 0, field::Forward)});
    for (auto &n : s->neurons)
      n.parameters.capacity = capacity;
    field::Maturation stage(*s);
    const double predicted = stage.birth_cost(),
                 paid = 2 * field::scaled_costs(s->options).neuron_build;
    stage.prepaid_construction(paid);
    check(near(paid + stage.remaining_cost(), predicted),
          "prepaid construction and the hatch forecast agree for every output capacity");
  }
}
void material_release(const Genome &g) {
  auto w = small_world(711);
  auto &p = adult(w, g);
  const double initial = p.body.energy;
  StateAccess::reproduction(p.body).egg_transfer = .5;
  StateAccess::reproduction(p.body).spawn_signal = 1;
  auto egg = fill_natural_egg(w, p, 1);
  check(!egg && StateAccess::reproduction(p.body).egg_yolk == 1 && p.body.energy == initial - 1,
        "inner reproductive tissue transfers material without laying");
  StateAccess::reproduction(p.body).spawn_signal = 0;
  egg = fill_natural_egg(w, p, 1);
  check(!egg && StateAccess::reproduction(p.body).egg_yolk == 1,
        "ending production cannot trigger an egg release");
  StateAccess::reproduction(p.body).egg_yolk = 80;
  StateAccess::reproduction(p.body).egg_release = true;
  double before = p.body.energy + 80;
  egg = fill_natural_egg(w, p, 1);
  check(egg && egg->body.energy == 80 &&
            near(p.body.energy + egg->body.energy, before - w.evo.egg_overhead),
        "outer contraction releases the stored egg and accounts for overhead");
  StateAccess::reproduction(p.body).sperm_transfer = .5;
  StateAccess::reproduction(p.body).sperm_release = false;
  fill_sperm(w, p);
  check(w.sperm.empty() && StateAccess::reproduction(p.body).sperm_store == .1,
        "sperm material accumulates independently of release");
  StateAccess::reproduction(p.body).sperm_store = 10;
  StateAccess::reproduction(p.body).sperm_release = true;
  fill_sperm(w, p);
  check(w.sperm.size() == 1 && w.sperm[0].energy == 10 &&
            StateAccess::reproduction(p.body).sperm_store == 0,
        "release transfers exactly the stored sperm energy");
}
void bladder_and_gland(cppn::CPPN &q) {
  auto cells_in =
      cells(q, {motor(1, 0, 0, 0, field::Bladder, 10), motor(2, 0, 0, 0, field::Gland, 10)});
  cells_in->neurons[1].parameters.quality1 = 1;
  auto layout = body_interface(*cells_in);
  Body p;
  p.energy = 100;
  StateAccess::brain(p).emplace(cells_in);
  Field f(1, 0);
  PhysiologyParameters f_physiology;
  f.flow = 0;
  for (int k = 0; k < 20; ++k) {
    StateAccess::brain(p)->step({});
    anatomical_action(p, *layout, f_physiology);
  }
  check(p.bladder_fill > 0 && p.hormones().levels()[0] > p.hormones().levels()[1] &&
            p.hormones().levels()[1] > p.hormones().levels()[3],
        "bladder and quality-tuned gland respond to their own neural inputs");
  auto outward = cells(q, {motor(3, 1, 1, 1, field::Bladder, 10)});
  outward->neurons[0].bias = -1;
  auto vent = body_interface(*outward);
  StateAccess::brain(p).emplace(outward);
  double previous = p.bladder_fill;
  StateAccess::brain(p)->step({});
  anatomical_action(p, *vent, f_physiology);
  check(p.bladder_fill < previous, "negative bladder drive vents stored gas");
  Body empty, full;
  for (auto *b : {&empty, &full}) {
    b->x = b->y = 200;
    b->energy = 0;
    b->tissue = 40;
    b->bladder_capacity = 10;
  }
  full.bladder_fill = 1;
  move_body(empty, &f, f_physiology);
  move_body(full, &f, f_physiology);
  check(StateAccess::motor(empty).vy > 0 &&
            StateAccess::motor(full).vy < StateAccess::motor(empty).vy &&
            StateAccess::motor(empty).water_vy == StateAccess::motor(full).water_vy,
        "buoyancy changes body motion without changing the measured water");
}
void contact_impulse() {
  Field f(17, 0);
  PhysiologyParameters f_physiology;
  f.flow = f_physiology.sinking = 0;
  Body b;
  b.x = 200;
  b.y = 5;
  b.tissue = 40;
  b.energy = 0;
  StateAccess::motor(b).vy = -2;
  move_body(b, &f, f_physiology);
  check(StateAccess::motor(b).impact > 0 &&
            near(*std::max_element(StateAccess::perception(b).impact_ring.begin(),
                                   StateAccess::perception(b).impact_ring.end()),
                 StateAccess::motor(b).impact),
        "the contact ring records the current collision impulse");
  StateAccess::perception(b).touch_ring.fill(0);
  StateAccess::perception(b).impact_ring.fill(0);
  b.angle = 0;
  StateAccess::reproduction(b).contact = 1;
  StateAccess::motor(b).contact_x = 1;
  StateAccess::motor(b).contact_y = 0;
  record_touch(b, 1, 0, .2);
  BrainInterface layout;
  layout.forms[1].weight = layout.forms[2].weight = 1;
  BrainInterface::Receptor r{};
  r.senses[3] = 1;
  r.refresh_modality();
  r.spatial_width = 0;
  r.mechanical_angle = float(PI / 3);
  layout.sensory = {r};
  const auto frame = prepare_sensory_frame(b, layout, f);
  check(anatomical_sensor(b, r, frame) == 0,
        "a narrow touch field stays silent outside its contact segment");
}

void continuation(const Genome &g) {
  auto w = small_world(712);
  auto &p = adult(w, g);
  take_nutrition(p.body, 7);
  harm_body(p.body, .2, 1);
  p.body.bladder_fill = .3;
  StateAccess::hormones(p.body).set_levels({.2, .6});
  StateAccess::motor(p.body).angular_velocity = .12;
  for (auto &stroke : StateAccess::motor(p.body).strokes)
    stroke = {.1, .2, 4};
  StateAccess::perception(p.body).touch_ring[7] = .3;
  StateAccess::perception(p.body).impact_ring[7] = 2;
  auto copy = w.fork();
  check(saved(w) == saved(copy), "all added organ states survive an immediate checkpoint");
  for (int k = 0; k < 120; ++k) {
    w.tick(false);
    copy.tick(false);
  }
  check(saved(w) == saved(copy), "organ states continue deterministically for another 120 steps");
}
}
int main() {
  try {
    Genome::begin_run(72);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN q(base.cppn);
    auto g = quiet(base, q);
    independent_parameters(q);
    construction_payment(q);

    material_release(g);
    bladder_and_gland(q);
    contact_impulse();
    continuation(g);
    std::cout << "Räumliche Kodierung, Einzelreize, aktive Kapazität, Produktion/Abgabe, "
                 "Schwimmblase, Drüse und Fortsetzung: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
