// The gland's live inspector: the blood as strands through time, one for each hormone, as thick
// as its level; the gland stands before the strands it pours into.
// Read in the engine (src/body_plan.cc:1343-1347, src/hormone_state.cc:40-60, hormone_state.hh):
//   a gland's command above nought pours, below nought binds, each hormone by the gland's share
//   of it (its affinities over all hormones add up to one);
//   the level heads for height x what is poured: up in the cells' time, down in the residence
//   time; binding takes exp(-binding rate x what is bound) of what is there on top, every step.
// The command tried lasts the left part of the picture, in steps as they are; after it the
// strands run on a squeezed scale, as far as the longest residence needs.
// ASSUMED for the picture: a gland inside the wheel is shown at the rim, where its direction
// points, and dragging it puts it on the rim; a binding gland starts at the level its own cells
// would hold.
import {ATELIER_LIMITS} from '../../../schema.js';
import {substanceColor} from '../../../hormones.js';
import {t} from '../../../strings.js';
import {
  LONGEST_ADAPTATION,
  LONGEST_TIME_CONSTANT,
  residenceOf,
  residenceSteps,
  timeConstantOf,
  timeConstantSteps
} from '../../../tuning.js';
import {
  addOrganType,
  findOrgan,
  glandShares,
  organTypes,
  removeOrganType,
  updateCenter,
  wheelPlace
} from '../../model/document.js';
import {label} from '../kit.js';
import {substanceName} from '../substances.js';
import {chip, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {keyGrip} from './sense.js';

const word = (key, values) => t('studio.live.gland.' + key, values);
const GLAND = Object.freeze({
  height : 214,
  L : 62,
  R : 286,
  top : 44,
  rows : 126,
  fill : .86,
  split : .42,
  work : 3 * LONGEST_TIME_CONSTANT,
  rest : 4 * LONGEST_ADAPTATION,
  samples : 70,
  knob : [ 10, 26 ],
  least : .15,
  snap : .12,
  round : 9000
});
const TURN = 2 * Math.PI;
// Where a step stands: the command's steps as they are, the rest squeezed.
const mid = () => GLAND.L + (GLAND.R - GLAND.L) * GLAND.split;
const X = step => step <= GLAND.work ? GLAND.L + (mid() - GLAND.L) * step / GLAND.work
                                     : mid() + (GLAND.R - mid()) * Math.log1p(step - GLAND.work) /
                                                   Math.log1p(GLAND.rest);
const stepAt = x =>
    x <= mid()
        ? GLAND.work * clamp((x - GLAND.L) / (mid() - GLAND.L))
        : GLAND.work + Math.expm1(clamp((x - mid()) / (GLAND.R - mid())) * Math.log1p(GLAND.rest));
const STEPS = [
  ...Array.from({length : GLAND.samples + 1}, (_, i) => Math.round(GLAND.work * i / GLAND.samples)),
  ...Array.from({length : GLAND.samples},
                (_, i) => Math.round(GLAND.work +
                                     Math.expm1(Math.log1p(GLAND.rest) * (i + 1) / GLAND.samples)))
];

liveKind('gland', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-gland';
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const blood = svgOf();
  // What is tried: the brain's command, from binding (-1) to pouring (1). Not part of the fish.
  const own = {chosen : 0, command : 1};
  let now = null, phase = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const wheel = () => studio.state.capabilities;
  const sharesOf = cell => glandShares(wheel(), cell);
  const strength = cell => cell.copies / ATELIER_LIMITS.max_copies;
  // The row a gland stands at: where its direction on the wheel lies between the hormones.
  const turnsOf = () =>
      Array.from({length : wheel().hormones}, (_, k) => wheel().substanceTurns[k]);
  function rowOf(cell) {
    const turns = turnsOf(), shares = sharesOf(cell);
    if (Math.hypot(cell.q1, cell.q2) < 1e-6)
      return shares.indexOf(Math.max(...shares));
    const turn = (Math.atan2(cell.q2, cell.q1) / TURN + 1) % 1;
    for (let k = 0; k + 1 < turns.length; k++)
      if (turn >= turns[k] && turn <= turns[k + 1])
        return k + (turn - turns[k]) / (turns[k + 1] - turns[k]);
    const far = v => Math.min(Math.abs(turn - v), 1 - Math.abs(turn - v));
    return far(turns[0]) < far(turns.at(-1)) ? 0 : turns.length - 1;
  }
  function placeAt(row) {
    const turns = turnsOf(), near = Math.round(row),
          r = Math.abs(row - near) < GLAND.snap ? near : row, k = Math.floor(r),
          turn = turns[k] + ((turns[k + 1] ?? turns[k]) - turns[k]) * (r - k);
    return {q1 : Math.cos(TURN * turn), q2 : Math.sin(TURN * turn)};
  }
  // A hormone's level over the steps: towards the height of what is poured, fading after.
  function course(cell, share, bound = true) {
    const caps = wheel(), held = caps.hormoneHeight * strength(cell) * share,
          rise = timeConstantSteps(cell.tau), stay = residenceSteps(cell.field),
          amount = Math.abs(own.command) * strength(cell) * share, last = GLAND.work + GLAND.rest,
          at = new Map();
    let level = own.command < 0 ? held : 0, next = 0;
    for (let step = 0; step <= last; step++) {
      if (step === STEPS[next]) {
        at.set(step, level);
        while (STEPS[next] === step)
          next++;
      }
      const on = step < GLAND.work, target = on && own.command > 0 ? held * own.command : 0,
            tau = level < target ? rise : stay;
      level = target + (level - target) * Math.exp(-1 / tau);
      if (on && own.command < 0 && bound)
        level *= Math.exp(-caps.hormoneBinding * amount);
      level = clamp(level);
    }
    return step => at.get(step) ?? 0;
  }
  function drawBlood(cells, cell) {
    const {svg, live} = picture(blood, GLAND.height), {L, R, top} = GLAND, n = wheel().hormones,
                row = GLAND.rows / n, thick = row * GLAND.fill, base = top + GLAND.rows,
                Y = k => top + row * k + row / 2, shares = sharesOf(cell),
                main = shares.indexOf(Math.max(...shares)),
                // A strand is full where the gland's main hormone stands with all the cells a node
                // can have, so that a weak gland shows too.
        most = wheel().hormoneHeight * shares[main];
    el('rect',
       {x : L, y : top - 2, width : R - L, height : GLAND.rows + 4, class : 'aid-live-ground'},
       live);
    // The strands: each hormone's level along the steps.
    const edge = (level, k) => Y(k) - thick / 2 * clamp(level / most) - .4;
    shares.forEach((share, k) => {
      const colour = substanceColor(k);
      txt(live, 4, Y(k) + 3.5, substanceName(studio.state, k),
          {class : 'aid-live-small', style : `fill:${colour}`});
      if (share < .02 * shares[main]) {
        el('path', {d : `M${L} ${Y(k)} H${R}`, stroke : colour, 'stroke-width' : .8, opacity : .35},
           live);
        return;
      }
      const level = course(cell, share), upper = STEPS.map(step => [X(step), edge(level(step), k)]),
            lower = STEPS.map(step => [X(step), 2 * Y(k) - edge(level(step), k)]).reverse();
      el('path', {
        d : path(upper) + ' L' +
                lower.map(([ x, y ]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + 'Z',
        fill : colour,
        opacity : .9
      },
         live);
      // What the level would do without the binding.
      if (own.command < 0 && k === main) {
        const free = course(cell, share, false);
        el('path', {
          d : path(STEPS.map(step => [X(step), edge(free(step), k)])),
          stroke : colour,
          'stroke-dasharray' : '2 3',
          fill : 'none'
        },
           live);
      }
    });
    // Where the command ends and the scale changes; the blood's edges are the command's nought.
    el('path', {d : `M${mid()} ${top - 2} V${base + 2}`, class : 'aid-live-hatch'}, live);
    for (const y of [top - 2, base + 2])
      el('path', {d : `M${L} ${y} H${R}`, class : 'aid-live-rim'}, live);
    // The glands before the strands they pour into: as long as their width, as thick as their
    // cells. The chosen one carries the grips.
    cells.forEach((c, i) => {
      // The mark reaches over the strands the gland pours at least half as much into as into
      // its main one.
      const chosen = c === cell, wide = 4 + 12 * strength(c), own = sharesOf(c),
            poured = own.map((v, k) => v > .5 * Math.max(...own) ? k : -1).filter(k => k >= 0),
            at = Math.hypot(c.q1, c.q2) < 1e-6 ? (poured[0] + poured.at(-1)) / 2 : rowOf(c),
            reach = row * (Math.max(at - poured[0], poured.at(-1) - at, 0) + .5), gy = Y(at),
            gx = L - 8 - (chosen ? 0 : 2);
      const mark = el('rect', {
        x : gx - wide,
        y : Math.max(top - 14, gy - reach),
        width : wide,
        height : Math.min(base + 14, gy + reach) - Math.max(top - 14, gy - reach),
        rx : Math.min(wide / 2, 6),
        class : 'aid-live-gland-mark k' + i + (chosen ? ' on' : '')
      },
                      live);
      if (!chosen) {
        mark.addEventListener('click', () => {
          own.chosen = i;
          show();
        });
        return;
      }
      const set = patch => draft(updateCenter(studio.state.document, c.id, patch));
      drag(svg,
           el('rect', {
             x : gx - wide / 2 - 4.5,
             y : gy - 4.5,
             width : 9,
             height : 9,
             rx : 2.5,
             class : keyGrip(i, true)
           },
              live),
           p => set(placeAt(clamp((p.y - top - row / 2) / row, 0, n - 1))), 'glandplace', 'grip',
           settle);
      drag(svg,
           el('circle', {cx : gx - wide / 2, cy : Math.min(base + 8, gy + reach), r : 4.5}, live),
           p => set({qwidth : clamp((Math.abs(p.y - gy) / row - .5) / (n / 2))}), 'glandwidth',
           'grip', settle);
      drag(svg,
           el('rect', {
             x : gx - wide - 9,
             y : gy - reach - 5 < top - 12 ? gy + 8 : gy - reach - 5,
             width : 8,
             height : 10,
             rx : 2,
             class : keyGrip(i, true)
           },
              live),
           p => set({
             copies : Math.round(clamp((gx - p.x - 4) / 12 * ATELIER_LIMITS.max_copies, 1,
                                       ATELIER_LIMITS.max_copies))
           }),
           'glandcells', 'grip', settle);
      chip(live, 10, GLAND.height - 8, '×', () => remove(i), cells.length > 1, 6);
    });
    chip(live, 26, GLAND.height - 8, '+', add, true, 6);
    // The two times on the main strand: where the level has risen most of its way, and where it
    // has faded most of it after the command.
    const level = course(cell, shares[main]), rise = timeConstantSteps(cell.tau),
          stay = residenceSteps(cell.field),
          nearest = step => STEPS.reduce((a, b) => Math.abs(b - step) < Math.abs(a - step) ? b : a);
    const timeGrip = (step, name, move) =>
        drag(svg,
             el('rect', {
               x : X(step) - 4,
               y : edge(level(nearest(step)), main) - 9,
               width : 8,
               height : 9,
               rx : 2,
               class : 'aid-live-gland-time',
               style : `fill:${substanceColor(main)}`
             },
                live),
             p => draft(updateCenter(studio.state.document, cell.id, move(stepAt(p.x)))), name,
             'grip', settle);
    if (own.command > 0)
      timeGrip(Math.min(rise, GLAND.work), 'glandrise',
               step => ({tau : timeConstantOf(Math.max(step, timeConstantSteps(0)))}));
    timeGrip(GLAND.work + stay, 'glandstay',
             step => ({field : residenceOf(Math.max(step - GLAND.work, residenceSteps(0)))}));
    // The command: above the blood it pours, below it binds; the further from the blood, the
    // stronger.
    const far = GLAND.knob[0] + (GLAND.knob[1] - GLAND.knob[0]) * Math.abs(own.command),
          ky = own.command >= 0 ? top - far : base + far;
    el('path', {
      d : `M${L} ${ky} H${mid()} V${own.command >= 0 ? top - 2 : base + 2}`,
      class : 'aid-live-hatch'
    },
       live);
    drag(svg, el('circle', {cx : mid(), cy : ky, r : 5.5, class : 'aid-live-posture'}, live), p => {
      const up = p.y < (top + base) / 2, off = up ? top - p.y : p.y - base;
      own.command = (up ? 1 : -1) *
                    clamp((off - GLAND.knob[0]) / (GLAND.knob[1] - GLAND.knob[0]), GLAND.least, 1);
      show();
    }, 'glandcommand', 'knob');
    txt(live, L, base + 14, 0, {'text-anchor' : 'middle', class : 'aid-live-small'});
    txt(live, mid(), base + 14, GLAND.work, {'text-anchor' : 'middle', class : 'aid-live-small'});
    txt(live, R, base + 14, word('steps', {n : GLAND.work + GLAND.rest}),
        {'text-anchor' : 'end', class : 'aid-live-small'});
    now = el('path', {class : 'aid-live-now'}, live);
    move();
  }
  function move() {
    now?.setAttribute('d', `M${(GLAND.L + (GLAND.R - GLAND.L) * phase).toFixed(1)} ${
                               GLAND.top - 2} V${GLAND.top + GLAND.rows + 2}`);
  }
  function remove(i) {
    const type = organTypes(organ())[i];
    own.chosen = 0;
    change(removeOrganType(studio.state.document, organId, type.id));
  }
  // A new node pours the first hormone no node of the gland pours most.
  function add() {
    const cells = organTypes(organ()).map(type => type.centers[0]),
          taken = new Set(cells.map(c => {
            const shares = sharesOf(c);
            return shares.indexOf(Math.max(...shares));
          })),
          free = Array.from({length : wheel().hormones}, (_, k) => k).find(k => !taken.has(k)) ?? 0,
          [ q1, q2 ] = wheelPlace(wheel(), free);
    const added = addOrganType(studio.state.document, organId, studio.state.sites,
                               {q1, q2, qwidth : cells[own.chosen]?.qwidth ?? 0});
    if (!added)
      return studio.notice(label('status.noRoom'));
    own.chosen = cells.length;
    change(added.document);
  }
  function show() {
    const gland = organ();
    if (!gland || !(wheel()?.hormoneHeight > 0))
      return;
    const cells = organTypes(gland).map(type => type.centers[0]);
    if (!cells.length)
      return;
    own.chosen = Math.min(own.chosen, cells.length - 1);
    drawBlood(cells, cells[own.chosen]);
  }
  return {
    root,
    show,
    tick(dt) {
      phase = (phase + dt / GLAND.round) % 1;
      move();
    }
  };
});
