import {regionGraph} from './region_graph.js';
import {substanceColor} from '../../hormones.js';
import {ORGAN_BY_KEY, PAIRINGS} from '../model/organs.js';
import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {isLearner, substanceBound} from '../model/document.js';
import {substanceName} from './substances.js';
import {escapeText, glyph} from './markup.js';
import {planned, regionPlan, regionSlots} from '../model/regions.js';
import {joinParts, t} from '../../strings.js';
import {ICON, icon, iconSwitch, label, slotFill, slotShape} from './kit.js';
import {organTitle, slotTitle} from './names.js';
import {regionPicture} from './region_controls.js';

const PAIRING_BOX = 20;
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
export const pairingChoice = wire =>
    !wire.pairing
        ? ''
        : '<div class="aid-wire-pairing" role="group" aria-label="' +
              label('inspector.pairing.title') + '">' +
              PAIRINGS
                  .map(p => '<button class="aid-pairing" data-wire-pairing="' +
                            escapeText(wire.id) + '" data-pairing-value="' + p +
                            '" aria-pressed="' + (wire.pairing === p) + '">' +
                            glyph(PAIRING_GLYPH[p], PAIRING_BOX, {box : PAIRING_BOX}) + '<span>' +
                            label('inspector.pairing.' + p) + '</span></button>')
                  .join('') +
              '</div>';
// Each port as its symbol and name, framed by whether it is filled, missing or free, followed by
// the organs on it and a button that adds one.
export function slotsSection(state, organ) {
  if (!ORGAN_BY_KEY[organ.type].slots)
    return '';
  const slots =
      regionSlots(state.document, organ)
          .map(slot =>
                   '<li class="' + slotFill(slot) + '" title="' + escapeText(joinParts([
                     slotTitle(slot), label(slot.required ? 'regions.required' : 'regions.optional')
                   ])) +
                   '"><span class="aid-slot-symbol ' + slotFill(slot) + ' ' + slot.dir + '">' +
                   glyph(slotShape(slot), ICON.slot, {line : true}) + '</span><small>' +
                   escapeText(slotTitle(slot)) + '</small>' +
                   slot.filled
                       .map(o => '<button data-select-organ="' + escapeText(o.id) + '" title="' +
                                 escapeText(organTitle(o, state.sites)) + '">' +
                                 icon(o.type, ICON.list) + '</button>')
                       .join('') +
                   '<button class="aid-slot-add" data-slot-region="' + escapeText(organ.id) +
                   '" data-slot-key="' + escapeText(slot.key) + '" data-slot-dir="' + slot.dir +
                   '" title="' + label(slot.dir === 'in' ? 'status.slotIn' : 'status.slotOut') +
                   '">+</button></li>')
          .join('');
  return '<section class="aid-eye-section" title="' + label('regions.slotsTitle') +
         '"><ul class="aid-region-slots">' + slots + '</ul></section>';
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
      (swatch ? ' style="--substance:' + swatch + '"' : '') + '><span class="aid-substance-swatch' +
      (swatch ? '' : ' none') + '"></span>' + escapeText(text) + '</button>';
  // The region's learning cells take this substance as their teacher (teachOrgan).
  return '<div class="aid-region-setting"><p class="aid-wheel-names-title">' +
         label('regions.settings.taughtBy') +
         '</p><div class="aid-button-group aid-learn-substances">' +
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
  const follows =
      regionPlan(state.document, organ).view
          ? iconSwitch('chain', region.follow, label('regions.follow'),
                       'data-region-follow="' + escapeText(organ.id) + '"', joinParts([
                         label('regions.' + organ.type + '.follows'), label('regions.followHint')
                       ]))
          : '';
  const wanted = regionPlan(state.document, organ).nodes.length;
  const crowded =
      organ.centers.length < wanted
          ? '<p class="aid-hint aid-warning">' +
                escapeText(t('studio.regions.crowded', {n : organ.centers.length, of : wanted})) +
                '</p>'
          : '';
  return '<section class="aid-eye-section">' + regionPicture(state, organ) +
         (organ.type === 'value' ? '' : regionTeacher(state, organ)) + crowded + follows +
         '</section>';
}
export function regionSettings(state, organ) {
  return '<section class="aid-eye-section">' + regionGraph(state, organ) + '</section>' +
         (state.selected?.kind === 'center' ? '' : regionControls(state, organ));
}
