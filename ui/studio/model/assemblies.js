import {ATELIER_LIMITS} from '../../schema.js';
import {MODULES, ORGAN_BY_KEY, siteRole} from './organs.js';
import {
  centroid,
  findSite,
  NERVE_ROLE,
  nerveZone,
  onMidline,
  pointDistance,
  sitePoint
} from './layout.js';
import {settleRegions} from './regions.js';
import {
  addNeuron,
  addOrgan,
  addWire,
  allCenters,
  assemblyCenters,
  closestSite,
  copy,
  findAssembly,
  findCenter,
  findOrgan,
  identifier,
  matchingNode,
  mirroredSite,
  mirrorOrgan,
  moveCenter,
  moveOrgan,
  regenerateFields,
  removeCenter,
  updateWire,
  usedSites
} from './document.js';

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

export function assembleSelection(doc, chosen) {
  const organs = [], members = new Set();
  for (const id of chosen) {
    const organ = findOrgan(doc, id), hit = organ ? null : findCenter(doc, id);
    if (organ) {
      organs.push(organ.id);
      for (const center of organ.centers)
        members.add(center.id);
    } else if (hit) {
      organs.push(hit.organ.id);
      members.add(id);
    }
  }
  return assemble(doc, organs, '', [...members ]);
}
export function ungroupAssembly(doc, id) {
  const draft = copy(doc);
  draft.assemblies = draft.assemblies.filter(a => a.id !== id);
  return draft;
}
export function oneSided(doc, sites, assembly) {
  return assemblyCenters(doc, assembly).some(id => {
    const found = findCenter(doc, id);
    if (!found)
      return false;
    if (found.organ.type === 'brain') {
      const site = findSite(sites, found.center.site), mirror = mirroredSite(site, sites);
      return !onMidline(site) &&
             !assemblyCenters(doc, assembly)
                  .some(other => findCenter(doc, other)?.center.site === mirror?.id);
    }
    return found.organ.side && ORGAN_BY_KEY[found.organ.type]?.scope === 'side' &&
           !findOrgan(doc, found.organ.pair);
  });
}
export const modulesOf = (doc, id) => doc.assemblies.filter(
    a => a.organIds.includes(id) || (a.centerIds ?? []).includes(id) ||
         findOrgan(doc, id)?.centers.some(c => (a.centerIds ?? []).includes(c.id)));
export function moveAssembly(doc, assemblyId, sites, position, pointerOrigin = null,
                             snapDistance = Infinity) {
  const assembly = findAssembly(doc, assemblyId);
  if (!assembly)
    return null;
  const members = assemblyCenters(doc, assembly);
  const points = members.map(id => {
    const c = findCenter(doc, id);
    return sitePoint(findSite(sites, c.center.site), siteRole(c.organ.type));
  });
  if (!points.length)
    return null;
  const origin = pointerOrigin ?? centroid(points);
  const dx = position.x - origin.x, dy = position.y - origin.y;
  let draft = copy(doc);
  const moved = new Set();
  for (const id of assembly.organIds.filter(id => id !== 'brain')) {
    if (moved.has(id))
      continue;
    const organ = findOrgan(draft, id), c = organ.centers[0];
    const from = sitePoint(findSite(sites, c.site), siteRole(organ.type));
    draft = moveOrgan(draft, id, sites, {x : from.x + dx, y : from.y + dy}, snapDistance, from);
    if (!draft)
      return null;
    moved.add(id);
    if (organ.linked)
      moved.add(organ.pair);
  }
  for (const id of members.filter(id => findCenter(doc, id)?.organ.type === 'brain')) {
    const c = findCenter(draft, id).center, from = sitePoint(findSite(sites, c.site), NERVE_ROLE);
    const used = usedSites(draft, c => c.id !== id);
    const site = closestSite(c, sites.filter(nerveZone), used, {x : from.x + dx, y : from.y + dy},
                             null, 'brain');
    if (!site || pointDistance(site, {x : from.x + dx, y : from.y + dy}, NERVE_ROLE) > snapDistance)
      return null;
    draft = moveCenter(draft, id, site.id, sites);
    if (!draft)
      return null;
  }
  return draft;
}
export function mirrorAssembly(doc, assemblyId, sites) {
  const assembly = findAssembly(doc, assemblyId);
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
    for (const center of organ.centers)
      mapping.set(center.id, matchingNode(organ, mirrored, center.id));
    organIds.push(mirrored.id);
    centerIds.push(...mirrored.centers.map(c => c.id));
  }
  for (const id of assemblyCenters(doc, assembly)
           .filter(id => findCenter(doc, id)?.organ.type === 'brain')) {
    const center = findCenter(doc, id).center, own = findSite(sites, center.site);
    if (onMidline(own)) {
      mapping.set(id, id);
      continue;
    }
    const site = mirroredSite(own, sites);
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
    const added = addWire(draft, mapping.get(wire.from), mapping.get(wire.to), null, sites);
    if (added)
      draft = updateWire(added.document, added.wireId, wire);
  }
  const grown = assemble(draft, [...assembly.organIds, ...organIds ], assembly.name,
                         [...(assembly.centerIds ?? []), ...centerIds ]);
  const joined = grown.assemblies.pop();
  Object.assign(findAssembly(grown, assemblyId), {...joined, id : assemblyId});
  return {document : grown, assemblyId};
}
export function renameAssembly(doc, assemblyId, name) {
  const draft = copy(doc), assembly = findAssembly(draft, assemblyId);
  if (!assembly || !name)
    return null;
  assembly.name = String(name).slice(0, ATELIER_LIMITS.max_name);
  return draft;
}
export function removeAssembly(doc, assemblyId) {
  const assembly = findAssembly(doc, assemblyId);
  if (!assembly)
    return null;
  let draft = copy(doc);
  for (const id of assemblyCenters(doc, assembly))
    draft = removeCenter(draft, id) ?? draft;
  draft.assemblies = draft.assemblies.filter(a => a.id !== assemblyId);
  return draft;
}
function storedOrgans(module, sites) {
  if (!module || !Array.isArray(module.organs) || !Array.isArray(module.wires))
    return null;
  const organs = module.organs.filter(o => o.centers?.length);
  const known = organs.every(o => ORGAN_BY_KEY[o.type] &&
                                  o.centers.every(c => sites.some(s => s.id === c.site)));
  return organs.length && known ? organs : null;
}
function placeStoredNeurons(draft, original, sites, offset, snapDistance, mapping) {
  const ids = [];
  for (const previous of original.centers) {
    const at = offset(sitePoint(findSite(sites, previous.site), NERVE_ROLE));
    const placed = addNeuron(draft, previous.key, sites, at, snapDistance);
    if (!placed)
      return null;
    draft = placed.document;
    const fresh = findCenter(draft, placed.centerId).center;
    Object.assign(fresh, copy(previous), {id : placed.centerId, site : fresh.site});
    mapping.set(previous.id, fresh.id);
    ids.push(fresh.id);
  }
  return {draft, ids};
}
function placeStoredOrgan(doc, draft, original, sites, offset, snapDistance) {
  const at = offset(sitePoint(findSite(sites, original.centers[0].site), siteRole(original.type)));
  const added = addOrgan(draft, original.type, sites, at, snapDistance, false);
  if (!added || doc.organs.some(o => o.id === added.organId))
    return null;
  draft = added.document;
  const fresh = findOrgan(draft, added.organId);
  const keep = (c, previous) => {
    if (previous)
      Object.assign(c, copy(previous), {id : c.id, site : c.site});
  };
  if (original.field) {
    fresh.field = copy(original.field);
    fresh.centers =
        original.centers.map(c => ({...copy(c), id : fresh.id + c.id.slice(original.id.length)}));
    if (!regenerateFields(draft, sites))
      return null;
  } else if (original.region) {
    fresh.region = {...copy(original.region), site : fresh.region.site};
    draft = settleRegions(draft, sites);
    for (const c of findOrgan(draft, fresh.id).centers)
      keep(c, original.centers.find(p => p.node === c.node));
  } else
    for (const c of fresh.centers)
      keep(c, original.centers.find(p => p.key === c.key));
  return {draft, organ : findOrgan(draft, fresh.id)};
}
export function placeStoredModule(doc, module, sites, position, snapDistance = Infinity) {
  const originals = storedOrgans(module, sites);
  if (!originals)
    return null;
  const source =
      centroid(originals.map(o => sitePoint(findSite(sites, o.centers[0].site), siteRole(o.type))));
  const bothSides = originals.some(o => originals.some(other => other.id === o.pair));
  const offset = p =>
      ({x : p.x + position.x - source.x, y : bothSides ? p.y : p.y + position.y - source.y});
  let draft = copy(doc);
  const mapping = new Map(), organIds = [], centerIds = [];
  for (const original of originals) {
    if (original.type === 'brain') {
      const placed = placeStoredNeurons(draft, original, sites, offset, snapDistance, mapping);
      if (!placed)
        return null;
      draft = placed.draft;
      centerIds.push(...placed.ids);
      organIds.push('brain');
      continue;
    }
    const placed = placeStoredOrgan(doc, draft, original, sites, offset, snapDistance);
    if (!placed)
      return null;
    draft = placed.draft;
    for (const center of original.centers)
      mapping.set(center.id, matchingNode(original, placed.organ, center.id));
    mapping.set(original.id, placed.organ.id);
    organIds.push(placed.organ.id);
    centerIds.push(...placed.organ.centers.map(c => c.id));
  }
  for (const original of originals) {
    const fresh = findOrgan(draft, mapping.get(original.id));
    if (!fresh)
      continue;
    fresh.pair = mapping.get(original.pair) ?? null;
    fresh.linked = !!fresh.pair && original.linked;
  }
  for (const wire of module.wires) {
    const added = addWire(draft, mapping.get(wire.from), mapping.get(wire.to), null, sites);
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
  const organIds = [], centerByOrgan = [];
  for (const [i, kind] of module.organs.entries()) {
    const created = addOrgan(draft, kind, sites, position, i === 0 ? snapDistance : Infinity, true,
                             kind === 'muscle' ? module.muscleFunction : null);
    if (!created)
      return null;
    draft = created.document;
    organIds.push(created.organId);
    centerByOrgan.push(created.centerIds);
  }
  for (const [from, to, pairing] of module.connections) {
    const result = addWire(draft, organIds[from], organIds[to], pairing, sites);
    if (result)
      draft = result.document;
  }
  const assembly = assemble(draft, organIds, moduleKey, centerByOrgan.flat());
  if (!assembly)
    return null;
  const placed = {document : assembly, assemblyId : assembly.assemblies.at(-1).id};
  return oneSided(assembly, sites, assembly.assemblies.at(-1))
             ? mirrorAssembly(assembly, placed.assemblyId, sites) ?? placed
             : placed;
}
