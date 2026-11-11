import {HORMONE_EFFECT, HORMONES} from '../../schema.js';

export const ACTIVE_LEARNING = Object.freeze({
  [HORMONE_EFFECT.learning] : {active : 1, baseline : 1},
  [HORMONE_EFFECT.competition] : {active : 1, baseline : 1}
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
      // One fully active input population contributes at most one unit of electrical drive.
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
