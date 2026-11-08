import {allCenters, compileDocument, wireContactPairs} from '../model/document.js';
import {nerveClass} from '../model/organs.js';
import {learningTimeSteps} from '../../tuning.js';
import {centerTitle, organTitle} from './names.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';
import {formatNumber, percent} from '../../strings.js';

const word = key => label('contacts.' + key);
export function contactPlan(state, chosen, wire = null) {
  chosen = chosen.filter(Boolean);
  if (!state.capabilities || !chosen.length)
    return '';
  const doc = state.document, centers = allCenters(doc), neural = state.capabilities.neural;
  const selected = new Set(chosen.map(center => centers.findIndex(item => item.id === center.id)));
  const pairs = wire && wireContactPairs(doc, wire);
  const connections =
      compileDocument(doc, state.sites)
          .connections.filter(edge => !pairs || pairs.has(edge.from + ':' + edge.to));
  const name = center =>
      centerTitle(center) + ' · ' +
      organTitle(doc.organs.find(organ => organ.id === center.organId), state.sites);
  const link = center => '<button data-select-center="' + escapeText(center.id) + '">' +
                         escapeText(name(center)) + '</button>';
  const rows =
      connections.filter(edge => selected.has(edge.to) || selected.has(edge.from))
          .map(edge => {
            const source = centers[edge.from], target = centers[edge.to];
            const cl = source.role === 'sensor' ? {sign : 1, modulator : 0} : nerveClass(source);
            const modulation = target.role === 'motor' ? 0 : cl.modulator;
            const limit =
                (1 - modulation) * target.electrical_limit + modulation * target.teaching_limit;
            const learning =
                learningTimeSteps((target.role === 'motor' ? source : target).learning_tau);
            return '<tr><td>' + link(source) + '</td><td>' + link(target) + '</td><td>' +
                   (cl.sign < 0 ? '−' : '+') + fixed(limit, 3) + '</td><td>' + percent(modulation) +
                   '</td><td>' + Math.ceil(neural.contactTrial * learning) + '</td></tr>';
          })
          .join('');
  const slots = chosen.filter(center => center.role !== 'sensor')
                    .map(center => {
                      const count = center.role === 'motor'
                                        ? neural.effectorSlots
                                        : Math.round(neural.slotMin *
                                                     Math.pow(neural.slotSpan, center.field));
                      return '<div><dt>' + escapeText(centerTitle(center)) + '</dt><dd>' +
                             formatNumber(count) + '</dd></div>';
                    })
                    .join('');
  return '<details class="aid-contact-plan"><summary>' + word('title') +
         '</summary><p class="aid-hint">' + word('meaning') + '</p>' +
         (slots
              ? '<h5>' + word('slots') + '</h5><dl class="aid-parameter-readout">' + slots + '</dl>'
              : '') +
         '<p class="aid-hint">' + word('fields').replace('{n}', neural.contactFields) + '</p>' +
         (rows
              ? '<div class="aid-contact-table-scroll"><table class="aid-contact-plan-table"><thead><tr><th>' +
                    word('source') + '</th><th>' + word('target') + '</th><th>' + word('limit') +
                    '</th><th>' + word('modulation') + '</th><th>' + word('probation') +
                    '</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
              : '<p class="aid-hint">' + word('none') + '</p>') +
         '<p class="aid-hint">' + word('learningMeaning') + '</p></details>';
}
