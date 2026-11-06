import {clamp} from '../../units.js';
import {binSites, fieldRecipe, generateRetina, HALF_VIEW, retinalBins} from './retina.js';
import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, TUNING} from '../../schema.js';
import {planOfUnit, scentAffinities, scentTuning, unitOfPlan} from '../../tuning.js';
import {nextPigment} from './pigment.js';
import {
  defaultPairing,
  eligible,
  fitsOrgan,
  functionFor,
  isRegion,
  MODULES,
  MUSCLE_TRAITS,
  NEURON_BY_KEY,
  ORGAN_BY_KEY,
  PAIRINGS,
  ROLE
} from './organs.js';
import {centroid, findSite, nerveZone, onMidline, pointDistance, sitePoint} from './layout.js';
import {initialRegion, routedLinks, settleRegions} from './regions.js';

let serial = 0;
const NEW_DOCUMENT = 'v019-fish-atelier';
export const identifier = (kind = 'part') =>
    `${kind}-${Date.now().toString(36)}-${(++serial).toString(36)}`;
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
export const compilerOptions = doc =>
    ({capacityTolerance : 0, traitTolerance : 0, extraCells : 0, reserve : 64, ...doc.compiler});
export function newDocument(name = '') {
  return {
    format : NEW_DOCUMENT,
    name,
    organs : [ {id : 'brain', type : 'brain', centers : []} ],
    wires : [],
    assemblies : [],
    substances : [],
    compiler : compilerOptions({}),
    growth : neutralReceptor()
  };
}
export function validateDocument(doc) {
  if (!doc || doc.format !== NEW_DOCUMENT || !Array.isArray(doc.organs) ||
      !Array.isArray(doc.wires) || !Array.isArray(doc.assemblies) ||
      !Array.isArray(doc.substances) || !doc.growth ||
      Object.keys(neutralReceptor()).some(key => !Number.isFinite(doc.growth[key])))
    throw new Error('studio.errors.invalidDocument');
  const c = compilerOptions(doc);
  if (!c || !Number.isFinite(c.capacityTolerance) || c.capacityTolerance < 0 ||
      c.capacityTolerance > .5 || !Number.isFinite(c.traitTolerance) || c.traitTolerance < 0 ||
      c.traitTolerance > .5 || !Number.isInteger(c.extraCells) || c.extraCells < 0 ||
      c.extraCells > 64 || !Number.isInteger(c.reserve) || c.reserve < 0 || c.reserve > 256)
    throw new Error('studio.errors.invalidDocument');
  const ids = new Set(), sites = new Set();
  for (const organ of doc.organs) {
    if (!ORGAN_BY_KEY[organ.type] || ids.has(organ.id))
      throw new Error('studio.errors.invalidDocument');
    ids.add(organ.id);
    if ([ 'eye', 'proximity' ].includes(organ.type)) {
      const f = organ.field;
      if (!f || ![f.lo, f.hi, f.density, f.resolution].every(Number.isFinite) || f.lo < 0 ||
          f.hi > HALF_VIEW || f.lo >= f.hi || f.density < 1 ||
          f.density > ATELIER_LIMITS.max_copies || !Array.isArray(f.profiles) ||
          !f.profiles.length ||
          !f.profiles.every(p => typeof p.id === 'string' &&
                                 [ p.q1, p.q2, p.qwidth, p.threshold ].every(Number.isFinite)))
        throw new Error('studio.errors.invalidDocument');
    }
    if (organ.pair && doc.organs.find(o => o.id === organ.pair)?.pair !== organ.id)
      throw new Error('studio.errors.invalidDocument');
    // A brain region carries its settings, each a whole number in its range, and its home site.
    if (isRegion(organ)) {
      const r = organ.region, settings = ORGAN_BY_KEY[organ.type].settings;
      if (!r || ![0, 1].includes(r.follow) || !Number.isInteger(r.site) ||
          (r.cut !== undefined &&
           !(Array.isArray(r.cut) && r.cut.every(key => typeof key === 'string'))) ||
          Object.entries(settings).some(([ key, s ]) => !Number.isInteger(r[key]) ||
                                                        r[key] < s.least || r[key] > s.most))
        throw new Error('studio.errors.invalidDocument');
    }
    for (const center of organ.centers) {
      if (ids.has(center.id) || !Number.isInteger(center.site) || sites.has(center.site) ||
          (center.profile !== undefined && typeof center.profile !== 'string'))
        throw new Error('studio.errors.invalidDocument');
      ids.add(center.id);
      sites.add(center.site);
    }
  }
  if (!doc.organs.some(o => o.id === 'brain' && o.type === 'brain'))
    throw new Error('studio.errors.invalidDocument');
  for (const wire of doc.wires) {
    if (!ids.has(wire.from) || !ids.has(wire.to) ||
        (wire.pairing != null && !PAIRINGS.includes(wire.pairing)))
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
// A substance teaches a nerve center when it binds its learning rate, its eligibility trace or
// its excitation: excitation is the teaching signal of learning cells, so a gland releasing it
// rewards or punishes what they learn.
const TEACHING_EFFECTS = Object.freeze(
    [ HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility, HORMONE_EFFECT.excitation ]);
export const learners = (doc, index, wheel) => allCenters(doc).filter(
    c => c.role === 'nerve' &&
         boundEffects(c, index, wheel).some(effect => TEACHING_EFFECTS.includes(effect)));
// The substances a nerve center learns from, each with the glands releasing it.
export function teachersOf(doc, center, wheel) {
  return doc.substances
      .filter(sub => boundEffects(center, sub.index, wheel)
                         .some(effect => TEACHING_EFFECTS.includes(effect)))
      .map(sub => ({substance : sub, glands : producers(doc, sub.index, wheel)}));
}
export const receivers = (doc, index, wheel) =>
    allCenters(doc).filter(c => boundEffects(c, index, wheel).length);
// Whether the body's growth receptor binds the substance at `index`.
export const growsWith = (doc, index, wheel) =>
    doc.growth.active && receptorAffinity(wheel, doc.growth, index) >= NOTICEABLE_AFFINITY;
export const allCenters = doc =>
    doc.organs.flatMap(organ => organ.centers.map(
                           center => ({...center, organId : organ.id, organType : organ.type})));
// A bundle of developed contacts as the engine reports it (werkzeug/atelier.cc): the groups it
// leads from and to, how many contacts it has and their mean weight, how many of them excite and
// inhibit and with what mean weight.
export const contactBundle =
    ([ from, to, count, weight, positive, negative, positiveWeight, negativeWeight ]) =>
        ({from, to, count, weight, positive, negative, positiveWeight, negativeWeight});
// The sites the design's centers hold, of those `holds` keeps.
export const usedSites = (doc, holds = () => true) =>
    new Set(allCenters(doc).filter(holds).map(c => c.site));
export const findOrgan = (doc, id) => doc.organs.find(o => o.id === id) ?? null;
export const findAssembly = (doc, id) => doc.assemblies.find(a => a.id === id) ?? null;
// A center's place among all the design's centers (-1 for none): its group's in the compiled
// plan, so in every per-group list of the design view's and the developed fish's reports.
export function centerIndex(doc, id) {
  let index = 0;
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      if (center.id === id)
        return index;
      ++index;
    }
  return -1;
}
// The place of an organ's first cells of a colour type, as centerIndex.
export function profileIndex(doc, organId, profileId) {
  const organ = findOrgan(doc, organId);
  const center = organ?.centers.find(c => c.profile === profileId);
  return center ? centerIndex(doc, center.id) : -1;
}
// What a report (the design view's `anatomy` or the developed fish's `report`) says of a
// center's group under `key`; null where it says nothing.
export const groupReport = (doc, report, key, id) => report?.[key]?.[centerIndex(doc, id)] ?? null;
function matchingOrgan(doc, type, side, sites) {
  const scope = ORGAN_BY_KEY[type]?.scope;
  if (scope === 'single')
    return doc.organs.find(organ => organ.type === type) ?? null;
  if (scope !== 'side')
    return null;
  return doc.organs.find(
             organ => organ.type === type &&
                      organ.centers.some(center => findSite(sites, center.site)?.side === side)) ??
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
// The organ an endpoint belongs to: the organ itself, or the one whose node it is.
export const organOf = (doc, id) => findOrgan(doc, id) ?? findCenter(doc, id)?.organ ?? null;
// Whether an organ is chosen: itself or one of its nodes.
export const isChosen = (selected, organ) =>
    !!organ && (selected?.id === organ.id || organ.centers.some(c => c.id === selected?.id));

// A new center answers above SENSE_THRESHOLD (a nerve center at 0), with a middling time
// constant TAU, field FIELD and quality width QWIDTH unless its kind gives one.
const NEW_CENTER = Object.freeze({sense_threshold : -.6, tau : .5, field : .3, qwidth : .35});
export function defaults(desc, site, effects = ATELIER_LIMITS.receptors) {
  const nerve = desc.role === 'nerve', N = NEW_CENTER;
  return {
    id : identifier('center'),
    key : desc.key,
    role : desc.role,
    functionCode : desc.functionCode,
    surface : desc.surface,
    site : site.id,
    copies : desc.copies,
    threshold : nerve ? 0 : N.sense_threshold,
    tau : N.tau,
    field : N.field,
    q1 : 0,
    q2 : 0,
    qwidth : desc.qwidth ?? N.qwidth,
    sign : desc.sign ?? 1,
    mode : desc.mode ?? 0,
    pace : desc.pace ?? -1,
    modulator : desc.modulator ?? -1,
    crossing : 0,
    range : 1,
    receptors : Array.from({length : effects}, (_, effect) => neutralReceptor(effect))
  };
}
function candidates(desc, sites, used, position, requiredSide = null, organType = '') {
  return sites
      .filter(site => !used.has(site.id) &&
                      (ORGAN_BY_KEY[organType] ? fitsOrgan(organType, desc, site)
                                               : eligible(desc, site)) &&
                      (requiredSide === null || site.side === requiredSide))
      .map(site => ({site, distance : pointDistance(site, position, organType)}))
      .sort((a, b) => a.distance - b.distance);
}
export function closestSite(desc, sites, used, position, side = null, organType = '') {
  return candidates(desc, sites, used, position, side, organType)[0]?.site ?? null;
}
// The free site nearest to `position` where a center does the work `code` (functionFor) asks.
export function closestSiteDoing(desc, code, sites, used, position, side = null, organType = '') {
  return candidates(desc, sites, used, position, side, organType)
             .map(c => c.site)
             .find(s => functionFor(desc, s) === code) ??
         null;
}
// Allocate the fixed head lattice jointly: each organ receives coverage before extra colour
// types fill remaining sites. Adding the near sense therefore also works after a dense retina.
function regenerateFields(draft, sites) {
  const fields = draft.organs.filter(o => o.field);
  const used = usedSites(draft, c => !fields.some(o => o.id === c.organId));
  const bins = retinalBins(sites);
  for (let i = 0; i < fields.length; i++) {
    const organ = fields[i], reserved = new Set(used);
    for (const other of fields.slice(i + 1)) {
      for (const bin of bins.filter(b => b.hi > other.field.lo && b.lo < other.field.hi)) {
        const available = binSites(sites, other.side, bin).filter(s => !reserved.has(s.id));
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
  settleAssemblies(draft);
  pruneWires(draft);
  return true;
}
export function addOrgan(doc, type, sites, position, snapDistance = Infinity, paired = true) {
  const definition = ORGAN_BY_KEY[type];
  if (!definition || definition.fixed)
    return null;
  const draft = copy(doc), used = usedSites(draft);
  if (paired && definition.scope !== 'single')
    for (const occupied of [...used]) {
      const mirror = mirroredSite(findSite(sites, occupied), sites);
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
  // A brain region placed alone on a midline place lies on the midline, serving both sides.
  const middle = isRegion({type}) && !paired && onMidline(first);
  const organ = {
    id : identifier('organ'),
    type,
    side : middle ? 0 : first.side,
    centers : [],
    pair : null,
    linked : false
  };
  if (type === 'eye' || type === 'proximity') {
    organ.field = fieldRecipe(first, identifier('profile'));
    if (type === 'proximity')
      organ.field.profiles[0].qwidth = NEW_CENTER.qwidth;
  } else if (definition.settings) {
    // A region with a plan grows its nodes from its plan, around where it was placed.
    organ.region = initialRegion(type, first);
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
  let result = settleRegions(draft, sites);
  if (organ.region && !findOrgan(result, organ.id).centers.length)
    return null;
  if (paired && definition.scope !== 'single') {
    const mirrored = mirrorOrgan(result, organ.id, sites);
    if (!mirrored)
      return null;
    result = settleRegions(mirrored.document, sites);
  }
  const placed = findOrgan(result, organ.id);
  return {
    document : result,
    organId : organ.id,
    centerId : placed.centers[0].id,
    centerIds : placed.centers.map(c => c.id)
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
    target.field.density = clamp(Math.round(target.field.density), 1, ATELIER_LIMITS.max_copies);
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
// A single nerve center has NEURON_COPIES cells.
const NEURON_COPIES = 4;
export function addNeuron(doc, preset, sites, position, snapDistance = Infinity) {
  const properties = NEURON_BY_KEY[preset];
  if (!properties)
    return null;
  const used = usedSites(doc);
  const desc =
      {key : preset, role : 'nerve', functionCode : -1, copies : NEURON_COPIES, surface : 'any'};
  const site = closestSite(desc, sites.filter(nerveZone), used, position, null, 'brain');
  if (!site || pointDistance(site, position, 'brain') > snapDistance)
    return null;
  const draft = copy(doc);
  const center = {...defaults(desc, site), ...properties};
  draft.organs.find(o => o.id === 'brain').centers.push(center);
  return {document : draft, centerId : center.id, organId : 'brain'};
}
export function moveCenter(doc, centerId, target, sites) {
  const result = findCenter(doc, centerId);
  const site = findSite(sites, target);
  if (!result || result.organ.type !== 'brain' || !site || !eligible(result.center, site))
    return null;
  if (allCenters(doc).some(c => c.id !== centerId && c.site === site.id))
    return null;
  const draft = copy(doc);
  findCenter(draft, centerId).center.site = site.id;
  return draft;
}
// A nerve center of the brain moved to the left side (-1), the midline (0) or the right side
// (1): to the free site there nearest to it, in its zone when there is one.
export function moveCenterToSide(doc, centerId, side, sites) {
  const found = findCenter(doc, centerId), here = findSite(sites, found?.center.site);
  if (!here || found.organ.type !== 'brain')
    return null;
  const used = usedSites(doc);
  const fits = s => !used.has(s.id) && eligible(found.center, s) &&
                    (side === 0 ? onMidline(s) : s.side === side && !onMidline(s));
  const candidates = sites.filter(fits);
  const near = candidates.filter(s => s.zone === here.zone);
  const target =
      (near.length ? near : candidates)
          .sort((a, b) => pointDistance(a, sitePoint(here)) - pointDistance(b, sitePoint(here)))[0];
  return target ? moveCenter(doc, centerId, target.id, sites) : null;
}
// A field organ dragged turns its field by FIELD_SHIFT degrees per frame unit along and out.
const FIELD_SHIFT = .25;
export function moveOrgan(doc, organId, sites, position, snapDistance = Infinity,
                          pointerOrigin = null) {
  const original = findOrgan(doc, organId);
  if (!original || original.type === 'brain' || !original.centers.length)
    return null;
  if (original.field) {
    const anchor = pointerOrigin ?? sitePoint(findSite(sites, original.centers[0].site));
    const dx = position.x - anchor.x, dy = (position.y - anchor.y) * original.side;
    const requested = (dx + dy) * FIELD_SHIFT;
    const delta = clamp(requested, -original.field.lo, HALF_VIEW - original.field.hi);
    return updateField(doc, organId,
                       {lo : original.field.lo + delta, hi : original.field.hi + delta}, sites);
  }
  const draft = copy(doc), organ = findOrgan(draft, organId);
  const used = usedSites(draft, c => c.organId !== organId);
  const currentSites = original.centers.map(center => findSite(sites, center.site));
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
    // A muscle's further nodes keep the function of its first one.
    const site = index === 0 ? first
                             : closestSiteDoing(center, functionFor(center, first), sites, used,
                                                wanted, old.side * sideFlip, organ.type);
    if (!site || pointDistance(site, wanted, organ.type) > snapDistance)
      return null;
    center.site = site.id;
    used.add(site.id);
  }
  organ.side = first.side;
  // A region grows new nodes around where it now is.
  if (organ.region)
    organ.region.site = first.id;
  if (original.linked && original.pair) {
    const other = findOrgan(draft, original.pair);
    const from = sitePoint(findSite(sites, other.centers[0].site), other.type);
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
// The nodes of an organ that recruits them (ORGANS' `nodes`): the places its cells take, all
// with the function and on the side of its first one. Each node is a cell of the engine's fin,
// mouth, spines or colour, so more of them make a fin grow as the Aquarium draws it or colour
// the fish more deeply. New nodes take the free places nearest to the organ with its settings
// (on the twin of a linked pair the mirrored places); the last ones go first. In an organ with
// types, `typeId` names the type whose nodes these are; all types together have `nodes` at most.
export function setOrganNodes(doc, organId, count, sites, typeId = null) {
  const original = findOrgan(doc, organId), most = ORGAN_BY_KEY[original?.type]?.nodes;
  const ofType = c => typeId === null || typeOf(c) === typeId;
  const others = original ? original.centers.filter(c => !ofType(c)).length : 0;
  if (!most || !original.centers.some(ofType) || others >= most)
    return null;
  const wanted = clamp(Math.round(count), 1, most - others), draft = copy(doc);
  const main = findOrgan(draft, organId);
  const twin = main.linked ? findOrgan(draft, main.pair) : null;
  for (const organ of [main, twin].filter(Boolean)) {
    const dropped = new Set(organ.centers.filter(ofType).slice(wanted).map(c => c.id));
    organ.centers = organ.centers.filter(c => !dropped.has(c.id));
    draft.wires = draft.wires.filter(w => !dropped.has(w.from) && !dropped.has(w.to));
    const own = organ.centers.filter(ofType);
    const first = own[0], home = findSite(sites, first.site);
    if (!home)
      return null;
    const code = functionFor(first, home);
    while (own.length < wanted) {
      const used = usedSites(draft);
      const partner = organ === twin ? main.centers.filter(ofType)[own.length] : null;
      const mirror = partner ? mirroredSite(findSite(sites, partner.site), sites) : null;
      const at = own.map(c => sitePoint(findSite(sites, c.site), organ.type));
      const middle = centroid(at);
      const site = mirror && !used.has(mirror.id)
                       ? mirror
                       : closestSiteDoing(first, code, sites, used, middle, home.side, organ.type);
      if (!site)
        return null;
      const node = {...copy(first), id : identifier('center'), site : site.id};
      own.push(node);
      organ.centers.push(node);
    }
  }
  settleAssemblies(draft);
  return draft;
}
// The muscle nodes of a function (null for none), as the engine sees them.
const musclesOf = (doc, code, sites) =>
    doc.organs.filter(o => o.type === 'muscle').flatMap(o => o.centers).filter(c => {
      const site = findSite(sites, c.site);
      return site && functionFor(c, site) === code;
    });
// A trait of the fish its muscles of a function shape (MUSCLE_TRAITS), as the engine's body plan
// takes it: the mean over them, weighted by their strength; null without such muscles.
export function muscleTrait(doc, code, key, sites) {
  const quality = Object.keys(MUSCLE_TRAITS[code] ?? {}).find(q => MUSCLE_TRAITS[code][q] === key);
  const muscles = quality ? musclesOf(doc, code, sites) : [];
  const weight = muscles.reduce((sum, c) => sum + c.copies, 0);
  return weight ? muscles.reduce((sum, c) => sum + c.copies * unitOfPlan(c[quality]), 0) / weight
                : null;
}
// The trait set for the whole fish: the quality behind it on all its muscles of that function.
export function setMuscleTrait(doc, code, key, trait, sites) {
  const quality = Object.keys(MUSCLE_TRAITS[code] ?? {}).find(q => MUSCLE_TRAITS[code][q] === key);
  if (!quality || !musclesOf(doc, code, sites).length)
    return null;
  const draft = copy(doc);
  for (const center of musclesOf(draft, code, sites))
    center[quality] = planOfUnit(trait);
  return draft;
}
// A node of an organ moved to another free site its organ allows.
export function placeNode(doc, centerId, siteId, sites) {
  const found = findCenter(doc, centerId), site = findSite(sites, siteId);
  if (!found || !site || !fitsOrgan(found.organ.type, found.center, site) ||
      allCenters(doc).some(c => c.site === siteId))
    return null;
  const draft = copy(doc);
  findCenter(draft, centerId).center.site = siteId;
  return draft;
}
// Free sites for a node, nearest first to another node of its organ (`near`): by the engine's
// layout across (w), up and down (v) and along (zone and u), on its side.
// How far sites lie from a node: along the body (zones and u), across (v), out (w, weighing
// DEPTH_WEIGHT times less) and OTHER_SIDE more on the other side.
const NEAR_SITE = Object.freeze({depth_weight : 4, other_side : 1});
export function nodeSitesNear(doc, centerId, nearId, sites) {
  const found = findCenter(doc, centerId), near = findCenter(doc, nearId);
  const at = findSite(sites, near?.center.site);
  if (!found || !at)
    return [];
  const used = usedSites(doc);
  const distance = s => (s.zone - at.zone + at.u - s.u) ** 2 +
                        (s.w - at.w) ** 2 / NEAR_SITE.depth_weight + (s.v - at.v) ** 2 +
                        (s.side === at.side ? 0 : NEAR_SITE.other_side);
  return sites.filter(s => !used.has(s.id) && fitsOrgan(found.organ.type, found.center, s))
      .sort((a, b) => distance(a) - distance(b));
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
  // In an organ with types a type's own centers share their settings, in others all of a kind.
  const same = ORGAN_BY_KEY[found.organ.type]?.types ? c => typeOf(c) === typeOf(found.center)
                                                     : c => c.key === found.center.key;
  return organs.filter(Boolean).flatMap(o => o.centers.filter(same));
}
// Organs with types (ORGANS' `types`: a nose's scent profiles, the skin's kinds of pigment cell):
// a type is the centers of the organ sharing a `profile`, those without one the first; in the
// order they first appear. The twin of a linked pair has the same types.
const typeOf = center => center.profile ?? '';
export function organTypes(organ) {
  const types = new Map();
  for (const center of organ?.centers ?? []) {
    if (!types.has(typeOf(center)))
      types.set(typeOf(center), []);
    types.get(typeOf(center)).push(center);
  }
  return [...types ].map(([ id, centers ]) => ({id, centers}));
}
export const typeOfCenter = (organ, centerId) =>
    organTypes(organ).find(type => type.centers.some(c => c.id === centerId)) ?? null;
// The tuning a new type starts with: a nose's profile tuned to the scent its profiles smell least,
// as broad as its first; a kind of pigment cell with the first of the pigments it lacks.
export function nextTypeTuning(organ) {
  const firsts = organTypes(organ).map(type => type.centers[0]);
  if (organ.type === 'pigment')
    return nextPigment(firsts);
  const smelled = TUNING.scent_latitudes.map(
      (_, k) => Math.max(...firsts.map(c => scentAffinities(c.q1, c.q2, c.qwidth)[k])));
  return {...scentTuning(smelled.indexOf(Math.min(...smelled))), qwidth : firsts[0].qwidth};
}
// A new type: one center with the settings of the organ's first and `tuning` on top, at the free
// place nearest to the organ that does the same work (on the twin the mirrored place); the
// document and the type's id, or null where the organ has all its types or no place is free.
export function addOrganType(doc, organId, sites, tuning = {}) {
  const original = findOrgan(doc, organId), most = ORGAN_BY_KEY[original?.type]?.types;
  if (!most || !original.centers.length || organTypes(original).length >= most)
    return null;
  const draft = copy(doc), main = findOrgan(draft, organId), id = identifier('profile');
  const twin = main.linked ? findOrgan(draft, main.pair) : null;
  for (const organ of [main, twin].filter(Boolean)) {
    const first = organ.centers[0], home = findSite(sites, first.site);
    if (!home)
      return null;
    const used = usedSites(draft);
    const partner = organ === twin ? main.centers.at(-1) : null;
    const mirror = partner ? mirroredSite(findSite(sites, partner.site), sites) : null;
    const site = mirror && !used.has(mirror.id)
                     ? mirror
                     : closestSiteDoing(first, functionFor(first, home), sites, used,
                                        sitePoint(home, organ.type), home.side, organ.type);
    if (!site)
      return null;
    organ.centers.push(
        {...copy(first), ...tuning, id : identifier('center'), site : site.id, profile : id});
  }
  settleAssemblies(draft);
  return {document : draft, typeId : id};
}
// The organ without a type (and its twin without it); null for its last.
export function removeOrganType(doc, organId, typeId) {
  const original = findOrgan(doc, organId);
  if (!original || organTypes(original).length < 2)
    return null;
  const draft = copy(doc), main = findOrgan(draft, organId);
  const twin = main.linked ? findOrgan(draft, main.pair) : null;
  const dropped = new Set();
  for (const organ of [main, twin].filter(Boolean)) {
    for (const c of organ.centers)
      if (typeOf(c) === typeId)
        dropped.add(c.id);
    organ.centers = organ.centers.filter(c => !dropped.has(c.id));
  }
  draft.wires = draft.wires.filter(w => !dropped.has(w.from) && !dropped.has(w.to));
  settleAssemblies(draft);
  return draft;
}
export function updateCenter(doc, id, patch) {
  const found = findCenter(doc, id);
  if (!found)
    return null;
  const draft = copy(doc);
  const keys = [
    'copies', 'threshold', 'tau', 'field', 'q1', 'q2', 'qwidth', 'crossing', 'range', 'sign',
    'mode', 'pace', 'modulator'
  ];
  for (const c of tissueTargets(draft, id)) {
    for (const key of keys)
      if (Number.isFinite(patch[key])) {
        const paired = findCenter(draft, c.id).organ.id !== found.organ.id;
        const value = paired ? c[key] + patch[key] - found.center[key] : patch[key];
        c[key] =
            key === 'copies'
                ? clamp(Math.round(value), 1, ATELIER_LIMITS.max_copies)
                : clamp(value, [ 'tau', 'field', 'qwidth', 'range' ].includes(key) ? 0 : -1, 1);
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
// A new growth receptor lets the body grow at full pace once even a little of its hormone is
// present.
export const GROWTH_START = Object.freeze({sensitivity : 1, half : .01});
// A receptor switched on or off. One switched on that answered nothing yet answers with
// RECEPTOR_ONSET: an output receptor rests at full output, so its substance lowers it; the others
// it raises.
const RECEPTOR_ONSET = 1;
export function switchReceptor(doc, id, effect, on) {
  const receptor = findCenter(doc, id)?.center.receptors[effect];
  const patch = {active : on ? 1 : 0};
  if (on && !receptor?.sensitivity)
    patch.sensitivity = receptor?.baseline > 0 ? -RECEPTOR_ONSET : RECEPTOR_ONSET;
  return updateReceptor(doc, id, effect, patch);
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
// A substance's name is at most SUBSTANCE_NAME_LENGTH long.
export const SUBSTANCE_NAME_LENGTH = 32;
export function setSubstance(doc, index, name) {
  const draft = copy(doc), entry = draft.substances.find(s => s.index === index);
  if (!entry)
    return null;
  entry.name = String(name).slice(0, SUBSTANCE_NAME_LENGTH);
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
  // An organ as a whole sends from its nodes that send and is heard by those that hear; a sense
  // does not drive an effector without a nerve center between them.
  const a = senderNodes(doc, from), b = hearerNodes(doc, to);
  if (!a.length || !b.length || from === to ||
      (a.every(c => c.role === 'sensor') && b.every(c => c.role === 'motor')))
    return null;
  const source = organOf(doc, from), target = organOf(doc, to);
  // A wire between twins joins the sides as drawn; others between paired ends take the side
  // guidance their organs prefer.
  const twins = pairEndpoint(doc, from) === to;
  const pairing = !twins && pairEndpoint(doc, from) && pairEndpoint(doc, to)
                      ? defaultPairing(source.type, target.type)
                      : null;
  const wire = {id : identifier('wire'), from, to, spread : WIRE_SPREAD, pairing};
  // A connection covers another that it makes or that its ends' whole organs make: a node's wire
  // to what its organ already reaches adds nothing and is none; a new wire takes the place of the
  // wires it covers whole.
  const covers = (a, b) => (a.from === b.from || a.from === wholeEndpoint(doc, b.from)) &&
                           (a.to === b.to || a.to === wholeEndpoint(doc, b.to));
  const made = expandedWires(doc), links = wireLinks(doc, wire);
  if (links.every(link => made.some(old => covers(old, link))))
    return null;
  const draft = copy(doc);
  draft.wires = draft.wires.filter(
      old => !wireLinks(doc, old).every(link => links.some(added => covers(added, link))));
  draft.wires.push(wire);
  return {document : draft, wireId : wire.id};
}
// What a wire attaches to: a sense or effector organ as a whole or one of its nodes (a retinal
// node, say), a single nerve center of the brain or of a brain region. A new wire reaches exactly
// what it joins; its spread widens that.
const WIRE_SPREAD = 0;
const ownEndpoints = organ => organ.type === 'brain' || isRegion(organ);
const isNode = (doc, id) => {
  const found = findCenter(doc, id);
  return !!found && !ownEndpoints(found.organ);
};
// The organ an endpoint belongs to as a whole: a node of an organ stands for its organ.
export const wholeEndpoint = (doc, id) => isNode(doc, id) ? findCenter(doc, id).organ.id : id;
// Wires whose ends are gone, as when an eye's nodes are regenerated, go with them.
function pruneWires(draft) {
  const ids = new Set([...draft.organs.map(o => o.id), ...allCenters(draft).map(c => c.id) ]);
  draft.wires = draft.wires.filter(w => ids.has(w.from) && ids.has(w.to));
}
// The node of `fresh` standing where `centerId` stands in `original`, a twin or a copy: a field
// organ's node by its colour type and bin, another organ's by its place among the organ's nodes.
// Null when `fresh` has none there.
function matchingNode(original, fresh, centerId) {
  const id = original.field || original.region
                 ? fresh.id + centerId.slice(original.id.length)
                 : fresh.centers[original.centers.findIndex(c => c.id === centerId)]?.id;
  return fresh.centers.some(c => c.id === id) ? id : null;
}
// The same endpoint on the other side: a paired organ's twin, or the matching node or center of
// a paired organ's or region's twin. Null without one.
export function pairEndpoint(doc, id) {
  const organ = findOrgan(doc, id);
  if (organ)
    return organ.pair && findOrgan(doc, organ.pair) ? organ.pair : null;
  const found = findCenter(doc, id), twin = findOrgan(doc, found?.organ.pair);
  return twin ? matchingNode(found.organ, twin, id) : null;
}
// Every connection a wire makes: one, or for a wire between paired organs one on each side, both
// crossing the midline, or all four. The guidance holds for the body's sides, whichever twin the
// wire was drawn between.
const endpointSide = (doc, id) => organOf(doc, id).side < 0;
function wireLinks(doc, wire) {
  const from = pairEndpoint(doc, wire.from), to = pairEndpoint(doc, wire.to);
  if (!wire.pairing || !from || !to || from === wire.to)
    return [ {from : wire.from, to : wire.to} ];
  const flip = endpointSide(doc, wire.from) !== endpointSide(doc, wire.to);
  const [near, far] = flip ? [ to, wire.to ] : [ wire.to, to ];
  const same = [ {from : wire.from, to : near}, {from, to : far} ],
        crossed = [ {from : wire.from, to : far}, {from, to : near} ];
  return wire.pairing === 'same'      ? same
         : wire.pairing === 'crossed' ? crossed
                                      : [...same, ...crossed ];
}
export const expandedWires = doc =>
    doc.wires.flatMap(wire => wireLinks(doc, wire).map(link => ({...link, wire})));
export function endpointCenters(doc, id) {
  return findOrgan(doc, id)?.centers ?? (findCenter(doc, id) ? [ findCenter(doc, id).center ] : []);
}
// The center a chosen item stands for: a chosen center itself, a chosen organ's first.
export const chosenCenter = (doc, item) => ['center', 'organ'].includes(item?.kind)
                                               ? endpointCenters(doc, item.id)[0] ?? null
                                               : null;
// The nodes that send for an endpoint (not its effectors) and that hear a wire to it (not its
// senses; of an organ with an input slot naming a node, that node alone).
const senderNodes = (doc, id) => endpointCenters(doc, id).filter(c => c.role !== 'motor');
function hearerNodes(doc, id) {
  const organ = findOrgan(doc, id);
  const slot = organ && !ownEndpoints(organ)
                   ? ORGAN_BY_KEY[organ.type]?.slots?.find(s => s.dir === 'in' && s.node)
                   : null;
  return endpointCenters(doc, id).filter(c =>
                                             c.role !== 'sensor' && (!slot || c.key === slot.node));
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
    return assemblyCenters(doc, findAssembly(doc, item.id));
  return [];
}
// The endpoints of a choice: an organ chosen as a whole is one, and so is a brain region, which
// spreads its wires over its nodes by its plan; a node chosen is itself; a module stands for its
// organs and nerve centers.
function choiceEnds(doc, item) {
  const organ = item?.kind === 'organ' ? findOrgan(doc, item.id) : null;
  if (organ && organ.type !== 'brain')
    return [ organ.id ];
  return [...new Set(selectionCenters(doc, item).map(
      id => item.kind === 'center' ? id : wholeEndpoint(doc, id))) ];
}
export function connectSelections(doc, source, target) {
  const starts = choiceEnds(doc, source), ends = choiceEnds(doc, target);
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
  if (PAIRINGS.includes(patch.pairing) && wire.pairing)
    wire.pairing = patch.pairing;
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
  const used = usedSites(doc);
  const draft = copy(doc), organ = findOrgan(draft, organId);
  const mirror = {
    ...copy(organ),
    id : identifier('organ'),
    side : -organ.side,
    pair : organ.id,
    linked : true,
    centers : []
  };
  if (organ.region) {
    const home = mirroredSite(findSite(sites, organ.region.site), sites);
    if (!home)
      return null;
    mirror.region.site = home.id;
  }
  for (const c of organ.centers) {
    const site = mirroredSite(findSite(sites, c.site), sites);
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
// Each assembly takes the centers its organs have now.
export function settleAssemblies(doc) {
  for (const assembly of doc.assemblies)
    assembly.centerIds = assemblyCenters(doc, assembly);
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

// A module of the chosen parts: whole organs with all their nodes, single nodes with their organ.
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
// The parts of a module stay where they are, no longer grouped.
export function ungroupAssembly(doc, id) {
  const draft = copy(doc);
  draft.assemblies = draft.assemblies.filter(a => a.id !== id);
  return draft;
}
// A module with parts on one side only, which its mirror image would complete: an organ that
// comes in pairs but has lost its twin, or a nerve center of the brain off the midline.
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
    return ORGAN_BY_KEY[found.organ.type]?.scope === 'side' && !findOrgan(doc, found.organ.pair);
  });
}
// The modules an organ or a center is part of.
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
    return sitePoint(findSite(sites, c.center.site), c.organ.type);
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
    const from = sitePoint(findSite(sites, c.site), organ.type);
    draft = moveOrgan(draft, id, sites, {x : from.x + dx, y : from.y + dy}, snapDistance, from);
    if (!draft)
      return null;
    moved.add(id);
    if (organ.linked)
      moved.add(organ.pair);
  }
  for (const id of members.filter(id => findCenter(doc, id)?.organ.type === 'brain')) {
    const c = findCenter(draft, id).center, from = sitePoint(findSite(sites, c.site));
    const used = usedSites(draft, c => c.id !== id);
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
    // A center on the midline serves both sides already.
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
    const added = addWire(draft, mapping.get(wire.from), mapping.get(wire.to));
    if (added)
      draft = updateWire(added.document, added.wireId, wire);
  }
  // The mirror image joins the module, which then lies on both sides.
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
  const points = originals.map(o => sitePoint(findSite(sites, o.centers[0].site), o.type));
  const source = centroid(points);
  // A module with both sides of a pair keeps its sides where they are and moves along the body;
  // a one-sided one goes to the side it is dropped on.
  const bothSides = originals.some(o => originals.some(other => other.id === o.pair));
  const offset = p =>
      ({x : p.x + position.x - source.x, y : bothSides ? p.y : p.y + position.y - source.y});
  let draft = copy(doc);
  const mapping = new Map(), organIds = [], centerIds = [];
  for (const original of originals) {
    if (!ORGAN_BY_KEY[original.type])
      return null;
    if (original.type === 'brain') {
      for (const previous of original.centers) {
        const at = offset(sitePoint(findSite(sites, previous.site), 'brain'));
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
    const at = offset(sitePoint(findSite(sites, original.centers[0].site), original.type));
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
    } else if (original.region) {
      // A region grows its plan from the stored settings; its nodes take what was made of them.
      fresh.region = {...copy(original.region), site : fresh.region.site};
      draft = settleRegions(draft, sites);
      for (const c of findOrgan(draft, fresh.id).centers) {
        const previous = original.centers.find(p => p.node === c.node);
        if (previous)
          Object.assign(c, copy(previous), {id : c.id, site : c.site});
      }
    } else
      for (const c of fresh.centers) {
        const previous = original.centers.find(p => p.key === c.key);
        if (previous)
          Object.assign(c, copy(previous), {id : c.id, site : c.site});
      }
    const placed = findOrgan(draft, fresh.id);
    for (const center of original.centers)
      mapping.set(center.id, matchingNode(original, placed, center.id));
    mapping.set(original.id, placed.id);
    organIds.push(placed.id);
    centerIds.push(...placed.centers.map(c => c.id));
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
  const organIds = [], centerByOrgan = [];
  for (const [i, kind] of module.organs.entries()) {
    const muscleSite = kind === 'muscle'
                           ? closestSite(ORGAN_BY_KEY.muscle.centers[0],
                                         sites.filter(s => s.zone === module.muscleZone),
                                         usedSites(draft), position)
                           : null;
    if (kind === 'muscle' && !muscleSite)
      return null;
    const target = muscleSite ? sitePoint(muscleSite, kind) : position;
    const created = addOrgan(draft, kind, sites, target, i === 0 ? snapDistance : Infinity);
    if (!created)
      return null;
    draft = created.document;
    organIds.push(created.organId);
    centerByOrgan.push(created.centerIds);
  }
  for (const [from, to] of module.connections) {
    const result = addWire(draft, organIds[from], organIds[to]);
    if (result)
      draft = result.document;
  }
  const assembly = assemble(draft, organIds, moduleKey, centerByOrgan.flat());
  if (!assembly)
    return null;
  // A built-in module serves both sides at once: its one-sided part gets its mirror image.
  const placed = {document : assembly, assemblyId : assembly.assemblies.at(-1).id};
  return oneSided(assembly, sites, assembly.assemblies.at(-1))
             ? mirrorAssembly(assembly, placed.assemblyId, sites) ?? placed
             : placed;
}
// Which side a sender's contacts may reach: the side its wires lead to when they all lead to the
// same or all to the other side (1 across, -1 the same), else its own preference.
export const wiredCrossing = (doc, center, sites) =>
    senderCrossing(doc, {...center, crossing : null}, routedLinks(doc, sites), sidesOf(doc));
// The side of every organ and node of a design, by id.
function sidesOf(doc) {
  const sides = new Map();
  for (const organ of doc.organs) {
    sides.set(organ.id, organ.side ?? 0);
    for (const c of organ.centers)
      sides.set(c.id, organ.side ?? 0);
  }
  return sides;
}
function senderCrossing(doc, center, links, sides) {
  const own = sides.get(center.id) ?? 0, whole = wholeEndpoint(doc, center.id);
  const reached = links.filter(l => l.from === center.id || l.from === whole)
                      .map(l => sides.get(l.to) ?? 0)
                      .filter(side => side && own);
  if (reached.length && reached.every(side => side * own < 0))
    return 1;
  if (reached.length && reached.every(side => side * own > 0))
    return -1;
  return center.crossing;
}
export function compileDocument(doc, sites, effects = ATELIER_LIMITS.receptors) {
  validateDocument(doc);
  const groups = [], links = routedLinks(doc, sites), centers = allCenters(doc);
  const indices = new Map(centers.map((c, i) => [c.id, i]));
  const sides = sidesOf(doc);
  const connections = [];
  const bundles = new Map();
  for (const link of links) {
    const sources = senderNodes(doc, link.from);
    const targets = hearerNodes(doc, link.to);
    for (const target of targets) {
      const key = link.wire.id + ':' + link.to + ':' + target.id;
      for (const source of sources) {
        const from = indices.get(source.id), to = indices.get(target.id);
        if (from !== undefined && to !== undefined &&
            !connections.some(c => c.from === from && c.to === to)) {
          if (!bundles.has(key))
            bundles.set(key, bundles.size);
          connections.push({from, to, spread : link.wire.spread, bundle : bundles.get(key)});
        }
      }
    }
  }
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const site = findSite(sites, center.site);
      if (!site || !fitsOrgan(organ.type, center, site))
        throw new Error('studio.errors.invalidSite');
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
        organ : organ.type === 'brain' ? doc.organs.length + indices.get(center.id)
                                       : doc.organs.indexOf(organ),
        open : organ.openContacts ? 1 : 0,
        crossing : senderCrossing(doc, center, links, sides),
        range : center.range,
        receptors : center.receptors.slice(0, effects).map(r => ({...r}))
      };
      groups.push(g);
    }
  return {
    name : doc.name,
    groups,
    connections,
    compiler : compilerOptions(doc),
    growth : {...doc.growth}
  };
}
