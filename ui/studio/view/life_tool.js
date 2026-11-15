// The tool "Leben" (life): the state the fish is tried in, set in the fish panel. Below the fish
// lies its life from egg to grown fish, on the axis of the cells' life cycle (life_cycle.js), with
// the knob "now": the maturity every picture of the Atelier is drawn at. Beside it the rest of
// that state: the energy reserve, the exhaustion and the level of each messenger the fish uses,
// each a vessel filled to its level, the knob on the level.
// All of it is the preview's blood (trials.js, setPreviewContext; development.js,
// previewContextOf): one state, read by the inspectors, set here and nowhere else. The pictures
// show that state whatever tool is chosen, so the life stays in view with every tool, with its
// knobs only while this tool is chosen; a click on it chooses the tool. The fish itself stays as
// it is. Every knob is an input (round): it tries the fish, it does not change it.
import {BLOOD_SUBSTANCE} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {bloodLevel} from '../model/document.js';
import {previewContextOf, previewSubstances} from './development.js';
import {LIFE_STAGE, stageIcon, stageWord} from './life_cycle.js';
import {escapeText, fixed} from './markup.js';
import {substanceName} from './substances.js';

// The bar: the life from `left` to `right`, its band `band` high round `line`; the knob `over`
// the band. Then a vessel every `pitch`, `vessel` in radius.
const BAR = Object.freeze({
  left : 16,
  right : 316,
  line : 38,
  band : 30,
  over : 9,
  words : 68,
  height : 76,
  closed : 34,
  knob : 7,
  gap : 46,
  pitch : 96,
  vessel : 14,
  grip : 6
});
const lifeX = share => BAR.left + (BAR.right - BAR.left) * share;
// What is set beside the maturity: reserve and exhaustion always, a messenger once the fish
// uses it.
function levelsOf(state) {
  const always = [ BLOOD_SUBSTANCE.reserve, BLOOD_SUBSTANCE.fatigue ];
  return [
    ...always,
    ...previewSubstances(state.document, state.capabilities).filter(k => !always.includes(k))
  ];
}
// A vessel's place and where its level stands.
const vesselX = n => BAR.right + BAR.gap + BAR.pitch * n;
const surface = level => BAR.line + BAR.vessel - 2 * BAR.vessel * level;
const nowLine = (x, top) => 'M' + x + ' ' + (top - BAR.over) + ' V' + (top + BAR.band + 3);
function lifeLine(context, open) {
  const B = BAR, line = open ? B.line : B.closed / 2, top = line - B.band / 2,
        {hatch, adult} = LIFE_STAGE, young = (hatch + adult) / 2, grown = (adult + 1) / 2,
        now = fixed(lifeX(context.maturity));
  const words =
      open ? [ [ hatch / 2, 'egg' ], [ hatch, 'hatch' ], [ young, 'young' ], [ grown, 'grown' ] ]
                 .map(([ at, key ]) => '<text text-anchor="middle" x="' + fixed(lifeX(at)) +
                                       '" y="' + B.words + '">' + escapeText(stageWord(key)) +
                                       '</text>')
                 .join('')
           : '';
  return '<rect class="aid-life-field" x="' + B.left + '" y="' + top + '" width="' +
         (B.right - B.left) + '" height="' + B.band + '" rx="6"/><rect class="aid-life-egg" x="' +
         B.left + '" y="' + top + '" width="' + fixed(lifeX(hatch) - B.left) + '" height="' +
         B.band + '" rx="6"/>' + stageIcon('egg', lifeX(hatch / 2), line, .55) +
         stageIcon('hatch', lifeX(hatch), line, .45) + stageIcon('young', lifeX(young), line, .7) +
         stageIcon('adult', lifeX(grown), line, 1.1) + words +
         '<path class="aid-life-now" data-life-now="' + top + '" d="' +
         (open ? nowLine(now, top) : 'M' + now + ' ' + top + ' V' + (top + B.band)) + '"/>' +
         (open ? '<text data-life-now-word x="' + fixed(lifeX(context.maturity) + B.knob + 4) +
                     '" y="' + (top - B.over + 3) + '">' + escapeText(stageWord('now')) +
                     '</text><circle class="aid-graphic-handle" data-preview-handle="maturity" ' +
                     'data-level-left="' + B.left + '" data-level-right="' + B.right + '" cx="' +
                     now + '" cy="' + (top - B.over) + '" r="' + B.knob + '"/>'
               : '');
}
function vessel(state, context, index, n) {
  const B = BAR, x = vesselX(n), r = B.vessel, level = bloodLevel(context, index),
        y = surface(level), colour = substanceColor(index), clip = 'aid-life-vessel-' + index;
  return '<g style="--substance:' + colour + '"><clipPath id="' + clip + '"><circle cx="' + x +
         '" cy="' + B.line + '" r="' + r + '"/></clipPath><circle class="aid-life-vessel" cx="' +
         x + '" cy="' + B.line + '" r="' + r + '"/><rect class="aid-life-amount" ' +
         'data-life-amount="' + index + '" clip-path="url(#' + clip + ')" x="' + (x - r) + '" y="' +
         fixed(y) + '" width="' + 2 * r + '" height="' + fixed(B.line + r - y) +
         '"/><text text-anchor="middle" x="' + x + '" y="' + B.words + '" style="fill:' + colour +
         '">' + escapeText(substanceName(state, index)) +
         '</text><circle class="aid-graphic-handle" data-preview-handle="' + index +
         '" data-level-bottom="' + (B.line + r) + '" data-level-top="' + (B.line - r) + '" cx="' +
         x + '" cy="' + fixed(y) + '" r="' + B.grip + '"/></g>';
}
export function lifeBar(state) {
  if (state.mode !== 'fish')
    return '';
  const B = BAR, open = state.tool === 'life', context = previewContextOf(state),
        levels = open ? levelsOf(state) : [],
        width = (levels.length ? vesselX(levels.length - 1) + B.pitch / 2 : B.right + B.left),
        height = open ? B.height : B.closed;
  return '<div class="aid-life-bar' + (open ? ' open' : '') + '"' +
         (open ? '' : ' data-tool="life" title="' + escapeText(stageWord('tool')) + '"') +
         '><svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' +
         height + '" data-preview-bars role="group">' + lifeLine(context, open) +
         levels.map((index, n) => vessel(state, context, index, n)).join('') + '</svg></div>';
}
// A dragged knob stays the element it is; the bar follows the state in place.
export function syncLifeBar(root, state) {
  const bar = root.querySelector('.aid-life-bar svg');
  if (!bar)
    return;
  const B = BAR, context = previewContextOf(state), now = bar.querySelector('[data-life-now]'),
        top = Number(now?.dataset.lifeNow), x = fixed(lifeX(context.maturity)),
        knob = bar.querySelector('[data-preview-handle="maturity"]');
  now?.setAttribute('d', knob ? nowLine(x, top) : 'M' + x + ' ' + top + ' V' + (top + B.band));
  knob?.setAttribute('cx', x);
  bar.querySelector('[data-life-now-word]')?.setAttribute('x', fixed(Number(x) + B.knob + 4));
  for (const amount of bar.querySelectorAll('[data-life-amount]')) {
    const index = amount.dataset.lifeAmount, y = surface(bloodLevel(context, Number(index)));
    amount.setAttribute('y', fixed(y));
    amount.setAttribute('height', fixed(B.line + B.vessel - y));
    bar.querySelector('[data-preview-handle="' + index + '"]')?.setAttribute('cy', fixed(y));
  }
}
