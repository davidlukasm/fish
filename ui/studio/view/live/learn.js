// A learning cell's live inspector: one of its contacts over two rounds of one example. A
// sender fires, its trace on the contact fades, the teacher comes, the contact's weight steps
// up; in the second round the teacher is expected, and the step is the smaller for it. Beside
// the contact a still input, which a competing cell pushes out.
// Read in the engine (colony-core/field/substrate.cc, evaluate; dynamics.hh, trace_update;
// koordination entwuerfe/LERNEN-ENGINE.md): the trace keeps what the sender and the cell did
// together for as long as the cell's learning time; the weight changes by the cell's learning
// rate x the teacher's surprise x the trace; a teacher the inputs foretell teaches nothing.
// DRAFT. The engine's report does not carry the example yet (LERNEN-ENGINE.md, section 9:
// `example`): until it does the curves are a PLACEHOLDER drawn by hand below, marked so in the
// picture, and to fall with the first report. Only the grips' values are the plan's own.
import {t} from '../../../strings.js';
import {learningTimeOf, learningTimeSteps} from '../../../tuning.js';
import {findCenter, updateCenter} from '../../model/document.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';

const word = key => t('studio.live.learn.' + key);
// The strip: two rounds from L to R, `round` steps each; four rows, each `row` high with its
// base line at the given height.
const STRIP = Object.freeze({
  height : 236,
  L : 40,
  R : 292,
  round : 200,
  row : 22,
  cue : 44,
  trace : 80,
  teach : 118,
  weight : 196,
  rise : 56,
  least : .02
});
// PLACEHOLDER for the report's `example`: what a hand would draw for a sender firing at `cue`
// and a teacher at `teach` in each round, the second round expected by `expected`.
function placeholder(center, probe) {
  const S = STRIP, n = 2 * S.round, lasts = learningTimeSteps(center.learning_tau),
        list = make => Array.from({length : n + 1}, (_, st) => make(st % S.round, st >= S.round));
  const cue = list(at => at >= probe.cue && at < probe.cue + 12 ? 1 : 0),
        teach = list(at => at >= probe.teach && at < probe.teach + 8 ? 1 : 0),
        trace = list(at => at < probe.cue ? 0 : Math.exp(-(at - probe.cue) / lasts)), weight = [],
        quiet = [];
  let w = .2, q = .3;
  for (let st = 0; st <= n; st++) {
    const second = st >= S.round;
    w = clamp(w + center.qwidth * .05 * teach[st] * trace[st] * (second ? 1 - probe.expected : 1));
    q = Math.max(0, q - .0006 * Math.max(0, center.mode ?? 0));
    weight.push(w);
    quiet.push(q);
  }
  return {cue, teach, trace, weight, quiet, placeholder : true};
}

liveKind('learn', (studio, centerId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-learn';
  const strip = addPicture(root);
  // The example tried on the cell: when the sender fires and the teacher comes in a round, and
  // how far the second round's teacher is expected.
  const probe = {cue : 30, teach : 70, expected : .7};
  const center = () => findCenter(studio.state.document, centerId)?.center;
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + centerId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  function draw(cell) {
    const S = STRIP, {svg, live} = picture(strip, S.height), n = 2 * S.round,
          ex = studio.state.learning?.example?.[centerId] ?? placeholder(cell, probe);
    const X = st => S.L + (S.R - S.L) * st / n,
          stOf = x => clamp(Math.round((x - S.L) / (S.R - S.L) * n), 0, n),
          line = (values, base, high) => path(values.map((v, st) => [X(st), base - high * v])),
          every = values => values.filter((_, st) => st % 2 === 0),
          thin = (values, base, high) =>
              path(every(values).map((v, n2) => [X(2 * n2), base - high * v]));
    const names = [
      [ 'cue', S.cue ], [ 'trace', S.trace ], [ 'teach', S.teach ],
      [ 'contact', S.weight - S.rise / 2 ]
    ];
    for (const [key, y] of names)
      txt(live, 2, y - 4, word(key), {class : 'aid-live-small'});
    el('path', {d : `M${X(S.round)} 14 V${S.weight + 4}`, class : 'aid-live-axis'}, live);
    txt(live, S.L + 2, 12, word('first'), {class : 'aid-live-small'});
    txt(live, X(S.round) + 3, 12, word('second'), {class : 'aid-live-small'});
    // The sender's firing, and its trace on the contact.
    el('path', {d : thin(ex.cue, S.cue, S.row - 8), class : 'aid-live-cue k0'}, live);
    el('path', {
      d : thin(ex.trace, S.trace, S.row) + ` L${S.R} ${S.trace} L${S.L} ${S.trace} Z`,
      class : 'aid-live-glow k0',
      opacity : .5
    },
       live);
    el('path', {d : `M${S.L} ${S.trace} H${S.R}`, class : 'aid-live-axis'}, live);
    // The teacher, and in the second round how far it is expected.
    el('path', {d : thin(ex.teach, S.teach, S.row - 6), class : 'aid-live-teach'}, live);
    const ey = S.teach - (S.row - 6) * probe.expected;
    el('path', {d : `M${X(S.round)} ${ey} H${S.R}`, class : 'aid-live-teach expected'}, live);
    txt(live, S.R - 14, ey - 4, word('expected'),
        {'text-anchor' : 'end', class : 'aid-live-small'});
    // The contact's weight, and the still input's under it.
    el('path', {d : `M${S.L} ${S.weight} H${S.R}`, class : 'aid-live-axis'}, live);
    el('path', {d : thin(ex.quiet, S.weight, S.rise), class : 'aid-live-quiet'}, live);
    el('path', {d : thin(ex.weight, S.weight, S.rise), class : 'aid-live-weight'}, live);
    txt(live, S.R, S.weight - S.rise * ex.quiet[n] - 4, word('quiet'),
        {'text-anchor' : 'end', class : 'aid-live-small'});
    for (const st of [100, 200, 300, 400])
      txt(live, X(st), S.height - 22, String(st),
          {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, S.L, S.height - 22, word('steps'), {class : 'aid-live-small'});
    if (ex.placeholder)
      txt(live, S.L, S.height - 6, word('placeholder'),
          {class : 'aid-live-small aid-live-missing'});
    // The example's knobs (round, an input): when the teacher comes, how far it is expected.
    drag(svg, el('circle', {cx : X(probe.teach), cy : S.teach - (S.row - 6), r : 5}, live), p => {
      probe.teach = clamp(stOf(p.x), probe.cue + 4, S.round - 10);
      show();
    }, 'learnteach', 'knob');
    drag(svg, el('circle', {cx : S.R - 6, cy : ey, r : 5}, live), p => {
      probe.expected = clamp((S.teach - p.y) / (S.row - 6));
      show();
    }, 'learnexpected', 'knob');
    // The cell's grips (square, a setting): how long the trace lasts, on the trace where it has
    // fallen to 1/e; how fast the cell learns, on the first step's top.
    const lasts = learningTimeSteps(cell.learning_tau),
          tx = X(Math.min(S.round - 4, probe.cue + lasts));
    drag(svg,
         el('rect', {
           x : tx - 5,
           y : S.trace - S.row / Math.E - 4,
           width : 10,
           height : 8,
           rx : 2.5,
           class : 'aid-live-keygrip k0 on'
         },
            live),
         p => draft(
             updateCenter(studio.state.document, centerId,
                          {learning_tau : learningTimeOf(Math.max(4, stOf(p.x) - probe.cue))})),
         'learntime', 'grip', settle);
    const top = ex.weight[Math.min(n, probe.teach + 12)], wx = X(probe.teach + 12);
    drag(svg,
         el('rect', {
           x : wx - 5,
           y : S.weight - S.rise * top - 4,
           width : 10,
           height : 8,
           rx : 2.5,
           class : 'aid-live-keygrip k0 on'
         },
            live),
         p => draft(
             updateCenter(studio.state.document, centerId,
                          {qwidth : clamp((S.weight - p.y) / S.rise - ex.weight[0], S.least, 1)})),
         'learnrate', 'grip', settle);
  }
  function show() {
    const cell = center();
    if (cell)
      draw(cell);
  }
  return {root, show, tick() {}};
});
