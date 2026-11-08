import {acceptedGenome} from './compiler.js';
import {label} from './kit.js';

export const builtAsDrawn = state => acceptedGenome(state) && !!state.report?.compiler;
export function stimulusKind(state) {
  if (state.tool !== 'stimulate' && !state.stimulus)
    return '';
  const real = builtAsDrawn(state);
  return '<div class="aid-stimulus-kind' + (real ? ' real' : '') + '" role="status">' +
         label(real ? 'stimulus.real' : 'stimulus.waiting') + '</div>';
}
