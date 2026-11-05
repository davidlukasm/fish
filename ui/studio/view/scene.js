import {tectumBands, visionFan} from './vision.js';
import {
  bodySvg,
  eyeLocation,
  eyeRadius,
  fieldOrigin,
  fishOutline,
  organTitle,
  organHitsSvg,
  organHome,
  BODY_RADIUS_PIXELS,
  nodeLocation,
  organLocation,
  showsNodes
} from './body.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {TOOL_ICON} from './icons.js';
import {escapeText, fixed} from './markup.js';

import {hormoneColors} from '../../hormones.js';
import {t, tList} from '../../strings.js';
import {
  MODULES,
  ORGAN_BY_KEY,
  MUSCLE_LABEL_INDEX,
  eligible,
  functionFor,
  isRegion
} from '../model/organs.js';
import {
  allCenters,
  boundEffects,
  findCenter,
  findOrgan,
  endpointCenters,
  growsWith,
  learners,
  NOTICEABLE_AFFINITY,
  producers,
  receivers,
  receptorAffinity,
  teachersOf,
  wheelAffinity,
  wholeEndpoint,
  wiredCrossing
} from '../model/document.js';
import {BODY_FRAME, onMidline, sitePoint} from '../model/layout.js';
import {regionSlots, routedLinks} from '../model/regions.js';
import {FISH_BOX, cameraBox} from './frame.js';

export {organTitle};
// A node of a planned region is named by its place in the plan: a map node by the directions it
// takes (and its colour type), the output, the contrast cells.
export function centerTitle(center) {
  if (!center.node)
    return t('studio.centers.' + center.key);
  // A pallium's learning node names the kind it learns from: a region by its term, a sense
  // organ by its name.
  if (center.stream)
    return t('studio.regionNodes.learnFrom', {
      name : t(ORGAN_BY_KEY[center.stream]?.category === 'regions'
                   ? 'studio.regions.' + center.stream + '.term'
                   : 'studio.organs.' + center.stream)
                 .replace(/\u00ad/g, '')
    });
  if (!center.band)
    return t('studio.regionNodes.' + center.node);
  const [from, to] = center.band.map(Math.round);
  return center.type === null ? t('studio.regionNodes.map', {from, to})
                              : t('studio.regionNodes.mapType', {from, to, n : center.type + 1});
}
// A module's name: a built-in one's, the one it was saved under, or its number.
export function moduleName(doc, assembly) {
  const builtIn = t('studio.modules.' + assembly.name);
  return assembly.name && builtIn !== 'studio.modules.' + assembly.name ? builtIn
         : assembly.name
             ? assembly.name
             : t('studio.sections.module') + ' ' + (doc.assemblies.indexOf(assembly) + 1);
}
// What a wire attaches to, by name: an organ; a center of the brain; a node of an organ or a
// center of a brain region with its organ.
export function endpointTitle(doc, id, sites = null) {
  const organ = findOrgan(doc, id);
  if (organ)
    return organTitle(organ, sites);
  const found = findCenter(doc, id);
  if (!found)
    return '';
  return found.organ.type === 'brain'
             ? centerTitle(found.center)
             : organTitle(found.organ, sites) + ' · ' + centerTitle(found.center);
}
export const tone = kind => {
  if ([ 'eye', 'nose', 'proximity', 'lateral', 'touch', 'pain' ].includes(kind))
    return '#79d2be';
  if ([ 'bladder', 'gut', 'blood', 'gland' ].includes(kind))
    return '#b29bdc';
  if ([ 'eggs', 'sperm' ].includes(kind))
    return '#dfbc87';
  if (kind === 'brain')
    return '#b8c5e1';
  return '#eaa886';
};
// The wheel's geometry and response width come from the compiled Engine capabilities.
export const substanceColor = index => { return hormoneColors[index] ?? '#b7d3c9';};
const isSelected = (selection, kind, id) => selection?.kind === kind && selection?.id === id;
function pathTo(from, to, curve = 0) {
  const rise = Math.max(15, Math.min(66, Math.abs(to.x - from.x) * .19)) + curve;
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
    const a = doc.assemblies.find(a => a.id === selection.id);
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
    for (const [from, to, count] of contacts)
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
  return organ.type === 'eye' ? eyeLocation(doc, sites, organ.side < 0 ? -1 : 1)
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
  const bow = Math.max(WIRE_BOW.least, Math.min(WIRE_BOW.most, length * WIRE_BOW.share)) +
              lane * WIRE_BOW.lane;
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
const point = p => fixed(p.x) + ' ' + fixed(p.y);
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
  return 'M' + point(a) + ' C' + point(b) + ' ' + point(c) + ' ' + point(d);
};
const cubicAt = ([ a, b, c, d ], s) => {
  const r = 1 - s;
  return {
    x : r * r * r * a.x + 3 * r * r * s * b.x + 3 * r * s * s * c.x + s * s * s * d.x,
    y : r * r * r * a.y + 3 * r * r * s * b.y + 3 * r * s * s * c.y + s * s * s * d.y
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
const signalKind = center => center.modulator > .5 ? 'modulate'
                             : center.sign < 0     ? 'inhibit'
                                                   : 'excite';
// Every connection of every wire: a wire between paired organs draws one on each side, or two
// crossing the midline, or all four. Wires between the same two places with the same kind of
// signal run as one trunk, as broad as the wires it carries. Once an organ's nodes show, the
// trunk splits before it in smooth branches, one to each node a wire joins; at the start the
// branches from the nodes flow together into it. Clicking a trunk selects its wires in turn.
function wireSvg(state, centers) {
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
    const d = 'M' + point(trunk[0]) + ' Q' + point(trunk[1]) + ' ' + point(trunk[2]);
    const width = Math.hypot(...ends.map(e => e.width));
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id));
    // A click on the trunk selects the wire after the selected one.
    const next = ends[(chosen + 1) % ends.length].link.wire.id;
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    html +=
        '<g data-wire="' +
        escapeText(chosen >= 0 && wireIds.size === 1 ? ends[chosen].link.wire.id : next) +
        '" data-wires="' + escapeText([...wireIds ].join(' ')) + '" class="aid-wire-group' +
        (chosen >= 0 ? ' selected' : '') + '">' +
        '<path d="' + d + '" class="aid-wire-hit"/><path d="' + d +
        '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' + fixed(width) + '"' +
        (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/><title>' +
        escapeText(endpointTitle(doc, ends[0].link.from, state.sites) + ' → ' +
                   endpointTitle(doc, ends[0].link.to, state.sites) +
                   (wireIds.size > 1 ? ' · ' + wireIds.size + ' ' + t('studio.app.wires') : '')) +
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
    const rise = Math.max(15, Math.min(66, Math.abs(q.x - p.x) * .19)) + INNER_BOW;
    const way =
        leg(wholeEndpoint(doc, link.from), wholeEndpoint(doc, link.to), signalKind(a.center),
            sample(curveAt, [ p, {x : (p.x + q.x) / 2, y : (p.y + q.y) / 2 - rise}, q ]));
    way.strength = Math.min(1, way.strength + .5);
  }
  return [...legs.values() ].map(
      way => ({...way, starts : [...way.starts.values() ], arrives : [...way.arrives.values() ]}));
}
function developedContactsSvg(state, centers) {
  const {document : doc, sites, selected, wireScope, report} = state;
  const members =
      wireScope === 'focus' ? networkMemberSet(doc, sites, selected, report?.contacts ?? []) : null;
  const centerList = allCenters(doc);
  const importance = ([, , count, , positive, negative, meanPositive, meanNegative ]) =>
      Math.sqrt(count) *
      (.1 + (positive * Math.abs(meanPositive) + negative * Math.abs(meanNegative)) / count);
  const entries =
      (report?.contacts ?? [])
          .filter(([ from, to, count ]) => count > 0 && centerList[from] && centerList[to] &&
                                           (!members || members.has(centerList[from].id) &&
                                                            members.has(centerList[to].id)))
          .sort((a, b) => importance(b) - importance(a))
          .slice(0, 120)
          .reverse();
  return entries
      .map(([ from, to, count, , positive, negative, meanPositive, meanNegative ], index) => {
        const a = centers.get(centerList[from].id), b = centers.get(centerList[to].id);
        if (!a || !b)
          return '';
        const start = nodeLocation(doc, sites, a.center, a.organ.type);
        const end = nodeLocation(doc, sites, b.center, b.organ.type);
        const channels = [
          {kind : 'excite', count : positive, mean : meanPositive, color : '#9edaca'},
          {kind : 'inhibit', count : negative, mean : meanNegative, color : '#e8a2b5'}
        ].filter(channel => channel.count > 0);
        if (!channels.length)
          channels.push({kind : 'neutral', count, mean : 0, color : '#819c9d'});
        const id = from + ':' + to;
        return '<g data-contact="' + id + '" class="aid-wire-group aid-developed-contact' +
               (isSelected(selected, 'contact', id) ? ' selected' : '') + '">' +
               channels
                   .map((channel, lane) => {
                     const offset = channels.length > 1 ? (lane ? 11 : -11) : 0;
                     const curve = index % 7 * 2 + offset;
                     const d = from === to
                                   ? 'M' + fixed(start.x - 16) + ' ' + fixed(start.y) + ' C' +
                                         fixed(start.x - 65) + ' ' + fixed(start.y - 72 - curve) +
                                         ' ' + fixed(start.x + 65) + ' ' +
                                         fixed(start.y - 72 - curve) + ' ' + fixed(start.x + 16) +
                                         ' ' + fixed(start.y)
                                   : pathTo(start, end, curve);
                     const width = Math.min(6.5, 1.5 + Math.log1p(channel.count) * .65);
                     const arrow =
                         channel.kind === 'inhibit' ? 'aid-wire-arrow-inhibit' : 'aid-wire-arrow';
                     return '<path d="' + d + '" class="aid-wire-hit"/>' +
                            '<path d="' + d + '" class="aid-wire-ink" data-channel="' +
                            channel.kind + '" stroke="' + channel.color + '" stroke-width="' +
                            fixed(width) + '" marker-end="url(#' + arrow + ')"/>';
                   })
                   .join('') +
               '<title>' +
               escapeText(centerTitle(a.center) + ' → ' + centerTitle(b.center) + ' · ' + count +
                          ' ' + t('studio.app.contacts')) +
               '</title></g>';
      })
      .join('');
}
// Glands release, receivers carry a ring, learning cells a second one and the word: what the
// substance teaches them.
function hormoneGlyph(item, kind, color, zoom) {
  const r = kind === 'producer' ? 16 : 12;
  const word = item.quiet            ? ''
               : kind === 'producer' ? 'studio.inspector.releases'
               : item.teach          ? 'studio.inspector.learns'
                                     : '';
  return '<g class="aid-hormone-' + kind + (item.teach ? ' teach' : '') +
         '" transform="translate(' + fixed(item.pos.x) + ' ' + fixed(item.pos.y) + ') scale(' +
         fixed(1 / zoom) + ')" style="--hormone:' + color +
         ';opacity:' + fixed(.28 + .72 * item.affinity) + '">' +
         '<circle class="aid-hormone-aura" r="' + r + '"/>' +
         (item.teach ? '<circle class="aid-hormone-teach" r="' + fixed(r * 1.5) + '"/>' : '') +
         '<circle class="aid-hormone-core' + (item.focus ? ' focused' : '') + '" r="' +
         fixed(r / 2) + '"/>' +
         (word ? '<text class="aid-hormone-word" y="' + fixed(-r * 1.7) +
                     '" text-anchor="middle">' + escapeText(t(word)) + '</text>'
               : '') +
         '</g>';
}
// Glands close together, as a pair beside the midline, share one word, on the topmost: those
// within WORD_GAP screen pixels below a worded one stay quiet.
const WORD_GAP = 60;
function worded(items, zoom) {
  const speaking = [];
  return [...items ].sort((a, b) => a.pos.y - b.pos.y).map(item => {
    const quiet = speaking.some(
        other => Math.hypot(other.pos.x - item.pos.x, other.pos.y - item.pos.y) * zoom < WORD_GAP);
    if (!quiet)
      speaking.push(item);
    return {...item, quiet};
  });
}
// The nearest of `sources` to a position.
const nearest = (sources, pos) =>
    sources
        .reduce(
            (best, item) => {
              const distance = Math.hypot(item.pos.x - pos.x, item.pos.y - pos.y);
              return !best || distance < best.distance ? {item, distance} : best;
            },
            null)
        ?.item;
// With the learning tool, the selected nerve center's teachers: for each substance it learns
// from, the glands releasing it and the way from the nearest one to the learner.
function teachingOverlay(state) {
  const {document : doc, sites, capabilities, selected} = state;
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  if (!capabilities || found?.center.role !== 'nerve')
    return '';
  const zoom = state.camera.zoom ?? 1;
  const target = {pos : nodeLocation(doc, sites, found.center, found.organ.type), affinity : 1};
  let html = '';
  for (const {substance, glands} of teachersOf(doc, found.center, capabilities)) {
    const color = substanceColor(substance.index, capabilities);
    const sources = glands.map(c => {
      const hit = findCenter(doc, c.id);
      return {pos : nodeLocation(doc, sites, hit.center, hit.organ.type), affinity : 1};
    });
    const source = nearest(sources, target.pos);
    if (source)
      html += '<path class="aid-hormone-influence teach" d="' + pathTo(source.pos, target.pos, 17) +
              '" stroke="' + color + '"/>';
    html +=
        worded(sources, zoom).map(item => hormoneGlyph(item, 'producer', color, zoom)).join('') +
        hormoneGlyph({...target, teach : true}, 'receiver', color, zoom);
  }
  return html ? '<g class="aid-hormone-overlay" pointer-events="none">' + html + '</g>' : '';
}
function hormoneOverlay(state) {
  if (state.tool === 'learn')
    return teachingOverlay(state);
  const {document : doc, sites, capabilities} = state;
  if (state.tool !== 'hormone')
    return '';
  const substance = doc.substances.find(s => s.index === state.focusSubstance);
  if (!substance)
    return '';
  const color = substanceColor(substance.index, capabilities);
  const zoom = state.camera.zoom ?? 1;
  const sources = [], targets = [];
  const learning = new Set(learners(doc, substance.index, capabilities).map(c => c.id));
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const pos = nodeLocation(doc, sites, center, organ.type);
      if (organ.type === 'gland') {
        const affinity =
            wheelAffinity(capabilities, center.q1, center.q2, center.qwidth, substance.index);
        if (affinity >= NOTICEABLE_AFFINITY)
          sources.push({pos, affinity});
      }
      const effects = boundEffects(center, substance.index, capabilities)
                          .map(effect => ({
                                 effect,
                                 affinity : receptorAffinity(capabilities, center.receptors[effect],
                                                             substance.index)
                               }));
      if (effects.length)
        targets.push({
          pos,
          affinity : Math.max(...effects.map(item => item.affinity)),
          focus : effects.some(item => item.effect === state.effect),
          teach : learning.has(center.id)
        });
    }
  // A body that grows with the substance carries its colour along its outline.
  const growth = growsWith(doc, substance.index, capabilities)
                     ? '<path class="aid-hormone-body" d="' + fishOutline(state) +
                           '" style="--hormone:' + color + '"/>'
                     : '';
  const paths = targets
                    .map(target => {
                      const source = nearest(sources, target.pos);
                      if (!source)
                        return '';
                      return '<path class="aid-hormone-influence" d="' +
                             pathTo(source.pos, target.pos, 17) + '" stroke="' + color +
                             '" opacity="' + fixed(.1 + .33 * target.affinity) + '"/>';
                    })
                    .join('');
  return '<g class="aid-hormone-overlay" pointer-events="none">' + growth + paths +
         worded(sources, zoom)
             .map(source => hormoneGlyph(source, 'producer', color, zoom))
             .join('') +
         targets.map(target => hormoneGlyph(target, 'receiver', color, zoom)).join('') + '</g>';
}
export function centerMarker(center, radius) {
  const r = fixed(radius);
  if (center.role === 'motor')
    return '<rect class="aid-neural-dot" x="-' + r + '" y="-' + r + '" width="' +
           fixed(radius * 2) + '" height="' + fixed(radius * 2) + '" rx="2" fill="currentColor"/>' +
           '<path d="M-3 -3 L3 3 M-3 3 L3 -3" stroke="#10292d"/>';
  if (center.role === 'sensor')
    return '<circle class="aid-neural-dot" r="' + r + '" fill="currentColor"/>' +
           '<circle r="2.3" fill="#10292d"/>';
  const shape = center.key === 'inhibit' ? 'M0 -7 L6.5 5.5 H-6.5 Z' : 'M0 -7 L7 0 L0 7 L-7 0 Z';
  const glyph =
      center.key === 'pacemaker' ? '<path d="M0 -4 V0 L3 2" stroke="#10292d" fill="none"/>'
      : center.key === 'learn'
          ? '<path d="M-4 0 H4 M0 -4 V4 M-2.5 -2.5 L2.5 2.5 M-2.5 2.5 L2.5 -2.5" stroke="#10292d"/>'
      : center.key === 'modulate' ? '<path d="M-3 -3 V3 M0 -4 V4 M3 -3 V3" stroke="#10292d"/>'
      : center.key === 'inhibit'  ? '<path d="M-3 2 H3" stroke="#10292d"/>'
                                  : '<path d="M-3 0 H3 M0 -3 V3" stroke="#10292d"/>';
  return '<path class="aid-neural-dot" d="' + shape + '" fill="currentColor"/>' + glyph;
}
// With the hormone tool, the focused substance's glands and receiving centers carry its colour;
// after a measurement, centers whose mean activity changed by more than MEASURED_CHANGE.
const MEASURED_CHANGE = .01;
function hormoneRoles(state) {
  const roles = new Map(), index = state.focusSubstance;
  const wheel = state.capabilities;
  if (state.tool !== 'hormone' || !wheel || !state.document.substances.some(s => s.index === index))
    return roles;
  for (const c of receivers(state.document, index, wheel))
    roles.set(c.id, 'receives');
  for (const c of producers(state.document, index, wheel))
    roles.set(c.id, 'produces');
  // A measurement marks the centers whose activity the substance raises or lowers.
  const m = state.measurement;
  if (m?.substance === index)
    allCenters(state.document).forEach((c, k) => {
      if (Math.abs(m.groups[k]) > MEASURED_CHANGE)
        roles.set(c.id, m.groups[k] > 0 ? 'raised' : 'lowered');
      if (m.dead[k])
        roles.set(c.id, 'dies');
    });
  return roles;
}
function centersSvg(state) {
  const {document : doc, sites, selected, camera} = state;
  const zoom = camera.zoom ?? 1;
  const roles = hormoneRoles(state), substance = hormoneColors[state.focusSubstance];
  const activeAssembly = selected?.kind === 'assembly'
                             ? doc.assemblies.find(assembly => assembly.id === selected.id)
                             : null;
  const assemblyCenters = new Set(activeAssembly?.centerIds ?? []);
  let result = '';
  for (const organ of doc.organs) {

    const pos = organLocation(organ, sites, doc);
    const color = tone(organ.type);
    const selectedOrg = isSelected(selected, 'organ', organ.id) ||
                        (state.multi?.has(organ.id) ?? false) ||
                        (activeAssembly?.organIds.includes(organ.id) &&
                         organ.centers.some(center => assemblyCenters.has(center.id)));
    // A region shows its nodes while it is chosen, a tool works on nodes or from NODE.zoom on;
    // else it stands as its hull and symbol.
    if (organ.type !== 'brain' && !(isRegion(organ) && showsNodes(state, [ organ ])))
      continue;
    for (const center of organ.centers) {
      const cp = nodeLocation(doc, sites, center, organ.type);
      const selectedCenter = isSelected(selected, 'center', center.id) ||
                             (state.multi?.has(center.id) ?? false) || selectedOrg ||
                             assemblyCenters.has(center.id);
      const r = selectedCenter ? 7.5 : 5.5;
      result +=
          '<g class="aid-neural-center' + (selectedCenter ? ' selected' : '') + '" data-center="' +
          escapeText(center.id) + '" transform="translate(' + fixed(cp.x) + ' ' + fixed(cp.y) +
          ') scale(' + fixed(1 / zoom) + ')">' +
          '<circle class="aid-neural-body" r="' + fixed(r + 4) + '" fill="' + color +
          '" opacity=".25"/>' +
          (roles.has(center.id) ? '<circle class="aid-hormone-ring ' + roles.get(center.id) +
                                      '" r="' + fixed(r + 7) + '" stroke="' + substance + '"/>'
                                : '') +
          '<g style="color:' + color + '">' + centerMarker(center, r) + '</g></g>';
    }
    // The name shows for the organ chosen itself; a chosen module's organs stay unnamed, so their
    // names do not pile up.
    if (isSelected(selected, 'organ', organ.id)) {
      result += '<text data-label-y="' + fixed(pos.y) + '" x="' + fixed(pos.x) + '" y="' +
                fixed(pos.y + 47 / zoom) +
                '" text-anchor="middle" class="aid-organ-label" font-size="' + fixed(14 / zoom) +
                '">' + escapeText(organTitle(organ, state.sites)) + '</text>';
    }
  }
  return result;
}

function assembliesSvg(state) {
  const {document : doc, sites, selected, camera} = state;
  return doc.assemblies
      .map(assembly => {
        const included = new Set(assembly.centerIds ?? []);
        const centers = allCenters(doc).filter(c => included.has(c.id));
        if (!centers.length)
          return '';
        const positions = centers.map(c => nodeLocation(doc, sites, c, c.organType));
        const x = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const y = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
        const active = isSelected(selected, 'assembly', assembly.id);
        return '<g class="aid-assembly-stamp' + (active ? ' selected' : '') + '" data-assembly="' +
               escapeText(assembly.id) + '" transform="translate(' + fixed(x) + ' ' +
               fixed(y - 45) + ') scale(' + fixed(1 / (camera.zoom ?? 1)) + ')">' +
               '<rect x="-17" y="-15" width="34" height="30" rx="9"/>' +
               '<path d="M-8 -2 L-3 -6 L4 -2 L9 -6 M-8 5 L-3 1 L4 5 L9 1" fill="none"/>' +
               '<title>' + escapeText(moduleName(doc, assembly)) + '</title></g>';
      })
      .join('');
}
// Each colour identifies a real centre role. Shared sites are split into separate ring sectors.
const HINT_SHADES = Object.freeze(
    [ '#82d5cb', '#ebbd7a', '#b99ddf', '#7eabe4', '#d4e18a', '#f19fa5', '#a6c5db', '#e0a6d2' ]);
// The free sites an organ can take; the sites of an organ being moved count as free.
export function placementHints(state, kind, value, moving = null) {
  if (!state.sites.length)
    return {svg : ''};
  const descriptors = [];
  const add = (type, center) => {
    if (center)
      descriptors.push({type, center});
  };
  // Brain regions go to their place in the drawn brain, which shows itself.
  const placed = type => ORGAN_BY_KEY[type]?.category !== 'regions';
  if (kind === 'organ' && placed(value))
    for (const center of ORGAN_BY_KEY[value]?.centers ?? [])
      add(value, center);
  if (kind === 'neuron')
    add('brain', {key : value, role : 'nerve', functionCode : -1});
  if (kind === 'module')
    for (const type of (MODULES.find(m => m.key === value)?.organs ?? []).filter(placed))
      for (const center of ORGAN_BY_KEY[type]?.centers ?? [])
        add(type, center);
  if (kind === 'user-module') {
    const module = state.userModules.find(m => m.id === value);
    for (const organ of module?.organs ?? [])
      for (const center of organ.centers) {
        const desc = organ.type === 'brain'
                         ? {key : center.key, role : 'nerve', functionCode : -1}
                         : ORGAN_BY_KEY[organ.type]?.centers.find(c => c.key === center.key);
        add(organ.type, desc);
      }
  }
  const used =
      new Set(allCenters(state.document).filter(c => c.organId !== moving).map(c => c.site));
  const labels = new Map(), sites = new Map(), types = new Set(descriptors.map(d => d.type));
  const areas = new Map();
  for (const {type, center} of descriptors)
    for (const site of state.sites) {
      if (used.has(site.id) || !eligible(center, site) ||
          (center.role === 'nerve' && site.zone !== 1 && site.zone !== 2))
        continue;
      const muscle = center.functionCode === 'site';
      const index = muscle ? MUSCLE_LABEL_INDEX.get(functionFor(center, site)) : undefined;
      if (muscle && index === undefined)
        continue;
      const key = type + ':' + center.key + (muscle ? ':' + index : '');
      if (!labels.has(key))
        labels.set(key, {
          colour : HINT_SHADES[labels.size % HINT_SHADES.length],
          name : muscle           ? tList('studio.muscles')[index]
                 : types.size > 1 ? organTitle({type}) + ' · ' + centerTitle(center)
                                  : centerTitle(center)
        });
      const point = sitePoint(site, type);
      const location = point.x + ':' + point.y;
      if (!sites.has(location))
        sites.set(location, {point, keys : new Set()});
      sites.get(location).keys.add(key);
      if (muscle) {
        const area = areas.get(key) ?? {from : point.x, to : point.x};
        areas.set(key, {from : Math.min(area.from, point.x), to : Math.max(area.to, point.x)});
      }
    }
  const zoom = state.camera.zoom ?? 1;
  // A muscle's works lie in stretches of the body: each tinted in its colour and named.
  const clip = 'aid-hint-body';
  const bands =
      areas.size
          ? '<defs><clipPath id="' + clip + '"><path d="' + fishOutline(state) +
                '"/></clipPath></defs><g class="aid-muscle-areas" clip-path="url(#' + clip + ')">' +
                [...areas.entries() ]
                    .map(([ key, {from, to} ]) => {
                      const {colour, name} = labels.get(key), pad = MUSCLE_AREA.pad;
                      return '<rect x="' + fixed(from - pad) + '" y="0" width="' +
                             fixed(to - from + 2 * pad) + '" height="' +
                             (FISH_BOX.y + FISH_BOX.height) + '" fill="' + colour + '"/><text x="' +
                             fixed((from + to) / 2) + '" y="' +
                             fixed(BODY_FRAME.middle + MUSCLE_AREA.label) +
                             '" text-anchor="middle" style="font-size:' +
                             fixed(MUSCLE_AREA.size / zoom) + 'px">' + escapeText(name) + '</text>';
                    })
                    .join('') +
                '</g>'
          : '';
  const svg =
      bands +
      [...sites.values() ]
          .map(({point, keys}) => {
            const entries = [...keys ];
            const length = 2 * Math.PI * 9, span = length / entries.length;
            const arcs = entries
                             .map((key, i) => {
                               const color = labels.get(key).colour;
                               const dash = entries.length === 1 ? length : Math.max(0, span - 1.4);
                               return '<circle r="9" fill="none" stroke="' + color +
                                      '" stroke-width="3" stroke-dasharray="' + fixed(dash) + ' ' +
                                      fixed(length - dash) + '" stroke-dashoffset="' +
                                      fixed(-i * span) + '" transform="rotate(-90)"/>';
                             })
                             .join('');
            return '<g class="aid-site-hint" data-point-x="' + fixed(point.x) + '" data-point-y="' +
                   fixed(point.y) + '" transform="translate(' + fixed(point.x) + ' ' +
                   fixed(point.y) + ') scale(' + fixed(1 / zoom) + ')">' + arcs + '</g>';
          })
          .join('');
  return {svg, legend : labels.size > 1 ? [...labels.values() ] : []};
}
// A muscle's area reaches PAD past its outer places; its name stands LABEL below the midline,
// SIZE pixels high on screen.
const MUSCLE_AREA = Object.freeze({pad : 14, label : 6, size : 15});
// What the colours of the placement hints stand for: a muscle's work there, or the part of an
// organ or module that may sit there.
export function hintLegend(legend) {
  return legend
      .map(({colour, name}) =>
               '<span><i style="border-color:' + colour + '"></i>' + escapeText(name) + '</span>')
      .join('');
}
// Arrowheads of wires and contacts keep their size on screen at any zoom, as the wires keep
// their width.
const ARROW = Object.freeze({size : 8, tip : 7, middle : 3});
const ARROW_COLOURS =
    Object.freeze({'' : '#a7d9cd', '-inhibit' : '#e8a2b5', '-modulate' : '#e2c487'});
export const arrowSize = zoom => fixed(ARROW.size / zoom);
function wireMarkers(zoom) {
  return Object.entries(ARROW_COLOURS)
      .map(([ kind, colour ]) =>
               '<marker id="aid-wire-arrow' + kind + '" class="aid-wire-marker" ' +
               'viewBox="0 0 ' + ARROW.size + ' ' + ARROW.size + '" markerWidth="' +
               arrowSize(zoom) + '" markerHeight="' + arrowSize(zoom) + '" refX="' + ARROW.tip +
               '" refY="' + ARROW.middle +
               '" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L' + ARROW.tip + ' ' +
               ARROW.middle + ' L0 ' + 2 * ARROW.middle + '" fill="' + colour + '"/></marker>')
      .join('');
}
// The slots of a brain region (or a gonad) beside its nodes, away from the midline: what fills
// them, or the kind of organ that fits, marked where it needs one. A chosen one shows them all,
// others only the ones they still need. A click on one starts a wire there.
const SLOT = Object.freeze({width : 26, height : 20, gap : 5, away : 22, icon : 14});
function slotsSvg(state) {
  const {document : doc, sites, selected} = state, zoom = state.camera?.zoom ?? 1;
  let html = '';
  for (const organ of doc.organs.filter(o => ORGAN_BY_KEY[o.type].slots)) {
    const chosen = selected?.id === organ.id || organ.centers.some(c => c.id === selected?.id);
    const slots = regionSlots(doc, organ).filter(s => chosen || s.required && !s.filled.length);
    const points = organ.centers.map(c => nodeLocation(doc, sites, c, organ.type));
    if (!slots.length || !points.length)
      continue;
    const out = organ.side < 0 ? -1 : 1;
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = (out < 0 ? Math.min : Math.max)(...points.map(p => p.y)) + out * SLOT.away / zoom;
    slots.forEach((slot, i) => {
      const shown = slot.filled[0]?.type ?? slot.fits[0] ?? null;
      const fill = slot.filled.length ? 'filled' : slot.required ? 'missing' : 'free';
      const dx = (i - (slots.length - 1) / 2) * (SLOT.width + SLOT.gap);
      const name =
          t('studio.regions.slots.' + slot.key) + ' · ' +
          t(slot.required ? 'studio.regions.required' : 'studio.regions.optional') +
          (slot.filled.length ? ': ' + slot.filled.map(o => organTitle(o, sites)).join(', ') : '');
      html += '<g class="aid-slot-chip ' + fill + ' ' + slot.dir + '" data-slot-region="' +
              escapeText(organ.id) + '" data-slot-dir="' + slot.dir + '" transform="translate(' +
              fixed(x) + ' ' + fixed(y) + ') scale(' + fixed(1 / zoom) + ')"><title>' +
              escapeText(name.replace(/\u00ad/g, '')) + '</title><rect x="' +
              fixed(dx - SLOT.width / 2) + '" y="' + fixed(-SLOT.height / 2) + '" width="' +
              SLOT.width + '" height="' + SLOT.height + '" rx="6"/>' +
              '<svg x="' + fixed(dx - SLOT.icon / 2) + '" y="' + fixed(-SLOT.icon / 2) +
              '" width="' + SLOT.icon + '" height="' + SLOT.icon +
              '" viewBox="0 0 24 24"><path d="' +
              escapeText(shown               ? STUDIO_ICON[shown] ?? STUDIO_ICON.brain
                         : slot.dir === 'in' ? SLOT_IN
                                             : SLOT_OUT) +
              '"/></svg></g>';
    });
  }
  return html;
}
const SLOT_IN = 'M4 12h12M12 7l5 5-5 5M20 5v14', SLOT_OUT = 'M4 5v14M8 12h12M16 7l5 5-5 5';
// How far a chosen nerve center's signals reach, as the engine weighs a contact: falling to 1/e
// at its reach (from the engine's least reach to the whole body as its range goes from 0 to 1),
// on its own half of the body as much as it keeps to its side, on the other half as much as it
// crosses; a center on the midline reaches both halves alike.
function reachSvg(state) {
  const {document : doc, sites, selected} = state, least = state.capabilities?.reachLeast;
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  const site = sites.find(s => s.id === found?.center.site);
  // A region's nodes stand in the drawn brain, not where their cells lie: they show no reach.
  if (!found || found.center.role !== 'nerve' || isRegion(found.organ) || !(least >= 0) || !site)
    return '';
  const p = nodeLocation(doc, sites, found.center, found.organ.type);
  const reach = (least + (1 - least) * found.center.range) * BODY_RADIUS_PIXELS;
  const crossing = wiredCrossing(doc, found.center, sites) ?? found.center.crossing;
  const own = onMidline(site) ? 1 : Math.max(0, Math.min(1, 1 - crossing)),
        other = onMidline(site) ? 1 : Math.max(0, Math.min(1, 1 + crossing));
  const upper = p.y < BODY_FRAME.middle || onMidline(site) && site.side < 0;
  // The weight falls by e with each reach: drawn out to REACH.span reaches.
  const fade =
      '<radialGradient id="aid-reach-fade">' +
      Array
          .from({length : REACH.span + 1}, (_, k) => '<stop offset="' + fixed(k / REACH.span) +
                                                     '" stop-color="#b8c5e1" stop-opacity="' +
                                                     fixed(REACH.fill * Math.exp(-k)) + '"/>')
          .join('') +
      '</radialGradient>';
  const half = (top, weight) =>
      weight > 0 ? '<circle cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
                       fixed(reach * REACH.span) +
                       '" fill="url(#aid-reach-fade)" clip-path="url(#aid-reach-' +
                       (top ? 'upper' : 'lower') + ')" opacity="' + fixed(weight) + '"/>'
                 : '';
  // Each half is cut as far out as the halo reaches.
  const far = reach * REACH.span;
  const clip = (id, y) => '<clipPath id="aid-reach-' + id + '"><rect x="' + fixed(p.x - far) +
                          '" y="' + fixed(y) + '" width="' + fixed(2 * far) + '" height="' +
                          fixed(far + Math.abs(p.y - BODY_FRAME.middle)) + '"/></clipPath>';
  return '<g class="aid-reach">' + fade +
         clip('upper', BODY_FRAME.middle - far - Math.abs(p.y - BODY_FRAME.middle)) +
         clip('lower', BODY_FRAME.middle) + half(upper, own) + half(!upper, other) +
         '<circle class="aid-reach-edge" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) + '" r="' +
         fixed(reach) + '"/></g>';
}
const REACH = Object.freeze({fill : .32, span : 2});
export function fishScene(state) {
  const camera = cameraBox(state.camera);
  const centers = new Map();
  for (const organ of state.document.organs)
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
  const anatomy = bodySvg(state);
  for (const organ of state.document.organs) {
    if (organ.type !== 'brain' && organ.centers.length)
      centers.set(organ.id, {organ, center : organ.centers[0]});
  }
  const cones = state.document.organs.filter(o => o.field).map(o => visionFan(state, o)).join('') +
                tectumBands(state);
  const box = [ camera.x, camera.y, camera.width, camera.height ].map(fixed).join(' ');
  return '<svg id="aid-body-map" viewBox="' + box +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs>' + wireMarkers(camera.zoom) +
         '<linearGradient id="aid-fish-light" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#76b7ad"/><stop offset="100%" stop-color="#163c45"/>' +
         '</linearGradient></defs>' +
         '<rect x="0" y="0" width="1120" height="740" class="aid-canvas-ground"/>' +
         '<g class="aid-anatomy">' + anatomy + '</g>' + hormoneOverlay(state) +
         '<g class="aid-wires">' +
         (state.contactView === 'actual' && !state.stale && state.report?.contacts
              ? developedContactsSvg(state, centers)
              : wireSvg(state, centers)) +
         '</g>' + reachSvg(state) + organHitsSvg(state) + '<g class="aid-centers">' +
         centersSvg(state) + '</g>' +
         '<g class="aid-slots">' + slotsSvg(state) + '</g>' +
         '<g class="aid-assemblies">' + assembliesSvg(state) + '</g>' +
         '<g class="aid-fov-fields">' + cones + '</g>' +
         '<g id="aid-placement-hints"></g>' +
         '<g id="aid-choices" pointer-events="none"></g>' +
         '<g id="aid-drag-preview" pointer-events="none"></g>' +
         '<path id="aid-connecting-line" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>' + trashZone() + '<div class="aid-hint-legend" data-hint-legend hidden></div>';
}
// While an organ is dragged, dropping it here removes it.
function trashZone() {
  return '<div class="aid-trash" data-trash hidden title="' + escapeText(t('studio.tools.trash')) +
         '"><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
         TOOL_ICON.erase + '" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
         'stroke-linejoin="round" fill="none"/></svg><span>' + escapeText(t('studio.tools.trash')) +
         '</span></div>';
}
// The field organs a choice moves or adds: whose field differs from the current design.
function movedFieldOrgans(state, choice) {
  return choice.document.organs.filter(organ => {
    if (!organ.field)
      return false;
    const now = findOrgan(state.document, organ.id);
    return !now || JSON.stringify(now.field) !== JSON.stringify(organ.field) ||
           JSON.stringify(now.centers.map(c => c.site)) !==
               JSON.stringify(organ.centers.map(c => c.site));
  });
}
// Where field organs can go while one is dragged: a mark at every seat the body offers, and at
// the nearest one the organ itself with its field, exactly where that choice places them.
const seatOf = (state, choice, organ) => fieldOrigin(choice.document, state.sites, organ);
export function choicesSvg(state, choices, nearest) {
  const zoom = state.camera.zoom ?? 1;
  let html = '';
  for (const choice of choices)
    for (const organ of movedFieldOrgans(state, choice)) {
      const seat = seatOf(state, choice, organ);
      if (seat)
        html += '<circle class="aid-seat-hint' + (choice === nearest ? ' near' : '') + '" cx="' +
                fixed(seat.x) + '" cy="' + fixed(seat.y) + '" r="' + fixed(SEAT_MARK / zoom) +
                '"/>';
    }
  if (!nearest)
    return html;
  const view = {...state, document : nearest.document, selected : null};
  for (const organ of movedFieldOrgans(state, nearest)) {
    const seat = seatOf(state, nearest, organ);
    html += visionFan(view, organ);
    if (seat && organ.type === 'eye') {
      const r = Math.max(eyeRadius(nearest.document, organ.side < 0 ? -1 : 1), SEAT_MARK / zoom);
      html += '<ellipse class="aid-seat-ghost" cx="' + fixed(seat.x) + '" cy="' + fixed(seat.y) +
              '" rx="' + fixed(r) + '" ry="' + fixed(r) + '"/>';
    }
  }
  return html;
}
// The seat of a field organ for a choice, to find the one nearest the pointer.
export function choiceSeats(state, choice) {
  return movedFieldOrgans(state, choice).map(organ => seatOf(state, choice, organ)).filter(Boolean);
}
// Seat marks are SEAT_MARK frame units across at zoom 1.
const SEAT_MARK = 7;
// A cursor marker identifies the organ being placed.
// A brain region goes to its spot in the brain on the side it is dragged over.
// A dragged organ shows where it will lie: a brain region at its spot, an inner organ at its
// place in the plan, any other where it is dropped.
export function organPreview(state, kind, key, position) {
  const spot =
      kind === 'organ' && organHome(state.document, key, position.y < BODY_FRAME.middle ? -1 : 1);
  return placementPreview(state, {type : kind === 'organ' ? key : 'brain'}, spot || position);
}
export function assemblyPreview(state, placed) {
  if (!placed?.document)
    return '';
  const added = placed.document.organs.filter(o => !state.document.organs.some(p => p.id === o.id));
  return added
      .map(o => placementPreview(state, {type : o.type},
                                 organLocation(o, state.sites, placed.document)))
      .join('');
}
export function placementPreview(state, descriptor, position) {
  if (!position || !descriptor)
    return '';
  const zoom = state.camera.zoom ?? 1;
  const colour = tone(descriptor.type ?? 'brain');
  const icon = STUDIO_ICON[descriptor.type] ?? STUDIO_ICON.brain;
  return '<g transform="translate(' + fixed(position.x) + ' ' + fixed(position.y) + ') scale(' +
         fixed(1 / zoom) + ')">' +
         '<circle r="26" class="aid-preview-ring" fill="' + colour + '"/>' +
         '<svg x="-14" y="-14" width="28" height="28" viewBox="0 0 24 24">' +
         '<path d="' + escapeText(icon) +
         '" fill="none" stroke="#072e34" stroke-width="2"/></svg></g>';
}
