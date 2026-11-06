import {ATELIER_LIMITS, MOTOR_KIND} from '../../schema.js';
import {musclePlaces, nodeLimit, organFunction} from '../model/organs.js';
import {BODY_FRAME, halfWidth, sideOf, sideSign} from '../model/layout.js';
import {usedSites} from '../model/document.js';
import {FIN_BASE, HEAD, skinAt, SNOUT_TIP} from './frame.js';
import {fixed} from './markup.js';

// Each muscle is one organ where it works, whatever engine places its cells take: the tail's
// along the tail stalk, a side fin's at the fin's base, the jaw's at the hinge of its jaw, the
// throat's beside the throat. It is drawn as one shape there, the fuller the more of its side's
// places it takes and the thicker the stronger its nodes are, with a mark across it at each node,
// where its wires reach it. Each work has its colour (TONE), in the order WORKS.
export const MUSCLE_TONE = Object.freeze({
  [MOTOR_KIND.forward] : '#7eabe4',
  [MOTOR_KIND.turn] : '#b99ddf',
  [MOTOR_KIND.suction] : '#ebbd7a',
  [MOTOR_KIND.aggression] : '#82d5cb'
});
export const WORKS = Object.freeze(
    [ MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.turn, MOTOR_KIND.forward ]);
// How much of its side's places a muscle takes, and how strong its nodes are on the whole (both
// from 0 to 1).
export function muscleBuild(organ, sites) {
  const most = nodeLimit(organ, sites), count = organ.centers.length;
  const copies = organ.centers.reduce((sum, c) => sum + c.copies, 0) / Math.max(1, count);
  return {fill : most ? count / most : 0, strength : copies / ATELIER_LIMITS.max_copies};
}
// The shapes in frame units, each from least to least plus span (LENGTH, THICK, REACH, SIZE,
// WIDTH). TAIL: a spindle of STEPS segments along the stalk from its back end (STALK[1]) forward,
// its middle DEPTH of the body's half width off the midline, THICK of the half width thick; a
// myomere at each node, a chevron MARK of the spindle's half width and LEAN of it back. FIN: a
// fan in from the fin's base, INSET inside the skin, bowing in REACH; a ray from its root to its
// base at each node. JAW: an ellipse AT of the way back along the jaw, its fibres across it at
// each node, SPREAD of its width apart, FIBRE of its height long and leaning in by TILT. THROAT:
// a pouch along the throat from AFTER behind the mouth, LENGTH long, OFF the midline, bulging out
// by OUT and in by IN of its width; a ring across it at each node, reaching IN and RING of the
// width.
const SHAPE = Object.freeze({
  tail : {
    stalk : [ 690, 880 ],
    depth : .5,
    length : [ 70, 120 ],
    thick : [ .28, .3 ],
    steps : 16,
    mark : .8,
    lean : .5
  },
  fin : {inset : 6, reach : [ 22, 18 ]},
  jaw : {at : .82, size : [ [ 16, 10 ], [ 8, 5 ] ], spread : .8, tilt : .6, fibre : .7},
  throat :
      {after : 4, length : [ 40, 50 ], off : 20, width : [ 12, 10 ], out : 2.2, in : .4, ring : 1.2}
});
const grow = ([ least, span ], share) => least + span * share;
const point = (x, y) => fixed(x) + ' ' + fixed(y);
const mouthAt = () => ({x : SNOUT_TIP.x + HEAD.mouth_in, y : SNOUT_TIP.y});
// A muscle's shape for its work and side, how full and strong it is and how many nodes it has:
// its outline (path data), the line its nodes lie along (from, to) and a mark for each node.
export function workShape(code, side, {fill, strength}, count) {
  const s = sideSign(side), along = k => (k + .5) / Math.max(1, count);
  if (code === MOTOR_KIND.forward) {
    const T = SHAPE.tail, end = T.stalk[1],
          start = Math.max(T.stalk[0], end - grow(T.length, fill));
    const at = x => BODY_FRAME.middle + s * halfWidth(x) * T.depth,
          half = x => halfWidth(x) * grow(T.thick, strength) / 2;
    const top = [], bottom = [];
    for (let k = 0; k <= T.steps; ++k) {
      const x = start + (end - start) * k / T.steps, swell = Math.sin(Math.PI * k / T.steps);
      top.push(point(x, at(x) - half(x) * swell));
      bottom.unshift(point(x, at(x) + half(x) * swell));
    }
    const marks = Array.from({length : count}, (_, k) => {
      const x = start + (end - start) * along(k), y = at(x), w = half(x) * T.mark,
            back = w * T.lean;
      return 'M' + point(x + back, y - w) + ' L' + point(x - back, y) + ' L' +
             point(x + back, y + w);
    });
    return {
      path : 'M' + top.join(' L') + ' L' + bottom.join(' L') + 'Z',
      from : {x : start, y : at(start)},
      to : {x : end, y : at(end)},
      marks
    };
  }
  if (code === MOTOR_KIND.turn) {
    const F = SHAPE.fin, a = FIN_BASE.at, b = FIN_BASE.at + FIN_BASE.length, middle = (a + b) / 2;
    const base = x => skinAt(x, s) - s * F.inset, reach = grow(F.reach, (fill + strength) / 2);
    const root = {x : middle, y : base(middle) - s * reach};
    const marks = Array.from({length : count}, (_, k) => {
      const x = a + (b - a) * along(k);
      return 'M' + point(root.x, root.y) + ' L' + point(x, base(x));
    });
    return {
      path : 'M' + point(a, base(a)) + ' Q' + point(middle, base(middle) - 2 * s * reach) + ' ' +
                 point(b, base(b)) + 'Z',
      from : {x : a, y : base(a)},
      to : {x : b, y : base(b)},
      marks
    };
  }
  const mouth = mouthAt();
  if (code === MOTOR_KIND.aggression) {
    const J = SHAPE.jaw, x = mouth.x + HEAD.jaw_back * J.at,
          y = mouth.y + s * (HEAD.mouth[1] + HEAD.jaw_spread * J.at);
    const share = (fill + strength) / 2, rx = grow([ J.size[0][0], J.size[1][0] ], share),
          ry = grow([ J.size[0][1], J.size[1][1] ], share);
    const arc = 'A' + fixed(rx) + ' ' + fixed(ry) + ' 0 1 0 ';
    const marks = Array.from({length : count}, (_, k) => {
      const dx = rx * (along(k) * 2 - 1) * J.spread;
      return 'M' + point(x + dx, y - ry * J.fibre) + ' L' +
             point(x + dx * J.tilt, y + ry * J.fibre);
    });
    return {
      path : 'M' + point(x - rx, y) + ' ' + arc + point(x + rx, y) + ' ' + arc + point(x - rx, y) +
                 'Z',
      from : {x : x - rx, y},
      to : {x : x + rx, y},
      marks
    };
  }
  if (code === MOTOR_KIND.suction) {
    const P = SHAPE.throat, a = mouth.x + HEAD.mouth[0] + P.after, end = a + grow(P.length, fill);
    const y = BODY_FRAME.middle + s * P.off, half = grow(P.width, strength) / 2;
    const marks = Array.from({length : count}, (_, k) => {
      const x = a + (end - a) * along(k);
      return 'M' + point(x, y - s * half * P.in) + ' L' + point(x, y + s * half * P.ring);
    });
    return {
      path : 'M' + point(a, y) + ' C' + point(a, y + s * half * P.out) + ' ' +
                 point(end, y + s * half) + ' ' + point(end, y) + ' C' +
                 point(end, y - s * half * P.in) + ' ' + point(a, y - s * half * P.in) + ' ' +
                 point(a, y) + 'Z',
      from : {x : a, y},
      to : {x : end, y},
      marks
    };
  }
  return null;
}
export const muscleShape = (organ, sites) => workShape(
    organFunction(organ, sites), sideOf(organ), muscleBuild(organ, sites), organ.centers.length);
// Where a muscle's index-th node lies: along its shape.
export function muscleNode(organ, index, sites) {
  const shape = muscleShape(organ, sites);
  if (!shape)
    return null;
  const share = (index + .5) / Math.max(1, organ.centers.length);
  return {
    x : shape.from.x + (shape.to.x - shape.from.x) * share,
    y : shape.from.y + (shape.to.y - shape.from.y) * share
  };
}

// Where a muscle can go: for each work on each side its home, the shape of a muscle there (the
// one there, else one node at HOME of full strength), how many places for the work are still
// free, and the muscle already there. A muscle dropped goes to the home nearest to where it is
// dropped that has a muscle or a free place; a new one takes the free place for the work nearest
// to its home.
const HOME = Object.freeze({fill : .5, strength : .5});
export function muscleHomes(doc, sites) {
  const used = usedSites(doc);
  return [ -1, 1 ].flatMap(side => WORKS.map(code => {
    const organ = doc.organs.find(o => o.type === 'muscle' && sideSign(o.side) === side &&
                                       organFunction(o, sites) === code) ??
                  null;
    const shape = organ ? muscleShape(organ, sites) : workShape(code, side, HOME, 1);
    const free = musclePlaces(sites, code, side).filter(s => !used.has(s.id));
    const middle = {x : (shape.from.x + shape.to.x) / 2, y : (shape.from.y + shape.to.y) / 2};
    return {code, side, organ, shape, free, middle};
  }));
}
export function muscleTarget(doc, sites, position) {
  const homes = muscleHomes(doc, sites).filter(h => h.organ || h.free.length);
  if (!homes.length)
    return null;
  const distance = p => Math.hypot(p.x - position.x, p.y - position.y);
  return homes.reduce((best, h) => distance(h.middle) < distance(best.middle) ? h : best);
}
