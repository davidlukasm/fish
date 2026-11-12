import {addOrgan, copy, findOrgan, newDocument, positionOrgan} from './model/document.js';
import {anatomicalPosition, musclePosition, nativeMusclePosition} from './model/anatomy.js';
import {BODY_FRAME} from './model/layout.js';
import {isRegion, organFunction, isPelvicMuscle} from './model/organs.js';
import {regionAnchors} from './view/region_layout.js';
import {organLocation} from './view/places.js';
import {MOTOR_KIND} from '../schema.js';

function keepPositions(doc, sites) {
  const draft = copy(doc), anchors = regionAnchors(doc, sites);
  for (const organ of draft.organs.filter(isRegion)) {
    const G = anchors.get(organ.id);
    if (G && !organ.position)
      organ.position = {x : G.x, y : G.y};
  }
  return draft;
}
export function placeCanvasOrgan(state, type, position, mode = state.placementSide ?? 'both') {
  const muscle = type === 'muscle' ? musclePosition(state.sites, position) : null;
  const p = muscle?.position ?? anatomicalPosition(type, position, mode),
        doc = keepPositions(state.document, state.sites);
  const native =
      muscle ? nativeMusclePosition(state.sites, p, muscle.area.code, muscle.area.pelvic) : p;
  const result = addOrgan(doc, type, state.sites, native, Infinity, mode === 'both',
                          muscle?.area.code ?? null, muscle?.area.pelvic ?? false);
  if (!result)
    return null;
  const organ = findOrgan(result.document, result.organId);
  if (findOrgan(doc, organ.id)) {
    const document = moveCanvasOrgan({...state, document : doc}, organ.id, p, null);
    return document ? {...result, document} : null;
  }
  organ.position = p;
  if (mode === 'middle' && isRegion(organ))
    organ.side = 0;
  const twin = findOrgan(result.document, organ.pair);
  if (twin)
    twin.position = {x : p.x, y : 2 * BODY_FRAME.middle - p.y};
  return result;
}
export function moveCanvasOrgan(state, id, pointer, origin) {
  const organ = findOrgan(state.document, id);
  if (!organ)
    return null;
  const at = organLocation(organ, state.sites, state.document);
  let target =
      origin ? {x : at.x + pointer.x - origin.x, y : at.y + pointer.y - origin.y} : pointer;
  if (organ.type === 'muscle')
    target = musclePosition(state.sites, target, organFunction(organ, state.sites),
                            isPelvicMuscle(organ))
                 ?.position ??
             target;
  return positionOrgan(keepPositions(state.document, state.sites), id, state.sites, target,
                       state.anatomy, at);
}
export function newFishDocument(name, sites) {
  let document = newDocument(name);
  if (!sites.length)
    return document;
  for (const [type, x, y] of [[ 'gut', 565, 474 ], [ 'eggs', 722, 272 ]]) {
    const placed = placeCanvasOrgan({document, sites}, type, {x, y}, 'single');
    if (placed)
      document = placed.document;
  }
  const tail =
      addOrgan(document, 'muscle', sites, {x : 865, y : 340}, Infinity, true, MOTOR_KIND.forward);
  return tail?.document ?? document;
}
