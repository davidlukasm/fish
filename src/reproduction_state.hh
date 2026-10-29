#pragma once
#include "simulation_types.hh"
namespace fishsim {
struct ReproductionState {
  bool egg_release = false;
  bool sperm_release = false;
  double egg_transfer = 0;
  double sperm_transfer = 0;
  double motor_reserve = 30;
  double egg_limit = 160;
  double sperm_limit = 40;
  bool sperm_laying = false;
  bool egg_role = true;
  double spawn_signal = 0;
  double readiness = 0;
  double contact = 0;
  double sperm_signal = 0;
  double egg_readiness = 0;
  double sperm_readiness = 0;
  double egg_yolk = 0;
  double sperm_store = 0;
  bool egg_laying = false;
  std::array<double, 3> egg_color{};
  std::array<double, 3> sperm_color{};
  std::array<double, 3> egg_signal_color{};
  std::array<double, 3> sperm_signal_color{};
};
}
