import {BODY_FRAME, findSite, NERVE_ROLE, sideOf, sitePoint} from '../model/layout.js';
import {isRegion, ORGAN_BY_KEY} from '../model/organs.js';
import {clamp} from '../../units.js';

export const BRAIN = Object.freeze({
  cerebrum : {from : 220, to : 586, half : 202, front : .9, full : .35, lobes : 5, bulge : .13},
  cerebellum : {x : 574, rx : 28, ry : 55, folia : 5, bow : .25},
  cord : {from : 590, to : 875, half : [ 32, 27 ], end : 14, segments : 12},
  edge : 2.4
});
const FORMS = Object.freeze({
  olfaction : {part : 0, aspect : .8, rim : [ .06, .38, .5, .45, .34, .2, .04 ]},
  tectum : {part : 1, aspect : 1.25, rim : [ .08, .39, .5, .49, .44, .32, .12 ]},
  value : {part : 2, aspect : 1, rim : [ .12, .41, .37, .5, .37, .43, .12 ]},
  state : {part : 2, aspect : 1.5, rim : [ .08, .32, .48, .43, .48, .32, .08 ]},
  choice : {part : 3, aspect : .9, rim : [ .08, .4, .34, .5, .36, .28, .05 ]},
  motor : {part : 3, aspect : .8, rim : [ .06, .3, .49, .42, .34, .23, .04 ]},
  spine : {part : 4, aspect : 2.6, rim : [ .1, .38, .48, .44, .48, .38, .1 ]}
});
const PACK = Object.freeze({gap : 7, margin : 12, step : 5, shrink : .94, midline : 14});
const CELL = Object.freeze({pitch : 17, padding : 28, columns : 4, along : .55, across : .56});
const homeSite = (organ, sites) => findSite(sites, organ.region?.site ?? organ.centers[0]?.site);
export function brainHalfWidth(x) {
  const C = BRAIN.cerebrum, u = clamp((x - C.from) / (C.to - C.from));
  return C.half * Math.sin(Math.PI * u) ** C.full * (C.front + (1 - C.front) * u);
}
function contents(organ) {
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
  const seen = new Set(), groups = [];
  for (const organ of organs) {
    if (seen.has(organ.id))
      continue;
    const pair = organs.find(o => o.id === organ.pair),
          members = pair ? [ organ, pair ] : [ organ ];
    members.forEach(o => seen.add(o.id));
    const plans = members.map(contents), plan = plans[0];
    groups.push({
      members,
      plan,
      home : sitePoint(homeSite(organ, sites), NERVE_ROLE),
      side : ORGAN_BY_KEY[organ.type].scope === 'side' ? sideOf(organ) : 0,
      width : Math.max(...plans.map(p => p.width)),
      height : Math.max(...plans.map(p => p.height)),
      part : plan.form.part
    });
  }
  // Area determines each lobe's share of the head. Paired regions occupy mirrored places;
  // a single state region reserves the midline before either hemisphere is packed.
  const weights = Array.from(
      {length : 4},
      (_, part) => groups.filter(g => g.part === part).reduce((n, g) => n + g.width * g.height, 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const C = BRAIN.cerebrum, span = C.to - C.from - 2 * PACK.margin;
  let edge = C.from + PACK.margin;
  const lobes = weights.map(w => {
    const from = edge;
    edge += span * w / total;
    return [ from, edge ];
  });
  groups.sort((a, b) => Number(!!a.side) - Number(!!b.side) || a.part - b.part ||
                        b.width * b.height - a.width * a.height || a.home.x - b.home.x);
  const anchors = new Map();
  for (const cordOnly of [false, true]) {
    const partition = groups.filter(g => (g.part === 4) === cordOnly);
    for (let k = 1;; k *= PACK.shrink) {
      for (const group of partition)
        for (const organ of group.members)
          anchors.delete(organ.id);
      const occupied = [];
      let fits = true;
      for (const group of partition) {
        const {members, side, part} = group, width = group.width * k, height = group.height * k;
        const gap = PACK.gap * k, cord = part === 4;
        const [from, to] = cord ? [ BRAIN.cord.from, BRAIN.cord.to ] : lobes[part];
        const preference = clamp((group.home.x - C.from) / (C.to - C.from));
        const targetX = cord ? clamp(group.home.x, from, to)
                             : (from + to) / 2 + (preference - .5) * (to - from) * .6;
        const targetY = cord ? BRAIN.cord.half[1] / 2 : brainHalfWidth(targetX) * .55;
        const candidates = [];
        for (let x = from + width / 2; x <= to - width / 2; x += PACK.step * k) {
          const half =
              cord ? BRAIN.cord.half[1]
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
                ...contents(o),
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
export function regionDock(doc, sites, organ, direction) {
  const G = regionGeometry(doc, sites, organ);
  return localPoint(G, 0, direction === 'in' ? -.48 : .48);
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

const hull = points => {
  const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const chain = list => {
    const result = [];
    for (const p of list) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0)
        result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...chain(sorted), ...chain(sorted.toReversed()) ];
};
const lobeCache = new WeakMap();
export function brainLobes(doc, sites) {
  const old = lobeCache.get(doc);
  if (old?.sites === sites)
    return old.lobes;
  const groups = new Map();
  for (const organ of doc.organs.filter(o => isRegion(o) && o.centers.length)) {
    const G = regionGeometry(doc, sites, organ), key = G.form.part + ':' + G.side;
    if (!groups.has(key))
      groups.set(key, {
        key,
        part : G.form.part,
        side : G.side,
        organs : [],
        points : [],
        type : organ.type,
        types : new Set()
      });
    const group = groups.get(key);
    group.organs.push(organ.id);
    group.types.add(organ.type);
    group.points.push(...regionRim({...G, width : G.width + 12, height : G.height + 12}));
  }
  const lobes = [...groups.values() ].map(group => {
    const xs = group.points.map(p => p.x), ys = group.points.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys),
          bottom = Math.max(...ys);
    return {
      ...group,
      x : (left + right) / 2,
      y : (top + bottom) / 2,
      width : right - left,
      height : bottom - top,
      points : hull(group.points)
    };
  });
  lobeCache.set(doc, {sites, lobes});
  return lobes;
}
export function lobeOf(doc, sites, organ) {
  return brainLobes(doc, sites).find(lobe => lobe.organs.includes(organ.id));
}
