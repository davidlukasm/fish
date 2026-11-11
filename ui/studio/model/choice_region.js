import {TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

export function choicePlan() {
  const stops = [
    [ 'seen', 'search' ], [ 'alarm', 'search' ], [ 'alarm', 'target' ], [ 'alarm', 'advance' ],
    [ 'pause', 'target' ], [ 'pause', 'advance' ], [ 'pause', 'search' ]
  ];
  return neuralPlan(
      [
        regionCell('target', 'relay', 'both', {threshold : 0}),
        regionCell('advance', 'relay', 'both', {threshold : 0}),
        regionCell('threat', 'relay', 'both', {threshold : 0}),
        regionCell('search', 'pacemaker', 'out', {copies : 2, pace : 1, tau : .6}, TONIC_LEARNING),
        regionCell('seen', 'inhibit', 'none', {copies : 2, threshold : 0}),
        regionCell('alarm', 'inhibit', 'none', {copies : 2, threshold : 0}),
        regionCell('pause', 'inhibit', 'in', {copies : 2, threshold : 0})
      ],
      [ [ 'target', 'seen' ], [ 'advance', 'seen' ], [ 'threat', 'alarm' ], ...stops ], stops);
}
