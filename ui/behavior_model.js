import {FOOD_SLOT} from './nutrition_model.js';
import {tList} from './strings.js';
import {BEHAVIOR, BEHAVIOR_FEATURE, BEHAVIOR_FEATURE_SET as SET, TOLERANCE} from './schema.js';
export const behavior_modelState = {};

export const BEHAVIOR_GROUPS =
    [ SET.movement, SET.diet, SET.habitat, SET.reproduction, SET.signals ];
const DIET_GROUP = BEHAVIOR_GROUPS.indexOf(SET.diet);

export function behaviorContributions(a, b) {
  const weights = Array(BEHAVIOR_FEATURE.count).fill(0);
  for (let k = 0; k < BEHAVIOR_GROUPS.length; ++k) {
    const group = BEHAVIOR_GROUPS[k];
    if (k === DIET_GROUP) {
      let sum = 0;
      for (const i of group) {
        weights[i] =
            BEHAVIOR.group_weight * BEHAVIOR.diet_scale * Math.abs((a[i] || 0) - (b[i] || 0));
        sum += weights[i];
      }
      if (sum > BEHAVIOR.group_weight)
        for (const i of group)
          weights[i] *= BEHAVIOR.group_weight / sum;
      continue;
    }
    let sum = 0;
    for (const i of group)
      sum += ((a[i] || 0) - (b[i] || 0)) ** 2;
    if (sum > 0)
      for (const i of group)
        weights[i] = BEHAVIOR.group_weight * ((a[i] || 0) - (b[i] || 0)) ** 2 /
                     Math.sqrt(group.length * sum);
  }
  return weights;
}

export function behaviorDistance(a, b) {
  return behaviorContributions(a, b).reduce((sum, v) => sum + v, 0);
}

export function behaviorDeltaLabels(a, b, count = 2) {
  const weights = behaviorContributions(a, b), phrases = tList('behavior_view.deltaPhrases');
  return weights.map((weight, i) => ({i, weight, text : phrases[i][a[i] >= b[i] ? 1 : 0]}))
      .filter(x => x.weight > TOLERANCE.negligible)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, count);
}

export function noveltyStanding(f, id) {
  const observed = (f.behavior || []).filter(b => b.samples >= BEHAVIOR.min_samples),
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

const F = BEHAVIOR_FEATURE, S = FOOD_SLOT;
const NICHE_FOODS = [
  [ F.diet_feed, S.feed ], [ F.diet_fish, S.fish ], [ F.diet_egg, S.egg ],
  [ F.diet_carrion, S.carrion ], [ F.diet_algae, S.algae ], [ F.diet_plant, S.plant ],
  [ F.diet_plankton, S.plankton ], [ F.diet_worm, S.worm ], [ F.diet_crab, S.crab ],
  [ F.diet_mussel, S.mussel ], [ F.diet_benthic, S.benthic ]
];
const NICHE_PLACES = [ F.bottom, F.top, F.surface, F.grass ], NICHE_PLACE_SHARE = .35;
export const NICHE_OPEN_WATER = NICHE_PLACES.length;

function niche(d) {
  const food = NICHE_FOODS.reduce((best, f) => (d[f[0]] || 0) > (d[best[0]] || 0) ? f : best);
  const place =
      NICHE_PLACES.reduce((best, i, k) => (d[i] || 0) > (d[NICHE_PLACES[best]] || 0) ? k : best, 0);
  return {
    food : (d[food[0]] || 0) > 0 ? food[1] : -1,
    place : (d[NICHE_PLACES[place]] || 0) >= NICHE_PLACE_SHARE ? place : NICHE_OPEN_WATER
  };
}

export function behaviorNiches(f) {
  const cells = new Map(), cell = n => {
    const key = n.food + ':' + n.place;
    if (!cells.has(key))
      cells.set(key, {...n, fish : [], archive : 0});
    return cells.get(key);
  };
  for (const b of f.behavior || [])
    if (b.samples >= BEHAVIOR.min_samples && b.descriptor)
      cell(niche(b.descriptor)).fish.push(b.id);
  for (const a of f.archive || [])
    if (a.environment === f.environment && a.descriptor)
      cell(niche(a.descriptor)).archive++;
  const foods = [...new Set([...cells.values() ].map(c => c.food)) ].sort((a, b) => a - b);
  return {cells, foods, places : NICHE_PLACES.length + 1};
}
