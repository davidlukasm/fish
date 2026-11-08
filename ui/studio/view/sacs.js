import {clamp} from '../../units.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../tuning.js';
import {kindLimit, nodeLimit, PRESSURE_OF} from '../model/organs.js';
import {ATELIER_LIMITS} from '../../schema.js';
import {centerIndex, groupReport} from '../model/document.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {percent, t, tList} from '../../strings.js';
import {label, SLOT_IN} from './kit.js';
import {CATEGORY_TONE, centerTitle, tone} from './names.js';
import {organTitle} from './names.js';

export function gonadStore(state, organ) {
  const G = state.capabilities?.gonads, own = G?.[organ.type];
  if (!own)
    return null;
  const cells = kind => organ.centers.filter(c => c.key === kind);
  const drive = kind => cells(kind).reduce(
      (sum, c) =>
          sum +
          c.copies / ATELIER_LIMITS.max_copies *
              Math.max(0, state.runtime?.groups[centerIndex(state.document, c.id)]?.command ?? 0),
      0);
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
    steps : perStep > 0 ? Math.ceil(spawn / perStep) : Infinity,
    self : drive('release') >= G.release,
    spawn,
    minimum : Number.isFinite(minimum) && minimum > 0 ? minimum : null
  };
}
// The organ over time: the store fills from its cells, empties at each release and fills again,
// or waits full for a trigger. Energy runs on a square-root scale so one cell and the full organ
// both read.
const STORE = Object.freeze({
  width : 300,
  height : 150,
  stack : [ 12, 30 ],
  left : 42,
  right : 284,
  top : 18,
  base : 112,
  cycles : 2.4,
  samples : 18,
  egg : 15,
  least : 4,
  trigger : 14,
  gap : 6,
  sperm : 3,
  tick : 5,
  handle : 7
});
const SPERM = Object.freeze({head : 2.6, tail : 12, wave : 2.5, quarters : 4, spread : 5});
const topOf = store => Math.min(store.own.most, store.scale);
const levelY = (store, energy) =>
    STORE.base - (STORE.base - STORE.top) * Math.sqrt(clamp(energy / topOf(store)));
const energyAt = (store, y) =>
    topOf(store) * clamp((STORE.base - y) / (STORE.base - STORE.top)) ** 2;
const sperm = (x, y) => '<circle class="aid-sac-sperm-head" cx="' + fixed(x) + '" cy="' + fixed(y) +
                        '" r="' + SPERM.head + '"/><path class="aid-sac-sperm" d="M' +
                        fixed(x - SPERM.head) + ' ' + fixed(y) + ' q' +
                        -SPERM.tail / SPERM.quarters + ' ' + -SPERM.wave + ' ' + -SPERM.tail / 2 +
                        ' 0 t' + -SPERM.tail / 2 + ' 0"/>';
const egg = (x, y, r, kind) => '<circle class="aid-sac-' + kind + '" cx="' + fixed(x) + '" cy="' +
                               fixed(y) + '" r="' + fixed(r) + '"/>';
// Each cell's chamber shows what it makes, an egg or a sperm, where it is tall enough to hold it.
const CHAMBER = Object.freeze({mark : 7, inset : 2});
function chambers(store, from, to, kind, type) {
  const [x0, x1] = STORE.stack, middle = (x0 + x1) / 2;
  let html = '';
  for (let k = from; k < to; ++k) {
    const low = levelY(store, k * store.own.perCell),
          high = levelY(store, (k + 1) * store.own.perCell), y = (low + high) / 2;
    html += '<rect class="aid-sac-chamber ' + kind + '" x="' + x0 + '" y="' + fixed(high) +
            '" width="' + (x1 - x0) + '" height="' + fixed(low - high) + '"/>';
    if (low - high >= CHAMBER.mark)
      html += type === 'eggs'
                  ? egg(middle, y, Math.min(x1 - x0, low - high) / 2 - CHAMBER.inset, 'egg')
                  : sperm(middle + SPERM.tail / 2, y);
  }
  return html;
}
function product(store, type, x, y) {
  const S = STORE;
  if (type !== 'eggs') {
    const count = Math.max(1, Math.min(S.sperm, store.motors));
    return Array
        .from({length : count},
              (_, k) => sperm(x + SPERM.tail, y + (k - (count - 1) / 2) * SPERM.spread))
        .join('');
  }
  const r = Math.max(S.least, S.egg * Math.sqrt(clamp(store.spawn / topOf(store))));
  const short = store.minimum && store.spawn < store.minimum;
  return egg(x + r, y, r, short ? 'egg food' : 'egg');
}
function fillCurve(store, type) {
  const S = STORE, span = S.right - S.left, below = S.base + S.egg + S.gap;
  if (!Number.isFinite(store.steps))
    return {
      html : '<path class="aid-sac-fill idle" d="M' + S.left + ' ' + S.base + ' H' + S.right + '"/>'
    };
  const ramp = (x0, energy, width) =>
      Array
          .from({length : S.samples + 1}, (_, k) => fixed(x0 + width * k / S.samples) + ' ' +
                                                    fixed(levelY(store, energy * k / S.samples)))
          .join(' L');
  const cycle = span / S.cycles;
  if (!store.self) {
    const fills = cycle * store.room / Math.max(store.spawn, Number.EPSILON);
    const reach = Math.min(span, fills), x = S.left + reach;
    return {
      html : '<path class="aid-sac-fill" d="M' + ramp(S.left, store.room * reach / fills, reach) +
                 ' H' + S.right + '"/>' +
                 placedGlyph(SLOT_IN, S.trigger,
                             {x : S.right - 2 * S.egg - S.gap - S.trigger / 2, y : below},
                             {line : true}) +
                 product(store, type, S.right - 2 * S.egg, below),
      knee : {x, y : levelY(store, store.room)}
    };
  }
  let d = '', drops = '', x0 = S.left;
  for (; x0 + cycle <= S.right; x0 += cycle) {
    d += (d ? ' L' : 'M') + ramp(x0, store.spawn, cycle) + ' L' + fixed(x0 + cycle) + ' ' + S.base;
    drops += product(store, type, x0 + cycle, below);
  }
  if (S.right > x0)
    d += ' L' + ramp(x0, store.spawn * (S.right - x0) / cycle, S.right - x0);
  return {
    html : '<path class="aid-sac-fill" d="' + d + '"/>' + drops,
    knee : {x : S.left + cycle, y : levelY(store, store.spawn)}
  };
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
  const held = Math.round(store.room / store.own.perCell), kept = Math.min(store.growth, held);
  const roomY = levelY(store, store.room), curve = fillCurve(store, organ.type);
  const stretch = pressure ? activationLevel(unitOfPlan(pressure.threshold)) : null;
  const stretchY = stretch === null ? 0 : levelY(store, stretch * store.room);
  const least = store.minimum && store.minimum < topOf(store)
                    ? '<path class="aid-sac-least" d="M' + S.left + ' ' +
                          fixed(levelY(store, store.minimum)) + ' H' + S.right + '"/>'
                    : '';
  const ceiling = store.own.most < store.scale ? '<path class="aid-sac-ceiling" d="M' + S.stack[0] +
                                                     ' ' + S.top + ' H' + S.right + '"/>'
                                               : '';
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '" data-sac="' + escapeText(organ.id) + '" role="img">' +
         '<path class="aid-sac-axis" d="M' + S.left + ' ' + S.top + ' V' + S.base + ' H' + S.right +
         '"/>' + ceiling + least + part(growth, chambers(store, 0, kept, 'growth', organ.type)) +
         part(release, chambers(store, kept, held, 'release', organ.type) + curve.html) +
         '<path class="aid-sac-room" d="M' + S.stack[0] + ' ' + fixed(roomY) + ' H' + S.right +
         '"/>' +
         (curve.knee
              ? '<text x="' + fixed(Math.min(curve.knee.x, S.right)) + '" y="' +
                    fixed(curve.knee.y - S.tick) + '" text-anchor="' +
                    (curve.knee.x > (S.left + S.right) / 2 ? 'end' : 'start') + '">' +
                    escapeText(t('studio.inspector.gonad.fullIn', {n : store.steps})) + '</text>'
              : '') +
         part(pressure, '<path class="aid-sac-line" d="M' + S.left + ' ' + fixed(stretchY) + ' H' +
                            S.right + '"/>') +
         (pressure ? '<circle class="aid-graphic-handle" data-sac-handle="stretch" cx="' + S.left +
                         '" cy="' + fixed(stretchY) + '" r="' + S.handle + '"><title>' +
                         label('inspector.stretch') + '</title></circle>'
                   : '') +
         (growth ? '<circle class="aid-graphic-handle" data-sac-handle="cells" cx="' +
                       fixed((S.stack[0] + S.stack[1]) / 2) + '" cy="' + fixed(roomY) + '" r="' +
                       S.handle + '"><title>' + label('inspector.cellsHandle') + '</title></circle>'
                 : '') +
         '</svg>';
}
export function sacPatch(state, organ, handle, fy) {
  const store = gonadStore(state, organ);
  if (!store)
    return null;
  const energy = energyAt(store, fy * STORE.height);
  if (handle === 'stretch')
    return {
      threshold :
          planOfUnit(activationQuality(clamp(energy / Math.max(Number.EPSILON, store.room))))
    };
  const cells = Math.max(1, Math.round(energy / store.own.perCell));
  return {nodes : clamp(cells - (store.motors - store.growth), 1, kindLimit(organ, null))};
}
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
  return '<p class="aid-hint">' + label('development.gonadConditions') +
         '</p><ul class="aid-gonad-facts">' +
         row(find('growth'), words('cells'), Number.isFinite(store.steps) ? '' : words('driven'),
             store.motors * store.own.perCell > store.own.most ? words('ceiling') : '') +
         row(find('release'), words(store.self ? 'self' : 'trigger'), product) +
         row(pressure,
             pressure && t('studio.inspector.gonad.stretch',
                           {share : percent(activationLevel(unitOfPlan(pressure.threshold)))})) +
         '</ul>';
}
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
