import {acceptedGenome} from './compiler.js';
import {label} from './kit.js';

// Whether the fish is built as drawn: a genome the build made from this design and still holds. A
// genome opened on its own (a file, the start fish) is not.
export const builtAsDrawn = state => acceptedGenome(state) && !!state.report?.compiler;
// While stimuli are given or shown, the scene says whether they run as a preview along the drawn
// wires or through the fish built as drawn.
export function stimulusKind(state) {
  if (state.tool !== 'stimulate' && !state.stimulus)
    return '';
  const real = state.stimulus ? state.stimulus.real : builtAsDrawn(state);
  return '<div class="aid-stimulus-kind' + (real ? ' real' : '') + '" role="status">' +
         label(real ? 'stimulus.real' : 'stimulus.preview') + '</div>';
}
