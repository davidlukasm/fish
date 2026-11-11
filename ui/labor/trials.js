import {TRIAL_KIND, TRIAL_LAB} from '../schema.js';

export const OUTCOME = Object.freeze({missed : 0, reached : 1, succeeded : 2});
export const trialKey = kind => Object.keys(TRIAL_KIND).find(key => TRIAL_KIND[key] === kind);
export const trialDistance = kind => TRIAL_LAB[trialKey(kind) + '_distance'];
export const trialSteps = kind => TRIAL_LAB[trialKey(kind) + '_steps'];
// Shells must crack; feed only needs eating.
const cracking = kind => kind === TRIAL_KIND.mussel || kind === TRIAL_KIND.crab;

// A feed trial succeeds when the fish eats, a mussel or crab trial when the shell cracks.
// Reaching is the step before: close to the food, or the mouth at the shell.
export function trialOutcome(trial, kind) {
  if (cracking(kind))
    return trial.cracked >= 0   ? OUTCOME.succeeded
           : trial.reached >= 0 ? OUTCOME.reached
                                : OUTCOME.missed;
  return trial.reached >= 0                     ? OUTCOME.succeeded
         : trial.closest <= TRIAL_LAB.feed_near ? OUTCOME.reached
                                                : OUTCOME.missed;
}
// When the trial succeeded, in steps.
export const successStep = (trial, kind) => cracking(kind) ? trial.cracked : trial.reached;

// Native events use a zero-based loop index, recorded after the tick.
export const sampleStep = frame => frame * TRIAL_LAB.path_every + 1;

export const trialPath = (trial, kind) =>
    trialOutcome(trial, kind) === OUTCOME.succeeded
        ? (trial.path ??
           []).slice(0, Math.floor(successStep(trial, kind) / TRIAL_LAB.path_every) + 1)
        : trial.path ?? [];

export function inspectedTrial(sessions, selection, fingerprint, kind) {
  if (!selection || selection.fingerprint !== fingerprint || selection.kind !== kind)
    return null;
  const trial = sessions.find(s => s.seed === selection.seed)?.trials?.[selection.index];
  if (!trial)
    return null;
  const path = trialPath(trial, kind);
  if (!path.length)
    return null;
  return {
    ...selection,
    trial,
    path,
    frame : Math.max(0, Math.min(path.length - 1, selection.frame))
  };
}

// Kept trial worlds of one fish and kind, overlaid by the running job when it tests the same.
export function shownSessions(overview, fingerprint, kind, job) {
  const kept = (overview?.results ?? [])
                   .find(r => r.fingerprint === fingerprint && r.trial === kind)
                   ?.seeds ??
               {};
  const sessions = new Map(Object.values(kept).map(s => [s.seed, s]));
  if (job && job.fingerprint === fingerprint && job.trial === kind)
    for (const s of job.runs)
      sessions.set(s.seed, s);
  return [...sessions.values() ].sort((a, b) => a.seed - b.seed);
}

export function trialTally(sessions, kind) {
  const trials = sessions.flatMap(s => s.trials ?? []),
        outcomes = trials.map(trial => trialOutcome(trial, kind));
  return {
    trials : trials.length,
    reached : outcomes.filter(o => o >= OUTCOME.reached).length,
    succeeded : outcomes.filter(o => o === OUTCOME.succeeded).length,
    done : sessions.filter(s => s.done).length
  };
}
