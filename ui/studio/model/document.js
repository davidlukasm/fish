import {clamp} from '../../units.js';
import {binSites, fieldRecipe, generateRetina, HALF_VIEW, retinalBins} from './retina.js';
import {
  ATELIER_LIMITS,
  CONTRAST_POLARITY,
  FIN_STROKE,
  HORMONE_EFFECT,
  HORMONES,
  MOTOR_KIND,
  MOUTH_CYCLE,
  SENSE_KIND,
  TUNING
} from '../../schema.js';
import {
  planOfUnit,
  scentAffinities,
  scentTuning,
  timeConstantOf,
  unitOfPlan
} from '../../tuning.js';
import {nextPigment} from './pigment.js';
import {
  eligible,
  fitsOrgan,
  functionFor,
  isRegion,
  MUSCLE_TRAITS,
  NEURON_BY_KEY,
  nodeLimit,
  organFunction,
  ORGAN_BY_KEY,
  organSlots,
  PAIRINGS,
  PRESSURE_OF,
  ROLE,
  siteRole,
  slotCenters
} from './organs.js';
import {
  centroid,
  findSite,
  NERVE_ROLE,
  nerveZone,
  onMidline,
  pointDistance,
  sideSign,
  sitePoint
} from './layout.js';
import {initialRegion, routedLinks, settleRegions} from './regions.js';

let serial = 0;
// Documents name development sites by index; the 720-site lattice gave every index a new place.
export const NEW_DOCUMENT = 'v019-fish-atelier-720';
const ID_RADIX = 36;
export const identifier = (kind = 'part') =>
    `${kind}-${Date.now().toString(ID_RADIX)}-${(++serial).toString(ID_RADIX)}`;
export const copy = object => structuredClone(object);

const neutralReceptor = (effect = null) => ({
  active : effect === HORMONE_EFFECT.output ? 1 : 0,
  baseline : effect === HORMONE_EFFECT.output ? 1 : 0,
  sensitivity : 0,
  half : .05,
  substance : 0,
  width : 0,
  steepness : 0,
  spread_receptors : 0
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
          !f.profiles.every(
              p => typeof p.id === 'string' &&
                   [ p.q1, p.q2, p.qwidth, p.threshold, p.polarity ].every(Number.isFinite) &&
                   p.polarity >= 0 && p.polarity <= 1))
        throw new Error('studio.errors.invalidDocument');
    }
    if (organ.pair && doc.organs.find(o => o.id === organ.pair)?.pair !== organ.id)
      throw new Error('studio.errors.invalidDocument');
    if (organ.type === 'muscle' &&
        !(Number.isFinite(organ.sprint) && organ.sprint >= 0 && organ.sprint <= 1))
      throw new Error('studio.errors.invalidDocument');
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
      const unit = [
        'tau', 'field', 'qwidth', 'polarity', 'range', 'electrical_limit', 'teaching_limit',
        'learning_tau'
      ];
      const signed = [ 'threshold', 'q1', 'q2', 'sign', 'mode', 'pace', 'modulator', 'crossing' ];
      const receptorValid = r =>
          r && Object.keys(neutralReceptor())
                   .every(k => Number.isFinite(r[k]) && receptorPatch(k, r[k]) === r[k]);
      if (!['sensor', 'nerve', 'motor'].includes(center.role) || !Number.isInteger(center.copies) ||
          center.copies < 1 || center.copies > ATELIER_LIMITS.max_copies ||
          unit.some(k => !Number.isFinite(center[k]) || center[k] < 0 || center[k] > 1) ||
          signed.some(k => !Number.isFinite(center[k]) || Math.abs(center[k]) > 1) ||
          !receptorValid(center.growth) || !Array.isArray(center.receptors) ||
          center.receptors.length !== ATELIER_LIMITS.receptors ||
          !center.receptors.every(receptorValid) || !center.distribution ||
          [ 'spread_physiology', 'spread_receptors', 'spread_development', 'spread_contacts' ].some(
              k => !Number.isFinite(center.distribution[k]) || center.distribution[k] < 0 ||
                   center.distribution[k] > 1))
        throw new Error('studio.errors.invalidDocument');
      ids.add(center.id);
      sites.add(center.site);
    }
  }
  if (!doc.organs.some(o => o.id === 'brain' && o.type === 'brain'))
    throw new Error('studio.errors.invalidDocument');
  for (const wire of doc.wires) {
    if (!ids.has(wire.from) || !ids.has(wire.to) ||
        (ORGAN_BY_KEY[findOrgan(doc, wire.from)?.type]?.namedPorts && wire.fromPort == null) ||
        (ORGAN_BY_KEY[findOrgan(doc, wire.to)?.type]?.namedPorts && wire.toPort == null) ||
        (wire.fromPort != null &&
         !slotCenters(findOrgan(doc, wire.from), wire.fromPort, 'out').length) ||
        (wire.toPort != null && !slotCenters(findOrgan(doc, wire.to), wire.toPort, 'in').length) ||
        (wire.pairing != null && !PAIRINGS.includes(wire.pairing)) ||
        (wire.bends !== undefined && !validBends(wire.bends)))
      throw new Error('studio.errors.invalidDocument');
  }
  return doc;
}
const BENDS_MOST = 8;
const validBends = bends => Array.isArray(bends) && bends.length <= BENDS_MOST &&
                            bends.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
// Wires bent together in one drawn bundle share their bends, so they straighten together too.
export function bentTogether(doc, id) {
  const bends = JSON.stringify(doc.wires.find(w => w.id === id)?.bends ?? null);
  return doc.wires.filter(w => w.bends && JSON.stringify(w.bends) === bends).map(w => w.id);
}
export function setBends(doc, wireIds, bends) {
  if (!validBends(bends))
    return null;
  const draft = copy(doc), wanted = new Set(wireIds);
  const wires = draft.wires.filter(w => wanted.has(w.id));
  if (!wires.length)
    return null;
  for (const wire of wires)
    if (bends.length)
      wire.bends = bends.map(({x, y}) => ({x, y}));
    else
      delete wire.bends;
  return draft;
}
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
export function receptorAffinity(wheel, receptor, index) {
  const [x, y] = wheelPlace(wheel, receptor.substance);
  return wheelAffinity(wheel, x, y, receptor.width, index);
}
export function receptorResponse(wheel, receptor, levels = [], maturity = 0, inactiveBaseline = 0) {
  if (!receptor.active)
    return inactiveBaseline;
  let concentration = receptorAffinity(wheel, receptor, wheel.hormones) * maturity;
  for (let index = 0; index < wheel.hormones; ++index)
    concentration += receptorAffinity(wheel, receptor, index) * (levels[index] ?? 0);
  const ratio = (concentration / receptor.half) ** (2 ** receptor.steepness);
  const bound = Number.isFinite(ratio) ? ratio / (1 + ratio) : 1;
  return clamp(receptor.baseline + receptor.sensitivity * bound, -1, 1);
}
export const NOTICEABLE_AFFINITY = .1;
export const producers = (doc, index, wheel) =>
    doc.organs.filter(o => o.type === 'gland')
        .flatMap(o => o.centers)
        .filter(c => wheelAffinity(wheel, c.q1, c.q2, c.qwidth, index) >= NOTICEABLE_AFFINITY);
export const effectsFor =
    (center, wheel) => [...(center.key === 'retina' ? wheel?.lightEffects ?? [] : []),
                        ...(wheel?.roleEffects?.[ROLE[center.role]] ?? [])];
export const boundEffects = (center, index, wheel) => center.receptors.flatMap(
    (r, effect) => r.active && effectDirection(effect, r) !== 0 &&
                           effectsFor(center, wheel).includes(effect) &&
                           receptorAffinity(wheel, r, index) >= NOTICEABLE_AFFINITY
                       ? [ effect ]
                       : []);
export const LEARNING_EFFECTS = Object.freeze([
  HORMONE_EFFECT.teaching, HORMONE_EFFECT.learning, HORMONE_EFFECT.competition,
  HORMONE_EFFECT.eligibility
]);
export const isLearner = center => center.role === 'nerve';
export function teachersOf(doc, center, wheel) {
  return doc.substances
      .filter(sub => boundEffects(center, sub.index, wheel).includes(HORMONE_EFFECT.teaching))
      .map(sub => ({substance : sub, glands : producers(doc, sub.index, wheel)}));
}
export const birthAffinity = (center, index, wheel) =>
    center.growth.active && center.growth.sensitivity !== 0
        ? receptorAffinity(wheel, center.growth, index)
        : 0;
export const receivers = (doc, index, wheel) =>
    allCenters(doc).filter(c => boundEffects(c, index, wheel).length ||
                                birthAffinity(c, index, wheel) >= NOTICEABLE_AFFINITY);
export const growsWith = (doc, index, wheel) =>
    doc.growth.active && doc.growth.sensitivity !== 0 &&
    receptorAffinity(wheel, doc.growth, index) >= NOTICEABLE_AFFINITY;
export const allCenters = doc =>
    doc.organs.flatMap(organ => organ.centers.map(
                           center => ({...center, organId : organ.id, organType : organ.type})));
export const pressureMismatches = (doc, pressure) =>
    Array.isArray(pressure) ? allCenters(doc).filter((center, index) => {
      const own = PRESSURE_OF[center.organType];
      return own?.key === center.key && pressure[index] >= 0 && pressure[index] !== own.source;
    })
                            : [];
export const contactBundle =
    ([ from, to, count, weight, positive, negative, positiveWeight, negativeWeight ]) =>
        ({from, to, count, weight, positive, negative, positiveWeight, negativeWeight});
export const contactRows = state =>
    !state.stale && state.report?.compiler ? state.report.contacts : [];
export function contactCenters(state) {
  const centers = allCenters(state.document);
  if (state.stale || !state.report?.compiler)
    return centers;
  const actual = centers.map((center, index) => {
    const sample = state.report.sites?.find(site => site.group === index),
          c = state.report.groups[index]?.nerve;
    return {
      ...center,
      role : sample ? [ 'sensor', 'nerve', 'motor' ][sample.role] : center.role,
      ...(c ? {nativeClass : {sign : c[0], mode : c[1], pace : c[2], modulator : c[3]}} : {})
    };
  });
  return [
    ...actual, ...(state.report?.extraNodes ?? []).map(node => {
      const site = state.sites.find(
          site => site.zone === node.zone && site.side === node.side &&
                  [ 'u', 'v', 'w' ].every(axis => Math.abs(site[axis] - node[axis]) < .0001));
      return {
        ...node,
        id : '@cppn-' + node.index,
        site : site?.id,
        role : [ 'sensor', 'nerve', 'motor' ][node.role],
        organType : 'brain',
        organId : null,
        key : 'generated',
        sign : node.nativeClass.sign,
        generated : true
      };
    })
  ];
}

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
export function profileIndex(doc, organId, profileId) {
  const organ = findOrgan(doc, organId);
  const center = organ?.centers.find(c => c.profile === profileId);
  return center ? centerIndex(doc, center.id) : -1;
}
export const groupReport = (doc, report, key, id) => report?.[key]?.[centerIndex(doc, id)] ?? null;
// Pectoral fins may hold a second muscle per side: the antagonist with the other stroke.
function matchingOrgan(doc, type, side, sites, code = null, stroke = FIN_STROKE.back) {
  if (isRegion({type}))
    return null;
  const scope = ORGAN_BY_KEY[type]?.scope;
  if (scope === 'single')
    return doc.organs.find(organ => organ.type === type) ?? null;
  if (type === 'muscle')
    return doc.organs.find(organ => organ.type === type &&
                                    sideSign(organ.side) === sideSign(side) &&
                                    organFunction(organ, sites) === code &&
                                    (code !== MOTOR_KIND.turn || finStroke(organ) === stroke)) ??
           null;
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
export const organOf = (doc, id) => findOrgan(doc, id) ?? findCenter(doc, id)?.organ ?? null;
export const isChosen = (selected, organ) =>
    !!organ && (selected?.id === organ.id || organ.centers.some(c => c.id === selected?.id));

const NEW_CENTER = Object.freeze({sense_threshold : -.6, tau : .5, field : .3, qwidth : .35});
export function defaults(desc, site, effects = ATELIER_LIMITS.receptors) {
  const N = NEW_CENTER;
  const cycle = desc.role !== 'motor' ? null
                : [ MOTOR_KIND.aggression, MOTOR_KIND.suction ].includes(functionFor(desc, site))
                    ? MOUTH_CYCLE.steps
                : [ MOTOR_KIND.forward, MOTOR_KIND.turn ].includes(functionFor(desc, site)) ? 12
                                                                                            : null;
  return {
    id : identifier('center'),
    key : desc.key,
    role : desc.role,
    functionCode : desc.functionCode,
    surface : desc.surface,
    site : site.id,
    copies : desc.copies,
    threshold : desc.threshold ?? (desc.role === 'sensor' ? N.sense_threshold : -.2),
    tau : cycle ? timeConstantOf(cycle) : N.tau,
    field : desc.field ?? N.field,
    q1 : 0,
    q2 : 0,
    polarity : CONTRAST_POLARITY.bright,
    qwidth : desc.qwidth ?? N.qwidth,
    sign : desc.sign ?? 1,
    mode : desc.mode ?? 0,
    pace : desc.pace ?? -1,
    modulator : desc.modulator ?? -1,
    crossing : 0,
    range : 1,
    electrical_limit : .5,
    teaching_limit : .5,
    learning_tau : .5,
    distribution :
        {spread_physiology : 0, spread_receptors : 0, spread_development : 0, spread_contacts : 0},
    growth : {...neutralReceptor(), active : 1, baseline : 1},
    receptors : Array.from({length : effects},
                           (_, effect) => {
                             const receptor = neutralReceptor(effect);
                             // Motor membranes must learn even when their action gate is closed.
                             if (desc.role === 'motor' && effect === HORMONE_EFFECT.excitation)
                               Object.assign(receptor, {active : 1, baseline : .5});
                             if (desc.role === 'sensor' && desc.functionCode === SENSE_KIND.light &&
                                 effect === HORMONE_EFFECT.excitation)
                               Object.assign(receptor, {
                                 active : 1,
                                 baseline : 1,
                                 sensitivity : -2,
                                 half : .2,
                                 substance : HORMONES.levels,
                                 steepness : 3
                               });
                             return receptor;
                           })
  };
}
function candidates(desc, sites, used, position, requiredSide = null, organType = '') {
  return sites
      .filter(site => !used.has(site.id) &&
                      (ORGAN_BY_KEY[organType] ? fitsOrgan(organType, desc, site)
                                               : eligible(desc, site)) &&
                      (requiredSide === null || site.side === requiredSide))
      .map(site => ({site, distance : pointDistance(site, position, siteRole(organType))}))
      .sort((a, b) => a.distance - b.distance);
}
export function closestSite(desc, sites, used, position, side = null, organType = '') {
  return candidates(desc, sites, used, position, side, organType)[0]?.site ?? null;
}
export function closestSiteDoing(desc, code, sites, used, position, side = null, organType = '') {
  return candidates(desc, sites, used, position, side, organType)
             .map(c => c.site)
             .find(s => functionFor(desc, s) === code) ??
         null;
}
// Allocate the fixed head lattice jointly: each organ receives coverage before extra colour
// types fill remaining sites. Adding the near sense therefore also works after a dense retina.
export function regenerateFields(draft, sites) {
  const fields = draft.organs.filter(o => o.field);
  const used = usedSites(draft, c => !fields.some(o => o.id === c.organId));
  const bins = retinalBins(sites);
  for (let i = 0; i < fields.length; i++) {
    const organ = fields[i], reserved = new Set(used);
    for (const other of fields.slice(i + 1)) {
      if (other.field.sampled) {
        other.centers.forEach(c => reserved.add(c.site));
        continue;
      }
      for (const bin of bins.filter(b => b.hi > other.field.lo && b.lo < other.field.hi)) {
        const available = binSites(sites, other.side, bin).filter(s => !reserved.has(s.id));
        const site =
            available.find(s => other.centers.some(c => c.site === s.id)) ?? available.at(-1);
        if (site)
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
function regionHomes(doc, sites) {
  const homes = new Set();
  for (const organ of doc.organs.filter(o => o.region)) {
    const home = findSite(sites, organ.region.site);
    if (!home)
      continue;
    homes.add(home.id);
    homes.add(mirroredSite(home, sites)?.id);
  }
  return homes;
}
// `code` asks for a muscle doing that work: muscle sites of different work can lie on one spot.
export function addOrgan(doc, type, sites, position, snapDistance = Infinity, paired = true,
                         code = null) {
  const definition = ORGAN_BY_KEY[type];
  const pick = (desc, used, side) =>
      code === null ? closestSite(desc, sites, used, position, side, type)
                    : closestSiteDoing(desc, code, sites, used, position, side, type);
  if (!definition || definition.fixed)
    return null;
  const draft = copy(doc), used = usedSites(draft);
  if ((paired && definition.scope !== 'single') || definition.bilateral)
    for (const occupied of [...used]) {
      const mirror = mirroredSite(findSite(sites, occupied), sites);
      if (mirror)
        used.add(mirror.id);
    }
  const first =
      pick(definition.centers[0], isRegion({type}) ? regionHomes(draft, sites) : new Set(), null);
  if (!first || pointDistance(first, position, siteRole(type)) > snapDistance)
    return null;
  const existing =
      matchingOrgan(draft, type, first.side, sites, functionFor(definition.centers[0], first));
  if (existing)
    return {
      document : draft,
      organId : existing.id,
      centerId : existing.centers[0].id,
      centerIds : existing.centers.map(c => c.id)
    };
  const middle = isRegion({type}) && onMidline(first) && (!paired || definition.midline);
  const makePair = paired && definition.scope !== 'single' && !middle;
  const organ = {
    id : identifier('organ'),
    type,
    side : middle ? 0 : first.side,
    centers : [],
    pair : null,
    linked : false
  };
  if (type === 'muscle')
    organ.sprint = 0;
  if (type === 'eye' || type === 'proximity') {
    organ.field = fieldRecipe(first, identifier('profile'));
    if (type === 'proximity')
      organ.field.profiles[0].qwidth = NEW_CENTER.qwidth;
  } else if (definition.settings) {
    organ.region = initialRegion(type, first);
  } else {
    for (const desc of definition.centers) {
      const motor =
          desc.key === PRESSURE_OF[type]?.key && organ.centers.find(c => c.role === 'motor');
      const at = motor && findSite(sites, motor.site);
      // A pressure receptor belongs beside its muscle in the body, including its hidden depth.
      const site = at ? sites
                            .filter(s => !used.has(s.id) && s.side === first.side &&
                                         fitsOrgan(type, desc, s))
                            .sort((a, b) => siteSeparation(a, at) - siteSeparation(b, at))[0]
                      : pick(desc, used, first.side);
      if (!site)
        return null;
      used.add(site.id);
      organ.centers.push(defaults(desc, site));
      if (definition.bilateral) {
        const mirror = mirroredSite(site, sites);
        if (!mirror || used.has(mirror.id))
          return null;
        used.add(mirror.id);
        organ.centers.push(defaults(desc, mirror));
      }
    }
  }
  draft.organs.push(organ);
  if (organ.field && !regenerateFields(draft, sites))
    return null;
  let result = settleRegions(draft, sites, makePair ? organ.id : null);
  if (organ.region && !findOrgan(result, organ.id).centers.length)
    return null;
  if (makePair) {
    const mirrored = mirrorOrgan(result, organ.id, sites);
    if (!mirrored)
      return null;
    result = settleRegions(mirrored.document, sites);
  }
  if (definition.initialNodes) {
    result = setOrganNodes(result, organ.id, definition.initialNodes, sites);
    if (!result)
      return null;
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
    if ('lo' in patch || 'hi' in patch || patch.addProfile)
      delete target.field.sampled;
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
    for (const center of target.centers) {
      if ('density' in patch)
        center.copies = target.field.density;
      if ('resolution' in patch)
        center.field = target.field.resolution;
    }
    if (patch.profile) {
      const index = original.field.profiles.findIndex(p => p.id === patch.profile.id);
      const profile = target.field.profiles[index];
      if (profile)
        for (const key of ['q1', 'q2', 'qwidth', 'threshold', 'polarity'])
          if (key in patch.profile) {
            const value = target === organ ? patch.profile[key]
                                           : profile[key] + patch.profile[key] -
                                                 original.field.profiles[index][key];
            profile[key] = clamp(value, [ 'qwidth', 'polarity' ].includes(key) ? 0 : -1, 1);
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
const NEURON_COPIES = 4;
export function addNeuron(doc, preset, sites, position, snapDistance = Infinity) {
  const properties = NEURON_BY_KEY[preset];
  if (!properties)
    return null;
  const used = usedSites(doc);
  const desc =
      {key : preset, role : 'nerve', functionCode : -1, copies : NEURON_COPIES, surface : 'any'};
  const site = closestSite(desc, sites.filter(nerveZone), used, position, null, 'brain');
  if (!site || pointDistance(site, position, NERVE_ROLE) > snapDistance)
    return null;
  const draft = copy(doc);
  const center = {...defaults(desc, site), ...properties};
  draft.organs.find(o => o.id === 'brain').centers.push(center);
  return {document : draft, centerId : center.id, organId : 'brain'};
}
export function makeLearner(doc, id) {
  const center = findCenter(doc, id)?.center;
  if (center?.role !== 'nerve')
    return null;
  return updateCenter(doc, id, {
    mode : NEURON_BY_KEY.learn.mode,
    qwidth : Math.max(center.qwidth, NEURON_BY_KEY.learn.qwidth)
  });
}
export function moveCenter(doc, centerId, target, sites) {
  const result = findCenter(doc, centerId);
  const site = findSite(sites, target);
  if (!result || result.organ.type !== 'brain' || !site || !eligible(result.center, site) ||
      !nerveZone(site))
    return null;
  if (allCenters(doc).some(c => c.id !== centerId && c.site === site.id))
    return null;
  const draft = copy(doc);
  findCenter(draft, centerId).center.site = site.id;
  return draft;
}
export function moveCenterToSide(doc, centerId, side, sites) {
  const found = findCenter(doc, centerId), here = findSite(sites, found?.center.site);
  if (!here || found.organ.type !== 'brain')
    return null;
  const used = usedSites(doc);
  const fits = s => !used.has(s.id) && eligible(found.center, s) && nerveZone(s) &&
                    (side === 0 ? onMidline(s) : s.side === side && !onMidline(s));
  const candidates = sites.filter(fits);
  const near = candidates.filter(s => s.zone === here.zone);
  const target = (near.length ? near : candidates)
                     .sort((a, b) => pointDistance(a, sitePoint(here, NERVE_ROLE), NERVE_ROLE) -
                                     pointDistance(b, sitePoint(here, NERVE_ROLE), NERVE_ROLE))[0];
  return target ? moveCenter(doc, centerId, target.id, sites) : null;
}
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
  const role = siteRole(organ.type), anchor = sitePoint(currentSites[0], role);
  const target = pointerOrigin ? {
    x : anchor.x + position.x - pointerOrigin.x,
    y : anchor.y + position.y - pointerOrigin.y
  }
                               : position;
  const first = closestSite(organ.centers[0], sites, used, target, organ.pair ? organ.side : null,
                            organ.type);
  if (!first || pointDistance(first, target, role) > snapDistance)
    return null;
  const fixed = sitePoint(first, role);
  const sideFlip = currentSites[0].side === first.side ? 1 : -1;
  for (let index = 0; index < organ.centers.length; ++index) {
    const center = organ.centers[index];
    const old = currentSites[index], current = sitePoint(old, role);
    const wanted = {
      x : fixed.x + current.x - anchor.x,
      y : fixed.y + (current.y - anchor.y) * sideFlip
    };
    const site = index === 0 ? first
                             : closestSiteDoing(center, functionFor(center, first), sites, used,
                                                wanted, old.side * sideFlip, organ.type);
    if (!site || pointDistance(site, wanted, role) > snapDistance)
      return null;
    center.site = site.id;
    used.add(site.id);
  }
  organ.side = first.side;
  if (organ.region)
    organ.region.site = first.id;
  if (original.linked && original.pair) {
    const other = findOrgan(draft, original.pair);
    const from = sitePoint(findSite(sites, other.centers[0].site), siteRole(other.type));
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
// Sites a new node of this organ must leave free: a pressure sensor reads the nearest organ, so
// a node closer to another organ's sensor than that organ's own cells would take its reading.
function pressureGuard(doc, organ, sites) {
  const guarded = new Set();
  for (const other of doc.organs.filter(o => o.id !== organ.id)) {
    const key = PRESSURE_OF[other.type]?.key;
    for (const sensor of other.centers.filter(c => c.key === key)) {
      const at = findSite(sites, sensor.site);
      const own = other.centers.filter(c => c !== sensor)
                      .map(c => findSite(sites, c.site))
                      .filter(Boolean)
                      .map(s => siteSeparation(s, at));
      if (!at || !own.length)
        continue;
      const reach = Math.min(...own);
      for (const s of sites)
        if (siteSeparation(s, at) < reach)
          guarded.add(s.id);
    }
  }
  return guarded;
}
export function setOrganNodes(doc, organId, count, sites, typeId = null) {
  const original = findOrgan(doc, organId), most = nodeLimit(original, sites);
  const kind = original?.centers[0]?.key;
  const ofType = c => c.key === kind && (typeId === null || typeOf(c) === typeId);
  const others = original ? original.centers.filter(c => !ofType(c)).length : 0;
  if (!most || !original.centers.some(ofType) || others >= most)
    return null;
  const bilateral = !!ORGAN_BY_KEY[original.type].bilateral;
  const wanted = bilateral ? 2 * clamp(Math.round(count / 2), 1, Math.floor((most - others) / 2))
                           : clamp(Math.round(count), 1, most - others);
  const draft = copy(doc);
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
    const code = functionFor(first, home), guarded = pressureGuard(draft, organ, sites);
    while (own.length < wanted) {
      const used = new Set([...usedSites(draft), ...guarded ]);
      const partner = bilateral && own.length % 2 ? own.at(-1)
                      : organ === twin            ? main.centers.filter(ofType)[own.length]
                                                  : null;
      const mirror = partner ? mirroredSite(findSite(sites, partner.site), sites) : null;
      if (bilateral && !partner)
        for (const occupied of [...used]) {
          const opposite = mirroredSite(findSite(sites, occupied), sites);
          if (opposite)
            used.add(opposite.id);
        }
      const at = own.map(c => sitePoint(findSite(sites, c.site), siteRole(organ.type)));
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
const musclesOf = (doc, code, sites) =>
    doc.organs.filter(o => o.type === 'muscle').flatMap(o => o.centers).filter(c => {
      const site = findSite(sites, c.site);
      return site && functionFor(c, site) === code;
    });
export function muscleTrait(doc, code, key, sites) {
  const quality = Object.keys(MUSCLE_TRAITS[code] ?? {}).find(q => MUSCLE_TRAITS[code][q] === key);
  const muscles = quality ? musclesOf(doc, code, sites) : [];
  const weight = muscles.reduce((sum, c) => sum + c.copies, 0);
  return weight ? muscles.reduce((sum, c) => sum + c.copies * unitOfPlan(c[quality]), 0) / weight
                : null;
}
export function setMuscleTrait(doc, code, key, trait, sites) {
  const quality = Object.keys(MUSCLE_TRAITS[code] ?? {}).find(q => MUSCLE_TRAITS[code][q] === key);
  if (!quality || !musclesOf(doc, code, sites).length)
    return null;
  const draft = copy(doc);
  for (const center of musclesOf(draft, code, sites))
    center[quality] = planOfUnit(trait);
  return draft;
}
// The last nodes of a muscle are sprint nodes: they answer only a strong command, so a weak drive
// moves the muscle gently and a strong one recruits its whole force.
export const SPRINT_THRESHOLD = 1;
export const sprintNodes = organ =>
    organ.type === 'muscle' ? Math.floor(organ.sprint * organ.centers.length + 1e-9) : 0;
export const isSprintNode = (organ, index) => index >= organ.centers.length - sprintNodes(organ);
export function setMuscleSprint(doc, organId, share) {
  const organ = findOrgan(doc, organId);
  if (organ?.type !== 'muscle' || !Number.isFinite(share))
    return null;
  const draft = copy(doc);
  const main = findOrgan(draft, organId), twin = main.linked ? findOrgan(draft, main.pair) : null;
  for (const o of [main, twin].filter(Boolean))
    o.sprint = clamp(share, 0, 1);
  return draft;
}
// A pectoral fin muscle strokes the fin back, pushing the fish forward, or forward as the
// antagonist, pushing it back. Its cells carry the direction in their polarity.
export const finStroke = organ => organ.centers[0].polarity;
export const isFinMuscle = (organ, sites) =>
    organ?.type === 'muscle' && organFunction(organ, sites) === MOTOR_KIND.turn;
export function setFinStroke(doc, organId, stroke, sites) {
  const organ = findOrgan(doc, organId);
  if (!isFinMuscle(organ, sites) || !Object.values(FIN_STROKE).includes(stroke))
    return null;
  const draft = copy(doc);
  const main = findOrgan(draft, organId), twin = main.linked ? findOrgan(draft, main.pair) : null;
  for (const o of [main, twin].filter(Boolean))
    for (const c of o.centers)
      c.polarity = stroke;
  return draft;
}
const opposite = stroke => stroke === FIN_STROKE.back ? FIN_STROKE.front : FIN_STROKE.back;
export const antagonistOf = (doc, organ, sites) =>
    isFinMuscle(organ, sites) ? matchingOrgan(doc, 'muscle', organ.side, sites, MOTOR_KIND.turn,
                                              opposite(finStroke(organ)))
                              : null;
// The antagonist of a pectoral fin muscle: as many nodes at free fin sites beside it, stroking
// the other way, on both sides when the muscle has a twin.
export function addAntagonist(doc, organId, sites) {
  const original = findOrgan(doc, organId);
  if (!isFinMuscle(original, sites) || antagonistOf(doc, original, sites))
    return null;
  const stroke = opposite(finStroke(original));
  const draft = copy(doc), used = usedSites(draft);
  if (original.pair)
    for (const occupied of [...used]) {
      const mirror = mirroredSite(findSite(sites, occupied), sites);
      if (mirror)
        used.add(mirror.id);
    }
  const organ = {
    id : identifier('organ'),
    type : 'muscle',
    side : original.side,
    centers : [],
    pair : null,
    linked : false,
    sprint : original.sprint
  };
  for (const center of original.centers) {
    const home = findSite(sites, center.site);
    const site = closestSiteDoing(center, functionFor(center, home), sites, used,
                                  sitePoint(home, siteRole(organ.type)), home.side, organ.type);
    if (!site)
      return null;
    used.add(site.id);
    organ.centers.push(
        {...copy(center), id : identifier('center'), site : site.id, polarity : stroke});
  }
  draft.organs.push(organ);
  const mirrored = original.pair ? mirrorOrgan(draft, organ.id, sites) : {document : draft};
  if (!mirrored)
    return null;
  settleAssemblies(mirrored.document);
  return {document : mirrored.document, organId : organ.id};
}
export function placeNode(doc, centerId, siteId, sites) {
  const found = findCenter(doc, centerId), site = findSite(sites, siteId);
  if (!found || !site || !fitsOrgan(found.organ.type, found.center, site) ||
      allCenters(doc).some(c => c.site === siteId))
    return null;
  const draft = copy(doc);
  const moved = findCenter(draft, centerId);
  moved.center.site = siteId;
  if (moved.organ.region && moved.organ.centers.length === 1)
    moved.organ.region.site = siteId;
  return draft;
}
const NEAR_SITE = Object.freeze({depth_weight : 4, other_side : 1});
const siteSeparation = (site, at) =>
    (site.zone - at.zone + at.u - site.u) ** 2 + (site.w - at.w) ** 2 / NEAR_SITE.depth_weight +
    (site.v - at.v) ** 2 + (site.side === at.side ? 0 : NEAR_SITE.other_side);
export function nodeSitesNear(doc, centerId, nearId, sites) {
  const found = findCenter(doc, centerId), near = findCenter(doc, nearId);
  const at = findSite(sites, near?.center.site);
  if (!found || !at)
    return [];
  const used = usedSites(doc);
  return sites.filter(s => !used.has(s.id) && fitsOrgan(found.organ.type, found.center, s))
      .sort((a, b) => siteSeparation(a, at) - siteSeparation(b, at));
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
  const same = isRegion(found.organ)                   ? c => c.node === found.center.node
               : ORGAN_BY_KEY[found.organ.type]?.types ? c => typeOf(c) === typeOf(found.center)
                                                       : c => c.key === found.center.key;
  return organs.filter(Boolean).flatMap(o => o.centers.filter(same));
}
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
export function substanceRead(wheel, center) {
  const indices = Array.from({length : wheel.bloodSubstances}, (_, i) => i);
  return indices.reduce((best, i) =>
                            wheelAffinity(wheel, center.q1, center.q2, center.qwidth, i) >
                                    wheelAffinity(wheel, center.q1, center.q2, center.qwidth, best)
                                ? i
                                : best);
}
export function nextTypeTuning(organ, wheel) {
  const firsts = organTypes(organ).map(type => type.centers[0]);
  if (organ.type === 'pigment')
    return nextPigment(firsts);
  if (organ.type === 'blood') {
    const read = new Set(firsts.map(c => substanceRead(wheel, c)));
    const next = Array.from({length : wheel.bloodSubstances}, (_, i) => i).find(i => !read.has(i));
    const [q1, q2] = wheelPlace(wheel, next ?? 0);
    return {q1, q2};
  }
  const smelled = TUNING.scent_latitudes.map(
      (_, k) => Math.max(...firsts.map(c => scentAffinities(c.q1, c.q2, c.qwidth)[k])));
  return {...scentTuning(smelled.indexOf(Math.min(...smelled))), qwidth : firsts[0].qwidth};
}
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
    const site =
        mirror && !used.has(mirror.id)
            ? mirror
            : closestSiteDoing(first, functionFor(first, home), sites, used,
                               sitePoint(home, siteRole(organ.type)), home.side, organ.type);
    if (!site)
      return null;
    organ.centers.push(
        {...copy(first), ...tuning, id : identifier('center'), site : site.id, profile : id});
  }
  settleAssemblies(draft);
  return {document : draft, typeId : id};
}
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
    'copies', 'threshold', 'tau', 'field', 'q1', 'q2', 'polarity', 'qwidth', 'crossing', 'range',
    'sign', 'mode', 'pace', 'modulator', 'electrical_limit', 'teaching_limit', 'learning_tau'
  ];
  for (const c of tissueTargets(draft, id)) {
    for (const key of keys)
      if (Number.isFinite(patch[key])) {
        const paired = findCenter(draft, c.id).organ.id !== found.organ.id;
        const value = paired ? c[key] + patch[key] - found.center[key] : patch[key];
        c[key] = key === 'copies' ? clamp(Math.round(value), 1, ATELIER_LIMITS.max_copies)
                                  : clamp(value,
                                          [
                                            'tau', 'field', 'qwidth', 'polarity', 'range',
                                            'electrical_limit', 'teaching_limit', 'learning_tau'
                                          ].includes(key)
                                              ? 0
                                              : -1,
                                          1);
      }
  }
  for (const organ of draft.organs.filter(o => o.field)) {
    for (const profile of organ.field.profiles) {
      const c = organ.centers.find(c => c.profile === profile.id);
      if (!c)
        continue;
      for (const key of ['q1', 'q2', 'qwidth', 'threshold', 'polarity'])
        profile[key] = c[key];
    }
    organ.field.density = organ.centers[0].copies;
    organ.field.resolution = organ.centers[0].field;
  }
  return draft;
}
function receptorPatch(key, value) {
  if (!Number.isFinite(value))
    return null;
  if (key === 'active')
    return value ? 1 : 0;
  if (key === 'substance')
    return Math.round(clamp(value, 0, HORMONES.levels));
  if (key === 'steepness')
    return Math.round(clamp(value, 0, 3));
  if (key === 'half')
    return clamp(value, .0003, 1);
  if (key === 'sensitivity')
    return clamp(value, -2, 2);
  if (key === 'width' || key === 'spread_receptors')
    return clamp(value);
  return clamp(value, -1, 1);
}
export function updateCellGrowth(doc, id, patch) {
  const draft = copy(doc), targets = tissueTargets(draft, id);
  if (!targets.length)
    return null;
  for (const c of targets)
    for (const key of Object.keys(neutralReceptor()))
      if (Number.isFinite(patch[key]))
        c.growth[key] = receptorPatch(key, patch[key]);
  return draft;
}
export function updateCellDistribution(doc, id, key, value) {
  const draft = copy(doc);
  if (!['spread_physiology', 'spread_receptors', 'spread_development', 'spread_contacts'].includes(
          key) ||
      !Number.isFinite(value))
    return null;
  for (const center of tissueTargets(draft, id))
    center.distribution[key] = clamp(value);
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
        center.receptors[effect][key] = receptorPatch(key, patch[key]);
  return draft;
}
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
export const GROWTH_START = Object.freeze({sensitivity : 1, half : .01});
const RECEPTOR_START = Object.freeze({
  [HORMONE_EFFECT.excitation] : {sensitivity : .5, half : .1},
  [HORMONE_EFFECT.teaching] : {sensitivity : .5, half : .1},
  [HORMONE_EFFECT.learning] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.competition] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.eligibility] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.rhythm] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.output] : {baseline : 1, sensitivity : -2, half : .1},
  [HORMONE_EFFECT.death] : {sensitivity : 1, half : .5}
});
export const DEATH_RESPONSE = .5;
export function effectLevel(effect, r) {
  if (effect === HORMONE_EFFECT.excitation || effect === HORMONE_EFFECT.teaching)
    return r;
  if (effect === HORMONE_EFFECT.learning)
    return 1 + r;
  if (effect === HORMONE_EFFECT.death)
    return r > DEATH_RESPONSE ? 1 : 0;
  return (1 + r) / 2;
}
export const receptorEnds = receptor => ({
  without : clamp(receptor.baseline, -1, 1),
  with : clamp(receptor.baseline + receptor.sensitivity, -1, 1)
});
const receptorStart = effect =>
    ({baseline : neutralReceptor(effect).baseline, ...RECEPTOR_START[effect]});
export const startEnds = effect => receptorEnds(receptorStart(effect));
export function effectDirection(effect, receptor) {
  const ends = receptorEnds(receptor);
  return Math.sign(effectLevel(effect, ends.with) - effectLevel(effect, ends.without));
}
export function bindReceptor(doc, id, effect, index) {
  const current = findCenter(doc, id)?.center.receptors[effect];
  return updateReceptor(
      doc, id, effect,
      {...(current?.sensitivity ? {} : receptorStart(effect)), active : 1, substance : index});
}
// Without a substance a receptor keeps its constant part: a local gain stays, only its dependence
// on the substance goes.
export const unbindReceptor = (doc, id, effect) =>
    updateReceptor(doc, id, effect, {sensitivity : 0});
export const substanceBound = (effect, receptor) =>
    !!receptor?.active && effectDirection(effect, receptor) !== 0;
// Every learner of an organ (and its twin, which follows its pair) taught by one substance, or by
// none when `index` is null.
export function teachOrgan(doc, organId, index) {
  let draft = doc;
  for (const c of findOrgan(doc, organId)?.centers.filter(isLearner) ?? [])
    draft = (index === null ? unbindReceptor(draft, c.id, HORMONE_EFFECT.teaching)
                            : bindReceptor(draft, c.id, HORMONE_EFFECT.teaching, index)) ??
            draft;
  return draft;
}
export function switchReceptor(doc, id, effect, on) {
  const receptor = findCenter(doc, id)?.center.receptors[effect];
  return updateReceptor(
      doc, id, effect,
      {...(on && !receptor?.sensitivity ? receptorStart(effect) : {}), active : on ? 1 : 0});
}
export function updateGrowth(doc, patch) {
  const draft = copy(doc);
  for (const key of Object.keys(neutralReceptor()))
    if (Number.isFinite(patch[key]))
      draft.growth[key] = receptorPatch(key, patch[key]);
  return draft;
}
export function addSubstance(doc, max, wanted = null) {
  const active = new Set(doc.substances.map(s => s.index));
  const index = wanted ?? Array.from({length : max}, (_, i) => i).find(i => !active.has(i));
  if (index === undefined || active.has(index) || index >= max)
    return null;
  const draft = copy(doc);
  draft.substances.push({id : identifier('substance'), index, name : ''});
  return draft;
}
export const shownSubstance = (doc, index) =>
    doc.substances.find(s => s.index === index) ?? doc.substances[0] ?? null;
export const SUBSTANCE_NAME_LENGTH = 32;
export function setSubstance(doc, index, name) {
  const draft = copy(doc), entry = draft.substances.find(s => s.index === index);
  if (!entry)
    return null;
  entry.name = String(name).slice(0, SUBSTANCE_NAME_LENGTH);
  return draft;
}
export function removeSubstance(doc, index, wheel) {
  // Its own glands go with it: left alone they would go on secreting it, and the next new
  // substance would take over its place on the wheel and with it the glands. A gland that also
  // feeds a substance that stays is kept.
  const feeds = (c, i) => wheelAffinity(wheel, c.q1, c.q2, c.qwidth, i) >= NOTICEABLE_AFFINITY;
  const others = doc.substances.map(s => s.index).filter(i => i !== index);
  const glands = doc.organs.filter(
      o => o.type === 'gland' && o.centers.length &&
           o.centers.every(c => feeds(c, index) && !others.some(i => feeds(c, i))));
  const draft = copy(glands.reduce((d, o) => removeOrgan(d, o.id) ?? d, doc));
  draft.substances = draft.substances.filter(s => s.index !== index);
  for (const center of allCenters(draft))
    for (const receptor of center.receptors)
      if (receptor.substance === index)
        receptor.active = 0;
  if (draft.growth.substance === index)
    draft.growth.active = 0;
  return draft;
}
export function addWire(doc, from, to, pairing = null, sites = null, ports = {}) {
  const a = wireEndpointCenters(doc, from, ports.fromPort, 'out'),
        b = wireEndpointCenters(doc, to, ports.toPort, 'in');
  if (!a.length || !b.length || from === to ||
      (a.every(c => c.role === 'sensor') && b.every(c => c.role === 'motor')))
    return null;
  if (sites &&
      !a.some(source => b.some(target => validCellLink(source, findSite(sites, source.site), target,
                                                       findSite(sites, target.site)))))
    return null;
  const twins = pairEndpoint(doc, from) === to;
  const drawn = endpointSide(doc, from) === endpointSide(doc, to) ? 'same' : 'crossed';
  const sourcePair = pairEndpoint(doc, from), targetPair = pairEndpoint(doc, to);
  const sides = !twins && (sourcePair || targetPair) ? PAIRINGS.includes(pairing) ? pairing
                                                       : sourcePair && targetPair ? drawn
                                                                                  : 'same'
                                                     : null;
  const wire = {id : identifier('wire'), from, to, spread : WIRE_SPREAD, pairing : sides};
  for (const key of ['fromPort', 'toPort'])
    if (ports[key] != null)
      wire[key] = ports[key];
  const endpointCovers = (a, ap, b, bp, dir) => {
    const own = new Set(wireEndpointCenters(doc, a, ap, dir).map(c => c.id));
    const other = wireEndpointCenters(doc, b, bp, dir);
    return other.length && other.every(c => own.has(c.id));
  };
  const covers = (a, b) =>
      (!a.side || a.side === b.side) &&
      endpointCovers(a.from, a.wire.fromPort, b.from, b.wire.fromPort, 'out') &&
      endpointCovers(a.to, a.wire.toPort, b.to, b.wire.toPort, 'in');
  const made = expandedWires(doc), links = wireLinks(doc, wire).map(l => ({...l, wire}));
  if (links.every(link => made.some(old => covers(old, link))))
    return null;
  const draft = copy(doc);
  draft.wires =
      draft.wires.filter(old => !wireLinks(doc, old).every(
                             link => links.some(added => covers(added, {...link, wire : old}))));
  draft.wires.push(wire);
  return {document : draft, wireId : wire.id};
}
const WIRE_SPREAD = 0;
const ownEndpoints = organ => organ.type === 'brain' || isRegion(organ);
const isNode = (doc, id) => {
  const found = findCenter(doc, id);
  return !!found && !ownEndpoints(found.organ);
};
export const wholeEndpoint = (doc, id) => isNode(doc, id) ? findCenter(doc, id).organ.id : id;
function pruneWires(draft) {
  const ids = new Set([...draft.organs.map(o => o.id), ...allCenters(draft).map(c => c.id) ]);
  draft.wires = draft.wires.filter(w => ids.has(w.from) && ids.has(w.to));
}
export function matchingNode(original, fresh, centerId) {
  const id = original.field || original.region
                 ? fresh.id + centerId.slice(original.id.length)
                 : fresh.centers[original.centers.findIndex(c => c.id === centerId)]?.id;
  return fresh.centers.some(c => c.id === id) ? id : null;
}
export function pairEndpoint(doc, id) {
  const organ = findOrgan(doc, id);
  if (organ)
    return organ.pair && findOrgan(doc, organ.pair) ? organ.pair : null;
  const found = findCenter(doc, id), twin = findOrgan(doc, found?.organ.pair);
  return twin ? matchingNode(found.organ, twin, id) : null;
}
const endpointSide = (doc, id) => organOf(doc, id).side < 0;
function wireLinks(doc, wire) {
  const from = pairEndpoint(doc, wire.from), to = pairEndpoint(doc, wire.to);
  if (!wire.pairing || (!from && !to) || from === wire.to)
    return [ {from : wire.from, to : wire.to} ];
  if (!from || !to) {
    const target = findOrgan(doc, wire.to);
    if (from && !isRegion(target) && target?.centers.length > 1 && wire.pairing !== 'both') {
      const side = organOf(doc, wire.from).side * (wire.pairing === 'crossed' ? -1 : 1);
      return [ {from : wire.from, to : wire.to, side}, {from, to : wire.to, side : -side} ];
    }
    const selected = {from : wire.from, to : wire.to},
          other = {from : from ?? wire.from, to : to ?? wire.to};
    return wire.pairing === 'both'      ? [ selected, other ]
           : wire.pairing === 'crossed' ? [ other ]
                                        : [ selected ];
  }
  const flip = endpointSide(doc, wire.from) !== endpointSide(doc, wire.to);
  const [near, far] = flip ? [ to, wire.to ] : [ wire.to, to ];
  const same = [ {from : wire.from, to : near}, {from, to : far} ],
        crossed = [ {from : wire.from, to : far}, {from, to : near} ];
  return wire.pairing === 'same'      ? same
         : wire.pairing === 'crossed' ? crossed
                                      : [...same, ...crossed ];
}
export function wireContactPairs(doc, wire, sites) {
  const index = new Map(allCenters(doc).map((center, i) => [center.id, i]));
  return new Set(
      routedLinks(doc, sites)
          .filter(link => link.wire.id === wire.id)
          .flatMap(link =>
                       senderNodes(doc, link.from)
                           .flatMap(source =>
                                        hearerNodes(doc, link.to)
                                            .filter(target => !link.side ||
                                                              findSite(sites, target.site)?.side ===
                                                                  link.side)
                                            .filter(target => validCellLink(
                                                        source, findSite(sites, source.site),
                                                        target, findSite(sites, target.site)))
                                            .map(target => index.get(source.id) + ':' +
                                                           index.get(target.id)))));
}
export function wireContacts(doc, wire, contacts, sites) {
  const pairs = wireContactPairs(doc, wire, sites);
  const sum =
      {count : 0, weight : 0, positive : 0, negative : 0, positiveWeight : 0, negativeWeight : 0};
  for (const bundle of contacts.map(contactBundle))
    if (pairs.has(bundle.from + ':' + bundle.to)) {
      sum.count += bundle.count;
      sum.positive += bundle.positive;
      sum.negative += bundle.negative;
      sum.weight += bundle.weight * bundle.count;
      sum.positiveWeight += bundle.positiveWeight * bundle.positive;
      sum.negativeWeight += bundle.negativeWeight * bundle.negative;
    }
  const mean = (total, n) => n ? total / n : 0;
  return {
    ...sum,
    weight : mean(sum.weight, sum.count),
    positiveWeight : mean(sum.positiveWeight, sum.positive),
    negativeWeight : mean(sum.negativeWeight, sum.negative)
  };
}
export const expandedWires = doc =>
    doc.wires.flatMap(wire => wireLinks(doc, wire).map(link => ({...link, wire})));
export function endpointCenters(doc, id) {
  return findOrgan(doc, id)?.centers ?? (findCenter(doc, id) ? [ findCenter(doc, id).center ] : []);
}
export function wireEndpointCenters(doc, id, port, dir) {
  const organ = findOrgan(doc, id);
  if (port != null)
    return slotCenters(organ, port, dir);
  if (ORGAN_BY_KEY[organ?.type]?.namedPorts)
    return [];
  return endpointCenters(doc, id).filter(
      c => (dir === 'in' ? c.role !== 'sensor' : c.role !== 'motor') &&
           (!isRegion(organ) || c.port === 'both' || c.port === dir));
}
export function chosenCenter(doc, item, profile = null) {
  if (!['center', 'organ'].includes(item?.kind))
    return null;
  const centers = endpointCenters(doc, item.id);
  return centers.find(center => center.profile === profile) ?? centers[0] ?? null;
}
const senderNodes = (doc, id) => endpointCenters(doc, id).filter(c => c.role !== 'motor');
function hearerNodes(doc, id) { return endpointCenters(doc, id).filter(c => c.role !== 'sensor'); }
export function selectionCenters(doc, item) {
  if (!item)
    return [];
  if (item.kind === 'center')
    return findCenter(doc, item.id) ? [ item.id ] : [];
  if (item.kind === 'organ')
    return findOrgan(doc, item.id)?.centers.map(center => center.id) ?? [];
  if (item.kind === 'slot') {
    const organ = findOrgan(doc, item.id), slot = organSlots(organ).find(s => s.key === item.slot);
    return slot ? slotCenters(organ, slot.key, slot.dir).map(c => c.id) : [];
  }
  if (item.kind === 'assembly')
    return assemblyCenters(doc, findAssembly(doc, item.id));
  return [];
}
function choiceEnds(doc, item) {
  if (item?.kind === 'slot')
    return selectionCenters(doc, item).length ? [ {id : item.id, port : item.slot} ] : [];
  const organ = item?.kind === 'organ' ? findOrgan(doc, item.id) : null;
  if (organ && organ.type !== 'brain')
    return [ {id : organ.id} ];
  return [
    ...new Set(
        selectionCenters(doc, item).map(id => item.kind === 'center' ? id : wholeEndpoint(doc, id)))
  ].map(id => ({id}));
}
export function connectSelections(doc, source, target, sites = null) {
  const starts = choiceEnds(doc, source), ends = choiceEnds(doc, target);
  let draft = doc;
  const wireIds = [];
  for (const from of starts)
    for (const to of ends) {
      const added =
          addWire(draft, from.id, to.id, null, sites, {fromPort : from.port, toPort : to.port});
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
  if (PAIRINGS.includes(patch.pairing) &&
      (pairEndpoint(draft, wire.from) || pairEndpoint(draft, wire.to)))
    wire.pairing = patch.pairing;
  return draft;
}
export function removeWire(doc, id) {
  const draft = copy(doc);
  draft.wires = draft.wires.filter(w => w.id !== id);
  return draft;
}
export function mirroredSite(site, sites) {
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
  if (matchingOrgan(draft, organ.type, -organ.side, sites, organFunction(organ, sites),
                    organ.type === 'muscle' ? finStroke(organ) : FIN_STROKE.back))
    return null;
  organ.pair = mirror.id;
  organ.linked = true;
  draft.organs.push(mirror);
  if (organ.field && !regenerateFields(draft, sites))
    return null;
  return {document : draft, organId : mirror.id, centerId : mirror.centers[0]?.id};
}
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
export const wiredCrossing = (doc, center, sites) =>
    senderCrossing(doc, {...center, crossing : null}, routedLinks(doc, sites), sidesOf(doc, sites));
function sidesOf(doc, sites) {
  const sides = new Map();
  for (const center of allCenters(doc)) {
    const site = findSite(sites, center.site);
    sides.set(center.id, onMidline(site) ? 0 : site?.side ?? 0);
  }
  return sides;
}
function senderCrossing(doc, center, links, sides) {
  const own = sides.get(center.id) ?? 0, whole = wholeEndpoint(doc, center.id);
  const reached = links.filter(l => l.from === center.id || l.from === whole)
                      .flatMap(l => endpointCenters(doc, l.to))
                      .filter(target => target.role !== 'sensor')
                      .map(target => sides.get(target.id) ?? 0)
                      .filter(side => side && own);
  if (reached.length && reached.every(side => side * own < 0))
    return 1;
  if (reached.length && reached.every(side => side * own > 0))
    return -1;
  return center.crossing;
}
export const validCellLink = (a, sa, b, sb) =>
    !!sa && !!sb &&
    ((a.role === 'sensor' && b.role === 'nerve') ||
     (a.role === 'nerve' && (b.role === 'nerve' || b.role === 'motor')));
export function compileDocument(doc, sites, effects = ATELIER_LIMITS.receptors) {
  validateDocument(doc);
  const groups = [], links = routedLinks(doc, sites), centers = allCenters(doc);
  const indices = new Map(centers.map((c, i) => [c.id, i]));
  const sides = sidesOf(doc, sites);
  const connections = [];
  const bundles = new Map();
  for (const link of links) {
    const sources = senderNodes(doc, link.from);
    const targets = hearerNodes(doc, link.to);
    for (const target of targets) {
      if (link.side && findSite(sites, target.site)?.side !== link.side)
        continue;
      const key = link.wire.id + ':' + link.to + ':' + target.id;
      for (const source of sources) {
        const from = indices.get(source.id), to = indices.get(target.id);
        if (from !== undefined && to !== undefined &&
            validCellLink(source, findSite(sites, source.site), target,
                          findSite(sites, target.site)) &&
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
        electrical_limit : center.electrical_limit,
        learning_tau : center.learning_tau,
        teaching_limit : center.teaching_limit,
        ...center.distribution,
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
        threshold : isSprintNode(organ, organ.centers.indexOf(center)) ? SPRINT_THRESHOLD
                                                                       : center.threshold,
        tau : center.tau,
        field : center.field,
        q1 : center.q1,
        q2 : center.q2,
        qwidth : center.qwidth,
        polarity : center.polarity,
        sign : center.sign,
        mode : center.mode,
        pace : center.pace,
        modulator : center.modulator,
        organ : organ.type === 'brain' ? doc.organs.length + indices.get(center.id)
                                       : doc.organs.indexOf(organ),
        open : organ.openContacts ? 1 : 0,
        crossing : senderCrossing(doc, center, links, sides),
        range : center.range,
        growth : {...center.growth},
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
