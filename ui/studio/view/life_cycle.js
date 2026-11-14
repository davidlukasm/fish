// The life cycle of a cell: when it comes into being, how active it is, and when it dies (David,
// 13.11., draft in koordination: entwuerfe/inspektoren.html). Each of the three is one receptor
// (birth: the cell's growth receptor, which builds the cell while it answers; activity: the output
// receptor, the cell works with ½·(1 + answer); death: the death receptor, the cell dies once it
// answers above one half). A receptor that is not ticked runs by itself: the cell is there from the
// egg on, works fully and dies with the fish. A ticked one answers the fish's maturity, one
// substance, or several around one on the substance wheel.
//
// The picture is the fish's life itself (egg, young fish, grown fish), with the activity drawn
// thinly over it; a cell that answers substances gets a picture of its own for each, its axis the
// substance's level. Two grips carry the ends: the left one where the cell comes into being and how
// active it starts, the right one where it dies and how active it ends; a dashed line is where the
// activity turns, dragged across for the point and up and down for the steepness.
import {BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {
  DEATH_RESPONSE,
  NOTICEABLE_AFFINITY,
  neutralReceptor,
  receptorAffinity,
  updateCellGrowth,
  updateReceptor,
  wheelPlace
} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';
import {previewContextOf} from './development.js';
import {lifeResponses} from '../model/cell_life.js';
import {substanceMark, substanceName, substanceWheel} from './substances.js';

const word = (key, values) => t('studio.lifeCycle.' + key, values);
// The three actions, in the order the inspector lists them: coming into being and dying belong
// together, activity is set apart.
export const LIFE_ACTIONS = Object.freeze([ 'birth', 'death', 'output' ]);
const EFFECT = Object.freeze({output : HORMONE_EFFECT.output, death : HORMONE_EFFECT.death});
export const lifeReceptor = (center, key) =>
    key === 'birth' ? center.growth : center.receptors[EFFECT[key]];
// A receptor steers its action unless it is left as it starts: birth and death answering
// nothing, activity full; a flat activity at another level is a choice too.
export const steers = receptor =>
    !!receptor?.active &&
    (receptor.sensitivity !== 0 || (receptor.baseline !== 0 && receptor.baseline !== 1));
// Where the young fish counts as grown, for the picture only; hatching from the anatomy.
const ADULT = .72, HATCH = .3;

// The picture's geometry, shared with the handles that turn a pointer into a change.
export const LIFE = Object.freeze({
  width : 300,
  left : 14,
  right : 286,
  top : 30,
  base : 168,
  plain : 62,
  grip : 8,
  gap : 12,
  steepPixels : 20
});
const X = c => LIFE.left + (LIFE.right - LIFE.left) * clamp(c);

// What a receptor reads, as a key: 'auto' when it does not steer, the substance's index, or
// 'mix:<index>' when it reads its neighbours on the wheel noticeably too.
export function lifeSource(wheel, receptor) {
  if (!steers(receptor))
    return 'auto';
  const mixed =
      wheel && Array.from({length : wheel.regulators}, (_, i) => i)
                   .some(i => i !== receptor.substance &&
                              receptorAffinity(wheel, receptor, i) >= NOTICEABLE_AFFINITY);
  return mixed ? 'mix:' + receptor.substance : String(receptor.substance);
}
const MATURITY = String(BLOOD_SUBSTANCE.maturity);
// The blood a picture's axis stands for, at a level from 0 to 1: the maturity, one substance, or
// every substance of a mix; everything else as in the example situation.
function contextAt(state, axis, level) {
  const context = previewContextOf(state);
  const out = {...context, hormones : [...(context.hormones ?? []) ]};
  const set = index => {
    if (index === BLOOD_SUBSTANCE.maturity)
      out.maturity = level;
    else if (index === BLOOD_SUBSTANCE.reserve)
      out.reserve = level;
    else if (index === BLOOD_SUBSTANCE.fatigue)
      out.fatigue = level;
    else if (index === BLOOD_SUBSTANCE.cell_maturity)
      out.cellMaturity = level;
    else
      out.hormones[index] = level;
  };
  if (axis.startsWith('mix:'))
    for (let i = 0; i < (state.capabilities?.regulators ?? 0); ++i)
      set(i);
  else
    set(Number(axis));
  return out;
}
// How far the receptor's concentration moves when the axis goes from 0 to 1: a threshold at axis
// level v is the half point v times this.
export function axisReach(state, receptor, axis) {
  const wheel = state.capabilities;
  if (!wheel)
    return 1;
  const indices = axis.startsWith('mix:') ? Array.from({length : wheel.regulators}, (_, i) => i)
                                          : [ Number(axis) ];
  return Math.max(1e-4, indices.reduce((sum, i) => sum + receptorAffinity(wheel, receptor, i), 0));
}
const SAMPLES = 120;
// The cell along an axis: its activity at each level, and where it comes into being and dies when
// these follow the axis (lifeResponses: the death stays final).
function profileAlong(state, center, axis) {
  const wheel = state.capabilities;
  const here = key => lifeSource(wheel, lifeReceptor(center, key)) === axis;
  const levels = Array.from({length : SAMPLES + 1}, (_, i) => i / SAMPLES);
  // Each picture shows what follows its own axis; what follows another runs by itself here.
  const own = {
    ...center,
    growth : here('birth') ? center.growth : {...center.growth, active : 0},
    receptors : center.receptors.map((r, effect) => effect === EFFECT.output && !here('output')
                                                        ? {...neutralReceptor(EFFECT.output)}
                                                    : effect === EFFECT.death && !here('death')
                                                        ? {...r, active : 0}
                                                        : r)
  };
  const life = lifeResponses(wheel, own, levels.map(v => contextAt(state, axis, v)));
  const first = (key, test) => {
    if (!here(key))
      return null;
    const i = life.findIndex(test);
    return i < 0 ? null : levels[i];
  };
  return {
    here,
    birth : first('birth', p => p.birth > DEATH_RESPONSE),
    death : first('death', p => p.dead),
    activity : life.map(p => p.output)
  };
}

// ---- The choices on top: a tick for each action, then maturity or a substance. ----
function substanceDot(state, index, mixed = false) {
  const defined =
      index >= HORMONES.levels || state.document.substances.some(s => s.index === index);
  return '<i class="aid-life-dot' + (defined ? '' : ' free') + (mixed ? ' mixed' : '') +
         '" style="--substance:' + substanceColor(index) + '">' +
         escapeText(substanceMark(state, index)) + '</i>';
}
function sourceName(state, source, long = false) {
  if (source.startsWith('mix:'))
    return word(long ? 'mixLong' : 'mix');
  return substanceName(state, Number(source));
}
function menu(state, center, key, receptor) {
  const source = lifeSource(state.capabilities, receptor);
  const item = (attributes, content, chosen = false) =>
      '<button type="button" role="menuitemradio" aria-checked="' + chosen + '" ' + attributes +
      ' data-center-id="' + escapeText(center.id) + '" data-life-action="' + key + '">' + content +
      '</button>';
  const named = state.document.substances.slice().sort((a, b) => a.index - b.index);
  const free = Array.from({length : HORMONES.levels}, (_, i) => i)
                   .find(i => !named.some(s => s.index === i));
  return '<div class="aid-life-menu" role="menu">' +
         named
             .map(s => item('data-life-source="' + s.index + '"',
                            substanceDot(state, s.index) + '<span>' +
                                escapeText(substanceName(state, s.index)) + '</span>',
                            source === String(s.index)))
             .join('') +
         (free === undefined
              ? ''
              : item('data-life-new', substanceDot(state, free) + '<span class="soft">' +
                                          escapeText(word('newSubstance')) + '</span>')) +
         '<hr>' +
         // The cell's own maturity is no blood: it is always there to read, but not for a cell
         // that is yet to form, which has no age.
         [ BLOOD_SUBSTANCE.reserve, BLOOD_SUBSTANCE.fatigue, BLOOD_SUBSTANCE.cell_maturity ]
             .filter(i => i === BLOOD_SUBSTANCE.cell_maturity
                              ? key !== 'birth'
                              : i < (state.capabilities?.regulators ?? 0))
             .map(i => item('data-life-source="' + i + '"',
                            substanceDot(state, i) + '<span>' +
                                escapeText(substanceName(state, i)) + '</span>',
                            source === String(i)))
             .join('') +
         item('data-life-source="mix"',
              substanceDot(state, receptor.substance, true) + '<span>' + escapeText(word('mix')) +
                  '</span>',
              source.startsWith('mix:')) +
         '<hr><button type="button" data-open-tool="hormone" data-center-id="' +
         escapeText(center.id) + '"><span class="soft">' + escapeText(word('toHormones')) +
         '</span></button></div>';
}
function triggers(state, center) {
  return '<div class="aid-life-triggers">' +
         LIFE_ACTIONS
             .map(key => {
               const receptor = lifeReceptor(center, key), on = steers(receptor);
               const source = lifeSource(state.capabilities, receptor);
               const byMaturity = source === MATURITY,
                     open = state.lifeMenu === center.id + ':' + key;
               const stuff = on && !byMaturity;
               const id =
                   ' data-center-id="' + escapeText(center.id) + '" data-life-action="' + key + '"';
               return '<div class="aid-cell-life-row' + (key === 'output' ? ' apart' : '') + '">' +
                      '<button type="button" class="aid-life-tick" role="checkbox" aria-checked="' +
                      on + '" data-life-tick' + id + '><i></i><span>' + escapeText(word(key)) +
                      '</span></button><div class="aid-life-segment' + (on ? '' : ' off') +
                      '" role="group" aria-label="' + escapeText(word(key)) + '">' +
                      '<button type="button" class="maturity' + (on && byMaturity ? ' on' : '') +
                      '" data-life-source="' + BLOOD_SUBSTANCE.maturity + '"' + id + '>' +
                      escapeText(substanceName(state, BLOOD_SUBSTANCE.maturity)) + '</button>' +
                      '<button type="button" class="stuff' + (stuff ? ' on' : '') +
                      '" aria-haspopup="menu" aria-expanded="' + open + '" data-life-menu' + id +
                      '>' +
                      (stuff ? substanceDot(state, receptor.substance, source.startsWith('mix:'))
                             : '<i class="aid-life-dot free"></i>') +
                      '<span>' + escapeText(stuff ? sourceName(state, source) : word('messenger')) +
                      '</span><b></b></button></div>' +
                      (open ? menu(state, center, key, receptor) : '') + '</div>';
             })
             .join('') +
         '</div>';
}

// ---- The pictures. ----
const text = (x, y, content, attributes = '') => '<text x="' + fixed(x) + '" y="' + fixed(y) + '"' +
                                                 attributes + '>' + escapeText(content) + '</text>';
function stageIcon(kind, x, cy, s) {
  if (kind === 'egg')
    return '<ellipse class="aid-life-stage" cx="' + fixed(x) + '" cy="' + fixed(cy) + '" rx="' +
           fixed(14 * s) + '" ry="' + fixed(18 * s) + '"/>';
  if (kind === 'hatch')
    return '<path class="aid-life-stage" d="M' + fixed(x - 13 * s) + ' ' + fixed(cy + 4 * s) +
           ' a' + fixed(13 * s) + ' ' + fixed(14 * s) + ' 0 0 0 ' + fixed(26 * s) + ' 0 l' +
           fixed(-6.5 * s) + ' ' + fixed(-5 * s) + ' ' + fixed(-6.5 * s) + ' ' + fixed(5 * s) +
           ' ' + fixed(-6.5 * s) + ' ' + fixed(-5 * s) + ' ' + fixed(-6.5 * s) + ' ' +
           fixed(5 * s) + ' z M' + fixed(x - 8 * s) + ' ' + fixed(cy - 9 * s) + ' q' +
           fixed(8 * s) + ' ' + fixed(-11 * s) + ' ' + fixed(16 * s) + ' 0 q' + fixed(-8 * s) +
           ' ' + fixed(9 * s) + ' ' + fixed(-16 * s) + ' 0 z"/>';
  const w = 14 * s, h = 6 * s;
  return '<path class="aid-life-stage" d="M' + fixed(x - w) + ' ' + fixed(cy) + ' Q' + fixed(x) +
         ' ' + fixed(cy - h * 1.6) + ' ' + fixed(x + w) + ' ' + fixed(cy) + ' Q' + fixed(x) + ' ' +
         fixed(cy + h * 1.6) + ' ' + fixed(x - w) + ' ' + fixed(cy) + ' Z M' + fixed(x + w) + ' ' +
         fixed(cy) + ' l' + fixed(5 * s) + ' ' + fixed(-4 * s) + ' v' + fixed(8 * s) + ' Z"/>';
}
// The words beside the lines of coming into being and dying, at one height: each tries its own
// side first, then the other; where neither leaves room it is left out.
function sideWords(marks, y) {
  const lines = marks.map(m => m.x), placed = [];
  const fits = (from, to) => from >= LIFE.left && to <= LIFE.right &&
                             lines.every(x => x < from - 4 || x > to + 4) &&
                             placed.every(q => to < q.from - 6 || from > q.to + 6);
  return marks
      .map(m => {
        const width = m.word.length * 5.6;
        for (const left of (m.key === 'birth' ? [ true, false ] : [ false, true ])) {
          const from = left ? m.x - LIFE.gap - width : m.x + LIFE.gap;
          if (fits(from, from + width)) {
            placed.push({from, to : from + width});
            return text(left ? m.x - LIFE.gap : m.x + LIFE.gap, y, m.word,
                        ' class="aid-life-word" text-anchor="' + (left ? 'end' : 'start') + '"');
          }
        }
        return '';
      })
      .join('');
}
// A substance's picture without the activity is a thin strip.
function pictureBase(state, center, axis) {
  const output = lifeReceptor(center, 'output');
  return axis === MATURITY || lifeSource(state.capabilities, output) === axis ? LIFE.base
                                                                              : LIFE.plain;
}
const FOOT = 32;
function diagram(state, center, axis) {
  const wheel = state.capabilities, life = axis === MATURITY;
  const p = profileAlong(state, center, axis);
  const output = lifeReceptor(center, 'output'), outputHere = p.here('output');
  const top = LIFE.top, base = pictureBase(state, center, axis), plain = base === LIFE.plain;
  const Y = v => base - (base - top) * clamp(v);
  const height = base + FOOT;
  const attributes =
      ' data-life-cycle="' + escapeText(center.id) + '" data-life-axis="' + escapeText(axis) + '"';
  let html = '';
  if (life) {
    html += '<rect class="aid-life-field" x="' + LIFE.left + '" y="' + top + '" width="' +
            (LIFE.right - LIFE.left) + '" height="' + (base - top) +
            '"/><rect class="aid-life-egg" x="' + LIFE.left + '" y="' + top + '" width="' +
            fixed(X(HATCH) - LIFE.left) + '" height="' + (base - top) + '"/>';
    const mid = (top + base) / 2, young = (HATCH + ADULT) / 2, grown = .8;
    html += stageIcon('egg', X(HATCH / 2), mid, 1) + stageIcon('hatch', X(HATCH), mid, .6) +
            stageIcon('young', X(young), mid, 1.25) + stageIcon('adult', X(grown), mid, 2.1);
    for (const [c, key] of [[ HATCH / 2, 'egg' ], [ young, 'young' ], [ grown, 'grown' ]])
      html += text(X(c), base + 26, word(key), ' class="aid-life-word" text-anchor="middle"');
    // Nothing follows the fish's life: the picture is covered and says what steers instead.
    if (!LIFE_ACTIONS.some(key => p.here(key))) {
      const steered = LIFE_ACTIONS.some(key => steers(lifeReceptor(center, key)));
      return '<svg class="aid-life-picture" viewBox="0 0 ' + LIFE.width + ' ' + height +
             '" role="img"><rect class="aid-life-cover" x="' + LIFE.left + '" y="' + top +
             '" width="' + (LIFE.right - LIFE.left) + '" height="' + (base - top) + '" rx="6"/>' +
             text(150, mid - 4, word(steered ? 'steered1' : 'auto1'),
                  ' class="aid-life-cover-text" text-anchor="middle"') +
             text(150, mid + 18, word(steered ? 'steered2' : 'auto2'),
                  ' class="aid-life-cover-text" text-anchor="middle"') +
             '</svg>';
    }
  } else {
    const colour = axis.startsWith('mix:') ? 'var(--aid-name-text)' : substanceColor(Number(axis));
    html += '<defs><linearGradient id="aid-life-level-' + escapeText(center.id) + '-' +
            escapeText(axis.replace(':', '-')) + '"><stop offset="0" stop-color="' + colour +
            '" stop-opacity=".04"/><stop offset="1" stop-color="' + colour +
            '" stop-opacity=".5"/></linearGradient></defs><rect x="' + LIFE.left + '" y="' + top +
            '" width="' + (LIFE.right - LIFE.left) + '" height="' + (base - top) +
            '" fill="url(#aid-life-level-' + escapeText(center.id) + '-' +
            escapeText(axis.replace(':', '-')) + ')"/>' +
            text(LIFE.left, base + 26, word('little'), ' class="aid-life-word"') +
            text(LIFE.right, base + 26,
                 axis.startsWith('mix:') ? word('muchMix')
                                         : word('much', {name : sourceName(state, axis)}),
                 ' class="aid-life-word" text-anchor="end"');
  }
  const from = p.birth ?? 0, to = p.death ?? 1;
  // Before the cell comes into being and after it dies: hatched.
  if (p.birth !== null && from > 0)
    html += '<rect class="aid-life-unborn" x="' + LIFE.left + '" y="' + top + '" width="' +
            fixed(X(from) - LIFE.left) + '" height="' + (base - top) + '"/>';
  if (p.death !== null && to < 1)
    html += '<rect class="aid-life-dead" x="' + fixed(X(to)) + '" y="' + top + '" width="' +
            fixed(LIFE.right - X(to)) + '" height="' + (base - top) + '"/>';
  html += '<path class="aid-life-axis" d="M' + LIFE.left + ' ' + base + ' H' + LIFE.right + '"/>';
  if (!plain) {
    html += '<path class="aid-life-full" d="M' + LIFE.left + ' ' + top + ' H' + LIFE.right + '"/>' +
            text(LIFE.left, top - 16, word('full'), ' class="aid-life-word"');
    const level = i => life || outputHere ? p.activity[i] : 1;
    let line = 'M' + fixed(X(from)) + ' ' + base;
    for (let i = 0; i <= SAMPLES; ++i) {
      const v = i / SAMPLES;
      if (v >= from && v <= to)
        line += ' L' + fixed(X(v)) + ' ' + fixed(Y(level(i)));
    }
    const elsewhere = life && !outputHere && steers(output);
    html += '<path class="aid-life-activity' + (elsewhere ? ' elsewhere' : '') + '" d="' + line +
            ' L' + fixed(X(to)) + ' ' + base + ' Z"/>';
    if (elsewhere)
      html +=
          text((X(from) + X(to)) / 2, top + 14,
               word('activityThrough', {name : sourceName(state, lifeSource(wheel, output), true)}),
               ' class="aid-life-word strong" text-anchor="middle"');
  }
  // The two ends, each one grip: along for when, up and down for how active.
  const marks = [];
  const end = (key, at, outputKey) => {
    const timed = p.here(key), levelled = outputHere;
    if (!timed && !levelled)
      return '';
    const index = Math.round(clamp(at) * SAMPLES);
    const cx = X(at), cy = plain ? (top + base) / 2 : Y(levelled ? p.activity[index] : 1);
    if (timed)
      marks.push({key, x : cx, word : word(key === 'birth' ? 'becomes' : 'dies')});
    return (timed ? '<path class="aid-life-when ' + key + '" d="M' + fixed(cx) + ' ' + top + ' V' +
                        base + '"/>'
                  : '') +
           '<g class="aid-graphic-handle aid-life-grip ' + key + '" data-life-grip="' + outputKey +
           '"><circle cx="' + fixed(cx) + '" cy="' + fixed(cy) + '" r="' + LIFE.grip + '"/>' +
           (timed && key === 'death'
                ? '<path d="M' + fixed(cx - 3.5) + ' ' + fixed(cy - 3.5) + ' l7 7 m0 -7 l-7 7"/>'
            : timed ? '<path d="M' + fixed(cx) + ' ' + fixed(cy - 4) + ' l-4 7 h8 z"/>'
                    : '') +
           '</g>';
  };
  html += end('birth', from, 'start') + end('death', to, 'end');
  html += sideWords(marks, plain ? (top + base) / 2 + 4 : base - 6);
  // Where the activity turns: a dashed line, across for the point, up and down for the steepness.
  if (outputHere && Math.abs(p.activity[0] - p.activity[SAMPLES]) > .04) {
    const reach = axisReach(state, output, axis);
    const at = clamp(output.half / reach, from + .02, to - .02), x = X(at);
    html += '<path class="aid-life-turn" d="M' + fixed(x) + ' ' + (top - 12) + ' V' + (base + 12) +
            '"/><rect class="aid-life-turn-grip" data-life-grip="turn" x="' + fixed(x - 8) +
            '" y="' + (top - 12) + '" width="16" height="' + (base - top + 24) + '"/>';
  }
  return '<svg class="aid-life-picture" viewBox="0 0 ' + LIFE.width + ' ' + height + '"' +
         attributes + ' role="group" aria-label="' + escapeText(word('phases')) + '">' + html +
         '</svg>';
}

// The headings of the substance pictures name the actions that follow that substance.
function sourceTitle(state, center, source) {
  const mine = LIFE_ACTIONS.filter(
      key => lifeSource(state.capabilities, lifeReceptor(center, key)) === source);
  const name = sourceName(state, source, true);
  const what = mine.length === 3 ? word('lifeCycle')
                                 : mine.map(key => word(key)).join(' ' + word('and') + ' ');
  return word('through', {what, name});
}
export function lifeCycle(state, center) {
  if (!center || !state.capabilities)
    return '';
  const sources = [
    ...new Set(LIFE_ACTIONS.map(key => lifeSource(state.capabilities, lifeReceptor(center, key))))
  ].filter(source => source !== 'auto' && source !== MATURITY);
  const parts = sources.map(source => {
    const mixed = source.startsWith('mix:');
    const receptor = LIFE_ACTIONS.map(key => lifeReceptor(center, key))
                         .find(r => lifeSource(state.capabilities, r) === source);
    const index = Number(mixed ? source.slice(4) : source);
    return '<h4 class="aid-life-head">' + substanceDot(state, index, mixed) +
           escapeText(sourceTitle(state, center, source)) + '</h4>' +
           diagram(state, center, source) +
           (mixed ? '<p class="aid-life-profile">' + escapeText(word('profile')) + '</p>' +
                        '<div class="aid-life-wheel">' +
                        substanceWheel(state, {...wheelProfile(state, receptor), active : 1}, {
                          widthTarget : center.id + ':' + lifeTarget(center, receptor),
                          selected : receptor.substance,
                          reads : state.capabilities.regulators,
                          legend : false
                        }) +
                        '</div>'
                  : '');
  });
  return '<section class="aid-life-cycle">' +
         '<h4 class="aid-life-head">' + escapeText(word('triggers')) + '</h4>' +
         triggers(state, center) + '<h4 class="aid-life-head">' + escapeText(word('phases')) +
         '</h4>' + diagram(state, center, MATURITY) + parts.join('') + '</section>';
}
function wheelProfile(state, receptor) {
  const [x, y] = wheelPlace(state.capabilities, receptor.substance);
  return {x, y, width : receptor.width};
}
// The target the width handle of a mix changes: the cell's birth, or one of its receptors.
const lifeTarget = (center, receptor) =>
    receptor === center.growth ? 'birth' : String(center.receptors.indexOf(receptor));

// ---- Changes from the choices and the grips. ----
// A ticked action starts from a shape that shows in the picture: it comes into being early, it
// works fully and then less, it dies late; all following the maturity.
export function lifeShape(key, capabilities, substance = BLOOD_SUBSTANCE.maturity) {
  const steep = capabilities?.steepnessSpan ?? 3;
  // A cell dies or quietens when the reserve runs low, not when it is full.
  if (substance === BLOOD_SUBSTANCE.reserve && key === 'death')
    return {
      active : 1,
      substance,
      width : 0,
      baseline : 1,
      sensitivity : -1,
      half : .2,
      steepness : steep
    };
  if (substance === BLOOD_SUBSTANCE.reserve && key === 'output')
    return {
      active : 1,
      substance,
      width : 0,
      baseline : -1,
      sensitivity : 2,
      half : .3,
      steepness : 2
    };
  if (key === 'birth')
    return {
      active : 1,
      substance,
      width : 0,
      baseline : 0,
      sensitivity : 1,
      half : .15,
      steepness : steep
    };
  if (key === 'death')
    return {
      active : 1,
      substance,
      width : 0,
      baseline : 0,
      sensitivity : 1,
      half : .9,
      steepness : steep
    };
  return {
    active : 1,
    substance,
    width : 0,
    baseline : 1,
    sensitivity : -1.4,
    half : .7,
    steepness : 2
  };
}
// An action left to itself: birth and death answer nothing, activity is full.
export function lifeOff(key) {
  return key === 'output' ? {...neutralReceptor(HORMONE_EFFECT.output)}
                          : {active : 0, sensitivity : 0};
}
// One action's receptor changed: the cell's growth for its coming into being, else its receptor.
export const setLifeAction = (doc, id, key, patch) =>
    key === 'birth' ? updateCellGrowth(doc, id, patch)
                    : updateReceptor(doc, id, EFFECT[key], patch);
// The width a mix starts with: wide enough that the neighbours on the wheel are heard.
export const MIX_WIDTH = .45;
// A grip moved to the share (fx, fy) of the picture: the changes to birth, death and activity.
export function lifeGripPatch(state, center, axis, grip, fx, fy, start) {
  const height = pictureBase(state, center, axis);
  const px = fx * LIFE.width, py = fy * (height + FOOT);
  const along = clamp((px - LIFE.left) / (LIFE.right - LIFE.left));
  const up = clamp((height - py) / (height - LIFE.top));
  const wheel = state.capabilities, [ halfMin, halfMax ] = wheel?.halfRange ?? [ .0003, 1 ];
  const halfAt = (receptor, v) => clamp(v * axisReach(state, receptor, axis), halfMin, halfMax);
  const here = key => lifeSource(wheel, lifeReceptor(center, key)) === axis;
  const output = lifeReceptor(center, 'output'), changes = {};
  const birth = here('birth') ? profileAlong(state, center, axis).birth : null;
  const death = here('death') ? profileAlong(state, center, axis).death : null;
  if (grip === 'start') {
    if (here('birth'))
      changes.birth = {half : halfAt(center.growth, Math.min(along, (death ?? 1) - .04))};
    if (here('output')) {
      const after = output.baseline + output.sensitivity, baseline = 2 * up - 1;
      changes.output = {baseline, sensitivity : after - baseline};
    }
  } else if (grip === 'end') {
    if (here('death'))
      changes.death = {
        half : halfAt(lifeReceptor(center, 'death'), Math.max(along, (birth ?? 0) + .04))
      };
    if (here('output'))
      changes.output = {sensitivity : 2 * up - 1 - output.baseline};
  } else if (grip === 'turn' && here('output')) {
    const steep =
        (start?.steepness ?? output.steepness) + ((start?.py ?? py) - py) / LIFE.steepPixels;
    changes.output = {
      half : halfAt(output, clamp(along, (birth ?? 0) + .02, (death ?? 1) - .02)),
      steepness : clamp(steep, 0, wheel?.steepnessSpan ?? 3)
    };
  }
  return changes;
}
// What a drag of the turn starts from: the steepness, and the height the pointer was at.
export const lifeGripStart = (state, center, axis, fy) => ({
  steepness : lifeReceptor(center, 'output').steepness,
  py : fy * (pictureBase(state, center, axis) + FOOT)
});
