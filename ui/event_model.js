import {PALETTE} from './palette.js';
import {format, formatNumber, t, textArea} from './strings.js';
import {nameReason} from './species_model.js';
import {traitEvidence, traitName, traitNote} from './trait_model.js';
export const event_modelState = {};

const EVENT_KINDS = {
  trait : {icon : 'trait', color : PALETTE.lilac},
  record : {icon : 'record', color : PALETTE.gold},
  species : {icon : 'species', color : PALETTE.lilac},
  warning : {icon : 'warning', color : PALETTE.lilac},
  extinction : {icon : 'species', color : '#dc9d8f'},
  evolution : {icon : 'chart', color : PALETTE.lilac}
};
const RATIO_DIGITS = 2, NUTRITION_DIGITS = 1;

function eventValues(e) {
  const data = e.data || {}, values = {};
  for (const [key, value] of Object.entries(data))
    values[key] = key === 'ratio'             ? formatNumber(value, RATIO_DIGITS, true)
                  : typeof value === 'number' ? formatNumber(value)
                                              : value;
  if (data.reason)
    values.reason = nameReason(data.reason);
  if (data.trait)
    Object.assign(values, {
      trait : traitName(data.trait),
      note : traitNote(data.trait, data),
      evidence : traitEvidence(data)
    });
  if ('name' in data && !data.name)
    values.name = t('event_model.unknownSpecies');
  if (e.wording === 'record')
    Object.assign(values, {
      category : archiveCategory(data.category),
      value :
          t('event_model.recordValues.' + data.category,
            {n : formatNumber(data.value, data.category === 'nutrition' ? NUTRITION_DIGITS : 0)})
    });
  return values;
}

export function eventKind(e) { return EVENT_KINDS[e.kind] || EVENT_KINDS.evolution; }
export function eventKindName(e) {
  return t('event_model.kinds.' + (e.kind in EVENT_KINDS ? e.kind : 'evolution'));
}
export function eventText(e) { return t('event_model.wordings.' + e.wording, eventValues(e)); }
export function eventDetail(e) {
  const template = textArea('event_model').details?.[e.wording];
  return template ? format(template, eventValues(e)).trim() : '';
}
export function archiveCategory(key) { return t('event_model.categories.' + key); }
