// A sense's cells in a live inspector: what its keys (types of cells) send over the steps of an
// input tried on them. A key's threshold is where its cells' activation starts (document.js,
// threshold; tuning.js, activationLevel); its cells' thresholds spread around it by twice the
// plan's spread either way (distribution.hh, draw_traits), shown as CELLS cells spread evenly.
// Cells that tire get used to the input from the first step on: what they are used to moves
// towards it by its share 1 / steps each step, and they answer what the input exceeds it by
// (cppn_brain.cc, adapted_response).
import {
  activationLevel,
  activationQuality,
  adaptationOf,
  adaptationSteps,
  LONGEST_ADAPTATION,
  planOfUnit,
  unitOfPlan
} from '../../../tuning.js';
import {updateCellDistribution, updateCenter} from '../../model/document.js';
import {TUNING} from '../../../schema.js';
import {chip, clamp, drag, el, fishIcon, path, picture, txt} from './kit.js';

export const STEPS = 900, CELLS = 7, LEVELS = [ activationLevel(0), activationLevel(1) ],
             LEVEL_SPAN = LEVELS[1] - LEVELS[0];
export const USED = [ adaptationSteps(0), LONGEST_ADAPTATION ];
export const SENSE_BOX = Object.freeze(
    {L : 92, R : 292, LX : 44, I0 : 150, I1 : 254, row : 34, rowL : 6, rowR : 294, rowGap : 10});
export const cellGates = k =>
    Array.from({length : CELLS},
               (_, c) => clamp(k.gate + k.spread * ((c + .5) / CELLS - .5), LEVELS[0], LEVELS[1]));
// A cell's answer to a stimulus past its threshold and what it is used to (body_plan.cc, the
// bounded answer of a sense cell).
export const answer = (x, gate, used) => {
  const over = (clamp(x) - used - gate) / (1 - gate);
  return over > 0 ? over / (over + gate * (1 - over)) : 0;
};
// The two scales a sense's stimulus has (brain_interface.hh, intensity_sense). `pos`: where a
// stimulus stands in the diagram, from nothing (0) to the strongest (1); `val`: the stimulus
// there; `gate`, `spread`: a key's threshold and its cells' spread as places in the diagram;
// `gates`: its cells' thresholds as stimuli; `answer`: what a cell reports; `threshold`,
// `spreading`: the plan's values for a place in the diagram.
// BOUNDED: a stimulus between nothing and all; a cell answers nothing up to its threshold and all
// at the full stimulus (body_plan.cc, bounded_response).
export const BOUNDED = Object.freeze({
  pos : s => clamp(s),
  val : v => clamp(v),
  gate : cell => activationLevel(unitOfPlan(cell.threshold)),
  spread : cell => 2 * cell.distribution.spread_physiology * LEVEL_SPAN,
  gates : cellGates,
  answer,
  threshold : v => planOfUnit(activationQuality(clamp(v, LEVELS[0], LEVELS[1]))),
  spreading : spread => clamp(spread / (2 * LEVEL_SPAN), 0, 1)
});
// INTENSITY: a stimulus without upper bound (scent, flow), on a logarithmic scale from the
// faintest threshold a cell can have (0) to a stimulus of one (1); a threshold is threshold_min
// x threshold_range ^ quality (receptor_tuning.hh, response_threshold), so it lies at REACH x
// its quality. A cell answers nothing up to its threshold and half at twice the threshold; what
// it is used to raises the threshold by as much (body_plan.cc, excess_response).
const FAINTEST = TUNING.threshold_min,
      REACH = Math.log(TUNING.threshold_range) / -Math.log(FAINTEST);
const places = k => Array.from(
    {length : CELLS}, (_, c) => clamp(k.gate + k.spread * ((c + .5) / CELLS - .5), 0, REACH));
export const INTENSITY = Object.freeze({
  pos : s => s > FAINTEST ? clamp(1 - Math.log(s) / Math.log(FAINTEST)) : 0,
  val : v => v > 0 ? Math.exp(Math.log(FAINTEST) * (1 - clamp(v))) : 0,
  gate : cell => REACH * unitOfPlan(cell.threshold),
  spread : cell => 2 * cell.distribution.spread_physiology * REACH,
  gates : k => places(k).map(v => Math.exp(Math.log(FAINTEST) * (1 - v))),
  answer : (s, gate, used) => {
    const excess = s - gate - used;
    return excess > 0 ? excess / (excess + gate + used) : 0;
  },
  threshold : v => planOfUnit(clamp(v / REACH)),
  spreading : spread => clamp(spread / (2 * REACH), 0, 1)
});
// The input tried on a sense: it rises to a height, holds and stops, then fades.
export const stimulusOf = (input, after) => {
  const top = input.height * clamp(input.stop / Math.max(1, input.rise));
  return Array.from({length : STEPS + 1},
                    (_, st) => st <= input.stop ? input.height * clamp(st / Math.max(1, input.rise))
                                                : top * Math.exp(-(st - input.stop) / after));
};
// What a key's cells send under an input, step by step, and what they have got used to by then.
export function runOf(k, stim, tires, scale = BOUNDED) {
  const gates = scale.gates(k), reply = scale.answer, pace = tires ? 1 / k.used : 0, sent = [],
        used = [];
  let u = 0;
  for (const s of stim) {
    sent.push(gates.reduce((sum, g) => sum + reply(s, g, u), 0) / CELLS);
    used.push(u);
    u += (s - u) * pace;
  }
  return {sent, used};
}
// The step at which a key's last cell falls silent under this input; past the picture's steps
// if it never does, 0 if the cell never sends at all.
export function silentStep(k, stim, scale = BOUNDED) {
  const last = Math.min(...scale.gates(k));
  let used = 0, heard = false;
  for (let st = 0; st < stim.length; st++) {
    const hears = stim[st] - used > last;
    if (heard && !hears)
      return st;
    heard ||= hears;
    used += (stim[st] - used) / k.used;
  }
  return heard ? stim.length : 0;
}
// The pace of tiring that puts that step where it is wanted (the slower, the later).
export function usedFor(k, stim, step, scale = BOUNDED) {
  if (!silentStep({...k, used : USED[1]}, stim, scale))
    return k.used;
  let [lo, hi] = USED;
  for (let n = 0; n < 24; n++) {
    const mid = (lo + hi) / 2;
    if (silentStep({...k, used : mid}, stim, scale) < step)
      lo = mid;
    else
      hi = mid;
  }
  return hi;
}
export const between = (values, at) => {
  const a = Math.floor(at), f = at - a;
  return values ? (values[a] ?? 0) * (1 - f) + (values[a + 1] ?? values[a] ?? 0) * f : 0;
};
// The nerve cells above a sense's diagram: one for each key, the fibres running into one bundle.
export const IRRITANT = 'M2 -8 L-4 1 H1 L-2 8 L5 -2 H0 Z';
export const NERVE = Object.freeze({
  somas : [ [ 150, 72 ], [ 124, 64 ], [ 176, 82 ], [ 100, 80 ] ],
  join : [ 170, 38 ],
  bundle : [ [ 170, 38 ], [ 186, 22 ], [ 166, 18 ], [ 178, 8 ] ],
  tilt : 14,
  about : [ 150, 62 ],
  flash : 104,
  tips : [ [ -13, 5 ], [ -7, 14 ], [ 4, 13 ] ],
  speed : .0026,
  rate : .006,
  merge : .15,
  pulses : 4,
  dots : 7,
  dotSpeed : .004
});
export const cubic = (a, b, c, d, s) => {
  const u = 1 - s;
  return [ 0, 1 ].map(n => u * u * u * a[n] + 3 * u * u * s * b[n] + 3 * u * s * s * c[n] +
                           s * s * s * d[n]);
};

// A sense's keys as the document has them: one for each type of its cells.
export const keysOf = (types, scale = BOUNDED) => types.map(type => {
  const cell = type.centers[0];
  return {
    id : cell.id,
    type : type.id,
    cell,
    gate : scale.gate(cell),
    spread : scale.spread(cell),
    used : adaptationSteps(cell.tau)
  };
});
export const setGate = (doc, k, gate, scale = BOUNDED) =>
    updateCenter(doc, k.id, {threshold : scale.threshold(gate)});
export const setSpread = (doc, k, spread, scale = BOUNDED) =>
    updateCellDistribution(doc, k.id, 'spread_physiology', scale.spreading(spread));
export const setUsed = (doc, k, steps) =>
    updateCenter(doc, k.id, {tau : adaptationOf(clamp(steps, USED[0], USED[1]))});
export const keyGrip = (i, on) => 'aid-live-keygrip k' + i + (on ? ' on' : '');

// One sense's course: the nerve cells, and under them one diagram over the steps: the input with
// its two round knobs; left of it what holds the thresholds, filling with the input, with a grip
// for each key; each key's dashed line and band across the input; for the chosen key what its
// cells still feel as they tire and, filled, what they send.
// `own`: which key is chosen and the input tried (rise, height, stop), kept by the inspector;
// `keys()`: the keys now; `share(k)`: what a key's cells meet of the input, if not all of it;
// `colour()`: the input's colour, if it changes; `fewer(k)`, `more(gate)`: the keys' pair of
// buttons; `most`: how many keys there may be; `scale`: the stimulus's scale. Returns draw(), and
// what the clock moves: moment(step), pulse(dt, step).
export function senseCourse(svg, {
  name,
  own,
  tires,
  after,
  most = 3,
  scale = BOUNDED,
  words,
  keys : keysNow,
  share = null,
  colour = null,
  fewer,
  more,
  doc,
  draft,
  settle,
  redraw
}) {
  const play = {stim : null, sent : [], line : null, level : null, glow : [], nerves : null};
  function nerves(parent, keys, gripX, tire) {
    const {join, bundle} = NERVE, cells = [],
                 tilted = el('g', {
                   transform : `rotate(${NERVE.tilt} ${NERVE.about})`,
                   class : 'aid-live-sense-' + name
                 },
                             parent);
    el('path', {
      d : `M${bundle[0]} C${bundle[1]} ${bundle[2]} ${bundle[3]}`,
      class : 'aid-live-nerve-bundle'
    },
       tilted);
    keys.forEach((k, i) => {
      const [cx, cy] = NERVE.somas[i], on = i === own.chosen,
                 way = [ [ cx, cy ], [ cx - 8, cy - 30 ], [ join[0] - 22, join[1] + 24 ], join ];
      el('path',
         {d : `M${way[0]} C${way[1]} ${way[2]} ${way[3]}`, class : 'aid-live-nerve-fibre k' + i},
         tilted);
      el('path', {
        d : `M${cx} ${cy} q-7 5 -13 5 l-4 -3 m4 3 l-3 4 M${cx} ${
            cy} q-2 8 -7 14 l-4 1 m4 -1 l0 5 M${cx} ${cy} q4 6 4 13 l-3 3 m3 -3 l3 3`,
        class : 'aid-live-nerve-ends k' + i
      },
         tilted);
      cells.push({
        due : 0,
        way,
        pulses :
            Array.from({length : NERVE.pulses},
                       () => ({t : 1, e : el('circle', {r : 0, class : 'aid-live-pulse'}, tilted)}))
      });
      el('circle', {cx, cy, r : 6, class : 'aid-live-soma k' + i + (on ? ' on' : '')}, tilted)
          .addEventListener('pointerdown', () => {
            own.chosen = i;
            redraw();
          });
      if (tires && on)
        drag(svg,
             el('rect', {
               x : gripX(i) - 5,
               y : SENSE_BOX.I0 - 33,
               width : 10,
               height : 10,
               rx : 3,
               class : 'aid-live-tire k' + i
             },
                parent),
             p => tire(k, i, p), name + 'tire', 'grip', settle);
    });
    const merged = Array.from(
        {length : 6},
        () => ({t : 1, n : 0, e : el('circle', {r : 0, class : 'aid-live-pulse'}, tilted)}));
    const shown = NERVE.somas.slice(0, keys.length);
    // Under the cells, in their middle, above the strip in which a tiring cell's grip moves.
    const at = [ shown.reduce((sum, s) => sum + s[0], 0) / shown.length - 4, NERVE.flash ];
    const dots = Array.from({length : NERVE.dots}, (_, n) => {
      const [cx, cy] = shown[n % shown.length], [ dx, dy ] = NERVE.tips[n % NERVE.tips.length];
      return {
        t : 1,
        to : [ cx + dx, cy + dy ],
        e : el('circle', {r : 0, class : 'aid-live-irritant'}, tilted)
      };
    });
    play.nerves = {
      cells,
      bundle : merged,
      at,
      dots,
      due : 0,
      irritant : el('path', {d : IRRITANT, class : 'aid-live-irritant'}, tilted)
    };
  }
  function draw() {
    const inp = own.input, keys = keysNow(), {L, R, LX, I0, I1} = SENSE_BOX;
    const {live} = picture(svg, I1 + 22);
    Object.assign(play,
                  {stim : null, sent : [], line : null, level : null, glow : [], nerves : null});
    if (!keys.length)
      return;
    own.chosen = clamp(own.chosen, 0, keys.length - 1);
    live.setAttribute('class', 'aid-live-sense-' + name);
    if (colour)
      live.style.color = colour();
    const offered = stimulusOf(inp, after);
    // What each key's cells meet of the input: all of it, or the share their sense gives them.
    const met = keys.map(k => offered.map(v => scale.val(v) * (share ? share(k) : 1))),
          stim = play.stim = met[own.chosen].map(scale.pos);
    const IY = v => I1 - (I1 - I0) * clamp(v), vOf = y => clamp((I1 - y) / (I1 - I0));
    const X = st => L + (R - L) * st / STEPS,
          stOf = x => clamp(Math.round((x - L) / (R - L) * STEPS), 0, STEPS);
    const runs = keys.map((k, i) => runOf(k, met[i], tires, scale));
    play.sent = runs.map(r => r.sent);
    // Where a key's cells send nothing more, and the grips' way of moving it.
    const ends = keys.map((k, i) => silentStep(k, met[i], scale));
    const tire = (k, i, p) => {
      own.chosen = i;
      draft(setUsed(doc(), k, usedFor(k, met[i], stOf(p.x), scale)));
    };
    const choose = i => () => {
      own.chosen = i;
      redraw();
    };
    const newGate = () => clamp((Math.max(...keys.map(k => k.gate)) + 1) / 2, .05, .95);
    nerves(live, keys, i => X(clamp(ends[i], 0, STEPS)), tire);
    // The same pair twice: at the cells and at the keys (under their holder).
    chip(live, R - 22, I0 - 54, '−', () => fewer(keys[own.chosen]), keys.length > 1, 6);
    chip(live, R - 6, I0 - 54, '+', () => more(newGate()), keys.length < most, 6);
    txt(live, L, I0 - 9, words.course);
    // What holds the thresholds, filling with the input.
    el('rect', {x : LX - 5, y : I0, width : 10, height : I1 - I0, rx : 5, class : 'aid-live-track'},
       live);
    const content = el(
        'rect', {x : LX - 4, width : 8, rx : 4, class : 'aid-live-sense-fill', opacity : .6}, live);
    play.level = v => {
      content.setAttribute('y', IY(v).toFixed(1));
      content.setAttribute('height', (I1 - IY(v)).toFixed(1));
    };
    el('rect', {x : L, y : I0, width : R - L, height : I1 - I0, class : 'aid-live-ground'}, live);
    el('path', {
      d : path(stim.map((v, st) => [X(st), IY(v)])) + ` L${R} ${I1} L${L} ${I1} Z`,
      class : 'aid-live-sense-input'
    },
       live);
    keys.forEach((k, i) => {
      const on = i === own.chosen, gates = scale.gates(k).map(scale.pos), low = Math.min(...gates),
            felt = runs[i].used.map((u, st) => scale.pos(Math.max(0, met[i][st] - u)));
      // The key's band: from its lowest to its highest cell's threshold.
      const top = IY(Math.max(...gates)), bottom = IY(low),
            shapes = [ el('rect', {
              x : L,
              y : Math.min(top, IY(k.gate) - 1.5),
              width : R - L,
              height : Math.max(bottom - top, 3),
              class : 'aid-live-keyband k' + i + (on ? ' on' : '')
            },
                          live) ];
      if (on)
        shapes.push(el('path', {
          d : `${path(felt.map((f, st) => [X(st), IY(Math.max(f, low))]))} L${R} ${IY(low)} L${L} ${
              IY(low)} Z`,
          class : 'aid-live-sense-fill',
          opacity : .95
        },
                       live));
      for (const shape of shapes) {
        shape.classList.add('aid-live-chip');
        shape.addEventListener('pointerdown', choose(i));
      }
      if (tires && on)
        el('path', {d : path(felt.map((f, st) => [X(st), IY(f)])), class : 'aid-live-felt'}, live);
      const line = el('path', {
        d : `M${LX + 12} ${IY(k.gate)} H${R}`,
        class : 'aid-live-keyline k' + i + (on ? ' on' : '')
      },
                      live);
      play.glow.push({line, gate : scale.val(k.gate), met : met[i]});
    });
    el('path', {d : `M${L} ${I0 - 2} V${I1} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, I1 + 16, words.steps);
    for (const st of [STEPS / 3, 2 * STEPS / 3])
      txt(live, X(st), I1 + 16, st, {'text-anchor' : 'middle'});
    txt(live, R, I1 + 16, STEPS, {'text-anchor' : 'end'});
    const now = el('path', {class : 'aid-live-now'}, live);
    play.line = step => now.setAttribute('d', `M${X(step).toFixed(1)} ${I0} V${I1}`);
    // Where each key's cells send nothing more: a thin mark for each on the step axis (not for
    // cells that never send); the chosen one's is a grip. It is called got used to only where the
    // input alone would still make the cells send.
    if (tires)
      keys.map((k, i) => i).sort((a, b) => (a === own.chosen) - (b === own.chosen)).forEach(i => {
        const k = keys[i], at = ends[i], x = X(Math.min(at, STEPS)), left = x > (L + R) / 2;
        if (at < 1)
          return;
        if (i !== own.chosen) {
          el('path', {d : `M${x} ${I1 - 9} V${I1}`, class : 'aid-live-keymark k' + i}, live);
          return;
        }
        el('path', {
          d : `M${x} ${I0 - 23} V${I0 - 21} M${x} ${I0} V${I1}`,
          class : 'aid-live-keyline k' + i
        },
           live);
        if (at <= STEPS && met[i][at] > Math.min(...scale.gates(k)))
          txt(live, x + (left ? -7 : 7), I0 + 11, words.used,
              {'text-anchor' : left ? 'end' : 'start', class : 'aid-live-onground'});
        drag(svg,
             el('rect',
                {x : x - 4, y : I1 - 13, width : 8, height : 10, rx : 2, class : keyGrip(i, true)},
                live),
             p => tire(k, i, p), name + 'used', 'grip', settle);
      });
    // The grips, above everything they could be hidden by: every key and its spread, the input's
    // two knobs (when it is fully there and how strong, and when it stops).
    keys.forEach((k, i) => {
      const on = i === own.chosen, gates = scale.gates(k).map(scale.pos);
      drag(svg,
           el('rect', {
             x : LX - 9,
             y : IY(k.gate) - 4,
             width : 18,
             height : 8,
             rx : 2,
             class : keyGrip(i, on)
           },
              live),
           p => {
             own.chosen = i;
             draft(setGate(doc(), k, vOf(p.y), scale));
           },
           name + 'key' + i, 'grip', settle);
      const sx = R - 8 - 13 * i, top = IY(Math.max(...gates)), bottom = IY(Math.min(...gates));
      el('path', {d : `M${sx} ${top} V${Math.max(bottom, top + 4)}`, class : 'aid-live-spread'},
         live);
      drag(svg, el('circle', {cx : sx, cy : top, r : 4.5}, live), p => {
        own.chosen = i;
        draft(setSpread(doc(), k, clamp(2 * (vOf(p.y) - k.gate), 0, .8), scale));
      }, name + 'spread' + i, 'grip', settle);
    });
    const knob = (at, part, move) =>
        drag(svg,
             el('circle', {cx : X(at), cy : IY(inp.height), r : 5.5, class : 'aid-live-sense-knob'},
                live),
             p => {
               move(stOf(p.x));
               inp.height = vOf(p.y);
               redraw();
             },
             name + part, 'knob');
    knob(inp.rise, 'rise', st => { inp.rise = clamp(st, 1, inp.stop - 1); });
    knob(inp.stop, 'stop', st => { inp.stop = clamp(st, inp.rise + 1, STEPS - 10); });
    chip(live, LX - 9, I1 + 10, '−', () => fewer(keys[own.chosen]), keys.length > 1, 6);
    chip(live, LX + 9, I1 + 10, '+', () => more(newGate()), keys.length < most, 6);
  }
  // The present moment: the line, what the holder holds, the keys the input has passed.
  function moment(step) {
    if (!play.stim)
      return;
    play.line(step);
    play.level(between(play.stim, step));
    for (const g of play.glow)
      g.line.setAttribute('opacity', between(g.met, step) >= g.gate ? 1 : .45);
  }
  // The nerve cells' pulses and what irritates them, as big as the input is.
  function pulse(dt, step) {
    const n = play.nerves;
    if (!n)
      return;
    const {speed, rate, merge, bundle} = NERVE, place = (e, [ x, y ]) => {
      e.setAttribute('cx', x.toFixed(1));
      e.setAttribute('cy', y.toFixed(1));
    };
    const st = Math.round(step), felt = between(play.stim, step);
    // As big as the input is now: it changes only when the input does.
    n.irritant.setAttribute('transform',
                            `translate(${n.at}) scale(${(.4 + .9 * felt).toFixed(2)})`);
    n.irritant.setAttribute('opacity', felt > .02 ? 1 : 0);
    n.due += dt * .012 * felt;
    const still = n.dots.find(d => d.t >= 1);
    if (n.due >= 1 && still) {
      n.due = 0;
      still.t = 0;
      still.e.setAttribute('r', 1.1);
    }
    for (const d of n.dots)
      if (d.t < 1) {
        d.t = Math.min(1, d.t + dt * NERVE.dotSpeed);
        place(d.e, [ n.at[0] + (d.to[0] - n.at[0]) * d.t, n.at[1] + (d.to[1] - n.at[1]) * d.t ]);
        if (d.t >= 1)
          d.e.setAttribute('r', 0);
      }
    n.cells.forEach((c, i) => {
      const sent = play.sent[i]?.[st] ?? 0, idle = c.pulses.find(p => p.t >= 1);
      c.due += dt * rate * sent;
      if (c.due >= 1 && idle) {
        c.due = 0;
        idle.t = 0;
        idle.e.setAttribute('r', 2.2);
      }
      for (const p of c.pulses)
        if (p.t < 1) {
          p.t = Math.min(1, p.t + dt * speed);
          place(p.e, cubic(...c.way, p.t));
          if (p.t < 1)
            continue;
          // Into the bundle: it joins a pulse that has only just entered, or starts one.
          p.e.setAttribute('r', 0);
          const near = n.bundle.find(b => b.t < merge), b = near ?? n.bundle.find(b => b.t >= 1);
          if (!b)
            continue;
          if (!near) {
            b.t = 0;
            b.n = 0;
          }
          b.e.setAttribute('r', (.6 + 2.2 * Math.sqrt(++b.n)).toFixed(1));
        }
    });
    for (const b of n.bundle)
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt * speed);
        place(b.e, cubic(...bundle, b.t));
        if (b.t >= 1)
          b.e.setAttribute('r', 0);
      }
  }
  return {draw, moment, pulse};
}

// The life of a sense's types: across, the fish's maturity, with hatching in the middle. A type's
// band runs from where its cells work to where they die, with a grip at each end of the chosen
// one. `egg`: what the band is before hatching: 'one' (the cells work, both sides the same; from
// hatching on the band is two, left and right) or 'none' (they report nothing: an empty frame).
const LIFE = Object.freeze({
  L : 44,
  R : 264,
  top : 14,
  base : 64,
  icons : 82,
  height : 96,
  beside : 16,
  whole : .015,
  least : .08,
  hatch : .5
});
export function typeLife(svg, {name, own, phases, egg, words, set, draft, settle, redraw}) {
  const {L, R, top, base, icons, beside, whole, least} = LIFE, hatchX = L + (R - L) * LIFE.hatch;
  const {under, live} = picture(svg, LIFE.height, fixed => {
    txt(fixed, L + 4, top + 11, words.egg, {class : 'aid-live-small'});
    txt(fixed, hatchX + 5, top + 11, words.grown, {class : 'aid-live-small'});
    el('ellipse', {cx : L + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, fixed);
    el('circle', {cx : L + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, fixed);
    fishIcon(fixed, hatchX, icons, .5);
    fishIcon(fixed, R - 36, icons, .8);
    el('path', {
      d : `M${L + 22} ${icons} H${hatchX - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${hatchX + 18} ${icons} H${
          R - 60} m-6 -3.5 l6 3.5 l-6 3.5`,
      class : 'aid-live-arrow'
    },
       fixed);
  });
  const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L)),
        high = (base - top - 20) / Math.max(1, phases.length);
  el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-ground'},
     under);
  phases.forEach((phase, i) => {
    const on = i === own.chosen, from = phase.start ?? 0, until = Math.min(1, phase.end ?? 1),
          y = top + 18 + high * i, hatch = clamp(LIFE.hatch, from, until);
    const band = (x, by, width, height, empty = false) => {
      const e = el('rect', {
        x,
        y : by,
        width : Math.max(0, width),
        height,
        class : (empty ? 'aid-live-lifeframe k' : 'aid-live-lifeband k') + i + (on ? ' on' : '')
      },
                   under);
      e.addEventListener('pointerdown', () => {
        own.chosen = i;
        redraw();
      });
    };
    band(X(from), y + 1, X(hatch) - X(from), high - 2, egg === 'none');
    if (egg === 'one')
      for (const half of [0, 1])
        band(X(hatch), y + 1 + half * (high / 2), X(until) - X(hatch), high / 2 - 2.5);
    else
      band(X(hatch), y + 1, X(until) - X(hatch), high - 2);
    if (!on)
      return;
    const grip = (x, part, move) =>
        drag(svg,
             el('rect', {
               x : x - 4,
               y : y + high / 2 - 5.5,
               width : 8,
               height : 11,
               rx : 2,
               class : keyGrip(i, true)
             },
                live),
             p => draft(set(i, move(rOf(p.x)))), name + part, 'grip', settle);
    grip(from > 0 ? X(from) : L - beside, 'from',
         to => ({start : to < whole ? null : Math.min(to, until - least)}));
    grip(until < 1 ? X(until) : R + beside, 'until',
         to => ({end : to > 1 - whole ? null : Math.max(to, from + least)}));
  });
  el('path', {d : `M${hatchX} ${top} V${base + 5}`, class : 'aid-live-hatch'}, live);
  el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
}
