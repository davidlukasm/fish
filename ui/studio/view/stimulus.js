import {acceptedGenome} from './compiler.js';
import {label} from './kit.js';
import {t} from '../../strings.js';
import {escapeText} from './markup.js';

export const builtAsDrawn = state => acceptedGenome(state) && !!state.report?.compiler;
export function stimulusKind(state) {
  if (state.tool !== 'stimulate')
    return '';
  if (state.probeMode !== 'neural')
    return '<div class="aid-stimulus-kind" role="status">' + label('stimulus.senses') + '</div>';
  const result = state.stimulus;
  const text = result ? t('studio.stimulus.result', {
    active : result.stimulated,
    precursor : result.sourceLife[0],
    dead : result.sourceLife[2]
  })
                      : label(builtAsDrawn(state) ? 'stimulus.ready' : 'stimulus.waiting');
  return '<div class="aid-stimulus-kind' + (result ? ' real' : '') + '" role="status">' +
         escapeText(text) + '</div>';
}
