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
// The strip is the engine's own: the light at the eye for the fish panel's test light, round the
// field of the cell of the chosen colour type that answers it most; the columns are the light of
// its field against its surround's colour by colour, the scale beside them its contrast, the
// mark its answer (the plan report's sight, as the sight pictures below use it). Nothing is
// worked out again here.
// ASSUMED: the cell's time steps are those of its time constant (ui/tuning.js,
// timeConstantSteps).
import {IMAGE_BAND, RECEPTOR, SENSE_KIND, TUNING, VISUAL_SAMPLE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {
  LONGEST_TIME_CONSTANT,
  planOfUnit,
  timeConstantOf,
  timeConstantSteps,
  unitOfPlan
} from '../../../tuning.js';
import {findOrgan, updateCenter, updateField} from '../../model/document.js';
import {organCells} from '../vision.js';
import {clamp, drag, el, liveKind, picture} from './kit.js';
import {IRRITANT, keyGrip} from './sense.js';
import {eggShape, fishLeft, LIFE, lifeBand, lifePlaces} from './skin.js';

const word = key => t('studio.live.eye.' + key);
const EYE = Object.freeze({
  height : 138,
  L : 26,
  R : 250,
  mid : 138,
  field : 28,
  top : 16,
  high : 34,
  PT : 74,
  PB : 120,
  star : [ 284, 66 ],
  column : 22,
  channels : [ '#ee8a80', '#8fd18a', '#8daded' ],
  cells : 6,
  wedge : [ 8, 70 ],
  round : 2600
});
const css = rgb => `rgb(${rgb.map(v => Math.round(255 * clamp(v))).join(',')})`;
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
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const patch = (profile, change) =>
      draft(updateField(studio.state.document, organId, {profile : {id : profile.id, ...change}},
                        studio.state.sites));
  function show() {
    const organ = findOrgan(studio.state.document, organId), profile = profileOf(studio, organ);
    if (!profile)
      return;
    const {svg, live} = picture(strip, EYE.height), {L, R, mid, field, top, high, PT, PB} = EYE,
                X = at => mid + field * at, sight = studio.state.anatomy?.sight,
                range = TUNING.threshold_range, scale = TUNING.threshold_min * range;
    // The cell shown: of the chosen colour type's cells the one that answers the fish panel's
    // test light most.
    const cell = organCells(studio.state, organ)
                     .filter(c => c.center.profile === profile.id)
                     .sort((a, b) => b.answer - a.answer)[0],
          sample = cell && sight.samples.find(s => s[VISUAL_SAMPLE.neuron] ===
                                                   cell.receptor[RECEPTOR.neuron]);
    el('rect', {x : L, y : top, width : R - L, height : high, class : 'aid-live-ground'}, live);
    if (cell) {
      // The strip: the light at the eye by its angle, as the engine has it for the test light,
      // four of the cell's field widths to either side of its field's middle.
      const r = cell.receptor, wide = r[RECEPTOR.view_right] - r[RECEPTOR.view_left],
            at = angle => (angle - r[RECEPTOR.angle]) / wide, side = organ.side < 0 ? 0 : 1;
      for (const band of sight.bands ?? []) {
        if (band[IMAGE_BAND.eye] !== undefined && band[IMAGE_BAND.eye] !== side)
          continue;
        const from = Math.max(-4, at(band[IMAGE_BAND.left])),
              to = Math.min(4, at(band[IMAGE_BAND.right]));
        if (to > from)
          el('rect', {
            x : X(from),
            y : top,
            width : field * (to - from),
            height : high,
            fill : css([ band[IMAGE_BAND.red], band[IMAGE_BAND.green], band[IMAGE_BAND.blue] ])
          },
             live);
      }
    }
    // Over it the field, as the cell weighs it: most at its middle, not at all at its edges;
    // under it the surround, three field widths to either side, the field among them.
    el('path', {
      d : `M${X(-.5)} ${top + high + 3} L${X(0)} ${top - 3} L${X(.5)} ${top + high + 3}`,
      class : 'aid-live-eye-field'
    },
       live);
    el('path', {d : `M${X(-3)} ${top + high + 2} v6 H${X(3)} v-6`, class : 'aid-live-hatch'}, live);
    // Field against surround, colour by colour, as the engine has them (the sight report's
    // retinalLight, the row of this eye). The dashed stroke is the surround's light, the column
    // on it how far the field's light lies from it: filled where the field is brighter, hollow
    // where it is darker. A column is as high as the root of the difference, so that a small one
    // still shows.
    const eye = organ.side < 0 ? 0 : 1,
          lights = cell && sight.retinalLight?.find(
                               row => row[0] === cell.receptor[RECEPTOR.neuron] && row[1] === eye);
    EYE.channels.forEach((colour, c) => {
      const x = X(0) + (c - 1) * (EYE.column + 6);
      el('path', {
        d : `M${x - EYE.column / 2} ${PB} h${EYE.column}`,
        class : 'aid-live-eye-level around',
        style : `stroke:${colour}`
      },
         live);
      if (!lights)
        return;
      const gap = lights[2][c] - lights[3][c], tall = (PB - PT) * Math.sqrt(clamp(Math.abs(gap)));
      if (tall > .5)
        el('rect', {
          x : x - EYE.column / 2 + 3,
          y : PB - tall,
          width : EYE.column - 6,
          height : tall,
          class : 'aid-live-eye-column' + (gap < 0 ? ' darker' : ''),
          style : `--channel:${colour}`
        },
           live);
    });
    // Beside it the contrast the cell has, on a scale of its own: from the faintest a cell can be
    // set to (below) to the full one (above), each step as many times the one before. The grip
    // on the scale is the contrast at which the cell answers half.
    const gx = X(3.5) + 20, half = halfOf(profile),
          // The cell's contrast after the cells' mutual inhibition and before the answer's curve:
          // the stimulus without the cell's share of sight.
        gain = cell?.receptor[RECEPTOR.senses]?.[SENSE_KIND.light] || 1,
          contrast = sample ? sample[VISUAL_SAMPLE.stimulus] / gain / scale : 0,
          G = v => PB - (PB - PT) * (1 + Math.log(clamp(v, 1 / range, 1)) / Math.log(range));
    el('path', {d : `M${gx} ${PT} V${PB}`, class : 'aid-live-rim'}, live);
    if (contrast > 1 / range)
      el('path', {d : `M${gx} ${PB} V${G(contrast)}`, class : 'aid-live-eye-gap'}, live);
    if (cell?.answer > .01)
      el('path', {
        d : IRRITANT,
        class : 'aid-live-irritant',
        transform :
            `translate(${EYE.star[0]} ${EYE.star[1]}) scale(${(.5 + 1.5 * cell.answer).toFixed(2)})`
      },
         live);
    const hy = G(half);
    el('path', {d : `M${gx - 7} ${hy} h14`, class : 'aid-live-eye-half'}, live);
    drag(svg, el('circle', {cx : gx + 12, cy : hy, r : 4.5}, live),
         p => patch(profile, {threshold : planOfUnit(clamp((PB - p.y) / (PB - PT)))}), 'eyehalf',
         'grip', settle);
    // The shares: how much of the cell answers brighter (below), how much darker (above).
    const sx = 12, st = PT + 2, sb = PB - 2, dark = profile.polarity, sy = st + (sb - st) * dark;
    el('path', {d : `M${sx} ${st} V${sy}`, class : 'aid-live-eye-gap darker'}, live);
    el('path', {d : `M${sx} ${sy} V${sb}`, class : 'aid-live-eye-gap'}, live);
    drag(svg,
         el('rect',
            {x : sx - 5.5, y : sy - 4, width : 11, height : 8, rx : 2, class : keyGrip(0, true)},
            live),
         p => patch(profile, {polarity : clamp((p.y - st) / (sb - st))}), 'eyedark', 'grip',
         settle);
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
