// How two behaviour profiles differ: per-feature contributions to the novelty distance, grouped
// as the simulation groups them, and the strongest differences as short phrases.
import {tList} from './strings.js';
export const behavior_modelState = {};

// Movement, food, habitat, reproduction and signals: feature indices of each group.
export const BEHAVIOR_GROUPS = [
  [ 0, 1, 2, 3, 4, 5 ], [ 6, 7, 8, 9, 20, 21, 26, 27, 28, 29, 30 ], [ 10, 11, 22, 23, 24, 25 ],
  [ 12, 13 ], [ 14, 15, 16, 17, 18, 19 ]
];

export function behaviorContributions(a, b) {
  const weights = Array(31).fill(0);
  for (let k = 0; k < 5; ++k) {
    const group = BEHAVIOR_GROUPS[k];
    if (k === 1) {
      let sum = 0;
      for (const i of group) {
        weights[i] = .1 * Math.abs((a[i] || 0) - (b[i] || 0));
        sum += weights[i];
      }
      if (sum > .2)
        for (const i of group)
          weights[i] *= .2 / sum;
      continue;
    }
    let sum = 0;
    for (const i of group)
      sum += ((a[i] || 0) - (b[i] || 0)) ** 2;
    if (sum > 0)
      for (const i of group)
        weights[i] = .2 * ((a[i] || 0) - (b[i] || 0)) ** 2 / Math.sqrt(group.length * sum);
  }
  return weights;
}

export function behaviorDistance(a, b) {
  return behaviorContributions(a, b).reduce((sum, v) => sum + v, 0);
}

export function behaviorDeltaLabels(a, b, count = 2) {
  const weights = behaviorContributions(a, b), phrases = tList('behavior_view.deltaPhrases');
  return weights.map((weight, i) => ({i, weight, text : phrases[i][a[i] >= b[i] ? 1 : 0]}))
      .filter(x => x.weight > 1e-8)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, count);
}

// Where one fish stands in the novelty search: its score from the simulation (mean distance to
// its nearest behaviour profiles), the share of the other observed living fish it exceeds, and
// the single closest profile among those fish and the archive of this environment.
export function noveltyStanding(f, id) {
  const observed = (f.behavior || []).filter(b => b.samples >= 80),
        own = observed.find(b => b.id === id);
  if (!own)
    return null;
  const others = observed.filter(b => b.id !== id), pool = [
    ...others.map(b => ({fish : b.id, descriptor : b.descriptor})),
    ...(f.archive || [])
        .filter(a => a.environment === f.environment)
        .map(a => ({tick : a.tick, descriptor : a.descriptor}))
  ];
  let closest = null;
  for (const candidate of pool) {
    const distance = behaviorDistance(own.descriptor, candidate.descriptor);
    if (!closest || distance < closest.distance)
      closest = {...candidate, distance};
  }
  return {
    novelty : own.novelty,
    others : others.length,
    share : others.length ? others.filter(b => b.novelty < own.novelty).length / others.length
                          : null,
    descriptor : own.descriptor,
    closest
  };
}
