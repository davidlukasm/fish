// The side fin muscle's live inspector: a small fish in still water, turned by one twitch of this
// muscle's fin.
// Read in the engine (body_plan.cc, fin_mechanics: a side fin cell beats at its angle and pushes,
// shifts and turns the fish with its lever and arm; group_side_fins: which pair a muscle works;
// movement.cc, move_body: a stroke's kick on the turn and what the water takes of it each step;
// werkzeug/atelier.cc, fin_twitch_report: how far ONE full twitch of one fin turns the grown, fed
// fish from rest in still open water - while the muscle pulls, and with the turn running out
// after it. That is an estimate in one piece from the engine's own kick and drag, no course of
// steps; a strong stroke turns less than it says).
// The water is seen from the side, as the aquarium is: a turn raises or lowers the snout. The
// fish looks to the left, as in the fish panel.
// The picture is the plan's report (anatomy.finTwitch: for each fin and stroke the steps the
// muscle pulls, the degrees turned by then and the degrees when the turn has run out); which fin
// a muscle works too (anatomy.finChannels). Nothing of it is reckoned here: the line round the
// fish is as long as the turn, bold while the muscle pulls and thin while the turn runs out, and
// the fish turns along it.
// The fins themselves, where they sit, their angle, strength and fibres are the fish panel's
// (anatomy_handles.js). The small fish is the fish panel's fish in little (frame.js, fishPath and
// sideFins; body.js, outlineSizes); the fin of this muscle is drawn larger around its root.
// Not in the picture: the way the fish takes and its sinking; the other fins and the tail; a
// weaker or longer command than one full twitch.
import {FIN, FIN_STROKE} from '../../../schema.js';
import {radians} from '../../../units.js';
import {
  addAntagonist,
  antagonistOf,
  findOrgan,
  finStroke,
  groupReport,
  setFinStroke
} from '../../model/document.js';
import {BODY_MIDDLE, BODY_RADIUS, sideIndex, sideOf} from '../../model/layout.js';
import {isPelvicMuscle} from '../../model/organs.js';
import {outlineSizes} from '../body.js';
import {fishPath, sideFins} from '../frame.js';
import {label} from '../kit.js';
import {addPicture, chip, clamp, el, liveKind, path, picture} from './kit.js';

// The water: `box` wide and high; the fish in its middle, `fish` pixels to a body radius. The
// turn's line starts `near` from the middle before the snout and lies `apart` further out with
// every full turn, so that more than one turn can be read, and never further out than `far`. A
// round of the film lasts `round` milliseconds, of which the fish rests `rest`.
const SWIM = Object.freeze(
    {box : [ 300, 190 ], fish : 32, near : 56, far : 88, apart : 9, round : 5000, rest : .2});
const BLADE_SCALE = 1.8;
const CHANNELS = Object.freeze([ FIN.left, FIN.right, FIN.pelvic_left, FIN.pelvic_right ]);

liveKind('fin', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-fin';
  const water = addPicture(root);
  let clock = 0, film = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  // The fin a muscle works: the engine's word, or while it has not answered the muscle's place.
  const channelOf = muscle =>
      groupReport(studio.state.document, studio.state.anatomy, 'finChannels', muscle.centers[0]?.id)
          ?.[0] ??
      CHANNELS[(isPelvicMuscle(muscle) ? 2 : 0) + sideIndex(sideOf(muscle))];
  // One twitch of a muscle as the engine estimates it; null while it has not answered or the
  // muscle is too weak to stroke.
  const twitchOf = muscle => studio.state.anatomy?.finTwitch?.[channelOf(muscle) - FIN.left]
                                 ?.[finStroke(muscle) === FIN_STROKE.front ? 1 : 0] ??
                             null;
  function draw(muscle) {
    const S = SWIM, {under, live} = picture(water, S.box[1]), twitch = twitchOf(muscle),
          cx = S.box[0] / 2, cy = S.box[1] / 2;
    el('rect',
       {x : 0, y : 0, width : S.box[0], height : S.box[1], rx : 6, class : 'aid-live-ground'},
       under);
    // The turn's line: where the snout points as the fish turns, further out with every turn.
    // Every full turn lies `apart` further out, less where many turns would leave the water.
    const end = twitch ? twitch.settled ?? twitch.during : 0,
          apart = Math.min(S.apart, (S.far - S.near) / Math.max(1, Math.abs(end) / 360)),
          spot = turn => {
            const a = radians(-turn), r = S.near + apart * Math.abs(turn) / 360;
            return [ cx - r * Math.cos(a), cy - r * Math.sin(a) ];
          }, line = (from, to) => {
            const parts = Math.max(1, Math.ceil(Math.abs(to - from) / 6));
            return path(
                Array.from({length : parts + 1}, (_, n) => spot(from + (to - from) * n / parts)));
          };
    // One whole turn, to read a small turn against.
    el('circle', {cx, cy, r : S.near, class : 'aid-live-track-line'}, under);
    if (twitch) {
      el('path', {d : line(twitch.during, end), class : 'aid-live-turn out k0'}, live);
      el('path', {d : line(0, twitch.during), class : 'aid-live-turn k0'}, live);
      // Where the turn begins: before the resting fish's snout.
      el('circle', {cx : spot(0)[0], cy : spot(0)[1], r : 3.2, class : 'aid-live-petal k0'}, live);
    } else
      el('circle', {cx, cy, r : S.near, class : 'aid-live-turn missing'}, live);
    // The fish with its fins, as the fish panel draws it; this muscle's fin carries its colour.
    const fish = el('g', {transform : `translate(${cx} ${cy})`}, live),
          small = S.fish / BODY_RADIUS,
          drawn = el('g', {
            transform :
                `scale(${small.toFixed(4)}) translate(${- BODY_MIDDLE.x} ${- BODY_MIDDLE.y})`
          },
                     fish),
          sizes = outlineSizes(studio.state), stroke = 1.2 / small, channel = channelOf(muscle);
    for (const fin of sideFins(sizes)) {
      const mine = channel === (fin.pelvic     ? (fin.side < 0 ? FIN.pelvic_left : FIN.pelvic_right)
                                : fin.side < 0 ? FIN.left
                                               : FIN.right),
            {x, y} = fin.root, scale = mine ? BLADE_SCALE : 1;
      el('path', {
        d : fin.d,
        class : mine ? 'aid-live-petal k0' : 'aid-live-head',
        transform : mine ? `translate(${x} ${y}) scale(${scale}) translate(${- x} ${- y})` : '',
        style : 'stroke-width:' + (stroke / scale).toFixed(1)
      },
         drawn);
    }
    el('path',
       {d : fishPath(sizes), class : 'aid-live-head', style : 'stroke-width:' + stroke.toFixed(1)},
       drawn);
    // The muscle strokes backward or forward: the button turns its stroke round. A muscle
    // without its antagonist can get one.
    const turn = el('g', {class : 'aid-live-chip aid-live-flip'}, live), tx = 8, ty = S.box[1] - 21;
    el('rect', {x : tx, y : ty, width : 14, height : 14, rx : 3}, turn);
    el('path', {d : `M${tx + 3} ${ty + 5} h8 l-2.5 -2.5 M${tx + 11} ${ty + 9} h-8 l2.5 2.5`}, turn);
    turn.addEventListener('click', e => {
      e.stopPropagation();
      draft(
          setFinStroke(studio.state.document, muscle.id,
                       finStroke(muscle) === FIN_STROKE.front ? FIN_STROKE.back : FIN_STROKE.front,
                       studio.state.sites));
      studio.drafted && studio.settleGraphic();
    });
    if (!antagonistOf(studio.state.document, muscle, studio.state.sites))
      chip(live, 34, S.box[1] - 14, '+', () => {
        const added = addAntagonist(studio.state.document, organId, studio.state.sites);
        if (!added)
          return studio.notice(label('status.noRoom'));
        studio.changeDocument(added.document, {kind : 'organ', id : added.organId});
      }, true, 7);
    // The film: the fish rests, turns evenly while the muscle pulls, then the turn runs out.
    film = share => {
      if (!twitch)
        return;
      const go = clamp((share - S.rest) / (1 - 2 * S.rest)), pulls = .5,
            turn = go < pulls
                       ? twitch.during * go / pulls
                       : twitch.during + (end - twitch.during) *
                                             (1 - Math.pow(1 - (go - pulls) / (1 - pulls), 3));
      fish.setAttribute('transform', `translate(${cx} ${cy}) rotate(${(-turn).toFixed(1)})`);
    };
    film(clock);
  }
  function show() {
    const muscle = organ();
    if (muscle)
      draw(muscle);
  }
  return {
    root,
    show,
    tick(dt) {
      clock = (clock + dt / SWIM.round) % 1;
      film?.(clock);
    }
  };
});
