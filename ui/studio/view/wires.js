import {clamp} from '../../units.js';
import {eyeLocation, nodeLocation, organLocation, showsNodes} from './places.js';
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
import {BODY_FRAME, sideOf} from '../model/layout.js';
import {routedLinks} from '../model/regions.js';
import {cubicWeights, zoomOf} from './frame.js';
import {centerTitle, endpointTitle, isSelected} from './names.js';
import {isModulator} from '../model/organs.js';

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
function wireEnd(state, centers, wireId, linkId) {
  const found = centers.get(linkId), {document : doc, sites} = state;
  if (found && found.organ.type !== 'brain' && !findOrgan(doc, wireId) &&
      showsNodes(state, [ found.organ ]))
    return {key : linkId, point : nodeLocation(doc, sites, found.center, found.organ.type)};
  return endpointAnchor(doc, sites, linkId, centers);
}
function branchNodes(state, id, anchor, centers) {
  const organ = anchor.organ;
  if (!organ || !showsNodes(state, [ organ ]))
    return [];
  const nodes = findOrgan(state.document, id) ? organ.centers : [ centers.get(id).center ];
  if (nodes.length < 2 && findOrgan(state.document, id))
    return [];
  // Muscle nodes share their schematic segments; one branch reaches each segment.
  const reached = new Map();
  for (const center of nodes) {
    const at = nodeLocation(state.document, state.sites, center, organ.type);
    reached.set(fixed(at.x) + ' ' + fixed(at.y), {id : center.id, ...at});
  }
  return [...reached.values() ];
}
const WIRE_BOW = Object.freeze({least : 15, most : 66, share : .19, lane : 9});
function course(from, to, lane) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const bow = clamp(length * WIRE_BOW.share, WIRE_BOW.least, WIRE_BOW.most) + lane * WIRE_BOW.lane;
  return [
    from,
    {x : (from.x + to.x) / 2 + dy / length * bow, y : (from.y + to.y) / 2 - dx / length * bow}, to
  ];
}
const mix = (a, b, c, wa, wb, wc) =>
    ({x : wa * a.x + wb * b.x + wc * c.x, y : wa * a.y + wb * b.y + wc * c.y});
const curveAt = ([ a, c, b ], s) => mix(a, c, b, (1 - s) * (1 - s), 2 * s * (1 - s), s * s);
function curveDirection([ a, c, b ], s) {
  const x = 2 * (1 - s) * (c.x - a.x) + 2 * s * (b.x - c.x),
        y = 2 * (1 - s) * (c.y - a.y) + 2 * s * (b.y - c.y), length = Math.hypot(x, y) || 1;
  return {x : x / length, y : y / length};
}
const curvePart =
    (q, s0,
     s1) => [curveAt(q, s0),
             mix(q[0], q[1], q[2], (1 - s0) * (1 - s1), (1 - s0) * s1 + s0 * (1 - s1), s0 * s1),
             curveAt(q, s1)];
const BRANCH = Object.freeze({beyond : 28, share : .4, lead : .3, pull : .5, least_width : 1});
function joinAt(anchor, nodes, chord) {
  if (!nodes.length)
    return 0;
  const reach = Math.max(...nodes.map(p => Math.hypot(p.x - anchor.x, p.y - anchor.y)));
  return Math.min(BRANCH.share, (reach + BRANCH.beyond) / Math.max(1, chord));
}
function branchCurve(node, join, towards, inward) {
  const pull = Math.hypot(join.x - node.x, join.y - node.y) * BRANCH.pull;
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
const branchPath = (...args) => {
  const [a, b, c, d] = branchCurve(...args);
  return 'M' + pointText(a) + ' C' + pointText(b) + ' ' + pointText(c) + ' ' + pointText(d);
};
const BENT_STEPS = 14;
function quadraticWay(q) {
  return {
    at : s => curveAt(q, s),
    direction : s => curveDirection(q, s),
    path : (s0, s1) => {
      const [a, c, b] = curvePart(q, s0, s1);
      return 'M' + pointText(a) + ' Q' + pointText(c) + ' ' + pointText(b);
    }
  };
}
function bentWay(points) {
  const n = points.length - 1;
  const piece = k => {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1],
          p3 = points[Math.min(n, k + 2)];
    return [
      p1, {x : p1.x + (p2.x - p0.x) / 6, y : p1.y + (p2.y - p0.y) / 6},
      {x : p2.x - (p3.x - p1.x) / 6, y : p2.y - (p3.y - p1.y) / 6}, p2
    ];
  };
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
      const count = Math.max(2, Math.ceil((s1 - s0) * n * BENT_STEPS));
      return 'M' +
             Array.from({length : count + 1}, (_, k) => pointText(at(s0 + (s1 - s0) * k / count)))
                 .join(' L');
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
const WIRE_WIDTH = Object.freeze({base : 1.6, spread : 3.5});
const INNER_BOW = -10;
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
    const from = wireEnd(state, centers, link.wire.from, link.from),
          to = wireEnd(state, centers, link.wire.to, link.to);
    if (!a || !centers.get(link.to) || !from || !to)
      continue;
    const kind = signalKind(a.center), bends = bendsOf(doc, link);
    const key = from.key + '>' + to.key + '>' + kind + '>' + bendKey(bends);
    if (!bundles.has(key))
      bundles.set(key, {from, to, kind, bends, mirrored : linkMirrored(doc, link), links : []});
    bundles.get(key).links.push(link);
  }
  const drawn = [...bundles.values() ].map(({from, to, kind, bends, mirrored, links}) => {
    const way =
        bends.length
            ? bentWay([ from.point, ...bends, to.point ])
            : quadraticWay(course(from.point, to.point, Object.keys(WIRE_KINDS).indexOf(kind)));
    const chord = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
    const ends = links.map(link => ({
                             link,
                             starts : branchNodes(state, link.from, from, centers),
                             arrives : branchNodes(state, link.to, to, centers),
                             width : WIRE_WIDTH.base + WIRE_WIDTH.spread * link.wire.spread
                           }));
    const s0 = joinAt(from.point, ends.flatMap(e => e.starts), chord),
          s1 = 1 - joinAt(to.point, ends.flatMap(e => e.arrives), chord);
    return {
      from,
      to,
      kind,
      ends,
      bends,
      mirrored,
      way,
      s0,
      s1,
      start : way.at(s0),
      end : way.at(s1),
      startDirection : way.direction(s0),
      endDirection : way.direction(s1)
    };
  });
  return {bundles : drawn, inside};
}
const signalKind = center => isModulator(center) ? 'modulate'
                             : center.sign < 0   ? 'inhibit'
                                                 : 'excite';
export function wireSvg(state, centers) {
  const {document : doc, sites, selected} = state;
  const {bundles, inside} = wireBundles(state, centers);
  let html = '';
  for (const link of inside) {
    const a = centers.get(link.from), b = centers.get(link.to);
    if (a && b && showsNodes(state, [ a.organ ]))
      html += '<path data-signal-edges="' + escapeText(signalPairs(doc, link).join(' ')) +
              '" class="aid-region-inner' + (a.center.sign < 0 ? ' inhibit' : '') + '" d="' +
              pathTo(nodeLocation(doc, sites, a.center, a.organ.type),
                     nodeLocation(doc, sites, b.center, b.organ.type), INNER_BOW) +
              '"/>';
  }
  for (const bundle of bundles) {
    const {kind, ends, way, s0, s1, start, end, startDirection, endDirection} = bundle;
    const style = WIRE_KINDS[kind], splits = ends.some(e => e.arrives.length);
    const d = way.path(s0, s1);
    const width = Math.hypot(...ends.map(e => e.width));
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id));
    const next = ends[(chosen + 1) % ends.length].link.wire.id;
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    html +=
        '<g data-signal-edges="' +
        escapeText([...new Set(ends.flatMap(end => signalPairs(doc, end.link))) ].join(' ')) +
        '" data-wire="' +
        escapeText(chosen >= 0 && wireIds.size === 1 ? ends[chosen].link.wire.id : next) +
        '" data-wires="' + escapeText([...wireIds ].join(' ')) + '"' +
        (bundle.mirrored ? ' data-mirrored' : '') +
        (ends.some(e => e.link.wire.pairing) ? ' data-paired' : '') + ' class="aid-wire-group' +
        (chosen >= 0 ? ' selected' : '') + '">' +
        '<path d="' + d + '" class="aid-wire-hit"/><path d="' + d +
        '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' + fixed(width) + '"' +
        (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/><title>' +
        escapeText(joinParts([
          linkText(endpointTitle(doc, ends[0].link.from, state.sites, ends[0].link.wire.fromPort),
                   endpointTitle(doc, ends[0].link.to, state.sites, ends[0].link.wire.toPort)),
          wireIds.size > 1 ? t('studio.app.wireCount', {n : wireIds.size}) : ''
        ])) +
        '</title></g>';
    const branches =
        ends.flatMap(e => {
              const branch = (nodes, inward) => nodes.map(
                  node => '<path class="aid-wire-branch' +
                          (isSelected(selected, 'wire', e.link.wire.id) ? ' selected' : '') +
                          '" d="' +
                          (inward ? branchPath(node, start, startDirection, true)
                                  : branchPath(node, end, endDirection, false)) +
                          '" stroke-width="' +
                          fixed(Math.max(BRANCH.least_width, e.width / Math.sqrt(nodes.length))) +
                          '"' + (inward ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/>');
              return [...branch(e.starts, true), ...branch(e.arrives, false) ];
            })
            .join('');
    if (branches)
      html += '<g class="aid-wire-branches" stroke="' + style.colour + '">' + branches + '</g>';
  }
  return html + (state.tool === 'wire' ? bendHandles(state, bundles) : '');
}
const BEND_HANDLE = 6;
function bendHandles(state, bundles) {
  const zoom = zoomOf(state);
  return bundles.filter(b => b.bends.length)
      .map(b => {
        const wires = [...new Set(b.ends.map(e => e.link.wire.id)) ].join(' ');
        return b.bends
            .map((p, k) => '<circle class="aid-bend" data-bend-wires="' + escapeText(wires) +
                           '" data-bend-index="' + k + '"' + (b.mirrored ? ' data-mirrored' : '') +
                           ' cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
                           fixed(BEND_HANDLE / zoom) + '"/>')
            .join('');
      })
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
        const start = nodeLocation(doc, sites, a.center, a.organ.type);
        const end = nodeLocation(doc, sites, b.center, b.organ.type);
        const channels = [
          {kind : 'excite', count : positive, mean : positiveWeight},
          {kind : 'inhibit', count : negative, mean : negativeWeight}
        ].filter(channel => channel.count > 0);
        if (!channels.length)
          channels.push({kind : 'neutral', count, mean : 0});
        const id = from + ':' + to;
        return '<g data-signal-edges="' +
               escapeText(centerList[from].id + '>' + centerList[to].id) + '" data-contact="' + id +
               '" class="aid-wire-group aid-developed-contact' +
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
