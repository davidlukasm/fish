import {HORMONE_EFFECT, HORMONES, MOTOR_KIND, PRESSURE_SOURCE, SENSE_KIND} from '../../schema.js';
import {NERVE_ROLE, onMidline, sideSign, SKIN_ROLE} from './layout.js';

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
export const isModulator = center => center.role === 'nerve' && nerveClass(center).modulator > .5;
export const isPacemaker = center => center.role === 'nerve' && nerveClass(center).pace > 0;
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
  {
    key : 'proximity',
    category : 'senses',
    scope : 'side',
    centers : [ sensor('distance', SENSE_KIND.proximity, 4) ]
  },
  {
    key : 'lateral',
    category : 'senses',
    scope : 'side',
    centers : [ sensor('current', SENSE_KIND.flow, 4, 'outer') ]
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
    ]
  },
  {
    key : 'bladder',
    category : 'internal',
    scope : 'single',
    nodes : 8,
    centers : [
      motor('float', MOTOR_KIND.bladder, 5, 'inner'),
      sensor('pressure', SENSE_KIND.inner_pressure, 3, 'inner')
    ]
  },
  {key : 'muscle', category : 'motor', nodes : Infinity, centers : [ motor('muscle', 'site', 4) ]},
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
    nodes : 16,
    centers : [
      motor('growth', MOTOR_KIND.eggs, 8, 'inner'), motor('release', MOTOR_KIND.eggs, 4, 'outer'),
      sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
    ],
    slots : [
      slot('trigger', 'in', [], false, 'release'), slot('fullness', 'out', [], false, 'pressure')
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
      slot('trigger', 'in', [], false, 'release'), slot('fullness', 'out', [], false, 'pressure')
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
      resolution : setting(2, 6, 3),
      contrast : setting(0, 2, 1, true),
      colours : setting(0, 1, 0, true)
    }
  },
  {
    key : 'olfactory',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 0, 1 ]) ],
    slots : [ slot('smell', 'in', [ 'nose' ], true), slot('onward', 'out', [], true) ],
    settings : {compare : setting(0, 2, 1, true)}
  },
  {
    key : 'hindbrain',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 2, 3 ]) ],
    slots : [ slot('alarm', 'in', [], true), slot('muscles', 'out', [ 'muscle' ], true) ],
    settings : {
      threshold : setting(0, 2, 1, true),
      tempo : setting(0, 1, 0, true),
      compare : setting(0, 2, 1, true),
      rhythm : setting(0, 2, 0, true)
    }
  },
  {
    key : 'spinal',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('pacemaker', 3, [ 2, 3 ]) ],
    slots : [ slot('steering', 'in'), slot('muscles', 'out', [ 'muscle' ], true) ],
    settings : {
      beat : setting(0, 2, 1, true),
      stroke : setting(0, 2, 1, true),
      steering : setting(0, 1, 1, true)
    }
  },
  {
    key : 'pallium',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('learn', 3, [ 1, 2 ]) ],
    slots : [ slot('senses', 'in', [], true), slot('onward', 'out', [], true) ],
    settings : {rate : setting(0, 2, 1, true), style : setting(0, 2, 2, true)}
  },
  {
    key : 'torus',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 1, 2 ]) ],
    slots : [ slot('flow', 'in', [ 'lateral' ], true), slot('onward', 'out', [], true) ],
    settings : {compare : setting(0, 2, 1, true)}
  },
  {
    key : 'cerebellum',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 2 ]) ],
    slots : [
      slot('motion', 'in', [], true),
      slot('balance', 'in', [ 'lateral', 'bladder' ], false, 'smooth'),
      slot('muscles', 'out', [ 'muscle' ], true)
    ],
    settings : {smoothing : setting(0, 2, 1, true), brake : setting(0, 2, 1, true)}
  },
  {
    key : 'hypothalamus',
    category : 'regions',
    scope : 'single',
    centers : [ nerve('relay', 3, [ 1 ]) ],
    slots : [
      slot('inner', 'in', [ 'gut', 'bladder', 'blood', 'eggs', 'sperm' ], true),
      slot('glands', 'out', [ 'gland' ], true), slot('drive', 'out')
    ],
    settings : {gain : setting(0, 2, 1, true), effect : setting(0, 1, 0, true)}
  }
].map(item => Object.freeze({
  ...item,
  // The centers of an organ that comes in pairs know it, to keep off the midline.
  centers : Object.freeze(item.scope === 'side'
                              ? item.centers.map(c => Object.freeze({...c, paired : true}))
                              : item.centers)
})));
export const isRegion = organ => ORGAN_BY_KEY[organ?.type]?.category === 'regions';
export const siteRole = type => type === 'brain' || isRegion({type}) ? NERVE_ROLE
                                : ORGAN_BY_KEY[type]?.skin           ? SKIN_ROLE
                                                                     : type;
export const ORGAN_BY_KEY = Object.freeze(Object.fromEntries(ORGANS.map(o => [o.key, o])));
const MUSCLES = Object.freeze(
    [ MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.turn, MOTOR_KIND.forward ]);
export const MUSCLE_LABEL_INDEX = new Map([
  [ MOTOR_KIND.forward, 0 ], [ MOTOR_KIND.turn, 1 ], [ MOTOR_KIND.suction, 2 ],
  [ MOTOR_KIND.aggression, 3 ]
]);

export const PRESSURE_OF = Object.freeze({
  eggs : {key : 'pressure', source : PRESSURE_SOURCE.eggs},
  sperm : {key : 'pressure', source : PRESSURE_SOURCE.sperm},
  bladder : {key : 'pressure', source : PRESSURE_SOURCE.bladder},
  gut : {key : 'fullness', source : PRESSURE_SOURCE.none}
});
export const MUSCLE_TRAITS = Object.freeze({
  [MOTOR_KIND.forward] : Object.freeze({q1 : 'undulation'}),
  [MOTOR_KIND.suction] : Object.freeze({q1 : 'gut_length'}),
  [MOTOR_KIND.aggression] : Object.freeze({q1 : 'blunt_teeth', q2 : 'jaw_length'})
});

export function functionFor(center, site) {
  if (center.functionCode !== 'site')
    return center.functionCode;
  return MUSCLES.find(code => (site.motors & (1 << code)) !== 0) ?? -1;
}
export const musclePlaces = (sites, code, side) => sites.filter(
    s => sideSign(s.side) === sideSign(side) && functionFor({functionCode : 'site'}, s) === code);
export function nodeLimit(organ, sites) {
  const most = ORGAN_BY_KEY[organ?.type]?.nodes ?? 0;
  return organ?.type === 'muscle' && organ.centers.length
             ? musclePlaces(sites, organFunction(organ, sites), organ.side).length
             : most;
}
export const kindNodes = organ => organ.centers.filter(c => c.key === organ.centers[0]?.key);
export const kindLimit = (organ, sites) =>
    nodeLimit(organ, sites) - (organ.centers.length - kindNodes(organ).length);
export function organFunction(organ, sites) {
  const first = organ.centers[0], site = first && sites?.find(s => s.id === first.site);
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
  const isOuter = site.outer;
  return code >= 0 && (mask & (1 << code)) !== 0 &&
         (center.surface === 'any' || (center.surface === 'outer') === isOuter);
}

export const MODULES = Object.freeze([
  {
    key : 'vision-steering',
    muscleZone : 2,
    organs : [ 'eye', 'tectum', 'muscle' ],
    connections : [ [ 0, 1, 'crossed' ], [ 1, 2 ] ]
  },
  {
    key : 'scent-suction',
    muscleZone : 1,
    organs : [ 'nose', 'olfactory', 'muscle' ],
    connections : [ [ 0, 1 ], [ 1, 2 ] ]
  },
  {
    key : 'rhythm-drive',
    muscleZone : 3,
    organs : [ 'spinal', 'muscle' ],
    connections : [ [ 0, 1 ] ]
  },
  {
    key : 'escape',
    muscleZone : 2,
    organs : [ 'lateral', 'hindbrain', 'muscle' ],
    connections : [ [ 0, 1 ], [ 1, 2, 'crossed' ] ]
  }
]);
