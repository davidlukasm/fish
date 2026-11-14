import {BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';

// How long a newly formed cell is in its early phase, as the share of the span the engine counts a
// cell's maturity over (4096 steps): 0.5 is 2048 steps, one trial of a new contact into a cell
// that learns at the regions' usual pace. A FIRST VALUE, NOT CALIBRATED: it holds for no fish in
// particular, and an organ that needs another sets its own.
export const YOUNG_CELL_HALF = .5;
// A learning cell hardens what it learns while it is young: the paths that grew on its inputs'
// early activity stay when those inputs later fall silent for long. The hardening fades with the
// cell's own maturity and never turns into softening; later hardening comes from the
// consolidation system, which replaces this answer.
export const EGG_HARDENING = Object.freeze({
  active : 1,
  baseline : .5,
  sensitivity : -.5,
  half : YOUNG_CELL_HALF,
  substance : BLOOD_SUBSTANCE.cell_maturity,
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
// A share of pacemaker in every developing cell, so that its embryonic rhythm can sound.
export const DEVELOPING_PACE = .6;
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
      pace : DEVELOPING_PACE,
      ...set
    }
  };
}
export const neuralPlan = (nodes, inner, cross = []) =>
    ({nodes, inner, cross, route : () => null, view : null});
