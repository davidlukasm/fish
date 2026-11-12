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
import {fishPath, OUTLINE_STEP, skinAt, skinDirection, skinPoints} from './frame.js';
import {nodeLocation, organLocation} from './places.js';
import {escapeText, fixed} from './markup.js';
import {adaptationMarks, cellMarks} from './sense_marks.js';
import {ATELIER_LIMITS} from '../../schema.js';
import {percent, t} from '../../strings.js';
import {stimulusOfShare, stimulusShare} from './sensitivity.js';

const SKIN_FIELD = Object.freeze({
  width : 334,
  height : 196,
  cx : 174,
  cy : 98,
  scale : .26,
  step : 6,
  hair : 16,
  length : [ 10, 180 ],
  fork : .3,
  least : .05,
  handle : 7,
  dot : 6,
  // Cells in a row along the skin, a little inside it, in fish units; the adaptation arc round
  // the felt spot, in the picture's units.
  cellStep : 12,
  inset : 14,
  clock : 26
});
const CANVAS_SKIN = Object.freeze({length : [ 3, 22 ], hit : 13});
const toFrame = (fx, fy) => ({
  x : BODY_MIDDLE.x + (fx * SKIN_FIELD.width - SKIN_FIELD.cx) / SKIN_FIELD.scale,
  y : BODY_MIDDLE.y + (fy * SKIN_FIELD.height - SKIN_FIELD.cy) / SKIN_FIELD.scale
});
const toField = p => ({
  x : SKIN_FIELD.cx + (p.x - BODY_MIDDLE.x) * SKIN_FIELD.scale,
  y : SKIN_FIELD.cy + (p.y - BODY_MIDDLE.y) * SKIN_FIELD.scale
});
function skinAim(state, organ, center) {
  const felt = !state.stale && groupReport(state.document, state.anatomy, 'felt', center.id);
  if (felt?.length)
    return Math.atan2(felt.reduce((sum, [ aim ]) => sum + Math.sin(aim), 0),
                      felt.reduce((sum, [ aim ]) => sum + Math.cos(aim), 0));
  const site = findSite(state.sites, center.site), side = sideSign(site?.side);
  const {x} = nodeLocation(state.document, state.sites, center, organ.type);
  return skinDirection({x, y : skinAt(x, side)}, state.anatomy?.zones);
}
function sensitivityOf(state, center) {
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const dimmest = answer?.intensity ? state.anatomy?.lightDimmest : null;
  if (answer?.half > 0 && (!answer.intensity || dimmest > 0))
    return 1 - stimulusShare(answer.half, dimmest);
  return answer?.intensity ? null : 1 - activationLevel(unitOfPlan(center.threshold));
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
const nearest = (points, aim, state) => points.reduce(
    (best, p) => Math.abs(wrapAngle(skinDirection(p, state.anatomy?.zones) - aim)) <
                         Math.abs(wrapAngle(skinDirection(best, state.anatomy?.zones) - aim))
                     ? p
                     : best);
const line = (a, b) => 'M' + fixed(a.x) + ' ' + fixed(a.y) + ' L' + fixed(b.x) + ' ' + fixed(b.y);
export function skinPatchSvg(state, organ) {
  const C = CANVAS_SKIN, S = SKIN_FIELD, anchor = organLocation(organ, state.sites, state.document);
  let patch = '', hairs = '';
  for (const center of organ.centers) {
    const aim = skinAim(state, organ, center), width = radians(contactHalfAngle(center.field)),
          sensitive = sensitivityOf(state, center), pieces = weighed(state, aim, width, S.step);
    patch +=
        pieces.slice(1)
            .map((p, k) => p.weight > S.least ? '<path d="' + line(pieces[k], p) +
                                                    '" stroke-opacity="' + fixed(p.weight) + '"/>'
                                              : '')
            .join('');
    if (sensitive === null)
      continue;
    hairs += weighed(state, aim, width, OUTLINE_STEP, OUTLINE_STEP)
                 .filter((p, k) => p.weight > S.least && k % 2 === (organ.type === 'pain' ? 1 : 0))
                 .map(p => {
                   const reach = (C.length[0] + C.length[1] * sensitive) * p.weight,
                         end = {x : p.x + p.out.x * reach, y : p.y + p.out.y * reach};
                   if (organ.type === 'touch')
                     return line(p, end);
                   const fork = reach * S.fork,
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
// `held` is the sensitivity a dragged handle sets, shown before the design run answers.
export function skinField(state, organ, center, held = null) {
  const S = SKIN_FIELD, aim = skinAim(state, organ, center);
  const width = radians(contactHalfAngle(center.field)),
        sensitive = held ?? sensitivityOf(state, center);
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
  const facts = t('studio.inspector.skin.field', {degrees : Math.round(degrees(width))}) +
                (sensitive === null ? ''
                                    : ' · ' + t('studio.inspector.skin.' + organ.type,
                                                {share : percent(sensitive)}));
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  return '<div data-skin-block="' + escapeText(center.id) + '"><svg class="aid-skin-field ' +
         organ.type + '" viewBox="0 0 ' + S.width + ' ' + S.height + '" data-skin-field="' +
         escapeText(center.id) + '" data-skin-aim="' + fixed(aim) + '" data-sense-field="' +
         escapeText(center.id) + '" data-sense-redraw="refreshSkin" role="img"><title>' +
         escapeText(facts) + '</title><g transform="translate(' +
         fixed(S.cx - BODY_MIDDLE.x * S.scale) + ' ' + fixed(S.cy - BODY_MIDDLE.y * S.scale) +
         ') scale(' + S.scale + ')"><path class="aid-skin-fish" d="' + fishPath() +
         '"/><g class="aid-skin-patch">' + patch + '</g><path class="aid-skin-hairs" d="' + hairs +
         '"/></g>' +
         (answer?.adapt?.steps > 0
              ? adaptationMarks(cell, S.clock, Math.atan2(-middle.out.y, -middle.out.x), center)
              : '') +
         cellMarks(cellRow(middle), center) +
         handle(edge, 'field', t('studio.inspector.skin.fieldHandle')) +
         (sensitive === null ? ''
                             : handle(tip(middle, 1), 'sensitivity',
                                      t('studio.inspector.skin.' + organ.type + 'Handle'))) +
         '</svg></div>';
}
// The cells sit in a row along the skin from the point they feel, just inside the outline.
function cellRow(middle) {
  const S = SKIN_FIELD, points = skinPoints(S.cellStep);
  const at = points.reduce(
      (best, p, k) => Math.hypot(p.x - middle.x, p.y - middle.y) <
                              Math.hypot(points[best].x - middle.x, points[best].y - middle.y)
                          ? k
                          : best,
      0);
  return Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const p = points[(at + k) % points.length];
    return toField({x : p.x - p.out.x * S.inset, y : p.y - p.out.y * S.inset});
  });
}
export function skinSensitivity(state, aim, fx, fy) {
  const S = SKIN_FIELD, p = toFrame(fx, fy), middle = nearest(skinPoints(S.step), aim, state);
  const out = (p.x - middle.x) * middle.out.x + (p.y - middle.y) * middle.out.y;
  return clamp((out - S.length[0]) / S.length[1]);
}
export function skinPatch(state, center, aim, handle, fx, fy, start) {
  if (handle === 'field') {
    const angle = skinDirection(toFrame(fx, fy), state.anatomy?.zones);
    return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - aim))))};
  }
  const sensitive = skinSensitivity(state, aim, fx, fy);
  if (!start?.intensity) {
    // The shown sensitivity comes from the design run's answer, so the drag moves the threshold by
    // as much as the knob moves from it instead of setting the threshold the knob would read alone.
    const from = start?.half > 0 ? 1 - stimulusShare(start.half, null) : null;
    return {
      threshold : planOfUnit(from === null
                                 ? activationQuality(1 - sensitive)
                                 : unitOfPlan(start.threshold) + activationQuality(1 - sensitive) -
                                       activationQuality(1 - from))
    };
  }
  const dimmest = state.anatomy?.lightDimmest;
  if (!(dimmest > 0) || !(start.half > 0))
    return null;
  const shift = stimulusOfShare(1 - sensitive, dimmest) / start.half;
  return {threshold : planOfUnit(unitOfPlan(start.threshold) + thresholdQualityShift(shift))};
}
