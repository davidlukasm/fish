import {HORMONE_EFFECT} from '../../schema.js';
import {DEVELOPING_RELAY, neuralPlan, regionCell} from './region_cells.js';

export function valuePlan(doc, organ) {
  const {association, teaching} = organ.region;
  const features = Array.from({length : organ.region.features}, (_, i) => 'feature' + (i + 1));
  return neuralPlan(
      [
        // Coactivity establishes the young circuit. Mature weights then follow the teacher;
        // otherwise frequent cues climb back to the ceiling immediately after punishment.
        ...features.map(
            node => regionCell(
                node, 'learn', 'both',
                {threshold : 0, learning_tau : association, teaching_limit : teaching},
                {[HORMONE_EFFECT.competition] : DEVELOPING_RELAY[HORMONE_EFFECT.rhythm]})),
        regionCell('reward', 'modulate', 'in', {copies : 2, threshold : 0}),
        regionCell('harm', 'modulate', 'in', {copies : 2, threshold : 0, sign : -1})
      ],
      features.flatMap(node => [[ 'reward', node ], [ 'harm', node ]]));
}
