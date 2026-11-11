import {HORMONE_EFFECT} from '../../schema.js';
import {TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

const output = gain =>
    ({...TONIC_LEARNING, [HORMONE_EFFECT.output] : {active : 1, baseline : 2 * gain - 1}});
const listener = (node, preset, copies, gain = 1) =>
    regionCell(node, preset, 'in', {copies, electrical_limit : 1, pace : .5}, output(gain));
const HALF_CELLS = 8;

export function spinePlan(doc, organ) {
  const r = organ.region;
  return neuralPlan(
      [
        listener('urge', 'inhibit', 4),
        regionCell('rest', 'inhibit', 'out',
                   {copies : HALF_CELLS, electrical_limit : 1, threshold : -1, pace : -1},
                   TONIC_LEARNING),
        regionCell('oscillator', 'pacemaker', 'out',
                   {copies : HALF_CELLS, electrical_limit : 1, tau : r.cycle, pace : 1},
                   TONIC_LEARNING),
        regionCell('opponent', 'inhibit', 'none', {copies : 4, electrical_limit : 1, pace : .5},
                   output(r.alternation)),
        listener('steer', 'relay', 2, .25), listener('escape', 'relay', 4)
      ],
      [
        [ 'urge', 'rest' ], [ 'rest', 'oscillator' ], [ 'oscillator', 'opponent' ],
        [ 'steer', 'oscillator' ], [ 'escape', 'oscillator' ], [ 'escape', 'opponent' ]
      ],
      [ [ 'opponent', 'oscillator' ] ]);
}
