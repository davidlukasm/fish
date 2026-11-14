import {bodyDirection} from './frame.js';

export const hairAngle = q1 => Math.PI / 2 * (1 + q1);
// Direction of a hair in the picture, head to the left and side +1 at the bottom.
export const hairVector = (q1, side) => bodyDirection(side * hairAngle(q1));
