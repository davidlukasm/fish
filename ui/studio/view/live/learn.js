// A learning cell's live inspector: one of its contacts over two rounds of one example. A
// sender fires with the cell, the trace of that on the contact fades, the teacher comes, the
// contact's weight steps up; in the second round the cell expects the teacher, and the step is
// the smaller for it.
// Read in the engine (colony-core/field/substrate.cc, evaluate; dynamics.hh, plasticity;
// werkzeug/atelier_learning.hh, learning_group_report; koordination entwuerfe/LERNEN-ENGINE.md):
// the trace keeps what the sender and the cell did together, a share less each step; the weight
// changes by the cell's learning rate x the teacher's surprise x the trace; what the cell
// expects of the teacher is no surprise.
// An ESTIMATE, as the engine gives it for the plan's cell at the life tool's blood
// (anatomy.groups, learning): the share of the trace kept each step and the steps to 1/e of it;
// for this example the two steps of the weight, without and with the expectation, what firing
// together alone does to the contact and to a still one beside it, and the share of each that
// stays between the rounds; the contact's limit. No brain is built and nothing runs. Both
// contacts start at half their limit and have no past. Only the lines between those values are
// drawn here: the trace as that share step after step, the weight evenly down to what stays.
// The example's knobs (round) are inputs: when the teacher comes after the sender, how much of
// it the cell expects in the second round. The cell's grips (square) are its settings: how long
// the trace lasts, how fast the cell learns, how it treats what does not fire with it.
// Not in the picture: consolidation; the making and loss of contacts.
import {t} from '../../../strings.js';
import {findCenter, groupReport, updateCenter} from '../../model/document.js';
import {PORT_LIMIT_DRAG} from '../circuit.js';
import {
  addPicture,
  clamp,
  drag,
  el,
  GRIP,
  liveKind,
  path,
  picture,
  roundGrip,
  squareGrip,
  txt
} from './kit.js';

const word = key => t('studio.live.learn.' + key);
// The strip: two rounds from L to R, `round` steps each; four rows, each `row` high with its
// base line at the given height.
const STRIP = Object.freeze({
  height : 290,
  L : 40,
  R : 292,
  round : 200,
  row : 22,
  cue : 44,
  trace : 80,
  teach : 126,
  cell : 176,
  expect : 36,
  weight : 250,
  rise : 56,
  least : .02
});
liveKind('learn', (studio, centerId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-learn';
  const strip = addPicture(root);
  // The example tried on the cell: when the sender fires and the teacher comes in a round, and
  // how far the second round's teacher is expected.
  // Until its knob is moved the teacher comes a quarter of the cell's learning time after the
  // sender, where the trace still teaches.
  const probe = {cue : 30, teach : null, expected : .5};
  const center = () => findCenter(studio.state.document, centerId)?.center;
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + centerId, 'refreshLive', 'learning');
  const settle = () => studio.drafted && studio.settleGraphic();
  const ask = () => probe.teach !== null && studio.setLearnProbe(centerId, probe.teach - probe.cue,
                                                                 probe.expected, STRIP.round);
  function draw(cell) {
    const S = STRIP, {svg, live} = picture(strip, S.height), n = 2 * S.round,
          report = studio.state.outlinePreview ?? studio.state.anatomy,
          L = groupReport(studio.state.document, report, 'groups', centerId)?.learning,
          known = report?.learnProbe === studio.state.learnProbe &&
                  report?.learnProbe?.center === centerId && L?.step1 !== undefined;
    const X = st => S.L + (S.R - S.L) * st / n,
          stOf = x => clamp(Math.round((x - S.L) / (S.R - S.L) * n), 0, n), rounds = [ 0, S.round ],
          pulse = (at, base, high) =>
              rounds.map(from => `M${X(from + at)} ${base} v${-high}`).join(' ');
    for (const [key, y] of [[ 'cue', S.cue ], [ 'trace', S.trace ], [ 'teach', S.teach ],
                            [ 'cell', S.cell ], [ 'contact', S.weight - S.rise / 2 ]])
      txt(live, 2, y - 4, word(key), {class : 'aid-live-small'});
    el('path', {d : `M${X(S.round)} 14 V${S.weight + 4}`, class : 'aid-live-axis'}, live);
    txt(live, S.L + 2, 12, word('first'), {class : 'aid-live-small'});
    txt(live, X(S.round) + 3, 12, word('second'), {class : 'aid-live-small'});
    if (probe.teach === null) {
      // The engine has not answered for this cell yet: there is no example to show.
      for (const y of [S.cue, S.trace, S.teach, S.cell, S.weight])
        el('path', {d : `M${S.L} ${y} H${S.R}`, class : 'aid-live-turn missing'}, live);
      return;
    }
    // The sender's firing and the teacher; under them the cell, and in the second round how much
    // of the teacher it expects.
    el('path', {d : pulse(probe.cue, S.cue, S.row - 8), class : 'aid-live-cue k0'}, live);
    el('path', {d : pulse(probe.teach, S.teach, S.row - 6), class : 'aid-live-teach'}, live);
    const ey = S.cell - S.expect * probe.expected;
    el('path', {d : `M${S.L} ${S.cell} H${S.R}`, class : 'aid-live-axis'}, live);
    el('path', {d : `M${X(S.round)} ${ey} H${S.R}`, class : 'aid-live-teach expected'}, live);
    txt(live, X(S.round) + 3, S.cell + 10, word('expected'), {class : 'aid-live-small'});
    el('path', {d : `M${S.L} ${S.trace} H${S.R}`, class : 'aid-live-axis'}, live);
    el('path', {d : `M${S.L} ${S.weight} H${S.R}`, class : 'aid-live-axis'}, live);
    for (const st of [100, 200, 300, 400])
      txt(live, X(st), S.height - 8, String(st), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, S.L, S.height - 8, word('steps'), {class : 'aid-live-small'});
    // The example's knobs: when the teacher comes, how far it is expected.
    drag(svg, roundGrip(live, X(probe.teach), S.teach - (S.row - 6) - GRIP / 2), p => {
      probe.teach = clamp(stOf(p.x), probe.cue + 1, S.round - 10);
      ask();
      show();
    }, 'learnteach', 'knob');
    drag(svg, roundGrip(live, S.R - 6, ey), p => {
      probe.expected = clamp((S.cell - p.y) / S.expect);
      ask();
      show();
    }, 'learnexpected', 'knob');
    if (!L) {
      // The engine has not answered for this cell: nothing to show of its learning.
      el('path', {d : `M${S.L} ${S.trace - S.row / 2} H${S.R}`, class : 'aid-live-turn missing'},
         live);
      el('path', {d : `M${S.L} ${S.weight - S.rise / 2} H${S.R}`, class : 'aid-live-turn missing'},
         live);
      return;
    }
    // The trace: full when the sender fires with the cell, a share less with every step.
    const fade = at => Math.pow(L.traceKeep, at), trace = rounds.map(from => {
      const pts = [];
      for (let at = probe.cue; at <= S.round; at += 2)
        pts.push([ X(from + at), S.trace - S.row * fade(at - probe.cue) ]);
      return path(pts) + ` L${X(from + S.round)} ${S.trace} L${X(from + probe.cue)} ${S.trace} Z`;
    });
    el('path', {d : trace.join(' '), class : 'aid-live-glow k0', opacity : .5}, live);
    // How long the trace lasts: the grip where it has fallen to 1/e. Right makes it last longer.
    const tx = X(Math.min(S.round - 4, probe.cue + L.traceSteps));
    drag(svg,
         squareGrip(live, tx, S.trace - S.row / Math.E, {class : 'aid-live-keygrip k0 on'}),
         (p, from) => draft(updateCenter(
             studio.state.document, centerId,
             {learning_tau : clamp(cell.learning_tau + (p.x - from.x) / (2 * PORT_LIMIT_DRAG))})),
         'learntime', 'grip', settle);
    // The contact's weight against its limit, from a start at half of it: the two steps the
    // engine estimates for this example; between them what an unused contact loses each step.
    // Under it a still input from the same start, losing as much.
    const limit = L.limits.electrical,
          Y = w => S.weight - S.rise * (limit > 0 ? clamp(w / limit) : 0),
          start = limit / 2;
    el('path', {d : `M${S.L} ${Y(limit)} H${S.R}`, class : 'aid-live-track-line'}, live);
    // A contact through the two rounds: what firing together does to it at the sender's firing
    // (`fires`), the teacher's step (`steps`), and between the rounds the share of it that stays
    // (`stays`) - the engine's values at those moments; between them the line runs evenly down
    // to what stays. It ends with the second teacher: the engine says nothing of what follows.
    // Each jump is drawn in the colour of what causes it.
    const last = S.round + probe.teach + 6, course = (fires, steps, stays) => {
      const pts = [], jumps = [], keep = Math.pow(stays, 2 / S.round);
      let w = start;
      const jump = (st, by, cause) => {
        const to = clamp(w + by, 0, limit);
        if (to !== w)
          jumps.push({d : `M${X(st)} ${Y(w)} V${Y(to)}`, cause});
        w = to;
      };
      for (let st = 0; st <= last; st += 2) {
        const at = st % S.round;
        if (at >= probe.cue && at < probe.cue + 2)
          jump(st, fires, 'cue');
        if (at >= probe.teach && at < probe.teach + 2)
          jump(st, steps[st >= S.round ? 1 : 0], 'teach');
        else
          w *= keep;
        pts.push([ X(st), Y(w) ]);
      }
      return {pts, jumps};
    };
    if (!known) {
      el('path', {d : `M${S.L} ${Y(start)} H${S.R}`, class : 'aid-live-turn missing'}, live);
      return;
    }
    const still = course(L.quietChange, [ 0, 0 ], L.quietKeptBetween),
          learnt = course(L.coactiveChange, [ L.step1, L.step2 ], L.keptBetween), quiet = still.pts,
          weight = learnt.pts;
    el('path', {d : path(quiet), class : 'aid-live-quiet'}, live);
    el('path', {d : path(weight), class : 'aid-live-weight'}, live);
    for (const {d, cause} of [...still.jumps, ...learnt.jumps])
      el('path', {d, class : cause === 'cue' ? 'aid-live-cue jump k0' : 'aid-live-teach jump'},
         live);
    txt(live, S.R, quiet.at(-1)[1] + 11, word('quiet'),
        {'text-anchor' : 'end', class : 'aid-live-small'});
    // How fast the cell learns: the grip on the first step's top. Up makes it learn faster.
    const [wx, wy] = weight[Math.min(weight.length - 1, Math.ceil((probe.teach + 12) / 2))];
    drag(svg,
         squareGrip(live, wx, wy, {class : 'aid-live-keygrip k0 on'}),
         (p, from) => draft(updateCenter(
             studio.state.document, centerId,
             {qwidth : clamp(cell.qwidth + (from.y - p.y) / PORT_LIMIT_DRAG, S.least, 1)})),
         'learnrate', 'grip', settle);
    // How the cell treats what does not fire with it: the grip on the still input just after
    // the sender has fired. Down, the cell pushes the still input out; up, it leaves it and
    // cancels what fires with it instead.
    const [qx, qy] = quiet[Math.ceil((S.round - 3 * GRIP) / 2)];
    drag(svg,
         squareGrip(live, qx, qy, {class : 'aid-live-keygrip k0 on'}),
         (p, from) => draft(updateCenter(
             studio.state.document, centerId,
             {mode : clamp((cell.mode ?? 0) + 2 * (p.y - from.y) / PORT_LIMIT_DRAG, -1, 1)})),
         'learnmode', 'grip', settle);
  }
  function show() {
    const cell = center();
    if (!cell)
      return;
    const lasts = groupReport(studio.state.document, studio.state.anatomy, 'groups', centerId)
                      ?.learning?.traceSteps;
    if (probe.teach === null && lasts > 0)
      probe.teach = clamp(probe.cue + Math.round(lasts / 4), probe.cue + 2, STRIP.round - 10);
    ask();
    draw(cell);
  }
  return {root, show};
});
