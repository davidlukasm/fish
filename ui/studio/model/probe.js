import {preferredScent} from '../../tuning.js';
import {sideOf} from './layout.js';

export const PROBE_KIND =
    Object.freeze({nose : 'smell', touch : 'touch', pain : 'wound', lateral : 'flow', gut : 'gut'});
export const PROBE_LIMITS =
    Object.freeze({least : {smell : 1}, most : {smell : 24, touch : 1, wound : .5, flow : 2}});
// A new scent starts just beyond the snout, so choosing it keeps the view; dragged further out,
// the view widens with it.
const START = Object.freeze({
  smell : {bearing : 40, distance : 1.6, strength : 0, flow : {bearing : 60, strength : .2}},
  touch : {bearing : 90, distance : 0, strength : .05},
  wound : {bearing : 90, distance : 0, strength : .02},
  flow : {bearing : 60, distance : 0, strength : .02},
  gut : {bearing : 0, distance : 0, strength : .5, nutrient : .2}
});
export function probeFor(organ, probe) {
  const kind = organ ? PROBE_KIND[organ.type] : null;
  if (!kind)
    return null;
  if (probe?.organ === organ.id)
    return probe;
  const side = sideOf(organ);
  const prior = probe?.kind === kind ? probe : null;
  const facing = prior ? prior.side === side ? 1 : -1 : side;
  const scene = prior ?? START[kind], tuning = organ.centers[0];
  return {
    ...scene,
    organ : organ.id,
    kind,
    side,
    scent : prior?.scent ?? (kind === 'smell' && tuning ? preferredScent(tuning) : 0),
    bearing : facing * scene.bearing,
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
