import {isRegion, slotCenters} from '../model/organs.js';
import {findCenter, findOrgan} from '../model/document.js';
import {regionSlots, routedLinks} from '../model/regions.js';
import {centerMarker} from './scene.js';
import {centerTitle, slotTitle} from './names.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {label, slotShape} from './kit.js';

const GRAPH = {
  width : 300,
  side : 32,
  row : 66,
  node : 11,
  columns : 3,
  top : 67
};
function layout(organ, links) {
  const ids = new Set(organ.centers.map(c => c.id)), rank = new Map();
  const roots = organ.centers.filter(c => c.port === 'in' || c.port === 'both');
  const queue = (roots.length ? roots : organ.centers.slice(0, 1)).map(c => c.id);
  queue.forEach(id => rank.set(id, 0));
  for (let i = 0; i < queue.length; i++)
    for (const link of links) {
      if (link.cut || link.from !== queue[i] || !ids.has(link.to) || rank.has(link.to))
        continue;
      rank.set(link.to, rank.get(link.from) + 1);
      queue.push(link.to);
    }
  const deepest = Math.max(0, ...rank.values());
  const rows = new Map();
  for (const c of organ.centers) {
    const level = c.port === 'out' ? deepest + 1 : rank.get(c.id) ?? deepest;
    if (!rows.has(level))
      rows.set(level, []);
    rows.get(level).push(c);
  }
  const points = new Map();
  let row = 0;
  for (const [, cells] of [...rows].sort(([ a ], [ b ]) => a - b)) {
    for (let k = 0; k < cells.length; k += GRAPH.columns) {
      const group = cells.slice(k, k + GRAPH.columns),
            step = (GRAPH.width - 2 * GRAPH.side) / Math.max(1, group.length);
      group.forEach((c, i) => points.set(
                        c.id, {x : GRAPH.side + step * (i + .5), y : GRAPH.top + row * GRAPH.row}));
      row++;
    }
  }
  return {points, height : GRAPH.top + (row - 1) * GRAPH.row + GRAPH.top};
}
function path(a, b, index) {
  const d = GRAPH.node + 3, dy = b.y - a.y;
  if (dy > GRAPH.row * .5)
    return 'M' + fixed(a.x) + ' ' + fixed(a.y + d) + ' C' + fixed(a.x) + ' ' +
           fixed(a.y + dy * .5) + ' ' + fixed(b.x) + ' ' + fixed(b.y - dy * .5) + ' ' + fixed(b.x) +
           ' ' + fixed(b.y - d);
  const side = a.x < GRAPH.width / 2 ? -1 : 1, reach = 22 + (index % 3) * 9;
  return 'M' + fixed(a.x + side * d) + ' ' + fixed(a.y) + ' C' + fixed(a.x + side * reach) + ' ' +
         fixed(a.y - 28) + ' ' + fixed(b.x + side * reach) + ' ' + fixed(b.y + 28) + ' ' +
         fixed(b.x + side * d) + ' ' + fixed(b.y);
}
export function regionGraph(state, organ) {
  const doc = state.document;
  if (!isRegion(organ))
    return '';
  const own = new Set(organ.centers.map(c => c.id));
  const twin = findOrgan(doc, organ.pair), other = new Set(twin?.centers.map(c => c.id) ?? []);
  const links =
      routedLinks(doc, state.sites, true)
          .filter(l => (own.has(l.from) && own.has(l.to)) || (own.has(l.from) && other.has(l.to)) ||
                       (other.has(l.from) && own.has(l.to)));
  const L = layout(organ, links),
        external = new Set(links.flatMap(l => [l.from, l.to]).filter(id => !own.has(id)));
  for (const id of external) {
    const cell = findCenter(doc, id).center,
          corresponding = organ.centers.find(c => c.node === cell.node),
          p = L.points.get(corresponding?.id);
    L.points.set(id, {x : GRAPH.width - 13, y : p?.y ?? GRAPH.top});
  }
  if (external.size)
    for (const [id, p] of L.points)
      if (own.has(id))
        p.x *= .83;
  const slots = regionSlots(doc, organ), esc = escapeText;
  const editing = state.circuitEditing === organ.id, pending = state.circuitFrom;
  let html =
      '<svg class="aid-region-graph" viewBox="0 0 ' + GRAPH.width + ' ' + L.height +
      '" data-region-graph="' + esc(organ.id) + '">' +
      '<defs><marker id="aid-region-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z"/></marker></defs>';
  for (const dir of ['in', 'out']) {
    const ports = slots.filter(s => s.dir === dir), y = dir === 'in' ? 18 : L.height - 18;
    ports.forEach((slot, i) => {
      const x = GRAPH.side + (GRAPH.width - 2 * GRAPH.side) * (i + .5) / Math.max(1, ports.length),
            p = {x, y};
      for (const cell of slotCenters(organ, slot.key, dir)) {
        const at = L.points.get(cell.id);
        if (at)
          html += '<path class="aid-region-port-branch" d="' +
                  (dir === 'in' ? path(p, at, i) : path(at, p, i)) + '"/>';
      }
      html += '<g class="aid-region-port ' + dir + ' ' + (slot.filled.length ? 'filled' : '') +
              '" data-slot-region="' + esc(organ.id) + '" data-slot-key="' + esc(slot.key) +
              '" data-slot-dir="' + dir + '" transform="translate(' + fixed(x) + ' ' + y + ')">' +
              '<title>' + esc(slotTitle(slot)) +
              '</title><rect x="-12" y="-12" width="24" height="24" rx="7"/>' +
              placedGlyph(slotShape(slot), 18, {}, {line : true}) + '</g>';
    });
  }
  links.forEach((link, i) => {
    const a = L.points.get(link.from), b = L.points.get(link.to),
          c = findCenter(doc, link.from)?.center;
    const attrs = link.wire.inner ? 'data-inner-link="' + esc(link.key) + '" data-organ-id="' +
                                        esc(organ.id) + '"'
                                  : 'data-circuit-wire="' + esc(link.wire.id) + '"';
    const d = path(a, b, i),
          title = label(link.cut ? 'inspector.region.restore' : 'inspector.region.cut');
    html += '<g ' + attrs + ' class="aid-region-edge' + (link.cut ? ' cut' : '') +
            (c?.sign < 0 ? ' inhibits' : '') + '">' +
            '<title>' + esc(title) + '</title><path class="aid-region-edge-hit" d="' + d + '"/>' +
            '<path class="aid-region-edge-ink" d="' + d +
            '" marker-end="url(#aid-region-arrow)"/></g>';
  });
  for (const c of [...organ.centers, ...(twin?.centers ?? []).filter(c => external.has(c.id))]) {
    const p = L.points.get(c.id);
    html += '<g class="aid-region-graph-node' + (pending === c.id ? ' pending' : '') +
            (!own.has(c.id) ? ' mirrored' : '') + '" data-circuit-node="' + esc(c.id) +
            '" data-circuit-region="' + esc(organ.id) + '" transform="translate(' + fixed(p.x) +
            ' ' + fixed(p.y) + ')">' +
            '<title>' + esc(centerTitle(c)) + '</title><circle r="' + GRAPH.node + '"/>' +
            centerMarker(c, 7) + '</g>';
  }
  return '<div class="aid-circuit-tools"><button data-circuit-edit="' + esc(organ.id) +
         '" aria-pressed="' + editing + '" title="' + label('inspector.region.edit') +
         '"><svg viewBox="0 0 24 24"><circle cx="4" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="M6 5C18 5 6 19 18 19"/></svg></button></div>' +
         html + '</svg>';
}
