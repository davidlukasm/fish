import {preferredScent} from '../../tuning.js';
import {clamp, degrees} from '../../units.js';
import {BARBEL, SEABED, SENSORY_PROBE, SKIN_RESPONSE} from '../../schema.js';
import {groupReport} from './document.js';
import {sideIndex, sideOf} from './layout.js';

export const PROBE_KIND = Object.freeze({
  nose : 'smell',
  barbels : 'taste',
  touch : 'touch',
  pain : 'wound',
  lateral : 'flow',
  balance : 'balance',
  defense : 'attack',
  pigment : 'ground',
  gut : 'gut'
});
export const STONE = -1;
export const ATTACK_GAPE = Object.freeze([ .5, 2.1 ]);
export const PROBE_LIMITS = Object.freeze(
    {least : {smell : 1}, most : {smell : 24, taste : 3, touch : 1, wound : .5, flow : 2}});
// A new scent starts just beyond the snout, so choosing it keeps the view; dragged further out,
// the view widens with it.
const START = Object.freeze({
  smell : {bearing : 40, distance : 1.6, strength : 0, flow : {bearing : 60, strength : .2}},
  taste : {bearing : 30, distance : 1.5, strength : 0},
  touch : {bearing : 90, distance : 0, strength : .25},
  wound : {bearing : 90, distance : 0, strength : SKIN_RESPONSE.bite_wound},
  flow : {bearing : 60, distance : 0, strength : .02},
  balance : {bearing : 90, distance : 0, strength : 0},
  attack : {bearing : 60, distance : 0, strength : 0, gape : 1.2},
  ground : {bearing : 0, distance : 0, strength : .35, buried : false},
  gut : {bearing : 0, distance : 0, strength : .5, nutrient : .2}
});
export function skinProbeBearing(document, anatomy, cellId) {
  const felt = document ? groupReport(document, anatomy, 'felt', cellId) : null;
  return felt?.length ? degrees(Math.atan2(felt.reduce((sum, [ aim ]) => sum + Math.sin(aim), 0),
                                           felt.reduce((sum, [ aim ]) => sum + Math.cos(aim), 0)))
                      : null;
}
export function probeFor(organ, probe, anatomy, document) {
  const kind = organ ? PROBE_KIND[organ.type] : null;
  if (!kind)
    return null;
  const side = sideOf(organ);
  const prior = probe?.kind === kind ? probe : null;
  const skin = (kind === 'touch' || kind === 'wound') && !prior?.manual;
  const bearing = skin ? skinProbeBearing(document, anatomy, organ.centers[0]?.id) : null;
  if (probe?.organ === organ.id)
    return bearing === null || bearing === probe.bearing ? probe : {...probe, bearing};
  const facing = kind === 'balance' ? 1 : prior ? prior.side === side ? 1 : -1 : side;
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
    bearing : bearing ?? (tip ? degrees(Math.atan2(across, tip[0])) : facing * scene.bearing),
    ...(tip ? {distance : Math.hypot(tip[0], across)} : {}),
    ...(scene.flow ? {flow : {...scene.flow, bearing : facing * scene.flow.bearing}} : {})
  };
}
export function groundColour(probe) {
  const {sediment_color, bare_surface_color, algae_color} = SEABED;
  const coverage = clamp(probe.strength);
  return probe.buried ? sediment_color
                      : bare_surface_color.map((value, i) => value + coverage * (algae_color[i] - value));
}
// The commands tried on the side fins go to the engine as they are (design.js, setFinCommand).
export const senseScene = probe => probe?.kind === 'fins' ? {kind : 'fins', phases : probe.phases}
                                   : probe && probe.kind !== 'ground' ? {
  kind : probe.kind,
  bearing : probe.bearing,
  distance : probe.kind === 'attack' ? probe.gape : probe.distance,
  strength : probe.strength,
  scent : probe.scent,
  nutrient : probe.nutrient ?? 0,
  ...(probe.flow ? {flowBearing : probe.flow.bearing, flowStrength : probe.flow.strength} : {})
}
                                         : null;
