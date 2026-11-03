import {MOTOR_KIND, SENSE_KIND} from './schema.js';

// Structural definitions only. Names, colours and controls live in the view.
export const ROLE = Object.freeze({sensor: 0, nerve: 1, motor: 2});
const sensor = (key, functionCode, copies = 3, surface = 'any') =>
  Object.freeze({key, role: 'sensor', functionCode, copies, surface});
const motor = (key, functionCode, copies = 3, surface = 'any') =>
  Object.freeze({key, role: 'motor', functionCode, copies, surface});
const nerve = (key, copies = 4) =>
  Object.freeze({key, role: 'nerve', functionCode: -1, copies, surface: 'any'});

export const ORGANS = Object.freeze([
  {key: 'brain', category: 'brain', centers: [], fixed: true},
  {key: 'eye', category: 'senses', centers: [sensor('retina', SENSE_KIND.light, 6)]},
  {key: 'nose', category: 'senses', centers: [sensor('scent', SENSE_KIND.odor, 4, 'outer')]},
  {key: 'proximity', category: 'senses', centers: [sensor('distance', SENSE_KIND.proximity, 4)]},
  {key: 'lateral', category: 'senses', centers: [sensor('current', SENSE_KIND.flow, 4, 'outer')]},
  {key: 'touch', category: 'senses', centers: [sensor('contact', SENSE_KIND.touch, 3, 'outer')]},
  {key: 'pain', category: 'senses', centers: [sensor('injury', SENSE_KIND.damage, 3)]},
  {key: 'blood', category: 'internal', centers: [sensor('chemistry', SENSE_KIND.blood, 3, 'inner')]},
  {key: 'gut', category: 'internal', centers: [
    sensor('food', SENSE_KIND.intake, 4, 'inner'),
    sensor('fullness', SENSE_KIND.inner_pressure, 2, 'inner')
  ]},
  {key: 'bladder', category: 'internal', centers: [
    motor('float', MOTOR_KIND.bladder, 5, 'inner'),
    sensor('pressure', SENSE_KIND.inner_pressure, 3, 'inner')
  ]},
  {key: 'mouth', category: 'motor', centers: [
    motor('jaw', MOTOR_KIND.aggression, 6), motor('suction', MOTOR_KIND.suction, 5)
  ]},
  {key: 'fin', category: 'motor', centers: [motor('steering', MOTOR_KIND.turn, 5)]},
  {key: 'tail', category: 'motor', centers: [motor('propulsion', MOTOR_KIND.forward, 6)]},
  {key: 'muscle', category: 'motor', centers: [motor('muscle', 'site', 4)]},
  {key: 'defense', category: 'motor', centers: [motor('armor', MOTOR_KIND.defense, 3, 'outer')]},
  {key: 'pigment', category: 'motor', centers: [motor('colour', MOTOR_KIND.pigment, 5, 'outer')]},
  {key: 'eggs', category: 'reproduction', centers: [
    motor('growth', MOTOR_KIND.eggs, 8, 'inner'),
    motor('release', MOTOR_KIND.eggs, 4, 'outer'),
    sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
  ]},
  {key: 'sperm', category: 'reproduction', centers: [
    motor('growth', MOTOR_KIND.sperm, 8, 'inner'),
    motor('release', MOTOR_KIND.sperm, 4, 'outer'),
    sensor('pressure', SENSE_KIND.inner_pressure, 2, 'inner')
  ]},
  {key: 'gland', category: 'internal', centers: [motor('secretion', MOTOR_KIND.gland, 5)]}
].map(item => Object.freeze({...item, centers: Object.freeze(item.centers)})));

export const ORGAN_BY_KEY = Object.freeze(Object.fromEntries(ORGANS.map(o => [o.key, o])));
export const NEURONS = Object.freeze([
  {key: 'relay', sign: 1, mode: 0, pace: -1, modulator: -1},
  {key: 'inhibit', sign: -1, mode: 0, pace: -1, modulator: -1},
  {key: 'learn', sign: 1, mode: 1, pace: -1, modulator: -1},
  {key: 'pacemaker', sign: 1, mode: 0, pace: 1, modulator: -1},
  {key: 'modulate', sign: 1, mode: 0, pace: -1, modulator: 1}
]);
export const NEURON_BY_KEY = Object.freeze(Object.fromEntries(NEURONS.map(n => [n.key, n])));
export const MUSCLES = Object.freeze([
  MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.turn, MOTOR_KIND.forward
]);

export function functionFor(center, site) {
  if (center.functionCode !== 'site') return center.functionCode;
  return MUSCLES.find(code => (site.motors & (1 << code)) !== 0) ?? -1;
}
export function eligible(center, site) {
  if (!site) return false;
  if (center.role === 'nerve') return true;
  const code = functionFor(center, site);
  const mask = center.role === 'sensor' ? site.senses : site.motors;
  const isOuter = 1 - Math.max(site.w, Math.abs(2 * site.v - 1)) < .5;
  return code >= 0 && (mask & (1 << code)) !== 0 &&
    (center.surface === 'any' || (center.surface === 'outer') === isOuter);
}

export const MODULES = Object.freeze([
  {key: 'vision-steering', organs: ['eye', 'brain', 'fin'], circuits: ['relay'],
    connections: [[0, 0, 1, 0], [1, 0, 2, 0]]},
  {key: 'scent-suction', organs: ['nose', 'brain', 'mouth'], circuits: ['relay'],
    connections: [[0, 0, 1, 0], [1, 0, 2, 1]]},
  {key: 'rhythm-drive', organs: ['brain', 'tail'], circuits: ['pacemaker'],
    connections: [[0, 0, 1, 0]]}
]);
