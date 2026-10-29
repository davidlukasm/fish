#pragma once
#include "simulation_types.hh"
namespace fishsim {
struct EnergyLedger {
  double movement_cost = 0;
  double brain_cost = 0;
  double development_cost = 0;
  double construction_paid = 0;
  double muscle_cost = 0;
  std::size_t queries_paid = 0;
};
}
