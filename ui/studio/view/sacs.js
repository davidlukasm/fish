import {clamp} from '../../units.js';
import {restLevel} from './drive.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../tuning.js';
import {PRESSURE_OF} from '../model/organs.js';
import {groupReport} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {t, tList} from '../../strings.js';
import {label} from './kit.js';
import {CATEGORY_TONE, centerTitle, tone} from './names.js';
import {organTitle} from './names.js';
import {biasScale} from './panels.js';

// The inner organs that hold something, each drawn as one vessel around its nodes: the egg and
// sperm sacs, which fill and release, and the swim bladder.
// The egg or sperm organ as one sac: cells along its wall make the gametes (growth), a stretch
// line across it marks the filling at which its pressure cells answer half (drag its handle), and
// a valve lets them out (release), open as far as the release cells rest active. Each part picks
// its center for the details below. The ovary fills with round eggs, the testis with sperm (a
// head and a wavy tail, SPERM), each in its own colours.
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
  shut : .2
});
// A sperm's head, and its tail TAIL long in two waves WAVE high (a quarter of the tail each).
const SPERM = Object.freeze({head : 2.6, tail : 12, wave : 2.5, quarters : 4});
export function pressureGraphic(state, organ, selected) {
  const S = SAC, find = key => organ.centers.find(c => c.key === key);
  const growth = find('growth'), release = find('release'), pressure = find('pressure');
  const stretch = pressure ? activationLevel(unitOfPlan(pressure.threshold)) : .5;
  const lineY = S.cy + S.ry - 2 * S.ry * stretch;
  const half = y => S.rx * Math.sqrt(Math.max(0, 1 - ((y - S.cy) / S.ry) ** 2));
  const chosen = center => center && selected?.id === center.id ? ' selected' : '';
  const part = (center, body) => center ? '<g class="aid-sac-part' + chosen(center) +
                                              '" data-select-center="' + escapeText(center.id) +
                                              '"><title>' + escapeText(centerTitle(center)) +
                                              '</title>' + body + '</g>'
                                        : '';
  // Gametes fill the sac from the bottom up to the stretch line, in rows.
  const gamete = (x, y) =>
      organ.type === 'eggs'
          ? '<circle class="aid-sac-egg" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                fixed(S.egg / S.egg_size) + '"/>'
          : '<circle class="aid-sac-sperm-head" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                SPERM.head + '"/><path class="aid-sac-sperm" d="M' + fixed(x - SPERM.head) + ' ' +
                fixed(y) + ' q' + -SPERM.tail / SPERM.quarters + ' ' + -SPERM.wave + ' ' +
                -SPERM.tail / 2 + ' 0 t' + -SPERM.tail / 2 + ' 0"/>';
  let eggs = '';
  const R = S.rows;
  for (let k = 0, y = S.cy + S.ry - S.egg * R.start; k < S.eggs && y > lineY; y -= S.egg * R.row) {
    const reach = half(y) - S.egg * R.in;
    for (let x = S.cx - reach; x <= S.cx + reach && k < S.eggs; x += S.egg * R.along, ++k)
      eggs += gamete(x, y);
  }
  const wallCells =
      growth
          ? Array
                .from({length : growth.copies},
                      (_, k) => {
                        const W = S.wall_cells,
                              a = Math.PI * (W.from + W.arc * k / Math.max(1, growth.copies - 1));
                        return '<circle class="aid-sac-cell" cx="' +
                               fixed(S.cx + Math.cos(a) * (S.rx - S.wall)) + '" cy="' +
                               fixed(S.cy - Math.sin(a) * (S.ry - S.wall)) + '" r="' +
                               S.wall_cells.cell + '"/>';
                      })
                .join('')
          : '';
  // The valve stands as open as the release cells work at rest.
  const scale = biasScale(state);
  const open = release && scale ? Math.max(0, restLevel(release, scale)) / Math.tanh(scale) : 0;
  const vx = S.cx + S.rx, valve = '<path class="aid-sac-valve" d="M' + vx + ' ' +
                                  fixed(S.cy - S.valve * (S.shut + open)) + ' L' + (vx + S.valve) +
                                  ' ' + S.cy + ' L' + vx + ' ' +
                                  fixed(S.cy + S.valve * (S.shut + open)) + '"/>';
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '"' + (pressure ? ' data-stretch="' + escapeText(pressure.id) + '"' : '') +
         ' role="img">' +
         '<ellipse class="aid-sac-body" cx="' + S.cx + '" cy="' + S.cy + '" rx="' + S.rx +
         '" ry="' + S.ry + '"/>' + eggs +
         part(growth, wallCells + '<text x="' + (S.cx - S.rx) + '" y="' + (S.label) + '">' +
                          label('centers.growth') + '</text>') +
         part(release, valve + '<text x="' + (vx + S.valve) + '" y="' +
                           (S.cy - S.valve - S.label / 2) + '" text-anchor="end">' +
                           label('centers.release') + '</text>') +
         part(pressure, '<line class="aid-sac-line" x1="' + fixed(S.cx - half(lineY)) + '" y1="' +
                            fixed(lineY) + '" x2="' + fixed(S.cx + half(lineY)) + '" y2="' +
                            fixed(lineY) + '"/><text x="' + fixed(S.cx) + '" y="' +
                            fixed(lineY - S.label / 2) + '" text-anchor="middle">' +
                            label('inspector.stretch') + '</text>') +
         (pressure
              ? '<circle class="aid-graphic-handle" data-stretch-handle cx="' +
                    fixed(S.cx + half(lineY)) + '" cy="' + fixed(lineY) + '" r="' + S.handle + '"/>'
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
