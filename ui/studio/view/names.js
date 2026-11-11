import {joinParts, t, tList} from '../../strings.js';
import {MUSCLE_LABEL_INDEX, ORGAN_BY_KEY, organFunction} from '../model/organs.js';
import {findCenter, findOrgan} from '../model/document.js';

export function organTitle(organ, sites = null) {
  const index = organ.type === 'muscle' && organ.centers
                    ? MUSCLE_LABEL_INDEX.get(organFunction(organ, sites))
                    : undefined;
  return index === undefined ? t('studio.organs.' + organ.type)
                             : tList('studio.muscleTitles')[index];
}

export function centerTitle(center) {
  if (center.generated)
    return t('studio.compiler.extraPotential', {n : center.index + 1});
  if (!center.node)
    return t('studio.centers.' + center.key);
  if (!center.band)
    return t('studio.regionNodes.' + center.node);
  const [from, to] = center.band.map(Math.round);
  return center.type === null ? t('studio.regionNodes.map', {from, to})
                              : t('studio.regionNodes.mapType', {from, to, n : center.type + 1});
}
export const nodeFamily = center =>
    center.band ? center.node.replace(/[.\d].*$/, '') : center.node ?? center.key;
export const nodeFamilies = organ => [...Map.groupBy(organ.centers, nodeFamily).values()];
export function familyTitle(nodes) {
  if (nodes.length < 2)
    return centerTitle(nodes[0]);
  const name = nodes[0].node ? t('studio.regionNodes.families.' + nodeFamily(nodes[0]))
                             : centerTitle(nodes[0]);
  return t('studio.inspector.kindCount', {name, n : nodes.length});
}
export function moduleName(doc, assembly) {
  const builtIn = t('studio.modules.' + assembly.name);
  return assembly.name && builtIn !== 'studio.modules.' + assembly.name ? builtIn
         : assembly.name
             ? assembly.name
             : t('units.numbered',
                 {name : t('studio.sections.module'), n : doc.assemblies.indexOf(assembly) + 1});
}
export function endpointTitle(doc, id, sites = null, port = null) {
  const organ = findOrgan(doc, id);
  if (organ)
    return port ? joinParts([ organTitle(organ, sites), t('studio.regions.slots.' + port) ])
                : organTitle(organ, sites);
  const found = findCenter(doc, id);
  if (!found)
    return '';
  return found.organ.type === 'brain'
             ? centerTitle(found.center)
             : joinParts([ organTitle(found.organ, sites), centerTitle(found.center) ]);
}
export const CATEGORY_TONE = Object.freeze({
  senses : '#79d2be',
  internal : '#b29bdc',
  reproduction : '#dfbc87',
  brain : '#b8c5e1',
  regions : '#b8c5e1',
  motor : '#eaa886'
});
export const tone = kind => CATEGORY_TONE[ORGAN_BY_KEY[kind]?.category] ?? CATEGORY_TONE.motor;
export const isSelected = (selection, kind, id) => selection?.kind === kind && selection?.id === id;
