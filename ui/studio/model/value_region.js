import {neuralPlan, regionCell} from './region_cells.js';

export function valuePlan(doc, organ) {
  const features = Array.from({length : organ.region.features}, (_, i) => 'feature' + (i + 1));
  return neuralPlan(
      [
        ...features.map(node => regionCell(node, 'learn', 'both', {threshold : 0})),
        regionCell('reward', 'modulate', 'in', {copies : 2, threshold : 0}),
        regionCell('harm', 'modulate', 'in', {copies : 2, threshold : 0, sign : -1})
      ],
      features.flatMap(node => [[ 'reward', node ], [ 'harm', node ]]));
}
