import {bearing, retinalBins, fieldRecipe, generateRetina, HALF_VIEW} from './studio_retina.js';
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
export const NEW_DOCUMENT = 'v019-fish-atelier';
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
    if ([ 'eye', 'proximity' ].includes(organ.type)) {
      const f = organ.field;
      if (!f || ![f.lo, f.hi, f.density, f.resolution].every(Number.isFinite) || f.lo < 0 ||
          f.hi > HALF_VIEW || f.lo >= f.hi || f.density < 1 || f.density > 16 ||
          !Array.isArray(f.profiles) || !f.profiles.length ||
          !f.profiles.every(p => typeof p.id === 'string' &&
                                 [ p.q1, p.q2, p.qwidth, p.threshold ].every(Number.isFinite)))
        throw new Error('studio.errors.invalidDocument');
    }
    if (organ.pair && doc.organs.find(o => o.id === organ.pair)?.pair !== organ.id)
      throw new Error('studio.errors.invalidDocument');
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
    (r, effect) => r.active && wheel.roleEffects[ROLE[center.role]]?.includes(effect) &&
                           receptorAffinity(wheel, r, index) >= NOTICEABLE_AFFINITY
                       ? [ effect ]
                       : []);
export const receivers = (doc, index, wheel) =>
    allCenters(doc).filter(c => boundEffects(c, index, wheel).length);
// Whether the body's growth receptor binds the substance at `index`.
export const growsWith = (doc, index, wheel) =>
    doc.growth.active && receptorAffinity(wheel, doc.growth, index) >= NOTICEABLE_AFFINITY;
export const allCenters = doc =>
    doc.organs.flatMap(organ => organ.centers.map(
                           center => ({...center, organId : organ.id, organType : organ.type})));
export const findOrgan = (doc, id) => doc.organs.find(o => o.id === id) ?? null;
function matchingOrgan(doc, type, side, sites) {
  const scope = ORGAN_BY_KEY[type]?.scope;
  if (scope === 'single')
    return doc.organs.find(organ => organ.type === type) ?? null;
  if (scope !== 'side')
    return null;
  return doc.organs.find(
             organ => organ.type === type &&
                      organ.centers.some(
                          center => sites.find(site => site.id === center.site)?.side === side)) ??
         null;
}
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
function candidates(desc, sites, used, position, requiredSide = null, organType = '') {
  return sites
      .filter(site => !used.has(site.id) && eligible(desc, site) &&
                      (requiredSide === null || site.side === requiredSide))
      .map(site => ({site, distance : pointDistance(site, position, organType)}))
      .sort((a, b) => a.distance - b.distance);
}
export function closestSite(desc, sites, used, position, side = null, organType = '') {
  return candidates(desc, sites, used, position, side, organType)[0]?.site ?? null;
}
// Allocate the fixed head lattice jointly: each organ receives coverage before extra colour
// types fill remaining sites. Adding the near sense therefore also works after a dense retina.
function regenerateFields(draft, sites) {
  const fields = draft.organs.filter(o => o.field);
  const used = new Set(
      allCenters(draft).filter(c => !fields.some(o => o.id === c.organId)).map(c => c.site));
  const bins = retinalBins(sites);
  for (let i = 0; i < fields.length; i++) {
    const organ = fields[i], reserved = new Set(used);
    for (const other of fields.slice(i + 1)) {
      for (const bin of bins.filter(b => b.hi > other.field.lo && b.lo < other.field.hi)) {
        const available =
            sites.filter(s => s.zone === 1 && s.side === other.side &&
                              Math.abs(bearing(s) - bin.angle) < .001 && !reserved.has(s.id));
        const site =
            available.find(s => other.centers.some(c => c.site === s.id)) ?? available.at(-1);
        if (!site)
          return false;
        reserved.add(site.id);
      }
    }
    const centers = generateRetina(organ, sites, reserved,
                                   site => defaults(ORGAN_BY_KEY[organ.type].centers[0], site));
    if (!centers?.length)
      return false;
    organ.centers = centers;
    centers.forEach(c => used.add(c.site));
  }
  for (const assembly of draft.assemblies)
    assembly.centerIds = assemblyCenters(draft, assembly);
  return true;
}
export function addOrgan(doc, type, sites, position, snapDistance = Infinity, paired = true) {
  const definition = ORGAN_BY_KEY[type];
  if (!definition || definition.fixed)
    return null;
  const draft = copy(doc), used = new Set(allCenters(draft).map(c => c.site));
  if (paired && definition.scope !== 'single')
    for (const occupied of [...used]) {
      const mirror = mirroredSite(sites.find(s => s.id === occupied), sites);
      if (mirror)
        used.add(mirror.id);
    }
  const first = closestSite(definition.centers[0], sites, new Set(), position, null, type);
  if (!first || pointDistance(first, position, type) > snapDistance)
    return null;
  const existing = matchingOrgan(draft, type, first.side, sites);
  if (existing)
    return {
      document : draft,
      organId : existing.id,
      centerId : existing.centers[0].id,
      centerIds : existing.centers.map(c => c.id)
    };
  const organ = {
    id : identifier('organ'),
    type,
    side : first.side,
    centers : [],
    pair : null,
    linked : false
  };
  if (type === 'eye' || type === 'proximity') {
    organ.field = fieldRecipe(first, identifier('profile'));
    if (type === 'proximity')
      organ.field.profiles[0].qwidth = .35;
  } else {
    for (const desc of definition.centers) {
      const site = closestSite(desc, sites, used, position, first.side, type);
      if (!site)
        return null;
      used.add(site.id);
      organ.centers.push(defaults(desc, site));
    }
  }
  draft.organs.push(organ);
  if (organ.field && !regenerateFields(draft, sites))
    return null;
  let result = draft;
  if (paired && definition.scope !== 'single') {
    const mirrored = mirrorOrgan(draft, organ.id, sites);
    if (!mirrored)
      return null;
    result = mirrored.document;
  }
  return {
    document : result,
    organId : organ.id,
    centerId : organ.centers[0].id,
    centerIds : organ.centers.map(c => c.id)
  };
}
export function updateField(doc, id, patch, sites) {
  const original = findOrgan(doc, id);
  if (!original?.field)
    return null;
  const draft = copy(doc), organ = findOrgan(draft, id);
  const targets = [ organ ];
  if (organ.linked && organ.pair)
    targets.push(findOrgan(draft, organ.pair));
  for (const target of targets.filter(Boolean)) {
    for (const key of ['lo', 'hi', 'density', 'resolution']) {
      if (!(key in patch))
        continue;
      const delta = patch[key] - original.field[key];
      target.field[key] = target === organ ? patch[key] : target.field[key] + delta;
    }
    target.field.lo = clamp(target.field.lo, 0, HALF_VIEW - 1);
    target.field.hi = clamp(target.field.hi, target.field.lo + 1, HALF_VIEW);
    target.field.density = clamp(Math.round(target.field.density), 1, 16);
    target.field.resolution = clamp(target.field.resolution, 0, 1);
    if (patch.profile) {
      const index = original.field.profiles.findIndex(p => p.id === patch.profile.id);
      const profile = target.field.profiles[index];
      if (profile)
        for (const key of ['q1', 'q2', 'qwidth', 'threshold'])
          if (key in patch.profile) {
            const value = target === organ ? patch.profile[key]
                                           : profile[key] + patch.profile[key] -
                                                 original.field.profiles[index][key];
            profile[key] = clamp(value, key === 'qwidth' ? 0 : -1, 1);
          }
    }
    if (patch.addProfile)
      target.field.profiles.push({...copy(patch.addProfile)});
    if (patch.removeProfile !== undefined && target.field.profiles.length > 1)
      target.field.profiles.splice(patch.removeProfile, 1);
  }
  if (!regenerateFields(draft, sites))
    return null;
  return draft;
}
export function linkPair(doc, id) {
  const draft = copy(doc), organ = findOrgan(draft, id);
  const other = findOrgan(draft, organ?.pair);
  if (!other)
    return null;
  organ.linked = other.linked = !organ.linked;
  return draft;
}
export function addNeuron(doc, preset, sites, position, snapDistance = Infinity) {
  const properties = NEURON_BY_KEY[preset];
  if (!properties)
    return null;
  const used = new Set(allCenters(doc).map(c => c.site));
  const desc = {key : preset, role : 'nerve', functionCode : -1, copies : 4, surface : 'any'};
  const site = closestSite(desc, sites.filter(s => s.zone === 1 || s.zone === 2), used, position,
                           null, 'brain');
  if (!site || pointDistance(site, position, 'brain') > snapDistance)
    return null;
  const draft = copy(doc);
  const center = {...defaults(desc, site), ...properties};
  draft.organs.find(o => o.id === 'brain').centers.push(center);
  return {document : draft, centerId : center.id, organId : 'brain'};
}
export function moveCenter(doc, centerId, target, sites) {
  const result = findCenter(doc, centerId);
  const site = sites.find(s => s.id === target);
  if (!result || result.organ.type !== 'brain' || !site || !eligible(result.center, site))
    return null;
  if (allCenters(doc).some(c => c.id !== centerId && c.site === site.id))
    return null;
  const draft = copy(doc);
  findCenter(draft, centerId).center.site = site.id;
  return draft;
}
export function moveOrgan(doc, organId, sites, position, snapDistance = Infinity,
                          pointerOrigin = null) {
  const original = findOrgan(doc, organId);
  if (!original || original.type === 'brain' || !original.centers.length)
    return null;
  if (original.field) {
    const anchor = pointerOrigin ?? sitePoint(sites.find(s => s.id === original.centers[0].site));
    const dx = position.x - anchor.x, dy = (position.y - anchor.y) * original.side;
    const requested = (dx + dy) * .25;
    const delta = clamp(requested, -original.field.lo, HALF_VIEW - original.field.hi);
    return updateField(doc, organId,
                       {lo : original.field.lo + delta, hi : original.field.hi + delta}, sites);
  }
  const draft = copy(doc), organ = findOrgan(draft, organId);
  const used = new Set(allCenters(draft).filter(c => c.organId !== organId).map(c => c.site));
  const currentSites = original.centers.map(center => sites.find(site => site.id === center.site));
  if (currentSites.some(site => !site))
    return null;
  const anchor = sitePoint(currentSites[0], organ.type);
  const target = pointerOrigin ? {
    x : anchor.x + position.x - pointerOrigin.x,
    y : anchor.y + position.y - pointerOrigin.y
  }
                               : position;
  const first = closestSite(organ.centers[0], sites, used, target, organ.pair ? organ.side : null,
                            organ.type);
  if (!first || pointDistance(first, target, organ.type) > snapDistance)
    return null;
  const fixed = sitePoint(first, organ.type);
  const sideFlip = currentSites[0].side === first.side ? 1 : -1;
  for (let index = 0; index < organ.centers.length; ++index) {
    const center = organ.centers[index];
    const old = currentSites[index], current = sitePoint(old, organ.type);
    const wanted = {
      x : fixed.x + current.x - anchor.x,
      y : fixed.y + (current.y - anchor.y) * sideFlip
    };
    const site = index === 0
                     ? first
                     : closestSite(center, sites, used, wanted, old.side * sideFlip, organ.type);
    if (!site || pointDistance(site, wanted, organ.type) > snapDistance)
      return null;
    center.site = site.id;
    used.add(site.id);
  }
  organ.side = first.side;
  if (original.linked && original.pair) {
    const other = findOrgan(draft, original.pair);
    const from = sitePoint(sites.find(s => s.id === other.centers[0].site), other.type);
    other.linked = false;
    const moved = moveOrgan(draft, other.id, sites,
                            {x : from.x + fixed.x - anchor.x, y : from.y - fixed.y + anchor.y},
                            snapDistance, from);
    if (!moved)
      return null;
    findOrgan(moved, other.id).linked = true;
    return moved;
  }
  return draft;
}
export function removeOrgan(doc, id) {
  const organ = findOrgan(doc, id);
  if (!organ || id === 'brain')
    return null;
  const draft = copy(doc), removing = new Set([ id, ...organ.centers.map(c => c.id) ]);
  const paired = findOrgan(draft, organ.pair);
  if (paired) {
    paired.pair = null;
    paired.linked = false;
  }
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
  if (found.organ.type !== 'brain')
    return removeOrgan(doc, found.organ.id);
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
function tissueTargets(doc, id) {
  const found = findCenter(doc, id);
  if (!found)
    return [];
  if (found.organ.type === 'brain')
    return [ found.center ];
  const organs = [ found.organ ];
  if (found.organ.linked)
    organs.push(findOrgan(doc, found.organ.pair));
  return organs.filter(Boolean).flatMap(o => o.centers.filter(c => c.key === found.center.key));
}
export function updateCenter(doc, id, patch) {
  const found = findCenter(doc, id);
  if (!found)
    return null;
  const draft = copy(doc);
  const keys = [
    'copies', 'threshold', 'tau', 'field', 'q1', 'q2', 'qwidth', 'sigma', 'crossing', 'range',
    'sign', 'mode', 'pace', 'modulator'
  ];
  for (const c of tissueTargets(draft, id)) {
    for (const key of keys)
      if (Number.isFinite(patch[key])) {
        const paired = findCenter(draft, c.id).organ.id !== found.organ.id;
        const value = paired ? c[key] + patch[key] - found.center[key] : patch[key];
        c[key] = key === 'copies' ? clamp(Math.round(value), 1, 16)
                                  : clamp(value,
                                          [ 'tau', 'field', 'qwidth', 'range' ].includes(key) ? 0
                                          : key === 'sigma'                                   ? .03
                                                                                              : -1,
                                          key === 'sigma' ? 2 : 1);
      }
  }
  // Generated visual tissues keep their recipe as the source for future regeneration.
  for (const organ of draft.organs.filter(o => o.field)) {
    for (const profile of organ.field.profiles) {
      const c = organ.centers.find(c => c.profile === profile.id);
      if (!c)
        continue;
      for (const key of ['q1', 'q2', 'qwidth', 'threshold'])
        profile[key] = c[key];
    }
    organ.field.density = organ.centers[0].copies;
    organ.field.resolution = organ.centers[0].field;
  }
  return draft;
}
export function updateReceptor(doc, id, effect, patch) {
  if (!Number.isInteger(effect))
    return null;
  const draft = copy(doc), targets = tissueTargets(draft, id);
  if (!targets.length || !targets[0].receptors[effect])
    return null;
  for (const center of targets)
    for (const key of Object.keys(neutralReceptor()))
      if (Number.isFinite(patch[key]))
        center.receptors[effect][key] = patch[key];
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
  const draft = copy(doc), targets = tissueTargets(draft, id);
  if (!targets.length)
    return null;
  for (const center of targets) {
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
  }
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
  from = endpointId(doc, from);
  to = endpointId(doc, to);
  const a = endpointCenters(doc, from)[0], b = endpointCenters(doc, to)[0];
  if (!a || !b || from === to || a.role === 'motor' || b.role === 'sensor' ||
      (a.role === 'sensor' && b.role === 'motor') ||
      doc.wires.some(w => w.from === from && w.to === to))
    return null;
  const draft = copy(doc), wire = {id : identifier('wire'), from, to, spread : .2};
  draft.wires.push(wire);
  return {document : draft, wireId : wire.id};
}
export function endpointId(doc, id) {
  const found = findCenter(doc, id);
  return found && found.organ.type !== 'brain' ? found.organ.id : id;
}
export function endpointCenters(doc, id) {
  return findOrgan(doc, id)?.centers ?? (findCenter(doc, id) ? [ findCenter(doc, id).center ] : []);
}
// Connect physical organs and neural regions through stable semantic endpoints.
// A contact is drawn for each legal centre pair and remains independently editable.
export function selectionCenters(doc, item) {
  if (!item)
    return [];
  if (item.kind === 'center')
    return findCenter(doc, item.id) ? [ item.id ] : [];
  if (item.kind === 'organ')
    return findOrgan(doc, item.id)?.centers.map(center => center.id) ?? [];
  if (item.kind === 'assembly')
    return assemblyCenters(doc, doc.assemblies.find(a => a.id === item.id));
  return [];
}
export function connectSelections(doc, source, target) {
  const starts = [...new Set(selectionCenters(doc, source).map(id => endpointId(doc, id))) ];
  const ends = [...new Set(selectionCenters(doc, target).map(id => endpointId(doc, id))) ];
  let draft = doc;
  const wireIds = [];
  for (const from of starts)
    for (const to of ends) {
      const added = addWire(draft, from, to);
      if (added) {
        draft = added.document;
        wireIds.push(added.wireId);
      }
    }
  return wireIds.length ? {document : draft, wireIds, wireId : wireIds[0]} : null;
}
export function updateWire(doc, id, patch) {
  const draft = copy(doc), wire = draft.wires.find(w => w.id === id);
  if (!wire)
    return null;
  for (const key of ['spread'])
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
  const original = findOrgan(doc, organId);
  if (!original || original.type === 'brain' || original.pair)
    return null;
  const used = new Set(allCenters(doc).map(c => c.site));
  const draft = copy(doc), organ = findOrgan(draft, organId);
  const mirror = {
    ...copy(organ),
    id : identifier('organ'),
    side : -organ.side,
    pair : organ.id,
    linked : true,
    centers : []
  };
  for (const c of organ.centers) {
    const site = mirroredSite(sites.find(s => s.id === c.site), sites);
    if (!site || (!organ.field && used.has(site.id)))
      return null;
    mirror.centers.push({
      ...copy(c),
      id : c.id.startsWith(organ.id + ':') ? mirror.id + c.id.slice(organ.id.length)
                                           : identifier('center'),
      site : site.id
    });
  }
  if (matchingOrgan(draft, organ.type, -organ.side, sites))
    return null;
  organ.pair = mirror.id;
  organ.linked = true;
  draft.organs.push(mirror);
  if (organ.field && !regenerateFields(draft, sites))
    return null;
  return {document : draft, organId : mirror.id, centerId : mirror.centers[0]?.id};
}
export function assemblyCenters(doc, assembly) {
  if (!assembly)
    return [];
  return assembly.organIds.flatMap(
      id => id === 'brain'
                ? (assembly.centerIds ?? []).filter(c => findCenter(doc, c)?.organ.type === 'brain')
                : findOrgan(doc, id)?.centers.map(c => c.id) ?? []);
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
    wireIds : doc.wires
                  .filter(w => (selected.has(w.from) || ids.includes(w.from)) &&
                               (selected.has(w.to) || ids.includes(w.to)))
                  .map(w => w.id)
  });
  return draft;
}

export function moveAssembly(doc, assemblyId, sites, position, pointerOrigin = null,
                             snapDistance = Infinity) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  const members = assemblyCenters(doc, assembly);
  const points = members.map(id => {
    const c = findCenter(doc, id);
    return sitePoint(sites.find(s => s.id === c.center.site), c.organ.type);
  });
  if (!points.length)
    return null;
  const origin = pointerOrigin ?? {
    x : points.reduce((n, p) => n + p.x, 0) / points.length,
    y : points.reduce((n, p) => n + p.y, 0) / points.length
  };
  const dx = position.x - origin.x, dy = position.y - origin.y;
  let draft = copy(doc);
  const moved = new Set();
  for (const id of assembly.organIds.filter(id => id !== 'brain')) {
    if (moved.has(id))
      continue;
    const organ = findOrgan(draft, id), c = organ.centers[0];
    const from = sitePoint(sites.find(s => s.id === c.site), organ.type);
    draft = moveOrgan(draft, id, sites, {x : from.x + dx, y : from.y + dy}, snapDistance, from);
    if (!draft)
      return null;
    moved.add(id);
    if (organ.linked)
      moved.add(organ.pair);
  }
  for (const id of members.filter(id => findCenter(doc, id)?.organ.type === 'brain')) {
    const c = findCenter(draft, id).center, from = sitePoint(sites.find(s => s.id === c.site));
    const used = new Set(allCenters(draft).filter(c => c.id !== id).map(c => c.site));
    const site = closestSite(c, sites, used, {x : from.x + dx, y : from.y + dy});
    if (!site || pointDistance(site, {x : from.x + dx, y : from.y + dy}) > snapDistance)
      return null;
    draft = moveCenter(draft, id, site.id, sites);
    if (!draft)
      return null;
  }
  return draft;
}
export function mirrorAssembly(doc, assemblyId, sites) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  let draft = copy(doc);
  const mapping = new Map(), organIds = [], centerIds = [];
  for (const id of assembly.organIds.filter(id => id !== 'brain')) {
    const organ = findOrgan(draft, id);
    let mirrored = findOrgan(draft, organ.pair);
    if (!mirrored) {
      const added = mirrorOrgan(draft, id, sites);
      if (!added)
        return null;
      draft = added.document;
      mirrored = findOrgan(draft, added.organId);
    }
    mapping.set(id, mirrored.id);
    organIds.push(mirrored.id);
    centerIds.push(...mirrored.centers.map(c => c.id));
  }
  for (const id of assemblyCenters(doc, assembly)
           .filter(id => findCenter(doc, id)?.organ.type === 'brain')) {
    const center = findCenter(doc, id).center;
    const site = mirroredSite(sites.find(s => s.id === center.site), sites);
    if (!site || allCenters(draft).some(c => c.site === site.id))
      return null;
    const fresh = {...copy(center), id : identifier('center'), site : site.id};
    findOrgan(draft, 'brain').centers.push(fresh);
    mapping.set(id, fresh.id);
    centerIds.push(fresh.id);
    if (!organIds.includes('brain'))
      organIds.push('brain');
  }
  for (const wire of doc.wires.filter(w => assembly.wireIds.includes(w.id))) {
    const added = addWire(draft, mapping.get(wire.from), mapping.get(wire.to));
    if (added)
      draft = updateWire(added.document, added.wireId, wire);
  }
  draft = assemble(draft, organIds, assembly.name, centerIds);
  return {document : draft, assemblyId : draft.assemblies.at(-1).id};
}
export function removeAssembly(doc, assemblyId) {
  const assembly = doc.assemblies.find(a => a.id === assemblyId);
  if (!assembly)
    return null;
  let draft = copy(doc);
  for (const id of assemblyCenters(doc, assembly))
    draft = removeCenter(draft, id) ?? draft;
  draft.assemblies = draft.assemblies.filter(a => a.id !== assemblyId);
  return draft;
}
// Saved modules contain whole organs and selected neural regions. Recipes and semantic links
// survive new identifiers; no partial retinal cell cloud is loaded or reconstructed.
export function placeStoredModule(doc, module, sites, position, snapDistance = Infinity) {
  if (!module || !Array.isArray(module.organs) || !Array.isArray(module.wires))
    return null;
  const originals = module.organs.filter(o => o.centers?.length);
  if (!originals.length)
    return null;
  if (originals.some(o => !ORGAN_BY_KEY[o.type] ||
                          o.centers.some(c => !sites.some(s => s.id === c.site))))
    return null;
  const points = originals.map(o => sitePoint(sites.find(s => s.id === o.centers[0].site), o.type));
  const source = {
    x : points.reduce((n, p) => n + p.x, 0) / points.length,
    y : points.reduce((n, p) => n + p.y, 0) / points.length
  };
  const offset = p => ({x : p.x + position.x - source.x, y : p.y + position.y - source.y});
  let draft = copy(doc);
  const mapping = new Map(), organIds = [], centerIds = [];
  for (const original of originals) {
    if (!ORGAN_BY_KEY[original.type])
      return null;
    if (original.type === 'brain') {
      for (const previous of original.centers) {
        const at = offset(sitePoint(sites.find(s => s.id === previous.site), 'brain'));
        const placed = addNeuron(draft, previous.key, sites, at, snapDistance);
        if (!placed)
          return null;
        draft = placed.document;
        const fresh = findCenter(draft, placed.centerId).center;
        Object.assign(fresh, copy(previous), {id : placed.centerId, site : fresh.site});
        mapping.set(previous.id, fresh.id);
        centerIds.push(fresh.id);
      }
      organIds.push('brain');
      continue;
    }
    const at = offset(sitePoint(sites.find(s => s.id === original.centers[0].site), original.type));
    const added = addOrgan(draft, original.type, sites, at, snapDistance, false);
    if (!added || doc.organs.some(o => o.id === added.organId))
      return null;
    draft = added.document;
    const fresh = findOrgan(draft, added.organId);
    if (original.field) {
      fresh.field = copy(original.field);
      fresh.centers =
          original.centers.map(c => ({...copy(c), id : fresh.id + c.id.slice(original.id.length)}));
      if (!regenerateFields(draft, sites))
        return null;
    } else
      for (const c of fresh.centers) {
        const previous = original.centers.find(p => p.key === c.key);
        if (previous)
          Object.assign(c, copy(previous), {id : c.id, site : c.site});
      }
    mapping.set(original.id, fresh.id);
    organIds.push(fresh.id);
    centerIds.push(...fresh.centers.map(c => c.id));
  }
  for (const original of originals) {
    const fresh = findOrgan(draft, mapping.get(original.id));
    if (!fresh)
      continue;
    fresh.pair = mapping.get(original.pair) ?? null;
    fresh.linked = !!fresh.pair && original.linked;
  }
  for (const wire of module.wires) {
    const added = addWire(draft, mapping.get(wire.from), mapping.get(wire.to));
    if (!added)
      return null;
    draft = updateWire(added.document, added.wireId, wire);
  }
  draft = assemble(draft, organIds, module.name, centerIds);
  return {document : draft, assemblyId : draft.assemblies.at(-1).id};
}
export function placeModule(doc, moduleKey, sites, position, snapDistance = Infinity) {
  const module = MODULES.find(m => m.key === moduleKey);
  if (!module)
    return null;
  let draft = copy(doc);
  const anchor = module.organs.find(type => type !== 'brain') ?? 'brain';
  const organIds = [], centerByOrgan = [];
  for (let i = 0; i < module.organs.length; ++i) {
    const kind = module.organs[i];
    if (kind === 'brain') {
      const created = addNeuron(
          draft,
          module.circuits[module.organs.slice(0, i + 1).filter(o => o === 'brain').length - 1] ??
              'relay',
          sites, position, anchor === 'brain' ? snapDistance : Infinity);
      if (!created)
        return null;
      draft = created.document;
      organIds.push('brain');
      centerByOrgan.push([ created.centerId ]);
    } else {
      const muscleSite = kind === 'muscle'
                             ? closestSite(ORGAN_BY_KEY.muscle.centers[0],
                                           sites.filter(s => s.zone === module.muscleZone),
                                           new Set(allCenters(draft).map(c => c.site)), position)
                             : null;
      if (kind === 'muscle' && !muscleSite)
        return null;
      const target = muscleSite ? sitePoint(muscleSite, kind) : position;
      const created =
          addOrgan(draft, kind, sites, target, kind === anchor ? snapDistance : Infinity);
      if (!created)
        return null;
      draft = created.document;
      organIds.push(created.organId);
      centerByOrgan.push(created.centerIds);
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
      const inputs = doc.wires.filter(w => w.to === endpointId(doc, center.id));
      const upstream = inputs.map(w => address(w.from));
      const receiver = upstream.length ? [
      upstream.reduce((sum, p) => sum + p[0], 0) / upstream.length,
      upstream.reduce((sum, p) => sum + p[1], 0) / upstream.length
    ] : [-1, -1];
      const spread =
          Math.max(.03, ...upstream.map(p => Math.hypot(p[0] - receiver[0], p[1] - receiver[1])));
      const [sx, sy] = address(endpointId(doc, center.id));
      const sigma =
          inputs.length
              ? Math.min(2, Math.max(.03, spread, ...inputs.map(w => .03 + w.spread * 1.97)))
              : center.sigma;
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
