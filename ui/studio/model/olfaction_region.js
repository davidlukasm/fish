import {TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

export function olfactionPlan() {
  return neuralPlan(
      [
        regionCell('concentration', 'relay', 'both'), regionCell('opposite', 'inhibit', 'in'),
        // Subtract the two sides before amplifying their difference. The small resting tone
        // lets both initially weightless afferents learn even while the cues cancel.
        regionCell('gradient', 'relay', 'out', {threshold : -.005, pace : -1, electrical_limit : 1},
                   TONIC_LEARNING)
      ],
      [ [ 'concentration', 'gradient' ] ], [ [ 'opposite', 'gradient' ] ]);
}
