// The lateral line's live inspector: hairs in the water over time. The current bends them for
// as long as it lasts; what their cells report of it shrinks as they get used to it.
// Read in the engine (body_plan.cc, the skin cells' wedge of weights and the flow stimulus;
// embryo.cc; brain_interface.hh, intensity_sense): the body's rim has 16 sectors; the cells weigh
// them by a wedge round their own place, 22.5 to 180 degrees wide, the weights summing to one.
// Their stimulus is, summed over the sectors by weight, the water's speed against the fish there
// as far as it comes against the cells' own place. It has no upper bound, and the cells get used
// to it. In the egg they feel the fluid the embryo's own twitches move.
// The current is the fish panel's probe (probes.js), its direction and its speed; it reaches
// every sector as far as that faces it (werkzeug/atelier.cc, the flow scene). The fish, the water
// round it, the cells' places and the grip for the field's width are the fish panel's too
// (body.js, feltFlow; anatomy_handles.js); here is only what it cannot show: the time the
// current lasts. The weights are the plan's report (anatomy.lateral); what the cells send over
// the steps is reckoned with the engine's rule for an unbounded stimulus and for getting used
// (sense.js, INTENSITY and runOf).
// Not in the picture: sediment; the fish's own speed and turning apart from the water's.
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {findOrgan, groupReport} from '../../model/document.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, reportBubble, txt} from './kit.js';
import {
  bandOf,
  between,
  lastDrawn,
  INTENSITY,
  keysOf,
  runOf,
  setGate,
  setSpread,
  setUsed,
  silentStep,
  steady,
  STEPS,
  usedFor
} from './sense.js';
import {sectorAngle} from './skin.js';

const word = (key, values) => t('studio.live.lateral.' + key, values);
const ROUND_MS = 12000;
// The band: steps from L to R; the skin's line with the hairs on it, the water above it, `water`
// high; under the skin the report, `loud` high when all cells send. A hair leans by up to `lean`
// degrees, for the strongest current the scale knows.
const BAND = Object.freeze({
  height : 204,
  L : 34,
  R : 288,
  skin : 112,
  water : 62,
  lines : 7,
  hair : 36,
  lean : 72,
  tick : 4,
  loud : 34,
  gap : 14,
  first : 34,
  apart : 34,
  bubble : 12,
  marks : [ 300, 600, 900 ],
  least : .03
});
liveKind('lateral', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-lateral aid-live-sense-flow';
  const band = addPicture(root);
  let step = 0, bubble = null, shown = null;
  const drawnOf = lastDrawn();
  const current = () => studio.state.senseProbe?.kind === 'flow' ? studio.state.senseProbe : null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // What the cells meet of the current: each sector as far as it faces the water, by the cells'
  // weight, and as far as the water comes against the cells' own place (where their weights
  // point).
  function share(cell, probe) {
    const weights =
        groupReport(studio.state.document, studio.state.anatomy, 'lateral', cell.id)?.weights;
    if (!weights || !probe)
      return 0;
    const count = weights.length, at = k => radians(sectorAngle(k, count));
    const place = degrees(Math.atan2(weights.reduce((sum, v, k) => sum + v * Math.sin(at(k)), 0),
                                     weights.reduce((sum, v, k) => sum + v * Math.cos(at(k)), 0)));
    const met = weights.reduce(
        (sum, v, k) => sum + v * Math.max(0, Math.cos(at(k) - radians(probe.bearing))), 0);
    return met * Math.max(0, Math.cos(radians(probe.bearing - place)));
  }
  // The current over the steps as the cells meet it, what they send, and when they have got
  // used to it and fall silent.
  function courseOf(cell) {
    const probe = current(),
          key = drawnOf(studio.state, keysOf([ {id : '', centers : [ cell ]} ], INTENSITY)[0],
                        INTENSITY);
    const met = steady((probe?.strength ?? 0) * share(cell, probe));
    return {
      key,
      met,
      sent : runOf(key, met, true, INTENSITY).sent,
      silent : silentStep(key, met, INTENSITY)
    };
  }
  function draw(cell) {
    const B = BAND, {svg, under, live} = picture(band, B.height), c = courseOf(cell);
    const X = st => B.L + (B.R - B.L) * st / STEPS,
          stOf = x => clamp(Math.round((x - B.L) / (B.R - B.L) * STEPS), 0, STEPS),
          bend = INTENSITY.pos(c.met[0]), floor = B.skin + B.gap, every = 4;
    // A hair standing at x, leaning downstream by a share of the full lean.
    const tip = (x, lean) => [x + B.hair * Math.sin(radians(B.lean * lean)),
                              B.skin - B.hair * Math.cos(radians(B.lean * lean))];
    const hair = (x, lean, more) => {
      const [tx, ty] = tip(x, lean);
      return el('path', {d : `M${x} ${B.skin} Q${x} ${B.skin - B.hair * .55} ${tx} ${ty}`, ...more},
                live);
    };
    el('rect', {
      x : B.L,
      y : B.skin,
      width : B.R - B.L,
      height : B.loud + 2 * B.gap + 4,
      class : 'aid-live-flesh'
    },
       under);
    // The water: the stronger the current against the cells, the more of its lines.
    const lines = Math.round(B.lines * bend);
    for (let n = 0; n < lines; n++) {
      const y = B.skin - 8 - (B.water - 8) * (n + .5) / B.lines;
      el('path', {
        d : `M${B.L} ${y} H${B.R - 6} m-5 -3 l5 3 l-5 3`,
        class : 'aid-live-water',
        opacity : .35 + .5 * bend
      },
         live);
    }
    el('path', {d : `M${B.L} ${B.skin} H${B.R}`, class : 'aid-live-skinline'}, live);
    // The hairs, one for each cell the engine drew, a group at the start, `apart` from each
    // other and closer if they are many; they stand for cells, not for steps: the steps are the
    // report's, below the skin. The current bends them all alike. On each hair's arc the mark where
    // its own cell begins to report, pale while it is the last run's; a hair past its mark reports.
    // The thicker arc is where the plan lets a mark lie: its threshold and its spread either way,
    // within the thresholds a cell can have.
    const most = INTENSITY.span[1], [ low, far ] = bandOf(c.key, INTENSITY),
          near = Math.max(B.least, low),
          leanOf = (p, x) =>
              clamp(degrees(Math.atan2(p.x - x, B.skin - p.y)) / B.lean, B.least, most),
          arc = (x, from, to) =>
              path(Array.from({length : 9}, (_, n) => tip(x, from + (to - from) * n / 8))),
          gates = INTENSITY.gates(c.key),
          stand = n =>
              B.L + B.first +
              n * Math.min(B.apart, (B.R - B.L - B.first - B.hair) / Math.max(1, gates.length - 1));
    gates.forEach((gate, n) => {
      const x = stand(n), at = radians(B.lean * INTENSITY.pos(gate));
      if (far > near)
        el('path', {d : arc(x, near, far), class : 'aid-live-keyarc k0'}, live);
      el('path', {
        d : `M${x + (B.hair - B.tick) * Math.sin(at)} ${
            B.skin - (B.hair - B.tick) * Math.cos(at)} L${x + (B.hair + B.tick) * Math.sin(at)} ${
            B.skin - (B.hair + B.tick) * Math.cos(at)}`,
        class : 'aid-live-keytick k0' + (c.key.stale ? ' stale' : '')
      },
         live);
      hair(x, bend, {class : 'aid-live-hair k0'});
    });
    // How far the marks may spread: the grip at the far end of the last hair's arc.
    if (gates.length) {
      const x = stand(gates.length - 1), [ sx, sy ] = tip(x, far);
      drag(svg,
           el('rect', {
             x : sx - 5,
             y : sy - 4,
             width : 10,
             height : 8,
             rx : 2.5,
             class : 'aid-live-keygrip k0 on'
           },
              live),
           p => draft(setSpread(studio.state.document, c.key,
                                2 * Math.max(0, leanOf(p, x) - c.key.gate), INTENSITY)),
           'lateralspread', 'grip', settle);
    }
    // The plan's threshold: the dashed hair at the start, with the grip at its tip. The arc is the
    // way its tip can go, from upright to the highest threshold a cell can have.
    el('path', {d : arc(B.L, B.least, most), class : 'aid-live-track-line'}, live);
    hair(B.L, c.key.gate, {class : 'aid-live-keyline k0'});
    const [gx, gy] = tip(B.L, c.key.gate);
    drag(svg,
         el('rect', {
           x : gx - 5,
           y : gy - 5,
           width : 10,
           height : 10,
           rx : 2.5,
           class : 'aid-live-keygrip k0 on'
         },
            live),
         p => draft(setGate(studio.state.document, c.key, leanOf(p, B.L), INTENSITY)),
         'lateralgate', 'grip', settle);
    // What the cells send, under the skin, over the same steps.
    el('path', {
      d : path(c.sent.filter((_, st) => st % every === 0)
                   .map((v, n) => [X(n * every), floor + B.loud * clamp(v)])) +
              ` L${X(STEPS)} ${floor} L${B.L} ${floor} Z`,
      class : 'aid-live-glow k0',
      opacity : .55
    },
       live);
    // Where they have got used to the current: the hairs still lean, the cells are silent. The
    // grip there sets how fast they get used.
    if (c.silent > 0 && c.silent < STEPS) {
      const sx = X(c.silent);
      // The way the grip can go.
      el('path', {d : `M${B.L} ${floor + B.loud} H${B.R}`, class : 'aid-live-track-line'}, live);
      el('path', {d : `M${sx} ${floor} V${floor + B.loud}`, class : 'aid-live-keymark k0'}, live);
      txt(live, sx + 5, floor + B.loud, word('used'), {class : 'aid-live-small'});
      drag(svg, el('circle', {cx : sx, cy : floor + B.loud, r : 5}, live),
           p => draft(
               setUsed(studio.state.document, c.key, usedFor(c.key, c.met, stOf(p.x), INTENSITY))),
           'lateralused', 'grip', settle);
    }
    for (const st of B.marks)
      txt(live, X(st), B.height - 4, String(st), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, B.L, B.height - 4, word('steps'), {class : 'aid-live-small'});
    // The report now, as the fish panel shows it: a bubble that moves along the steps, above the
    // water.
    const place = reportBubble(live, B.bubble);
    bubble = at => place(X(at), B.skin - B.water - B.bubble - 4, between(c.sent, at));
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    const keys = [ cell, current(), studio.state.anatomy?.lateral, studio.state.senseSpread ];
    if (shown?.every((value, i) => value === keys[i]))
      return;
    shown = keys;
    draw(cell);
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    bubble?.(step);
  }
  return {root, show, tick};
});
