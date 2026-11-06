import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {
  addOrgan,
  addSubstance,
  addWire,
  findOrgan,
  GROWTH_START,
  newDocument,
  pairEndpoint,
  setSubstance,
  updateCenter,
  updateGrowth,
  updateReceptor,
  wheelPlace
} from './document.js';

// The example fish. Its brain is built of regions: the eyes feed the optic tecta across the
// midline, the noses the olfactory bulbs; both feed the pallium, which learns what to steer the
// fins and tail by; the spinal cord beats the tail on alternate sides; the lateral line alarms
// the hindbrain, which turns the fish away. A biting muscle at the snout and a sucking one behind
// it make the mouth: the tectum snaps at what is seen, the olfactory bulb sucks where food smells,
// and the pallium learns both. A gland releases the growth substance, and the body grows while it
// binds its growth receptor. Eating teaches: the gut's food sense drives the hypothalamus, which
// makes a second gland release the food substance. In the pallium it is the teaching signal
// (through the excitation receptor, the engine's teacher besides modulating cells) and raises the
// learning rate, so what led to food is learnt.
//
// Where its organs lie in the body frame, by name.
const PLACES = Object.freeze({
  eye : [ 'eye', 360, 300 ],
  nose : [ 'nose', 245, 425 ],
  tectum : [ 'tectum', 330, 340 ],
  bulb : [ 'olfactory', 260, 380 ],
  pallium : [ 'pallium', 520, 345 ],
  spinal : [ 'spinal', 870, 365 ],
  lateral : [ 'lateral', 573, 300 ],
  hindbrain : [ 'hindbrain', 690, 400 ],
  fin : [ 'muscle', 600, 470 ],
  tail : [ 'muscle', 890, 350 ],
  bite : [ 'muscle', 195, 335 ],
  suck : [ 'muscle', 330, 302 ],
  eggs : [ 'eggs', 848, 330 ],
  sperm : [ 'sperm', 760, 395 ],
  growth : [ 'gland', 260, 351 ],
  gut : [ 'gut', 780, 357 ],
  hypothalamus : [ 'hypothalamus', 420, 365 ],
  reward : [ 'gland', 470, 383 ]
});
// Organs and regions are wired as wholes, the gut by its food node alone.
const WIRES = Object.freeze([
  [ 'eye', 'tectum' ], [ 'nose', 'bulb' ], [ 'tectum', 'pallium' ], [ 'bulb', 'pallium' ],
  [ 'pallium', 'fin' ], [ 'pallium', 'tail' ], [ 'spinal', 'tail' ], [ 'lateral', 'hindbrain' ],
  [ 'hindbrain', 'fin' ], [ 'tectum', 'bite' ], [ 'bulb', 'suck' ], [ 'pallium', 'bite' ],
  [ 'pallium', 'suck' ], [ 'gut:node', 'hypothalamus' ], [ 'hypothalamus', 'reward' ]
]);
// The pallium learns at full rate once the food substance reaches half; food teaches it TEACHING
// strongly, as the excitation it brings.
const REWARD = Object.freeze({sensitivity : 1, half : .1, teaching : .5});

// The example document for the body's development sites; names gives the fish's, the growth
// substance's and the food substance's names.
export function exampleDocument(names, sites, wheel) {
  let doc = newDocument(names.fish);
  // Each organ placed: its id, to wire it as a whole, and its first node's.
  const placed = {};
  for (const [key, [ type, x, y ]] of Object.entries(PLACES)) {
    const result = addOrgan(doc, type, sites, {x, y});
    if (result)
      doc = result.document;
    placed[key] = {organ : result?.organId, node : result?.centerId};
  }
  const substance = name => {
    const next = addSubstance(doc, HORMONES.levels);
    if (!next)
      return null;
    const index = next.substances.at(-1).index;
    doc = setSubstance(next, index, name);
    return index;
  };
  const release = (gland, index) => {
    const [q1, q2] = wheelPlace(wheel, index);
    doc = updateCenter(doc, gland, {q1, q2, qwidth : 0, tau : 1});
  };
  const growth = substance(names.growth);
  if (placed.growth.node && growth !== null) {
    release(placed.growth.node, growth);
    doc = updateGrowth(doc, {active : 1, substance : growth, ...GROWTH_START});
  }
  const food = substance(names.food);
  const learner = findOrgan(doc, placed.pallium.organ)?.centers.find(c => c.node === 'learn')?.id;
  if (placed.reward.node && learner && food !== null) {
    release(placed.reward.node, food);
    for (const id of [learner, pairEndpoint(doc, learner)].filter(Boolean))
      for (const [effect, sensitivity] of [[ HORMONE_EFFECT.learning, REWARD.sensitivity ],
                                           [ HORMONE_EFFECT.excitation, REWARD.teaching ]])
        doc = updateReceptor(doc, id, effect,
                             {active : 1, substance : food, sensitivity, half : REWARD.half});
  }
  const end = key => {
    const [name, part] = key.split(':');
    return placed[name][part ?? 'organ'];
  };
  for (const [from, to] of WIRES) {
    const r = addWire(doc, end(from), end(to));
    if (r)
      doc = r.document;
  }
  return doc;
}
