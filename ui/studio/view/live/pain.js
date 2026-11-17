// The skin's pain cells' live inspector: a strip of skin over time. The wound is cut into it at
// the bite and closes as the fish heals; above the skin, what the cells report of it, which ends
// before the wound has closed.
// Read in the engine (physiology.hh, harm_body; body_plan.cc, the skin cells' wedge of weights and
// the damage stimulus; physiology.cc, healing; feeding.cc and physiology_parameters.cc, bite_wound;
// embryo.cc): every harm takes from the fish's health; a bite is booked on the sector it comes
// from, split between the two nearest sector centres. Pain cells weigh the sectors like the other
// skin cells. A fed fish heals each step and the booked wounds shrink with it. The answer is
// bounded, and the cells get used to a wound that stays.
// The wound is the fish panel's probe (probes.js), where it lies and how deep it is. The fish,
// the skin the cells feel and the grip for its width are the fish panel's too (body.js, feltSkin;
// anatomy_handles.js); here is only what it cannot show: the time after the bite. The cells'
// place is the plan's report (anatomy.felt); what they send over the steps, and where their
// thresholds lie, is the engine's course for this wound (sense.js, lastCourses).
// Not in the picture: harm without a place (hunger, illness, age), which lies evenly on all
// sectors; that a hungry fish does not heal.
import {SKIN_RESPONSE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {findOrgan} from '../../model/document.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, reportBubble, txt} from './kit.js';
import {
  bandOf,
  between,
  BOUNDED,
  closingWound,
  keysOf,
  lastCourses,
  setGate,
  setSpread,
  setUsed,
  usedFor
} from './sense.js';

const word = (key, values) => t('studio.live.pain.' + key, values);
const ROUND_MS = 9000, BITE_STEP = 12;
// The strip: steps from L to R, as many as the wound the fish panel's probe makes takes to close
// and `after` of that beyond, in whole hundreds; the skin's line; below it the wound, `deep` high
// for the deepest wound the probe can make; above it the report, `loud` high when all cells send.
// Steps by which the cells must fall silent before the wound has closed below what they feel,
// to say that they have got used to it.
const UNSURE = 3;
const DEEPEST = .5;
const spanOf = depth => Math.max(
    200, 100 * Math.ceil((1 + STRIP.after) * (BITE_STEP + depth / SKIN_RESPONSE.heal_rate) / 100));
const STRIP = Object.freeze({
  height : 190,
  L : 34,
  R : 288,
  skin : 84,
  deep : 70,
  deepest : DEEPEST,
  loud : 34,
  gap : 6,
  bubble : 12,
  after : .25,
  least : .02
});
liveKind('pain', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-pain aid-live-sense-ache';
  const strip = addPicture(root);
  // The fish panel's wound, if it is this organ's.
  const wound = () => {
    const probe = studio.state.senseProbe;
    return probe?.kind === 'wound' && probe.organ === organId ? probe : null;
  };
  let step = 0, bubble = null, span = spanOf(SKIN_RESPONSE.bite_wound);
  const coursesOf = lastCourses('pain');
  const organ = () => findOrgan(studio.state.document, organId);
  // The engine answers the course of the cells while a grip is dragged (sense.js, lastCourses).
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive', 'course');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The wound over the steps, what the cells meet of it and send, and when they fall silent:
  // because they have got used to it (the wound alone would still be felt), or because it has
  // closed below what they feel.
  // What the cells meet of the wound is the engine's for the fish panel's probe (`probe` of the
  // course, sense.js, lastCourses), `part` of its depth; ASSUMED: as the wound closes they meet
  // the same part of what is left of it.
  function courseOf(cell) {
    const probe = wound(), strength = probe?.strength ?? 0;
    // The cells' thresholds are those the engine drew; before its first answer the plan's one
    // threshold.
    const key = keysOf([ {id : '', centers : [ cell ]} ])[0];
    const depth = closingWound(strength, BITE_STEP, SKIN_RESPONSE.heal_rate),
          run = coursesOf(studio, [ {
                            id : key.id,
                            probe : true,
                            stimulus : depth.map(v => strength > 0 ? v / strength : 0)
                          } ])
                    ?.[0] ??
                null,
          part = strength > 0 ? (run?.probe ?? 0) / strength : 0,
          met = depth.map(v => clamp(v * part)), sent = run?.sent ?? [], silent = run?.silent ?? 0,
          gates = run ? run.cells : [ BOUNDED.val(key.gate) ], last = Math.min(1, ...gates),
          closed = met.findIndex((v, st) => st > BITE_STEP && v <= last);
    return {
      span : spanOf(probe?.strength ?? SKIN_RESPONSE.bite_wound),
      key,
      part,
      depth,
      met,
      sent,
      silent,
      run,
      gates,
      stale : !run || run.stale,
      closed,
      used : silent > 0 && (closed < 0 || silent < closed - UNSURE)
    };
  }
  function draw(cell) {
    const S = STRIP, {svg, live} = picture(strip, S.height), c = courseOf(cell), SPAN = c.span;
    const X = st => S.L + (S.R - S.L) * st / SPAN,
          stOf = x => clamp(Math.round((x - S.L) / (S.R - S.L) * SPAN), 0, SPAN),
          D = depth => S.skin + S.deep * clamp(depth / S.deepest), top = S.skin - S.gap, every = 4,
          shown = values => values.slice(0, SPAN + 1).filter((_, st) => st % every === 0);
    // The wound: cut at the bite, closing step by step.
    el('path', {
      d : path(shown(c.depth).map((v, n) => [X(n * every), D(v)])) +
              ` L${X(SPAN)} ${S.skin} L${S.L} ${S.skin} Z`,
      class : 'aid-live-wound'
    },
       live);
    el('path', {d : `M${S.L} ${S.skin} H${S.R}`, class : 'aid-live-skinline'}, live);
    // A full bite's depth, to read the wound against.
    const by = D(SKIN_RESPONSE.bite_wound);
    el('path', {d : `M${S.L - 6} ${by} h6`, class : 'aid-live-axis'}, live);
    txt(live, S.L - 8, by + 3, word('bite'), {'text-anchor' : 'end', class : 'aid-live-small'});
    // How small a wound the cells still feel here: below this depth they send nothing. Each cell
    // has its own depth, drawn by the engine within the plan's threshold and its spread either
    // way, within the thresholds a cell can have (distribution.hh, draw_traits; the way from the
    // plan's value to a threshold is straight, tuning.js, so the band is as wide either way):
    // that band is the plan's, the lines in it the engine's,
    // pale while they are the last run's. The grip on the plan's threshold sets it, the grip on
    // the band's edge how far the cells may spread.
    const feels = c.part > 0 ? c.key.gate / c.part : S.deepest, gy = D(feels),
          [ least, most ] = bandOf(c.key), edge = c.part > 0 ? D(most / c.part) : gy;
    if (c.part > 0) {
      const top = D(least / c.part);
      if (most > least)
        el('rect', {
          x : S.L,
          y : top,
          width : S.R - S.L,
          height : Math.max(0, edge - top),
          class : 'aid-live-keyband k0'
        },
           live);
      for (const gate of c.gates)
        el('path', {
          d : `M${S.L} ${D(gate / c.part)} H${S.R}`,
          class : 'aid-live-keyline k0 cell' + (c.stale ? ' stale' : '')
        },
           live);
    }
    el('path', {d : `M${S.L} ${gy} H${S.R}`, class : 'aid-live-keyline k0'}, live);
    txt(live, S.R, gy + 11, word('felt'), {'text-anchor' : 'end', class : 'aid-live-small'});
    if (c.part > 0)
      drag(svg,
           el('rect', {
             x : S.L - 5,
             y : gy - 5,
             width : 10,
             height : 10,
             rx : 2.5,
             class : 'aid-live-keygrip k0 on'
           },
              live),
           p => draft(setGate(studio.state.document, c.key,
                              clamp((p.y - S.skin) / S.deep, S.least, 1) * S.deepest * c.part)),
           'paingate', 'grip', settle);
    if (c.part > 0)
      drag(svg,
           el('rect', {
             x : S.R - 5,
             y : edge - 4,
             width : 10,
             height : 8,
             rx : 2.5,
             class : 'aid-live-keygrip k0 on'
           },
              live),
           p => draft(setSpread(
               studio.state.document, c.key,
               2 * Math.max(0, clamp((p.y - S.skin) / S.deep) * S.deepest * c.part - c.key.gate))),
           'painspread', 'grip', settle);
    // What the cells send, above the skin, over the same steps.
    if (c.sent.length)
      el('path', {
        d : path(shown(c.sent).map((v, n) => [X(n * every), top - S.loud * clamp(v)])) +
                ` L${X(SPAN)} ${top} L${S.L} ${top} Z`,
        class : 'aid-live-glow k0',
        opacity : .55
      },
         live);
    // Where they fall silent. If they have got used to the wound, the wound is still open under
    // the mark, and the grip there sets how fast they get used.
    if (c.silent > 0 && c.silent < SPAN) {
      const sx = X(c.silent);
      el('path',
         {d : `M${sx} ${top - S.loud} V${D(c.depth[c.silent])}`, class : 'aid-live-keymark k0'},
         live);
      if (c.used) {
        // The way the grip can go: up to where the wound closes below what the cells feel.
        el('path', {
          d : `M${S.L} ${top - S.loud} H${X(c.closed < 0 ? SPAN : c.closed)}`,
          class : 'aid-live-track-line'
        },
           live);
        txt(live, sx + 9, top - S.loud + 3, word('used'), {class : 'aid-live-small'});
        drag(svg, el('circle', {cx : sx, cy : top - S.loud, r : 5}, live), p => {
          const used = usedFor(c.run, stOf(p.x));
          if (used)
            draft(setUsed(studio.state.document, c.key, used));
        }, 'painused', 'grip', settle);
      }
    }
    for (let st = SPAN > 400 ? 200 : 100; st <= SPAN; st += SPAN > 400 ? 200 : 100)
      txt(live, X(st), S.height - 4, String(st), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, S.L, S.height - 4, word('steps'), {class : 'aid-live-small'});
    // The report now, as the fish panel shows it: a bubble that moves along the steps.
    const place = reportBubble(live, S.bubble);
    bubble = at => place(X(at), top - S.loud - S.bubble - 4, between(c.sent, at));
    span = SPAN;
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    draw(cell);
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * span / ROUND_MS) % span;
    bubble?.(step);
  }
  return {root, show, tick};
});
