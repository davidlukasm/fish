import {sideIndex, sideOf} from './layout.js';

const SIGHT = Object.freeze({reach : .5, size : .08, hue : 20});
export function defaultSight(organ, capabilities, anatomy) {
  const radius = anatomy?.bodyRadius;
  if (!(radius > 0) || !organ.field)
    return null;
  const side = sideOf(organ), [ least, most ] = capabilities.sightRadius;
  return {
    side,
    bearing : side * (organ.field.lo + organ.field.hi) / 2,
    distance : Math.min(capabilities.visionRange, SIGHT.reach * radius),
    radius : Math.max(least, Math.min(most, SIGHT.size * radius)),
    hue : SIGHT.hue
  };
}
export const sightScene = probe => probe ? {
  side : sideIndex(probe.side),
  bearing : probe.bearing,
  distance : probe.distance,
  radius : probe.radius,
  hue : probe.hue
}
                                         : null;
