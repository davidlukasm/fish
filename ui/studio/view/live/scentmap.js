// The scent map of a live inspector, for the nose and the barbels: the eight scents as balls on
// the round map of all scents (tuning.js, scent_latitudes and scent_longitudes), the bigger the
// more the organ's cells take of them; each type of cells as the patch in which it takes at least
// half of a scent, with a grip at its place and one on the patch's edge for its width; and the
// sample tried on the cells as a cross, pushed about freely.
// What a cell takes of a scent is the engine's (tuning.js, scentAffinities). The sample between
// two scents is the picture's assumption: a mix of the scents near it (the engine knows only the
// eight).
import {scentColors, scentNames} from '../../../brain_model.js';
import {TUNING} from '../../../schema.js';
import {scentAffinities, scentTuning, tuningHalfOffset} from '../../../tuning.js';
import {chip, clamp, drag, el, path, picture, txt} from './kit.js';
import {keyGrip} from './sense.js';

const MAP = Object.freeze({
  height : 252,
  cx : 150,
  cy : 122,
  R : 106,
  ball : [ 5, 10 ],
  samples : 72,
  margin : 62,
  snap : 12,
  mix : 15,
  clear : 17,
  widest : .8
});
const STONE = Object.freeze([ 2 * MAP.cx - 26, 22 ]);
const degrees = r => r * 180 / Math.PI, radians = d => d * Math.PI / 180;
const vector = ({q1, q2}) => {
  const z = clamp(q2, -1, 1), r = Math.sqrt(1 - z * z), phi = Math.PI * (q1 + 1);
  return [ r * Math.cos(phi), r * Math.sin(phi), z ];
};
const between = (a, b) => degrees(Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)));
const pointOf = v => {
  const r = MAP.R * Math.sin(Math.acos(clamp(v[2], -1, 1)) / 2), lon = Math.atan2(v[1], v[0]);
  return [ MAP.cx + r * Math.sin(lon), MAP.cy - r * Math.cos(lon) ];
};
const tuningAt = p => {
  const dx = p.x - MAP.cx, dy = MAP.cy - p.y,
        colatitude = 2 * Math.asin(Math.min(1, Math.hypot(dx, dy) / MAP.R)),
        lon = (Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI);
  return {q1 : lon / Math.PI - 1, q2 : Math.cos(colatitude)};
};
const scents = () => TUNING.scent_latitudes.map((_, k) => scentTuning(k));
// A place dragged close to a scent is that scent.
const snapped = p => scents().find(s => {
  const [x, y] = pointOf(vector(s));
  return Math.hypot(x - p.x, y - p.y) <= MAP.snap;
}) ?? tuningAt(p);
// What the sample holds of each scent: all of one where it lies on it, else a mix of those near.
// A sample of stone holds no scent at all.
export function sampleMix(probe) {
  if (probe.stone)
    return scents().map(() => 0);
  const at = vector(probe), raw = scents().map(s => {
    const a = between(at, vector(s));
    return a < .5 ? 1e6 : Math.exp(-((a / MAP.mix) ** 2));
  }),
        sum = raw.reduce((x, y) => x + y, 0);
  return raw.map(v => sum > 0 ? v / sum : 0);
}
const shares = cell => scentAffinities(cell.q1, cell.q2, cell.qwidth);
// What a type's cells take of the sample.
export const sampleShare = (cell, probe) => {
  const taken = shares(cell);
  return sampleMix(probe).reduce((sum, m, k) => sum + m * taken[k], 0);
};
export const sampleColour = probe => {
  const mix = sampleMix(probe);
  return probe.stone ? null : scentColors?.[mix.indexOf(Math.max(...mix))] ?? null;
};
// The scents the types take most of, each named once.
export const bestScents = cells => [...new Set(cells.map(cell => {
                                     const taken = shares(cell);
                                     return scentNames?.[taken.indexOf(Math.max(...taken))] ?? '';
                                   }))].join(', ');

// `own`: the chosen type and the sample ({q1, q2, stone}), kept by the inspector; `cells`: the
// first cell of each type; `stone`: whether a stone lies beside the map for the sample;
// `place(i, tuning)`, `width(i, qwidth)`: the document with that type moved or widened;
// `remove(i)`, `add()`: the types' buttons.
export function scentMap(
    svg, {name, own, cells, stone, words, most, place, width, remove, add, draft, settle, redraw}) {
  const {live} = picture(svg, MAP.height), {cx, cy, R, ball, samples, clear} = MAP,
        taken = cells.map(shares), all = scents(),
        most_taken = all.map((_, k) => Math.max(...taken.map(t => t[k])));
  el('circle', {cx, cy, r : R, class : 'aid-live-track'}, live);
  cells.forEach((cell, i) => {
    const on = i === own.chosen, half = tuningHalfOffset(cell.qwidth), at = vector(cell),
          look = 'aid-live-scent-patch k' + i + (on ? ' on' : '');
    // The patch: the circle on the sphere at the half angle, as the map shows it.
    if (Number.isFinite(half) && half < 179) {
      const flat = Math.hypot(at[0], at[1]),
            east = flat < 1e-6 ? [ 0, 1, 0 ] : [ -at[1] / flat, at[0] / flat, 0 ], north = [
              at[1] * east[2] - at[2] * east[1], at[2] * east[0] - at[0] * east[2],
              at[0] * east[1] - at[1] * east[0]
            ];
      const ring = Array.from({length : samples}, (_, n) => {
        const a = 2 * Math.PI * n / samples, c = Math.cos(radians(half)),
              s = Math.sin(radians(half));
        return pointOf(
            at.map((x, d) => c * x + s * (Math.cos(a) * east[d] + Math.sin(a) * north[d])));
      });
      el('path', {d : path(ring) + 'Z', class : look}, live).addEventListener('pointerdown', () => {
        own.chosen = i;
        redraw();
      });
    } else
      el('circle', {cx, cy, r : R - 2, class : look, 'pointer-events' : 'none'}, live);
  });
  // The scents, named; a ball's size is what the cells take of it. A scent near the picture's
  // edge has its name on the inner side.
  all.forEach((s, k) => {
    const [x, y] = pointOf(vector(s)),
              right = x < MAP.margin || (x >= cx && x <= 2 * cx - MAP.margin),
              colour = scentColors?.[k] ?? '';
    el('circle', {
      cx : x,
      cy : y,
      r : ball[0] + (ball[1] - ball[0]) * most_taken[k],
      fill : colour,
      opacity : .35 + .65 * most_taken[k],
      'pointer-events' : 'none'
    },
       live);
    txt(live, x + (right ? 14 : -14), y + 4, scentNames?.[k] ?? '', {
      'text-anchor' : right ? 'start' : 'end',
      style : 'fill:' + colour,
      class : 'aid-live-scent-name',
      opacity : .55 + .45 * most_taken[k],
      'pointer-events' : 'none'
    });
  });
  el('path', {d : `M8 ${MAP.height - 13} l7 7 m0 -7 l-7 7`, class : 'aid-live-sample small'}, live);
  txt(live, 20, MAP.height - 6, words.sample, {class : 'aid-live-small'});
  // A stone has no place among the scents: it lies beside the map, and the sample can lie on it.
  const probe = own.probe;
  if (stone) {
    el('path', {
      d : `M${STONE[0] - 9} ${STONE[1] + 4} l3 -9 l8 -3 l7 5 l-2 8 l-10 3 Z`,
      class : 'aid-live-stone aid-live-chip' + (probe.stone ? ' on' : '')
    },
       live)
        .addEventListener('pointerdown', () => {
          own.probe = {...probe, stone : true};
          redraw();
        });
    txt(live, STONE[0], STONE[1] + 22, words.stone,
        {'text-anchor' : 'middle', class : 'aid-live-small'});
  }
  // The sample: a cross under the grips, its arms long enough to show round one that lies on it.
  const [sx, sy] = probe.stone ? STONE : pointOf(vector(probe)), cross = el('g', {}, live);
  el('circle', {cx : sx, cy : sy, r : 11, fill : 'transparent'}, cross);
  el('path', {d : `M${sx - 8} ${sy - 8} l16 16 m0 -16 l-16 16`, class : 'aid-live-sample'}, cross);
  drag(svg, cross, p => {
    own.probe = stone && Math.hypot(p.x - STONE[0], p.y - STONE[1]) < 16 ? {...probe, stone : true}
                                                                         : snapped(p);
    redraw();
  }, name + 'sample', 'knob');
  cross.classList.remove('aid-live-knob');
  cross.classList.add('aid-live-samplegrip');
  // The types' grips: at their place; the chosen one's width on its patch's edge, and its (×).
  cells.forEach((cell, i) => {
    const on = i === own.chosen, [ x, y ] = pointOf(vector(cell));
    drag(svg,
         el('rect',
            {x : x - 5, y : y - 5, width : 10, height : 10, rx : 2.5, class : keyGrip(i, on)},
            live),
         p => {
           own.chosen = i;
           draft(place(i, snapped(p)));
         },
         name + 'type' + i, 'grip', settle);
    if (!on)
      return;
    // Two places on the patch's edge, on the type's meridian: the width's grip takes the one
    // inside the map, the (×) the other, never nearer the type's place than clear of its grip.
    const half = Math.min(tuningHalfOffset(cell.qwidth), 170),
          colatitude = Math.acos(clamp(cell.q2, -1, 1)), phi = Math.PI * (cell.q1 + 1),
          along =
              turn => {
                const c = colatitude + radians(turn);
                return pointOf(
                    [ Math.sin(c) * Math.cos(phi), Math.sin(c) * Math.sin(phi), Math.cos(c) ]);
              },
          outer = along(half), inner = along(-half),
          inside = pt =>
              Math.hypot(pt[0] - cx, pt[1] - cy) <= R + .5 && colatitude + radians(half) <= Math.PI,
          edge = inside(outer) ? outer : inner, other = edge === outer ? inner : outer,
          far = Math.hypot(other[0] - x, other[1] - y),
          onScent =
              all.some(s => Math.abs(s.q1 - cell.q1) < 1e-6 && Math.abs(s.q2 - cell.q2) < 1e-6),
          // On a scent its name stands beside the place: there the (×) goes above or below it.
        away = far >= 26 ? other
               : onScent || far <= .5
                   ? [ x, y + (y <= cy ? -clear : clear) ]
                   : [ x + (other[0] - x) * clear / far, y + (other[1] - y) * clear / far ];
    drag(svg, el('circle', {cx : edge[0], cy : edge[1], r : 4.5}, live), p => {
      // The width whose half angle is the pointer's angle from the type's place.
      const wanted = between(vector(cell), vector(tuningAt(p)));
      let lo = 0, hi = MAP.widest;
      for (let n = 0; n < 22; n++) {
        const mid = (lo + hi) / 2;
        if (tuningHalfOffset(mid) < wanted)
          lo = mid;
        else
          hi = mid;
      }
      draft(width(i, lo));
    }, name + 'width', 'grip', settle);
    if (cells.length > 1)
      chip(live, away[0], away[1], '×', () => remove(i), true, 6);
  });
  chip(live, 2 * cx - 12, MAP.height - 10, '+', add, cells.length < most, 7);
}
