// Diagnose (Fable): Dauerfütterung eines Darms – Einkommen je Schritt, Verwertung, Schmerz.
#include "physiology.hh"
#include <iostream>
using namespace fishsim;
int main() {
  const PhysiologyParameters p;
  std::cout << "Kost\tDarm\tMuskel\tTempo\tEinkommen/Schritt\tVerwertung\tSchmerz\tGesundheit/1000\n";
  for (int kind : {food_kind::plant, food_kind::worm, food_kind::feed})
    for (double length : {0., .5, 1.})
      for (double strength : {0., 1., 1e6}) {
        Body b{};
        b.hatched = true;
        b.tissue = BODY_TISSUE;
        b.gut_length = length;
        b.gut_strength = strength;
        double eaten = 0, gained = 0, ache = 0;
        const int warm = 6000, steps = 4000;
        for (int k = 0; k < warm + steps; ++k) {
          b.energy = 0;
          b.health = 1;
          const double before = b.digested, e = take_nutrition(b, 1e9, kind, p);
          b.gut_motility = strength > 0 ? .5 : 0;
          digest_nutrition(b, p);
          if (k >= warm) {
            eaten += e;
            gained += b.digested - before;
            ache += b.gut_irritation;
          }
        }
        std::cout << (kind == food_kind::plant ? "Blatt" : kind == food_kind::worm ? "Fleisch" : "Flocke")
                  << '\t' << gut_size(length) << '\t' << strength << '\t' << gut_speed(b) << '\t'
                  << gained / steps << '\t' << gained / eaten << '\t' << ache / steps << '\t'
                  << 1000 * digestion::harm * ache / steps << '\n';
      }
  Body b{};
  b.tissue = BODY_TISSUE;
  std::cout << "Fassung Reserve " << reserve_capacity_for_tissue(BODY_TISSUE) << " Grundumsatz "
            << basal_cost(BODY_TISSUE, p) << '\n';
}
