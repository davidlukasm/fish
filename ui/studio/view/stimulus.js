import {label} from './kit.js';
export function stimulusKind(state) {
  return state.tool === 'stimulate'
             ? '<div class="aid-stimulus-kind" role="status">' +
                   label('stimulus.' + (state.traceSource ?? 'plan')) + '</div>'
             : '';
}
