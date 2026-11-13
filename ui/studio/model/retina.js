import {clamp, degrees} from '../../units.js';
import {hueAffinities, hueOffset, hueQuality, tuningHue, unitOfPlan} from '../../tuning.js';
import {CONTRAST_POLARITY, RGB, VISION, TUNING} from '../../schema.js';
import {bodyCoordinates, findSite, ZONE} from './layout.js';

export const HALF_VIEW = degrees(Math.PI * VISION.half_view);
export const bearing = site => HALF_VIEW * (.5 * (1 - site.u) + .5 * site.w);
export const bearingAt = position => bearing(bodyCoordinates(position, ZONE.head));
const BEARING_SCALE = 1e6;
export const latticeBearing = site => Math.round(bearing(site) * BEARING_SCALE) / BEARING_SCALE;
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
const NEW_EYE = Object.freeze({reach : 32, density : 3, resolution : .2});
const NEW_PROFILE = Object.freeze({
  q2 : -1,
  threshold : -.6,
  first_width : 1,
  next_width : .15,
  polarity : CONTRAST_POLARITY.bright
});
const GOLDEN_ANGLE = 137.508;
export function fieldRecipe(site, profileId) {
  const angle = bearing(site), P = NEW_PROFILE;
  return {
    lo : Math.max(0, angle - NEW_EYE.reach),
    hi : Math.min(HALF_VIEW, angle + NEW_EYE.reach),
    density : NEW_EYE.density,
    resolution : NEW_EYE.resolution,
    profiles : [ {
      id : profileId,
      q1 : 0,
      q2 : P.q2,
      qwidth : P.first_width,
      threshold : P.threshold,
      polarity : P.polarity
    } ]
  };
}
export function nextVisionProfile(field, id) {
  const P = NEW_PROFILE,
        hue = (field.profiles.length * GOLDEN_ANGLE) % (2 * TUNING.hue_half_circle);
  return {
    id,
    q1 : hueQuality(hue),
    q2 : P.q2,
    qwidth : P.next_width,
    threshold : P.threshold,
    polarity : P.polarity
  };
}
export const receptorWidth = field =>
    TUNING.visual_width_min * (TUNING.visual_width_max / TUNING.visual_width_min) ** field;

export const hasColourTuning = (organ, profile) =>
    organ.type !== 'eye' || profile.qwidth < 1 ||
    organ.centers.some(c => c.profile === profile.id &&
                            (c.qwidth < 1 || c.distribution.spread_physiology > 0));

// The editable mean uses the same RGB balance as retina.cc; sampled cells never set its handles.
export function nominalSpectrum(profile, definition) {
  if (!definition)
    return null;
  const affinity = hueAffinities(tuningHue(profile.q1), profile.qwidth);
  const total = affinity.reduce((sum, x) => sum + x, 0);
  const spectrum = affinity.map(x => x / total), peak = Math.max(...spectrum);
  const complement = spectrum.map(x => 1 - x / peak);
  const untuned = complement.reduce((sum, x) => sum + x, 0);
  const excitation = [], inhibition = [];
  for (let k = 0; k < definition.samples; ++k) {
    const hue = 2 * TUNING.hue_half_circle * k / definition.samples;
    const light =
        Object.values(RGB).map(c => clamp(2 - Math.abs(hueOffset(hue, TUNING.channel_hue * c)) /
                                                  (.5 * TUNING.channel_hue)));
    excitation.push(spectrum.reduce((sum, x, c) => sum + x * light[c], 0));
    inhibition.push(untuned > 0
                        ? definition.opponent *
                              complement.reduce((sum, x, c) => sum + x * light[c], 0) / untuned
                        : 0);
  }
  return {
    excitation,
    inhibition,
    half : excitation.some((x, k) => x > unitOfPlan(profile.q2) * inhibition[k])
               ? TUNING.threshold_range ** (unitOfPlan(profile.threshold) - 1)
               : null
  };
}

export function profileLightSpread(doc, snapshot, organId, profileId) {
  if (snapshot?.document !== doc)
    return null;
  const rows = snapshot.report.groups, selected = [];
  let index = 0;
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const row = rows[index++];
      if (organ.id === organId && center.profile === profileId && row?.count > 0)
        selected.push(row);
    }
  const count = selected.reduce((sum, row) => sum + row.count, 0);
  if (!count)
    return {source : snapshot.report.source, count};
  const samples = selected[0].mean.length;
  return {
    source : snapshot.report.source,
    count,
    mean : Array.from({length : samples},
                      (_, k) =>
                          selected.reduce((sum, row) => sum + row.mean[k] * row.count, 0) / count),
    min : Array.from({length : samples}, (_, k) => Math.min(...selected.map(row => row.min[k]))),
    max : Array.from({length : samples}, (_, k) => Math.max(...selected.map(row => row.max[k]))),
    half : {
      mean : selected.reduce((sum, row) => sum + row.half.mean * row.count, 0) / count,
      min : Math.min(...selected.map(row => row.half.min)),
      max : Math.max(...selected.map(row => row.half.max))
    }
  };
}

// Centers are compiler output of a whole-organ recipe. They never acquire independent positions.
export function generateRetina(organ, sites, used, create) {
  const {lo, hi, profiles, density, resolution} = organ.field;
  // An imported organ may sample different bearings with different receptor types and counts.
  // Keep that sampling until its field bounds are edited explicitly.
  if (organ.field.sampled) {
    const centers = organ.centers.filter(c => profiles.some(p => p.id === c.profile));
    if (centers.some(c => used.has(c.site)))
      return null;
    return centers.map(c => ({...c, ...profiles.find(p => p.id === c.profile), id : c.id}));
  }
  const bins = retinalBins(sites);
  const chosen = bins.filter(b => b.hi > lo && b.lo < hi);
  const previous = new Map(organ.centers.map(c => [c.id, c]));
  const centers = [];
  for (const bin of chosen) {
    const available = binSites(sites, organ.side, bin)
                          .filter(s => !used.has(s.id))
                          .sort((a, b) => a.v - b.v || a.u - b.u || a.id - b.id);
    if (!available.length)
      continue;
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
// Whether an eye's field reaches across the midline into the other side's space (body_plan.cc: a
// cell sees from angle − width to angle + width), and which of its centers have such a cell.
export const seesAcross = organ =>
    !!organ.field && organ.field.lo < receptorWidth(organ.field.resolution);
export const midlineCenters = (organ, sites) => new Set(
    seesAcross(organ)
        ? retinalRays(organ, sites).filter(r => r.left < 0 && r.right > 0).map(r => r.center)
        : []);
