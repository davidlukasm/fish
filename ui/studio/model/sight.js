// The test light in front of the eyes: a food-sized disc in a fully saturated light of one hue,
// at a bearing (degrees, right positive) and a distance (world units) from where one side looks
// from. It starts in the middle of the field it is brought to, REACH body radii away and SIZE
// body radii across.
const SIGHT = Object.freeze({reach : .5, size : .08, hue : 20});
export function defaultSight(organ, capabilities, anatomy) {
  const radius = anatomy?.bodyRadius;
  if (!(radius > 0) || !organ.field)
    return null;
  const side = organ.side < 0 ? -1 : 1, [ least, most ] = capabilities.sightRadius;
  return {
    side,
    bearing : side * (organ.field.lo + organ.field.hi) / 2,
    distance : Math.min(capabilities.visionRange, SIGHT.reach * radius),
    radius : Math.max(least, Math.min(most, SIGHT.size * radius)),
    hue : SIGHT.hue
  };
}
// The scene the design operation senses: the eye side as the engine counts it (0 left).
export const sightScene = probe => probe ? {
  side : probe.side < 0 ? 0 : 1,
  bearing : probe.bearing,
  distance : probe.distance,
  radius : probe.radius,
  hue : probe.hue
}
                                         : null;
