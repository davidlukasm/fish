import {clamp} from '../../units.js';

export function nerveResponse(center, input, mean, {scale, excitation = 0, output = 1}) {
  const response = clamp(center.q2), level = Math.min(1, 2 * response),
        memory = Math.max(0, 2 * response - 1);
  const drive = (1 - memory) * input + (memory + level - 1) * mean;
  const value = Math.tanh(-scale * center.threshold + excitation + drive);
  return (value + clamp(center.q1) * (Math.max(0, value) - value)) * output;
}
