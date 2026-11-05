import {MOTOR_KIND, SENSE_KIND} from '../../schema.js';
import {onMidline} from './layout.js';

// Structural definitions only. Names, colours and controls live in the view.
export const ROLE = Object.freeze({sensor : 0, nerve : 1, motor : 2});
// zones: where in the body the Atelier offers the organ, when the engine allows more than makes
// sense to place it (smell cells grow on all the skin, a nose belongs to the head).
const sensor = (key, functionCode, copies = 3, surface = 'any', zones = null) =>
    Object.freeze({key, role : 'sensor', functionCode, copies, surface, zones});
const motor = (key, functionCode, copies = 3, surface = 'any') =>
    Object.freeze({key, role : 'motor', functionCode, copies, surface});

export const NEURONS = Object.freeze([
  {key : 'relay', sign : 1, mode : 0, pace : -1, modulator : -1},
  {key : 'inhibit', sign : -1, mode : 0, pace : -1, modulator : -1},
  {key : 'learn', sign : 1, mode : 1, pace : -1, modulator : -1},
  {key : 'pacemaker', sign : 1, mode : 0, pace : 1, modulator : -1},
  {key : 'modulate', sign : 1, mode : 0, pace : -1, modulator : 1}
]);
export const NEURON_BY_KEY = Object.freeze(Object.fromEntries(NEURONS.map(n => [n.key, n])));
// A brain region's nerve centers: a preset cell type, how many cells, the zones they lie in
// (inner sites only) and whether wires of the region as a whole enter (in), leave (out) or do
// both (both) at this center.
export const nerve = (key, copies, zones, port = 'both') => Object.freeze({
  key,
  role : 'nerve',
  functionCode : -1,
  copies,
  surface : 'inner',
  zones : Object.freeze(zones),
  port,
  ...NEURON_BY_KEY[key]
});
// A brain region's slot: where wires of the region as a whole come in (in) or go out (out), which
// organs fit there (any when none are named) and whether the region needs one there.
const slot = (key, dir, fits = [], required = false) =>
    Object.freeze({key, dir, fits : Object.freeze(fits), required});
// A brain region's own settings: whole numbers from least to most, starting at initial; named
// ones show their values by name.
const setting = (least, most, initial, named = false) =>
    Object.freeze({least, most, initial, named});
// How wires between the two sides of paired organs run: on each side (same), across the midline
// (crossed) or both.
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
    centers : [ sensor('contact', SENSE_KIND.touch, 3, 'outer') ]
  },
  {key : 'pain', category : 'senses', centers : [ sensor('injury', SENSE_KIND.damage, 3) ]},
  {
    key : 'blood',
    category : 'internal',
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
    centers : [
      motor('float', MOTOR_KIND.bladder, 5, 'inner'),
      sensor('pressure', SENSE_KIND.inner_pressure, 3, 'inner')
    ]
  },
  {key : 'muscle', category : 'motor', centers : [ motor('muscle', 'site', 4) ]},
  {
    key : 'defense',
    category : 'motor',
    centers : [ motor('armor', MOTOR_KIND.defense, 3, 'outer') ]
  },
  {
    key : 'pigment',
    category : 'motor',
    centers : [ motor('colour', MOTOR_KIND.pigment, 5, 'outer') ]
  },
  {
    key : 'eggs',
    category : 'reproduction',
    scope : 'single',
    centers : [
      motor('growth', MOTOR_KIND.eggs, 8, 'inner'), motor('release', MOTOR_KIND.eggs, 4, 'outer'),
      sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
    ]
  },
  {
    key : 'sperm',
    category : 'reproduction',
    scope : 'single',
    centers : [
      motor('growth', MOTOR_KIND.sperm, 8, 'inner'), motor('release', MOTOR_KIND.sperm, 4, 'outer'),
      sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
    ]
  },
  {key : 'gland', category : 'internal', centers : [ motor('secretion', MOTOR_KIND.gland, 5) ]},
  // Brain regions, one on each side. The optic tectum maps what the eyes see, fed across the
  // midline as the optic nerves cross in fish; the olfactory bulb takes the nose of its side; the
  // hindbrain's escape cells answer sudden stimuli and drive the far side's muscles away from
  // them; the spinal cord's rhythm cells drive their side and silence the other one through
  // crossing inhibitory cells, so the sides beat in turn.
  // The optic tectum keeps a map of what the eyes see: a node for each band of directions (and
  // colour type, when colours stay apart), and an output node that reports what stands out,
  // held down by contrast cells as much as asked where everything is lit alike.
  {
    key : 'tectum',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 3, [ 1, 2 ], 'in') ],
    pairing : {from : {eye : 'crossed', proximity : 'crossed'}},
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
    centers : [ nerve('relay', 4, [ 0, 1 ]) ]
  },
  {
    key : 'hindbrain',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('relay', 2, [ 1 ]) ],
    pairing : {to : {muscle : 'crossed'}}
  },
  {
    key : 'spinal',
    category : 'regions',
    scope : 'side',
    centers : [ nerve('pacemaker', 3, [ 2, 3 ]), nerve('inhibit', 3, [ 2, 3 ], 'none') ],
    circuit : [ [ 0, 1, 'same' ], [ 1, 0, 'crossed' ] ]
  }
].map(item => Object.freeze({
  ...item,
  // The centers of an organ that comes in pairs know it, to keep off the midline.
  centers : Object.freeze(item.scope === 'side'
                              ? item.centers.map(c => Object.freeze({...c, paired : true}))
                              : item.centers)
})));
export const isRegion = organ => ORGAN_BY_KEY[organ?.type]?.category === 'regions';
// The pairing a new wire between two paired organs takes: as the region on either end prefers
// for the other end's type, else on each side.
export function defaultPairing(fromType, toType) {
  return ORGAN_BY_KEY[toType]?.pairing?.from?.[fromType] ??
         ORGAN_BY_KEY[fromType]?.pairing?.to?.[toType] ?? 'same';
}

export const ORGAN_BY_KEY = Object.freeze(Object.fromEntries(ORGANS.map(o => [o.key, o])));
export const MUSCLES = Object.freeze(
    [ MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.turn, MOTOR_KIND.forward ]);
export const MUSCLE_LABEL_INDEX = new Map([
  [ MOTOR_KIND.forward, 0 ], [ MOTOR_KIND.turn, 1 ], [ MOTOR_KIND.suction, 2 ],
  [ MOTOR_KIND.aggression, 3 ]
]);

export function functionFor(center, site) {
  if (center.functionCode !== 'site')
    return center.functionCode;
  return MUSCLES.find(code => (site.motors & (1 << code)) !== 0) ?? -1;
}
// Nerve centers lie inside, organs on sites whose cells can do their work; organs of a pair keep
// off the midline, where both would meet.
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
    organs : [ 'eye', 'brain', 'muscle' ],
    circuits : [ 'relay' ],
    connections : [ [ 0, 0, 1, 0 ], [ 1, 0, 2, 0 ] ]
  },
  {
    key : 'scent-suction',
    muscleZone : 1,
    organs : [ 'nose', 'brain', 'muscle' ],
    circuits : [ 'relay' ],
    connections : [ [ 0, 0, 1, 0 ], [ 1, 0, 2, 0 ] ]
  },
  {
    key : 'rhythm-drive',
    muscleZone : 3,
    organs : [ 'brain', 'muscle' ],
    circuits : [ 'pacemaker' ],
    connections : [ [ 0, 0, 1, 0 ] ]
  }
]);
