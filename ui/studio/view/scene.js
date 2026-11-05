import {visionFan} from './vision.js';
import {
  bodySvg,
  centerLocation,
  eyeLocation,
  eyeRadius,
  fieldOrigin,
  nodeLocation,
  organLocation,
  showsNodes
} from './body.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {TOOL_ICON} from './icons.js';
import {escapeText, fixed} from './markup.js';

import {hormoneColors} from '../../hormones.js';
import {t} from '../../strings.js';
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
  expandedWires,
  growsWith,
  learners,
  NOTICEABLE_AFFINITY,
  producers,
  receivers,
  receptorAffinity,
  teachersOf,
  wheelAffinity
} from '../model/document.js';
import {sitePoint} from '../model/layout.js';
import {cameraBox, fishPath} from './frame.js';

export const organTitle = organ => t('studio.organs.' + organ.type);
export const centerTitle = center => t('studio.centers.' + center.key);
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
export function endpointTitle(doc, id) {
  const organ = findOrgan(doc, id);
  if (organ)
    return organTitle(organ);
  const found = findCenter(doc, id);
  if (!found)
    return '';
  return found.organ.type === 'brain' ? centerTitle(found.center)
                                      : organTitle(found.organ) + ' · ' + centerTitle(found.center);
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
function networkMemberSet(doc, selection, contacts = null) {
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
    for (const link of expandedWires(doc)) {
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
                              : organLocation(organ, sites);
}
// Where a wire's trunk ends: at an organ, also for one of its nodes, whose wires bundle there;
// at a nerve center of the brain or a brain region, each drawn on its own. The key names that
// place, so wires ending at the same one share their trunk.
function endpointAnchor(doc, sites, id, centers) {
  const organ = findOrgan(doc, id);
  if (organ)
    return {key : organ.id, point : organAnchor(doc, sites, organ), organ};
  const found = centers.get(id);
  if (!found)
    return null;
  return found.organ.type === 'brain' || isRegion(found.organ)
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
  return nodes.map(center => nodeLocation(state.document, state.sites, center, organ.type));
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
function branchPath(node, join, towards, inward) {
  const pull = Math.hypot(join.x - node.x, join.y - node.y) * BRANCH.pull;
  const guide = {
    x : join.x + (inward ? -1 : 1) * towards.x * pull,
    y : join.y + (inward ? -1 : 1) * towards.y * pull
  };
  const lead = {
    x : node.x + (guide.x - node.x) * BRANCH.lead,
    y : node.y + (guide.y - node.y) * BRANCH.lead
  };
  return inward ? 'M' + point(node) + ' C' + point(lead) + ' ' + point(guide) + ' ' + point(join)
                : 'M' + point(join) + ' C' + point(guide) + ' ' + point(lead) + ' ' + point(node);
}
const WIRE_KINDS = Object.freeze({
  excite : {colour : '#9edaca', arrow : 'aid-wire-arrow'},
  inhibit : {colour : '#e8a2b5', arrow : 'aid-wire-arrow-inhibit'},
  modulate : {colour : '#e2c487', arrow : 'aid-wire-arrow-modulate'}
});
const WIRE_WIDTH = Object.freeze({base : 1.6, spread : 3.5});
// Every connection of every wire: a wire between paired organs draws one on each side, or two
// crossing the midline, or all four. Wires between the same two places with the same kind of
// signal run as one trunk, as broad as the wires it carries. Once an organ's nodes show, the
// trunk splits before it in smooth branches, one to each node a wire joins; at the start the
// branches from the nodes flow together into it. Clicking a trunk selects its wires in turn.
function wireSvg(state, centers) {
  const {document : doc, sites, selected, wireScope} = state;
  const members = wireScope === 'focus' ? networkMemberSet(doc, selected) : null;
  const bundles = new Map();
  for (const link of expandedWires(doc)) {
    if (members && !(members.has(link.from) && members.has(link.to)))
      continue;
    const a = centers.get(link.from);
    const from = endpointAnchor(doc, sites, link.from, centers),
          to = endpointAnchor(doc, sites, link.to, centers);
    if (!a || !centers.get(link.to) || !from || !to)
      continue;
    const kind = a.center.modulator > .5 ? 'modulate' : a.center.sign < 0 ? 'inhibit' : 'excite';
    const key = from.key + '>' + to.key + '>' + kind;
    if (!bundles.has(key))
      bundles.set(key, {from, to, kind, links : []});
    bundles.get(key).links.push(link);
  }
  let html = '';
  for (const {from, to, kind, links} of bundles.values()) {
    const style = WIRE_KINDS[kind], lane = Object.keys(WIRE_KINDS).indexOf(kind);
    const q = course(from.point, to.point, lane);
    const chord = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
    const ends = links.map(link => ({
                             link,
                             starts : branchNodes(state, link.from, from, centers),
                             arrives : branchNodes(state, link.to, to, centers),
                             width : WIRE_WIDTH.base + WIRE_WIDTH.spread * link.wire.spread
                           }));
    const s0 = joinAt(from.point, ends.flatMap(e => e.starts), chord),
          s1 = 1 - joinAt(to.point, ends.flatMap(e => e.arrives), chord);
    const trunk = curvePart(q, s0, s1), splits = ends.some(e => e.arrives.length);
    const d = 'M' + point(trunk[0]) + ' Q' + point(trunk[1]) + ' ' + point(trunk[2]);
    const width = Math.hypot(...ends.map(e => e.width));
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id));
    // A click on the trunk selects the wire after the selected one.
    const next = ends[(chosen + 1) % ends.length].link.wire.id;
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    html +=
        '<g data-wire="' +
        escapeText(chosen >= 0 && wireIds.size === 1 ? ends[chosen].link.wire.id : next) +
        '" class="aid-wire-group' + (chosen >= 0 ? ' selected' : '') + '">' +
        '<path d="' + d + '" class="aid-wire-hit"/><path d="' + d +
        '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' + fixed(width) + '"' +
        (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') + '/><title>' +
        escapeText(endpointTitle(doc, ends[0].link.from) + ' → ' +
                   endpointTitle(doc, ends[0].link.to) +
                   (wireIds.size > 1 ? ' · ' + wireIds.size + ' ' + t('studio.app.wires') : '')) +
        '</title></g>';
    const startDirection = curveDirection(q, s0), endDirection = curveDirection(q, s1);
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
function developedContactsSvg(state, centers) {
  const {document : doc, sites, selected, wireScope, report} = state;
  const members =
      wireScope === 'focus' ? networkMemberSet(doc, selected, report?.contacts ?? []) : null;
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
                     ? '<path class="aid-hormone-body" d="' + fishPath() +
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

    const pos = organLocation(organ, sites);
    const iconic = [ 'blood', 'pain', 'touch', 'pigment' ].includes(organ.type);
    const color = tone(organ.type);
    const selectedOrg = isSelected(selected, 'organ', organ.id) ||
                        (state.multi?.has(organ.id) ?? false) ||
                        (activeAssembly?.organIds.includes(organ.id) &&
                         organ.centers.some(center => assemblyCenters.has(center.id)));
    const size = iconic ? 23 : 18;
    if (iconic) {
      result += '<g class="aid-organ-stamp' + (selectedOrg ? ' selected' : '') + '" data-organ="' +
                escapeText(organ.id) + '" transform="translate(' + fixed(pos.x) + ' ' +
                fixed(pos.y) + ') scale(' + fixed(1 / zoom) + ')">' +
                '<circle class="aid-organ-stamp-bg" r="' + size + '" fill="' + color + '"/>' +
                '<svg x="-13" y="-13" width="26" height="26" viewBox="0 0 24 24">' +
                '<path d="' + escapeText(STUDIO_ICON[organ.type] ?? STUDIO_ICON.brain) +
                '" fill="none" stroke="#082830" stroke-width="1.8" stroke-linecap="round"/></svg>' +
                '</g>';
    }
    for (const center of organ.centers) {
      if (organ.type !== 'brain' && !isRegion(organ))
        continue;
      const cp = centerLocation(center, organ.type, sites);
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
    if (selectedOrg) {
      result += '<text data-label-y="' + fixed(pos.y) + '" x="' + fixed(pos.x) + '" y="' +
                fixed(pos.y + 47 / zoom) +
                '" text-anchor="middle" class="aid-organ-label" font-size="' + fixed(14 / zoom) +
                '">' + escapeText(organTitle(organ)) + '</text>';
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
  if (kind === 'organ')
    for (const center of ORGAN_BY_KEY[value]?.centers ?? [])
      add(value, center);
  if (kind === 'neuron')
    add('brain', {key : value, role : 'nerve', functionCode : -1});
  if (kind === 'module') {
    const module = MODULES.find(m => m.key === value);
    let circuit = 0;
    for (const type of module?.organs ?? []) {
      if (type === 'brain') {
        add('brain',
            {key : module.circuits[circuit++] ?? 'relay', role : 'nerve', functionCode : -1});
      } else
        for (const center of ORGAN_BY_KEY[type]?.centers ?? [])
          add(type, center);
    }
  }
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
  const labels = new Map(), sites = new Map();
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
        labels.set(key, HINT_SHADES[labels.size % HINT_SHADES.length]);
      const point = sitePoint(site, type);
      const location = point.x + ':' + point.y;
      if (!sites.has(location))
        sites.set(location, {point, keys : new Set()});
      sites.get(location).keys.add(key);
    }
  const zoom = state.camera.zoom ?? 1;
  const svg =
      [...sites.values() ]
          .map(({point, keys}) => {
            const entries = [...keys ];
            const length = 2 * Math.PI * 9, span = length / entries.length;
            const arcs = entries
                             .map((key, i) => {
                               const color = labels.get(key);
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
  return {svg};
}
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
  const cones = state.document.organs.filter(o => o.field).map(o => visionFan(state, o)).join('');
  const box = [ camera.x, camera.y, camera.width, camera.height ].map(fixed).join(' ');
  return '<svg id="aid-body-map" viewBox="' + box +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs><marker id="aid-wire-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#a7d9cd"/></marker>' +
         '<marker id="aid-wire-arrow-inhibit" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#e8a2b5"/></marker>' +
         '<marker id="aid-wire-arrow-modulate" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#e2c487"/></marker>' +
         '<linearGradient id="aid-fish-light" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#76b7ad"/><stop offset="100%" stop-color="#163c45"/>' +
         '</linearGradient></defs>' +
         '<rect x="0" y="0" width="1120" height="740" class="aid-canvas-ground"/>' +
         '<g class="aid-anatomy">' + anatomy + '</g>' + hormoneOverlay(state) +
         '<g class="aid-wires">' +
         (state.contactView === 'actual' && !state.stale && state.report?.contacts
              ? developedContactsSvg(state, centers)
              : wireSvg(state, centers)) +
         '</g>' +
         '<g class="aid-centers">' + centersSvg(state) + '</g>' +
         '<g class="aid-assemblies">' + assembliesSvg(state) + '</g>' +
         '<g class="aid-fov-fields">' + cones + '</g>' +
         '<g id="aid-placement-hints"></g>' +
         '<g id="aid-choices" pointer-events="none"></g>' +
         '<g id="aid-drag-preview" pointer-events="none"></g>' +
         '<path id="aid-connecting-line" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>' + trashZone();
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
export function organPreview(state, kind, key, position) {
  return placementPreview(state, {type : kind === 'organ' ? key : 'brain'}, position);
}
export function assemblyPreview(state, placed) {
  if (!placed?.document)
    return '';
  const added = placed.document.organs.filter(o => !state.document.organs.some(p => p.id === o.id));
  return added.map(o => placementPreview(state, {type : o.type}, organLocation(o, state.sites)))
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
