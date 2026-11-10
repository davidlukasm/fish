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
import {updateRegion} from './regions.js';

// Each system owns its circuit so adding a hormone cannot retune a sensory or motor relay.
export const SYSTEMS = Object.freeze([
  {
    key : 'reward',
    sense : [ 'gut', 'food' ],
    hub : 'circuit',
    answers : [ {
      holds : isLearner,
      effects : [ [ HORMONE_EFFECT.teaching, {baseline : 0, sensitivity : .5} ] ]
    } ]
  },
  {key : 'growth', sense : [ 'gut', 'food' ], hub : 'circuit', growth : true, answers : []}, {
    key : 'alarm',
    sense : [ 'pain', 'injury' ],
    hub : 'circuit',
    answers : [ {
      holds : (center, organ) => organ.type === 'muscle',
      effects : [ [ HORMONE_EFFECT.excitation, {baseline : 0, sensitivity : 1} ] ]
    } ]
  }
]);
const SYSTEM_BY_KEY = Object.freeze(Object.fromEntries(SYSTEMS.map(s => [s.key, s])));
const ANSWER_HALF = .1, GLAND_TAU = 1;
// The cells that would answer the system's substance and answer none of those effects yet; cells
// already set keep their settings.
const answering = (doc, system) => system.answers.flatMap(
    answer => doc.organs.flatMap(
        organ => organ.centers
                     .filter(c => answer.holds(c, organ) &&
                                  answer.effects.every(([ e ]) => !c.receptors[e]?.active))
                     .map(c => ({center : c, answer}))));
function shared(doc, type, sites, position) {
  const found = doc.organs.find(o => o.type === type);
  if (found)
    return {document : doc, organ : found};
  const added = addOrgan(doc, type, sites, position);
  return added && {document : added.document, organ : findOrgan(added.document, added.organId)};
}
// Why the system cannot join this fish yet, or null when it can: 'full' when every substance is
// taken, 'needs' when the body already grows with a substance or no cell is free to answer.
export function systemMissing(doc, key) {
  const system = SYSTEM_BY_KEY[key];
  if (doc.substances.length >= HORMONES.levels)
    return 'full';
  if (!system)
    return 'needs';
  if (system.growth)
    return doc.growth.active ? 'needs' : null;
  return answering(doc, system).length ? null : 'needs';
}
export function placeSystem(doc, key, sites, wheel, position, name) {
  const system = SYSTEM_BY_KEY[key];
  const added = !systemMissing(doc, key) && addSubstance(doc, HORMONES.levels);
  if (!added)
    return null;
  const index = added.substances.at(-1).index;
  const named = setSubstance(added, index, name);
  const [senseType, senseKey] = system.sense;
  const sense = shared(named, senseType, sites, position);
  const hub = sense && addOrgan(sense.document, system.hub, sites, position, Infinity, false);
  const gland = hub && addOrgan(hub.document, 'gland', sites, position);
  if (!gland)
    return null;
  const [q1, q2] = wheelPlace(wheel, index);
  let draft = updateCenter(gland.document, gland.centerId, {q1, q2, qwidth : 0, tau : GLAND_TAU});
  if (system.growth)
    draft = updateRegion(draft, hub.organId, {response : 1}, sites);
  const from = sense.organ.centers.find(c => c.key === senseKey)?.id ?? sense.organ.id;
  for (const [a, b] of [[ from, hub.organId ], [ hub.organId, gland.organId ]])
    draft = addWire(draft, a, b, 'both', sites)?.document ?? draft;
  if (system.growth)
    draft = updateGrowth(draft, {active : 1, substance : index, ...GROWTH_START});
  for (const {center, answer} of answering(draft, system))
    for (const [effect, ends] of answer.effects)
      draft = updateReceptor(draft, center.id, effect,
                             {...ends, active : 1, substance : index, half : ANSWER_HALF}) ??
              draft;
  return {document : draft, organId : gland.organId, substance : index};
}
