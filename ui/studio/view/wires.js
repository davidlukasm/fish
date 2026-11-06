import {clamp} from '../../units.js';
import {eyeLocation, nodeLocation, organLocation, showsNodes} from './places.js';
import {escapeText, fixed, pointText} from './markup.js';
import {joinParts, linkText, t} from '../../strings.js';
import {
  allCenters,
  contactBundle,
  endpointCenters,
  findAssembly,
  findOrgan,
  wholeEndpoint
} from '../model/document.js';
import {sideOf} from '../model/layout.js';
import {routedLinks} from '../model/regions.js';
import {cubicWeights} from './frame.js';
import {centerTitle, endpointTitle, isSelected} from './names.js';
import {isModulator} from '../model/organs.js';

// The wires on the fish: drawn connections bundled into trunks that branch to their nodes, the
// signals a stimulus sends along them, the developed contacts, and their arrowheads.

// A way between two points bows up as a wire does over the way along, plus its own curve.
const bowRise = (from, to) =>
    clamp(Math.abs(to.x - from.x) * WIRE_BOW.share, WIRE_BOW.least, WIRE_BOW.most);
export function pathTo(from, to, curve = 0) {
  const rise = bowRise(from, to) + curve;
  return 'M' + fixed(from.x) + ' ' + fixed(from.y) + ' Q' + fixed((from.x + to.x) / 2) + ' ' +
         fixed((from.y + to.y) / 2 - rise) + ' ' + fixed(to.x) + ' ' + fixed(to.y);
}
function networkMemberSet(doc, sites, selection, contacts = null) {
  if (!selection)
    return null;
  const centers = allCenters(doc);
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
      active.add(wire.from);
      active.add(wire.to);
    }
  }
  if (selection.kind === 'center')
    active.add(selection.id);
  if (selection.kind === 'organ') {
    active.add(selection.id);
    for (const c of findOrgan(doc, selection.id)?.centers ?? [])
      active.add(c.id);
  }
  if (selection.kind === 'assembly') {
    const a = findAssembly(doc, selection.id);
    for (const id of a?.centerIds ?? [])
      active.add(id);
  }
  const adjacency = new Map();
  const connect = (from, to) => {
    if (!from || !to)
      return;
    if (!adjacency.has(from))
      adjacency.set(from, new Set());
    if (!adjacency.has(to))
      adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };
  if (contacts) {
    for (const {from, to, count} of contacts.map(contactBundle))
      if (count > 0)
        connect(centers[from]?.id, centers[to]?.id);
  } else
    for (const link of routedLinks(doc, sites)) {
      connect(link.from, link.to);
      for (const c of endpointCenters(doc, link.from))
        connect(link.from, c.id);
      for (const c of endpointCenters(doc, link.to))
        connect(link.to, c.id);
    }
  const queue = [...active ];
  for (let index = 0; index < queue.length; ++index)
    for (const adjacent of adjacency.get(queue[index]) ?? [])
      if (!active.has(adjacent)) {
        active.add(adjacent);
        queue.push(adjacent);
      }
  return active;
}
// Where a wire attaches: an organ as a whole at its glyph (an eye at its eye), a nerve center at
// its node.
function organAnchor(doc, sites, organ) {
  return organ.type === 'eye' ? eyeLocation(doc, sites, sideOf(organ))
                              : organLocation(organ, sites, doc);
}
// Where a wire's trunk ends: at an organ or a brain region, also for one of its nodes, whose
// wires bundle there and branch to the nodes; at a free nerve center of the brain on its own.
// The key names that place, so wires ending at the same one share their trunk.
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
// The nodes a wire branches to at one end, while its organ's nodes show: all of them for the
// organ as a whole (when it has more than one), the one for a node.
function branchNodes(state, id, anchor, centers) {
  const organ = anchor.organ;
  if (!organ || !showsNodes(state, [ organ ]))
    return [];
  const nodes = findOrgan(state.document, id) ? organ.centers : [ centers.get(id).center ];
  if (nodes.length < 2 && findOrgan(state.document, id))
    return [];
  return nodes.map(
      center =>
          ({id : center.id, ...nodeLocation(state.document, state.sites, center, organ.type)}));
}
// A trunk's course: a quadratic curve bowed to the left of its direction, so the two directions
// between the same places run apart; each further kind of signal bows further.
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
// The piece of a quadratic curve between two of its parameters, itself a quadratic curve.
const curvePart =
    (q, s0,
     s1) => [curveAt(q, s0),
             mix(q[0], q[1], q[2], (1 - s0) * (1 - s1), (1 - s0) * s1 + s0 * (1 - s1), s0 * s1),
             curveAt(q, s1)];
// Where branches join a trunk: past the farthest node they come from, by BRANCH.beyond, at most
// BRANCH.share of the way; they leave their node towards the join (BRANCH.lead of the way to
// their last guide point) and meet the trunk along it, pulled in by BRANCH.pull of their length.
const BRANCH = Object.freeze({beyond : 28, share : .4, lead : .3, pull : .5, least_width : 1});
function joinAt(anchor, nodes, chord) {
  if (!nodes.length)
    return 0;
  const reach = Math.max(...nodes.map(p => Math.hypot(p.x - anchor.x, p.y - anchor.y)));
  return Math.min(BRANCH.share, (reach + BRANCH.beyond) / Math.max(1, chord));
}
// A branch from a node into the trunk (towards: the trunk's direction there) or out of it to a
// node, as one smooth curve.
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
const cubicAt = (points, s) => {
  const w = cubicWeights(s);
  return {
    x : points.reduce((sum, p, k) => sum + w[k] * p.x, 0),
    y : points.reduce((sum, p, k) => sum + w[k] * p.y, 0)
  };
};
const WIRE_KINDS = Object.freeze({
  excite : {colour : '#9edaca', arrow : 'aid-wire-arrow'},
  inhibit : {colour : '#e8a2b5', arrow : 'aid-wire-arrow-inhibit'},
  modulate : {colour : '#e2c487', arrow : 'aid-wire-arrow-modulate'}
});
const WIRE_WIDTH = Object.freeze({base : 1.6, spread : 3.5});
const INNER_BOW = -10;
// Every connection of every wire: a wire between paired organs draws one on each side, or two
// crossing the midline, or all four. Wires between the same two places with the same kind of
// signal run as one trunk, as broad as the wires it carries. Once an organ's nodes show, the
// trunk splits before it in smooth branches, one to each node a wire joins; at the start the
// branches from the nodes flow together into it. Clicking a trunk selects its wires in turn.
// The drawn bundles: wires between the same two places with the same kind of signal, with
// their trunk (the part of their course between where branches join it) and, per wire, the
// nodes it branches from and to. Wires within one organ come back as `inside`.
function wireBundles(state, centers) {
  const {document : doc, sites, selected, wireScope} = state;
  const members = wireScope === 'focus' ? networkMemberSet(doc, sites, selected) : null;
  const bundles = new Map(), inside = [];
  for (const link of routedLinks(doc, sites)) {
    if (members && !(members.has(link.from) && members.has(link.to)))
      continue;
    // A region's own circuit shows as fine lines between its nodes, as do other wires within one
    // organ.
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
    const kind = signalKind(a.center);
    const key = from.key + '>' + to.key + '>' + kind;
    if (!bundles.has(key))
      bundles.set(key, {from, to, kind, links : []});
    bundles.get(key).links.push(link);
  }
  const drawn = [...bundles.values() ].map(({from, to, kind, links}) => {
    const q = course(from.point, to.point, Object.keys(WIRE_KINDS).indexOf(kind));
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
      trunk : curvePart(q, s0, s1),
      startDirection : curveDirection(q, s0),
      endDirection : curveDirection(q, s1)
    };
  });
  return {bundles : drawn, inside};
}
const signalKind = center => isModulator(center) ? 'modulate'
                             : center.sign < 0   ? 'inhibit'
                                                 : 'excite';
// Every connection of every wire: a wire between paired organs draws one on each side, or two
// crossing the midline, or all four. Wires between the same two places with the same kind of
// signal run as one trunk, as broad as the wires it carries. Once an organ's nodes show, the
// trunk splits before it in smooth branches, one to each node a wire joins; at the start the
// branches from the nodes flow together into it. Clicking a trunk selects its wires in turn.
export function wireSvg(state, centers) {
  const {document : doc, sites, selected} = state;
  const {bundles, inside} = wireBundles(state, centers);
  let html = '';
  for (const link of inside) {
    const a = centers.get(link.from), b = centers.get(link.to);
    if (a && b && showsNodes(state, [ a.organ ]))
      html += '<path class="aid-region-inner' + (a.center.sign < 0 ? ' inhibit' : '') + '" d="' +
              pathTo(nodeLocation(doc, sites, a.center, a.organ.type),
                     nodeLocation(doc, sites, b.center, b.organ.type), INNER_BOW) +
              '"/>';
  }
  for (const {kind, ends, trunk, startDirection, endDirection} of bundles) {
    const style = WIRE_KINDS[kind], splits = ends.some(e => e.arrives.length);
    const d = 'M' + pointText(trunk[0]) + ' Q' + pointText(trunk[1]) + ' ' + pointText(trunk[2]);
    const width = Math.hypot(...ends.map(e => e.width));
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id));
    // A click on the trunk selects the wire after the selected one.
    const next = ends[(chosen + 1) % ends.length].link.wire.id;
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    html += '<g data-wire="' +
            escapeText(chosen >= 0 && wireIds.size === 1 ? ends[chosen].link.wire.id : next) +
            '" data-wires="' + escapeText([...wireIds ].join(' ')) + '" class="aid-wire-group' +
            (chosen >= 0 ? ' selected' : '') + '">' +
            '<path d="' + d + '" class="aid-wire-hit"/><path d="' + d +
            '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' + fixed(width) +
            '"' + (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/><title>' +
            escapeText(joinParts([
              linkText(endpointTitle(doc, ends[0].link.from, state.sites),
                       endpointTitle(doc, ends[0].link.to, state.sites)),
              wireIds.size > 1 ? t('studio.app.wireCount', {n : wireIds.size}) : ''
            ])) +
            '</title></g>';
    const branches =
        ends.flatMap(e => {
              const branch = (nodes, inward) => nodes.map(
                  node => '<path class="aid-wire-branch' +
                          (isSelected(selected, 'wire', e.link.wire.id) ? ' selected' : '') +
                          '" d="' +
                          (inward ? branchPath(node, trunk[0], startDirection, true)
                                  : branchPath(node, trunk[2], endDirection, false)) +
                          '" stroke-width="' +
                          fixed(Math.max(BRANCH.least_width, e.width / Math.sqrt(nodes.length))) +
                          '"' + (inward ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/>');
              return [...branch(e.starts, true), ...branch(e.arrives, false) ];
            })
            .join('');
    if (branches)
      html += '<g class="aid-wire-branches" stroke="' + style.colour + '">' + branches + '</g>';
  }
  return html;
}
// The ways a stimulus takes, as the wires are drawn: one leg for each part (an organ as a whole
// or a nerve center) that sends along a bundle to another, kind by kind, running from the
// nodes it leaves along their branches into the bundle's trunk and out along the branches to
// the nodes it reaches; and one for each link of an organ's own circuit, between its nodes.
// Each with what its source sends, its wires and how strong it is.
const SIGNAL_STEPS = 24;
export function signalLinks(state) {
  const {document : doc, sites} = state, centers = new Map();
  for (const organ of doc.organs) {
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
    if (organ.type !== 'brain' && organ.centers.length)
      centers.set(organ.id, {organ, center : organ.centers[0]});
  }
  const sample = (at, curve) =>
      Array.from({length : SIGNAL_STEPS + 1}, (_, k) => at(curve, k / SIGNAL_STEPS));
  const legs = new Map();
  const leg = (from, to, kind, points) => {
    const key = from + '>' + to + '>' + kind;
    if (!legs.has(key))
      legs.set(key, {
        from,
        to,
        kind,
        points,
        starts : new Map(),
        arrives : new Map(),
        wires : new Set(),
        strength : 0
      });
    return legs.get(key);
  };
  const {bundles, inside} = wireBundles(state, centers);
  for (const {kind, ends, trunk, startDirection, endDirection} of bundles)
    for (const {link, starts, arrives} of ends) {
      const way = leg(wholeEndpoint(doc, link.from), wholeEndpoint(doc, link.to), kind,
                      sample(curveAt, trunk));
      for (const node of starts)
        way.starts.set(node.id, sample(cubicAt, branchCurve(node, trunk[0], startDirection, true)));
      for (const node of arrives)
        way.arrives.set(node.id, sample(cubicAt, branchCurve(node, trunk[2], endDirection, false)));
      way.wires.add(link.wire.id);
      way.strength = Math.min(1, way.strength + .5);
    }
  for (const link of inside) {
    const a = centers.get(link.from), b = centers.get(link.to);
    if (!a || !b)
      continue;
    const p = nodeLocation(doc, sites, a.center, a.organ.type),
          q = nodeLocation(doc, sites, b.center, b.organ.type);
    const rise = bowRise(p, q) + INNER_BOW;
    const way =
        leg(wholeEndpoint(doc, link.from), wholeEndpoint(doc, link.to), signalKind(a.center),
            sample(curveAt, [ p, {x : (p.x + q.x) / 2, y : (p.y + q.y) / 2 - rise}, q ]));
    way.strength = Math.min(1, way.strength + .5);
  }
  return [...legs.values() ].map(
      way => ({...way, starts : [...way.starts.values() ], arrives : [...way.arrives.values() ]}));
}
// The developed contacts drawn: the MOST important (by count and FLOOR plus their mean weights),
// exciting and inhibiting ones in lanes LANE apart, bowed by STEPS kinds of curve STEP apart; a
// contact of a cell with itself as a loop ahead of it (LOOP); lines as wide as their count's
// logarithm (WIDTH), each kind in its colour.
const CONTACTS = Object.freeze({
  most : 120,
  floor : .1,
  lane : 11,
  steps : 7,
  step : 2,
  loop : {foot : 16, reach : 65, rise : 72},
  width : {least : 1.5, per_log : .65, most : 6.5},
  neutral : '#819c9d'
});
export function developedContactsSvg(state, centers) {
  const C = CONTACTS;
  const {document : doc, sites, selected, wireScope, report} = state;
  const members =
      wireScope === 'focus' ? networkMemberSet(doc, sites, selected, report?.contacts ?? []) : null;
  const centerList = allCenters(doc);
  const importance = ({count, positive, negative, positiveWeight, negativeWeight}) =>
      Math.sqrt(count) *
      (C.floor +
       (positive * Math.abs(positiveWeight) + negative * Math.abs(negativeWeight)) / count);
  const entries =
      (report?.contacts ?? [])
          .map(contactBundle)
          .filter(({from, to, count}) => count > 0 && centerList[from] && centerList[to] &&
                                         (!members || members.has(centerList[from].id) &&
                                                          members.has(centerList[to].id)))
          .sort((a, b) => importance(b) - importance(a))
          .slice(0, C.most)
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
        return '<g data-contact="' + id + '" class="aid-wire-group aid-developed-contact' +
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
                            fixed(width) + '" marker-end="url(#' + arrow + ')"/>';
                   })
                   .join('') +
               '<title>' + escapeText(joinParts([
                 linkText(centerTitle(a.center), centerTitle(b.center)),
                 t('studio.app.contactCount', {n : count})
               ])) +
               '</title></g>';
      })
      .join('');
}
// Arrowheads of wires and contacts keep their size on screen at any zoom, as the wires keep
// their width.
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
