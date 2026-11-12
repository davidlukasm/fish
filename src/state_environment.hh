#pragma once
#include <iosfwd>
#include <vector>
#include "physiology_parameters.hh"
#include "environment.hh"
namespace fishsim {
class EnvironmentCheckpoint {
public:
  static void read(std::istream &, Field &, PhysiologyParameters &);
  static void read_cache(std::istream &, Field &);
  static void read_energy_flow(std::istream &, Field &);
  static void write(std::ostream &, const Field &, const PhysiologyParameters &);
  // The bodies and carrion scents the field indexed in the last step.
  struct Index {
    std::vector<VisibleBody> bodies;
    std::vector<Field::OdorSource> odors;
  };
  static void write_index(std::ostream &, const Field &);
  static Index read_index(std::istream &, const Field &, std::size_t fish, std::size_t corpses);

private:
  static void read_geometry(std::istream &, Field &);
  static void read_water(std::istream &, Field &);
};
}
