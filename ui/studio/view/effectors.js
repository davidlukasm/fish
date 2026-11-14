import {musclePatch, musclePictures} from './muscle_effect.js';
import {commandPatch} from './command_line.js';
import {FIN_STROKE, MOTOR_KIND} from '../../schema.js';
import {kindLimit, organFunction} from '../model/organs.js';
import {antagonistOf, finStroke} from '../model/document.js';
import {sideOf} from '../model/layout.js';
import {escapeText} from './markup.js';
import {t} from '../../strings.js';

const label = (key, values) => t('studio.muscle.' + key, values);
// What the muscle's settings do follows in pictures of their own below what it moves.
const musclePicture = (state, organ, code, side) =>
    musclePictures(state, organ, code, side, kindLimit(organ, state.sites), gateField(organ));
// The gate is set like a sense's sensitivity, by the working cells it belongs to.
const gateField = organ => organ.centers[0]?.role === 'motor'
                               ? ' data-sense-field="' + escapeText(organ.centers[0].id) +
                                     '" data-sense-redraw="refreshDragged"'
                               : '';
const STROKE_ICON = Object.freeze({width : 30, height : 16, shaft : 10, head : 5});
// The arrow shows where the fin drives the water: toward the tail on the back stroke.
function strokeIcon(stroke) {
  const I = STROKE_ICON, y = I.height / 2, x = I.width / 2;
  const toTail = stroke === FIN_STROKE.back ? 1 : -1, tip = x + toTail * I.shaft;
  return '<svg class="aid-stroke" viewBox="0 0 ' + I.width + ' ' + I.height +
         '" aria-hidden="true"><path d="M' + (x - toTail * I.shaft) + ' ' + y + 'H' + tip + 'M' +
         (tip - toTail * I.head) + ' ' + (y - I.head) + 'L' + tip + ' ' + y + 'L' +
         (tip - toTail * I.head) + ' ' + (y + I.head) + '"/></svg>';
}
function strokeChooser(state, organ) {
  return '<div class="aid-contrast-choices aid-stroke-choices">' +
         Object.entries(FIN_STROKE)
             .map(([ key, stroke ]) => {
               const chosen = finStroke(organ) === stroke;
               return '<button data-fin-stroke="' + stroke + '" data-organ-id="' +
                      escapeText(organ.id) + '" class="' + (chosen ? 'active' : '') +
                      '" aria-pressed="' + chosen + '" title="' +
                      escapeText(label('stroke.' + key + 'Title')) + '">' + strokeIcon(stroke) +
                      '</button>';
             })
             .join('') +
         (antagonistOf(state.document, organ, state.sites)
              ? ''
              : '<button data-fin-antagonist="' + escapeText(organ.id) + '" title="' +
                    escapeText(label('stroke.antagonistTitle')) + '">' +
                    strokeIcon(FIN_STROKE.back) + strokeIcon(FIN_STROKE.front) + '</button>') +
         '</div>';
}
export function effectorPatch(name, fx, fy, most, organ, marks) {
  const [width, height] = marks.frame.split(',').map(Number);
  const point = {x : fx * width, y : fy * height};
  return name === 'command:gate' ? commandPatch(point, marks)
                                 : musclePatch(name, point, marks, most, organ);
}

// What a fin or mouth muscle sets below its live inspector: its nodes, their strength and fibres;
// a side fin also which way it beats, and its antagonist.
export function muscleSettings(state, organ) {
  const code = organFunction(organ, state.sites);
  return '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
         (code === MOTOR_KIND.turn ? strokeChooser(state, organ) : '') +
         musclePicture(state, organ, code, sideOf(organ)) + '</div>';
}
