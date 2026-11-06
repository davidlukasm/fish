import {clamp, degrees, radians, wrapAngle} from '../../units.js';
import {
  activationLevel,
  activationQuality,
  contactFieldOf,
  contactHalfAngle,
  planOfUnit,
  thresholdQualityShift,
  unitOfPlan
} from '../../tuning.js';
import {groupReport} from '../model/document.js';
import {BODY_MIDDLE, findSite, sideSign} from '../model/layout.js';
import {fishPath, skinAt, skinDirection, skinPoints} from './frame.js';
import {centerLocation} from './places.js';
import {escapeText, fixed} from './markup.js';
import {percent, t} from '../../strings.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';

// A touch or pain cell's skin, on the fish from above at SCALE of the frame with its middle at
// (CX, CY): the skin it feels on (its field, the brighter the more the engine's kernel weighs a
// direction, in pieces STEP long), and on that skin a hair every HAIR (touch) or a nerve ending
// (pain), as long as the cell is sensitive: from LENGTH[0] to LENGTH[0] + LENGTH[1] frame units
// at its middle, shorter towards the field's edges; a nerve ending forks FORK of its length from
// its tip. Two handles: the field's edge (how far round the body it feels) and the middle hair's
// tip (how sensitive); the cell itself as a dot DOT wide.
const SKIN_FIELD = Object.freeze({
  width : 300,
  height : 140,
  cx : 140,
  cy : 70,
  scale : .26,
  step : 6,
  hair : 16,
  length : [ 10, 70 ],
  fork : .3,
  least : .05,
  handle : 7,
  dot : 6
});
const toFrame = (fx, fy) => ({
  x : BODY_MIDDLE.x + (fx * SKIN_FIELD.width - SKIN_FIELD.cx) / SKIN_FIELD.scale,
  y : BODY_MIDDLE.y + (fy * SKIN_FIELD.height - SKIN_FIELD.cy) / SKIN_FIELD.scale
});
const toField = p => ({
  x : SKIN_FIELD.cx + (p.x - BODY_MIDDLE.x) * SKIN_FIELD.scale,
  y : SKIN_FIELD.cy + (p.y - BODY_MIDDLE.y) * SKIN_FIELD.scale
});
// Which way round the body the cell faces: as the engine's cells do once it has answered, else
// from where its node lies on the skin.
function skinAim(state, organ, center) {
  const felt = groupReport(state.document, state.anatomy, 'felt', center.id);
  if (felt?.length)
    return Math.atan2(felt.reduce((sum, [ aim ]) => sum + Math.sin(aim), 0),
                      felt.reduce((sum, [ aim ]) => sum + Math.cos(aim), 0));
  const site = findSite(state.sites, center.site), side = sideSign(site?.side);
  const {x} = centerLocation(center, organ.type, state.sites);
  return skinDirection({x, y : skinAt(x, side)}, state.anatomy?.zones);
}
// How sensitive the cell is, from 0 to 1: the stimulus of half its answer, along the engine's
// axis for it (a log one for injury), turned round; a touch cell's from its threshold alone.
function sensitivityOf(state, center) {
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const dimmest = answer?.intensity ? state.anatomy?.lightDimmest : null;
  if (answer?.half > 0 && (!answer.intensity || dimmest > 0))
    return 1 - stimulusShare(answer.half, dimmest);
  return answer?.intensity ? null : 1 - activationLevel(unitOfPlan(center.threshold));
}
// The skin's points with how much the cell feels there.
function weighed(state, aim, width, step) {
  return skinPoints(step).map(
      point => ({
        ...point,
        weight : Math.max(
            0, 1 - Math.abs(wrapAngle(skinDirection(point, state.anatomy?.zones) - aim)) / width)
      }));
}
const nearest = (points, aim, state) => points.reduce(
    (best, p) => Math.abs(wrapAngle(skinDirection(p, state.anatomy?.zones) - aim)) <
                         Math.abs(wrapAngle(skinDirection(best, state.anatomy?.zones) - aim))
                     ? p
                     : best);
const line = (a, b) => 'M' + fixed(a.x) + ' ' + fixed(a.y) + ' L' + fixed(b.x) + ' ' + fixed(b.y);
export function skinField(state, organ, center) {
  const S = SKIN_FIELD, aim = skinAim(state, organ, center);
  const width = radians(contactHalfAngle(center.field)), sensitive = sensitivityOf(state, center);
  const pieces = weighed(state, aim, width, S.step);
  const patch =
      pieces.slice(1)
          .map((p, k) => p.weight > S.least ? '<path d="' + line(pieces[k], p) +
                                                  '" stroke-opacity="' + fixed(p.weight) + '"/>'
                                            : '')
          .join('');
  const reach = weight => (S.length[0] + S.length[1] * (sensitive ?? 0)) * weight;
  const tip = (p, weight) =>
      ({x : p.x + p.out.x * reach(weight), y : p.y + p.out.y * reach(weight)});
  const hairs =
      sensitive === null
          ? ''
          : weighed(state, aim, width, S.hair)
                .filter(p => p.weight > S.least)
                .map(p => {
                  const end = tip(p, p.weight);
                  if (organ.type === 'touch')
                    return line(p, end);
                  const fork = reach(p.weight) * S.fork;
                  const at = {x : end.x - p.out.x * fork, y : end.y - p.out.y * fork};
                  return line(p, at) + ' ' +
                         line(at, {x : end.x - p.out.y * fork, y : end.y + p.out.x * fork}) + ' ' +
                         line(at, {x : end.x + p.out.y * fork, y : end.y - p.out.x * fork});
                })
                .join(' ');
  const middle = nearest(pieces, aim, state);
  const edge = nearest(pieces, aim + Math.min(width, Math.PI), state);
  const handle = (p, name, title) => {
    const at = toField(p);
    return '<circle class="aid-graphic-handle" data-skin-handle="' + name + '" cx="' + fixed(at.x) +
           '" cy="' + fixed(at.y) + '" r="' + S.handle + '"><title>' + escapeText(title) +
           '</title></circle>';
  };
  const cell = toField(middle);
  return '<svg class="aid-skin-field ' + organ.type + '" viewBox="0 0 ' + S.width + ' ' + S.height +
         '" data-skin-field="' + escapeText(center.id) + '" data-skin-aim="' + fixed(aim) +
         '" role="img"><g transform="translate(' + fixed(S.cx - BODY_MIDDLE.x * S.scale) + ' ' +
         fixed(S.cy - BODY_MIDDLE.y * S.scale) + ') scale(' + S.scale +
         ')"><path class="aid-skin-fish" d="' + fishPath() + '"/><g class="aid-skin-patch">' +
         patch + '</g><path class="aid-skin-hairs" d="' + hairs +
         '"/></g><circle class="aid-skin-cell" cx="' + fixed(cell.x) + '" cy="' + fixed(cell.y) +
         '" r="' + S.dot / 2 + '"/>' +
         handle(edge, 'field', t('studio.inspector.skin.fieldHandle')) +
         (sensitive === null ? ''
                             : handle(tip(middle, 1), 'sensitivity',
                                      t('studio.inspector.skin.' + organ.type + 'Handle'))) +
         '</svg><p class="aid-skin-facts">' +
         escapeText(t('studio.inspector.skin.field', {degrees : Math.round(degrees(width))})) +
         (sensitive === null ? ''
                             : ' · ' + escapeText(t('studio.inspector.skin.' + organ.type,
                                                    {share : percent(sensitive)}))) +
         '</p>';
}
// A handle on the skin graphic at (fx, fy), fractions of it: the field reaches round to the
// pointer's direction; the middle hair reaches out to it, the cell as sensitive as long it is.
export function skinPatch(state, center, aim, handle, fx, fy, start) {
  const S = SKIN_FIELD, p = toFrame(fx, fy);
  if (handle === 'field') {
    const angle = skinDirection(p, state.anatomy?.zones);
    return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - aim))))};
  }
  const middle = nearest(skinPoints(S.step), aim, state);
  const out = (p.x - middle.x) * middle.out.x + (p.y - middle.y) * middle.out.y;
  const sensitive = clamp((out - S.length[0]) / S.length[1]);
  if (!start?.intensity)
    return {threshold : planOfUnit(activationQuality(1 - sensitive))};
  const dimmest = state.anatomy?.lightDimmest;
  if (!(dimmest > 0) || !(start.half > 0))
    return null;
  const shift = stimulusOfShare(1 - sensitive, dimmest) / start.half;
  return {threshold : planOfUnit(unitOfPlan(start.threshold) + thresholdQualityShift(shift))};
}
