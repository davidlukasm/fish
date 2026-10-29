#pragma once
#include <iosfwd>
#include "physiology_parameters.hh"
namespace fishsim {
struct Field;
class EnvironmentCheckpoint {
public:
  static void read(std::istream &, Field &, PhysiologyParameters &);
  static void read_cache(std::istream &, Field &);
  static void read_energy_flow(std::istream &, Field &);
  static void write(std::ostream &, const Field &, const PhysiologyParameters &);

private:
  static void read_geometry(std::istream &, Field &);
  static void read_water(std::istream &, Field &);
};
}
