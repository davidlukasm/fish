import {addOrgan, addWire, newDocument} from './document.js';
import {placeSystem} from './systems.js';

const PLACES = Object.freeze({
  eye : [ 'eye', 360, 300 ],
  nose : [ 'nose', 245, 425 ],
  sight : [ 'tectum', 390, 321 ],
  smell : [ 'circuit', 300, 409 ],
  rhythm : [ 'rhythm', 470, 365 ],
  fin : [ 'muscle', 600, 470 ],
  tail : [ 'muscle', 890, 350 ],
  bite : [ 'muscle', 195, 335 ],
  suck : [ 'muscle', 330, 302 ],
  eggs : [ 'eggs', 848, 330 ],
  sperm : [ 'sperm', 760, 395 ],
  gut : [ 'gut', 780, 357 ],
  teacher : [ 'teaching', 336, 365 ]
});
const WIRES = Object.freeze([
  [ 'eye', 'sight', 'same' ], [ 'sight', 'fin', 'crossed' ], [ 'nose', 'smell', 'same' ],
  [ 'smell', 'suck', 'same' ], [ 'rhythm', 'tail', 'both' ], [ 'rhythm', 'bite', 'both' ],
  [ 'rhythm', 'sperm', 'both' ], [ 'rhythm', 'eggs', 'both' ], [ 'gut', 'teacher', 'both' ],
  [ 'teacher', 'sight', 'both' ], [ 'teacher', 'smell', 'both' ]
]);
export function exampleDocument(names, sites, wheel) {
  let doc = newDocument(names.fish);
  const placed = {};
  for (const [key, [ type, x, y ]] of Object.entries(PLACES)) {
    const result = addOrgan(doc, type, sites, {x, y});
    if (result)
      doc = result.document;
    placed[key] = result?.organId;
  }
  doc = placeSystem(doc, 'growth', sites, wheel, {x : 260, y : 351}, names.growth)?.document ?? doc;
  for (const [from, to, pairing] of WIRES) {
    const source =
        from === 'gut'
            ? doc.organs.find(o => o.id === placed.gut).centers.find(c => c.key === 'food').id
            : placed[from];
    const r = addWire(doc, source, placed[to], pairing, sites);
    if (r)
      doc = r.document;
  }
  return doc;
}
