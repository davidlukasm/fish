import {
  isModulator,
  NEURON_BY_KEY,
  ORGAN_BY_KEY,
  nerve,
  organSlots,
  slotCenters
} from './organs.js';
import {
  ACTIVE_LEARNING,
  CIRCUIT_LEARNING,
  DEVELOPING_RELAY,
  TONIC_LEARNING
} from './region_cells.js';
import {statePlan} from './state_region.js';
import {choicePlan} from './choice_region.js';
import {valuePlan} from './value_region.js';
import {olfactionPlan} from './olfaction_region.js';
import {HALF_VIEW, bearing} from './retina.js';
import {findSite, NERVE_ROLE, sitePoint} from './layout.js';
import {
  allCenters,
  closestSite,
  defaults,
  expandedWires,
  findCenter,
  findOrgan,
  mirroredSite,
  organOf,
  settleAssemblies,
  usedSites,
  wireEndpointCenters
} from './document.js';

export const planned = organ => !!PLANS[organ?.type];
const regionNodeId = (organ, node) => organ.id + ':' + node;
export function initialRegion(type, site) {
  const settings = ORGAN_BY_KEY[type].settings;
  return {
    follow : 1,
    site : site.id,
    ...Object.fromEntries(Object.entries(settings).map(([ key, s ]) => [key, s.initial])),
    derived : null
  };
}

export function fedBy(doc, organ) {
  const own = new Set([ organ.id, ...organ.centers.map(c => c.id) ]);
  const teaches = id => {
    const centers = findOrgan(doc, id)?.centers ?? [ findCenter(doc, id)?.center ].filter(Boolean);
    return centers.length > 0 && centers.every(isModulator);
  };
  return [...new Set(expandedWires(doc)
                         .filter(link => own.has(link.to) && !teaches(link.from))
                         .map(link => organOf(doc, link.from))
                         .filter(Boolean)) ];
}

const MAP_NODES = 8, MAP_COPIES = 8, CONTRAST_CELLS = Object.freeze([ 0, 2, 5 ]);
const VISUAL_RESPONSE = Object.freeze({threshold : 0, q1 : 1, q2 : .5});
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
  const types = region.colours ? Math.max(1, Math.min(view.types, MAP_NODES)) : 1;
  const bands = Math.max(1, Math.min(region.resolution, Math.floor(MAP_NODES / types)));
  const step = (view.hi - view.lo) / bands;
  // Each band sends its own command and outer bands hold more cells, so the command grows with
  // the target's bearing; one collecting cell would only tell on which side the target is.
  const copies = band =>
      bands === 1 ? MAP_COPIES
                  : Math.max(1, Math.round(MAP_COPIES * (view.lo + (band + .5) * step) / view.hi));
  const nodes = [];
  for (let band = 0; band < bands; ++band)
    for (let type = 0; type < types; ++type)
      nodes.push({
        node : 'map' + band + (region.colours ? '.' + type : ''),
        preset : 'relay',
        port : 'both',
        effects : DEVELOPING_RELAY,
        set : {...CIRCUIT_LEARNING, ...VISUAL_RESPONSE, copies : copies(band), pace : .6},
        band : [ view.lo + band * step, view.lo + (band + 1) * step ],
        type : region.colours ? type : null
      });
  const maps = nodes.map(n => n.node), inner = [];
  const cells = CONTRAST_CELLS[region.contrast] ?? 0;
  if (cells) {
    nodes.push({
      node : 'inhibit',
      preset : 'inhibit',
      port : 'none',
      effects : DEVELOPING_RELAY,
      set : {...CIRCUIT_LEARNING, ...VISUAL_RESPONSE, copies : cells, pace : .6}
    });
    inner.push(...maps.map(map => [map, 'inhibit']), ...maps.map(map => ['inhibit', map]));
  }
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

// A small tonic signal permits new afferents to learn without a strong resting command.
const CIRCUIT_THRESHOLD = Object.freeze([ -.05, 0, .5 ]),
      CIRCUIT_TIME = Object.freeze([ .1, .5, 1 ]), CIRCUIT_COMPARE = Object.freeze([ 0, 4, 8 ]),
      CIRCUIT_PRESET = Object.freeze([ 'relay', 'inhibit' ]);
const COMPARISON_THRESHOLD = Object.freeze([ -.05, -.02, -.005 ]);
function circuitPlan(doc, organ) {
  const r = organ.region, comparison = !!(organ.pair && r.compare);
  const nodes = [ {
    node : 'command',
    preset : CIRCUIT_PRESET[r.effect],
    port : comparison ? 'out' : 'both',
    effects : comparison ? TONIC_LEARNING : DEVELOPING_RELAY,
    set : {
      ...CIRCUIT_LEARNING,
      copies : comparison ? CIRCUIT_COMPARE[r.compare] : 8,
      // Two eight-cell inputs plus control need more than the ordinary relay's 17 contacts.
      field : comparison ? .5 : .3,
      threshold : comparison ? COMPARISON_THRESHOLD[r.threshold] : CIRCUIT_THRESHOLD[r.threshold],
      tau : CIRCUIT_TIME[r.time],
      q1 : r.response ? 1 : 0,
      q2 : r.response / 2,
      pace : comparison ? -1 : .6
    }
  } ];
  const inner = [], cross = [];
  if (comparison) {
    // Matched input populations cancel a shared cue before the output amplifies its difference.
    const input = {
      ...CIRCUIT_LEARNING,
      copies : 8,
      threshold : -.5,
      tau : CIRCUIT_TIME[r.time],
      q1 : 1,
      q2 : .5,
      pace : -1
    };
    for (const [node, preset] of [[ 'sense', 'relay' ], [ 'cross', 'inhibit' ]])
      nodes.push({node, preset, port : 'in', effects : TONIC_LEARNING, set : input});
    inner.push([ 'sense', 'command' ]);
    cross.push([ 'cross', 'command' ]);
  }
  return {nodes, inner, cross, route : () => null, view : null};
}
const RHYTHM_TAU = Object.freeze([ 1, .6, .3 ]);
function rhythmPlan(doc, organ) {
  return {
    nodes : [ {
      node : 'beat',
      preset : 'pacemaker',
      port : 'both',
      effects : ACTIVE_LEARNING,
      set : {...CIRCUIT_LEARNING, copies : 8, tau : RHYTHM_TAU[organ.region.beat], threshold : -.5}
    } ],
    inner : [],
    cross : [],
    route : () => null,
    view : null
  };
}
function teachingPlan() {
  return {
    nodes : [ {
      node : 'teach',
      preset : 'modulate',
      port : 'both',
      effects : ACTIVE_LEARNING,
      set : {...CIRCUIT_LEARNING, copies : 6, threshold : -1, tau : 0}
    } ],
    inner : [],
    cross : [],
    route : () => null,
    view : null
  };
}
const PLANS = Object.freeze({
  tectum : tectumPlan,
  circuit : circuitPlan,
  rhythm : rhythmPlan,
  teaching : teachingPlan,
  state : statePlan,
  choice : choicePlan,
  value : valuePlan,
  olfaction : olfactionPlan
});
export const regionPlan = (doc, organ) => PLANS[organ.type](doc, organ);

const innerWire = organ => ({id : organ.id + ':inner', spread : 0, pairing : null, inner : true});
export function routedLinks(doc, sites, withCut = false) {
  const plans = new Map(doc.organs.filter(planned).map(o => [o.id, regionPlan(doc, o)]));
  const out = (organ, plan) => plan.nodes.filter(n => n.port === 'out' || n.port === 'both')
                                   .map(n => regionNodeId(organ, n.node));
  const links = [];
  for (const link of expandedWires(doc)) {
    const source = findOrgan(doc, link.from), target = findOrgan(doc, link.to);
    if (ORGAN_BY_KEY[source?.type]?.namedPorts && link.wire.fromPort == null ||
        ORGAN_BY_KEY[target?.type]?.namedPorts && link.wire.toPort == null)
      continue;
    const froms = link.wire.fromPort != null
                      ? slotCenters(source, link.wire.fromPort, 'out').map(c => c.id)
                  : plans.has(source?.id) ? out(source, plans.get(source.id))
                                          : [ link.from ];
    for (const from of froms) {
      if (link.wire.toPort != null) {
        const slot = organSlots(target).find(s => s.key === link.wire.toPort && s.dir === 'in');
        if (slot?.node || !plans.has(target?.id)) {
          for (const to of slotCenters(target, link.wire.toPort, 'in'))
            links.push({...link, from, to : to.id});
          continue;
        }
      }
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
        for (const to of plan.nodes.filter(n => n.port === 'in' || n.port === 'both')
                 .map(n => n.node))
          links.push({...link, from, to : regionNodeId(target, to)});
      }
    }
  }
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
  const ids = new Set([...doc.organs.map(o => o.id), ...allCenters(doc).map(c => c.id) ]);
  return links.filter(link => ids.has(link.from) && ids.has(link.to));
}

const shape = n => [n.node, n.preset, n.port, n.band?.map(Math.round).join('-') ?? '', n.type ?? '',
                    JSON.stringify(n.set ?? null)]
                       .join('|');
const centerShape = c => [c.node, c.key, c.port, c.band?.map(Math.round).join('-') ?? '',
                          c.type ?? '', JSON.stringify(c.planned ?? null)]
                             .join('|');
export function settleRegions(doc, sites, pairedId = null) {
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
    if (organ.id === pairedId)
      for (const occupied of [...used]) {
        const mirror = mirroredSite(findSite(sites, occupied), sites);
        if (mirror)
          used.add(mirror.id);
      }
    const home = findSite(sites, organ.region.site);
    const near = home ? sitePoint(home, NERVE_ROLE) : null;
    const zones = ORGAN_BY_KEY[organ.type].centers[0].zones;
    const rank = n => n.port === 'out' || n.port === 'both' ? 0 : n.port === 'in' ? 1 : 2;
    const made = new Map();
    for (const n of [...plan.nodes].sort((a, b) => rank(a) - rank(b))) {
      const id = regionNodeId(organ, n.node);
      let center = kept.get(id);
      if (!center) {
        const desc = {
          ...nerve(n.preset, NODE_CELLS, zones),
          paired : ORGAN_BY_KEY[organ.type].scope === 'side' && !ORGAN_BY_KEY[organ.type].midline
        };
        // Paired regions keep off the midline while lateral sites last; the engine's medial
        // sites still carry a side, so a full brain falls back to them.
        const side = organ.side || null;
        const site =
            near && (closestSite(desc, sites, used, near, side, organ.type) ??
                     closestSite({...desc, paired : false}, sites, used, near, side, organ.type));
        if (!site)
          continue;
        used.add(site.id);
        center = {...defaults(desc, site), id};
        for (const [effect, patch] of Object.entries(n.effects ?? {}))
          Object.assign(center.receptors[effect], patch);
        const sibling = [...kept.values() ].find(c => c.key === n.preset);
        if (sibling)
          center.receptors = structuredClone(sibling.receptors);
      }
      center.node = n.node;
      center.port = n.port;
      center.band = n.band ?? null;
      center.type = n.type ?? null;
      if (center.key !== n.preset) {
        const before = presetOf(center.key);
        for (const [key, value] of Object.entries(presetOf(n.preset)))
          if (before[key] !== value)
            center[key] = value;
        center.key = n.preset;
      }
      // Only a planned value that changed is set again; a hand-tuned one beside it stays.
      for (const [key, value] of Object.entries(n.set ?? {}))
        if (center.planned?.[key] !== value)
          center[key] = value;
      center.planned = n.set ?? null;
      made.set(n.node, center);
    }
    organ.centers = plan.nodes.map(n => made.get(n.node)).filter(Boolean);
  }
  if (draft === doc)
    return doc;
  const ids = new Set([...draft.organs.map(o => o.id), ...allCenters(draft).map(c => c.id) ]);
  draft.wires = draft.wires.filter(
      w =>
          ids.has(w.from) && ids.has(w.to) &&
          (w.fromPort == null || slotCenters(findOrgan(draft, w.from), w.fromPort, 'out').length) &&
          (w.toPort == null || slotCenters(findOrgan(draft, w.to), w.toPort, 'in').length));
  settleAssemblies(draft);
  return draft;
}
const NODE_CELLS = 3;
const presetOf = key => {
  const {sign, mode, pace, modulator} = NEURON_BY_KEY[key];
  return {sign, mode, pace, modulator};
};

export const innerKey = (from, to, across = false) => from + (across ? '>>' : '>') + to;
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
export function updateRegion(doc, organId, patch, sites) {
  const draft = structuredClone(doc), organ = findOrgan(draft, organId);
  if (!planned(organ))
    return null;
  const settings = ORGAN_BY_KEY[organ.type].settings;
  for (const target of [organ, findOrgan(draft, organ.pair)].filter(Boolean)) {
    const before = regionPlan(draft, target);
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'follow')
        target.region.follow = value ? 1 : 0;
      else if (settings[key])
        target.region[key] =
            Math.max(settings[key].least, Math.min(settings[key].most, Math.round(value)));
    }
    for (const node of regionPlan(draft, target).nodes) {
      const center = target.centers.find(c => c.node === node.node);
      const previous = before.nodes.find(n => n.node === node.node);
      if (!center || !previous)
        continue;
      for (const [effect, values] of Object.entries(node.effects ?? {})) {
        const was = previous.effects?.[effect], receptor = center.receptors[effect];
        // Retuning a region updates its defaults while preserving a custom hormone response.
        if (was && Object.entries(was).every(([ key, value ]) => receptor[key] === value))
          Object.assign(receptor, values);
      }
    }
  }
  return settleRegions(draft, sites);
}

export function regionSlots(doc, organ) {
  const own = new Set([ organ.id, ...organ.centers.map(c => c.id) ]);
  const links = expandedWires(doc);
  return organSlots(organ).map(slot => {
    const members = new Set(slotCenters(organ, slot.key, slot.dir).map(c => c.id));
    const candidates =
        links
            .filter(l => {
              const incoming = slot.dir === 'in', id = incoming ? l.to : l.from;
              const port = incoming ? l.wire.toPort : l.wire.fromPort;
              return own.has(id) &&
                     wireEndpointCenters(doc, id, port, slot.dir).some(c => members.has(c.id));
            })
            .map(l => slot.dir === 'in' ? l.from : l.to)
            .filter(id => !own.has(id))
            .map(id => organOf(doc, id))
            .filter(Boolean);
    const filled = [...new Set(slot.fits.length ? candidates.filter(o => slot.fits.includes(o.type))
                                                : candidates) ];
    return {...slot, filled};
  });
}
