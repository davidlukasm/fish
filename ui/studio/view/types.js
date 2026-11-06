import {ORGAN_BY_KEY} from '../model/organs.js';
import {organTypes} from '../model/document.js';
import {escapeText} from './markup.js';
import {t} from '../../strings.js';

export function typeChips(organ, chosen, mark, words) {
  const types = organTypes(organ), most = ORGAN_BY_KEY[organ.type].types;
  if (!(most > 1))
    return '';
  const chip = (cls, attributes, body, title = '') =>
      '<button type="button" class="aid-type-chip' + cls + '" ' + attributes +
      (title ? ' title="' + escapeText(title) + '"' : '') + '>' + body + '</button>';
  return '<div class="aid-type-chips">' +
         types
             .map((type, i) => {
               const {icon, name} = mark(type, i);
               return chip(type.id === chosen.id ? ' active' : '',
                           'data-organ-type="' + escapeText(type.centers[0].id) + '"',
                           icon + escapeText(name));
             })
             .join('') +
         (types.length < most ? chip(' add', 'data-add-type="' + escapeText(organ.id) + '"',
                                     escapeText(t('studio.marks.add', {name : words.add})))
                              : '') +
         (types.length > 1 ? chip(' remove',
                                  'data-remove-type="' + escapeText(organ.id) + '" data-type-id="' +
                                      escapeText(chosen.id) + '"',
                                  escapeText(t('studio.marks.remove')), words.remove)
                           : '') +
         '</div>';
}
