import {addOrgan, addWire, newDocument, setOrganNodes} from './document.js';
import {placeSystem} from './systems.js';

const PLACES = Object.freeze({
  eye : [ 'eye', 360, 300 ],
  nose : [ 'nose', 245, 425 ],
  tectum : [ 'tectum', 390, 321 ],
  bulb : [ 'olfactory', 262, 409 ],
  pallium : [ 'pallium', 300, 321 ],
  spinal : [ 'spinal', 700, 381 ],
  lateral : [ 'lateral', 573, 300 ],
  hindbrain : [ 'hindbrain', 520, 405 ],
  fin : [ 'muscle', 600, 470 ],
  tail : [ 'muscle', 890, 350 ],
  bite : [ 'muscle', 195, 335 ],
  suck : [ 'muscle', 330, 302 ],
  eggs : [ 'eggs', 848, 330 ],
  sperm : [ 'sperm', 760, 395 ],
  gut : [ 'gut', 780, 357 ],
  hypothalamus : [ 'hypothalamus', 336, 365 ]
});
const WIRES = Object.freeze([
  [ 'eye', 'tectum', 'crossed' ], [ 'nose', 'bulb' ], [ 'tectum', 'pallium' ],
  [ 'bulb', 'pallium' ], [ 'pallium', 'fin' ], [ 'pallium', 'tail' ], [ 'spinal', 'tail' ],
  [ 'lateral', 'hindbrain' ], [ 'hindbrain', 'fin' ], [ 'tectum', 'bite' ], [ 'bulb', 'suck' ],
  [ 'pallium', 'bite' ], [ 'pallium', 'suck' ], [ 'spinal', 'sperm' ], [ 'spinal', 'eggs' ]
]);
const GROWTH_CELLS = Object.freeze({eggs : 11, sperm : 3});
const SYSTEM_GLANDS = Object.freeze([ [ 'growth', 260, 351 ], [ 'reward', 470, 383 ] ]);

export function exampleDocument(names, sites, wheel) {
  let doc = newDocument(names.fish);
  const placed = {};
  for (const [key, [ type, x, y ]] of Object.entries(PLACES)) {
    const result = addOrgan(doc, type, sites, {x, y});
    if (result)
      doc = result.document;
    placed[key] = result?.organId;
  }
  for (const [key, count] of Object.entries(GROWTH_CELLS)) {
    const grown = placed[key] && setOrganNodes(doc, placed[key], count, sites);
    if (grown)
      doc = grown;
  }
  for (const [key, x, y] of SYSTEM_GLANDS)
    doc = placeSystem(doc, key, sites, wheel, {x, y}, names[key])?.document ?? doc;
  for (const [from, to, pairing] of WIRES) {
    const r = addWire(doc, placed[from], placed[to], pairing, sites);
    if (r)
      doc = r.document;
  }
  return doc;
}
