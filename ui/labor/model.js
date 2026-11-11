import {BREEDING} from '../schema.js';

export const START_FISH = Object.freeze([ 'brisa', 'start', 'plants' ]);
export const DRAFT = 'draft';
export const BREEDING_METRICS = Object.freeze([ 'population', 'feed', 'intake', 'reserve' ]);
const population = sample => sample.fish + sample.eggs;

export function sampleIntake(world, index) {
  const sample = world.samples[index], before = world.samples[index - 1];
  if (!before || sample.step <= before.step)
    return null;
  const diet = sample.diet.map((amount, kind) => Math.max(0, amount - before.diet[kind]));
  const total = diet.reduce((sum, amount) => sum + amount, 0);
  return {
    from : before.step,
    to : sample.step,
    diet,
    total,
    rate : total / (sample.step - before.step)
  };
}

export function sampleSeries(world, metric) {
  const samples = world.samples ?? [];
  if (metric === 'population')
    return [ 'fish', 'eggs' ].map(key => ({key, values : samples.map(s => s[key])}));
  const values = metric === 'feed' ? samples.map(s => s.availableFeed)
                 : metric === 'reserve'
                     ? samples.map(s => s.reserve[2] ?? null)
                     : samples.map((_, i) => sampleIntake(world, i)?.rate ?? null);
  return [ {key : metric, values} ];
}

export function inspectedWorld(worlds, selection, fingerprint, steps) {
  const current = selection?.fingerprint === fingerprint && selection.steps === steps;
  const world = (current && worlds.find(w => w.seed === selection.seed && w.samples?.length)) ||
                worlds.find(w => !w.done && w.samples?.length) ||
                worlds.find(w => w.samples?.length);
  if (!world)
    return null;
  const following = !current || world.seed !== selection.seed || selection.frame === null;
  const frame = following ? world.samples.length - 1
                          : Math.max(0, Math.min(world.samples.length - 1, selection.frame));
  return {
    world,
    frame,
    following,
    sample : world.samples[frame],
    intake : sampleIntake(world, frame)
  };
}

// A world proves the fish once tank-born generations have offspring of their own and the
// population is still alive when the run ends.
export function worldVerdict(world) {
  const samples = world.samples ?? [], last = samples.at(-1);
  const parents = samples.reduce((g, s) => Math.max(g, s.parents), -1);
  const alive = !!last && population(last) > 0;
  return {
    seed : world.seed,
    done : !!world.done,
    alive,
    reached : last?.step ?? 0,
    steps : world.steps,
    parents,
    peak : samples.reduce((n, s) => Math.max(n, population(s)), 0),
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
    for (const w of job.runs)
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
