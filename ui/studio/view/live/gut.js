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
import {activationLevel, activationQuality, adaptationOf, adaptationSteps, LONGEST_ADAPTATION, planOfUnit, unitOfPlan} from '../../../tuning.js';
import {
  addOrganType,
  gutLength,
  lifePhase,
  organTypes,
  removeOrganType,
  setGutLength,
  setLifePhase,
  setNodeCopies,
  setOrganNodes,
  updateCellDistribution,
  updateCenter
} from '../../model/document.js';
import {kindLimit} from '../../model/organs.js';
import {label} from '../kit.js';
import {chip, clamp, drag, el, fishIcon, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.gut.' + key, values);
// The foods, in the pictures' order, by their names in the engine's report.
const FOODS = Object.freeze([ 'plant', 'algae', 'flock', 'plankton', 'meat' ]);
// The stays the pictures show, and how finely.
const STAY = Object.freeze({short : 50, long : 800, samples : 140, least : 25, strip : 14});
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
// The curves begin at STAY.short. A short gut driven hard holds its meal less long than that:
// such stays have a narrow strip left of the axis, down to STAY.least, so that their marks and
// grips stay apart and can be set.
const xOfStay = stay => stay < STAY.short ? Y.L - STAY.strip * clamp((STAY.short - stay) / (STAY.short - STAY.least))
                                          : Y.L + (Y.R - Y.L) * Math.log(Math.min(stay, STAY.long) / STAY.short) / Math.log(STAY.long / STAY.short);
const stayOfX = x => x < Y.L ? STAY.short - (STAY.short - STAY.least) * clamp((Y.L - x) / STAY.strip)
                             : STAY.short * Math.pow(STAY.long / STAY.short, clamp((x - Y.L) / (Y.R - Y.L)));
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
// How strongly a food irritates the pain cells over the stays from `reach[0]` to `reach[1]`: at
// least, and at most.
function acheIn(curve, reach) {
  const aches = [ reach[0], ...AXIS.filter(stay => stay > reach[0] && stay < reach[1]), reach[1] ].map(stay => gutAche(curve.food, stay));
  return [ Math.min(...aches), Math.max(...aches) ];
}
// What a food gives and how it hurts over the stays from `reach[0]` to `reach[1]`.
// The reach's own two ends count exactly, and the picture's stays between them.
function rangeIn(curve, reach) {
  const stays = [ reach[0], ...AXIS.filter(stay => stay > reach[0] && stay < reach[1]), reach[1] ];
  const gains = stays.map(stay => gutUse(curve.food, stay)), sore = gains.filter((gain, k) => gutAche(curve.food, stays[k]) > 0);
  return {min : Math.min(...gains), max : Math.max(...gains), sore : sore.length ? [ Math.min(...sore), Math.max(...sore) ] : null};
}

// ===== The gut's senses =====
// Each sense has keys: groups of cells of their own (organTypes of the gut by the sense's cells).
// A key's threshold is its cells' own (the plan's threshold as the stimulus at which they begin,
// tuning.js, activationLevel); its cells' thresholds spread around it by twice the plan's spread
// either way (distribution.hh, draw_traits), shown as CELLS cells spread evenly. Cells that tire
// get used to the input from the first step on: what they are used to moves towards it by its
// share 1 / steps each step, and they answer what the input exceeds it by (cppn_brain.cc,
// adapted_response); the cells of fullness do not tire (brain_interface.hh, adapting_sense).
const CELLS = 7, LEVELS = [ activationLevel(0), activationLevel(1) ], LEVEL_SPAN = LEVELS[1] - LEVELS[0];
const USED = [ adaptationSteps(0), LONGEST_ADAPTATION ];
const SENSES = Object.freeze({
  full : {cells : 'fullness', tires : false, after : 260, row : false},
  ache : {cells : 'ache', tires : true, after : 120, row : true},
  feed : {cells : 'food'}
});
// The reward signal: at each swallow the engine adds a share of what the bite will give this gut
// to a flow that fades step by step; the cells feel the flow against the resting need, flow /
// (flow + need) (physiology.cc, take_nutrition; physiology.hh, nutrient_signal). The share and what
// is kept each step come from the engine's report. A schema's assumptions: the bite tried is
// worth BITE resting needs if all of it were used, and the picture gives each bite BITE_STEPS
// steps before the next is swallowed.
const BITE = 16.5, BITE_STEPS = 10;
const REWARD = Object.freeze({L : 62, R : 246, top : 34, row : 19, star : 274, height : 168});
const STAR = 'M0 -7 L1.7 -1.7 L7 0 L1.7 1.7 L0 7 L-1.7 1.7 L-7 0 L-1.7 -1.7 Z';
// The life picture: across, the fish's maturity; up, how fast the muscle makes the gut.
const LIFE = Object.freeze({L : 44, R : 226, top : 20, base : 92, icons : 110, height : 124, zones : 72, beside : 16, whole : .015, least : .08, hatch : .5});
const SENSE_BOX = Object.freeze({L : 92, R : 292, LX : 44, I0 : 150, I1 : 254, row : 34, rowL : 6, rowR : 294, rowGap : 10});
const KEY_X = 9;
const cellGates = k => Array.from({length : CELLS}, (_, c) => clamp(k.gate + k.spread * ((c + .5) / CELLS - .5), LEVELS[0], LEVELS[1]));
// A cell's answer to a stimulus past its threshold and what it is used to (body_plan.cc, the
// bounded answer of a sense cell).
const answer = (x, gate, used) => {
  const over = (clamp(x) - used - gate) / (1 - gate);
  return over > 0 ? over / (over + gate * (1 - over)) : 0;
};
// The input tried on a sense: it rises to a height, holds and stops, then fades.
const stimulusOf = (input, after) => {
  const top = input.height * clamp(input.stop / Math.max(1, input.rise));
  return Array.from({length : STEPS + 1}, (_, st) => st <= input.stop ? input.height * clamp(st / Math.max(1, input.rise)) : top * Math.exp(-(st - input.stop) / after));
};
// What a key's cells send under an input, step by step, and what they have got used to by then.
function runOf(k, stim, tires) {
  const gates = cellGates(k), pace = tires ? 1 / k.used : 0, sent = [], used = [];
  let u = 0;
  for (const s of stim) {
    sent.push(gates.reduce((sum, g) => sum + answer(s, g, u), 0) / CELLS);
    used.push(u);
    u += (s - u) * pace;
  }
  return {sent, used};
}
// The step at which a key's last cell falls silent under this input; past the picture's steps
// if it never does, 0 if the cell never sends at all.
function silentStep(k, stim) {
  const last = Math.min(...cellGates(k));
  let used = 0, heard = false;
  for (let st = 0; st < stim.length; st++) {
    const hears = stim[st] - used > last;
    if (heard && !hears)
      return st;
    heard ||= hears;
    used += (stim[st] - used) / k.used;
  }
  return heard ? stim.length : 0;
}
// The pace of tiring that puts that step where it is wanted (the slower, the later).
function usedFor(k, stim, step) {
  if (!silentStep({...k, used : USED[1]}, stim))
    return k.used;
  let [lo, hi] = USED;
  for (let n = 0; n < 24; n++) {
    const mid = (lo + hi) / 2;
    if (silentStep({...k, used : mid}, stim) < step)
      lo = mid;
    else
      hi = mid;
  }
  return hi;
}
const between = (values, at) => {
  const a = Math.floor(at), f = at - a;
  return values ? (values[a] ?? 0) * (1 - f) + (values[a + 1] ?? values[a] ?? 0) * f : 0;
};
// The nerve cells above a sense's diagram: one for each key, the fibres running into one bundle.
const IRRITANT = 'M2 -8 L-4 1 H1 L-2 8 L5 -2 H0 Z';
const NERVE = Object.freeze({
  somas : [ [ 150, 72 ], [ 124, 64 ], [ 176, 82 ] ],
  join : [ 170, 38 ],
  bundle : [ [ 170, 38 ], [ 186, 22 ], [ 166, 18 ], [ 178, 8 ] ],
  tilt : 14,
  about : [ 150, 62 ],
  flash : 104,
  tips : [ [ -13, 5 ], [ -7, 14 ], [ 4, 13 ] ],
  speed : .0026,
  rate : .006,
  merge : .15,
  pulses : 4,
  dots : 7,
  dotSpeed : .004
});
const cubic = (a, b, c, d, s) => {
  const u = 1 - s;
  return [ 0, 1 ].map(n => u * u * u * a[n] + 3 * u * u * s * b[n] + 3 * u * s * s * c[n] + s * s * s * d[n]);
};

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
  heading(word('full'));
  const pictures = {full : svgOf()};
  heading(word('aching'));
  pictures.ache = svgOf();
  heading(word('reward'));
  const rewards = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on each sense and which of its keys is chosen: not part of the fish.
  const tried = {
    full : {chosen : 0, input : {rise : 120, height : .8, stop : 520}},
    ache : {chosen : 0, input : {rise : 60, height : .7, stop : 600}},
    feed : {chosen : 0}
  };
  let rewarded = [];
  const play = {stim : {}, sent : {}, lines : {}, levels : [], glow : [], nerves : {}, time : 0};
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const gutOf = doc => doc.organs.find(o => o.type === 'gut') ?? null;
  // A sense's keys as the document has them.
  const keysOf = id => {
    const gut = gutOf(state.document);
    return gut ? organTypes(gut, SENSES[id].cells).map(type => {
      const cell = type.centers[0];
      return {
        id : cell.id,
        type : type.id,
        gate : activationLevel(unitOfPlan(cell.threshold)),
        spread : 4 * cell.distribution.spread_physiology * LEVEL_SPAN / 2,
        used : adaptationSteps(cell.tau)
      };
    }) : [];
  };
  const setGate = (k, gate) => updateCenter(studio.state.document, k.id, {threshold : planOfUnit(activationQuality(clamp(gate, LEVELS[0], LEVELS[1])))});
  const setSpread = (k, spread) => updateCellDistribution(studio.state.document, k.id, 'spread_physiology', clamp(spread / (2 * LEVEL_SPAN), 0, 1));
  const setUsed = (k, steps) => updateCenter(studio.state.document, k.id, {tau : adaptationOf(clamp(steps, USED[0], USED[1]))});
  function fewer(id, k) {
    const gut = gutOf(studio.state.document);
    tried[id].chosen = 0;
    change(gut && removeOrganType(studio.state.document, gut.id, k.type, SENSES[id].cells));
  }
  function more(id, gate) {
    const gut = gutOf(studio.state.document);
    const added = gut && addOrganType(studio.state.document, gut.id, studio.state.sites, {threshold : planOfUnit(activationQuality(gate))}, SENSES[id].cells);
    if (!added)
      return studio.notice(label('status.noRoom'));
    tried[id].chosen = keysOf(id).length;
    change(added.document);
  }
  const film = {wall : null, tube : null, segs : [], bits : [], crumbs : [], way : null, share : null, stomach : null, keys : null, named : []};
  let state = studio.state, curves = null, curvesFor = null, model = null, step = 0, wave = 0;
  const draft = doc => doc && studio.draftDesign(doc, 'live:gut', 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const muscleOf = doc => doc.organs.find(o => o.type === 'gutmuscle') ?? null;

  // What a gut is built for at a stay: the food that gives most there; everything where three or
  // more foods give nearly as much.
  function bestAt(stay) {
    const got = curves.map(c => ({c, gain : gutUse(c.food, stay)})).sort((a, b) => b.gain - a.gain);
    return got.filter(g => g.gain >= DIET_SHARE * got[0].gain).length >= 3 ? 'all' : got[0].c.name;
  }
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
    // The most the grip can reach: every place of the gut wall with a full cell of these fibres.
    const fullest = muscle ? Math.max(2, kindLimit(muscle, state.sites)) * cellStrength({...cells[0], copies : ATELIER_LIMITS.max_copies}, diet.gut) : 0;
    const quickest = row && most > 0 ? Math.max(pace, sampled(row, fullest / most)) : pace;
    return {length, rest, pace, quickest, fastest, reach, muscle, strength, ranges : curves.map(c => rangeIn(c, reach)), diet : bestAt(fastest)};
  }

  function buildFish(fixed) {
    const st = STOMACH, {down, right} = FISH;
    el('path', {d : BODY, transform : `translate(${right} ${down})`, class : 'aid-live-body'}, fixed);
    const g = el('g', {transform : `translate(${right} ${down})`}, fixed);
    // The gullet, from the mouth to the stomach.
    el('path', {d : `M${NOSE[0] + 2} ${NOSE[1]} H${st.x - .9 * st.rx}`, class : 'aid-live-gullet'}, g);
    film.wall = el('g', {class : 'aid-live-gutwall'}, g);
    film.tube = el('g', {class : 'aid-live-guttube'}, g);
    film.bits = Array.from({length : MORSELS}, (_, k) => ({u : k / MORSELS, rank : k, on : true, e : el('circle', {r : 2.4, class : 'aid-live-morsel'}, g)}));
    film.crumbs = Array.from({length : CRUMBS}, () => ({t : 1, from : [ 0, 0 ], e : el('circle', {r : 2.4, class : 'aid-live-crumb', opacity : 0}, g)}));
    film.stomach = stomach(g, st, 'aid-live-fishstomach', 'fish', null);
    film.keys = el('g', {}, g);
  }
  // A stomach whose content the clock moves; `bands` is where the satiety keys' bands are drawn.
  // scale: where a filling stands, if not from the stomach's bottom to its top.
  function stomach(parent, at, name, owner, scale) {
    el('clipPath', {id : name}, parent).appendChild(el('path', {d : stomachPath(at)}));
    el('path', {d : stomachPath(at), class : 'aid-live-stomach-back'}, parent);
    const inside = el('g', {'clip-path' : `url(#${name})`}, parent);
    const content = el('rect', {x : at.x - 1.2 * at.rx, y : at.y, width : 2.4 * at.rx, height : 3 * at.ry, class : 'aid-live-stomach-content'}, inside);
    const bands = el('g', {}, inside), levelY = scale ?? (v => at.y + at.ry - 2 * at.ry * v);
    el('path', {d : stomachPath(at), class : 'aid-live-stomach'}, parent);
    play.levels = play.levels.filter(l => l.owner !== owner);
    play.levels.push({owner, sense : 'full', show : v => content.setAttribute('y', levelY(v).toFixed(1))});
    return {bands, levelY};
  }
  // A key's band: from its lowest to its highest cell's threshold.
  function keyBand(parent, k, i, chosen, x, width, yOf) {
    const gates = cellGates(k), top = yOf(Math.max(...gates)), bottom = yOf(Math.min(...gates));
    return el('rect', {x, y : Math.min(top, yOf(k.gate) - 1.5), width, height : Math.max(bottom - top, 3), class : 'aid-live-keyband k' + i % 3 + (chosen ? ' on' : '')}, parent);
  }
  const keyGrip = (i, on) => 'aid-live-keygrip k' + i % 3 + (on ? ' on' : '');
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
    // The strength wanted: first fuller cells, then more of them (as many as the gut wall has
    // places), all with the fibres the muscle has. Back again, the cells stay and grow thinner.
    const wanted = shareFor(row, m.rest / Math.min(stayOfX(p.x), m.rest)) * most, one = cellStrength({...m.muscle.centers[0], copies : 1}, gut),
          full = ATELIER_LIMITS.max_copies, places = kindLimit(m.muscle, studio.state.sites);
    // Cells are only ever added here: taking one away would take its wires with it.
    const cells = clamp(2 * Math.ceil(wanted / (one * full) / 2), m.muscle.centers.length, Math.max(m.muscle.centers.length, places));
    const sized = cells === m.muscle.centers.length ? studio.state.document : setOrganNodes(studio.state.document, m.muscle.id, cells, studio.state.sites) ?? studio.state.document;
    draft(setNodeCopies(sized, m.muscle.id, clamp(Math.round(wanted / (one * cells)), 1, full)));
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
    // The satiety keys: a band across the stomach for each, and its grip outside the fish at the
    // end of its line; a key the content has passed is lit by the clock.
    const st = STOMACH, keys = keysOf('full'), full = tried.full;
    film.keys.replaceChildren();
    film.stomach.bands.replaceChildren();
    play.glow = play.glow.filter(g => g.owner !== 'fish');
    full.chosen = clamp(full.chosen, 0, Math.max(0, keys.length - 1));
    keys.forEach((k, i) => keyBand(film.stomach.bands, k, i, i === full.chosen, st.x - 1.2 * st.rx, 2.4 * st.rx, film.stomach.levelY));
    keys.forEach((k, i) => {
      const y = film.stomach.levelY(k.gate), on = i === full.chosen;
      const line = el('path', {d : `M${KEY_X + 7 - right} ${y} H${st.x + st.rx * .8}`, class : 'aid-live-keyline k' + i % 3 + (on ? ' on' : '')}, film.keys);
      play.glow.push({owner : 'fish', line, gate : k.gate, sense : 'full'});
      drag(svg, el('rect', {x : KEY_X - 7, y : y - 4 + down, width : 14, height : 8, rx : 2, class : keyGrip(i, on)}, live), p => {
        full.chosen = i;
        draft(setGate(k, (st.y + st.ry - (p.y - down)) / (2 * st.ry)));
      }, 'fishkey' + i, 'grip', settle);
    });
    if (keys.length) {
      txt(live, KEY_X - 7, film.stomach.levelY(Math.max(...keys.map(k => k.gate))) + down - 8, word('sated'));
      const chipY = st.y + 1.12 * st.ry + down + 11, chipX = st.x + right;
      chip(live, chipX - 9, chipY, '−', () => fewer('full', keys[full.chosen]), keys.length > 1, 6);
      chip(live, chipX + 9, chipY, '+', () => more('full', clamp(Math.min(...keys.map(k => k.gate)) - .2, .1, .9)), keys.length < 3, 6);
    }
    // The gut's end: dragged sideways for a longer or shorter gut.
    const [ex, ey] = film.way.end;
    drag(svg, el('rect', {x : ex + right - 5, y : ey + down - 4, width : 10, height : 12, rx : 3}, live),
         p => draft(setGutLength(studio.state.document, clamp((p.x - right - GUT.right[0]) / (GUT.right[1] - GUT.right[0])))),
         'gutend', 'grip', settle);
    // The muscle, under the fish on the yield's own scale of stays: the wedge lies from the gut
    // at rest (no muscle) to the fastest this muscle's cells can make it at their fullest; the
    // grip stands exactly above the muscle's grip in the yield and moves with it.
    const wy = FISH.height - 9, wx1 = xOfStay(m.rest), wide = xOfStay(m.rest / m.quickest), wx0 = xOfStay(m.fastest);
    // The way the grip can go, pale; on it the wedge.
    el('path', {d : `M${wx1} ${wy} H${wide}`, class : 'aid-live-muscleway'}, live);
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
    film.named = drawn;
  }
  function drawYield() {
    const {svg, under, live} = picture(yields, Y.height, buildYield), {top, row} = Y, m = model, x1 = xOfStay(m.rest), x0 = xOfStay(m.fastest);
    // Names: each on its own curve, where neither another name, another curve nor the line of the
    // gut at rest sits.
    const {L, R, base} = Y, drawn = film.named, taken = [ {x0 : x1 - 10, x1 : x1 + 10, y0 : top - 16, y1 : base} ];
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
            txt(live, x, y + lift, c.words, {'text-anchor' : 'middle', class : 'aid-live-food-word', 'data-food' : c.name});
            return;
          }
        }
    });
    el('rect', {x : x0, y : top, width : x1 - x0, height : row + 6 - top, class : 'aid-live-reach'}, under);
    el('path', {d : `M${x1} ${top - 6} V${Y.base} M${x1} ${Y.base + 19} V${row}`, class : 'aid-live-rest'}, live);
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
  const legendY = BARS.top + FOODS.length * BARS.row + 14;
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
      // One number where the gut reaches no span.
      txt(live, 294, y + 10, Math.round(100 * r.min) === Math.round(100 * r.max) ? percent(r.max) : word('span', {from : Math.round(100 * r.min), to : percent(r.max)}), {'text-anchor' : 'end', class : 'aid-live-value'});
    });
  }
  // The nerve cells above a sense's diagram (see NERVE). A cell is chosen by touching it; if the
  // chosen cell tires, its grip stands above the step at which it sends nothing more.
  function nerves(svg, parent, id, keys, gripX, tire) {
    const {join, bundle} = NERVE, cells = [], tilted = el('g', {transform : `rotate(${NERVE.tilt} ${NERVE.about})`, class : 'aid-live-sense-' + id}, parent);
    el('path', {d : `M${bundle[0]} C${bundle[1]} ${bundle[2]} ${bundle[3]}`, class : 'aid-live-nerve-bundle'}, tilted);
    keys.forEach((k, i) => {
      const [cx, cy] = NERVE.somas[i], on = i === tried[id].chosen, way = [ [ cx, cy ], [ cx - 8, cy - 30 ], [ join[0] - 22, join[1] + 24 ], join ];
      el('path', {d : `M${way[0]} C${way[1]} ${way[2]} ${way[3]}`, class : 'aid-live-nerve-fibre k' + i % 3}, tilted);
      el('path', {d : `M${cx} ${cy} q-7 5 -13 5 l-4 -3 m4 3 l-3 4 M${cx} ${cy} q-2 8 -7 14 l-4 1 m4 -1 l0 5 M${cx} ${cy} q4 6 4 13 l-3 3 m3 -3 l3 3`, class : 'aid-live-nerve-ends k' + i % 3}, tilted);
      cells.push({due : 0, way, pulses : Array.from({length : NERVE.pulses}, () => ({t : 1, e : el('circle', {r : 0, class : 'aid-live-pulse'}, tilted)}))});
      el('circle', {cx, cy, r : 6, class : 'aid-live-soma k' + i % 3 + (on ? ' on' : '')}, tilted).addEventListener('pointerdown', () => {
        tried[id].chosen = i;
        show(studio.state);
      });
      if (SENSES[id].tires && on)
        drag(svg, el('rect', {x : gripX(i) - 5, y : SENSE_BOX.I0 - 33, width : 10, height : 10, rx : 3, class : 'aid-live-tire k' + i % 3}, parent), p => tire(k, i, p), id + 'tire', 'grip', settle);
    });
    const merged = Array.from({length : 6}, () => ({t : 1, n : 0, e : el('circle', {r : 0, class : 'aid-live-pulse'}, tilted)}));
    const shown = NERVE.somas.slice(0, keys.length);
    // Under the cells, in their middle, above the strip in which a tiring cell's grip moves.
    const at = [ shown.reduce((sum, s) => sum + s[0], 0) / shown.length - 4, NERVE.flash ];
    const dots = Array.from({length : NERVE.dots}, (_, n) => {
      const [cx, cy] = shown[n % shown.length], [dx, dy] = NERVE.tips[n % NERVE.tips.length];
      return {t : 1, to : [ cx + dx, cy + dy ], e : el('circle', {r : 0, class : 'aid-live-irritant'}, tilted)};
    });
    play.nerves[id] = {cells, bundle : merged, at, dots, due : 0, irritant : el('path', {d : IRRITANT, class : 'aid-live-irritant'}, tilted)};
  }
  // One sense: the nerve cells, and under them one diagram over the steps: the input with its two
  // round knobs; left of it what holds the thresholds, filling with the input, with a grip for
  // each key; each key's dashed line and band across the input; for the chosen key what its cells
  // still feel as they tire and, filled, what they send. Under the bellyache: how strongly each
  // food irritates these cells in this gut, with the keys' thresholds across.
  function drawSense(id) {
    const o = SENSES[id], own = tried[id], inp = own.input, keys = keysOf(id), {L, R, LX, I0, I1, row} = SENSE_BOX;
    const {svg, live} = picture(pictures[id], I1 + 22 + (o.row ? row + 50 : 0));
    delete play.nerves[id];
    delete play.lines[id];
    play.glow = play.glow.filter(g => g.owner !== id);
    play.levels = play.levels.filter(l => l.owner !== id);
    if (!keys.length)
      return;
    own.chosen = clamp(own.chosen, 0, keys.length - 1);
    live.setAttribute('class', 'aid-live-sense-' + id);
    const stim = play.stim[id] = stimulusOf(inp, o.after);
    const IY = v => I1 - (I1 - I0) * clamp(v), vOf = y => clamp((I1 - y) / (I1 - I0));
    const X = st => L + (R - L) * st / STEPS, stOf = x => clamp(Math.round((x - L) / (R - L) * STEPS), 0, STEPS);
    const runs = keys.map(k => runOf(k, stim, o.tires));
    play.sent[id] = runs.map(r => r.sent);
    // Where a key's cells send nothing more, and the grips' way of moving it.
    const ends = keys.map(k => silentStep(k, stim));
    const tire = (k, i, p) => {
      own.chosen = i;
      draft(setUsed(k, usedFor(k, stim, stOf(p.x))));
    };
    const choose = i => () => {
      own.chosen = i;
      show(studio.state);
    };
    const newGate = () => clamp((Math.max(...keys.map(k => k.gate)) + 1) / 2, .05, .95);
    nerves(svg, live, id, keys, i => X(clamp(ends[i], 0, STEPS)), tire);
    // The same pair twice: at the cells and at the keys (under their holder).
    chip(live, R - 22, I0 - 54, '−', () => fewer(id, keys[own.chosen]), keys.length > 1, 6);
    chip(live, R - 6, I0 - 54, '+', () => more(id, newGate()), keys.length < 3, 6);
    txt(live, L, I0 - 9, word(id + 'Course'));
    // What holds the thresholds, filling with the input. The stomach is smaller than the diagram
    // is high, so that it stands clear of the pair under it.
    if (id === 'full')
      stomach(live, {x : LX, y : (I0 + I1) / 2, rx : 27, ry : .85 * (I1 - I0) / 2}, 'aid-live-stomach-' + id, id, IY);
    else {
      el('rect', {x : LX - 5, y : I0, width : 10, height : I1 - I0, rx : 5, class : 'aid-live-track'}, live);
      const content = el('rect', {x : LX - 4, width : 8, rx : 4, class : 'aid-live-sense-fill', opacity : .6}, live);
      play.levels.push({owner : id, sense : id, show : v => {
        content.setAttribute('y', IY(v).toFixed(1));
        content.setAttribute('height', (I1 - IY(v)).toFixed(1));
      }});
    }
    el('rect', {x : L, y : I0, width : R - L, height : I1 - I0, class : 'aid-live-ground'}, live);
    el('path', {d : path(stim.map((v, st) => [ X(st), IY(v) ])) + ` L${R} ${I1} L${L} ${I1} Z`, class : 'aid-live-sense-input'}, live);
    keys.forEach((k, i) => {
      const on = i === own.chosen, low = Math.min(...cellGates(k)), felt = runs[i].used.map((u, st) => Math.max(0, stim[st] - u));
      const shapes = [ keyBand(live, k, i, on, L, R - L, IY) ];
      if (on)
        shapes.push(el('path', {d : `${path(felt.map((f, st) => [ X(st), IY(Math.max(f, low)) ]))} L${R} ${IY(low)} L${L} ${IY(low)} Z`, class : 'aid-live-sense-fill', opacity : .95}, live));
      for (const shape of shapes) {
        shape.classList.add('aid-live-chip');
        shape.addEventListener('pointerdown', choose(i));
      }
      if (o.tires && on)
        el('path', {d : path(felt.map((f, st) => [ X(st), IY(f) ])), class : 'aid-live-felt'}, live);
      const line = el('path', {d : `M${LX + 12} ${IY(k.gate)} H${R}`, class : 'aid-live-keyline k' + i % 3 + (on ? ' on' : '')}, live);
      play.glow.push({owner : id, line, gate : k.gate, sense : id});
    });
    el('path', {d : `M${L} ${I0 - 2} V${I1} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, I1 + 16, word('steps'));
    for (const st of [ STEPS / 3, 2 * STEPS / 3 ])
      txt(live, X(st), I1 + 16, st, {'text-anchor' : 'middle'});
    txt(live, R, I1 + 16, STEPS, {'text-anchor' : 'end'});
    play.lines[id] = {line : el('path', {class : 'aid-live-now'}, live), x : X, top : I0, base : I1};
    // Where each key's cells send nothing more: a thin mark for each on the step axis (not for
    // cells that never send); the chosen one's is a grip. It is called got used to only where the
    // input alone would still make the cells send.
    if (o.tires)
      keys.map((k, i) => i).sort((a, b) => (a === own.chosen) - (b === own.chosen)).forEach(i => {
        const k = keys[i], at = ends[i], x = X(Math.min(at, STEPS)), left = x > (L + R) / 2;
        if (at < 1)
          return;
        if (i !== own.chosen) {
          el('path', {d : `M${x} ${I1 - 9} V${I1}`, class : 'aid-live-keymark k' + i % 3}, live);
          return;
        }
        el('path', {d : `M${x} ${I0 - 23} V${I0 - 21} M${x} ${I0} V${I1}`, class : 'aid-live-keyline k' + i % 3}, live);
        if (at <= STEPS && stim[at] > Math.min(...cellGates(k)))
          txt(live, x + (left ? -7 : 7), I0 + 11, word('used'), {'text-anchor' : left ? 'end' : 'start', class : 'aid-live-onground'});
        drag(svg, el('rect', {x : x - 4, y : I1 - 13, width : 8, height : 10, rx : 2, class : keyGrip(i, true)}, live), p => tire(k, i, p), id + 'used', 'grip', settle);
      });
    // The grips, above everything they could be hidden by: every key and its spread, the input's
    // two knobs (when it is fully there and how strong, and when it stops).
    keys.forEach((k, i) => {
      const on = i === own.chosen, gates = cellGates(k);
      drag(svg, el('rect', {x : LX - 9, y : IY(k.gate) - 4, width : 18, height : 8, rx : 2, class : keyGrip(i, on)}, live), p => {
        own.chosen = i;
        draft(setGate(k, vOf(p.y)));
      }, id + 'key' + i, 'grip', settle);
      const sx = R - 8 - 13 * i, top = IY(Math.max(...gates)), bottom = IY(Math.min(...gates));
      el('path', {d : `M${sx} ${top} V${Math.max(bottom, top + 4)}`, class : 'aid-live-spread'}, live);
      drag(svg, el('circle', {cx : sx, cy : top, r : 4.5}, live), p => {
        own.chosen = i;
        draft(setSpread(k, clamp(2 * (vOf(p.y) - k.gate), 0, .8)));
      }, id + 'spread' + i, 'grip', settle);
    });
    const knob = (at, name, move) => drag(svg, el('circle', {cx : X(at), cy : IY(inp.height), r : 5.5, class : 'aid-live-sense-knob'}, live), p => {
      move(stOf(p.x));
      inp.height = vOf(p.y);
      show(studio.state);
    }, id + name, 'knob');
    knob(inp.rise, 'rise', st => { inp.rise = clamp(st, 1, inp.stop - 1); });
    knob(inp.stop, 'stop', st => { inp.stop = clamp(st, inp.rise + 1, STEPS - 10); });
    chip(live, LX - 9, I1 + 10, '−', () => fewer(id, keys[own.chosen]), keys.length > 1, 6);
    chip(live, LX + 9, I1 + 10, '+', () => more(id, newGate()), keys.length < 3, 6);
    // How strongly each food irritates these cells in this gut: only the foods that can at all.
    if (o.row) {
      const B0 = I1 + 46, B1 = B0 + row, {rowL, rowR, rowGap} = SENSE_BOX;
      const foods = curves.map((c, j) => [ c, j ]).filter(([ c ]) => c.aches.some(a => a > 0)), wide = (rowR - rowL + rowGap) / Math.max(1, foods.length) - rowGap;
      const BY = v => B1 - (B1 - B0) * clamp(v);
      txt(live, rowL, B0 - 6, word('acheRow'));
      foods.forEach(([ c, j ], n) => {
        // Pale: the most this food hurts at any stay; stronger: what it does in this gut, at
        // most and at least.
        const [lo, hi] = acheIn(c, model.reach), x = rowL + (wide + rowGap) * n, any = Math.max(...c.aches);
        el('rect', {x, y : B0, width : wide, height : B1 - B0, rx : 2, class : 'aid-live-track'}, live);
        el('rect', {x, y : BY(any), width : wide, height : B1 - BY(any), rx : 2, class : 'aid-live-food-fill', 'data-food' : c.name, opacity : .15}, live);
        el('rect', {x, y : BY(hi), width : wide, height : B1 - BY(hi), rx : 2, class : 'aid-live-food-fill', 'data-food' : c.name, opacity : .45}, live);
        el('rect', {x, y : BY(lo), width : wide, height : B1 - BY(lo), rx : 2, class : 'aid-live-food-fill', 'data-food' : c.name, opacity : .9}, live);
        txt(live, x + wide / 2, B1 + 12, word('food.' + c.name), {'text-anchor' : 'middle', class : 'aid-live-food-word', 'data-food' : c.name});
      });
      keys.forEach((k, i) => el('path', {d : `M${rowL - 3} ${BY(k.gate)} H${rowR + 3}`, class : 'aid-live-keyline k' + i % 3 + (i === own.chosen ? ' on' : '')}, live));
    }
  }
  // The present moment: the lines, what the holders hold, the keys the input has passed.
  function showMoment() {
    const now = id => between(play.stim[id], step);
    for (const {line, x, top, base} of Object.values(play.lines))
      line.setAttribute('d', `M${x(step).toFixed(1)} ${top} V${base}`);
    for (const l of play.levels)
      l.show(now(l.sense));
    for (const g of play.glow)
      g.line.setAttribute('opacity', now(g.sense) >= g.gate ? 1 : .45);
    // The bite swallowed now: its dot swells and settles; its star is what the cells send for
    // what is left of its flow.
    const turn = step / STEPS * rewarded.length, since = turn % 1, keep = state.capabilities.diet.nutrientKeep;
    rewarded.forEach((r, j) => {
      const mine = j === Math.floor(turn), flow = r.flow * Math.pow(keep, since * BITE_STEPS), felt = flow / (flow + 1);
      const signal = mine ? r.gates.reduce((sum, gate) => sum + answer(felt, gate, 0), 0) / r.gates.length : 0;
      r.dot.setAttribute('r', (4.5 + (mine ? 2.5 * Math.exp(-5 * since) : 0)).toFixed(1));
      r.mark.setAttribute('transform', `translate(${r.at}) scale(${(signal > .01 ? .45 + .9 * signal : 0).toFixed(2)})`);
    });
  }
  // The nerve cells' pulses and what irritates them, as big as the input is.
  function showNerves(dt) {
    const {speed, rate, merge, bundle} = NERVE, place = (e, [ x, y ]) => {
      e.setAttribute('cx', x.toFixed(1));
      e.setAttribute('cy', y.toFixed(1));
    };
    play.time += dt;
    for (const [id, n] of Object.entries(play.nerves)) {
      const st = Math.round(step), felt = between(play.stim[id], step);
      // As big as the input is now: it changes only when the input does.
      n.irritant.setAttribute('transform', `translate(${n.at}) scale(${(.4 + .9 * felt).toFixed(2)})`);
      n.irritant.setAttribute('opacity', felt > .02 ? 1 : 0);
      n.due += dt * .012 * felt;
      const still = n.dots.find(d => d.t >= 1);
      if (n.due >= 1 && still) {
        n.due = 0;
        still.t = 0;
        still.e.setAttribute('r', 1.1);
      }
      for (const d of n.dots)
        if (d.t < 1) {
          d.t = Math.min(1, d.t + dt * NERVE.dotSpeed);
          place(d.e, [ n.at[0] + (d.to[0] - n.at[0]) * d.t, n.at[1] + (d.to[1] - n.at[1]) * d.t ]);
          if (d.t >= 1)
            d.e.setAttribute('r', 0);
        }
      n.cells.forEach((c, i) => {
        const sent = play.sent[id]?.[i]?.[st] ?? 0, idle = c.pulses.find(p => p.t >= 1);
        c.due += dt * rate * sent;
        if (c.due >= 1 && idle) {
          c.due = 0;
          idle.t = 0;
          idle.e.setAttribute('r', 2.2);
        }
        for (const p of c.pulses)
          if (p.t < 1) {
            p.t = Math.min(1, p.t + dt * speed);
            place(p.e, cubic(...c.way, p.t));
            if (p.t < 1)
              continue;
            // Into the bundle: it joins a pulse that has only just entered, or starts one.
            p.e.setAttribute('r', 0);
            const near = n.bundle.find(b => b.t < merge), b = near ?? n.bundle.find(b => b.t >= 1);
            if (!b)
              continue;
            if (!near) {
              b.t = 0;
              b.n = 0;
            }
            b.e.setAttribute('r', (.6 + 2.2 * Math.sqrt(++b.n)).toFixed(1));
          }
      });
      for (const b of n.bundle)
        if (b.t < 1) {
          b.t = Math.min(1, b.t + dt * speed);
          place(b.e, cubic(...bundle, b.t));
          if (b.t >= 1)
            b.e.setAttribute('r', 0);
        }
    }
  }
  // Which food rewards this fish: a row for each food. Across: how much a bite of it rewards in
  // this gut, little to much; the dot is the bite with the muscle at its best for it, the short
  // line behind it how far the muscle moves it. The upright dashed lines are the keys'
  // thresholds, each dragged sideways by its grip above; the band is how far its cells spread,
  // set by the round grip with a tail below. The clock swallows one bite after the other: its dot
  // swells, and at the right its star is as big as the signal the chosen key's cells send for it
  // now; it fades with the bite's flow and is gone once that is below the cells' thresholds.
  function drawReward() {
    const {svg, live} = picture(rewards, REWARD.height), diet = state.capabilities.diet, keys = keysOf('feed'), own = tried.feed;
    rewarded = [];
    if (!keys.length || !(diet.nutrientShare > 0) || !(diet.nutrientKeep > 0))
      return;
    own.chosen = clamp(own.chosen, 0, keys.length - 1);
    live.setAttribute('class', 'aid-live-sense-feed');
    const {L, R, top, row, star} = REWARD, base = top + row * curves.length;
    const X = v => L + (R - L) * clamp(v), vOf = x => clamp((x - L) / (R - L));
    const reward = gain => { const flow = diet.nutrientShare * BITE * gain; return flow / (flow + 1); };
    const gates = cellGates(keys[own.chosen]);
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-ground'}, live);
    keys.forEach((k, i) => {
      const g = cellGates(k), x0 = X(Math.min(...g)), x1 = X(Math.max(...g));
      el('rect', {x : x0, y : top, width : Math.max(x1 - x0, 3), height : base - top, class : 'aid-live-keyband k' + i % 3 + (i === own.chosen ? ' on' : '')}, live);
    });
    txt(live, star, top - 8, word('signal'), {'text-anchor' : 'middle'});
    rewarded = curves.map((c, j) => {
      const y = top + row * (j + .5), least = reward(model.ranges[j].min), most = reward(model.ranges[j].max);
      txt(live, 6, y + 4, word('food.' + c.name), {class : 'aid-live-food-word', 'data-food' : c.name});
      el('path', {d : `M${L} ${y} H${R}`, class : 'aid-live-rowline'}, live);
      if (most - least > .004)
        el('path', {d : `M${X(least)} ${y} H${X(most)}`, class : 'aid-live-food-whisker', 'data-food' : c.name}, live);
      el('circle', {cx : star, cy : y, r : 1.2, class : 'aid-live-rowline'}, live);
      return {
        dot : el('circle', {cx : X(most), cy : y, r : 4.5, class : 'aid-live-food-fill', 'data-food' : c.name}, live),
        mark : el('path', {d : STAR, class : 'aid-live-sense-fill'}, live),
        at : [ star, y ],
        flow : diet.nutrientShare * BITE * model.ranges[j].max,
        gates
      };
    });
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, base + 28, word('little'));
    txt(live, (L + R) / 2, base + 28, word('perBite'), {'text-anchor' : 'middle'});
    txt(live, R, base + 28, word('much'), {'text-anchor' : 'end'});
    keys.forEach((k, i) => {
      const on = i === own.chosen, x = X(k.gate), far = Math.max(X(Math.max(...cellGates(k))), x + 4);
      el('path', {d : `M${x} ${top - 6} V${base}`, class : 'aid-live-keyline k' + i % 3 + (on ? ' on' : '')}, live);
      drag(svg, el('rect', {x : x - 4, y : top - 20, width : 8, height : 16, rx : 2, class : keyGrip(i, on)}, live), p => {
        own.chosen = i;
        draft(setGate(k, vOf(p.x)));
      }, 'feedkey' + i, 'grip', settle);
      el('path', {d : `M${x} ${base + 8} H${far}`, class : 'aid-live-spread'}, live);
      drag(svg, el('circle', {cx : far, cy : base + 8, r : 4.5}, live), p => {
        own.chosen = i;
        draft(setSpread(k, clamp(2 * (vOf(p.x) - k.gate), 0, .8)));
      }, 'feedspread' + i, 'grip', settle);
    });
    chip(live, star - 8, base + 10, '−', () => fewer('feed', keys[own.chosen]), keys.length > 1, 6);
    chip(live, star + 8, base + 10, '+', () => more('feed', clamp((Math.max(...keys.map(k => k.gate)) + 1) / 2, .05, .95)), keys.length < 3, 6);
  }
  // Life cycle: across, the fish's maturity from the egg to the grown fish; up, how fast the
  // muscle makes the gut, from rest at the bottom to the fastest it can be. The ground's bands
  // are the food this gut is built for at that pace. The line is the fish: at rest where the
  // muscle does not work, at the muscle's pace where it does, from the maturity at which its
  // cells begin to work to the one at which they die; a grip at each of the two.
  function buildLife(fixed) {
    const {L, R, top, base, icons, hatch} = LIFE, at = L + (R - L) * hatch;
    el('path', {d : `M${L - 14} ${base} L${L - 19.5} ${top} h11 Z`, class : 'aid-live-muscle'}, fixed);
    txt(fixed, 4, top - 8, word('muscle'));
    el('ellipse', {cx : L + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, fixed);
    el('circle', {cx : L + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, fixed);
    fishIcon(fixed, at, icons, .5);
    fishIcon(fixed, R - 16, icons, .8);
    el('path', {d : `M${L + 22} ${icons} H${at - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${at + 18} ${icons} H${R - 40} m-6 -3.5 l6 3.5 l-6 3.5`, class : 'aid-live-arrow'}, fixed);
  }
  function drawLife() {
    const {svg, under, live} = picture(life, LIFE.height, buildLife), {L, R, top, base, zones} = LIFE, m = model, caps = state.capabilities;
    const span = DIGESTION.fastest - 1, yOf = pace => base - (base - top) * clamp((pace - 1) / span), X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L));
    // The bands: runs of the same food, from rest up to the fastest pace.
    const runs = [];
    for (let k = 0; k < zones; k++) {
      const food = bestAt(m.rest / (1 + span * (k + .5) / zones)), last = runs.at(-1);
      if (last?.food === food)
        last.to = k + 1;
      else
        runs.push({food, from : k, to : k + 1});
    }
    for (const {food, from, to} of runs)
      el('rect', {x : L, y : yOf(1 + span * to / zones), width : R - L, height : yOf(1 + span * from / zones) - yOf(1 + span * to / zones), class : 'aid-live-zone', 'data-food' : food}, under);
    // Their names beside them, top down, each at its band or as near as the others leave room.
    let free = top + 2;
    for (const {food, from, to} of runs.toReversed()) {
      const y = Math.max(free, (yOf(1 + span * to / zones) + yOf(1 + span * from / zones)) / 2 - 1);
      free = y + 12;
      txt(under, R + 6, y + 5, word(food === 'all' ? 'everything' : 'food.' + food), {class : 'aid-live-food-word', 'data-food' : food});
    }
    el('path', {d : `M${X(LIFE.hatch)} ${top} V${base + 5}`, class : 'aid-live-hatch'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    if (!m.muscle)
      return;
    // The muscle's cells share one life: from when they work to when they die.
    const cell = m.muscle.centers[0], phase = lifePhase(cell), from = phase.start ?? 0, until = Math.min(1, phase.end ?? 1), works = until > from;
    const high = yOf(m.pace), low = yOf(1);
    el('path', {d : works ? `M${L} ${low} H${X(from)} V${high} H${X(until)} V${low} H${R}` : `M${L} ${low} H${R}`, class : 'aid-live-course'}, live);
    const set = change => setLifePhase(studio.state.document, cell.id, change, caps.sensitivitySpan, caps.steepnessSpan);
    const grip = (x, name, move) => drag(svg, el('rect', {x : x - 5, y : (high + low) / 2 - 7, width : 10, height : 14, rx : 3}, live), p => draft(move(rOf(p.x))), name, 'grip', settle);
    grip(from > 0 ? X(from) : L - LIFE.beside, 'gutfrom', to => set({start : to < LIFE.whole ? null : Math.min(to, until - LIFE.least)}));
    grip(until < 1 ? X(until) : R + LIFE.beside + 44, 'gutuntil', to => set({end : to > 1 - LIFE.whole ? null : Math.max(to, from + LIFE.least)}));
  }
  function show(next) {
    state = next;
    model = derive();
    if (!model)
      return;
    kind.textContent = word('kind.' + model.diet);
    // The senses first: the fish's stomach follows the fullness input.
    drawSense('full');
    drawSense('ache');
    drawFish();
    drawYield();
    drawBars();
    drawReward();
    drawLife();
    tick(0);
  }
  // The gut's waves: its own, calm, always; the muscle's on top in the second half of each round,
  // stronger and faster as the muscle is. A morsel that has passed the gut leaves at the vent.
  function tick(dt) {
    if (!model || !film.way)
      return;
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    showMoment();
    showNerves(dt);
    const strong = clamp((model.pace - 1) / (DIGESTION.fastest - 1)), works = step > STEPS / 2 && strong > 0;
    const depth = works ? .25 + .75 * strong : .12, pace = works ? model.pace : 1;
    wave += dt * .00009 * pace;
    const wall = TUBE + 2 * (WALL[0] + (WALL[1] - WALL[0]) * strong), fill = play.stim.full ? between(play.stim.full, step) : 1;
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
        // What is left of it leaves at the vent; the next enters only if the stomach holds enough.
        const crumb = b.on && film.crumbs.find(c => c.t >= 1);
        b.on = (b.rank + .5) / MORSELS <= fill;
        b.e.setAttribute('opacity', b.on ? 1 : 0);
        if (crumb) {
          crumb.t = 0;
          crumb.from = film.way.end;
        }
      }
      b.u = u % 1;
      if (!b.on)
        continue;
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
