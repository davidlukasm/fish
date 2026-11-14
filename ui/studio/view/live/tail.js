// The tail muscle's live inspector: the fish from above with its bundles, and the force they give
// over a swim at the command tried.
// A bundle is one type of the muscle's cells (organTypes): its cells share strength (copies),
// fibres (time constant) and threshold. A muscle whose cells have no type is one bundle.
// Force: each bundle pulls with tanh(command - threshold) (the effector output, substrate.cc; the
// threshold is the cell's own times the bias scale, command_line.js) times its cells' strength and
// their fibres' force, as far as its fast fibres are rested (muscle_fibre.hh, ui/fibre.js).
import {MOTOR_KIND, MUSCLE_FIBRE as F, ATELIER_LIMITS} from '../../../schema.js';
import {fastShare, fibreForce, fibreHex, fibreTau} from '../../../fibre.js';
import {t} from '../../../strings.js';
import {
  addOrganType,
  findOrgan,
  isSprintNode,
  muscleTrait,
  organTypes,
  removeOrganType,
  setMuscleSprint,
  setMuscleTrait,
  SPRINT_THRESHOLD,
  updateCenter
} from '../../model/document.js';
import {COMMAND_SPAN} from '../command_line.js';
import {chip, clamp, COLOUR, drag, el, liveKind, path, picture, txt} from './kit.js';

const word = key => t('studio.live.tail.' + key);
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
  // How far a square on a band is pulled for one more unit of strength.
  pull : 5
});
// How far the body swings at a place along it (0 nose, 1 the tail's tip), as a share of the tip's
// swing: the stiffer the fish, the nearer to the tail it begins. A drawing's measure, not the
// engine's: there undulation is one number of the body (body_plan.cc).
const swingAt = (along, wriggle) => Math.pow(along, 2 - 1.4 * wriggle);
const wriggleFrom = wriggle => TAIL.nose + TAIL.body * Math.pow(TAIL.swing, 1 / (2 - 1.4 * wriggle));
const wriggleAt = x =>
    clamp((2 - Math.log(TAIL.swing) / Math.log(clamp((x - TAIL.nose) / TAIL.body, .05, .5))) / 1.4);
const between = (slow, fast, share) => slow * (fast / slow) ** clamp(share);

// The muscle's bundles as the document has them.
function bundlesOf(state, organ) {
  const scale = state.capabilities?.biasScale ?? 0, kind = organ.centers[0]?.key;
  return organTypes(organ).filter(type => type.centers[0].key === kind).map(type => {
    const cell = type.centers[0];
    // A sprint node's threshold is replaced when the plan is compiled (document.js, compile).
    const sprint = isSprintNode(organ, organ.centers.indexOf(cell));
    return {
      type : type.id,
      id : cell.id,
      strength : type.centers.reduce((sum, c) => sum + c.copies, 0),
      copies : cell.copies,
      nodes : type.centers.length,
      fast : fastShare(cell.tau),
      gate : Math.max(0, sprint ? SPRINT_THRESHOLD : cell.threshold) * scale
    };
  });
}
const driveOf = (bundle, command) => Math.tanh(Math.max(0, command - bundle.gate));
// A bundle's force and its fast fibres' reserve, step by step: pulling until the command stops,
// then resting (the engine's drain and refill, muscle_fibre.hh).
function bundleSwim(bundle, drive, stop) {
  const force = [], reserve = [];
  let r = 1;
  for (let st = 0; st <= TAIL.steps; st++) {
    const d = st < stop ? drive : 0, left = 1 - bundle.fast + bundle.fast * r;
    force.push(bundle.strength * fibreForce(bundle.fast) * d * left);
    reserve.push(r);
    r = clamp(r + (1 - r) / between(F.recovery_slow, F.recovery_fast, bundle.fast) -
              F.drain * bundle.fast * bundle.fast * left * d);
  }
  return {force, reserve};
}
function derive(bundles, input) {
  const blank = () => Array(TAIL.steps + 1).fill(0), spent = blank(), bands = [];
  let under = blank(), fastAll = 0;
  // The bundles in the order they join: the lowest threshold first, at the bottom.
  for (const i of bundles.map((b, i) => i).sort((p, q) => bundles[p].gate - bundles[q].gate)) {
    const b = bundles[i], drive = driveOf(b, input.height),
          {force, reserve} = bundleSwim(b, drive, input.stop),
          over = under.map((u, st) => u + force[st]);
    const weight = b.strength * fibreForce(b.fast) * b.fast * drive;
    fastAll += weight;
    reserve.forEach((r, st) => { spent[st] += weight * (1 - r); });
    bands.push({i, under, over, pulls : drive > 0});
    under = over;
  }
  const pull = bundles.reduce((sum, b) => sum + b.strength * driveOf(b, input.height), 0);
  return {
    bands,
    total : under,
    tired : fastAll > 0 ? spent.map(v => v / fastAll) : null,
    pulls : Math.max(...under) > 1e-6,
    quick : pull > 0 ? bundles.reduce((sum, b) => sum + b.strength * driveOf(b, input.height) * b.fast, 0) / pull
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
  };
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const fish = svgOf();
  heading(word('force'));
  const force = svgOf();
  // What is tried on the muscle, and which bundle is chosen: not part of the fish.
  const input = {height : COMMAND_SPAN, stop : 200};
  const film = {body : null, eye : null, spine : null, marks : null, paths : [], amp : 0, phase : 0, level : null};
  let chosen = 0, state = studio.state, bundles = [], model = null, wriggle = 0, step = 0, pulled = null;
  const organ = () => findOrgan(studio.state.document, organId);
  // A dragged grip writes a draft; let go, the drag becomes one undo step.
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const edit = (bundle, patch) => updateCenter(studio.state.document, bundle.id, patch);

  function buildFish(fixed) {
    const {M0, M1, FY} = TAIL, x1 = M1 + 26,
          grad = el('linearGradient', {id : 'aid-live-fibres'}, el('defs', {}, fixed));
    film.body = el('path', {fill : COLOUR.body, stroke : COLOUR.axis, 'stroke-width' : 1.4}, fixed);
    film.eye = el('circle', {cx : 36, r : 3, fill : COLOUR.icon}, fixed);
    film.spine = el('path', {stroke : COLOUR.handle, 'stroke-width' : 1.6, fill : 'none', 'stroke-linecap' : 'round'}, fixed);
    film.marks = el('g', {fill : 'none', 'stroke-linecap' : 'round', 'stroke-width' : 5}, fixed);
    el('stop', {offset : 0, 'stop-color' : fibreHex(0)}, grad);
    el('stop', {offset : 1, 'stop-color' : fibreHex(1)}, grad);
    el('rect', {x : M0 + 4, y : FY - 4, width : x1 - M0 - 4, height : 8, rx : 4, fill : 'url(#aid-live-fibres)', opacity : .85}, fixed);
    txt(fixed, M0 + 4, FY + 21, word('enduring'));
    txt(fixed, x1, FY + 21, word('strong'), {'text-anchor' : 'end'});
  }
  function drawFish() {
    const {svg, live} = picture(fish, TAIL.height, buildFish),
          {M0, M1, MB, FY, cell, fishY} = TAIL, most = ATELIER_LIMITS.max_copies;
    const width = (M1 - M0) / bundles.length, hOf = b => 4 + cell * b.copies, cb = bundles[chosen],
          x0 = M0 + chosen * width, h = hOf(cb), fx0 = M0 + 4, fx1 = M1 + 26;
    film.marks.replaceChildren();
    const along = (TAIL.to - TAIL.from) / bundles.length;
    film.paths = bundles.flatMap((b, i) => [ -1, 1 ].map(side => ({
                                                          side,
                                                          from : TAIL.from + i * along + 2,
                                                          to : TAIL.from + (i + 1) * along - 2,
                                                          e : el('path', {stroke : fibreHex(b.fast)}, film.marks)
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
                                class : 'aid-live-chip'
                              },
                                 live)
                                  .addEventListener('pointerdown', () => {
                                    chosen = i;
                                    show(studio.state);
                                  }));
    el('rect', {x : x0 - 1, y : MB - h - 2, width : width + 2, height : h + 4, rx : 4, fill : 'none', stroke : COLOUR.chosen, 'stroke-width' : 2, 'pointer-events' : 'none'}, live);
    drag(svg, el('rect', {x : x0 + width / 2 - 6, y : MB - h - 8, width : 12, height : 12, rx : 2}, live),
         p => draft(edit(cb, {copies : clamp(Math.round((MB - p.y - 4) / cell), 1, most)})), 'bundle', 'grip', settle);
    chip(live, x0 + width - 4, MB - h - 3, '×', () => {
      const doc = removeOrganType(studio.state.document, organId, cb.type);
      chosen = Math.min(chosen, bundles.length - 2);
      change(doc);
    }, bundles.length > 1, 6.5);
    chip(live, M1 + 22, MB - 10, '+', () => {
      const added = addOrganType(studio.state.document, organId, studio.state.sites);
      if (added) {
        chosen = bundles.length;
        change(added.document);
      }
    }, bundles.length < TAIL.bundles, 8);
    // The chosen bundle's fibres.
    drag(svg, el('circle', {cx : fx0 + (fx1 - fx0) * cb.fast, cy : FY, r : 7}, live),
         p => draft(edit(cb, {tau : fibreTau(clamp((p.x - fx0) / (fx1 - fx0)))})), 'fibre', 'grip', settle);
  }
  function drawForce() {
    const {svg, live} = picture(force, 168), {L, R, top, base, holder, steps} = TAIL, m = model,
          most = ATELIER_LIMITS.max_copies, scale = state.capabilities?.biasScale ?? 0, cb = bundles[chosen];
    const X = st => L + (R - L) * st / steps, Y = v => base - (base - top) * v / m.scale,
          CY = v => base - (base - top) * clamp(v / COMMAND_SPAN), vOf = y => COMMAND_SPAN * clamp((base - y) / (base - top));
    // The holder of the command, filling with it while it lasts.
    txt(live, holder, top - 10, word('command'), {'text-anchor' : 'middle'});
    el('rect', {x : holder - 5, y : top, width : 10, height : base - top, rx : 5, fill : COLOUR.track, stroke : COLOUR.trackEdge}, live);
    film.level = el('rect', {x : holder - 4, width : 8, rx : 4, fill : COLOUR.line, opacity : .55}, live);
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
      el('path', {d : chosenBand.d, fill : 'none', stroke : '#ffffff', 'stroke-width' : 1.3, 'pointer-events' : 'none'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, stroke : COLOUR.axis, fill : 'none'}, live);
    txt(live, L, base + 15, word('steps'));
    for (const st of [ 100, 200, 300 ])
      txt(live, X(st), base + 15, st, {'text-anchor' : st === steps ? 'end' : 'middle'});
    if (m.pulls && m.tired) {
      const peak = m.tired.indexOf(Math.max(...m.tired)), at = Math.max(40, Math.min(peak, input.stop - 70));
      const TY = v => base - (base - top) * clamp(v);
      if (m.tired[peak] > .02)
        el('path', {d : path(m.tired.map((v, st) => [ X(st), TY(v) ])), fill : 'none', stroke : COLOUR.tired, 'stroke-width' : 2}, live);
      if (m.tired[peak] > .2)
        txt(live, X(at), Math.max(top + 8, TY(m.tired[at]) - 7), word('tired'), {'text-anchor' : 'middle', style : 'fill:' + COLOUR.tired});
    }
    // The command: its end, its strength, its knob.
    el('path', {d : `M${X(input.stop)} ${top - 6} V${base}`, stroke : COLOUR.ending, 'stroke-dasharray' : '6 4', 'stroke-width' : 2}, live);
    el('path', {d : `M${holder + 12} ${CY(input.height)} H${X(input.stop)}`, stroke : COLOUR.line, 'stroke-dasharray' : '2 4', 'stroke-width' : 1.2}, live);
    txt(live, X(input.stop) + (input.stop > 215 ? -9 : 9), top - 8, word('off'), {'text-anchor' : input.stop > 215 ? 'end' : 'start'});
    // The grips: each bundle's threshold on the holder, the chosen bundle's strength on its band.
    if (scale > 0)
      bundles.forEach((b, i) => {
        const on = i === chosen;
        drag(svg, el('rect', {
               x : holder - 9,
               y : CY(b.gate) - 4,
               width : 18,
               height : 8,
               rx : 2,
               style : `fill:${fibreHex(b.fast)};stroke:${on ? COLOUR.chosen : COLOUR.unchosen};stroke-width:${on ? 2.5 : 1}`
             },
                      live),
             p => {
               chosen = i;
               // One threshold for each bundle: what the sprint nodes had becomes their own.
               const doc = studio.state.document, muscle = findOrgan(doc, organId);
               let next = doc;
               if (muscle.sprint > 0) {
                 for (const c of muscle.centers)
                   if (isSprintNode(muscle, muscle.centers.indexOf(c)))
                     next = updateCenter(next, c.id, {threshold : SPRINT_THRESHOLD}) ?? next;
                 next = setMuscleSprint(next, organId, 0) ?? next;
               }
               draft(updateCenter(next, b.id, {threshold : clamp(vOf(p.y) / scale)}));
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
    drag(svg, el('circle', {cx : X(input.stop), cy : CY(input.height), r : 5.5, fill : COLOUR.line}, live), p => {
      input.stop = clamp(Math.round((p.x - L) / (R - L) * steps), 20, steps - 20);
      input.height = vOf(p.y);
      show(studio.state);
    }, 'command', 'knob');
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
    model = derive(bundles, input);
    drawFish();
    drawForce();
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
          push = model.total[at] ?? 0, share = input.height / COMMAND_SPAN;
    film.level?.setAttribute('y', (on ? base - (base - top) * share : base).toFixed(1));
    film.level?.setAttribute('height', (on ? (base - top) * share : 0).toFixed(1));
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
