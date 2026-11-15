// The tool "Leben" (life): the state the fish is tried in, set in the fish panel. Below the fish
// lies its life from egg to grown fish, on the axis of the cells' life cycle (life_cycle.js), with
// the knob "now": the maturity every picture of the Atelier is drawn at. Beside it the rest of
// that state: the energy reserve, the exhaustion and the level of each messenger the fish uses.
// All of it is the preview's blood (trials.js, setPreviewContext; development.js,
// previewContextOf): one state, read by the inspectors, set here. The fish itself stays as it is.
// Every knob is an input (round): it tries the fish, it does not change it.
import {BLOOD_SUBSTANCE} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {bloodLevel} from '../model/document.js';
import {previewContextOf, previewSubstances} from './development.js';
import {LIFE_STAGE, stageIcon, stageWord} from './life_cycle.js';
import {escapeText, fixed} from './markup.js';
import {substanceName} from './substances.js';

// The bar: the life from `left` to `right`; then a level every `pitch`, `span` long.
const BAR = Object.freeze({
  height : 74,
  left : 16,
  right : 316,
  line : 34,
  band : 30,
  words : 66,
  knob : 7,
  gap : 28,
  pitch : 116,
  span : 84,
  name : 16
});
const lifeX = share => BAR.left + (BAR.right - BAR.left) * share;
// What is set beside the maturity: reserve and exhaustion always, a messenger once the fish
// uses it.
function levelsOf(state) {
  const fixedOnes = [ BLOOD_SUBSTANCE.reserve, BLOOD_SUBSTANCE.fatigue ];
  return [
    ...fixedOnes,
    ...previewSubstances(state.document, state.capabilities).filter(k => !fixedOnes.includes(k))
  ];
}
const levelLeft = n => BAR.right + BAR.gap + BAR.pitch * n;
const knob = (key, x, y, left, right) =>
    '<circle class="aid-graphic-handle" data-preview-handle="' + key + '" data-level-left="' +
    left + '" data-level-right="' + right + '" cx="' + fixed(x) + '" cy="' + y + '" r="' +
    BAR.knob + '"/>';
export function lifeBar(state) {
  if (state.tool !== 'life' || state.mode !== 'fish')
    return '';
  const B = BAR, context = previewContextOf(state), levels = levelsOf(state),
        width = levelLeft(levels.length) - B.gap + B.left, top = B.line - B.band / 2,
        {hatch, adult} = LIFE_STAGE, young = (hatch + adult) / 2, grown = (adult + 1) / 2;
  const life =
      '<rect class="aid-life-field" x="' + B.left + '" y="' + top + '" width="' +
      (B.right - B.left) + '" height="' + B.band + '" rx="6"/><rect class="aid-life-egg" x="' +
      B.left + '" y="' + top + '" width="' + fixed(lifeX(hatch) - B.left) + '" height="' + B.band +
      '" rx="6"/>' + stageIcon('egg', lifeX(hatch / 2), B.line, .55) +
      stageIcon('hatch', lifeX(hatch), B.line, .45) + stageIcon('young', lifeX(young), B.line, .7) +
      stageIcon('adult', lifeX(grown), B.line, 1.1) +
      [ [ hatch / 2, 'egg' ], [ young, 'young' ], [ grown, 'grown' ] ]
          .map(([ at, key ]) => '<text class="aid-life-word" text-anchor="middle" x="' +
                                fixed(lifeX(at)) + '" y="' + B.words + '">' +
                                escapeText(stageWord(key)) + '</text>')
          .join('') +
      '<path class="aid-life-now" data-life-now d="M' + fixed(lifeX(context.maturity)) + ' ' +
      (top - 4) + ' V' + (top + B.band + 4) + '"/>' +
      knob('maturity', lifeX(context.maturity), top - 4, B.left, B.right);
  const state_ =
      levels
          .map((index, n) => {
            const left = levelLeft(n), x = left + B.span * bloodLevel(context, index),
                  colour = substanceColor(index);
            return '<g style="--substance:' + colour + '"><text class="aid-life-word" x="' + left +
                   '" y="' + B.name + '" style="fill:' + colour + '">' +
                   escapeText(substanceName(state, index)) +
                   '</text><path class="aid-life-level" d="M' + left + ' ' + B.line + ' H' +
                   (left + B.span) + '"/><path class="aid-life-amount" ' +
                   'data-life-amount="' + index + '" d="M' + left + ' ' + B.line + ' H' + fixed(x) +
                   '"/>' + knob(index, x, B.line, left, left + B.span) + '</g>';
          })
          .join('');
  return '<div class="aid-life-bar"><svg width="' + width + '" height="' + B.height +
         '" viewBox="0 0 ' + width + ' ' + B.height + '" data-preview-bars role="group">' + life +
         state_ + '</svg></div>';
}
// A dragged knob stays the element it is; the bar follows the state in place.
export function syncLifeBar(root, state) {
  const bar = root.querySelector('.aid-life-bar svg');
  if (!bar)
    return;
  const B = BAR, context = previewContextOf(state), top = B.line - B.band / 2;
  for (const handle of bar.querySelectorAll('[data-preview-handle]')) {
    const key = handle.dataset.previewHandle, left = Number(handle.dataset.levelLeft),
          right = Number(handle.dataset.levelRight),
          level = key === 'maturity' ? context.maturity : bloodLevel(context, Number(key)),
          x = fixed(left + (right - left) * level);
    handle.setAttribute('cx', x);
    if (key === 'maturity')
      bar.querySelector('[data-life-now]')
          ?.setAttribute('d', 'M' + x + ' ' + (top - 4) + ' V' + (top + B.band + 4));
    else
      bar.querySelector('[data-life-amount="' + key + '"]')
          ?.setAttribute('d', 'M' + left + ' ' + B.line + ' H' + x);
  }
}
