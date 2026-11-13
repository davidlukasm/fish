import {HORMONE_EFFECT} from '../../schema.js';
import {DEATH_RESPONSE, receptorResponse} from './document.js';

// A cell along a run of blood situations in which one thing only rises (the maturity, or one
// substance's level): how fast it is built, how active it is, and whether it has died, which stays
// final once it happens.
export function lifeResponses(capabilities, center, contexts) {
  let dead = false;
  return contexts.map(context => {
    const response = (receptor, baseline = 0) =>
        receptorResponse(capabilities, receptor, context, baseline);
    dead ||= response(center.receptors[HORMONE_EFFECT.death]) > DEATH_RESPONSE;
    return {
      dead,
      birth : dead ? 0 : Math.max(0, response(center.growth, 1)),
      output : dead ? 0 : (1 + response(center.receptors[HORMONE_EFFECT.output], 1)) / 2
    };
  });
}
