import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

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
// Gonads may first fill long after maturation. These cells still need their own activity
// then to learn the fullness input; the output gate prevents juvenile spawning.
export function statePlan(doc, organ) {
  const {reserve, rest, maturity} = organ.region;
  const adult =
      {[HORMONE_EFFECT.output] : {...ADULT_OUTPUT[HORMONE_EFFECT.output], half : maturity}};
  const late = {...TONIC_LEARNING, ...adult};
  return neuralPlan(
      [
        // Embryos use the sperm organ to soften the shell, before adult gonad fullness exists.
        regionCell('hatch', 'pacemaker', 'out', {pace : 1, tau : .6}),
        regionCell('intake', 'relay', 'both'), regionCell('satiety', 'relay', 'both'),
        regionCell('reserve', 'inhibit', 'in'),
        // At empty reserve this pool must outweigh both full gonad sensors as well as the
        // investment tone. Two weak cells could never stop either command.
        regionCell('deficit', 'inhibit', 'none', {copies : 8, threshold : -reserve}),
        regionCell('pause', 'relay', 'out', {copies : 2, q2 : 1, tau : rest}),
        regionCell('investment', 'relay', 'out', {threshold : -.4}, adult),
        regionCell('eggReady', 'relay', 'both', {threshold : .2}, late),
        regionCell('spermReady', 'relay', 'both', {threshold : .2}, late)
      ],
      [
        [ 'intake', 'pause' ], [ 'reserve', 'deficit' ], [ 'deficit', 'investment' ],
        [ 'deficit', 'eggReady' ], [ 'deficit', 'spermReady' ]
      ]);
}
