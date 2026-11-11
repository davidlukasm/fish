import {HORMONE_EFFECT} from '../../schema.js';
import {RHYTHM_TAU, TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

const listener = (node, preset, port, set = {}) =>
    regionCell(node, preset, port, set, TONIC_LEARNING);

export function choicePlan(doc, organ) {
  const {searchTime, searchDrive} = organ.region;
  const stops = [
    [ 'seen', 'search' ], [ 'alarm', 'search' ], [ 'alarm', 'target' ], [ 'alarm', 'advance' ],
    // Feeding pauses travel; keeping the target direction lets the mouth stay aligned.
    [ 'pause', 'advance' ], [ 'pause', 'search' ], [ 'roam', 'target' ]
  ];
  return neuralPlan(
      [
        listener('target', 'relay', 'both', {pace : -1, threshold : -.05}),
        listener('advance', 'relay', 'both', {pace : -1, threshold : -.05}),
        listener('threat', 'relay', 'both', {pace : -1, threshold : -.05}),
        regionCell('search', 'pacemaker', 'out',
                   {copies : 8, pace : 1, tau : RHYTHM_TAU[1], threshold : -.5}, {
                     ...TONIC_LEARNING,
                     [HORMONE_EFFECT.output] : {active : 1, baseline : 2 * searchDrive - 1}
                   }),
        // A new cue interrupts travel. A held cue loses that privilege without food intake.
        listener('seen', 'inhibit', 'none', {copies : 2, threshold : .5, q2 : 0, tau : searchTime}),
        listener('alarm', 'inhibit', 'none', {copies : 2, threshold : .5}),
        // Intake arrives in short bursts; a quarter-strength contact loses them in the slow mean.
        listener('pause', 'inhibit', 'in', {electrical_limit : 1, q2 : 1, tau : searchTime}),
        // Suppress fixation while travelling; the threat/avoid path stays available.
        listener('roam', 'inhibit', 'none', {copies : 8, threshold : .5})
      ],
      [
        [ 'target', 'seen' ], [ 'advance', 'seen' ], [ 'threat', 'alarm' ], [ 'search', 'roam' ],
        ...stops
      ],
      stops);
}
