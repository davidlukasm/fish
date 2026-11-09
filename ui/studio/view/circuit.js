import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {ORGAN_BY_KEY, PAIRINGS} from '../model/organs.js';
import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {findCenter, findOrgan, isLearner, teachersOf, wholeEndpoint} from '../model/document.js';
import {substanceName} from './substances.js';
import {centerMarker} from './scene.js';
import {escapeText, fixed, glyph, placedGlyph} from './markup.js';
import {sideIndex} from '../model/layout.js';
import {planned, regionPlan, regionSlots, routedLinks} from '../model/regions.js';
import {namedText, t, tList} from '../../strings.js';
import {cellTrack, cellWords, ICON, icon, label, slotFill, slotShape} from './kit.js';
import {centerTitle, familyTitle, nodeFamilies, nodeFamily} from './names.js';
import {organTitle} from './names.js';

const PAIRING_BOX = 20;
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
const pairingTitle = wire =>
    namedText(label('inspector.pairing.title'), label('inspector.pairing.' + wire.pairing));
export const pairingChoice = wire =>
    '<div class="aid-wire-pairing" role="group" aria-label="' + label('inspector.pairing.title') +
    '">' +
    PAIRINGS
        .map(p => '<button class="aid-pairing" data-wire-pairing="' + escapeText(wire.id) +
                  '" data-pairing-value="' + p + '" aria-pressed="' +
                  ((wire.pairing ?? 'same') === p) + '">' +
                  glyph(PAIRING_GLYPH[p], PAIRING_BOX, {box : PAIRING_BOX}) + '<span>' +
                  label('inspector.pairing.' + p) + '</span></button>')
        .join('') +
    '</div>';
const CIRCUIT = Object.freeze({
  width : 300,
  label : 98,
  left : 132,
  right : 254,
  middle : 193,
  spread : 46,
  row : 50,
  top : 34,
  bottom : 18,
  node : 13,
  organ : 12,
  glyph : 11,
  round : 5,
  bend : 20,
  fan : 26,
  marker : 7,
  teach : 4,
  arrow : 8,
  bar : 6,
  loop : 26,
  baseline : 4,
  side_y : 14
});
const ARROW_BOX = 10, BEZIER_THIRD = 3;
const circuitSide = organ => sideIndex(organ?.side);
function circuitMembers(doc, organ) {
  const twin = findOrgan(doc, organ.pair), sides = [ organ, twin ];
  if (circuitSide(organ) === 1)
    sides.reverse();
  // A region without a twin is drawn on the midline, not on the side it happens to grow on.
  const sideOfMember = o => twin ? circuitSide(o) : null;
  const members = new Map(), kindOf = new Map();
  const families = nodeFamilies(organ).map(nodes => nodeFamily(nodes[0]));
  sides.forEach(o => o?.centers.forEach(center => {
    const first = o.centers.find(c => nodeFamily(c) === nodeFamily(center));
    kindOf.set(center.id, first.id);
    if (first === center)
      members.set(center.id,
                  {side : sideOfMember(o), index : families.indexOf(nodeFamily(center)), center});
  }));
  return {members, kindOf};
}
function circuitLinks(state, {members, kindOf}) {
  const doc = state.document, joined = new Map();
  for (const l of routedLinks(doc, state.sites, true)) {
    if (!kindOf.has(l.from) && !kindOf.has(l.to))
      continue;
    const from = kindOf.get(l.from) ?? wholeEndpoint(doc, l.from),
          to = kindOf.get(l.to) ?? wholeEndpoint(doc, l.to), pair = from + '>' + to;
    const link = joined.get(pair) ?? {
      ...l,
      from,
      to,
      keys : [],
      cut : true,
      inhibits : (findCenter(doc, l.from)?.center.sign ?? 1) < 0
    };
    if (l.key)
      link.keys.push(l.key);
    link.cut &&= Boolean(l.cut);
    joined.set(pair, link);
  }
  return [...joined.values() ];
}
const circuitEnd = (doc, id) =>
    findOrgan(doc, id) ? {organ : findOrgan(doc, id)} : findCenter(doc, id);
function endRows(doc, ids) {
  const rows = [];
  for (const id of ids) {
    const end = circuitEnd(doc, id), key = end.organ.type + ':' + (end.center?.key ?? '');
    let row = rows.find(r => r.key === key);
    if (!row)
      rows.push(row = {key, end, ids : []});
    row.ids.push(id);
  }
  return rows;
}
function placeRows(doc, rows, top) {
  const C = CIRCUIT, at = new Map();
  const sideOf = id => {
    const end = circuitEnd(doc, id);
    return end.organ.pair && findOrgan(doc, end.organ.pair) ? circuitSide(end.organ) : null;
  };
  rows.forEach((row, r) => {
    for (const side of [0, 1, null]) {
      const ids = row.ids.filter(id => sideOf(id) === side);
      const column = side === null ? C.middle : side ? C.right : C.left;
      // A fan stays inside its half of the plan: squeezed if too wide, else shifted in.
      const lo = side === 1 ? C.middle + C.organ : C.organ,
            hi = side === 0 ? C.middle - C.organ : C.width - C.organ;
      const step =
          Math.min(side === null ? C.spread : C.fan, (hi - lo) / Math.max(1, ids.length - 1));
      const half = (ids.length - 1) / 2 * step;
      const centre = clamp(column, lo + half, hi - half);
      ids.forEach(
          (id, k) => at.set(
              id, {x : centre + (k - (ids.length - 1) / 2) * step, y : top + r * C.row, side}));
    }
  });
  return at;
}
function circuitLayout(doc, organ, members, links) {
  const C = CIRCUIT;
  const inputs =
      endRows(doc, [...new Set(links.filter(l => !members.has(l.from)).map(l => l.from)) ]);
  const outputs = endRows(doc, [...new Set(links.filter(l => !members.has(l.to)).map(l => l.to)) ]);
  const inPos = placeRows(doc, inputs, C.top);
  const nodeTop = C.top + inputs.length * C.row;
  const nodePos = new Map([...members ].map(([ id, m ]) => [id, {
                                              x : m.side === null ? C.middle
                                                  : m.side        ? C.right
                                                                  : C.left,
                                              y : nodeTop + m.index * C.row,
                                              side : m.side
                                            }]));
  const outTop = nodeTop + nodeFamilies(organ).length * C.row;
  const outPos = placeRows(doc, outputs, outTop);
  return {
    inputs,
    outputs,
    inPos,
    outPos,
    nodePos,
    nodeTop,
    from : id => nodePos.get(id) ?? inPos.get(id),
    to : id => nodePos.get(id) ?? outPos.get(id),
    height : outTop + Math.max(0, outputs.length - 1) * C.row + C.bottom + C.node
  };
}
function circuitLink(organ, l, a, b) {
  const C = CIRCUIT;
  const crossing = a.side !== null && b.side !== null && a.side !== b.side;
  const out = a.x < C.middle ? -1 : 1, bow = a.x === b.x ? out * C.bend : 0;
  const own = l.wire.inner && l.keys.length ? ' data-inner-link="' + escapeText(l.keys.join(' ')) +
                                                  '" data-organ-id="' + escapeText(organ.id) + '"'
                                            : '';
  const d = a === b ? 'M' + a.x + ' ' + (a.y - C.node) + ' C' + (a.x + out * C.loop) + ' ' +
                          (a.y - C.loop) + ' ' + (a.x + out * C.loop) + ' ' + (a.y + C.loop) + ' ' +
                          a.x + ' ' + a.y
                    : 'M' + a.x + ' ' + a.y + ' C' + (a.x + bow) + ' ' +
                          fixed(a.y + (b.y - a.y) / BEZIER_THIRD) + ' ' + (b.x + bow) + ' ' +
                          fixed(b.y - (b.y - a.y) / BEZIER_THIRD) + ' ' + b.x + ' ' + b.y;
  return '<path class="aid-circuit-link' + (crossing ? ' crossing' : '') +
         (l.inhibits ? ' inhibits' : '') + (l.wire.inner ? ' inner' : '') + (l.cut ? ' cut' : '') +
         '"' + own + ' d="' + d + '" marker-end="url(#aid-circuit-' +
         (l.inhibits ? 'bar' : 'arrow') + ')"><title>' +
         (l.wire.inner ? label(l.cut ? 'inspector.region.restore' : 'inspector.region.cut') : '') +
         '</title></path>';
}
function pairingMark(wire, links, layout) {
  const C = CIRCUIT;
  const ys =
      links.filter(l => l.wire === wire).flatMap(l => [layout.from(l.from).y, layout.to(l.to).y]);
  const y = fixed((Math.min(...ys) + Math.max(...ys)) / 2), x = C.middle;
  return '<g class="aid-circuit-pairing" data-wire-pairing="' + escapeText(wire.id) +
         '" transform="translate(' + x + ' ' + y + ')"><title>' + pairingTitle(wire) +
         '</title><rect x="-' + C.glyph + '" y="-' + C.glyph + '" width="' + 2 * C.glyph +
         '" height="' + 2 * C.glyph + '" rx="' + C.round + '"/>' +
         placedGlyph(PAIRING_GLYPH[wire.pairing], PAIRING_BOX, {}, {box : PAIRING_BOX}) + '</g>';
}
const brainCenter = end => end.center && end.organ.type === 'brain';
const endTitle = end => brainCenter(end) ? centerTitle(end.center) : organTitle(end.organ);
const circuitEnds = (doc, rows, at) => rows.flatMap(row => row.ids.map(id => {
  const C = CIRCUIT, p = at.get(id), end = circuitEnd(doc, id);
  return '<g class="aid-circuit-organ" ' +
         (brainCenter(end) ? 'data-select-center="' + escapeText(end.center.id)
                           : 'data-select-organ="' + escapeText(end.organ.id)) +
         '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' + escapeText(endTitle(end)) +
         '</title><circle r="' + C.organ + '"/>' +
         (brainCenter(end)
              ? centerMarker(end.center, C.marker)
              : '<g transform="translate(' + -ICON.circuit / 2 + ' ' + -ICON.circuit / 2 + ')">' +
                    icon(end.organ.type, ICON.circuit) + '</g>') +
         '</g>';
}));
const circuitLabel = (y, text) => '<text class="aid-circuit-label" x="' + CIRCUIT.label + '" y="' +
                                  (y + CIRCUIT.baseline) + '" text-anchor="end">' +
                                  escapeText(text) + '</text>';
// A row fanned out wider than its column leaves no room beside it; its name goes above it.
function rowLabel(row, at) {
  const C = CIRCUIT, places = row.ids.map(id => at.get(id));
  const left = Math.min(...places.map(p => p.x)) - C.organ, y = places[0].y;
  return left > C.label
             ? circuitLabel(y, endTitle(row.end))
             : '<text class="aid-circuit-label" x="' + fixed(left) + '" y="' +
                   (y - C.organ - C.baseline) + '">' + escapeText(endTitle(row.end)) + '</text>';
}
const rowLabels = (rows, at) => rows.map(row => rowLabel(row, at));
function circuitNode(state, id, m, p) {
  const C = CIRCUIT;
  const teacher =
      state.capabilities ? teachersOf(state.document, m.center, state.capabilities)[0] : null;
  return '<g class="aid-circuit-node" data-select-center="' + escapeText(id) +
         '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' +
         escapeText(centerTitle(m.center)) + '</title>' +
         (teacher ? '<circle class="aid-circuit-teach" r="' + (C.node + C.teach) +
                        '" style="--substance:' + substanceColor(teacher.substance.index) + '"/>'
                  : '') +
         '<circle r="' + C.node + '"/>' + centerMarker(m.center, C.marker) + '</g>';
}
const arrowMarker = () =>
    '<defs><marker id="aid-circuit-arrow" viewBox="0 0 ' + ARROW_BOX + ' ' + ARROW_BOX +
    '" refX="' + fixed(ARROW_BOX + CIRCUIT.node * ARROW_BOX / CIRCUIT.arrow) + '" refY="' +
    ARROW_BOX / 2 + '" markerUnits="userSpaceOnUse" markerWidth="' + CIRCUIT.arrow +
    '" markerHeight="' + CIRCUIT.arrow + '" orient="auto"><path d="M0 0 L' + ARROW_BOX + ' ' +
    ARROW_BOX / 2 + ' L0 ' + ARROW_BOX +
    ' Z"/></marker><marker id="aid-circuit-bar" viewBox="0 0 ' + ARROW_BOX + ' ' + ARROW_BOX +
    '" refX="' + fixed(ARROW_BOX / 2 + CIRCUIT.node * ARROW_BOX / CIRCUIT.bar) + '" refY="' +
    ARROW_BOX / 2 + '" markerUnits="userSpaceOnUse" markerWidth="' + CIRCUIT.bar +
    '" markerHeight="' + CIRCUIT.bar * 2 + '" orient="auto"><path d="M' + ARROW_BOX / 2 + ' 0 V' +
    ARROW_BOX + '"/></marker></defs>';
const circuitFrame = (height, paired) => {
  const C = CIRCUIT;
  if (!paired)
    return '';
  return '<line class="aid-circuit-midline" x1="' + C.middle + '" y1="0" x2="' + C.middle +
         '" y2="' + height + '"/><text class="aid-circuit-side" x="' + C.left + '" y="' + C.side_y +
         '" text-anchor="middle">' + label('inspector.side.left') +
         '</text><text class="aid-circuit-side" x="' + C.right + '" y="' + C.side_y +
         '" text-anchor="middle">' + label('inspector.side.right') + '</text>';
};
function regionCircuit(state, organ) {
  const doc = state.document, region = circuitMembers(doc, organ), members = region.members;
  const links = circuitLinks(state, region);
  if (!links.length)
    return '';
  const L = circuitLayout(doc, organ, members, links);
  const pairings = [...new Set(links.map(l => l.wire)) ].filter(w => w.pairing);
  const sided = !!findOrgan(doc, organ.pair) ||
                [...L.inPos.values(), ...L.outPos.values() ].some(p => p.side !== null);
  return '<svg class="aid-circuit" viewBox="0 0 ' + CIRCUIT.width + ' ' + L.height +
         '" role="img" aria-label="' + label('inspector.region.circuit') + '">' + arrowMarker() +
         circuitFrame(L.height, sided) +
         links.map(l => circuitLink(organ, l, L.from(l.from), L.to(l.to))).join('') +
         rowLabels(L.inputs, L.inPos).join('') + rowLabels(L.outputs, L.outPos).join('') +
         nodeFamilies(organ)
             .map((nodes, i) => circuitLabel(L.nodeTop + i * CIRCUIT.row, familyTitle(nodes)))
             .join('') +
         circuitEnds(doc, L.inputs, L.inPos).join('') +
         circuitEnds(doc, L.outputs, L.outPos).join('') +
         [...members ].map(([ id, m ]) => circuitNode(state, id, m, L.nodePos.get(id))).join('') +
         pairings.map(wire => pairingMark(wire, links, L)).join('') + '</svg>';
}
export function slotsSection(state, organ) {
  if (!ORGAN_BY_KEY[organ.type].slots)
    return '';
  const slots =
      regionSlots(state.document, organ)
          .map(slot => '<li class="' + slotFill(slot) + '"><span class="aid-slot-name">' +
                       '<span class="aid-slot-symbol ' + slotFill(slot) + ' ' + slot.dir + '">' +
                       glyph(slotShape(slot), ICON.slot, {line : true}) + '</span>' +
                       label('regions.slots.' + slot.key) + '</span><small>' +
                       label(slot.required ? 'regions.required' : 'regions.optional') +
                       '</small><span class="aid-slot-ends">' +
                       (slot.filled.length
                            ? slot.filled
                                  .map(o => '<button data-select-organ="' + escapeText(o.id) +
                                            '">' + icon(o.type, ICON.list) +
                                            escapeText(organTitle(o, state.sites)) + '</button>')
                                  .join('')
                            : '') +
                       '<button class="aid-slot-add" data-slot-region="' + escapeText(organ.id) +
                       '" data-slot-dir="' + slot.dir + '" title="' +
                       label(slot.dir === 'in' ? 'status.slotIn' : 'status.slotOut') + '">' +
                       (slot.filled.length ? '+' : label('regions.free') + ' +') + '</button>' +
                       '</span></li>')
          .join('');
  return '<section class="aid-eye-section"><h4>' + label('regions.slotsTitle') +
         '</h4><ul class="aid-region-slots">' + slots + '</ul></section>';
}
function regionTeacher(state, organ) {
  const learners = organ.centers.filter(isLearner);
  if (!learners.length)
    return '';
  const taught = new Set(learners.map(c => {
    const r = c.receptors[HORMONE_EFFECT.teaching];
    return r?.active ? r.substance : null;
  }));
  const one = taught.size === 1 ? [...taught ][0] : undefined;
  const choice = (value, text, swatch = '') =>
      '<button class="' + (one === value ? 'active' : '') + '" data-region-teacher="' +
      escapeText(organ.id) + '" data-teacher-value="' + (value ?? 'off') + '"' +
      (swatch ? ' style="--substance:' + swatch + '"' : '') + '>' +
      (swatch ? '<span class="aid-substance-swatch"></span>' : '') + escapeText(text) + '</button>';
  return '<div class="aid-region-setting"><span>' + label('regions.settings.teacher') +
         '</span><div class="aid-button-group aid-learn-substances">' +
         choice(null, label('learnRule.none')) +
         [...state.document.substances, {index : HORMONES.levels} ]
             .map(s => choice(s.index, substanceName(state, s.index), substanceColor(s.index)))
             .join('') +
         '</div></div>';
}
function regionControls(state, organ) {
  if (!planned(organ))
    return '';
  const region = organ.region, settings = ORGAN_BY_KEY[organ.type].settings;
  const most = regionPlan(state.document, organ).most ?? {};
  const choices =
      Object.entries(settings)
          .filter(([ key ]) => key !== 'compare' || organ.pair)
          .map(([ key, s ]) => {
            const names = s.named ? tList('studio.regions.values.' + key) : null;
            const reached = Math.min(region[key], most[key] ?? region[key]);
            let buttons = '';
            for (let value = s.least; value <= s.most; ++value)
              buttons += '<button class="' +
                         (reached === value               ? 'active'
                          : value > (most[key] ?? s.most) ? 'beyond'
                                                          : '') +
                         '" data-region-setting="' + key + '" data-region-value="' + value +
                         '" data-organ-id="' + escapeText(organ.id) + '"' +
                         (value > (most[key] ?? s.most) ? ' title="' + label('regions.beyond') + '"'
                                                        : '') +
                         '>' + escapeText(names?.[value] ?? String(value)) + '</button>';
            return '<div class="aid-region-setting"><span>' + label('regions.settings.' + key) +
                   '</span><div class="aid-button-group">' + buttons + '</div></div>';
          })
          .join('');
  const follows = regionPlan(state.document, organ).view
                      ? '<label class="aid-checkbox"><input type="checkbox" data-region-follow="' +
                            escapeText(organ.id) + '"' + (region.follow ? ' checked' : '') + '/>' +
                            label('regions.follow') + '</label><p class="aid-hint">' +
                            t('units.joined', {
                              a : label('regions.' + organ.type + '.follows'),
                              b : label('regions.followHint')
                            }) +
                            '</p>'
                      : '';
  const wanted = regionPlan(state.document, organ).nodes.length;
  const crowded =
      organ.centers.length < wanted
          ? '<p class="aid-hint aid-warning">' +
                escapeText(t('studio.regions.crowded', {n : organ.centers.length, of : wanted})) +
                '</p>'
          : '';
  return slotsSection(state, organ) + '<section class="aid-eye-section"><h4>' +
         label('regions.settingsTitle') + '</h4>' + choices + regionTeacher(state, organ) +
         crowded + follows + '</section>';
}
export function regionSettings(state, organ) {
  const circuit = regionCircuit(state, organ);
  let html = regionControls(state, organ) + '<section class="aid-eye-section"><h4>' +
             label('inspector.region.circuit') + '</h4>' +
             (circuit || '<p class="aid-hint">' + label('inspector.region.none') + '</p>') +
             (circuit ? '<p class="aid-hint">' + label('inspector.region.cutHint') + '</p>' : '') +
             '<div class="aid-circuit-legend"><span class="same">' +
             label('inspector.pairing.same') + '</span><span class="crossing">' +
             label('inspector.pairing.crossed') + '</span><span class="inhibits">' +
             label('inspector.region.inhibits') + '</span></div></section>';
  html += '<section class="aid-eye-section"><h4>' + label('inspector.region.nodes') + '</h4>';
  for (const nodes of nodeFamilies(organ)) {
    html += '<div class="aid-region-node"><button data-select-center="' + escapeText(nodes[0].id) +
            '">' + escapeText(familyTitle(nodes)) + '</button>' +
            cellTrack(nodes[0], cellWords(nodes[0])) + '</div>';
  }
  return html + '</section>';
}
