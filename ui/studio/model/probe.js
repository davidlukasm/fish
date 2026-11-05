import {scentAffinities} from '../../tuning.js';

// The test stimulus of a sense besides sight, as the atelier's design view senses it without a
// brain: a nose smells a scent source, touch cells feel a touch on the skin, pain cells a bite
// into it, the lateral line water streaming against the body. It comes from a bearing (degrees,
// 0 ahead, positive towards side +1). A scent lies LEAST to MOST body radii away; a touch (its
// impact), a bite (the share of the health it takes) or a current (world units a step) is up to
// MOST strong, from the engine's faintest stimulus on, as the senses answer intensities.
export const PROBE_KIND =
    Object.freeze({nose : 'smell', touch : 'touch', pain : 'wound', lateral : 'flow'});
export const PROBE_LIMITS =
    Object.freeze({least : {smell : 1}, most : {smell : 3, touch : 1, wound : .5, flow : 2}});
// A new probe of each kind starts at START, turned to the organ's side.
const START = Object.freeze({
  smell : {bearing : 40, distance : 1.8, strength : 0},
  touch : {bearing : 90, distance : 0, strength : .05},
  wound : {bearing : 90, distance : 0, strength : .02},
  flow : {bearing : 0, distance : 0, strength : .02}
});
const sideOf = organ => organ.side < 0 ? -1 : 1;
// The probe an organ brings: its own, the one of the same kind it follows mirrored to its side,
// or a new one (a nose's of the scent it prefers); null for an organ without a probe.
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
  const tuning = organ.centers[0],
        affinity = kind === 'smell' && tuning ? scentAffinities(tuning.q1, tuning.q2, tuning.qwidth)
                                              : [ 0 ];
  return {
    organ : organ.id,
    kind,
    side,
    scent : affinity.indexOf(Math.max(...affinity)),
    ...START[kind],
    bearing : side * START[kind].bearing
  };
}
// The scene the design operation senses.
export const senseScene = probe => probe ? {
  kind : probe.kind,
  bearing : probe.bearing,
  distance : probe.distance,
  strength : probe.strength,
  scent : probe.scent
}
                                         : null;
