import {
  allCenters,
  contactCenters,
  contactRows,
  endpointCenters,
  producers,
  receivers,
  validCellLink
} from './document.js';
import {nerveClass} from './organs.js';
import {routedLinks} from './regions.js';

export function planTrace(document, sites, requested, capabilities) {
  const centers = allCenters(document), byId = new Map(centers.map(center => [center.id, center]));
  const starts = [...new Set(requested) ].filter(id => byId.has(id)), links = [];
  const locations = new Map(sites.map(site => [site.id, site])), pairs = new Set();
  const classes = new Map(
      centers.map(center => [center.id, center.role === 'nerve' ? nerveClass(center)
                                                                : {sign : 1, modulator : 0}]));
  for (const route of routedLinks(document, sites))
    for (const source of endpointCenters(document, route.from))
      for (const target of endpointCenters(document, route.to)) {
        const pair = source.id + '>' + target.id;
        if (pairs.has(pair) ||
            !validCellLink(source, locations.get(source.site), target, locations.get(target.site)))
          continue;
        pairs.add(pair);
        const cl = classes.get(source.id), modulation = target.role === 'motor' ? 0 : cl.modulator;
        if (modulation < 1)
          links.push({
            from : source.id,
            to : target.id,
            kind : 'electrical',
            sign : cl.sign,
            rhythm : cl.pace > 0
          });
        if (modulation > 0)
          links.push({from : source.id, to : target.id, kind : 'teaching', sign : 0});
      }
  if (capabilities)
    for (const substance of document.substances)
      for (const source of producers(document, substance.index, capabilities))
        for (const target of receivers(document, substance.index, capabilities))
          links.push({
            from : source.id,
            to : target.id,
            kind : 'hormone',
            sign : 0,
            substance : substance.index
          });
  return traceLinks(starts, links);
}
export function cppnTrace(state, requested) {
  const centers = contactCenters(state), wanted = new Set(requested);
  const starts =
      centers
          .filter((center, index) => wanted.has(center.id) &&
                                     (center.generated || state.report.groups[index]?.cells > 0))
          .map(center => center.id);
  const links = [];
  for (const [from, to, count, , positive, negative] of contactRows(state)) {
    if (!count || !centers[from] || !centers[to])
      continue;
    const source = centers[from], target = centers[to];
    const modulation = target.role === 'motor' || source.role === 'sensor' ? 0
                       : source.generated ? source.nativeClass.modulator
                                          : state.report.groups[from]?.nerve?.[3] ?? 0;
    if (modulation < 1) {
      const rhythm = source.role === 'nerve' &&
                     (source.generated ? source.nativeClass.pace
                                       : state.report.groups[from]?.nerve?.[2] ?? 0) > 0;
      if (positive)
        links.push({from : source.id, to : target.id, kind : 'electrical', sign : 1, rhythm});
      if (negative)
        links.push({from : source.id, to : target.id, kind : 'electrical', sign : -1, rhythm});
    }
    if (modulation > 0)
      links.push({from : source.id, to : target.id, kind : 'teaching', sign : 0});
  }
  return traceLinks(starts, links);
}
function traceLinks(starts, links) {
  const outgoing = new Map();
  for (const link of links) {
    if (!outgoing.has(link.from))
      outgoing.set(link.from, []);
    outgoing.get(link.from).push(link);
  }
  const parts = starts.map(id => ({id, sign : 1, kind : 'electrical', level : 0}));
  const visited = new Set(starts.map(id => id + ':1')), seenLegs = new Set(), legs = [];
  for (let next = 0; next < parts.length; ++next) {
    const part = parts[next];
    if (part.kind !== 'electrical')
      continue;
    for (const link of outgoing.get(part.id) ?? []) {
      const key = link.from + '>' + link.to + ':' + link.kind + ':' + link.sign + ':' + part.sign +
                  ':' + (link.substance ?? '');
      if (seenLegs.has(key))
        continue;
      seenLegs.add(key);
      const sign = link.kind === 'electrical' ? part.sign * link.sign : 0;
      legs.push({...link, sign, sourceSign : part.sign, level : part.level});
      const visit =
          link.to + ':' + sign +
          (link.kind === 'electrical' ? '' : ':' + link.kind + ':' + (link.substance ?? ''));
      if (!visited.has(visit)) {
        visited.add(visit);
        parts.push({
          id : link.to,
          sign,
          kind : link.kind,
          level : part.level + 1,
          substance : link.substance
        });
      }
    }
  }
  return {starts, parts, legs};
}
