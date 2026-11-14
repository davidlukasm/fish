// The tail muscle's live inspector: the fish from above with its bundles, and the force they give
// over a swim at the command tried.
// A bundle is one type of the muscle's cells (organTypes): its cells share strength (copies),
// fibres (time constant) and threshold. A muscle whose cells have no type is one bundle.
// Force: each bundle pulls with tanh(command - threshold): a muscle cell's dead zone is its own
// threshold, max(0, 2 x unit threshold - 1), which is the plan's threshold where that is positive
// (substrate.cc, MUSCLE_RECRUITMENT; not the bias scale that gates glands and bladders). Times its cells' strength and
// their fibres' force, as far as its fast fibres are rested (ui/fibre.js, fibreCourse).
// A muscle saved with a sprint share shows its sprint nodes as bundles of their own, as they pull
// in the fish; the first edit makes them so in the document (splitSprint), node by node.
import {ATELIER_LIMITS, MOTOR_KIND} from '../../../schema.js';
import {fastShare, fibreCourse, fibreForce, fibreHex, fibreTau} from '../../../fibre.js';
import {percent, t} from '../../../strings.js';
import {
  addOrganType,
  findCenter,
  findOrgan,
  isSprintNode,
  lifePhase,
  muscleTrait,
  organTypes,
  removeOrganType,
  setLifePhase,
  setMuscleTrait,
  splitSprint,
  SPRINT_THRESHOLD,
  updateCenter
} from '../../model/document.js';
import {label} from '../kit.js';
import {chip, clamp, drag, el, fishIcon, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.tail.' + key, values);
const TAIL = Object.freeze({
  steps : 300,
  bundles : 5,
  cell : 2.5,
  fishY : 76,
  from : 108,
  to : 226,
  M0 : 14,
  M1 : 250,
  MB : 190,
  FY : 208,
  height : 236,
  L : 64,
  R : 290,
  top : 28,
  base : 146,
  holder : 26,
  nose : 20,
  body : 220,
  swing : .25,
  // The command tried runs this far: beyond a sprint bundle's threshold (1), so that it can be
  // made to pull.
  command : 2,
  // How far a square on a band is pulled for one more unit of strength.
  pull : 5,
  // The speed picture.
  VT : 28,
  VB : 118,
  // A schema's fixed assumptions: how many steps the body's speed lags behind the push in open
  // water and deep in sand.
  lag : {water : 14, sand : 3},
  // Where the life picture marks hatching: a schematic place, not the plan's own (the egg's
  // energy, and with it the tissue a fish hatches with, comes from its mother).
  hatch : .5
});
// The life picture.
const LIFE = Object.freeze({L : 44, R : 264, top : 14, base : 86, icons : 104, height : 118, samples : 126, edge : .004, beside : 16, apart : 13, whole : .015, least : .08});
// How far the body swings at a place along it (0 nose, 1 the tail's tip), as a share of the tip's
// swing: the stiffer the fish, the nearer to the tail it begins. A drawing's measure, not the
// engine's: there undulation is one number of the body (body_plan.cc).
const swingAt = (along, wriggle) => Math.pow(along, 2 - 1.4 * wriggle);
const wriggleFrom = wriggle => TAIL.nose + TAIL.body * Math.pow(TAIL.swing, 1 / (2 - 1.4 * wriggle));
const wriggleAt = x =>
    clamp((2 - Math.log(TAIL.swing) / Math.log(clamp((x - TAIL.nose) / TAIL.body, .05, .5))) / 1.4);

// The muscle's bundles as the document has them.
function bundlesOf(state, organ) {
  const kind = organ.centers[0]?.key;
  // A sprint node's threshold is replaced when the plan is compiled (document.js, compile), so a
  // type's sprint nodes are a bundle apart from its other nodes.
  const sprints = c => isSprintNode(organ, organ.centers.indexOf(c));
  // A bundle works from the maturity `from` on (its cells' output answers maturity) and dies at
  // `until` (their death does); 0 and 1 are the whole life (lifePhase).
  const bundle = (cells, sprint) => ({
    id : cells[0].id,
    from : lifePhase(cells[0]).start ?? 0,
    until : lifePhase(cells[0]).end ?? 1,
    strength : cells.reduce((sum, c) => sum + c.copies, 0),
    copies : cells[0].copies,
    fast : fastShare(cells[0].tau),
    gate : Math.max(0, sprint ? SPRINT_THRESHOLD : cells[0].threshold)
  });
  return organTypes(organ).filter(type => type.centers[0].key === kind).flatMap(type => [
    [ type.centers.filter(c => !sprints(c)), false ], [ type.centers.filter(sprints), true ]
  ].filter(([ cells ]) => cells.length).map(([ cells, sprint ]) => bundle(cells, sprint)));
}
const driveOf = (bundle, command) => Math.tanh(Math.max(0, command - bundle.gate));
// A dead bundle neither pulls nor costs; one that does not work yet is there already.
const works = (b, maturity) => (b.until >= 1 || maturity < b.until) && maturity >= b.from;
// What the tail's push moves: the body's mass, never counted below the engine's floor
// (movement.cc: push = stroke_push x weakness / max(MIN_THRUST_MASS, mass)). A schema: a healthy
// fish whose mass is its maturity; reserve, organs and gut content are left out.
const massAt = (maturity, tail) => Math.max(tail.thrustFloor, maturity);
// The body's speed follows the push with a lag and rolls on when the push stops.
function speedOf(push, share, lag) {
  const out = [];
  let v = 0;
  for (const p of push) {
    v += (p * share - v) / lag;
    out.push(v);
  }
  return out;
}
function derive(bundles, input, wriggle, tail) {
  const blank = () => Array(TAIL.steps + 1).fill(0), spent = blank(), bands = [];
  let under = blank(), fastAll = 0;
  // The bundles in the order they join: the lowest threshold first, at the bottom.
  for (const i of bundles.map((b, i) => i).sort((p, q) => bundles[p].gate - bundles[q].gate)) {
    const b = bundles[i], drive = works(b, input.maturity) ? driveOf(b, input.height) : 0,
          {force, reserve} = fibreCourse(b.fast, TAIL.steps + 1, drive, input.stop),
          over = under.map((u, st) => u + b.strength * force[st]);
    const weight = b.strength * fibreForce(b.fast) * b.fast * drive;
    fastAll += weight;
    reserve.forEach((r, st) => { spent[st] += weight * (1 - r); });
    bands.push({i, under, over, pulls : drive > 0});
    under = over;
  }
  const pulling = bundles.filter(b => works(b, input.maturity)),
        pull = pulling.reduce((sum, b) => sum + b.strength * driveOf(b, input.height), 0);
  // Speed, as a schema: wriggling costs push in open water (undulation_loss) and eases the way
  // deep in sand, where the drag falls from the stiff body's to the wriggling one's
  // (environment.hh); the lighter the body, the faster.
  const mass = tail ? massAt(input.maturity, tail) : 1, drag = tail?.sedimentDrag;
  const water = tail ? speedOf(under, (1 - tail.undulationLoss * wriggle) / mass, TAIL.lag.water) : null,
        sand = drag ? speedOf(under, 1 / (drag.stiff * (drag.wriggling / drag.stiff) ** wriggle) / mass, TAIL.lag.sand) : null;
  // The picture's scale: this muscle's water speed at a full command in the lightest body. So the
  // water's curve keeps its height while the muscle or the wriggling is set (David 13.11.: it
  // changes its shape only, the sand's curve stands against it), and it falls with a weaker
  // command or a heavier body, which are tried, not set.
  const best = tail ? bundles.reduce((sum, b) => sum + b.strength * fibreForce(b.fast) * driveOf(b, TAIL.command), 0) *
                          (1 - tail.undulationLoss * wriggle) / tail.thrustFloor
                    : 1;
  return {
    water,
    sand,
    fastest : Math.max(1e-9, best),
    bands,
    total : under,
    tired : fastAll > 0 ? spent.map(v => v / fastAll) : null,
    pulls : Math.max(...under) > 1e-6,
    quick : pull > 0 ? pulling.reduce((sum, b) => sum + b.strength * driveOf(b, input.height) * b.fast, 0) / pull
                     : 0,
    scale : Math.max(1e-6, 1.1 * Math.max(...under))
  };
}

liveKind('tail', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-tail';
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
  const fish = svgOf();
  heading(word('force'));
  const force = svgOf();
  heading(word('speed'));
  const speed = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the muscle, and which bundle is chosen: not part of the fish.
  const input = {height : TAIL.command, stop : 200, maturity : 1};
  const lines = {force : null, speed : null};
  const film = {body : null, eye : null, spine : null, marks : null, paths : [], amp : 0, phase : 0, level : null};
  let chosen = 0, state = studio.state, bundles = [], model = null, wriggle = 0, step = 0, pulled = null;
  const organ = () => findOrgan(studio.state.document, organId);
  // A dragged grip writes a draft; let go, the drag becomes one undo step.
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  // Every edit starts from the document in which the sprint nodes are bundles of their own.
  const settled = () => splitSprint(studio.state.document, organId) ?? studio.state.document;
  const edit = (bundle, patch) => updateCenter(settled(), bundle.id, patch);

  function buildFish(fixed) {
    const {M0, M1, FY} = TAIL, x1 = M1 + 26,
          grad = el('linearGradient', {id : 'aid-live-fibres'}, el('defs', {}, fixed));
    film.body = el('path', {class : 'aid-live-body'}, fixed);
    film.eye = el('circle', {cx : 36, r : 3, class : 'aid-live-eye'}, fixed);
    film.spine = el('path', {class : 'aid-live-spine'}, fixed);
    film.marks = el('g', {class : 'aid-live-bundles'}, fixed);
    el('stop', {offset : 0, 'stop-color' : fibreHex(0)}, grad);
    el('stop', {offset : 1, 'stop-color' : fibreHex(1)}, grad);
    el('rect', {x : M0 + 4, y : FY - 4, width : x1 - M0 - 4, height : 8, rx : 4, fill : 'url(#aid-live-fibres)', opacity : .85}, fixed);
    txt(fixed, M0 + 4, FY + 21, word('enduring'));
    txt(fixed, x1, FY + 21, word('strong'), {'text-anchor' : 'end'});
  }
  function drawFish() {
    const {svg, live} = picture(fish, TAIL.height, buildFish),
          {M0, M1, MB, FY, cell, fishY} = TAIL, most = ATELIER_LIMITS.max_copies;
    const width = (M1 - M0) / TAIL.bundles, hOf = b => 4 + cell * b.copies, cb = bundles[chosen],
          x0 = M0 + chosen * width, h = hOf(cb), fx0 = M0 + 4, fx1 = M1 + 26;
    // What the tail costs at rest: its share of this plan's whole resting need, from the engine.
    const rest = state.anatomy?.tail?.restShare;
    if (Number.isFinite(rest))
      txt(live, 4, 10, word('rest', {p : percent(rest, 1)}), {class : 'aid-live-small'});
    // In the egg the fish lies in its shell.
    if (input.maturity < TAIL.hatch)
      el('ellipse', {cx : 146, cy : fishY, rx : 142, ry : 46, class : 'aid-live-shell'}, live);
    film.marks.replaceChildren();
    const along = (TAIL.to - TAIL.from) / bundles.length;
    film.paths = bundles.flatMap((b, i) => [ -1, 1 ].map(side => ({
                                                          side,
                                                          from : TAIL.from + i * along + 2,
                                                          to : TAIL.from + (i + 1) * along - 2,
                                                          e : el('path', {stroke : fibreHex(b.fast), opacity : works(b, input.maturity) ? 1 : .25}, film.marks)
                                                        })));
    // How much of the body wriggles: the grip sits on the spine where the body swings a quarter
    // as far as the tail's tip.
    drag(svg, el('circle', {cx : wriggleFrom(wriggle), cy : fishY, r : 4.5}, live),
         p => draft(setMuscleTrait(studio.state.document, MOTOR_KIND.forward, 'undulation', wriggleAt(p.x), studio.state.sites)),
         'wriggle', 'grip', settle);
    // The bundles across the width: colour = fibres, height = strength. The chosen one is framed
    // and carries its grip (up for stronger) and its (×).
    bundles.forEach((b, i) => el('rect', {
                                x : M0 + i * width + 1,
                                y : MB - hOf(b),
                                width : width - 2,
                                height : hOf(b),
                                rx : 3,
                                fill : fibreHex(b.fast),
                                opacity : works(b, input.maturity) ? 1 : .25,
                                class : 'aid-live-chip'
                              },
                                 live)
                                  .addEventListener('pointerdown', () => {
                                    chosen = i;
                                    show(studio.state);
                                  }));
    el('rect', {x : x0 - 1, y : MB - h - 2, width : width + 2, height : h + 4, rx : 4, class : 'aid-live-chosen'}, live);
    drag(svg, el('rect', {x : x0 + width / 2 - 6, y : MB - h - 8, width : 12, height : 12, rx : 2}, live),
         p => draft(edit(cb, {copies : clamp(Math.round((MB - p.y - 4) / cell), 1, most)})), 'bundle', 'grip', settle);
    chip(live, x0 + width - 4, MB - h - 3, '×', () => {
      const from = settled(), doc = removeOrganType(from, organId, findCenter(from, cb.id).center.profile ?? '');
      chosen = Math.min(chosen, bundles.length - 2);
      change(doc);
    }, bundles.length > 1, 6.5);
    chip(live, M1 + 22, MB - 10, '+', () => {
      const added = addOrganType(settled(), organId, studio.state.sites);
      if (!added)
        return studio.notice(label('status.noRoom'));
      chosen = bundles.length;
      change(added.document);
    }, bundles.length < TAIL.bundles, 8);
    // The chosen bundle's fibres.
    drag(svg, el('circle', {cx : fx0 + (fx1 - fx0) * cb.fast, cy : FY, r : 7}, live),
         p => draft(edit(cb, {tau : fibreTau(clamp((p.x - fx0) / (fx1 - fx0)))})), 'fibre', 'grip', settle);
  }
  function drawForce() {
    const {svg, live} = picture(force, 168), {L, R, top, base, holder, steps} = TAIL, m = model,
          most = ATELIER_LIMITS.max_copies, cb = bundles[chosen];
    const X = st => L + (R - L) * st / steps, Y = v => base - (base - top) * v / m.scale,
          CY = v => base - (base - top) * clamp(v / TAIL.command), vOf = y => TAIL.command * clamp((base - y) / (base - top));
    // The holder of the command, filling with it while it lasts.
    txt(live, holder, top - 10, word('command'), {'text-anchor' : 'middle'});
    el('rect', {x : holder - 5, y : top, width : 10, height : base - top, rx : 5, class : 'aid-live-track'}, live);
    film.level = el('rect', {x : holder - 4, width : 8, rx : 4, class : 'aid-live-level'}, live);
    let chosenBand = null;
    for (const b of m.bands) {
      const shape = last => path(b.over.slice(0, last + 1).map((v, st) => [ X(st), Y(v) ])) + ' L' +
                            path(b.under.slice(0, last + 1).map((v, st) => [ X(st), Y(v) ]).reverse()).slice(1) + 'Z';
      el('path', {d : shape(steps), fill : fibreHex(bundles[b.i].fast), opacity : .85, class : 'aid-live-chip'}, live)
          .addEventListener('pointerdown', () => {
            chosen = b.i;
            show(studio.state);
          });
      if (b.i === chosen && b.pulls)
        chosenBand = {b, d : shape(Math.max(1, input.stop - 1))};
    }
    if (chosenBand)
      el('path', {d : chosenBand.d, class : 'aid-live-chosen'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, base + 15, word('steps'));
    for (const st of [ 100, 200, 300 ])
      txt(live, X(st), base + 15, st, {'text-anchor' : st === steps ? 'end' : 'middle'});
    if (m.pulls && m.tired) {
      const peak = m.tired.indexOf(Math.max(...m.tired)), at = Math.max(40, Math.min(peak, input.stop - 70));
      const TY = v => base - (base - top) * clamp(v);
      if (m.tired[peak] > .02)
        el('path', {d : path(m.tired.map((v, st) => [ X(st), TY(v) ])), class : 'aid-live-tired'}, live);
      if (m.tired[peak] > .2)
        txt(live, X(at), Math.max(top + 8, Math.min(TY(m.tired[at]), Y(m.total[at])) - 7), word('tired'), {'text-anchor' : 'middle', class : 'aid-live-tired-word'});
    }
    // The command: its end, its strength, its knob.
    el('path', {d : `M${X(input.stop)} ${top - 6} V${base}`, class : 'aid-live-ending'}, live);
    el('path', {d : `M${holder + 12} ${CY(input.height)} H${X(input.stop)}`, class : 'aid-live-input'}, live);
    txt(live, X(input.stop) + (input.stop > 215 ? -9 : 9), top - 8, word('off'), {'text-anchor' : input.stop > 215 ? 'end' : 'start'});
    lines.force = {line : el('path', {class : 'aid-live-now'}, live), x : X, top, base};
    // The grips: each bundle's threshold on the holder, the chosen bundle's strength on its band.
    bundles.forEach((b, i) => {
        const on = i === chosen;
        drag(svg, el('rect', {
               x : holder - 9,
               y : CY(b.gate) - 4,
               width : 18,
               height : 8,
               rx : 2,
               // The grip's class would paint over an attribute.
               style : 'fill:' + fibreHex(b.fast),
               class : on ? 'aid-live-key on' : 'aid-live-key'
             },
                      live),
             p => {
               chosen = i;
               draft(edit(b, {threshold : clamp(vOf(p.y))}));
             },
             'gate' + i, 'grip', settle);
    });
    if (chosenBand) {
      const st = Math.min(20, Math.max(1, input.stop - 2)), y = Y(chosenBand.b.over[st]);
      // Pulled by its own measure, not read off the scale, which follows.
      drag(svg, el('rect', {x : X(st) - 6, y : y - 6, width : 12, height : 12, rx : 2}, live), p => {
        pulled ??= {y : p.y, copies : cb.copies};
        draft(edit(cb, {copies : clamp(pulled.copies + Math.round((pulled.y - p.y) / TAIL.pull), 1, most)}));
      }, 'strength', 'grip', () => {
        pulled = null;
        settle();
      });
    }
    drag(svg, el('circle', {cx : X(input.stop), cy : CY(input.height), r : 5.5}, live), p => {
      input.stop = clamp(Math.round((p.x - L) / (R - L) * steps), 20, steps - 20);
      input.height = vOf(p.y);
      show(studio.state);
    }, 'command', 'knob');
  }
  // Speed: the same swim in open water and deep in sand. The water's curve always fills the
  // height, so only its shape changes; the sand's stands against it. In the egg nothing swims.
  function drawSpeed() {
    const {live} = picture(speed, 140), {L, R, VT, VB, steps} = TAIL, m = model, egg = input.maturity < TAIL.hatch;
    const X = st => L + (R - L) * st / steps, Y = v => VB - (VB - VT) * v / m.fastest;
    lines.speed = null;
    if (!m.water)
      return;
    txt(live, L + 4, VT - 12, word('water'), {class : 'aid-live-water-word', opacity : egg ? .3 : 1});
    if (m.sand)
      txt(live, R, VT - 12, word('sand'), {'text-anchor' : 'end', class : 'aid-live-sand-word', opacity : egg ? .3 : 1});
    el('path', {d : `M${L} ${VT - 6} V${VB} H${R}`, class : 'aid-live-axis', opacity : egg ? .4 : 1}, live);
    txt(live, L, VB + 15, word('steps'));
    for (const st of [ 100, 200, 300 ])
      txt(live, X(st), VB + 15, st, {'text-anchor' : st === steps ? 'end' : 'middle'});
    if (egg) {
      el('ellipse', {cx : (L + R) / 2, cy : (VT + VB) / 2, rx : 26, ry : 21, class : 'aid-live-egg'}, live);
      el('circle', {cx : (L + R) / 2, cy : (VT + VB) / 2, r : 6, class : 'aid-live-eye', opacity : .7}, live);
      return;
    }
    if (m.pulls) {
      el('path', {d : path(m.water.map((v, st) => [ X(st), Y(v) ])) + ` L${R} ${VB} L${L} ${VB} Z`, class : 'aid-live-water'}, live);
      if (m.sand)
        el('path', {d : path(m.sand.map((v, st) => [ X(st), Y(v) ])), class : 'aid-live-sand'}, live);
    }
    el('path', {d : `M${X(input.stop)} ${VT - 6} V${VB}`, class : 'aid-live-ending'}, live);
    lines.speed = {line : el('path', {class : 'aid-live-now'}, live), x : X, top : VT, base : VB};
  }
  // Life cycle: across, the fish's maturity from the egg to the grown fish; up, the push the
  // working bundles give the body at each maturity (at a full command, rested), stacked by bundle
  // in the order they join. A bundle's layer begins where it begins to work and ends where it
  // dies; its two grips sit on those edges, or beside the picture for a whole life. The round
  // knob on the curve chooses the maturity at which the pictures above show the fish.
  function buildLife(fixed) {
    const {L, R, top, icons} = LIFE, hatch = L + (R - L) * TAIL.hatch;
    txt(fixed, L + 4, top - 4, word('push'));
    el('ellipse', {cx : L + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, fixed);
    el('circle', {cx : L + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, fixed);
    fishIcon(fixed, hatch, icons, .5);
    fishIcon(fixed, R - 16, icons, .8);
    el('path', {d : `M${L + 22} ${icons} H${hatch - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${hatch + 18} ${icons} H${R - 40} m-6 -3.5 l6 3.5 l-6 3.5`, class : 'aid-live-arrow'}, fixed);
  }
  function drawLife() {
    const tail = state.capabilities?.tail, caps = state.capabilities;
    // Without the engine's values for the push there is no picture.
    if (!tail) {
      life.replaceChildren();
      return;
    }
    const {svg, live} = picture(life, LIFE.height, buildLife), {L, R, top, base, samples, edge} = LIFE;
    const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L));
    const order = bundles.map((b, i) => i).sort((p, q) => bundles[p].gate - bundles[q].gate);
    const share = (b, r) => works(b, r) ? b.strength * fibreForce(b.fast) * driveOf(b, TAIL.command) / massAt(r, tail) : 0;
    const pushAt = r => bundles.reduce((sum, b) => sum + share(b, r), 0);
    const layer = (i, r) => {
      let under = 0;
      for (const j of order) {
        if (j === i)
          break;
        under += share(bundles[j], r);
      }
      return [ under, under + share(bundles[i], r) ];
    };
    const most = Math.max(1e-9, ...Array.from({length : samples + 1}, (_, k) => pushAt(k / samples))),
          Y = v => base - (base - top - 12) * v / most;
    // Where any bundle joins or dies, and where the mass begins to count, every layer has a corner.
    const breaks = [ tail.thrustFloor, ...bundles.flatMap(b => [ b.from, Math.min(1, b.until) ]) ].flatMap(r => [ r - edge, r ]);
    for (const i of order) {
      const b = bundles[i], until = Math.min(1, b.until);
      // A bundle set elsewhere to die before it works has no layer; its grips stay.
      if (until <= b.from)
        continue;
      const at = [ ...Array.from({length : samples + 1}, (_, k) => b.from + (until - b.from) * k / samples), ...breaks ]
                     .filter(r => r >= b.from && r <= until)
                     .map(r => Math.min(r, until - edge))
                     .sort((p, q) => p - q);
      const upper = at.map(r => [ X(r), Y(layer(i, r)[1]) ]), lower = at.map(r => [ X(r), Y(layer(i, r)[0]) ]).reverse();
      el('path', {d : path(upper) + ' L' + path(lower).slice(1) + 'Z', fill : fibreHex(b.fast), opacity : .85, class : 'aid-live-chip'}, live)
          .addEventListener('pointerdown', () => {
            chosen = i;
            show(studio.state);
          });
    }
    // In the egg: the layers stand dimmed, up to the schematic mark of hatching.
    el('rect', {x : L, y : top, width : X(TAIL.hatch) - L, height : base - top, class : 'aid-live-dim'}, live);
    el('path', {d : `M${X(TAIL.hatch)} ${top} V${base + 5}`, class : 'aid-live-hatch'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    const r = input.maturity;
    el('path', {d : `M${X(r)} ${Y(pushAt(r))} V${base}`, class : 'aid-live-input'}, live);
    order.forEach((i, place) => {
      const b = bundles[i], on = i === chosen, until = Math.min(1, b.until), beside = base - 7 - LIFE.apart * place;
      const phase = change => setLifePhase(settled(), b.id, change, caps.sensitivitySpan, caps.steepnessSpan);
      const grip = (x, y, name, move) => drag(svg, el('rect', {x : x - 4, y : y - 5.5, width : 8, height : 11, rx : 2, style : 'fill:' + fibreHex(b.fast), class : on ? 'aid-live-key on' : 'aid-live-key'}, live), p => {
        chosen = i;
        draft(move(rOf(p.x)));
      }, name + i, 'grip', settle);
      const middle = at => {
        const [under, over] = layer(i, at);
        return Y((under + over) / 2);
      };
      grip(b.from > 0 ? X(b.from) : L - LIFE.beside, b.from > 0 && until > b.from ? middle(b.from + edge) : beside, 'from',
           to => phase({start : to < LIFE.whole ? null : Math.min(to, until - LIFE.least)}));
      grip(until < 1 ? X(until) : R + LIFE.beside, until < 1 && until > b.from ? middle(until - 2 * edge) : beside, 'until',
           to => phase({end : to > 1 - LIFE.whole ? null : Math.max(to, b.from + LIFE.least)}));
    });
    drag(svg, el('circle', {cx : X(r), cy : Y(pushAt(r)), r : 5.5}, live), p => {
      input.maturity = rOf(p.x);
      show(studio.state);
    }, 'maturity', 'knob');
  }
  function show(next) {
    state = next;
    const muscle = organ();
    if (!muscle)
      return;
    bundles = bundlesOf(state, muscle);
    if (!bundles.length)
      return;
    chosen = clamp(chosen, 0, bundles.length - 1);
    wriggle = muscleTrait(state.document, MOTOR_KIND.forward, 'undulation', state.sites) ?? 0;
    model = derive(bundles, input, wriggle, state.capabilities?.tail);
    kind.textContent = word(wriggle > .5 ? 'wriggler' : 'beater');
    drawFish();
    drawForce();
    drawSpeed();
    drawLife();
    tick(0);
  }
  // The fish swims while the command lasts: it beats as hard as its force and as quick as the
  // fibres that pull, wriggling as set; then the beat dies away and it glides.
  const ROUND_MS = 12000;
  function tick(dt) {
    if (!model || !film.body)
      return;
    step = (step + dt * TAIL.steps / ROUND_MS) % TAIL.steps;
    const {fishY, base, top} = TAIL, on = step < input.stop, at = Math.floor(step),
          push = model.total[at] ?? 0, share = input.height / TAIL.command;
    film.level?.setAttribute('y', (on ? base - (base - top) * share : base).toFixed(1));
    film.level?.setAttribute('height', (on ? (base - top) * share : 0).toFixed(1));
    for (const now of Object.values(lines))
      now?.line.setAttribute('d', `M${now.x(step).toFixed(1)} ${now.top} V${now.base}`);
    const wanted = push > 0 ? 3 + 24 * clamp(push / model.scale) : 0;
    film.amp += (wanted - film.amp) * Math.min(1, dt / 250);
    film.phase += dt / (320 * Math.pow(12, 1 - model.quick)) * 2 * Math.PI * (wanted > 0 ? 1 : .15);
    const amp = film.amp, w = wriggle;
    const bend = x => {
      const u = (x - TAIL.nose) / TAIL.body;
      return Math.sin(film.phase - u * (1.5 + 4 * w)) * amp * swingAt(u, w);
    };
    const half = x => {
      const u = (x - TAIL.nose) / TAIL.body;
      return u < .3 ? 6 + 14 * Math.sin(Math.PI / 2 * u / .3) : 4 + 16 * (1 - (u - .3) / .7);
    };
    const upper = [], lower = [];
    for (let x = 20; x <= 240; x += 5) {
      upper.push([ x, fishY - half(x) + bend(x) ]);
      lower.push([ x, fishY + half(x) + bend(x) ]);
    }
    const tip = fishY + bend(240);
    film.body.setAttribute('d', `${path(upper)} L268 ${(tip - 20).toFixed(1)} L258 ${tip.toFixed(1)} L268 ${(tip + 20).toFixed(1)} L${path(lower.reverse()).slice(1)} Z`);
    film.eye.setAttribute('cy', (fishY - 4 + bend(36)).toFixed(1));
    const spine = [ [ wriggleFrom(w), fishY ] ];
    for (let x = Math.ceil(wriggleFrom(w) / 5) * 5 + 5; x <= 240; x += 5)
      spine.push([ x, fishY + bend(x) ]);
    film.spine.setAttribute('d', path(spine));
    for (const p of film.paths) {
      const pts = [];
      for (let x = p.from; x <= p.to; x += 3)
        pts.push([ x, fishY + p.side * (half(x) - 3.5) + bend(x) ]);
      p.e.setAttribute('d', path(pts));
    }
  }
  return {root, show, tick};
});
