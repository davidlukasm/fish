import {NEURON_BY_KEY, ORGAN_BY_KEY, nerve} from './organs.js';
import {HALF_VIEW, bearing} from './retina.js';
import {sitePoint} from './layout.js';
import {
  allCenters,
  assemblyCenters,
  closestSite,
  defaults,
  expandedWires,
  findCenter,
  findOrgan
} from './document.js';

// Brain regions with a plan. Their nodes, their inner circuit and how a wire to the region as a
// whole spreads over its nodes follow from the region's settings and, while it follows the organs
// wired to it, from those organs. A node is named by its place in the plan, so it keeps its wires
// and its own settings for as long as the plan has it.
export const planned = organ => !!PLANS[organ?.type];
export const regionNodeId = (organ, node) => organ.id + ':' + node;
// A region's settings as placed: each at its initial value, following its organs.
export function initialRegion(type, site) {
  const settings = ORGAN_BY_KEY[type].settings;
  return {
    follow : 1,
    site : site.id,
    ...Object.fromEntries(Object.entries(settings).map(([ key, s ]) => [key, s.initial])),
    derived : null
  };
}

// The organs wired into a region, as a whole or at one of its nodes.
function fedBy(doc, organ) {
  const own = new Set([ organ.id, ...organ.centers.map(c => c.id) ]);
  return [...new Set(
      expandedWires(doc)
          .filter(link => own.has(link.to))
          .map(link => findOrgan(doc, link.from) ?? findCenter(doc, link.from)?.organ)
          .filter(Boolean)) ];
}

// The optic tectum. While it follows its eyes, its map spans their fields and keeps as many colour
// types apart as they have, at most MAP_NODES nodes in all. A map node hears its light cells
// alone, so it keeps their direction: a cell group hears the senders around one address. Contrast
// cells (none, few, many) take from the whole map and hold the output down by what lights it all
// alike, so the output answers what stands out.
const MAP_NODES = 8, CONTRAST_CELLS = Object.freeze([ 0, 2, 5 ]);
function tectumView(doc, organ) {
  const region = organ.region;
  if (!region.follow && region.derived)
    return region.derived;
  const eyes = fedBy(doc, organ).filter(o => o.field && o.type === 'eye');
  return eyes.length ? {
    lo : Math.min(...eyes.map(e => e.field.lo)),
    hi : Math.max(...eyes.map(e => e.field.hi)),
    types : Math.max(...eyes.map(e => e.field.profiles.length))
  }
                     : {lo : 0, hi : HALF_VIEW, types : 1};
}
function tectumPlan(doc, organ) {
  const region = organ.region, view = tectumView(doc, organ);
  const types = region.colours
                    ? Math.max(1, Math.min(view.types, Math.floor(MAP_NODES / region.resolution)))
                    : 1;
  const step = (view.hi - view.lo) / region.resolution;
  const nodes = [];
  for (let band = 0; band < region.resolution; ++band)
    for (let type = 0; type < types; ++type)
      nodes.push({
        node : 'map' + band + (region.colours ? '.' + type : ''),
        preset : 'relay',
        port : 'in',
        band : [ view.lo + band * step, view.lo + (band + 1) * step ],
        type : region.colours ? type : null
      });
  const maps = nodes.map(n => n.node);
  nodes.push({node : 'out', preset : 'relay', port : 'out'});
  const inner = maps.map(map => [map, 'out']);
  const cells = CONTRAST_CELLS[region.contrast] ?? 0;
  if (cells) {
    nodes.push({node : 'inhibit', preset : 'inhibit', port : 'none', set : {copies : cells}});
    inner.push(...maps.map(map => [map, 'inhibit']), [ 'inhibit', 'out' ]);
  }
  // A light cell reaches the map node of its direction and, with colours apart, of its colour
  // type.
  const route = (sites, cell, eye) => {
    const site = sites.find(s => s.id === cell.site);
    if (!site || eye.type !== 'eye')
      return null;
    const band =
        Math.max(0, Math.min(region.resolution - 1, Math.floor((bearing(site) - view.lo) / step)));
    const type = Math.max(0, eye.field.profiles.findIndex(p => p.id === cell.profile)) % types;
    return 'map' + band + (region.colours ? '.' + type : '');
  };
  return {nodes, inner, cross : [], route, view};
}

// The spinal cord beats the swimming wave: a rhythm node on each side drives the muscles wired
// to the region, with as many cells as the stroke is wide and the beat asked; it drives
// inhibitory cells that hold the other side's rhythm down, so the sides beat in turn. With
// steering on, a steering node takes the region's inputs and drives the rhythm of its side.
const BEAT_TAU = Object.freeze([ .75, .5, .25 ]), STROKE_CELLS = Object.freeze([ 2, 4, 7 ]);
function spinalPlan(doc, organ) {
  const region = organ.region;
  const nodes = [
    {
      node : 'beat',
      preset : 'pacemaker',
      port : 'out',
      set : {copies : STROKE_CELLS[region.stroke], tau : BEAT_TAU[region.beat]}
    },
    {node : 'cross', preset : 'inhibit', port : 'none'}
  ];
  const inner = [ [ 'beat', 'cross' ] ];
  if (region.steering) {
    nodes.push({node : 'steer', preset : 'relay', port : 'in'});
    inner.push([ 'steer', 'beat' ]);
  }
  return {nodes, inner, cross : [ [ 'cross', 'beat' ] ], route : () => null, view : null};
}

// The olfactory bulb gathers the smell of its side's nose and passes it on. Comparing the sides,
// its inhibitory cells (none, few, many) take from its own side and hold the other side's output
// down, so each output answers by how much more its side smells.
const COMPARE_CELLS = Object.freeze([ 0, 2, 5 ]);
function bulbPlan(doc, organ) {
  const region = organ.region;
  const nodes = [
    {node : 'gather', preset : 'relay', port : 'in'}, {node : 'out', preset : 'relay', port : 'out'}
  ];
  const inner = [ [ 'gather', 'out' ] ], cross = [];
  const cells = COMPARE_CELLS[region.compare] ?? 0;
  if (cells) {
    nodes.push({node : 'compare', preset : 'inhibit', port : 'none', set : {copies : cells}});
    inner.push([ 'gather', 'compare' ]);
    cross.push([ 'compare', 'out' ]);
  }
  return {nodes, inner, cross, route : () => null, view : null};
}
// The hindbrain's command node fires when the alarm it gathers passes its threshold (low,
// middle, high), quickly or slowly as asked, and drives the muscles it is wired to, the far side's
// as escape cells do; through inhibitory cells it holds the other side's command down, so the fish
// flees one way.
const COMMAND_THRESHOLD = Object.freeze([ .2, .5, .8 ]), COMMAND_TAU = Object.freeze([ .1, .4 ]);
function hindbrainPlan(doc, organ) {
  const region = organ.region;
  const nodes = [
    {node : 'alarm', preset : 'relay', port : 'in'}, {
      node : 'command',
      preset : 'relay',
      port : 'out',
      set : {threshold : COMMAND_THRESHOLD[region.threshold], tau : COMMAND_TAU[region.tempo]}
    },
    {node : 'cross', preset : 'inhibit', port : 'none'}
  ];
  return {
    nodes,
    inner : [ [ 'alarm', 'command' ], [ 'alarm', 'cross' ] ],
    cross : [ [ 'cross', 'command' ] ],
    route : () => null,
    view : null
  };
}
const PLANS = Object.freeze(
    {tectum : tectumPlan, spinal : spinalPlan, olfactory : bulbPlan, hindbrain : hindbrainPlan});
export const regionPlan = (doc, organ) => PLANS[organ.type](doc, organ);

// A region's inner circuit runs on a wire of its own, with no spread.
const innerWire = organ => ({id : organ.id + ':inner', spread : 0, pairing : null, inner : true});
// Every connection, with wires to and from planned regions as a whole spread over their nodes:
// outgoing from the output nodes, incoming at the input nodes, from light cells by their
// direction; and the regions' inner circuits.
export function routedLinks(doc, sites) {
  const plans = new Map(doc.organs.filter(planned).map(o => [o.id, regionPlan(doc, o)]));
  const out = (organ, plan) =>
      plan.nodes.filter(n => n.port === 'out').map(n => regionNodeId(organ, n.node));
  const links = [];
  for (const link of expandedWires(doc)) {
    const source = findOrgan(doc, link.from), target = findOrgan(doc, link.to);
    const froms = plans.has(source?.id) ? out(source, plans.get(source.id)) : [ link.from ];
    for (const from of froms) {
      if (!plans.has(target?.id)) {
        links.push({...link, from});
        continue;
      }
      const plan = plans.get(target.id), sender = findOrgan(doc, from) ?? findCenter(doc, from);
      const eye = findOrgan(doc, from)?.field ? findOrgan(doc, from) : findCenter(doc, from)?.organ;
      const cells = !eye?.field ? [] : findOrgan(doc, from) ? eye.centers : [ sender.center ];
      const routed =
          cells.map(cell => [cell.id, plan.route(sites, cell, eye)]).filter(([, node ]) => node);
      if (routed.length)
        for (const [cell, node] of routed)
          links.push({...link, from : cell, to : regionNodeId(target, node)});
      else
        for (const n of plan.nodes.filter(n => n.port === 'in'))
          links.push({...link, from, to : regionNodeId(target, n.node)});
    }
  }
  // Inside a region, and across to its twin on the other side.
  for (const [id, plan] of plans) {
    const organ = findOrgan(doc, id), twin = findOrgan(doc, organ.pair);
    const inner = (from, to, other) =>
        ({from : regionNodeId(organ, from), to : regionNodeId(other, to), wire : innerWire(organ)});
    for (const [from, to] of plan.inner)
      links.push(inner(from, to, organ));
    if (twin && plans.has(twin.id))
      for (const [from, to] of plan.cross)
        links.push(inner(from, to, twin));
  }
  return links;
}

// What a node is: its preset and port, the band and colour type of a map node, and the values
// the plan sets (its cells, its beat). A value the plan sets is set again only when the plan
// changes it; in between the node keeps what was made of it.
const shape = n => [n.node, n.preset, n.port, n.band?.map(Math.round).join('-') ?? '', n.type ?? '',
                    JSON.stringify(n.set ?? null)]
                       .join('|');
const centerShape = c => [c.node, c.key, c.port, c.band?.map(Math.round).join('-') ?? '',
                          c.type ?? '', JSON.stringify(c.planned ?? null)]
                             .join('|');
// Brings every planned region in line with its plan: nodes the plan no longer has go with their
// wires, new ones take the free inner sites of their zones nearest to where the region was
// placed, nodes it keeps stay where they are with their settings. While a region follows its
// organs, what it saw of them is kept, so it stays so when it stops following.
export function settleRegions(doc, sites) {
  let draft = doc;
  for (const original of doc.organs.filter(planned)) {
    const plan = regionPlan(draft, findOrgan(draft, original.id));
    const current = findOrgan(draft, original.id);
    const fresh = plan.nodes.map(shape).join(',') === current.centers.map(centerShape).join(',') &&
                  (!current.region.follow ||
                   JSON.stringify(current.region.derived) === JSON.stringify(plan.view));
    if (fresh)
      continue;
    if (draft === doc)
      draft = structuredClone(doc);
    const organ = findOrgan(draft, original.id);
    if (organ.region.follow)
      organ.region.derived = plan.view;
    const kept = new Map(organ.centers.map(c => [c.id, c]));
    const wanted = new Set(plan.nodes.map(n => regionNodeId(organ, n.node)));
    const used = new Set(
        allCenters(draft).filter(c => c.organId !== organ.id || wanted.has(c.id)).map(c => c.site));
    const home = sites.find(s => s.id === organ.region.site);
    const near = home ? sitePoint(home) : null;
    const zones = ORGAN_BY_KEY[organ.type].centers[0].zones;
    const centers = [];
    for (const n of plan.nodes) {
      const id = regionNodeId(organ, n.node);
      let center = kept.get(id);
      if (!center) {
        const desc = {...nerve(n.preset, NODE_CELLS, zones), paired : true};
        const site = near && closestSite(desc, sites, used, near, organ.side, organ.type);
        if (!site)
          continue;
        used.add(site.id);
        center = {...defaults(desc, site), id};
      }
      center.node = n.node;
      center.port = n.port;
      center.band = n.band ?? null;
      center.type = n.type ?? null;
      if (JSON.stringify(center.planned ?? null) !== JSON.stringify(n.set ?? null))
        Object.assign(center, n.set);
      center.planned = n.set ?? null;
      if (center.key !== n.preset)
        Object.assign(center, {key : n.preset, ...presetOf(n.preset)});
      centers.push(center);
    }
    organ.centers = centers;
  }
  if (draft === doc)
    return doc;
  const ids = new Set([...draft.organs.map(o => o.id), ...allCenters(draft).map(c => c.id) ]);
  draft.wires = draft.wires.filter(w => ids.has(w.from) && ids.has(w.to));
  for (const assembly of draft.assemblies)
    assembly.centerIds = assemblyCenters(draft, assembly);
  return draft;
}
// A new node's cells, and what a preset makes of a node.
const NODE_CELLS = 3;
const presetOf = key => {
  const {sign, mode, pace, modulator} = NEURON_BY_KEY[key];
  return {sign, mode, pace, modulator};
};

// A region's settings changed, on both sides of a pair.
export function updateRegion(doc, organId, patch, sites) {
  const draft = structuredClone(doc), organ = findOrgan(draft, organId);
  if (!planned(organ))
    return null;
  const settings = ORGAN_BY_KEY[organ.type].settings;
  for (const target of [organ, findOrgan(draft, organ.pair)].filter(Boolean)) {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'follow')
        target.region.follow = value ? 1 : 0;
      else if (settings[key])
        target.region[key] =
            Math.max(settings[key].least, Math.min(settings[key].most, Math.round(value)));
    }
  }
  return settleRegions(draft, sites);
}

// A region's slots and what fills them: the organs wired in or out there.
export function regionSlots(doc, organ) {
  const own = new Set([ organ.id, ...organ.centers.map(c => c.id) ]);
  const links = expandedWires(doc);
  const ends = (dir) => links.filter(l => own.has(dir === 'in' ? l.to : l.from))
                            .map(l => dir === 'in' ? l.from : l.to)
                            .filter(id => !own.has(id))
                            .map(id => findOrgan(doc, id) ?? findCenter(doc, id)?.organ)
                            .filter(Boolean);
  const inputs = ends('in'), outputs = ends('out');
  return (ORGAN_BY_KEY[organ.type].slots ?? []).map(slot => {
    const candidates = slot.dir === 'in' ? inputs : outputs;
    const filled = [...new Set(slot.fits.length ? candidates.filter(o => slot.fits.includes(o.type))
                                                : candidates) ];
    return {...slot, filled};
  });
}
