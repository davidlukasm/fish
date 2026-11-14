import {BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';

// A learning cell hardens what it learns in the egg and in its first days: the paths that grew on
// its inputs' activity before hatching stay when those inputs later fall silent for long. The
// hardening fades with maturity (half at 0.3, near nothing from 0.4) and never turns into
// softening; later hardening comes from the consolidation system, which replaces this answer.
export const EGG_HARDENING = Object.freeze({
  active : 1,
  baseline : .5,
  sensitivity : -.5,
  half : .3,
  substance : BLOOD_SUBSTANCE.maturity,
  steepness : 3
});
export const ACTIVE_LEARNING = Object.freeze({
  [HORMONE_EFFECT.learning] : {active : 1, baseline : 1},
  [HORMONE_EFFECT.competition] : {active : 1, baseline : 1},
  [HORMONE_EFFECT.consolidation] : EGG_HARDENING
});
export const DEVELOPING_RELAY = Object.freeze({
  ...ACTIVE_LEARNING,
  // The embryonic rhythm lets initially weightless contacts grow; it stops at maturity.
  [HORMONE_EFFECT.rhythm] : {
    active : 1,
    baseline : .5,
    sensitivity : -2,
    half : .8,
    substance : HORMONES.levels,
    steepness : 3
  }
});
export const CIRCUIT_LEARNING =
    Object.freeze({qwidth : 1, electrical_limit : 1, teaching_limit : 1, learning_tau : 1});
export const TONIC_LEARNING =
    Object.freeze({...ACTIVE_LEARNING, [HORMONE_EFFECT.rhythm] : {active : 0}});

// Pacemaker periods from slow to fast, as cell time constants.
export const RHYTHM_TAU = Object.freeze([ 1, .6, .3 ]);
export const pacemakerCell = (node, tau, port = 'none') => ({
  node,
  preset : 'pacemaker',
  port,
  effects : ACTIVE_LEARNING,
  set : {...CIRCUIT_LEARNING, copies : 8, tau, threshold : -.5}
});

const REGION_CELLS = 4;
export function regionCell(node, preset, port, set = {}, effects = {}) {
  return {
    node,
    preset,
    port,
    effects : {...DEVELOPING_RELAY, ...effects},
    set : {
      ...CIRCUIT_LEARNING,
      copies : REGION_CELLS,
      // Four fully active presynaptic cells contribute at most one unit of electrical drive.
      electrical_limit : 1 / REGION_CELLS,
      field : .5,
      threshold : 0,
      tau : .5,
      q1 : 1,
      q2 : .5,
      pace : .6,
      ...set
    }
  };
}
export const neuralPlan = (nodes, inner, cross = []) =>
    ({nodes, inner, cross, route : () => null, view : null});
