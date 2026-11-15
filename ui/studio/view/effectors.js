import {musclePatch} from './muscle_effect.js';
import {commandPatch} from './command_line.js';

// What a grip in a muscle's or a command's picture sets (handles.js): the gland's command line
// still carries one.
export function effectorPatch(name, fx, fy, most, organ, marks) {
  const [width, height] = marks.frame.split(',').map(Number);
  const point = {x : fx * width, y : fy * height};
  return name === 'command:gate' ? commandPatch(point, marks)
                                 : musclePatch(name, point, marks, most, organ);
}
