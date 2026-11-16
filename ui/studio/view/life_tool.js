// The tool "Leben" (life): the state the fish is tried in, set in the fish panel. Below the fish
// lies its life from egg to grown fish, on the axis of the cells' life cycle (life_cycle.js), with
// the knob "now": the maturity every picture of the Atelier is drawn at. Beside it the rest of
// that state: the energy reserve, the exhaustion and the level of each messenger the fish uses,
// each a vessel filled to its level, in the colour it has in the blood sense's wheel, the knob
// at its rim at the level's height.
// All of it is the preview's blood (trials.js, setPreviewContext; development.js,
// previewContextOf): one state, read by the inspectors, set here and nowhere else. The pictures
// show that state whatever tool is chosen, so all of it stays in view with every tool, with its
// knobs and words only while this tool is chosen; a click on it chooses the tool. The fish itself
// stays as it is. Every knob is an input (round): it tries the fish, it does not change it.
import {BLOOD_SUBSTANCE} from '../../schema.js';
import {bloodColour} from '../../hormones.js';
import {bloodLevel} from '../model/document.js';
import {previewContextOf, previewSubstances} from './development.js';
import {LIFE_STAGE, stageIcon, stageWord} from './life_cycle.js';
import {escapeText, fixed} from './markup.js';
import {substanceName} from './substances.js';

// The bar: the life from `left` to `right`, its band `band` high round `line`; the knob `over`
// the band. Then a vessel every `pitch`, `vessel` in radius; beside the closed life every
// `close`, `small` in radius, the first `near` the life.
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
  pitch : 100,
  vessel : 14,
  grip : 6,
  near : 22,
  close : 26,
  small : 9,
  aside : .8
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
// A vessel's place, its radius and where its level stands in it: beside the open life with room
// for its name, beside the closed one small and close.
const vesselOf = (n, open) => {
  const B = BAR, r = open ? B.vessel : B.small, line = open ? B.line : B.closed / 2;
  return {
    x : B.right + (open ? B.gap + B.pitch * n : B.near + B.close * n),
    line,
    r,
    surface : level => line + r - 2 * r * level,
    // Where the knob sits for a level at height y: outside the rim, on it, and never nearer the
    // vessel's middle line than `aside` of its radius, so that it stays beside the vessel.
    rim : y => B.right + (open ? B.gap + B.pitch * n : B.near + B.close * n) +
               Math.max(B.aside * r, Math.sqrt(Math.max(0, r * r - (y - line) ** 2))) + B.grip + 1
  };
};
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
// A vessel filled to its level. Open, its knob sits outside its rim at the level's height and is
// dragged up and down; closed, it only shows the level.
function vessel(state, context, index, n, open) {
  const B = BAR, {x, line, r, surface, rim} = vesselOf(n, open),
        y = surface(bloodLevel(context, index)), colour = bloodColour(index),
        clip = 'aid-life-vessel-' + index;
  return '<g style="--substance:' + colour + '"><clipPath id="' + clip + '"><circle cx="' + x +
         '" cy="' + line + '" r="' + r + '"/></clipPath><circle class="aid-life-vessel" cx="' + x +
         '" cy="' + line + '" r="' + r + '"/><rect class="aid-life-amount" data-life-amount="' +
         index + '" data-life-vessel="' + n + '" clip-path="url(#' + clip + ')" x="' + (x - r) +
         '" y="' + fixed(y) + '" width="' + 2 * r + '" height="' + fixed(line + r - y) + '"/>' +
         (open ? '<text text-anchor="middle" x="' + x + '" y="' + B.words +
                     '" style="fill:' + colour + '">' + escapeText(substanceName(state, index)) +
                     '</text><circle class="aid-graphic-handle" data-preview-handle="' + index +
                     '" data-level-bottom="' + (line + r) + '" data-level-top="' + (line - r) +
                     '" cx="' + fixed(rim(y)) + '" cy="' + fixed(y) + '" r="' + B.grip + '"/>'
               : '') +
         '</g>';
}
export function lifeBar(state) {
  if (state.mode !== 'fish')
    return '';
  const B = BAR, open = state.tool === 'life', context = previewContextOf(state),
        levels = levelsOf(state), last = vesselOf(levels.length - 1, open),
        width = last.x + (open ? B.pitch / 2 : last.r + B.left),
        height = open ? B.height : B.closed;
  return '<div class="aid-life-bar' + (open ? ' open' : '') + '"' +
         (open ? '' : ' data-tool="life" title="' + escapeText(stageWord('tool')) + '"') +
         '><svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' +
         height + '" data-preview-bars data-life-open="' + (open ? 1 : 0) + '" role="group">' +
         lifeLine(context, open) +
         levels.map((index, n) => vessel(state, context, index, n, open)).join('') + '</svg></div>';
}
// A dragged knob stays the element it is; the bar follows the state in place.
export function syncLifeBar(root, state) {
  const bar = root.querySelector('.aid-life-bar svg');
  if (!bar)
    return;
  bar.closest('[data-fish-life]')?.setAttribute('data-life-dirty', '');
  const B = BAR, context = previewContextOf(state), now = bar.querySelector('[data-life-now]'),
        top = Number(now?.dataset.lifeNow), x = fixed(lifeX(context.maturity)),
        knob = bar.querySelector('[data-preview-handle="maturity"]');
  now?.setAttribute('d', knob ? nowLine(x, top) : 'M' + x + ' ' + top + ' V' + (top + B.band));
  knob?.setAttribute('cx', x);
  bar.querySelector('[data-life-now-word]')?.setAttribute('x', fixed(Number(x) + B.knob + 4));
  for (const amount of bar.querySelectorAll('[data-life-amount]')) {
    const index = amount.dataset.lifeAmount,
          {line, r, surface, rim} = vesselOf(Number(amount.dataset.lifeVessel), !!knob),
          y = surface(bloodLevel(context, Number(index))),
          grip = bar.querySelector('[data-preview-handle="' + index + '"]');
    amount.setAttribute('y', fixed(y));
    amount.setAttribute('height', fixed(line + r - y));
    grip?.setAttribute('cy', fixed(y));
    grip?.setAttribute('cx', fixed(rim(y)));
  }
}
