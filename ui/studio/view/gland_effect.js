import {MOTOR_KIND} from '../../schema.js';
import {wheelAffinity} from '../model/document.js';
import {commandLine} from './command_line.js';

// How much of each substance a gland at this place of the wheel pours, as shares of its whole
// output (hormone_affinity, normalised in body_plan.cc).
export function pouredShares(wheel, {x, y, width}) {
  const raw = Array.from({length : wheel.hormones}, (_, k) => wheelAffinity(wheel, x, y, width, k));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(a => sum > 0 ? a / sum : 0);
}
// The gate of the gland's command, below its live inspector.
export const glandCommand = (state, organ, center) =>
    center ? commandLine(state, organ, center, MOTOR_KIND.gland, 'gland') : '';
