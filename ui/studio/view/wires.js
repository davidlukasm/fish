import {nodeOpacity} from './layers.js';
import {nerveRoute, organDock, passable} from './wire_route.js';
import {nerveBundling, polylineWay} from './nerves.js';
import {regionDock} from './region_layout.js';
import {clamp} from '../../units.js';
import {eyeLocation, nodeLocation, organLocation} from './places.js';
import {escapeText, fixed, pointText} from './markup.js';
import {joinParts, linkText, t} from '../../strings.js';
import {
  allCenters,
  contactBundle,
  contactRows,
  contactCenters,
  endpointCenters,
  findAssembly,
  findOrgan,
  pairEndpoint,
  wireEndpointCenters,
  wholeEndpoint
} from '../model/document.js';
import {BODY_FRAME, centroid, sideOf} from '../model/layout.js';
import {routedLinks} from '../model/regions.js';
import {cubicWeights, zoomOf} from './frame.js';
import {centerTitle, endpointTitle, isSelected} from './names.js';
import {isModulator, isRegion} from '../model/organs.js';

const bowRise = (from, to) =>
    clamp(Math.abs(to.x - from.x) * WIRE_BOW.share, WIRE_BOW.least, WIRE_BOW.most);
export function pathTo(from, to, curve = 0) {
  const rise = bowRise(from, to) + curve;
  return 'M' + fixed(from.x) + ' ' + fixed(from.y) + ' Q' + fixed((from.x + to.x) / 2) + ' ' +
         fixed((from.y + to.y) / 2 - rise) + ' ' + fixed(to.x) + ' ' + fixed(to.y);
}
export function networkMemberSet(doc, selection, centers = allCenters(doc)) {
  if (!selection)
    return null;
  const active = new Set();
  if (selection.kind === 'contact') {
    const [from, to] = selection.id.split(':').map(Number);
    for (const index of [from, to]) {
      if (centers[index])
        active.add(centers[index].id);
    }
  }
  if (selection.kind === 'wire') {
    const wire = doc.wires.find(w => w.id === selection.id);
    if (wire) {
      for (const [id, port, dir] of [[ wire.from, wire.fromPort, 'out' ],
                                     [ wire.to, wire.toPort, 'in' ]])
        for (const endpoint of [id, pairEndpoint(doc, id)].filter(Boolean))
          for (const c of wireEndpointCenters(doc, endpoint, port, dir))
            active.add(c.id);
    }
  }
  if (selection.kind === 'center' || selection.kind === 'generated')
    active.add(selection.id);
  if (selection.kind === 'organ') {
    for (const id of [selection.id, pairEndpoint(doc, selection.id)].filter(Boolean)) {
      active.add(id);
      for (const c of findOrgan(doc, id)?.centers ?? [])
        active.add(c.id);
    }
  }
  if (selection.kind === 'assembly') {
    const a = findAssembly(doc, selection.id);
    for (const id of a?.centerIds ?? [])
      active.add(id);
  }
  return active;
}
function organAnchor(doc, sites, organ) {
  return organ.type === 'eye' ? eyeLocation(doc, sites, sideOf(organ))
                              : organLocation(organ, sites, doc);
}
function endpointAnchor(doc, sites, id, centers) {
  const organ = findOrgan(doc, id);
  if (organ)
    return {key : organ.id, point : organAnchor(doc, sites, organ), organ};
  const found = centers.get(id);
  if (!found)
    return null;
  return found.organ.type === 'brain'
             ? {key : id, point : nodeLocation(doc, sites, found.center, found.organ.type)}
             : {
                 key : found.organ.id,
                 point : organAnchor(doc, sites, found.organ),
                 organ : found.organ
               };
}
function dockEnd(state, anchor, direction, towards = null) {
  if (!anchor.organ || !isRegion(anchor.organ))
    return towards ? {...anchor, point : organDock(anchor, towards)} : anchor;
  return {
    ...anchor,
    point : regionDock(state.document, state.sites, anchor.organ, direction, towards)
  };
}
// The nodes a bundle reaches in an organ, whether they are shown or not.
function branchNodes(state, id, anchor, centers) {
  const organ = anchor.organ;
  if (!organ)
    return [];
  const nodes = findOrgan(state.document, id) ? organ.centers : [ centers.get(id).center ];
  // Muscle nodes share their schematic segments; one branch reaches each segment.
  const reached = new Map();
  for (const center of nodes) {
    const at = nodeLocation(state.document, state.sites, center, organ.type);
    reached.set(fixed(at.x) + ' ' + fixed(at.y), {id : center.id, ...at});
  }
  return [...reached.values() ];
}
// How far an organ's nodes are shown: its fibres fade in with them, and its bundle splits only as
// far short of it as they are shown.
const nodeReveal = (state, organ) =>
    organ ? nodeOpacity(state, organ.id === state.selected?.id ||
                                   organ.centers.some(c => c.id === state.selected?.id))
          : 0;
const WIRE_BOW = Object.freeze({least : 15, most : 66, share : .19});
// A branch leaves its join along the nerve, but only so far that branches to far nodes of a long
// organ (a tail band) bend towards their node instead of swinging out of the body.
const BRANCH = Object.freeze({lead : .3, pull : .5, reach : 14});
// Where a bundle splits into its fibres, as a parameter on its way: as far short of its organ's
// dock as the organ's nearest node lies from it (and a little more, at most `SPLIT.most`), measured
// along the nerve, so the bundle comes close to the organ and its fibres still run on towards
// their nodes instead of turning back. A way too short for that splits in its middle.
const SPLIT = Object.freeze({samples : 96, beyond : 4, most : 36, middle : .5});
function splitAlong(way, nodes, anchor, atEnd) {
  if (!nodes.length)
    return atEnd ? 1 : 0;
  const reach = Math.min(...nodes.map(p => Math.hypot(p.x - anchor.x, p.y - anchor.y)));
  const wanted = Math.min(SPLIT.most, reach + SPLIT.beyond);
  let walked = 0, last = way.at(atEnd ? 1 : 0);
  for (let k = 1; k <= SPLIT.samples; ++k) {
    const s = atEnd ? 1 - k / SPLIT.samples : k / SPLIT.samples, p = way.at(s);
    walked += Math.hypot(p.x - last.x, p.y - last.y);
    if (walked >= wanted)
      return s;
    last = p;
  }
  return SPLIT.middle;
}
function branchCurve(node, join, towards, inward) {
  const pull = Math.min(BRANCH.reach, Math.hypot(join.x - node.x, join.y - node.y) * BRANCH.pull);
  const guide = {
    x : join.x + (inward ? -1 : 1) * towards.x * pull,
    y : join.y + (inward ? -1 : 1) * towards.y * pull
  };
  const lead = {
    x : node.x + (guide.x - node.x) * BRANCH.lead,
    y : node.y + (guide.y - node.y) * BRANCH.lead
  };
  return inward ? [ node, lead, guide, join ] : [ join, guide, lead, node ];
}
const cubic = ([ a, b, c, d ]) =>
    'M' + pointText(a) + ' C' + pointText(b) + ' ' + pointText(c) + ' ' + pointText(d);
const branchPath = (...args) => cubic(branchCurve(...args));
// Inside a region a fibre does not cut across the cells. The region's cells stand in rows along
// its long axis; a fibre leaves its cell sideways into the lane between two rows, runs along that
// lane to the end of the region on the bundle's side and from there in one curve into the bundle.
// A bundle that meets the region beside its cells is reached from the lane at its height. `hop`
// and `bend` are the lengths of the fibre's first and last curve inside the region, `gap` what
// counts as one row, `beside` a lane outside the rows, `pull` how far the curve to the bundle
// keeps its direction at either end, as a share of its length. A cell with less than `least`
// along the axis to go has no room for a lane: its fibre leaves along its row in one curve.
const LANE = Object.freeze({hop : 9, bend : 14, gap : 3, beside : 5, least : 12, pull : .4});
// The frame of a region's cells: their middle, their long axis, the places of their rows across
// it and how far they reach along it.
function cellFrame(cells, fallback) {
  const n = cells.length, cx = cells.reduce((sum, p) => sum + p.x, 0) / n,
        cy = cells.reduce((sum, p) => sum + p.y, 0) / n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of cells) {
    xx += (p.x - cx) ** 2;
    xy += (p.x - cx) * (p.y - cy);
    yy += (p.y - cy) ** 2;
  }
  // The direction in which the cells spread most.
  const turn = Math.atan2(2 * xy, xx - yy) / 2,
        axis = xx + yy > 0 ? {x : Math.cos(turn), y : Math.sin(turn)} : fallback,
        across = {x : -axis.y, y : axis.x};
  const local = p => ({
    a : (p.x - cx) * axis.x + (p.y - cy) * axis.y,
    r : (p.x - cx) * across.x + (p.y - cy) * across.y
  });
  const places = cells.map(local), sorted = places.map(p => p.r).sort((x, y) => x - y);
  return {
    local,
    world : (a, r) => ({x : cx + axis.x * a + across.x * r, y : cy + axis.y * a + across.y * r}),
    axis,
    rows : sorted.filter((r, i) => !i || r - sorted[i - 1] > LANE.gap),
    low : Math.min(...places.map(p => p.a)),
    high : Math.max(...places.map(p => p.a))
  };
}
function lanePath(node, join, along, inward, frame) {
  const {local, world, axis, rows} = frame, n = local(node), j = local(join),
                             way = j.a >= n.a ? 1 : -1;
  // The lanes: between neighbouring rows and beside the outermost ones.
  const lanes = [
    rows[0] - LANE.beside, ...rows.slice(1).map((r, i) => (r + rows[i]) / 2),
    rows.at(-1) + LANE.beside
  ];
  const towards = n.r > j.r ? lanes.filter(l => l < n.r) : lanes.filter(l => l > n.r);
  const lane =
      towards.length
          ? towards.reduce((best, l) => Math.abs(l - n.r) < Math.abs(best - n.r) ? l : best)
          : n.r;
  // Where the fibre leaves its lane: at the region's end, or short of a bundle beside the cells.
  const end = way > 0 ? frame.high + LANE.hop : frame.low - LANE.hop,
        exit = (j.a - end) * way > 0 ? end : j.a - way * LANE.bend, run = (exit - n.a) * way;
  // The bundle's course where the fibre meets it, seen from the fibre.
  const meets = inward ? along : {x : -along.x, y : -along.y};
  const into = (from, heading) => {
    const reach = Math.hypot(join.x - from.x, join.y - from.y) * LANE.pull;
    return [
      {x : from.x + heading.x * reach, y : from.y + heading.y * reach},
      {x : join.x - meets.x * reach, y : join.y - meets.y * reach}, join
    ];
  };
  const heading = {x : axis.x * way, y : axis.y * way};
  const text = points => points.map(pointText).join(' ');
  if (run < LANE.least) {
    const curve = [ node, ...into(node, heading) ];
    return inward ? 'M' + pointText(node) + ' C' + text(curve.slice(1))
                  : 'M' + pointText(join) + ' C' + text(curve.slice(0, 3).reverse());
  }
  const hop = Math.min(LANE.hop, run / 3), left = world(exit, lane);
  const enter = [
    world(n.a + way * hop * .2, n.r + (lane - n.r) * .6), world(n.a + way * hop * .5, lane),
    world(n.a + way * hop, lane)
  ];
  const leave = into(left, heading);
  return inward ? 'M' + pointText(node) + ' C' + text(enter) + ' L' + pointText(left) + ' C' +
                      text(leave)
                : 'M' + pointText(join) + ' C' + text([ leave[1], leave[0], left ]) + ' L' +
                      pointText(enter[2]) + ' C' + text([ enter[1], enter[0], node ]);
}
const BENT_STEPS = 14;
function bentWay(points, safe = null) {
  const n = points.length - 1;
  const pieces = points.slice(0, -1).map((_, k) => {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1],
          p3 = points[Math.min(n, k + 2)];
    const line = [
      p1, {x : p1.x + (p2.x - p1.x) / 3, y : p1.y + (p2.y - p1.y) / 3},
      {x : p1.x + (p2.x - p1.x) * 2 / 3, y : p1.y + (p2.y - p1.y) * 2 / 3}, p2
    ];
    // A long neighbouring piece must not swing a short one past its end: each handle reaches at
    // most a third of the piece.
    const third = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3;
    const handle = (from, dx, dy) => {
      const k = Math.min(1, third / (Math.hypot(dx, dy) || 1));
      return {x : from.x + dx * k, y : from.y + dy * k};
    };
    const curve = [
      p1, handle(p1, (p2.x - p0.x) / 6, (p2.y - p0.y) / 6),
      handle(p2, (p1.x - p3.x) / 6, (p1.y - p3.y) / 6), p2
    ];
    if (safe && n === 1) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, length = Math.hypot(dx, dy) || 1;
      const bow = Math.min(14, length * .16);
      for (const i of [1, 2]) {
        curve[i] = {x : line[i].x + dy / length * bow, y : line[i].y - dx / length * bow};
      }
    }
    if (!safe)
      return curve;
    for (let blend = 1; blend > .02; blend /= 2) {
      const candidate = curve.map((p, i) => ({
                                    x : line[i].x + (p.x - line[i].x) * blend,
                                    y : line[i].y + (p.y - line[i].y) * blend
                                  }));
      if (Array.from({length : 15}, (_, i) => safe(cubicAt(candidate, (i + 1) / 16)))
              .every(Boolean))
        return candidate;
    }
    return line;
  });
  const piece = k => pieces[k];
  const at = s => {
    const t = Math.min(n - 1e-9, Math.max(0, s * n)), k = Math.floor(t);
    return cubicAt(piece(k), t - k);
  };
  const step = 1 / (n * BENT_STEPS);
  return {
    at,
    direction : s => {
      const a = at(Math.max(0, s - step)), b = at(Math.min(1, s + step));
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return {x : (b.x - a.x) / length, y : (b.y - a.y) / length};
    },
    path : (s0, s1) => {
      const split = (p, t) => {
        const mix = (a, b) => ({x : a.x + (b.x - a.x) * t, y : a.y + (b.y - a.y) * t});
        const a = mix(p[0], p[1]), b = mix(p[1], p[2]), c = mix(p[2], p[3]);
        const d = mix(a, b), e = mix(b, c), f = mix(d, e);
        return [ [ p[0], a, d, f ], [ f, e, c, p[3] ] ];
      };
      let d = 'M' + pointText(at(s0));
      for (let k = Math.floor(s0 * n); k < Math.min(n, Math.ceil(s1 * n)); ++k) {
        const lo = Math.max(0, s0 * n - k), hi = Math.min(1, s1 * n - k);
        let p = piece(k);
        if (hi < 1)
          p = split(p, hi)[0];
        if (lo > 0)
          p = split(p, lo / hi)[1];
        d += ' C' + p.slice(1).map(pointText).join(' ');
      }
      return d;
    }
  };
}
function bendsOf(doc, link) {
  const bends = link.wire.bends ?? [];
  return linkMirrored(doc, link) ? bends.map(p => ({x : p.x, y : 2 * BODY_FRAME.middle - p.y}))
                                 : bends;
}
const linkMirrored = (doc, link) =>
    wholeEndpoint(doc, link.from) !== wholeEndpoint(doc, link.wire.from);
const bendKey = bends => bends.map(p => fixed(p.x) + ',' + fixed(p.y)).join(' ');
const cubicAt = (points, s) => {
  const w = cubicWeights(s);
  return {
    x : points.reduce((sum, p, k) => sum + w[k] * p.x, 0),
    y : points.reduce((sum, p, k) => sum + w[k] * p.y, 0)
  };
};
// How many contact bundles the fish shows: the most important first, or all.
export const CONTACT_LIMITS = Object.freeze([ 120, 500, 0 ]);
const WIRE_KINDS = Object.freeze({
  excite : {colour : '#9edaca', arrow : 'aid-wire-arrow'},
  inhibit : {colour : '#e8a2b5', arrow : 'aid-wire-arrow-inhibit'},
  modulate : {colour : '#e2c487', arrow : 'aid-wire-arrow-modulate'}
});
// Widths in body units, so bundles, nerves and fibres grow with the fish as one zooms in. A fibre
// of a wider-spreading wire counts thicker. A bundle is as thick as its fibres together, within
// `least` and `most`; where it splits, its fibres share its width. Bundles drawn together as one
// nerve make it half as thick as they are together, at most `most`.
const FIBRE = Object.freeze({width : .7, spread : 1});
const BUNDLE = Object.freeze({least : .9, most : 2.2});
const NERVE = Object.freeze({share : .5, most : 3.2, colour : '#b9d8cf'});
const signalPairs = (doc, link) =>
    endpointCenters(doc, link.from)
        .flatMap(source =>
                     endpointCenters(doc, link.to).map(target => source.id + '>' + target.id));
function wireBundles(state, centers) {
  const {document : doc, sites, selected, wireScope} = state;
  const members = wireScope === 'focus' ? networkMemberSet(doc, selected) : null;
  const bundles = new Map(), inside = [];
  for (const link of routedLinks(doc, sites)) {
    if (members && !(members.has(link.from) || members.has(link.to)))
      continue;
    const within = !link.wire.inner && centers.get(link.from) && centers.get(link.to) &&
                   centers.get(link.from).organ === centers.get(link.to).organ &&
                   !findOrgan(doc, link.from) && !findOrgan(doc, link.to);
    if (link.wire.inner || within) {
      inside.push(link);
      continue;
    }
    const a = centers.get(link.from);
    const from = endpointAnchor(doc, sites, link.from, centers),
          to = endpointAnchor(doc, sites, link.to, centers);
    if (!a || !centers.get(link.to) || !from || !to)
      continue;
    const kind = signalKind(a.center), bends = bendsOf(doc, link);
    const manual = link.wire.bundle;
    const key = manual ? manual + ':' + linkMirrored(doc, link) + ':' + kind
                       : from.key + '>' + to.key + '>' + kind + '>' + bendKey(bends);
    if (!bundles.has(key))
      bundles.set(key, {
        from,
        to,
        kind,
        manual,
        bends,
        mirrored : linkMirrored(doc, link),
        links : [],
        anchors : [],
        opacity : 1
      });
    bundles.get(key).links.push(link);
    bundles.get(key).anchors.push({from, to});
  }
  const laid = [...bundles.values() ].map(
      ({from, to, kind, manual, bends, mirrored, links, anchors, opacity}) => {
        const spatial = !manual && !bends.length, a = from.point, b = to.point;
        from = dockEnd(state, from, 'out', spatial ? b : null);
        to = dockEnd(state, to, 'in', spatial ? a : null);
        const sources = anchors.map(end => dockEnd(state, end.from, 'out', spatial ? b : null));
        const targets = anchors.map(end => dockEnd(state, end.to, 'in', spatial ? a : null));
        if (manual) {
          from = {...from, point : centroid(sources.map(a => a.point))};
          to = {...to, point : centroid(targets.map(a => a.point))};
        }
        const route = !bends.length &&
                      nerveRoute(doc, sites, from, to, Object.keys(WIRE_KINDS).indexOf(kind));
        const way = manual && bends.length > 1 ? bentWay(bends)
                    : bends.length             ? bentWay([ from.point, ...bends, to.point ])
                                               : (route.way ??= bentWay(route.points, route.safe));
        const ends = links.map((link, k) => ({
                                 link,
                                 starts : branchNodes(state, link.from, sources[k], centers),
                                 arrives : branchNodes(state, link.to, targets[k], centers),
                                 fibre : FIBRE.width * (1 + FIBRE.spread * link.wire.spread)
                               }));
        // As thick as its fibres together, counted at the end where it splits into more.
        const count = side =>
            new Set(ends.flatMap(e => e[side]).map(p => fixed(p.x) + ' ' + fixed(p.y))).size;
        const width = Math.min(
            BUNDLE.most, Math.max(BUNDLE.least, Math.max(1, count('starts'), count('arrives')) *
                                                    Math.max(...ends.map(e => e.fibre))));
        return {
          from,
          to,
          kind,
          ends,
          bends,
          mirrored,
          manual,
          opacity,
          way,
          width,
          // Bundles drawn together keep to the body; a manual bundle keeps the course drawn for
          // it, a bent one its bends.
          route : spatial ? route : null,
          safe : spatial  ? route.safe
                 : manual ? null
                          : passable(doc, sites, from, to),
          pins : manual ? [] : bends
        };
      });
  const joined = nerveTogether(laid);
  const drawn = laid.map((bundle, index) => {
    const {from, to, ends, manual, bends} = bundle, way = joined[index].way;
    // The fibres show with their organ's nodes; until then the bundle runs on to the organ. A
    // bundle drawn along several bends keeps them to its ends.
    const shown = (side, anchor) => {
      const reveal = nodeReveal(state, anchor.organ);
      if (reveal > 0)
        return {reveal, nodes : ends.flatMap(e => e[side])};
      return manual ? {reveal : 1, nodes : [ {...anchor.point, overview : true} ]}
                    : {reveal : 0, nodes : []};
    };
    const bent = manual && bends.length > 1, starts = shown('starts', from),
          arrives = shown('arrives', to);
    const s0 = bent ? 0 : starts.reveal * splitAlong(way, starts.nodes, from.point, false),
          s1 = bent ? 1 : 1 - arrives.reveal * (1 - splitAlong(way, arrives.nodes, to.point, true));
    return {
      ...bundle,
      way,
      s0,
      s1,
      split : {starts : starts.reveal > 0, arrives : arrives.reveal > 0},
      id : 'b' + index
    };
  });
  const nerves = joined.flatMap(
      (line, index) => line.nerves.map(
          nerve => ({...nerve, members : nerve.members.map(k => drawn[k]), owner : drawn[index]})));
  return {bundles : drawn, nerves, inside};
}
const signalKind = center => isModulator(center) ? 'modulate'
                             : center.sign < 0   ? 'inhibit'
                                                 : 'excite';
// Bundles drawn together as nerves, worked out once for each set of bundle courses, so an edit
// that leaves the nerves' courses alone does not work them out again.
const together = new Map(), TOGETHER_KEPT = 8;
function nerveTogether(laid) {
  const course = b => b.route ? b.route.points.map(pointText).join(' ')
                              : [ b.from.point, ...b.bends, b.to.point ].map(pointText).join(' ');
  const key =
      laid.map(b => [b.kind, b.manual ?? '', fixed(b.width), course(b)].join(':')).join('|');
  if (!together.has(key)) {
    together.set(key, nerveBundling(laid.map(
                          b => ({way : b.way, safe : b.safe, pins : b.pins, width : b.width}))));
    if (together.size > TOGETHER_KEPT)
      together.delete(together.keys().next().value);
  }
  return together.get(key);
}
// The fibres at one end of a bundle: one for every node it reaches there, all of one width, united
// where the bundle begins.
function fibresAt(state, bundle, inward, pairs) {
  const {ends, way, width} = bundle, at = inward ? bundle.s0 : bundle.s1;
  if (!(inward ? bundle.split.starts : bundle.split.arrives) && !bundle.manual)
    return [];
  const join = way.at(at), along = way.direction(at), across = {x : -along.y, y : along.x};
  const fibres = new Map();
  for (const [index, e] of ends.entries()) {
    const reveal = nodeReveal(state, (inward ? bundle.from : bundle.to).organ);
    const nodes = reveal > 0      ? (inward ? e.starts : e.arrives)
                  : bundle.manual ? [ {
                      ...(inward ? bundle.from : bundle.to).point,
                      id : inward ? e.link.from : e.link.to,
                      overview : true
                    } ]
                                  : [];
    for (const node of nodes) {
      const key = fixed(node.x) + ' ' + fixed(node.y);
      const fibre = fibres.get(key) ?? {node, edges : new Set(), opacity : 0, chosen : false};
      for (const pair of pairs[index].filter(
               pair => node.overview ||
                       (inward ? pair.startsWith(node.id + '>') : pair.endsWith('>' + node.id))))
        fibre.edges.add(pair);
      fibre.opacity = Math.max(fibre.opacity, node.overview ? 1 : reveal);
      fibre.chosen ||=
          isSelected(state.selected, 'wire', e.link.wire.id) || !!state.multi?.has(e.link.wire.id);
      fibres.set(key, fibre);
    }
  }
  const list = [...fibres.values() ].sort(
      (a, b) => (a.node.x - join.x) * across.x + (a.node.y - join.y) * across.y -
                ((b.node.x - join.x) * across.x + (b.node.y - join.y) * across.y));
  const organ = (inward ? bundle.from : bundle.to).organ;
  const frame = !bundle.manual && isRegion(organ)
                    ? cellFrame(organ.centers.map(
                                    c => nodeLocation(state.document, state.sites, c, organ.type)),
                                along)
                    : null;
  // Every fibre is as thin as the next and runs into the bundle's middle: there they are one.
  return list.map(fibre => ({
                    ...fibre,
                    width : FIBRE.width,
                    d : frame ? lanePath(fibre.node, join, along, inward, frame)
                              : branchPath(fibre.node, join, along, inward)
                  }));
}
// The bundles and, apart from them, the fibres they split into, which the scene draws above the
// organs. Nerves are drawn over the bundles they gather.
export function wireSvg(state, centers) {
  const {document : doc, selected} = state;
  const {bundles, nerves} = wireBundles(state, centers);
  let lines = '', fibres = '';
  for (const bundle of bundles) {
    const {kind, ends, way, s0, s1, width} = bundle;
    const style = WIRE_KINDS[kind], splits = bundle.split.arrives;
    const d = way.path(s0, s1);
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id) ||
                                       state.multi?.has(e.link.wire.id));
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    const pairs = ends.map(end => signalPairs(doc, end.link));
    // A bundle of one wire is chosen as that wire; one of several wires has its own inspector.
    const spec = bundleSpec(bundle), shown = chosen >= 0 || bundleChosen(selected, spec);
    lines +=
        '<g opacity="' + fixed(bundle.opacity) + '" data-signal-opacity="' + fixed(bundle.opacity) +
        '" data-signal-edges="' + escapeText([...new Set(pairs.flat()) ].join(' ')) +
        '" data-strand="' + bundle.id + '" ' +
        (wireIds.size === 1 ? 'data-wire="' + escapeText(ends[0].link.wire.id)
                            : 'data-bundle="' + escapeText(spec)) +
        '" data-wires="' + escapeText([...wireIds ].join(' ')) + '"' +
        (bundle.mirrored ? ' data-mirrored' : '') +
        (ends.some(e => e.link.wire.pairing) ? ' data-paired' : '') + ' class="aid-wire-group' +
        (shown ? ' selected' : '') + '">' +
        '<path d="' + d + '" class="aid-wire-hit"/>' +
        '<path d="' + d + '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' +
        fixed(width) + '"' + (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') +
        '/><title>' + escapeText(joinParts([
          linkText(endpointTitle(doc, ends[0].link.from, state.sites, ends[0].link.wire.fromPort),
                   endpointTitle(doc, ends[0].link.to, state.sites, ends[0].link.wire.toPort)),
          wireIds.size > 1 ? t('studio.app.wireCount', {n : wireIds.size}) : ''
        ])) +
        '</title></g>';
    const branches =
        [ true, false ]
            .flatMap(
                inward =>
                    fibresAt(state, bundle, inward, pairs)
                        .map(f => '<path data-signal-section="' + (inward ? 0 : 2) +
                                  '" data-signal-edges="' + escapeText([...f.edges ].join(' ')) +
                                  '" data-signal-opacity="' + fixed(f.opacity) + '" data-strand="' +
                                  bundle.id + '" opacity="' + fixed(f.opacity) +
                                  '" class="aid-wire-branch' + (f.chosen ? ' selected' : '') +
                                  '" d="' + f.d + '" stroke-width="' + fixed(f.width) + '"' +
                                  (inward ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/>'))
            .join('');
    if (branches)
      fibres += '<g class="aid-wire-branches" stroke="' + style.colour + '">' + branches + '</g>';
  }
  // One layer for all nerves, faded as a whole, so where their pieces meet they do not add up.
  if (nerves.length)
    lines +=
        '<g class="aid-nerves">' + nerves.map(nerve => nerveSvg(state, nerve)).join('') + '</g>';
  return {
    lines : lines + (state.tool === 'wire' ? bendHandles(state, bundles) : ''),
    branches : fibres
  };
}
// A bundle is known by its wires and whether it is drawn as their mirror, a nerve by its bundles.
export const bundleSpec = bundle => [...new Set(bundle.ends.map(e => e.link.wire.id))].join(',') +
                                    ':' + (bundle.mirrored ? 1 : 0);
export const nerveSpec = nerve => nerve.members.map(bundleSpec).join(' ');
// A bundle shows chosen when it is, or when a nerve it runs in is.
const bundleChosen = (selected, spec) =>
    selected?.kind === 'bundle' && selected.id === spec ||
    selected?.kind === 'nerve' && selected.id.split(' ').includes(spec);
// The drawn bundle or nerve a selection names.
export function chosenStrand(state) {
  const {bundles, nerves} = wireBundles(state, endpointIndex(state.document));
  const id = state.selected?.id;
  return state.selected?.kind === 'bundle'  ? {bundle : bundles.find(b => bundleSpec(b) === id)}
         : state.selected?.kind === 'nerve' ? {nerve : nerves.find(n => nerveSpec(n) === id)}
                                            : {};
}
// A nerve: half as thick as its bundles together, in their colour when they share one. It lists
// its bundles, so that pointing at it shows them all, and their wires, so that a bend set on it
// bends them all.
export const strandColour = kind => WIRE_KINDS[kind].colour;
export function nerveLook(nerve) {
  const kinds = new Set(nerve.members.map(b => b.kind));
  return {
    colour : kinds.size === 1 ? WIRE_KINDS[[...kinds ][0]].colour : NERVE.colour,
    width : Math.min(NERVE.most, NERVE.share * nerve.members.reduce((sum, b) => sum + b.width, 0))
  };
}
function nerveSvg(state, nerve) {
  const wires = nerve.members.flatMap(b => b.ends.map(e => e.link.wire.id));
  const spec = nerveSpec(nerve),
        chosen = state.selected?.kind === 'nerve' && state.selected.id === spec;
  return '<g class="aid-nerve' + (chosen ? ' selected' : '') + '" data-strands="' +
         nerve.members.map(b => b.id).join(' ') + '" data-nerve="' + escapeText(spec) +
         '" data-wires="' + escapeText([...new Set(wires) ].join(' ')) + '"><path d="' + nerve.d +
         '" class="aid-wire-hit"/><title>' +
         escapeText(t('studio.app.nerveTitle', {n : nerve.members.length})) + '</title></g>';
}
function contactOpacity(state, a, b) {
  const visible = ({organ, center}) =>
      nodeOpacity(state, state.selected?.id === organ.id || state.selected?.id === center.id ||
                             state.multi?.has(organ.id) || state.multi?.has(center.id));
  return Math.min(visible(a), visible(b));
}
// A connection inside a region is as thick as one fibre of a nerve outside it, a chosen one
// thicker by this factor.
const INNER_CHOSEN = 1.6;
export function regionContactsSvg(state, centers) {
  const {document : doc, sites, selected} = state;
  if (state.contactView === 'actual' && !state.stale && state.report?.compiler)
    return '';
  const inside = routedLinks(doc, sites)
                     .filter(link => centers.get(link.from)?.organ === centers.get(link.to)?.organ);
  let html = '';
  for (const link of inside) {
    const a = centers.get(link.from), b = centers.get(link.to);
    if (!a || !b)
      continue;
    const opacity = contactOpacity(state, a, b);
    if (opacity <= 0)
      continue;
    const p = nodeLocation(doc, sites, a.center, a.organ.type),
          q = nodeLocation(doc, sites, b.center, b.organ.type);
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy) || 1,
          bow = Math.min(12, length * .2);
    const path =
        'M' + pointText(p) + ' Q' +
        pointText(
            {x : (p.x + q.x) / 2 - dy / length * bow, y : (p.y + q.y) / 2 + dx / length * bow}) +
        ' ' + pointText(q);
    const selectedEdge = selected?.id === a.center.id || selected?.id === b.center.id;
    html += '<path opacity="' + fixed(opacity) + '" data-signal-opacity="' + fixed(opacity) +
            '" data-signal-edges="' + escapeText(signalPairs(doc, link).join(' ')) +
            '" class="aid-region-inner' + (a.center.sign < 0 ? ' inhibit' : '') +
            (selectedEdge ? ' selected' : '') + '" stroke-width="' +
            fixed(FIBRE.width * (selectedEdge ? INNER_CHOSEN : 1)) + '" d="' + path + '"/>';
  }
  return html;
}
const BEND_HANDLE = 6;
// One handle for every bend; bundles bent through the same points (a nerve) share their handles,
// so moving one moves the nerve.
function bendHandles(state, bundles) {
  const zoom = zoomOf(state), shared = new Map();
  for (const b of bundles.filter(b => b.bends.length)) {
    const key = bendKey(b.bends) + ':' + b.mirrored, held = shared.get(key);
    const wires = b.ends.map(e => e.link.wire.id);
    if (held)
      wires.forEach(w => held.wires.add(w));
    else
      shared.set(key, {bends : b.bends, mirrored : b.mirrored, wires : new Set(wires)});
  }
  return [...shared.values() ]
      .map(({bends, mirrored, wires}) =>
               bends
                   .map((p, k) => '<circle class="aid-bend" data-bend-wires="' +
                                  escapeText([...wires ].join(' ')) + '" data-bend-index="' + k +
                                  '"' + (mirrored ? ' data-mirrored' : '') + ' cx="' + fixed(p.x) +
                                  '" cy="' + fixed(p.y) + '" r="' + fixed(BEND_HANDLE / zoom) +
                                  '"/>')
                   .join(''))
      .join('');
}
const AIM = Object.freeze({reach : 36, steps : 48});
export const drawnBundles = state => wireBundles(state, endpointIndex(state.document)).bundles;
export function aimedWire(state, bundles, point, paired) {
  const reach = AIM.reach / zoomOf(state);
  let best = null;
  for (const b of bundles) {
    if (paired && !b.ends.some(e => e.link.wire.pairing))
      continue;
    for (let k = 0; k <= AIM.steps; ++k) {
      const at = b.way.at(b.s0 + (b.s1 - b.s0) * k / AIM.steps);
      const distance = Math.hypot(at.x - point.x, at.y - point.y);
      if (distance < reach && (!best || distance < best.distance))
        best = {
          wires : [...new Set(b.ends.map(e => e.link.wire.id)) ],
          mirrored : b.mirrored,
          at,
          distance
        };
    }
  }
  return best;
}
export const aimMark = (state, aimed) => '<circle class="aid-wire-aim" cx="' + fixed(aimed.at.x) +
                                         '" cy="' + fixed(aimed.at.y) + '" r="' +
                                         fixed(BEND_HANDLE / zoomOf(state)) + '"/>';
export function bendsWith(state, wireIds, point, mirrored) {
  const wanted = new Set(wireIds);
  const bundle = wireBundles(state, endpointIndex(state.document))
                     .bundles.find(b => b.mirrored === mirrored &&
                                        b.ends.some(e => wanted.has(e.link.wire.id)));
  if (!bundle)
    return null;
  const way = [ bundle.from.point, ...bundle.bends, bundle.to.point ];
  const gap = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  let best = 0, least = Infinity;
  for (let k = 0; k + 1 < way.length; ++k) {
    const added = gap(way[k], point) + gap(point, way[k + 1]) - gap(way[k], way[k + 1]);
    if (added < least)
      [best, least] = [ k, added ];
  }
  const bends = [...bundle.bends ];
  bends.splice(best, 0, point);
  return bends.map(p => mirrored ? {x : p.x, y : 2 * BODY_FRAME.middle - p.y} : p);
}
export function endpointIndex(doc) {
  const centers = new Map();
  for (const organ of doc.organs) {
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
    if (organ.type !== 'brain' && organ.centers.length)
      centers.set(organ.id, {organ, center : organ.centers[0]});
  }
  return centers;
}
const CONTACTS = Object.freeze({
  floor : .1,
  lane : 11,
  steps : 7,
  step : 2,
  loop : {foot : 16, reach : 65, rise : 72},
  width : {least : 1.5, per_log : .65, most : 6.5},
  neutral : '#819c9d'
});
export function developedContactsSvg(state, centers) {
  const centerList = contactCenters(state);
  centers = new Map(centers);
  for (const center of centerList.filter(center => center.generated))
    centers.set(center.id, {center, organ : {type : 'brain', id : center.id}});
  const C = CONTACTS;
  const {document : doc, sites, selected, wireScope} = state;
  const contacts = contactRows(state);
  const members = wireScope === 'focus' ? networkMemberSet(doc, selected, centerList) : null;
  const importance = ({count, positive, negative, positiveWeight, negativeWeight}) =>
      Math.sqrt(count) *
      (C.floor +
       (positive * Math.abs(positiveWeight) + negative * Math.abs(negativeWeight)) / count);
  const entries =
      contacts.map(contactBundle)
          .filter(({from, to, count}) => count > 0 && centerList[from] && centerList[to] &&
                                         (!members || members.has(centerList[from].id) ||
                                          members.has(centerList[to].id)))
          .sort((a, b) => importance(b) - importance(a))
          .slice(0, (state.contactLimit ?? CONTACT_LIMITS[0]) || Infinity)
          .reverse();
  return entries
      .map(({from, to, count, positive, negative, positiveWeight, negativeWeight}, index) => {
        const a = centers.get(centerList[from].id), b = centers.get(centerList[to].id);
        if (!a || !b)
          return '';
        const opacity = a.organ === b.organ ? contactOpacity(state, a, b) : 1;
        if (opacity <= 0)
          return '';
        const start = nodeLocation(doc, sites, a.center, a.organ.type);
        const end = nodeLocation(doc, sites, b.center, b.organ.type);
        const channels = [
          {kind : 'excite', count : positive, mean : positiveWeight},
          {kind : 'inhibit', count : negative, mean : negativeWeight}
        ].filter(channel => channel.count > 0);
        if (!channels.length)
          channels.push({kind : 'neutral', count, mean : 0});
        const id = from + ':' + to;
        return '<g opacity="' + fixed(opacity) + '" data-signal-opacity="' + fixed(opacity) +
               '" data-signal-edges="' + escapeText(centerList[from].id + '>' + centerList[to].id) +
               '" data-contact="' + id + '" class="aid-wire-group aid-developed-contact' +
               (isSelected(selected, 'contact', id) ? ' selected' : '') + '">' +
               channels
                   .map((channel, lane) => {
                     const offset = channels.length > 1 ? (lane ? C.lane : -C.lane) : 0;
                     const curve = index % C.steps * C.step + offset, L = C.loop;
                     const top = start.y - L.rise - curve;
                     const d = from === to
                                   ? 'M' + fixed(start.x - L.foot) + ' ' + fixed(start.y) + ' C' +
                                         fixed(start.x - L.reach) + ' ' + fixed(top) + ' ' +
                                         fixed(start.x + L.reach) + ' ' + fixed(top) + ' ' +
                                         fixed(start.x + L.foot) + ' ' + fixed(start.y)
                                   : pathTo(start, end, curve);
                     const width = Math.min(
                         C.width.most, C.width.least + Math.log1p(channel.count) * C.width.per_log);
                     const arrow = (WIRE_KINDS[channel.kind] ?? WIRE_KINDS.excite).arrow;
                     return '<path d="' + d + '" class="aid-wire-hit"/>' +
                            '<path d="' + d + '" class="aid-wire-ink" data-channel="' +
                            channel.kind + '" stroke="' +
                            (WIRE_KINDS[channel.kind]?.colour ?? C.neutral) + '" stroke-width="' +
                            fixed(width) + '"' +
                            ' marker-end="url(#' + arrow + ')"/>';
                   })
                   .join('') +
               '<title>' + escapeText(joinParts([
                 linkText(centerTitle(a.center), centerTitle(b.center)),
                 t('studio.app.proposalCount', {n : count})
               ])) +
               '</title></g>';
      })
      .join('');
}
const ARROW = Object.freeze({size : 8, tip : 7, middle : 3});
export const arrowSize = zoom => fixed(ARROW.size / zoom);
export function wireMarkers(zoom) {
  return Object.values(WIRE_KINDS)
      .map(({arrow, colour}) =>
               '<marker id="' + arrow + '" class="aid-wire-marker" ' +
               'viewBox="0 0 ' + ARROW.size + ' ' + ARROW.size + '" markerWidth="' +
               arrowSize(zoom) + '" markerHeight="' + arrowSize(zoom) + '" refX="' + ARROW.tip +
               '" refY="' + ARROW.middle +
               '" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L' + ARROW.tip + ' ' +
               ARROW.middle + ' L0 ' + 2 * ARROW.middle + '" fill="' + colour + '"/></marker>')
      .join('');
}
