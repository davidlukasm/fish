import {
  GILL_FILTER,
  GUT_MOTILITY,
  HORMONES,
  MOTOR_KIND,
  PRESSURE_SOURCE,
  SENSE_KIND
} from '../../schema.js';
import {findSite, NERVE_ROLE, onMidline, sideSign, SKIN_ROLE} from './layout.js';
import {REGION_TYPES} from './region_catalog.js';
import {RHYTHM_TAU} from './region_cells.js';
import {FIBRE_TYPES, fibreTau} from '../../fibre.js';

export const ROLE = Object.freeze({sensor : 0, nerve : 1, motor : 2});
export const STIMULUS_ORGAN = Object.freeze({
  light : 'eye',
  object : 'proximity',
  scent : 'nose',
  flow : 'lateral',
  touch : 'touch',
  pain : 'pain',
  food : 'gut'
});
// zones: where in the body the Atelier offers the organ, when the engine allows more than makes
// sense to place it (smell cells grow on all the skin, a nose belongs to the head).
const COPIES = 3;
// A barbel cell's receptive width is the share it feels by touch instead of tasting.
export const BARBEL_FEEL = Object.freeze({taste : 0, both : .5, touch : 1});
const sensor = (key, functionCode, copies = COPIES, surface = 'any', zones = null) =>
    Object.freeze({key, role : 'sensor', functionCode, copies, surface, zones});
const motor = (key, functionCode, copies = COPIES, surface = 'any') =>
    Object.freeze({key, role : 'motor', functionCode, copies, surface});

export const NEURONS = Object.freeze([
  {key : 'relay', sign : 1, mode : 1, pace : -1, modulator : -1},
  {key : 'inhibit', sign : -1, mode : 1, pace : -1, modulator : -1},
  {key : 'learn', sign : 1, mode : 1, pace : -1, modulator : -1, qwidth : .8},
  {key : 'pacemaker', sign : 1, mode : 1, pace : 1, modulator : -1},
  {key : 'modulate', sign : 1, mode : 1, pace : -1, modulator : 1}
]);
export const NEURON_BY_KEY = Object.freeze(Object.fromEntries(NEURONS.map(n => [n.key, n])));
export function nerveClass(center) {
  if (center.nativeClass)
    return center.nativeClass;
  const radius = Math.max(...['sign', 'mode', 'pace', 'modulator'].map(k => Math.abs(center[k])));
  if (!radius)
    return {sign : 1, mode : 0, pace : 0, modulator : 0};
  const strength = raw => {
    const x = Math.max(0, Math.min(1, ((raw / radius + 1) / 2 - .7) / .2));
    return x * x * (3 - 2 * x);
  };
  return {
    sign : center.sign >= 0 ? 1 : -1,
    mode : center.mode / radius,
    pace : strength(center.pace),
    modulator : strength(center.modulator)
  };
}
// A class names a cell only where it clearly dominates: region cells with half an own rhythm stay
// relays.
const DOMINANT_CLASS = .75;
export const isModulator = center =>
    center.role === 'nerve' && nerveClass(center).modulator > DOMINANT_CLASS;
export const isPacemaker = center =>
    center.role === 'nerve' && nerveClass(center).pace > DOMINANT_CLASS;
export const modeLean = mode => Math.sign(mode);
export const nerveKind = center => isModulator(center)   ? 'modulate'
                                   : isPacemaker(center) ? 'pacemaker'
                                   : center.sign < 0     ? 'inhibit'
                                   : center.qwidth >= .5 ? 'learn'
                                                         : 'relay';
export const nerve = (key, copies, zones) => Object.freeze({
  key,
  role : 'nerve',
  functionCode : -1,
  copies,
  surface : 'inner',
  zones : Object.freeze(zones),
  ...NEURON_BY_KEY[key]
});
const slot = (key, dir, fits = [], required = false, node = null) =>
    Object.freeze({key, dir, fits : Object.freeze(fits), required, node});
const setting = (least, most, initial, named = false) =>
    Object.freeze({least, most, initial, named});
export const PAIRINGS = Object.freeze([ 'same', 'crossed', 'both' ]);

export const ORGANS = Object.freeze([
  {key : 'brain', category : 'brain', centers : [], fixed : true},
  {
    key : 'eye',
    category : 'senses',
    scope : 'side',
    centers : [ sensor('retina', SENSE_KIND.light, 6) ]
  },
  {
    key : 'nose',
    category : 'senses',
    scope : 'side',
    types : 4,
    centers : [ sensor('scent', SENSE_KIND.odor, 4, 'outer', [ 0 ]) ]
  },
  // Barbels taste only what their tips touch; a nose smells the water.
  {
    key : 'barbels',
    category : 'senses',
    scope : 'side',
    types : 4,
    centers :
        [ {...sensor('taste', SENSE_KIND.taste, 3, 'outer', [ 0 ]), field : BARBEL_FEEL.both} ]
  },
  {
    key : 'proximity',
    category : 'senses',
    scope : 'side',
    centers : [ sensor('distance', SENSE_KIND.proximity, 4) ]
  },
  // Like the skin senses, a lateral line sits anywhere on the skin, as many on a side as wanted;
  // each feels the water where it lies.
  {
    key : 'lateral',
    category : 'senses',
    skin : true,
    centers : [ sensor('current', SENSE_KIND.flow, 4, 'outer') ]
  },
  // The same hair cells inside the body weigh their direction against gravity. q1 is the hair
  // direction, from the head (-1) over the flank (0) to the tail (1); the other side mirrors it.
  {
    key : 'balance',
    category : 'senses',
    scope : 'side',
    centers : [ {...sensor('gravity', SENSE_KIND.flow, 2, 'inner'), threshold : 0} ]
  },
  {
    key : 'touch',
    category : 'senses',
    skin : true,
    centers : [ sensor('contact', SENSE_KIND.touch, 3, 'outer') ]
  },
  {
    key : 'pain',
    category : 'senses',
    skin : true,
    centers : [ sensor('injury', SENSE_KIND.damage, 3) ]
  },
  {
    key : 'blood',
    category : 'internal',
    scope : 'single',
    types : HORMONES.levels + HORMONES.signs,
    centers : [ sensor('chemistry', SENSE_KIND.blood, 3, 'inner') ]
  },
  {
    key : 'gut',
    category : 'internal',
    scope : 'single',
    centers : [
      sensor('food', SENSE_KIND.intake, 4, 'inner'),
      sensor('fullness', SENSE_KIND.inner_pressure, 2, 'inner')
    ],
    slots :
        [ slot('intake', 'out', [], false, 'food'), slot('fullness', 'out', [], false, 'fullness') ]
  },
  // Smooth muscle in the gut wall moves the food along: a hurried gut empties sooner and keeps
  // less of what passes. It works for hours, so it starts with enduring fibres.
  {
    key : 'gutmuscle',
    category : 'internal',
    scope : 'single',
    bilateral : true,
    nodes : 8,
    initialNodes : 2,
    centers : [ Object.freeze(
        {...motor('motility', MOTOR_KIND.turn, 4, 'gutwall'), tau : fibreTau(FIBRE_TYPES.slow)}) ]
  },
  {
    key : 'bladder',
    category : 'internal',
    scope : 'single',
    nodes : 8,
    initialNodes : 3,
    centers : [
      motor('float', MOTOR_KIND.bladder, 16, 'inner'),
      sensor('pressure', SENSE_KIND.inner_pressure, 3, 'inner')
    ]
  },
  {key : 'muscle', category : 'motor', nodes : Infinity, centers : [ motor('muscle', 'site', 16) ]},
  // Gill covers on the flanks of the head pump water through the open mouth; q1 is how densely
  // their rakers stand. They pump all day, so they start with enduring fibres.
  {
    key : 'gills',
    category : 'motor',
    scope : 'single',
    bilateral : true,
    nodes : 8,
    initialNodes : 2,
    centers : [ Object.freeze(
        {...motor('pump', MOTOR_KIND.suction, 8, 'flank'), tau : fibreTau(FIBRE_TYPES.slow)}) ]
  },
  {
    key : 'defense',
    category : 'motor',
    skin : true,
    nodes : 8,
    centers : [ motor('armor', MOTOR_KIND.defense, 3, 'outer') ]
  },
  {
    key : 'pigment',
    category : 'motor',
    scope : 'single',
    nodes : 24,
    types : 4,
    centers : [ Object.freeze({...motor('colour', MOTOR_KIND.pigment, 5, 'outer'), qwidth : 1}) ]
  },
  {
    key : 'eggs',
    category : 'reproduction',
    scope : 'single',
    bilateral : true,
    // Sixteen motor chambers reach the engine's storage ceiling; two cells sense their filling.
    nodes : 18,
    initialNodes : 14,
    centers : [
      motor('growth', MOTOR_KIND.eggs, 8, 'inner'), motor('release', MOTOR_KIND.eggs, 4, 'outer'),
      sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
    ],
    slots : [
      slot('storage', 'in', [], false, 'growth'), slot('trigger', 'in', [], false, 'release'),
      slot('fullness', 'out', [], false, 'pressure')
    ]
  },
  {
    key : 'sperm',
    category : 'reproduction',
    scope : 'single',
    bilateral : true,
    nodes : 16,
    centers : [
      motor('growth', MOTOR_KIND.sperm, 8, 'inner'), motor('release', MOTOR_KIND.sperm, 4, 'outer'),
      sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
    ],
    slots : [
      slot('storage', 'in', [], false, 'growth'), slot('trigger', 'in', [], false, 'release'),
      slot('fullness', 'out', [], false, 'pressure')
    ]
  },
  {key : 'gland', category : 'internal', centers : [ motor('secretion', MOTOR_KIND.gland, 5) ]},
  {
    key : 'tectum',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 1, 2 ]) ],
    slots : [
      slot('sight', 'in', [ 'eye' ], true), slot('near', 'in', [ 'proximity' ]),
      slot('onward', 'out', [], true)
    ],
    settings : {
      resolution : setting(1, 6, 3),
      contrast : setting(0, 2, 0, true),
      colours : setting(0, 1, 0, true)
    }
  },
  {
    key : 'motor',
    category : 'regions',
    scope : 'side',
    namedPorts : true,
    centers : [ nerve('relay', 4, [ 1, 2, 3 ]) ],
    // Inputs name the side of the stimulus; one input may reach several nodes.
    slots : organ =>
        [slot('toward', 'in', [], false, [ 'turn', 'oppose' ]),
         slot('away', 'in', [], false, 'flee'),
         slot('feel', 'in', [ 'balance', 'touch', 'lateral' ], false, 'flee'),
         slot('urge', 'in', [], false, 'swim'), slot('brake', 'in', [], false, 'brake'),
         slot('near', 'in', [], false, [ 'brake', 'mouth', 'hold' ]),
         slot('grip', 'in', [], false, 'bite'),
         slot('full', 'in', [], false,
              organ.centers.some(c => c.node === 'gut') ? [ 'sated', 'gut' ] : 'sated'),
         slot('contact', 'in', [], false, 'lift'),
         ...(organ.region.retreat ? [ slot('back', 'in', [], false, 'retreat') ] : []),
         slot('fins', 'out', [], true, organ.region.retreat ? [ 'turn', 'backStop' ] : 'turn'),
         slot('tail', 'out', [], true, 'swim'),
         ...(organ.pair ? [ slot('escape', 'out', [], false, 'escape') ] : []),
         slot('mouth', 'out', [], false, 'mouth'), slot('bite', 'out', [], false, 'bite'),
         ...(organ.centers.some(c => c.node === 'gills')
                 ? [ slot('gills', 'out', [], false, 'gills') ]
                 : []),
         ...(organ.centers.some(c => c.node === 'gut') ? [ slot('gut', 'out', [], false, 'gut') ]
                                                       : []),
         slot('lift', 'out', [], false, 'lift'),
         ...(organ.region.retreat ? [ slot('reverse', 'out', [], false, 'reverse') ] : [])],
    settings : {
      tone : setting(0, 2, 1, true),
      compete : setting(0, 1, 1, true),
      retreat : setting(0, 1, 0, true),
      beat : setting(0, RHYTHM_TAU.length, 0, true),
      pump : setting(0, RHYTHM_TAU.length, 0, true)
    }
  },
  ...REGION_TYPES
].map(item => Object.freeze({
  ...item,
  // The centers of an organ that comes in pairs know it, to keep off the midline.
  centers : Object.freeze(item.scope === 'side' && !item.midline
                              ? item.centers.map(c => Object.freeze({...c, paired : true}))
                              : item.centers)
})));
export const isRegion = organ => ORGAN_BY_KEY[organ?.type]?.category === 'regions';
export const organSlots = organ => {
  const slots = ORGAN_BY_KEY[organ?.type]?.slots;
  return typeof slots === 'function' ? slots(organ) : slots ?? [];
};
export function slotCenters(organ, key, dir) {
  const slot = organSlots(organ).find(s => s.key === key && s.dir === dir);
  if (!slot)
    return [];
  return organ.centers.filter(c => (dir === 'in' ? c.role !== 'sensor' : c.role !== 'motor') &&
                                   (slot.node
                                        ? [ slot.node ].flat().includes(c.node ?? c.key)
                                        : !isRegion(organ) || c.port === 'both' || c.port === dir));
}
export const siteRole = type => type === 'brain' || isRegion({type}) ? NERVE_ROLE
                                : ORGAN_BY_KEY[type]?.skin           ? SKIN_ROLE
                                                                     : type;
export const ORGAN_BY_KEY = Object.freeze(Object.fromEntries(ORGANS.map(o => [o.key, o])));
// Where a site allows several works, a muscle does the first: at the front of the tail zone the
// tail, while a pelvic fin muscle takes the fin there.
const MUSCLES = Object.freeze(
    [ MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.forward, MOTOR_KIND.turn ]);
export const MUSCLE_LABEL_INDEX = new Map([
  [ MOTOR_KIND.forward, 0 ], [ MOTOR_KIND.turn, 1 ], [ MOTOR_KIND.suction, 2 ],
  [ MOTOR_KIND.aggression, 3 ]
]);
// The pelvic fin muscle's title follows the four works in the list of muscle titles.
export const PELVIC_LABEL_INDEX = MUSCLE_LABEL_INDEX.size;
export const muscleLabelIndex = (code, pelvic = false) =>
    pelvic && code === MOTOR_KIND.turn ? PELVIC_LABEL_INDEX : MUSCLE_LABEL_INDEX.get(code);

export const PRESSURE_OF = Object.freeze({
  eggs : {key : 'pressure', source : PRESSURE_SOURCE.eggs},
  sperm : {key : 'pressure', source : PRESSURE_SOURCE.sperm},
  bladder : {key : 'pressure', source : PRESSURE_SOURCE.bladder},
  gut : {key : 'fullness', source : PRESSURE_SOURCE.none}
});
export const MUSCLE_TRAITS = Object.freeze({
  [MOTOR_KIND.forward] : Object.freeze({q1 : 'undulation'}),
  [MOTOR_KIND.aggression] : Object.freeze({q1 : 'blunt_teeth', q2 : 'jaw_length'})
});

export function functionFor(center, site) {
  if (center.functionCode !== 'site')
    return center.functionCode;
  return MUSCLES.find(code => (site.motors & (1 << code)) !== 0) ?? -1;
}
const MUSCLE_CELL = Object.freeze({role : 'motor', functionCode : 'site', surface : 'any'});
// A pelvic fin muscle's cells are fin cells by themselves, at the sites only they may take.
export const PELVIC_CELL =
    Object.freeze({role : 'motor', functionCode : MOTOR_KIND.turn, surface : 'any', pelvic : true});
const bit = code => 1 << code;
export const isPelvicSite = site => !!site && (site.motors & bit(MOTOR_KIND.turn)) !== 0 &&
                                    (site.motors & bit(MOTOR_KIND.forward)) !== 0;
export const isPelvicMuscle = organ => organ?.type === 'muscle' && !!organ.centers[0]?.pelvic;
export const musclePlaces = (sites, code, side, pelvic = false) => {
  const cell = pelvic ? PELVIC_CELL : MUSCLE_CELL;
  return sites.filter(s => sideSign(s.side) === sideSign(side) && functionFor(cell, s) === code &&
                           eligible(cell, s));
};
export function nodeLimit(organ, sites) {
  const most = ORGAN_BY_KEY[organ?.type]?.nodes ?? 0;
  return organ?.type === 'muscle' && organ.centers.length
             ? musclePlaces(sites, organFunction(organ, sites), organ.side, isPelvicMuscle(organ))
                   .length
             : most;
}
export const kindNodes = organ => organ.centers.filter(c => c.key === organ.centers[0]?.key);
export const kindLimit = (organ, sites) =>
    nodeLimit(organ, sites) - (organ.centers.length - kindNodes(organ).length);
export function organFunction(organ, sites) {
  const first = organ.centers[0], site = first && sites && findSite(sites, first.site);
  return site ? functionFor(first, site) : -1;
}
export function fitsOrgan(type, center, site) {
  const desc = ORGAN_BY_KEY[type]?.centers.find(c => c.key === center.key);
  return eligible(desc?.zones ? {...center, zones : desc.zones} : center, site);
}
export function eligible(center, site) {
  if (!site || (center.zones && !center.zones.includes(site.zone)))
    return false;
  if (center.paired && onMidline(site))
    return false;
  if (center.role === 'nerve')
    return !center.surface || center.surface === 'any' ||
           (center.surface === 'outer') === site.outer;
  const code = functionFor(center, site);
  const mask = center.role === 'sensor' ? site.senses : site.motors;
  const outer = center.surface === 'outer' || center.surface === 'flank';
  // Suction cells on the head's flanks pump the gills, fin cells in the gut wall move the gut and
  // fin cells at the front of the tail zone make pelvic fins, so only gills, gut muscle and pelvic
  // fin muscles may take those places.
  if (center.role === 'motor' && code === MOTOR_KIND.suction &&
      isGillFlank(site) !== (center.surface === 'flank'))
    return false;
  if (center.role === 'motor' && code === MOTOR_KIND.turn &&
      (isGutWall(site) !== (center.surface === 'gutwall') ||
       isPelvicSite(site) !== !!center.pelvic))
    return false;
  return code >= 0 && (mask & (1 << code)) !== 0 &&
         (center.surface === 'any' || outer === site.outer);
}
export const isGillFlank = site => !!site?.outer && site.w > GILL_FILTER.flank;
export const isGutWall = site =>
    !!site && !site.outer && site.zone === GUT_MOTILITY.zone && site.w < GUT_MOTILITY.wall;

export const MODULES = Object.freeze([ {
  key : 'vision-steering',
  muscleFunction : MOTOR_KIND.turn,
  organs : [ 'eye', 'tectum', 'muscle' ],
  connections : [ [ 0, 1, 'crossed' ], [ 1, 2 ] ]
} ]);
