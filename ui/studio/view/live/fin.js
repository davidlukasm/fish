// The side fin muscle's live inspector: a small fish in still water, moved by its side fins.
// Read in the engine (body_plan.cc, fin_mechanics: a side fin cell beats at its angle and pushes,
// shifts and turns the fish with its lever and arm; group_side_fins: which pair a muscle works;
// movement.cc, move_body: the body's step in the water; werkzeug/atelier.cc, fin_course_report:
// the fish of this plan, grown and fed, in still open water, sinking as in the aquarium, driven
// by the commands tried here through the same muscles and the same step as there).
// The water is seen from the side, as the aquarium is: down is down, a turn raises or lowers the
// snout. The fish looks to the left, as in the fish panel.
// The way the fish takes is the plan's report (anatomy.finCourse: place in body radii, heading,
// step and the fins' tension, every fourth step), which fin a muscle works too
// (anatomy.finChannels). Nothing of it is reckoned here.
// The fins themselves, where they sit, their angle, strength and fibres are the fish panel's
// (anatomy_handles.js). Here are the inputs: the commands to the fish's side fins, a row for
// each fin that has a muscle, this muscle's first. A beat lasts as long and is as strong as its
// knob is pulled. Above the line the muscle beats backward, below it forward: pulled across, the
// muscle's stroke turns round.
// The small fish is the fish panel's fish in little: its outline and its side fins as the plan
// has them (frame.js, fishPath and sideFins; body.js, outlineSizes).
// ASSUMED for the picture: a fin swings from its rest by a fixed angle at full tension, backward
// on a muscle's back stroke and forward on its front stroke.
// Not in the picture: the tail beating along; the ground.
import {FIN, FIN_STROKE} from '../../../schema.js';
import {degrees} from '../../../units.js';
import {
  addAntagonist,
  antagonistOf,
  findOrgan,
  finStroke,
  groupReport,
  isFinMuscle,
  setFinStroke
} from '../../model/document.js';
import {BODY_MIDDLE, BODY_RADIUS, sideIndex, sideOf} from '../../model/layout.js';
import {isPelvicMuscle} from '../../model/organs.js';
import {outlineSizes} from '../body.js';
import {fishPath, sideFins} from '../frame.js';
import {label} from '../kit.js';
import {addPicture, chip, clamp, drag, el, liveKind, path, picture} from './kit.js';

// The water: `box` wide and high, a body radius at most `radius` pixels, `edge` free round the
// way. The beats: steps from L to R, `steps` in all, a beat at most `longest`; the first row's
// line at `row`, the next `gap` below; a full beat `high` from its line; a pull of `turn` across
// the line turns the stroke round.
const SWIM = Object.freeze({
  box : [ 300, 150 ],
  radius : 22,
  edge : 26,
  L : 30,
  R : 288,
  steps : 128,
  longest : 64,
  every : 4,
  row : 180,
  gap : 34,
  high : 14,
  least : .15,
  turn : 6,
  round : 6000
});
// How far a fin swings from its rest under full tension (degrees).
const SWING = 40;
const CHANNELS = Object.freeze([ FIN.left, FIN.right, FIN.pelvic_left, FIN.pelvic_right ]);
const SIDES = Object.freeze([ 'left', 'right' ]);
const pairOf = channel => channel === FIN.pelvic_left || channel === FIN.pelvic_right ? 1 : 0;
const sideName = channel => SIDES[channel === FIN.right || channel === FIN.pelvic_right ? 1 : 0];

liveKind('fin', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-fin';
  const water = addPicture(root);
  // What is tried: for each muscle shown, how long its beat lasts (steps) and how strong the
  // command is.
  // Not part of the fish. This muscle's fin beats at first, the others rest.
  const own = {beats : new Map()};
  let clock = 0, film = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The fin a muscle works: the engine's word, or while it has not answered the muscle's place.
  const channelOf = muscle =>
      groupReport(studio.state.document, studio.state.anatomy, 'finChannels', muscle.centers[0]?.id)
          ?.[0] ??
      CHANNELS[(isPelvicMuscle(muscle) ? 2 : 0) + sideIndex(sideOf(muscle))];
  // The fish's fins that have a muscle, this muscle's first, then its twin's: for each the
  // muscle the row sets, one that strokes as this one does where there is a choice.
  function rowsOf(muscle) {
    const {document : doc,
           sites} = studio.state,
           twin = findOrgan(doc, muscle.pair),
           others = doc.organs.filter(o => isFinMuscle(o, sites) && o !== muscle && o !== twin)
                        .sort((a, b) => (finStroke(a) === finStroke(muscle) ? 0 : 1) -
                                        (finStroke(b) === finStroke(muscle) ? 0 : 1)),
           rows = [];
    for (const candidate of [muscle, twin, ...others]) {
      const channel = candidate && channelOf(candidate);
      if (candidate && !rows.some(row => row.channel === channel))
        rows.push({muscle : candidate, channel});
    }
    for (const [k, row] of rows.entries()) {
      // A beat belongs to its muscle: which fin that works can change with the plan.
      if (!own.beats.has(row.muscle.id))
        own.beats.set(row.muscle.id, {steps : k ? 0 : 16, strength : 1});
      row.beat = own.beats.get(row.muscle.id);
    }
    return rows;
  }
  // The commands as the engine takes them: phases in which the same fins beat, then the glide.
  function phasesOf(rows) {
    const ends = [...new Set(rows.map(row => row.beat.steps)) ]
                     .filter(steps => steps > 0)
                     .sort((a, b) => a - b),
          phases = [];
    let from = 0;
    for (const end of [...ends, SWIM.steps]) {
      const pairs = [ {}, {} ];
      for (const {muscle, channel, beat} of rows)
        if (beat.steps > from)
          pairs[pairOf(channel)][sideName(channel)] = {
            stroke : finStroke(muscle),
            strength : beat.strength
          };
      if (end > from)
        phases.push({steps : end - from, pairs});
      from = end;
    }
    return phases;
  }
  function draw(rows) {
    const S = SWIM, last = S.row + S.gap * (rows.length - 1),
          {svg, under, live} = picture(water, last + S.high + 8), probe = studio.state.senseProbe,
          course = probe?.kind === 'fins' && probe.organ === organId
                       ? studio.state.anatomy?.finCourse ?? []
                       : [];
    el('rect',
       {x : 0, y : 0, width : S.box[0], height : S.box[1], rx : 6, class : 'aid-live-ground'},
       under);
    // The way: as large as the water allows, the fish drawn to its measure.
    const span = values => values.length ? [ Math.min(...values), Math.max(...values) ] : [ 0, 0 ],
          [ x0, x1 ] = span(course.map(([ x ]) => -x)),
          [ y0, y1 ] = span(course.map(([, y ]) => y)),
          unit = Math.min(S.radius, (S.box[0] - 2 * S.edge) / Math.max(x1 - x0, 1e-6),
                          (S.box[1] - 2 * S.edge) / Math.max(y1 - y0, 1e-6)),
          at = ([ x, y ]) => [S.box[0] / 2 + unit * (-x - (x0 + x1) / 2),
                              S.box[1] / 2 + unit * (y - (y0 + y1) / 2)];
    // The water's depth: a line for every body radius the fish sinks or rises.
    for (let depth = Math.ceil((y0 + y1) / 2 - S.box[1] / 2 / unit);; ++depth) {
      const [, y] = at([ 0, depth ]);
      if (y >= S.box[1])
        break;
      el('path', {d : `M0 ${y.toFixed(1)} H${S.box[0]}`, class : 'aid-live-axis', opacity : .35},
         under);
    }
    if (course.length > 1)
      el('path', {d : path(course.map(at)), class : 'aid-live-track-line'}, live);
    // Where a fin pulls, the way carries its colour.
    for (const row of course) {
      const [x, y] = at(row);
      rows.forEach(({channel}, k) => {
        if (row[4]?.[channel] > 0)
          el('circle', {cx : x, cy : y, r : 2.8 - .5 * k, class : 'aid-live-petal k' + k}, live);
      });
    }
    // The fish with its fins, as the fish panel draws it; a fin that has a row carries its colour.
    const fish = el('g', {}, live), small = unit / BODY_RADIUS,
          drawn = el('g', {
            transform :
                `scale(${small.toFixed(4)}) translate(${- BODY_MIDDLE.x} ${- BODY_MIDDLE.y})`
          },
                     fish),
          sizes = outlineSizes(studio.state), line = (1.2 / small).toFixed(1);
    const blades = sideFins(sizes).map(fin => {
      const channel = fin.pelvic     ? (fin.side < 0 ? FIN.pelvic_left : FIN.pelvic_right)
                      : fin.side < 0 ? FIN.left
                                     : FIN.right,
            k = rows.findIndex(row => row.channel === channel);
      return {
        channel,
        root : fin.root,
        // Towards the tail on a back stroke, towards the snout on a front stroke.
        turn : k < 0 ? 0 : -fin.side * (finStroke(rows[k].muscle) === FIN_STROKE.front ? -1 : 1),
        blade : el('path', {
          d : fin.d,
          class : k < 0 ? 'aid-live-head' : 'aid-live-petal k' + k,
          style : 'stroke-width:' + line
        },
                   drawn)
      };
    });
    el('path', {d : fishPath(sizes), class : 'aid-live-head', style : 'stroke-width:' + line},
       drawn);
    // The beats: a row for each fin.
    const X = step => S.L + (S.R - S.L) * step / S.steps,
          stepAt = x => clamp(Math.round((x - S.L) / (S.R - S.L) * S.steps / S.every) * S.every, 0,
                              S.longest);
    rows.forEach(({muscle, beat}, k) => {
      const line = S.row + S.gap * k, sense = finStroke(muscle) === FIN_STROKE.front ? 1 : -1,
            top = line + sense * S.high * beat.strength, end = X(beat.steps);
      el('path', {d : `M${S.L} ${line} H${S.R}`, class : 'aid-live-axis'}, live);
      if (beat.steps > 0)
        el('path', {
          d : `M${S.L} ${line} V${top} H${end} V${line} Z`,
          class : 'aid-live-petal k' + k,
          opacity : .7
        },
           live);
      else
        el('circle', {cx : S.L - 8, cy : line, r : 3, class : 'aid-live-petal k' + k}, live);
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
    if (!antagonistOf(studio.state.document, rows[0].muscle, studio.state.sites))
      chip(live, 10, last + S.high - 2, '+', () => {
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
        // The heading as it has run on since the start (the engine also folds it into half a turn
        // either way, but a fish can turn further than that between two rows).
        const f = k - Math.floor(k),
              [ x, y ] = at([ a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f ]),
              heading = (a[5] ?? a[2]) + ((b[5] ?? b[2]) - (a[5] ?? a[2])) * f;
        fish.setAttribute(
            'transform',
            `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-degrees(heading)).toFixed(1)})`);
        for (const {channel, root, turn, blade} of blades) {
          const pull =
              (a[4]?.[channel] ?? 0) + ((b[4]?.[channel] ?? 0) - (a[4]?.[channel] ?? 0)) * f;
          blade.setAttribute('transform', `rotate(${(turn * SWING * clamp(pull)).toFixed(1)} ${
                                              root.x.toFixed(1)} ${root.y.toFixed(1)})`);
        }
      }
      now.setAttribute('d', `M${X(step).toFixed(1)} ${S.row - S.high - 4} V${last + S.high + 4}`);
    };
    film(clock);
  }
  function show() {
    const muscle = organ();
    if (!muscle)
      return;
    const rows = rowsOf(muscle);
    studio.setFinCommand(organId, phasesOf(rows));
    draw(rows);
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
