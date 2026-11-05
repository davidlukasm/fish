import {t} from '../../strings.js';
import {allCenters} from '../model/document.js';
import {endpointTitle} from './scene.js';
import {escapeText} from './markup.js';

const label = key => escapeText(t('studio.compiler.' + key));
export const acceptedGenome = state =>
    !!state.genome && !state.stale && state.report?.compiler?.ok !== false;
export function compilerPanel(state) {
  const report = state.stale ? null : state.report?.compiler;
  const options = state.document.compiler;
  const centers = allCenters(state.document);
  const select = (key, values, suffix = '') =>
      '<label>' + label(key) + '<select data-compiler-option="' + key + '">' +
      values
          .map(value => '<option value="' + value + '"' +
                        (options[key] === value ? ' selected' : '') + '>' +
                        (key.endsWith('Tolerance') ? Math.round(100 * value) : value) + suffix +
                        '</option>')
          .join('') +
      '</select></label>';
  const issues = report?.issues ?? [];
  const name = index =>
      centers[index] ? endpointTitle(state.document, centers[index].id, state.sites) : '';
  let content = select('capacityTolerance', [ 0, .05, .1, .25 ], '%') +
                select('traitTolerance', [ 0, .05, .1, .25 ], '%') +
                select('extraCells', [ 0, 2, 4, 8, 16 ]) +
                select('reserve', [ 0, 32, 64, 128, 256 ]);
  if (report) {
    content += '<p class="aid-compiler-result">' + label(report.ok ? 'passed' : 'failed') + ' · ' +
               report.nodes + ' ' + label('nodes') + ' · ' + report.reserve + ' ' + label('free') +
               '</p>';
    content += issues
                   .map(issue => '<button class="aid-compiler-issue" data-compiler-issue="' +
                                 (issue.to >= 0 ? issue.to : issue.from) + '">' +
                                 label('issues.' + issue.code) +
                                 (issue.from >= 0 ? ': ' + escapeText(name(issue.from)) : '') +
                                 (issue.to >= 0 && issue.to !== issue.from
                                      ? ' → ' + escapeText(name(issue.to))
                                      : '') +
                                 '</button>')
                   .join('');
  }
  content += '<button data-action="check"' +
             (!acceptedGenome(state) || !report || state.busy ? ' disabled' : '') + '>' +
             label('check') + '</button>';
  const tested = state.stale ? null : state.robustness;
  if (tested)
    for (const key of ['development', 'mutations']) {
      const trials = tested[key];
      content += '<p>' + label(key) + ': ' + trials.filter(r => r.ok).length + '/' + trials.length +
                 ' ' + label('within') + '</p>';
    }
  return '<details class="aid-compiler' + (report && !report.ok ? ' failed' : '') + '"><summary>' +
         label('title') + (report ? ' · ' + label(report.ok ? 'passed' : 'failed') : '') +
         '</summary><div class="aid-compiler-options">' + content + '</div></details>';
}
