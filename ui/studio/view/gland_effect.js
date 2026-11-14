import {MOTOR_KIND} from '../../schema.js';
import {commandLine} from './command_line.js';

// The gate of the gland's command, below its live inspector.
export const glandCommand = (state, organ, center) =>
    center ? commandLine(state, organ, center, MOTOR_KIND.gland, 'gland') : '';
