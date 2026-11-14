// The gut's live inspector. Gut and gut muscle are one organ to the eye: whichever of the two is
// chosen, this inspector shows both.
// The fish: stomach, the gut's loops (the longer the gut, the more of them), its wall as thick as
// its muscle is strong; what moves in it and what leaves at the vent.
// Yield: what the gut takes up of each food at every stay (ui/fish_organs.js, gutUse: the
// engine's digestion), with the stays this gut reaches between rest and its muscle's full drive.
// The foods are what the engine says they are made of (capabilities.diet.foods); the gut's stay
// at rest is the world's gut time times the gut's size at its length (physiology.hh, gut_stay).
import {ATELIER_LIMITS, BODY_UNIT, DIGESTION} from '../../../schema.js';
import {gutAche, gutUse} from '../../../fish_organs.js';
import {fastShare, fibreForce} from '../../../fibre.js';
import {percent, t} from '../../../strings.js';
import {gutLength, setGutLength, setNodeCopies} from '../../model/document.js';
import {clamp, drag, el, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.gut.' + key, values);
// The foods, in the pictures' order, by their names in the engine's report.
const FOODS = Object.freeze([ 'plant', 'algae', 'flock', 'plankton', 'meat' ]);
// The stays the pictures show, and how finely.
const STAY = Object.freeze({short : 50, long : 800, samples : 140});
// Three or more foods within this share of the best: the gut is built for everything.
const DIET_SHARE = .95;
const ROUND_MS = 12000, STEPS = 900;

const NOSE = [ 14, 64 ], BACK = [ 110, 10 ], RUMP = [ 236, 48 ], MIDLINE = 64;
const BODY = `M${NOSE} Q30 14 ${BACK} Q200 10 ${RUMP} L284 18 Q276 64 284 110 L236 80 Q200 118 110 118 Q30 114 ${NOSE} Z`;
function onCurve([ x0, y0 ], [ x1, y1 ], [ x2, y2 ], x) {
  let lo = 0, hi = 1, s = .5;
  for (let n = 0; n < 20; n++) {
    s = (lo + hi) / 2;
    if ((1 - s) * (1 - s) * x0 + 2 * s * (1 - s) * x1 + s * s * x2 < x)
      lo = s;
    else
      hi = s;
  }
  return (1 - s) * (1 - s) * y0 + 2 * s * (1 - s) * y1 + s * s * y2;
}
// The body's upper outline at x; the lower one mirrors it.
const bodyTop = x => x < BACK[0] ? onCurve(NOSE, [ 30, 14 ], BACK, x) : onCurve(BACK, [ 200, 10 ], RUMP, x);
const FISH = Object.freeze({down : 26, right : 12, height : 178});
const STOMACH = Object.freeze({x : 78, y : 60, rx : 31, ry : 30});
const GUT = Object.freeze({left : 130, right : [ 150, 212 ], margin : 20, bulge : 7, folds : [ 2, 5 ]});
const WALL = [ 1, 5 ], TUBE = 6, SEGMENTS = 120, WAVES = 6, MORSELS = 8, CRUMBS = 6, CRUMB_MS = 1600;
function stomachPath({x, y, rx : w, ry : h}) {
  return `M${x - .55 * w} ${y - h} C${x - 1.05 * w} ${y - .6 * h} ${x - 1.1 * w} ${y + .55 * h} ${x - .35 * w} ${y + h}` +
         ` C${x + .35 * w} ${y + 1.12 * h} ${x + 1.05 * w} ${y + .55 * h} ${x + w} ${y - .05 * h}` +
         ` C${x + .95 * w} ${y - .55 * h} ${x + .45 * w} ${y - .55 * h} ${x + .2 * w} ${y - .75 * h}` +
         ` C${x + .05 * w} ${y - .9 * h} ${x - .2 * w} ${y - 1.05 * h} ${x - .55 * w} ${y - h} Z`;
}
// The gut's way from the stomach to the vent, for a length from 0 (shortest) to 1.
function gutWay(share) {
  const folds = Math.round(GUT.folds[0] + (GUT.folds[1] - GUT.folds[0]) * share);
  const right = GUT.right[0] + (GUT.right[1] - GUT.right[0]) * share, step = (right - GUT.left) / (folds - 1);
  const high = x => bodyTop(x) + GUT.margin, low = x => 2 * MIDLINE - bodyTop(x) - GUT.margin;
  const legs = Array.from({length : folds}, (_, f) => {
    const x = GUT.left + step * f, down = (folds - 1 - f) % 2 === 0;
    return {x, from : down ? high(x) : low(x), to : down ? low(x) : high(x), down};
  });
  const pts = [], line = ([ ax, ay ], [ bx, by ], n) => {
    for (let k = 1; k <= n; k++)
      pts.push([ ax + (bx - ax) * k / n, ay + (by - ay) * k / n ]);
  };
  pts.push([ STOMACH.x + STOMACH.rx - 3, STOMACH.y - 6 ]);
  line(pts[0], [ legs[0].x, legs[0].from ], 8);
  legs.forEach((leg, f) => {
    line([ leg.x, leg.from ], [ leg.x, leg.to ], 12);
    const next = legs[f + 1];
    if (next)
      for (let k = 1; k <= 8; k++) {
        const turn = Math.PI * k / 8, across = (1 - Math.cos(turn)) / 2;
        pts.push([
          leg.x + step * across,
          leg.to + (next.from - leg.to) * across + (leg.down ? 1 : -1) * GUT.bulge * Math.sin(turn)
        ]);
      }
  });
  // The vent: where the gut opens at the belly.
  const last = legs.at(-1), vent = [ last.x + 5, 2 * MIDLINE - bodyTop(last.x + 5) ];
  line([ last.x, last.to ], vent, 5);
  const lengths = [ 0 ];
  for (let i = 1; i < pts.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = u => {
    const d = clamp(u) * lengths.at(-1);
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < d)
      i++;
    const s = (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    return [ pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * s, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * s ];
  };
  return {at, end : vent};
}

const Y = Object.freeze({L : 30, R : 282, top : 22, base : 124, row : 150, height : 164});
const BARS = Object.freeze({x0 : 70, x1 : 236, row : 21, top : 20});
const xOfStay = stay => Y.L + (Y.R - Y.L) * Math.log(clamp(stay, STAY.short, STAY.long) / STAY.short) / Math.log(STAY.long / STAY.short);
const stayOfX = x => STAY.short * Math.pow(STAY.long / STAY.short, clamp((x - Y.L) / (Y.R - Y.L)));
const AXIS = Array.from({length : STAY.samples + 1}, (_, k) => STAY.short * Math.pow(STAY.long / STAY.short, k / STAY.samples));

// What the engine says about digestion, read once per report: every food's yield and ache along
// the pictures' stays.
function curvesOf(diet) {
  return FOODS.filter(name => diet.foods[name]).map(name => {
    const food = diet.foods[name], gains = AXIS.map(stay => gutUse(food, stay)), aches = AXIS.map(stay => gutAche(food, stay));
    return {name, food, gains, aches, best : Math.max(...gains)};
  });
}
// A row of the engine's samples over a share from 0 to 1, read between two of them.
function sampled(row, share) {
  const at = clamp(share) * (row.length - 1), k = Math.floor(at);
  return row[k] + (row[Math.min(row.length - 1, k + 1)] - row[k]) * (at - k);
}
// The share at which a rising row reaches a value.
function shareFor(row, value) {
  let lo = 0, hi = 1;
  for (let n = 0; n < 24; n++) {
    const mid = (lo + hi) / 2;
    if (sampled(row, mid) < value)
      lo = mid;
    else
      hi = mid;
  }
  return hi;
}
// A gut muscle cell's capacity (see derive).
const cellStrength = (cell, gut) => cell.copies / ATELIER_LIMITS.max_copies * (gut.muscleCellForce ?? 0) * fibreForce(fastShare(cell.tau));
// What a food gives and how it hurts over the stays from `reach[0]` to `reach[1]`.
function rangeIn(curve, reach) {
  const inside = AXIS.map((stay, k) => k).filter(k => AXIS[k] >= reach[0] && AXIS[k] <= reach[1]);
  const ks = inside.length ? inside : [ AXIS.findIndex(stay => stay >= reach[1]) ].map(k => k < 0 ? AXIS.length - 1 : k);
  const gains = ks.map(k => curve.gains[k]), sore = ks.filter(k => curve.aches[k] > 0).map(k => curve.gains[k]);
  return {min : Math.min(...gains), max : Math.max(...gains), sore : sore.length ? [ Math.min(...sore), Math.max(...sore) ] : null};
}

liveKind('gut', (studio) => {
  const root = document.createElement('div');
  root.className = 'aid-live-gut';
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
  const kind = heading(''), fish = svgOf();
  heading(word('yield'));
  const yields = svgOf(), bars = svgOf();
  const film = {wall : null, tube : null, segs : [], bits : [], crumbs : [], way : null, share : null};
  let state = studio.state, curves = null, curvesFor = null, model = null, step = 0, wave = 0;
  const draft = doc => doc && studio.draftDesign(doc, 'live:gut', 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const muscleOf = doc => doc.organs.find(o => o.type === 'gutmuscle') ?? null;

  // Everything the pictures show, from the document and the engine's report.
  function derive() {
    const caps = state.capabilities, diet = caps?.diet, doc = state.document;
    if (!diet?.foods || !diet.gut?.size || !(caps.gutTime > 0))
      return null;
    if (curvesFor !== diet) {
      curves = curvesOf(diet);
      curvesFor = diet;
    }
    const length = gutLength(doc) ?? BODY_UNIT.trait_middle, rest = caps.gutTime * sampled(diet.gut.size, length);
    // The muscle: its planned strength, and the pace that gives the gut at full drive. While its
    // grip is dragged the pace comes from the engine's row over the strength; else from the last
    // design run.
    const muscle = muscleOf(doc), cells = muscle ? muscle.centers : [];
    // Its capacity as the engine adds it up: copies / 16 x the muscle cell's force x its fibres'
    // force, over all its cells (body_plan.cc, add_effectors).
    const strength = cells.reduce((sum, c) => sum + cellStrength(c, diet.gut), 0), row = diet.gut.speed, most = diet.gut.speedMaxStrength;
    const pace = row && most > 0 ? sampled(row, strength / most) : state.anatomy?.gutSpeed ?? 1;
    const fastest = rest / pace, reach = [ fastest, rest ];
    const best = stay => {
      const got = curves.map(c => ({c, gain : gutUse(c.food, stay)})).sort((a, b) => b.gain - a.gain);
      return got.filter(g => g.gain >= DIET_SHARE * got[0].gain).length >= 3 ? 'all' : got[0].c.name;
    };
    return {length, rest, pace, fastest, reach, muscle, strength, ranges : curves.map(c => rangeIn(c, reach)), diet : best(fastest)};
  }

  function buildFish(fixed) {
    const st = STOMACH, {down, right} = FISH;
    el('path', {d : BODY, transform : `translate(${right} ${down})`, class : 'aid-live-body'}, fixed);
    const g = el('g', {transform : `translate(${right} ${down})`}, fixed);
    // The gullet, from the mouth to the stomach.
    el('path', {d : `M${NOSE[0] + 2} ${NOSE[1]} H${st.x - .9 * st.rx}`, class : 'aid-live-gullet'}, g);
    film.wall = el('g', {class : 'aid-live-gutwall'}, g);
    film.tube = el('g', {class : 'aid-live-guttube'}, g);
    film.bits = Array.from({length : MORSELS}, (_, k) => ({u : k / MORSELS, e : el('circle', {r : 2.4, class : 'aid-live-morsel'}, g)}));
    film.crumbs = Array.from({length : CRUMBS}, () => ({t : 1, from : [ 0, 0 ], e : el('circle', {r : 2.4, class : 'aid-live-crumb', opacity : 0}, g)}));
    el('path', {d : stomachPath(st), class : 'aid-live-stomach'}, g);
  }
  function layGut() {
    if (film.share === model.length)
      return;
    film.share = model.length;
    const way = film.way = gutWay(model.length), piece = (k, parent) => {
      const [x0, y0] = way.at(k / SEGMENTS), [x1, y1] = way.at((k + 1) / SEGMENTS);
      return el('path', {d : `M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`, 'stroke-linecap' : 'round'}, parent);
    };
    film.wall.replaceChildren();
    film.tube.replaceChildren();
    film.segs = Array.from({length : SEGMENTS}, (_, k) => ({wall : piece(k, film.wall), tube : piece(k, film.tube), wallWidth : '', tubeWidth : ''}));
  }
  // The muscle's one grip, under the fish and in the yield: dragged to a stay, it sets the
  // strength whose pace makes the gut that fast at full drive.
  function muscleTo(p) {
    const m = model, gut = state.capabilities.diet.gut, row = gut.speed, most = gut.speedMaxStrength;
    if (!m.muscle || !row || !(most > 0))
      return;
    // The strength wanted, shared alike among the muscle's cells as they are.
    const wanted = shareFor(row, m.rest / Math.min(stayOfX(p.x), m.rest)) * most,
          each = m.muscle.centers.reduce((sum, c) => sum + cellStrength({...c, copies : 1}, gut), 0);
    draft(setNodeCopies(studio.state.document, m.muscle.id, clamp(Math.round(wanted / each), 1, ATELIER_LIMITS.max_copies)));
  }
  function drawFish() {
    const {svg, live} = picture(fish, FISH.height, buildFish), {down, right} = FISH, m = model;
    layGut();
    // What the gut costs at rest: its share of this plan's whole resting need, from the engine.
    const rest = state.anatomy?.budget?.rest;
    if (rest && rest.gut >= 0) {
      const whole = rest.basal + rest.gut + rest.muscles + rest.cells;
      if (whole > 0)
        txt(live, 8, 10, word('rest', {p : percent(rest.gut / whole, 1)}), {class : 'aid-live-small'});
    }
    // The gut's end: dragged sideways for a longer or shorter gut.
    const [ex, ey] = film.way.end;
    drag(svg, el('rect', {x : ex + right - 5, y : ey + down - 4, width : 10, height : 12, rx : 3}, live),
         p => draft(setGutLength(studio.state.document, clamp((p.x - right - GUT.right[0]) / (GUT.right[1] - GUT.right[0])))),
         'gutend', 'grip', settle);
    // The muscle, under the fish on the yield's own scale of stays: the wedge lies from the gut
    // at rest (no muscle) to the fastest any muscle makes it; the grip stands exactly above the
    // muscle's grip in the yield and moves with it.
    const wy = FISH.height - 9, wx1 = xOfStay(m.rest), wide = xOfStay(m.rest / DIGESTION.fastest), wx0 = xOfStay(m.fastest);
    el('path', {d : `M${wx1} ${wy} L${wide} ${wy - 5.5} v11 Z`, class : 'aid-live-muscle'}, live);
    txt(live, wide - 9, wy + 4, word('muscle'), {'text-anchor' : 'end'});
    if (m.muscle && state.capabilities.diet.gut.speed)
      drag(svg, el('rect', {x : wx0 - 5, y : wy - 7, width : 10, height : 14, rx : 3}, live), muscleTo, 'wall', 'grip', settle);
  }
  function buildYield(fixed) {
    const {L, R, top, base} = Y, yOf = v => base - (base - top) * v;
    el('path', {d : `M${L} ${top - 6} V${base} H${R}`, class : 'aid-live-axis'}, fixed);
    txt(fixed, L + 4, top - 8, word('gain'));
    txt(fixed, L, base + 14, word('short'));
    txt(fixed, (L + R) / 2, base + 14, word('stay'), {'text-anchor' : 'middle'});
    txt(fixed, R, base + 14, word('long'), {'text-anchor' : 'end'});
    const drawn = curves.map(c => {
      const pts = AXIS.map((stay, k) => [ xOfStay(stay), yOf(c.gains[k]), c.aches[k] > 0 ]);
      // Where a full gut of it hurts, the curve wears the red dashes of the bars' frames.
      let run = [ pts[0] ];
      const flush = () => {
        if (run.length < 2)
          return;
        if (run[0][2])
          el('path', {d : path(run), class : 'aid-live-sore wide'}, fixed);
        el('path', {d : path(run), class : 'aid-live-food-line', 'data-food' : c.name}, fixed);
      };
      for (let i = 1; i < pts.length; i++) {
        run.push(pts[i]);
        if (pts[i][2] !== run[0][2]) {
          flush();
          run = [ pts[i] ];
        }
      }
      flush();
      return {name : c.name, words : word('food.' + c.name), pts};
    });
    // Names: each on its own curve, where neither another name nor another curve sits.
    const taken = [];
    const free = (box, i) => !taken.some(b => box.x0 < b.x1 + 2 && box.x1 > b.x0 - 2 && box.y0 < b.y1 + 1 && box.y1 > b.y0 - 1) &&
                             drawn.every((c, j) => j === i || c.pts.every(([ x, y ]) => x < box.x0 - 1 || x > box.x1 + 1 || y < box.y0 - 2 || y > box.y1 + 2)) &&
                             box.x0 > L + 2 && box.x1 < R && box.y0 > top - 14 && box.y1 < base - 14;
    drawn.map((c, i) => [ c, i ]).sort((a, b) => Math.min(...a[0].pts.map(p => p[1])) - Math.min(...b[0].pts.map(p => p[1]))).forEach(([ c, i ]) => {
      const w = c.words.length * 6.1, order = c.pts.map(p => p).sort((a, b) => a[1] - b[1]);
      for (const [x, y] of order)
        for (const lift of [ -6, 14 ]) {
          const box = {x0 : x - w / 2, x1 : x + w / 2, y0 : y + lift - 10, y1 : y + lift + 1};
          if (free(box, i)) {
            taken.push(box);
            txt(fixed, x, y + lift, c.words, {'text-anchor' : 'middle', class : 'aid-live-food-word', 'data-food' : c.name});
            return;
          }
        }
    });
  }
  function drawYield() {
    const {svg, under, live} = picture(yields, Y.height, buildYield), {top, row} = Y, m = model, x1 = xOfStay(m.rest), x0 = xOfStay(m.fastest);
    el('rect', {x : x0, y : top, width : x1 - x0, height : row + 6 - top, class : 'aid-live-reach'}, under);
    el('path', {d : `M${x1} ${top - 6} V${row}`, class : 'aid-live-rest'}, live);
    el('path', {d : `M${x0} ${row} H${x1}`, class : 'aid-live-musclebar'}, live);
    if (m.muscle && state.capabilities.diet.gut.speed)
      drag(svg, el('rect', {x : x0 - 5, y : row - 7, width : 10, height : 14, rx : 3}, live), muscleTo, 'fastest', 'grip', settle);
    // The round grip on the dashed line: the gut's length, as the stay it has at rest.
    const size = state.capabilities.diet.gut.size, time = state.capabilities.gutTime;
    drag(svg, el('circle', {cx : x1, cy : top - 6, r : 7}, live),
         p => draft(setGutLength(studio.state.document, shareFor(size, stayOfX(p.x) / time))), 'rest', 'grip', settle);
  }
  // What each food gives this gut: every bar's full length is the best that food can give in any
  // gut, all on one scale; the filled range is every stay this gut reaches; a red frame where a
  // full gut of it hurts.
  const legendY = BARS.top + FOODS.length * BARS.row + 8;
  function buildBars(fixed) {
    el('rect', {x : BARS.x0, y : legendY - 8, width : 16, height : 11, rx : 3, class : 'aid-live-sore'}, fixed);
    txt(fixed, BARS.x0 + 22, legendY + 1, word('ache'));
  }
  function drawBars() {
    const {live} = picture(bars, legendY + 8, buildBars), {x0, x1, row, top} = BARS, best = Math.max(...curves.map(c => c.best));
    curves.forEach((c, i) => {
      const y = top + i * row, r = model.ranges[i], x = v => x0 + (x1 - x0) * v / best;
      txt(live, 6, y + 10, word('food.' + c.name), {class : 'aid-live-food-word', 'data-food' : c.name});
      el('rect', {x : x0, y, width : x(c.best) - x0, height : 12, rx : 3, class : 'aid-live-track'}, live);
      el('rect', {x : x0, y, width : x(r.min) - x0, height : 12, rx : 3, class : 'aid-live-food-fill', 'data-food' : c.name, opacity : .85}, live);
      el('rect', {x : x(r.min), y, width : Math.max(2, x(r.max) - x(r.min)), height : 12, rx : 3, class : 'aid-live-food-fill', 'data-food' : c.name, opacity : .5}, live);
      if (r.sore)
        el('rect', {x : x(r.sore[0]) - 3, y : y - 3, width : Math.max(6, x(r.sore[1]) - x(r.sore[0]) + 6), height : 18, rx : 3, class : 'aid-live-sore'}, live);
      txt(live, 294, y + 10, word('span', {from : Math.round(100 * r.min), to : percent(r.max)}), {'text-anchor' : 'end', class : 'aid-live-value'});
    });
  }
  function show(next) {
    state = next;
    model = derive();
    if (!model)
      return;
    kind.textContent = word('kind.' + model.diet);
    drawFish();
    drawYield();
    drawBars();
    tick(0);
  }
  // The gut's waves: its own, calm, always; the muscle's on top in the second half of each round,
  // stronger and faster as the muscle is. A morsel that has passed the gut leaves at the vent.
  function tick(dt) {
    if (!model || !film.way)
      return;
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    const strong = clamp((model.pace - 1) / (DIGESTION.fastest - 1)), works = step > STEPS / 2 && strong > 0;
    const depth = works ? .25 + .75 * strong : .12, pace = works ? model.pace : 1;
    wave += dt * .00009 * pace;
    const wall = TUBE + 2 * (WALL[0] + (WALL[1] - WALL[0]) * strong);
    for (let k = 0; k < SEGMENTS; k++) {
      const seg = film.segs[k], squeeze = Math.pow(.5 + .5 * Math.cos(2 * Math.PI * ((k + .5) / SEGMENTS - wave) * WAVES), 6) * depth;
      const outer = (wall + 3 * squeeze).toFixed(1), inner = (TUBE - 4 * squeeze).toFixed(1);
      if (outer !== seg.wallWidth) {
        seg.wall.setAttribute('stroke-width', outer);
        seg.wallWidth = outer;
      }
      if (inner !== seg.tubeWidth) {
        seg.tube.setAttribute('stroke-width', inner);
        seg.tubeWidth = inner;
      }
    }
    for (const b of film.bits) {
      const u = b.u + dt * .00009 * pace / (DIGESTION.shortest + (DIGESTION.longest - DIGESTION.shortest) * model.length);
      if (u >= 1) {
        // What is left of it leaves at the vent.
        const crumb = film.crumbs.find(c => c.t >= 1);
        if (crumb) {
          crumb.t = 0;
          crumb.from = film.way.end;
        }
      }
      b.u = u % 1;
      const [x, y] = film.way.at(b.u);
      b.e.setAttribute('cx', x.toFixed(1));
      b.e.setAttribute('cy', y.toFixed(1));
    }
    // The crumbs leave at the vent itself, sink away towards the tail, and fade.
    for (const c of film.crumbs)
      if (c.t < 1) {
        c.t = Math.min(1, c.t + dt / CRUMB_MS);
        c.e.setAttribute('cx', (c.from[0] + 8 * c.t).toFixed(1));
        c.e.setAttribute('cy', (c.from[1] + 19 * c.t).toFixed(1));
        c.e.setAttribute('opacity', (1 - c.t * c.t * c.t).toFixed(2));
      }
  }
  return {root, show, tick};
});
