import {HALF_VIEW, latticeBearing, retinalBins} from './retina.js';
import {addOrgan, findOrgan, updateField} from './document.js';
import {sitePoint, ZONE} from './layout.js';
import {siteRole} from './organs.js';

export const hasField = type => type === 'eye' || type === 'proximity';

export function fieldPlacements(doc, organId, sites) {
  const organ = findOrgan(doc, organId);
  if (!organ?.field)
    return [];
  const width = organ.field.hi - organ.field.lo, starts = new Set(), result = [];
  for (const bin of retinalBins(sites)) {
    const lo = Math.max(0, Math.min(HALF_VIEW - width, bin.angle - width / 2));
    if (starts.has(lo))
      continue;
    starts.add(lo);
    const document = updateField(doc, organId, {lo, hi : lo + width}, sites);
    if (document)
      result.push({document, organId});
  }
  return result;
}

export function newFieldPlacements(doc, type, sites) {
  const anchors = new Map();
  for (const site of sites)
    if (site.zone === ZONE.head && site.side > 0 && !anchors.has(latticeBearing(site)))
      anchors.set(latticeBearing(site), site);
  const result = [];
  for (const site of anchors.values()) {
    const placed = addOrgan(doc, type, sites, sitePoint(site, siteRole(type)));
    if (placed && findOrgan(placed.document, placed.organId)?.field)
      result.push({document : placed.document, organId : placed.organId});
  }
  return result;
}
