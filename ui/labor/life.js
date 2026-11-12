import {shownWorlds} from './model.js';

export const LIFE_WINDOW = 400;
export const lifeKey = ({run, fishId}) => [run.fingerprint, run.steps, run.seed, fishId].join(':');
// A recorded scene belongs to a world and a step, whichever of its fish is chosen.
export const sceneKey =
    ({run, sceneStep}) => [run.fingerprint, run.steps, run.seed, sceneStep].join(':');

export function lifeWorlds(s) {
  return shownWorlds(s.overview, s.fingerprint, s.steps, s.job)
      .filter(w => Object.keys(w.lives ?? {}).length);
}

export const fishLives = world =>
    Object.values(world?.lives ?? {}).sort((a, b) => a.generation - b.generation || a.id - b.id);

export function atOrBefore(records, step, time = p => p.t) {
  let low = 0, high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (time(records[middle]) <= step)
      low = middle + 1;
    else
      high = middle;
  }
  return low ? records[low - 1] : null;
}

export function selectedLife(s) {
  const worlds = lifeWorlds(s), requested = s.lifeSelection;
  const sameRun = requested?.run.fingerprint === s.fingerprint && requested.run.steps === s.steps;
  const world = (sameRun && worlds.find(w => w.seed === requested.run.seed)) || worlds[0];
  if (!world)
    return null;
  const lives = fishLives(world);
  const summary =
      (sameRun && world.lives[requested.fishId]) || lives.find(l => l.hatch !== null) || lives[0];
  const run = {fingerprint : s.fingerprint, steps : s.steps, seed : world.seed};
  const selected = {run, fishId : summary.id};
  const chosen = sameRun && requested.run.seed === world.seed && requested.fishId === summary.id;
  const step =
      Math.max(summary.start,
               Math.min(summary.last, chosen && Number.isFinite(requested.step)
                                          ? requested.step
                                          : summary.firstIntake ?? summary.hatch ?? summary.start));
  const detail = s.lifeDetail?.key === lifeKey(selected) ? s.lifeDetail.data : null;
  return {
    ...selected,
    step,
    summary,
    detail,
    point : atOrBefore(detail?.points ?? [], step),
    sceneStep : atOrBefore(detail?.scenes ?? world.scenes ?? [], step, t => t)
  };
}

export function lifeTimes(selected) {
  return [
    ...new Set([
      selected.summary.start, selected.summary.last,
      ...(selected.detail?.points ?? []).map(p => p.t),
      ...(selected.detail?.events ?? []).map(e => e.t)
    ])
  ].sort((a, b) => a - b);
}

export function lifeWindow(selected, focused) {
  const {start, last} = selected.summary;
  if (!focused || last - start <= LIFE_WINDOW)
    return {from : start, to : Math.max(start + 1, last)};
  const from = Math.max(start, Math.min(last - LIFE_WINDOW, selected.step - LIFE_WINDOW / 2));
  return {from, to : from + LIFE_WINDOW};
}

export function nearestLifeTime(selected, step) {
  return lifeTimes(selected).reduce((best, t) =>
                                        Math.abs(t - step) < Math.abs(best - step) ? t : best);
}
