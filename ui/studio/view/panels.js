import {contactPlan} from './contact_plan.js';
import {centerMarker} from './scene.js';
import {nerveEditor} from './nerve_cell.js';
import {driveContext} from './preview.js';
export {driveContext} from './preview.js';
import {cellDevelopment, previewControls} from './development.js';
import {visionInspector} from './vision.js';
import {
  effectorGraphic,
  gillGraphic,
  gutGraphic,
  gutMuscleGraphic,
  spineField
} from './effectors.js';
import {lateralField} from './lateral.js';
import {hairField} from './balance.js';
import {pigmentInspector} from './pigments.js';
import {scentMap} from './scents.js';
import {ATELIER_LIMITS, MOTOR_KIND} from '../../schema.js';
import {clamp} from '../../units.js';
import {
  BARBEL_FEEL,
  functionFor,
  isPelvicMuscle,
  isRegion,
  MUSCLE_LABEL_INDEX,
  ORGAN_BY_KEY
} from '../model/organs.js';
import {
  chosenCenter,
  contactBundle,
  contactRows,
  contactCenters,
  endpointCenters,
  findAssembly,
  findCenter,
  findOrgan,
  wireContacts
} from '../model/document.js';
import {modulesOf} from '../model/assemblies.js';
import {moduleSides} from './module_sides.js';
import {escapeText, fixed, glyph} from './markup.js';
import {onMidline} from '../model/layout.js';
import {formatNumber, formatSigned, joinParts, linkText, t, tList} from '../../strings.js';
import {
  heading,
  icon,
  ICON,
  iconSwitch,
  label,
  regionTerm,
  SWITCH_SYMBOL,
  VALUE_DIGITS
} from './kit.js';
import {pairingChoice, regionSettings, slotsSection} from './circuit.js';
import {strandInspector} from './nerve_inspector.js';
import {chemistry, glandProfile, hormoneInspector, hormonePad} from './substances.js';
import {learningInspector} from './learning.js';
import {workflow} from './library.js';
import {centerTitle, endpointTitle, familyTitle, moduleName, nodeFamilies} from './names.js';
import {organTitle} from './names.js';
import {bladderGraphic, gonadGraphic} from './sacs.js';
import {skinField} from './skin.js';
import {gutProbeControls} from './probes.js';

const MUSCLE_ICON = Object.freeze({
  [MOTOR_KIND.forward] : 'M3 12h12M15 12l-4-4M15 12l-4 4M18 8l3 4-3 4',
  [MOTOR_KIND.turn] : 'M5 18c0-7 5-12 13-12M18 6l-4-2M18 6l-2 4',
  [MOTOR_KIND.suction] : 'M20 12H8M8 12l4-4M8 12l4 4M4 7v10',
  [MOTOR_KIND.aggression] : 'M4 8l8 4-8 4M20 8l-8 4 8 4'
});
function muscleGraphic(state, center) {
  const site = state.sites?.find(item => item.id === center.site);
  const own = site ? functionFor(center, site) : -1;
  const reachable =
      new Set(state.sites
                  .filter(s => (s.motors &
                                ((1 << MOTOR_KIND.forward) | (1 << MOTOR_KIND.turn) |
                                 (1 << MOTOR_KIND.suction) | (1 << MOTOR_KIND.aggression))) !== 0)
                  .map(s => functionFor(center, s)));
  const chips =
      [...MUSCLE_LABEL_INDEX.entries() ]
          .map(([ code, index ]) =>
                   '<button class="aid-muscle-function' + (code === own ? ' current' : '') + '"' +
                   (code !== own && reachable.has(code)
                        ? ' data-muscle-function="' + code + '" data-center-id="' +
                              escapeText(center.id) + '"'
                    : code === own ? ' aria-current="true"'
                                   : ' disabled') +
                   '>' + glyph(MUSCLE_ICON[code], ICON.muscle) + '<span>' +
                   escapeText(tList('studio.muscles')[index] ?? '') + '</span></button>')
          .join('');
  return '<div class="aid-muscle-functions">' + chips + '</div>';
}
const muscleKind = (state, center) => '<div class="aid-muscle-kind" title="' +
                                      label('inspector.muscleKind') + '">' +
                                      muscleGraphic(state, center) + '</div>';

export const biasScale = state => state.capabilities?.biasScale ?? 0;
const skinPanel = (state, organ, center) => skinField(state, organ, center);
const ORGAN_PANELS = Object.freeze({
  nose : (state, organ, center) => scentMap(organ, center, state),
  barbels : (state, organ, center) => barbelFeel(center) + scentMap(organ, center, state),
  pigment : (state, organ, center) => pigmentInspector(state, organ, center),
  gut : (state, organ, center) => gutGraphic(state, organ, center) + gutProbeControls(state, organ),
  bladder : (state, organ, center) => bladderGraphic(state, organ, center),
  muscle : (state, organ) => effectorGraphic(state, organ),
  gills : (state, organ) => gillGraphic(state, organ),
  gutmuscle : (state, organ) => gutMuscleGraphic(state, organ),
  defense : (state, organ) => spineField(state, organ),
  gland : (state, organ, center) => glandProfile(state, organ, center),
  eggs : gonadGraphic,
  sperm : gonadGraphic,
  lateral : (state, organ) => lateralField(state, organ),
  balance : (state, organ, center) => hairField(state, organ, center),
  touch : skinPanel,
  pain : skinPanel,
  blood : (state, organ, center) => hormonePad(state, organ, center),
});
const organMetric = (state, organ) => '<div class="aid-organ-metric">' +
                                      icon(organ.type, ICON.metric) + '<span>' +
                                      escapeText(organTitle(organ)) + '</span></div>';
const organPanel = (state, organ, center) =>
    (ORGAN_PANELS[organ.type] ?? organMetric)(state, organ, center);
const muscleChoice = (state, organ, center) =>
    organ.type === 'muscle' && !isPelvicMuscle(organ) ? muscleKind(state, center) : '';
function organSettings(state, organ, center) {
  if (!center)
    return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  if (organ.field)
    return visionInspector(state, organ);
  if (isRegion(organ))
    return regionSettings(state, organ) +
           (state.selected?.kind === 'center' ? nerveEditor(state, center) : '');
  if (center.role === 'nerve')
    return centerSide(state, center) + nerveEditor(state, center);
  return organPanel(state, organ, center) + muscleChoice(state, organ, center);
}
export function organSettingsBlock(state, organ) {
  return '<div class="aid-organ-settings" data-organ-settings="' + escapeText(organ.id) + '">' +
         organSettings(state, organ, selectedCenter(state, organ)) + '</div>';
}
// Taste, touch or both, each as its sense's own mark with its word.
const BARBEL_ICON =
    Object.freeze({taste : [ 'nose' ], both : [ 'nose', 'touch' ], touch : [ 'touch' ]});
function barbelFeel(center) {
  return '<div class="aid-button-group aid-barbel-feel" role="group" aria-label="' +
         label('inspector.barbelFeel.label') + '" title="' + label('inspector.barbelsTaste') +
         '">' +
         Object.entries(BARBEL_FEEL)
             .map(([ key, value ]) =>
                      '<button class="' + (center.field === value ? 'active' : '') +
                      '" data-set-field="field" data-value="' + value + '" data-center-id="' +
                      escapeText(center.id) + '" title="' + label('inspector.barbelFeel.' + key) +
                      '">' + BARBEL_ICON[key].map(kind => icon(kind, ICON.part)).join('') +
                      '<span>' + label('inspector.barbelFeel.' + key) + '</span></button>')
             .join('') +
         '</div>';
}
function centerSide(state, center) {
  const found = findCenter(state.document, center.id);
  const site = state.sites?.find(s => s.id === center.site);
  if (found?.organ.type !== 'brain' || !site)
    return '';
  const here = onMidline(site) ? 0 : site.side;
  return '<div class="aid-button-group aid-center-side" role="group" aria-label="' +
         label('inspector.side.label') + '">' +
         [ [ -1, 'left' ], [ 0, 'middle' ], [ 1, 'right' ] ]
             .map(([ side, key ]) => '<button class="' + (here === side ? 'active' : '') +
                                     '" data-center-side="' + side + '" data-center-id="' +
                                     escapeText(center.id) + '">' + label('inspector.side.' + key) +
                                     '</button>')
             .join('') +
         '</div>';
}
export const selectedCenter = (state, organ) =>
    chosenCenter(state.document, state.selected, state.visionProfile) ?? organ.centers[0] ?? null;
// Organs whose picture shows their kinds of cells as parts one clicks to choose.
const PARTS_IN_PICTURE = Object.freeze([ 'gut', 'eggs', 'sperm', 'bladder' ]);
function centerTabs(state, organ) {
  if (isRegion(organ) || organ.field || organ.centers.length < 2 ||
      ORGAN_BY_KEY[organ.type]?.types || PARTS_IN_PICTURE.includes(organ.type))
    return '';
  const kinds = organ.type === 'brain' ? organ.centers.map(c => [c]) : nodeFamilies(organ);
  if (kinds.length < 2)
    return '';
  const chosen = kind => kind.some(c => c.id === selectedCenter(state, organ)?.id);
  return '<div class="aid-center-tabs">' +
         kinds
             .map(kind => '<button data-select-center="' + escapeText(kind[0].id) + '" class="' +
                          (chosen(kind) ? 'selected' : '') + '">' + escapeText(familyTitle(kind)) +
                          '</button>')
             .join('') +
         '</div>';
}
// The side pair as symbols: each side as a dot beside the midline, between them a link that is
// closed while both sides are set alike.
const SIDE_SYMBOL = Object.freeze({
  left : 'M15 3v4M15 10v4M15 17v4M7 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  right : 'M9 3v4M9 10v4M9 17v4M17 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  linked : SWITCH_SYMBOL.chain.on,
  apart : SWITCH_SYMBOL.chain.off,
  add : 'M12 5v14M5 12h14'
});
const sideGlyph = key => glyph(SIDE_SYMBOL[key], ICON.list, {line : true});
// Each button names its side or whether both sides are set alike.
const sideWord = key => '<span>' + label('inspector.side.' + key) + '</span>';
function sideSwitch(organ) {
  if (organ.type === 'brain' || !organ.side || ORGAN_BY_KEY[organ.type]?.scope === 'single')
    return '';
  const here = organ.side < 0 ? 'left' : 'right', there = organ.side < 0 ? 'right' : 'left';
  const own = '<button class="current" aria-current="true">' + sideGlyph(here) + sideWord(here) +
              '</button>';
  const other = organ.pair
                    ? '<button data-select-organ="' + escapeText(organ.pair) + '">' +
                          sideGlyph(there) + sideWord(there) + '</button>'
                    : '<button class="aid-add" data-mirror-organ="' + escapeText(organ.id) + '">' +
                          sideGlyph('add') + sideGlyph(there) + sideWord(there) + '</button>';
  const state = organ.linked ? 'linked' : 'apart';
  const link = organ.pair ? '<button class="aid-side-link" data-link-pair="' +
                                escapeText(organ.id) + '" aria-pressed="' + organ.linked +
                                '" title="' + label('inspector.side.linkTitle') + '">' +
                                sideGlyph(state) + sideWord(state) + '</button>'
                          : '';
  const parts = organ.side < 0 ? [ own, link, other ] : [ other, link, own ];
  return '<div class="aid-side-switch" role="group" aria-label="' + label('inspector.side.label') +
         '">' + parts.join('') + '</div>';
}
function moduleChips(state, id) {
  const modules = modulesOf(state.document, id);
  return modules.length
             ? '<div class="aid-module-chips"><span>' + label('inspector.partOf') + '</span>' +
                   modules
                       .map(a => '<button data-select-assembly="' + escapeText(a.id) + '">' +
                                 escapeText(moduleName(state.document, a)) + '</button>')
                       .join('') +
                   '</div>'
             : '';
}
function organInspector(state, organ) {
  const center = selectedCenter(state, organ);
  const plain = text => text.replace(/\u00ad/g, '');
  const term = isRegion(organ) && plain(regionTerm(organ.type)) !== plain(organTitle(organ))
                   ? regionTerm(organ.type)
                   : label(isRegion(organ) ? 'inspector.regionType' : 'inspector.organType');
  let html = '<header class="aid-inspector-head"><span>' + term + '</span>' +
             heading(organTitle(organ, state.sites)) + '</header>' +
             moduleChips(state, organ.type === 'brain' ? center?.id : organ.id) +
             sideSwitch(organ) + centerTabs(state, organ);
  html +=
      organSettingsBlock(state, organ) + (isRegion(organ) ? '' : slotsSection(state, organ)) +
      chemistry(state, organ, center) +
      (isRegion(organ) && state.selected?.kind !== 'center' ? '' : cellDevelopment(state, center)) +
      contactPlan(state, isRegion(organ) && state.selected?.kind !== 'center' ? organ.centers
                                                                              : [ center ]);
  if (isRegion(organ))
    html += iconSwitch('inner', organ.openContacts, label('compiler.openRegion'),
                       'data-compiler-open="' + escapeText(organ.id) + '"');
  if (organ.type !== 'brain')
    html += '<div class="aid-inspector-actions"><button class="aid-danger" data-remove-organ="' +
            escapeText(organ.id) + '">' + label('inspector.removeOrgan') + '</button></div>';
  else if (state.selected?.kind === 'center')
    html += '<button class="aid-danger" data-remove-center="' + escapeText(center.id) + '">' +
            label('inspector.removeCenter') + '</button>';
  return html;
}
function developedContactInspector(state) {
  const [from, to] = state.selected.id.split(':').map(Number);
  const row = contactRows(state).find(([ a, b ]) => a === from && b === to);
  const centers = contactCenters(state);
  if (!row || !centers[from] || !centers[to])
    return '';
  return '<header class="aid-inspector-head"><span>' + label('inspector.proposedLink') + '</span>' +
         heading(linkText(centerTitle(centers[from]), centerTitle(centers[to]))) + '</header>' +
         contactResult(contactBundle(row)) +
         (centers[to].generated
              ? ''
              : contactPlan(state, [ findCenter(state.document, centers[to].id)?.center ]));
}
// What the last development proposed along this connection: how many contacts and how strong they
// may grow on average, by sign when both occur; the names are the tooltips.
const RESULT_GLYPH = Object.freeze({
  count : 'M5 7h.01M5 12h.01M5 17h.01M19 12h.01M5 7l14 5M5 12h14M5 17l14-5',
  limit : 'M4 12l16-4v8z'
});
const resultCard = (key, value, symbol) => '<div title="' + label('inspector.' + key) + '">' +
                                           glyph(RESULT_GLYPH[symbol], ICON.part, {line : true}) +
                                           '<strong>' + value + '</strong></div>';
function contactResult(link) {
  const polarities = [
    {count : link.positive, weight : link.positiveWeight, key : 'excitation', tone : 'excite'},
    {count : link.negative, weight : link.negativeWeight, key : 'inhibition', tone : 'inhibit'}
  ];
  const tone = !link.count ? ' none' : link.negative ? link.positive ? '' : ' inhibit' : ' excite';
  return '<div class="aid-contact-summary' + tone + '">' +
         resultCard('proposalCount', formatNumber(Number(link.count)), 'count') +
         (link.count ? resultCard('meanLimit', formatSigned(link.weight, 2, true), 'limit') : '') +
         '</div>' +
         (link.positive && link.negative
              ? '<div class="aid-contact-polarities">' +
                    polarities
                        .map(item => '<div class="aid-contact-polarity ' + item.tone + '" title="' +
                                     label('inspector.' + item.key) + '"><strong>' +
                                     formatNumber(item.count) + '</strong><small>' +
                                     formatSigned(item.weight, 2, true) + '</small></div>')
                        .join('') +
                    '</div>'
              : '');
}
const WIRE_PAD = Object.freeze({
  size : 150,
  centre : 75,
  boundary : 63,
  least : 14,
  reach : 46,
  source : 5,
  handle : 7,
  others : 11,
  other : 3.2,
  turn : 2.39996,
  dim : .22
});
const wireRadius = spread => WIRE_PAD.least + WIRE_PAD.reach * spread;
// Other senders scattered round this one: those inside the spread are the ones it reaches.
const otherSenders = Array.from({length : WIRE_PAD.others}, (_, k) => {
  const W = WIRE_PAD, distance = W.least + W.reach * (k + .5) / W.others, angle = k * W.turn;
  return {
    distance,
    x : W.centre + distance * Math.cos(angle),
    y : W.centre + distance * Math.sin(angle)
  };
});
const otherShown = (other, radius) => other.distance < radius ? 1 : WIRE_PAD.dim;
export function wirePatch(fx, fy) {
  const W = WIRE_PAD, distance = Math.hypot(fx * W.size - W.centre, fy * W.size - W.centre);
  return {spread : clamp((distance - W.least) / W.reach)};
}
export function wireMarks(wire) {
  const radius = wireRadius(wire.spread);
  return {
    '.aid-wire-halo' : {r : radius},
    '.aid-wire-handle' : {cx : WIRE_PAD.centre + radius},
    ...Object.fromEntries(otherSenders.map(
        (other, k) => ['[data-other="' + k + '"]', {'fill-opacity' : otherShown(other, radius)}]))
  };
}
function wireField(wire) {
  const W = WIRE_PAD, radius = wireRadius(wire.spread);
  const circle = (cls, r, x = W.centre) => '<circle class="' + cls + '" cx="' + fixed(x) +
                                           '" cy="' + W.centre + '" r="' + fixed(r) + '"/>';
  return '<div class="aid-wire-field"><svg class="aid-wire-search" data-wire-pad="' +
         escapeText(wire.id) + '" viewBox="0 0 ' + W.size + ' ' + W.size +
         '" tabindex="0" role="img" aria-label="' + label('sections.spread') + '"><title>' +
         escapeText(joinParts([ label('sections.spread'), label('inspector.spreadTitle') ])) +
         '</title>' + circle('aid-wire-boundary', W.boundary) + circle('aid-wire-halo', radius) +
         otherSenders
             .map((other, k) => '<circle class="aid-wire-other" data-other="' + k + '" cx="' +
                                fixed(other.x) + '" cy="' + fixed(other.y) + '" r="' + W.other +
                                '" fill-opacity="' + otherShown(other, radius) + '"/>')
             .join('') +
         circle('aid-wire-source', W.source) +
         circle('aid-wire-handle', W.handle, W.centre + radius) + '</svg></div>';
}
function wireInspector(state, wire) {
  const doc = state.document;
  return '<header class="aid-inspector-head"><span>' + label('sections.connection') + '</span>' +
         heading(linkText(endpointTitle(doc, wire.from, state.sites, wire.fromPort),
                          endpointTitle(doc, wire.to, state.sites, wire.toPort))) +
         '</header>' + pairingChoice(doc, wire) + '<div class="aid-wire-parameters">' +
         wireField(wire) + '</div>' +
         (state.report?.contacts
              ? contactResult(wireContacts(doc, wire, contactRows(state), state.sites))
              : '') +
         contactPlan(state, endpointCenters(doc, wire.to), wire) +
         '<div class="aid-inspector-actions">' +
         (wire.bundle ? '<button data-unbundle-wires="' + escapeText(wire.id) + '">' +
                            label('wiring.unbundle') + '</button>'
                      : '') +
         (wire.bends?.length
              ? '<button data-unbend-wire="' + escapeText(wire.id) + '">' +
                    escapeText(t('studio.inspector.unbend', {n : wire.bends.length})) + '</button>'
              : '') +
         '<button class="aid-danger" data-remove-wire="' + escapeText(wire.id) + '">' +
         label('inspector.removeWire') + '</button></div>';
}
function assemblyInspector(state, assembly) {
  const doc = state.document;
  return '<header class="aid-inspector-head"><span>' + label('sections.module') + '</span>' +
         '<input class="aid-inline-name aid-inline-title" data-assembly-name="' +
         escapeText(assembly.id) + '" value="' + escapeText(moduleName(doc, assembly)) +
         '" maxlength="' + ATELIER_LIMITS.max_name + '" aria-label="' +
         label('inspector.moduleName') + '"></header>' +
         '<div class="aid-assembly-list">' +
         assembly.organIds
             .map(id => {
               const organ = findOrgan(state.document, id);
               return organ ? '<button data-select-organ="' + escapeText(id) + '">' +
                                  icon(organ.type, ICON.part) +
                                  escapeText(organTitle(organ, state.sites)) + '</button>'
                            : '';
             })
             .join('') +
         '</div>' + moduleSides(state, assembly) +
         '<div class="aid-button-group aid-module-actions"><button data-save-assembly="' +
         escapeText(assembly.id) + '">' + label('inspector.saveModule') + '</button>' +
         '<button data-ungroup-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.ungroup') + '</button></div><div class="aid-inspector-actions">' +
         '<button class="aid-danger" data-remove-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.removeModule') + '</button></div>';
}
function multiInspector(state) {
  const wires = state.document.wires.filter(w => state.multi.has(w.id));
  if (wires.length > 1)
    return '<header class="aid-inspector-head">' +
           heading(t('studio.app.wireCount', {n : wires.length})) +
           '</header><div class="aid-assembly-list">' +
           wires
               .map(w => '<span>' +
                         escapeText(linkText(
                             endpointTitle(state.document, w.from, state.sites, w.fromPort),
                             endpointTitle(state.document, w.to, state.sites, w.toPort))) +
                         '</span>')
               .join('') +
           '</div><div class="aid-inspector-actions"><button data-bundle-wires>' +
           label('wiring.bundle') + '</button><button data-clear-multi>' +
           label('inspector.cancelSelection') + '</button></div>';
  const chosen = [...state.multi ].flatMap(id => {
    const organ = findOrgan(state.document, id);
    if (organ)
      return [ {id, kind : 'organ', type : organ.type, name : organTitle(organ, state.sites)} ];
    const hit = findCenter(state.document, id);
    return hit ? [ {id, kind : 'center', type : hit.organ.type, name : centerTitle(hit.center)} ]
               : [];
  });
  return '<header class="aid-inspector-head"><span>' + label('inspector.selected') + '</span>' +
         heading(t('studio.app.partCount', {n : chosen.length})) +
         '</header><div class="aid-assembly-list">' +
         chosen
             .map(part => '<button data-select-' + part.kind + '="' + escapeText(part.id) + '">' +
                          icon(part.type, ICON.part) + escapeText(part.name) + '</button>')
             .join('') +
         '</div><div class="aid-inspector-actions">' +
         '<button data-assemble-selected>' + label('inspector.makeModule') + '</button>' +
         '<button data-clear-multi>' + label('inspector.cancelSelection') + '</button></div>';
}
// A cell group the CPPN added: its potential cells as a cluster of their marks; what its first cell
// is and that the CPPN made it stand in the tooltip.
const GENERATED = Object.freeze({size : 168, marker : 6, spacing : 9.5, most : 60, turn : 2.39996});
function generatedInspector(state) {
  const center = contactCenters(state).find(center => center.id === state.selected.id);
  if (!center)
    return '';
  const cl = center.nativeClass, G = GENERATED, middle = G.size / 2;
  const value = (key, text) => label('development.' + key) + ' ' + text;
  const values = joinParts([
    value('potentialCells', formatNumber(center.copies)),
    ...(center.role === 'nerve' ? [
      value('sign', formatSigned(cl.sign, 0)), value('mode', formatSigned(cl.mode, VALUE_DIGITS)),
      value('pace', formatNumber(cl.pace, VALUE_DIGITS)),
      value('modulator', formatNumber(cl.modulator, VALUE_DIGITS))
    ]
                                : []),
    label('compiler.extraMeaning')
  ]);
  const cells =
      Array
          .from({length : Math.min(G.most, center.copies)},
                (_, k) => '<g transform="translate(' +
                          fixed(middle + G.spacing * Math.sqrt(k) * Math.cos(k * G.turn)) + ' ' +
                          fixed(middle + G.spacing * Math.sqrt(k) * Math.sin(k * G.turn)) + ')">' +
                          centerMarker(center, G.marker) + '</g>')
          .join('');
  return '<header class="aid-inspector-head">' + heading(centerTitle(center)) +
         '</header><svg class="aid-generated-cells" viewBox="0 0 ' + G.size + ' ' + G.size +
         '" role="img" aria-label="' + escapeText(centerTitle(center)) + '"><title>' +
         escapeText(values) + '</title>' + cells + '</svg>';
}
export function inspector(state) {
  if (state.selected?.kind === 'generated')
    return generatedInspector(state);
  if (state.tool === 'hormone')
    return state.document.substances.length || state.selected
               ? hormoneInspector(state)
               : previewControls(state) + '<header class="aid-inspector-head">' +
                     heading(label('hormoneCard.title')) + '</header>' + workflow();
  if (state.tool === 'learn')
    return learningInspector(state);
  if (state.multi?.size > 1)
    return multiInspector(state);
  const selected = state.selected;
  if (!selected)
    return '<header class="aid-inspector-head">' + heading(label('sections.empty')) + '</header>' +
           (state.tool === 'stimulate' ? previewControls(state) : '') + workflow();
  if (selected.kind === 'wire') {
    const wire = state.document.wires.find(w => w.id === selected.id);
    return wire ? wireInspector(state, wire) : '';
  }
  if (selected.kind === 'contact')
    return developedContactInspector(state);
  if (selected.kind === 'bundle' || selected.kind === 'nerve')
    return strandInspector(state);
  if (selected.kind === 'assembly') {
    const assembly = findAssembly(state.document, selected.id);
    return assembly ? assemblyInspector(state, assembly) : '';
  }
  const organ = selected.kind === 'organ' ? findOrgan(state.document, selected.id)
                                          : findCenter(state.document, selected.id)?.organ;
  return previewControls(state) + (organ ? organInspector(state, organ) : '');
}
