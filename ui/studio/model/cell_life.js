import {HORMONE_EFFECT} from '../../schema.js';
import {DEATH_RESPONSE, receptorResponse} from './document.js';

// Maturity only rises. These samples hold the other substances fixed while it rises.
export function lifeResponses(capabilities, center, context, maturities) {
  let dead = false;
  return maturities.map(maturity => {
    const response = (receptor, baseline = 0) =>
        receptorResponse(capabilities, receptor, {...context, maturity}, baseline);
    dead ||= response(center.receptors[HORMONE_EFFECT.death]) > DEATH_RESPONSE;
    return {
      maturity,
      dead,
      birth : dead ? 0 : Math.max(0, response(center.growth, 1)),
      output : dead ? 0 : (1 + response(center.receptors[HORMONE_EFFECT.output], 1)) / 2
    };
  });
}
