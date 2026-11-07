import {preferredScent} from '../../tuning.js';
import {sideOf} from './layout.js';

export const PROBE_KIND =
    Object.freeze({nose : 'smell', touch : 'touch', pain : 'wound', lateral : 'flow'});
export const PROBE_LIMITS =
    Object.freeze({least : {smell : 1}, most : {smell : 24, touch : 1, wound : .5, flow : 2}});
const START = Object.freeze({
  smell : {bearing : 40, distance : 8, strength : 0},
  touch : {bearing : 90, distance : 0, strength : .05},
  wound : {bearing : 90, distance : 0, strength : .02},
  flow : {bearing : 60, distance : 0, strength : .02}
});
export function probeFor(organ, probe) {
  const kind = organ ? PROBE_KIND[organ.type] : null;
  if (!kind)
    return null;
  if (probe?.organ === organ.id)
    return probe;
  const side = sideOf(organ);
  if (probe?.kind === kind)
    return {
      ...probe,
      organ : organ.id,
      side,
      bearing : probe.side === side ? probe.bearing : -probe.bearing
    };
  const tuning = organ.centers[0];
  return {
    organ : organ.id,
    kind,
    side,
    scent : kind === 'smell' && tuning ? preferredScent(tuning) : 0,
    ...START[kind],
    bearing : side * START[kind].bearing
  };
}
export const senseScene = probe => probe ? {
  kind : probe.kind,
  bearing : probe.bearing,
  distance : probe.distance,
  strength : probe.strength,
  scent : probe.scent
}
                                         : null;
