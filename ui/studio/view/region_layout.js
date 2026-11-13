import {BODY_FRAME, findSite, NERVE_ROLE, sideOf, sitePoint} from '../model/layout.js';
import {isRegion, ORGAN_BY_KEY} from '../model/organs.js';
import {routedLinks} from '../model/regions.js';
import {clamp} from '../../units.js';

export {BRAIN, brainHalfWidth} from '../model/anatomy.js';
import {BRAIN, brainHalfWidth, anatomicalPosition, nerveHalfWidth} from '../model/anatomy.js';
const FORMS = Object.freeze({
  olfaction : {part : 0, aspect : .8, rim : [ .06, .38, .5, .45, .34, .2, .04 ]},
  tectum : {part : 1, aspect : 1.25, rim : [ .08, .39, .5, .49, .44, .32, .12 ]},
  value : {part : 2, aspect : 1, rim : [ .12, .41, .37, .5, .37, .43, .12 ]},
  state : {part : 2, aspect : 1.5, rim : [ .08, .32, .48, .43, .48, .32, .08 ]},
  choice : {part : 3, aspect : .9, rim : [ .08, .4, .34, .5, .36, .28, .05 ]},
  motor : {part : 3, aspect : .8, rim : [ .06, .3, .49, .42, .34, .23, .04 ]},
  spine : {part : 4, aspect : 2.6, rim : [ .1, .38, .48, .44, .48, .38, .1 ]}
});
const PACK = Object.freeze({gap : 6, margin : 8, step : 5, shrink : .94, midline : 5});
const CELL = Object.freeze({pitch : 17, padding : 28, columns : 4, along : .55, across : .56});
const homeSite = (organ, sites) => findSite(sites, organ.region?.site ?? organ.centers[0]?.site);
// The cells of each row are put in the order of the cells they are wired to in the other rows,
// row by row, a few times down and up, so that the wiring inside the region crosses itself as
// little as the rows allow.
const UNTANGLE_SWEEPS = 4;
function untangle(rows, links) {
  const row = new Map(rows.flatMap((r, k) => r.cells.map(c => [c.id, k])));
  const partners = new Map();
  for (const {from, to} of links)
    if (row.has(from) && row.has(to) && row.get(from) !== row.get(to))
      for (const [a, b] of [[ from, to ], [ to, from ]])
        partners.set(a, [...(partners.get(a) ?? []), b ]);
  const place = new Map();
  const settle = r => r.cells.forEach((c, i) => place.set(c.id, (i + .5) / r.cells.length));
  rows.forEach(settle);
  const order = r => {
    const wanted = c => {
      const others = partners.get(c.id);
      return others ? others.reduce((sum, id) => sum + place.get(id), 0) / others.length
                    : place.get(c.id);
    };
    const want = new Map(r.cells.map(c => [c.id, wanted(c)]));
    r.cells.sort((a, b) => want.get(a.id) - want.get(b.id) || place.get(a.id) - place.get(b.id));
    settle(r);
  };
  for (let sweep = 0; sweep < UNTANGLE_SWEEPS; ++sweep)
    (sweep % 2 ? [...rows ].reverse() : rows).forEach(order);
}
function contents(organ, links) {
  const form = FORMS[organ.type], rows = [],
        ports = [ 'in', 'none', 'out' ].map(
            port => ({
              port,
              cells : organ.centers.filter(
                  c => (c.port === 'in' || c.port === 'out' ? c.port : 'none') === port)
            }));
  for (const group of ports) {
    const count = Math.ceil(group.cells.length / (organ.type === 'spine' ? 7 : CELL.columns));
    for (let i = 0; i < count; ++i)
      rows.push({
        port : group.port,
        cells : group.cells.slice(Math.floor(i * group.cells.length / count),
                                  Math.floor((i + 1) * group.cells.length / count))
      });
  }
  untangle(rows, links);
  const columns = Math.max(1, ...rows.map(r => r.cells.length));
  const width = (CELL.padding + columns * CELL.pitch) * Math.sqrt(form.aspect);
  const height = (CELL.padding + rows.length * CELL.pitch) / Math.sqrt(form.aspect);
  return {form, ports, rows, columns, width, height};
}
const cache = new WeakMap();
function layout(doc, sites) {
  const old = cache.get(doc);
  if (old?.sites === sites)
    return old.anchors;
  const organs = doc.organs.filter(o => isRegion(o) && o.centers.length && homeSite(o, sites));
  const seen = new Set(), groups = [], links = routedLinks(doc, sites);
  for (const organ of organs) {
    if (seen.has(organ.id))
      continue;
    const pair = organs.find(o => o.id === organ.pair),
          members = pair ? [ organ, pair ] : [ organ ];
    members.forEach(o => seen.add(o.id));
    const plans = members.map(o => contents(o, links)), plan = plans[0];
    groups.push({
      members,
      plan,
      home : sitePoint(homeSite(organ, sites), NERVE_ROLE),
      side : ORGAN_BY_KEY[organ.type].scope === 'side' ? sideOf(organ) : 0,
      width : Math.max(...plans.map(p => p.width)),
      height : Math.max(...plans.map(p => p.height)),
      part : plan.form.part,
      position : organ.position,
      cord : organ.position ? organ.position.x >= BRAIN.cord.from : organ.type === 'spine'
    });
  }
  const C = BRAIN.cerebrum;
  groups.sort((a, b) => Number(!!a.side) - Number(!!b.side) || a.part - b.part ||
                        b.width * b.height - a.width * a.height || a.home.x - b.home.x);
  const anchors = new Map();
  for (const cordOnly of [false, true]) {
    const partition = groups.filter(g => g.cord === cordOnly);
    for (let k = 1;; k *= PACK.shrink) {
      for (const group of partition)
        for (const organ of group.members)
          anchors.delete(organ.id);
      const occupied = [];
      let fits = true;
      for (const group of partition) {
        const {members, side} = group, width = group.width * k, height = group.height * k;
        const gap = PACK.gap * k, cord = group.cord;
        const [from, to] = cord ? [ BRAIN.cord.from, BRAIN.cord.to ]
                                : [ C.from + PACK.margin, C.to - PACK.margin ];
        const native = homeSite(group.members[0], sites);
        const targetX =
            group.cord ? clamp(group.home.x, from, to) : from + (1 - native.u) * (to - from);
        const targetY = cord ? BRAIN.cord.half[1] / 2 : brainHalfWidth(targetX) * .55;
        const candidates = [];
        for (let x = from + width / 2; x <= to - width / 2; x += PACK.step * k) {
          const half =
              cord ? Math.min(nerveHalfWidth(x - width / 2), nerveHalfWidth(x + width / 2))
                   : Math.min(brainHalfWidth(x - width / 2), brainHalfWidth(x + width / 2)) -
                         PACK.margin;
          if (!side) {
            if (height / 2 <= half)
              candidates.push({x, y : BODY_FRAME.middle, score : (x - targetX) ** 2});
          } else
            for (let y = (cord ? 0 : PACK.midline) + height / 2; y + height / 2 <= half;
                 y += PACK.step * k)
              candidates.push({
                x,
                y : BODY_FRAME.middle + side * y,
                score : (x - targetX) ** 2 + (y - targetY) ** 2
              });
        }
        candidates.sort((a, b) => a.score - b.score);
        let chosen;
        for (const p of candidates) {
          const points = members.map(
              o => ({
                id : o.id,
                x : p.x,
                y : members.length > 1 && sideOf(o) !== side ? 2 * BODY_FRAME.middle - p.y : p.y,
                k,
                width,
                height,
                ...contents(o, links),
                side : side ? sideOf(o) : 0
              }));
          for (const point of points) {
            point.width = width;
            point.height = height;
          }
          if (points.some((a, i) => [...occupied, ...points.slice(0, i)].some(
                              b => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
                                   Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap)))
            continue;
          chosen = points;
          break;
        }
        if (!chosen) {
          fits = false;
          break;
        }
        for (const point of chosen) {
          anchors.set(point.id, point);
          occupied.push(point);
        }
      }
      if (fits)
        break;
    }
  }
  for (const organ of organs) {
    if (!organ.position)
      continue;
    const G = anchors.get(organ.id), p = anatomicalPosition(organ.type, organ.position);
    const k = organ.position.scale ?? G.k;
    anchors.set(organ.id, {
      ...G,
      ...p,
      k,
      width : G.width * k / G.k,
      height : G.height * k / G.k,
      side : organ.side === 0 ? 0 : sideOf(organ)
    });
  }
  cache.set(doc, {sites, anchors});
  return anchors;
}
export const regionAnchors = (doc, sites) => layout(doc, sites);
export function regionGeometry(doc, sites, organ) {
  const G = layout(doc, sites).get(organ.id);
  if (!G)
    return {
      x : BODY_FRAME.snout,
      y : BODY_FRAME.middle,
      width : 0,
      height : 0,
      k : 1,
      rows : [],
      ports : [],
      spacing : 0,
      columns : 0
    };
  const across = G.side ? G.width : G.height, along = G.side ? G.height : G.width;
  const spacing = Math.min(
      along * CELL.along / Math.max(1, G.rows.length - 1),
      ...G.rows.map((row, i) => across * rowSpread(G, i) / Math.max(1, row.cells.length - 1)));
  return {...G, spacing};
}
export function regionCell(doc, organ, index, sites) {
  const G = regionGeometry(doc, sites, organ), center = organ.centers[index];
  const row = G.rows.find(r => r.cells.includes(center)), rank = row?.cells.indexOf(center) ?? 0;
  const x = row?.cells.length > 1 ? rank / (row.cells.length - 1) - .5 : 0;
  const y = G.rows.length > 1 ? G.rows.indexOf(row) / (G.rows.length - 1) - .5 : 0;
  return localPoint(G, x * rowSpread(G, G.rows.indexOf(row)), y * CELL.along);
}
export function localPoint(G, x, y) {
  return G.side ? {x : G.x + x * G.width, y : G.y - G.side * y * G.height}
                : {x : G.x + y * G.width, y : G.y + x * G.height};
}
export function regionDock(doc, sites, organ, direction, towards = null) {
  const G = regionGeometry(doc, sites, organ);
  if (towards && Math.hypot(towards.x - G.x, towards.y - G.y) > 1) {
    const d = {x : towards.x - G.x, y : towards.y - G.y}, rim = regionRim(G);
    const cross = (a, b) => a.x * b.y - a.y * b.x;
    let distance = Infinity;
    for (let i = 0; i < rim.length; i++) {
      const a = {x : rim[i].x - G.x, y : rim[i].y - G.y}, b = rim[(i + 1) % rim.length],
            edge = {x : b.x - rim[i].x, y : b.y - rim[i].y}, denominator = cross(d, edge);
      if (Math.abs(denominator) < 1e-9)
        continue;
      const t = cross(a, edge) / denominator, u = cross(a, d) / denominator;
      if (t > 0 && u >= 0 && u <= 1)
        distance = Math.min(distance, t);
    }
    if (Number.isFinite(distance))
      return {x : G.x + d.x * distance, y : G.y + d.y * distance};
  }
  return localPoint(G, 0, direction === 'in' ? -.46 : .46);
}
function rimWidths(G) {
  const sizes = G.rows.map(r => r.cells.length), biggest = Math.max(1, ...sizes);
  return G.form.rim.map((radius, i, rim) => {
    const row = Math.round(i / (rim.length - 1) * (sizes.length - 1));
    return radius * (.84 + .16 * (sizes[row] ?? 0) / biggest);
  });
}
function rowSpread(G, index) {
  const y = G.rows.length > 1 ? (index / (G.rows.length - 1) - .5) * CELL.along : 0;
  const widths = rimWidths(G), at = (y + .5) * (widths.length - 1), lo = Math.floor(at),
        t = at - lo;
  return Math.min(CELL.across,
                  1.36 * (widths[lo] * (1 - t) + widths[Math.min(lo + 1, widths.length - 1)] * t));
}
export function regionRim(G) {
  const half = rimWidths(G);
  const side = sign => half.map((r, i) => localPoint(G, sign * r, i / (half.length - 1) - .5));
  return [...side(1), ...side(-1).reverse() ];
}
