// The defence's live inspector: the fish's height against a mouth's opening.
// Read in the engine (feeding.cc, candidates and fits_mouth in physiology.hh: who would swallow
// the fish whole reckons with its radius x (1 + the spines' height); feeding.cc, sever_flesh and
// physiology.cc, injure: a bite is held off by the guard where it lands, as far as the fish can
// pay for it from its reserve; body.hh, defense: the spines stand as high as the cells' capacity
// gives at rest, or as high as the brain has them raised, whichever is more; body_plan.cc,
// spine_extension: raised by a muscle's stroke).
// The fish, its spines, where they stand and how wide, and the mouth that bites (where from, how
// wide) are the fish panel's (body.js, spinesSvg; anatomy_handles.js; probes.js, the attack).
// Here is only what it cannot show: the measure a mouth takes of the fish. The fish from the
// front, round, its spines at rest and as far as the brain has them raised; beside it the mouth,
// its jaws as far apart as it opens. If the jaws clear the spines the mouth swallows the fish
// whole and the fish sits between them; if not, it sticks before the teeth. The engine reckons
// with one height for the whole fish there, wherever the spines stand.
// Every length is the plan's report (anatomy.spineHeights: rest and a lasting command;
// anatomy.attackProbe: the height under the command tried here and whether the fish fits). What
// the guard holds of a bite where the mouth is, is the fish panel's bubble.
// The command to raise the spines is an input, set here at the spines' tip.
// Not in the picture: how the spines rise and sink again over the steps of a command; that a
// hungry fish holds off less; the brake in the water and in the sand.
import {ATTACK_GAPE} from '../../model/probe.js';
import {addPicture, clamp, drag, el, liveKind, picture} from './kit.js';

// The measure: the fish's middle at height cy, `radius` pixels for the body's radius; `spines`
// of them round it; the mouth's hinge at `hinge`, its jaws reach to `reach`, long enough for the
// largest fish they can clear; without a mouth the fish rests at `alone`.
const MEASURE = Object.freeze({
  radius : 30,
  alone : 160,
  cy : 12 + 30 * ATTACK_GAPE[1],
  height : 2 * (12 + 30 * ATTACK_GAPE[1]),
  spines : 12,
  hinge : 20,
  reach : 28 + 60 * ATTACK_GAPE[1],
  tooth : 7
});

liveKind('defense', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-defense aid-live-sense-ache';
  const measure = addPicture(root);
  // The fish panel's mouth, if it is tried on this organ.
  const attack = () => {
    const probe = studio.state.senseProbe;
    return probe?.kind === 'attack' && probe.organ === organId ? probe : null;
  };
  function draw() {
    const M = MEASURE, {cy} = M, {svg, live} = picture(measure, M.height), mouth = attack(),
          [ low, high ] = studio.state.anatomy?.spineHeights ?? [ 0, 0 ],
          bite = mouth ? studio.state.anatomy?.attackProbe : null,
          height = bite?.active.height ?? low, open = M.radius * (mouth?.gape ?? 0),
          tips = M.radius * (1 + height),
          // Swallowed, the fish sits behind the teeth; held off, its spines rest on the jaws' ends.
        cx = !mouth              ? M.alone
             : bite?.active.fits ? M.reach - M.tooth - tips
                                 : M.reach + Math.sqrt(Math.max(0, tips * tips - open * open)),
          // A place `radii` body radii from the fish's middle, `turn` round it from straight up.
        at = (radii, turn) => [cx + M.radius * radii * Math.sin(turn),
                               cy - M.radius * radii * Math.cos(turn)];
    // The spines: what stands at rest light, what the brain has raised beyond it in the cells'
    // colour.
    for (let k = 0; k < M.spines; ++k) {
      const turn = 2 * Math.PI * k / M.spines, [ x0, y0 ] = at(1, turn),
            [ x1, y1 ] = at(1 + low, turn), [ x2, y2 ] = at(1 + height, turn);
      if (height > low)
        el('path',
           {d : `M${x1} ${y1} L${x2} ${y2}`, class : 'aid-live-hair k0', 'stroke-width' : 1.8},
           live);
      if (low > 0)
        el('path', {d : `M${x0} ${y0} L${x1} ${y1}`, class : 'aid-live-spine'}, live);
    }
    // The fish from the front.
    el('circle', {cx, cy, r : M.radius, class : 'aid-live-head'}, live);
    for (const side of [-1, 1])
      el('circle', {
        cx : cx + side * M.radius * .62,
        cy : cy - M.radius * .12,
        r : 3.2,
        class : 'aid-live-eye'
      },
         live);
    if (mouth) {
      // The mouth: its jaws as far apart as it opens, the teeth inward.
      let teeth = '';
      for (const side of [-1, 1])
        for (let x = M.hinge + 2 * M.tooth; x < M.reach; x += 2 * M.tooth)
          teeth += `M${x - M.tooth / 2} ${cy + side * open} l${M.tooth / 2} ${- side * M.tooth} l${
              M.tooth / 2} ${side * M.tooth}`;
      el('path', {
        d : `M${M.reach} ${cy - open} H${M.hinge} V${cy + open} H${M.reach}` + teeth,
        class : 'aid-live-gape'
      },
         live);
    }
    // The input: the brain raises the spines, from their rest as far as the planned muscles can
    // raise them under a lasting command. Muscles that cannot raise them have no knob for it.
    if (mouth && high > low) {
      const [, y0] = at(1 + low, 0), [, y1 ] = at(1 + high, 0), [, y ] = at(1 + height, 0);
      el('path', {d : `M${cx} ${y0} V${y1}`, class : 'aid-live-track-line'}, live);
      drag(svg, el('circle', {cx, cy : y, r : 5.5, class : 'aid-live-petal k0'}, live),
           p => studio.setAttackCommand(clamp(((cy - p.y) / M.radius - 1 - low) / (high - low))),
           'defenseup', 'knob');
    }
  }
  return {root, show : draw, tick() {}};
});
