import {BREEDING} from '../schema.js';

// Columns of a world sample as the breeding service sends them.
export const SAMPLE = Object.freeze({step : 0, fish : 1, generation : 2, parents : 3});
export const START_FISH = Object.freeze([ 'brisa', 'start', 'plants' ]);
export const DRAFT = 'draft';

// A world proves the fish once tank-born generations have offspring of their own and the
// population is still alive when the run ends.
export function worldVerdict(world) {
  const samples = world.samples ?? [], last = samples.at(-1);
  const parents = samples.reduce((g, s) => Math.max(g, s[SAMPLE.parents]), -1);
  const alive = !!last && last[SAMPLE.fish] > 0;
  return {
    seed : world.seed,
    done : !!world.done,
    alive,
    reached : last?.[SAMPLE.step] ?? 0,
    steps : world.steps,
    parents,
    peak : samples.reduce((n, s) => Math.max(n, s[SAMPLE.fish]), 0),
    proven : !!world.done && alive && parents >= BREEDING.proven_generations
  };
}

// The fish is proven when every finished world proves it and there are enough of them.
export function breedingVerdict(worlds) {
  const verdicts = worlds.map(worldVerdict), done = verdicts.filter(v => v.done);
  const proven = done.filter(v => v.proven).length;
  return {
    worlds : verdicts,
    done : done.length,
    proven,
    parents : verdicts.reduce((g, v) => Math.max(g, v.parents), -1),
    passed : proven >= BREEDING.proven_worlds && proven === done.length
  };
}

// Results of one fish and step count: kept worlds, overlaid by the running job when it breeds
// the same fish.
export function shownWorlds(overview, fingerprint, steps, job) {
  const kept = (overview?.results ?? [])
                   .find(r => r.fingerprint === fingerprint && r.steps === steps)
                   ?.worlds ??
               {};
  const worlds = new Map(Object.values(kept).map(w => [w.seed, w]));
  if (job && job.fingerprint === fingerprint && job.steps === steps)
    for (const w of job.worlds)
      worlds.set(w.seed, w);
  return [...worlds.values() ].sort((a, b) => a.seed - b.seed);
}

// The best kept result per fish, for the shelf: the longest proven run, else the longest run.
export function shelfVerdict(overview, fingerprint) {
  const runs = (overview?.results ?? []).filter(r => r.fingerprint === fingerprint);
  const verdicts = runs.map(r => ({steps : r.steps, ...breedingVerdict(Object.values(r.worlds))}));
  verdicts.sort((a, b) => (b.passed - a.passed) || (b.steps - a.steps));
  return verdicts[0] ?? null;
}

export const deathTotals = worlds => {
  const totals = {};
  for (const w of worlds)
    for (const [cause, n] of Object.entries(w.deaths ?? {}))
      totals[cause] = (totals[cause] ?? 0) + n;
  return totals;
};
