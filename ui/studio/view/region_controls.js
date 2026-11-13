import {TIME_CONSTANT} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {clamp} from '../../units.js';
import {
  learningTimeOf,
  learningTimeSteps,
  LONGEST_LEARNING_TIME,
  LONGEST_TIME_CONSTANT,
  timeConstantOf,
  timeConstantSteps
} from '../../tuning.js';
import {formatNumber, joinParts, t} from '../../strings.js';
import {RHYTHM_TAU} from '../model/region_cells.js';
import {regionPlan, regionSlots} from '../model/regions.js';
import {findOrgan} from '../model/document.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {label} from './kit.js';
import {organTitle} from './names.js';
import {tectumPictures} from './tectum_map.js';

export const REGION_PICTURE = Object.freeze({width : 360, height : 260, left : 40, right : 320});
const P = REGION_PICTURE, WIDTH = P.right - P.left, SEARCH_BASE = 194, SEARCH_HEIGHT = 100;
const SCENT_BASE = 202, SCENT_HEIGHT = 114, VALUE_BASE = 218, VALUE_HEIGHT = 94;
const SPINE_BASE = 76, SPINE_HEIGHT = 55, FIN_BASE = 218;
const CLOCK_SPAN = 2 * LONGEST_TIME_CONSTANT, CLOCK_CREST = 1.25;
const OPPONENT = Object.freeze({left : 120, width : 100, y : 127});
const TAU_SPAN = 4;
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const x = fraction => P.left + WIDTH * fraction;
const point = (x, y, height = P.height) => ({fx : x / P.width, fy : y / height});
const words = (key, vars) => t('studio.regions.graphics.' + key, vars);
const steps = n => t('studio.regions.graphics.steps', {n : Math.round(n)});
const cycleSteps = n => t('studio.regions.graphics.clockPeriod', {n : Math.round(n)});
const path = (d, cls = '') => `<path class="region-line ${cls}" d="${d}"/>`;
const curve = (sample, start = P.left, end = P.right, count = 160, cls = '') => path(
    Array
        .from({length : count + 1},
              (_, i) => {
                const p = sample(i / count);
                return `${i ? 'L' : 'M'}${fixed(start + (end - start) * i / count)} ${fixed(p)}`;
              })
        .join(' '),
    cls);
const text = (x, y, value, anchor = 'start') =>
    `<text x="${fixed(x)}" y="${fixed(y)}" text-anchor="${anchor}">${escapeText(value)}</text>`;
const axis = (left, right, y) => path(`M${left} ${y}H${right}`, 'axis');
const adaptationSpan = state => state.capabilities?.neural?.adaptationSpan ?? 10;
const timing = (state, tau) => steps(timeConstantSteps(tau) * adaptationSpan(state));
const timedAxis = (state, y, span = 1, left = P.left, right = P.right) =>
    axis(left, right, y) + text(left, y + 18, '0') +
    text(right, y + 18, steps(span * LONGEST_TIME_CONSTANT * adaptationSpan(state)), 'end');
const colourText = (cls, x, y, value, anchor = 'start') =>
    `<g class="region-caption ${cls}">${text(x, y, value, anchor)}</g>`;
const scentValue = smoothing => Math.tanh(smoothing > 0 ? 1 - Math.exp(-1) : 1);

export function regionHandle(organ, key, state = null) {
  const r = organ.region;
  if (key === 'spine')
    return point(x(CLOCK_CREST * period(r.cycle) / CLOCK_SPAN),
                 SPINE_BASE - SPINE_HEIGHT * Math.tanh(.5));
  if (key === 'finCycle')
    return point(x(CLOCK_CREST * period(r.finCycle) / CLOCK_SPAN),
                 FIN_BASE - SPINE_HEIGHT * Math.tanh(.5));
  if (key === 'alternation')
    return point(OPPONENT.left + OPPONENT.width * r.alternation, OPPONENT.y);
  if (key === 'search')
    return point(x(timeConstantSteps(r.searchTime) / LONGEST_TIME_CONSTANT),
                 SEARCH_BASE - SEARCH_HEIGHT * r.searchDrive);
  if (key === 'scent')
    return point(x(r.smoothing > 0
                       ? timeConstantSteps(r.smoothing) / (TAU_SPAN * LONGEST_TIME_CONSTANT)
                       : 0),
                 SCENT_BASE - SCENT_HEIGHT * r.contrast * scentValue(r.smoothing));
  if (key === 'association')
    return point(x(learningTimeSteps(r.association) / LONGEST_LEARNING_TIME),
                 VALUE_BASE - VALUE_HEIGHT * r.teaching / Math.E);
  if (key === 'maturity')
    return point(x(r.maturity), 65);
  if (key === 'reserve')
    return point(40 + 120 * r.reserve, 222);
  if (key === 'rest')
    return point(210 + 110 * timeConstantSteps(r.rest) / LONGEST_TIME_CONSTANT, 222 - 64 / Math.E);
  if (key === 'beat' || key === 'pump') {
    return motorPoint(organ, key, motorLayout(state, organ));
  }
  return null;
}

export function regionPatch(organ, key, fx, fy) {
  const px = fx * P.width, py = fy * P.height, f = clamp((px - P.left) / WIDTH);
  if (key === 'spine')
    return {
      cycle : timeConstantOf(Math.max(TIME_CONSTANT.pace_min_steps, f * CLOCK_SPAN / CLOCK_CREST))
    };
  if (key === 'finCycle')
    return {
      finCycle :
          timeConstantOf(Math.max(TIME_CONSTANT.pace_min_steps, f * CLOCK_SPAN / CLOCK_CREST))
    };
  if (key === 'alternation')
    return {alternation : clamp((px - OPPONENT.left) / OPPONENT.width)};
  if (key === 'search')
    return {
      searchTime : timeConstantOf(Math.max(TIME_CONSTANT.min_steps, f * LONGEST_TIME_CONSTANT)),
      searchDrive : clamp((SEARCH_BASE - py) / SEARCH_HEIGHT)
    };
  if (key === 'scent') {
    const smoothing = f * TAU_SPAN * LONGEST_TIME_CONSTANT < TIME_CONSTANT.min_steps
                          ? 0
                          : Math.max(.01, timeConstantOf(f * TAU_SPAN * LONGEST_TIME_CONSTANT));
    return {
      smoothing,
      contrast : clamp((SCENT_BASE - py) / (SCENT_HEIGHT * scentValue(smoothing)))
    };
  }
  if (key === 'association')
    return {
      association :
          learningTimeOf(Math.max(TIME_CONSTANT.learning_min_steps, f * LONGEST_LEARNING_TIME)),
      teaching : clamp((VALUE_BASE - py) * Math.E / VALUE_HEIGHT)
    };
  if (key === 'maturity')
    return {maturity : Math.max(.01, f)};
  if (key === 'reserve')
    return {reserve : clamp((px - 40) / 120)};
  if (key === 'rest')
    return {
      rest : timeConstantOf(
          Math.max(TIME_CONSTANT.min_steps, (px - 210) / 110 * LONGEST_TIME_CONSTANT))
    };
  if (key === 'beat' || key === 'pump') {
    const candidates =
        [ 0, ...RHYTHM_TAU.map(tau => 1.25 * period(tau) / (2 * LONGEST_TIME_CONSTANT)) ];
    const level = candidates.reduce(
        (best, p, i) => Math.abs(p - f) < Math.abs(candidates[best] - f) ? i : best, 0);
    return {[key] : level};
  }
  return null;
}
function handleAt(key, title, p, height = P.height) {
  return `<g class="region-handle" data-region-handle="${
      key}" tabindex="0" role="button" aria-label="${escapeText(title)}" transform="translate(${
      fixed(p.fx * P.width)} ${fixed(p.fy * height)})"><title>${
      escapeText(
          title)}</title><circle class="hit" r="15"/><circle r="8"/><path d="M-3 0h6M0-3v6"/></g>`;
}
const handle = (organ, key, title) => handleAt(key, title, regionHandle(organ, key));
function button(organ, key, value, x, y, graphic, title, selected = organ.region[key] === value) {
  return `<g class="region-button${selected ? ' selected' : ''}" data-region-setting="${
      key}" data-region-value="${value}" data-organ-id="${
      escapeText(organ.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${
      escapeText(title)}" transform="translate(${x} ${y})"><title>${
      escapeText(
          title)}</title><rect x="-17" y="-17" width="34" height="34" rx="9"/>${graphic}</g>`;
}
function searchPicture(state, organ) {
  const r = organ.region, duration = LONGEST_TIME_CONSTANT;
  const memory = f => Math.exp(-f * duration / timeConstantSteps(r.searchTime));
  const drive = SEARCH_BASE - SEARCH_HEIGHT * r.searchDrive;
  return text(P.left, 20, words('searchAfter')) +
         colourText('other', P.left, 49, words('cueTrace')) +
         colourText('', P.right, 49,
                    words('searchLevel', {n : formatNumber(100 * r.searchDrive, 0)}), 'end') +
         timedAxis(state, SEARCH_BASE) + path(`M${P.left} ${drive}H${P.right}`, 'level') +
         curve(f => SEARCH_BASE - SEARCH_HEIGHT * memory(f), undefined, undefined, 160, 'other') +
         text(P.left, 242, words('memoryTime', {time : timing(state, r.searchTime)})) +
         handle(organ, 'search', joinParts([
                  words('search'), words('searchMemory'), words('searchStrength'),
                  timing(state, r.searchTime), words('searchDrag')
                ]));
}
function scentPicture(state, organ) {
  const r = organ.region, duration = TAU_SPAN * LONGEST_TIME_CONSTANT;
  const response = f =>
      Math.tanh(r.smoothing > 0 ? 1 - Math.exp(-f * duration / timeConstantSteps(r.smoothing)) : 1);
  return text(P.left, 20, words('scent')) + text(P.left, 40, words('sameScent')) +
         colourText('', P.left, 65, words('ownNose')) +
         colourText('other', P.right, 65, words('oppositeNose'), 'end') +
         timedAxis(state, SCENT_BASE, TAU_SPAN) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * response(f)) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * r.contrast * response(f), undefined, undefined, 160,
               'other') +
         text(P.left, 244,
              words('smoothingTime',
                    {time : r.smoothing > 0 ? timing(state, r.smoothing) : words('direct')})) +
         handle(organ, 'scent', joinParts([
                  words('scent'), r.smoothing > 0 ? timing(state, r.smoothing) : words('direct'),
                  words('scentDrag')
                ]));
}
function statePicture(state, organ) {
  const r = organ.region, scale = state.capabilities?.biasScale ?? .3;
  const hill = f => f ** 8 / (f ** 8 + r.maturity ** 8);
  return text(P.left, 18, words('maturityOutput')) + axis(P.left, P.right, 100) +
         text(P.left, 118, '0 %') + text(P.right, 118, '100 %', 'end') +
         curve(f => 100 - 70 * hill(f)) +
         handle(organ, 'maturity', joinParts([ words('maturity'), words('maturityDrag') ])) +
         colourText('other', 40, 147, words('reserveInput')) + axis(40, 160, 222) +
         text(40, 240, '0') + text(160, 240, '1', 'end') +
         curve(f => 222 - 180 * Math.max(0, Math.tanh(scale * (r.reserve - f))), 40, 160, 80,
               'other') +
         handle(organ, 'reserve', joinParts([ words('reserve'), words('reserveDrag') ])) +
         colourText('memory', 210, 147, words('foodTrace')) + timedAxis(state, 222, 1, 210, 320) +
         curve(f => 222 - 64 * Math.exp(-f * LONGEST_TIME_CONSTANT / timeConstantSteps(r.rest)),
               210, 320, 80, 'memory') +
         handle(organ, 'rest',
                joinParts([ words('rest'), timing(state, r.rest), words('restDrag') ]));
}
function valuePicture(organ) {
  const r = organ.region;
  const branches = Array
                       .from({length : 4},
                             (_, i) => {
                               const px = 65 + 76 * i;
                               return button(organ, 'features', i + 1, px, 35,
                                             text(0, 4, formatNumber(i + 1), 'middle'),
                                             t('studio.regions.graphics.features', {n : i + 1}),
                                             i < r.features) +
                                      (i < r.features ? path(`M${px} 54V66L180 86`, 'axis') : '');
                             })
                       .join('');
  return text(P.left, 14, label('regions.settings.features')) + branches +
         text(P.left, 89,
              words('associationTime', {time : steps(learningTimeSteps(r.association))})) +
         colourText('memory', P.left, 110, words('associationTrace')) +
         axis(P.left, P.right, VALUE_BASE) + text(P.left, 236, '0') +
         text(P.right, 236, steps(LONGEST_LEARNING_TIME), 'end') +
         text(P.left, 255, words('teachingLevel', {n : formatNumber(100 * r.teaching, 0)})) +
         curve(f => VALUE_BASE -
                    VALUE_HEIGHT * r.teaching *
                        Math.exp(-f * LONGEST_LEARNING_TIME / learningTimeSteps(r.association)),
               undefined, undefined, 160, 'memory') +
         handle(organ, 'association',
                joinParts([ steps(learningTimeSteps(r.association)), words('associationDrag') ]));
}
const MOTOR = Object.freeze({top : 66, amplitude : 24, line : 14, targetGap : 6, inset : 8});
function motorPoint(organ, key, layout) {
  const level = organ.region[key];
  return point(x(level ? CLOCK_CREST * period(RHYTHM_TAU[level - 1]) / CLOCK_SPAN : 0),
               layout.sections.find(s => s.key === key).base -
                   (level ? MOTOR.amplitude * Math.tanh(.65) : 0),
               layout.height);
}
function motorNameLines(name, width) {
  const limit = Math.max(8, Math.floor(width / 6.5)), lines = [];
  let line = '';
  for (const word of name.split(/\s+/)) {
    const plain = word.replaceAll('\u00ad', '');
    if (line && line.length + plain.length + 1 <= limit) {
      line += ' ' + plain;
      continue;
    }
    if (line)
      lines.push(line);
    line = '';
    for (const part of word.split('\u00ad')) {
      if (line && line.length + part.length > limit) {
        lines.push(line + '-');
        line = '';
      }
      line += part;
    }
  }
  if (line)
    lines.push(line);
  return lines;
}
function motorTarget(state, slot, left, width) {
  const seen = new Set(), targets = [];
  for (const organ of slot?.filled ?? []) {
    const name = organTitle(organ, state.sites);
    if (seen.has(name))
      continue;
    seen.add(name);
    targets.push({type : organ.type, lines : motorNameLines(name, width - 2 * MOTOR.inset - 22)});
  }
  return {
    left,
    width,
    targets,
    height :
        targets.length
            ? targets.reduce((sum, target) => sum + Math.max(18, target.lines.length * MOTOR.line) +
                                              MOTOR.targetGap,
                             0)
            : MOTOR.line + MOTOR.targetGap
  };
}
function motorTargetPicture(target, top) {
  const left = target.left + MOTOR.inset;
  if (!target.targets.length)
    return '<g class="motor-target free">' + text(left, top + 12, words('motorFree')) + '</g>';
  let y = top;
  return target.targets
      .map(item => {
        const picture =
            '<g class="motor-target" data-motor-target-type="' + item.type + '">' +
            placedGlyph(STUDIO_ICON[item.type] ?? STUDIO_ICON.brain, 18, {x : left + 9, y : y + 8},
                        {line : true}) +
            item.lines.map((line, i) => text(left + 24, y + 12 + i * MOTOR.line, line)).join('') +
            '</g>';
        y += Math.max(18, item.lines.length * MOTOR.line) + MOTOR.targetGap;
        return picture;
      })
      .join('');
}
function motorLayout(state, organ) {
  const slots = state ? regionSlots(state.document, organ) : [];
  const nodes = state ? regionPlan(state.document, organ).nodes : organ.centers ?? [];
  const ports = [
    [ 'beat', [ [ 'tail', 'motorSwim' ] ] ],
    [
      'pump',
      [
        [ 'mouth', 'motorOpen' ], [ 'bite', 'motorClose' ],
        ...(nodes.some(n => n.node === 'gills') ? [ [ 'gills', 'motorGills' ] ] : [])
      ]
    ]
  ];
  let top = MOTOR.top;
  const sections = ports.map(([ key, outgoing ]) => {
    const width = WIDTH / outgoing.length;
    const targets =
        outgoing.map(([ port, name ], i) => ({
                       ...motorTarget(state, slots.find(s => s.dir === 'out' && s.key === port),
                                      P.left + i * width, width),
                       port,
                       name
                     }));
    const section = {key, top, base : top + 40, targets};
    top = section.base + 67 + Math.max(...targets.map(target => target.height)) + 24;
    return section;
  });
  return {sections, height : top - 8};
}
function motorCommands(state, organ, layout) {
  const r = organ.region;
  const tones = [ 0, 1, 2 ]
                    .map((v, i) => button(
                             organ, 'tone', v, 245 + i * 36, 26,
                             v ? Array
                                     .from({length : v}, (_, j) => `<path d="M-7 ${5 - 6 * j}L0 ${
                                                             - 2 - 6 * j}L7 ${5 - 6 * j}"/>`)
                                     .join('')
                               : '<circle r="5"/>',
                             words('tone', {n : v})))
                    .join('');
  return text(P.left, 31, label('regions.settings.tone')) + tones +
         layout.sections
             .map(section => {
               const {key, top, base, targets} = section, level = r[key];
               const cycle = level ? period(RHYTHM_TAU[level - 1]) : 0;
               const title = words(key === 'beat' ? 'motorPush' : 'motorMouth');
               const xs = targets.map(target => target.left + target.width / 2);
               const branches =
                   '<g class="motor-command-branches' + (level ? '' : ' quiet') + '">' +
                   path(`M180 ${base + 24}V${base + 30}M${xs[0]} ${base + 30}H${xs.at(-1)}`) +
                   targets
                       .map((target, i) => '<g class="motor-connection' +
                                           (target.targets.length ? '' : ' free') + '">' +
                                           path(`M${xs[i]} ${base + 30}V${base + 40}`) +
                                           `<circle cx="${xs[i]}" cy="${base + 43}" r="3"/>` +
                                           '</g>' +
                                           text(xs[i], base + 58, words(target.name), 'middle') +
                                           motorTargetPicture(target, base + 67))
                       .join('') +
                   '</g>';
               return `<g data-motor-command="${key}">` + text(P.left, top, title) +
                      text(P.right, top, cycle ? cycleSteps(cycle) : words('off'), 'end') +
                      axis(P.left, P.right, base) + text(P.left, base + 18, '0') +
                      text(P.right, base + 18, steps(CLOCK_SPAN), 'end') +
                      curve(f => base -
                                 (cycle ? MOTOR.amplitude *
                                              Math.tanh(.15 + .5 * Math.sin(2 * Math.PI *
                                                                            CLOCK_SPAN * f / cycle))
                                        : 0),
                            undefined, undefined, 240, key === 'pump' ? 'other' : '') +
                      branches +
                      handleAt(key, joinParts([ title, cycle ? cycleSteps(cycle) : words('off') ]),
                               motorPoint(organ, key, layout), layout.height) +
                      '</g>';
             })
             .join('');
}
function motorPaths(state, organ) {
  const plan = regionPlan(state.document, organ), twin = findOrgan(state.document, organ.pair);
  const side = side => [organ, twin].find(o => o && o.side === side);
  const organs = twin ? [ side(-1), side(1) ] : [ organ ];
  const width = WIDTH / organs.length;
  const fins = organs.map(
      (o, i) => motorTarget(
          state, regionSlots(state.document, o).find(s => s.dir === 'out' && s.key === 'fins'),
          P.left + i * width, width));
  const xs = fins.map(target => target.left + target.width / 2),
        cut = new Set(organ.region.cut ?? []);
  let html = text(180, 20, twin ? label('regions.settings.compete') : words('motorTurn'), 'middle');
  html += xs.map((px, i) => {
              const left = organs[i].side < 0;
              return text(px, 44, words(left ? 'motorLeftCue' : 'motorRightCue'), 'middle') +
                     path(`M${px} 54V116m-5-6l5 6 5-6`) +
                     text(px, 139, words(left ? 'motorTurnLeft' : 'motorTurnRight'), 'middle') +
                     motorTargetPicture(fins[i], 150);
            }).join('');
  if (twin) {
    const competes = plan.cross.some(([ from, to ]) => from === 'oppose' && to === 'turn') &&
                     !cut.has('oppose>>turn');
    if (competes)
      html += '<g data-motor-path="compete">' +
              path(`M${xs[0]} 58C${xs[0]} 84 ${xs[1]} 84 ${xs[1]} 106m-7 0h14M${xs[1]} 58C${
                       xs[1]} 84 ${xs[0]} 84 ${xs[0]} 106m-7 0h14`,
                   'memory') +
              '</g>';
    html +=
        button(organ, 'compete', 1 - organ.region.compete, 180, 84,
               `<path d="${organ.region.compete ? 'M-10-8L10 8M10-8L-10 8' : 'M-10-8V8M10-8V8'}"/>`,
               label('regions.settings.compete'), !!organ.region.compete);
  }
  const top = 150 + Math.max(...fins.map(target => target.height)) + 24;
  html += text(P.left, top, label('regions.settings.retreat')) +
          button(organ, 'retreat', 1 - organ.region.retreat, 60, top + 47,
                 '<path d="M0-10V10M-7 3L0 10L7 3"/>', label('regions.settings.retreat'),
                 !!organ.region.retreat);
  const reverse =
      regionSlots(state.document, organ).find(s => s.dir === 'out' && s.key === 'reverse');
  if (!reverse)
    return {html : html + text(96, top + 52, words('off')), height : top + 82};
  const target = motorTarget(state, reverse, P.left, WIDTH);
  const inner = (from, to) =>
      plan.inner.some(([ a, b ]) => a === from && b === to) && !cut.has(from + '>' + to);
  html += text(290, top + 68, words('motorReverse'), 'middle');
  if (inner('retreat', 'reverse'))
    html += '<g data-motor-path="reverse">' + path(`M80 ${top + 47}H292m-6-5l6 5-6 5`) + '</g>';
  if (inner('retreat', 'brake') && inner('brake', 'swim'))
    html += '<g data-motor-path="brake">' +
            path(`M112 ${top + 47}V${top + 18}H172m0-7v14`, 'memory') +
            text(183, top + 23, words('motorPushWord')) + '</g>';
  if (inner('retreat', 'backStop') && inner('backStop', 'turn'))
    html += '<g data-motor-path="backStop">' +
            path(`M112 ${top + 47}V${top + 86}H172m0-7v14`, 'memory') +
            text(183, top + 91, words('motorRow')) + '</g>';
  html += motorTargetPicture(target, top + 108);
  return {html, height : top + 108 + target.height + 16};
}
function motorPictures(state, organ) {
  const layout = motorLayout(state, organ), paths = motorPaths(state, organ);
  const svg = (height, content, kind) =>
      `<svg class="aid-motor-picture" data-motor-picture="${kind}" viewBox="0 0 ${P.width} ${
          height}" data-region-picture="${escapeText(organ.id)}" role="group" aria-label="${
          label('regions.motor.term')}">${content}</svg>`;
  return svg(layout.height, motorCommands(state, organ, layout), 'commands') +
         svg(paths.height, paths.html, 'paths');
}
function spinePicture(organ) {
  const r = organ.region;
  const waves = (y, tau, name) =>
      axis(P.left, P.right, y) + '<g data-clock="' + name + '">' +
      [ 0, Math.PI ]
          .map((phase, i) =>
                   curve(f => y - SPINE_HEIGHT *
                                      Math.max(0, Math.tanh(.5 * Math.sin(2 * Math.PI * CLOCK_SPAN *
                                                                              f / period(tau) +
                                                                          phase))),
                         undefined, undefined, 240, i ? 'other' : ''))
          .join('') +
      '</g>';
  const stop = OPPONENT.left + OPPONENT.width * r.alternation;
  return text(P.left, 17, words('tailClock')) + waves(SPINE_BASE, r.cycle, 'tail') +
         text(P.left, 98, cycleSteps(period(r.cycle))) +
         handle(organ, 'spine', joinParts([ words('spine'), words('spineDrag') ])) +
         '<g class="region-opponent" stroke-width="' + fixed(1 + 6 * r.alternation) +
         '"><path d="M75 127H' + fixed(stop) + 'm0-8v16"/></g>' +
         text(P.left, 150, words('oppositeInhibition')) +
         handle(organ, 'alternation', words('oppositeInhibition')) +
         text(P.left, 173, words('finClock')) + waves(FIN_BASE, r.finCycle, 'fin') +
         text(P.left, 242, cycleSteps(period(r.finCycle))) +
         text(P.right, 242, steps(CLOCK_SPAN), 'end') +
         handle(organ, 'finCycle', joinParts([
                  words('finCycle'),
                  label('regions.slots.row') + ' / ' + label('regions.slots.recover'),
                  cycleSteps(period(r.finCycle)), words('finCycleDrag')
                ]));
}
const PICTURES = {
  choice : searchPicture,
  olfaction : scentPicture,
  state : statePicture,
  value : (s, o) => valuePicture(o),
  spine : (s, o) => spinePicture(o)
};
export function regionPicture(state, organ) {
  const draw = PICTURES[organ.type];
  if (!draw && !['tectum', 'motor'].includes(organ.type))
    return '';
  const customized =
      !!organ.region.cut?.length || regionPlan(state.document, organ).nodes.some(n => {
        const c = organ.centers.find(c => c.node === n.node);
        return c && (Object.entries(n.set ?? {}).some(([ k, v ]) => c[k] !== v) ||
                     Object.entries(n.effects ?? {})
                         .some(([ e, values ]) => Object.entries(values).some(
                                   ([ k, v ]) => c.receptors[e][k] !== v)));
      });
  const reference =
      [ 'choice', 'state' ].includes(organ.type) ? '' : words(organ.type + 'Reference');
  const drawing =
      organ.type === 'tectum' ? tectumPictures(state, organ)
      : organ.type === 'motor'
          ? motorPictures(state, organ)
          : `<svg viewBox="0 0 ${P.width} ${P.height}" data-region-picture="${
                escapeText(organ.id)}" role="group" aria-label="${
                label('regions.' + organ.type + '.term')}"><title>${
                escapeText(reference + (customized ? ' ' + words('customized')
                                                   : ''))}</title>${draw(state, organ)}</svg>`;
  const explanation = organ.type !== 'tectum' && reference
                          ? '<p class="aid-picture-note">' + escapeText(reference) + '</p>'
                          : '';
  return `<div class="aid-region-picture">${drawing}${explanation}${
      customized ? '<p class="aid-picture-note">' + escapeText(words('customized')) + '</p>'
                 : ''}</div>`;
}
