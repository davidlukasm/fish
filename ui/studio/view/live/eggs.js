// The egg organ's live inspector: the belly it shares with the gut, a trial of filling and
// laying, and its life.
// The engine (reproduction.cc, transfer_gametes, fill_natural_egg; physiology.cc, organ_capacity,
// ovary_capacity; body_plan.cc, egg_transfer):
//   room    = belly room x body size x min(most, perCell x the organ's motor cells); the belly
//             room falls with the gut's length
//   filling = f / (1 + f) x fill x body size a step, f the filling cells' command times their
//             strength; while the fish is hatched and has reserve to spare
//   laying  = a stroke of the laying cells while the organ is at least spawnShare full: the egg
//             takes all the yolk
//   an egg with less yolk than the plan's young needs is a nutrient egg.
// The plan's report gives the room and that minimum for the whole plan at the reference body
// (state.anatomy.budget.yolk); they are shown while they belong to the plan in view. While a
// grip is dragged the room follows the cells on the engine's formula.
// ASSUMED for the pictures: the body's size is its maturity; the fish has reserve to spare; a
// full population, eggs lying too close and no free place behind the fish are left out. Hatching
// is marked at a schematic place.
import {ATELIER_LIMITS, DIGESTION} from '../../../schema.js';
import {t} from '../../../strings.js';
import {
  findOrgan,
  gutLength,
  lifePhase,
  setLifePhase,
  setNodeCopies,
  setOrganNodes,
  updateCenter
} from '../../model/document.js';
import {nodeLimit} from '../../model/organs.js';
import {label} from '../kit.js';
import {chip, clamp, drag, el, fishIcon, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.eggs.' + key, values);
const FULL = ATELIER_LIMITS.max_copies, STEPS = 900, ROUND_MS = 12000, HATCH = .5;
// zoom: the fish against its drawing, so that it fills the panel's width; travel: how far the
// cells' grip moves from the thinnest to the fullest cells.
const BELLY = Object.freeze(
    {height : 156, fishX : 118, fishY : 70, ground : 142, sac : -44, zoom : 1.3, travel : 24});
const TRIAL =
    Object.freeze({L : 64, R : 290, c0 : 16, c1 : 46, top : 78, base : 148, height : 172});
const LIFE = Object.freeze({
  L : 44,
  R : 264,
  top : 18,
  base : 88,
  icons : 106,
  height : 120,
  beside : 16,
  whole : .015,
  least : .08
});
const FISH =
    'M-86 0 Q-52 -42 10 -34 Q52 -28 76 -4 L104 -30 Q98 0 104 30 L76 4 Q52 30 10 36 Q-52 42 -86 0 Z';
// The organ as drawn: as long and as high as the root of its share of the largest room.
const sizeOf = share => [14 + 62 * Math.sqrt(clamp(share)), 5 + 9 * Math.sqrt(clamp(share))];

liveKind('eggs', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-eggs';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
    return h;
  };
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const kind = heading('');
  const belly = svgOf();
  heading(word('trial'));
  const trial = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the organ: not part of the fish.
  const input = {fill : .3, lay : 200, maturity : 1};
  const film = {yolk : null, eggs : null, sac : null, line : null};
  // native: the drives of the last plan its report belonged to; pull: where a grip was taken.
  let state = studio.state, m = null, step = 0, native = null, pull = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show(studio.state);

  // The organ as the pictures need it, from the document and the plan's report.
  function derive(eggs) {
    const G = state.capabilities?.gonads, base = G?.eggs;
    if (!base)
      return null;
    const of = key => eggs.centers.filter(c => c.key === key), filling = of('growth'),
          laying = of('release');
    if (!filling.length)
      return null;
    const cells = list => list.reduce((sum, c) => sum + c.copies, 0), phase = lifePhase(filling[0]),
          report = state.anatomy?.budget?.yolk,
          exact = studio.shownDesign === state.document && report;
    // The gut's length as the engine has it, and the belly room it leaves.
    const length = gutLength(state.document) ?? .5,
          gut = (DIGESTION.shortest * (DIGESTION.longest / DIGESTION.shortest) ** clamp(length) -
                 DIGESTION.shortest) /
                (DIGESTION.longest - DIGESTION.shortest),
          left = 1 - DIGESTION.belly * gut;
    const all = cells(filling) + cells(laying),
          roomOf = n => left * Math.min(base.most, base.perCell * n);
    // What the cells give at a full command comes from the plan's report. While a grip is
    // dragged it follows the cells' copies from the last plan the report belonged to.
    const drives = state.anatomy?.gonads?.eggs;
    if (studio.shownDesign === state.document && Number.isFinite(drives?.fillDrive))
      native = {
        fill : drives.fillDrive,
        release : drives.releaseDrive,
        fillCells : cells(filling),
        layCells : cells(laying)
      };
    const scaled = (drive, now, then) => then > 0 ? drive * now / then : 0;
    return {
      filling,
      laying,
      // The engine's cells: each node counts as many as its copies.
      fillCells : cells(filling),
      layCells : cells(laying),
      copies : filling[0].copies,
      layCopies : laying[0]?.copies ?? 0,
      gut,
      left,
      largest : left * base.most,
      // The room of the grown fish: the report's, or the formula's while a grip is dragged.
      room : exact && Number.isFinite(report.store) ? report.store : roomOf(all),
      roomOf,
      minimum : exact && Number.isFinite(report.minimum) && report.minimum > 0 ? report.minimum
                                                                               : null,
      rate : base.fill,
      spawn : base.spawnShare,
      fillDrive : native ? scaled(native.fill, cells(filling), native.fillCells) : 0,
      // The laying cells beat only when their strength reaches the engine's threshold.
      releaseDrive : native ? scaled(native.release, cells(laying), native.layCells) : 0,
      threshold : G.release,
      from : phase.start ?? 0,
      until : phase.end ?? 1,
      most : nodeLimit(eggs, state.sites)
    };
  }
  const works = r => r >= Math.max(m.from, HATCH) && (m.until >= 1 || r < m.until);
  const roomAt = (r = input.maturity) => works(r) ? r * m.room : 0;
  const lays = () => m.releaseDrive >= m.threshold;
  // One trial: the yolk step by step, and the eggs laid in it.
  function run() {
    const room = roomAt(), drive = input.fill * m.fillDrive,
          each = drive / (1 + drive) * m.rate * input.maturity, yolk = [], laid = [];
    let y = 0;
    for (let st = 0; st <= STEPS; st++) {
      yolk.push(y);
      if (room <= 0)
        continue;
      if (lays() && st >= input.lay && y >= m.spawn * room) {
        laid.push({step : st, yolk : y, enough : m.minimum === null || y >= m.minimum});
        y = 0;
        continue;
      }
      y = Math.min(room, y + each);
    }
    return {
      room,
      yolk,
      laid,
      every : laid.length > 1 ? Math.round((laid.at(-1).step - laid[0].step) / (laid.length - 1))
                              : 0
    };
  }
  // An egg: with yolk enough by the plan, or a nutrient egg (paler).
  const eggMark = (parent, x, y, r, enough) =>
      el('circle', {cx : x, cy : y, r, class : enough ? 'aid-live-yolk' : 'aid-live-yolk thin'},
         parent);

  function buildBelly(fixed) {
    const {fishX, fishY, ground} = BELLY,
                         g = el('g',
                                {transform : `translate(${fishX} ${fishY}) scale(${BELLY.zoom})`},
                                fixed);
    el('path', {d : FISH, class : 'aid-live-body'}, g);
    el('circle', {cx : -62, cy : -6, r : 3.4, class : 'aid-live-eye'}, g);
    el('path', {d : `M0 ${ground} H300`, class : 'aid-live-sand'}, fixed);
    film.eggs = el('g', {}, fixed);
  }
  // The belly: the gut above, the longer the more of it, the egg organ below in the room left.
  function drawBelly() {
    const {svg, live} = picture(belly, BELLY.height, buildBelly), {fishX, fishY, sac} = BELLY,
                t0 = m.trial;
    kind.textContent = !t0.laid.length ? word(t0.room > 0 ? (lays() ? 'none' : 'weak') : 'noRoom')
                       : t0.laid.every(e => !e.enough) ? word('nutrient')
                       : t0.every                      ? word('every', {n : t0.every})
                                                       : word('one');
    if (t0.laid.length)
      txt(live, 4, 10, word('yolk', {n : Math.round(t0.laid[0].yolk)}), {class : 'aid-live-small'});
    const z = BELLY.zoom, coils = 2 + Math.round(4 * m.gut), gx0 = fishX - 38 * z,
          gx1 = fishX + 52 * z, gy = fishY - (8 + 6 * m.gut) * z, amp = (3 + 7 * m.gut) * z;
    el('path', {
      d : path(Array.from(
          {length : 61},
          (_,
           k) => [gx0 + (gx1 - gx0) * k / 60, gy + amp * Math.sin(2 * Math.PI * coils * k / 60)])),
      class : 'aid-live-gullet'
    },
       live);
    const gutOrgan = studio.state.document.organs.find(o => o.type === 'gut');
    if (gutOrgan)
      txt(live, gx1 + 4, gy - amp - 4, word('gut'), {
        'text-anchor' : 'end',
        class : 'aid-live-small aid-live-chip'
      }).addEventListener('click', () => studio.select('organ', gutOrgan.id, null, false));
    // The room the gut leaves at this maturity (dotted), and the organ in it. The share is of
    // the largest room there is, at the shortest gut.
    const most = m.largest / m.left, x0 = fishX + sac, cy = fishY + (17 - 3 * m.gut) * z,
          [ widest, highest ] = sizeOf(input.maturity * m.largest / most).map(v => v * z),
          [ long, high ] = sizeOf(t0.room / most).map(v => v * z), cx = x0 + long / 2;
    el('ellipse',
       {cx : x0 + widest / 2, cy, rx : widest / 2, ry : highest, class : 'aid-live-bellyroom'},
       live);
    film.sac = {long, high};
    el('ellipse', {
      cx,
      cy,
      rx : long / 2,
      ry : high,
      class : 'aid-live-yolksac',
      opacity : t0.room > 0 ? 1 : .35
    },
       live);
    film.yolk = el('ellipse', {cx, cy, class : 'aid-live-yolk'}, live);
    // Its cells as chambers: the filling ones in front, the laying ones (lighter) at the rear.
    // Shown are the cells that hold yolk; beyond the ceiling more cells only fill faster.
    const all = m.fillCells + m.layCells,
          shown =
              Math.max(1, Math.min(all, Math.round(m.largest / m.left / (m.roomOf(1) / m.left)))),
          border = long * m.fillCells / all,
          clip = el('clipPath', {id : 'aid-live-eggsac-' + organId}, live);
    el('ellipse', {cx, cy, rx : long / 2, ry : high}, clip);
    const chambers = el(
        'g', {'clip-path' : `url(#aid-live-eggsac-${organId})`, 'pointer-events' : 'none'}, live);
    el('rect', {
      x : x0 + border,
      y : cy - high,
      width : long - border,
      height : 2 * high,
      class : 'aid-live-laying'
    },
       chambers);
    for (let i = 1; i < shown; i++)
      el('path',
         {d : `M${x0 + long * i / shown} ${cy - high} v${2 * high}`, class : 'aid-live-chamber'},
         chambers);
    // The filling cells: fuller with the grip (up), more or fewer pairs with the buttons before
    // the organ. The laying cells: fuller or thinner with the buttons behind it.
    const gy0 = cy - high - 6;
    drag(svg,
         el('rect', {
           x : x0 + border / 2 - 5.5,
           y : gy0 - BELLY.travel * m.copies / FULL - 4,
           width : 11,
           height : 8,
           rx : 2,
           class : 'aid-live-yolkgrip'
         },
            live),
         p => {
           // The grip moves from where it was taken, wherever on it the pointer came down.
           pull ??= {y : p.y, copies : m.copies};
           const copies =
               Math.round(clamp(pull.copies + (pull.y - p.y) / BELLY.travel * FULL, 1, FULL));
           if (copies !== m.copies)
             draft(setNodeCopies(studio.state.document, organId, copies));
         },
         'cells', 'grip',
         () => {
           pull = null;
           settle();
         });
    const pairsTo = count => {
      const doc = setOrganNodes(studio.state.document, organId, count, studio.state.sites);
      if (!doc)
        return studio.notice(label('status.noRoom'));
      change(doc);
    };
    chip(live, x0 - 22, cy + highest + 2, '−', () => pairsTo(m.filling.length - 2),
         m.filling.length > 2, 6);
    chip(live, x0 - 6, cy + highest + 2, '+', () => pairsTo(m.filling.length + 2), m.canGrow, 6);
    const layTo = copies => change(updateCenter(studio.state.document, m.laying[0].id, {copies}));
    if (m.laying.length) {
      chip(live, x0 + widest + 10, cy + highest + 2, '−', () => layTo(m.layCopies - 1),
           m.layCopies > 1, 6);
      chip(live, x0 + widest + 26, cy + highest + 2, '+', () => layTo(m.layCopies + 1),
           m.layCopies < FULL, 6);
    }
  }
  // Filling and laying: above, the commands tried with their round knobs (how hard the organ is
  // told to fill; from which step on the laying cells beat); below, the yolk over the steps, the
  // mark at which the organ is full enough to lay, and the least yolk the plan's young needs. On
  // top the eggs laid.
  function drawTrial() {
    const {svg, live} = picture(trial, TRIAL.height), {L, R, c0, c1, top, base} = TRIAL,
                t0 = m.trial, mid = (c0 + c1) / 2;
    const X = st => L + (R - L) * st / STEPS,
          scale = Math.max(m.largest * .5, t0.room, (m.minimum ?? 0) * 1.2),
          Y = v => base - (base - top) * clamp(v / scale);
    txt(live, 4, c0 + 10, word('fill'));
    txt(live, 4, c1 + 3, word('lay'));
    el('path', {d : `M${L} ${mid} H${R}`, class : 'aid-live-axis'}, live);
    el('path', {
      d : `M${L} ${mid} V${mid - (mid - c0) * input.fill} H${R} V${mid} Z`,
      class : 'aid-live-course'
    },
       live);
    // The laying cells' stroke at a full command, against the strength it needs to set off:
    // the dashed line, half-way down the row.
    const strength = mid + (c1 - mid) * clamp(m.releaseDrive / (2 * m.threshold));
    el('path', {
      d : `M${X(input.lay)} ${mid} V${strength} H${R} V${mid} Z`,
      class : 'aid-live-course',
      opacity : lays() ? 1 : .35
    },
       live);
    el('path', {d : `M${L} ${(mid + c1) / 2} H${R}`, class : 'aid-live-input'}, live);
    txt(live, R - 3, c1 + 10, word('sets'), {'text-anchor' : 'end', class : 'aid-live-small'});
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-track'},
       live);
    el('path', {
      d : path(t0.yolk.map((v, st) => [X(st), Y(v)])) + ` L${R} ${base} L${L} ${base} Z`,
      class : 'aid-live-yolkfill'
    },
       live);
    if (t0.room > 0) {
      el('path', {d : `M${L} ${Y(m.spawn * t0.room)} H${R}`, class : 'aid-live-ending'}, live);
      txt(live, 4, Y(m.spawn * t0.room) + 3, word('full'));
    }
    if (m.minimum !== null) {
      el('path', {d : `M${L} ${Y(m.minimum)} H${R}`, class : 'aid-live-sore'}, live);
      txt(live, R - 3, Y(m.minimum) - 4, word('least'),
          {'text-anchor' : 'end', class : 'aid-live-small aid-live-tired-word'});
    }
    for (const egg of t0.laid)
      eggMark(live, X(egg.step), top - 8, 4.5, egg.enough);
    el('path', {d : `M${L} ${top - 2} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, 4, base, word('empty'));
    txt(live, L, base + 15, word('steps'));
    for (const st of [STEPS / 3, 2 * STEPS / 3])
      txt(live, X(st), base + 15, st, {'text-anchor' : 'middle'});
    txt(live, R, base + 15, STEPS, {'text-anchor' : 'end'});
    film.line = {e : el('path', {class : 'aid-live-now'}, live), X, top : c0, base};
    drag(
        svg,
        el('circle',
           {cx : (L + X(Math.max(60, input.lay))) / 2, cy : mid - (mid - c0) * input.fill, r : 5.5},
           live),
        p => {
          input.fill = clamp((mid - p.y) / (mid - c0));
          again();
        },
        'fill', 'knob');
    drag(svg, el('circle', {cx : X(input.lay), cy : strength, r : 5.5}, live), p => {
      input.lay = clamp(Math.round((p.x - L) / (R - L) * STEPS), 0, STEPS);
      again();
    }, 'lay', 'knob');
  }
  // Life cycle: across, the fish's maturity; up, the yolk the organ holds when full. It grows
  // with the body, from hatching on; its cells work from one maturity and die at another.
  function buildLife(fixed) {
    const {L, R, top, icons} = LIFE, hatch = L + (R - L) * HATCH;
    txt(fixed, L, top - 4, word('perEgg'));
    el('ellipse', {cx : L + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, fixed);
    el('circle', {cx : L + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, fixed);
    fishIcon(fixed, hatch, icons, .5);
    fishIcon(fixed, R - 16, icons, .8);
    el('path', {
      d : `M${L + 22} ${icons} H${hatch - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${hatch + 18} ${icons} H${
          R - 40} m-6 -3.5 l6 3.5 l-6 3.5`,
      class : 'aid-live-arrow'
    },
       fixed);
  }
  function drawLife() {
    const {svg, under, live} = picture(life, LIFE.height, buildLife),
                       {L, R, top, base, beside, whole, least} = LIFE, caps = state.capabilities,
                       until = Math.min(1, m.until), from = Math.max(m.from, HATCH);
    const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L)),
          scale = Math.max(m.largest, (m.minimum ?? 0) * 1.2),
          Y = v => base - (base - top) * clamp(v / scale), egg = r => m.spawn * roomAt(r);
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-track'},
       under);
    if (until > from) {
      const pts = Array.from({length : 41}, (_, k) => {
        const r = from + (until - from - .0005) * k / 40;
        return [ X(r), Y(egg(r)) ];
      });
      el('path', {
        d : path(pts) + ` L${X(until)} ${base} L${X(from)} ${base} Z`,
        class : 'aid-live-yolkfill'
      },
         under);
    }
    if (m.minimum !== null) {
      el('path', {d : `M${L} ${Y(m.minimum)} H${R}`, class : 'aid-live-sore'}, live);
      txt(live, L + 4, Y(m.minimum) - 4, word('least'),
          {class : 'aid-live-small aid-live-tired-word'});
    }
    el('path', {d : `M${X(HATCH)} ${top} V${base + 5}`, class : 'aid-live-hatch'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    // The filling and the laying cells live the same life here: both are set together.
    const phase = to => {
      const doc = setLifePhase(studio.state.document, m.filling[0].id, to, caps.sensitivitySpan,
                               caps.steepnessSpan);
      return m.laying.length && doc ? setLifePhase(doc, m.laying[0].id, to, caps.sensitivitySpan,
                                                   caps.steepnessSpan) ??
                                          doc
                                    : doc;
    };
    const grip = (r, inside, name, move) => {
      const x = inside            ? X(r)
                : name === 'from' ? L - beside
                                  : R + beside,
            y = inside ? clamp(Y(egg(r + (name === 'from' ? .001 : -.001))), top + 6, base - 6)
                       : base - 7;
      drag(svg,
           el('rect',
              {x : x - 4, y : y - 5.5, width : 8, height : 11, rx : 2, class : 'aid-live-yolkgrip'},
              live),
           p => draft(move(rOf(p.x))), name, 'grip', settle);
    };
    grip(m.from, m.from > HATCH, 'from',
         to => phase({start : to <= HATCH + whole ? null : Math.min(to, until - least)}));
    grip(until, until < 1, 'until',
         to => phase({end : to > 1 - whole ? null : Math.max(to, from + least)}));
    const r = input.maturity;
    el('path', {d : `M${X(r)} ${top} V${base}`, class : 'aid-live-input'}, live);
    drag(svg, el('circle', {cx : X(r), cy : Y(egg(r)), r : 5.5}, live), p => {
      input.maturity = rOf(p.x);
      again();
    }, 'maturity', 'knob');
  }
  // Whether one more pair of filling cells finds its places: asked once for each document.
  let asked = null, room = false;
  function roomFor(eggs, filling) {
    if (asked !== state.document) {
      asked = state.document;
      room = eggs.centers.length + 2 <= nodeLimit(eggs, state.sites) &&
             !!setOrganNodes(state.document, organId, filling + 2, state.sites);
    }
    return room;
  }
  function show(next) {
    state = next;
    const eggs = organ();
    if (!eggs)
      return;
    m = derive(eggs);
    if (!m)
      return;
    m.canGrow = roomFor(eggs, m.filling.length);
    m.trial = run();
    film.eggs?.replaceChildren();
    drawBelly();
    drawTrial();
    drawLife();
    tick(0);
  }
  // The organ at this moment: its yolk, and the eggs laid so far on the ground behind the fish.
  function tick(dt) {
    if (!m || !film.yolk || !film.sac)
      return;
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    const t0 = m.trial, at = Math.floor(step),
          level = t0.room > 0 ? (t0.yolk[at] ?? 0) / t0.room : 0, {long, high} = film.sac;
    film.yolk.setAttribute('rx', (long / 2 * Math.sqrt(level)).toFixed(1));
    film.yolk.setAttribute('ry', (high * Math.sqrt(level)).toFixed(1));
    film.line?.e.setAttribute(
        'd', `M${film.line.X(step).toFixed(1)} ${film.line.top} V${film.line.base}`);
    const done = t0.laid.filter(egg => egg.step <= step);
    if (film.eggs.childElementCount !== done.length) {
      film.eggs.replaceChildren();
      done.forEach((egg, i) => eggMark(film.eggs, 292 - 13 * (i % 6) - 6 * (Math.floor(i / 6) % 2),
                                       BELLY.ground - 6 - 9 * Math.floor(i / 6),
                                       3 + 3 * Math.sqrt(egg.yolk / m.largest), egg.enough));
    }
  }
  return {root, show, tick};
});
