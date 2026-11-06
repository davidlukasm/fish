import {clamp} from '../../units.js';
import {restLevel} from './drive.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../tuning.js';
import {growthMost, PRESSURE_OF} from '../model/organs.js';
import {groupReport} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {t, tList} from '../../strings.js';
import {label} from './kit.js';
import {CATEGORY_TONE, centerTitle, tone} from './names.js';
import {organTitle} from './names.js';
import {biasScale} from './panels.js';

// The inner organs that hold something, each drawn as one vessel around its nodes: the egg and
// sperm sacs, which fill and release, and the swim bladder.
// The egg or sperm organ as one sac: cells along its wall make the gametes (growth), as many as
// its growth nodes (drag the last one's handle for more or fewer), a stretch line across it marks
// the filling at which its pressure cells answer half (drag its handle), and a valve lets them out
// (release), open as far as the release cells rest active. Each part picks its center for the
// details below. The ovary fills with round eggs, the testis with sperm (a head and a wavy tail,
// SPERM), each in its own colours.
const SAC = Object.freeze({
  width : 300,
  height : 150,
  cx : 140,
  cy : 75,
  rx : 108,
  ry : 56,
  wall : 9,
  egg : 7,
  eggs : 26,
  valve : 18,
  handle : 7,
  label : 12,
  // Eggs are EGG / EGG_SIZE wide, rows START eggs above the bottom, ROW eggs apart, keep IN eggs
  // from the wall and stand ALONG eggs apart in a row.
  egg_size : 1.4,
  rows : {start : 2, row : 1.8, in : 1.5, along : 2.1},
  // The wall's cells spread over ARC of a half turn from FROM on, CELL wide.
  wall_cells : {from : .65, arc : .7, cell : 4},
  // The valve stands at least SHUT open.
  shut : .2,
  // Without pressure cells the stretch line stands UNMEASURED of the way up.
  unmeasured : .5
});
// A sperm's head, and its tail TAIL long in two waves WAVE high (a quarter of the tail each).
const SPERM = Object.freeze({head : 2.6, tail : 12, wave : 2.5, quarters : 4});
// The half width of the sac at height y.
const sacHalf = y => SAC.rx * Math.sqrt(Math.max(0, 1 - ((y - SAC.cy) / SAC.ry) ** 2));
// Gametes fill the sac from the bottom up to the stretch line at lineY, in rows: round eggs, or
// sperm with a head and a wavy tail.
function gametes(type, lineY) {
  const S = SAC, R = S.rows;
  const gamete = (x, y) =>
      type === 'eggs'
          ? '<circle class="aid-sac-egg" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                fixed(S.egg / S.egg_size) + '"/>'
          : '<circle class="aid-sac-sperm-head" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                SPERM.head + '"/><path class="aid-sac-sperm" d="M' + fixed(x - SPERM.head) + ' ' +
                fixed(y) + ' q' + -SPERM.tail / SPERM.quarters + ' ' + -SPERM.wave + ' ' +
                -SPERM.tail / 2 + ' 0 t' + -SPERM.tail / 2 + ' 0"/>';
  let html = '';
  for (let k = 0, y = S.cy + S.ry - S.egg * R.start; k < S.eggs && y > lineY; y -= S.egg * R.row) {
    const reach = sacHalf(y) - S.egg * R.in;
    for (let x = S.cx - reach; x <= S.cx + reach && k < S.eggs; x += S.egg * R.along, ++k)
      html += gamete(x, y);
  }
  return html;
}
// The places along the sac's wall for its growth cells, the most it may have spread over the arc;
// the cells take them from the first on.
function wallPoint(k, most) {
  const S = SAC, W = S.wall_cells, a = Math.PI * (W.from + W.arc * k / Math.max(1, most - 1));
  return {x : S.cx + Math.cos(a) * (S.rx - S.wall), y : S.cy - Math.sin(a) * (S.ry - S.wall)};
}
const wallCells = (count, most) => Array
                                       .from({length : count},
                                             (_, k) => {
                                               const p = wallPoint(k, most);
                                               return '<circle class="aid-sac-cell" cx="' +
                                                      fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
                                                      SAC.wall_cells.cell + '"/>';
                                             })
                                       .join('');
// The number of growth cells for a pointer on the sac graphic (fractions of it): the wall place
// nearest to it along the arc.
export function sacCellsPatch(organ, fx, fy) {
  const S = SAC, W = S.wall_cells, most = growthMost(organ);
  const turn = Math.atan2((S.cy - fy * S.height) / (S.ry - S.wall),
                          (fx * S.width - S.cx) / (S.rx - S.wall)) /
               Math.PI;
  const along = clamp(((turn < 0 ? turn + 2 : turn) - W.from) / W.arc);
  return {nodes : 1 + Math.round(along * (most - 1))};
}
// The valve stands as open as the release cells work at rest.
function valve(state, release) {
  const S = SAC, scale = biasScale(state), vx = S.cx + S.rx;
  const open = release && scale ? Math.max(0, restLevel(release, scale)) / Math.tanh(scale) : 0;
  return '<path class="aid-sac-valve" d="M' + vx + ' ' + fixed(S.cy - S.valve * (S.shut + open)) +
         ' L' + (vx + S.valve) + ' ' + S.cy + ' L' + vx + ' ' +
         fixed(S.cy + S.valve * (S.shut + open)) + '"/>';
}
export function pressureGraphic(state, organ, selected) {
  const S = SAC, find = key => organ.centers.find(c => c.key === key);
  const growth = find('growth'), release = find('release'), pressure = find('pressure');
  const cells = organ.centers.filter(c => c.key === 'growth').length, most = growthMost(organ);
  const last = wallPoint(cells - 1, most);
  const stretch = pressure ? activationLevel(unitOfPlan(pressure.threshold)) : S.unmeasured;
  const lineY = S.cy + S.ry - 2 * S.ry * stretch, vx = S.cx + S.rx;
  const chosen = center => center && selected?.id === center.id ? ' selected' : '';
  const part = (center, body) => center ? '<g class="aid-sac-part' + chosen(center) +
                                              '" data-select-center="' + escapeText(center.id) +
                                              '"><title>' + escapeText(centerTitle(center)) +
                                              '</title>' + body + '</g>'
                                        : '';
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '"' + (pressure ? ' data-stretch="' + escapeText(pressure.id) + '"' : '') +
         (growth ? ' data-sac-cells="' + escapeText(organ.id) + '"' : '') + ' role="img">' +
         '<ellipse class="aid-sac-body" cx="' + S.cx + '" cy="' + S.cy + '" rx="' + S.rx +
         '" ry="' + S.ry + '"/>' + gametes(organ.type, lineY) +
         part(growth, wallCells(cells, most) + '<text x="' + (S.cx - S.rx) + '" y="' + (S.label) +
                          '">' + label('centers.growth') + '</text>') +
         part(release, valve(state, release) + '<text x="' + (vx + S.valve) + '" y="' +
                           (S.cy - S.valve - S.label / 2) + '" text-anchor="end">' +
                           label('centers.release') + '</text>') +
         part(pressure, '<line class="aid-sac-line" x1="' + fixed(S.cx - sacHalf(lineY)) +
                            '" y1="' + fixed(lineY) + '" x2="' + fixed(S.cx + sacHalf(lineY)) +
                            '" y2="' + fixed(lineY) + '"/><text x="' + fixed(S.cx) + '" y="' +
                            fixed(lineY - S.label / 2) + '" text-anchor="middle">' +
                            label('inspector.stretch') + '</text>') +
         (pressure ? '<circle class="aid-graphic-handle" data-stretch-handle cx="' +
                         fixed(S.cx + sacHalf(lineY)) + '" cy="' + fixed(lineY) + '" r="' +
                         S.handle + '"/>'
                   : '') +
         (growth ? '<circle class="aid-graphic-handle" data-sac-cells-handle cx="' + fixed(last.x) +
                       '" cy="' + fixed(last.y) + '" r="' + S.handle + '"><title>' +
                       label('inspector.cellsHandle') + '</title></circle>'
                 : '') +
         '</svg>';
}
// The stretch line's filling at a pointer's height (fraction of the sac graphic).
export function stretchPatch(fy) {
  const level = clamp((SAC.cy + SAC.ry - fy * SAC.height) / (2 * SAC.ry));
  return {threshold : planOfUnit(activationQuality(level))};
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
