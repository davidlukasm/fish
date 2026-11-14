import {clamp} from '../../units.js';
import {kindLimit, nodeLimit, PRESSURE_OF} from '../model/organs.js';
import {ATELIER_LIMITS, BODY_UNIT, DIGESTION, MOTOR_KIND} from '../../schema.js';
import {gutLength} from '../model/document.js';
import {organCommand} from './preview.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {percent, t, tList} from '../../strings.js';
import {label, SLOT_IN} from './kit.js';
import {senseSensitivity} from './sense_marks.js';
import {boundedRow, sensePicture} from './sense_curves.js';
import {centerTitle} from './names.js';
import {commandLine} from './command_line.js';

export function gonadStore(state, organ) {
  const G = state.capabilities?.gonads, base = G?.[organ.type];
  if (!base)
    return null;
  const bodyScale = !state.stale ? state.report?.adultScale ?? 1 : 1;
  const length = gutLength(state.document) ?? BODY_UNIT.trait_middle;
  const size = DIGESTION.shortest * (DIGESTION.longest / DIGESTION.shortest) ** clamp(length, 0, 1);
  const belly = organ.type === 'eggs' ? 1 - DIGESTION.belly * (size - DIGESTION.shortest) /
                                                (DIGESTION.longest - DIGESTION.shortest)
                                      : 1;
  const own = {
    ...base,
    most : base.most * bodyScale * belly,
    perCell : base.perCell * bodyScale * belly,
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
      html :
          '<path class="aid-sac-fill idle" d="M' + S.left + ' ' + S.base + ' H' + S.right + '"/>',
      knee : {x : S.right, y : S.base}
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
export function gonadGraphic(state, organ, selected, dragged = null) {
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
  const least = store.minimum && store.minimum < topOf(store)
                    ? '<path class="aid-sac-least" d="M' + S.left + ' ' +
                          fixed(levelY(store, store.minimum)) + ' H' + S.right + '"/>'
                    : '';
  const ceiling = store.own.most < store.scale ? '<path class="aid-sac-ceiling" d="M' + S.stack[0] +
                                                     ' ' + S.top + ' H' + S.right + '"/>'
                                               : '';
  // The chosen working cells' gate, else the releasing ones', sits in the command line below.
  const motor = [ growth, release ].find(c => c && selected?.key === c.key) ?? release ?? growth;
  // What the cells do, written where it shows: how long the store takes to fill, what one release
  // gives and whether it waits for a command. What the stretch cells report has its own picture.
  // The filling time ends at the right, where its words always fit.
  const say = (content, x, y, anchor = 'start') => '<text class="aid-handle-word" x="' + fixed(x) +
                                                   '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                   '">' + escapeText(content) + '</text>';
  const [fillWord, productWord] = [ facts.growth[1], facts.release[1] ];
  const words = say(fillWord, S.right, curve.knee.y - S.gap, 'end') +
                say(productWord, S.right, S.base + S.below, 'end') +
                (store.releaseEnabled ? '' : say(facts.release[0], S.right, roomY - S.gap, 'end')) +
                '<text class="aid-handle-word" transform="translate(' + S.title + ' ' +
                fixed((S.top + S.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
                escapeText(label('inspector.gonad.store')) + '</text>' +
                say(label('inspector.gonad.time'), S.left, S.base + S.below);
  return '<div data-sense-block="' + escapeText(organ.id) + '"><svg viewBox="0 0 ' + S.width + ' ' +
         S.height + '" class="aid-gonad-graphic aid-sac ' + organ.type + '" data-sac="' +
         escapeText(organ.id) + '"' +
         ' role="img">' +
         '<path class="aid-sac-axis" d="M' + S.left + ' ' + S.top + ' V' + S.base + ' H' + S.right +
         '"/>' + ceiling + least + part(growth, chambers(store, 0, kept, 'growth', organ.type)) +
         part(release, chambers(store, kept, held, 'release', organ.type) + curve.html) +
         '<path class="aid-sac-room" d="M' + S.stack[0] + ' ' + fixed(roomY) + ' H' + S.right +
         '"/>' +
         (growth ? '<circle class="aid-graphic-handle" data-sac-handle="cells" cx="' +
                       fixed((S.stack[0] + S.stack[1]) / 2) + '" cy="' + fixed(roomY) + '" r="' +
                       S.handle + '"><title>' + label('inspector.cellsHandle') + '</title></circle>'
                 : '') +
         words + '</svg>' +
         commandLine(state, organ, motor,
                     organ.type === 'eggs' ? MOTOR_KIND.eggs : MOTOR_KIND.sperm, motor?.key, true) +
         (pressure ? pressureCurve(state, organ, pressure, dragged) : '') + '</div>';
}
// What the pressure cells of an organ with a live inspector report: their picture alone, below
// the inspector. STOPGAP: the old sense picture, until the live inspector draws the cells itself.
export function gonadSense(state, organ, dragged = null) {
  const pressure = organ.centers.find(c => c.key === 'pressure');
  return '<div data-sense-block="' + escapeText(organ.id) + '">' +
         (pressure ? pressureCurve(state, organ, pressure, dragged) : '') + '</div>';
}
// The cells the handle on the store's room sets, from the pointer's height.
export function sacPatch(state, organ, fy) {
  const store = gonadStore(state, organ);
  if (!store)
    return null;
  const energy = energyAt(store, fy * STORE.height);
  const cells = Math.max(1, Math.round(energy / store.own.perCell));
  return {
    nodes : 2 * clamp(Math.round((cells - (store.motors - store.growth)) / 2), 1,
                      Math.floor(kindLimit(organ, null) / 2))
  };
}
// What each part does, for its tooltip: how many cells fill the store and how fast, when it
// releases and what.
function gonadFacts(state, organ, store) {
  const words = key => t('studio.inspector.gonad.' + key, {
    n : Number.isFinite(store.steps) ? store.steps : 0,
    cells : store.growth,
    most : store.own.most,
    energy : Math.round(store.spawn),
    least : Math.round(store.minimum ?? 0),
    duration : store.incubation ?? 0
  });
  const product = organ.type !== 'eggs'         ? words('sperm')
                  : !store.minimum              ? words('egg')
                  : store.spawn < store.minimum ? words('food')
                                                : words('developmentEnergy');
  return {
    growth : [
      words('cells'), Number.isFinite(store.steps) ? words('fullIn') : words('driven'),
      store.motors * store.own.perCell > store.own.most ? words('ceiling') : ''
    ].filter(Boolean),
    release : [ words(store.releaseEnabled ? 'releaseOn' : 'trigger'), product ]
  };
}
// What a sac's pressure cells report, below its pictures: over how full the sac is, half at their
// threshold (bounded; pressure is no sense that gets used to what it feels, brain_interface.hh).
function pressureCurve(state, organ, pressure, held) {
  const sensitive = held ?? senseSensitivity(state, pressure);
  if (sensitive === null)
    return '';
  const words = (key, values) => t('studio.pressureSense.' + key, values);
  return sensePicture(pressure, words('title.' + organ.type), [ boundedRow(sensitive, {
                        report : words('report'),
                        from : words('empty'),
                        to : words('full'),
                        half : words('half', {p : percent(1 - sensitive)}),
                        handle : words('handle')
                      }) ]);
}
