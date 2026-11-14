import {ATELIER_LIMITS, PRESSURE_SOURCE} from '../../../schema.js';
import {percent, t} from '../../../strings.js';
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../../tuning.js';
import {
  addOrganType,
  findOrgan,
  groupReport,
  lifePhase,
  organTypes,
  removeOrganType,
  setLifePhase,
  updateCellDistribution,
  updateCenter
} from '../../model/document.js';
import {nodeLimit, ORGAN_BY_KEY} from '../../model/organs.js';
import {label} from '../kit.js';
import {boundedAnswer} from '../sense_curves.js';
import {chip, clamp, drag, el, fishIcon, heldGrip, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.bladder.' + key, values);
const MAX_COPIES = ATELIER_LIMITS.max_copies, STEPS = 900, ROUND_MS = 12000, PLOT_STRIDE = 5;
// The hatch marker and transit through the drawn water column are schematic. Lift, filling and
// the depth response use the same relationships as the aquarium.
const HATCH = .5, FALL_STEPS = 150, STILL = .08;
const WATER = {
  left : 46,
  right : 290,
  top : 17,
  base : 169,
  sand : 9,
  fishX : 176,
  height : 196
};
const FILL = {
  left : 64,
  right : 290,
  commandTop : 20,
  commandBase : 44,
  top : 62,
  base : 128,
  height : 153
};
const DEPTH = {
  left : 42,
  right : 290,
  top : 88,
  base : 185,
  height : 209
};
const LIFE = {
  left : 44,
  right : 260,
  top : 18,
  base : 92,
  icons : 113,
  height : 128,
  indent : 15,
  gap : 13,
  whole : .015,
  least : .08
};
const FISH =
    'M-36 0 Q-18 -17 8 -13 Q24 -10 34 0 L46 -11 Q43 0 46 11 L34 0 Q24 10 8 13 Q-18 17 -36 0 Z';
const LEVEL_SPAN = activationLevel(1) - activationLevel(0);
const limits = ORGAN_BY_KEY.bladder.types;
const groupClass = (index, chosen) => `k${index}${chosen ? ' on' : ''}`;
const timeX = ({left, right}) => step => left + (right - left) * step / STEPS;
const levelY = ({top, base}) => level => base - (base - top) * clamp(level);
const depthY = depth => WATER.top + 14 + (WATER.base - WATER.sand - 28 - WATER.top) * clamp(depth);
const depthAtY = y => clamp((y - depthY(0)) / (depthY(1) - depthY(0)));
const SAC = {
  atRest : 5,
  growth : 13,
  scale : ORGAN_BY_KEY.bladder.nodes - 1
};
const sacLength = capacity => SAC.atRest + SAC.growth * clamp(capacity / SAC.scale);
const activeAt = (group, maturity) => (group.end === null || maturity < group.end) &&
                                      (group.start === null || maturity >= group.start);
const capacityOf = (groups, maturity) => groups.reduce(
    (sum, group) => sum + (activeAt(group, maturity) ? group.copies / MAX_COPIES : 0), 0);
const liftAt = (capacity, physics) => physics.strength * capacity / (1 + capacity);
const hoverAt = (capacity, physics) => {
  const lift = liftAt(capacity, physics);
  return lift > 0 ? physics.sinking / lift : Infinity;
};
const bounds = key => [Math.max(activationLevel(0), key.gate - key.spread),
                       Math.min(activationLevel(1), key.gate + key.spread)];
const curve = (samples, x, y) =>
    path(samples.flatMap((sample, step) => step % PLOT_STRIDE ? [] : [ [ x(step), y(sample) ] ]));

function trial(input, groups, physics) {
  const capacity = capacityOf(groups, input.maturity), lift = liftAt(capacity, physics),
        swimming = input.maturity >= HATCH,
        hover = swimming ? hoverAt(capacity, physics) : Infinity;
  const filling = [], depth = [], push = [];
  let level = input.start, at = 1;
  for (let step = 0; step <= STEPS; step++) {
    const force = swimming ? (lift * level - physics.sinking) / (physics.sinking || lift || 1) : 0;
    filling.push(level);
    depth.push(at);
    push.push(force);
    level =
        clamp(level + physics.rate * capacity * (step < input.stop ? input.fill : -input.empty));
    at = clamp(at - force / FALL_STEPS);
  }
  const rises =
      filling.findIndex((level, step) => step > 0 && level > hover && filling[step - 1] <= hover);
  const sinks =
      filling.findIndex((level, step) => step > 0 && level < hover && filling[step - 1] >= hover);
  return {capacity, swimming, hover, filling, depth, push, rises, sinks};
}

function timeAxis(parent, chart, x) {
  const {left, right, top, base} = chart;
  el('path', {d : `M${left} ${top} V${base} H${right}`, class : 'aid-live-axis'}, parent);
  txt(parent, left, base + 15, word('steps'));
  for (const step of [STEPS / 3, 2 * STEPS / 3])
    txt(parent, x(step), base + 15, step, {'text-anchor' : 'middle'});
  txt(parent, right, base + 15, STEPS, {'text-anchor' : 'end'});
}

liveKind('bladder', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-bladder';
  const kind = document.createElement('strong');
  kind.className = 'aid-bladder-kind';
  root.appendChild(kind);
  const makePicture = heading => {
    if (heading) {
      const title = document.createElement('h4');
      title.textContent = word(heading);
      root.appendChild(title);
    }
    return el('svg', {class : 'aid-live-picture'}, root);
  };
  const water = makePicture(), filling = makePicture('filling'), depth = makePicture('depth'),
        life = makePicture('life');
  const input = {fill : .9, stop : 330, empty : .7, start : 0, maturity : 1};
  const film = {lines : [], nerves : [], thresholds : []};
  let state, organ, groups, keys, model, step = 0, chosenGroup = '', chosenKey = '';
  const draft = doc => doc && studio.draftDesign(doc, 'live:bladder:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const repaint = () => show(studio.state);
  const choose = (key, id) => {
    if (key === 'float')
      chosenGroup = id;
    else
      chosenKey = id;
  };
  function add(key, tuning) {
    const added =
        addOrganType(studio.state.document, organId, state.sites, tuning, key, state.anatomy);
    if (!added)
      return studio.notice(label('status.noRoom'));
    choose(key, added.typeId);
    change(added.document);
  }
  const remove = (key, id) => change(removeOrganType(studio.state.document, organId, id, key));
  const room = (key, count) =>
      count < limits[key] && organ.centers.length < nodeLimit(organ, state.sites);

  function buildWater(fixed) {
    const {left, right, top, base, sand} = WATER, gradient = `aid-water-${organId}`;
    const grad = el('linearGradient', {id : gradient, x1 : 0, y1 : 0, x2 : 0, y2 : 1},
                    el('defs', {}, fixed));
    el('stop', {offset : 0, 'stop-color' : '#3d7f96'}, grad);
    el('stop', {offset : 1, 'stop-color' : '#0c2630'}, grad);
    el('rect',
       {x : left, y : top, width : right - left, height : base - top, fill : `url(#${gradient})`},
       fixed);
    el('path', {
      d : `M${left} ${top} q8 -4 16 0 ${'t16 0 '.repeat(14)} H${right}`,
      class : 'aid-bladder-surface'
    },
       fixed);
    el('path', {
      d : `M${left} ${base} V${base - sand} q30 -5 60 0 t60 1 t64 -2 t60 1 V${base} Z`,
      class : 'aid-bladder-ground'
    },
       fixed);
    el('path', {
      d : `M${right - 30} ${base - sand} q-7 -16 -2 -30 M${right - 26} ${
          base - sand} q6 -12 2 -24 M${right - 34} ${base - sand} q-10 -8 -11 -19`,
      class : 'aid-bladder-plant'
    },
       fixed);
    film.fish = el('g', {}, fixed);
    film.shell = el('ellipse', {cx : 5, rx : 48, ry : 20, class : 'aid-live-shell'}, film.fish);
    el('path', {d : FISH, class : 'aid-live-body'}, film.fish);
    el('circle', {cx : -25, cy : -3, r : 2, class : 'aid-live-eye'}, film.fish);
    film.sac = el('ellipse', {cy : -2, class : 'aid-bladder-sac'}, film.fish);
    film.air = el('ellipse', {cy : -2, class : 'aid-bladder-air'}, film.fish);
    film.arrow = el('path', {class : 'aid-live-arrow'}, fixed);
  }

  function drawWater() {
    const {svg, live} = picture(water, WATER.height, buildWater);
    const {left, right, base, fishX} = WATER;
    const radius = sacLength(model.capacity), height = 3 + 4 * clamp(model.capacity / SAC.scale);
    film.sac.setAttribute('rx', radius);
    film.sac.setAttribute('ry', height);
    film.shell.setAttribute('visibility', model.swimming ? 'hidden' : 'visible');
    const rest = state.anatomy?.bladder?.restShare;
    if (Number.isFinite(rest))
      txt(live, 4, 10, word('rest', {p : percent(rest, 1)}), {class : 'aid-live-small'});
    keys.forEach((key, i) => {
      const cls = groupClass(i, key.type === chosenKey), [ low, high ] = bounds(key),
            y = depthY(key.gate);
      el('rect', {
        x : left,
        y : depthY(low),
        width : right - left,
        height : Math.max(3, depthY(high) - depthY(low)),
        class : 'aid-live-keyband ' + cls
      },
         live);
      const line =
          el('path', {d : `M${left} ${y} H${right}`, class : 'aid-live-keyline ' + cls}, live);
      film.thresholds.push({line, key});
      drag(svg,
           el('rect', {
             x : left - 17,
             y : y - 4,
             width : 15,
             height : 8,
             rx : 2,
             class : 'aid-bladder-depth-grip ' + cls
           },
              live),
           p => {
             choose('pressure', key.type);
             draft(updateCenter(studio.state.document, key.id,
                                {threshold : planOfUnit(activationQuality(depthAtY(p.y)))}));
           },
           'depth-' + key.id, 'grip', settle);
      const x = right - 8 - 13 * i, spreadY = Math.min(depthY(low), y - 4);
      el('path', {d : `M${x} ${spreadY} V${y}`, class : 'aid-live-spread'}, live);
      drag(svg, el('circle', {cx : x, cy : spreadY, r : 4}, live), p => {
        choose('pressure', key.type);
        draft(updateCellDistribution(studio.state.document, key.id, 'spread_physiology',
                                     clamp((key.gate - depthAtY(p.y)) / LEVEL_SPAN)));
      }, 'spread-' + key.id, 'grip', settle);
    });
    const selected = keys.find(key => key.type === chosenKey);
    chip(live, left - 18, base + 12, '−', () => remove('pressure', selected.type), keys.length > 1,
         6);
    chip(live, left - 2, base + 12, '+', () => {
      const gate = clamp((Math.max(...keys.map(key => key.gate)) + 1) / 2, .05, .95);
      add('pressure', {threshold : planOfUnit(activationQuality(gate))});
    }, room('pressure', keys.length), 6);
    film.size = null;
    const active = groups.filter(group => activeAt(group, input.maturity)),
          count = active.reduce((sum, group) => sum + group.count, 0);
    if (!count)
      return;
    const had = model.capacity;
    film.size = el('rect', {x : fishX + radius - 4, width : 8, height : 12, rx : 2}, live);
    drag(svg, film.size, p => {
      const least = count / MAX_COPIES;
      const wanted = clamp((p.x - fishX - SAC.atRest) / SAC.growth * SAC.scale, least, count);
      // Scale toward the bound from the values where the drag began. Fractions lost to rounding
      // on one frame must not change the result on the next.
      const bound = wanted > had ? MAX_COPIES : 1;
      const share = wanted === had ? 0 : (wanted - had) / ((bound === 1 ? least : count) - had);
      let next = studio.state.document;
      for (const group of active)
        next = updateCenter(next, group.id,
                            {copies : Math.round(group.perNode + (bound - group.perNode) * share)});
      draft(next);
    }, 'bladder-size', 'grip', settle);
  }

  function drawFilling() {
    const {svg, under, live} = picture(filling, FILL.height),
                       {left, right, top, base, commandTop, commandBase} = FILL;
    const x = timeX(FILL), y = levelY(FILL), mid = (commandTop + commandBase) / 2,
          half = (commandBase - commandTop) / 2, commandY = v => mid - half * v;
    txt(live, 5, mid - 4, word('fill'));
    txt(live, 5, mid + 12, word('empty'));
    el('path', {d : `M${left} ${mid} H${right}`, class : 'aid-live-axis'}, live);
    el('path', {
      d : `M${left} ${mid} V${commandY(input.fill)} H${x(input.stop)} V${commandY(-input.empty)} H${
          right} V${mid} Z`,
      class : 'aid-bladder-command'
    },
       live);
    el('rect',
       {x : left, y : top, width : right - left, height : base - top, class : 'aid-live-ground'},
       under);
    if (model.hover <= 1)
      el('rect', {
        x : left,
        y : top,
        width : right - left,
        height : y(model.hover) - top,
        class : 'aid-bladder-rise'
      },
         under);
    el('path', {
      d : curve(model.filling, x, y) + ` L${right} ${base} H${left} Z`,
      class : 'aid-bladder-filling'
    },
       live);
    if (model.hover <= 1) {
      const line = y(model.hover);
      el('path', {d : `M${left} ${line} H${right}`, class : 'aid-bladder-hover dashed'}, live);
      if (line - top > 15)
        txt(live, right - 3, line - 4, word('rises'), {'text-anchor' : 'end'});
      txt(live, right - 3, line + 12, word('sinks'), {'text-anchor' : 'end'});
      for (const [at, sign] of [[ model.rises, '↑' ], [ model.sinks, '↓' ]]) {
        if (at < 0)
          continue;
        const cx = x(at), preferLeft = sign === '↑' ? cx > left + 35 : cx > right - 35;
        el('circle', {cx, cy : line, r : 2.6, class : 'aid-bladder-crossing'}, live);
        txt(live, cx + (preferLeft ? -5 : 5), line - 6, `${sign} ${at}`,
            {'text-anchor' : preferLeft ? 'end' : 'start', class : 'aid-live-onground'});
      }
    } else if (model.swimming) {
      txt(live, right - 3, top + 12, word('sinks'), {'text-anchor' : 'end'});
    }
    timeAxis(live, FILL, x);
    txt(live, 5, top + 9, word('full'));
    txt(live, 5, base, word('emptyState'));
    film.lines.push({line : el('path', {class : 'aid-live-now'}, live), x, top : commandTop, base});
    const knob = (cx, cy, name, edit) => drag(svg, el('circle', {cx, cy, r : 5.5}, live), p => {
      edit(p);
      repaint();
    }, name, 'knob');
    knob(x(input.stop), commandY(input.fill), 'fill', p => {
      input.stop = clamp(Math.round((p.x - left) * STEPS / (right - left)), 20, STEPS - 60);
      input.fill = clamp((mid - p.y) / half);
    });
    knob((x(input.stop) + right) / 2, commandY(-input.empty), 'empty',
         p => { input.empty = clamp((p.y - mid) / half); });
    knob(left, y(input.start), 'start', p => { input.start = clamp((base - p.y) / (base - top)); });
  }

  function drawDepth() {
    const {live} = picture(depth, DEPTH.height), {left, right, top, base} = DEPTH;
    const x = timeX(DEPTH), y = levelY(DEPTH);
    txt(live, left, top - 8, word('signal'));
    el('rect',
       {x : left, y : top, width : right - left, height : base - top, class : 'aid-live-ground'},
       live);
    el('path', {d : 'M150 46 C154 19 179 42 184 10', class : 'aid-live-nerve-bundle'}, live);
    keys.forEach((key, i) => {
      const selected = key.type === chosenKey, cls = groupClass(i, selected),
            [ low, high ] = bounds(key);
      const cells = Array.from({length : 7}, (_, cell) => low + (high - low) * (cell + .5) / 7);
      const sent = model.depth.map(
          d => !model.capacity || !key.readsDepth
                   ? 0
                   : cells.reduce((sum, gate) => sum + boundedAnswer(d, gate), 0) / cells.length);
      const [cx, cy] = [ [ 150, 46 ], [ 124, 38 ], [ 176, 54 ] ][i];
      const chooseKey = () => {
        choose('pressure', key.type);
        repaint();
      };
      const trace = curve(sent, x, y);
      if (selected)
        el('path', {
          d : trace + ` L${right} ${base} H${left} Z`,
          class : 'aid-bladder-response-fill ' + cls
        },
           live);
      el('path', {d : trace, class : 'aid-bladder-response ' + cls}, live)
          .addEventListener('click', chooseKey);
      el('path', {d : `M${left} ${y(key.gate)} H${right}`, class : 'aid-live-keyline ' + cls},
         live);
      el('path', {
        d : `M${cx - 13} ${cy + 5} q7 3 13 -5 q6 -13 18 -16 M${cx} ${cy} l-11 12 m5 -1 l-2 6 M${
            cx} ${cy} l4 15`,
        class : 'aid-live-nerve-fibre ' + cls
      },
         live);
      el('circle', {cx, cy, r : 5.5, class : 'aid-live-soma ' + cls}, live)
          .addEventListener('click', chooseKey);
      film.nerves.push({
        sent,
        pulse : el('circle', {cx : cx + 6, cy : cy - 10, r : 0, class : 'aid-live-pulse'}, live)
      });
    });
    el('path', {d : curve(model.depth, x, y), class : 'aid-bladder-depth-trace'}, live);
    timeAxis(live, DEPTH, x);
    txt(live, left - 4, top + 9, word('deep'), {'text-anchor' : 'end'});
    txt(live, left - 4, base, word('shallow'), {'text-anchor' : 'end'});
    film.lines.push({line : el('path', {class : 'aid-live-now'}, live), x, top, base});
  }

  function drawLife() {
    const {svg, under, live} = picture(life, LIFE.height),
                       {left, right, top, base, icons, indent, gap} = LIFE;
    const x = maturity => left + (right - left) * maturity, y = levelY(LIFE);
    const maturityAt = px => clamp((px - left) / (right - left));
    const hover = maturity => hoverAt(capacityOf(groups, maturity), state.capabilities.buoyancy);
    const cuts =
        [...new Set([
          HATCH, 1,
          ...groups.flatMap(group => [group.start, group.end]).filter(at => at > HATCH && at < 1)
        ]) ].sort((a, b) => a - b);
    el('rect',
       {x : left, y : top, width : right - left, height : base - top, class : 'aid-live-ground'},
       under);
    el('rect', {
      x : left,
      y : top,
      width : x(HATCH) - left,
      height : base - top,
      class : 'aid-bladder-rise'
    },
       under);
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i], to = cuts[i + 1], level = hover((from + to) / 2);
      if (level > 1)
        continue;
      el('rect', {
        x : x(from),
        y : top,
        width : x(to) - x(from),
        height : y(level) - top,
        class : 'aid-bladder-rise'
      },
         under);
      el('path', {d : `M${x(from)} ${y(level)} H${x(to)}`, class : 'aid-bladder-hover'}, live);
    }
    el('path', {d : `M${left} ${top} V${base} H${right}`, class : 'aid-live-axis'}, live);
    el('path', {d : `M${x(HATCH)} ${top} V${base + 4}`, class : 'aid-bladder-hover dashed'}, live);
    txt(live, left, top - 5, word('level'));
    el('ellipse', {cx : left + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, live);
    el('circle', {cx : left + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, live);
    fishIcon(live, x(HATCH), icons, .5);
    fishIcon(live, right - 36, icons, .8);
    el('path', {
      d : `M${left + 22} ${icons} H${x(HATCH) - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${x(HATCH) + 18} ${
          icons} H${right - 60} m-6 -3.5 l6 3.5 l-6 3.5`,
      class : 'aid-live-arrow'
    },
       live);
    const farLeft = input.maturity > (1 + HATCH) / 2, lx = farLeft ? x(HATCH) + 6 : right - 4;
    const level = hover(farLeft ? HATCH + .001 : 1),
          align = {'text-anchor' : farLeft ? 'start' : 'end'};
    if (level <= 1 && y(level) - top > 15)
      txt(live, lx, y(level) - 5, word('rises'), align);
    if (level > 1 || base - y(level) > 15)
      txt(live, lx, level > 1 ? top + 12 : y(level) + 13, word('sinks'), align);
    groups.forEach((group, i) => {
      const start = group.start ?? 0, end = group.end ?? 1, selected = group.type === chosenGroup;
      const move = patch => {
        choose('float', group.type);
        draft(setLifePhase(studio.state.document, group.id, patch,
                           state.capabilities.sensitivitySpan, state.capabilities.steepnessSpan));
      };
      const grip = (at, side, name, edit) => {
        const cx = at === null ? side : x(at),
              cy = at === null ? base - 7 - gap * i : clamp(y(hover(at)), top + 6, base - 6);
        if (at === null && !selected) {
          el('rect', {
            x : cx - 4,
            y : cy - 4,
            width : 8,
            height : 8,
            rx : 1.6,
            class : 'aid-bladder-group-mark'
          },
             live)
              .addEventListener('click', () => {
                choose('float', group.type);
                repaint();
              });
          return;
        }
        drag(svg,
             el('rect', {
               x : cx - 4,
               y : cy - 5.5,
               width : 8,
               height : 11,
               rx : 2,
               class : selected ? 'aid-bladder-group-selected' : ''
             },
                live),
             p => move(edit(maturityAt(p.x))), name + group.id, 'grip', settle);
      };
      grip(group.start, left - indent, 'begins-',
           at => ({start : at < LIFE.whole ? null : Math.max(0, Math.min(at, end - LIFE.least))}));
      grip(group.end, right + indent, 'ends-',
           at => (
               {end : at > 1 - LIFE.whole ? null : Math.min(1, Math.max(at, start + LIFE.least))}));
    });
    chip(live, right + indent - 8, icons, '−', () => remove('float', chosenGroup),
         groups.length > 1, 6);
    chip(live, right + indent + 8, icons, '+', () => add('float', {}), room('float', groups.length),
         6);
    const current = hover(input.maturity), cx = x(input.maturity),
          cy = input.maturity < HATCH || current > 1 ? base : y(current);
    el('path', {d : `M${cx} ${top} V${base}`, class : 'aid-live-input'}, live);
    drag(svg, el('circle', {cx, cy, r : 5.5}, live), p => {
      input.maturity = maturityAt(p.x);
      repaint();
    }, 'bladder-maturity', 'knob');
  }

  function show(next) {
    state = next;
    organ = findOrgan(state.document, organId);
    const physics = state.capabilities?.buoyancy;
    if (!organ || !physics)
      return;
    groups = organTypes(organ, 'float').map(({id, centers}) => ({
                                              type : id,
                                              id : centers[0].id,
                                              count : centers.length,
                                              perNode : centers[0].copies,
                                              copies : centers.reduce(
                                                  (sum, center) => sum + center.copies, 0),
                                              ...lifePhase(centers[0])
                                            }));
    keys = organTypes(organ, 'pressure').map(({id, centers}) => {
      const center = centers[0],
            source = studio.shownDesign === state.document
                         ? groupReport(state.document, state.anatomy, 'pressure', center.id)
                         : null;
      return {
        type : id,
        id : center.id,
        gate : activationLevel(unitOfPlan(center.threshold)),
        spread : LEVEL_SPAN * center.distribution.spread_physiology,
        readsDepth : source === null || source === PRESSURE_SOURCE.bladder
      };
    });
    if (!groups.some(group => group.type === chosenGroup))
      chosenGroup = groups[0]?.type;
    if (!keys.some(key => key.type === chosenKey))
      chosenKey = keys[0]?.type;
    model = trial(input, groups, physics);
    kind.textContent = !model.swimming    ? word('egg')
                       : model.hover <= 1 ? word('hover', {p : percent(model.hover)})
                                          : word('tooSmall');
    film.lines = [];
    film.nerves = [];
    film.thresholds = [];
    drawWater();
    drawFilling();
    drawDepth();
    drawLife();
    tick(0);
  }

  function tick(dt) {
    if (!model || !film.fish)
      return;
    if (heldGrip()?.svg !== water || heldGrip()?.name !== 'bladder-size')
      step = (step + dt * STEPS / ROUND_MS) % STEPS;
    const at = Math.floor(step), depth = model.depth[at], fill = model.filling[at],
          push = model.push[at];
    const x = WATER.fishX, y = depthY(depth), air = Math.sqrt(fill),
          arrow = Math.abs(push) < STILL
                      ? 0
                      : Math.sign(-push) * (7 + 12 * Math.min(1.5, Math.abs(push)));
    film.fish.setAttribute('transform', `translate(${x} ${y.toFixed(1)})`);
    film.air.setAttribute('rx', (+film.sac.getAttribute('rx') * air).toFixed(1));
    film.air.setAttribute('ry', (+film.sac.getAttribute('ry') * air).toFixed(1));
    film.size?.setAttribute('y', (y - 8).toFixed(1));
    const tip = Math.sign(arrow) * 4.5;
    film.arrow.setAttribute(
        'd', arrow ? `M${x - 52} ${y} v${arrow} m-3.5 ${- tip} l3.5 ${tip} l3.5 ${- tip}` : '');
    for (const {line, x, top, base} of film.lines)
      line.setAttribute('d', `M${x(step).toFixed(1)} ${top} V${base}`);
    for (const {line, key} of film.thresholds)
      line.setAttribute('opacity', depth >= key.gate && model.capacity && key.readsDepth ? 1 : .5);
    for (const {sent, pulse} of film.nerves)
      pulse.setAttribute('r', (2.6 * sent[at]).toFixed(1));
  }
  return {root, show, tick};
});
