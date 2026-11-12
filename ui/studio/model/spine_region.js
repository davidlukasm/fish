import {HORMONE_EFFECT} from '../../schema.js';
import {MATURE_CONSOLIDATION, TONIC_LEARNING, neuralPlan, regionCell} from './region_cells.js';

const output = gain =>
    ({...TONIC_LEARNING, [HORMONE_EFFECT.output] : {active : 1, baseline : 2 * gain - 1}});
const listener = (node, preset, copies, gain = 1) =>
    regionCell(node, preset, 'in', {copies, electrical_limit : 1, pace : .5}, output(gain));
const HALF_CELLS = 8;
// A weak resting rhythm still learns late inputs without dominating the alternating clock.
const FIN_RELAY = {
  copies : HALF_CELLS,
  electrical_limit : 1,
  pace : .5,
  threshold : .25
};

export function spinePlan(doc, organ) {
  const r = organ.region;
  return neuralPlan(
      [
        listener('urge', 'inhibit', 4),
        regionCell('rest', 'inhibit', 'out',
                   {copies : HALF_CELLS, electrical_limit : 1, threshold : -1, pace : -1},
                   TONIC_LEARNING),
        // The oscillator keeps the brake from rest and the alternation it learned while growing
        // up: during a long swim rest is silent, and competition would push the brake out.
        regionCell('oscillator', 'pacemaker', 'out',
                   {copies : HALF_CELLS, electrical_limit : 1, tau : r.cycle, pace : 1},
                   {...TONIC_LEARNING, ...MATURE_CONSOLIDATION}),
        regionCell('opponent', 'inhibit', 'none', {copies : 4, electrical_limit : 1, pace : .5},
                   output(r.alternation)),
        listener('steer', 'relay', 2, .25), listener('escape', 'relay', 4),
        listener('fin', 'inhibit', 4),
        regionCell('finRest', 'inhibit', 'none',
                   {copies : HALF_CELLS, electrical_limit : 1, threshold : -1, pace : -1},
                   {...TONIC_LEARNING, [HORMONE_EFFECT.excitation] : {active : 1, baseline : 1}}),
        regionCell('finClock', 'pacemaker', 'none',
                   {copies : HALF_CELLS, electrical_limit : 1, tau : r.finCycle, pace : 1},
                   TONIC_LEARNING),
        regionCell('row', 'relay', 'out', FIN_RELAY, TONIC_LEARNING),
        regionCell('recover', 'relay', 'out', FIN_RELAY, TONIC_LEARNING),
        regionCell('rowOpponent', 'inhibit', 'out', {copies : 4, electrical_limit : 1, pace : .5},
                   output(r.alternation)),
        regionCell('recoverOpponent', 'inhibit', 'out',
                   {copies : 4, electrical_limit : 1, pace : .5}, output(r.alternation))
      ],
      [
        [ 'urge', 'rest' ], [ 'rest', 'oscillator' ], [ 'oscillator', 'opponent' ],
        [ 'steer', 'oscillator' ], [ 'escape', 'oscillator' ], [ 'escape', 'opponent' ],
        [ 'fin', 'finRest' ], [ 'finRest', 'row' ], [ 'finRest', 'recover' ], [ 'finClock', 'row' ],
        [ 'row', 'rowOpponent' ], [ 'recover', 'recoverOpponent' ]
      ],
      // Free mirrored clocks supply both phases even when only one fin is requested. The local
      // gate stops the relays, leaving the muscles available for a separate reverse command.
      [ [ 'opponent', 'oscillator' ], [ 'finClock', 'recover' ] ]);
}
