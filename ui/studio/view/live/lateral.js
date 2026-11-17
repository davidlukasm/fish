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
// current lasts. What the cells meet of the current, what they send of it over the steps and
// where their thresholds lie is the engine's course for this current (sense.js, lastCourses).
// Not in the picture: sediment; the fish's own speed and turning apart from the water's.
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {findOrgan, groupReport} from '../../model/document.js';
import {
  addPicture,
  clamp,
  drag,
  el,
  liveKind,
  path,
  picture,
  reportBubble,
  squareGrip,
  txt
} from './kit.js';
import {
  bandOf,
  INTENSITY,
  keysOf,
  fadingWay,
  lastCourses,
  paceMatters,
  setGate,
  setSpread,
  setUsed,
  steady,
  STEPS,
  usedFor
} from './sense.js';

const word = (key, values) => t('studio.live.lateral.' + key, values);
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
  hair : 50,
  lean : 72,
  tick : 4,
  loud : 34,
  gap : 14,
  first : 74,
  apart : 34,
  bubble : 12,
  marks : [ 300, 600, 900 ],
  least : .03
});
liveKind('lateral', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-lateral aid-live-sense-flow';
  const band = addPicture(root);
  let shown = null;
  const coursesOf = lastCourses('lateral');
  const current = () => studio.state.senseProbe?.kind === 'flow' ? studio.state.senseProbe : null;
  const organ = () => findOrgan(studio.state.document, organId);
  // The engine answers the course of the cells while a grip is dragged (sense.js, lastCourses).
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive', 'course');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The current over the steps as the cells meet it (the engine's, for the fish panel's probe:
  // sense.js, lastCourses), what they send, and when they have got used to it and fall silent.
  // Before the engine's first answer the hairs stand for the plan's one threshold.
  function courseOf(cell) {
    const key = keysOf([ {id : '', centers : [ cell ]} ], INTENSITY)[0];
    const run =
        coursesOf(studio, [ {id : key.id, probe : true, stimulus : steady(1)} ])?.[0] ?? null;
    const met = steady(current() ? run?.probe ?? 0 : 0);
    return {
      key,
      met,
      sent : run?.sent ?? [],
      run,
      silent : run?.silent ?? 0,
      faded : run?.faded ?? 0,
      gates : run ? run.cells : [ INTENSITY.val(key.gate) ],
      stale : !run || run.stale
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
          gates = c.gates,
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
        class : 'aid-live-keytick k0' + (c.stale ? ' stale' : '')
      },
         live);
      hair(x, bend, {class : 'aid-live-hair k0'});
    });
    // How far the marks may spread: the grip at the far end of the last hair's arc.
    if (gates.length) {
      const x = stand(gates.length - 1), [ sx, sy ] = tip(x, far);
      drag(svg,
           squareGrip(live, sx, sy, {class : 'aid-live-keygrip k0 on'}),
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
         squareGrip(live, gx, gy, {class : 'aid-live-keygrip k0 on'}),
         p => draft(setGate(studio.state.document, c.key, leanOf(p, B.L), INTENSITY)),
         'lateralgate', 'grip', settle);
    // What the cells send, under the skin, over the same steps.
    if (c.sent.length)
      el('path', {
        d : path(c.sent.filter((_, st) => st % every === 0)
                     .map((v, n) => [X(n * every), floor + B.loud * clamp(v)])) +
                ` L${X(STEPS)} ${floor} L${B.L} ${floor} Z`,
        class : 'aid-live-glow k0',
        opacity : .55
      },
         live);
    // Where they have got used to the current: the hairs still lean, the cells are silent.
    if (c.silent > 0 && c.silent < STEPS) {
      const sx = X(c.silent);
      el('path', {d : `M${sx} ${floor} V${floor + B.loud}`, class : 'aid-live-keymark k0'}, live);
      txt(live, sx + 5, floor + B.loud, word('used'), {class : 'aid-live-small'});
    }
    // How fast they get used: the grip where their report has faded to half (sense.js, fadedAt),
    // where the pace moves it at all.
    if (c.faded > 0 && paceMatters(c.run, STEPS)) {
      const [early, late] = fadingWay(c.run, STEPS);
      el('path', {d : `M${X(early)} ${floor + B.loud} H${X(late)}`, class : 'aid-live-track-line'},
         live);
      drag(svg, squareGrip(live, X(Math.min(c.faded, STEPS)), floor + B.loud),
           p => {
             const used = usedFor(c.run, stOf(p.x));
             if (used)
               draft(setUsed(studio.state.document, c.key, used));
           },
           'lateralused', 'grip', settle);
    }
    for (const st of B.marks)
      txt(live, X(st), B.height - 4, String(st), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, B.L, B.height - 4, word('steps'), {class : 'aid-live-small'});
    // The report as the fish panel shows it, the engine's own number, above the hairs.
    const said = groupReport(studio.state.document, studio.state.anatomy, 'senseProbe', cell.id);
    if (Number.isFinite(said))
      reportBubble(live, B.bubble)(stand((gates.length - 1) / 2),
                                   B.skin - B.water - B.bubble - 4, said);
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    const {anatomy, outlinePreview} = studio.state;
    const keys =
        [ cell, current(), (outlinePreview ?? anatomy)?.senseCourses, anatomy?.senseProbe ];
    if (shown?.every((value, i) => value === keys[i]))
      return;
    shown = keys;
    draw(cell);
  }
  return {root, show};
});
