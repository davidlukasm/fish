// What an organ does at each command, from an inhibiting one (down, left) to an exciting one (up,
// right): a gland pours or binds, a swim bladder fills or empties, a gonad works only one way. A
// command inside the gate does nothing; past it the organ follows the command (the effector output
// in substrate.cc: tanh of the command beyond the gate, the bias only setting the gate; organs that
// work one way take only its positive part, body_plan.cc).
import {clamp} from '../../units.js';
import {sideOf} from '../model/layout.js';
import {handleWord} from './sense_marks.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';

const word = key => t('studio.command.' + key);
const COMMAND = Object.freeze({
  width : 300,
  height : 76,
  left : 40,
  right : 284,
  middle : 34,
  reach : 20,
  words : 70,
  // The command runs this far either way; the widest gate is the bias scale, well inside it.
  span : 1,
  samples : 40,
  handle : 5.5
});
const text = (x, y, content, anchor = 'start') => '<text class="aid-handle-word" x="' + fixed(x) +
                                                  '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                  '">' + escapeText(content) + '</text>';

// `kind` names the organ's ways in the texts; `code` is its motor kind; a `oneWay` organ does
// nothing at an inhibiting command.
export function commandLine(state, organ, center, code, kind, oneWay = false) {
  const C = COMMAND, scale = state.capabilities?.biasScale, mid = (C.left + C.right) / 2;
  if (!center || !(scale > 0))
    return '';
  const gate = Math.max(0, center.threshold) * scale;
  const x = input => mid + (C.right - mid) * input / C.span;
  const work = input =>
      oneWay && input < 0 ? 0 : Math.sign(input) * Math.tanh(Math.max(0, Math.abs(input) - gate));
  const y = value => C.middle - C.reach * value / Math.tanh(C.span);
  const d = 'M' + Array
                      .from({length : 2 * C.samples + 1},
                            (_, i) => {
                              const input = C.span * (i / C.samples - 1);
                              return fixed(x(input)) + ' ' + fixed(y(work(input)));
                            })
                      .join(' L');
  const at = {x : x(gate), y : C.middle};
  return '<svg class="aid-effector-graphic aid-command-line" viewBox="0 0 ' + C.width + ' ' +
         C.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
         code + '" data-effector-side="' + sideOf(organ) + '" role="img" aria-label="' +
         escapeText(word('title')) + '"><rect class="aid-command-gate" x="' + fixed(x(-gate)) +
         '" y="' + (C.middle - C.reach) + '" width="' + fixed(x(gate) - x(-gate)) + '" height="' +
         2 * C.reach + '"/><path class="aid-sense-axis" d="M' + C.left + ' ' + C.middle + ' H' +
         C.right + '"/><path class="aid-command-work" d="' + d + '"/>' +
         text(C.right, C.middle - C.reach, word(kind + '.up'), 'end') +
         (oneWay ? '' : text(C.left, C.middle + C.reach, word(kind + '.down'))) +
         text(C.left, C.words, word('inhibits')) + text(mid, C.words, word('title'), 'middle') +
         text(C.right, C.words, word('excites'), 'end') +
         '<circle class="aid-graphic-handle" data-effector-handle="command:gate" data-frame="' +
         C.width + ',' + C.height + '" data-scale="' + scale + '" data-center="' +
         escapeText(center.id) + '" cx="' + fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' +
         C.handle + '"><title>' + escapeText(word('gateHandle')) + '</title></circle>' +
         handleWord(at, t('studio.sense.gateWord'), 'under') + '</svg>';
}

// The gate the handle sets, from the pointer `p` in the picture's units, as a patch of the cell.
export function commandPatch(p, marks) {
  const C = COMMAND, mid = (C.left + C.right) / 2, scale = Number(marks.scale);
  const gate = clamp((p.x - mid) / (C.right - mid) * C.span, 0, scale);
  return {id : marks.center, center : {threshold : gate / scale}};
}
