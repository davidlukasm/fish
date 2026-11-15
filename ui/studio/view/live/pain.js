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
// place is the plan's report (anatomy.felt); what they send over the steps is reckoned with the
// engine's rule for a bounded answer and for getting used (sense.js, runOf).
// Not in the picture: harm without a place (hunger, illness, age), which lies evenly on all
// sectors; that a hungry fish does not heal.
import {SKIN_RESPONSE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {contactHalfAngle} from '../../../tuning.js';
import {findOrgan} from '../../model/document.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, reportBubble, txt} from './kit.js';
import {
  between,
  BOUNDED,
  closingWound,
  keysOf,
  runOf,
  setGate,
  setUsed,
  silentStep,
  usedFor
} from './sense.js';
import {placeOf, turnTo, wedge} from './skin.js';

const word = (key, values) => t('studio.live.pain.' + key, values);
const ROUND_MS = 9000, BITE_STEP = 12;
// The strip: steps from L to R, as many as the deepest wound the fish panel's probe can make
// takes to close; the skin's line; below it the wound, `deep` high for that deepest wound; above
// it the report, `loud` high when all cells send.
// Steps by which the cells must fall silent before the wound has closed below what they feel,
// to say that they have got used to it.
const UNSURE = 3;
const DEEPEST = .5;
const SPAN = 100 * Math.ceil((BITE_STEP + DEEPEST / SKIN_RESPONSE.heal_rate) / 100);
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
  marks : [ 200, 400, 600 ],
  least : .02
});
// Match harm_body's linear split, including across the seam behind the fish.
function woundShares(bearing, count) {
  const position = (turnTo(bearing) + 180) * count / 360 - .5, lower = Math.floor(position),
        upperShare = position - lower;
  return new Map(
      [ [ (lower + count) % count, 1 - upperShare ], [ (lower + 1) % count, upperShare ] ]);
}

liveKind('pain', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-pain aid-live-sense-ache';
  const strip = addPicture(root);
  // The fish panel's wound, if it is this organ's.
  const wound = () => {
    const probe = studio.state.senseProbe;
    return probe?.kind === 'wound' && probe.organ === organId ? probe : null;
  };
  let step = 0, bubble = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // What the cells meet of the wound: the sectors it is booked on, as the cells weigh them
  // (16 x weight, at most all of it).
  function share(cell, probe) {
    if (!probe)
      return 0;
    const weights = wedge(placeOf(studio, cell), contactHalfAngle(cell.field ?? 0));
    let met = 0;
    for (const [sector, part] of woundShares(probe.bearing, weights.length))
      met += weights.length * weights[sector] * part;
    return met;
  }
  // The wound over the steps, what the cells meet of it and send, and when they fall silent:
  // because they have got used to it (the wound alone would still be felt), or because it has
  // closed below what they feel.
  function courseOf(cell) {
    const probe = wound(), part = share(cell, probe);
    const key = keysOf([ {id : '', centers : [ cell ]} ], BOUNDED)[0];
    const depth = closingWound(probe?.strength ?? 0, BITE_STEP, SKIN_RESPONSE.heal_rate),
          met = depth.map(v => clamp(v * part)), sent = runOf(key, met, true).sent,
          silent = silentStep(key, met), last = Math.min(...BOUNDED.gates(key)),
          closed = met.findIndex((v, st) => st > BITE_STEP && v <= last);
    return {
      key,
      part,
      depth,
      met,
      sent,
      silent,
      closed,
      used : silent > 0 && (closed < 0 || silent < closed - UNSURE)
    };
  }
  function draw(cell) {
    const S = STRIP, {svg, under, live} = picture(strip, S.height), c = courseOf(cell);
    const X = st => S.L + (S.R - S.L) * st / SPAN,
          stOf = x => clamp(Math.round((x - S.L) / (S.R - S.L) * SPAN), 0, SPAN),
          D = depth => S.skin + S.deep * clamp(depth / S.deepest), top = S.skin - S.gap, every = 4,
          shown = values => values.slice(0, SPAN + 1).filter((_, st) => st % every === 0);
    el('rect',
       {x : S.L, y : S.skin, width : S.R - S.L, height : S.deep + 14, class : 'aid-live-flesh'},
       under);
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
    // How small a wound the cells still feel here: below this depth they send nothing. Its grip
    // sets the threshold.
    const feels = c.part > 0 ? c.key.gate / c.part : S.deepest, gy = D(feels);
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
    // What the cells send, above the skin, over the same steps.
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
        txt(live, sx + 5, top - S.loud + 8, word('used'), {class : 'aid-live-small'});
        drag(svg, el('circle', {cx : sx, cy : top - S.loud, r : 5}, live),
             p => draft(setUsed(studio.state.document, c.key, usedFor(c.key, c.met, stOf(p.x)))),
             'painused', 'grip', settle);
      }
    }
    for (const st of S.marks)
      txt(live, X(st), S.height - 4, String(st), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, S.L, S.height - 4, word('steps'), {class : 'aid-live-small'});
    // The report now, as the fish panel shows it: a bubble that moves along the steps.
    const place = reportBubble(live, S.bubble);
    bubble = at => place(X(at), top - S.loud - S.bubble - 4, between(c.sent, at));
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    draw(cell);
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * SPAN / ROUND_MS) % SPAN;
    bubble?.(step);
  }
  return {root, show, tick};
});
