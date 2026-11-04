import {VISION, TUNING} from '../../schema.js';

// body_plan.cc::prepare_vision: directions and bin boundaries of the fixed head lattice.
export const HALF_VIEW = 180 * VISION.half_view;
export const bearing = site => HALF_VIEW * (.5 * (1 - site.u) + .5 * site.w);
export function retinalBins(sites) {
  const angles = [
    ...new Set(sites.filter(s => s.zone === 1).map(s => Math.round(bearing(s) * 1e6) / 1e6))
  ].sort((a, b) => a - b);
  return angles.map((angle, i) => ({
                      angle,
                      index : i,
                      lo : i ? (angles[i - 1] + angle) / 2 : 0,
                      hi : i + 1 < angles.length ? (angle + angles[i + 1]) / 2 : HALF_VIEW
                    }));
}
export function fieldRecipe(site, profileId) {
  const angle = bearing(site);
  return {
    lo : Math.max(0, angle - 32),
    hi : Math.min(HALF_VIEW, angle + 32),
    density : 3,
    resolution : .2,
    profiles : [ {id : profileId, q1 : 0, q2 : -1, qwidth : 1, threshold : -.6} ]
  };
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
    const available = sites
                          .filter(s => s.zone === 1 && s.side === organ.side &&
                                       Math.abs(bearing(s) - bin.angle) < .001 && !used.has(s.id))
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
    const site = sites.find(s => s.id === center.site);
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
