import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, MOTOR_KIND} from './schema.js';
import {
  MODULES,
  NEURON_BY_KEY,
  ORGAN_BY_KEY,
  ROLE,
  eligible,
  functionFor
} from './studio_organs.js';
import {pointDistance, sitePoint} from './studio_geometry.js';

let serial = 0;
export const NEW_DOCUMENT = 'v019-organ-studio';
export const identifier = (kind = 'part') =>
    `${kind}-${Date.now().toString(36)}-${(++serial).toString(36)}`;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const copy = object => structuredClone(object);

// A receptor of no effect: full output, no other effect (the engine's neutral receptor). The
// growth receptor of a new fish binds no hormone, so it keeps its hatch size until a gland and the
// growth receptor agree on a substance.
const neutralReceptor = (effect = null) => ({
  active : 0,
  baseline : effect === HORMONE_EFFECT.output ? 1 : 0,
  sensitivity : 0,
  half : .05,
  substance : 0,
  width : 0,
  steepness : 0
});
export function newDocument(name = '') {
  return {
    format : NEW_DOCUMENT,
    name,
    organs : [ {id : 'brain', type : 'brain', centers : []} ],
    wires : [],
    assemblies : [],
    substances : [],
    growth : neutralReceptor()
  };
}
export function validateDocument(doc) {
  if (!doc || doc.format !== NEW_DOCUMENT || !Array.isArray(doc.organs) ||
      !Array.isArray(doc.wires) || !Array.isArray(doc.assemblies) ||
      !Array.isArray(doc.substances) || !doc.growth ||
      Object.keys(neutralReceptor()).some(key => !Number.isFinite(doc.growth[key])))
    throw new Error('studio.errors.invalidDocument');
  const ids = new Set(), sites = new Set();
  for (const organ of doc.organs) {
    if (!ORGAN_BY_KEY[organ.type] || ids.has(organ.id))
      throw new Error('studio.errors.invalidDocument');
    ids.add(organ.id);
    for (const center of organ.centers) {
      if (ids.has(center.id) || !Number.isInteger(center.site) || sites.has(center.site))
        throw new Error('studio.errors.invalidDocument');
      ids.add(center.id);
      sites.add(center.site);
    }
  }
  if (!doc.organs.some(o => o.id === 'brain' && o.type === 'brain'))
    throw new Error('studio.errors.invalidDocument');
  for (const wire of doc.wires) {
    if (!ids.has(wire.from) || !ids.has(wire.to))
      throw new Error('studio.errors.invalidDocument');
  }
  return doc;
}
// The substance wheel of colony-core/field/hormones.hh (hormone_affinity): substance k sits at
// angle 2πk/bloodSubstances on the unit circle. A profile at (x, y) with width w binds it with
// exp(-d²/2σ²), σ rising linearly over sigmaRange with w. `wheel` is the compiler's capabilities.
export function wheelPlace(wheel, index) {
  const angle = 2 * Math.PI * index / wheel.bloodSubstances;
  return [ Math.cos(angle), Math.sin(angle) ];
}
export function wheelSigma(wheel, width) {
  const [low, high] = wheel.sigmaRange;
  return low + (high - low) * Math.min(1, Math.max(0, width));
}
export function wheelAffinity(wheel, x, y, width, index) {
  const [px, py] = wheelPlace(wheel, index), sigma = wheelSigma(wheel, width);
  return Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sigma * sigma));
}
// A receptor's profile sits on the point of its chosen substance.
export function receptorAffinity(wheel, receptor, index) {
  const [x, y] = wheelPlace(wheel, receptor.substance);
  return wheelAffinity(wheel, x, y, receptor.width, index);
}
// Gland centers that release the substance at `index`, and centers with an active receptor that
// binds it, each with at least NOTICEABLE_AFFINITY.
export const NOTICEABLE_AFFINITY = .1;
export const producers = (doc, index, wheel) =>
    doc.organs.filter(o => o.type === 'gland')
        .flatMap(o => o.centers)
        .filter(c => wheelAffinity(wheel, c.q1, c.q2, c.qwidth, index) >= NOTICEABLE_AFFINITY);
// The effects through which a center's active receptors bind the substance at `index`.
export const boundEffects = (center, index, wheel) => center.receptors.flatMap(
    (r, effect) =>
        r.active && receptorAffinity(wheel, r, index) >= NOTICEABLE_AFFINITY ? [ effect ] : []);
export const receivers = (doc, index, wheel) =>
    allCenters(doc).filter(c => boundEffects(c, index, wheel).length);
// Whether the body's growth receptor binds the substance at `index`.
export const growsWith = (doc, index, wheel) =>
    doc.growth.active && receptorAffinity(wheel, doc.growth, index) >= NOTICEABLE_AFFINITY;
export const allCenters = doc =>
    doc.organs.flatMap(organ => organ.centers.map(
                           center => ({...center, organId : organ.id, organType : organ.type})));
export const findOrgan = (doc, id) => doc.organs.find(o => o.id === id) ?? null;
export const findCenter = (doc, id) => {
  for (const organ of doc.organs) {
    const center = organ.centers.find(c => c.id === id);
    if (center)
      return {center, organ};
  }
  return null;
};

export function defaults(desc, site, effects = ATELIER_LIMITS.receptors) {
  const nerve = desc.role === 'nerve';
  return {
    id : identifier('center'),
    key : desc.key,
    role : desc.role,
    functionCode : desc.functionCode,
    surface : desc.surface,
    site : site.id,
    copies : desc.copies,
    threshold : nerve ? 0 : -.6,
    tau : .5,
    field : .3,
    q1 : 0,
    q2 : 0,
    qwidth : .35,
    sign : 1,
    mode : 0,
    pace : -1,
    modulator : -1,
    sigma : .14,
    crossing : 0,
    range : 1,
    receptors : Array.from({length : effects}, (_, effect) => neutralReceptor(effect))
  };
}
function candidates(desc, sites, used, position, preferredSide = null) {
  return sites.filter(site => !used.has(site.id) && eligible(desc, site))
      .map(site => ({
             site,
             distance : pointDistance(site, position, desc.role === 'motor' ? 'fin' : '') +
                            (preferredSide !== null && site.side !== preferredSide ? 32 : 0)
           }))
      .sort((a, b) => a.distance - b.distance);
}
export function closestSite(desc, sites, used, position, side = null) {
  return candidates(desc, sites, used, position, side)[0]?.site ?? null;
}
export function addOrgan(doc, type, sites, position) {
  const definition = ORGAN_BY_KEY[type];
  if (!definition || definition.fixed)
    return null;
  const draft = copy(doc), used = new Set(allCenters(draft).map(c => c.site));
  const centers = [];
  let side = null;
  for (const desc of definition.centers) {
    const site = closestSite(desc, sites, used, position, side);
    if (!site)
      return null;
    if (side === null)
      side = site.side;
    used.add(site.id);
    centers.push(defaults(desc, site));
  }
  const organ = {id : identifier('organ'), type, centers};
  draft.organs.push(organ);
  return {document : draft, organId : organ.id, centerId : centers[0]?.id};
}
export function addNeuron(doc, preset, sites, position) {
  const properties = NEURON_BY_KEY[preset];
  if (!properties)
    return null;
  const used = new Set(allCenters(doc).map(c => c.site));
  const desc = {key : preset, role : 'nerve', functionCode : -1, copies : 4, surface : 'any'};
  const site = closestSite(desc, sites.filter(s => s.zone === 1 || s.zone === 2), used, position);
  if (!site)
    return null;
  const draft = copy(doc);
  const center = {...defaults(desc, site), ...properties};
  draft.organs.find(o => o.id === 'brain').centers.push(center);
  return {document : draft, centerId : center.id, organId : 'brain'};
}
export function moveCenter(doc, centerId, target, sites) {
  const result = findCenter(doc, centerId);
  const site = sites.find(s => s.id === target);
  if (!result || !site || !eligible(result.center, site))
    return null;
  if (allCenters(doc).some(c => c.id !== centerId && c.site === site.id))
    return null;
  const draft = copy(doc);
  findCenter(draft, centerId).center.site = site.id;
  return draft;
}
export function moveOrgan(doc, organId, sites, position) {
  const original = findOrgan(doc, organId);
  if (!original || original.type === 'brain')
    return null;
  const draft = copy(doc), organ = findOrgan(draft, organId);
  const used = new Set(allCenters(draft).filter(c => c.organId !== organId).map(c => c.site));
  const side =
      original.centers[0] ? sites.find(s => s.id === original.centers[0].site)?.side : null;
  for (const center of organ.centers) {
    const site = closestSite(center, sites, used, position, side);
    if (!site)
      return null;
    center.site = site.id;
    used.add(site.id);
  }
  return draft;
}
export function removeOrgan(doc, id) {
  const organ = findOrgan(doc, id);
  if (!organ || id === 'brain')
    return null;
  const draft = copy(doc), removing = new Set(organ.centers.map(c => c.id));
  draft.organs = draft.organs.filter(o => o.id !== id);
  draft.wires = draft.wires.filter(w => !removing.has(w.from) && !removing.has(w.to));
  draft.assemblies = draft.assemblies
                         .map(a => ({
                                ...a,
                                organIds : a.organIds.filter(i => i !== id),
                                centerIds : (a.centerIds ?? []).filter(i => !removing.has(i)),
                                wireIds : a.wireIds.filter(i => draft.wires.some(w => w.id === i))
                              }))
                         .filter(a => a.organIds.length);
  return draft;
}
export function removeCenter(doc, id) {
  const found = findCenter(doc, id);
  if (!found)
    return null;
  const draft = copy(doc);
  findOrgan(draft, found.organ.id).centers =
      findOrgan(draft, found.organ.id).centers.filter(c => c.id !== id);
  draft.wires = draft.wires.filter(w => w.from !== id && w.to !== id);
  draft.assemblies = draft.assemblies.map(
      a => ({
        ...a,
        centerIds : (a.centerIds ?? []).filter(c => c !== id),
        wireIds : a.wireIds.filter(w => draft.wires.some(link => link.id === w))
      }));
  return draft;
}
export function addCenter(doc, organId, sites, position, key = null) {
  const organ = findOrgan(doc, organId), definition = organ && ORGAN_BY_KEY[organ.type];
  if (!definition)
    return null;
  const desc = definition.centers.find(c => c.key === key) ?? definition.centers[0];
  if (!desc)
    return null;
  const site = closestSite(desc, sites, new Set(allCenters(doc).map(c => c.site)), position);
  if (!site)
    return null;
  const draft = copy(doc), center = defaults(desc, site);
  findOrgan(draft, organId).centers.push(center);
  return {document : draft, centerId : center.id, organId};
}
export function updateCenter(doc, id, patch) {
  const found = findCenter(doc, id);
  if (!found)
    return null;
  const draft = copy(doc);
  const current = findCenter(draft, id).center;
  for (const [key, value] of Object.entries(patch)) {
    if ([
          'copies', 'threshold', 'tau', 'field', 'q1', 'q2', 'qwidth', 'sigma', 'crossing', 'range',
          'sign', 'mode', 'pace', 'modulator'
        ].includes(key))
      current[key] =
          key === 'copies' ? clamp(Math.round(value), 1, ATELIER_LIMITS.max_copies) : Number(value);
  }
  return draft;
}
export function updateReceptor(doc, id, effect, patch) {
  if (!Number.isInteger(effect))
    return null;
  const draft = copy(doc), receptor = findCenter(draft, id)?.center.receptors[effect];
  if (!receptor)
    return null;
  for (const key of Object.keys(neutralReceptor()))
    if (key in patch)
      receptor[key] = patch[key];
  return draft;
}
// A cell's life phase on the body's maturity (substance HORMONES.levels): from `start` its output
// switches on through a steep output receptor, from `end` it dies through its death receptor
// (response above one half once maturity passes the half value). null leaves a side open.
export function lifePhase(center) {
  const output = center.receptors[HORMONE_EFFECT.output],
        death = center.receptors[HORMONE_EFFECT.death];
  const onMaturity = r => r.active && r.substance === HORMONES.levels;
  return {
    start : onMaturity(output) && output.sensitivity > 0 ? output.half : null,
    end : onMaturity(death) && death.sensitivity > 0 ? death.half : null
  };
}
export function setLifePhase(doc, id, phase, span, steps) {
  const draft = copy(doc), center = findCenter(draft, id)?.center;
  if (!center)
    return null;
  if ('start' in phase)
    center.receptors[HORMONE_EFFECT.output] =
        phase.start === null ? neutralReceptor(HORMONE_EFFECT.output) : {
          ...neutralReceptor(HORMONE_EFFECT.output),
          active : 1,
          baseline : -1,
          sensitivity : span,
          half : phase.start,
          substance : HORMONES.levels,
          steepness : steps
        };
  if ('end' in phase)
    center.receptors[HORMONE_EFFECT.death] = phase.end === null ? neutralReceptor() : {
      ...neutralReceptor(),
      active : 1,
      sensitivity : 1,
      half : phase.end,
      substance : HORMONES.levels
    };
  return draft;
}
// The body's growth receptor: which substance lets the body grow, how strongly and how steeply.
export function updateGrowth(doc, patch) {
  const draft = copy(doc);
  for (const key of Object.keys(neutralReceptor()))
    if (Number.isFinite(patch[key]))
      draft.growth[key] = patch[key];
  return draft;
}
export function addSubstance(doc, max) {
  const active = new Set(doc.substances.map(s => s.index));
  const index = Array.from({length : max}, (_, i) => i).find(i => !active.has(i));
  if (index === undefined)
    return null;
  const draft = copy(doc);
  draft.substances.push({id : identifier('substance'), index, name : ''});
  return draft;
}
export function setSubstance(doc, index, name) {
  const draft = copy(doc), entry = draft.substances.find(s => s.index === index);
  if (!entry)
    return null;
  entry.name = String(name).slice(0, 32);
  return draft;
}
export function removeSubstance(doc, index) {
  const draft = copy(doc);
  draft.substances = draft.substances.filter(s => s.index !== index);
  for (const center of allCenters(draft))
    for (const receptor of center.receptors)
      if (receptor.substance === index)
        receptor.active = 0;
  if (draft.growth.substance === index)
    draft.growth.active = 0;
  return draft;
}
export function addWire(doc, from, to) {
  const a = findCenter(doc, from)?.center, b = findCenter(doc, to)?.center;
  if (!a || !b || from === to || a.role === 'motor' || b.role === 'sensor' ||
      (a.role === 'sensor' && b.role === 'motor') ||
      doc.wires.some(w => w.from === from && w.to === to))
    return null;
  const draft = copy(doc),
        wire =
            {id : identifier('wire'), from, to, strength : .65, spread : .2, length : 1, cross : 0};
  draft.wires.push(wire);
  return {document : draft, wireId : wire.id};
}
export function updateWire(doc, id, patch) {
  const draft = copy(doc), wire = draft.wires.find(w => w.id === id);
  if (!wire)
    return null;
  for (const key of ['strength', 'spread', 'length', 'cross'])
    if (key in patch)
      wire[key] = clamp(Number(patch[key]), 0, 1);
  return draft;
}
export function removeWire(doc, id) {
  const draft = copy(doc);
  draft.wires = draft.wires.filter(w => w.id !== id);
  return draft;
}
function mirroredSite(site, sites) {
  return sites.find(s => s.zone === site.zone && s.side === -site.side && s.u === site.u &&
                         s.v === site.v && s.w === site.w);
}
export function mirrorOrgan(doc, organId, sites) {
  const organ = findOrgan(doc, organId);
  if (!organ || organ.type === 'brain')
    return null;
  const used = new Set(allCenters(doc).map(c => c.site));
  const centers = [];
  for (const c of organ.centers) {
    const site = mirroredSite(sites.find(s => s.id === c.site), sites);
    if (!site || used.has(site.id))
      return null;
    used.add(site.id);
    centers.push({...copy(c), id : identifier('center'), site : site.id});
  }
  const draft = copy(doc), mirror = {id : identifier('organ'), type : organ.type, centers};
  draft.organs.push(mirror);
  return {document : draft, organId : mirror.id, centerId : centers[0]?.id};
}
export function assemble(doc, organIds, name = '', chosenCenters = null) {
  const ids = [...new Set(organIds) ].filter(id => doc.organs.some(o => o.id === id));
  if (!ids.length)
    return null;
  const draft = copy(doc),
        selected =
            new Set(chosenCenters ?? ids.flatMap(id => findOrgan(doc, id).centers.map(c => c.id)));
  draft.assemblies.push({
    id : identifier('assembly'),
    name,
    organIds : ids,
    centerIds : [...selected ],
    wireIds : doc.wires.filter(w => selected.has(w.from) && selected.has(w.to)).map(w => w.id)
  });
  return draft;
}

export function moveAssembly(doc, assemblyId, sites, position) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  const moving = new Set(assembly.centerIds ?? []),
        centers = allCenters(doc).filter(c => moving.has(c.id));
  if (!centers.length)
    return null;
  const origin = centers.reduce((acc, center) => {
    const site = sites.find(s => s.id === center.site), p = sitePoint(site, center.organType);
    acc.x += p.x / centers.length;
    acc.y += p.y / centers.length;
    return acc;
  }, {x : 0, y : 0});
  const dx = position.x - origin.x, dy = position.y - origin.y;
  const draft = copy(doc),
        used = new Set(allCenters(doc).filter(c => !moving.has(c.id)).map(c => c.site));
  for (const center of centers) {
    const originalSite = sites.find(s => s.id === center.site);
    const p = sitePoint(originalSite, center.organType);
    const site = closestSite(center, sites, used, {x : p.x + dx, y : p.y + dy}, originalSite.side);
    if (!site)
      return null;
    used.add(site.id);
    findCenter(draft, center.id).center.site = site.id;
  }
  return draft;
}
export function mirrorAssembly(doc, assemblyId, sites) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  const moving = new Set(assembly.centerIds ?? []), draft = copy(doc),
        used = new Set(allCenters(doc).map(c => c.site)), idMap = new Map();
  const mirroredOrgans = [];
  for (const original of doc.organs) {
    const centers = original.centers.filter(c => moving.has(c.id));
    if (!centers.length)
      continue;
    const mirrored = [];
    for (const center of centers) {
      const site = mirroredSite(sites.find(s => s.id === center.site), sites);
      if (!site || used.has(site.id))
        return null;
      used.add(site.id);
      const id = identifier('center');
      idMap.set(center.id, id);
      mirrored.push({...copy(center), id, site : site.id});
    }
    if (original.type === 'brain') {
      findOrgan(draft, 'brain').centers.push(...mirrored);
      mirroredOrgans.push('brain');
    } else {
      const id = identifier('organ');
      draft.organs.push({id, type : original.type, centers : mirrored});
      mirroredOrgans.push(id);
    }
  }
  const newWires = [];
  for (const wire of doc.wires) {
    if (!idMap.has(wire.from) || !idMap.has(wire.to))
      continue;
    const id = identifier('wire');
    draft.wires.push({...copy(wire), id, from : idMap.get(wire.from), to : idMap.get(wire.to)});
    newWires.push(id);
  }
  const id = identifier('assembly');
  draft.assemblies.push({
    id,
    name : assembly.name,
    organIds : mirroredOrgans,
    centerIds : [...idMap.values() ],
    wireIds : newWires
  });
  return {document : draft, assemblyId : id};
}
export function removeAssembly(doc, assemblyId) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  let draft = copy(doc);
  for (const id of assembly.centerIds ?? [])
    draft = removeCenter(draft, id) ?? draft;
  draft.organs = draft.organs.filter(o => o.type === 'brain' || o.centers.length);
  draft.assemblies = draft.assemblies.filter(a => a.id !== assemblyId);
  return draft;
}
export function placeModule(doc, moduleKey, sites, position) {
  const module = MODULES.find(m => m.key === moduleKey);
  if (!module)
    return null;
  let draft = copy(doc);
  const organIds = [], centerByOrgan = [];
  for (let i = 0; i < module.organs.length; ++i) {
    const kind = module.organs[i];
    if (kind === 'brain') {
      const created = addNeuron(
          draft,
          module.circuits[module.organs.slice(0, i + 1).filter(o => o === 'brain').length - 1] ??
              'relay',
          sites, position);
      if (!created)
        return null;
      draft = created.document;
      organIds.push('brain');
      centerByOrgan.push([ created.centerId ]);
    } else {
      const created = addOrgan(draft, kind, sites, position);
      if (!created)
        return null;
      draft = created.document;
      organIds.push(created.organId);
      centerByOrgan.push(findOrgan(draft, created.organId).centers.map(c => c.id));
    }
  }
  for (const [fromOrgan, fromCenter, toOrgan, toCenter] of module.connections) {
    const from = centerByOrgan[fromOrgan]?.[fromCenter], to = centerByOrgan[toOrgan]?.[toCenter];
    if (!from || !to)
      continue;
    const result = addWire(draft, from, to);
    if (result)
      draft = result.document;
  }
  const assembly = assemble(draft, organIds, moduleKey, centerByOrgan.flat());
  return assembly ? {document : assembly, assemblyId : assembly.assemblies.at(-1).id} : null;
}
function address(id) {
  let hash = 2166136261;
  for (const char of id)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return [ (hash & 65535) / 65535 * 1.7 - .85, ((hash >>> 16) & 65535) / 65535 * 1.7 - .85 ];
}
export function compileDocument(doc, sites, effects = ATELIER_LIMITS.receptors) {
  validateDocument(doc);
  const groups = [];
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const site = sites.find(s => s.id === center.site);
      if (!site || !eligible(center, site))
        throw new Error('studio.errors.invalidSite');
      const inputs = doc.wires.filter(w => w.to === center.id);
      const upstream = inputs.map(w => address(w.from));
      const receiver = upstream.length ? [
      upstream.reduce((sum, p) => sum + p[0], 0) / upstream.length,
      upstream.reduce((sum, p) => sum + p[1], 0) / upstream.length
    ] : [-1, -1];
      const spread =
          Math.max(.03, ...upstream.map(p => Math.hypot(p[0] - receiver[0], p[1] - receiver[1])));
      const [sx, sy] = address(center.id);
      const sigma = Math.min(
          2, Math.max(.03, center.sigma, spread, ...inputs.map(w => .03 + w.spread * 1.97)));
      const g = {
        name : `${organ.type}:${center.key}`.slice(0, ATELIER_LIMITS.max_group_name),
        zone : site.zone,
        side : site.side,
        u0 : site.u,
        u1 : site.u,
        v0 : site.v,
        v1 : site.v,
        w0 : site.w,
        w1 : site.w,
        role : ROLE[center.role],
        function : functionFor(center, site),
        copies : clamp(Math.round(center.copies), 1, ATELIER_LIMITS.max_copies),
        threshold : center.threshold,
        tau : center.tau,
        field : center.field,
        q1 : center.q1,
        q2 : center.q2,
        qwidth : center.qwidth,
        sign : center.sign,
        mode : center.mode,
        pace : center.pace,
        modulator : center.modulator,
        sender1 : sx,
        sender2 : sy,
        receiver1 : receiver[0],
        receiver2 : receiver[1],
        sigma,
        crossing : center.crossing,
        range : center.range,
        receptors : center.receptors.slice(0, effects).map(r => ({...r}))
      };
      if (center.role === 'motor' &&
          (g.function === MOTOR_KIND.eggs || g.function === MOTOR_KIND.sperm))
        g.threshold = Math.min(-.1, g.threshold);
      groups.push(g);
    }
  return {name : doc.name, groups, growth : {...doc.growth}};
}
