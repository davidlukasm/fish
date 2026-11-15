import {commandPatch} from './command_line.js';

// What a grip in a command's picture sets (handles.js): only the gland's command line carries one.
export function effectorPatch(name, fx, fy, marks) {
  const [width, height] = marks.frame.split(',').map(Number);
  return name === 'command:gate' ? commandPatch({x : fx * width, y : fy * height}, marks) : null;
}
