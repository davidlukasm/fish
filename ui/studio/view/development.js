import {HORMONES} from '../../schema.js';
import {allCenters} from '../model/document.js';
import {barShare, dragBar, escapeText, fixed} from './markup.js';
import {formatNumber, namedText} from '../../strings.js';
import {
  LIFE_EFFECTS,
  lifePhaseEditor,
  receptorBody,
  substanceMark,
  substanceName
} from './substances.js';
import {cellVariation, contactCapacity} from './cell_tissue.js';
import {label} from './kit.js';
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT =
    Object.freeze({maturity : 0, hormones : Object.freeze(Array(HORMONES.levels).fill(0))});
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
export const DEFAULT_PREVIEW_INPUT = 1;
export const previewInputOf = state => state.previewInput ?? DEFAULT_PREVIEW_INPUT;
const word = key => label('development.' + key);
const PREVIEW_DIGITS = 2;
// The example situation as bars to drag: body maturity, each substance and the example input.
const PREVIEW_BARS = Object.freeze(
    {width : 300, height : 96, top : 12, bottom : 70, gauge : 12, knob : 7, mark : 88});
export const PREVIEW_INPUT_LOW = -1;
// A substance gets an example level once it is named or a cell answers it.
function previewSubstances(doc) {
  const used = new Set(doc.substances.map(substance => substance.index));
  for (const center of allCenters(doc))
    for (const receptor of [center.growth, ...center.receptors])
      if (receptor?.active && receptor.substance < HORMONES.levels)
        used.add(receptor.substance);
  return [...used ].sort((a, b) => a - b);
}
function previewColumns(state) {
  const context = previewContextOf(state);
  return [
    {key : 'maturity', value : context.maturity, low : 0, index : HORMONES.levels},
    ...previewSubstances(state.document)
        .map(index => ({key : String(index), value : context.hormones[index], low : 0, index})),
    {key : 'input', value : previewInputOf(state), low : PREVIEW_INPUT_LOW, index : null}
  ];
}
export function previewPatch(state, key, fy) {
  const column = previewColumns(state).find(c => c.key === key);
  return column ? column.low + (1 - column.low) * barShare(PREVIEW_BARS, fy) : null;
}
export function previewControls(state) {
  const B = PREVIEW_BARS, columns = previewColumns(state), step = B.width / columns.length;
  const y = (value, low) => B.bottom - (B.bottom - B.top) * (value - low) / (1 - low);
  const bars = columns.map((c, k) => {
    const x = step * (k + .5), base = y(Math.max(c.low, 0), c.low), at = y(c.value, c.low);
    const colour = c.index === null ? 'var(--aid-size)' : substanceColor(c.index);
    const name = c.index === null ? word('exampleInput') : substanceName(state, c.index);
    return dragBar(B, x, {
             base,
             at,
             level : 'class="aid-preview-level" fill="' + colour + '"',
             handle : 'data-preview-handle="' + c.key + '"',
             title : namedText(name, formatNumber(c.value, PREVIEW_DIGITS)),
             mark : c.index === null ? label('development.inputMark')
                                     : substanceMark(state, c.index)
           }) +
           (c.low < 0 ? '<path class="aid-dose-zero" d="M' + fixed(x - B.gauge / 2) + ' ' +
                            fixed(base) + ' h' + B.gauge + '"/>'
                      : '');
  });
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><svg class="aid-preview-bars" viewBox="0 0 ' + B.width + ' ' + B.height +
         '" data-preview-bars role="img" aria-label="' + escapeText(word('preview')) + '">' +
         bars.join('') + '</svg></details>';
}
export function cellDevelopment(state, center) {
  if (!center || !state.capabilities)
    return '';
  const chosen =
      LIFE_EFFECTS.includes(state.developmentEffect) ? state.developmentEffect : LIFE_EFFECTS[0];
  return '<details class="aid-cell-development"><summary>' + word('title') + '</summary>' +
         lifePhaseEditor(state, center, chosen) + receptorBody(state, center, chosen) +
         '</details>' + contactCapacity(state, center) + cellVariation(center);
}
