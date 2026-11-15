// The side fin muscle's live inspector: a small fish in still water, moved by its side fins.
// Read in the engine (body_plan.cc, fin_mechanics: a side fin cell beats at its angle and pushes,
// shifts and turns the fish with its lever and arm; movement.cc, move_body: the body's step in
// the water; werkzeug/atelier.cc, fin_course_report: the fish of this plan, grown and fed, in
// still open water, driven by the commands tried here through the same muscles and the same step
// as in the aquarium).
// The water is seen from the side, as the aquarium is: down is down, a turn raises or lowers the
// snout. The fish looks to the left, as in the fish panel.
// The way the fish takes is the plan's report (anatomy.finCourse: place in body radii, heading,
// step and the fins' tension, every fourth step). Nothing of it is reckoned here.
// The fins themselves, where they sit, their angle, strength and fibres are the fish panel's
// (anatomy_handles.js). Here are the inputs: the commands to this muscle and to its twin on the
// other side, each as a beat that lasts as long and is as strong as its knob is pulled. Above
// the line the muscle beats backward, below it forward: pulled across, the muscle's stroke turns
// round.
// Not in the picture: the other pair of side fins and the tail beating along (the report drives
// one pair at a time); the ground.
import {FIN_STROKE} from '../../../schema.js';
import {degrees} from '../../../units.js';
import {
  addAntagonist,
  antagonistOf,
  findOrgan,
  finStroke,
  setFinStroke
} from '../../model/document.js';
import {sideIndex, sideOf} from '../../model/layout.js';
import {isPelvicMuscle} from '../../model/organs.js';
import {label} from '../kit.js';
import {addPicture, chip, clamp, drag, el, liveKind, path, picture} from './kit.js';
import {fishLeft} from './skin.js';

// The water: `box` wide and high, a body radius at most `radius` pixels, `edge` free round the
// way. The beats: steps from L to R, `steps` in all, a beat at most `longest`; a row's line at
// rows[k], a full beat `high` from it; a pull of `turn` across the line turns the stroke round.
const SWIM = Object.freeze({
  height : 236,
  box : [ 300, 150 ],
  radius : 22,
  edge : 26,
  fish : 31,
  L : 30,
  R : 288,
  steps : 128,
  longest : 64,
  every : 4,
  rows : [ 180, 214 ],
  high : 14,
  least : .15,
  turn : 6,
  round : 6000
});
const SIDES = Object.freeze([ 'left', 'right' ]);

liveKind('fin', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-fin';
  const water = addPicture(root);
  // What is tried: for this muscle and its twin, how long the beat lasts (steps) and how strong
  // the command is. Not part of the fish.
  const own = {beats : [ {steps : 16, strength : 1}, {steps : 0, strength : 1} ]};
  let clock = 0, film = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The commands as the engine takes them: phases in which the same fins beat, then the glide.
  function phasesOf(muscles) {
    const pair = isPelvicMuscle(muscles[0]) ? 1 : 0, phases = [];
    const ends = [...new Set(own.beats.map((b, k) => muscles[k] ? b.steps : 0)) ]
                     .filter(steps => steps > 0)
                     .sort((a, b) => a - b);
    let from = 0;
    for (const end of [...ends, SWIM.steps]) {
      const phase = {steps : end - from, pair};
      muscles.forEach((muscle, k) => {
        if (muscle && own.beats[k].steps > from)
          phase[SIDES[sideIndex(sideOf(muscle))]] = {
            stroke : finStroke(muscle),
            strength : own.beats[k].strength
          };
      });
      if (phase.steps > 0)
        phases.push(phase);
      from = end;
    }
    return phases;
  }
  function draw(muscles) {
    const S = SWIM, {svg, under, live} = picture(water, S.height), probe = studio.state.senseProbe,
          course = probe?.kind === 'fins' && probe.organ === organId
                       ? studio.state.anatomy?.finCourse ?? []
                       : [];
    el('rect',
       {x : 0, y : 0, width : S.box[0], height : S.box[1], rx : 6, class : 'aid-live-ground'},
       under);
    // The way: as large as the water allows, the fish drawn to its measure.
    const xs = course.map(([ x ]) => -x), ys = course.map(([, y ]) => y),
          span = values => values.length ? [ Math.min(...values), Math.max(...values) ] : [ 0, 0 ],
          [ x0, x1 ] = span(xs), [ y0, y1 ] = span(ys),
          unit = Math.min(S.radius, (S.box[0] - 2 * S.edge) / Math.max(x1 - x0, 1e-6),
                          (S.box[1] - 2 * S.edge) / Math.max(y1 - y0, 1e-6)),
          at = ([ x, y ]) => [S.box[0] / 2 + unit * (-x - (x0 + x1) / 2),
                              S.box[1] / 2 + unit * (y - (y0 + y1) / 2)],
          mine = muscles.map(muscle => muscle ? 1 + (isPelvicMuscle(muscle) ? 2 : 0) +
                                                    sideIndex(sideOf(muscle))
                                              : -1);
    if (course.length > 1)
      el('path', {d : path(course.map(at)), class : 'aid-live-track-line'}, live);
    // Where a fin pulls, the way carries its colour.
    for (const row of course) {
      const [x, y] = at(row), pulls = mine.map(k => k >= 0 && row[4]?.[k] > 0);
      pulls.forEach(
          (pull, k) =>
              pull &&
              el('circle', {cx : x, cy : y, r : 2.6 - k, class : 'aid-live-petal k' + k}, live));
    }
    const fish = el('g', {}, live);
    fishLeft(fish, 0, 0, unit / S.fish);
    // The beats: one row for this muscle, one for its twin.
    const X = step => S.L + (S.R - S.L) * step / S.steps,
          stepAt = x => clamp(Math.round((x - S.L) / (S.R - S.L) * S.steps / S.every) * S.every, 0,
                              S.longest);
    muscles.forEach((muscle, k) => {
      if (!muscle)
        return;
      const beat = own.beats[k], line = S.rows[k],
            sense = finStroke(muscle) === FIN_STROKE.front ? 1 : -1,
            top = line + sense * S.high * beat.strength, end = X(beat.steps);
      el('path', {d : `M${S.L} ${line} H${S.R}`, class : 'aid-live-axis'}, live);
      if (beat.steps > 0)
        el('path', {
          d : `M${S.L} ${line} V${top} H${end} V${line} Z`,
          class : 'aid-live-petal k' + k,
          opacity : .7
        },
           live);
      drag(svg, el('circle', {cx : end, cy : top, r : 5.5, class : 'aid-live-posture'}, live),
           (p, from) => {
             const x = p.x - (from.x - end), off = (p.y - (from.y - top) - line) * sense;
             beat.steps = stepAt(x);
             beat.strength = clamp(Math.abs(off) / S.high, S.least, 1);
             // Pulled across the line: the muscle strokes the other way.
             if (off < -S.turn)
               draft(setFinStroke(studio.state.document, muscle.id,
                                  sense > 0 ? FIN_STROKE.back : FIN_STROKE.front,
                                  studio.state.sites));
             show();
           },
           'finbeat' + k, 'knob', settle);
    });
    // A muscle without its antagonist can get one.
    if (!antagonistOf(studio.state.document, muscles[0], studio.state.sites))
      chip(live, 12, S.rows[0], '+', () => {
        const added = addAntagonist(studio.state.document, organId, studio.state.sites);
        if (!added)
          return studio.notice(label('status.noRoom'));
        studio.changeDocument(added.document, {kind : 'organ', id : added.organId});
      }, true, 6);
    const now = el('path', {class : 'aid-live-now'}, live);
    film = step => {
      const k = clamp(step / S.every, 0, Math.max(0, course.length - 1)), a = course[Math.floor(k)],
            b = course[Math.ceil(k)] ?? a;
      if (a) {
        // The engine keeps the heading within half a turn either way: between two rows the fish
        // turns the shorter way.
        const f = k - Math.floor(k),
              [ x, y ] = at([ a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f ]),
              turned = Math.atan2(Math.sin(b[2] - a[2]), Math.cos(b[2] - a[2]));
        fish.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${
                                           (-degrees(a[2] + turned * f)).toFixed(1)})`);
      }
      now.setAttribute('d', `M${X(step).toFixed(1)} ${S.rows[0] - S.high - 4} V${
                                S.rows[muscles[1] ? 1 : 0] + S.high + 4}`);
    };
    film(clock);
  }
  function show() {
    const muscle = organ();
    if (!muscle)
      return;
    const muscles = [ muscle, findOrgan(studio.state.document, muscle.pair) ?? null ];
    studio.setFinCommand(organId, phasesOf(muscles));
    draw(muscles);
  }
  return {
    root,
    show,
    tick(dt) {
      clock = (clock + dt * SWIM.steps / SWIM.round) % SWIM.steps;
      film?.(clock);
    }
  };
});
