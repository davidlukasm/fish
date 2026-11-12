import {degrees, radians, wrapAngle} from '../../units.js';
import {contactFieldOf, contactHalfAngle, LONGEST_TIME_CONSTANT} from '../../tuning.js';
import {groupReport} from '../model/document.js';
import {BODY_MIDDLE, findSite, sideSign} from '../model/layout.js';
import {fishPath, OUTLINE_STEP, skinAt, skinDirection, skinPoints} from './frame.js';
import {nodeLocation, organLocation} from './places.js';
import {escapeText, fixed} from './markup.js';
import {handleWord, senseSensitivity} from './sense_marks.js';
import {boundedRow, fadeRow, intensityRow, SENSE_PLOT, sensePicture} from './sense_curves.js';
import {percent, t} from '../../strings.js';
import {stimulusOfShare} from './sensitivity.js';

const SKIN_FIELD = Object.freeze({
  width : 334,
  height : 196,
  cx : 174,
  cy : 98,
  scale : .26,
  step : 6,
  hair : 16,
  // The hairs over the felt patch, as long as this in fish units where the patch is strongest.
  reach : 60,
  fork : .3,
  least : .05,
  handle : 7
});
// The lasting wound of the pain cells' time row, as many times their half answer.
const SKIN_HELD = 4;
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
          sensitive = senseSensitivity(state, center), pieces = weighed(state, aim, width, S.step);
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
// Where on the skin the cells feel: the patch they cover, with hairs over it, and the handle at its
// edge that widens or narrows it. Below, what they report (sense_curves.js): touch on a bounded
// curve of how hard a bump is; pain over how bad a wound is, and how they get used to a wound that
// stays. `held` is the sensitivity a dragged handle sets, shown before the design run answers.
export function skinField(state, organ, center, held = null) {
  const S = SKIN_FIELD, aim = skinAim(state, organ, center);
  const width = radians(contactHalfAngle(center.field));
  const pieces = weighed(state, aim, width, S.step);
  const patch =
      pieces.slice(1)
          .map((p, k) => p.weight > S.least ? '<path d="' + line(pieces[k], p) +
                                                  '" stroke-opacity="' + fixed(p.weight) + '"/>'
                                            : '')
          .join('');
  const hairs = weighed(state, aim, width, S.hair)
                    .filter(p => p.weight > S.least)
                    .map(p => {
                      const reach = S.reach * p.weight;
                      const end = {x : p.x + p.out.x * reach, y : p.y + p.out.y * reach};
                      if (organ.type === 'touch')
                        return line(p, end);
                      const fork = reach * S.fork;
                      const at = {x : end.x - p.out.x * fork, y : end.y - p.out.y * fork};
                      return line(p, at) + ' ' +
                             line(at, {x : end.x - p.out.y * fork, y : end.y + p.out.x * fork}) +
                             ' ' +
                             line(at, {x : end.x + p.out.y * fork, y : end.y - p.out.x * fork});
                    })
                    .join(' ');
  const edge = nearest(pieces, aim + Math.min(width, Math.PI), state);
  const at = toField(edge);
  return '<div data-skin-block="' + escapeText(center.id) + '"><svg class="aid-skin-field ' +
         organ.type + '" viewBox="0 0 ' + S.width + ' ' + S.height + '" data-skin-field="' +
         escapeText(center.id) + '" data-skin-aim="' + fixed(aim) + '" role="img" aria-label="' +
         escapeText(t('studio.skinSense.' + organ.type + '.where')) + '"><g transform="translate(' +
         fixed(S.cx - BODY_MIDDLE.x * S.scale) + ' ' + fixed(S.cy - BODY_MIDDLE.y * S.scale) +
         ') scale(' + S.scale + ')"><path class="aid-skin-fish" d="' + fishPath() +
         '"/><g class="aid-skin-patch">' + patch + '</g><path class="aid-skin-hairs" d="' + hairs +
         '"/></g>' +
         '<circle class="aid-graphic-handle" data-skin-handle="field" cx="' + fixed(at.x) +
         '" cy="' + fixed(at.y) + '" r="' + S.handle + '"><title>' +
         escapeText(t('studio.inspector.skin.fieldHandle')) + '</title></circle>' +
         handleWord(at, t('studio.inspector.skin.field', {degrees : Math.round(degrees(width))})) +
         '</svg>' + skinCurves(state, organ, center, held) + '</div>';
}
function skinCurves(state, organ, center, held) {
  const sensitive = held ?? senseSensitivity(state, center), dimmest = state.anatomy?.lightDimmest;
  if (sensitive === null)
    return '';
  const words = (key, values) => t('studio.skinSense.' + organ.type + '.' + key, values);
  const report = t('studio.skinSense.report');
  if (organ.type === 'touch')
    return sensePicture(center, words('title'), [ boundedRow(sensitive, {
                          report,
                          from : words('from'),
                          to : words('to'),
                          half : words('half', {p : percent(1 - sensitive)}),
                          handle : words('handle')
                        }) ],
                        'refreshSkin');
  if (!(dimmest > 0))
    return '';
  const half = stimulusOfShare(1 - sensitive, dimmest);
  return sensePicture(
      center, words('title'),
      [
        intensityRow(sensitive, dimmest, {
          report,
          from : words('from'),
          to : words('to'),
          half : words('half'),
          handle : words('handle')
        }),
        fadeRow(center, SKIN_HELD * half, half, {
          report,
          from : words('stays'),
          to : t('studio.skinSense.later', {n : SENSE_PLOT.window * LONGEST_TIME_CONSTANT}),
          half : n => words('fade', {n}),
          handle : words('fadeHandle')
        })
      ],
      'refreshSkin');
}
export function skinPatch(state, aim, handle, fx, fy) {
  if (handle !== 'field')
    return null;
  const angle = skinDirection(toFrame(fx, fy), state.anatomy?.zones);
  return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - aim))))};
}
