import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {
  addOrgan,
  addSubstance,
  addWire,
  findOrgan,
  GROWTH_START,
  isLearner,
  setSubstance,
  updateCenter,
  updateGrowth,
  updateReceptor,
  wheelPlace
} from './document.js';

// A hormone system in one piece: a sense reports to a brain region, the region drives a gland,
// the gland releases a new substance and chosen cells answer it. Missing sense or region organs
// are added; ones already in the fish are shared.
export const SYSTEMS = Object.freeze([
  {
    key : 'reward',
    sense : [ 'gut', 'food' ],
    hub : 'hypothalamus',
    answers : [ {
      holds : isLearner,
      effects : [ [ HORMONE_EFFECT.learning, 1 ], [ HORMONE_EFFECT.teaching, .5 ] ]
    } ]
  },
  {key : 'growth', sense : [ 'gut', 'food' ], hub : 'hypothalamus', growth : true, answers : []}, {
    key : 'alarm',
    sense : [ 'pain', 'injury' ],
    hub : 'hindbrain',
    answers : [ {
      holds : (center, organ) => organ.type === 'muscle',
      effects : [ [ HORMONE_EFFECT.output, 1 ] ]
    } ]
  }
]);
const SYSTEM_BY_KEY = Object.freeze(Object.fromEntries(SYSTEMS.map(s => [s.key, s])));
const ANSWER_HALF = .1, GLAND_TAU = 1;
const answering = (doc, system) => system.answers.flatMap(
    answer => doc.organs.flatMap(
        organ =>
            organ.centers.filter(c => answer.holds(c, organ)).map(c => ({center : c, answer}))));
function shared(doc, type, sites, position) {
  const found = doc.organs.find(o => o.type === type);
  if (found)
    return {document : doc, organ : found};
  const added = addOrgan(doc, type, sites, position);
  return added && {document : added.document, organ : findOrgan(added.document, added.organId)};
}
// The fish gains from the system: it has the cells that would answer and they do not yet, or for
// growth the body does not grow with any substance yet.
export function systemFits(doc, key) {
  const system = SYSTEM_BY_KEY[key];
  if (!system || doc.substances.length >= HORMONES.levels)
    return false;
  if (system.growth)
    return !doc.growth.active;
  const cells = answering(doc, system);
  return cells.length > 0 && cells.every(({center, answer}) => answer.effects.every(
                                             ([ e ]) => !center.receptors[e]?.active));
}
export function placeSystem(doc, key, sites, wheel, position, name) {
  const system = SYSTEM_BY_KEY[key];
  const added = system && addSubstance(doc, HORMONES.levels);
  if (!added)
    return null;
  const index = added.substances.at(-1).index;
  const named = setSubstance(added, index, name);
  const [senseType, senseKey] = system.sense;
  const sense = shared(named, senseType, sites, position);
  const hub = sense && shared(sense.document, system.hub, sites, position);
  const gland = hub && addOrgan(hub.document, 'gland', sites, position);
  if (!gland)
    return null;
  const [q1, q2] = wheelPlace(wheel, index);
  let draft = updateCenter(gland.document, gland.centerId, {q1, q2, qwidth : 0, tau : GLAND_TAU});
  const from = sense.organ.centers.find(c => c.key === senseKey)?.id ?? sense.organ.id;
  for (const [a, b] of [[ from, hub.organ.id ], [ hub.organ.id, gland.organId ],
                        [ hub.organ.id, findOrgan(draft, gland.organId)?.pair ]])
    draft = (b && addWire(draft, a, b)?.document) ?? draft;
  if (system.growth)
    draft = updateGrowth(draft, {active : 1, substance : index, ...GROWTH_START});
  for (const {center, answer} of answering(draft, system))
    for (const [effect, sensitivity] of answer.effects)
      draft = updateReceptor(draft, center.id, effect,
                             {active : 1, substance : index, sensitivity, half : ANSWER_HALF}) ??
              draft;
  return {document : draft, organId : gland.organId, substance : index};
}
