import {neuralPlan, regionCell} from './region_cells.js';

// Both input groups match the relays the noses have always fed: four cells capped at a quarter
// of a contact learn their nose input too weakly to steer.
const INPUT = Object.freeze({copies : 8, electrical_limit : 1});
export function olfactionPlan() {
  return neuralPlan(
      [
        regionCell('concentration', 'relay', 'both', INPUT),
        regionCell('opposite', 'inhibit', 'in', INPUT),
        // Subtract the two sides before amplifying their difference. A contact grows only while
        // its target cell is active, so the developmental rhythm lets the weightless afferents
        // grow while the cues still cancel; it ends at maturity.
        regionCell('gradient', 'relay', 'out', {electrical_limit : 1})
      ],
      [ [ 'concentration', 'gradient' ] ], [ [ 'opposite', 'gradient' ] ]);
}
