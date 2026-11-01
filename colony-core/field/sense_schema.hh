#pragma once
namespace field {
enum Sense {
  Light,
  Odor,
  Flow,
  Touch,
  Proximity,
  Intake,
  Damage,
  BladderPressure,
  GonadPressure,
  InnerPressure,
  Blood
};
constexpr int SENSE_COUNT = 11;
enum Motor { Forward, Turn, Suction, Eggs, Sperm, Aggression, Defense, Pigment, Bladder, Gland };
constexpr int MOTOR_COUNT = 10;
// A brain develops on at most MAX_WORKERS threads, like a tank.
constexpr int MAX_WORKERS = 64;
}
