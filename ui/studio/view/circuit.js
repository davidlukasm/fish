import {regionGraph} from './region_graph.js';
import {substanceColor} from '../../hormones.js';
import {ORGAN_BY_KEY, PAIRINGS} from '../model/organs.js';
import {HORMONE_EFFECT} from '../../schema.js';
import {chiasmWire, isLearner, regulatorySubstances, substanceBound} from '../model/document.js';
import {substanceName} from './substances.js';
import {escapeText, glyph} from './markup.js';
import {organPorts, planned, regionPlan, regionSlots} from '../model/regions.js';
import {joinParts, percent, t} from '../../strings.js';
import {ICON, icon, iconSwitch, label, slotFill, slotShape} from './kit.js';
import {organTitle, slotTitle} from './names.js';
import {regionPicture} from './region_controls.js';

const PAIRING_BOX = 20;
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
// Sight into the tectum takes no pairing: the cells cross by where they look (regions.js).
export const pairingChoice = (doc, wire) =>
    chiasmWire(doc, wire)
        ? '<p class="aid-wire-chiasm">' +
              glyph(PAIRING_GLYPH.crossed, PAIRING_BOX, {box : PAIRING_BOX, line : true}) +
              '<span>' + label('inspector.pairing.chiasm') + '</span></p>'
    : !wire.pairing
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
// The same from the other end: where this organ meets other organs' ports. Each row reads from
// left to right in the direction the signal runs: this organ's symbol, a line and the organ it
// feeds; or the organ that feeds it, a line and this organ's symbol. Joined, a full line; free,
// a dashed one with the button that joins it; the fish lacking that organ, pale and without a
// button. The symbol of the other organ leads to its inspector.
// How strong a contact into this organ's cells may grow is the receiving cells' own (one limit
// for every contact they take, colony-core substrate.cc): every incoming line is as thick as
// that limit, and one grip at the receiving end of the first sets it for all of them.
const PORT_LINE = Object.freeze({least : 1, span : 5});
export const PORT_LIMIT_DRAG = 60;
// A working cell takes its limit here when contacts reach it through a port; a nerve cell keeps it
// beside its teaching limit in its contact plan.
export const limitAtPorts = (state, organ, center) =>
    center?.role === 'motor' &&
    organPorts(state.document, organ, state.sites).some(port => port.dir === 'in');
export function portsSection(state, organ, center = null) {
  const limit = limitAtPorts(state, organ, center) ? center.electrical_limit : null;
  let gripped = limit === null;
  const rows =
      organPorts(state.document, organ, state.sites)
          .map(({dir, other, kind, slot, slots, joined}) => {
            const fill = joined ? 'filled' : other ? 'free' : 'absent';
            const name = other ? organTitle(other, state.sites) : label('organs.' + kind);
            const own = icon(organ.type, ICON.part);
            const far = other ? '<button data-select-organ="' + escapeText(other.id) + '" title="' +
                                    escapeText(name) + '">' + icon(other.type, ICON.part) +
                                    '</button>'
                              : '<span class="aid-port-absent" title="' + escapeText(name) + '">' +
                                    icon(kind, ICON.part) + '</span>';
            const thick = dir === 'in' && limit !== null;
            const grip = thick && !gripped;
            gripped ||= grip;
            const line =
                '<span class="aid-port-line"' +
                (thick ? ' style="border-top-width:' +
                             (PORT_LINE.least + PORT_LINE.span * limit).toFixed(1) + 'px"'
                       : '') +
                '>' +
                (other && !joined
                     ? '<button class="aid-slot-add" data-port-organ="' + escapeText(organ.id) +
                           '" data-port-other="' + escapeText(other.id) + '" data-port-key="' +
                           escapeText(slot.key) + '" data-port-dir="' + dir + '" title="' +
                           label('wiring.connect') + '">+</button>'
                     : '') +
                (grip ? '<span class="aid-port-grip" data-port-limit="' + escapeText(center.id) +
                            '" data-port-value="' + limit + '" title="' +
                            escapeText(
                                joinParts([ label('contacts.electrical_limit'), percent(limit) ])) +
                            '"></span>'
                      : '') +
                '</span>';
            return '<li class="' + fill + '">' +
                   (dir === 'out' ? own + line + far : far + line + own) + '<small>' +
                   escapeText(name.replace(/\u00ad/g, '')) + ' · ' +
                   escapeText((slots ?? [ slot ]).map(slotTitle).join(', ')) + '</small></li>';
          })
          .join('');
  return rows ? '<section class="aid-eye-section" title="' + label('regions.slotsTitle') +
                    '"><ul class="aid-ports">' + rows + '</ul></section>'
              : '';
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
         regulatorySubstances(state.document, state.capabilities)
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
