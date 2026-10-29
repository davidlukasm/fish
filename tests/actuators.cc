#include "test_support.hh"
using namespace test;
namespace {
void rhythms() {
  for (double tau : {4., 13.5, 48.}) {
    StrokeTiming timing;
    timing.set(tau);
    StrokeState weak, active;
    int last = -100, hits = 0;
    double total = 0;
    for (int step = 0; step < 160; ++step) {
      check(stroke_step(weak, .19, timing, .2) == 0,
            "subthreshold continuous drive never accumulates into a stroke");
      const double work = stroke_step(active, 1, timing, .2);
      if (work > 0) {
        check(step - last >= timing.recovery && active.mean == 0,
              "every stroke resets its trace and observes inherited recovery");
        check(work <= tau, "averaging bounds the muscle's cycle work");
        last = step;
        total += work;
        ++hits;
      }
    }
    check(hits >= 3 && total > 60 && total < 140,
          "inherited rhythm changes timing without multiplying steady muscle power");
    const double before = weak.mean;
    stroke_step(weak, 0, timing, .2);
    check(weak.mean < before, "unused preparation leaks away");
  }
}
void anatomy(const Genome &g) {
  cppn::CPPN query(g.cppn);
  field::Substrate s(query);
  auto a = motor(1, 1, 1, 1, field::Forward, 10), b = a;
  a.parameters.time_constant = 0;
  b.parameters.time_constant = 1;
  a.strength = 1;
  b.strength = 3;
  s.neurons = {a, b};
  const auto layout = anatomical_interface(s);
  check(near(layout->stroke_timing[StrokeTail].steps, 37),
        "organ recovery is strength-weighted across its actual effector cells");
}
void continuous_timing(const Genome &g) {
  cppn::CPPN query(g.cppn);
  field::Substrate s(query);
  auto a = motor(1, 1, 1, 1, field::Gland, 10), b = a;
  a.parameters.time_constant = 0;
  b.parameters.time_constant = 1;
  a.strength = 1;
  b.strength = 3;
  s.neurons = {a, b};
  const auto layout = anatomical_interface(s);
  for (const auto &t : layout->hormone_timing)
    check(near(t.steps, 37), "gland channels inherit weighted cell timing");
  HormoneState h;
  h.set_levels({.8, .8});
  HormoneParameters p;
  for (int i = 0; i < 12; ++i)
    h.advance({}, {}, 1, p, {4, 48, 4, 48});
  check(near(h.levels()[0], .8 * std::exp(-3.)) && near(h.levels()[1], .8 * std::exp(-.25)),
        "hormones relax independently at inherited rates");
}
void rotation() {
  PhysiologyParameters p;
  p.stroke_turn = 2;
  p.drag_across = .25;
  Body b;
  b.tissue = 40;
  auto &m = StateAccess::motor(b);
  m.swimming_pending = true;
  m.impulse_left = 1;
  move_body(b, nullptr, p);
  const double first = m.turn;
  check(first > 0 && near(m.angular_velocity, first * .75),
        "turning impulse creates angular velocity damped by water");
  move_body(b, nullptr, p);
  check(near(m.turn, first * .75) && near(b.angle, first * 1.75),
        "a fish keeps rotating between strokes; senses see its actual angle change");
  Body free;
  free.tissue = 40;
  auto &f = StateAccess::motor(free);
  f.swimming_pending = true;
  f.impulse_left = 1;
  p.drag_across = 0;
  move_body(free, nullptr, p);
  check(near(f.turn, first), "zero friction cannot disable steering");
}
void neural_rotation(const Genome &g) {
  cppn::CPPN query(g.cppn);
  for (int direction : {-1, 1}) {
    auto tissue = std::make_shared<field::Substrate>(query);
    tissue->neurons = {motor(1, -1, 1, 0, field::Turn, float(direction)),
                       motor(2, 1, 1, 0, field::Turn, float(-direction))};
    const auto layout = anatomical_interface(*tissue);
    Body b;
    b.energy = 400;
    b.tissue = 40;
    b.hatched = true;
    StateAccess::brain(b).emplace(tissue);
    double turn = 0;
    for (int step = 0; step < 48; ++step) {
      StateAccess::brain(b)->step({});
      anatomical_action(b, *layout);
      move_body(b, nullptr, PhysiologyParameters{});
      turn += b.motor().turn;
    }
    check(turn * direction > PI / 3,
          "strong directional neural activation turns over sixty degrees within 48 steps");
  }
}
void mouth_work(const Genome &g) {
  cppn::CPPN query(g.cppn);
  auto s = std::make_shared<field::Substrate>(query);
  s->neurons = {motor(1, 1, 1, 1, field::Suction, 100), motor(2, 1, 1, 1, field::Aggression, 100)};
  for (auto &n : s->neurons)
    n.parameters.time_constant = 0;
  const auto layout = anatomical_interface(*s);
  Body b;
  b.energy = 400;
  b.tissue = 40;
  b.suction_strength = layout->suction_strength;
  b.bite_strength = layout->bite_strength;
  StateAccess::brain(b).emplace(s);
  int closures = 0, previous = -100;
  for (int step = 0; step < 28; ++step) {
    StateAccess::brain(b)->step({});
    anatomical_action(b, *layout);
    if (b.mouth.closing) {
      check(step - previous >= 4 && b.bite_signal > 0 && b.bite_signal <= 1,
            "one inherited stroke closes once without multiplying jaw strength");
      previous = step;
      ++closures;
    }
    check(b.mouth.credit <= b.mouth.budget && b.mouth.opening >= 0 && b.mouth.opening <= 1,
          "mouth geometry and retained transport stay physically bounded");
  }
  check(closures >= 5, "a short inherited rhythm can complete each mouth cycle");
  // A pump's output continues through its recovery, including with a full gut.
  auto pump = std::make_shared<field::Substrate>(query);
  pump->neurons = s->neurons;
  pump->neurons[1].bias = -100;
  StateAccess::brain(b).emplace(pump);
  b.gut_fill = gut_capacity(b);
  for (int step = 0; step < 16; ++step) {
    StateAccess::brain(b)->step({});
    anatomical_action(b, *layout);
    if (step > 8)
      check(b.mouth.flow > 0, "pump work sustains filtering between strokes");
  }
  Body cycle;
  cycle.tissue = 40;
  cycle.eat_signal = 1;
  advance_mouth(cycle, true, false, 48, 4);
  const double budget = cycle.mouth.budget + cycle.mouth.credit;
  double transported = cycle.mouth.credit;
  for (int i = 0; i < 100; ++i) {
    advance_mouth(cycle, false, false, 48, 4);
    transported += cycle.mouth.credit;
  }
  check(transported <= budget + 1e-7 && cycle.mouth.budget == 0 && cycle.mouth.credit == 0,
        "an open mouth cannot grant new transport without a new pump cycle");
}
void pressure_and_adaptation(const Genome &g) {
  Body b;
  BrainInterface::Receptor r{};
  r.senses[3] = 1;
  r.refresh_modality();
  r.threshold = .5;
  r.response_threshold = .5;
  r.contact_kernel = true;
  r.contact_weights[0] = 1;
  r.mechanical_angle = 0;
  SensoryFrame frame;
  frame.contact_ring = true;
  frame.touch[0] = 1;
  frame.impact_ring[0] = .5;
  PhysiologyParameters p;
  p.touch_rest = .2;
  const auto ring = anatomical_sensor(b, r, frame, 0, nullptr, p);
  frame.contact_ring = false;
  frame.contact = 1;
  frame.normal = {1, 0};
  frame.impact = .5;
  check(near(ring, .6) && near(ring, anatomical_sensor(b, r, frame, 0, nullptr, p)),
        "ring and direct contact share receptor sensitivity and resting pressure");
  r.senses = {};
  r.senses[10] = 1;
  r.refresh_modality();
  r.hormones = {1, 0, 0, 0};
  StateAccess::hormones(b).set_levels({.05, 0, 0, 0});
  check(near(anatomical_sensor(b, r, frame), sensory_response(.05, .5)),
        "hormones enter the intensity response without hidden concentration scaling");
  cppn::CPPN query(g.cppn);
  auto s = std::make_shared<field::Substrate>(query);
  s->neurons = {sensor(1, 0, 1, 0, 2)};
  s->neurons[0].parameters.time_constant = 0;
  auto layout = std::make_shared<BrainInterface>(*anatomical_interface(*s));
  layout->sensory[0].response_threshold = .5;
  Genome local = g;
  local.blueprint = s;
  local.interface = layout;
  Field world(18031, 0);
  world.flow = 0;
  b.x = b.y = 200;
  b.tissue = 40;
  StateAccess::motor(b).vx = 2;
  sense_generated(b, local, world);
  auto &state = StateAccess::perception(b);
  check(near(state.sensor_buffer[0], .8) && near(state.adapted[0], .5),
        "lateral cells sense raw local relative water speed and adapt over inherited tau");
  const auto mean = state.adapted;
  b.refresh_senses(local, world);
  check(state.adapted == mean && state.sensor_buffer[0] < .8,
        "inspection shows adaptation without advancing it");
  StateAccess::brain(b).emplace(s);
  state.perception_prepared = false;
  cppn_action(b, local, p, true);
  check(near(state.sensor_buffer[0], 2. / 3.) && near(state.adapted[0], .875),
        "isolated brain probes use the same temporal adaptation as the tank");
  s->neurons = {sensor(2, 0, 1, 0, 10)};
  s->neurons[0].parameters.time_constant = 0;
  local.interface = anatomical_interface(*s);
  Body hormonal;
  hormonal.x = hormonal.y = 200;
  hormonal.tissue = 40;
  StateAccess::hormones(hormonal).set_levels({.8, .8});
  sense_generated(hormonal, local, world);
  const auto first = StateAccess::perception(hormonal).sensor_buffer[0];
  const auto hormonalFrame = prepare_sensory_frame(hormonal, *local.interface, world);
  const double hormonalInput = anatomical_stimulus(hormonal, local.interface->sensory[0],
                                                   hormonalFrame, 0, PhysiologyParameters{});
  check(near(StateAccess::perception(hormonal).adapted[0], hormonalInput / 4),
        "blood sensors adapt to free hormones, maturity and reserve at their inherited rate");
  sense_generated(hormonal, local, world);
  check(StateAccess::perception(hormonal).sensor_buffer[0] < first,
        "sustained hormone concentration adapts like other local intensities");
}
void checkpoint(const Genome &g) {
  auto w = small_world(18032);
  auto &b = adult(w, g).body;
  auto &m = StateAccess::motor(b);
  m.angular_velocity = .12;
  m.turn = .2;
  for (int j = 0; j < STROKE_COUNT; ++j)
    m.strokes[j] = {.01 * j, .2, 3};
  b.mouth.phase = 2.5;
  b.mouth.duration = 6;
  b.mouth.biting = true;
  auto copy = w.fork();
  check(saved(w) == saved(copy), "all new actuator and mouth states survive a current checkpoint");
  for (int i = 0; i < 8; ++i) {
    w.tick(false);
    copy.tick(false);
  }
  check(saved(w) == saved(copy), "continued adaptation, strokes and rotation agree after restore");
}
}
int main() {
  try {
    Genome::begin_run(18030);
    const auto g = Genome::load("genomes/cppn-start.genome");
    rhythms();
    anatomy(g);
    continuous_timing(g);
    rotation();
    neural_rotation(g);
    mouth_work(g);
    pressure_and_adaptation(g);
    checkpoint(g);
    std::cout
        << "Adaptation, Druck, Schlagrhythmus, Drehträgheit, Mundbudget und Fortsetzung: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
