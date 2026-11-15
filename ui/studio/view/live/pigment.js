// The pigment's live inspector: the fish in its colour before a ground and how it recolours;
// the light as a band of its hues with the notches the types of cells swallow.
// Read in the engine (receptor_tuning.hh, hue_affinities; body_plan.cc, the cells' colour, the
// spreading of pigment and visible_absorption; material.hh, pigment_color): a pigment cell
// swallows of each of the three channels of light what its hue and width give it: wide = all
// three = dark, narrow = one = coloured. Without a command a part of the pigment shows (rest); a
// positive command spreads it up to all, in the cells' own time. Only other fishes' eyes see the
// colour.
// The colours from rest to all the pigment spread are the plan's report (anatomy.colour.range).
// The command and the ground are the picture's own knobs; the fish panel has no probe for them.
import {t} from '../../../strings.js';
import {ATELIER_LIMITS, TUNING} from '../../../schema.js';
import {
  hueAffinities,
  hueQuality,
  timeConstantOf,
  timeConstantSteps,
  tuningHue,
  tuningSigma,
  tuningWidth
} from '../../../tuning.js';
import {
  addOrganType,
  findOrgan,
  organTypes,
  removeOrganType,
  updateCenter
} from '../../model/document.js';
import {label} from '../kit.js';
import {addPicture, chip, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {keyGrip, STEPS} from './sense.js';
import {fishSide} from './skin.js';

const word = (key, values) => t('studio.live.pigment.' + key, values);
const ROUND_MS = 12000, MOST = 4, TURN = 2 * TUNING.hue_half_circle;
const SCENE = Object.freeze({
  height : 206,
  fish : {x : 150, y : 56, s : 2.3},
  ground : 108,
  course : {L : 60, R : 256, top : 128, base : 178},
  time : [ 4, 200 ],
  stop : [ 100, 800 ],
  grounds : [ [ 14, 42, 54 ], [ 47, 111, 106 ], [ 185, 166, 120 ] ]
});
const BAND =
    Object.freeze({height : 100, L : 16, R : 284, top : 10, base : 58, deep : 44, hues : 60});
const NEW = Object.freeze({q1 : hueQuality(TURN / 3), qwidth : .2});
const css = rgb => 'rgb(' + rgb.map(v => Math.round(255 * clamp(v))).join(',') + ')';
const groundColour = g => {
  const [a, b] =
      g < .5 ? [ SCENE.grounds[0], SCENE.grounds[1] ] : [ SCENE.grounds[1], SCENE.grounds[2] ],
            u = g < .5 ? g * 2 : (g - .5) * 2;
  return css(a.map((v, c) => (v + (b[c] - v) * u) / 255));
};
const turnTo = a => ((a + 1.5 * TURN) % TURN) - TURN / 2;
const paint = (group, colour) => {
  for (const part of [group.firstChild, group.firstChild.nextSibling])
    part.style.fill = colour;
};

liveKind('pigment', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-pigment';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
  };
  const scene = addPicture(root);
  heading(word('cells'));
  const band = addPicture(root);
  // What is tried: how far the brain has the pigment spread and at which step it lets go; what
  // lies behind the fish (0 deep water - 1 sand). Not part of the fish.
  const own = {chosen : 0, command : 1, stop : 450, ground : .35, pull : null};
  let step = 0, clock = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = (doc, preview = null) =>
      doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive', preview);
  const settle = () => {
    own.pull = null;
    if (studio.drafted)
      studio.settleGraphic();
  };
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show();
  // The fish before a ground, as another eye sees it. Below, the recolouring over time, from
  // rest (the lower fish) to all the pigment spread (the upper fish): the round knob is the
  // brain's command, the curve what the cells make of it in their own time; the grip on the curve
  // sets the chosen type's time. The fish above has the colour of the clock's step.
  function drawScene(cell) {
    const {svg, under, live} = picture(scene, SCENE.height), {L, R, top, base} = SCENE.course,
                       f = SCENE.fish,
                       range = (studio.state.outlinePreview ?? studio.state.anatomy)?.colour?.range,
                       time = timeConstantSteps(cell.tau), X = st => L + (R - L) * st / STEPS,
                       Y = v => base - (base - top) * clamp(v),
                       colourAt = spread =>
                           range?.length
                               ? css(range[Math.round(clamp(spread) * (range.length - 1))])
                               : '';
    el('rect', {
      x : 0,
      y : 0,
      width : 300,
      height : SCENE.ground,
      rx : 6,
      style : 'fill:' + groundColour(own.ground)
    },
       under);
    const body = el('g', {}, live);
    fishSide(body, f.x, f.y, f.s);
    drag(svg,
         el('circle', {
           cx : 14 + 60 * own.ground,
           cy : SCENE.ground - 10,
           r : 5,
           class : 'aid-live-groundknob',
           style : 'fill:' + groundColour(own.ground)
         },
            live),
         p => {
           own.ground = clamp((p.x - 14) / 60);
           again();
         },
         'pigmentground', 'knob');
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-ground'},
       under);
    for (const [v, name] of [[ 0, 'rest' ], [ 1, 'full' ]]) {
      const g = el('g', {}, live);
      fishSide(g, L - 22, Y(v), .3);
      paint(g, colourAt(v));
      txt(live, R + 5, Y(v) + 4, word(name), {class : 'aid-live-small'});
    }
    const spreadIn = (st, steps) => st < own.stop ? own.command * -Math.expm1(-st / steps)
                                                  : own.command * -Math.expm1(-own.stop / steps) *
                                                        Math.exp(-(st - own.stop) / steps),
          spreadAt = st => spreadIn(st, time);
    // Each channel of the body's colour spreads in its own time (anatomy.pigmentTimes: the
    // cells' times weighed by what they swallow of that channel).
    const times = studio.state.anatomy?.pigmentTimes,
          bodyAt = st =>
              range?.length
                  ? css(range[0].map(
                        (_, c) =>
                            range[Math.round(clamp(spreadIn(st, times?.[c] > 0 ? times[c] : time)) *
                                             (range.length - 1))][c]))
                  : '';
    el('path',
       {d : `M${L} ${Y(own.command)} H${X(own.stop)} V${base}`, class : 'aid-live-sense-offered'},
       live);
    el('path', {
      d : path(Array.from({length : 181}, (_, n) => [X(n * 5), Y(spreadAt(n * 5))])),
      class : 'aid-live-felt'
    },
       live);
    el('path', {d : `M${L} ${top - 2} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, base + 14, word('steps'));
    txt(live, R, base + 14, STEPS, {'text-anchor' : 'end'});
    const now = el('path', {class : 'aid-live-now'}, live);
    drag(svg,
         el('rect', {
           x : X(time) - 4,
           y : Y(spreadAt(time)) - 5,
           width : 8,
           height : 10,
           rx : 2,
           class : keyGrip(own.chosen, true)
         },
            live),
         p => draft(updateCenter(studio.state.document, cell.id, {
           tau : timeConstantOf(
               clamp((p.x - L) / (R - L) * STEPS, SCENE.time[0], Math.min(SCENE.time[1], own.stop)))
         })),
         'pigmenttime', 'grip', settle);
    drag(svg,
         el('circle', {cx : X(own.stop), cy : Y(own.command), r : 5.5, class : 'aid-live-posture'},
            live),
         p => {
           own.stop = clamp(Math.round((p.x - L) / (R - L) * STEPS), ...SCENE.stop);
           own.command = clamp((base - p.y) / (base - top));
           again();
         },
         'pigmentcommand', 'knob');
    clock = at => {
      paint(body, bodyAt(at));
      now.setAttribute('d', `M${X(at).toFixed(1)} ${top} V${base}`);
    };
  }
  // The light as a band of its hues; each type of cells swallows the light round its hue: a
  // notch in the band, as wide as its width and as deep as its cells. The grip at the notch's
  // bottom is dragged along for the hue and down for more cells; the round grip at its edge sets
  // the width.
  function drawBand(cells) {
    const {svg, under, live} = picture(band, BAND.height), {L, R, top, base, deep} = BAND,
                       X = hue => L + (R - L) * hue / TURN,
                       hueOf = x => clamp((x - L) / (R - L) * TURN, 0, TURN - .1),
                       most = ATELIER_LIMITS.max_copies, depth = copies => deep * copies / most;
    for (let n = 0; n < BAND.hues; n++)
      el('rect', {
        x : X(n * TURN / BAND.hues),
        y : top,
        width : (R - L) / BAND.hues + .5,
        height : base - top,
        style : `fill:hsl(${(n * 360 / BAND.hues).toFixed(0)} 85% 60%)`
      },
         under);
    cells.forEach((cell, i) => {
      const chosen = i === own.chosen, hue = tuningHue(cell.q1), x = X(hue),
            w = Math.min((R - L) / 2, (R - L) * tuningSigma(cell.qwidth) / TURN),
            d = depth(cell.copies);
      // The notch wraps round the band's ends.
      for (const off of [-(R - L), 0, R - L]) {
        const pts = Array
                        .from({length : 25},
                              (_, n) => {
                                const u = n / 12 - 1;
                                return [ x + off + w * u, top + d * (1 - Math.abs(u)) ** 1.7 ];
                              })
                        .filter(([ px ]) => px >= L && px <= R);
        if (pts.length > 1)
          el('path', {
            d : path(pts) + ` L${pts[pts.length - 1][0]} ${top} L${pts[0][0]} ${top} Z`,
            class : 'aid-live-notch k' + i + (chosen ? ' on' : '')
          },
             live);
      }
      drag(svg,
           el('rect', {
             x : x - 5,
             y : top + d - 5,
             width : 10,
             height : 10,
             rx : 2.5,
             class : keyGrip(i, chosen)
           },
              live),
           p => {
             own.chosen = i;
             draft(updateCenter(studio.state.document, cell.id, {
               q1 : hueQuality(hueOf(p.x)),
               copies : Math.round(clamp((p.y - top) / deep * most, 1, most))
             }), 'colour');
           },
           'pigmenttype' + i, 'grip', settle);
      if (!chosen)
        return;
      drag(svg, el('circle', {cx : clamp(x + w, L, R), cy : top, r : 4.5}, live),
           p => draft(updateCenter(studio.state.document, cell.id,
                                   {qwidth : tuningWidth(Math.abs(turnTo(hueOf(p.x) - hue)))}),
                      'colour'),
           'pigmentwidth', 'grip', settle);
      if (cells.length > 1)
        chip(live, x, base + 14, '×', () => remove(i), true, 6);
    });
    chip(live, R - 6, base + 16, '+', add, cells.length < MOST, 7);
  }
  function remove(i) {
    const type = organTypes(organ())[i];
    own.chosen = 0;
    change(removeOrganType(studio.state.document, organId, type.id));
  }
  function add() {
    const added = addOrganType(studio.state.document, organId, studio.state.sites, NEW);
    if (!added)
      return studio.notice(label('status.noRoom'));
    own.chosen = organTypes(organ()).length;
    change(added.document);
  }
  function show() {
    const skin = organ();
    if (!skin)
      return;
    const cells = organTypes(skin).map(type => type.centers[0]);
    own.chosen = Math.min(own.chosen, cells.length - 1);
    drawScene(cells[own.chosen]);
    drawBand(cells);
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    clock?.(step);
  }
  return {root, show, tick};
});
