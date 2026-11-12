import {clamp} from '../../units.js';

// How strong a stimulus is, as a share from the faintest the senses know (0) to the strongest (1).
// Light spans many orders of magnitude, so with a faintest light the share runs on a log scale.
const axisFraction = (stimulus, dimmest) =>
    dimmest ? 1 - Math.log(stimulus) / Math.log(dimmest) : stimulus;
export const stimulusOfShare = (share, dimmest) =>
    dimmest ? Math.exp(Math.log(dimmest) * (1 - share)) : share;
export const stimulusShare = (stimulus, dimmest) => clamp(axisFraction(stimulus, dimmest));
