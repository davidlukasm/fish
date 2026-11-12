import {regionGraph} from './region_graph.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {ORGAN_BY_KEY, PAIRINGS} from '../model/organs.js';
import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {
  findCenter,
  findOrgan,
  isLearner,
  substanceBound,
  teachersOf,
  wholeEndpoint
} from '../model/document.js';
import {substanceName} from './substances.js';
import {centerMarker} from './scene.js';
import {escapeText, fixed, glyph, placedGlyph} from './markup.js';
import {sideIndex} from '../model/layout.js';
import {planned, regionPlan, regionSlots, routedLinks} from '../model/regions.js';
import {namedText, t} from '../../strings.js';
import {cellGroup, cellWords, ICON, icon, label, slotFill, slotShape} from './kit.js';
import {centerTitle, familyTitle, nodeFamilies, nodeFamily} from './names.js';
import {organTitle, slotTitle} from './names.js';
import {regionPicture} from './region_controls.js';

const PAIRING_BOX = 20;
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
const pairingTitle = wire =>
    namedText(label('inspector.pairing.title'), label('inspector.pairing.' + wire.pairing));
export const pairingChoice = wire =>
    '<div class="aid-wire-pairing" role="group" aria-label="' + label('inspector.pairing.title') +
    '">' +
    PAIRINGS
        .map(p => '<button class="aid-pairing" data-wire-pairing="' + escapeText(wire.id) +
                  '" data-pairing-value="' + p + '" aria-pressed="' +
                  ((wire.pairing ?? 'same') === p) + '">' +
                  glyph(PAIRING_GLYPH[p], PAIRING_BOX, {box : PAIRING_BOX}) + '<span>' +
                  label('inspector.pairing.' + p) + '</span></button>')
        .join('') +
    '</div>';
export function slotsSection(state, organ) {
  if (!ORGAN_BY_KEY[organ.type].slots)
    return '';
  const slots =
      regionSlots(state.document, organ)
          .map(slot =>
                   '<li class="' + slotFill(slot) + '"><span class="aid-slot-name">' +
                   '<span class="aid-slot-symbol ' + slotFill(slot) + ' ' + slot.dir + '">' +
                   glyph(slotShape(slot), ICON.slot, {line : true}) + '</span>' +
                   '<span>' + slotTitle(slot) + '</span></span><small>' +
                   label(slot.required ? 'regions.required' : 'regions.optional') +
                   '</small><span class="aid-slot-ends">' +
                   (slot.filled.length
                        ? slot.filled
                              .map(o => '<button data-select-organ="' + escapeText(o.id) + '">' +
                                        icon(o.type, ICON.list) + '<span>' +
                                        escapeText(organTitle(o, state.sites)) + '</span></button>')
                              .join('')
                        : '') +
                   '<button class="aid-slot-add" data-slot-region="' + escapeText(organ.id) +
                   '" data-slot-key="' + escapeText(slot.key) + '" data-slot-dir="' + slot.dir +
                   '" title="' + label(slot.dir === 'in' ? 'status.slotIn' : 'status.slotOut') +
                   '">' + (slot.filled.length ? '+' : label('regions.free') + ' +') + '</button>' +
                   '</span></li>')
          .join('');
  return '<section class="aid-eye-section"><h4>' + label('regions.slotsTitle') +
         '</h4><ul class="aid-region-slots">' + slots + '</ul></section>';
}
function regionTeacher(state, organ) {
  const learners = organ.centers.filter(isLearner);
  if (!learners.length)
    return '';
  const taught = new Set(learners.map(c => {
    const r = c.receptors[HORMONE_EFFECT.teaching];
    return substanceBound(HORMONE_EFFECT.teaching, r) ? r.substance : null;
  }));
  const one = taught.size === 1 ? [...taught ][0] : undefined;
  const choice = (value, text, swatch = '') =>
      '<button class="' + (one === value ? 'active' : '') + '" data-region-teacher="' +
      escapeText(organ.id) + '" data-teacher-value="' + (value ?? 'off') + '"' +
      (swatch ? ' style="--substance:' + swatch + '"' : '') + '>' +
      (swatch ? '<span class="aid-substance-swatch"></span>' : '') + escapeText(text) + '</button>';
  return '<div class="aid-region-setting"><span>' + label('regions.settings.teacher') +
         '</span><div class="aid-button-group aid-learn-substances">' +
         choice(null, label('learnRule.none')) +
         [...state.document.substances, {index : HORMONES.levels} ]
             .map(s => choice(s.index, substanceName(state, s.index), substanceColor(s.index)))
             .join('') +
         '</div></div>';
}
function regionControls(state, organ) {
  if (!planned(organ))
    return '';
  const region = organ.region;
  const follows = regionPlan(state.document, organ).view
                      ? '<label class="aid-checkbox"><input type="checkbox" data-region-follow="' +
                            escapeText(organ.id) + '"' + (region.follow ? ' checked' : '') + '/>' +
                            label('regions.follow') + '</label><p class="aid-hint">' +
                            t('units.joined', {
                              a : label('regions.' + organ.type + '.follows'),
                              b : label('regions.followHint')
                            }) +
                            '</p>'
                      : '';
  const wanted = regionPlan(state.document, organ).nodes.length;
  const crowded =
      organ.centers.length < wanted
          ? '<p class="aid-hint aid-warning">' +
                escapeText(t('studio.regions.crowded', {n : organ.centers.length, of : wanted})) +
                '</p>'
          : '';
  return '<section class="aid-eye-section"><h4>' + label('regions.settingsTitle') + '</h4>' +
         regionPicture(state, organ) + (organ.type === 'value' ? '' : regionTeacher(state, organ)) +
         crowded + follows + '</section>';
}
export function regionSettings(state, organ) {
  return '<section class="aid-eye-section">' + regionGraph(state, organ) + '</section>' +
         regionControls(state, organ);
}
