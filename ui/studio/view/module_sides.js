import {assemblyCenters, findCenter, findOrgan} from '../model/document.js';
import {BODY_FRAME, sideOf} from '../model/layout.js';
import {oneSided} from '../model/assemblies.js';
import {fishOutline} from './body.js';
import {FISH_BOX} from './frame.js';
import {eyeLocation, nodeLocation, organLocation} from './places.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

// Where a module sits in the fish, seen from above: its parts as dots in the body. A module on one
// side only shows its missing mirror image as dashed dots; clicking them adds the other side.
const SIDES = Object.freeze({dot : 16, apart : 4, midline : 2, half : 140});
const partPoint = (doc, sites, organ) => organ.type === 'eye'
                                             ? eyeLocation(doc, sites, sideOf(organ))
                                             : organLocation(organ, sites, doc);
function modulePoints(doc, sites, assembly) {
  const points = [];
  const add = p => {
    if (p && !points.some(q => Math.hypot(q.x - p.x, q.y - p.y) < SIDES.apart))
      points.push(p);
  };
  for (const id of assemblyCenters(doc, assembly)) {
    const found = findCenter(doc, id);
    if (!found)
      continue;
    if (found.organ.type === 'brain') {
      add(nodeLocation(doc, sites, found.center, 'brain'));
      continue;
    }
    add(partPoint(doc, sites, found.organ));
    const pair = found.organ.pair && findOrgan(doc, found.organ.pair);
    if (pair)
      add(partPoint(doc, sites, pair));
  }
  return points;
}
export function moduleSides(state, assembly) {
  const doc = state.document, points = modulePoints(doc, state.sites, assembly);
  const single = oneSided(doc, state.sites, assembly);
  const dot = p =>
      '<circle cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' + SIDES.dot + '"/>';
  const mirrored =
      single ? points.filter(p => Math.abs(p.y - BODY_FRAME.middle) > SIDES.midline)
                   .map(p => ({x : p.x, y : 2 * BODY_FRAME.middle - p.y}))
                   .filter(p => !points.some(q => Math.hypot(q.x - p.x, q.y - p.y) < SIDES.apart))
             : [];
  return '<svg class="aid-module-sides" viewBox="' + FISH_BOX.x + ' ' +
         (BODY_FRAME.middle - SIDES.half) + ' ' + FISH_BOX.width + ' ' + 2 * SIDES.half +
         '" role="img" aria-label="' +
         escapeText(label(single ? 'inspector.oneSided' : 'inspector.bothSides')) + '"><title>' +
         escapeText(label(single ? 'inspector.oneSided' : 'inspector.bothSides')) +
         '</title><path class="aid-module-body" d="' + fishOutline(state) + '"/>' +
         '<g class="aid-module-part">' + points.map(dot).join('') + '</g>' +
         (mirrored.length
              ? '<g class="aid-module-mirror" data-mirror-assembly="' + escapeText(assembly.id) +
                    '"><title>' + escapeText(label('inspector.mirror')) + '</title>' +
                    mirrored.map(dot).join('') + '</g>'
              : '') +
         '</svg>';
}
