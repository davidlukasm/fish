import {joinParts, t, tList} from '../../strings.js';
import {MUSCLE_LABEL_INDEX, ORGAN_BY_KEY, organFunction} from '../model/organs.js';
import {findCenter, findOrgan} from '../model/document.js';

// An organ's name; a muscle's by what it does where it lies, when the sites are known.
export function organTitle(organ, sites = null) {
  const index = organ.type === 'muscle' && organ.centers
                    ? MUSCLE_LABEL_INDEX.get(organFunction(organ, sites))
                    : undefined;
  return index === undefined ? t('studio.organs.' + organ.type)
                             : tList('studio.muscleTitles')[index];
}
// What the scene calls its parts and how it colours them: centers, modules and the ends of
// wires by name, organs by their category's tone.

// A node of a planned region is named by its place in the plan: a map node by the directions it
// takes (and its colour type), the output, the contrast cells.
export function centerTitle(center) {
  if (!center.node)
    return t('studio.centers.' + center.key);
  // A pallium's learning node names the kind it learns from: a region by its term, a sense
  // organ by its name.
  if (center.stream)
    return t('studio.regionNodes.learnFrom', {
      name : t(ORGAN_BY_KEY[center.stream]?.category === 'regions'
                   ? 'studio.regions.' + center.stream + '.term'
                   : 'studio.organs.' + center.stream)
                 .replace(/\u00ad/g, '')
    });
  if (!center.band)
    return t('studio.regionNodes.' + center.node);
  const [from, to] = center.band.map(Math.round);
  return center.type === null ? t('studio.regionNodes.map', {from, to})
                              : t('studio.regionNodes.mapType', {from, to, n : center.type + 1});
}
// A module's name: a built-in one's, the one it was saved under, or its number.
export function moduleName(doc, assembly) {
  const builtIn = t('studio.modules.' + assembly.name);
  return assembly.name && builtIn !== 'studio.modules.' + assembly.name ? builtIn
         : assembly.name
             ? assembly.name
             : t('units.numbered',
                 {name : t('studio.sections.module'), n : doc.assemblies.indexOf(assembly) + 1});
}
// What a wire attaches to, by name: an organ; a center of the brain; a node of an organ or a
// center of a brain region with its organ.
export function endpointTitle(doc, id, sites = null) {
  const organ = findOrgan(doc, id);
  if (organ)
    return organTitle(organ, sites);
  const found = findCenter(doc, id);
  if (!found)
    return '';
  return found.organ.type === 'brain'
             ? centerTitle(found.center)
             : joinParts([ organTitle(found.organ, sites), centerTitle(found.center) ]);
}
// Each category of organ in its colour; others as the motor organs.
export const CATEGORY_TONE = Object.freeze({
  senses : '#79d2be',
  internal : '#b29bdc',
  reproduction : '#dfbc87',
  brain : '#b8c5e1',
  motor : '#eaa886'
});
export const tone = kind => CATEGORY_TONE[ORGAN_BY_KEY[kind]?.category] ?? CATEGORY_TONE.motor;
// Whether a selection is the item of a kind and id.
export const isSelected = (selection, kind, id) => selection?.kind === kind && selection?.id === id;
