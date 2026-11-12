import {label} from './kit.js';
export function stimulusKind(state) {
  return state.tool === 'stimulate'
             ? '<div class="aid-stimulus-kind" role="status">' +
                   label('stimulus.' + (state.traceSource ?? 'plan')) +
                   '<div class="aid-signal-legend">' +
                   [ 'excitation', 'inhibition', 'teaching', 'rhythm', 'hormone' ]
                       .map(kind => '<span><i class="' + kind + '"></i>' +
                                    label('stimulus.signals.' + kind) + '</span>')
                       .join('') +
                   '</div><small>' + label('stimulus.arrivals') + '</small></div>'
             : '';
}
