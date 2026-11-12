import {clamp} from '../../units.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../tuning.js';
import {kindLimit, kindNodes, nodeLimit, PRESSURE_OF} from '../model/organs.js';
import {ATELIER_LIMITS} from '../../schema.js';
import {groupReport} from '../model/document.js';
import {organCommand} from './preview.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {percent, t, tList} from '../../strings.js';
import {label, SLOT_IN} from './kit.js';
import {
  adaptationMarks,
  cellMarks,
  gateHandle,
  SENSE_MARK,
  senseSensitivity,
  sensitivityHandle
} from './sense_marks.js';
import {centerTitle} from './names.js';
import {organTitle} from './names.js';

export function gonadStore(state, organ) {
  const G = state.capabilities?.gonads, base = G?.[organ.type];
  if (!base)
    return null;
  const bodyScale = !state.stale ? state.report?.adultScale ?? 1 : 1;
  const own = {
    ...base,
    most : base.most * bodyScale,
    perCell : base.perCell * bodyScale,
    fill : base.fill * bodyScale
  };
  const cells = kind => organ.centers.filter(c => c.key === kind);
  const drive = kind => cells(kind).reduce(
      (sum, c) => sum + c.copies / ATELIER_LIMITS.max_copies * Math.max(0, organCommand(state, c)),
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
    releaseEnabled : drive('release') >= G.release,
    spawn,
    incubation : state.report?.eggIncubation,
    minimum : Number.isFinite(minimum) && minimum > 0 ? minimum : null
  };
}
// The organ over time: the store fills from its cells, empties at each release and fills again,
// or waits full for a command. Energy runs on a square-root scale so one cell and the full organ
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
  handle : 7,
  // The stretch cells sit along their line from its left end; their adaptation arc round it.
  cells : 9,
  clock : 14,
  // Words sit this far below a line, and the store's title this far from the left edge.
  below : 12,
  title : 6
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
  if (!store.releaseEnabled) {
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
  const facts = gonadFacts(state, organ, store);
  const part = (center, body) =>
      center ? '<g class="aid-sac-part' + chosen(center) + '" data-select-center="' +
                   escapeText(center.id) + '"><title>' +
                   escapeText([ centerTitle(center), ...(facts[center.key] ?? []) ].join(' · ')) +
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
  // The chosen working cells' gate stands at the right edge: higher, the less input they need.
  const motor = [ growth, release ].find(c => c && selected?.key === c.key);
  const gateX = (S.right + S.width) / 2;
  const gate = motor ? '<path class="aid-gate-track" d="M' + fixed(gateX) + ' ' + S.base + ' V' +
                           S.top + '"/>' +
                           gateHandle({x : gateX, y : S.base}, {x : gateX, y : S.top}, state, motor,
                                      label('inspector.motorGate'))
                     : '';
  const field = pressure ?? motor;
  // What the cells do, written where it shows: how long the store takes to fill, what one release
  // gives, whether it waits for a command, and at which fill the stretch cells report.
  const say = (content, x, y, anchor = 'start') => '<text class="aid-handle-word" x="' + fixed(x) +
                                                   '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                   '">' + escapeText(content) + '</text>';
  const [fillWord, productWord] = [ facts.growth[1], facts.release[1] ];
  const words = say(fillWord, Math.min(curve.knee.x, S.right), curve.knee.y - S.gap,
                    curve.knee.x > (S.left + S.right) / 2 ? 'end' : 'start') +
                say(productWord, S.right, S.base + S.below, 'end') +
                (store.releaseEnabled ? '' : say(facts.release[0], S.right, roomY - S.gap, 'end')) +
                (pressure ? say(facts.pressure[0], S.right, stretchY + S.below, 'end') : '') +
                '<text class="aid-handle-word" transform="translate(' + S.title + ' ' +
                fixed((S.top + S.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
                escapeText(label('inspector.gonad.store')) + '</text>' +
                say(label('inspector.gonad.time'), S.left, S.base + S.below);
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '" data-sac="' + escapeText(organ.id) + '"' +
         (field ? ' data-sense-field="' + escapeText(field.id) + '"' : '') + ' role="img">' +
         '<path class="aid-sac-axis" d="M' + S.left + ' ' + S.top + ' V' + S.base + ' H' + S.right +
         '"/>' + ceiling + least + part(growth, chambers(store, 0, kept, 'growth', organ.type)) +
         part(release, chambers(store, kept, held, 'release', organ.type) + curve.html) +
         '<path class="aid-sac-room" d="M' + S.stack[0] + ' ' + fixed(roomY) + ' H' + S.right +
         '"/>' +
         part(pressure, '<path class="aid-sac-line" d="M' + S.left + ' ' + fixed(stretchY) + ' H' +
                            S.right + '"/>') +
         (pressure ? pressureMarks(state, pressure, {x : S.left, y : stretchY}) : '') +
         (pressure ? '<circle class="aid-graphic-handle" data-sac-handle="stretch" cx="' + S.left +
                         '" cy="' + fixed(stretchY) + '" r="' + S.handle + '"><title>' +
                         label('inspector.stretch') + '</title></circle>'
                   : '') +
         (growth ? '<circle class="aid-graphic-handle" data-sac-handle="cells" cx="' +
                       fixed((S.stack[0] + S.stack[1]) / 2) + '" cy="' + fixed(roomY) + '" r="' +
                       S.handle + '"><title>' + label('inspector.cellsHandle') + '</title></circle>'
                 : '') +
         gate + words + '</svg>';
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
  return {
    nodes : 2 * clamp(Math.round((cells - (store.motors - store.growth)) / 2), 1,
                      Math.floor(kindLimit(organ, null) / 2))
  };
}
// What each part does, for its tooltip: how many cells fill the store and how fast, when it
// releases and what, and at what filling the stretch cells answer.
function gonadFacts(state, organ, store) {
  const words = key => t('studio.inspector.gonad.' + key, {
    n : Number.isFinite(store.steps) ? store.steps : 0,
    cells : store.growth,
    most : store.own.most,
    energy : Math.round(store.spawn),
    least : Math.round(store.minimum ?? 0),
    duration : store.incubation ?? 0
  });
  const pressure = organ.centers.find(c => c.key === 'pressure');
  const product = organ.type !== 'eggs'         ? words('sperm')
                  : !store.minimum              ? words('egg')
                  : store.spawn < store.minimum ? words('food')
                                                : words('developmentEnergy');
  return {
    growth : [
      words('cells'), Number.isFinite(store.steps) ? words('fullIn') : words('driven'),
      store.motors * store.own.perCell > store.own.most ? words('ceiling') : ''
    ].filter(Boolean),
    release : [ words(store.releaseEnabled ? 'releaseOn' : 'trigger'), product ],
    pressure : pressure ? [ t('studio.inspector.gonad.stretch',
                              {share : percent(activationLevel(unitOfPlan(pressure.threshold)))}) ]
                        : []
  };
}
// The stretch cells' count and adaptation, at the left end of their line.
function pressureMarks(state, pressure, at) {
  const answer = groupReport(state.document, state.anatomy, 'senses', pressure.id);
  const places = Array.from({length : ATELIER_LIMITS.max_copies},
                            (_, k) => ({x : at.x + STORE.cells * (k + 1), y : at.y}));
  return (answer?.adapt?.steps > 0 ? adaptationMarks(at, STORE.clock, Math.PI, pressure) : '') +
         cellMarks(places, pressure);
}
// The swim bladder in one picture: the gas sac, the gas glands along its floor (one per node; the
// first shows its cells, the handle at the last adds or removes glands), and the pressure cells on
// its roof with their feelers, as long as they are sensitive, and their adaptation arc. A part is
// chosen by clicking it. `held` is a dragged sensitivity.
const BLADDER = Object.freeze({
  width : 300,
  height : 150,
  cx : 150,
  cy : 72,
  rx : 116,
  ry : 40,
  gland : 13,
  glands : [ 70, 236 ],
  cell : 9,
  roof : [ 92, 212 ],
  feeler : 18,
  clock : 16,
  gate : 284
});
export function bladderGraphic(state, organ, selected, held = null) {
  const B = BLADDER, glands = kindNodes(organ), most = kindLimit(organ, state.sites);
  const pressure = organ.centers.find(c => c.key === PRESSURE_OF[organ.type]?.key);
  const floor = x => B.cy + B.ry * Math.sqrt(Math.max(0, 1 - ((x - B.cx) / B.rx) ** 2));
  const roof = x => 2 * B.cy - floor(x);
  const glandAt = k => {
    const x = B.glands[0] + (B.glands[1] - B.glands[0]) * k / Math.max(1, most - 1);
    return {x, y : floor(x) - B.gland};
  };
  const chosen = selected?.id === pressure?.id ? pressure : glands[0];
  const part = (center, body, title) =>
      '<g class="aid-sac-part' + (center === chosen ? ' selected' : '') + '" data-select-center="' +
      escapeText(center.id) + '"><title>' + escapeText(title) + '</title>' + body + '</g>';
  const glandBody = glands
                        .map((_, k) => {
                          const at = glandAt(k);
                          return '<circle class="aid-bladder-gland" cx="' + fixed(at.x) + '" cy="' +
                                 fixed(at.y) + '" r="' + B.gland + '"/>';
                        })
                        .join('');
  const first = glandAt(0);
  const glandCells = Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const a = 2 * Math.PI * k / ATELIER_LIMITS.max_copies;
    return {x : first.x + B.cell * Math.cos(a), y : first.y + B.cell * Math.sin(a)};
  });
  const nodePlaces = Array.from({length : most}, (_, k) => glandAt(k));
  const roofCells = Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const x = B.roof[0] + (B.roof[1] - B.roof[0]) * k / (ATELIER_LIMITS.max_copies - 1);
    return {x, y : roof(x) + SENSE_MARK.cell};
  });
  let marks = '';
  if (chosen === pressure && pressure) {
    const sensitive = held ?? senseSensitivity(state, pressure) ?? 0, start = roofCells[0];
    const answer = groupReport(state.document, state.anatomy, 'senses', pressure.id);
    marks =
        roofCells.slice(0, pressure.copies)
            .map(p => '<path class="aid-gut-feeler" d="M' + fixed(p.x) + ' ' + fixed(p.y) + ' v' +
                      fixed(B.feeler * sensitive) + '"/>')
            .join('') +
        (answer?.adapt?.steps > 0 ? adaptationMarks(start, B.clock, -Math.PI / 2, pressure) : '') +
        cellMarks(roofCells, pressure) +
        sensitivityHandle({x : start.x, y : start.y + SENSE_MARK.cell},
                          {x : start.x, y : start.y + SENSE_MARK.cell + B.feeler}, sensitive,
                          t('studio.muscle.gut.sensitivityHandle'));
  } else if (glands.length) {
    marks = cellMarks(glandCells, glands[0]) +
            nodeMarks(nodePlaces, glands.length,
                      t('studio.inspector.bladderGlands', {n : glands.length, most})) +
            '<path class="aid-gate-track" d="M' + B.gate + ' ' + (B.cy + B.ry) + ' V' +
            (B.cy - B.ry) + '"/>' +
            gateHandle({x : B.gate, y : B.cy + B.ry}, {x : B.gate, y : B.cy - B.ry}, state,
                       glands[0], label('inspector.motorGate'));
  }
  const pressureDots =
      pressure && chosen !== pressure
          ? roofCells.slice(0, pressure.copies)
                .map(p => '<circle class="aid-gut-cell" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
                          '" r="' + SENSE_MARK.cell + '"/>')
                .join('')
          : '';
  const own = chosen ?? glands[0];
  return '<div data-sense-block="' + escapeText(organ.id) +
         '"><svg class="aid-bladder" viewBox="0 0 ' + B.width + ' ' + B.height + '"' +
         (own ? ' data-sense-field="' + escapeText(own.id) + '" data-sense-organ="' +
                    escapeText(organ.id) + '"'
              : '') +
         ' role="img" aria-label="' + escapeText(organTitle(organ)) +
         '"><ellipse class="aid-bladder-sac" cx="' + B.cx + '" cy="' + B.cy + '" rx="' + B.rx +
         '" ry="' + B.ry + '"/>' +
         (glands.length ? part(glands[0], glandBody, centerTitle(glands[0])) : '') +
         (pressure ? part(pressure,
                          '<path class="aid-bladder-roof" d="M' + B.roof[0] + ' ' +
                              fixed(roof(B.roof[0])) + ' A' + B.rx + ' ' + B.ry + ' 0 0 1 ' +
                              B.roof[1] + ' ' + fixed(roof(B.roof[1])) + '"/>' + pressureDots,
                          centerTitle(pressure) + ' · ' + pressureText(state, organ))
                   : '') +
         marks + '</svg>' + bladderLift(state) + '</div>';
}
// What the glands' capacity does: the lift a bladder gives at each fill (movement.cc: strength ·
// capacity / (1 + capacity) · fill) against the fish's sinking. Where the lift line crosses the
// sinking line the fish hovers; below that fill it sinks, above it rises. A bladder too small never
// reaches the sinking line and the fish sinks at any fill. The capacity is the design run's.
const LIFT = Object.freeze({
  width : 300,
  height : 108,
  left : 40,
  right : 284,
  top : 12,
  base : 76,
  room : 1.6,
  title : 12,
  axis : 90,
  dot : 3.5,
  word : 4
});
function bladderLift(state) {
  const L = LIFT, physics = state.capabilities?.buoyancy, capacity = state.anatomy?.bladder;
  if (!physics || !(capacity >= 0))
    return '';
  const full = physics.strength * capacity / (1 + capacity), most = L.room * physics.sinking;
  const x = fill => L.left + (L.right - L.left) * fill,
        y = force => L.base - (L.base - L.top) * Math.min(1, force / most);
  const hover = full > 0 ? physics.sinking / full : Infinity;
  const word = (key, px, py, anchor = 'start', values) =>
      '<text class="aid-handle-word" x="' + fixed(px) + '" y="' + fixed(py) + '" text-anchor="' +
      anchor + '">' + escapeText(t('studio.inspector.lift.' + key, values)) + '</text>';
  const sink = y(physics.sinking);
  const marks = hover <= 1
                    ? '<line class="aid-use-marker" x1="' + fixed(x(hover)) + '" y1="' + L.top +
                          '" x2="' + fixed(x(hover)) + '" y2="' + L.base + '"/><circle ' +
                          'class="aid-use-dot" cx="' + fixed(x(hover)) + '" cy="' + fixed(sink) +
                          '" r="' + L.dot + '" fill="#e5f4dc"/>' +
                          word('hovers', x(hover), L.top, hover < .5 ? 'start' : 'end',
                               {n : percent(hover)}) +
                          word('sinks', L.left + L.word, sink - L.word) +
                          word('rises', L.right, sink - L.word, 'end')
                    : word('tooSmall', (L.left + L.right) / 2, L.top + L.title, 'middle');
  return '<svg class="aid-bladder-lift" viewBox="0 0 ' + L.width + ' ' + L.height +
         '" role="img" aria-label="' + escapeText(t('studio.inspector.lift.title')) + '">' +
         '<path class="aid-sense-axis" d="M' + L.left + ' ' + L.top + ' V' + L.base + ' H' +
         L.right + '"/><path class="aid-lift-sink" d="M' + L.left + ' ' + fixed(sink) + ' H' +
         L.right + '"/><path class="aid-lift-line" d="M' + L.left + ' ' + L.base + ' L' + L.right +
         ' ' + fixed(y(full)) + '"/>' + marks +
         '<text class="aid-handle-word" transform="translate(' + L.title + ' ' +
         fixed((L.top + L.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
         escapeText(t('studio.inspector.lift.title')) + '</text>' + word('empty', L.left, L.axis) +
         word('fill', (L.left + L.right) / 2, L.axis, 'middle') +
         word('full', L.right, L.axis, 'end') + '</svg>';
}
// How many glands: a dot at each place one could grow, the handle at the last one grown.
function nodeMarks(places, count, title) {
  const last = places[count - 1];
  return '<circle class="aid-graphic-handle" data-sense-mark="nodes" data-places="' +
         places.map(p => fixed(p.x) + ',' + fixed(p.y)).join(' ') + '" cx="' + fixed(last.x) +
         '" cy="' + fixed(last.y + BLADDER.gland) + '" r="' + SENSE_MARK.handle + '"><title>' +
         escapeText(title) + '</title></circle>';
}
function pressureText(state, organ) {
  const own = PRESSURE_OF[organ.type], cell = organ.centers.find(c => c.key === own?.key);
  const measured = cell ? groupReport(state.document, state.anatomy, 'pressure', cell.id) : null;
  return measured >= 0 ? tList('studio.inspector.measures')[measured] ?? '' : '';
}
