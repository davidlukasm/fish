import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {neuralPlan, regionCell} from './region_cells.js';

const ADULT_OUTPUT = Object.freeze({
  [HORMONE_EFFECT.output] : {
    active : 1,
    baseline : -1,
    sensitivity : 2,
    half : .5,
    steepness : 3,
    substance : HORMONES.levels
  }
});

export function statePlan() {
  return neuralPlan(
      [
        regionCell('intake', 'relay', 'both'), regionCell('satiety', 'relay', 'both'),
        regionCell('reserve', 'inhibit', 'in'),
        regionCell('deficit', 'inhibit', 'none', {copies : 2, threshold : -.5}),
        regionCell('pause', 'relay', 'out', {copies : 2, q2 : 1, tau : 1}),
        regionCell('investment', 'relay', 'out', {threshold : -.4}, ADULT_OUTPUT),
        regionCell('eggReady', 'relay', 'both', {threshold : .2}, ADULT_OUTPUT),
        regionCell('spermReady', 'relay', 'both', {threshold : .2}, ADULT_OUTPUT)
      ],
      [
        [ 'intake', 'pause' ], [ 'reserve', 'deficit' ], [ 'deficit', 'investment' ],
        [ 'deficit', 'eggReady' ], [ 'deficit', 'spermReady' ]
      ]);
}
