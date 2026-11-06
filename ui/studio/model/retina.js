import {degrees} from '../../units.js';
import {hueQuality} from '../../tuning.js';
import {VISION, TUNING} from '../../schema.js';
import {findSite, ZONE} from './layout.js';

// body_plan.cc::prepare_vision: directions and bin boundaries of the fixed head lattice; the
// eyes see HALF_VIEW degrees to each side (simulation_types.hh, GENERATED_HALF_VIEW).
export const HALF_VIEW = degrees(Math.PI * VISION.half_view);
export const bearing = site => HALF_VIEW * (.5 * (1 - site.u) + .5 * site.w);
// Sites share a lattice bearing when their bearings agree to the millionth of a degree.
const BEARING_SCALE = 1e6;
export const latticeBearing = site => Math.round(bearing(site) * BEARING_SCALE) / BEARING_SCALE;
// The head's sites on one side that look along a bin's bearing.
export const binSites = (sites, side, bin) =>
    sites.filter(s => s.zone === ZONE.head && s.side === side && latticeBearing(s) === bin.angle);
export function retinalBins(sites) {
  const angles = [...new Set(sites.filter(s => s.zone === ZONE.head).map(latticeBearing)) ].sort(
      (a, b) => a - b);
  return angles.map((angle, i) => ({
                      angle,
                      index : i,
                      lo : i ? (angles[i - 1] + angle) / 2 : 0,
                      hi : i + 1 < angles.length ? (angle + angles[i + 1]) / 2 : HALF_VIEW
                    }));
}
// A new eye looks REACH degrees to each side of its site's bearing, with DENSITY cells of
// RESOLUTION in each bin it covers. Its colour types answer at THRESHOLD, without opponency
// (q2 -1): its first sees all hues, each further one a band NEXT_WIDTH wide a golden angle around
// the hue circle on from the one before, so no two lie near each other.
const NEW_EYE = Object.freeze({reach : 32, density : 3, resolution : .2});
const NEW_PROFILE = Object.freeze({q2 : -1, threshold : -.6, first_width : 1, next_width : .15});
const GOLDEN_ANGLE = 137.508;
export function fieldRecipe(site, profileId) {
  const angle = bearing(site), P = NEW_PROFILE;
  return {
    lo : Math.max(0, angle - NEW_EYE.reach),
    hi : Math.min(HALF_VIEW, angle + NEW_EYE.reach),
    density : NEW_EYE.density,
    resolution : NEW_EYE.resolution,
    profiles :
        [ {id : profileId, q1 : 0, q2 : P.q2, qwidth : P.first_width, threshold : P.threshold} ]
  };
}
export function nextVisionProfile(field, id) {
  const P = NEW_PROFILE,
        hue = (field.profiles.length * GOLDEN_ANGLE) % (2 * TUNING.hue_half_circle);
  return {id, q1 : hueQuality(hue), q2 : P.q2, qwidth : P.next_width, threshold : P.threshold};
}
export const receptorWidth = field =>
    TUNING.visual_width_min * (TUNING.visual_width_max / TUNING.visual_width_min) ** field;

// Centers are compiler output of a whole-organ recipe. They never acquire independent positions.
export function generateRetina(organ, sites, used, create) {
  const {lo, hi, profiles, density, resolution} = organ.field;
  const bins = retinalBins(sites);
  const chosen = bins.filter(b => b.hi > lo && b.lo < hi);
  const previous = new Map(organ.centers.map(c => [c.id, c]));
  const centers = [];
  for (const bin of chosen) {
    const available = binSites(sites, organ.side, bin)
                          .filter(s => !used.has(s.id))
                          .sort((a, b) => a.v - b.v || a.u - b.u || a.id - b.id);
    if (!available.length)
      return null;
    // Sparse colour types interleave when a lattice bearing has fewer sites than profiles.
    const local = profiles.length <= available.length
                      ? profiles
                      : Array.from({length : available.length},
                                   (_, i) => profiles[(bin.index + i) % profiles.length]);
    for (const profile of local) {
      const id = `${organ.id}:${profile.id}:${bin.index}`;
      const old = previous.get(id);
      const index = Math.max(0, available.findIndex(s => s.id === old?.site));
      const site = available.splice(index, 1)[0];
      used.add(site.id);
      const base = old ?? organ.centers.find(c => c.profile === profile.id) ?? organ.centers[0] ??
                   create(site);
      centers.push({
        ...structuredClone(base),
        ...profile,
        id,
        profile : profile.id,
        site : site.id,
        copies : density,
        field : resolution
      });
    }
  }
  return profiles.every(p => centers.some(c => c.profile === p.id)) ? centers : null;
}
export function retinalRays(organ, sites) {
  const bins = retinalBins(sites);
  return organ.centers.flatMap(center => {
    const site = findSite(sites, center.site);
    if (!site)
      return [];
    const bin = bins.reduce(
        (best, b) =>
            Math.abs(b.angle - bearing(site)) < Math.abs(best.angle - bearing(site)) ? b : best);
    const width = receptorWidth(center.field);
    return Array.from({length : center.copies}, (_, i) => {
      const angle = site.side * (bin.lo + (bin.hi - bin.lo) * (i + .5) / center.copies);
      return {
        center : center.id,
        profile : center.profile,
        angle,
        left : Math.max(-HALF_VIEW, angle - width),
        right : Math.min(HALF_VIEW, angle + width)
      };
    });
  });
}
