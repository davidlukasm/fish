import {clamp} from '../../units.js';
import {restLevel} from './drive.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../tuning.js';
import {kindLimit, nodeLimit, PRESSURE_OF} from '../model/organs.js';
import {ATELIER_LIMITS} from '../../schema.js';
import {groupReport} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {percent, t, tList} from '../../strings.js';
import {label} from './kit.js';
import {CATEGORY_TONE, centerTitle, tone} from './names.js';
import {organTitle} from './names.js';
import {biasScale} from './panels.js';

// The inner organs that hold something: the egg and sperm sacs, which fill and release, and the
// swim bladder.
// A gonad as the engine reckons it (the capabilities' gonads): each of its motor cells gives it
// room for perCell, up to most; its growth cells move energy in as fast as their drive A at rest
// lets them (A / (1 + A) of fill a step, A the sum of their strengths times their rest activity);
// its release cells let it out on their own once their drive at rest reaches release, else only
// when a trigger drives them. An ovary lays at spawnShare of its room, a testis from spawnLeast
// on. An egg needs the build's eggMinimum to hatch; with less it is food.
export function gonadStore(state, organ) {
  const G = state.capabilities?.gonads, own = G?.[organ.type];
  if (!own)
    return null;
  const scale = biasScale(state), cells = kind => organ.centers.filter(c => c.key === kind);
  const drive = kind => cells(kind).reduce(
      (sum, c) => sum + c.copies / ATELIER_LIMITS.max_copies * Math.max(0, restLevel(c, scale)), 0);
  const growth = cells('growth').length, motors = organ.centers.filter(c => c.role === 'motor');
  const room = Math.min(own.most, own.perCell * motors.length), fill = drive('growth');
  const transfer = fill / (1 + fill), perStep = transfer * own.fill;
  const spawn = organ.type === 'eggs' ? own.spawnShare * room : room;
  const minimum = !state.stale && organ.type === 'eggs' ? state.report?.eggMinimum : undefined;
  return {
    own,
    growth,
    motors : motors.length,
    room,
    scale : own.perCell * nodeLimit(organ, null),
    transfer,
    steps : perStep > 0 ? Math.ceil(spawn / perStep) : Infinity,
    opening : Math.min(1, drive('release') / G.release),
    self : drive('release') >= G.release,
    spawn,
    minimum : Number.isFinite(minimum) && minimum > 0 ? minimum : null
  };
}
// The gonad drawn as a vessel along an axis of energy from LEFT to RIGHT (the most its nodes could
// hold), MIDDLE high, HALF thick, ROUND at its ends; a chamber for each motor cell, the release
// cells' last before the valve. An arrow INFLOW long brings the energy in, as wide as the growth
// cells fill (FLOW: least and span); a valve VALVE long lets it out, open as far as the release
// cells drive it at rest (at least SHUT). What one spawning gives stands after the valve, GAP
// apart: an egg as big as its yolk (EGG: the largest radius, at the axis' end), the egg it needs
// to hatch dashed around it, or sperm (as many as the chambers). The stretch line marks where the
// pressure cells answer half. Numbers stand on the axis at AXIS, TICK long. The arrow's head is
// HEAD long and wide beside its shaft.
const STORE = Object.freeze({
  width : 300,
  height : 126,
  left : 36,
  right : 234,
  middle : 52,
  half : 26,
  round : 9,
  inflow : 30,
  flow : [ 1.5, 10 ],
  head : 7,
  valve : 14,
  shut : .2,
  gap : 6,
  egg : 22,
  gamete : 4,
  axis : 100,
  tick : 5,
  label : 13,
  handle : 7
});
// A sperm's head, and its tail TAIL long in two waves WAVE high (a quarter of the tail each).
const SPERM = Object.freeze({head : 2.6, tail : 12, wave : 2.5, quarters : 4});
const at = (store, energy) =>
    STORE.left + (STORE.right - STORE.left) * Math.min(1, energy / store.scale);
const sperm = (x, y) => '<circle class="aid-sac-sperm-head" cx="' + fixed(x) + '" cy="' + fixed(y) +
                        '" r="' + SPERM.head + '"/><path class="aid-sac-sperm" d="M' +
                        fixed(x - SPERM.head) + ' ' + fixed(y) + ' q' +
                        -SPERM.tail / SPERM.quarters + ' ' + -SPERM.wave + ' ' + -SPERM.tail / 2 +
                        ' 0 t' + -SPERM.tail / 2 + ' 0"/>';
const egg = (x, y, r, kind) => '<circle class="aid-sac-' + kind + '" cx="' + fixed(x) + '" cy="' +
                               fixed(y) + '" r="' + fixed(r) + '"/>';
// The chambers from the k-th cell on to the end, each holding a gamete or two.
function chambers(store, type, from, to, kind) {
  const S = STORE, width = at(store, store.own.perCell) - S.left;
  let html = '';
  for (let k = from; k < to; ++k) {
    const x = S.left + k * width, middle = x + width / 2;
    html += '<rect class="aid-sac-chamber ' + kind + '" x="' + fixed(x) + '" y="' +
            (S.middle - S.half) + '" width="' + fixed(width) + '" height="' + 2 * S.half + '"/>' +
            (type === 'eggs' ? egg(middle, S.middle - S.half / 2, S.gamete, 'egg') +
                                   egg(middle, S.middle + S.half / 2, S.gamete, 'egg')
                             : sperm(middle + SPERM.tail / 2, S.middle));
  }
  return html;
}
// What one spawning gives, after the valve at x.
function product(store, type, x) {
  const S = STORE, radius = energy => S.egg * Math.sqrt(Math.min(1, energy / store.scale));
  if (type !== 'eggs')
    return Array
        .from({length : Math.min(store.motors, store.room / store.own.perCell)},
              (_, k, all) => sperm(x + S.gap + SPERM.tail + SPERM.head,
                                   S.middle + (k - (all.length - 1) / 2) * SPERM.head * 2))
        .join('');
  const r = radius(store.spawn), cx = x + S.gap + S.egg;
  const short = store.minimum && store.spawn < store.minimum;
  return egg(cx, S.middle, r, short ? 'egg food' : 'egg') +
         (store.minimum ? '<circle class="aid-sac-least" cx="' + fixed(cx) + '" cy="' + S.middle +
                              '" r="' + fixed(radius(store.minimum)) + '"/>'
                        : '');
}
// The axis' numbers: none, the room, the ceiling where it stops the room and an egg's minimum.
function axis(store) {
  const S = STORE, mark = (energy, kind) => {
    const x = fixed(at(store, energy));
    return '<path class="aid-sac-tick ' + kind + '" d="M' + x + ' ' + S.axis + ' v' + S.tick +
           '"/><text class="' + kind + '" x="' + x + '" y="' + (S.axis + S.tick + S.label) +
           '" text-anchor="middle">' + Math.round(energy) + '</text>';
  };
  return '<path class="aid-sac-axis" d="M' + S.left + ' ' + S.axis + ' H' + S.right + '"/>' +
         mark(0, '') + mark(store.room, 'room') +
         (store.own.most < store.scale ? mark(store.own.most, 'ceiling') : '') +
         (store.minimum ? mark(store.minimum, 'least') : '');
}
export function gonadGraphic(state, organ, selected) {
  const S = STORE, store = gonadStore(state, organ);
  if (!store)
    return '';
  const find = key => organ.centers.find(c => c.key === key);
  const growth = find('growth'), release = find('release'), pressure = find('pressure');
  const chosen = center => center && selected?.key === center.key ? ' selected' : '';
  const part = (center, body) => center ? '<g class="aid-sac-part' + chosen(center) +
                                              '" data-select-center="' + escapeText(center.id) +
                                              '"><title>' + escapeText(centerTitle(center)) +
                                              '</title>' + body + '</g>'
                                        : '';
  const end = at(store, store.room), held = Math.round(store.room / store.own.perCell);
  const kept = Math.min(store.growth, held);
  const shaft = S.flow[0] + S.flow[1] * store.transfer, tip = S.left - S.tick / 2;
  const inflow = '<path class="aid-sac-inflow' + (store.transfer ? '' : ' idle') + '" d="M' +
                 (S.left - S.inflow) + ' ' + S.middle + ' H' + fixed(tip - S.head) +
                 '" style="stroke-width:' + fixed(shaft) + '"/><path class="aid-sac-head" d="M' +
                 fixed(tip - S.head) + ' ' + fixed(S.middle - shaft / 2 - S.head) + ' L' +
                 fixed(tip) + ' ' + S.middle + ' L' + fixed(tip - S.head) + ' ' +
                 fixed(S.middle + shaft / 2 + S.head) + 'Z"/>';
  const open = Math.max(S.shut, store.opening);
  const valve = '<path class="aid-sac-valve' + (store.self ? ' open' : '') + '" d="M' + fixed(end) +
                ' ' + fixed(S.middle - S.half * open) + ' L' + fixed(end + S.valve) + ' ' +
                S.middle + ' L' + fixed(end) + ' ' + fixed(S.middle + S.half * open) + '"/>';
  const stretch = pressure ? activationLevel(unitOfPlan(pressure.threshold)) : null;
  const lineX = stretch === null ? 0 : S.left + (end - S.left) * stretch;
  const cellsX = fixed(at(store, store.motors * store.own.perCell));
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '" data-sac="' + escapeText(organ.id) + '" role="img">' +
         '<rect class="aid-sac-body" x="' + S.left + '" y="' + (S.middle - S.half) + '" width="' +
         fixed(end - S.left) + '" height="' + 2 * S.half + '" rx="' + S.round + '"/>' +
         part(growth, inflow + chambers(store, organ.type, 0, kept, 'growth')) +
         part(release, chambers(store, organ.type, kept, held, 'release') + valve) +
         product(store, organ.type, end + S.valve) + axis(store) +
         part(pressure, '<path class="aid-sac-line" d="M' + fixed(lineX) + ' ' +
                            (S.middle - S.half - S.tick) + ' V' + (S.middle + S.half + S.tick) +
                            '"/>') +
         (pressure ? '<circle class="aid-graphic-handle" data-sac-handle="stretch" cx="' +
                         fixed(lineX) + '" cy="' + (S.middle + S.half + S.tick) + '" r="' +
                         S.handle + '"><title>' + label('inspector.stretch') + '</title></circle>'
                   : '') +
         (growth ? '<circle class="aid-graphic-handle" data-sac-handle="cells" cx="' + cellsX +
                       '" cy="' + (S.middle - S.half) + '" r="' + S.handle + '"><title>' +
                       label('inspector.cellsHandle') + '</title></circle>'
                 : '') +
         '</svg>';
}
// A handle on the gonad graphic at (fx, fy), fractions of it: its growth cells as many as fill the
// vessel to there, or the stretch line there along its room.
export function sacPatch(state, organ, handle, fx) {
  const store = gonadStore(state, organ);
  if (!store)
    return null;
  const x = fx * STORE.width;
  if (handle === 'stretch') {
    const level = clamp((x - STORE.left) / Math.max(1, at(store, store.room) - STORE.left));
    return {threshold : planOfUnit(activationQuality(level))};
  }
  const cells = Math.round((x - STORE.left) / (at(store, store.own.perCell) - STORE.left));
  return {nodes : clamp(cells - (store.motors - store.growth), 1, kindLimit(organ, null))};
}
// What the gonad's settings do, each fact on the part it belongs to: the growth cells fill it in
// so many steps (or only when driven), more of them than its ceiling hold no more; the release
// lets it out on its own or on a trigger; one spawning gives an egg that hatches or is food, or
// so much sperm.
export function gonadFacts(state, organ) {
  const store = gonadStore(state, organ);
  if (!store)
    return '';
  const words = key => t('studio.inspector.gonad.' + key, {
    n : Number.isFinite(store.steps) ? store.steps : 0,
    cells : store.growth,
    most : store.own.most,
    energy : Math.round(store.spawn),
    least : Math.round(store.minimum ?? 0)
  });
  const find = key => organ.centers.find(c => c.key === key), pressure = find('pressure');
  const row = (center, ...facts) =>
      center ? '<li data-select-center="' + escapeText(center.id) + '"><b>' +
                   escapeText(centerTitle(center)) + '</b><span>' +
                   escapeText(facts.filter(Boolean).join(' · ')) + '</span></li>'
             : '';
  const product = organ.type !== 'eggs'         ? words('sperm')
                  : !store.minimum              ? words('egg')
                  : store.spawn < store.minimum ? words('food')
                                                : words('hatches');
  return '<ul class="aid-gonad-facts">' +
         row(find('growth'), words('cells'),
             words(Number.isFinite(store.steps) ? 'fullIn' : 'driven'),
             store.motors * store.own.perCell > store.own.most ? words('ceiling') : '') +
         row(find('release'), words(store.self ? 'self' : 'trigger'), product) +
         row(pressure,
             pressure && t('studio.inspector.gonad.stretch',
                           {share : percent(activationLevel(unitOfPlan(pressure.threshold)))})) +
         '</ul>';
}
// What an organ's pressure cells measure as the engine bound them; a warning where they measure
// another organ than their own.
export function pressureNote(state, organ) {
  const own = PRESSURE_OF[organ.type], cell = organ.centers.find(c => c.key === own?.key);
  const measured = cell ? groupReport(state.document, state.anatomy, 'pressure', cell.id) : null;
  if (!own || !(measured >= 0))
    return '';
  const text = tList('studio.inspector.measures')[measured] ?? '';
  return measured === own.source
             ? '<p class="aid-hint">' +
                   escapeText(t('units.joined', {a : label('inspector.pressureCells'), b : text})) +
                   '</p>'
             : '<p class="aid-hint aid-warning">' +
                   escapeText(t('studio.inspector.measuresWrong', {measures : text})) + '</p>';
}
// The swim bladder as an ellipse around its nodes, in rows of COLUMNS, COLUMN apart from LEFT,
// ROW apart, as ellipses NODE wide; the bladder at least LEAST high and PAD more than its rows,
// INSET in. A node's number stands BASELINE below its middle.
const BLADDER = Object.freeze({
  width : 286,
  cx : 142,
  rx : 125,
  columns : 3,
  left : 59,
  column : 83,
  row : 47,
  least : 130,
  pad : 25,
  inset : 13,
  node : [ 27, 19 ],
  baseline : 5
});
export function bladderGraphic(organ, selected) {
  // Each neural group remains selectable as more groups are added to the same organ.
  const B = BLADDER, rows = Math.ceil(organ.centers.length / B.columns);
  const height = Math.max(B.least, rows * B.row + B.pad);
  const outline = '<ellipse class="aid-paired-organ" cx="' + B.cx + '" cy="' + fixed(height / 2) +
                  '" rx="' + B.rx + '" ry="' + fixed(height / 2 - B.inset) +
                  '" style="--tint:' + tone(organ.type) + '"/>';
  const nodes =
      organ.centers
          .map((center, index) => {
            const x = B.left + (index % B.columns) * B.column;
            const y = height / 2 + (Math.floor(index / B.columns) - (rows - 1) / 2) * B.row;
            const active = selected?.id === center.id ? ' selected' : '';
            const colour = center.role === 'sensor' ? CATEGORY_TONE.senses : CATEGORY_TONE.internal;
            return '<g class="aid-gonad-center' + active + '" data-select-center="' +
                   escapeText(center.id) + '"><title>' + escapeText(centerTitle(center)) +
                   '</title><ellipse class="aid-paired-node" cx="' + fixed(x) + '" cy="' +
                   fixed(y) + '" rx="' + B.node[0] + '" ry="' + B.node[1] +
                   '" style="--tint:' + colour + '"/><text x="' + fixed(x) + '" y="' +
                   fixed(y + B.baseline) + '" text-anchor="middle">' + (index + 1) + '</text></g>';
          })
          .join('');
  return '<svg class="aid-gonad-graphic" viewBox="0 0 ' + B.width + ' ' + height +
         '" role="img" aria-label="' + escapeText(organTitle(organ)) + '">' + outline + nodes +
         '</svg>';
}
