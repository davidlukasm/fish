import {
  findCenter,
  findOrgan,
  gutLength,
  muscleTrait,
  muscleFibre,
  gillRakers,
  finAngle,
  setGutLength,
  setGillRakers,
  setFinAngle,
  setMuscleTrait,
  setMuscleFibre,
  updateCenter
} from '../model/document.js';
import {organFunction} from '../model/organs.js';
import {MOTOR_KIND, BODY_UNIT, ATELIER_LIMITS} from '../../schema.js';
import {BODY_FRAME, sideOf} from '../model/layout.js';
import {organLocation, gutShape} from './places.js';
import {gutTurns} from '../../fish_organs.js';
import {mouthShare} from '../../fish_forms.js';
import {muscleShape} from './muscles.js';
import {feltEnd, spineHandles} from './body.js';
import {steadyAt, zoomOf, SNOUT_TIP, HEAD} from './frame.js';
import {fixed, escapeText} from './markup.js';
import {label} from './kit.js';
import {clamp} from '../../units.js';

// A grip on the fish, in screen units: big enough to find and catch at any zoom.
const GRIP = Object.freeze({hit : 16, ring : 8, arrow : 1.5});
const SKIN_SENSES = Object.freeze([ 'touch', 'pain', 'lateral' ]);
// How far the grip is dragged along the fish from the narrowest field to the widest.
const FIELD_SPAN = 320;
export function anatomyHandles(state, id = state.selected?.id) {
  const organ = findOrgan(state.document, id) ?? findCenter(state.document, id)?.organ;
  if (!organ)
    return [];
  const at = organLocation(organ, state.sites, state.document), specs = [];
  const add = (key, point, value, axis, span) =>
      specs.push({id : organ.id, key, point, value, axis, span});
  if (organ.type === 'gut') {
    const length = gutLength(state.document) ?? BODY_UNIT.trait_middle;
    add('gut', gutShape(gutTurns(length), state.document).along(.72), length, 'y', -90);
  }
  if (organ.type === 'gills')
    add('gills', at, gillRakers(organ), 'y', 65);
  // A skin sense's field is as wide as the stretch of skin the fish shows for it; the grip sits
  // at that stretch's end.
  if (SKIN_SENSES.includes(organ.type)) {
    const end = feltEnd(state, organ);
    if (end)
      add('field', end, organ.centers[0]?.field ?? 0, 'x', FIELD_SPAN);
  }
  if (organ.type === 'defense') {
    const grips = spineHandles(state, organ), cell = organ.centers[0];
    if (grips) {
      add('spine-field', grips.field, cell.field, 'x', FIELD_SPAN);
      add('spine-strength', grips.strength, cell.copies / ATELIER_LIMITS.max_copies, 'y',
          sideOf(organ) * 80);
    }
  }
  if (organ.type !== 'muscle')
    return specs;
  const code = organFunction(organ, state.sites), shape = muscleShape(organ, state.sites),
        side = sideOf(organ);
  if (shape) {
    const p = {x : (shape.from.x + shape.to.x) / 2, y : (shape.from.y + shape.to.y) / 2};
    add('fibre', p, muscleFibre(organ), 'y', side * 60);
    add('strength', shape.to, (organ.centers[0]?.copies ?? 1) / ATELIER_LIMITS.max_copies, 'y',
        side * 80);
  }
  if (code === MOTOR_KIND.aggression) {
    const jaw = muscleTrait(state.document, code, 'jaw_length', state.sites);
    const rim = HEAD.mouth[1] * mouthShare(jaw) / mouthShare(BODY_UNIT.trait_middle);
    add('jaw_length',
        {x : SNOUT_TIP.x + HEAD.jaw_back, y : BODY_FRAME.middle + side * HEAD.jaw_spread},
        jaw, 'x', 90);
    add('blunt_teeth', {x : SNOUT_TIP.x + 8, y : SNOUT_TIP.y + side * (rim + GRIP.hit / zoomOf(state))},
        muscleTrait(state.document, code, 'blunt_teeth', state.sites), 'y', side * 40);
  }
  if (code === MOTOR_KIND.forward && shape)
    add('undulation', shape.from, muscleTrait(state.document, code, 'undulation', state.sites), 'y',
        side * 80);
  if (code === MOTOR_KIND.turn && shape)
    add('angle', {x : at.x + 20, y : at.y + side * 25}, finAngle(organ), 'x', 90);
  return specs;
}
export function anatomyPatch(state, spec, delta) {
  const value = clamp(spec.value + delta / spec.span), doc = state.document,
        organ = findOrgan(doc, spec.id);
  if (!organ)
    return null;
  if (spec.key === 'gut')
    return setGutLength(doc, value);
  if (spec.key === 'gills')
    return setGillRakers(doc, organ.id, value);
  if (spec.key === 'field' || spec.key === 'spine-field')
    return updateCenter(doc, organ.centers[0].id, {field : value});
  if (spec.key === 'angle')
    return setFinAngle(doc, organ.id, value, state.sites);
  if (spec.key === 'fibre')
    return setMuscleFibre(doc, organ.id, value);
  if (spec.key === 'strength' || spec.key === 'spine-strength')
    return updateCenter(doc, organ.centers[0].id,
                        {copies : Math.max(1, Math.round(value * ATELIER_LIMITS.max_copies))});
  return setMuscleTrait(doc, organFunction(organ, state.sites), spec.key, value, state.sites);
}
export function anatomyHandlesSvg(state) {
  if (state.tool !== 'select')
    return '';
  const zoom = zoomOf(state);
  return '<g class="aid-anatomy-handles">' +
         anatomyHandles(state)
             .map(s => '<g data-anatomy-handle="' + s.key + '" data-anatomy-organ="' +
                       escapeText(s.id) + '"' + steadyAt(s.point, zoom) + '>' +
                       '<title>' + escapeText(label('direct.' + s.key)) +
                       '</title><circle class="hit" r="' + GRIP.hit + '"/><circle r="' + GRIP.ring +
                       '"/><path transform="scale(' + GRIP.arrow + ')" d="' +
                       (s.axis === 'x' ? 'M-9 0h18m-3-3 3 3-3 3M-6-3-3 0-6 3'
                                       : 'M0-9v18m-3-3 3 3 3-3M-3-6 3-3 3-6') +
                       '"/></g>')
             .join('') +
         '</g>';
}
