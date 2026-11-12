import {BLOOD_SUBSTANCE} from '../../schema.js';
import {addOrgan, addWire, findOrgan, newDocument, updateCenter, wheelPlace} from './document.js';
import {placeSystem} from './systems.js';

const PLACES = Object.freeze({
  eye : [ 'eye', 360, 300 ],
  nose : [ 'nose', 245, 425 ],
  sight : [ 'tectum', 390, 321 ],
  smell : [ 'olfaction', 300, 409 ],
  choice : [ 'choice', 480, 310 ],
  value : [ 'value', 370, 310 ],
  state : [ 'state', 570, 365 ],
  motor : [ 'motor', 680, 310 ],
  spine : [ 'spine', 780, 300 ],
  fin : [ 'muscle', 600, 470 ],
  tail : [ 'muscle', 890, 350 ],
  bite : [ 'muscle', 195, 335 ],
  suck : [ 'muscle', 330, 302 ],
  eggs : [ 'eggs', 848, 330 ],
  sperm : [ 'sperm', 760, 395 ],
  gut : [ 'gut', 780, 357 ],
  reserve : [ 'blood', 530, 365 ],
  pain : [ 'pain', 450, 225 ],
  barbels : [ 'barbels', 245, 320 ]
});
const WIRES = Object.freeze([
  [ 'eye', 'sight', null, 'sight' ],
  [ 'nose', 'smell', null, 'scent' ],
  [ 'sight', 'choice', 'onward', 'target', 'crossed' ],
  [ 'smell', 'choice', 'target', 'target' ],
  [ 'sight', 'value', 'onward', 'feature1', 'crossed' ],
  [ 'smell', 'value', 'presence', 'feature2' ],
  [ 'value', 'choice', 'feature1', 'strength' ],
  [ 'value', 'choice', 'feature2', 'strength' ],
  [ 'gut', 'value', 'intake', 'reward', 'both' ],
  [ 'pain', 'value', null, 'harm', 'both' ],
  [ 'pain', 'choice', null, 'threat', 'both' ],
  [ 'gut', 'state', 'intake', 'intake' ],
  [ 'gut', 'state', 'fullness', 'fullness' ],
  [ 'reserve', 'state', null, 'reserve' ],
  [ 'eggs', 'state', 'fullness', 'eggFullness' ],
  [ 'sperm', 'state', 'fullness', 'spermFullness' ],
  [ 'state', 'eggs', 'investment', 'storage' ],
  [ 'state', 'eggs', 'lay', 'trigger' ],
  [ 'state', 'sperm', 'investment', 'storage' ],
  [ 'state', 'sperm', 'spermRelease', 'trigger' ],
  [ 'state', 'sperm', 'hatch', 'storage' ],
  [ 'state', 'sperm', 'hatch', 'trigger' ],
  [ 'state', 'motor', 'hatch', 'urge', 'both' ],
  [ 'gut', 'choice', 'intake', 'pause', 'both' ],
  [ 'state', 'motor', 'pause', 'brake', 'both' ],
  [ 'state', 'motor', 'satiety', 'full', 'both' ],
  [ 'choice', 'motor', 'approach', 'toward' ],
  [ 'choice', 'motor', 'advance', 'urge' ],
  [ 'choice', 'motor', 'avoid', 'away' ],
  [ 'choice', 'motor', 'search', 'urge' ],
  [ 'barbels', 'motor', null, 'near' ],
  [ 'barbels', 'motor', null, 'grip' ],
  [ 'motor', 'fin', 'fins', null, 'crossed' ],
  [ 'motor', 'spine', 'tail', 'urge' ],
  [ 'motor', 'spine', 'fins', 'steer' ],
  [ 'motor', 'spine', 'escape', 'escape' ],
  [ 'spine', 'tail', 'stroke' ],
  [ 'motor', 'suck', 'mouth' ],
  [ 'motor', 'bite', 'bite' ]
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
  const [q1, q2] = wheelPlace(wheel, BLOOD_SUBSTANCE.reserve);
  for (const center of findOrgan(doc, placed.reserve).centers)
    doc = updateCenter(doc, center.id, {q1, q2, qwidth : 0, threshold : 0});
  for (const [from, to, fromPort, toPort, pairing = 'same'] of WIRES) {
    const r = addWire(doc, placed[from], placed[to], pairing, sites, {fromPort, toPort});
    if (r)
      doc = r.document;
  }
  doc = placeSystem(doc, 'growth', sites, wheel, {x : 260, y : 351}, names.growth)?.document ?? doc;
  return doc;
}
