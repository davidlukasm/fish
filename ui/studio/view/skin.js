import {radians, wrapAngle} from '../../units.js';
import {activationLevel, contactHalfAngle, unitOfPlan} from '../../tuning.js';
import {groupReport} from '../model/document.js';
import {findSite, sideSign} from '../model/layout.js';
import {OUTLINE_STEP, skinAt, skinDirection, skinPoints} from './frame.js';
import {nodeLocation, organLocation} from './places.js';
import {fixed} from './markup.js';
import {stimulusShare} from './sensitivity.js';

// How readily the cells answer, 0 to 1: from the design run's answer, else from the threshold.
function senseSensitivity(state, center) {
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const dimmest = answer?.intensity ? state.anatomy?.lightDimmest : null;
  if (answer?.begins > 0 && (!answer.intensity || dimmest > 0))
    return 1 - stimulusShare(answer.begins, dimmest);
  return answer?.intensity ? null : 1 - activationLevel(unitOfPlan(center.threshold));
}
const CANVAS_SKIN = Object.freeze({length : [ 3, 22 ], hit : 13, step : 6, fork : .3, least : .05});
function skinAim(state, organ, center) {
  const felt = !state.stale && groupReport(state.document, state.anatomy, 'felt', center.id);
  if (felt?.length)
    return Math.atan2(felt.reduce((sum, [ aim ]) => sum + Math.sin(aim), 0),
                      felt.reduce((sum, [ aim ]) => sum + Math.cos(aim), 0));
  const site = findSite(state.sites, center.site), side = sideSign(site?.side);
  const {x} = nodeLocation(state.document, state.sites, center, organ.type);
  return skinDirection({x, y : skinAt(x, side)}, state.anatomy?.zones);
}
function weighed(state, aim, width, step, first) {
  return skinPoints(step, first)
      .map(point => ({
             ...point,
             weight : Math.max(
                 0,
                 1 - Math.abs(wrapAngle(skinDirection(point, state.anatomy?.zones) - aim)) / width)
           }));
}
const line = (a, b) => 'M' + fixed(a.x) + ' ' + fixed(a.y) + ' L' + fixed(b.x) + ' ' + fixed(b.y);
export function skinPatchSvg(state, organ) {
  const C = CANVAS_SKIN, anchor = organLocation(organ, state.sites, state.document);
  let patch = '', hairs = '';
  for (const center of organ.centers) {
    const aim = skinAim(state, organ, center), width = radians(contactHalfAngle(center.field)),
          sensitive = senseSensitivity(state, center), pieces = weighed(state, aim, width, C.step);
    patch +=
        pieces.slice(1)
            .map((p, k) => p.weight > C.least ? '<path d="' + line(pieces[k], p) +
                                                    '" stroke-opacity="' + fixed(p.weight) + '"/>'
                                              : '')
            .join('');
    if (sensitive === null)
      continue;
    hairs += weighed(state, aim, width, OUTLINE_STEP, OUTLINE_STEP)
                 .filter((p, k) => p.weight > C.least && k % 2 === (organ.type === 'pain' ? 1 : 0))
                 .map(p => {
                   const reach = (C.length[0] + C.length[1] * sensitive) * p.weight,
                         end = {x : p.x + p.out.x * reach, y : p.y + p.out.y * reach};
                   if (organ.type === 'touch')
                     return line(p, end);
                   const fork = reach * C.fork,
                         at = {x : end.x - p.out.x * fork, y : end.y - p.out.y * fork};
                   return line(p, at) + ' ' +
                          line(at, {x : end.x - p.out.y * fork, y : end.y + p.out.x * fork}) + ' ' +
                          line(at, {x : end.x + p.out.y * fork, y : end.y - p.out.x * fork});
                 })
                 .join(' ');
  }
  return '<g class="aid-anatomical-' + organ.type + '">' + patch + '<path d="' + hairs + '"/>' +
         '<circle class="aid-skin-hit" stroke="none" cx="' + fixed(anchor.x) + '" cy="' +
         fixed(anchor.y) + '" r="' + C.hit + '"/></g>';
}
