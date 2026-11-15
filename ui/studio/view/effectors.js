import {musclePatch, musclePictures} from './muscle_effect.js';
import {commandPatch} from './command_line.js';
import {kindLimit, organFunction} from '../model/organs.js';
import {sideOf} from '../model/layout.js';
import {escapeText} from './markup.js';

// What the muscle's settings do follows in pictures of their own below what it moves.
const musclePicture = (state, organ, code, side) =>
    musclePictures(state, organ, code, side, kindLimit(organ, state.sites), gateField(organ));
// The gate is set like a sense's sensitivity, by the working cells it belongs to.
const gateField = organ => organ.centers[0]?.role === 'motor'
                               ? ' data-sense-field="' + escapeText(organ.centers[0].id) +
                                     '" data-sense-redraw="refreshDragged"'
                               : '';
export function effectorPatch(name, fx, fy, most, organ, marks) {
  const [width, height] = marks.frame.split(',').map(Number);
  const point = {x : fx * width, y : fy * height};
  return name === 'command:gate' ? commandPatch(point, marks)
                                 : musclePatch(name, point, marks, most, organ);
}

// What a mouth muscle sets below its live inspector: its nodes, their strength and fibres.
export function muscleSettings(state, organ) {
  const code = organFunction(organ, state.sites);
  return '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
         musclePicture(state, organ, code, sideOf(organ)) + '</div>';
}
