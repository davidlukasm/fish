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
  row : 80,
  node : 11,
  columns : 2,
  top : 48
};
const PORTS = Object.freeze({row : 64, top : 44, margin : 36});
function namedMark(name, limit = 20) {
  const lines = [];
  for (const word of name.split(/\s+/)) {
    const previous = lines.at(-1);
    if (previous && previous.length + word.length + 1 <= limit)
      lines[lines.length - 1] += ' ' + word;
    else
      lines.push(word);
  }
  return '<text class="aid-region-name" text-anchor="middle">' +
         lines
             .map((line, i) =>
                      '<tspan x="0" y="' + (25 + 12 * i) + '">' + escapeText(line) + '</tspan>')
             .join('') +
         '</text>';
}
function layout(organ, links, paired = new Set()) {
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
  const place = (group, crossing = false) => {
    if (!group.length)
      return;
    const step = (GRAPH.width - 2 * GRAPH.side) / (crossing ? 2 : group.length);
    group.forEach((c, i) => points.set(
                      c.id, {x : GRAPH.side + step * (i + .5), y : GRAPH.top + row * GRAPH.row}));
    ++row;
  };
  for (const [, cells] of [...rows].sort(([ a ], [ b ]) => a - b)) {
    let group = [];
    for (const cell of cells) {
      if (paired.has(cell.id)) {
        place(group);
        group = [];
        place([ cell ], true);
      } else {
        group.push(cell);
        if (group.length === GRAPH.columns) {
          place(group);
          group = [];
        }
      }
    }
    place(group);
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
  const external = new Set(links.flatMap(l => [l.from, l.to]).filter(id => !own.has(id))),
        paired = new Set(
            organ.centers
                .filter(c => [...external].some(id => findCenter(doc, id).center.node === c.node))
                .map(c => c.id)),
        L = layout(organ, links, paired), slots = regionSlots(doc, organ), esc = escapeText;
  const portHeight = dir =>
      PORTS.margin + Math.ceil(slots.filter(s => s.dir === dir).length / GRAPH.columns) * PORTS.row;
  const above = portHeight('in'), below = portHeight('out');
  for (const p of L.points.values())
    p.y += above;
  L.height += above + below;
  for (const id of external) {
    const cell = findCenter(doc, id).center,
          corresponding = organ.centers.find(c => c.node === cell.node),
          p = L.points.get(corresponding?.id);
    L.points.set(id, {x : GRAPH.width - 65, y : p?.y ?? GRAPH.top + above});
  }
  const editing = state.circuitEditing === organ.id, pending = state.circuitFrom;
  let html =
      '<svg class="aid-region-graph" viewBox="0 0 ' + GRAPH.width + ' ' + L.height +
      '" data-region-graph="' + esc(organ.id) + '">' +
      '<defs><marker id="aid-region-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z"/></marker>' +
      '<marker id="aid-region-bar" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M5 0H7V8H5Z"/></marker></defs>' +
      '<rect class="aid-region-graph-area" x="1" y="1" width="' + (GRAPH.width - 2) + '" height="' +
      (L.height - 2) + '" rx="18" data-select-organ="' + esc(organ.id) + '"><title>' +
      label('inspector.region.whole') + '</title></rect>';
  let portMarks = '';
  for (const dir of ['in', 'out']) {
    const ports = slots.filter(s => s.dir === dir), top = dir === 'in' ? 0 : L.height - below;
    portMarks += '<text class="aid-region-heading" x="15" y="' + (top + 18) + '">' +
                 label('inspector.region.' + (dir === 'in' ? 'inputs' : 'outputs')) + '</text>';
    ports.forEach((slot, i) => {
      const columns = Math.min(GRAPH.columns, ports.length),
            x = GRAPH.side + (GRAPH.width - 2 * GRAPH.side) * (i % columns + .5) / columns,
            y = top + PORTS.top + Math.floor(i / columns) * PORTS.row, p = {x, y};
      for (const cell of slotCenters(organ, slot.key, dir)) {
        const at = L.points.get(cell.id);
        if (at)
          html += '<path class="aid-region-port-branch" d="' +
                  (dir === 'in' ? path(p, at, i) : path(at, p, i)) + '"/>';
      }
      portMarks +=
          '<g class="aid-region-port ' + dir + ' ' + (slot.filled.length ? 'filled' : '') +
          '" data-slot-region="' + esc(organ.id) + '" data-slot-key="' + esc(slot.key) +
          '" data-slot-dir="' + dir + '" transform="translate(' + fixed(x) + ' ' + y + ')">' +
          '<rect x="-12" y="-12" width="24" height="24" rx="7"/>' +
          placedGlyph(slotShape(slot), 18, {}, {line : true}) + namedMark(slotTitle(slot)) + '</g>';
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
    const inhibitory = c?.sign < 0, crossing = own.has(link.from) !== own.has(link.to);
    html += '<g ' + attrs + ' class="aid-region-edge' + (crossing ? ' crossing' : '') +
            (inhibitory ? ' inhibits' : '') + (link.cut ? ' cut' : '') + '">' +
            '<title>' + esc(title) + '</title><path class="aid-region-edge-hit" d="' + d + '"/>' +
            '<path class="aid-region-edge-ink" d="' + d + '" marker-end="url(#aid-region-' +
            (inhibitory ? 'bar' : 'arrow') + ')"/></g>';
  });
  html += portMarks;
  for (const c of [...organ.centers, ...(twin?.centers ?? []).filter(c => external.has(c.id))]) {
    const p = L.points.get(c.id);
    html += '<g class="aid-region-graph-node' + (pending === c.id ? ' pending' : '') +
            (state.selected?.kind === 'center' && state.selected.id === c.id ? ' selected' : '') +
            (!own.has(c.id) ? ' mirrored' : '') + '" data-circuit-node="' + esc(c.id) +
            '" data-circuit-region="' + esc(organ.id) + '" transform="translate(' + fixed(p.x) +
            ' ' + fixed(p.y) + ')">' +
            (!own.has(c.id) ? '<text class="aid-region-heading" text-anchor="middle" y="-22">' +
                                  label('inspector.oppositeSide') + '</text>'
                            : '') +
            '<circle r="' + GRAPH.node + '"/>' + centerMarker(c, 7) + namedMark(centerTitle(c)) +
            '</g>';
  }
  return '<div class="aid-circuit-tools"><button data-circuit-edit="' + esc(organ.id) +
         '" aria-pressed="' + editing + '" title="' + label('inspector.region.edit') +
         '"><svg viewBox="0 0 24 24"><circle cx="4" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="M6 5C18 5 6 19 18 19"/></svg>' +
         label('inspector.region.draw') + '</button></div>' + html + '</svg>';
}
const NODE_MAP = Object.freeze({row : 76, top : 24, bottom : 60});
export function regionNodeMap(state, organ, chosenId) {
  const own = new Set(organ.centers.map(c => c.id));
  const links = routedLinks(state.document, state.sites, true)
                    .filter(l => !l.cut && own.has(l.from) && own.has(l.to));
  const L = layout(organ, links), M = NODE_MAP;
  const at = id => {
    const p = L.points.get(id);
    return {x : p.x, y : M.top + (p.y - GRAPH.top) / GRAPH.row * M.row};
  };
  const rows = Math.round((L.height - 2 * GRAPH.top) / GRAPH.row);
  const height = M.top + M.bottom + rows * M.row;
  const lines = links
                    .map(l => {
                      const a = at(l.from), b = at(l.to);
                      return '<path d="M' + fixed(a.x) + ' ' + fixed(a.y) + ' L' + fixed(b.x) +
                             ' ' + fixed(b.y) + '"/>';
                    })
                    .join('');
  const nodes = organ.centers
                    .map(c => {
                      const p = at(c.id);
                      return '<g class="aid-node-map-node' +
                             (c.id === chosenId ? ' selected' : '') + '" data-select-center="' +
                             escapeText(c.id) + '" transform="translate(' + fixed(p.x) + ' ' +
                             fixed(p.y) + ')"><circle r="' + GRAPH.node + '"/>' +
                             centerMarker(c, 7) + namedMark(centerTitle(c)) + '</g>';
                    })
                    .join('');
  return '<svg class="aid-node-map" viewBox="0 0 ' + GRAPH.width + ' ' + height +
         '" role="group"><g class="aid-node-map-links">' + lines + '</g>' + nodes + '</svg>';
}
