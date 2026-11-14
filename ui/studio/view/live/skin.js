// What the live inspectors of the skin senses share: the band of a sense's life under its own
// picture, an egg with its embryo, and a fish seen from above.
import {lifePhase, setLifePhase} from '../../model/document.js';
import {skinProbeBearing} from '../../model/probe.js';
import {clamp, drag, el} from './kit.js';
import {keyGrip} from './sense.js';

export const LIFE = Object.freeze({
  L : 44,
  R : 264,
  band : 62,
  high : 16,
  height : 92,
  beside : 16,
  whole : .015,
  least : .08,
  hatch : .5
});
// The places of the two little pictures over the band: before hatching and after it.
export const lifePlaces = () => {
  const {L, R, band, hatch} = LIFE, at = L + (R - L) * hatch;
  return {egg : (L + at) / 2, grown : (at + R) / 2, y : band - 26};
};
// The band: from where the cells work to where they die, a grip at each end.
export function lifeBand(svg, under, live, {studio, center, name, draft, settle}) {
  const {L, R, band, high, beside, whole, least, hatch} = LIFE, phase = lifePhase(center),
                                                 caps = studio.state.capabilities,
                                                 from = phase.start ?? 0,
                                                 until = Math.min(1, phase.end ?? 1),
                                                 X = r => L + (R - L) * clamp(r),
                                                 rOf = x => clamp((x - L) / (R - L));
  el('rect', {x : L, y : band, width : R - L, height : high, class : 'aid-live-ground'}, under);
  el('rect', {
    x : X(from),
    y : band + 1,
    width : Math.max(0, X(until) - X(from)),
    height : high - 2,
    class : 'aid-live-lifeband k0 on'
  },
     under);
  el('path', {d : `M${X(hatch)} ${band - 46} V${band + high + 5}`, class : 'aid-live-hatch'}, live);
  const grip = (x, part, move) =>
      drag(svg,
           el('rect', {
             x : x - 4,
             y : band + high / 2 - 5.5,
             width : 8,
             height : 11,
             rx : 2,
             class : keyGrip(0, true)
           },
              live),
           p => draft(setLifePhase(studio.state.document, center.id, move(rOf(p.x)),
                                   caps.sensitivitySpan, caps.steepnessSpan)),
           name + part, 'grip', settle);
  grip(from > 0 ? X(from) : L - beside, 'from',
       to => ({start : to < whole ? null : Math.min(to, until - least)}));
  grip(until < 1 ? X(until) : R + beside, 'until',
       to => ({end : to > 1 - whole ? null : Math.max(to, from + least)}));
}
// An egg with its embryo curled in it; `tight`: the embryo fills the shell.
export function eggShape(parent, x, y, r, tight) {
  el('circle', {cx : x, cy : y, r, class : tight ? 'aid-live-eggrim tight' : 'aid-live-eggrim'},
     parent);
  const e = tight ? r - 3.5 : r - 7;
  el('path', {
    d : `M${x - e * .2} ${y - e} A${e} ${e} 0 1 0 ${x + e} ${y + e * .1}`,
    class : tight ? 'aid-live-embryo tight' : 'aid-live-embryo'
  },
     parent);
  el('circle', {cx : x - e * .2, cy : y - e, r : 1.4, class : 'aid-live-eye'}, parent);
}
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
const turnTo = a => ((a + 540) % 360) - 180;
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
