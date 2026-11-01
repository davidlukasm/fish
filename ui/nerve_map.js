import './tissue.js';
import {NEURON} from './schema.js';
// View of the brain plan (ui/brain_plan.js) as a metro map: organ stations at fixed anchors, hubs
// placed between what they connect, the plan's lines drawn octilinearly with their own tracks.
// Also the hormone weather and the full thought log of the inspected fish.
// Wording comes from ui/text/de/nerve_map.json (interface) and ui/text/de-AT/thoughts.json.
import {tissueColor} from './brain_model.js';
import {el} from './dom.js';
import {hormoneColors, hormoneEffect, hormoneName} from './hormones.js';
import {command} from './session.js';
import {PERCENT, percent, t, textArea} from './strings.js';
import {STATION, hormoneEffects, planFor, stationNames, updatePlanLive} from './brain_plan.js';
import {moodFor, notePoke} from './mind.js';
import {renderThoughtList} from './thought_view.js';
import {HELD_ACTION_SECONDS, stepsInSeconds} from './state.js';
export const nerve_mapState = {};

const NS = 'http://www.w3.org/2000/svg';
const BODY = 'M150 10C214 12 266 88 281 186C292 268 252 398 178 518L214 594Q150 566 86 594' +
             'L122 518C48 398 8 268 19 186C34 88 86 12 150 10Z';
// Organ stations: [anchor x, anchor y, organ key, family]
// Where organ stations sit on the map: the head at the top, the tail at the bottom.
const ANCHORS = {
  suck : [ 118, 30 ],
  bite : [ 182, 30 ],
  noseL : [ 82, 62 ],
  noseR : [ 218, 62 ],
  touch : [ 150, 72 ],
  eyeL : [ 54, 112 ],
  eyeR : [ 246, 112 ],
  latL : [ 30, 220 ],
  latR : [ 270, 220 ],
  turnL : [ 40, 318 ],
  turnR : [ 260, 318 ],
  gut : [ 62, 384 ],
  hsense : [ 238, 384 ],
  spines : [ 84, 440 ],
  pigment : [ 216, 440 ],
  bladder : [ 122, 476 ],
  gland : [ 178, 476 ],
  egg : [ 116, 522 ],
  sperm : [ 184, 522 ],
  tail : [ 150, 566 ]
};
export const LINE_COLORS = [
  '#e8a33d', '#5fb3d9', '#d46a8c', '#7cc47f', '#a58be0', '#e0c85a', '#4fc0b0', '#e07f5f', '#8fa7e8',
  '#c9a3c9', '#9cc95f', '#d99a6c'
];
const HORMONE_SPOTS = [ [ 92, 150 ], [ 208, 150 ], [ 104, 420 ], [ 196, 420 ] ];

const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};
const clampedPercent = x => percent(clamp(x));

function stationColor(meta) {
  if (meta.kind === STATION.hub)
    return '#d8e2e6';
  return tissueColor(meta.organ);
}

// Hubs sit between whatever they connect; the same wiring always gives the same picture.
// Hubs settle between the stations they link over ROUNDS rounds, keep MIN_GAP apart inside the
// body, then snap to SNAP and move to a free grid place CLEARANCE from other stations.
const HUB_PLACE = Object.freeze({
  center : 150,
  spread : 40,
  columns : 3,
  top : 200,
  step : 50,
  rounds : 60,
  pull : .5,
  min_gap : 78,
  left : 56,
  right : 244,
  upper : 140,
  lower : 470,
  grid : 24,
  snap : 10,
  clearance : 34
});
function placeHubs(meta, pairs) {
  const hubs = [...meta.values() ].filter(m => m.kind === STATION.hub);
  hubs.forEach((h, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (const p of pairs.values()) {
      const other = p.from === h.id ? p.to : p.to === h.id ? p.from : '';
      if (other && meta.get(other).kind !== STATION.hub) {
        sx += p.sum * meta.get(other).x;
        sy += p.sum * meta.get(other).y;
        sw += p.sum;
      }
    }
    [h.x, h.y] = sw ? [ sx / sw, sy / sw ] : [
      HUB_PLACE.center + HUB_PLACE.spread * ((i % HUB_PLACE.columns) - 1),
      HUB_PLACE.top + HUB_PLACE.step * i
    ];
  });
  for (let round = 0; round < HUB_PLACE.rounds; round++) {
    for (const h of hubs) {
      let sx = 0, sy = 0, sw = 0;
      for (const p of pairs.values()) {
        const other = p.from === h.id ? p.to : p.to === h.id ? p.from : '';
        if (other) {
          sx += p.sum * meta.get(other).x;
          sy += p.sum * meta.get(other).y;
          sw += p.sum;
        }
      }
      if (sw) {
        h.x = HUB_PLACE.pull * h.x + HUB_PLACE.pull * sx / sw;
        h.y = HUB_PLACE.pull * h.y + HUB_PLACE.pull * sy / sw;
      }
    }
    hubs.forEach((a, i) => hubs.slice(i + 1).forEach((c, j) => {
      let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 1)
        [dx, dy, d] = [ Math.cos(i + j), Math.sin(i + j), 1 ];
      if (d < HUB_PLACE.min_gap) {
        const push = (HUB_PLACE.min_gap - d) / 2;
        a.x -= dx / d * push;
        a.y -= dy / d * push;
        c.x += dx / d * push;
        c.y += dy / d * push;
      }
    }));
    for (const h of hubs) {
      h.x = Math.max(HUB_PLACE.left, Math.min(HUB_PLACE.right, h.x));
      h.y = Math.max(HUB_PLACE.upper, Math.min(HUB_PLACE.lower, h.y));
    }
  }
  const taken = [...meta.values() ].filter(m => m.kind !== STATION.hub);
  // Free places around a hub: itself, its eight neighbours one grid step away, then two steps
  // along the axes.
  const g = HUB_PLACE.grid, steps = [
    [ 0, 0 ], [ g, 0 ], [ -g, 0 ], [ 0, g ], [ 0, -g ], [ g, g ], [ -g, g ], [ g, -g ], [ -g, -g ],
    [ 2 * g, 0 ], [ -2 * g, 0 ], [ 0, 2 * g ], [ 0, -2 * g ]
  ];
  for (const h of hubs.sort((p, q) => q.size - p.size)) {
    const x = Math.round(h.x / HUB_PLACE.snap) * HUB_PLACE.snap,
          y = Math.round(h.y / HUB_PLACE.snap) * HUB_PLACE.snap,
          free =
              steps.find(([ dx, dy ]) => taken.every(t => Math.hypot(t.x - x - dx, t.y - y - dy) >=
                                                          HUB_PLACE.clearance)) ||
              [ 0, 0 ];
    h.x = x + free[0];
    h.y = y + free[1];
    taken.push(h);
  }
}

// Octilinear like a metro map. Three shapes per section: diagonal in the middle, at the end or
// at the start; the drawing picks the one that crosses and covers the least.
function octilinearShapes(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx),
        sy = Math.sign(dy), shapes = [];
  if (ay >= ax) {
    const s = sy * (ay - ax);
    shapes.push([ [ a.x, a.y ], [ a.x, a.y + s / 2 ], [ b.x, b.y - s / 2 ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x, a.y + s ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ b.x, a.y + sy * ax ], [ b.x, b.y ] ]);
  } else {
    const s = sx * (ax - ay);
    shapes.push([ [ a.x, a.y ], [ a.x + s / 2, a.y ], [ b.x - s / 2, b.y ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x + s, a.y ], [ b.x, b.y ] ],
                [ [ a.x, a.y ], [ a.x + sx * ay, b.y ], [ b.x, b.y ] ]);
  }
  return shapes.map(pts => pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0],
                                                                 p[1] - pts[i - 1][1]) > .5));
}

// Parallel track beside the centre line; the side stays the same on screen whichever way a line
// is travelled, so lines sharing a corridor never swap places.
function offsetPolyline(pts, o) {
  if (!o || pts.length < 2)
    return pts;
  const last = pts[pts.length - 1],
        flip = last[1] - pts[0][1] < 0 || (last[1] === pts[0][1] && last[0] < pts[0][0]),
        s = flip ? -o : o, normals = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1],
          l = Math.hypot(dx, dy) || 1;
    normals.push([ -dy / l * s, dx / l * s ]);
  }
  const out = [ [ pts[0][0] + normals[0][0], pts[0][1] + normals[0][1] ] ];
  for (let i = 1; i < pts.length - 1; i++) {
    const n = normals[i - 1], m = [ n[0] + normals[i][0], n[1] + normals[i][1] ],
          dot = (m[0] * n[0] + m[1] * n[1]) / (s * s);
    out.push([ pts[i][0] + m[0] / dot, pts[i][1] + m[1] / dot ]);
  }
  const n = normals[normals.length - 1];
  out.push([ last[0] + n[0], last[1] + n[1] ]);
  return out;
}

const pathData = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');

function octilinear(a, b) { return pathData(octilinearShapes(a, b)[0]); }

// Samples of drawn lines on a coarse grid: who runs where and in which direction.
// Lines are sampled every STEP map units in one of four directions.
const SAMPLES = Object.freeze({step : 3});
function samples(pts, step = SAMPLES.step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [ x1, y1 ] = pts[i], l = Math.hypot(x1 - x0, y1 - y0),
               dir = Math.round(((Math.atan2(y1 - y0, x1 - x0) + Math.PI) % Math.PI) /
                                (Math.PI / 4)) %
                     4;
    for (let t = 0; t <= l; t += step)
      out.push([ x0 + (x1 - x0) * t / l, y0 + (y1 - y0) * t / l, dir ]);
  }
  return out;
}
// Lines are tracked in square cells of GRID_CELL map units; the map is MAP_WIDTH by MAP_HEIGHT.
const GRID_CELL = 4, MAP_WIDTH = 300, MAP_HEIGHT = 600;
const cell = (x, y) => Math.round(x / GRID_CELL) + ',' + Math.round(y / GRID_CELL);

function node(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {}))
    e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

// Side tracks a section may take, in map units off its centre line.
const TRACKS = Object.freeze([ 0, 4.8, -4.8, 9.6, -9.6 ]);
// The map is laid out in units around CENTER; lines whose weight reaches MAJOR of the first are
// major; sections pick the track and shape with the least cost; LINKS footpaths more.
const MAP = Object.freeze({
  hue_step : 53,
  hue_start : 200,
  saturation : 45,
  lightness : 66,
  major : .35,
  cloud : 60,
  parallel_cost : 4,
  cross_cost : .35,
  major_width : 4,
  width : 2.6,
  offset_cost : .25,
  shape_cost : .3,
  casing : 3.4,
  train : .7,
  link_min : .08,
  links : 40,
  hub_radius : 7,
  transfer_radius : 6,
  radius : 5,
  max_reach : 5,
  halo : 6,
  label : 2.2,
  transfer_ring : '#16262c'
});
function buildPlan(model, svg) {
  const meta = new Map(), pairs = model.pairs, members = model.members;
  for (const m of model.meta.values()) {
    const [x, y] = m.kind === STATION.hub ? [ MAP_WIDTH / 2, MAP_HEIGHT / 2 ] : ANCHORS[m.id];
    meta.set(m.id, {...m, x, y, ...stationNames(m)});
  }
  placeHubs(meta, pairs);
  const max = model.max,
        routes = model.routes.map(
            (r, i) => ({
              ...r,
              badge : String(i + 1),
              name : t('nerve_map.line', {n : i + 1}),
              color : LINE_COLORS[i] || `hsl(${(i * MAP.hue_step + MAP.hue_start) % 360} ${
                                            MAP.saturation}% ${MAP.lightness}%)`,
              major : r.weight >= MAP.major * model.routes[0].weight
            }));
  svg.replaceChildren();
  const defs = node('defs', {}, svg);
  node('path', {d : BODY}, node('clipPath', {id : 'nm-clip'}, defs));
  hormoneColors.forEach((color, k) => {
    const g = node('radialGradient', {id : 'nm-h' + k}, defs);
    node('stop', {offset : '0', 'stop-color' : color, 'stop-opacity' : '.75'}, g);
    node('stop', {offset : '1', 'stop-color' : color, 'stop-opacity' : '0'}, g);
  });
  node('path', {d : BODY, class : 'nm-body'}, svg);
  const weather = node('g', {'clip-path' : 'url(#nm-clip)'}, svg),
        clouds = HORMONE_SPOTS.map(
            ([ x, y ], k) => node(
                'circle', {cx : x, cy : y, r : MAP.cloud, fill : `url(#nm-h${k})`, opacity : 0},
                weather));
  const linkLayer = node('g', {}, svg), lineLayer = node('g', {}, svg),
        stationLayer = node('g', {}, svg), segs = [];
  // Each section takes the shape and side track that cover and cross the fewest other lines;
  // lines sharing a corridor run side by side, crossings get a gap from the dark casing.
  const grid = new Map(), onRoute = new Set(), reach = new Map();
  const cost = (pts, r) => {
    let c = 0;
    for (const [x, y, dir] of samples(pts))
      for (const hit of grid.get(cell(x, y)) || [])
        if (hit.route !== r)
          c += hit.dir === dir ? MAP.parallel_cost : MAP.cross_cost;
    return c;
  };
  for (const r of routes) {
    r.segs = [];
    for (let i = 1; i < r.path.length; i++) {
      const from = r.path[i - 1], to = r.path[i], ahead = pairs.get(from + '>' + to),
            back = pairs.get(to + '>' + from),
            pair = !back || ahead?.sum >= back.sum ? ahead : back,
            width = r.major ? MAP.major_width : MAP.width;
      let best = null;
      octilinearShapes(meta.get(from), meta.get(to)).forEach((shape, k) => {
        for (const o of TRACKS) {
          const pts = offsetPolyline(shape, o),
                c = cost(pts, r) + Math.abs(o) * MAP.offset_cost + k * MAP.shape_cost;
          if (!best || c < best.c)
            best = {c, pts, o};
        }
      });
      for (const [x, y, dir] of samples(best.pts))
        for (const [dx, dy] of [[ 0, 0 ], [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ]]) {
          const key = cell(x + dx * GRID_CELL, y + dy * GRID_CELL);
          if (!grid.has(key))
            grid.set(key, []);
          grid.get(key).push({route : r, dir});
        }
      for (const id of [from, to])
        reach.set(id, Math.max(reach.get(id) || 0, Math.abs(best.o)));
      const d = pathData(best.pts), g = node('g', {class : 'nm-route'}, lineLayer),
            seg = {route : r, pair, from, to, group : g, dir : pair.from === from ? 1 : -1};
      onRoute.add(ahead?.key).add(back?.key);
      seg.learnPath = node('path', {d, class : 'nm-learn', 'stroke-width' : width}, g);
      node('path', {d, class : 'nm-casing', 'stroke-width' : width + MAP.casing}, g);
      node('path', {d, class : 'nm-line', stroke : r.color, 'stroke-width' : width}, g);
      seg.train = node('path', {d, class : 'nm-train', 'stroke-width' : width * MAP.train}, g);
      seg.offset = 0;
      g.addEventListener('pointerenter', () => hoverSegment(seg));
      g.addEventListener('pointerleave', () => hoverStation(''));
      segs.push(seg);
      r.segs.push(seg);
    }
  }
  // Remaining notable connections: thin footpaths without trains.
  const links = [...pairs.values() ]
                    .filter(p => !onRoute.has(p.key) && p.sum > MAP.link_min * max)
                    .sort((p, q) => q.sum - p.sum)
                    .slice(0, MAP.links)
                    .map(p => {
                      const g = node('g', {class : 'nm-route'}, linkLayer),
                            link = {pair : p, from : p.from, to : p.to, group : g};
                      node('path', {
                        d : octilinear(meta.get(p.from), meta.get(p.to)),
                        class : 'nm-link' + (p.plus < p.sum / 2 ? ' nm-inhibitory' : '')
                      },
                           g);
                      g.addEventListener('pointerenter', () => hoverSegment(link));
                      g.addEventListener('pointerleave', () => hoverStation(''));
                      return link;
                    });
  const stations = new Map();
  for (const [id, ids] of members) {
    const m = meta.get(id), lines = routes.filter(r => r.path.includes(id)),
          transfer = lines.length > 1,
          r = (m.kind === STATION.hub ? MAP.hub_radius
               : transfer             ? MAP.transfer_radius
                                      : MAP.radius) +
              Math.min(MAP.max_reach, reach.get(id) || 0),
          linked = lines.length || [...pairs.values() ].some(p => (p.from === id || p.to === id) &&
                                                                  p.sum > MAP.link_min * max),
          g = node('g', {
            class : 'nm-station' + (linked ? '' : ' nm-unlinked'),
            transform : `translate(${m.x} ${m.y})`,
            tabindex : 0
          },
                   stationLayer);
    g.style.setProperty('--station', lines[0]?.color || stationColor(m));
    const halo = node('circle', {r : r + MAP.halo, class : 'nm-halo', opacity : 0}, g),
          pulse = node('circle', {r, class : 'nm-pulse'}, g);
    node('circle', {
      r,
      class : 'nm-ring' + (transfer ? ' nm-transfer' : ''),
      stroke : transfer ? MAP.transfer_ring : lines[0]?.color || stationColor(m)
    },
         g);
    if (m.kind !== STATION.hub)
      node('circle', {r : MAP.label, fill : stationColor(m)}, g);
    const label = node('text', {class : m.kind === STATION.hub ? 'nm-hub' : ''}, g);
    label.textContent = m.label;
    const title = node('title', {}, g);
    stations.set(id, {id, g, halo, pulse, title, ids, activity : 0, label, r, x : m.x, y : m.y});
    g.addEventListener('pointerenter', () => hoverStation(id));
    g.addEventListener('pointerleave', () => hoverStation(''));
    g.addEventListener('click', () => pokeStation(id));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ')
        pokeStation(id);
    });
  }
  placeLabels([...stations.values() ], grid);
  const plan =
      {model, station : model.station, meta, pairs, routes, segs, links, stations, clouds, max};
  renderLegend(plan);
  return plan;
}

// Labels go where they cover no other label or station and as few lines as possible.
// Labels try eight places around their station and take the one that overlaps least with other
// labels, stations, the map edge and lines.
const LABEL = Object.freeze({
  margin : 2,
  hub_char : 5,
  char : 4.6,
  pad : 2,
  height : 9,
  below : 9,
  side : 3,
  baseline : 3,
  above : 3,
  corner : 2,
  corner_below : 8,
  box_below : 2,
  order_cost : .5,
  overlap_cost : 100,
  station_cost : 60,
  edge_cost : 40,
  line_cost : .8
});
function placeLabels(stations, grid) {
  const boxes = [], hits = (a, c) => a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3];
  for (const s of stations.sort((p, q) => q.r - p.r)) {
    const w = s.label.textContent.length *
                  (s.label.classList.contains('nm-hub') ? LABEL.hub_char : LABEL.char) +
              LABEL.pad,
          h = LABEL.height, r = s.r;
    let best = null;
    [[ 0, r + LABEL.below, 'middle' ], [ r + LABEL.side, LABEL.baseline, 'start' ],
     [ -r - LABEL.side, LABEL.baseline, 'end' ], [ 0, -r - LABEL.above, 'middle' ],
     [ r + LABEL.corner, r + LABEL.corner_below, 'start' ],
     [ -r - LABEL.corner, r + LABEL.corner_below, 'end' ], [ r + LABEL.corner, -r - 1, 'start' ],
     [ -r - LABEL.corner, -r - 1, 'end' ]]
        .forEach(([ dx, dy, anchor ], k) => {
          const left = s.x + dx -
                       (anchor === 'middle' ? w / 2
                        : anchor === 'end'  ? w
                                            : 0),
                box = [ left, s.y + dy - h + 1, left + w, s.y + dy + LABEL.box_below ];
          let c = k * LABEL.order_cost;
          for (const other of boxes)
            if (hits(box, other))
              c += LABEL.overlap_cost;
          for (const t of stations)
            if (t !== s && hits(box, [ t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r ]))
              c += LABEL.station_cost;
          if (box[0] < LABEL.margin || box[2] > MAP_WIDTH - LABEL.margin || box[1] < LABEL.margin ||
              box[3] > MAP_HEIGHT - LABEL.margin)
            c += LABEL.edge_cost;
          for (let x = box[0]; x <= box[2]; x += GRID_CELL)
            for (let y = box[1]; y <= box[3]; y += GRID_CELL)
              c += (grid.get(cell(x, y)) || []).length ? LABEL.line_cost : 0;
          if (!best || c < best.c)
            best = {c, dx, dy, anchor, box};
        });
    boxes.push(best.box);
    s.label.setAttribute('x', best.dx);
    s.label.setAttribute('y', best.dy);
    s.label.style.textAnchor = best.anchor;
  }
}

// Legend flashes last FLASH ms.
const LEGEND = Object.freeze({flash : 6000});
function renderLegend(plan) {
  const box = el('nerve-lines');
  if (!box)
    return;
  box.replaceChildren();
  for (const r of plan.routes) {
    const item = document.createElement('button'), badge = document.createElement('b'),
          text = document.createElement('span');
    item.type = 'button';
    item.className = 'nerve-line';
    badge.textContent = r.badge;
    badge.style.background = r.color;
    text.textContent = t('nerve_map.legend', {
      from : plan.meta.get(r.path[0]).name,
      to : plan.meta.get(r.path[r.path.length - 1]).name,
      count : r.path.length
    });
    item.append(badge, text);
    item.title = r.path.map(id => plan.meta.get(id).name).join(' → ');
    item.onclick = () => {
      nerve_mapState.focus = {
        stations : new Set(r.path),
        segs : new Set(r.segs),
        until : performance.now() + LEGEND.flash
      };
    };
    box.append(item);
  }
}

function stationText(plan, s) {
  return t('nerve_map.station', {
    name : plan.meta.get(s.id).name,
    cells : s.ids.length,
    active : clampedPercent(plan.model.activity.get(s.id) || 0)
  });
}
// Hovered stations name their first NAMES links in and out.
const HOVER_STATION = Object.freeze({names : 3});
function hoverStation(id) {
  nerve_mapState.hover = id ? {stations : new Set([ id ]), segs : null} : null;
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), info = el('nerve-map-info');
  if (!info)
    return;
  if (!s) {
    info.textContent = t('nerve_map.hint');
    return;
  }
  const name = x => plan.meta.get(x).name,
        into = [...plan.pairs.values() ].filter(p => p.to === id).sort((p, q) => q.sum - p.sum),
        out = [...plan.pairs.values() ].filter(p => p.from === id).sort((p, q) => q.sum - p.sum),
        lines = plan.routes.filter(r => r.path.includes(id)).map(r => r.name);
  info.textContent =
      stationText(plan, s) +
      (lines.length ? t('nerve_map.stationLines', {lines : lines.join(', ')}) : '') +
      (into.length
           ? t('nerve_map.stationIn',
               {names : into.slice(0, HOVER_STATION.names).map(p => name(p.from)).join(', ')})
           : '') +
      (out.length ? t('nerve_map.stationOut',
                      {names : out.slice(0, HOVER_STATION.names).map(p => name(p.to)).join(', ')})
                  : '');
}

// Hovered sections share their weight from MIN_WEIGHT on.
const HOVER_SEGMENT = Object.freeze({min_weight : .001});
function hoverSegment(seg) {
  const plan = nerve_mapState.plan, p = seg.pair;
  nerve_mapState.hover = {stations : new Set([ seg.from, seg.to ]), segs : new Set([ seg ])};
  el('nerve-map-info').textContent =
      t('nerve_map.pair', {
        line : seg.route ? t('nerve_map.pairLine', {name : seg.route.name}) : '',
        from : plan.meta.get(p.from).name,
        to : plan.meta.get(p.to).name,
        synapses : p.edges.length,
        excitatory : clampedPercent(p.plus / (p.sum || 1)),
        flow : (p.flow >= 0 ? '+' : '−') + clampedPercent(Math.abs(p.flow))
      }) +
      (p.learned > HOVER_SEGMENT.min_weight
           ? t('nerve_map.pairLearned', {learned : clampedPercent(p.learned)})
           : '');
}

async function pokeStation(id) {
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), nodes = nerve_mapState.nodes;
  if (!s || !nodes)
    return;
  const ids = s.ids.filter(i => nodes.get(i)?.[NEURON.functional] && nodes.get(i)?.[NEURON.ready] &&
                                !nodes.get(i)?.[NEURON.muted]);
  if (!ids.length)
    return;
  s.pulse.classList.remove('nm-poke');
  void s.pulse.getBBox?.();
  s.pulse.classList.add('nm-poke');
  if (await command('stimulate',
                    {neurons : ids, amount : 1, steps : stepsInSeconds(HELD_ACTION_SECONDS)}))
    notePoke(id);
}

function highlight(plan, now) {
  const h =
      nerve_mapState.hover ||
      (nerve_mapState.focus && now < nerve_mapState.focus.until ? nerve_mapState.focus : null);
  if (plan.highlighted === h)
    return;
  plan.highlighted = h;
  for (const s of plan.stations.values())
    s.g.classList.toggle('nm-dim', !!h && !h.stations.has(s.id));
  for (const seg of [...plan.segs, ...plan.links]) {
    const a = h?.stations.has(seg.from), c = h?.stations.has(seg.to),
          shown = !h || (h.segs                          ? h.segs.has(seg)
                         : h.pair && h.stations.size > 1 ? a && c
                                                         : a || c);
    seg.group.classList.toggle('nm-dim', !shown);
  }
}

// Live state from the plan model: station activity as halos, signal flow as moving trains.
// Live state: station halos with activity, trains with the flow, learning glow and hormone clouds.
const LIVE = Object.freeze({
  halo : .6,
  halo_gain : 1.4,
  digits : 2,
  flow_gain : 2.5,
  min_train : .06,
  train : .2,
  train_span : .8,
  learn_width : 6,
  learn_width_per_value : 9,
  learn_gain : 4,
  min_learned : .002,
  learn_alpha : .25,
  learn_alpha_span : .6,
  cloud : 45,
  cloud_span : 95,
  cloud_alpha : .08,
  cloud_alpha_span : .7
});
function updateLive(b, plan) {
  for (const s of plan.stations.values()) {
    s.halo.setAttribute('opacity',
                        (LIVE.halo * clamp((plan.model.activity.get(s.id) || 0) * LIVE.halo_gain))
                            .toFixed(LIVE.digits));
    s.title.textContent = stationText(plan, s);
  }
  for (const seg of plan.segs) {
    const strength = clamp(Math.abs(seg.pair.flow) * LIVE.flow_gain);
    seg.train.setAttribute('opacity',
                           (strength > LIVE.min_train ? LIVE.train + LIVE.train_span * strength : 0)
                               .toFixed(LIVE.digits));
    seg.train.classList.toggle('nm-brake', seg.pair.flow < 0);
    seg.learnPath.setAttribute(
        'stroke-width',
        (LIVE.learn_width + LIVE.learn_width_per_value * clamp(seg.pair.learned * LIVE.learn_gain))
            .toFixed(1));
    seg.learnPath.setAttribute(
        'opacity',
        seg.pair.learned > LIVE.min_learned
            ? LIVE.learn_alpha + LIVE.learn_alpha_span * clamp(seg.pair.learned * LIVE.learn_gain)
            : 0);
  }
  const levels = b.hormones?.levels || [];
  plan.clouds.forEach((c, k) => {
    const v = clamp(levels[k]);
    c.setAttribute('r', (LIVE.cloud + LIVE.cloud_span * v).toFixed(0));
    c.setAttribute('opacity', (LIVE.cloud_alpha + LIVE.cloud_alpha_span * v).toFixed(LIVE.digits));
  });
}
// Trains run at SPEED plus SPEED_PER_FLOW map units per second; frames count at most MAX_DT s.
const TRAINS =
    Object.freeze({max_dt : .1, ms : 1000, speed : 8, speed_per_flow : 70, dash_period : 1000});
function moveTrains(plan, now) {
  const dt = Math.min(TRAINS.max_dt, (now - (plan.movedAt || now)) / TRAINS.ms);
  plan.movedAt = now;
  for (const seg of plan.segs) {
    const flow = seg.pair.flow;
    seg.offset -= seg.dir * Math.sign(flow || 1) *
                  (TRAINS.speed + TRAINS.speed_per_flow * clamp(Math.abs(flow) * LIVE.flow_gain)) *
                  dt;
    seg.train.setAttribute('stroke-dashoffset', (seg.offset % TRAINS.dash_period).toFixed(1));
  }
}

// Hormone weather: a sky symbol filling with the level.
const SKY = Object.freeze([ [ .15, '○' ], [ .4, '◔' ], [ .65, '◑' ], [ .85, '◕' ] ]),
      FULL_SKY = '●';
// Levels trend up or down past TREND; the slow level keeps SLOW of itself per update; effects
// from SHOWN on are listed with DIGITS significant digits.
const WEATHER = Object.freeze({trend : .01, slow : .95, slow_share : .05, digits : 2, shown : .03});
function renderWeather(b, effects) {
  const box = el('nerve-weather'), h = b.hormones;
  if (!box)
    return;
  box.hidden = !h;
  if (!h)
    return;
  if (box.children.length !== hormoneColors.length + 1) {
    box.replaceChildren();
    for (let k = 0; k < hormoneColors.length; k++) {
      const chip = document.createElement('span');
      chip.className = 'nerve-front';
      chip.style.setProperty('--hormone', hormoneColors[k]);
      chip.append(document.createElement('b'), document.createElement('small'));
      box.append(chip);
    }
    const effect = document.createElement('small');
    effect.className = 'nerve-effects';
    box.append(effect);
  }
  const slow = nerve_mapState.hormoneSlow ??= [], ui = textArea('nerve_map');
  for (let k = 0; k < hormoneColors.length; k++) {
    const v = clamp(h.levels?.[k]), trend = v - (slow[k] ?? v), chip = box.children[k],
          sky = (SKY.find(([ below ]) => v < below) ?? [, FULL_SKY ])[1];
    chip.children[0].textContent = sky + ' ' + hormoneName(h, k);
    chip.children[1].textContent = clampedPercent(v) + (trend > WEATHER.trend    ? ' ↑'
                                                        : trend < -WEATHER.trend ? ' ↓'
                                                                                 : ' →');
    slow[k] = (slow[k] ?? v) * WEATHER.slow + v * WEATHER.slow_share;
    chip.title = t('nerve_map.hormone', {
      name : hormoneName(h, k),
      description : hormoneEffect(h, k)
                        ? t('nerve_map.hormoneDescription', {text : hormoneEffect(h, k)})
                        : '',
      secretion : (h.secretion?.[k] || 0).toPrecision(WEATHER.digits),
      binding : (h.binding?.[k] || 0).toPrecision(WEATHER.digits)
    });
  }
  const shifted = effects.map((v, k) => [k, v]).filter(([, v ]) => Math.abs(v) > WEATHER.shown);
  box.children[hormoneColors.length].textContent =
      shifted.length ? shifted
                           .map(([ k, v ]) => t('nerve_map.effect', {
                                  icon : ui.effects[k][0],
                                  name : ui.effects[k][1],
                                  sign : v > 0 ? '+' : '−',
                                  value : Math.round(PERCENT * Math.abs(v))
                                }))
                           .join('  ')
                     : t('nerve_map.noEffect');
}

// The map refreshes live values every LIVE ms and the weather every WEATHER ms; a focus from the
// thought log holds FOCUS ms.
const REFRESH = Object.freeze({live : 100, weather : 700, focus : 5000});
export function renderNerveMap(f) {
  const svg = el('nerve-map'), b = f?.brain, model = planFor(b);
  if (!svg || !model || !globalThis.document?.createElementNS)
    return;
  const now = performance.now();
  let plan = nerve_mapState.plan;
  if (plan?.model !== model) {
    plan = nerve_mapState.plan = buildPlan(model, svg);
    hoverStation('');
  }
  if (now - (plan.liveAt || 0) > REFRESH.live) {
    plan.liveAt = now;
    nerve_mapState.nodes = new Map(b.neurons.map(n => [n[NEURON.index], n]));
    updatePlanLive(model, b);
    updateLive(b, plan);
  }
  moveTrains(plan, now);
  highlight(plan, now);
  if (now - (plan.weatherAt || 0) > REFRESH.weather) {
    plan.weatherAt = now;
    renderWeather(b, hormoneEffects(b));
    const mood = moodFor(b.id);
    el('nerve-mood').textContent = mood ? mood.icon + ' ' + mood.name : '';
  }
  renderThoughtList(el('nerve-thoughts'), b.id, {
    limit : Infinity,
    color : id => plan.routes.find(r => r.path.includes(id))?.color ||
                  (plan.meta.has(id) ? stationColor(plan.meta.get(id)) : ''),
    name : id => plan.meta.get(id)?.name,
    focus : stations => nerve_mapState.focus =
    { stations, segs: null, pair: true, until: performance.now() + REFRESH.focus }
  });
  el('nerve-learned').onclick ??= () => {
    const box = el('nerve-plan'), on = !box.classList.contains('nm-learned');
    box.classList.toggle('nm-learned', on);
    el('nerve-learned').setAttribute('aria-pressed', String(on));
  };
}