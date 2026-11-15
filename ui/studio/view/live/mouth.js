// The mouth's live inspector: one beat of the mouth over its steps, whichever of the two muscles
// is chosen.
// Read in the engine (physiology.cc, advance_mouth; physiology.hh, gill_water, jaw_snap;
// feeding.cc, raker_retention; werkzeug/atelier.cc, mouth_course_report): the opener's twitch
// opens the mouth, and while it is open water streams in; the closer's twitch snaps it shut when
// its pull peaks, and the bite takes no more than the widest gape before the snap; without a
// closer the mouth shuts without a bite. The gill covers draw water on through the open mouth.
// What is swallowed gathers as a credit, bounded by the throat and the rakers.
// Everything drawn is the plan's report for the beat tried here (anatomy.mouthCourse: for every
// step the opening, the stream into the mouth, the water through the gills, whether the jaw
// snaps, the widest gape and the credit; opener, closer and gills fully driven, each for as long
// as the plan's muscles twitch). Nothing of it is reckoned here.
// The jaw's length, the teeth, the muscles' strength and fibres are the fish panel's
// (anatomy_handles.js); its mouth moves with this beat (design.js, showMouthStep).
// The input: when the closer begins, before or after the opener; there only if the fish has
// both. The water through the gills and the credit are drawn against the plan's own measures
// (mouthCourse.gillWaterReference: the gills' water at a wide open mouth and a full command;
// creditReference: what the throat would take if the stream ran full for the opener's whole
// twitch, more than any beat reaches).
// STOPGAP: the four kinds of food and the force on each (anatomy.mouthForces). They belong to a
// probe of food before the mouth in the fish panel; until that exists they stay here.
import {t, tList} from '../../../strings.js';
import {MOTOR_KIND} from '../../../schema.js';
import {findOrgan} from '../../model/document.js';
import {organFunction} from '../../model/organs.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';

const word = key => t('studio.live.mouth.' + key);
// The beat: steps from L to R, counted from the opener's start, `delay` before it to at least
// `last` after, further if the beat lasts longer; the mouth's middle at `mid`, a full opening
// `high` either way; the closer's start is set on the line at `closer`, within `delay` steps
// either way; the gills' water at `gills`, the credit at `throat`, each at most `band` high.
const BEAT = Object.freeze({
  height : 178,
  L : 14,
  R : 250,
  last : 56,
  delay : 24,
  mid : 56,
  high : 44,
  closer : 116,
  gills : 140,
  throat : 164,
  band : 12,
  tooth : 5,
  round : 4200,
  rest : 900
});
const FOODS = Object.freeze({
  height : 62,
  y : 20,
  x : 40,
  gap : 73,
  colours : [ '#ee9f9a', '#8fd18a', '#e6b47c', '#77d2bd' ]
});

liveKind('mouth', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-mouth';
  const beat = addPicture(root), foods = addPicture(root);
  // What is tried: how many steps after the opener the closer begins. Not part of the fish.
  const own = {delay : 4};
  let clock = 0, film = null;
  function drawBeat() {
    const B = BEAT, {svg, live} = picture(beat, B.height), probe = studio.state.senseProbe,
          course = probe?.kind === 'mouth' && probe.organ === organId
                       ? studio.state.anatomy?.mouthCourse
                       : null,
          samples = course?.samples ?? [], first = course?.firstStep ?? 0,
          until = Math.max(B.last, first + samples.length),
          X = step => B.L + (B.R - B.L) * (step + B.delay) / (until + B.delay),
          stepAt = x => Math.round((x - B.L) / (B.R - B.L) * (until + B.delay) - B.delay),
          // Before and after the beat the mouth stays as its first and last step leave it, and
          // no water moves.
          still = (sample, kept) => [ sample[0], 0, 0, false, kept ? sample[4] : 0, kept ? sample[5] : 0 ],
          shown = samples.length ? [
            {sample : still(samples[0], false), x : B.L},
            ...samples.map((sample, i) => ({sample, x : X(first + i)})),
            {sample : still(samples.at(-1), true), x : B.R}
          ]
                                 : [],
          half = ({sample}) => B.high * clamp(sample[0]);
    // The stream into the mouth: as wide as the mouth is open and the water is drawn.
    if (shown.length > 1)
      el('path', {
        d : path(shown.map(s => [s.x, B.mid - half(s) * clamp(s.sample[1])])) + ' L' +
                shown
                    .map(s => `${s.x.toFixed(1)} ${
                             (B.mid + half(s) * clamp(s.sample[1])).toFixed(1)}`)
                    .reverse()
                    .join(' L') +
                'Z',
        class : 'aid-live-mouth-water'
      },
         live);
    // The mouth: its two jaws over the steps, as far apart as it is open.
    for (const side of [-1, 1])
      if (shown.length > 1)
        el('path',
           {d : path(shown.map(s => [s.x, B.mid + side * half(s)])), class : 'aid-live-mouth-line'},
           live);
    // The snap: teeth where the jaw shuts, as far apart as the widest gape before it.
    const snap = shown.find(s => s.sample[3]);
    if (snap) {
      const wide = B.high * clamp(snap.sample[4]);
      el('path', {d : `M${snap.x} ${B.mid - wide} V${B.mid + wide}`, class : 'aid-live-keymark k0'},
         live);
      for (const side of [-1, 1])
        el('path', {
          d : `M${snap.x - B.tooth} ${B.mid + side * wide} L${snap.x} ${
              B.mid + side * (wide - 1.6 * B.tooth)} L${snap.x + B.tooth} ${B.mid + side * wide} Z`,
          class : 'aid-live-mouth-tooth'
        },
           live);
    }
    // Behind the mouth: the water the gills draw through, and what the throat can swallow.
    const band = (index, most, base, name, act) => {
      el('path', {d : `M${B.L} ${base} H${B.R}`, class : 'aid-live-axis'}, live);
      // Without a measure (no opener, no gills) there is nothing to draw.
      if (most > 0 && shown.length)
        el('path', {
          d : path(shown.map(s => [s.x, base - B.band * clamp(s.sample[index] / most)])) +
                  ` L${shown.at(-1).x.toFixed(1)} ${base} L${shown[0].x.toFixed(1)} ${base} Z`,
          class : 'aid-live-mouth-water',
          opacity : index === 2 ? .45 : .8
        },
           live);
      const label = txt(live, B.R + 6, base, name,
                        {class : act ? 'aid-live-small aid-live-chip' : 'aid-live-small'});
      if (act)
        label.addEventListener('click', act);
    };
    const organs = studio.state.document.organs, gut = organs.find(o => o.type === 'gut');
    if (organs.some(o => o.type === 'gills'))
      band(2, course?.gillWaterReference, B.gills, word('gills'));
    band(5, course?.creditReference, B.throat, word('gut'),
         gut && (() => studio.select('organ', gut.id, null, false)));
    const now = el('path', {class : 'aid-live-now'}, live);
    film = share => {
      const i = Math.min(samples.length - 1, Math.floor(share * samples.length));
      if (i < 0)
        return;
      now.setAttribute(
          'd', `M${Math.min(B.R, X(first + i)).toFixed(1)} ${B.mid - B.high - 4} V${B.throat + 2}`);
      // The fish panel's mouth moves with the same step.
      studio.showMouthStep?.(organId, samples[i]);
    };
    // Redrawn while the knob is pulled, the beat stays at the step it was showing.
    film(Math.min(1, clock / B.round));
    // The input: when the closer begins. The opener begins at the tick. A mouth without both
    // muscles has nothing to set here.
    const has = code =>
        organs.some(o => o.type === 'muscle' && organFunction(o, studio.state.sites) === code);
    if (!has(MOTOR_KIND.suction) || !has(MOTOR_KIND.aggression))
      return;
    el('path', {d : `M${X(-B.delay)} ${B.closer} H${X(B.delay)}`, class : 'aid-live-track-line'},
       live);
    el('path', {d : `M${X(0)} ${B.closer - 5} v10`, class : 'aid-live-axis'}, live);
    const gx = X(own.delay);
    drag(svg, el('circle', {cx : gx, cy : B.closer, r : 5.5, class : 'aid-live-posture'}, live),
         (p, from) => {
           own.delay = clamp(stepAt(p.x - (from.x - gx)), -B.delay, B.delay);
           show();
         },
         'mouthcloser', 'knob');
  }
  // Before the mouth the four kinds of food, each bitten as deep as the force on it.
  function drawFoods() {
    const F = FOODS, {live} = picture(foods, F.height),
          forces = studio.state.anatomy?.mouthForces ?? [];
    tList('studio.live.mouth.foods').forEach((name, j) => {
      const x = F.x + F.gap * j, y = F.y, deep = Math.sqrt(clamp(forces[j] ?? 0));
      el('rect', {x : x - 15, y : y - 15, width : 30, height : 30, rx : 7, fill : F.colours[j]},
         live);
      // The area of the mark follows force. Both dimensions grow together so weak bites remain
      // visible, while a missing muscle still leaves the food whole.
      if (deep > 0)
        el('path', {
          d : `M${x - 15 * deep} ${y - 15} Q${x} ${y - 15 + 60 * deep} ${x + 15 * deep} ${
              y - 15} Z`,
          class : 'aid-live-mouth-bite'
        },
           live);
      txt(live, x, y + 29, name,
          {'text-anchor' : 'middle', class : 'aid-live-small', style : `fill:${F.colours[j]}`});
    });
  }
  function show() {
    if (!findOrgan(studio.state.document, organId)?.centers.length)
      return;
    studio.setMouthCommand(organId, own.delay,
                           studio.state.document.organs.some(o => o.type === 'gills'));
    drawBeat();
    drawFoods();
  }
  return {
    root,
    show,
    // The beat runs, then the mouth rests a while before the next.
    tick(dt) {
      clock = (clock + dt) % (BEAT.round + BEAT.rest);
      film?.(Math.min(1, clock / BEAT.round));
    }
  };
});
