import {clamp} from '../../units.js';
import {learningTimeSteps} from '../../tuning.js';

// The same previously half-consolidated contact learns another half of its limit, then rests.
// Consolidation captures learning; during rest a positive response cannot add protection.
export function retainedLearning(response, time, constants) {
  let protection = .5 + Math.max(0, response) * .5 * (1 - .5), weight = 1;
  const steps = constants.baselineSteps;
  const loss = Math.log(2) / constants.baselineSteps + 1 / (constants.unusedDecaySpan * time);
  for (let step = 0; step < steps; ++step) {
    protection = clamp(protection - Math.max(0, -response) * protection / time);
    const d = loss * (1 - protection);
    weight *= 1 - d + d * d * (.5 - d / 6);
  }
  return {weight, protection, steps};
}

export const learningTime = center => learningTimeSteps(center.learning_tau);
