import {isModulator, NEURON_BY_KEY, ORGAN_BY_KEY, nerve} from './organs.js';
import {HALF_VIEW, bearing} from './retina.js';
import {findSite, NERVE_ROLE, sitePoint} from './layout.js';
import {
  allCenters,
  closestSite,
  defaults,
  expandedWires,
  findCenter,
  findOrgan,
  organOf,
  settleAssemblies,
  usedSites
} from './document.js';

// Brain regions with a plan. Their nodes, their inner circuit and how a wire to the region as a
// whole spreads over its nodes follow from the region's settings and, while it follows the organs
// wired to it, from those organs. A node is named by its place in the plan, so it keeps its wires
// and its own settings for as long as the plan has it.
export const planned = organ => !!PLANS[organ?.type];
const regionNodeId = (organ, node) => organ.id + ':' + node;
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

// The organs wired into a region, as a whole or at one of its nodes. A modulator does not feed
// it: it only teaches the nodes it reaches.
export function fedBy(doc, organ) {
  const own = new Set([ organ.id, ...organ.centers.map(c => c.id) ]);
  const teaches = id => {
    const center = findCenter(doc, id)?.center;
    return center?.role === 'nerve' && isModulator(center);
  };
  return [...new Set(expandedWires(doc)
                         .filter(link => own.has(link.to) && !teaches(link.from))
                         .map(link => organOf(doc, link.from))
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
  // Colour types kept apart stay apart: with many of them the map takes fewer bands, so that
  // bands times types stay within MAP_NODES.
  const types = region.colours ? Math.max(1, Math.min(view.types, MAP_NODES)) : 1;
  const bands = Math.max(1, Math.min(region.resolution, Math.floor(MAP_NODES / types)));
  const step = (view.hi - view.lo) / bands;
  const nodes = [];
  for (let band = 0; band < bands; ++band)
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
  // type; a near-sense cell the map node of its direction, of the first colour type.
  const route = (sites, cell, field) => {
    const site = findSite(sites, cell.site);
    if (!site)
      return null;
    const band = Math.max(0, Math.min(bands - 1, Math.floor((bearing(site) - view.lo) / step)));
    const type =
        field.type === 'eye'
            ? Math.min(types - 1,
                       Math.max(0, field.field.profiles.findIndex(p => p.id === cell.profile)))
            : 0;
    return 'map' + band + (region.colours ? '.' + type : '');
  };
  return {nodes, inner, cross : [], route, view, most : {resolution : bands}};
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

// The olfactory bulb gathers the smell of its side's nose and passes it on; the torus does so with
// the water its side's lateral line feels. Comparing the sides, their inhibitory cells (none, few,
// many) take from their own side and hold the other side's output down, so each output answers
// by how much more its side senses.
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
// The pallium learns which of what it hears is worth passing on: learning nodes, as fast as
// asked and balancing (their strongest inputs give way), neutral or selecting (the strongest
// win), pass to an output node. While it follows its inputs it learns each kind of organ or
// region wired into it in a node of its own (at most LEARN_STREAMS), so one stream does not drown
// another. What teaches it is a substance, set where it learns.
const LEARN_RATE = Object.freeze([ .2, .5, .8 ]), LEARN_STYLE = Object.freeze([ -.6, 0, .6 ]);
const LEARN_STREAMS = 4;
function palliumView(doc, organ) {
  if (!organ.region.follow && organ.region.derived)
    return organ.region.derived;
  return {
    streams : [...new Set(fedBy(doc, organ).map(o => o.type)) ].sort().slice(0, LEARN_STREAMS)
  };
}
function palliumPlan(doc, organ) {
  const region = organ.region, view = palliumView(doc, organ);
  const set = {qwidth : LEARN_RATE[region.rate], mode : LEARN_STYLE[region.style]};
  const learners = view.streams.length
                       ? view.streams.map(stream => ({node : 'learn.' + stream, stream}))
                       : [ {node : 'learn', stream : null} ];
  return {
    nodes : [
      ...learners.map(l => ({...l, preset : 'learn', port : 'in', set})),
      {node : 'out', preset : 'relay', port : 'out'}
    ],
    inner : learners.map(l => [l.node, 'out']),
    cross : [],
    route : () => null,
    source : type => view.streams.includes(type) ? 'learn.' + type : null,
    view
  };
}
// The cerebellum smooths what it is told to move: its output holds a command as long as asked,
// and brake cells (none, few, many) cut it short again, so movements start and stop cleanly. What
// it feels of balance (its balance slot) reaches the output directly and corrects it.
const SMOOTH_TAU = Object.freeze([ .2, .45, .7 ]), BRAKE_CELLS = Object.freeze([ 0, 2, 5 ]);
function cerebellumPlan(doc, organ) {
  const region = organ.region;
  const nodes = [
    {node : 'input', preset : 'relay', port : 'in'},
    {node : 'smooth', preset : 'relay', port : 'out', set : {tau : SMOOTH_TAU[region.smoothing]}}
  ];
  const inner = [ [ 'input', 'smooth' ] ];
  const cells = BRAKE_CELLS[region.brake] ?? 0;
  if (cells) {
    nodes.push({node : 'brake', preset : 'inhibit', port : 'none', set : {copies : cells}});
    inner.push([ 'input', 'brake' ], [ 'brake', 'smooth' ]);
  }
  return {nodes, inner, cross : [], route : () => null, view : null};
}
// The hypothalamus feels inner states and answers with drive: its output fires the more easily
// the higher its gain, and stirs (excites) or calms (inhibits) what it is wired to, glands among
// them.
const DRIVE_THRESHOLD = Object.freeze([ .6, .2, -.2 ]),
      DRIVE_PRESET = Object.freeze([ 'relay', 'inhibit' ]);
function hypothalamusPlan(doc, organ) {
  const region = organ.region;
  return {
    nodes : [
      {node : 'sense', preset : 'relay', port : 'in'}, {
        node : 'drive',
        preset : DRIVE_PRESET[region.effect],
        port : 'out',
        set : {threshold : DRIVE_THRESHOLD[region.gain]}
      }
    ],
    inner : [ [ 'sense', 'drive' ] ],
    cross : [],
    route : () => null,
    view : null
  };
}
const PLANS = Object.freeze({
  tectum : tectumPlan,
  spinal : spinalPlan,
  olfactory : bulbPlan,
  hindbrain : hindbrainPlan,
  pallium : palliumPlan,
  torus : bulbPlan,
  cerebellum : cerebellumPlan,
  hypothalamus : hypothalamusPlan
});
export const regionPlan = (doc, organ) => PLANS[organ.type](doc, organ);

// A region's inner circuit runs on a wire of its own, with no spread.
const innerWire = organ => ({id : organ.id + ':inner', spread : 0, pairing : null, inner : true});
// Every connection, with wires to and from planned regions as a whole spread over their nodes:
// outgoing from the output nodes, incoming at the input nodes, from light cells by their
// direction; and the regions' inner circuits, but for the links taken out of them (which come
// along marked as cut when asked for).
export function routedLinks(doc, sites, withCut = false) {
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
      else {
        // An input slot may name the node its organs reach; others reach every input node.
        const type = organOf(doc, from)?.type;
        // A plan that keeps its inputs apart names the node for each kind of source.
        const slot = ORGAN_BY_KEY[target.type].slots?.find(s => s.dir === 'in' && s.node &&
                                                                s.fits.includes(type));
        const node = plan.source?.(type) ?? slot?.node;
        for (const to of node ? [ node ] : plan.nodes.filter(n => n.port === 'in').map(n => n.node))
          links.push({...link, from, to : regionNodeId(target, to)});
      }
    }
  }
  // Inside a region, and across to its twin on the other side.
  for (const [id, plan] of plans) {
    const organ = findOrgan(doc, id), twin = findOrgan(doc, organ.pair);
    const cut = new Set(organ.region.cut ?? []);
    const inner = (from, to, other, key) => {
      if (!cut.has(key) || withCut)
        links.push({
          from : regionNodeId(organ, from),
          to : regionNodeId(other, to),
          wire : innerWire(organ),
          key,
          cut : cut.has(key)
        });
    };
    for (const [from, to] of plan.inner)
      inner(from, to, organ, innerKey(from, to));
    if (twin && plans.has(twin.id))
      for (const [from, to] of plan.cross)
        inner(from, to, twin, innerKey(from, to, true));
  }
  // A node the plan has but no free site took is not there to connect.
  const ids = new Set([...doc.organs.map(o => o.id), ...allCenters(doc).map(c => c.id) ]);
  return links.filter(link => ids.has(link.from) && ids.has(link.to));
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
    const used = usedSites(draft, c => c.organId !== organ.id || wanted.has(c.id));
    const home = findSite(sites, organ.region.site);
    const near = home ? sitePoint(home, NERVE_ROLE) : null;
    const zones = ORGAN_BY_KEY[organ.type].centers[0].zones;
    // Where sites run short, what the region passes on comes first, then what it takes in.
    const rank = n => n.port === 'out' ? 0 : n.port === 'in' ? 1 : 2;
    const made = new Map();
    for (const n of [...plan.nodes].sort((a, b) => rank(a) - rank(b))) {
      const id = regionNodeId(organ, n.node);
      let center = kept.get(id);
      if (!center) {
        const desc = {
          ...nerve(n.preset, NODE_CELLS, zones),
          paired : ORGAN_BY_KEY[organ.type].scope === 'side'
        };
        const site = near && closestSite(desc, sites, used, near, organ.side, organ.type);
        if (!site)
          continue;
        used.add(site.id);
        center = {...defaults(desc, site), id};
        // A new node takes what was made of its kind's receptors (a teacher, say) from a node
        // of the same kind it joins or replaces.
        const sibling = [...kept.values() ].find(c => c.key === n.preset);
        if (sibling)
          center.receptors = structuredClone(sibling.receptors);
      }
      center.node = n.node;
      center.port = n.port;
      center.band = n.band ?? null;
      center.type = n.type ?? null;
      center.stream = n.stream ?? null;
      if (JSON.stringify(center.planned ?? null) !== JSON.stringify(n.set ?? null))
        Object.assign(center, n.set);
      center.planned = n.set ?? null;
      if (center.key !== n.preset)
        Object.assign(center, {key : n.preset, ...presetOf(n.preset)});
      made.set(n.node, center);
    }
    organ.centers = plan.nodes.map(n => made.get(n.node)).filter(Boolean);
  }
  if (draft === doc)
    return doc;
  const ids = new Set([...draft.organs.map(o => o.id), ...allCenters(draft).map(c => c.id) ]);
  draft.wires = draft.wires.filter(w => ids.has(w.from) && ids.has(w.to));
  settleAssemblies(draft);
  return draft;
}
// A new node's cells, and what a preset makes of a node.
const NODE_CELLS = 3;
const presetOf = key => {
  const {sign, mode, pace, modulator} = NEURON_BY_KEY[key];
  return {sign, mode, pace, modulator};
};

// An inner link of a region's plan by its ends, across to the twin or not.
export const innerKey = (from, to, across = false) => from + (across ? '>>' : '>') + to;
// A link of a region's plan taken out, or put back, on both sides of a pair.
export function toggleInnerLink(doc, organId, keys) {
  const draft = structuredClone(doc), organ = findOrgan(draft, organId);
  if (!planned(organ))
    return null;
  const cut = new Set(organ.region.cut ?? []), links = keys.split(' ');
  const restore = links.every(key => cut.has(key));
  for (const key of links)
    if (restore)
      cut.delete(key);
    else
      cut.add(key);
  for (const target of [organ, findOrgan(draft, organ.pair)].filter(Boolean))
    target.region.cut = [...cut ];
  return draft;
}
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
                            .map(id => organOf(doc, id))
                            .filter(Boolean);
  const inputs = ends('in'), outputs = ends('out');
  return (ORGAN_BY_KEY[organ.type].slots ?? []).map(slot => {
    const candidates = slot.dir === 'in' ? inputs : outputs;
    const filled = [...new Set(slot.fits.length ? candidates.filter(o => slot.fits.includes(o.type))
                                                : candidates) ];
    return {...slot, filled};
  });
}
