import {allCenters, compileDocument, wireContactPairs} from '../model/document.js';
import {nerveClass} from '../model/organs.js';
import {learningTimeSteps} from '../../tuning.js';
import {clamp} from '../../units.js';
import {centerTitle, organTitle} from './names.js';
import {centerMarker} from './scene.js';
import {escapeText, fixed} from './markup.js';
import {label, VALUE_DIGITS} from './kit.js';
import {
  formatNumber,
  formatSigned,
  joinParts,
  linkText,
  namedText,
  percent,
  t
} from '../../strings.js';

const word = key => label('contacts.' + key);
// The planned contacts as a drawing: the senders on the left, the chosen cells in the middle, the
// receivers on the right, one line per planned contact, as thick as the strongest contact it may
// grow, dashed where it teaches, in the colour of its sign. A single chosen cell shows its
// contact seats round it and the handles for how many it takes (its rim) and how strong an
// electrical or a teaching contact to it may grow (the two wedges below).
const PLAN = Object.freeze({
  width : 300,
  columns : [ 34, 150, 266 ],
  top : 32,
  heading : 14,
  step : 20,
  most : 16,
  mark : 7,
  line : {least : .8, span : 3.4},
  bow : 34,
  cell : 14,
  reach : 16,
  seat : 2.2,
  seats : 24,
  handle : 6,
  wedges : {from : 60, to : 240, rows : [ 24, 58 ], thick : 9, margin : 12, label : 10}
});
const point = p => fixed(p.x) + ' ' + fixed(p.y);
function limits(source, target) {
  const cl = source.role === 'sensor' ? {sign : 1, modulator : 0} : nerveClass(source);
  const teaching = target.role !== 'motor' && cl.modulator > .5 ? 1 : 0;
  return {
    sign : cl.sign < 0 ? -1 : 1,
    teaching,
    limit : (1 - teaching) * target.electrical_limit + teaching * target.teaching_limit
  };
}
// A sensor takes no contacts; a working cell's only limit is its electrical one.
const WEDGES = Object.freeze({
  sensor : [],
  motor : [ 'electrical_limit' ],
  nerve : [ 'electrical_limit', 'teaching_limit' ]
});
const seatCount = (neural, center) =>
    center.role === 'motor' ? neural.effectorSlots
                            : Math.round(neural.slotMin * Math.pow(neural.slotSpan, center.field));
// The handles' patch, from the pointer in the picture's units and the geometry the handle carries.
export function contactCapacityPatch(key, p, marks) {
  if (key === 'field') {
    const [cx] = marks.cell.split(',').map(Number);
    return {field : clamp((p.x - cx - PLAN.cell) / PLAN.reach)};
  }
  const W = PLAN.wedges;
  return {[key] : clamp((p.x - W.from) / (W.to - W.from))};
}
export function contactPlan(state, chosen, wire = null) {
  chosen = chosen.filter(Boolean);
  if (!state.capabilities || !chosen.length)
    return '';
  const P = PLAN, doc = state.document, centers = allCenters(doc),
        neural = state.capabilities.neural;
  const index = new Map(centers.map((c, i) => [c.id, i]));
  const own = new Set(chosen.map(c => index.get(c.id)));
  const pairs = wire && wireContactPairs(doc, wire, state.sites);
  const key = wire?.id ?? chosen.map(c => c.id).sort().join(','),
        expanded = state.expandedContacts === key;
  const planned =
      compileDocument(doc, state.sites)
          .connections.filter(edge => (!pairs || pairs.has(edge.from + ':' + edge.to)) &&
                                      (own.has(edge.to) || own.has(edge.from)));
  const edges = expanded ? planned : planned.slice(0, P.most * 3);
  const visible = list => expanded ? list : list.slice(0, P.most);
  const senders = visible([...new Set(edges.filter(e => !own.has(e.from)).map(e => e.from)) ]);
  const receivers = visible([...new Set(edges.filter(e => !own.has(e.to)).map(e => e.to)) ]);
  // A wire shows only the cells it joins.
  const middle =
      visible([...own ].filter(i => !wire || edges.some(e => e.from === i || e.to === i)));
  const single = middle.length === 1 && !wire;
  const rows = Math.max(senders.length, middle.length, receivers.length, single ? 3 : 1);
  const span = P.top * 2 + (rows - 1) * P.step;
  const wedges = single ? WEDGES[centers[middle[0]].role] ?? [] : [];
  // Without a planned contact and without anything to set there is nothing to draw.
  if (!edges.length && !wedges.length)
    return '';
  const height = span + (wedges.length ? P.wedges.rows[wedges.length - 1] + P.wedges.margin : 0);
  const place = new Map();
  const column = (list, x) => list.forEach(
      (i, k) => place.set(x + ':' + i, {x, y : span / 2 + (k - (list.length - 1) / 2) * P.step}));
  column(senders, P.columns[0]);
  // A wire's cells receive, so they stand on the right.
  const inner = P.columns[wire ? 2 : 1];
  column(middle, inner);
  column(receivers, P.columns[2]);
  const at = (i, side) => place.get((own.has(i) ? inner : P.columns[side]) + ':' + i);
  const shown = edges.filter(edge => at(edge.from, 0) && at(edge.to, 2));
  const name = c => joinParts(
      [ centerTitle(c), organTitle(doc.organs.find(o => o.id === c.organId), state.sites) ]);
  const chosenCell = single ? centers[middle[0]] : null;
  const radius = chosenCell?.role === 'nerve' ? P.cell + chosenCell.field * P.reach : P.cell;
  const lines =
      shown
          .map(edge => {
            const a = at(edge.from, 0), b = at(edge.to, 2);
            const source = centers[edge.from], target = centers[edge.to];
            const {sign, teaching, limit} = limits(source, target);
            const learning =
                learningTimeSteps((target.role === 'motor' ? source : target).learning_tau);
            const end = single && own.has(edge.to) ? {x : b.x - radius, y : b.y} : b;
            const start = single && own.has(edge.from) ? {x : a.x + radius, y : a.y} : a;
            // Contacts among the chosen cells bow out to the right of their column.
            const bow = own.has(edge.from) && own.has(edge.to) ? P.bow : 0;
            const mid = (start.x + end.x) / 2;
            const d = bow ? 'M' + point(start) + ' C' + fixed(start.x + bow) + ' ' +
                                fixed(start.y) + ' ' + fixed(end.x + bow) + ' ' + fixed(end.y) +
                                ' ' + point(end)
                          : 'M' + point(start) + ' C' + fixed(mid) + ' ' + fixed(start.y) + ' ' +
                                fixed(mid) + ' ' + fixed(end.y) + ' ' + point(end);
            return '<path class="aid-plan-edge ' + (sign < 0 ? 'inhibit' : 'excite') +
                   (teaching ? ' teach' : '') + '" d="' + d + '" stroke-width="' +
                   fixed(P.line.least + P.line.span * limit) + '"><title>' + escapeText(joinParts([
                     linkText(centerTitle(source), centerTitle(target)),
                     namedText(word('limit'), formatSigned(sign * limit, VALUE_DIGITS)),
                     namedText(word('modulation'), percent(teaching)),
                     namedText(word('probation'),
                               formatNumber(Math.ceil(neural.contactTrial * learning)))
                   ])) +
                   '</title></path>';
          })
          .join('');
  const mark = (i, x) => {
    const c = centers[i], p = place.get(x + ':' + i);
    const seats = c.role === 'sensor' ? ''
                                      : namedText(label('cellPicture.capacity'),
                                                  formatNumber(seatCount(neural, c)));
    return '<g class="aid-plan-mark" data-select-center="' + escapeText(c.id) +
           '" transform="translate(' + point(p) + ')"><title>' +
           escapeText(joinParts([ name(c), seats ])) + '</title><circle r="' + (P.mark + 2) +
           '"/>' + centerMarker(c, P.mark) + '</g>';
  };
  const marks = senders.map(i => mark(i, P.columns[0])).join('') +
                receivers.map(i => mark(i, P.columns[2])).join('') +
                (single ? '' : middle.map(i => mark(i, inner)).join(''));
  const heading = (x, key) => '<text class="aid-plan-label" x="' + x + '" y="' + P.heading +
                              '" text-anchor="middle">' + escapeText(word(key)) + '</text>';
  const headings = (senders.length ? heading(P.columns[0], 'senders') : '') +
                   (middle.length && !wire ? heading(P.columns[1], 'chosen') : '') +
                   (receivers.length || wire ? heading(P.columns[2], 'receivers') : '');
  const count = t('studio.contacts.shown',
                  {shown : formatNumber(shown.length), total : formatNumber(planned.length)});
  const toggle = expanded || shown.length < planned.length
                     ? '<button type="button" data-expand-contacts="' + escapeText(key) +
                           '" aria-expanded="' + expanded + '">' +
                           escapeText(word(expanded ? 'less' : 'all')) + '</button>'
                     : '';
  const legend = planned.length ? '<div class="aid-plan-legend">' +
                                      [ 'excite', 'inhibit', 'electrical', 'teach' ]
                                          .map(kind => '<span><i class="' + kind +
                                                       '" aria-hidden="true"></i>' +
                                                       escapeText(word(kind)) + '</span>')
                                          .join('') +
                                      '</div>'
                                : '';
  return '<details class="aid-contact-plan" open><summary title="' + escapeText(joinParts([
           word('meaning'), word('fields').replace('{n}', neural.contactFields),
           word('learningMeaning')
         ])) +
         '">' + word('title') + '</summary>' + legend +
         (planned.length ? '<div class="aid-plan-count"><span>' + escapeText(count) + '</span>' +
                               toggle + '</div>'
                         : '') +
         '<div class="aid-plan-viewport"><svg class="aid-plan-picture"' +
         (single ? ' data-capacity="' + escapeText(chosenCell.id) + '"' : '') + ' viewBox="0 0 ' +
         P.width + ' ' + height + '" role="img" aria-label="' + word('title') + '">' + headings +
         lines + marks +
         (single ? capacity(neural, chosenCell, {x : inner, y : span / 2}, radius, span) : '') +
         '</svg></div></details>';
}
// The chosen cell with its seats, the rim that sets how many it has and the two wedges that set
// how strong its electrical and its teaching contacts may grow.
function capacity(neural, cell, at, radius, span) {
  const P = PLAN, W = P.wedges, sensor = cell.role === 'sensor', count = seatCount(neural, cell);
  const shown = sensor ? 0 : Math.min(P.seats, count);
  const grip = (key, p, title, geometry = '') =>
      '<circle class="aid-graphic-handle" data-capacity-handle="' + key + '" ' + geometry +
      ' cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' + P.handle + '"><title>' +
      escapeText(title) + '</title></circle>';
  const seats = Array
                    .from({length : shown},
                          (_, k) => {
                            const a = 2 * Math.PI * k / shown;
                            return '<circle class="aid-contact-seat" cx="' +
                                   fixed(at.x + radius * Math.cos(a)) + '" cy="' +
                                   fixed(at.y + radius * Math.sin(a)) + '" r="' + P.seat + '"/>';
                          })
                    .join('');
  const wedge = (key, k) => {
    const y = span + W.rows[k], value = cell[key], x = W.from + (W.to - W.from) * value;
    return '<g class="' + key + '"><text class="aid-plan-label" x="' + W.from + '" y="' +
           (y - W.label) + '">' + escapeText(word(key)) +
           '</text><path class="aid-plan-wedge" d="M' + W.from + ' ' + y + ' L' + W.to + ' ' +
           fixed(y - W.thick / 2) + ' V' + fixed(y + W.thick / 2) + 'Z"/>' +
           '<path class="aid-plan-wedge-fill" d="M' + W.from + ' ' + y + ' L' + fixed(x) + ' ' +
           fixed(y - W.thick / 2 * value) + ' V' + fixed(y + W.thick / 2 * value) + 'Z"/>' +
           grip(key, {x, y},
                namedText(label('cellPicture.' + key), formatNumber(value, VALUE_DIGITS))) +
           '</g>';
  };
  return '<g class="aid-plan-cell">' +
         (sensor
              ? ''
              : '<title>' + escapeText(label('cellPicture.capacity') + ' ' + formatNumber(count)) +
                    '</title>') +
         '<circle class="aid-tissue-cell" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' +
         fixed(radius) + '"/>' + seats + '<g class="aid-plan-mark" transform="translate(' +
         point(at) + ')">' + centerMarker(cell, P.mark) + '</g></g>' +
         (cell.role === 'nerve'
              ? grip('field', {x : at.x + radius, y : at.y}, label('cellPicture.capacity'),
                     'data-cell="' + fixed(at.x) + ',' + fixed(at.y) + '"')
              : '') +
         (WEDGES[cell.role] ?? []).map(wedge).join('');
}
