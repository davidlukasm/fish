// What the live inspectors of the skin senses share: a fish seen from above and from the side,
// and the skin's sectors.
import {skinProbeBearing} from '../../model/probe.js';
import {clamp, el} from './kit.js';

// A fish seen from above, snout to the left.
export function fishAbove(parent, x, y, s) {
  el('path', {
    d : `M${x - 30 * s} ${y} Q${x - 24 * s} ${y - 11 * s} ${x - 6 * s} ${y - 11 * s} Q${
        x + 14 * s} ${y - 8 * s} ${x + 26 * s} ${y - 1.5 * s} l${10 * s} ${- 7 * s} q${- 3 * s} ${
        8.5 * s} 0 ${17 * s} l${- 10 * s} ${- 7 * s} Q${x + 14 * s} ${y + 8 * s} ${x - 6 * s} ${
        y + 11 * s} Q${x - 24 * s} ${y + 11 * s} ${x - 30 * s} ${y} Z`,
    class : 'aid-live-head'
  },
     parent);
  for (const side of [-1, 1]) {
    el('path', {
      d : `M${x - 8 * s} ${y + side * 10.5 * s} q${6 * s} ${side * 9 * s} ${14 * s} ${
          side * 7 * s} q${- 5 * s} ${- side * 3 * s} ${- 6 * s} ${- side * 8 * s}`,
      class : 'aid-live-head'
    },
       parent);
    el('circle', {cx : x - 21 * s, cy : y + side * 5.5 * s, r : 1.6 * s, class : 'aid-live-eye'},
       parent);
  }
}
// A sector's place round the body, in degrees from the snout to the fish's right
// (simulation_types.hh, sector_angle), and the sector a direction falls in.
export const SECTORS = 16;
// An angle in degrees brought into -180..180.
export const turnTo = a => ((a + 540) % 360) - 180;
export const sectorAngle = (k, count = SECTORS) => -180 + (k + .5) * 360 / count;
export const sectorOf = (angle, count = SECTORS) =>
    clamp(Math.floor((turnTo(angle) + 180) * count / 360), 0, count - 1);
// Where a group of skin cells lies, in degrees: the plan's report of its cells' directions
// (anatomy.felt: direction and half width of each cell, in radians); null before the plan has
// answered.
export const placeOf = (studio, cell) =>
    skinProbeBearing(studio.state.document, studio.state.anatomy, cell.id) ?? 90;
// The weights of skin cells on the sectors: a wedge round their place, half as wide as `half`
// degrees, brought to a sum of one (body_plan.cc, contact_weights).
export function wedge(place, half, count = SECTORS) {
  const raw = Array.from(
            {length : count},
            (_, k) => Math.max(0, 1 - Math.abs(turnTo(sectorAngle(k, count) - place)) / half)),
        sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => sum > 0 ? v / sum : 0);
}
// A fish seen from the side, snout to the right.
// The same fish looking to the left, as the fish panel shows it.
export function fishLeft(parent, x, y, s) {
  fishSide(el('g', {transform : `translate(${2 * x} 0) scale(-1 1)`}, parent), x, y, s);
}
export function fishSide(parent, x, y, s) {
  el('path', {
    d : `M${x + 30 * s} ${y} Q${x + 12 * s} ${y - 15 * s} ${x - 22 * s} ${y - 2 * s} l${- 11 * s} ${
        - 9 * s} q${3 * s} ${11 * s} 0 ${22 * s} l${11 * s} ${- 9 * s} Q${x + 12 * s} ${
        y + 15 * s} ${x + 30 * s} ${y} Z`,
    class : 'aid-live-head'
  },
     parent);
  el('path', {
    d : `M${x + 6 * s} ${y - 9.5 * s} q${- 6 * s} ${- 8 * s} ${- 16 * s} ${- 5 * s} l${4 * s} ${
        6.5 * s}`,
    class : 'aid-live-head'
  },
     parent);
  el('circle', {cx : x + 20 * s, cy : y - 3 * s, r : 2 * s, class : 'aid-live-eye'}, parent);
}
