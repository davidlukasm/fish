// The muscle itself, drawn where it works in its organ's picture: a spindle along an axis, as long
// as it has nodes and as thick as each node is strong, its fibres white (fast) or red (lasting),
// the reserve that only joins strong commands behind a dashed partition (its handle just beyond the
// sheath, so it stays clear of the tip's handle), and at its anchor its
// cross-section as a pie of fast and lasting fibres just before it. Every handle carries the
// geometry it is dragged along, so one patch serves every picture.
import {ATELIER_LIMITS} from '../../schema.js';
import {clamp} from '../../units.js';
import {fibreHex} from '../../fibre.js';
import {isFibrous, muscleFibre} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {percent, t} from '../../strings.js';
import {handleWord} from './sense_marks.js';

const SPINDLE = Object.freeze(
    {least : .45, bulge : .75, curl : 2, piece : .35, pie : 11, gap : 3, handle : 5.5, ring : 4});
const TURN = 2 * Math.PI;
const word = (key, values) => t('studio.muscle.' + key, values);
const parse = text => text.split(',').map(Number);
function frame([ ax, ay, bx, by ]) {
  const full = Math.hypot(bx - ax, by - ay) || 1, u = {x : (bx - ax) / full, y : (by - ay) / full};
  return {
    full,
    at : (s, n) => ({x : ax + u.x * s - u.y * n, y : ay + u.y * s + u.x * n}),
    along : p => (p.x - ax) * u.x + (p.y - ay) * u.y,
    across : p => (p.y - ay) * u.x - (p.x - ax) * u.y
  };
}
const lengthShare = (organ, most) =>
    SPINDLE.least + (1 - SPINDLE.least) * (organ.centers.length - 1) / Math.max(1, most - 1);
const thickness = (organ, thin, thick) =>
    thin + (thick - thin) * ((organ.centers[0]?.copies ?? 1) - 1) / (ATELIER_LIMITS.max_copies - 1);
const xy = p => fixed(p.x) + ' ' + fixed(p.y);
const grip = (name, p, title, geometry, shown, place, wordAt = p) =>
    handleWord(wordAt, shown, place) + '<circle class="aid-graphic-handle" data-effector-handle="' +
    name + '" ' + geometry + ' cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
    SPINDLE.handle + '"><title>' + escapeText(title) + '</title></circle>';

// `spec`: the axis from the anchor to where the longest muscle ends, and its thinnest and thickest
// half width, all in the picture's own units. A muscle round a tube (`rings`) shows one ring per
// node across it instead of a spindle.
export function muscleSpindle(organ, most, {axis, thin, thick, rings = false}) {
  const S = SPINDLE, f = frame(axis), length = f.full * lengthShare(organ, most);
  const half = thickness(organ, thin, thick), count = organ.centers.length;
  const copies = organ.centers[0]?.copies ?? 1, fast = muscleFibre(organ);
  const split = organ.type === 'muscle' ? length * (1 - (organ.sprint ?? 0)) : length;
  const geometry =
      'data-axis="' + axis.map(fixed).join(',') + '" data-spindle="' + thin + ',' + thick + '"';
  const shell = 'M' + xy(f.at(0, 0)) + ' C' + xy(f.at(0, -half)) + ' ' + xy(f.at(length, -half)) +
                ' ' + xy(f.at(length, 0)) + ' C' + xy(f.at(length, half)) + ' ' +
                xy(f.at(0, half)) + ' ' + xy(f.at(0, 0)) + 'Z';
  let fibres = '';
  for (let k = 0; rings && k < count; k++) {
    const s = length * (k + .5) / count;
    fibres += '<path class="aid-gut-ring" d="M' + xy(f.at(s, -half)) + ' L' + xy(f.at(s, half)) +
              '" stroke-width="' + SPINDLE.ring + '" style="stroke:' + fibreHex(fast) + '"/>';
  }
  for (let k = 0; !rings && k < count; k++) {
    const s = length * (k + .5) / count, piece = length / count * S.piece,
          spread = Math.sin(Math.PI * (k + .5) / count) * half * S.bulge;
    for (let j = 0; j < copies; j++) {
      const n = spread * (2 * (j + .5) / copies - 1);
      fibres += '<path class="aid-tissue-fibre' + (s >= split ? ' reserve' : '') + '" d="M' +
                xy(f.at(s - piece, n)) + ' Q' + xy(f.at(s, n - S.curl)) + ' ' +
                xy(f.at(s + piece, n)) + '" stroke="' +
                fibreHex(((k * copies + j) * .618) % 1 < fast ? 1 : 0) + '"/>';
    }
  }
  const tip = word('nodes', {count, most}) + ' · ' +
              word('strength', {share : percent(copies / ATELIER_LIMITS.max_copies)});
  return '<g class="aid-muscle-spindle"><title>' + escapeText(tip) + '</title>' +
         (rings ? '' : '<path class="aid-tissue-sheath" d="' + shell + '"/>') + fibres +
         (organ.type === 'muscle'
              ? '<path class="aid-tissue-partition" d="M' + xy(f.at(split, -half)) + ' L' +
                    xy(f.at(split, half + S.handle + S.gap)) + '"/>' +
                    grip('sprint', f.at(split, half + S.handle + S.gap), word('sprintHandle'),
                         geometry, word('sprintWord'))
              : '') +
         grip('nodes', f.at(length, 0), word('nodesHandle'), geometry,
              word('nodesWord', {n : count}), 'right') +
         grip('strength', f.at(length / 2, -half * S.bulge), word('strengthHandle'), geometry,
              word('strengthWord', {share : percent(copies / ATELIER_LIMITS.max_copies)}),
              'above') +
         (isFibrous(organ) ? fibrePie(f.at(-S.pie - S.gap, 0), fast) : '') + '</g>';
}
// The cross-section at the anchor: the white sector is the share of fast fibres, from the top
// clockwise; its edge is the handle.
function fibrePie(c, fast) {
  const r = SPINDLE.pie, a = -Math.PI / 2 + TURN * clamp(fast, 0, 1 - Number.EPSILON);
  const edge = {x : c.x + r * Math.cos(a), y : c.y + r * Math.sin(a)};
  const sector = (from, to, colour) => {
    if (to - from <= 0)
      return '';
    if (to - from >= TURN - 1e-6)
      return '<circle cx="' + fixed(c.x) + '" cy="' + fixed(c.y) + '" r="' + r + '" fill="' +
             colour + '"/>';
    const p = angle => xy({x : c.x + r * Math.cos(angle), y : c.y + r * Math.sin(angle)});
    return '<path d="M' + xy(c) + ' L' + p(from) + ' A' + r + ' ' + r + ' 0 ' +
           (to - from > Math.PI ? 1 : 0) + ' 1 ' + p(to) + 'Z" fill="' + colour + '"/>';
  };
  const top = -Math.PI / 2;
  return '<g class="aid-fibre-pie"><title>' +
         escapeText(word('fibre.title', {share : percent(fast)})) + '</title>' +
         sector(top, top + TURN * fast, fibreHex(1)) +
         sector(top + TURN * fast, top + TURN, fibreHex(0)) + '<circle class="aid-fibre-rim" cx="' +
         fixed(c.x) + '" cy="' + fixed(c.y) + '" r="' + r + '"/></g>' +
         grip('fibre', edge, word('fibre.handle'),
              'data-pie="' + fixed(c.x) + ',' + fixed(c.y) + '"',
              word('fibre.word', {share : percent(fast)}), 'under', {x : c.x, y : c.y + r});
}
// The change a spindle handle makes, from the pointer `p` in the picture's units.
export function muscleTissuePatch(name, p, marks, most, organ) {
  if (name === 'fibre') {
    const [cx, cy] = parse(marks.pie);
    const turned = ((Math.atan2(p.y - cy, p.x - cx) + Math.PI / 2) % TURN + TURN) % TURN;
    return {fibre : turned / TURN};
  }
  if (!marks.axis)
    return null;
  const f = frame(parse(marks.axis)), [ thin, thick ] = parse(marks.spindle);
  if (name === 'nodes')
    return {
      nodes : 1 + Math.round(clamp((f.along(p) / f.full - SPINDLE.least) / (1 - SPINDLE.least)) *
                             (most - 1))
    };
  if (name === 'strength')
    return {
      copies :
          1 + Math.round(clamp((Math.abs(f.across(p)) / SPINDLE.bulge - thin) / (thick - thin)) *
                         (ATELIER_LIMITS.max_copies - 1))
    };
  if (name === 'sprint')
    return {sprint : 1 - clamp(f.along(p) / (f.full * lengthShare(organ, most)))};
  return null;
}
