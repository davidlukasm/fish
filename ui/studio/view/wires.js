import {nodeOpacity} from './layers.js';
import {nerveRoute, organDock} from './wire_route.js';
import {regionDock} from './region_layout.js';
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
function wireEnd(state, centers, wireId, linkId) {
  return endpointAnchor(state.document, state.sites, linkId, centers);
}
function dockEnd(state, anchor, direction, towards = null) {
  if (!anchor.organ || !isRegion(anchor.organ))
    return towards ? {...anchor, point : organDock(anchor, towards)} : anchor;
  return {
    ...anchor,
    point : regionDock(state.document, state.sites, anchor.organ, direction, towards)
  };
}
function branchNodes(state, id, anchor, centers) {
  const organ = anchor.organ;
  if (!organ || !showsNodes(state, [ organ ]))
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
const WIRE_BOW = Object.freeze({least : 15, most : 66, share : .19});
// A branch leaves its join along the nerve, but only so far that branches to far nodes of a long
// organ (a tail band) bend towards their node instead of swinging out of the body.
const BRANCH =
    Object.freeze({beyond : 3, share : .2, lead : .3, pull : .5, reach : 14, least_width : 1});
function joinAt(anchor, nodes, chord) {
  if (!nodes.length)
    return 0;
  const reach = Math.max(...nodes.map(p => Math.hypot(p.x - anchor.x, p.y - anchor.y)));
  return Math.min(BRANCH.share, (reach + BRANCH.beyond) / Math.max(1, chord));
}
function branchCurve(node, join, towards, inward, confined = false) {
  if (confined) {
    const from = inward ? node : join, to = inward ? join : node;
    return [
      from, {x : from.x + (to.x - from.x) / 3, y : from.y + (to.y - from.y) / 3},
      {x : from.x + (to.x - from.x) * 2 / 3, y : from.y + (to.y - from.y) * 2 / 3}, to
    ];
  }
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
const branchPath = (...args) => {
  const [a, b, c, d] = branchCurve(...args);
  return 'M' + pointText(a) + ' C' + pointText(b) + ' ' + pointText(c) + ' ' + pointText(d);
};
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
    const curve = [
      p1, {x : p1.x + (p2.x - p0.x) / 6, y : p1.y + (p2.y - p0.y) / 6},
      {x : p2.x - (p3.x - p1.x) / 6, y : p2.y - (p3.y - p1.y) / 6}, p2
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
        opacity : 1
      });
    bundles.get(key).links.push(link);
  }
  const drawn =
      [...bundles.values() ].map(({from, to, kind, manual, bends, mirrored, links, opacity}) => {
        const spatial = !manual && !bends.length, a = from.point, b = to.point;
        from = dockEnd(state, from, 'out', spatial ? b : null);
        to = dockEnd(state, to, 'in', spatial ? a : null);
        const sources =
            links.map(link => dockEnd(state, wireEnd(state, centers, link.wire.from, link.from),
                                      'out', spatial ? b : null));
        const targets =
            links.map(link => dockEnd(state, wireEnd(state, centers, link.wire.to, link.to), 'in',
                                      spatial ? a : null));
        if (manual) {
          from = {...from, point : centroid(sources.map(a => a.point))};
          to = {...to, point : centroid(targets.map(a => a.point))};
        }
        const route = !bends.length &&
                      nerveRoute(doc, sites, from, to, Object.keys(WIRE_KINDS).indexOf(kind));
        const way = manual && bends.length > 1 ? bentWay(bends)
                    : bends.length             ? bentWay([ from.point, ...bends, to.point ])
                                               : (route.way ??= bentWay(route.points, route.safe));
        const chord = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
        const ends = links.map((link, k) => {
          const nodes = (id, anchor) => {
            const cells = branchNodes(state, id, anchor, centers);
            return manual && !cells.length ? [ {id, ...anchor.point, overview : true} ] : cells;
          };
          return {
            link,
            starts : nodes(link.from, sources[k]),
            arrives : nodes(link.to, targets[k]),
            width : WIRE_WIDTH.base + WIRE_WIDTH.spread * link.wire.spread
          };
        });
        const s0 = !manual || bends.length > 1
                       ? 0
                       : joinAt(from.point, ends.flatMap(e => e.starts), chord),
              s1 = !manual || bends.length > 1
                       ? 1
                       : 1 - joinAt(to.point, ends.flatMap(e => e.arrives), chord);
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
export function wireSvg(state, centers, foreground = false) {
  const {document : doc, sites, selected} = state;
  const {bundles} = wireBundles(state, centers);
  let html = '';
  for (const bundle of bundles) {
    const {kind, ends, way, s0, s1, start, end, startDirection, endDirection} = bundle;
    const style = WIRE_KINDS[kind], splits = ends.some(e => e.arrives.length);
    const d = way.path(s0, s1);
    const width = Math.hypot(...ends.map(e => e.width));
    const chosen = ends.findIndex(e => isSelected(selected, 'wire', e.link.wire.id) ||
                                       state.multi?.has(e.link.wire.id));
    const next = ends[(chosen + 1) % ends.length].link.wire.id;
    const wireIds = new Set(ends.map(e => e.link.wire.id));
    if (!foreground)
      html +=
          '<g opacity="' + fixed(bundle.opacity) + '" data-signal-opacity="' +
          fixed(bundle.opacity) + '" data-signal-edges="' +
          escapeText([...new Set(ends.flatMap(end => signalPairs(doc, end.link))) ].join(' ')) +
          '" data-wire="' +
          escapeText(chosen >= 0 && wireIds.size === 1 ? ends[chosen].link.wire.id : next) +
          '" data-wires="' + escapeText([...wireIds ].join(' ')) + '"' +
          (bundle.mirrored ? ' data-mirrored' : '') +
          (ends.some(e => e.link.wire.pairing) ? ' data-paired' : '') + ' class="aid-wire-group' +
          (chosen >= 0 ? ' selected' : '') + '">' +
          '<path d="' + d + '" class="aid-wire-hit"/>' +
          (ends.length > 1 ? '<path class="aid-wire-sheath" d="' + d + '" stroke="' + style.colour +
                                 '" stroke-width="' + fixed(width + 3) + '"/>'
                           : '') +
          '<path d="' + d + '" class="aid-wire-ink" stroke="' + style.colour + '" stroke-width="' +
          fixed(width) + '"' + (splits ? '' : ' marker-end="url(#' + style.arrow + ')"') +
          '/><title>' + escapeText(joinParts([
            linkText(endpointTitle(doc, ends[0].link.from, state.sites, ends[0].link.wire.fromPort),
                     endpointTitle(doc, ends[0].link.to, state.sites, ends[0].link.wire.toPort)),
            wireIds.size > 1 ? t('studio.app.wireCount', {n : wireIds.size}) : ''
          ])) +
          '</title></g>';
    const branchesByPath = new Map();
    for (const e of ends)
      for (const inward of [true, false]) {
        const nodes = inward ? e.starts : e.arrives;
        const confined = !bundle.manual && isRegion((inward ? bundle.from : bundle.to).organ);
        for (const node of nodes) {
          const d = inward ? branchPath(node, start, startDirection, true, confined)
                           : branchPath(node, end, endDirection, false, confined);
          const key = Number(inward) + ':' + d, section = inward ? 0 : 2;
          const branch = branchesByPath.get(key) ??
                         {d, section, edges : new Set(), width : 0, opacity : 0, chosen : false};
          for (const pair of signalPairs(doc, e.link)
                   .filter(pair => node.overview || (inward ? pair.startsWith(node.id + '>')
                                                            : pair.endsWith('>' + node.id))))
            branch.edges.add(pair);
          branch.width = Math.max(branch.width,
                                  Math.max(BRANCH.least_width, e.width / Math.sqrt(nodes.length)));
          branch.opacity = Math.max(branch.opacity, node.overview ? 1 : nodeOpacity(state, true));
          branch.chosen ||=
              isSelected(selected, 'wire', e.link.wire.id) || state.multi?.has(e.link.wire.id);
          branchesByPath.set(key, branch);
        }
      }
    const branches =
        [...branchesByPath.values() ]
            .map(b => '<path data-signal-section="' + b.section + '" data-signal-edges="' +
                      escapeText([...b.edges ].join(' ')) + '" data-signal-opacity="' +
                      fixed(b.opacity) + '" opacity="' + fixed(b.opacity) +
                      '" class="aid-wire-branch' + (b.chosen ? ' selected' : '') + '" d="' + b.d +
                      '" stroke-width="' + fixed(b.width) + '"' +
                      (b.section === 2 ? ' marker-end="url(#' + style.arrow + ')"' : '') + '/>')
            .join('');
    if (branches && foreground)
      html += '<g class="aid-wire-branches" stroke="' + style.colour + '">' + branches + '</g>';
  }
  return html + (!foreground && state.tool === 'wire' ? bendHandles(state, bundles) : '');
}
export const wireBranchesSvg = (state, centers) => wireSvg(state, centers, true);
function contactOpacity(state, a, b) {
  const visible = ({organ, center}) =>
      nodeOpacity(state, state.selected?.id === organ.id || state.selected?.id === center.id ||
                             state.multi?.has(organ.id) || state.multi?.has(center.id));
  return Math.min(visible(a), visible(b));
}
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
            (selectedEdge ? ' selected' : '') + '" d="' + path + '"/>';
  }
  return html;
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
