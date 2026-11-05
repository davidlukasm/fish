import {substanceColor} from '../../hormones.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {findCenter, findOrgan, teachersOf, wholeEndpoint} from '../model/document.js';
import {centerMarker, centerTitle, organTitle} from './scene.js';
import {escapeText, fixed} from './markup.js';
import {sideIndex} from '../model/layout.js';
import {planned, regionPlan, regionSlots, routedLinks} from '../model/regions.js';
import {namedText, t, tList} from '../../strings.js';
import {ICON, icon, iconCells, label} from './kit.js';

// A brain region's wiring in the inspector: its circuit plan, its slots and its settings.
// A brain region: how it is wired (which organs feed it, where it sends, on which side) and its
// nodes with their cell counts. Each connection's side guidance is a glyph to click through.
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
const pairingTitle = wire =>
    namedText(label('inspector.pairing.title'), label('inspector.pairing.' + wire.pairing));
export function pairingButton(wire) {
  if (!wire.pairing)
    return '<span class="aid-pairing single"></span>';
  return '<button class="aid-pairing" data-wire-pairing="' + escapeText(wire.id) + '" title="' +
         pairingTitle(wire) +
         '"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="' +
         PAIRING_GLYPH[wire.pairing] + '"/></svg><span>' +
         label('inspector.pairing.' + wire.pairing) + '</span></button>';
}
// A brain region as a circuit: its nodes on both sides of the midline (the region and its twin),
// the organs feeding it above, those it drives below, and every connection as the engine makes
// it, crossing the midline where it crosses. Each wire's side guidance is a glyph to click
// through beside the midline; nodes and organs are chosen by a click.
// Names stand right-aligned at LABEL, left of the two columns.
const CIRCUIT = Object.freeze({
  width : 300,
  label : 80,
  left : 120,
  right : 250,
  middle : 185,
  spread : 46,
  row : 50,
  top : 34,
  bottom : 18,
  node : 13,
  organ : 12,
  glyph : 11,
  bend : 20,
  fan : 26,
  marker : 7,
  teach : 4,
  arrow : 8,
  baseline : 4,
  side_y : 14
});
// A circuit's arrowhead is drawn in an ARROW_BOX square; a connection's control points stand a
// third of the way from each end.
const ARROW_BOX = 10, BEZIER_THIRD = 3;
const circuitSide = organ => sideIndex(organ?.side);
function regionCircuit(state, organ) {
  const doc = state.document, C = CIRCUIT;
  const sides = [ organ, findOrgan(doc, organ.pair) ];
  if (circuitSide(organ) === 1)
    sides.reverse();
  const members = new Map();
  sides.forEach(o => o?.centers.forEach((center, index) => members.set(
                                            center.id, {side : circuitSide(o), index, center})));
  // An organ outside stands as a whole, however many of its nodes the region hears.
  const seen = new Set();
  const links = routedLinks(doc, state.sites, true)
                    .filter(l => members.has(l.from) || members.has(l.to))
                    .map(l => ({
                           ...l,
                           from : members.has(l.from) ? l.from : wholeEndpoint(doc, l.from),
                           to : members.has(l.to) ? l.to : wholeEndpoint(doc, l.to)
                         }))
                    .filter(l => !seen.has(l.from + '>' + l.to) && seen.add(l.from + '>' + l.to));
  if (!links.length)
    return '';
  // Organs and centers outside the region, a row for each kind, inputs above and outputs below.
  const outside = id => findOrgan(doc, id) ? {organ : findOrgan(doc, id)} : findCenter(doc, id);
  const rowsOf = ids => {
    const rows = [];
    for (const id of ids) {
      const end = outside(id), key = end.organ.type + ':' + (end.center?.key ?? '');
      let row = rows.find(r => r.key === key);
      if (!row)
        rows.push(row = {key, end, ids : []});
      row.ids.push(id);
    }
    return rows;
  };
  const inputs = rowsOf([...new Set(links.filter(l => !members.has(l.from)).map(l => l.from)) ]);
  const outputs = rowsOf([...new Set(links.filter(l => !members.has(l.to)).map(l => l.to)) ]);
  // Ends of one row on one side fan out around their column; unpaired ones around the middle.
  // An end that both feeds the region and is fed by it stands in both rows.
  const count = organ.centers.length;
  const place = (rows, top) => {
    const at = new Map();
    rows.forEach((row, r) => {
      const sideOf = id => {
        const end = outside(id);
        return end.organ.pair && findOrgan(doc, end.organ.pair) ? circuitSide(end.organ) : null;
      };
      for (const side of [0, 1, null]) {
        const ids = row.ids.filter(id => sideOf(id) === side);
        const column = side === null ? C.middle : side ? C.right : C.left;
        const step = side === null ? C.spread : C.fan;
        ids.forEach(
            (id, k) => at.set(
                id, {x : column + (k - (ids.length - 1) / 2) * step, y : top + r * C.row, side}));
      }
    });
    return at;
  };
  const inPos = place(inputs, C.top);
  const nodeTop = C.top + inputs.length * C.row;
  const nodePos = new Map([...members ].map(
      ([
        id, m
      ]) => [id, {x : m.side ? C.right : C.left, y : nodeTop + m.index * C.row, side : m.side}]));
  const outTop = nodeTop + count * C.row;
  const outPos = place(outputs, outTop);
  const fromPos = id => nodePos.get(id) ?? inPos.get(id);
  const toPos = id => nodePos.get(id) ?? outPos.get(id);
  const height = outTop + Math.max(0, outputs.length - 1) * C.row + C.bottom + C.node;
  // Connections: a curve from end to end, bowing outward between nodes of one column.
  const lines = links.map(l => {
    const a = fromPos(l.from), b = toPos(l.to);
    const crossing = a.side !== null && b.side !== null && a.side !== b.side;
    const bow = a.x === b.x ? (a.x < C.middle ? -C.bend : C.bend) : 0;
    // A link of the region's own plan can be taken out and put back with a click.
    const own = l.wire.inner ? ' data-inner-link="' + escapeText(l.key) + '" data-organ-id="' +
                                   escapeText(organ.id) + '"'
                             : '';
    return '<path class="aid-circuit-link' + (crossing ? ' crossing' : '') +
           (l.wire.inner ? ' inner' : '') + (l.cut ? ' cut' : '') + '"' + own + ' d="M' + a.x +
           ' ' + a.y + ' C' + (a.x + bow) + ' ' + fixed(a.y + (b.y - a.y) / BEZIER_THIRD) + ' ' +
           (b.x + bow) + ' ' + fixed(b.y - (b.y - a.y) / BEZIER_THIRD) + ' ' + b.x + ' ' + b.y +
           '" marker-end="url(#aid-circuit-arrow)"><title>' +
           (l.wire.inner ? label(l.cut ? 'inspector.region.restore' : 'inspector.region.cut')
                         : '') +
           '</title></path>';
  });
  // A wire's side guidance beside the midline, between the rows it joins.
  const wires = [...new Set(links.map(l => l.wire)) ].filter(w => w.pairing);
  const glyphs = wires.map(wire => {
    const ys = links.filter(l => l.wire === wire).flatMap(l => [fromPos(l.from).y, toPos(l.to).y]);
    const y = fixed((Math.min(...ys) + Math.max(...ys)) / 2), x = C.middle;
    return '<g class="aid-circuit-pairing" data-wire-pairing="' + escapeText(wire.id) +
           '" transform="translate(' + x + ' ' + y + ')"><title>' + pairingTitle(wire) +
           '</title><rect x="-' + C.glyph + '" y="-' + C.glyph + '" width="' + 2 * C.glyph +
           '" height="' + 2 * C.glyph + '" rx="5"/><path transform="translate(-10 -10)" d="' +
           PAIRING_GLYPH[wire.pairing] + '"/></g>';
  });
  // An organ shows as its icon and name; a center of the brain as its own glyph and name.
  const brainCenter = end => end.center && end.organ.type === 'brain';
  const endTitle = end => brainCenter(end) ? centerTitle(end.center) : organTitle(end.organ);
  const ends = (rows, at) => rows.flatMap(row => row.ids.map(id => {
    const p = at.get(id), end = outside(id);
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
  const rowLabels = (rows, at) =>
      rows.map(row => '<text class="aid-circuit-label" x="' + C.label + '" y="' +
                      (at.get(row.ids[0]).y + C.baseline) + '" text-anchor="end">' +
                      escapeText(endTitle(row.end)) + '</text>');
  // A node that learns from a substance wears a ring in its colour, as on the fish.
  const nodes = [...members ].map(([ id, m ]) => {
    const p = nodePos.get(id);
    const teacher = state.capabilities ? teachersOf(doc, m.center, state.capabilities)[0] : null;
    return '<g class="aid-circuit-node" data-select-center="' + escapeText(id) +
           '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' +
           escapeText(centerTitle(m.center)) + '</title>' +
           (teacher ? '<circle class="aid-circuit-teach" r="' + (C.node + C.teach) +
                          '" style="--substance:' + substanceColor(teacher.substance.index) + '"/>'
                    : '') +
           '<circle r="' + C.node + '"/>' + centerMarker(m.center, C.marker) + '</g>';
  });
  const nodeLabels =
      organ.centers.map((center, i) => '<text class="aid-circuit-label" x="' + C.label + '" y="' +
                                       (nodeTop + i * C.row + C.baseline) + '" text-anchor="end">' +
                                       escapeText(centerTitle(center)) + '</text>');
  return '<svg class="aid-circuit" viewBox="0 0 ' + C.width + ' ' + height +
         '" role="img" aria-label="' + label('inspector.region.circuit') +
         '"><defs><marker id="aid-circuit-arrow" viewBox="0 0 ' + ARROW_BOX + ' ' + ARROW_BOX +
         '" refX="' + fixed(ARROW_BOX + C.node * ARROW_BOX / C.arrow) + '" refY="' + ARROW_BOX / 2 +
         '" markerUnits="userSpaceOnUse" markerWidth="' + C.arrow + '" markerHeight="' + C.arrow +
         '" orient="auto"><path d="M0 0 L' + ARROW_BOX + ' ' + ARROW_BOX / 2 + ' L0 ' + ARROW_BOX +
         ' Z"/></marker></defs>' +
         '<line class="aid-circuit-midline" x1="' + C.middle + '" y1="0" x2="' + C.middle +
         '" y2="' + height + '"/><text class="aid-circuit-side" x="' + C.left + '" y="' + C.side_y +
         '" text-anchor="middle">' + label('inspector.side.left') +
         '</text><text class="aid-circuit-side" x="' + C.right + '" y="' + C.side_y +
         '" text-anchor="middle">' + label('inspector.side.right') + '</text>' + lines.join('') +
         rowLabels(inputs, inPos).join('') + rowLabels(outputs, outPos).join('') +
         nodeLabels.join('') + ends(inputs, inPos).join('') + ends(outputs, outPos).join('') +
         nodes.join('') + glyphs.join('') + '</svg>';
}
// An organ's or region's slots, each with the organs filling it or marked free (and needed, when
// it needs one there).
export function slotsSection(state, organ) {
  if (!ORGAN_BY_KEY[organ.type].slots)
    return '';
  const slots =
      regionSlots(state.document, organ)
          .map(slot => '<li class="' +
                       (slot.filled.length ? 'filled'
                        : slot.required    ? 'missing'
                                           : 'free') +
                       '"><span>' + label('regions.slots.' + slot.key) + '</span><small>' +
                       label(slot.required ? 'regions.required' : 'regions.optional') +
                       '</small><span class="aid-slot-ends">' +
                       (slot.filled.length
                            ? slot.filled
                                  .map(o => '<button data-select-organ="' + escapeText(o.id) +
                                            '">' + icon(o.type, ICON.list) +
                                            escapeText(organTitle(o, state.sites)) + '</button>')
                                  .join('')
                            : '') +
                       // Any slot takes one more: a click starts the wire there.
                       '<button class="aid-slot-add" data-slot-region="' + escapeText(organ.id) +
                       '" data-slot-dir="' + slot.dir + '" title="' +
                       label(slot.dir === 'in' ? 'status.slotIn' : 'status.slotOut') + '">' +
                       (slot.filled.length ? '+' : label('regions.free') + ' +') + '</button>' +
                       '</span></li>')
          .join('');
  return '<section class="aid-eye-section"><h4>' + label('regions.slotsTitle') +
         '</h4><ul class="aid-region-slots">' + slots + '</ul></section>';
}
// A planned region's slots, its own settings and whether its plan follows its organs.
function regionControls(state, organ) {
  if (!planned(organ))
    return '';
  const region = organ.region, settings = ORGAN_BY_KEY[organ.type].settings;
  // A setting the plan cannot reach as asked (a tectum's bands with many colour types apart)
  // shows what it reaches.
  const most = regionPlan(state.document, organ).most ?? {};
  const choices =
      Object.entries(settings)
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
  // Only a region whose plan follows its organs has the switch.
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
  // A plan larger than the free sites around the region says how much of it found room.
  const wanted = regionPlan(state.document, organ).nodes.length;
  const crowded =
      organ.centers.length < wanted
          ? '<p class="aid-hint aid-warning">' +
                escapeText(t('studio.regions.crowded', {n : organ.centers.length, of : wanted})) +
                '</p>'
          : '';
  return slotsSection(state, organ) + '<section class="aid-eye-section"><h4>' +
         label('regions.settingsTitle') + '</h4>' + choices + crowded + follows + '</section>';
}
export function regionSettings(state, organ) {
  const circuit = regionCircuit(state, organ);
  let html = regionControls(state, organ) + '<section class="aid-eye-section"><h4>' +
             label('inspector.region.circuit') + '</h4>' +
             (circuit || '<p class="aid-hint">' + label('inspector.region.none') + '</p>') +
             (circuit ? '<p class="aid-hint">' + label('inspector.region.cutHint') + '</p>' : '') +
             '<div class="aid-circuit-legend"><span class="same">' +
             label('inspector.pairing.same') + '</span><span class="crossing">' +
             label('inspector.pairing.crossed') + '</span></div></section>';
  html += '<section class="aid-eye-section"><h4>' + label('inspector.region.nodes') + '</h4>';
  for (const center of organ.centers)
    html += '<div class="aid-region-node"><button data-select-center="' + escapeText(center.id) +
            '">' + escapeText(centerTitle(center)) + '</button>' +
            iconCells(center.copies, center.id) + '</div>';
  return html + '</section>';
}
