// What the chosen fish is doing, averaged over the last seconds so the readings settle instead
// of following single steps: swimming, turning, suction, biting, defence and digestion. The
// averages only move while the simulation advances; a new fish starts from its current values.
import {degrees, wrapAngle} from './units.js';
import {BEHAVIOR_SCALE, FISH} from './schema.js';
export const activity_modelState = {};

const SETTLE_MS = 1500;
const clamp = v => Math.max(0, Math.min(1, v || 0));

function sample(p) {
  return {
    speed : p[FISH.relative_speed] || 0,
    turn : 0,
    suction : p[FISH.suction_pose] || 0,
    bite : p[FISH.aggression] || 0,
    defense : p[FISH.defense] || 0,
    gut : p[FISH.satiety] || 0,
    digestion : p[FISH.digestion] || 0
  };
}

export function fishActivity(p, step, now) {
  let tracked = activity_modelState.tracked;
  if (!tracked || tracked.id !== p[FISH.id] || step < tracked.step)
    tracked = activity_modelState.tracked =
        {id : p[FISH.id], step, angle : p[FISH.angle], time : now, values : sample(p)};
  else if (step > tracked.step) {
    const raw = sample(p), turn = p[FISH.angle] - tracked.angle,
          share = 1 - Math.exp(-(now - tracked.time) / SETTLE_MS);
    raw.turn = degrees(Math.abs(wrapAngle(turn))) / (step - tracked.step);
    for (const key of Object.keys(raw))
      tracked.values[key] += (raw[key] - tracked.values[key]) * share;
    Object.assign(tracked, {step, angle : p[FISH.angle], time : now});
  }
  const v = tracked.values;
  // Speed and turning on a square-root scale of the behaviour limits, so ordinary values show.
  return [
    {key : 'speed', share : Math.sqrt(clamp(v.speed / BEHAVIOR_SCALE.speed)), amount : v.speed},
    {key : 'turn', share : Math.sqrt(clamp(v.turn / BEHAVIOR_SCALE.turn_degrees)), amount : v.turn},
    {key : 'suction', share : clamp(v.suction), amount : v.suction},
    {key : 'bite', share : clamp(v.bite), amount : v.bite},
    {key : 'defense', share : clamp(v.defense), amount : v.defense},
    {key : 'digestion', share : clamp(v.gut), amount : v.gut, rate : v.digestion}
  ];
}
