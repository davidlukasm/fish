import {clamp} from '../../units.js';
import {learningTimeSteps, planOfUnit, timeConstantSteps, unitOfPlan} from '../../tuning.js';

const EXAMPLE_COUNT = 9;
const ROLE_VALUE = Object.freeze({sensor : -1, nerve : 0, motor : 1});
const cellRole = value => value < -1 / 3 ? 0 : value > 1 / 3 ? 2 : 1;

// Marginal quantiles of draw_traits, not a simulated group of cells. Clipping precedes decoding;
// it creates repeated endpoint values, and time genes are logarithmic before they are drawn.
export function traitVariation(mean, spread, decode = value => value) {
  const width = 2 * clamp(spread), at = offset => decode(clamp(mean + width * offset, -1, 1));
  return {
    blueprint : at(0),
    extent : [ -1, 1 ].map(decode),
    interval : [ -1, 1 ].map(at),
    examples :
        width ? Array.from({length : EXAMPLE_COUNT}, (_, i) => at(2 * (i + .5) / EXAMPLE_COUNT - 1))
              : [ at(0) ]
  };
}
const row = (key, unit, mean, spread, decode, scale = 'linear') =>
    ({key, unit, scale, ...traitVariation(mean, spread, decode)});
const percent = value => 100 * unitOfPlan(value);

export function cellVariationExamples(center, family) {
  const spread = center.distribution[family];
  switch (family) {
  case 'spread_physiology':
    return [
      row('tau', 'steps', planOfUnit(center.tau), spread,
          value => timeConstantSteps(unitOfPlan(value)), 'log'),
      ...(center.role === 'nerve'
              ? [ row('learning_tau', 'steps', planOfUnit(center.learning_tau), spread,
                      value => learningTimeSteps(unitOfPlan(value)), 'log') ]
              : [])
    ];
  case 'spread_development':
    return [ row('groupRole', 'role', ROLE_VALUE[center.role], spread, cellRole) ];
  case 'spread_contacts':
    return [
      row('electrical_limit', 'percent', planOfUnit(center.electrical_limit), spread, percent),
      ...(center.role === 'nerve' ? [ row('teaching_limit', 'percent',
                                          planOfUnit(center.teaching_limit), spread, percent) ]
                                  : [])
    ];
  default:
    return [];
  }
}

export function receptorVariationExamples(receptor, wheel) {
  if (!wheel)
    return [];
  const spread = receptor.spread_receptors, [ low, high ] = wheel.halfRange;
  const half = Math.log(receptor.half / low) / Math.log(high / low);
  return [
    row('baseline', 'response', receptor.baseline, spread),
    row('sensitivity', 'response', receptor.sensitivity / wheel.sensitivitySpan, spread,
        value => value * wheel.sensitivitySpan),
    row('half', 'level', planOfUnit(half), spread, value => low * (high / low) ** unitOfPlan(value),
        'log')
  ];
}
