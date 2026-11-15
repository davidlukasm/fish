// What the live inspectors of the skin senses share: a fish seen from above and from the side,
// and the skin's sectors.
import {groupReport} from '../../model/document.js';
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
// An angle in degrees brought into -180..180.
export const turnTo = a => ((a + 540) % 360) - 180;
export const sectorAngle = (k, count) => -180 + (k + .5) * 360 / count;
export const sectorOf = (angle, count) =>
    clamp(Math.floor((turnTo(angle) + 180) * count / 360), 0, count - 1);
// One profile for the group, using the sector weights of its individual receptors.
export function skinSectors(state, cellId) {
  const report = state.outlinePreview ?? state.anatomy;
  const cells = groupReport(state.document, report, 'felt', cellId) ?? [];
  const weights = (cells[0]?.[2] ?? []).map(
      (_, sector) => cells.reduce((sum, [, , weights]) => sum + weights[sector], 0) / cells.length);
  return {place : skinProbeBearing(state.document, report, cellId) ?? 90, weights};
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
