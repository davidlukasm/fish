import {preferredScent} from '../../tuning.js';
import {degrees} from '../../units.js';
import {BARBEL, SENSORY_PROBE} from '../../schema.js';
import {sideIndex, sideOf} from './layout.js';

export const PROBE_KIND = Object.freeze({
  nose : 'smell',
  barbels : 'taste',
  touch : 'touch',
  pain : 'wound',
  lateral : 'flow',
  gut : 'gut'
});
export const STONE = -1;
export const PROBE_LIMITS = Object.freeze(
    {least : {smell : 1}, most : {smell : 24, taste : 3, touch : 1, wound : .5, flow : 2}});
// A new scent starts just beyond the snout, so choosing it keeps the view; dragged further out,
// the view widens with it.
const START = Object.freeze({
  smell : {bearing : 40, distance : 1.6, strength : 0, flow : {bearing : 60, strength : .2}},
  taste : {bearing : 30, distance : 1.5, strength : 0},
  touch : {bearing : 90, distance : 0, strength : .05},
  wound : {bearing : 90, distance : 0, strength : .02},
  flow : {bearing : 60, distance : 0, strength : .02},
  gut : {bearing : 0, distance : 0, strength : .5, nutrient : .2}
});
export function probeFor(organ, probe, anatomy) {
  const kind = organ ? PROBE_KIND[organ.type] : null;
  if (!kind)
    return null;
  if (probe?.organ === organ.id)
    return probe;
  const side = sideOf(organ);
  const prior = probe?.kind === kind ? probe : null;
  const facing = prior ? prior.side === side ? 1 : -1 : side;
  const scene = prior ?? START[kind], tuning = organ.centers[0];
  const tip = !prior && kind === 'taste' && anatomy?.bodyRadius > 0
                  ? anatomy.barbelPlaces?.[sideIndex(side)]
                  : null;
  const across =
      tip ? tip[1] + side * (SENSORY_PROBE.radius + BARBEL.reach * .9) / anatomy.bodyRadius : 0;
  return {
    ...scene,
    organ : organ.id,
    kind,
    side,
    scent : prior?.scent ?? (kind === 'smell' && tuning ? preferredScent(tuning) : 0),
    bearing : tip ? degrees(Math.atan2(across, tip[0])) : facing * scene.bearing,
    ...(tip ? {distance : Math.hypot(tip[0], across)} : {}),
    ...(scene.flow ? {flow : {...scene.flow, bearing : facing * scene.flow.bearing}} : {})
  };
}
export const senseScene = probe => probe ? {
  kind : probe.kind,
  bearing : probe.bearing,
  distance : probe.distance,
  strength : probe.strength,
  scent : probe.scent,
  nutrient : probe.nutrient ?? 0,
  ...(probe.flow ? {flowBearing : probe.flow.bearing, flowStrength : probe.flow.strength} : {})
}
                                         : null;
