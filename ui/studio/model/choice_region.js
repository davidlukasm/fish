import {HORMONE_EFFECT} from '../../schema.js';
import {TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

export function choicePlan(doc, organ) {
  const {searchTime, searchDrive} = organ.region;
  const stops = [
    [ 'seen', 'search' ], [ 'alarm', 'search' ], [ 'alarm', 'target' ], [ 'alarm', 'advance' ],
    // Feeding pauses travel; keeping the target direction lets the mouth stay aligned.
    [ 'pause', 'advance' ], [ 'pause', 'search' ]
  ];
  return neuralPlan(
      [
        regionCell('target', 'relay', 'both', {threshold : 0}),
        regionCell('advance', 'relay', 'both', {threshold : 0}),
        regionCell('threat', 'relay', 'both', {threshold : 0}),
        regionCell('search', 'pacemaker', 'out', {copies : 2, pace : 1, tau : searchTime}, {
          ...TONIC_LEARNING,
          [HORMONE_EFFECT.output] : {active : 1, baseline : 2 * searchDrive - 1}
        }),
        regionCell('seen', 'inhibit', 'none', {copies : 2, threshold : 0}),
        regionCell('alarm', 'inhibit', 'none', {copies : 2, threshold : 0}),
        regionCell('pause', 'inhibit', 'in', {copies : 2, threshold : 0})
      ],
      [ [ 'target', 'seen' ], [ 'advance', 'seen' ], [ 'threat', 'alarm' ], ...stops ], stops);
}
