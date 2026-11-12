import {addOrgan, copy, findOrgan, newDocument, positionOrgan} from './model/document.js';
import {
  anatomicalPosition,
  musclePosition,
  nativeMusclePosition,
  placementArea
} from './model/anatomy.js';
import {BODY_FRAME, halfWidth} from './model/layout.js';
import {isRegion, organFunction, isPelvicMuscle} from './model/organs.js';
import {regionAnchors} from './view/region_layout.js';
import {organLocation} from './view/places.js';
import {MOTOR_KIND} from '../schema.js';

const SKIN_SENSES = new Set([ 'touch', 'pain', 'lateral' ]), SKIN_GAP = 26;
function freeSkinPosition(state, type, position, both, excluded = []) {
  if (!SKIN_SENSES.has(type))
    return position;
  const M = BODY_FRAME.middle, side = Math.sign(position.y - M), area = placementArea(type);
  const occupied =
      state.document.organs.filter(o => SKIN_SENSES.has(o.type) && !excluded.includes(o.id))
          .map(o => organLocation(o, state.sites, state.document))
          .filter(p => both || Math.sign(p.y - M) === side)
          .map(p => p.x);
  const candidates = [ position.x, ...occupied.flatMap(x => [x - SKIN_GAP, x + SKIN_GAP]) ];
  const x = candidates
                .filter(x => x >= area.from && x <= area.to &&
                             occupied.every(other => Math.abs(x - other) >= SKIN_GAP - 1e-6))
                .sort((a, b) => Math.abs(a - position.x) - Math.abs(b - position.x))[0];
  return x === undefined ? null
                         : {x, y : M + (position.y - M) * halfWidth(x) / halfWidth(position.x)};
}

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
  const p = freeSkinPosition(state, type,
                             muscle?.position ?? anatomicalPosition(type, position, mode),
                             mode === 'both'),
        doc = keepPositions(state.document, state.sites);
  if (!p)
    return null;
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
  target = freeSkinPosition(state, organ.type, anatomicalPosition(organ.type, target),
                            organ.linked && !!organ.pair, [ organ.id, organ.linked && organ.pair ]);
  if (!target)
    return null;
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
