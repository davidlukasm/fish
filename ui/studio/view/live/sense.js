// A sense's cells in a live inspector: what its keys (types of cells) send over the steps of an
// input tried on them. A key's threshold is where its cells' activation starts (document.js,
// threshold; tuning.js, activationLevel); its cells' thresholds spread around it by twice the
// plan's spread either way (distribution.hh, draw_traits).
// What the cells send, what they have got used to and where their thresholds lie is the
// engine's: it tries the input on the cells it draws for the plan, step by step as the fish does
// (atelier.cc, sense_course_report; cppn_brain.cc, adapted_response).
import {
  activationLevel,
  activationQuality,
  adaptationOf,
  adaptationSteps,
  LONGEST_ADAPTATION,
  planOfUnit,
  unitOfPlan
} from '../../../tuning.js';
import {centerIndex, updateCellDistribution, updateCenter} from '../../model/document.js';
import {TUNING} from '../../../schema.js';
import {chip, clamp, drag, el, fishIcon, path, picture, txt} from './kit.js';

export const STEPS = 900, LEVELS = [ activationLevel(0), activationLevel(1) ],
             LEVEL_SPAN = LEVELS[1] - LEVELS[0];
export const USED = [ adaptationSteps(0), LONGEST_ADAPTATION ];
export const SENSE_BOX = Object.freeze(
    {L : 92, R : 292, LX : 44, I0 : 150, I1 : 254, row : 34, rowL : 6, rowR : 294, rowGap : 10});
// The two scales a sense's stimulus has (brain_interface.hh, intensity_sense). `pos`: where a
// stimulus stands in the diagram, from nothing (0) to the strongest (1); `val`: the stimulus
// there; `gate`, `spread`: a key's threshold and its cells' spread as places in the diagram;
// `threshold`, `spreading`: the plan's values for a place in the diagram.
// BOUNDED: a stimulus between nothing and all.
export const BOUNDED = Object.freeze({
  pos : s => clamp(s),
  val : v => clamp(v),
  gate : cell => activationLevel(unitOfPlan(cell.threshold)),
  spread : cell => 2 * cell.distribution.spread_physiology * LEVEL_SPAN,
  span : LEVELS,
  threshold : v => planOfUnit(activationQuality(clamp(v, LEVELS[0], LEVELS[1]))),
  spreading : spread => clamp(spread / (2 * LEVEL_SPAN), 0, 1)
});
// INTENSITY: a stimulus without upper bound (scent, flow), on a logarithmic scale from the
// faintest threshold a cell can have (0) to a stimulus of one (1); a threshold is threshold_min
// x threshold_range ^ quality (receptor_tuning.hh, response_threshold), so it lies at REACH x
// its quality.
const FAINTEST = TUNING.threshold_min,
      REACH = Math.log(TUNING.threshold_range) / -Math.log(FAINTEST);
export const INTENSITY = Object.freeze({
  pos : s => s > FAINTEST ? clamp(1 - Math.log(s) / Math.log(FAINTEST)) : 0,
  val : v => v > 0 ? Math.exp(Math.log(FAINTEST) * (1 - clamp(v))) : 0,
  gate : cell => REACH * unitOfPlan(cell.threshold),
  spread : cell => 2 * cell.distribution.spread_physiology * REACH,
  span : [ 0, REACH ],
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
// What the fish panel's probe gives a sense over the steps, in the stimulus's own units: a
// stimulus that stays as it is, or a wound made at a step that closes by `heals` each step.
export const steady = level => Array(STEPS + 1).fill(level);
export const closingWound = (depth, at, heals) => Array.from(
    {length : STEPS + 1}, (_, st) => st < at ? 0 : Math.max(0, depth - (st - at) * heals));
// The step at which a key's last cell falls silent: past the course's steps if it never does, 0
// if no cell ever sends.
export function silentOf(sent) {
  const first = sent.findIndex(v => v > 0);
  if (first < 0)
    return 0;
  const silent = sent.findIndex((v, st) => st > first && v <= 0);
  return silent < 0 ? sent.length : silent;
}
// The engine's courses for one inspector: courses(studio, tries), with a try for each key, {id :
// its cell, stimulus : what its cells meet step by step}. It asks the engine once for each new set
// of tries (design.js, trySenseCourses) and gives for each try what its cells send (`sent`, a
// share of what they can), what they are used to (`used`, in the stimulus's units), their
// thresholds (`cells`) and when the last falls silent (`silent`), or null where the key has no
// cells. Until the engine answers new tries the last answer stands, `stale`; before the first
// there is none.
export const lastCourses = owner => {
  let last = null;
  return (studio, tries) => {
    const doc = studio.state.document;
    const asked = tries.map(({id, stimulus}) => ({
                              group : centerIndex(doc, id),
                              stimulus : stimulus.map(v => +Math.max(0, v).toPrecision(5))
                            })),
          key = owner + JSON.stringify(asked);
    studio.trySenseCourses(key, asked);
    const report = studio.state.outlinePreview ?? studio.state.anatomy;
    if (report?.senseCourseKey === key && report.senseCourses?.length === tries.length)
      last = report.senseCourses.map(c => c && {...c, silent : silentOf(c.sent)});
    else if (last?.length !== tries.length)
      return null;
    const stale = report?.senseCourseKey !== key;
    return last.map(c => c && {...c, stale});
  };
};
// The pace of tiring that puts the step at which the cells fall silent where it is wanted, from
// the pace and that step when the grip was taken: the step moves with the pace, as it does for a
// steady input; the engine's course then shows where it is.
export const usedFor = (k, silent, step) =>
    clamp(k.used * Math.max(1, step) / Math.max(1, silent), USED[0], USED[1]);
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
// Where the plan lets a key's cells' thresholds lie, as places in the diagram: its threshold and
// half its spread either way, within the thresholds a cell can have (distribution.hh,
// draw_traits).
export const bandOf = (k, scale = BOUNDED) => [Math.max(scale.span[0], k.gate - k.spread / 2),
                                               Math.min(scale.span[1], k.gate + k.spread / 2)];
export const setGate = (doc, k, gate, scale = BOUNDED) =>
    updateCenter(doc, k.id, {threshold : scale.threshold(gate)});
export const setSpread = (doc, k, spread, scale = BOUNDED) =>
    updateCellDistribution(doc, k.id, 'spread_physiology', scale.spreading(spread));
export const setUsed = (doc, k, steps) =>
    updateCenter(doc, k.id, {tau : adaptationOf(clamp(steps, USED[0], USED[1]))});
export const keyGrip = (i, on) => 'aid-live-keygrip k' + i + (on ? ' on' : '');

// One sense's course: the nerve cells, and under them one diagram over the steps: the input;
// left of it what holds the thresholds, filling with the input, with a grip for each key; each
// key's dashed line and band across the input; for the chosen key what its cells still feel as
// they tire and, filled, what they send.
// `own`: which key is chosen, kept by the inspector; `keys()`: the keys now; `input()`: the
// stimulus step by step in native units, as the fish panel's probe gives it (steady, or
// closingWound); `share(k)`: what a key's cells meet of the input, if not all of it; `colour()`:
// the input's colour, if it changes; `fewer(k)`, `more(gate)`: the keys' pair of buttons; `most`:
// how many keys there may be; `scale`: the stimulus's scale; `mark`: a height named on the
// input's scale; `studio`: whom the engine's courses are asked of. Returns draw(), and what the
// clock moves: moment(step), pulse(dt, step).
export function senseCourse(svg, {
  studio,
  name,
  own,
  tires,
  most = 3,
  mark = null,
  scale = BOUNDED,
  words,
  keys : keysNow,
  input,
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
  const coursesOf = lastCourses(name);
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
    const keys = keysNow(), {L, R, LX, I0, I1} = SENSE_BOX;
    const {live} = picture(svg, I1 + 22);
    Object.assign(play,
                  {stim : null, sent : [], line : null, level : null, glow : [], nerves : null});
    if (!keys.length)
      return;
    own.chosen = clamp(own.chosen, 0, keys.length - 1);
    live.setAttribute('class', 'aid-live-sense-' + name);
    if (colour)
      live.style.color = colour();
    const given = input(), offered = given.map(scale.pos);
    // What each key's cells meet of the input: all of it, or the share their sense gives them.
    play.offered = offered;
    const met = keys.map(k => {
      const fraction = share ? share(k) : 1;
      return given.map(v => v * fraction);
    }),
          stim = play.stim = met[own.chosen].map(scale.pos);
    const IY = v => I1 - (I1 - I0) * clamp(v), vOf = y => clamp((I1 - y) / (I1 - I0));
    const X = st => L + (R - L) * st / STEPS,
          stOf = x => clamp(Math.round((x - L) / (R - L) * STEPS), 0, STEPS);
    const runs = coursesOf(studio, keys.map((k, i) => ({id : k.id, stimulus : met[i]}))) ??
                 keys.map(() => null);
    play.sent = runs.map(r => r?.sent ?? []);
    // Where a key's cells send nothing more, and the grips' way of moving it.
    const ends = runs.map(r => r?.silent ?? 0);
    const tire = (k, i, p) => {
      own.chosen = i;
      draft(setUsed(doc(), k, usedFor(k, ends[i], stOf(p.x))));
    };
    const choose = i => () => {
      own.chosen = i;
      redraw();
    };
    const newGate = () => clamp((Math.max(...keys.map(k => k.gate)) + 1) / 2, .05, .95);
    nerves(live, keys, i => X(clamp(ends[i], 0, STEPS)), tire);
    // The same pair twice: at the cells and at the keys (under their holder).
    // A sense with one type of cells only has no pair.
    if (most > 1) {
      chip(live, R - 22, I0 - 54, '−', () => fewer(keys[own.chosen]), keys.length > 1, 6);
      chip(live, R - 6, I0 - 54, '+', () => more(newGate()), keys.length < most, 6);
    }
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
    // Where the cells get only a share of the input, the whole input stands behind it as an
    // outline: its knobs lie on that.
    if (share)
      el('path',
         {d : path(offered.map((v, st) => [X(st), IY(v)])), class : 'aid-live-sense-offered'},
         live);
    el('path', {
      d : path(stim.map((v, st) => [X(st), IY(v)])) + ` L${R} ${I1} L${L} ${I1} Z`,
      class : 'aid-live-sense-input'
    },
       live);
    keys.forEach((k, i) => {
      const run = runs[i], on = i === own.chosen,
            gates = run ? run.cells.map(scale.pos) : [ k.gate ], low = Math.min(...gates),
            felt = run?.used.map((u, st) => scale.pos(Math.max(0, met[i][st] - u)));
      // The key's band: where the plan lets its cells' thresholds lie. In it a line for each
      // cell's threshold as the engine drew it, pale while they are the last run's.
      const [under, over] = bandOf(k, scale), top = IY(over), bottom = IY(under),
                    shapes = [ el('rect', {
                      x : L,
                      y : Math.min(top, IY(k.gate) - 1.5),
                      width : R - L,
                      height : Math.max(bottom - top, 3),
                      class : 'aid-live-keyband rule k' + i + (on ? ' on' : '')
                    },
                                  live) ];
      if (on && felt)
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
      // The band is only its edges, so that what the cells feel stays to be read in it; at the
      // axis a short filled strip of its height.
      if (bottom > top)
        el('rect',
           {x : L, y : top, width : 5, height : bottom - top, class : 'aid-live-keystrip k' + i},
           live);
      if (run)
        for (const gate of gates)
          el('path', {
            d : `M${L} ${IY(gate)} H${R}`,
            class : 'aid-live-keyline cell k' + i + (run.stale ? ' stale' : '')
          },
             live);
      if (tires && on && felt)
        el('path', {d : path(felt.map((f, st) => [X(st), IY(f)])), class : 'aid-live-felt'}, live);
      const line = el('path', {
        d : `M${LX + 12} ${IY(k.gate)} H${R}`,
        class : 'aid-live-keyline k' + i + (on ? ' on' : '')
      },
                      live);
      play.glow.push({line, gate : scale.val(k.gate), met : met[i]});
    });
    el('path', {d : `M${L} ${I0 - 2} V${I1} H${R}`, class : 'aid-live-axis'}, live);
    // A height the input's scale is read by.
    if (mark) {
      el('path', {d : `M${R - 12} ${IY(mark.at)} H${R}`, class : 'aid-live-sense-mark'}, live);
      txt(live, R - 15, IY(mark.at) - 5, mark.word,
          {'text-anchor' : 'end', class : 'aid-live-onground'});
    }
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
        if (at <= STEPS && met[i][at] > Math.min(...runs[i].cells))
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
      const on = i === own.chosen;
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
      // How far the cells' thresholds may spread: the grip in the middle of the band's upper
      // edge; away from the threshold either way widens the band.
      const sx = (L + R) / 2 + 13 * i, top = IY(bandOf(k, scale)[1]);
      drag(svg,
           el('rect',
              {x : sx - 5, y : top - 4, width : 10, height : 8, rx : 2.5, class : keyGrip(i, on)},
              live),
           p => {
             own.chosen = i;
             draft(setSpread(doc(), k, clamp(2 * Math.abs(vOf(p.y) - k.gate), 0, .8), scale));
           },
           name + 'spread' + i, 'grip', settle);
    });
    if (most > 1) {
      chip(live, LX - 9, I1 + 10, '−', () => fewer(keys[own.chosen]), keys.length > 1, 6);
      chip(live, LX + 9, I1 + 10, '+', () => more(newGate()), keys.length < most, 6);
    }
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
  // What the input is at a step, and what the chosen key's cells send of it.
  const offeredAt = step => play.offered ? between(play.offered, step) : 0,
        sentAt = step => play.sent[own.chosen]?.[Math.round(step)] ?? 0;
  return {draw, moment, pulse, offeredAt, sentAt};
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
  least : .08
});
// `hatch`: the maturity at which the plan's fish hatches (kit.js, hatchOf).
export function typeLife(
    svg, {name, own, phases, egg, words, hatch : hatches, set, draft, settle, redraw}) {
  const {L, R, top, base, icons, beside, whole, least} = LIFE, hatchX = L + (R - L) * hatches;
  const {under, live} = picture(svg, LIFE.height, fixed => {
    txt(fixed, L - beside, top - 3, words.egg, {class : 'aid-live-small'});
    txt(fixed, R + beside, top - 3, words.grown, {class : 'aid-live-small', 'text-anchor' : 'end'});
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
  }, hatches);
  const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L)),
        high = (base - top - 20) / Math.max(1, phases.length);
  el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-ground'},
     under);
  phases.forEach((phase, i) => {
    const on = i === own.chosen, from = phase.start ?? 0, until = Math.min(1, phase.end ?? 1),
          y = top + 18 + high * i, hatch = clamp(hatches, from, until);
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
