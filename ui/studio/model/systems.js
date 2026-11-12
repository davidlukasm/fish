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
  updateWire,
  wheelPlace
} from './document.js';
import {TONIC_LEARNING} from './region_cells.js';

export const SYSTEMS = Object.freeze([
  {
    key : 'reward',
    sense : 'gut',
    hub : 'state',
    input : 'intake',
    output : 'intake',
    answers : [ {
      holds : isLearner,
      effects : [ [ HORMONE_EFFECT.teaching, {baseline : 0, sensitivity : .5} ] ]
    } ]
  },
  {
    key : 'growth',
    sense : 'gut',
    hub : 'state',
    input : 'intake',
    output : 'intake',
    growth : true,
    answers : []
  },
  {
    // Sated, the fish keeps what its learning cells have just learned.
    key : 'consolidation',
    sense : 'gut',
    hub : 'state',
    input : 'intake',
    output : 'satiety',
    answers : [ {
      holds : isLearner,
      effects : [ [ HORMONE_EFFECT.consolidation, {baseline : 0, sensitivity : 1} ] ]
    } ]
  },
  {
    key : 'alarm',
    sense : 'pain',
    hub : 'choice',
    input : 'threat',
    output : 'avoid',
    answers : [ {
      holds : (center, organ) => organ.type === 'muscle',
      effects : [ [ HORMONE_EFFECT.excitation, {baseline : 0, sensitivity : 1} ] ]
    } ]
  }
]);
const SYSTEM_BY_KEY = Object.freeze(Object.fromEntries(SYSTEMS.map(s => [s.key, s])));
const ANSWER_HALF = .1, GLAND_TAU = 1;
// The cells that would answer the system's substance and read no substance with those effects
// yet; cells already tuned to one keep their settings.
const reads = receptor => receptor?.active && receptor.sensitivity;
const answering = (doc, system) => system.answers.flatMap(
    answer => doc.organs.flatMap(
        organ => organ.centers
                     .filter(c => answer.holds(c, organ) &&
                                  answer.effects.every(([ e ]) => !reads(c.receptors[e])))
                     .map(c => ({center : c, answer}))));
function shared(doc, type, sites, position) {
  const found = doc.organs.find(o => o.type === type);
  if (found)
    return {document : doc, organ : found};
  const added = addOrgan(doc, type, sites, position);
  return added && {document : added.document, organ : findOrgan(added.document, added.organId)};
}
function signalRegion(doc, system, sites, position) {
  const made = shared(doc, system.hub, sites, position);
  if (!made || system.key !== 'alarm')
    return made;
  let draft = made.document;
  // Injury can first occur in adulthood, after developmental activity has ended.
  for (const organ of [made.organ, findOrgan(draft, made.organ.pair)].filter(Boolean)) {
    const center = organ.centers.find(c => c.node === 'threat');
    draft = updateCenter(draft, center.id, {threshold : -.05, pace : -1});
    for (const [effect, patch] of Object.entries(TONIC_LEARNING))
      draft = updateReceptor(draft, center.id, Number(effect), patch);
  }
  return {document : draft, organ : findOrgan(draft, made.organ.id)};
}
// Why the system cannot join this fish yet, or null when it can: 'full' when every substance is
// taken, 'needs' when the body already grows with a substance or no cell is free to answer.
export function systemMissing(doc, key) {
  const system = SYSTEM_BY_KEY[key];
  if (!system)
    return 'needs';
  if (doc.substances.length >= HORMONES.levels)
    return 'full';
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
  const sense = shared(named, system.sense, sites, position);
  const hub = sense && signalRegion(sense.document, system, sites, position);
  const gland = hub && addOrgan(hub.document, 'gland', sites, position, Infinity, false);
  if (!gland)
    return null;
  const [q1, q2] = wheelPlace(wheel, index);
  let draft = updateCenter(gland.document, gland.centerId, {q1, q2, qwidth : 0, tau : GLAND_TAU});
  draft = updateCenter(draft, gland.centerId, {threshold : 1, electrical_limit : .5});
  draft = updateReceptor(draft, gland.centerId, HORMONE_EFFECT.excitation,
                         {active : 1, baseline : .5, sensitivity : 0});
  // Ports keep developmental rhythms and unrelated commands out of the hormone signal.
  const pairing = system.key === 'alarm' ? 'same' : 'both';
  const sensoryIds = new Set([ sense.organ.id, sense.organ.pair ]);
  const regionIds = new Set([ hub.organ.id, hub.organ.pair ]);
  for (const wire of draft.wires)
    if (sensoryIds.has(wire.from) && regionIds.has(wire.to) && wire.toPort === system.input)
      draft = updateWire(draft, wire.id, {pairing});
  draft = addWire(draft, sense.organ.id, hub.organ.id, pairing, sites, {
            fromPort : system.sense === 'gut' ? 'intake' : null,
            toPort : system.input
          })?.document ??
          draft;
  const output =
      addWire(draft, hub.organ.id, gland.organId, 'both', sites, {fromPort : system.output});
  if (!output)
    return null;
  draft = output.document;
  if (system.growth)
    draft = updateGrowth(draft, {active : 1, substance : index, ...GROWTH_START});
  for (const {center, answer} of answering(draft, system))
    for (const [effect, ends] of answer.effects) {
      // A resting tone, such as a muscle's open learning gate, stays under the new answer.
      const own = center.receptors[effect], resting = own?.active ? {baseline : own.baseline} : {};
      draft = updateReceptor(
                  draft, center.id, effect,
                  {...ends, ...resting, active : 1, substance : index, half : ANSWER_HALF}) ??
              draft;
    }
  return {document : draft, organId : gland.organId, substance : index};
}
