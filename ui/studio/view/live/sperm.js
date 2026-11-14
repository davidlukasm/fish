// The sperm organ's live inspector: after hatching a cloud that reaches an egg or does not and
// dims what lies behind it; in the egg a secretion that thins the shell.
// The engine (reproduction.cc, transfer_gametes, fill_sperm, release_sperm, reproduction;
// physiology.cc, organ_capacity; sperm_field.cc, sperm_optics):
//   room    = body size x min(most, perCell x the organ's motor cells)
//   filling = f / (1 + f) x fill x body size a step, f the filling cells' command times their
//             strength, never beyond the room
//   after hatching: a stroke of the laying cells gives off the whole store once it holds at
//             least spawnLeast
//   in the egg: the store is a secretion; a stroke spends it on the shell, which grows thinner
//             by secretion / shell radius (never counted below 1), and outside it shows as a
//             cloud that fertilises nothing. The pressure cells read the sperm store, which
//             stays empty in the egg.
// ASSUMED for the pictures: the body's size is its maturity; the fish has reserve to spare; the
// laying cells beat once, at the step the knob sets. The cloud is a picture only: how far it
// reaches follows the root of its amount, without the engine's densities, currents and mating
// rules; that it dims what lies behind it is shown, not counted. Hatching is marked at a
// schematic place; that the embryo also needs force, development, tissue and reserve to hatch is
// not shown.
import {ATELIER_LIMITS} from '../../../schema.js';
import {formatNumber, percent, t} from '../../../strings.js';
import {
  findOrgan,
  lifePhase,
  setLifePhase,
  setNodeCopies,
  setOrganNodes,
  updateCenter
} from '../../model/document.js';
import {nodeLimit} from '../../model/organs.js';
import {label} from '../kit.js';
import {chip, clamp, drag, el, fishIcon, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.sperm.' + key, values);
const FULL = ATELIER_LIMITS.max_copies, STEPS = 900, ROUND_MS = 12000, HATCH = .5;
// reach: picture units a cloud reaches for the root of one unit of sperm; fade: steps until it
// is gone; grow: steps until it has spread; plant: how far behind the vent the plant stands.
const CLOUD = Object.freeze({reach : 14, fade : 260, grow : 90, plant : 34, thick : 12});
const SCENE = Object.freeze({
  height : 144,
  fishX : 92,
  fishY : 60,
  ground : 122,
  vent : 156,
  eggs : [ 182, 290 ],
  sac : -34
});
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
const sizeOf = share => [14 + 50 * Math.sqrt(clamp(share)), 5 + 8 * Math.sqrt(clamp(share))];

liveKind('sperm', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-sperm';
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
  const scene = svgOf();
  heading(word('trial'));
  const trial = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the organ: not part of the fish.
  const input = {fill : .8, lay : 300, egg : .45, maturity : 1};
  const film = {
    store : null,
    sac : null,
    clouds : null,
    egg : null,
    plant : null,
    shell : null,
    line : null
  };
  let state = studio.state, m = null, step = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show(studio.state);

  function derive(sperm) {
    const G = state.capabilities?.gonads, base = G?.sperm;
    if (!base)
      return null;
    const of = key => sperm.centers.filter(c => c.key === key), filling = of('growth'),
          laying = of('release');
    if (!filling.length)
      return null;
    const cells = list => list.reduce((sum, c) => sum + c.copies, 0), phase = lifePhase(filling[0]);
    // The egg this plan's egg organ lays, for the shell's radius: its room from the report.
    const yolk = state.anatomy?.budget?.yolk?.store;
    return {
      filling,
      laying,
      fillCells : cells(filling),
      layCells : cells(laying),
      copies : filling[0].copies,
      layCopies : laying[0]?.copies ?? 0,
      largest : base.most,
      perCell : base.perCell,
      room : Math.min(base.most, base.perCell * (cells(filling) + cells(laying))),
      rate : base.fill,
      least : base.spawnLeast,
      lays : cells(laying) / FULL >= G.release,
      // 4 x root(yolk / 300), never counted below 1 (egg_radius, reproduction.cc).
      shellRadius : Math.max(1, Number.isFinite(yolk) && yolk > 0 ? 4 * Math.sqrt(yolk / 300) : 1),
      from : phase.start ?? 0,
      until : phase.end ?? 1
    };
  }
  const works = r => r >= m.from && (m.until >= 1 || r < m.until);
  const roomAt = (r = input.maturity) => works(r) ? r * m.room : 0;
  // One trial: the store step by step, the cloud given off, and in the egg the shell.
  function run() {
    const room = roomAt(), inEgg = input.maturity < HATCH, drive = input.fill * m.fillCells / FULL,
          each = drive / (1 + drive) * m.rate * input.maturity, store = [], shell = [], clouds = [];
    let s = 0, sh = 1;
    for (let st = 0; st <= STEPS; st++) {
      store.push(s);
      shell.push(sh);
      if (room <= 0)
        continue;
      if (m.lays && st === input.lay && (inEgg ? s > 0 : s >= m.least)) {
        if (inEgg)
          sh = Math.max(0, sh - s / m.shellRadius);
        clouds.push({step : st, amount : s, fertile : !inEgg});
        s = 0;
        continue;
      }
      s = Math.min(room, s + each);
    }
    const reach = clouds.length ? CLOUD.reach * Math.sqrt(clouds[0].amount) : 0,
          eggX = SCENE.eggs[0] + (SCENE.eggs[1] - SCENE.eggs[0]) * input.egg;
    return {
      room,
      inEgg,
      store,
      shell,
      clouds,
      reach,
      eggX,
      reached : !inEgg && reach >= eggX - SCENE.vent,
      thin : shell.at(-1)
    };
  }

  function buildScene(fixed) {
    el('path', {d : `M0 ${SCENE.ground} H300`, class : 'aid-live-sand'}, fixed);
  }
  function drawScene() {
    const {svg, under, live} = picture(scene, SCENE.height, buildScene),
                       {fishX, fishY, ground, vent, eggs, sac} = SCENE, t0 = m.trial;
    kind.textContent = word(t0.inEgg            ? (t0.thin < 1 ? 'thins' : 'thick')
                            : !t0.clouds.length ? (m.lays ? 'none' : 'weak')
                            : t0.reached        ? 'reaches'
                                                : 'thin');
    if (t0.inEgg)
      txt(live, 4, 10, t0.thin < 1 ? word('shell', {p : percent(t0.thin)}) : word('unchanged'),
          {class : 'aid-live-small'});
    else if (t0.clouds.length)
      txt(live, 4, 10, word('amount', {n : formatNumber(t0.clouds[0].amount, 1)}),
          {class : 'aid-live-small'});
    const frame = el('clipPath', {id : 'aid-live-spermframe-' + organId}, under);
    el('rect', {x : 0, y : 14, width : 300, height : SCENE.height - 14}, frame);
    film.clouds = el('g', {'clip-path' : `url(#aid-live-spermframe-${organId})`}, under);
    // The body: the embryo in its shell, or the fish; the organ in its belly.
    const scale = t0.inEgg ? .5 : .82, bx = t0.inEgg ? 150 : fishX,
          by = t0.inEgg ? fishY + 6 : fishY,
          g = el('g', {transform : `translate(${bx} ${by}) scale(${scale})`}, live);
    film.shell = t0.inEgg
                     ? el('ellipse',
                          {cx : 150, cy : by, rx : 66, ry : 46, class : 'aid-live-eggshell'}, under)
                     : null;
    el('path', {d : FISH, class : 'aid-live-body'}, g);
    el('circle', {cx : -62, cy : -6, r : 3.4, class : 'aid-live-eye'}, g);
    // The room at this maturity with every cell that counts (dotted), and the organ in it.
    const [widest, highest] = sizeOf(input.maturity), [ long, high ] = sizeOf(t0.room / m.largest),
                   cy = 14, all = m.fillCells + m.layCells,
                   shown = Math.max(1, Math.min(all, Math.round(m.largest / m.perCell))),
                   border = long * m.fillCells / all;
    el('ellipse',
       {cx : sac + widest / 2, cy, rx : widest / 2, ry : highest, class : 'aid-live-bellyroom'}, g);
    film.sac = {long, high};
    el('ellipse', {
      cx : sac + long / 2,
      cy,
      rx : long / 2,
      ry : high,
      class : 'aid-live-miltsac',
      opacity : t0.room > 0 ? 1 : .35
    },
       g);
    film.store = el('ellipse', {cx : sac + long / 2, cy, class : 'aid-live-milt'}, g);
    const clip = el('clipPath', {id : 'aid-live-spermsac-' + organId}, g);
    el('ellipse', {cx : sac + long / 2, cy, rx : long / 2, ry : high}, clip);
    const chambers =
        el('g', {'clip-path' : `url(#aid-live-spermsac-${organId})`, 'pointer-events' : 'none'}, g);
    el('rect', {
      x : sac + border,
      y : cy - high,
      width : long - border,
      height : 2 * high,
      class : 'aid-live-laying dark'
    },
       chambers);
    for (let i = 1; i < shown; i++)
      el('path',
         {d : `M${sac + long * i / shown} ${cy - high} v${2 * high}`, class : 'aid-live-chamber'},
         chambers);
    // The filling cells: fuller with the grip (up), more or fewer pairs with the buttons before
    // the organ. The laying cells: fuller or thinner with the buttons behind it.
    const at = (x, y) => [bx + scale * x, by + scale * y],
          [ gx, gy0 ] = at(sac + border / 2, cy - high - 8);
    drag(svg,
         el('rect', {
           x : gx - 5.5,
           y : gy0 - 10 * m.copies / FULL - 4,
           width : 11,
           height : 8,
           rx : 2,
           class : 'aid-live-miltgrip'
         },
            live),
         p => draft(setNodeCopies(studio.state.document, organId,
                                  Math.round(clamp((gy0 - p.y) / 10 * FULL, 1, FULL)))),
         'cells', 'grip', settle);
    const pairsTo = count => {
      const doc = setOrganNodes(studio.state.document, organId, count, studio.state.sites);
      if (!doc)
        return studio.notice(label('status.noRoom'));
      change(doc);
    };
    const [px, py] = at(sac, cy + highest), [ qx ] = at(sac + widest, 0);
    chip(live, px - 22, py + 8, '−', () => pairsTo(m.filling.length - 2), m.filling.length > 2, 6);
    chip(live, px - 6, py + 8, '+', () => pairsTo(m.filling.length + 2), m.canGrow, 6);
    const layTo = copies => change(updateCenter(studio.state.document, m.laying[0].id, {copies}));
    if (m.laying.length) {
      chip(live, qx + 10, py + 8, '−', () => layTo(m.layCopies - 1), m.layCopies > 1, 6);
      chip(live, qx + 26, py + 8, '+', () => layTo(m.layCopies + 1), m.layCopies < FULL, 6);
    }
    film.egg = film.plant = null;
    if (t0.inEgg)
      return;
    // One plant stands behind the cloud, one clear of it to compare; an egg lies on the ground
    // as far behind the fish as the knob puts it.
    const plant = x => el('path', {
      d : `M${x} ${ground} q-4 -20 2 -34 M${x + 6} ${ground} q6 -16 0 -28 M${x + 12} ${
          ground} q8 -12 6 -22`,
      class : 'aid-live-plant'
    },
                          live);
    plant(6);
    film.plant = plant(vent + CLOUD.plant);
    film.egg = el('g', {}, live);
    el('path', {d : `M${t0.eggX} ${ground + 2} v6`, class : 'aid-live-axis'}, live);
    drag(svg, el('circle', {cx : t0.eggX, cy : ground + 13, r : 5.5}, live), p => {
      input.egg = clamp((p.x - eggs[0]) / (eggs[1] - eggs[0]));
      again();
    }, 'egg', 'knob');
  }
  // Filling and giving off: the commands tried, the store over the steps and the cloud given
  // off; in the egg also the shell, which the cloud thins.
  function drawTrial() {
    const {svg, live} = picture(trial, TRIAL.height), {L, R, c0, c1, top, base} = TRIAL,
                t0 = m.trial, mid = (c0 + c1) / 2;
    const X = st => L + (R - L) * st / STEPS, Y = v => base - (base - top) * clamp(v / m.largest),
          SY = v => base - (base - top) * clamp(v);
    txt(live, 4, c0 + 10, word('fill'));
    txt(live, 4, c1 + 3, word('give'));
    el('path', {d : `M${L} ${mid} H${R}`, class : 'aid-live-axis'}, live);
    el('path', {
      d : `M${L} ${mid} V${mid - (mid - c0) * input.fill} H${R} V${mid} Z`,
      class : 'aid-live-course'
    },
       live);
    // The laying cells' one stroke.
    el('path', {
      d : `M${X(input.lay)} ${mid} V${c1}`,
      class : 'aid-live-course',
      'stroke-width' : 3,
      opacity : m.lays ? .7 : .25
    },
       live);
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-track'},
       live);
    el('path', {
      d : path(t0.store.map((v, st) => [X(st), Y(v)])) + ` L${R} ${base} L${L} ${base} Z`,
      class : 'aid-live-miltfill'
    },
       live);
    if (t0.room > 0) {
      el('path', {d : `M${L} ${Y(t0.room)} H${R}`, class : 'aid-live-ending'}, live);
      txt(live, 4, Y(t0.room) + 3, word('full'));
    }
    if (t0.inEgg) {
      el('path', {d : path(t0.shell.map((v, st) => [X(st), SY(v)])), class : 'aid-live-shellline'},
         live);
      txt(live, R - 3, SY(t0.shell.at(-1)) - 5, word('shellWord'),
          {'text-anchor' : 'end', class : 'aid-live-small'});
    }
    for (const cloud of t0.clouds)
      el('circle', {
        cx : X(cloud.step),
        cy : top - 9,
        r : 2 + 1.1 * Math.sqrt(cloud.amount),
        class : 'aid-live-milt',
        opacity : cloud.fertile ? .85 : .35
      },
         live);
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
    drag(svg, el('circle', {cx : X(input.lay), cy : c1, r : 5.5}, live), p => {
      input.lay = clamp(Math.round((p.x - L) / (R - L) * STEPS), 0, STEPS);
      again();
    }, 'lay', 'knob');
  }
  // Life cycle: across, the fish's maturity; up, what the organ holds when full. In the egg it
  // holds the secretion that thins the shell, after hatching the sperm.
  function buildLife(fixed) {
    const {L, R, top, icons} = LIFE, hatch = L + (R - L) * HATCH;
    txt(fixed, L + 4, top + 11, word('secretion'), {class : 'aid-live-small'});
    txt(fixed, hatch + 5, top + 11, word('sperm'), {class : 'aid-live-small'});
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
                       until = Math.min(1, m.until);
    const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L)),
          Y = v => base - (base - top - 16) * clamp(v / m.largest);
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-track'},
       under);
    if (until > m.from) {
      const pts = Array.from({length : 41}, (_, k) => {
        const r = m.from + (until - m.from - .0005) * k / 40;
        return [ X(r), Y(roomAt(r)) ];
      });
      el('path', {
        d : path(pts) + ` L${X(until)} ${base} L${X(m.from)} ${base} Z`,
        class : 'aid-live-miltfill'
      },
         under);
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
            y = inside ? clamp(Y(roomAt(r + (name === 'from' ? .001 : -.001))), top + 6, base - 6)
                       : base - 7;
      drag(svg,
           el('rect',
              {x : x - 4, y : y - 5.5, width : 8, height : 11, rx : 2, class : 'aid-live-miltgrip'},
              live),
           p => draft(move(rOf(p.x))), name, 'grip', settle);
    };
    grip(m.from, m.from > 0, 'from',
         to => phase({start : to < whole ? null : Math.min(to, until - least)}));
    grip(until, until < 1, 'until',
         to => phase({end : to > 1 - whole ? null : Math.max(to, m.from + least)}));
    const r = input.maturity;
    el('path', {d : `M${X(r)} ${top} V${base}`, class : 'aid-live-input'}, live);
    drag(svg, el('circle', {cx : X(r), cy : Y(roomAt(r)), r : 5.5}, live), p => {
      input.maturity = Math.max(.05, rOf(p.x));
      again();
    }, 'maturity', 'knob');
  }
  // Whether one more pair of filling cells finds its places: asked once for each document.
  let asked = null, room = false;
  function roomFor(sperm, filling) {
    if (asked !== state.document) {
      asked = state.document;
      room = sperm.centers.length + 2 <= nodeLimit(sperm, state.sites) &&
             !!setOrganNodes(state.document, organId, filling + 2, state.sites);
    }
    return room;
  }
  function show(next) {
    state = next;
    const sperm = organ();
    if (!sperm)
      return;
    m = derive(sperm);
    if (!m)
      return;
    m.canGrow = roomFor(sperm, m.filling.length);
    m.trial = run();
    drawScene();
    drawTrial();
    drawLife();
    tick(0);
  }
  // The organ at this moment: its store; the cloud given off, spreading and thinning; the egg,
  // marked once the cloud has reached it and marked from then on; the plant behind the cloud,
  // dimmed while the cloud lies over it; in the egg the shell, as thick as it still is.
  function tick(dt) {
    if (!m || !film.store || !film.sac)
      return;
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    const t0 = m.trial, at = Math.floor(step),
          level = t0.room > 0 ? (t0.store[at] ?? 0) / t0.room : 0, {long, high} = film.sac,
          {vent, ground, fishY} = SCENE;
    film.store.setAttribute('rx', (long / 2 * Math.sqrt(level)).toFixed(1));
    film.store.setAttribute('ry', (high * Math.sqrt(level)).toFixed(1));
    film.line?.e.setAttribute(
        'd', `M${film.line.X(step).toFixed(1)} ${film.line.top} V${film.line.base}`);
    film.clouds.replaceChildren();
    let dim = 0, done = false;
    for (const cloud of t0.clouds) {
      const age = step - cloud.step, reach = CLOUD.reach * Math.sqrt(cloud.amount);
      if (age < 0)
        continue;
      done ||= cloud.fertile && reach >= t0.eggX - vent &&
               age > CLOUD.grow * Math.min(1, (t0.eggX - vent) / Math.max(1, reach));
      if (age > CLOUD.fade)
        continue;
      const grown = Math.min(1, age / CLOUD.grow), radius = 6 + reach * grown,
            dense = (1 - age / CLOUD.fade) * (cloud.fertile ? 1 : .5);
      if (t0.inEgg)
        el('ellipse', {
          cx : 150,
          cy : fishY + 6,
          rx : 70 + 16 * grown,
          ry : 50 + 12 * grown,
          class : 'aid-live-ink',
          'stroke-width' : 2 + .5 * Math.sqrt(cloud.amount),
          opacity : (.6 * dense).toFixed(2)
        },
           film.clouds);
      else
        el('circle', {
          cx : vent,
          cy : fishY + 16,
          r : radius,
          class : 'aid-live-milt',
          opacity : (.28 * dense).toFixed(2)
        },
           film.clouds);
      if (radius >= CLOUD.plant)
        dim = Math.max(dim, dense * Math.min(1, cloud.amount / CLOUD.thick));
    }
    film.shell?.setAttribute('stroke-width', (1 + 7 * (t0.shell[at] ?? 1)).toFixed(1));
    if (!film.egg)
      return;
    film.plant.setAttribute('opacity', (1 - .85 * dim).toFixed(2));
    if (film.egg.childElementCount === 0 || (film.egg.dataset.done === '1') !== done) {
      film.egg.replaceChildren();
      film.egg.dataset.done = done ? '1' : '0';
      el('circle', {cx : t0.eggX, cy : ground - 6, r : 5.5, class : 'aid-live-yolk'}, film.egg);
      if (done)
        el('circle', {cx : t0.eggX - 1.4, cy : ground - 6.5, r : 1.8, class : 'aid-live-pupil'},
           film.egg);
    }
  }
  return {root, show, tick};
});
