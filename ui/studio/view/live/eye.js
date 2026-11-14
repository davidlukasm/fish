// The eye's two live pictures, among its own inspector (the fan and the test light on the fish,
// the colour types, the spectrum and the sight pictures stay as they are):
//   'eye': what a cell of the chosen colour type reports: how much brighter, or darker, its field
//   is than its surround;
//   'eyelife': the cells' life.
// Read in the engine (src/retina.cc:10-33, 166-180, 239-247; src/cppn_brain.cc:404-418;
// src/physiology.hh:437-441):
//   a sight cell compares the light in its field with a surround reaching three of its field's
//   widths to either side; it reports how much brighter its field is, or, for its dark share, how
//   much darker; even light reports nothing; the light counts in the cell's colours, the opponent
//   colour takes away from it; the threshold is the contrast at which the cell answers half;
//   in the egg there is no contrast; after hatching what is seen is weighed by (age since
//   hatching) / (the cell's time steps), up to one.
// NOT read: the waves over the retina in the egg (retinal_tissue takes the cells with a share of
// light); the response curve's own lines (here contrast / (contrast + half contrast)).
// The strip is the view as one cell has it: its field in the middle, the surround beside it. The
// round knob in the strip is a thing looked at (where it lies in the cell's view, how bright),
// the round knob at the strip's end the light all round; the thing has the colour of the fish
// panel's test light. They are the picture's own: the fish panel's test light has no place in
// one cell's view.
// ASSUMED for the picture: the thing is as wide as four fifths of the field; the cell's time
// steps are those of its time constant (ui/tuning.js, timeConstantSteps).
import {RGB, TUNING} from '../../../schema.js';
import {t} from '../../../strings.js';
import {
  hueAffinities,
  hueOffset,
  LONGEST_TIME_CONSTANT,
  planOfUnit,
  timeConstantOf,
  timeConstantSteps,
  tuningHue,
  unitOfPlan
} from '../../../tuning.js';
import {findOrgan, updateCenter, updateField} from '../../model/document.js';
import {clamp, drag, el, liveKind, path, picture} from './kit.js';
import {IRRITANT, keyGrip} from './sense.js';
import {eggShape, fishLeft, LIFE, lifeBand, lifePlaces} from './skin.js';

const word = key => t('studio.live.eye.' + key);
const EYE = Object.freeze({
  height : 132,
  L : 26,
  R : 250,
  mid : 138,
  field : 28,
  top : 16,
  high : 34,
  thing : .8,
  PT : 78,
  PB : 124,
  star : [ 284, 66 ],
  hue : 20,
  cells : 6,
  wedge : [ 8, 70 ],
  round : 2600
});
const css = rgb => `rgb(${rgb.map(v => Math.round(255 * clamp(v))).join(',')})`;
// The light of a hue, as the engine's three channels have it (model/retina.js, nominalSpectrum).
const hueLight = hue => Object.values(RGB).map(
    c => clamp(2 - Math.abs(hueOffset(hue, TUNING.channel_hue * c)) / (.5 * TUNING.channel_hue)));
const profileOf = (studio, organ) =>
    organ?.field?.profiles.find(p => p.id === studio.state.visionProfile) ??
    organ?.field?.profiles[0];
const halfOf = profile => TUNING.threshold_range ** (unitOfPlan(profile.threshold) - 1);

liveKind('eye', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-eye';
  const h = document.createElement('h4');
  h.textContent = word('sees');
  root.appendChild(h);
  const strip = el('svg', {class : 'aid-live-picture'});
  root.appendChild(strip);
  // What is tried: the light all round, and a thing: where it lies in the cell's view (in field
  // widths from the field's middle) and how bright it is. Not part of the fish.
  const own = {ground : .3, at : 0, bright : .85};
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const patch = (profile, change) =>
      draft(updateField(studio.state.document, organId, {profile : {id : profile.id, ...change}},
                        studio.state.sites));
  function show() {
    const profile = profileOf(studio, findOrgan(studio.state.document, organId));
    if (!profile)
      return;
    const {svg, live} = picture(strip, EYE.height), {L, R, mid, field, top, high, PT, PB} = EYE,
                X = at => mid + field * at;
    // What a light is worth to the cell: in its colours, less what the opponent colour takes.
    const affinity = hueAffinities(tuningHue(profile.q1), profile.qwidth),
          total = affinity.reduce((a, b) => a + b, 0), spectrum = affinity.map(v => v / total),
          peak = Math.max(...spectrum), complement = spectrum.map(v => 1 - v / peak),
          untuned = complement.reduce((a, b) => a + b, 0),
          opponent =
              (studio.state.capabilities?.visionSpectrum?.opponent ?? 0) * unitOfPlan(profile.q2);
    const worth = light => Math.max(
        0, spectrum.reduce((sum, v, c) => sum + v * light[c], 0) -
               (untuned > 0
                    ? opponent * complement.reduce((sum, v, c) => sum + v * light[c], 0) / untuned
                    : 0));
    const hue = studio.state.sightProbe?.hue ?? EYE.hue,
          ground = [ own.ground, own.ground, own.ground ],
          thing = hueLight(hue).map(v => v * own.bright),
          lightAt = at => Math.abs(at - own.at) <= EYE.thing / 2 ? thing : ground,
          full = worth([ 1, 1, 1 ]) || 1, seen = at => worth(lightAt(at)) / full;
    const mean = (from, to) => {
      let sum = 0, n = 0;
      for (let a = from + .025; a < to; a += .05, n++)
        sum += seen(a);
      return sum / n;
    };
    const inField = mean(-.5, .5), around = (mean(-3.5, -.5) + mean(.5, 3.5)) / 2,
          dark = profile.polarity, half = halfOf(profile),
          contrast =
              (1 - dark) * Math.max(0, inField - around) + dark * Math.max(0, around - inField),
          report = contrast / (contrast + half);
    // The strip: the view by its angle, as bright and as coloured as it is; the field and its
    // surround.
    el('rect', {x : L, y : top, width : R - L, height : high, fill : css(ground)}, live);
    el('rect', {
      x : X(own.at - EYE.thing / 2),
      y : top,
      width : field * EYE.thing,
      height : high,
      fill : css(thing)
    },
       live);
    el('rect',
       {x : X(-.5), y : top - 3, width : field, height : high + 6, class : 'aid-live-eye-field'},
       live);
    for (const side of [-1, 1])
      el('path',
         {d : `M${X(side * .5)} ${top + high + 7} H${X(side * 3.5)} v-5`, class : 'aid-live-hatch'},
         live);
    // What the cell makes of the light along the strip, and what field and surround hold.
    const Y = v => PB - (PB - PT) * clamp(v), pts = [];
    for (let a = -4; a <= 4.001; a += .05)
      pts.push([ X(a), Y(seen(a)) ]);
    el('path', {d : `M${L} ${PB} H${R}`, class : 'aid-live-rim'}, live);
    el('path', {d : path(pts), class : 'aid-live-eye-worth'}, live);
    el('path', {d : `M${X(-.5)} ${Y(inField)} H${X(.5)}`, class : 'aid-live-eye-level'}, live);
    for (const side of [-1, 1])
      el('path', {
        d : `M${X(side * .5)} ${Y(around)} H${X(side * 3.5)}`,
        class : 'aid-live-eye-level around'
      },
         live);
    // Beside it the gap between the two, on a scale of its own: from the faintest contrast a cell
    // can be set to (below) to the full one (above), each step as many times the one before.
    // Bright where the field is brighter, blue where it is darker; as far as the cell's shares
    // take it. The grip on the scale is the contrast at which the cell answers half.
    const gx = X(3.5) + 20, up = inField >= around, range = TUNING.threshold_range,
          G = v => PB - (PB - PT) * (1 + Math.log(clamp(v, 1 / range, 1)) / Math.log(range));
    el('path', {d : `M${gx} ${PT} V${PB}`, class : 'aid-live-rim'}, live);
    if (Math.abs(inField - around) > 1 / range)
      el('path', {
        d : `M${gx} ${PB} V${G(Math.abs(inField - around))}`,
        class : 'aid-live-eye-gap' + (up ? '' : ' darker'),
        opacity : (up ? 1 - dark : dark) * .85 + .15
      },
         live);
    if (report > .01)
      el('path', {
        d : IRRITANT,
        class : 'aid-live-irritant',
        transform :
            `translate(${EYE.star[0]} ${EYE.star[1]}) scale(${(.5 + 1.5 * report).toFixed(2)})`
      },
         live);
    const hy = G(half);
    el('path', {d : `M${gx - 7} ${hy} h14`, class : 'aid-live-eye-half'}, live);
    drag(svg, el('circle', {cx : gx + 12, cy : hy, r : 4.5}, live),
         p => patch(profile, {threshold : planOfUnit(clamp((PB - p.y) / (PB - PT)))}), 'eyehalf',
         'grip', settle);
    // The shares: how much of the cell answers brighter (below), how much darker (above).
    const sx = 12, st = PT + 2, sb = PB - 2, sy = st + (sb - st) * dark;
    el('path', {d : `M${sx} ${st} V${sy}`, class : 'aid-live-eye-gap darker'}, live);
    el('path', {d : `M${sx} ${sy} V${sb}`, class : 'aid-live-eye-gap'}, live);
    drag(svg,
         el('rect',
            {x : sx - 5.5, y : sy - 4, width : 11, height : 8, rx : 2, class : keyGrip(0, true)},
            live),
         p => patch(profile, {polarity : clamp((p.y - st) / (sb - st))}), 'eyedark', 'grip',
         settle);
    // The thing in the strip: along it where it is, up and down how bright; and the light all
    // round at the strip's end.
    drag(svg,
         el('circle', {
           cx : X(own.at),
           cy : top + high * (1 - own.bright),
           r : 5.5,
           class : 'aid-live-posture'
         },
            live),
         p => {
           own.at = clamp((p.x - mid) / field, -3.6, 3.6);
           own.bright = clamp(1 - (p.y - top) / high);
           show();
         },
         'eyething', 'knob');
    drag(svg,
         el('circle',
            {cx : R + 9, cy : top + high * (1 - own.ground), r : 5, style : `fill:${css(ground)}`},
            live),
         p => {
           own.ground = clamp(1 - (p.y - top) / high);
           show();
         },
         'eyeground', 'knob');
  }
  return {root, show, tick() {}};
});

// Its life: in the egg waves run over the retina; after hatching what is seen fades in over the
// cells' time; then the eye sees.
liveKind('eyelife', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-eye';
  const h = document.createElement('h4');
  h.textContent = word('life');
  root.appendChild(h);
  const life = el('svg', {class : 'aid-live-picture'});
  root.appendChild(life);
  let cells = [], phase = 0;
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const least = timeConstantSteps(0);
  function show() {
    const eye = findOrgan(studio.state.document, organId), cell = eye?.centers[0];
    if (!cell)
      return;
    const {L, R, hatch} = LIFE, at = L + (R - L) * hatch, {egg, y} = lifePlaces();
    const {svg, under, live} = picture(life, LIFE.height, fixed => {
      eggShape(fixed, egg, y, 19, false);
      fishLeft(fixed, R - 34, y, .7);
    });
    // The retina in the egg: a row of cells; a wave runs over them.
    cells = Array.from(
        {length : EYE.cells},
        (_, n) =>
            el('circle', {cx : egg + 34, cy : y - 15 + 6 * n, r : 2.4, class : 'aid-live-petal k0'},
               live));
    // After hatching: what is seen grows from nothing to all of it, over the cells' time.
    const steps = timeConstantSteps(cell.tau),
          wide = EYE.wedge[0] +
                 (EYE.wedge[1] - EYE.wedge[0]) * (steps - least) / (LONGEST_TIME_CONSTANT - least);
    el('path', {
      d : `M${at + 4} ${y + 12} L${at + 4 + wide} ${y - 12} V${y + 12} Z`,
      class : 'aid-live-petal k0',
      opacity : .8
    },
       live);
    drag(svg,
         el('rect',
            {x : at + wide, y : y - 23, width : 8, height : 10, rx : 2, class : keyGrip(0, true)},
            live),
         p => {
           const tau = timeConstantOf(
               least + clamp((p.x - at - 4 - EYE.wedge[0]) / (EYE.wedge[1] - EYE.wedge[0])) *
                           (LONGEST_TIME_CONSTANT - least));
           draft(eye.centers.reduce((doc, c) => updateCenter(doc, c.id, {tau}) ?? doc,
                                    studio.state.document));
         },
         'eyetime', 'grip', settle);
    lifeBand(
        svg, under, live,
        {studio, center : cell, centers : eye.centers.map(c => c.id), name : 'eye', draft, settle});
    wave();
  }
  function wave() {
    const at = phase * (EYE.cells + 2) - 1;
    cells.forEach((c, n) => c.setAttribute(
                      'opacity', (.25 + .75 * Math.exp(-((n - at) ** 2) / 1.2)).toFixed(2)));
  }
  return {
    root,
    show,
    tick(dt) {
      phase = (phase + dt / EYE.round) % 1;
      wave();
    }
  };
});
